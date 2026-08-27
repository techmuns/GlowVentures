// Walks every route and reports what a human would otherwise have to look for.
//
// Five checks, in the order they catch things:
//
//   1. console errors and page errors
//   2. failed network requests
//   3. HORIZONTAL PAGE OVERFLOW — the page body must never scroll sideways. A
//      wide table scrolls inside its own container; a table that pushes the body
//      wider takes the whole chassis with it, and at 1024 that is every table
//      this book has.
//   4. UNREMAPPED DARK UTILITIES IN LIGHT MODE — the light theme is a remap of
//      the dark ink-*/slate-* palette (see index.css). A class with no remap
//      keeps its DARK value, so a component written after the port paints a
//      near-black panel or a near-white hover on ivory. This resolves the
//      computed colour in the browser rather than grepping, so it catches the
//      ones no static list would.
//   5. "₹0" / "0.00%" on screen — a lead, not a verdict: a bar chart's ₹0 axis
//      tick and cash's genuinely-zero P&L both match, and both are correct.
//
// Themes: LIGHT is the default (`:root`), DARK is opt-in (`html.dark`). Both are
// walked, because every page rewritten since the port was written against
// whichever one the author happened to be looking at.
//
// Usage:  npm run build && npx vite preview --port 4173 &  then  npm run check:pages
//         WIDTHS=1440,1280,1024 npm run check:pages   (responsive sweep)
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const OUT = process.env.OUT ?? "docs/page-check";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
const WIDTHS = (process.env.WIDTHS ?? "1500").split(",").map(Number);
const SHOTS = process.env.SHOTS !== "0";
// The responsive sweep only needs LAYOUT, and waiting for networkidle means
// waiting out the feed retry rounds on every one of 45 combinations. `FAST=1`
// settles on load instead and skips the per-element contrast walk, which is the
// other expensive half.
const FAST = process.env.FAST === "1";
mkdirSync(OUT, { recursive: true });

/**
 * ── ONE ARRAY OUT OF THE GENERATED BOOK ──────────────────────────────────────
 *
 * `src/data/glowData.ts` is generated from `source/` and regenerates
 * byte-identically, so reading it here is a DERIVATION, not a second source for
 * a figure — the same reasoning as `MANDATE_PATH` being resolved from the link
 * the monitor draws rather than typed in. What it buys is an address: the fund
 * drill-down below has no link anywhere in the app to harvest one from, because
 * every `/mandate/` link in `src/` is gated on `isMandateHeld`.
 *
 * The array is sliced at its own closing line rather than by counting brackets:
 * a JSON string cannot contain a newline, so `\n];` is unambiguous, while a `[`
 * inside a security name is not. The TYPE annotation is why the slice starts at
 * `= [` — `Account[]` carries a bracket pair of its own.
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

/**
 * THE FUND FOLIO WHOSE DRILL-DOWN MUST REFUSE TO DRAW A CONSTITUENT LIST.
 *
 * `/mandate/:accountId` serves three branches and only one of them was ever
 * walked. The PMS branch rolls a manager's own shares up, which is legitimate
 * because the statement reports every one of them by name. A FUND folio is one
 * purchase of somebody else's portfolio and this book carries no look-through,
 * so that branch must SAY the companies inside are not reported — and an empty
 * holdings table there would read as a feed that failed, which is the one
 * failure the whole regrouping was asked to avoid.
 *
 * Chosen as the fund-route account carrying the most market value, resolved on
 * every run: a typed accountId would be a second source for a generated figure
 * and would keep "passing" by rendering the page's not-found state. The
 * engagement set MIRRORS `holdingRoute` in `src/lib/analytics.ts` and is the one
 * thing here that could drift from it — which is why the invariants assert the
 * page is the FUND branch rather than assuming it, so drift fails loudly.
 */
const FUND_ROUTE_ENGAGEMENTS = new Set(["AIF", "Distribution", "Advisory"]);
/**
 * THE OWNER WHOSE FAMILY DRILL-DOWN IS WALKED — resolved from the book, not typed.
 *
 * `/family`'s entity view is where a holding finally says WHO CHOSE IT, and until
 * this sweep none of it was reachable: the scope lived in component state, so the
 * sectioned table, the Held via column and the narrowed sector mix all sat behind
 * a click and no invariant could touch them. Reverting any of it would have left
 * this file reporting clean — the repo's own "a helper that returns the right
 * number into no caller looks exactly like a working feature", one layer up.
 *
 * The owner picked is the one holding shares through BOTH routes, because that is
 * the only entity on which the split can be wrong; among those, the largest. A
 * book that stops carrying such an owner FAILS these invariants rather than
 * skipping them.
 */
const FAMILY_ENTITY = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const accounts = bookArray(src, "BOOK_ACCOUNTS");
    const positions = bookArray(src, "BOOK_POSITIONS");
    if (!Array.isArray(accounts) || !Array.isArray(positions)) return null;
    const acc = new Map(accounts.map((a) => [a.accountId, a]));
    const byOwner = new Map();
    for (const p of positions) {
      const a = acc.get(p.accountId);
      if (!a || p.assetClass !== "Equity") continue;
      const e = byOwner.get(a.ownerId) ?? { mandate: 0, own: 0 };
      if (a.engagement === "PMS") e.mandate += Number(p.marketValue) || 0;
      else if (a.engagement === "Direct" || a.engagement === "Execution") e.own += Number(p.marketValue) || 0;
      byOwner.set(a.ownerId, e);
    }
    const both = [...byOwner].filter(([id, e]) => id && e.mandate > 0 && e.own > 0)
      .sort((x, y) => (y[1].mandate + y[1].own) - (x[1].mandate + x[1].own));
    return both[0]?.[0] ?? null;
  } catch { return null; }
})();

const FUND_ACCOUNT_ID = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const accounts = bookArray(src, "BOOK_ACCOUNTS");
    const positions = bookArray(src, "BOOK_POSITIONS");
    if (!Array.isArray(accounts) || !Array.isArray(positions)) return null;
    const mv = new Map(), rows = new Map();
    for (const p of positions) {
      mv.set(p.accountId, (mv.get(p.accountId) ?? 0) + (Number(p.marketValue) || 0));
      rows.set(p.accountId, (rows.get(p.accountId) ?? 0) + 1);
    }
    const funds = accounts
      .filter((a) => FUND_ROUTE_ENGAGEMENTS.has(a.engagement) && (rows.get(a.accountId) ?? 0) > 0)
      .sort((a, b) => (mv.get(b.accountId) ?? 0) - (mv.get(a.accountId) ?? 0)
        || String(a.accountId).localeCompare(String(b.accountId)));
    return funds[0]?.accountId ?? null;
  } catch { return null; }
})();

const ROUTES = [
  ["cio", "/cio"],
  ["monitor", "/monitor"],
  ["monitor-txns", "/monitor"],          // same route, Transactions toggle clicked
  // ...and the BY-ENTITY view of the same table, where every statement's row
  // shows as printed. Both of this book's duplicate holdings are AIF, so this is
  // the only view in which the AIF section's heading and the footer beneath it
  // can disagree — which they did, by the ₹3.17 Cr the footer correctly excludes.
  ["monitor-entity", "/monitor"],        // same route, By entity toggled
  // ...AND ONE MANDATE DRILL-DOWN, the page the family asked for three times: a
  // share a discretionary manager chose is shown inside that manager's mandate,
  // not beside the shares the family bought itself. Its ADDRESS IS RESOLVED FROM
  // THE MONITOR'S OWN LINK during this sweep — see `MANDATE_PATH`. Typing an
  // accountId here would be a second source for a generated figure, and a stale
  // one would still "pass" by rendering the page's not-found state.
  ["mandate", () => MANDATE_PATH ?? "/mandate/none-resolved-from-monitor"],
  // ...AND THE SAME ROUTE SERVING A FUND FOLIO, which is a different branch of
  // the same page and the one the family's request actually turns on. A PMS
  // rollup is a real look-through; an AIF folio has none, so that branch must
  // say the companies inside are NOT REPORTED rather than draw an empty
  // constituent table. Nothing in the app links to it — every `/mandate/` link
  // in `src/` is gated on `isMandateHeld` — so the address is resolved from the
  // generated book instead (see `FUND_ACCOUNT_ID`). A book that stops carrying
  // one fails these invariants rather than skipping them.
  ["mandate-fund", () => (FUND_ACCOUNT_ID ? `/mandate/${encodeURIComponent(FUND_ACCOUNT_ID)}` : "/mandate/none-resolved-from-the-book")],
  ["family", "/family"],
  // ...AND ONE ENTITY'S DRILL-DOWN, which is where the family's own complaint lands:
  // open a member and see, per row, whether they chose a holding or a manager did.
  // The owner is resolved from the book (see `FAMILY_ENTITY`) rather than typed, and
  // the scope now lives in the URL so this route can exist at all.
  ["family-entity", () => (FAMILY_ENTITY ? `/family?entity=${encodeURIComponent(FAMILY_ENTITY)}` : "/family?entity=none-resolved-from-the-book")],
  ["sectors", "/sectors"],
  ["compare", "/compare"],
  ["watchlist", "/watchlist"],
  // FOOS-spec preview pages — illustrative placeholders for spec layers whose
  // live source does not exist yet. Walked so their light-mode remaps, overflow
  // and any stray ₹0 are held to the same bar as every real page.
  ["knowledge", "/knowledge"],
  ["exposure", "/exposure"],
  ["macro", "/macro"],
  ["economy", "/economy"],
  ["thesis", "/thesis"],
  ["alerts", "/alerts"],
  ["stock", "/stock/aditya-birla-capital"],   // one company page — returns table, tools, research
  // ...AND ONE FUND PAGE, because the two must not render the same. A fund unit
  // has no price history, no PE, no filings and no insider trades, so the five
  // company panels are absent BY DECISION there. Walked as its own route so a
  // regression that puts them back is caught here rather than by the client.
  ["stock-fund", "/stock/sanshi-fund-i-open-ended-aif-cat-iii-class-e"],
  // ...AND ONE AIF REPORTED UNDER TWO MEMBERS. The drill-down for a holding two
  // family members' statements both carry is where "carry both, count once"
  // either reads correctly or contradicts itself on one screen: the pill said
  // "Held in 1 entity" over a table listing two, because a per-owner COUNT was
  // taken from the deduped set.
  ["stock-aif-dual", "/stock/360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii-distaif887"],
  ["capital-gains", "/capital-gains"],
  ["performance", "/performance"],
  ["returns", "/returns"],
  ["ledger", "/ledger"],
  ["audit", "/audit"],
  ["history", "/history"],
  ["upload", "/upload"],
];

// Requests that fail because this harness runs offline against a static preview:
// the web font CDN is unreachable, and /api/* are Cloudflare Pages Functions that
// only exist on the deployed site. Neither is an application error, and folding
// them in would bury the ones that are.
// `ratios` and `econ-calendar` join the list for the same reason as the rest:
// they are Pages Functions, `vite preview` does not run Functions, so they 404
// locally on every run and would otherwise be reported as an application fault
// on every sweep. They are exercised against the DEPLOYED site instead.
const ENVIRONMENT_NOISE = /fonts\.googleapis\.com|\/api\/(news|quotes|fx|announcements|insider|research|ratios|econ-calendar|prices|macro|economy)|ERR_CONNECTION_RESET|Failed to load resource/;

const ZEROISH = /(?:₹|Rs\.?\s?)0(?:\.00)?(?![\d.,])|\b0\.00\s?%|(?<![\d.])\b0\s?%/g;

// DATA INVARIANTS — the client's own data complaints, encoded so they cannot
// silently regress. Checked against the rendered page text on the primary
// theme/width. Each returns true when the page is CORRECT.
/**
 * A RUPEE-CRORE FIGURE OFF THE PAGE, WITH ITS THOUSANDS SEPARATOR.
 *
 * Every invariant below used `₹([\d.]+)\s*Cr`, which stops dead at a comma.
 * `fmtFromBase` has always grouped Indian-style — its own header comment gives
 * `₹1,606.8 Cr` as the format it exists to produce — so the moment this book
 * crossed ₹1,000 Cr the header chip rendered `₹13,061.6 Cr`, three invariants
 * read it as `13`, and all three failed against pages that were computing
 * correctly. That is the stale-literal failure one step abstracted: a check that
 * cannot read the figure it asserts on is worse than no check, because it fails
 * loudly on the wrong thing and sends the next session to fix the page.
 */
const CR = String.raw`₹([\d,]+(?:\.\d+)?)\s*Cr`;
/**
 * NaN FOR A MISSING MATCH, NEVER ZERO — because every caller guards on
 * `Number.isFinite` and would otherwise report confidence over no input.
 *
 * `Number(String(undefined ?? "").replace(...))` is `Number("")`, which is 0.
 * With that, the listed/private invariant found nothing on the page, compared
 * 0 + 0 against 0 and PASSED — a check that cannot see the figures it asserts
 * on reporting that they agree. The captures it replaced were written
 * `Number(… ?? NaN)` for exactly this reason and the reason had to survive the
 * rewrite. Same rule as `golden.mjs`'s BLOCKED: a suite that passes with no
 * input claims confidence nobody earned.
 */
const cr = (m) => (m == null ? NaN : Number(String(m).replace(/,/g, "")));
/** The same figure when `fmtFromBase` chose a smaller suffix. NaN in, NaN out. */
const crU = (n, unit) => cr(n) * (unit === "L" ? 0.01 : unit === "K" ? 0.0001 : 1);

/**
 * ── A THIRD OUTCOME: NOT CHECKED ─────────────────────────────────────────────
 *
 * An invariant returns true when the page is correct and anything falsy when it
 * is wrong. It returns THIS when the page is neither — when the figure it is
 * struck on is not on screen at all on this run, because the input behind it
 * does not exist here.
 *
 * The alternative is what the market-cap scope check used to do: fall back to
 * matching a sentence that renders whatever the data does, and report a pass.
 * `golden.mjs` already refuses that shape — BLOCKED and NOT CHECKED are counted
 * apart from both passes and failures, because "a test that passes with no
 * input claims confidence nobody earned". Failing instead would be the opposite
 * error: a check that is red on every offline run is a check the next session
 * deletes, and it would be red about a page that is rendering correctly.
 *
 * So it is printed by name, with the CAUSE — which is the whole value of it: a
 * reader of the report has to be able to tell "this run could not see it" from
 * "this ran and held". It does not count towards the exit code.
 */
const notChecked = (why) => ({ notChecked: why });

/**
 * ── THE HOLDINGS TABLE IS SECTIONED BY BUCKET, AND THE SECTIONS ARE READ HERE ──
 *
 * The family asked three times for one thing and the first two rounds answered
 * with a WORD. What they wanted was a GROUPING: a share a discretionary manager
 * chose belongs inside that mandate's row, and "Direct Equity" should mean what
 * the words say — shares the family bought itself. That landed, and these
 * helpers are how the invariants below check it on the RENDERED PAGE rather than
 * on a caption, which is the rule the first draft of the exposure check broke.
 *
 * A section heading is a colSpan row: no tab in it, its label uppercased by CSS,
 * and its own count/subtotal beside it. A DATA row is a table row and carries a
 * tab per column. Those two facts are the whole of what separates them, and both
 * come from the page's own structure rather than from a list of names.
 */
/**
 * EVERY LABEL `holdingBucket` CAN PUT OVER A SECTION, and this list is used to
 * find where one section ENDS — so a MISSING entry is the dangerous direction:
 * an unrecognised heading is not a boundary, and the section above it silently
 * swallows the rows below. "Equity — how it is held is not stated" is that case
 * exactly: it renders for a share whose account states no engagement, of which
 * this drop has none, which is precisely when its absence here is invisible.
 * "COMPANY SHARES" is gone because it is retired vocabulary — round two's
 * answer — and its return is asserted against on both monitor views.
 */
const BUCKET_HEADINGS = ["DIRECT EQUITY", "PMS MANDATES", "EQUITY — HOW IT IS HELD IS NOT STATED",
  "EQUITY", "ETF", "MUTUAL FUND", "AIF", "BOND", "STRUCTURED PRODUCT", "UNLISTED", "CASH"];
/**
 * innerText renders each flex item on its own line, so a heading is usually the
 * label alone — but that is a rendering detail, not a contract. Both forms are
 * accepted: the label on its own line, and the label with its `· N holdings ·
 * ₹X` span folded onto the same one.
 */
const headingIs = (line, label) => {
  // A trailing cell separator is a rendering artefact, not a column: strip it
  // before deciding whether this line is a table ROW or a heading over one.
  const s = line.replace(/\t+$/, "").trim();
  return !s.includes("\t") && (s === label || s.startsWith(label + " ·"));
};
const isAnyHeading = (line) => BUCKET_HEADINGS.some((h) => headingIs(line, h));
/** A rendered table row: one tab per column boundary, and this table has 13. */
const isDataRow = (line) => (line.match(/\t/g) ?? []).length >= 5;
/**
 * One section of the holdings table: its heading block, its body, and the data
 * rows drawn inside it. `null` when the heading is not on the page at all —
 * which every caller treats as a FAILURE, never as nothing to check.
 */
function sectionOf(text, label) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => headingIs(l, label));
  if (at < 0) return null;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) if (isAnyHeading(lines[i])) { end = i; break; }
  const block = lines.slice(at, end);
  return {
    // The heading plus its sibling spans (count, subtotal, and the notes about a
    // measured nil or a collapsed duplicate) — never a data row.
    head: block.filter((l) => !isDataRow(l)).slice(0, 5).join("\n"),
    body: block.join("\n"),
    rows: block.filter(isDataRow),
  };
}
/** `· N holdings · ₹X` off a section heading, in crore. */
function headingCount(head) {
  const m = /·\s*([\d,]+)\s*holdings?\s*·\s*₹([\d,.]+)\s*(Cr|L|K)?/i.exec(head ?? "");
  return m ? { holdings: cr(m[1]), mv: crU(m[2], m[3]) } : null;
}
/**
 * A MANDATE ROW, which is an ACCOUNT and not a security. Its sub-line is the
 * one the manager, the account number and the constituent count are printed on,
 * and it is the line the row's figures hang off — so finding it is how the
 * checks tell a rolled-up mandate from a share that leaked in beside one.
 */
const MANDATE_SUBLINE = /^(.+?)\s+·\s+account\s+(\S+)\s+·\s+(\d+)\s+holdings?\b/;
const mandateRowsIn = (body) => (body ?? "").split("\n")
  .map((l) => MANDATE_SUBLINE.exec(l))
  .filter(Boolean)
  .map((m) => ({ manager: m[1].trim(), accountNo: m[2], holdings: Number(m[3]) }));

/**
 * WHAT `/monitor` PRINTED ABOUT EACH MANDATE, so the drill-down can be checked
 * against it. Two pages showing two counts for one account is the contradiction
 * this whole regrouping exists to remove, and it cannot be caught inside either
 * page on its own. The routes run in order in one process, `monitor` first.
 *
 * Empty is never a pass: the mandate route's invariant requires an entry for the
 * account it is rendering, so a monitor that stops printing mandate rows fails
 * on both pages rather than quietly passing on one.
 */
const MANDATE_ROWS = new Map();
/**
 * The mandate drill-down's own address, DERIVED from the link the monitor draws
 * rather than typed in here. A hardcoded accountId is a second source for a
 * generated figure — it would go stale the first drop that renames an account,
 * and it would still "pass" by rendering the page's not-found state.
 */
let MANDATE_PATH = null;

const INVARIANTS = {
  // "on the dashboard there's only one asset class" — the CIO allocation must
  // surface more than equity, and state the listed/private split.
  cio: [
    ["allocation shows more than one asset class (AIF + MF/Cash)", (t) => /\bAIF\b/.test(t) && /(Mutual Fund|Cash)/.test(t)],
    ["listed/private split is shown, not 'no private holdings'", (t) => /Private\s*₹/.test(t) && !/no private holdings/.test(t)],
    /**
     * ALLOCATION IS GROUPED BY HOW THE FAMILY HOLDS THE BOOK, and both halves of
     * that are asserted because either alone can pass on the wrong page.
     *
     * The family asked three times for this. Rounds one and two changed the WORD
     * ("Equity" -> "Direct Equity" -> "Company Shares") and neither fixed it,
     * because what they were reporting was that a share a manager picked and a
     * share they bought themselves sat in one row. Round three said so plainly.
     * So the check is that BOTH rows exist and each carries a value — a label
     * with no holdings behind it is the empty vehicle-split row this line was
     * originally written against.
     */
    ["allocation has a Direct Equity row AND a PMS mandates row, each with a value",
      (t) => /Direct Equity[\s\S]{0,400}?₹[\d,.]+\s*(?:Cr|L|K)/.test(t)
        && /PMS mandates[\s\S]{0,400}?₹[\d,.]+\s*(?:Cr|L|K)/.test(t)],
    ["'Company Shares' is gone from the allocation", (t) => !/Company Shares/.test(t)],
    /**
     * A RETURN IS STRUCK ONLY WHERE THE COST SIDE COVERS THE ROW.
     *
     * After the regroup, Direct Equity reports a cost for 9 of its 38 holdings,
     * so a return on cost read **−18.9%** in a row printing ₹1.22 Cr invested
     * and ₹12,446.1 Cr current. Every figure was right on its own terms and the
     * three together were indefensible. The row uses the footer's own 0.5% test
     * now, and this asserts it on the RENDERED page rather than on the helper:
     * for every allocation row, either its three cells reconcile, or its return
     * is an em dash.
     */
    ["every allocation row's return ties to its own Invested and Current, or is absent", (t) => {
      const rows = [...t.matchAll(/₹([\d,.]+)\s*(Cr|L|K)?\s*\t?\s*₹([\d,.]+)\s*(Cr|L|K)?\s*\t?\s*([+-]\d+\.\d)%/g)];
      if (!rows.length) return true;   // layout changed; the other invariants still bind
      const u = (n, s) => cr(n) * (s === "L" ? 0.01 : s === "K" ? 0.0001 : 1);
      return rows.every((m) => {
        const inv = u(m[1], m[2]), cur = u(m[3], m[4]), pct = Number(m[5]);
        if (!Number.isFinite(inv) || !Number.isFinite(cur) || !inv) return false;
        return Math.abs(((cur - inv) / inv) * 100 - pct) <= 1.0;
      });
    }],
    // THE AIF WAS DOUBLE-COUNTED INTO NAV, and this is the guard against it
    // returning. It used to read "ties to ~₹335 Cr … not ₹5xx Cr" — a copy of a
    // figure the book GENERATES, written when the book was ₹335.43 Cr. The
    // August drop moved it to ₹461.00 Cr and this line failed against a page
    // computing correctly, which is the same stale-literal failure the household
    // net-worth check had. A test carrying its own copy of a generated figure is
    // a second source for it.
    //
    // So the RELATION is what is asserted, and it is the one the bug actually
    // broke: the NAV tile's own caption splits the book by asset class, and
    // double-counting the AIF puts value in the headline that is in neither
    // half. Listed + Private must reconstruct the headline.
    ["NAV = its own listed + private split (the AIF is not counted twice)", (t) => {
      const nav = cr(new RegExp(String.raw`consolidated nav[\s\S]{0,60}?` + CR, "i").exec(t)?.[1]);
      const listed = cr(new RegExp(String.raw`Listed\s*` + CR, "i").exec(t)?.[1]);
      const priv = cr(new RegExp(String.raw`Private\s*` + CR, "i").exec(t)?.[1]);
      return [nav, listed, priv].every(Number.isFinite) && Math.abs(listed + priv - nav) <= 0.6;
    }],
    // THE +99% REGRESSION, GUARDED ON THE RENDERED PAGE.
    //
    // This tile shipped reading "+99.0% XIRR" — arithmetically correct (₹78.8 Cr
    // to ₹99.4 Cr over 132 days is +28.3%, and compounding 0.36 of a year onto a
    // full one gives 99%) and indefensible, because the managers' own annualised
    // since-inception returns for these accounts run about 7% to 31%.
    // `moneyWeightedReturn` refuses to annualise a sub-year window; these assert
    // that the refusal reaches the SCREEN, which is the only place it matters.
    // TILE LABELS ARE UPPERCASED BY CSS, so innerText returns "MONEY-WEIGHTED
    // RETURN". Every pattern here is case-insensitive — a case-sensitive one
    // fails on a page rendering perfectly, which is worse than no test. The
    // same lesson is already recorded in check-family-inputs.mjs.
    ["the money-weighted tile states its window and its coverage", (t) => {
      const i = t.search(/money-weighted return|XIRR \(annualised\)/i);
      if (i < 0) return false;
      const tile = t.slice(i, i + 240);
      return /\d+-day window/.test(tile) && /\d+ of \d+ accounts/.test(tile);
    }],
    // A rate is only ever labelled "annualised" alongside a window of at least a
    // year. Anything else is the extrapolation coming back.
    ["no sub-year window is presented as an annualised rate", (t) => {
      const i = t.search(/money-weighted return|XIRR \(annualised\)/i);
      if (i < 0) return false;
      const tile = t.slice(i, i + 240);
      const days = Number(/(\d+)-day window/.exec(tile)?.[1] ?? NaN);
      if (!Number.isFinite(days)) return false;
      return days >= 365 ? /annualised/i.test(tile) : /not annualised/i.test(tile);
    }],
    // And the belt-and-braces version: no triple-digit return anywhere in the
    // KPI strip. Every honest figure this book can produce today is well under
    // it, so a hit here is an extrapolation by any route.
    ["no triple-digit return in the KPI strip", (t) => {
      const strip = t.slice(0, t.search(/Allocation by asset class/i) + 1 || 2000);
      return !/[+-]\s?\d{3,}(\.\d+)?\s*%/.test(strip);
    }],
    // And the allocation table's own footer must tie to its own two columns —
    // it carried a money-weighted rate in a column of return-on-cost figures,
    // so Invested and Current printed one answer and the Total cell another.
    ["the allocation total ties to its own Invested and Current columns", (t) => {
      const row = new RegExp(String.raw`Total\s+` + CR + String.raw`\s+` + CR + String.raw`\s+([+-])([\d.]+)%`).exec(t);
      if (!row) return true;   // layout changed; the other invariants still bind
      const [, inv, cur, sign, pct] = row;
      const expect = ((cr(cur) - cr(inv)) / cr(inv)) * 100;
      return Math.abs((sign === "-" ? -Number(pct) : Number(pct)) - expect) <= 0.6;
    }],
  ],
  // "why are 70% holdings in unclassified" — and then, after the private book
  // was excluded, why Unclassified was STILL 49% with a mutual fund at its head.
  // A GICS sector is a property of a company; the page is direct equity only,
  // and every excluded class must be NAMED with its value rather than dropped.
  sectors: [
    ["sector view is company shares only, the excluded classes named", (t) => /company shares only/i.test(t) && /excluded rather than folded in/i.test(t)],
    // The failure this replaced: a fund standing at the head of a sector table.
    // No wrapper may appear as a holding here at all.
    ["no fund wrapper appears as a sector holding", (t) => !/(Flexi Cap Fund|Sanshi Fund|Opportunities Strategy|Founders Fund|Liquid ?Bees)/i.test(t)],
  ],
  // "in the portfolio monitor I can see all kinds of investments being mixed" —
  // holdings are sectioned by BUCKET (who chose the position), the sections must
  // reconstruct the footer, and the by-security total counts each `dedupeGroup`
  // once. The NAV is asserted as a RELATION against the header chip, never as a
  // literal: this line used to carry "₹335.43 Cr" and the book has moved twice
  // since — a check carrying its own copy of a generated figure is a second
  // source for it.
  monitor: [
    /**
     * ── THE THIRD ROUND: A GROUPING, NOT A WORD ──────────────────────────────
     *
     * "We are mixing AIF investments and Direct Equity holdings. Any stock held
     * through an AIF or PMS should be shown inside that AIF/PMS drill-down."
     * The model never mixed them — every AIF folio has always been its own AIF
     * row — but ₹127 Cr of shares a discretionary manager chose sat in the same
     * section as the ₹12,446 Cr the family bought itself, under a heading that
     * two rounds of relabelling could not make honest. Both words were true of
     * SOME of what was under them and neither was true of all of it.
     *
     * So the table sections on `holdingBucket` now, and these assert it where a
     * reader forms the belief: on the rendered rows. The FIRST DRAFT OF THE
     * EXPOSURE CHECK matched a caption's prose and could not fail, which is why
     * every one of these is struck on structure or on figures the page prints.
     */
    ["holdings are sectioned into Direct Equity and PMS mandates",
      (t) => !!sectionOf(t, "DIRECT EQUITY") && !!sectionOf(t, "PMS MANDATES")],
    ["the Direct Equity section states its own holding count and subtotal",
      (t) => { const s = sectionOf(t, "DIRECT EQUITY"); return !!s && !!headingCount(s.head) && s.rows.length > 0; }],
    /**
     * "COMPANY SHARES" WAS THE SECOND ROUND'S ANSWER AND IT IS RETIRED HERE.
     * It is a true statement about the asset — a manager-chosen share IS a
     * company share, which is why `isCompanyShare` stays and why Sector
     * Composition, Exposure & IPS and Compare still count every one of them —
     * and it is the wrong question for a HOLDINGS TABLE, whose reader is asking
     * who decided. Case-insensitive on purpose: the heading is uppercased by
     * CSS, so a case-sensitive test would miss the exact regression it exists
     * to catch. (That lesson is already recorded on the CIO tile checks.)
     */
    ["'Company Shares' appears nowhere on this page", (t) => !/company\s+shares/i.test(t)],
    ["the class filter reads 'All categories'", (t) => /All categories/.test(t) && !/All asset classes/.test(t)],
    /**
     * NOTHING MANDATE-HELD MAY STAND UNDER DIRECT EQUITY — asserted three ways,
     * each on a different piece of what the page draws, because the one thing a
     * leaked share does NOT carry is a label saying it leaked.
     *
     * A mandate ROW is identifiable: it prints `<manager> · account <no> · N
     * holdings` under its name and carries a "PMS mandate" pill. Neither may
     * appear between the Direct Equity heading and the next one. And the manager
     * names are harvested FROM THE PMS SECTION rather than typed here, so this
     * cannot go stale when a manager arrives or leaves.
     */
    ["no mandate row stands inside the Direct Equity section", (t) => {
      const de = sectionOf(t, "DIRECT EQUITY");
      if (!de) return false;                          // heading gone → nothing checked is nothing passed
      return mandateRowsIn(de.body).length === 0 && !/\bPMS mandate\b/.test(de.body);
    }],
    ["no manager named in the PMS section appears under Direct Equity", (t) => {
      const de = sectionOf(t, "DIRECT EQUITY");
      const pms = sectionOf(t, "PMS MANDATES");
      if (!de || !pms) return false;
      const managers = [...new Set(mandateRowsIn(pms.body).map((m) => m.manager))];
      if (managers.length === 0) return false;        // the PMS section drew no mandate row
      return managers.every((m) => !de.body.includes(m));
    }],
    // Struck on the RENDERED ROWS, not on the caption: a fund name appearing
    // between the Direct Equity heading and the next class heading is a wrapper
    // sitting among the shares, whatever the heading above it says. Same list of
    // this book's own fund names the sector check uses.
    ["no fund unit stands inside the Direct Equity section", (t) => {
      const de = sectionOf(t, "DIRECT EQUITY");
      if (!de) return false;                          // heading gone → the checks above fail too
      return !/(Flexi Cap Fund|Sanshi Fund|Opportunities Strategy|Founders Fund|Liquid ?Bees|Amritkaal|Delphi Equity|Neo Infra|Baring Private|Transition Venture|India SME|Rising Titans|Hedged Equity)/i.test(de.body);
    }],
    /**
     * ── THE PMS SECTION IS A ROLL-UP OF ACCOUNTS, AND IT RECONSTRUCTS ITSELF ──
     *
     * Every row in it must be a MANDATE, and the heading's holding count must be
     * the sum of what each of those rows says it stands for. That second half is
     * the one that binds: if the regrouping came undone and the constituent
     * shares were drawn as their own rows again, there would be no `· account N
     * · M holdings` sub-lines to sum and this fails with nothing to add. If a
     * mandate silently dropped its constituents, the sum falls short of the
     * heading. Neither number is written here — both are read off the page.
     */
    ["every row in the PMS section is a mandate, not a share", (t) => {
      const pms = sectionOf(t, "PMS MANDATES");
      if (!pms) return false;
      const rows = mandateRowsIn(pms.body);
      return rows.length >= 2 && rows.length === pms.rows.length;
    }],
    ["the PMS heading's holding count is the sum of its mandates' own counts", (t) => {
      const pms = sectionOf(t, "PMS MANDATES");
      const head = headingCount(pms?.head);
      if (!pms || !head) return false;
      const rows = mandateRowsIn(pms.body);
      if (rows.length === 0) return false;
      const constituents = rows.reduce((n, r) => n + r.holdings, 0);
      // A roll-up that stands for no more than it draws is not a roll-up. Today
      // it is 281 shares across 10 rows; the relation is asserted, not the pair.
      return constituents === head.holdings && constituents > rows.length;
    }],
    // ...and each of those rows is a way IN. A mandate a reader cannot open is
    // a section that hides 271 positions instead of filing them.
    ["every mandate row links to its own drill-down", (t, ctx) => {
      const pms = sectionOf(t, "PMS MANDATES");
      if (!pms) return false;
      const rows = mandateRowsIn(pms.body);
      const links = new Set((ctx?.hrefs ?? []).filter((h) => /^\/mandate\/./.test(h)));
      return rows.length > 0 && links.size === rows.length;
    }],
    // AND THE SECTIONS MUST ADD UP TO THE FOOTER. A reader who sums the four
    // headings and lands somewhere other than the Total row has found the
    // contradiction this book's own rule says no caption rescues — and the
    // heading subtotal is the one place it could happen, because BOTH of this
    // book's duplicates are AIF holdings: in the by-entity view the AIF heading
    // summed ₹3.17 Cr that the (deduped) footer beneath it correctly did not.
    ["the class subtotals reconstruct the footer total", (t) => {
      const unit = (n, u) => Number(n.replace(/,/g, "")) * (u === "L" ? 0.01 : u === "K" ? 0.0001 : 1);
      const parts = [...t.matchAll(/·\s*\d+\s*holdings?\s*·\s*₹([\d.,]+)\s*(Cr|L|K)?/gi)]
        .map((m) => unit(m[1], m[2]));
      const total = /Total\s*·\s*\d+\s*rows\s*₹[\d.,]+\s*(?:Cr|L|K)?\s*\S*\s*₹([\d.,]+)\s*(Cr|L|K)?/.exec(t);
      if (!parts.length || !total) return false;     // no input is never a pass
      const sum = parts.reduce((a, b) => a + b, 0);
      return Math.abs(sum - unit(total[1], total[2])) <= Math.max(0.6, parts.length * 0.05);
    }],
    // The by-security total must count each dedupeGroup once. Asserted against
    // the CONSOLIDATED NAV IN THE HEADER, which is on every page and is the
    // deduped figure by construction — not against a literal, and not against
    // the specific wrong number one drop happened to produce.
    // A NON-MATCH FAILS HERE, it does not pass. The first draft returned true
    // when its regex found nothing, which is a check that reports confidence
    // over no input — the same thing `golden.mjs` refuses to do with BLOCKED.
    // The row is "Total · 164 rows  ₹394.1 Cr  —  ₹461 Cr  …", and the ₹461 Cr
    // must be the header chip's consolidated NAV: that figure is deduped by
    // construction, so a by-security table that double-counts a dually-reported
    // holding cannot match it.
    ["by-security total counts each dedupeGroup once", (t) => {
      const nav = cr(new RegExp(CR).exec(t)?.[1]);   // header chip, first on the page
      const total = cr(new RegExp(String.raw`Total\s*·\s*\d+\s*rows\s*₹[\d,.]+\s*Cr\s*\S*\s*` + CR).exec(t)?.[1]);
      return Number.isFinite(nav) && Number.isFinite(total)
        && Math.abs(total - nav) <= Math.max(0.6, nav * 0.002);
    }],
  ],
  // The by-entity view of the holdings table. Every statement's row shows as
  // printed here, so this is where "carry both, count once" is visible — and
  // where the class heading above the rows must still be on the footer's basis.
  "monitor-entity": [
    ["the by-entity view still sections into Direct Equity, PMS mandates and the wrappers",
      (t) => !!sectionOf(t, "DIRECT EQUITY") && !!sectionOf(t, "PMS MANDATES") && !!sectionOf(t, "AIF")],
    // A mandate row is one account's statement already, so the by-entity toggle
    // — which splits a CONSOLIDATED security back into the statements that
    // reported it — must leave the mandates rolled up exactly as they were.
    // This is where a "show every statement's row" switch would most plausibly
    // unroll them, so it is asserted on the view where the risk lives.
    ["the mandates stay rolled up when every statement's row is shown", (t) => {
      const pms = sectionOf(t, "PMS MANDATES");
      const head = headingCount(pms?.head);
      if (!pms || !head) return false;
      const rows = mandateRowsIn(pms.body);
      return rows.length >= 2 && rows.length === pms.rows.length
        && rows.reduce((n, r) => n + r.holdings, 0) === head.holdings;
    }],
    ["'Company Shares' appears nowhere on this page either", (t) => !/company\s+shares/i.test(t)],
    // THE SAME RECONSTRUCTION AS THE BY-SECURITY VIEW, and the one that binds:
    // the section subtotal used to be a raw sum of the displayed rows, so the
    // headings added to ₹3.17 Cr more than the (consolidated) footer beneath.
    ["the class subtotals reconstruct the footer total", (t) => {
      const unit = (n, u) => Number(n.replace(/,/g, "")) * (u === "L" ? 0.01 : u === "K" ? 0.0001 : 1);
      const parts = [...t.matchAll(/·\s*\d+\s*holdings?\s*·\s*₹([\d.,]+)\s*(Cr|L|K)?/gi)]
        .map((m) => unit(m[1], m[2]));
      const total = /Total\s*·\s*\d+\s*rows\s*₹[\d.,]+\s*(?:Cr|L|K)?\s*\S*\s*₹([\d.,]+)\s*(Cr|L|K)?/.exec(t);
      if (!parts.length || !total) return false;
      const sum = parts.reduce((a, b) => a + b, 0);
      return Math.abs(sum - unit(total[1], total[2])) <= Math.max(0.6, parts.length * 0.05);
    }],
    // ...and a subtotal that counts less than the rows above it says so, rather
    // than leaving the reader to find the difference by adding the column.
    ["a section that collapses a duplicate names what it collapsed",
      (t) => /reported twice, counted once/i.test(t)],
  ],
  // Audit: the per-entity money-weighted return must be measured over accounts
  // that carry an opening portfolio value only. Closing an owner's WHOLE market
  // value against partial openings produced +147% / +2,624% p.a. for real family
  // members. A de-annualised to-date figure here never reaches four digits, so a
  // 4-digit percentage anywhere on these pages is the blow-up regressing.
  /**
   * THE ENTITY DRILL-DOWN — the page the family's complaint actually lands on.
   *
   * Every invariant here is struck on a FIGURE OR A STRUCTURE THE PAGE RENDERS.
   * The first draft of the exposure checks matched a caption's prose and could not
   * fail; these have to break when the grouping is reverted, which is the only
   * reason to write them.
   */
  "family-entity": [
    // The two routes are separate headings, and a mandate names itself between them.
    ["the drill-down sections by route, not by asset class alone",
      (t) => /DIRECT EQUITY/i.test(t) && /PMS MANDATES/i.test(t)],
    /**
     * EVERY ROW UNDER A MANDATE CARRIES THAT MANDATE'S NAME IN A CELL.
     *
     * THE FIRST DRAFT OF THIS CHECK COULD NOT FAIL, and it is worth recording how,
     * because it is the very failure this file warns about two blocks up. It tested
     * `/HELD VIA/i` against the page text — and the page also CAPTIONS the table
     * with "Which of the two chose a name is in the Held via column below". So the
     * caption satisfied the check. Renaming the actual column header to "Route" and
     * re-running reported clean.
     *
     * This one is struck on STRUCTURE instead: inside the PMS mandates section, the
     * mandate sub-headings name the mandates, and EVERY money row between them must
     * carry one of those names as a cell. Delete the route column and the rows stop
     * carrying it, whatever the prose around them says.
     */
    ["every row under a mandate names its mandate, per row and not once in a caption", (t) => {
      const from = t.search(/PMS MANDATES/i);
      if (from < 0) return false;                       // no input is never a pass
      const rest = t.slice(from);
      const lines = rest.split("\n").map((l) => l.trim()).filter(Boolean);
      // A sub-heading is the line that names an account; the line under it is its
      // provider/holdings/value line. Collect the mandate names from the headings.
      const names = [];
      for (let i = 0; i < lines.length; i++) {
        if (/account\s+\S+\s*·/i.test(lines[i]) && i > 0) names.push(lines[i - 1]);
      }
      if (!names.length) return false;
      // Money rows in this region: tab-separated, carrying a rupee figure.
      const rows = lines.filter((l) => l.includes("\t") && /₹/.test(l) && !/^Total\b/i.test(l));
      if (!rows.length) return false;
      const named = rows.filter((r) => names.some((n) => r.includes(n)));
      // Rows below the PMS section belong to later sections and legitimately carry
      // no mandate, so this asks that the mandate rows dominate the region rather
      // than that every line does — and it breaks the moment the column goes.
      return named.length >= Math.max(5, Math.floor(rows.length * 0.4));
    }],
    /**
     * A MANDATE SUB-HEADING CARRIES ITS ACCOUNT AND ITS OWN TOTAL, so a reader can
     * tell two apart: four of this book's ten mandates share a strategy name with
     * another, because one strategy runs for two family members.
     */
    ["a mandate sub-heading names its account and its own value",
      (t) => new RegExp(String.raw`account\s+\S+\s*·[^\n]*?` + CR).test(t)],
    /**
     * THE SECTOR MIX EXCLUDES THE WRAPPERS AND NAMES THEM WITH A VALUE — a fund has
     * no GICS sector, so folding one in invents a slice. Struck on the FIGURE the
     * caption carries, not on the sentence around it.
     */
    ["the sector mix names what it excluded, with a value",
      (t) => new RegExp(CR + String.raw`[^\n]{0,120}?excluded rather than folded in`, "i").test(t)
        || new RegExp(String.raw`excluded rather than folded in[^\n]{0,200}?` + CR, "i").test(t)],
  ],

  family: [
    ["no per-entity XIRR blow-up (4-digit %)", (t) => !/[+-]?\d{4,}(\.\d+)?\s*%/.test(t)],
  ],
  // Exposure & IPS sector GAP and market-cap bands are DIRECT-EQUITY views, and
  // every class they leave out is named with its value.
  //
  // These asserted "listed book" for a long time, which passed while the page
  // was still wrong: excluding only the PRIVATE classes kept ₹52.4 Cr of
  // mutual-fund units in the sector table (as "Unclassified") and in the
  // market-cap card's unmeasured bucket, where they reported a permanent
  // shortfall against a market cap a fund can never have. The wording moved
  // with the fix so the check cannot pass on the old, weaker claim.
  exposure: [
    // THE FIRST DRAFT OF THIS ONE COULD NOT FAIL, which is worse than not having
    // it. It matched the caption's PROSE — "direct equity", "excluded rather
    // than folded in" — and that prose is static: reverting the filter to
    // `!isPrivateClass` put Cash and ₹52.4 Cr of mutual funds straight back into
    // the sector table and the check still passed. Both invariants below are
    // struck on FIGURES THE PAGE RENDERS, so a filter that widens moves one side
    // and not the other.
    /**
     * AND THIS PAGE DELIBERATELY DOES NOT REGROUP. The holdings tables now file
     * a manager-chosen share inside its mandate; a SECTOR table must not, because
     * a share Carnelian picked has a GICS sector, a market cap, an NSE symbol and
     * a concall exactly like one the family bought. Narrowing here to own-held
     * shares would throw ₹127 Cr of real exposure out of the family's sector
     * picture over a question — who decided — that a sector table does not ask.
     * A look-through into a mandate is a GAIN for exposure analysis.
     */
    ["sector GAP covers company shares by both routes, the non-equity classes named",
      (t) => /company shares/i.test(t) && /excluded rather than folded in/i.test(t)],
    /**
     * THE FIGURE THAT PROVES IT, rather than the sentence that claims it: the
     * caption states the covered set and then splits it by ROUTE, and the two
     * (three where an engagement is unstated) must reconstruct the covered
     * total. Narrow this page to own-held shares and the mandate figure goes to
     * zero while the covered total falls with it — this fails on the first,
     * before the reader ever has to notice the second.
     */
    ["the covered set's mandate/own split reconstructs it — mandate-held shares are counted", (t) => {
      const covered = cr(new RegExp(String.raw`Sectors cover company shares \(` + CR + String.raw`\)`, "i").exec(t)?.[1]);
      // Each half is either a figure or the page's own explicit "none" wording.
      // A missing clause is NOT read as zero: that would let the mandate half
      // vanish from the caption and still pass.
      const half = (rx, none) => (none.test(t) ? 0 : cr(rx.exec(t)?.[1]));
      const mandate = half(
        new RegExp(CR + String.raw` of it was chosen by a discretionary manager`, "i"),
        /no holding in it is run under a discretionary mandate/i);
      const own = half(
        new RegExp(String.raw`and ` + CR + String.raw` was bought in the family.s own demat`, "i"),
        /none of it was bought in the family.s own account/i);
      const otherM = new RegExp(String.raw`with ` + CR + String.raw` in accounts whose statements do not state`, "i").exec(t);
      const other = otherM ? cr(otherM[1]) : 0;       // the clause renders only when it is non-zero
      if (![covered, mandate, own].every(Number.isFinite)) return false;
      return mandate > 0                              // this book holds ₹127 Cr of them
        && Math.abs(mandate + own + other - covered) <= Math.max(0.6, covered * 0.002);
    }],
    // The caption states what the table COVERS and what it EXCLUDES from two
    // independent computations. They must reconstruct the header's consolidated
    // NAV. Widening the covered set moves the first and leaves the second, and
    // the sum then overshoots by exactly the classes counted twice (₹180.8 +
    // ₹339.4 = ₹520.2 against a ₹461 Cr book).
    ["covered + excluded reconstructs the consolidated NAV", (t) => {
      const nav = cr(new RegExp(CR).exec(t)?.[1]);           // header chip, first on the page
      const covered = cr(new RegExp(String.raw`Sectors cover company shares \(` + CR + String.raw`\)`, "i").exec(t)?.[1]);
      const excluded = cr(new RegExp(String.raw`The other ` + CR + String.raw` is excluded`, "i").exec(t)?.[1]);
      return [nav, covered, excluded].every(Number.isFinite)
        && Math.abs(covered + excluded - nav) <= Math.max(0.6, nav * 0.002);
    }],
    // And a class the caption NAMES as excluded may not stand as a row in the
    // table above it. Cash did, under its own "Cash" sector, while the sentence
    // underneath said it had been left out.
    ["no class named as excluded appears as a sector row", (t) => {
      const i = t.search(/SECTOR\s+VALUE/i);
      const j = t.search(/Sectors cover company shares/i);
      if (i < 0 || j <= i) return false;
      const table = t.slice(i, j);
      const named = /is excluded rather than folded in:([\s\S]*?)\. A fund is a wrapper/i.exec(t)?.[1] ?? "";
      const classes = [...named.matchAll(/of ([A-Za-z][A-Za-z ]*?)(?=,| and |$)/g)].map((m) => m[1].trim());
      if (classes.length === 0) return false;
      return classes.every((c) => !new RegExp(`(^|\n)${c}\t`, "i").test(table));
    }],
    /**
     * ── THE BANDS SIT ON THE SAME SET AS THE SECTOR TABLE, AND IT IS COUNTED ──
     *
     * Every share in a company, however it came to be held — the holdings table
     * one link away uses "Direct Equity" for the narrower half, and two surfaces
     * using one phrase for two sets is exactly what the last two rounds of this
     * complaint were.
     *
     * THIS CHECK COULD NOT FAIL AND THAT IS WHY IT IS REWRITTEN. It matched
     * "struck on company shares" / "struck on every share in a company the
     * family owns" and "direct-equity section of the holdings tables" — and
     * BOTH branches of the card carry those words, the live one in its caption
     * and the absent one in its `needs`. Narrowing `mcapExposure`'s input from
     * `isCompanyShare` to `isDirectEquity` would drop ₹127 Cr of mandate-held
     * shares out of the bands and this would still have reported clean. It is
     * the defect the exposure block's own header records having fixed once,
     * reintroduced on the card next door.
     *
     * So it is struck on the card's OWN TWO FIGURES: what carries a market cap
     * plus what does not is the whole set the bands are drawn over, and that
     * must reconstruct the covered total the sector caption above it prints.
     * Narrow the input and the two sides part company by the mandate-held value.
     *
     * AND WHEN THE FEED DOES NOT ANSWER, THIS IS NOT CHECKED — never passed.
     * `Position.marketCap` comes from the quote feed and from nowhere else (the
     * book carries no such field), so in this offline harness `mcap.measured`
     * is 0, the card renders its declared absent state and neither figure is on
     * screen. There is nothing to compare, and reporting a pass over no input
     * is what `golden.mjs` refuses to do with BLOCKED. It is reported NOT
     * CHECKED with the cause named, and it binds — and fails — the moment the
     * page is walked against a live feed:
     *
     *     GLOW_PASSWORD='…' node scripts/dev/live-api-proxy.mjs   # → :4174
     *     BASE=http://127.0.0.1:4174 npm run check:pages
     *
     * The sector half of the same set IS guarded offline, by the mandate/own
     * reconstruction above — so what is unchecked here is precisely a filter
     * narrowed on the market-cap card alone.
     */
    ["market-cap bands cover the sector table's own company-share set, reconstructed from the card's two figures", (t) => {
      const covered = cr(new RegExp(String.raw`Sectors cover company shares \(` + CR + String.raw`\)`, "i").exec(t)?.[1]);
      const priced = /Of that book,\s*₹([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?\s*carries a market cap from the quote feed/i.exec(t);
      if (!priced) {
        // The card is in one of its two declared absent states, both of which
        // print no figure. Say WHICH — a reader of this report has to be able
        // to tell a feed that did not answer from a card that broke.
        const why = /Still measuring/i.test(t)
          ? "the quote feed had not settled when the page was read"
          : /No company share carries a market cap/i.test(t)
            ? "no quote resolved for any name, so the card renders its absent state and neither figure is on screen (this harness serves no /api/quotes — walk it against scripts/dev/live-api-proxy.mjs to bind this)"
            : null;
        // Neither absent state and no live caption either: the card rendered
        // something this check cannot read, which IS a failure.
        return why ? notChecked(why) : false;
      }
      const measured = crU(priced[1], priced[2]);
      // The "and ₹Y does not" clause renders only when something is unpriced.
      // Absent, the unmeasured side is zero — and if the clause were DELETED
      // while names went unpriced, `measured` alone would fall short of the
      // covered total and this fails, which is the guard that makes reading the
      // absence as zero safe here.
      const un = new RegExp(String.raw`and ₹([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?\s*does not \(\d+ names?`, "i").exec(t);
      const unmeasured = un ? crU(un[1], un[2]) : 0;
      if (![covered, measured, unmeasured].every(Number.isFinite)) return false;
      return Math.abs(measured + unmeasured - covered) <= Math.max(0.6, covered * 0.002)
        // ...and the card still says which set that is, so a narrowing that
        // rewrote the caption to match is caught on the words as well.
        && /direct-equity section of the holdings tables/i.test(t);
    }],
    // Phase 5: the IPS is an editor now. With NO family input recorded — which is
    // this harness's state — every gap must be absent and the page must say why.
    // A gap computed against a defaulted target is a fabricated instruction.
    ["IPS is recordable and the gap stays absent until a target is set",
      (t) => /IPS buckets/i.test(t) && /No target weights recorded yet/i.test(t)],
  ],
  // Phase 5: alerts evaluate real rules. With no rules recorded the page must say
  // so plainly — never render an empty list that reads as "nothing is wrong".
  alerts: [
    ["no-rules state is explicit, not an empty all-clear", (t) => /No rules yet/i.test(t) || /firing|clear|cannot be evaluated/i.test(t)],
    ["alerts needing a source are named, not shown as silent rules", (t) => /need a source, not a threshold/i.test(t)],
  ],
  // Phase 5: the thesis record is an editor over the book's holdings, and an
  // expected return is never inferred from the actual sitting beside it.
  thesis: [
    // Asserts the DEFAULT (collapsed) state — the per-row editor fields only
    // exist once a row is expanded, so testing for them here tested nothing.
    ["thesis is an editor over real holdings, with a recorded count",
      (t) => /\d+ of \d+ recorded/i.test(t) && /Thesis/i.test(t) && /Review/i.test(t)],
    ["an expected return is never inferred from the actual beside it",
      (t) => /Expected/i.test(t) && /Return \(actual\)/i.test(t)],
  ],
  // Phase 3: the company page draws a real price chart and a returns table from
  // /api/prices. In this headless run the edge function does not exist, so the
  // card must degrade to a NAMED absence — never to the old "a chart is
  // impossible" claim, which stopped being true when the series arrived.
  stock: [
    ["price card resolves or names its absence", (t) => /Price history & returns/i.test(t)],
    ["the retired 'no chart is possible' claim is gone", (t) => !/four-row|no path to plot/i.test(t)],
    // A COMPANY keeps every panel. This is the other half of `stock-fund` below:
    // suppressing the research block on an asset class must not creep into the
    // pages it belongs on.
    ["a company page still carries its research panels", (t) => !/not applicable to/i.test(t)],
    /**
     * WHO CHOSE THE POSITION, ON THE PAGE THAT NAMES IT.
     *
     * The family opened Jammu Kashmir Bank, read "direct equity" and saw two
     * lines down that Carnelian manages it. The asset class was never wrong —
     * they are shares in a bank — but the page was asserting a second thing it
     * had no business asserting, and its own table contradicted it. Both halves
     * are checked: the route must be stated, and the word "direct" must not be
     * used for shares a discretionary manager picked.
     */
    ["the page states how the position is held, not just what it is",
      (t) => /via (manager's mandate|own account|fund vehicle)/i.test(t) && /Held via/i.test(t)],
    /**
     * THE WORD IS BACK, AND THIS NAME MUST NOT CARRY IT. `/stock/aditya-birla-
     * capital` is held by Carnelian under a discretionary mandate — the same
     * shape as the Jammu & Kashmir Bank page the family opened to report this.
     * Now that "Direct Equity" means own-held shares, printing it here would be
     * the original complaint restored, and this time it would be false rather
     * than merely ambiguous.
     */
    ["a manager-chosen holding is never called direct",
      (t) => !/direct equity/i.test(t)],
    /**
     * ...AND THE ANSWER TO "WHO CHOSE IT" IS A PLACE, NOT AN ADJECTIVE. The
     * mandate is named above the fold and linked, because "a manager chose this"
     * with no way to see what else that manager chose is half an answer — and
     * because the drill-down is where the family asked for the share to live.
     * The link is read off the DOM rather than the text: prose saying a mandate
     * exists is not a route to it.
     */
    ["a mandate-held share names its mandate and links to the drill-down",
      (t, ctx) => /Held through .{0,24}discretionary mandate/i.test(t)
        && (ctx?.hrefs ?? []).some((h) => /^\/mandate\/./.test(h))],
  ],
  /**
   * ── THE MANDATE DRILL-DOWN, THE PAGE THE FAMILY ACTUALLY ASKED FOR ─────────
   *
   * "Any stock held through an AIF or PMS should be shown inside that AIF/PMS
   * drill-down … Jammu Kashmir Bank … should appear inside the Carnelian
   * Bespoke Portfolio drill-down." This route is that page, and the address is
   * RESOLVED FROM THE MONITOR'S OWN LINK rather than typed in — a hardcoded
   * accountId would be a second source for a generated figure, and worse, it
   * would keep "passing" by rendering the page's own not-found state.
   *
   * A PMS rollup is legitimate because the family owns each share and the
   * manager only picked it, so the statement reports every one by name. An AIF
   * folio is one purchase of somebody else's portfolio and no look-through
   * exists — so nothing here asserts a constituent list for a fund, and the
   * `mandate-fund` block below asserts the REFUSAL instead. That branch had no
   * test at all while the not-found branch had two, which is the wrong way
   * round: an empty holdings table under a fund's name is the failure this
   * whole page was built to avoid, and nothing was watching for it.
   */
  mandate: [
    ["the route resolves to a real mandate, not the not-found state",
      (t) => !/Mandate not found/i.test(t) && !/This account is not a PMS mandate/i.test(t)],
    ["it names its manager, its account number and how the account is run",
      (t) => /Run by\s+\S[^\n]*\bfor\b/i.test(t) && /·\s*account\s+\S+/i.test(t) && /manager's mandate/i.test(t)],
    /**
     * MORE THAN ONE HOLDING, AND THE COUNT AGREES WITH THE ROWS DRAWN. The KPI,
     * the headline and the table are three renderings of one number; a page
     * where they disagree is the "Held in 1 entity" pill over a two-row table
     * all over again, and the specific figure is the one a reader believes.
     */
    ["it lists more than one holding, and every count agrees with the rows drawn", (t) => {
      const lines = t.split("\n");
      const h = lines.findIndex((l) => /^SECURITY\tSECTOR\tQTY\b/i.test(l));
      if (h < 0) return false;
      const foot = lines.findIndex((l, i) => i > h && /^Total(\t|\s*\(whole mandate\))/.test(l));
      if (foot < 0) return false;
      const drawn = lines.slice(h + 1, foot).filter(isDataRow).length;
      const kpi = cr(/^HOLDINGS\n([\d,]+)/m.exec(t)?.[1]);
      const headline = cr(/([\d,]+)\s+holdings the manager runs/i.exec(t)?.[1]);
      return drawn > 1 && kpi === drawn && headline === drawn;
    }],
    /**
     * THE TOTAL TIES TO THE MANAGER'S OWN STATEMENT. This is the check that
     * keeps the whole regrouping honest: the mandate's cash sleeve is bucketed
     * WITH it precisely so that the rows add to the figure the document prints,
     * and if they ever stop, something has been moved that should not have been.
     * Both figures come off this page — no literal — and the LIVE-basis escape
     * is the page's own sentence, not a widened tolerance.
     */
    ["the Total ties to the account's own statement total", (t) => {
      const foot = new RegExp(String.raw`^Total\b[^\n]*₹([\d,.]+)\s*(Cr|L|K)?\s*100\.0\s?%`, "m").exec(t);
      const stmt = /₹([\d,.]+)\s*(Cr|L|K)?\s+is\s+this account.s own statement total/i.exec(t);
      if (!foot || !stmt) return false;
      const [total, printed] = [crU(foot[1], foot[2]), crU(stmt[1], stmt[2])];
      if (![total, printed].every(Number.isFinite)) return false;
      if (Math.abs(total - printed) <= 0.005) return true;
      // On LIVE basis the Total has moved and the statement figure has not. The
      // page must say so; a silent difference is a total that ties to nothing.
      return /The Total shown is .* because live prices are applied/i.test(t);
    }],
    /**
     * AND IT AGREES WITH THE MONITOR ROW THAT LINKS HERE. Two pages printing two
     * counts for one account is the contradiction no caption rescues, and it is
     * invisible inside either page — so it is checked across them. An empty
     * capture FAILS: a monitor that stopped drawing mandate rows must not make
     * this pass by leaving nothing to compare.
     */
    ["the holding count agrees with the mandate row on Portfolio Monitor", (t) => {
      const acct = /·\s*account\s+(\S+)/.exec(t)?.[1];
      const headline = cr(/([\d,]+)\s+holdings the manager runs/i.exec(t)?.[1]);
      const seen = acct ? MANDATE_ROWS.get(acct) : undefined;
      return !!seen && Number.isFinite(headline) && seen.holdings === headline;
    }],
    // A drill-down whose Security column is a dead end sends the reader back to
    // the table they came from. Each constituent keeps its own page.
    ["each constituent still links to its own company page",
      (t, ctx) => (ctx?.hrefs ?? []).filter((h) => /^\/stock\/./.test(h)).length > 1],
  ],
  /**
   * ── THE SAME ROUTE, SERVING A FUND FOLIO ──────────────────────────────────
   *
   * `/mandate/:accountId` has three branches. The PMS one is walked above; the
   * not-found one is asserted here and again in `check-family-inputs.mjs`; this
   * one — a fund folio — had nothing, and it is the branch the family's request
   * actually turns on. *"AIF holdings must be shown inside the respective AIF
   * page drill down"* is answered by a page that says the underlying companies
   * are NOT REPORTED to this book. An empty `SECURITY / SECTOR / QTY` table
   * there would read as a feed that failed, and a fund falling through to the
   * PMS layout would read as a look-through nobody has.
   *
   * The address is `FUND_ACCOUNT_ID`, resolved from the generated book on every
   * run — nothing in `src/` links to it, because every `/mandate/` link is
   * gated on `isMandateHeld`. If it resolves to nothing, or to an account that
   * is not on the fund route, these fail rather than skipping.
   */
  "mandate-fund": [
    ["the address resolved to a fund folio this book carries, not the not-found state",
      (t) => !/Mandate not found/i.test(t) && !/No account "/i.test(t)],
    // The page's own words for what it is — and the assertion that keeps the
    // engagement set in `FUND_ROUTE_ENGAGEMENTS` honest: an `own`-route account
    // renders the same heading and NOT the fund paragraph below, so drift in
    // that mirror of `holdingRoute` fails on the next line rather than quietly
    // testing the wrong branch.
    ["it says plainly that this account is not a PMS mandate",
      (t) => /This account is not a PMS mandate/i.test(t)],
    /**
     * THE ABSENCE NAMES ITS OWN CAUSE. Not "no data" — the fund reports one
     * line, the companies underneath are the MANAGER'S holdings, and joining
     * them would need that scheme's own portfolio disclosure. A reader who is
     * told which document is missing can go and ask for it.
     */
    ["...and names the cause: one purchase of a manager's portfolio, its companies not reported here",
      (t) => /no constituent list to show here/i.test(t) && /not\s+reported to this book/i.test(t)],
    /**
     * AND NO CONSTITUENT TABLE IS DRAWN, EMPTY OR OTHERWISE. Struck on the
     * page's own structure — the holdings table's header row and the PMS
     * headline — rather than on the sentences above, which is the rule the
     * exposure card's first draft broke: a page that started rendering an empty
     * table would keep every sentence above and still be wrong.
     */
    ["no constituent table is drawn for a folio with no look-through",
      (t) => !/^SECURITY\tSECTOR\tQTY/im.test(t) && !/holdings the manager runs/i.test(t)],
    /**
     * WHAT THE STATEMENT DOES CARRY IS SHOWN, AND THE COUNT AGREES WITH THE
     * ROWS. Refusing the look-through must not turn into refusing the folio:
     * the lines the fund does report are named, each links to its own page, and
     * the number in the sentence is checked against the links actually drawn —
     * the "Held in 1 entity" over a two-row table failure, one page over.
     */
    ["the lines the statement does carry are named, counted and linked", (t, ctx) => {
      // The dash class is permissive and the FIGURES are not: a reworded
      // separator must not fail a page that is rendering the right numbers.
      const m = /What the statement does carry\s*[—–-]\s*(?:(one) line|(\d+) lines),\s*₹([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?\s*in all/i.exec(t);
      if (!m) return false;                          // no input is never a pass
      const named = m[1] ? 1 : Number(m[2]);
      const links = (ctx?.hrefs ?? []).filter((h) => /^\/stock\/./.test(h)).length;
      return Number.isFinite(named) && named > 0 && named === links && Number.isFinite(crU(m[3], m[4]));
    }],
  ],
  // The same route serving a FUND. `/stock/:securityKey` is right to serve every
  // holding — an AIF folio's quantity, cost, entities and ledger belong on a page
  // of their own — but the company research underneath does not apply, and five
  // dashed panels under a fund's name read as five failed feeds rather than one
  // decided absence. Asserted on the page, because the reason a card is empty is
  // the only thing separating "the feed is down" from "this can never be filled".
  "stock-fund": [
    ["a fund page states the company research does not apply", (t) => /not applicable to/i.test(t)],
    ["...and does not render the five company panels",
      (t) => !/Ratio analysis|Street estimates|Annual reports|52-week range|Insider trades/i.test(t)],
    // A fund's `sector` is "Unclassified" in the model, which is true and reads
    // on screen as a sector nobody assigned rather than a property it lacks.
    ["a fund's missing sector is explained, not shown as Unclassified",
      (t) => /a fund holds many/i.test(t)],
  ],
  // The AIF drill-down for a holding reported under two members. "AIF holdings
  // must be shown inside the respective AIF page drill down" — so every
  // statement carrying this name has a row here, and the page's own count of
  // them must agree with the rows it renders.
  "stock-aif-dual": [
    // THE COUNT AGAINST THE ROWS, not against a literal — this book's entity
    // count for this folio is a generated figure and a copy of it here would be
    // a second source for it. The bug was exactly this disagreement: a pill
    // reading 1 above a table listing 2.
    ["the entity count agrees with the account rows rendered", (t) => {
      const pill = Number(/Held in (\d+) entit/i.exec(t)?.[1] ?? NaN);
      const i = t.search(/^ENTITY\tMANAGED BY/m);
      if (!Number.isFinite(pill) || i < 0) return false;
      const body = t.slice(i).split("\n").slice(1);
      const end = body.findIndex((l) => /^Total\t/.test(l));
      if (end < 0) return false;
      return body.slice(0, end).filter((l) => l.trim()).length === pill;
    }],
    // Both rows show and the Total counts the holding once, so the column does
    // NOT add to its own footer — which is only honest because the page says so.
    ["the rows-vs-total gap is named where a holding is reported twice",
      (t) => /reported on\s+each of the \d+ statements listed/i.test(t)],
    // A holding its statement marks at a TOTAL value has no per-unit price. This
    // headline read "₹0" for exactly that reason (`currentPrice ?? 0`), which is
    // a figure produced by a default over a ₹1.47 Cr position.
    ["no fabricated zero price in the CMP headline", (t) => {
      const lines = t.split("\n");
      const i = lines.findIndex((l) => /^CMP\s*·/.test(l.trim()));
      return i > 0 && !/^₹0(\.00)?$/.test(lines[i - 1].trim());
    }],
  ],
  // Contribution attribution buckets COMPANY SHARES by GICS sector and every fund
  // wrapper under its own asset class. Bucketing only the PRIVATE classes that
  // way left mutual funds — ₹52.4 Cr here — sitting in "Unclassified" beside
  // direct equity that genuinely has no sector printed, which is how a wrapper
  // came to head a sector table on the page next door.
  returns: [
    // DERIVED FROM THE PAGE, NOT FROM A LITERAL. The caption names the wrapper
    // classes this table bucketed by class — computed from the same rows the
    // table is — so a class named there with no ROW in the table is a wrapper
    // that leaked back into "Unclassified" beside real direct equity. A check
    // hardcoding "Mutual Fund" would instead go stale the first drop that holds
    // none, and would pass over no input, which is what `golden.mjs` refuses.
    ["every wrapper class the page names has its own attribution row", (t) => {
      const i = t.search(/SECTOR \/ CLASS/i);
      const named = /Bucketed by class here:\s*([^.]+)\./i.exec(t)?.[1] ?? "";
      const classes = named.split(",").map((x) => x.trim()).filter(Boolean);
      if (i < 0 || classes.length === 0) return false;
      const end = t.indexOf("Total", i);
      const table = t.slice(i, end > i ? end : i + 2000);
      return classes.every((c) => table.includes(c));
    }],
    // And no fund's NAME may stand as a row label — the failure this replaced.
    ["no fund name stands as a sector row", (t) => {
      const i = t.search(/SECTOR \/ CLASS/i);
      if (i < 0) return false;
      const end = t.indexOf("Total", i);
      const table = t.slice(i, end > i ? end : i + 2000);
      return !/(Flexi Cap Fund|Sanshi Fund|Opportunities Strategy|Founders Fund|Active Momentum|Liquid ?Bees)/i.test(table);
    }],
  ],
  // "Compare companies" compares COMPANIES. A fund unit has no PE, no filings and
  // no peer set, and offering one in the picker put "Sanshi Fund-I (Open Ended
  // AIF CAT-III) — Class E" and "Cash" side by side under that heading.
  compare: [
    ["the picker offers companies only, and names what it left out",
      (t) => !/(Flexi Cap Fund|Sanshi Fund|Opportunities Strategy|Founders Fund|Active Momentum)/i.test(t)
        && /company shares only/i.test(t)],
  ],
  // Layer 1: Knowledge & Memory is a real note store, not a mock. In this
  // headless run nothing has been captured, so the page must show the ABSENT
  // state with what would fill it — never "0 notes", and never the old sample
  // counts. It must also not call its keyword search an AI query engine.
  knowledge: [
    ["an empty store renders the absent state, not zeros",
      (t) => /No note has been captured yet/i.test(t) && !/\b0 notes\b/i.test(t)],
    ["the search says what it is rather than claiming to be an AI index",
      (t) => /not a language model reading an index/i.test(t) && !/AI query engine/i.test(t)],
    ["the retired sample counts are gone", (t) => !/636/.test(t)],
  ],
  // Phase 0: Macro Research renders from the committed series store, not a live
  // API — so it is live in this headless run with no token and no network. If
  // the store fails to load the page says so, and these catch that.
  macro: [
    ["series store loaded — the returns table is live, not preview", (t) => /\d+ live/.test(t) && !/series store did not respond/i.test(t)],
    ["observation count is stated, so the table is backed by a real series", (t) => /observations/i.test(t)],
    ["a max-available CAGR resolved (a stored series, not a four-row preview)", (t) => /Max/.test(t) && /[+-]\d+\.\d%/.test(t)],
    // Phase A1: the spec's weekly / quarterly / year-end views. The control is
    // rendered only when the chosen series can honestly be coarsened, which the
    // default (a daily commodity) can.
    ["a frequency toggle offers the coarser views the spec asks for",
      (t) => /Quarterly/.test(t) && /Year-end/.test(t)],
  ],
};

/**
 * Elements painting a DARK surface or near-invisible text while the page is in
 * light mode. Run in the browser so it reads COMPUTED colour — the only way to
 * catch a utility whose light remap is missing, since the class name itself
 * looks identical either way.
 */
const DARK_IN_LIGHT = () => {
  const lum = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (a < 0.12) return null;                       // effectively transparent
    const [r, g, b] = [1, 2, 3].map((i) => Number(m[i]) / 255);
    return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, a };
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const cls = typeof el.className === "string" ? el.className : "";
    const where = `${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 4).join(".") : ""}`;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const bg = lum(cs.backgroundColor);
    // A dark fill on a light page: the light remap for this utility is missing.
    if (bg && bg.l < 0.25) {
      const k = "bg|" + where;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: "dark-surface", where, color: cs.backgroundColor }); }
    }
    const bc = lum(cs.borderTopColor);
    if (bc && bc.l < 0.2 && parseFloat(cs.borderTopWidth) > 0) {
      const k = "bd|" + where;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: "dark-border", where, color: cs.borderTopColor }); }
    }
    // Near-white text on a light surface reads as invisible. Only flagged where
    // the element actually has text of its own.
    const fg = lum(cs.color);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && fg && fg.l > 0.82) {
      const k = "fg|" + where;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: "pale-text", where, color: cs.color }); }
    }
  }
  return out.slice(0, 40);
};

/**
 * The mirror check for DARK mode.
 *
 * Dark mode is the palette's native form, so an unremapped utility is correct
 * there by construction — the failure mode is the opposite one: a colour
 * hardcoded for a light surface (a white panel, near-black text) that survives
 * into the dark chassis. Far rarer, and invisible to anyone testing only the
 * default theme.
 */
const LIGHT_IN_DARK = () => {
  const lum = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (a < 0.12) return null;
    const [r, g, b] = [1, 2, 3].map((i) => Number(m[i]) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const cls = typeof el.className === "string" ? el.className : "";
    const where = `${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 4).join(".") : ""}`;
    // A near-white panel in the dark chassis. Champagne accents are legitimate
    // (the primary button, the active nav pill), so allow warm colours: flag
    // only near-neutral whites, where R≈G≈B.
    const bg = lum(cs.backgroundColor);
    const rgb = cs.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
    const neutral = rgb.length >= 3 && Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) < 26;
    if (bg !== null && bg > 0.75 && neutral) {
      const k = "bg|" + where;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: "light-surface", where, color: cs.backgroundColor }); }
    }
    const fg = lum(cs.color);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && fg !== null && fg < 0.06) {
      // Dark text is right on a champagne badge or the gold GRADIENT behind the
      // logo mark, and wrong only on the dark chassis. The backdrop is often on
      // an ANCESTOR (the logo's letter carries no background of its own) and a
      // gradient lives in background-IMAGE, so walk up to whatever actually
      // paints behind this text before calling it unreadable.
      let backdrop = null;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.backgroundImage && acs.backgroundImage !== "none") { backdrop = 1; break; }
        const l = lum(acs.backgroundColor);
        if (l !== null) { backdrop = l; break; }
      }
      if (backdrop === null || backdrop < 0.4) {
        const k = "fg|" + where;
        if (!seen.has(k)) { seen.add(k); out.push({ kind: "dark-text", where, color: cs.color }); }
      }
    }
  }
  return out.slice(0, 40);
};

/** Does the page body scroll sideways? A table must scroll inside its own box. */
const OVERFLOW = () => {
  const de = document.documentElement;
  const overflow = de.scrollWidth - de.clientWidth;
  if (overflow <= 1) return null;
  // Name the widest offender so the fix has an address.
  let worst = null;
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    const past = r.right - de.clientWidth;
    if (past > 1 && (!worst || past > worst.past)) {
      const cls = typeof el.className === "string" ? el.className : "";
      worst = { past: Math.round(past), where: `${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 3).join(".") : ""}` };
    }
  }
  return { overflow, worst };
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const report = [];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const [name, route] of ROUTES) {
      // A route may resolve its own address from what an earlier route rendered
      // (the mandate drill-down does). Resolved at navigation time, so it sees
      // this sweep's monitor rather than a previous run's.
      const path = typeof route === "function" ? route() : route;
      const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
      // Set the theme BEFORE the app boots, so it never paints the wrong one first.
      await ctx.addInitScript((t) => {
        try { localStorage.setItem("glow:theme", t); } catch { /* private mode */ }
        // addInitScript can run before <html> exists, so apply the class when
        // the document is ready rather than assuming documentElement is there.
        const apply = () => document.documentElement?.classList.add("dark");
        if (t === "dark") {
          if (document.documentElement) apply();
          else document.addEventListener("readystatechange", apply, { once: true });
        }
      }, theme);
      const page = await ctx.newPage();
      // The web-font CDN is unreachable from this sandbox and blocks `load` for
      // ~12s per navigation. Abort it up front: it changes no layout the checks
      // care about (metrics fall back to system-ui) and takes the sweep from
      // minutes to seconds.
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const errors = [], failed = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));
      page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

      await page.goto(`${BASE}${path}`, { waitUntil: FAST ? "load" : "networkidle", timeout: 45000 });
      if (name === "monitor-txns") {
        const t = page.getByRole("button", { name: /transactions/i }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(1200); }
      }
      if (name === "monitor-entity") {
        // The toggle is LABELLED WITH THE VIEW IT SWITCHES TO, so the button
        // reading "By security" is the one that leaves the by-security view.
        const t = page.getByRole("button", { name: /^By security$/i }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(1200); }
      }
      await page.waitForTimeout(FAST ? 350 : 800);

      const text = FAST ? "" : await page.evaluate(() => document.body.innerText);
      /**
       * THE LINKS THE PAGE ACTUALLY DRAWS, read off the DOM.
       *
       * An invariant about a DRILL-DOWN cannot be struck on prose: a sentence
       * saying a mandate exists is not a route to it, and this book has been
       * bitten once already by a check that matched a caption and could not
       * fail. Collected on every route (it costs nothing) and handed to the
       * invariants as their second argument; every older one ignores it.
       */
      // Collected even in FAST mode: it is one cheap call, and the responsive
      // sweep would otherwise walk the mandate route's not-found page at every
      // width — measuring the layout of a screen nobody sees.
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
      // What the monitor printed about each mandate, so the drill-down can be
      // checked against it — and the address of the drill-down itself.
      if (name === "monitor") {
        MANDATE_PATH = hrefs.find((h) => /^\/mandate\/./.test(h)) ?? MANDATE_PATH;
        for (const m of mandateRowsIn(text)) MANDATE_ROWS.set(m.accountNo, m);
      }
      const zeros = !FAST && theme === "light" && width === WIDTHS[0]
        ? [...text.matchAll(ZEROISH)].map((m) => {
            const i = Math.max(0, m.index - 70);
            return text.slice(i, m.index + m[0].length + 40).replace(/\s+/g, " ");
          })
        : [];
      const overflow = await page.evaluate(OVERFLOW);
      const contrast = FAST ? [] : await page.evaluate(theme === "light" ? DARK_IN_LIGHT : LIGHT_IN_DARK);
      // Data invariants — only the primary theme/width, where innerText is real.
      // THREE OUTCOMES, NOT TWO: pass, fail, and NOT CHECKED for a check whose
      // input is not on screen at all on this run (see `notChecked`). The third
      // is counted apart from both, because a check that passes over no input
      // claims confidence nobody earned and one that fails over no input is red
      // about a page that is rendering correctly.
      const invariants = [], notCheckedHere = [];
      if (!FAST && theme === THEMES[0] && width === WIDTHS[0] && INVARIANTS[name]) {
        for (const [desc, test] of INVARIANTS[name]) {
          let r;
          // A CHECK THAT THREW HAS NOT PASSED, and it must not take the sweep
          // down with it either. Reported by name with the message, so a
          // broken matcher reads as a broken matcher rather than as a clean
          // page — the same rule as `golden.mjs`'s BLOCKED.
          try { r = test(text, { hrefs, path }); }
          catch (e) { invariants.push(`${desc} — the check itself threw: ${e.message}`); continue; }
          if (r && typeof r === "object" && typeof r.notChecked === "string") notCheckedHere.push(`${desc} — ${r.notChecked}`);
          else if (!r) invariants.push(desc);
        }
      }
      if (SHOTS && width === WIDTHS[0]) {
        await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: true });
      }
      report.push({
        theme, width, name, path,
        errors: errors.filter((e) => !ENVIRONMENT_NOISE.test(e)),
        failed: [...new Set(failed.filter((f) => !ENVIRONMENT_NOISE.test(f)))],
        overflow, contrast, zeros, invariants, unchecked: notCheckedHere,
      });
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

let broken = 0;
let unchecked = 0;
for (const r of report) {
  const inv = r.invariants ?? [];
  const nc = r.unchecked ?? [];
  unchecked += nc.length;
  // NOT CHECKED is deliberately outside `hard`: it is a statement about this
  // run's inputs, not about the page.
  const hard = r.errors.length + r.failed.length + (r.overflow ? 1 : 0) + r.contrast.length + inv.length;
  if (hard) broken++;
  const tag = `${r.theme}/${r.width}`.padEnd(11);
  const ok = hard ? "✗" : "✓";
  if (hard || nc.length || (r.theme === THEMES[0] && r.width === WIDTHS[0])) {
    console.log(`${ok} ${tag} ${r.name.padEnd(14)} err=${r.errors.length} req=${r.failed.length} overflow=${r.overflow ? r.overflow.overflow + "px" : "-"} contrast=${r.contrast.length} zeroish=${r.zeros.length}${inv.length ? ` invariant=${inv.length}` : ""}${nc.length ? ` notchecked=${nc.length}` : ""}`);
  }
  for (const i of inv) console.log(`    INVARIANT FAILED  ${i}`);
  for (const i of nc) console.log(`    INVARIANT NOT CHECKED  ${i}`);
  for (const e of r.errors) console.log(`    ERR  ${e.slice(0, 200)}`);
  for (const f of r.failed) console.log(`    REQ  ${f.slice(0, 160)}`);
  if (r.overflow) console.log(`    OVERFLOW ${r.overflow.overflow}px — widest: ${r.overflow.worst?.where ?? "?"} (+${r.overflow.worst?.past}px)`);
  for (const c of r.contrast) console.log(`    ${c.kind.toUpperCase().padEnd(13)} ${c.color.padEnd(26)} ${c.where.slice(0, 110)}`);
  for (const z of r.zeros) console.log(`    ZERO …${z}`);
}
console.log(`\n${SHOTS ? `Screenshots and ` : ""}report.json in ${OUT}/`);
console.log(broken
  ? `✗ ${broken} of ${report.length} route/theme/width combinations have a finding`
  : `✓ ${report.length} route/theme/width combinations clean`);
// Reported on its own line and never folded into either count above: neither a
// pass nor a failure, the same three-way split `golden.mjs` reports.
if (unchecked) {
  console.log(`  ${unchecked} invariant${unchecked === 1 ? "" : "s"} NOT CHECKED — the figure it is struck on was not on screen on this run, so it is counted apart from both passes and failures`);
}
process.exit(broken ? 1 : 0);
