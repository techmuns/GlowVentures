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
// ── AND THESE TWO CHECKS ARE NOW WHAT KEEP THE REMOVED PAGES' DATA REACHABLE ─
//
// Thesis & Triggers and Alerts have been removed (Stage 10y). The family's
// theses and alert rules were NOT: they are still in `familyInputs.ts` and they
// still travel in this page's one export file. With both editors gone, THIS is
// the only surface that reaches them — so the check above (the bucket roll-up,
// which is `bucketActuals`/`bucketWeightPct`, the half of `alertEngine.ts` that
// survived its page) and the one below are what stop a future session deleting
// either as dead.
//
// AND THE EXPORT CHECK COULD NOT FAIL, which is why it is rewritten. It read
// `/export/i` over the whole page text — and the paragraph beneath the buttons
// explains what "Export" does, so deleting the button outright left it green.
// It is struck on the BUTTONS now: both of them, because an export with no
// import back is a one-way door out of the family's own record.
const exportBtn = await page.locator("button", { hasText: /^\s*Export\s*$/ }).count();
const importBtn = await page.locator("button", { hasText: /^\s*Import\s*$/ }).count();
check("the whole store can still be exported from here — and imported back",
  exportBtn > 0 && importBtn > 0, `${exportBtn} export · ${importBtn} import`);

// ── The removed routes redirect rather than 404 ────────────────────────────
//
// `/private` NOW FORWARDS TO `/private-market`, AND THAT IS NOT THE REMOVED PAGE
// COMING BACK. The fund-of-funds tracker of Stage 10f is still gone: it read
// `portfolio.privateMarkets`, whose six arrays are empty, and drew a deployment
// bar over nothing. What stands at `/private-market` is a different page built
// from the AIF folios, the capital accounts and the folios nothing values.
//
// The redirect moved because leaving it pointed at the monitor while a live
// Private Market page exists one link away is a STALE routing decision — the
// same one Stage 9d removed the day the calendar was wired. `/look-through`,
// `/funds` and `/value-creation` were tabs of the removed page and follow it.
// `/data-bank` and `/household` do NOT move: neither is about private markets.
for (const [from, to] of [
  ["/household", "/family"],
  ["/private", "/private-market"],
  ["/look-through", "/private-market"],
  ["/funds", "/private-market"],
  ["/value-creation", "/private-market"],
  ["/data-bank", "/monitor"], ["/news", "/monitor"], ["/recommendations", "/monitor"],
  // KNOWLEDGE & MEMORY, MACRO RESEARCH and ECONOMY & MACRO were removed at the
  // family's request. All three forward to the dashboard home rather than to a
  // neighbour, because nothing that survives holds the family's own notes and
  // nothing that survives renders a macro series — sending them at a page that
  // merely looks adjacent would assert a continuity that does not exist.
  //
  // `/industry` moves WITH them: removed at Stage 9c, it forwarded to `/macro`.
  //
  // AND THIS ROW CANNOT CATCH THAT, WHICH IS WORTH SAYING RATHER THAN LEAVING
  // TO BE FOUND. Reintroducing the bug is what showed it: pointed back at
  // `/macro` the row still PASSED, because `/macro` now redirects to `/cio` and
  // two hops settle at the same pathname as one. What this suite reads is where
  // a bookmark LANDS, and by that measure both routings keep the promise. The
  // chain is a fact about the route table, so it is fixed there and named in
  // `App.tsx` — not asserted here by a check that would have to pass either way.
  ["/knowledge", "/cio"], ["/macro", "/cio"], ["/economy", "/cio"], ["/industry", "/cio"],
  // THESIS & TRIGGERS and ALERTS were removed at the family's request, and both
  // forward to Exposure & IPS rather than to the dashboard home. All three were
  // the family-input layer — a thesis, an alert rule and an IPS target are things
  // the family TYPES — and Exposure & IPS is the one that survives, holding the
  // IPS targets, the bucket mapping and the Export/Import that round-trips the
  // WHOLE store. It is now the only way to reach a stored thesis or alert rule,
  // which is what makes it the honest destination rather than a near-enough one.
  ["/thesis", "/exposure"], ["/alerts", "/exposure"],
  // COMPARE COMPANIES was removed at the family's request, and with it the whole
  // RESEARCH nav group. It forwards to Portfolio Monitor: that page's SECURITY
  // axis is one row per company across every vehicle the family holds it
  // through, and each row opens `/stock/:securityKey`, where the price, the
  // returns table, the ratios, the filings and the family's own target and
  // upside all still render per company. Comparing four side by side is what is
  // gone; reaching any one of them is not.
  //
  // WATCHLIST & TARGETS was removed first (Stage 10w) and used to forward to
  // Compare. That reason expired with Compare, so it is REPOINTED at its own
  // final destination rather than chained through a dead address — the fix the
  // `/industry` row above records this suite could not have caught, because two
  // hops land on the same pathname as one.
  ["/compare", "/monitor"], ["/watchlist", "/monitor"],
  // THE INVESTMENT REGISTER was removed at the family's request, and it forwards
  // to the dashboard home rather than to a neighbour. It is a COST record
  // spanning every vehicle the family has used — listed and private, managed and
  // self-bought — so no surviving page is "nearest its purpose": pointing it at
  // Private Market or the Monitor would assert a continuity that does not exist,
  // which is the reasoning the `/knowledge` row above already records.
  //
  // AND THIS ROW CANNOT CATCH A DELETED REDIRECT, WHICH IS WORTH SAYING RATHER
  // THAN LEAVING TO BE FOUND — the same finding the `/industry` row above
  // records, arriving through a different mechanism. Reintroducing the bug is
  // what showed it: with the explicit `/register` route removed, `path="*"`
  // falls through to `RootRedirect`, which lands on `/cio` — so the row still
  // PASSED. What this suite reads is where a bookmark LANDS, and by that measure
  // the promise is kept either way, which is why the row stays as it is rather
  // than being rewritten into something that would have to pass anyway. What
  // the explicit route buys is INTENT: a reader of `App.tsx` can see where this
  // address was deliberately sent, which a catch-all does not say.
  ["/register", "/cio"],
]) {
  await page.goto(`${BASE}${from}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  check(`${from} redirects to ${to}`, new URL(page.url()).pathname === to, new URL(page.url()).pathname);
}

// ── …and the page it forwards to is the NEW one, not the removed tracker ───
//
// Asserted on figures and on the absence of the removed page's own tiles: the
// old one printed a "₹0 invested → ₹0 today" private book and a 100%-undrawn
// deployment bar off six empty arrays. If those ever come back, the giveaway is
// a private market value of zero on a book whose statements report ₹352 Cr.
await page.goto(`${BASE}/private-market`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
text = await page.locator("body").innerText();
// THE HEADER PILL THIS USED TO READ IS GONE, at the family's request, along
// with the page's lead paragraph. The claim survives on the figure it describes
// — the fund table's footer counts the funds, and the accounts count moved onto
// the Private market value tile — so it is struck THERE, and the pill's absence
// is asserted beside it. Read off the removed pill this would have gone on
// "passing" by being unable to match, which is the failure mode this suite has
// already recorded once.
check("the Private Market page still counts the funds and accounts it covers",
  /Total · \d+ funds/i.test(text) && /across \d+ accounts · each holding counted once/i.test(text),
  /across \d+ accounts/i.exec(text)?.[0]);
check("...and its header pills and lead paragraph stay removed",
  !/\d+ funds · \d+ accounts/.test(text)
  && !/\bSTATEMENT\s*·\s*as of/i.test(text)
  && !/Every private-market holding the statements in this drop report/i.test(text));
check("its private market value is a real measured figure, not the removed page's ₹0",
  /PRIVATE MARKET VALUE\s*\n?\s*₹[\d,.]+\s*(Cr|L)/i.test(text)
  && !/PRIVATE MARKET VALUE\s*\n?\s*₹0\b/i.test(text),
  /PRIVATE MARKET VALUE\s*\n?\s*(₹[\d,.]+\s*(?:Cr|L))/i.exec(text)?.[1]);
// THE TILE'S LABEL WAS THE CLIENT'S OWN QUESTION — *"Drawn against no valuation
// means?"* — so it now says what it is. The CLAIM is unchanged and is what this
// asserts: that capital is stated on its own and is in no total on the page.
check("the capital the family paid into funds that publish no NAV is stated on its own",
  /PAID IN, BUT NEVER VALUED/i.test(text) && /in no total on this page/i.test(text));

// ── THE THREE REMOVED PAGES LEFT NO PAGE BEHIND ───────────────────────────
//
// This block used to prove that the release calendar sat on Economy & Macro and
// that Macro Research had stopped claiming a calendar was impossible. Both those
// pages have now gone at the family's request, so the claim to assert is the
// removal itself: the addresses redirect (checked above) and NEITHER page's own
// content renders anywhere.
//
// Struck on each page's own distinctive content rather than on its title,
// because a title can survive in a nav entry or a heading while the page is
// gone, and — the failure this repo has recorded twice — prose about a page is
// not the page. The redirect lands on Morning CIO, so the text read here is the
// dashboard's, and none of these three phrases belongs to it.
for (const [from, label, pattern] of [
  ["/knowledge", "Knowledge & Memory", /capture the first note|search the family's notes|notes captured/i],
  ["/macro", "Macro Research", /returns table[\s\S]{0,400}52-week|series store did not respond|observations/i],
  ["/economy", "Economy & Macro", /data release calendar|surprise vs consensus/i],
  // Both of these land on Exposure & IPS, so the text read is that page's. The
  // phrases below belong to the removed editors and to nothing that survives —
  // checked rather than assumed, because "Thesis" and "Alerts" as WORDS do
  // appear in Exposure & IPS's own export tooltip, which is why neither page is
  // matched on its title.
  ["/thesis", "Thesis & Triggers", /of \d+ recorded|not recorded|no schedule|exit triggers/i],
  // `alert rules` was in this pattern and FAILED a correct page: Exposure & IPS's
  // export tooltip lists what the file carries, "theses, alert rules" among them
  // — legitimately, because the export does carry them. A phrase the DESTINATION
  // prints is not distinctive to the page that was removed, which is the trap the
  // comment above names and the first draft walked into anyway.
  ["/alerts", "Alerts", /no rules yet|need a source, not a threshold/i],
  // COMPARE COMPANIES lands on Portfolio Monitor, so the text read here is that
  // page's. Matched on the comparison screen's OWN furniture and deliberately
  // NOT on "compare" or "of 4 selected": Sector Composition prints the second
  // verbatim for its Compare-sectors chips, and the word itself is ordinary
  // English on half the app. A phrase a surviving page prints is not distinctive
  // to the page that was removed — the exact trap the `/alerts` row above walked
  // into once already.
  ["/compare", "Compare Companies", /names side by side|Pick companies|Pick up to four holdings above/i],
  // THE INVESTMENT REGISTER lands on Morning CIO, so the text read here is the
  // dashboard's. Matched on the register page's OWN sentences and deliberately
  // NOT on the word "register": `capital-register` is a live report type in this
  // book and the Data Audit page prints it on every walk — the same trap the
  // `/alerts` and `/compare` rows above each record once.
  ["/register", "Investment Register", /money the family PAID|Cost record · not a valuation|Why the gross is not added to anything/i],
]) {
  await page.goto(`${BASE}${from}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  text = await page.locator("body").innerText();
  check(`${label} renders none of its own content at ${from}`, !pattern.test(text),
    pattern.exec(text)?.[0]);
}

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
// News & Announcements was removed with the page, the sidebar entry and the
// top-bar bell that rendered the same feed. The nav must not offer it and the
// bell must not be there — a removal is verified by asserting it happened.
await page.goto(`${BASE}/monitor`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const nav = await page.locator("body").innerText();
check("the News & Announcements nav entry is gone", !/News & Announcements/i.test(nav));
check("the holdings-news bell is gone with it", !/Latest holdings news/i.test(nav));
// Watchlist & Targets went the same way: the tab, the nav entry and the page.
// What must NOT have gone with it is the store — the family's own targets,
// fair values and levels are still written and read on a name's own company
// page, and that half is asserted below on the company page itself.
check("the Watchlist & Targets nav entry is gone", !/Watchlist\s*&\s*Targets/i.test(nav));
// INVESTMENT REGISTER went the same way. Its DAILY group survives — Polycab,
// Morning CIO, Portfolio Monitor and Private Market are still in it — so unlike
// KNOWLEDGE, RESEARCH and MONITOR there is no heading to remove with the entry,
// and a check for one would assert the opposite of what should be true.
check("the Investment Register nav entry is gone", !/Investment Register/i.test(nav));
check("...and the Daily group it sat in survives, with its other entries",
  /(^|\n)\s*DAILY\s*(\n|$)/.test(nav) && /Morning CIO/.test(nav) && /Polycab/.test(nav));
// KNOWLEDGE & MEMORY, MACRO RESEARCH and ECONOMY & MACRO went the same way.
// Removing `/knowledge` also empties the whole KNOWLEDGE nav GROUP, so its
// heading must go with its one entry — a group label standing over nothing is a
// section a reader will look for and never find.
check("the Knowledge & Memory nav entry is gone", !/Knowledge\s*&\s*Memory/i.test(nav));
check("...and the now-empty Knowledge group heading with it", !/(^|\n)\s*KNOWLEDGE\s*(\n|$)/.test(nav));
// COMPARE COMPANIES went the same way, and it was the ONLY entry in the RESEARCH
// group — so the heading must go with it, exactly as KNOWLEDGE and MONITOR did.
// The two are separate claims: the group heading is derived from the entries, so
// an entry removed from the array takes its heading automatically — but a future
// session hardcoding a heading, or re-adding the entry, breaks one and not the
// other.
check("the Compare Companies nav entry is gone", !/Compare Companies/i.test(nav));
check("...and the now-empty Research group heading with it", !/(^|\n)\s*RESEARCH\s*(\n|$)/.test(nav));
check("the Macro Research nav entry is gone", !/Macro Research/i.test(nav));
check("the Economy & Macro nav entry is gone", !/Economy\s*&\s*Macro/i.test(nav));
// RESEARCH used to be asserted to SURVIVE here — "it lost two of its three and
// keeps the one that survived". That was true until Compare Companies, the one
// that survived, was removed at the family's request. The claim is inverted
// above rather than deleted with the feature, which is the same treatment every
// other removal in this file gets.
// Thesis & Triggers and Alerts went the same way, and between them they were the
// WHOLE of the MONITOR group — so its heading must go with both entries, exactly
// as the KNOWLEDGE heading went with its one.
check("the Thesis & Triggers nav entry is gone", !/Thesis\s*&\s*Triggers/i.test(nav));
check("the Alerts nav entry is gone", !/(^|\n)\s*Alerts\s*(\n|$)/.test(nav));
check("...and the now-empty Monitor group heading with them",
  !/(^|\n)\s*MONITOR\s*(\n|$)/.test(nav));

check("the Public dashboard tab is gone", !/public dashboard/i.test(text));
check("Holdings and Transactions both remain", /Holdings/.test(text) && /Transactions/.test(text));
await page.getByRole("button", { name: /^transactions$/i }).click();
await page.waitForTimeout(700);
text = await page.locator("body").innerText();
check("the Transactions tab still renders", /transaction/i.test(text));

// ── THE HOLDINGS TABLE GROUPS BY WHO CHOSE THE POSITION ────────────────────
//
// The family asked three times for one thing, and the first two rounds answered
// with a WORD — "Direct Equity" became "Company Shares" and neither was true of
// everything under it. What they wanted was a GROUPING: a share a discretionary
// manager chose belongs inside that mandate's drill-down, and Direct Equity
// should mean shares held directly.
//
// `check:pages` asserts the sections and their arithmetic off the rendered text.
// What only THIS suite can do is drive the page: pick the category, follow the
// link, and land on the drill-down. A route nobody can reach is a feature that
// exists in the model and not for a reader — which is the same failure as a
// helper returning the right number into no caller.
await page.goto(`${BASE}/monitor`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

// Read the OPTIONS off the DOM, not the label innerText shows: a `<select>`
// renders only its selected option, so matching page text would check one of
// them and report on all.
const categories = await page.$$eval("select", (sels) => {
  const cat = sels.find((s) => [...s.options].some((o) => /All categories/i.test(o.textContent || "")));
  return cat ? [...cat.options].map((o) => (o.textContent || "").trim()) : [];
});
check("the category filter offers Direct Equity and PMS mandates as separate choices",
  categories.includes("Direct Equity") && categories.includes("PMS mandates"),
  categories.join(" · "));
check("...and no longer offers the retired 'Company Shares' category",
  categories.length > 0 && !categories.some((o) => /company shares/i.test(o)));

// Narrowing to the mandates must leave MANDATES on screen — one row per account,
// each standing for the shares inside it. A filter that returned 263 share rows
// would be the regrouping undone with the label still in place.
const catSelect = page.locator('select:has(option:text-is("PMS mandates"))').first();
if (await catSelect.count()) {
  await catSelect.selectOption({ label: "PMS mandates" });
  await page.waitForTimeout(800);
  text = await page.locator("body").innerText();
  /**
   * READ OFF THE ROWS' OWN ATTRIBUTES, not off a printed sub-line.
   *
   * These two used to parse "· account <no> · N holdings" out of the rendered
   * text. That line was removed at the family's request — the entity has its own
   * column and the rest belongs on the mandate's page — and BOTH checks would
   * then have matched nothing, which is not a failure but an empty list, and an
   * empty list quietly satisfies a length comparison against itself. The row
   * carries `data-mandate` / `data-holdings` for exactly this.
   */
  const mandateRows = await page.$$eval("tbody tr[data-mandate]", (trs) =>
    trs.map((tr) => ({ accountNo: tr.getAttribute("data-account"), holdings: Number(tr.getAttribute("data-holdings")) })));
  const rowsPill = Number(/(\d+)\s+rows/.exec(text)?.[1] ?? NaN);
  const links = await page.locator('a[href^="/mandate/"]').count();
  check("filtering to PMS mandates lists mandates, one row each",
    mandateRows.length >= 2 && rowsPill === mandateRows.length && links === mandateRows.length,
    `${mandateRows.length} mandate rows · pill says ${rowsPill} rows · ${links} drill-down links`);
  // ...and each stands for more shares than it draws, which is what a roll-up is.
  const constituents = mandateRows.reduce((n, m) => n + m.holdings, 0);
  check("each mandate row stands for the shares inside it",
    mandateRows.length > 0 && constituents > mandateRows.length,
    `${constituents} constituent holdings across ${mandateRows.length} mandates`);
  await catSelect.selectOption({ label: "All categories" });
  await page.waitForTimeout(600);
} else {
  check("filtering to PMS mandates lists mandates, one row each", false, "no category filter offering PMS mandates");
}

// ── The link is the whole point: a mandate row must OPEN its drill-down ─────
const mandateLink = page.locator('a[href^="/mandate/"]').first();
const mandateHref = (await mandateLink.count()) ? await mandateLink.getAttribute("href") : null;
if (mandateHref) {
  await mandateLink.click();
  await page.waitForTimeout(1200);
  text = await page.locator("body").innerText();
  check("a mandate row opens its own drill-down", new URL(page.url()).pathname === mandateHref,
    `${new URL(page.url()).pathname}`);
  check("the drill-down names its manager and lists what that manager holds",
    /Run by/.test(text) && /\d+\s+holdings the manager runs/.test(text) && !/Mandate not found/i.test(text),
    /(\d+)\s+holdings the manager runs/.exec(text)?.[0]);
  // THE ROUND TRIP, which is the family's own complaint read backwards: they
  // opened a share and could not see the mandate. The largest constituent of a
  // PMS mandate is a company share (a cash sleeve is never the biggest line),
  // so its own page must name the mandate it came from and must NOT call it
  // direct — the word now means the family bought it, and here a manager did.
  const mandateName = (await page.locator("h1").first().innerText()).trim();
  const constituent = page.locator('a[href^="/stock/"]').first();
  if (await constituent.count()) {
    await constituent.click();
    await page.waitForTimeout(1200);
    text = await page.locator("body").innerText();
    check("a share inside a mandate names that mandate on its own page",
      text.includes(mandateName) && /Held through .{0,24}discretionary mandate/i.test(text),
      mandateName);
    check("...and is never called Direct Equity there", !/direct equity/i.test(text));
    check("...and links back to the mandate it is held in",
      (await page.locator('a[href^="/mandate/"]').count()) > 0);
  } else {
    check("a share inside a mandate names that mandate on its own page", false, "no constituent link on the drill-down");
  }
} else {
  check("a mandate row opens its own drill-down", false, "no /mandate/ link on Portfolio Monitor");
}

// ── An address that names no account is an ABSENCE WITH A REASON ───────────
//
// Not an empty holdings table, which reads as a mandate holding nothing, and not
// a blank page. It says which account it could not find and lists the ones this
// book does carry, so the reader has somewhere to go.
await page.goto(`${BASE}/mandate/not-an-account-in-this-book`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
text = await page.locator("body").innerText();
check("an unknown mandate address renders a named absence, not an empty table",
  /Mandate not found/i.test(text) && /not-an-account-in-this-book/.test(text)
    && !/holdings the manager runs/.test(text));
check("...and names the mandates this book does carry",
  (await page.locator('a[href^="/mandate/"]').count()) > 1);

// ── THE WATCHLIST STORE SURVIVED THE PAGE THAT SHOWED IT ───────────────────
//
// Watchlist & Targets was removed at the family's request — the tab, its nav
// entry and `src/pages/Watchlist.tsx`. `src/lib/watchlist.ts` was NOT, and this
// is the half a removal like that breaks SILENTLY: with its most visible reader
// gone the store looks dead, and the next session deletes it along with every
// target price, fair value, level, valuation method and target weight the family
// typed. The same treatment `deals.ts` and `household.ts` got in Stage 10f, and
// the same reason `announcements.ts` stayed when `/news` went.
//
// So the surviving surface is asserted here: a name's own company page still
// writes to the store. The address is taken off the monitor rather than typed,
// like every other route this suite follows.
await page.goto(`${BASE}/monitor`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const watched = page.locator('a[href^="/stock/"]').first();
if (await watched.count()) {
  await watched.click();
  await page.waitForTimeout(1200);
  text = await page.locator("body").innerText();
  check("a company page still carries the Investment tools panel", /investment tools/i.test(text));
  check("...with the judgement fields the watchlist store holds",
    /target price/i.test(text) && /fair value/i.test(text) && /valuation method/i.test(text));
} else {
  check("a company page still carries the Investment tools panel", false, "no /stock/ link on Portfolio Monitor");
}

await browser.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
