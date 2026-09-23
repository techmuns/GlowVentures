// Local regression only. Quotes and post-statement events are deliberately
// synthetic; no production endpoint, account, payment or source file is changed.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { normalizeActionFeed } from "../../shared/corporateActions.mjs";

const compiled = await build({ stdin: { contents: 'export {BOOK_POSITIONS, BOOK_ACCOUNTS} from "./src/data/glowData.ts";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node" });
const { BOOK_POSITIONS, BOOK_ACCOUNTS } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const symbols = JSON.parse(await fs.readFile("src/data/nseSymbols.json", "utf8"));
const target = BOOK_POSITIONS.find((p) => p.assetClass === "Equity" && p.quantity > 0 && Number.isInteger(p.quantity) && p.costBasis > 0 && (p.symbol || symbols[p.securityKey]));
assert.ok(target);
const symbol = target.symbol || symbols[target.securityKey];
const now = "2026-09-23T09:00:00Z";
const rows = [
  { id: "local-test-split", actionType: "split", exDate: "2026-09-01", purpose: "Face Value Split - From Rs 10 To Rs 5" },
  { id: "local-test-dividend", actionType: "dividend", exDate: "2026-09-03", purpose: "Dividend - Rs 1 Per Share" },
].map((r) => ({ ...r, ticker: symbol, company: target.security, isin: target.isin || null, source: "NSE", sourceUrl: "https://www.nseindia.com/", sources: ["NSE"] }));
const feed = normalizeActionFeed({ version: 1, capturedAt: now, requestedFrom: "2023-09-24", requestedTo: "2027-09-23", rowCount: rows.length, rows,
  sources: { nse: { capturedAt: now }, screener: { capturedAt: now } } });
const q = Object.fromEntries(BOOK_POSITIONS.filter((p) => (p.symbol || symbols[p.securityKey]) && p.currentPrice > 0).map((p) => {
  const s = p.symbol || symbols[p.securityKey];
  return [s, { price: s === symbol ? target.currentPrice / 2 : p.currentPrice, prevClose: s === symbol ? target.currentPrice / 2 : p.currentPrice,
    tradedAt: now, source: "upstox", ageS: 0, open: null, dayLow: null, dayHigh: null, low52: null, high52: null, marketCap: null, volume: null, yearChangePct: null }];
}));
const browser = await chromium.launch({ executablePath: process.env.CHROME || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"), headless: true });
const base = process.env.BASE || "http://127.0.0.1:4173";
try {
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((theme) => { localStorage.setItem("glow:theme", theme); }, theme);
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = path === "/api/corporate-actions" ? { ok: true, retained: false, feed }
        : path === "/api/quotes" ? { ok: true, quotes: q, asOf: now, missing: [], pending: [], fresh: Object.keys(q).length, stale: 0 }
        : { ok: false, reason: "local regression: feed not under test" };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    // Keep a later saved capture from superseding the deterministic test feed.
    await page.route("**/data/corporate-actions.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(feed) }));
    await page.goto(`${base}/corporate-actions`);
    const selector = `[data-corporate-return-row="${target.accountId}|${target.securityKey}"]`;
    await page.locator(selector).waitFor();
    await page.waitForFunction((selector) => document.querySelector(selector)?.textContent?.includes("×2.0000"), selector);
    const expected = 2 / target.currentPrice * 100;
    const text = await page.locator(selector).innerText();
    assert.ok(text.includes(expected.toFixed(2) + "%"), `Rendered return must include exactly one gross dividend: ${text}`);
    assert.match(await page.locator("main").innerText(), /entitlements, not confirmed cash receipts/);
    await page.getByRole("textbox", { name: "Search corporate action holdings" }).fill(target.security);
    const filtered = await page.locator("[data-corporate-return-row]").count();
    assert.ok(filtered > 0 && filtered < BOOK_POSITIONS.length);
    await page.locator('[data-col-button="total"]').click();
    assert.ok(await page.locator('th[data-col="total"]').getAttribute("aria-sort") !== "none");
    // Reload proves neither saved state nor a second refresh doubles the ratio.
    await page.reload();
    await page.waitForFunction((selector) => document.querySelector(selector)?.textContent?.includes("×2.0000"), selector);
    assert.match(await page.locator(selector).innerText(), new RegExp(expected.toFixed(2).replace(".", "\\.") + "%"));
    // The card sits on the position page's Price & returns tab, under the
    // returns table headed "excludes dividends" — the other half of that
    // sentence. The page draws one tab at a time (Stage 10cm).
    await page.goto(`${base}/stock/${target.securityKey}?tab=market`);
    await page.locator("[data-corporate-return-table]").waitFor();
    assert.match(await page.locator("main").innerText(), /Since each statement date, not since purchase/);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${base}/corporate-actions`);
    await page.locator(selector).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "No page-wide overflow at the supported narrow dashboard width");
    assert.deepEqual(errors, [], "No React/runtime errors");
    await fs.mkdir("docs/page-check", { recursive: true });
    await page.screenshot({ path: `docs/page-check/corporate-actions-${theme}-narrow.png`, fullPage: false });
    await page.close();
    console.log(`PASS ${theme}: split-neutral valuation, dividend return, labels, sorting, filtering, replay, stock drill-down and narrow-screen overflow`);
  }
} finally { await browser.close(); }
