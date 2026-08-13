#!/usr/bin/env node
// Reads the DEPLOYED dashboard and reports what each research surface actually
// renders — the only place the muns endpoints can be exercised.
//
// WHY THIS EXISTS. `MUNS_TOKEN` lives in the Cloudflare environment and nowhere
// else, so several endpoints (ratios, research, insider, announcements) shipped
// with a comment saying UNVERIFIED AGAINST THE LIVE API. A local `vite preview`
// cannot settle that: every one of those calls 404s there, which looks exactly
// like an upstream that returns nothing. Measuring on the network that matters
// is the same rule the FRED false negative established — a source declared dead
// from the wrong network is worse than a gap.
//
//   GLOW_PASSWORD='…' node scripts/dev/probe-live.mjs
//
// Prints, per page: console errors, failed requests, which panels rendered a
// figure and which rendered an absence. It asserts nothing — it is a probe, and
// its output is evidence for deciding what to build, not a pass/fail gate.
import { chromium } from "playwright-core";

const BASE = process.env.GLOW_URL ?? "http://localhost:4174";
const PASSWORD = process.env.GLOW_PASSWORD ?? "";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// CHROMIUM CANNOT USE THIS SESSION'S EGRESS PROXY — every https:// navigation
// comes back ERR_CONNECTION_RESET, `example.com` included, so it is not the
// site. Node's fetch CAN (with NODE_USE_ENV_PROXY=1), which is why this points
// at `scripts/dev/live-api-proxy.mjs` on localhost rather than at the deployed
// origin: the bridge serves the local build and forwards /api/* to production.
// Point GLOW_URL straight at the deployment from a machine whose browser can
// reach it.

const PAGES = [
  ["company", "/stock/aditya-birla-capital"],
  ["compare", "/compare"],
  ["news", "/news"],
  ["cio", "/cio"],
  ["macro", "/macro"],
  ["economy", "/economy"],
];

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1400 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const errors = [];
const failed = [];
const api = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("requestfailed", (r) => failed.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ""}`));
page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/api/")) return;
  let note = "";
  try {
    const b = await r.text();
    const j = JSON.parse(b);
    note = `ok=${j.ok} ${["count", "articles", "items", "quotes"].filter((k) => k in j).map((k) => `${k}=${Array.isArray(j[k]) ? j[k].length : Object.keys(j[k] ?? {}).length}`).join(" ")}`;
  } catch { note = "(non-JSON)"; }
  api.push(`${r.status()} ${u.replace(BASE, "").slice(0, 60)} ${note}`);
});

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
const pw = page.locator('input[type="password"]');
if (await pw.count()) {
  if (!PASSWORD) { console.error("The site is gated and GLOW_PASSWORD is unset."); process.exit(2); }
  await pw.first().fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

for (const [name, path] of PAGES) {
  errors.length = 0; failed.length = 0; api.length = 0;
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  const text = await page.locator("body").innerText();
  // The em dash is how this codebase renders every absence, so counting them
  // per page is a direct measure of how much of a screen is still unanswered.
  const dashes = (text.match(/—/g) ?? []).length;
  console.log(`\n══════ ${name}  ${path}`);
  console.log(`   console errors: ${errors.length}${errors.length ? "\n     " + errors.slice(0, 5).join("\n     ") : ""}`);
  console.log(`   failed requests: ${failed.length}${failed.length ? "\n     " + failed.slice(0, 5).join("\n     ") : ""}`);
  console.log(`   api calls: ${api.length}${api.length ? "\n     " + api.slice(0, 10).join("\n     ") : ""}`);
  console.log(`   em-dashes (absences) on page: ${dashes}`);
  await page.screenshot({ path: `docs/live-probe/${name}.png`, fullPage: true });
}

await browser.close();
console.log("\nScreenshots in docs/live-probe/");
