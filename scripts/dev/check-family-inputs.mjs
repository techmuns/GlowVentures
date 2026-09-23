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
import { readFileSync } from "node:fs";
import { UPSTOX_INSTRUMENTS } from "../../shared/upstoxInstruments.mjs";

/**
 * One generated array out of `glowData.ts`, without importing the module — a
 * copy of `check-pages.mjs`'s own reader, for the same reason it has one: this
 * is a plain `.mjs` script and the book is TypeScript.
 */
function bookArray(src, name) {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) return null;
  const start = src.indexOf("= [", i);
  if (start < 0) return null;
  const end = src.indexOf("\n];", start);
  if (end < 0) return null;
  try { return JSON.parse(src.slice(start + 2, end + 2)); } catch { return null; }
}

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

/**
 * ── GLOW CENTRAL RESEARCH, STOOD IN FOR (Stage 10cl) ──────────────────────
 *
 * Every price level saved in this dashboard is also sent to Glow Central
 * Research. This suite types levels on real holdings, so without this the walk
 * would post them to the family's LIVE list from localhost. The host is routed
 * for the whole run, to a stand-in that follows the receiving side's rules (set
 * replaces, seed only where it has never heard of the company, clear is kept)
 * and records every request — and `RESEARCH.mode = "down"` answers 404, as the
 * live one does until its route is deployed.
 */
const RESEARCH = { mode: "ok", posts: [], held: new Map() };
await page.route(/glow-central-research\.tech-441\.workers\.dev/, async (route) => {
  const req = route.request();
  const cors = { "access-control-allow-origin": req.headers()["origin"] ?? "*", vary: "origin" };
  if (req.method() === "OPTIONS") {
    return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
  }
  let intents = null;
  if (req.method() === "POST") {
    try { intents = JSON.parse(req.postData() ?? "{}").intents ?? null; } catch { intents = null; }
    RESEARCH.posts.push({ origin: req.headers()["origin"] ?? null, intents });
  }
  if (RESEARCH.mode === "down") {
    return route.fulfill({ status: 404, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ error: "Not implemented" }) });
  }
  const names = ["buyAt", "sellAt", "stopLoss", "target", "alertAbove"];
  const outcomes = (Array.isArray(intents) ? intents : []).map((i) => {
    const had = RESEARCH.held.get(i.ticker);
    if (i.op === "clear") {
      if (had?.state !== "set") return { ticker: i.ticker, op: "clear", outcome: "unchanged" };
      RESEARCH.held.set(i.ticker, { ...had, state: "cleared" });
      return { ticker: i.ticker, op: "clear", outcome: "cleared" };
    }
    if (i.op === "seed" && had) return { ticker: i.ticker, op: "seed", outcome: "unchanged" };
    RESEARCH.held.set(i.ticker, { state: "set", levels: { ...i.levels }, isin: i.isin });
    return { ticker: i.ticker, op: i.op, outcome: i.op === "seed" ? "seeded" : "set" };
  });
  const companies = [...RESEARCH.held.entries()].filter(([, h]) => h.state === "set").map(([ticker, h]) => ({
    ticker, levels: Object.fromEntries(names.map((n) => [n, h.levels[n] == null ? null : { value: h.levels[n] }])),
  }));
  return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" },
    body: JSON.stringify({ ok: true, outcomes, companies, count: companies.length, hits: [] }) });
});

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
// `npm run test:family`). What is gone is the rendering, and this suite covers
// rendering, so those checks go with the pages.
//
// ── AND EXPOSURE & IPS HAS NOW GONE THE SAME WAY ───────────────────────────
//
// That ends the other half of what this file used to assert. Two checks lived
// here — that the bucket mapping the family enters REACHED that page, and that
// the whole store could still be exported and imported FROM it — and both were
// written precisely because it was the LAST surface reaching what the family
// had typed. There is no such surface now, so neither claim has a subject.
//
// THEY ARE INVERTED, NOT DELETED WITH THE FEATURE. A removal is verified by
// asserting it happened: the entry is gone from the nav, the address forwards,
// and the page renders none of its own content anywhere (below, and in the two
// blocks after this one). `familyInputs.ts`, `alertEngine.ts` and
// `marketCap.ts` keep their data and their `familyMath.test.ts` assertions and
// each says at its own definition that no screen reads it — the family were
// shown that this leaves their entries un-exportable, so a cleared browser
// loses them with no way back, and asked for the removal anyway.

// ── THE LEFT NAV — ORDER, GROUPING, AND THE ONE DROPDOWN ───────────────────
//
// Three of the family's four asks are about WHERE things sit rather than what
// they say, so every claim below is struck on `data-nav-group` /
// `data-nav-entry` / `aria-expanded` rather than on rendered labels. Order and
// grouping asserted on prose would be a structural claim resting on text a
// redesign is free to reword — the rule `data-section`, `data-mandate` and
// `data-movers-scope` already follow, and the one a check retires itself by
// breaking.
//
// IT RUNS FIRST, BEFORE ANY OTHER `goto`, and that is load-bearing: the
// dropdown remembers itself per browser and opens itself on a route inside it,
// so a walk that had already visited /ledger would leave it stored open and
// "starts collapsed" would be asserted against a state this suite created.
await page.goto(`${BASE}/cio`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
let text = await page.locator("body").innerText();

const readNav = () => page.$$eval("[data-nav-group]", (els) => els.map((el) => {
  const links = [...el.querySelectorAll("[data-nav-entry]")];
  const toggle = el.querySelector("[data-nav-group-toggle]");
  return {
    group: el.getAttribute("data-nav-group"),
    entries: links.map((a) => a.getAttribute("data-nav-entry")),
    // A COLLAPSED GROUP IS `display:none`, SO ITS ENTRIES ARE STILL IN THE DOM.
    // The claim the family made is about what they can CLICK, so `visible` is
    // measured off the box rather than off the selector — reading `entries`
    // alone would report a dropdown that never opens as working.
    visible: links.filter((a) => a.getBoundingClientRect().height > 0).map((a) => a.getAttribute("data-nav-entry")),
    collapsible: !!toggle,
    expanded: toggle?.getAttribute("aria-expanded") === "true",
  };
}));
let navGroups = await readNav();
const groupOf = (g) => navGroups.find((x) => x.group === g);
const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);

// A PROBE THAT READ NOTHING MUST NOT PASS. Every claim below is struck on this
// array, so an empty one would let all nine through by asserting over no input
// — `golden.mjs`'s rule, arriving through a selector.
check("the nav renders its groups structurally", navGroups.length > 0, navGroups.map((g) => g.group).join(" · "));

// *"change the hierarchy of these pages, Morning CIO then Portfolio Monitor and
//  then Private Market and then Polycab"* — Polycab led this group until now.
check("the Daily group is in the order the family asked for",
  same(groupOf("Daily")?.entries, ["/cio", "/monitor", "/private-market", "/polycab"]),
  groupOf("Daily")?.entries.join(" → "));

// *"remove exposure and IPS page from the dashboard UI"*. Its ALLOCATION group
// survives with two entries, so — unlike MONITOR, KNOWLEDGE and RESEARCH — a
// heading that vanished with it would be a second bug rather than the removal
// working. The two are separate claims and neither implies the other.
check("the Exposure & IPS nav entry is gone",
  !navGroups.some((g) => g.entries.includes("/exposure")) && !/Exposure\s*&\s*IPS/i.test(text));
check("...and the Allocation group it sat in survives, with its other entries",
  same(groupOf("Allocation")?.entries, ["/family", "/sectors"]),
  groupOf("Allocation")?.entries.join(" · "));

// *"move data audit page at the bottom of the left navigation bar just above
//  upload page selection button rather than at the top"* — both halves: the
// group is LAST, and Data Audit sits immediately above Upload History rather
// than merely somewhere below it.
check("Data Audit closes the nav, immediately above Upload History",
  navGroups.at(-1)?.group === "Admin" && same(navGroups.at(-1)?.entries, ["/audit", "/history"]),
  `${navGroups.at(-1)?.group}: ${navGroups.at(-1)?.entries.join(" → ")}`);
check("...and the now-empty Setup group heading went with it",
  !groupOf("Setup") && !/(^|\n)\s*SETUP\s*(\n|$)/.test(text));

// *"Move the following page buttons inside a drop down option ... labelled as
//  'Extras'"* — the four that were the whole of the TAX and ANALYTICS groups,
// and since #84 a FIFTH: Corporate actions & dividends, which that change filed
// under Extras beside Return & Drawdown. The family confirmed it stays there
// (Stage 10cj). This list still said four through the seven changes that landed
// after #84, and failed two rows on every run — a check that fails on a correct
// page is read as noise, and the next real failure goes unread beside it. ONE
// list, used by every row below, so the count cannot drift between them again.
const EXTRAS_PAGES = ["/capital-gains", "/performance", "/returns", "/corporate-actions", "/ledger"];
const extras = groupOf("Extras");
check("Extras is a group, and the only collapsible one",
  !!extras && extras.collapsible && navGroups.filter((g) => g.collapsible).length === 1,
  `${navGroups.filter((g) => g.collapsible).length} collapsible`);
check("...holding exactly the five pages it carries, in the order given",
  same(extras?.entries, EXTRAS_PAGES),
  extras?.entries.join(" · "));
check("...and the emptied Tax and Analytics headings went with their entries",
  !groupOf("Tax") && !groupOf("Analytics")
  && !/(^|\n)\s*TAX\s*(\n|$)/.test(text) && !/(^|\n)\s*ANALYTICS\s*(\n|$)/.test(text));
check("...sitting above Admin, so Data Audit and Upload History still close the nav",
  navGroups.findIndex((g) => g.group === "Extras") >= 0
  && navGroups.findIndex((g) => g.group === "Extras") < navGroups.findIndex((g) => g.group === "Admin"));
// IT IS A DROPDOWN: shut until asked, and none of the five clickable meanwhile.
check("Extras starts collapsed, with none of its five pages reachable",
  extras?.expanded === false && extras?.visible.length === 0,
  `${extras?.visible.length ?? "?"} visible`);

// *"after clicking on the drop down we should be able to select any of these
//  page buttons"* — the ask itself, struck on what a reader can click.
//
// A MISSING TOGGLE IS A FINDING, NEVER A CRASH. Reintroducing `collapsible =
// false` — the dropdown reverting to an ordinary group — is what showed why
// this needs a guard: two rows above failed correctly, then `.click()` threw on
// a locator matching nothing, the suite ABORTED, and every row after it never
// ran. Among those was "a page behind the dropdown still renders", which is the
// half a reader would actually be hurt by. So a missing toggle fails these two
// rows by name and lets the rest of the file run.
const extrasToggle = page.locator('[data-nav-group-toggle="Extras"]');
const hasExtrasToggle = (await extrasToggle.count()) > 0;
const clickExtras = async () => {
  if (!hasExtrasToggle) return;
  await extrasToggle.click();
  await page.waitForTimeout(250);
  navGroups = await readNav();
};
await clickExtras();
check("clicking Extras reveals all five page buttons",
  hasExtrasToggle && same(groupOf("Extras")?.visible, EXTRAS_PAGES),
  hasExtrasToggle ? groupOf("Extras")?.visible.join(" · ") : "no Extras toggle to click");
// ...AND IT IS A TOGGLE RATHER THAN A ONE-WAY REVEAL. Without this, a control
// that ignored its own state and simply rendered open would pass the row above.
await clickExtras();
check("...and clicking it again puts them away",
  hasExtrasToggle && groupOf("Extras")?.expanded === false && groupOf("Extras")?.visible.length === 0,
  hasExtrasToggle ? "" : "no Extras toggle to click");

// AND A PAGE BEHIND THE DROPDOWN IS STILL REACHABLE BY ADDRESS, WITH THE GROUP
// OPENING ITSELF. A reader following a link or a bookmark to /performance would
// otherwise land with the dropdown shut and NO ACTIVE ENTRY ANYWHERE in the
// nav, which reads as the page having left the app. It was just collapsed by
// hand two lines up, so this also proves the ROUTE re-opens it rather than a
// stored preference doing the work.
for (const to of EXTRAS_PAGES) {
  await page.goto(`${BASE}${to}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  navGroups = await readNav();
  const landed = new URL(page.url()).pathname;
  const main = (await page.locator("main").innerText()).trim();
  check(`a page behind the Extras dropdown still renders — ${to}`,
    landed === to && main.length > 200, `landed ${landed} · ${main.length} chars`);
  check(`...and opening it by address opens the dropdown with it — ${to}`,
    groupOf("Extras")?.expanded === true && groupOf("Extras")?.visible.includes(to),
    groupOf("Extras")?.visible.join(" · "));
}
// ── AND THE BUCKET MAPPING AND THE EXPORT HAVE NO SURFACE LEFT ─────────────
//
// What stood here read the family's seeded mapping back off Exposure & IPS
// (Equity → Growth, Cash → Liquidity, both showing a measured weight, the two
// unmapped classes named with their value) and then counted the Export and
// Import BUTTONS — struck on the buttons rather than on `/export/i`, because
// the paragraph beneath them explains what Export does and deleting the button
// outright had left the prose-matching version green.
//
// Both went with the page. The mapping is still stored, `bucketActuals` and
// `bucketWeightPct` still compute it, and `familyMath.test.ts` still asserts
// the arithmetic — but nothing renders any of it, so there is no rendering for
// a rendering suite to check. The claim that replaces them is the absence
// itself, asserted three ways and none implying another: the nav entry is gone
// (above), the address forwards to Sector Composition (below), and the page's
// own content renders nowhere (the block after that).

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
  // EXPOSURE & IPS was removed at the family's request. It forwards to SECTOR
  // COMPOSITION, which is the surviving surface nearest its purpose rather than
  // a neutral fallback: the bulk of what it DREW was a sector table over company
  // shares — mandate-chosen and own-bought alike — and that page draws the same
  // set on the same axis, through the same `isCompanyShare`.
  //
  // THESIS & TRIGGERS and ALERTS (Stage 10y) used to forward to /exposure, on
  // the reasoning that it was the last surface reaching a stored thesis or alert
  // rule. That reason expired with the page, so both are REPOINTED at the
  // dashboard home — and deliberately NOT sent on after /exposure to a sector
  // table, which holds nothing either page was about. This row cannot catch the
  // difference, for the reason the `/industry` row above records: chained, a
  // bookmark still LANDS somewhere and this suite reads only where. So the
  // decision is made in the route table and named in `App.tsx`.
  ["/exposure", "/sectors"], ["/thesis", "/cio"], ["/alerts", "/cio"],
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
// …AND THE FUND COUNT MOVED AGAIN, with the table: the page is one table now
// and its "Private funds" section band counts the funds and the folios behind
// them, where the old fund table's footer counted funds alone.
//
// ...AND THE ACCOUNTS COUNT IS NOW THE TILE'S HOVER. The family asked for the
// tiles to be a figure and one short line — "No one will read this on the
// dashboard" — so the coverage behind the figure rides in the tile's `title`,
// which `innerText` cannot see. Read it there rather than let this go on
// "passing" against text that is no longer on the page.
const valueHover = await page.$eval('[data-tile-slot="value"] [title]', (el) => el.getAttribute("title") ?? "")
  .catch(() => "");
check("the Private Market page still counts the funds and accounts it covers",
  /\d+ funds · \d+ folios · each holding counted once/i.test(text)
    && /across this page's \d+ private accounts · each holding counted once/i.test(valueHover),
  (/\d+ funds · \d+ folios/i.exec(text)?.[0] ?? "(no section count)") + " | "
    + (/across this page's \d+ private accounts/i.exec(valueHover)?.[0] ?? "(no hover on the value tile)"));
check("...and its header pills and lead paragraph stay removed",
  !/\d+ funds · \d+ accounts/.test(text)
  && !/\bSTATEMENT\s*·\s*as of/i.test(text)
  && !/Every private-market holding the statements in this drop report/i.test(text));
// The tile reads "Market value" now — the page is already the private one, so
// "Private market value" said "private" twice — and the claim is unchanged.
check("its private market value is a real measured figure, not the removed page's ₹0",
  /MARKET VALUE\s*\n?\s*₹[\d,.]+\s*(Cr|L)/i.test(text)
  && !/MARKET VALUE\s*\n?\s*₹0\b/i.test(text),
  /MARKET VALUE\s*\n?\s*(₹[\d,.]+\s*(?:Cr|L))/i.exec(text)?.[1]);
/**
 * THE TILE'S LABEL WAS THE CLIENT'S OWN QUESTION — *"Drawn against no valuation
 * means?"* — so it says what it is. The CLAIM is unchanged and is what this
 * asserts: that capital is stated on its own and is in no total on the page.
 *
 * IT IS STRUCK ON THE CARD, NOT ON THE TILE, AND THE TILE IS WHY. The strip is
 * four tiles a reader picks from eighteen now, so a metric outside the default
 * four is one the page legitimately does not draw — and a check reading its
 * label would fail a correct page. The card under the table carries the same
 * claim with MORE behind it (the accounts, and why each is unvalued), so the
 * claim is asserted there and the METRIC's continued existence is asserted by
 * opening the strip on it. Neither implies the other: a build that deleted the
 * metric passes the first, and one that dropped the card passes the second.
 */
// THE CARD IS A SECTION OF THE ONE TABLE NOW — *"if this is missing data this
// needs to be like a hidden drop down clearly marked"* — so the claim is struck
// on its band, which states the paid-in capital and that it is in no value
// total even while the section is folded.
check("the capital the family paid into funds that publish no NAV is stated on its own",
  /Not valued/i.test(text) && /missing data/i.test(text)
  && /₹[\d,.]+\s*(?:Cr|L) paid in is in no value total/i.test(text));

await page.goto(`${BASE}/private-market?tiles=unvalued`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const unvaluedTile = await page.locator("body").innerText();
// Struck on the SLOT, not only on its words: "never valued" is also the card's
// own heading under the table, so a text match would pass with no tile at all.
check("...and it is still one of the metrics a reader can put on a tile",
  (await page.locator('[data-tile-slot="unvalued"]').count()) > 0 && /NEVER VALUED/i.test(unvaluedTile));
await page.goto(`${BASE}/private-market`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
text = await page.locator("body").innerText();

// ── THE REMOVED PAGES LEFT NO PAGE BEHIND ───────────────────────────
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
  // EXPOSURE & IPS lands on Sector Composition, so the text read here is that
  // page's. Matched on the IPS EDITOR's own furniture and deliberately NOT on
  // "sector", "company shares", "market cap" or the excluded-class caption —
  // every one of which Sector Composition prints legitimately, and one of which
  // (`Sectors cover company shares`) was this page's own caption too. A phrase
  // the DESTINATION prints is not distinctive to the page that was removed,
  // which is the trap the `/alerts` row below already walked into once.
  ["/exposure", "Exposure & IPS", /IPS buckets|no target weights recorded|investment charter|which IPS bucket/i],
  // THESIS & TRIGGERS and ALERTS now land on MORNING CIO rather than on
  // Exposure & IPS, which has gone the same way. The patterns are unchanged and
  // the reason they were chosen still holds — each belongs to a removed editor
  // and to nothing that survives — but the page whose prose forced them to be
  // careful is itself gone now, so the caution below is history rather than a
  // live hazard. It is kept because the RULE it records is live: match a
  // removed page on its own content, never on a phrase its destination prints.
  ["/thesis", "Thesis & Triggers", /of \d+ recorded|not recorded|no schedule|exit triggers/i],
  // `alert rules` was in this pattern and FAILED a correct page: Exposure & IPS's
  // export tooltip listed what the file carries, "theses, alert rules" among them
  // — legitimately, because the export did carry them.
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

// Read the TABS off the DOM. The categories were a `<select>` until the family
// asked for them as tabs — "give tabs to me to click and quickly reach instead
// of a dropdown" — so each is a button carrying its section key, read by its
// own text rather than off page prose that also names these categories.
const categories = await page.$$eval("[data-section-filter] [data-section-tab]", (tabs) =>
  tabs.map((b) => (b.textContent || "").trim()));
check("the categories are tabs, and the dropdown is gone",
  categories.length > 1
    && (await page.$$eval("main select", (sels) => sels.filter((s) =>
      [...s.options].some((o) => /^All categories$/i.test((o.textContent || "").trim()))).length)) === 0,
  categories.join(" · "));
check("the category filter offers Direct Equity and PMS mandates as separate choices",
  categories.includes("Direct Equity") && categories.includes("PMS mandates"),
  categories.join(" · "));
check("...and no longer offers the retired 'Company Shares' category",
  categories.length > 0 && !categories.some((o) => /company shares/i.test(o)));

// Narrowing to the mandates must leave MANDATES on screen — one row per account,
// each standing for the shares inside it. A filter that returned 263 share rows
// would be the regrouping undone with the label still in place.
const catTab = page.locator('[data-section-filter] [data-section-tab="PMS mandates"]').first();
if (await catTab.count()) {
  await catTab.click();
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
  await page.locator('[data-section-filter] [data-section-tab="All"]').first().click();
  await page.waitForTimeout(600);
} else {
  check("filtering to PMS mandates lists mandates, one row each", false, "no category tab for PMS mandates");
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
// So the surviving surface is asserted here: a holding's own page still writes
// to the store, and — since Stage 10cl — Morning CIO's All alerts tab READS it.
//
// ── AND AN ALERT TYPED ON A HOLDING'S PAGE REACHES MORNING CIO (Stage 10cl) ──
//
// *"Does these alerts actually work … in morning CIO can you make an ALL alerts
// tab where … whenever the alerts which have been set are triggered they show."*
//
// That question is about WIRING, which is what this suite is for. The
// arithmetic is `priceAlerts.test.ts`'s and the rendering of a SEEDED store is
// `check:pages`'s, and neither can see a box that writes to a field the tab
// does not read. So a reader's whole path is driven here:
//
//   type a Target the price has passed and a Stop loss it has not → the boxes
//   say reached / watching → the store holds both, with the page's name → a
//   typed "abc" is refused and erases nothing → the card's own link opens
//   Morning CIO → All alerts → both rows, and the badge says 1 → one removed in
//   TWO clicks, never one → the badge goes → the pencil opens the holding's
//   boxes → the last level cleared → the store drops the entry (a name alone
//   does not keep it) → the tab is empty again → its finder offers only
//   holdings an alert can actually be checked on.
//
// ON A FUND THE PUBLISHED NAV PRICES, deliberately: that is committed data, so
// its alerts are checkable on a preview that serves no quote feed — which is
// exactly the state this suite runs in. A share's alert could only ever read
// "not checked" here, and a path that ends there proves nothing about the tab.
// The fund is DERIVED — the largest the committed NAV file may value — so the
// next drop picks its own.
{
  const src = readFileSync(new URL("../../src/data/glowData.ts", import.meta.url), "utf8");
  const navSrc = readFileSync(new URL("../../src/data/fundNavs.ts", import.meta.url), "utf8");
  const symbols = JSON.parse(readFileSync(new URL("../../src/data/nseSymbols.json", import.meta.url), "utf8"));
  const positions = bookArray(src, "BOOK_POSITIONS") ?? [];
  const navs = (bookArray(navSrc, "BOOK_FUND_NAVS") ?? []).filter((e) => e.usableForValue && e.nav > 0);
  const valueOf = (k) => positions.filter((p) => p.securityKey === k).reduce((s, p) => s + (Number(p.marketValue) || 0), 0);
  const held = (k) => positions.some((p) => p.securityKey === k && Number(p.quantity) > 0);
  const fund = navs.filter((e) => held(e.securityKey)).sort((a, b) => valueOf(b.securityKey) - valueOf(a.securityKey))[0];
  const STORE = "glow:watchlist/v1";
  const readStore = () => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) ?? "{}"); } catch { return {}; } }, STORE);
  const r2 = (x) => Math.round(x * 100) / 100;

  if (!fund) {
    check("a holding's page carries the price alerts card", false, "no fund in this book has a usable published NAV to drive the alert path on");
  } else {
    const key = fund.securityKey;
    const card = page.locator("[data-alerts-card]");
    await page.goto(`${BASE}/stock/${encodeURIComponent(key)}#alerts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    // THE CARD, STRUCTURALLY. The four levels an investor acts at lead, in the
    // order a reader meets them, and EVERY field the store holds is still on the
    // page — under More if not in the main row — because the store surviving is
    // only worth anything if a reader can still reach what they typed.
    const layout = await page.evaluate(() => {
      const c = document.querySelector("[data-alerts-card]");
      const more = c?.querySelector("[data-alert-more]");
      return c ? {
        main: [...c.querySelectorAll("[data-alert-box]")].filter((b) => !more?.contains(b)).map((b) => b.getAttribute("data-alert-box")),
        underMore: [...(more?.querySelectorAll("[data-alert-box]") ?? [])].map((b) => b.getAttribute("data-alert-box")),
        inputs: [...c.querySelectorAll("[data-alert-input]")].map((i) => i.getAttribute("data-alert-input")).sort(),
        plan: [...c.querySelectorAll("[data-plan-field]")].map((i) => i.getAttribute("data-plan-field")).sort(),
        note: !!c.querySelector("[data-alert-note]"),
        moreOpen: !!more?.open,
        price: c.querySelector("[data-alert-price]")?.getAttribute("data-alert-price") ?? null,
      } : null;
    });
    check("a holding's page carries the price alerts card", !!layout, key);
    check("...leading with Buy at, Sell at, Stop loss and Target, with Alert above one click down under More",
      !!layout && layout.main.join() === "entry,exit,below,target" && layout.underMore.join() === "above", layout ? `${layout.main} | ${layout.underMore}` : "");
    check("...and every field the store holds is still on the page — the five levels, fair value, the plan fields and the note",
      !!layout && layout.inputs.join() === "alertAbove,alertBelow,entryPrice,exitPrice,fairValue,targetPrice"
        && layout.plan.join() === "fairValueRefYear,targetWeightPct,valuationMethod" && layout.note,
      layout ? `${layout.inputs} · ${layout.plan}` : "");
    check("...with More closed on a holding where nothing under it is set", !!layout && layout.moreOpen === false);
    check("...and a fund's alerts are checked against its published NAV, with no quote feed at all",
      layout?.price === "nav", layout?.price ?? "no chip");

    // TYPE TWO LEVELS. Saved on Enter, exactly as a reader would.
    const target = r2(fund.nav * 0.95), stop = r2(fund.nav * 0.5);
    const typeLevel = async (field, v) => {
      await page.fill(`[data-alerts-card] [data-alert-input="${field}"]`, String(v));
      await page.press(`[data-alerts-card] [data-alert-input="${field}"]`, "Enter");
      await page.waitForTimeout(250);
    };
    await typeLevel("targetPrice", target);
    await typeLevel("alertBelow", stop);
    const boxState = (kind) => page.$eval(`[data-alerts-card] [data-alert-box="${kind}"]`, (b) => ({
      status: b.getAttribute("data-alert-status"), line: (b.querySelector("[data-alert-line]")?.textContent ?? "").trim(),
    })).catch(() => null);
    const tBox = await boxState("target"), sBox = await boxState("below");
    check("a Target the NAV has passed says so in its own box, as it is typed",
      tBox?.status === "reached" && /target reached/i.test(tBox.line), tBox ? `${tBox.status} · ${tBox.line}` : "");
    check("...and a Stop loss it has not reached says how far is still to go",
      sBox?.status === "watching" && /% to go/.test(sBox.line), sBox ? `${sBox.status} · ${sBox.line}` : "");
    let store = await readStore();
    const pageName = (await page.locator("main h1").first().innerText().catch(() => "")).trim();
    check("the store holds both levels, with the page's own name beside them",
      store[key]?.targetPrice === target && store[key]?.alertBelow === stop && !!store[key]?.name,
      store[key] ? `target ${store[key].targetPrice} · stop ${store[key].alertBelow} · "${store[key].name}" (page "${pageName}")` : "no entry");

    // A FUND HAS NO NSE SYMBOL, so Glow Central Research — which follows listed
    // companies by their ticker — cannot take its levels. They stay here, the
    // card says so in words, and NOTHING is sent (Stage 10cl).
    await page.waitForTimeout(1200);
    const fundLine = await page.$eval("[data-alerts-card] [data-research-status]", (el) => ({
      kind: el.getAttribute("data-research-status"), text: (el.textContent ?? "").trim(),
    })).catch(() => null);
    check("a fund's levels stay in this dashboard, and the card says why — no NSE symbol for Glow Central Research to follow",
      fundLine?.kind === "local" && /NSE symbol/.test(fundLine.text) && RESEARCH.posts.length === 0,
      fundLine ? `${fundLine.kind} · ${RESEARCH.posts.length} sent · "${fundLine.text}"` : "no line");

    // A TYPO IS REFUSED, NEVER SAVED AS A DELETE. The old parser read "abc" as
    // blank and silently erased whatever level was in the box.
    await typeLevel("exitPrice", 321);
    await typeLevel("exitPrice", "abc");
    const bad = await page.$eval('[data-alerts-card] [data-alert-box="exit"] [data-alert-line]', (el) => el.textContent ?? "").catch(() => "");
    store = await readStore();
    check("a typed 'abc' is refused with a message, and the level that was there is kept",
      /type a price/i.test(bad) && store[key]?.exitPrice === 321, `line "${bad.trim()}" · stored ${store[key]?.exitPrice}`);
    await page.fill('[data-alerts-card] [data-alert-input="exitPrice"]', "");
    await page.press('[data-alerts-card] [data-alert-input="exitPrice"]', "Enter");
    await page.waitForTimeout(250);
    store = await readStore();
    check("...and a blank box clears it", store[key]?.exitPrice === null, `stored ${store[key]?.exitPrice}`);

    // THE CARD'S OWN LINK OPENS THE TAB. Followed, not typed: a link that
    // pointed anywhere else would still leave this suite able to goto the tab.
    const link = card.locator('a[href="/cio?tab=alerts"]');
    check("the card links straight to Morning CIO → All alerts", (await link.count()) === 1);
    if (await link.count()) await link.first().click();
    else await page.goto(`${BASE}/cio?tab=alerts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const readTab = () => page.evaluate(() => ({
      path: location.pathname + location.search,
      rows: [...document.querySelectorAll("tr[data-alert-row]")].map((tr) => ({
        id: tr.getAttribute("data-alert-row"), status: tr.getAttribute("data-alert-status"), source: tr.getAttribute("data-alert-source"),
      })),
      badge: document.querySelector("[data-cio-alert-badge]")?.getAttribute("data-cio-alert-badge") ?? null,
      empty: !!document.querySelector("[data-alerts-empty]"),
    }));
    let tab = await readTab();
    const rowIds = (t) => t.rows.map((r) => `${r.id}=${r.status}/${r.source}`).join(", ");
    check("the All alerts tab shows both — the fired one first, checked on the NAV — and the badge counts it",
      tab.path === "/cio?tab=alerts"
        && rowIds(tab) === `${key}:target=reached/nav, ${key}:below=watching/nav` && tab.badge === "1",
      `${tab.path} · ${rowIds(tab)} · badge ${tab.badge}`);

    // REMOVING TAKES TWO CLICKS. One stray click must not delete a level the
    // family set — there is no undo.
    await page.click(`tr[data-alert-row="${key}:target"] [data-alert-remove]`);
    await page.waitForTimeout(200);
    tab = await readTab();
    const confirmShown = await page.locator(`tr[data-alert-row="${key}:target"] [data-alert-remove-confirm]`).count();
    check("one click on the cross asks, and removes nothing", confirmShown === 1 && tab.rows.length === 2);
    await page.click(`tr[data-alert-row="${key}:target"] [data-alert-remove-confirm]`);
    await page.waitForTimeout(300);
    tab = await readTab();
    store = await readStore();
    check("...the second removes that alert only, and the badge goes with it",
      rowIds(tab) === `${key}:below=watching/nav` && tab.badge === null && store[key]?.targetPrice === null && store[key]?.alertBelow === stop,
      `${rowIds(tab)} · badge ${tab.badge}`);

    // THE PENCIL OPENS THE HOLDING'S OWN BOXES, scrolled to them.
    await page.click(`tr[data-alert-row="${key}:below"] [data-alert-edit]`);
    await page.waitForTimeout(1200);
    const landed = await page.evaluate(() => {
      const c = document.querySelector("[data-alerts-card]");
      const top = c ? c.getBoundingClientRect().top : null;
      return { path: location.pathname, hash: location.hash, top, h: window.innerHeight };
    });
    check("the pencil opens the holding's alert boxes, scrolled into view",
      landed.path === `/stock/${encodeURIComponent(key)}` && landed.hash === "#alerts" && landed.top !== null && landed.top >= -2 && landed.top < landed.h,
      `${landed.path}${landed.hash} · card top ${landed.top}`);

    // WHAT IS UNDER MORE OPENS ITSELF once something there is set — nothing the
    // family typed is ever hidden — and a fair value says how far today's price
    // is from it.
    await page.evaluate(() => { const d = document.querySelector("[data-alerts-card] [data-alert-more]"); if (d) d.open = true; });
    await typeLevel("fairValue", r2(fund.nav * 1.2));
    const gap = await page.$eval("[data-alerts-card] [data-fair-value-gap]", (el) => el.textContent ?? "").catch(() => "");
    check("a fair value says how far today's price is from it", /\+\d+(\.\d)?% from today/.test(gap), gap.trim());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    check("...and More opens by itself on a holding where something under it is set",
      await page.$eval("[data-alerts-card] [data-alert-more]", (d) => d.open).catch(() => false));
    await typeLevel("fairValue", "");

    // CLEAR THE LAST LEVEL, AND THE ENTRY GOES. The name saved beside it is a
    // fallback label, never a reason to keep an empty entry alive.
    await page.click('[data-alerts-card] [data-alert-clear="below"]');
    await page.waitForTimeout(300);
    store = await readStore();
    check("clearing the last level drops the entry — the saved name alone does not keep it", !(key in store),
      key in store ? JSON.stringify(store[key]) : "gone");

    await page.goto(`${BASE}/cio?tab=alerts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    tab = await readTab();
    check("...and the All alerts tab is empty again, with no badge", tab.empty && tab.rows.length === 0 && tab.badge === null);

    // THE FINDER OFFERS ONLY WHAT AN ALERT CAN BE CHECKED ON: a holding the
    // quote feed can price, or one with a published NAV. An alert on an AIF
    // would sit there saying it can never be checked.
    const checkable = new Set([
      ...positions.filter((p) => p.symbol || symbols[p.securityKey]).map((p) => p.securityKey),
      ...navs.map((e) => e.securityKey),
    ]);
    await page.click("[data-alert-add-input]");
    await page.waitForTimeout(300);
    const offered = await page.$$eval("[data-alert-add-option]", (els) => els.map((e) => e.getAttribute("data-alert-add-option")));
    check("the New alert finder offers holdings, and only ones an alert can be checked on",
      offered.length > 0 && offered.every((k) => checkable.has(k)), `${offered.length} offered · ${offered.filter((k) => !checkable.has(k)).join(", ") || "none unchecked"}`);
    await page.press("[data-alert-add-input]", "Enter");
    await page.waitForTimeout(900);
    const to = await page.evaluate(() => location.pathname + location.hash);
    check("...and picking one opens that holding's alert boxes", !!offered[0] && to === `/stock/${encodeURIComponent(offered[0])}#alerts`, to);
  }
}

// ── A LEVEL ON A LISTED SHARE GOES TO GLOW CENTRAL RESEARCH (Stage 10cl) ───
//
// *"when the user puts target price inside the dashboard, it should
// automatically also go to the Glow Central Research dashboard."*
//
// The whole path, on a real listed holding: type a Target → it is SENT, as a
// `set` under the company's NSE symbol with the ISIN of the instrument that
// symbol is → the card says it is in Glow Central Research → with the receiving
// side not deployed yet, the next level is attempted and the card says it has
// not arrived AND why → a reload with the receiving side back sends it on its own
// → clearing the last level sends a CLEAR, so the other app stops alerting on it.
//
// The share is DERIVED — the largest company share whose symbol Upstox's own
// instrument map knows — so the next drop picks its own.
const RESEARCH_SHARE = (() => {
  const src = readFileSync(new URL("../../src/data/glowData.ts", import.meta.url), "utf8");
  const symbols = JSON.parse(readFileSync(new URL("../../src/data/nseSymbols.json", import.meta.url), "utf8"));
  const positions = bookArray(src, "BOOK_POSITIONS") ?? [];
  const symOf = (p) => p.symbol || symbols[p.securityKey] || null;
  const isinOf = (sym) => { const k = UPSTOX_INSTRUMENTS[sym]?.key; return k?.startsWith("NSE_EQ|") ? k.slice(7) : null; };
  const byKey = new Map();
  for (const p of positions) byKey.set(p.securityKey, [...(byKey.get(p.securityKey) ?? []), p]);
  const value = (k) => byKey.get(k).reduce((s2, p) => s2 + (Number(p.marketValue) || 0), 0);
  const share = [...byKey.keys()]
    .filter((k) => byKey.get(k).every((p) => p.assetClass === "Equity") && byKey.get(k).some((p) => Number(p.quantity) > 0))
    .map((k) => ({ key: k, ticker: byKey.get(k).map(symOf).find(Boolean) ?? null }))
    .filter((x) => x.ticker && isinOf(x.ticker))
    .sort((a, b) => value(b.key) - value(a.key))[0];
  if (!share) return null;
  const mark = byKey.get(share.key).find((p) => Number(p.currentPrice) > 0)?.currentPrice ?? 100;
  return { ...share, isin: isinOf(share.ticker), mark, name: byKey.get(share.key)[0].security };
})();
{
  const share = RESEARCH_SHARE;
  if (!share) {
    check("a level on a listed share goes to Glow Central Research", false, "no company share in this book has an NSE symbol Upstox's map knows");
  } else {
    const { key, ticker, isin, mark } = share;
    const r2 = (x) => Math.round(x * 100) / 100;
    const target = r2(mark * 1.5), stop = r2(mark * 0.6);
    const line = () => page.$eval("[data-alerts-card] [data-research-status]", (el) => ({
      kind: el.getAttribute("data-research-status"), ticker: el.getAttribute("data-research-ticker"), text: (el.textContent ?? "").trim(),
    })).catch(() => null);
    const typeLevel = async (field, v) => {
      await page.fill(`[data-alerts-card] [data-alert-input="${field}"]`, String(v));
      await page.press(`[data-alerts-card] [data-alert-input="${field}"]`, "Enter");
    };
    /** Wait for the sender: it pauses a moment after a save so a burst of edits goes as one request. */
    const settle = async (want) => {
      for (let i = 0; i < 40; i++) {
        const l = await line();
        if (l && want.includes(l.kind)) return l;
        await page.waitForTimeout(250);
      }
      return line();
    };

    await page.goto(`${BASE}/stock/${encodeURIComponent(key)}#alerts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const before = RESEARCH.posts.length;
    await typeLevel("targetPrice", target);
    const sent = await settle(["sent", "failed"]);
    const posted = RESEARCH.posts.slice(before).flatMap((p) => p.intents ?? []);
    const setOne = posted.find((i) => i.ticker === ticker);
    check("a Target typed on a listed share is sent to Glow Central Research as a SET, under its NSE symbol and ISIN",
      !!setOne && setOne.op === "set" && setOne.isin === isin && setOne.levels?.target === target
        && ["buyAt", "sellAt", "stopLoss", "alertAbove"].every((n) => setOne.levels?.[n] === null),
      setOne ? JSON.stringify(setOne) : `${posted.length} intents, none for ${ticker}`);
    check("...from this page's own address", RESEARCH.posts.slice(before).every((p) => p.origin === new URL(BASE).origin));
    check("...and the card says it is saved there too",
      sent?.kind === "sent" && sent.ticker === ticker && /Saved here and in Glow Central Research/.test(sent.text),
      sent ? `${sent.kind} · "${sent.text}"` : "no line");

    RESEARCH.mode = "down";
    await typeLevel("alertBelow", stop);
    const failed = await settle(["failed"]);
    check("with Glow Central Research not taking levels yet, the card says the new level has not arrived, and why",
      failed?.kind === "failed" && /not taking price levels yet/.test(failed.text) && /automatically/.test(failed.text),
      failed ? `${failed.kind} · "${failed.text}"` : "no line");

    RESEARCH.mode = "ok";
    await page.reload({ waitUntil: "networkidle" });
    const back = await settle(["sent"]);
    check("...and once it is back, the next page load sends it on its own",
      back?.kind === "sent" && RESEARCH.held.get(ticker)?.levels?.stopLoss === stop && RESEARCH.held.get(ticker)?.levels?.target === target,
      `${back?.kind ?? "no line"} · held ${JSON.stringify(RESEARCH.held.get(ticker)?.levels ?? null)}`);

    // AND THE MOMENT THE BROWSER IS BACK ONLINE — no reload, and no edit.
    RESEARCH.mode = "down";
    const stop2 = r2(mark * 0.55);
    await typeLevel("alertBelow", stop2);
    const failed2 = await settle(["failed"]);
    RESEARCH.mode = "ok";
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    const online = await settle(["sent"]);
    check("...and a browser coming back online sends what was waiting, with no reload and no edit",
      failed2?.kind === "failed" && online?.kind === "sent" && RESEARCH.held.get(ticker)?.levels?.stopLoss === stop2,
      `${failed2?.kind ?? "no line"} → ${online?.kind ?? "no line"} · held ${JSON.stringify(RESEARCH.held.get(ticker)?.levels ?? null)}`);

    const beforeClear = RESEARCH.posts.length;
    await page.click('[data-alerts-card] [data-alert-clear="target"]');
    await page.waitForTimeout(300);
    await page.click('[data-alerts-card] [data-alert-clear="below"]');
    await page.waitForTimeout(2000);
    const cleared = RESEARCH.posts.slice(beforeClear).flatMap((p) => p.intents ?? []);
    check("clearing the last level sends a CLEAR, so Glow Central Research stops alerting on it",
      cleared.some((i) => i.op === "clear" && i.ticker === ticker) && RESEARCH.held.get(ticker)?.state === "cleared",
      cleared.map((i) => `${i.op} ${i.ticker}`).join(", ") || "nothing sent");
    const after = await line();
    check("...and the card goes back to saying there is nothing saved", after?.kind === "none", after ? `${after.kind} · "${after.text}"` : "no line");
  }
}

// ── A SEND THAT FAILED IS TRIED AGAIN BY ITSELF, ON A TIMER (Stage 10cl) ───
//
// Until Glow Central Research's route is deployed every send is refused as NOT
// READY, and the sender asks again every fifteen minutes on its own — a
// dashboard left open all day must not need a reload for a level to arrive once
// the other side is up. Fifteen minutes cannot be waited out in a suite, so this
// page runs on Playwright's clock: the timers are the page's own, and the test
// moves time forward instead of sleeping. Its OWN browser context, so the fake
// clock touches nothing else in this run.
//
// Three claims, and the middle one is what stops a sender that retries in a
// tight loop from passing: a failed send is NOT repeated before its wait is up.
{
  const share = RESEARCH_SHARE;
  if (!share) {
    check("a failed send to Glow Central Research is tried again by itself", false, "no listed share to put a level on");
  } else {
    const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const p2 = await ctx2.newPage();
    let mode = "down";
    const posts = [];
    await p2.route(/glow-central-research\.tech-441\.workers\.dev/, async (route) => {
      const req = route.request();
      const cors = { "access-control-allow-origin": req.headers()["origin"] ?? "*", vary: "origin" };
      if (req.method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
      }
      let intents = [];
      if (req.method() === "POST") {
        try { intents = JSON.parse(req.postData() ?? "{}").intents ?? []; } catch { intents = []; }
        posts.push({ mode, intents });
      }
      if (mode === "down") {
        return route.fulfill({ status: 404, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ error: "Not implemented" }) });
      }
      const outcomes = intents.map((i) => ({ ticker: i.ticker, op: i.op, outcome: i.op === "seed" ? "seeded" : i.op === "clear" ? "unchanged" : "set" }));
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ ok: true, outcomes, companies: [], count: 0, hits: [] }) });
    });
    // A Target typed on this browser before it ever sent anything.
    const entry = {
      securityKey: share.key, watching: false, targetPrice: Math.round(share.mark * 150) / 100, fairValue: null,
      entryPrice: null, exitPrice: null, alertAbove: null, alertBelow: null, targetWeightPct: null,
      fairValueRefYear: "", valuationMethod: "", note: "", name: share.name, updatedAt: "2026-09-01T00:00:00.000Z",
    };
    await p2.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* */ } },
      ["glow:watchlist/v1", JSON.stringify({ [share.key]: entry })]);
    await p2.clock.install({ time: Date.parse("2026-09-23T04:00:00.000Z") });
    await p2.goto(`${BASE}/stock/${encodeURIComponent(share.key)}#alerts`, { waitUntil: "load" });
    const kind = () => p2.$eval("[data-alerts-card] [data-research-status]", (el) => el.getAttribute("data-research-status")).catch(() => null);
    /** Poll in REAL time, nudging the page's own clock half a second each turn. */
    const until = async (want, nudge = 500) => {
      for (let i = 0; i < 40; i++) {
        const k = await kind();
        if (want.includes(k)) return k;
        if (nudge) await p2.clock.runFor(nudge);
        await new Promise((r) => setTimeout(r, 150));
      }
      return kind();
    };
    const first = await until(["failed"]);
    const refused = posts.length;
    check("with Glow Central Research not taking levels yet, the first send is attempted and refused",
      first === "failed" && refused >= 1 && posts.every((p) => p.mode === "down"), `${first} · ${refused} request(s)`);

    await p2.clock.fastForward(10 * 60_000);
    await new Promise((r) => setTimeout(r, 1500));
    check("...and it is NOT asked again before its fifteen-minute wait is up — a refusal is never hammered",
      posts.length === refused && (await kind()) === "failed", `${posts.length - refused} more request(s) inside ten minutes`);

    mode = "ok";
    await p2.clock.fastForward(6 * 60_000);
    const later = await until(["sent"], 0);
    const landed = posts.filter((p) => p.mode === "ok").flatMap((p) => p.intents);
    check("...then, with Glow Central Research up, it goes by itself on the sender's own timer — no reload, no edit",
      later === "sent" && landed.some((i) => i.ticker === share.ticker && i.op === "seed" && i.levels?.target === entry.targetPrice),
      `${later} · ${landed.map((i) => `${i.op} ${i.ticker}`).join(", ") || "nothing sent"}`);
    await ctx2.close();
  }
}

// ── AN ENTITY'S HOLDINGS THIS BOOK CANNOT VALUE ARE NAMED, NOT DROPPED ─────
//
//   "Bharat Jaisinghani Trust looks empty on holdings, so check that as well
//    since the client has provided half of the statements already."
//
// The trusts hold three accounts each and ONE yields a valued position, so the
// page listed one row and said nothing about the other two — a Sky Capital
// angel folio whose fund publishes no NAV, and an HDFC Bank NSDL custody
// account holding 347 unlisted preference shares recorded at FACE VALUE. Both
// statements are IN HAND. Drawing nothing for them is right; saying nothing
// about them tells a reader the trust holds one thing.
//
// ── THE ENTITY IS DERIVED, NEVER TYPED ─────────────────────────────────────
//
// The suite reads the book's own account registry for the owner with the most
// accounts yielding no position, so the next drop picks its own worst case and
// a book where every account is valued abstains rather than failing on a name
// that stopped existing.
{
  const src = readFileSync(new URL("../../src/data/glowData.ts", import.meta.url), "utf8");
  const accounts = bookArray(src, "BOOK_ACCOUNTS") ?? [];
  const positions = bookArray(src, "BOOK_POSITIONS") ?? [];
  const held = new Set(positions.map((p) => p.accountId));
  const byOwner = new Map();
  for (const a of accounts) {
    if (held.has(a.accountId) || !a.owner) continue;
    byOwner.set(a.owner, [...(byOwner.get(a.owner) ?? []), a]);
  }
  // The entity with the MOST unvalued accounts is the worst case by
  // construction, and it must also HOLD something — an owner with no valued
  // position at all renders no holdings card for this one to sit under.
  const valued = new Set(positions.map((p) => accounts.find((a) => a.accountId === p.accountId)?.owner));
  const worst = [...byOwner.entries()].filter(([o]) => valued.has(o)).sort((a, b) => b[1].length - a[1].length)[0];
  if (!worst) {
    check("an entity's unvalued accounts are named", true, "(every account in this book yields a position)");
  } else {
    const [owner, unvalued] = worst;
    const id = accounts.find((a) => a.owner === owner)?.ownerId ?? "";
    await page.goto(`${BASE}/family?entity=${encodeURIComponent(id)}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    text = await page.locator("body").innerText();
    const rendered = await page.locator("[data-unvalued-account]").count();
    check(`${owner}'s ${unvalued.length} unvalued account(s) are named on the entity page`,
      rendered === unvalued.length, `rendered ${rendered}`);
    // EACH ONE SAYS WHAT IT HOLDS AND WHY IT CARRIES NO FIGURE — a list of
    // account numbers with no reason reads as a broken feed rather than as a
    // measured absence, which is this book's founding distinction.
    // The reason is the account line's HOVER since the family asked for the
    // notes around the tables to go — so it is read off the `title`, where a
    // reader finds it, and never off the page text it left.
    //
    // AN ACCOUNT THAT SENT ONLY A TRANSACTION STATEMENT IS PARTLY VALUED on the
    // live basis — its arbitrage and liquid funds at AMFI's NAV, the family's
    // cash — so its generated "values nothing" reason is replaced by a note
    // naming what is valued and what is not. Either sentence is a reason; what
    // must never happen is a listed account with neither.
    const reasons = await page.$$eval("[data-unvalued-account] [data-unvalued-reason]", (els) => els.map((e) => e.getAttribute("title") ?? ""));
    check("...each with its own reason",
      unvalued.every((a) => !a.noPositionsReason || reasons.some((r) => r.includes(a.noPositionsReason.slice(0, 60)))
        || (a.transactionsOnly === true && /partly valued/.test(text)
          && reasons.some((r) => r.includes("sent a transaction statement and no holding statement")))),
      `${reasons.length} reason(s) in hovers`);
    check("...in a hover rather than as a paragraph under each line",
      unvalued.every((a) => !a.noPositionsReason || !text.includes(a.noPositionsReason.slice(0, 60)))
        && !text.includes("sent a transaction statement and no holding statement"));
    // AND THE MONEY IS IN NO TOTAL. A contribution is what was PAID, never what
    // the stake is worth, and this card sits directly under one that sums.
    check("...and the card says none of it is in the value above",
      /None of these figures is in the/i.test(text));
  }
}

await browser.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
