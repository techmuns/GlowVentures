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

// ── WHAT THIS SUITE STILL COVERS, AFTER THREE PAGES WERE REMOVED ───────────
//
// The Family Dashboard (/household), Private Markets (/private) and Data Bank
// were removed at the family's request. This file used to drive all three, and
// most of what it asserted — net worth from the register, liquidity coverage,
// the deal register's derived invested/pending/stake value — no longer has a
// screen to be read off.
//
// THE ARITHMETIC IS NOT LOST WITH THE SCREENS. Every one of those derivations
// is still asserted in `src/lib/__tests__/familyMath.test.ts` (43 cases,
// `npm run test:family`), and the STORE still round-trips all of it through the
// export/import on Exposure & IPS — one file carries the whole thing, so a
// family that entered a balance sheet or a deal register keeps it and can take
// it elsewhere. What is gone is the rendering, and this suite covers rendering,
// so those checks go with the pages.
//
// What remains here is the wiring that still has a surface: the bucket mapping
// the family enters must reach Exposure & IPS, the whole-store export must
// still be reachable, and the removed routes must REDIRECT rather than break a
// bookmark. Asserting a removal is the point — deleting a test alongside the
// feature it guards proves nothing.

// ── Exposure & IPS reads the family's bucket mapping ───────────────────────
await page.goto(`${BASE}/exposure`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
let text = await page.locator("body").innerText();
// The seeded mapping is Equity → Growth and Cash → Liquidity, so both buckets
// must show a MEASURED actual weight and the two unmapped classes must be named
// with their value. `/not mapped/` cannot be the test — it is also the empty
// option in every one of the five dropdowns on this page, so it matches on a
// page that is working perfectly.
const growth = /Growth\s+([\d.]+)%/.exec(text);
const liquidity = /Liquidity\s+([\d.]+)%/.exec(text);
check("Exposure & IPS reads the family's bucket mapping",
  !!growth && !!liquidity && Number(growth[1]) > 0 && Number(liquidity[1]) > 0,
  `Growth ${growth?.[1] ?? "—"}% · Liquidity ${liquidity?.[1] ?? "—"}%`);
check("the classes mapped to no bucket are named with their value",
  /mapped to no bucket/.test(text) && /(AIF|Mutual Fund)/.test(text),
  /₹[\d.]+ Cr \(\d+% of the book\) sits in [^,.]+/.exec(text.replace(/\s+/g, " "))?.[0]);
check("the whole store can still be exported from here", /export/i.test(text));

// ── The removed routes redirect rather than 404 ────────────────────────────
for (const [from, to] of [["/household", "/family"], ["/private", "/monitor"], ["/data-bank", "/monitor"], ["/industry", "/macro"]]) {
  await page.goto(`${BASE}${from}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  check(`${from} redirects to ${to}`, new URL(page.url()).pathname === to, new URL(page.url()).pathname);
}

// ── The release calendar lives on Economy, and nowhere else ────────────────
//
// Macro Research carried a second "Data release calendar" card that declared a
// calendar impossible. That stopped being true the day `/api/econ-calendar` was
// wired, so it was removed — and the check that replaces it has to prove the
// RIGHT one went: the stale claim gone from Macro, the working calendar still
// on Economy.
await page.goto(`${BASE}/macro`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
text = await page.locator("body").innerText();
check("Macro Research no longer claims a calendar is impossible",
  !/release calendar is available|release calendar can be built/i.test(text));
await page.goto(`${BASE}/economy`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
text = await page.locator("body").innerText();
check("the real calendar is still on Economy & Macro, with its filters",
  /data release calendar/i.test(text) && /this week/i.test(text) && /unranked/i.test(text));

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
