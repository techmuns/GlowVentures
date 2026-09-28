// Deterministic local-only outage/recovery regression. Never calls production.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright-core";
const base = process.env.BASE || "http://127.0.0.1:4173";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "local environment required");
const compiled = await build({ stdin: { contents: 'export {BOOK_POSITIONS} from "./src/data/glowData.ts";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node" });
const { BOOK_POSITIONS } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const symbols = JSON.parse(await fs.readFile("src/data/nseSymbols.json", "utf8"));
const now = new Date("2026-09-28T10:00:00Z");
const current = { version: 1, capturedAt: now.toISOString(), verifiedThrough: "2026-09-28", requestedFrom: "2020-01-01", requestedTo: "2027-09-28", symbols: null, isins: [], rows: [] };
const stale = { ...current, capturedAt: "2026-09-23T10:00:00Z", verifiedThrough: "2026-09-23" };
const quotes = Object.fromEntries(BOOK_POSITIONS.filter((p) => (p.symbol || symbols[p.securityKey]) && p.currentPrice > 0).map((p, i) => [p.symbol || symbols[p.securityKey], {
  price: p.currentPrice * (i % 2 ? 1.02 : .98), prevClose: p.currentPrice, tradedAt: now.toISOString(), ageS: 0, source: "upstox",
  open: null, dayLow: null, dayHigh: null, low52: null, high52: null, marketCap: null, volume: null, yearChangePct: null,
}]));
const browser = await chromium.launch({ executablePath: process.env.CHROME || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"), headless: true });
try {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.clock.install({ time: now });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((theme) => localStorage.setItem("glow:theme", theme), theme);
    let mode = "stale", failQuotes = false, quoteCalls = 0, holdRetry = false, releaseRetry, signalRetry;
    await page.route("**/data/corporate-actions.json", (route) => route.fulfill({ json: stale }));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/corporate-actions") return route.fulfill({ status: mode === "stale" ? 503 : 200,
        json: mode === "stale" ? { ok: false } : { ok: true, retained: false, feed: current } });
      if (path === "/api/quotes") {
        quoteCalls++;
        if (holdRetry) await new Promise((resolve) => { releaseRetry = resolve; signalRetry(); });
        return route.fulfill({ status: failQuotes ? 503 : 200, json: failQuotes ? { ok: false } : {
          ok: true, quotes, asOf: now.toISOString(), missing: [], pending: [], fresh: Object.keys(quotes).length, stale: 0,
        } });
      }
      return route.fulfill({ json: { ok: false, reason: "local fixture" } });
    });
    await page.goto(`${base}/cio`);
    await page.locator('[data-testid="movers-price-only"]').waitFor();
    assert.ok(await page.locator("[data-mover-row]").count() > 0, "stale event evidence must not blank percentage rankings");
    assert.equal(await page.locator('[data-mover-rank="impact"]').isDisabled(), true);
    assert.doesNotMatch(await page.locator('[data-cio-section="movers"]').innerText(), /No direct-equity holding carries/);
    // The next automatic event retry repairs money figures, without reloading.
    mode = "current";
    await page.clock.fastForward(31_000);
    await page.waitForFunction(() => !document.querySelector('[data-mover-rank="impact"]').disabled);
    await page.locator('[data-mover-rank="impact"]').click();
    assert.equal(await page.locator('[data-mover-rank="impact"]').getAttribute("aria-pressed"), "true");
    assert.ok(await page.locator("[data-mover-row]").count() > 0);
    // A failed quote poll retains dated figures AND visibly reports the failure.
    failQuotes = true;
    await page.clock.fastForward(61_000);
    await page.locator('[data-testid="movers-cached"]').waitFor();
    assert.ok(await page.locator("[data-mover-row]").count() > 0);
    holdRetry = true;
    const retryStarted = new Promise((resolve) => { signalRetry = resolve; });
    await page.clock.fastForward(16_000);
    await retryStarted;
    assert.ok(releaseRetry, "automatic retry is held in flight");
    assert.equal(await page.locator('[data-testid="movers-cached"]').isVisible(), true, "retry must not hide the known outage");
    assert.ok(await page.locator("[data-mover-row]").count() > 0);
    failQuotes = false;
    holdRetry = false;
    releaseRetry();
    await page.locator('[data-testid="movers-cached"]').waitFor({ state: "hidden" });
    // A cold outage reports the service problem and recovers via Retry prices.
    await page.evaluate(() => localStorage.removeItem("glow.quotes.v1"));
    failQuotes = true;
    await page.reload();
    await page.locator('[data-testid="movers-unavailable"]').waitFor();
    failQuotes = false;
    await page.getByRole("button", { name: "Retry prices" }).click();
    await page.locator('[data-testid="movers-coverage"]').waitFor();
    assert.equal(await page.locator('[data-testid="movers-unavailable"]').count(), 0);
    // Sources without an exchange timestamp still show useful price changes,
    // while avoiding a fabricated session claim or index comparison.
    for (const quote of Object.values(quotes)) quote.tradedAt = null;
    await page.clock.fastForward(61_000);
    await page.getByText('Latest price movers · Direct Equity', { exact: true }).waitFor();
    assert.ok(await page.locator("[data-mover-row]").count() > 0);
    await page.setViewportSize({ width: 1024, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await fs.mkdir("docs/page-check", { recursive: true });
    await page.screenshot({ path: `docs/page-check/daily-movers-${theme}.png`, fullPage: true });
    await page.close();
    console.log(`PASS ${theme}: incident, automatic event recovery, money ranking, cached quote failure, cold outage/retry and 1024px layout (${quoteCalls} quote calls)`);
  }
} finally { await browser.close(); }
