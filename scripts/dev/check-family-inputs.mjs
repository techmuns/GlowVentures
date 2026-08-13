#!/usr/bin/env node
// Seeds the family-input store and checks that the screens READ it.
//
// The unit tests in `src/lib/__tests__/familyMath.test.ts` prove the arithmetic.
// This proves the wiring, which is the other half and the half that has broken
// silently in this repo before: `dedupedPositions` sat in `analytics.ts` correct
// and called by nothing for as long as no drop contained a duplicate. A helper
// that returns the right number into no caller looks exactly like a working
// feature.
//
// So this drives a real browser, writes a register into localStorage, and reads
// the rendered figures back off the page.
//
// Run with a `vite preview` on :4173 (same as `npm run check:pages`):
//   npm run build && npx vite preview --port 4173 &
//   node scripts/dev/check-family-inputs.mjs
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173";
// Same pinned Chromium `check:pages` uses — playwright-core ships no browser.
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PASSWORD = process.env.GLOW_PASSWORD ?? "@glow_ventures";

// One asset per kind that matters, one liability, one recurring outflow and one
// one-off — enough that every derived figure has both halves and the coverage
// captions have something to be partial about.
const FAMILY = {
  version: 3,
  charter: "",
  ipsTargets: { growth: 60, liquidity: 20 },
  sectorTargets: {},
  bucketByAssetClass: { Equity: "growth", Cash: "liquidity" },
  theses: {},
  alertRules: [],
  deals: [{
    id: "d1", company: "Testco Pvt Ltd", segment: "VC",
    committed: 120000000, committedOn: "2024-04-12",
    tranches: [
      { id: "t1", date: "2024-04-20", amount: 50000000, note: "" },
      { id: "t2", date: "2025-01-10", amount: 40000000, note: "" },
    ],
    stakeFdPct: 5.4, capTableAtEntry: "Series B",
    lastRoundValuation: 1800000000, lastRoundOn: "2025-01-01", stakePctPostRaise: 4.7,
    rounds: [], docs: [], financials: "FY25 audited", financialsAsOf: "2025-09-30",
    misReceivedOn: "2026-06-30", note: "", updatedAt: "",
  }],
  household: {
    assets: [
      { id: "a1", label: "Current account", kind: "cash", owner: "", amount: 50000000, asOf: "2026-07-31", liquid: true, charity: false, bucket: null, note: "" },
      { id: "a2", label: "Residence", kind: "property", owner: "", amount: 300000000, asOf: "2026-03-31", liquid: false, charity: false, bucket: null, note: "" },
      { id: "a3", label: "Charity corpus", kind: "cash", owner: "", amount: 30000000, asOf: "2026-07-31", liquid: true, charity: true, bucket: null, note: "" },
    ],
    liabilities: [
      { id: "l1", label: "Loan against property", kind: "loan", owner: "", amount: 80000000, asOf: "2026-06-30", liquid: false, charity: false, bucket: null, note: "" },
    ],
    outflows: [
      { id: "o1", label: "Quarterly fees", dueOn: "2026-09-01", amount: 1000000, everyMonths: 3, note: "" },
      { id: "o2", label: "Advance tax", dueOn: "2026-12-15", amount: 5000000, everyMonths: null, note: "" },
    ],
    advisors: [{ id: "adv1", name: "A. Auditor", firm: "Firm LLP", role: "Auditor", mandate: "Statutory audit", fees: "Fixed", contact: "", since: "2020-04-01", reviewOn: "2027-04-01", note: "" }],
    decisions: [{ id: "dec1", title: "Approve the next drawdown", category: "Commitment", raisedOn: "2026-08-01", dueOn: "2026-08-31", owner: "IC", state: "Open", note: "" }],
    benchmarkSeriesId: "",
  },
  updatedAt: "",
};

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });

await page.goto(BASE, { waitUntil: "domcontentloaded" });
// The edge gate, when one is set. Locally there is none and this is a no-op.
const pw = page.locator('input[type="password"]');
if (await pw.count()) {
  await pw.first().fill(PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
}
await page.evaluate((f) => localStorage.setItem("glow:familyInputs/v1", JSON.stringify(f)), FAMILY);

// ── Family Dashboard: the four tiles that were absent ───────────────────────
await page.goto(`${BASE}/household`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
let text = await page.locator("body").innerText();

// Tile labels are UPPERCASED BY CSS, so `innerText` returns "NET WORTH". Every
// pattern here is therefore case-insensitive — a case-sensitive one fails on a
// page that is rendering correctly, which is worse than no test at all.
//
// Off-book net = ₹38 Cr assets − ₹8 Cr liabilities = +₹30 Cr, ON TOP OF THE
// BOOK'S OWN NAV — and the NAV is READ FROM THE PAGE, never written here as a
// literal. It was ₹335.43 Cr when this check was written and this line said
// "365.4"; the August drop moved the book to ₹461.00 Cr and the check failed
// against a dashboard that was computing correctly. A test carrying a copy of
// a figure the book generates is a second source for it, and this repo's whole
// discipline is that there is one.
//
// The relation is what is under test: net worth = the measured portfolio plus
// what the family entered. The tolerance absorbs compact rounding at 1dp on
// both figures and a live price moving the portfolio between the two reads.
const navChip = await page.locator('[title="Consolidated NAV"]').first().innerText().catch(() => "");
const navCr = Number(/₹([\d.]+)\s*Cr/.exec(navChip)?.[1] ?? NaN);
const netMatch = /net worth[\s\S]{0,80}?₹([\d.]+) Cr/i.exec(text);
check("the consolidated NAV is on screen to measure against", Number.isFinite(navCr), navChip);
check("net worth = the book's NAV + the entered register (+₹30 Cr)",
  !!netMatch && Number.isFinite(navCr) && Math.abs(Number(netMatch[1]) - (navCr + 30)) < 3,
  `${netMatch?.[0].replace(/\s+/g, " ")} vs NAV ${navChip} + ₹30 Cr`);
check("cash available = the two liquid lines (₹8 Cr)", /cash available[\s\S]{0,80}?₹8 Cr/i.test(text));
check("charity pool = the ring-fenced line (₹3 Cr)", /charity pool[\s\S]{0,60}?₹3 Cr/i.test(text));
// 4 quarterly x ₹10 L + ₹50 L one-off = ₹90 L a year → ₹7.5 L a month.
// ₹8 Cr / ₹7.5 L = 106.7 months.
check("liquidity coverage in months, from both halves", /liquidity coverage[\s\S]{0,80}?106\.7 mo/i.test(text), /liquidity coverage[\s\S]{0,80}?[\d.]+ mo/i.exec(text)?.[0].replace(/\s+/g, " "));
check("IPS buckets read the family's mapping", /% mapped/.test(text) && !/not mapped/.test(text));
check("decisions queue shows the entered item", /Approve the next drawdown/.test(text));
check("decisions queue is not the old sample", !/Aristos|GLC Growth Fund/.test(text));

// ── The editor tabs render ─────────────────────────────────────────────────
// THE EDITORS' VALUES LIVE IN `<input>`s, WHICH `innerText` DOES NOT RETURN.
// Read through `inputValue()` instead — asserting on innerText here fails
// against a form that is populated correctly.
const values = async () => Promise.all(
  (await page.locator("input[type=text]").all()).map((i) => i.inputValue()),
);

await page.getByRole("button", { name: "Balance sheet" }).click();
await page.waitForTimeout(600);
text = await page.locator("body").innerText();
let vals = await values();
check("balance sheet lists the entered assets", vals.includes("Current account") && vals.includes("Residence"), vals.filter(Boolean).slice(0, 4).join(" | "));
check("tangible / intangible split is shown", /Tangible:/.test(text) && /Intangible:/.test(text));
check("off-book totals name their coverage", /over 3 of 3 lines/.test(text), /over \d+ of \d+ lines?/.exec(text)?.[0]);

await page.getByRole("button", { name: "Advisers & decisions" }).click();
await page.waitForTimeout(600);
text = await page.locator("body").innerText();
vals = await values();
check("adviser register lists the entered adviser", vals.includes("A. Auditor"), vals.filter(Boolean).slice(0, 4).join(" | "));
check("benchmark picker offers the harvested series", /Benchmark series/i.test(text));

// ── Private deal register ──────────────────────────────────────────────────
await page.goto(`${BASE}/private?view=register`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
text = await page.locator("body").innerText();
check("deal register shows the entered deal", /Testco Pvt Ltd/.test(text));
// invested = 5 Cr + 4 Cr = 9 Cr; pending = 12 − 9 = 3 Cr; stake value = 4.7% of 180 Cr = 8.46 Cr
check("invested is derived from the tranches (₹9 Cr)", /₹9 Cr/.test(text));
check("pending is committed less invested (₹3 Cr)", /₹3 Cr/.test(text));
check("stake value = post-raise stake x last valuation (₹8.46 Cr)", /₹8\.4[56] Cr/.test(text));
check("the illustrative sample is gone once a real deal exists", !/Helios Robotics|Meridian Payments/.test(text));

// ── Portfolio Monitor ──────────────────────────────────────────────────────
//
// The "Public dashboard" tab this block used to drive HAS BEEN REMOVED at the
// family's request, and with it the four judgement columns (target weight,
// fair value, its reference year, the valuation method) and the pending-to-
// invest arithmetic that read them. Those fields still live in the watchlist
// store and still render on a name's own company page; what is gone is the
// table that showed them beside the book.
//
// The check that replaces it is the one thing the removal could break: the two
// remaining tabs must still be reachable, and the holdings table must still be
// the default. A removed feature is not verified by deleting its test — it is
// verified by asserting it is gone.
await page.goto(`${BASE}/monitor`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
text = await page.locator("body").innerText();
check("the Public dashboard tab is gone", !/public dashboard/i.test(text));
check("Holdings and Transactions both remain", /Holdings/.test(text) && /Transactions/.test(text));
await page.getByRole("button", { name: /^transactions$/i }).click();
await page.waitForTimeout(700);
text = await page.locator("body").innerText();
check("the Transactions tab still renders", /transaction/i.test(text));

await browser.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
