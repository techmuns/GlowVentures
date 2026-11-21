// Read-only browser regression against the built local app. No production requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';

const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = '.cache/sector-return-details';
await fs.mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: 'export { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POLYCAB } from "./src/data/glowData.ts"; export { CAPTURE, stubShareFeed } from "./src/lib/__tests__/liveBook.ts"; export { shareCandidates, depositoryShareHoldings } from "./src/lib/depositoryShares.ts"; export { quoteSymbolFor } from "./src/lib/quotes.ts"; export { securityLabel } from "./src/lib/securityLabel.ts";', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'error' });
const book = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const quotes = book.stubShareFeed();
// The API now keys quotes by exchange instrument where one is mapped. Preserve
// the fixture's price/date, but answer on the same identity the client requests.
for (const p of book.shareCandidates()) {
  const quote = quotes.quotes[p.symbol];
  const key = book.quoteSymbolFor(p);
  if (quote && key) quotes.quotes[key] = { ...quote, tradedAt: quotes.asOf };
}
const pricedShares = book.depositoryShareHoldings(quotes, book.CAPTURE);
assert.ok(pricedShares.some(p => p.costBasis === null || p.costUnavailable), 'fixture must price actual missing-cost depository holdings');
const positions = [...book.BOOK_POSITIONS, ...book.BOOK_POLYCAB, ...pricedShares];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const checked = [];
try {
  for (const [route, theme, width] of [
    ['/cio?tab=sectors', 'light', 1440], ['/sectors?view=direct', 'light', 390],
    ['/sectors', 'dark', 390], ['/sectors?view=direct', 'dark', 1440],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(theme => localStorage.setItem('glow:theme', theme), theme);
    const page = await context.newPage();
    // Test on the committed capture's own day. A current-day browser correctly
    // rejects this archived quote snapshot as stale; do not loosen that guard.
    await page.clock.setFixedTime(new Date(quotes.asOf));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unreachable' } }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await installReadModelRoutes(page);
    // Quote-only depository shares are the source of this complaint. A feed
    // outage hides them entirely, so test a priced day using the existing
    // committed-capture fixture. Prices are test-only; no production request.
    await page.route('**/api/quotes', route => route.fulfill({ json: { ok: true, ...quotes } }));
    await page.route('**/api/corporate-actions?*', route => route.fulfill({ json: { ok: true, feed: book.CAPTURE } }));
    await page.route('**/data/corporate-actions.json', route => route.fulfill({ json: book.CAPTURE }));
    // The sector returns settle only once the stubbed live quotes ARRIVE and price
    // the depository shares (the point of this check), which changes each sector's
    // holding/costed counts and their order. Reading before that gave transient
    // values (seen as data-costed > data-holdings) and a mid-render missing list —
    // this check flaked ~5 of 6 runs. So wait for the quote response, then until the
    // coverage rows stop changing for two polls, and read each row's counts from one
    // DOM snapshot so they cannot tear between two getAttribute calls.
    const quoted = page.waitForResponse(r => /\/api\/quotes/.test(r.url()), { timeout: 20000 }).catch(() => null);
    await page.goto(base + route);
    await page.locator('[data-sector-row]').first().waitFor();
    await quoted;
    // The quote RESPONSE arriving is not enough: the live overlay applies a render
    // later, collapsing the sector's holdings (e.g. 87 -> 54) as statement rows are
    // superseded. Wait for the network to go fully idle (read models + quotes +
    // capture all settled) so that apply has rendered before the stability poll,
    // which otherwise locked onto the pre-apply count.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForFunction(() => {
      const snap = [...document.querySelectorAll('[data-sector-row]:has([data-return-coverage])')].map(r => {
        const c = r.querySelector('[data-cell="return"]');
        return `${r.getAttribute('data-sector-row')}:${c?.getAttribute('data-costed')}/${c?.getAttribute('data-holdings')}`;
      }).join('|');
      const w = window;
      w.__ssStable = snap && snap === w.__ssPrev ? (w.__ssStable || 0) + 1 : 0;
      w.__ssPrev = snap;
      return (w.__ssStable || 0) >= 2;
    }, { timeout: 20000, polling: 250 });
    const row = page.locator('[data-sector-row]').filter({ has: page.locator('[data-return-coverage]') }).first();
    await row.waitFor();
    const sector = await row.getAttribute('data-sector-row');
    const cell = row.locator('[data-cell="return"]');
    const { costed, holdings } = await cell.evaluate(el => ({
      costed: Number(el.getAttribute('data-costed')), holdings: Number(el.getAttribute('data-holdings')),
    }));
    const expanded = await row.getAttribute('aria-expanded');
    const trigger = cell.getByRole('button');
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await row.getAttribute('aria-expanded'), expanded, 'opening the card must not expand the sector');
    assert.match(await dialog.locator('[data-sector-return-summary]').innerText(), new RegExp(`${costed} of ${holdings}`));
    const missing = dialog.locator('[data-missing-holding]');
    assert.equal(await missing.count(), holdings - costed, 'every excluded statement holding is listed');
    for (const item of await missing.all()) {
      const account = await item.getAttribute('data-account');
      const security = await item.getAttribute('data-security');
      const p = positions.find(p => p.accountId === account && p.securityKey === security);
      const a = book.BOOK_ACCOUNTS.find(a => a.accountId === account);
      assert.ok(p && a, 'an excluded holding must point to an actual stock/account pair');
      assert.ok(p.costBasis === null || p.costUnavailable, 'a costed stock must not be blamed for missing cost');
      const text = await item.innerText();
      // The page names a security once per key (securityLabel), as every table does,
      // not in whichever statement's spelling this row was read from.
      for (const label of [book.securityLabel(p.securityKey, p.security), a.provider, a.accountNo]) assert.ok(text.includes(label), `source identity ${label}`);
      assert.match(text, /purchase cost.*(missing|verified)/i);
      assert.match(text, /Needed: a purchase record or broker cost report/);
    }
    assert.equal(await dialog.locator('[data-sector-return-more]').getAttribute('open'), null, 'formula starts collapsed');
    assert.doesNotMatch(await dialog.innerText(), /FIFO|Σ|deployed|unrealised/, 'default card uses plain language');
    assert.ok(await dialog.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    }), 'card fits the screen without horizontal scrolling');
    await page.screenshot({ path: `${out}/${theme}-${width}.png` });
    await dialog.locator('[data-sector-return-more] > summary').click();
    await dialog.getByText(`View the ${costed} included ${costed === 1 ? 'holding' : 'holdings'}`, { exact: true }).click();
    assert.equal(await dialog.locator('[data-sector-return-included] > li').count(), costed);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'focus returns to the percentage');
    assert.deepEqual(errors, []);
    checked.push({ route, theme, width, sector, costed, holdings });
    await context.close();
  }
  await fs.writeFile(`${out}/results.json`, JSON.stringify(checked, null, 2));
  console.log('Sector return details passed:', checked);
} finally { await browser.close(); }
