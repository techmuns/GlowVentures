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
import { mkdirSync, writeFileSync } from "node:fs";

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

const ROUTES = [
  ["cio", "/cio"],
  ["monitor", "/monitor"],
  ["monitor-txns", "/monitor"],          // same route, Transactions toggle clicked
  // ...and the BY-ENTITY view of the same table, where every statement's row
  // shows as printed. Both of this book's duplicate holdings are AIF, so this is
  // the only view in which the AIF section's heading and the footer beneath it
  // can disagree — which they did, by the ₹3.17 Cr the footer correctly excludes.
  ["monitor-entity", "/monitor"],        // same route, By entity toggled
  ["family", "/family"],
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

const INVARIANTS = {
  // "on the dashboard there's only one asset class" — the CIO allocation must
  // surface more than equity, and state the listed/private split.
  cio: [
    ["allocation shows more than one asset class (AIF + MF/Cash)", (t) => /\bAIF\b/.test(t) && /(Mutual Fund|Cash)/.test(t)],
    ["listed/private split is shown, not 'no private holdings'", (t) => /Private\s*₹/.test(t) && !/no private holdings/.test(t)],
    // "are there no investments in direct equity?" — listed equity is ONE
    // consolidated asset-class row covering every vehicle, and it is now
    // LABELLED "Company Shares": the family read the old "Equity" heading as
    // covering their AIF folios too, and read the "Direct Equity" that replaced
    // it as a claim that they had picked the positions (see `assetClassLabel`).
    //
    // THE LABEL AND THE SET ARE ASSERTED SEPARATELY, because the same two words
    // once named the empty engagement-split row this line was written against.
    // A label alone cannot tell those apart: the row must also carry holdings
    // and a value, which the vehicle-split row never did.
    ["allocation carries a 'Company Shares' row", (t) => /Company Shares/.test(t) && !/Direct Equity/.test(t)],
    ["...and it is the whole equity class, not an empty vehicle split",
      (t) => !/PMS\s*\/\s*Managed/.test(t)
        && /Company Shares[\s\S]{0,300}?₹[\d,.]+\s*(?:Cr|L|K)?/.test(t)],
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
    /**
     * ₹127 Cr of shares a manager chose and ₹30 Cr the family bought are one
     * "Equity" row, correctly — they are the same asset. Both halves were
     * computed and rendered NOWHERE, so the row said only what the holdings ARE
     * and never who decided them. That silence is what the family read as a
     * claim of directness.
     */
    ["the Equity row says how much was chosen by a manager and how much was not",
      (t) => !/\bEquity\b/.test(t) || /chosen under a manager.s mandate/i.test(t)],
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
  // holdings must be sectioned by asset class; and the by-security total counts
  // each dedupeGroup once (₹335.43 Cr, never the double-counted ₹338.6 Cr).
  monitor: [
    ["holdings are sectioned by asset class", (t) => /\bequity\b/i.test(t) && /\d+\s+holdings/i.test(t)],
    // "we are mixing the AIF holdings into equity" — the model never did
    // (`isDirectEquity` is `assetClass === "Equity"` and every AIF folio is its
    // own AIF row), but the section HEADING read "EQUITY" and the family read it
    // as covering the table beneath it. These three assert the fix on the page:
    // the heading names the narrower thing, the filter offers CATEGORIES, and no
    // fund unit stands inside the company-shares section.
    ["the equity section is headed 'Company Shares'", (t) => /\bCOMPANY SHARES\b/i.test(t) && !/\bDIRECT EQUITY\b/i.test(t)],
    ["the class filter reads 'All categories'", (t) => /All categories/.test(t) && !/All asset classes/.test(t)],
    // Struck on the RENDERED ROWS, not on the caption: a fund name appearing
    // between the Company Shares heading and the next class heading is a wrapper
    // sitting among the shares, whatever the heading above it says. Same list of
    // this book's own fund names the sector check uses.
    ["no fund unit stands inside the Company Shares section", (t) => {
      const i = t.search(/^COMPANY SHARES$/m);
      if (i < 0) return false;                       // heading gone → the check above fails too
      const rest = t.slice(i + 1);
      const j = rest.search(/^(MUTUAL FUND|AIF|ETF|BOND|STRUCTURED PRODUCT|UNLISTED|CASH)$/m);
      const section = j < 0 ? rest : rest.slice(0, j);
      return !/(Flexi Cap Fund|Sanshi Fund|Opportunities Strategy|Founders Fund|Liquid ?Bees|Amritkaal|Delphi Equity|Neo Infra|Baring Private|Transition Venture|India SME|Rising Titans|Hedged Equity)/i.test(section);
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
    /**
     * INVESTED + UNREALISED P&L MUST EITHER TIE TO MARKET VALUE OR SAY WHY NOT.
     *
     * The client added the footer's three printed cells — ₹471.9 Cr invested,
     * +₹74.1 Cr unrealised, ₹13,063.2 Cr market value — and found ₹546 Cr where
     * ₹13,063 Cr was printed. Nothing was miscalculated: `sumOrNull` strikes the
     * first two over the positions that REPORT a cost, and 61 of 370 here do not
     * because they are held in depository accounts. But the footer asserted all
     * three side by side with nothing saying they cover different sets, which is
     * the "a total must tie to its own columns" rule that already cost this book
     * once on the Morning CIO allocation footer.
     *
     * So: either the three reconcile, or the page carries the caption that
     * explains the gap AND the caption's own figures reconcile. Struck on the
     * rendered numbers, never on the prose — reverting the caption to a static
     * sentence would leave this passing.
     */
    ["invested + unrealised either ties to market value, or the gap is named and adds up", (t) => {
      const foot = new RegExp(
        String.raw`Total\s*·\s*\d+\s*rows\s*` + CR +          // invested
        String.raw`[\s\S]{0,40}?` + CR +                          // market value
        String.raw`[\s\S]{0,40}?\+?₹([\d,]+(?:\.\d+)?)\s*Cr`  // unrealised P&L
      ).exec(t);
      if (!foot) return false;                       // no input is never a pass
      const [, inv, mv, pnl] = [foot[1], foot[2], foot[3]].map(cr).reduce((a, v, i) => (a[i + 1] = v, a), []);
      if ([inv, mv, pnl].some((v) => !Number.isFinite(v))) return false;
      if (Math.abs(inv + pnl - mv) <= Math.max(0.6, mv * 0.002)) return true;   // they do tie
      // They do not, so the page must name the gap — and the named figures must
      // themselves reconcile: covered + uncovered = the market value printed.
      const covered = cr(new RegExp(String.raw`whose statement\s*reports a cost — ` + CR, "i").exec(t)?.[1]);
      const uncovered = cr(new RegExp(String.raw`worth ` + CR + String.raw`, are held through depository`, "i").exec(t)?.[1]);
      return Number.isFinite(covered) && Number.isFinite(uncovered)
        && Math.abs(covered + uncovered - mv) <= Math.max(0.6, mv * 0.002)
        && Math.abs(inv + pnl - covered) <= Math.max(0.6, mv * 0.002);
    }],
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
    ["the by-entity view still sections by class", (t) => /\bCOMPANY SHARES\b/i.test(t) && /\bAIF\b/.test(t)],
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
    ["sector GAP is direct-equity only, the non-equity classes named",
      (t) => /company shares/i.test(t) && /excluded rather than folded in/i.test(t)],
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
    ["market-cap bands are struck on direct equity, not the whole book",
      (t) => /direct-equity/i.test(t)],
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
    ["a manager-chosen holding is never called direct",
      (t) => !/direct equity/i.test(t)],
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
    for (const [name, path] of ROUTES) {
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
      const zeros = !FAST && theme === "light" && width === WIDTHS[0]
        ? [...text.matchAll(ZEROISH)].map((m) => {
            const i = Math.max(0, m.index - 70);
            return text.slice(i, m.index + m[0].length + 40).replace(/\s+/g, " ");
          })
        : [];
      const overflow = await page.evaluate(OVERFLOW);
      const contrast = FAST ? [] : await page.evaluate(theme === "light" ? DARK_IN_LIGHT : LIGHT_IN_DARK);
      // Data invariants — only the primary theme/width, where innerText is real.
      const invariants = !FAST && theme === THEMES[0] && width === WIDTHS[0] && INVARIANTS[name]
        ? INVARIANTS[name].filter(([, test]) => !test(text)).map(([desc]) => desc)
        : [];
      if (SHOTS && width === WIDTHS[0]) {
        await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: true });
      }
      report.push({
        theme, width, name, path,
        errors: errors.filter((e) => !ENVIRONMENT_NOISE.test(e)),
        failed: [...new Set(failed.filter((f) => !ENVIRONMENT_NOISE.test(f)))],
        overflow, contrast, zeros, invariants,
      });
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

let broken = 0;
for (const r of report) {
  const inv = r.invariants ?? [];
  const hard = r.errors.length + r.failed.length + (r.overflow ? 1 : 0) + r.contrast.length + inv.length;
  if (hard) broken++;
  const tag = `${r.theme}/${r.width}`.padEnd(11);
  const ok = hard ? "✗" : "✓";
  if (hard || (r.theme === THEMES[0] && r.width === WIDTHS[0])) {
    console.log(`${ok} ${tag} ${r.name.padEnd(14)} err=${r.errors.length} req=${r.failed.length} overflow=${r.overflow ? r.overflow.overflow + "px" : "-"} contrast=${r.contrast.length} zeroish=${r.zeros.length}${inv.length ? ` invariant=${inv.length}` : ""}`);
  }
  for (const i of inv) console.log(`    INVARIANT FAILED  ${i}`);
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
process.exit(broken ? 1 : 0);
