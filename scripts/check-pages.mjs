// Renders every route in a headless Chromium and reports three things:
//
//   1. console errors and page errors,
//   2. failed network requests,
//   3. text matching "₹0" or "0.00%" — the §0 failure mode, where an ABSENT
//      measurement is rendered as a measured zero.
//
// (3) is a lead, not a verdict: a bar chart's ₹0 axis tick and a cash holding's
// genuinely-zero P&L both match, and both are correct. The report prints each
// hit with its surrounding text so a human can tell a real zero from a missing
// one. What it catches is the case nobody would otherwise look for — a tile
// quietly showing ₹0 for a collection that is empty.
//
// Usage:  npm run build && npx vite preview --port 4173 &  then  npm run check:pages
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const OUT = process.env.OUT ?? "docs/page-check";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["cio", "/cio"],
  ["monitor", "/monitor"],
  ["monitor-txns", "/monitor"],          // same route, Transactions toggle clicked
  ["family", "/family"],
  ["sectors", "/sectors"],
  ["capital-gains", "/capital-gains"],
  ["private", "/private"],
  ["data-bank", "/data-bank"],
  ["performance", "/performance"],
  ["returns", "/returns"],
  ["ledger", "/ledger"],
  ["news", "/news"],
  ["audit", "/audit"],
  ["history", "/history"],
  ["upload", "/upload"],
];

// Requests that fail because this harness runs offline against a static preview:
// the web font CDN is unreachable, and /api/* are Cloudflare Pages Functions
// that only exist on the deployed site. Neither is an application error, and
// folding them in would bury the ones that are.
const ENVIRONMENT_NOISE = /fonts\.googleapis\.com|\/api\/(news|quotes)|ERR_CONNECTION_RESET|Failed to load resource/;

const ZEROISH = /(?:₹|Rs\.?\s?)0(?:\.00)?(?![\d.,])|\b0\.00\s?%|(?<![\d.])\b0\s?%/g;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const report = [];
for (const [name, path] of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
  if (name === "monitor-txns") {
    const t = page.getByRole("button", { name: /transactions/i }).first();
    if (await t.count()) { await t.click(); await page.waitForTimeout(1200); }
  }
  await page.waitForTimeout(900);

  const text = await page.evaluate(() => document.body.innerText);
  const zeros = [...text.matchAll(ZEROISH)].map((m) => {
    const i = Math.max(0, m.index - 70);
    return text.slice(i, m.index + m[0].length + 40).replace(/\s+/g, " ");
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  report.push({
    name, path,
    errors: errors.filter((e) => !ENVIRONMENT_NOISE.test(e)),
    failed: [...new Set(failed.filter((f) => !ENVIRONMENT_NOISE.test(f)))],
    zeros,
  });
  await page.close();
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

let broken = 0;
for (const r of report) {
  const hard = r.errors.length + r.failed.length;
  if (hard) broken++;
  console.log(`${hard ? "✗" : "✓"} ${r.name.padEnd(14)} errors=${r.errors.length} failedReq=${r.failed.length} zeroish=${r.zeros.length}`);
  for (const e of r.errors) console.log(`    ERR  ${e.slice(0, 200)}`);
  for (const f of r.failed) console.log(`    REQ  ${f.slice(0, 160)}`);
  for (const z of r.zeros) console.log(`    ZERO …${z}`);
}
console.log(`\nScreenshots and report.json in ${OUT}/`);
console.log(broken
  ? `✗ ${broken} route(s) with a console error or failed request`
  : `✓ ${report.length} routes, no console errors, no failed requests`);
process.exit(broken ? 1 : 0);
