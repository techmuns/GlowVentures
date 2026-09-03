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
/**
 * ONE ROUTE, when a change is being iterated on.
 *
 * `ONLY=polycab,monitor` walks just those. The default is every route, so CI
 * and a plain `npm run check:pages` are unchanged — this exists because
 * verifying an invariant by REINTRODUCING ITS BUG (the discipline every
 * invariant here is held to) costs a build and a full sweep per bug, and the
 * sweep is 94 combinations. A name that matches no route yields an empty walk,
 * which the summary reports as zero combinations rather than as a clean run.
 *
 * A ROUTE THAT RESOLVES ADDRESSES FOR OTHERS IS KEPT WHEN ONE OF THOSE OTHERS
 * IS ASKED FOR. `monitor` resolves the mandate drill-down's address and `cio`
 * resolves every holdings drill-down's, so `ONLY=holdings-book` without `cio`
 * would walk a not-found page and report NOT CHECKED — a filter that silently
 * stops checking is worse than no filter. It is a DEPENDENCY, not a blanket
 * keep: a name matching nothing still yields the empty walk above, because no
 * selected route needs a publisher.
 */
const ONLY = (process.env.ONLY ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const PUBLISHERS = [
  ["monitor", (n) => n === "mandate" || n === "mandate-fund"],
  ["cio", (n) => n.startsWith("holdings-")],
  // The cost-less set is a FACET of the Capital invested page, so its address is
  // drawn by that page's toggle and by nothing else. `ONLY=holdings-nocost`
  // without it would walk a not-found page and report NOT CHECKED — a filter
  // that silently stops checking, which is what this list exists to prevent.
  ["holdings-invested", (n) => n === "holdings-nocost"],
];
const walked = (name) =>
  !ONLY.length
  || ONLY.includes(name)
  || PUBLISHERS.some(([pub, needs]) => pub === name && ONLY.some(needs));

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
/**
 * The rendered text between two landmarks, for an invariant that must read ONE
 * table on a page carrying several.
 *
 * Every figure check here is struck on `document.body.innerText`, and a page
 * with three tables of share counts on it will satisfy a naive whole-page match
 * from the wrong one. `from` is inclusive and `to` exclusive; a landmark that
 * is not found yields "" rather than the rest of the page, so a renamed heading
 * fails its invariant instead of quietly widening it to everything below.
 */
function sliceBetween(text, from, to) {
  const i = text.indexOf(from);
  if (i < 0) return "";
  const j = to ? text.indexOf(to, i) : -1;
  return text.slice(i, j < 0 ? text.length : j);
}

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
 * HOW MANY DISCRETIONARY MANDATES THE BOOK HOLDS — read from the generated book.
 *
 * The whole-book drill-down shows each of them as ONE ROW linking to its own
 * page, which is the way into the only look-through this book has. Asserting
 * that by counting links needs a number to count against, and a literal here
 * would be a second source for a figure `build-book` generates.
 */
const MANDATE_COUNT = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const accounts = bookArray(src, "BOOK_ACCOUNTS");
    const positions = bookArray(src, "BOOK_POSITIONS");
    if (!Array.isArray(accounts) || !Array.isArray(positions)) return null;
    const held = new Set(positions.map((p) => p.accountId));
    return accounts.filter((a) => a.engagement === "PMS" && held.has(a.accountId)).length || null;
  } catch { return null; }
})();
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

/**
 * THE NEWEST DATE ANY PRIVATE HOLDING IS ACTUALLY MARKED AT.
 *
 * Derived, never typed: the Private Market page's own claim is that it does NOT
 * print the book's newest date over marks that are older than it, and both dates
 * move with every drop. A literal here would be a second source for a generated
 * figure — the mistake that made three earlier invariants fail against pages
 * computing correctly.
 *
 * Today the book closes 2026-08-13 and the newest private mark is 2026-07-31.
 */
const PRIVATE_CLASSES = new Set(["AIF", "Unlisted", "Structured Product"]);
const PRIV_ASOF_MAX = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const accounts = bookArray(src, "BOOK_ACCOUNTS");
    const positions = bookArray(src, "BOOK_POSITIONS");
    if (!Array.isArray(accounts) || !Array.isArray(positions)) return null;
    const ids = new Set(positions.filter((p) => PRIVATE_CLASSES.has(p.assetClass)).map((p) => p.accountId));
    for (const a of accounts) if (a.engagement === "AIF") ids.add(a.accountId);
    const dates = [...ids]
      .map((id) => accounts.find((a) => a.accountId === id)?.asOf)
      .filter(Boolean).sort();
    return dates.at(-1) ?? null;
  } catch { return null; }
})();

/**
 * The ring-fenced security's own key, READ FROM THE BOOK rather than typed.
 *
 * `/stock/<this key>` must redirect to the Polycab page, and the route four
 * entries down already states the rule: typing a generated identifier here is a
 * second source for it. A typed key would still fail loudly if the book's key
 * changed — the redirect simply would not fire — but `FUND_ACCOUNT_ID` and
 * `FAMILY_ENTITY` both derive theirs for the same reason, and the derivation is
 * one line. A book with nothing ring-fenced yields null and the route walks a
 * key that resolves to no holding, which fails rather than silently skipping.
 */
/**
 * THE REGISTER'S OWN SENTINEL, DERIVED RATHER THAN TYPED.
 *
 * `src/data/registerData.ts` is generated from the family's investment register
 * and must reach NO portfolio total. The absence check below needs a string that
 * appears on `/register` and nowhere else, and the largest name the book does not
 * carry is exactly that: it is in the register by construction and in the book by
 * definition not. Taken from the data so the next drop picks its own sentinel —
 * the same reason `RINGFENCED_KEY` is read out of `BOOK_POLYCAB`.
 *
 * The WORD "register" would be useless here: `capital-register` is a live report
 * type in the book and the Data Audit page names it on every walk.
 */
/** How many book positions report no cost — the register page's denominator. */
const COSTLESS_IN_BOOK = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const rows = bookArray(src, "BOOK_POSITIONS");
    return Array.isArray(rows) ? rows.filter((p) => p.costBasis == null).length : null;
  } catch { return null; }
})();

const REGISTER_SENTINEL = (() => {
  try {
    const src = readFileSync(new URL("../src/data/registerData.ts", import.meta.url), "utf8");
    const rows = bookArray(src, "REGISTER_NOT_IN_BOOK");
    const name = Array.isArray(rows) ? rows[0]?.name ?? null : null;
    // Only the distinctive head of the name; the tables truncate nothing but the
    // check should not depend on punctuation the page may render differently.
    return name ? name.split(/[\s(,-]/).filter((w) => w.length > 3)[0] ?? null : null;
  } catch { return null; }
})();

/**
 * HOW MANY HOLDINGS THE BOOK ITSELF SAYS WERE OPENED DURING ITS OWN YEAR — the
 * only rows a year-to-date figure can legitimately appear on, since a holding
 * already held on 1 January needs an opening value the book does not carry.
 *
 * READ FROM `glowData.ts`, NOT FROM THE PAGE. The YTD column and its caption are
 * both computed by `holdingYtd`, so comparing one against the other cannot fail
 * — they would fabricate together. This is the independent side, the same shape
 * as the Polycab reconciliations below: two paths to one figure.
 */
const YTD_MEASURABLE = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const pos = bookArray(src, "BOOK_POSITIONS");
    const summary = /"asOf":\s*"(\d{4})-/.exec(src);
    if (!Array.isArray(pos) || !summary) return null;
    const yearStart = `${summary[1]}-01-01`;
    // Consolidated by securityKey, because that is what the by-security table
    // draws — and a row is measurable only if EVERY lot behind it has a start.
    const bySec = new Map();
    for (const p of pos) {
      const g = bySec.get(p.securityKey) ?? [];
      g.push(p); bySec.set(p.securityKey, g);
    }
    let n = 0;
    for (const g of bySec.values()) {
      if (g.every((p) => p.heldSince) && g.every((p) => p.heldSince >= yearStart) && g.some((p) => p.returnPct !== null)) n++;
    }
    return n;
  } catch { return null; }
})();

const RINGFENCED_KEY = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const fenced = bookArray(src, "BOOK_POLYCAB");
    return Array.isArray(fenced) ? fenced[0]?.securityKey ?? null : null;
  } catch { return null; }
})();

/**
 * THE RING-FENCED BLOCK'S OWN FIGURES, READ FROM THE BOOK — the independent
 * side of the Polycab page's reconciliations.
 *
 * The family asked that page to show the holding "per demat, per holder,
 * pledges, dividends and splits". The first two are TABLES, and a table that
 * silently loses a row looks exactly like a book with one fewer demat in it —
 * which is the failure `dedupedPositions` sat on for a drop and a half. So the
 * page's rendered rows are reconciled against each other AND against this,
 * derived straight from `BOOK_POLYCAB` and `BOOK_ACCOUNTS`.
 *
 * Two comparisons, because neither implies the other and both have shipped
 * broken before in this repo: rows-against-their-own-footer catches a total
 * computed independently of the rows above it (the Private Market page's PM-1),
 * and rendered-against-the-book catches a page that drops rows consistently
 * everywhere and reconciles perfectly with itself.
 */
const FENCED = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const fenced = bookArray(src, "BOOK_POLYCAB");
    const accounts = bookArray(src, "BOOK_ACCOUNTS");
    if (!Array.isArray(fenced) || !fenced.length || !Array.isArray(accounts)) return null;
    const byId = new Map(accounts.map((a) => [a.accountId, a]));
    const demats = [...new Set(fenced.map((p) => p.accountId))];
    return {
      // `quantity` is the primitive the depository prints; a row without one
      // contributes nothing rather than a zero, exactly as `sumOrNull` does on
      // the page, so the two sides stay comparable when a statement is silent.
      shares: fenced.reduce((t, p) => t + (Number.isFinite(p.quantity) ? p.quantity : 0), 0),
      demats: demats.length,
      holders: new Set(demats.map((id) => byId.get(id)?.owner).filter(Boolean)).size,
      accountNos: demats.map((id) => byId.get(id)?.accountNo).filter(Boolean),
    };
  } catch { return null; }
})();

/**
 * A COMPANY SHARE THE BOOK CARRIES NO COST FOR — derived, not typed.
 *
 * 60 of this book's 371 positions have `costBasis: null`, and every one is
 * genuinely absent at source: measured across the whole audit archive, not one
 * of those (account, security) pairs carries a cost on any record type. A
 * depository reports what shares are worth, never what they were bought for.
 * The dash is therefore correct — and the page still has to say WHY, which is
 * what `stock-nocost` walks. The largest such holding is picked so the route is
 * stable, and a book where every position reports a cost yields null and the
 * route fails loudly rather than skipping.
 */
const NO_COST_KEY = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const positions = bookArray(src, "BOOK_POSITIONS");
    if (!Array.isArray(positions)) return null;
    const hit = positions
      .filter((p) => p.costBasis === null && p.assetClass === "Equity")
      .sort((a, b) => (Number(b.marketValue) || 0) - (Number(a.marketValue) || 0))[0];
    return hit?.securityKey ?? null;
  } catch { return null; }
})();

const CIO_BUCKET_HREFS = [];
/** Each `holdings-*` route's own `N holdings · M names · K accounts` line. */
const DRILLDOWN_COUNTS = new Map();
// SIX, because the book has six buckets. Spare slots are not free: each one is
// a route that renders a page nobody sees and reports four NOT CHECKED lines
// every run, which is the noise that trains a reader to skim the report. A
// SEVENTH bucket does not go unwalked either — the `cio` invariant below fails
// when the table has more rows than this sweep has addresses for, which is a
// one-line diagnosis naming the fix rather than a silent gap.
const BUCKET_SLOTS = [1, 2, 3, 4, 5, 6];

/**
 * THE MUTUAL FUND WHOSE LOOK-THROUGH IS WALKED — derived, never typed.
 *
 * The largest by market value, so the route is stable across drops; a book with
 * no mutual fund yields null and the route fails loudly rather than skipping.
 * Its expected look-through is not written here either: the invariants
 * reconstruct it from the figures the page itself renders.
 */
const MF_KEY = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const positions = bookArray(src, "BOOK_POSITIONS");
    if (!Array.isArray(positions)) return null;
    const by = new Map();
    for (const p of positions) {
      if (p.assetClass !== "Mutual Fund") continue;
      by.set(p.securityKey, (by.get(p.securityKey) ?? 0) + (Number(p.marketValue) || 0));
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  } catch { return null; }
})();

const ROUTES = [
  // THE RING-FENCED PROMOTER HOLDING, ON ITS OWN PAGE. Polycab is carried in
  // `BOOK_POLYCAB` and in NO book total, so two things have to be true at once and
  // both are asserted: this page RENDERS the holding, and every other page in this
  // sweep is free of it (see `polycabAbsent`, applied to every other route).
  ["polycab", "/polycab"],
  // ...AND THE COMPANY-PAGE ADDRESS OF THE SAME SECURITY, which must REDIRECT
  // here rather than render. With the holding out of `BOOK_POSITIONS`,
  // `StockInfo`'s row filter comes back empty and its fully-exited branch prints
  // "Position closed · HOLDING VALUE ₹0 · QUANTITY 0 · this name is fully exited"
  // over 1.39 Cr shares worth ₹12,351 Cr. Walked as its own route so a
  // regression that removes the guard is caught here rather than by the family.
  ["polycab-stock-redirect", () => `/stock/${encodeURIComponent(RINGFENCED_KEY ?? "none-ring-fenced-in-the-book")}`],
  // THE FAMILY'S INVESTMENT REGISTER, ON ITS OWN PAGE and in NO book total. Same
  // construction as Polycab and the same pair of obligations: this page RENDERS
  // the register, and no consolidated figure anywhere in the sweep may move
  // because of it. `registerAbsent` below applies to every other route.
  ["register", "/register"],
  ["cio", "/cio"],
  // ...AND THE SAME PAGE WITH THE FEEDS STILL IN FLIGHT. A card that renders an
  // absence while it is loading tells the reader their book cannot be priced;
  // the window is milliseconds against a real feed, so it is held open here.
  ["cio-loading", "/cio"],
  // ...AND THE MIRROR CASE: quotes answered, indices still in flight. The index
  // tile only exists once the card has priced rows, so it cannot be reached on
  // the walk above — the two feeds have to be in different states to see it.
  ["cio-index-loading", "/cio"],
  // ...AND THE SNAPSHOT CACHE, which is what stops a reader ever meeting the
  // loading state twice. Loaded once with the feeds answering, then RELOADED
  // with them held open: the figures must still be on screen from the stored
  // snapshot rather than the card starting over from nothing.
  ["cio-cached", "/cio"],
  // ...AND THE MUNS CHAT PANEL, opened. It is the one surface in this app that
  // renders text no statement produced, so what it SAYS ABOUT ITSELF is the
  // invariant: an answer must never be mistakable for a measured figure.
  ["chat", "/cio"],
  /**
   * ...AND THE SAME PAGE WITH THE LIVE LAYER FULFILLED.
   *
   * `vite preview` runs no Cloudflare Function, so on the plain `cio` walk the
   * quote feed, the index feed and the price history all 404 and every figure
   * they drive renders its ABSENT state. That is worth asserting on its own (the
   * `cio` checks below do) and it means the day's-move arithmetic — the figure
   * the family actually asked for — was checked by nothing at all.
   *
   * So this route serves all three from fixtures BUILT OUT OF THE BOOK (see
   * `installLiveMocks`), priced at each holding's own statement mark × 1.10 with
   * every index at ×0.99. Both factors are chosen so the answers are EXACTLY
   * computable: the priced book must read +10.00%, every index −1.00%, and the
   * gap between them 11.00 points. A tile that diluted the day's move across the
   * whole book, averaged percentages instead of value-weighting them, or counted
   * an unpriced holding as flat cannot produce those numbers.
   */
  ["cio-live", "/cio"],
  ["monitor", "/monitor"],
  ["private-market", "/private-market"],
  ["monitor-txns", "/monitor"],          // same route, Transactions toggle clicked
  // ...AND THE SAME TAPE DRILLED INTO. The rollup's whole claim is that a
  // collapsed line still carries every dated row underneath it, and that is only
  // true once something expands one. Walked as its own route so a regression
  // that collapses a series and LOSES its tranches — which reads as a tidier
  // screen, not as a fault — is caught here rather than by the family.
  ["monitor-txn-drill", "/monitor"],
  // ...AND THE DIRECT EQUITY VIEW, which is a different SET rather than a
  // different grouping: the tape narrowed to the accounts the family runs
  // itself. Walked separately because a filter that silently matched nothing
  // renders an empty table that looks like a family which does not trade.
  ["monitor-txn-direct", "/monitor"],
  // ...and the BY-ENTITY view of the same table, where every statement's row
  // shows as printed. Both of this book's duplicate holdings are AIF, so this is
  // the only view in which the AIF section's heading and the footer beneath it
  // can disagree — which they did, by the ₹3.17 Cr the footer correctly excludes.
  // ...THE BY-ENTITY BUILD, NOW REACHED BY URL. The toggle that switched to it
  // was removed at the family's request; the view was not, because it is the
  // only one in which a class subtotal and the footer beneath it can disagree —
  // both of this book's duplicate holdings are AIF — and that disagreement was
  // a real ₹3.17 Cr defect. `?view=entity` is the same contract every other
  // multi-view route in this app uses.
  ["monitor-entity", "/monitor?view=entity"],
  // ...AND THE ANNUALISED BASIS, reached by clicking the toggle this session
  // added. The guard that makes it safe is asserted on the figures it draws.
  ["monitor-cagr", "/monitor"],
  /**
   * ...AND THE SAME HOLDINGS SLICED THE FAMILY'S OTHER TWO WAYS.
   *
   *   "category wise (MF, direct equity, Bonds, PMS, AIF etc), asset class wise
   *    (Equity, debt etc), my basket definition wise (core, tactical etc).
   *    Default view will remain the current one, category wise."
   *
   * Both are reached by URL for the same reason `monitor-entity` is: the axis
   * lives in `?group=`, so a slice is a link. The DEFAULT axis is asserted on
   * the plain `monitor` route above — that it is still category, and that
   * nothing about it moved.
   */
  ["monitor-assetclass", "/monitor?group=assetClass"],
  ["monitor-basket", "/monitor?group=basket"],
  // ...AND THE AXIS SWITCHED BY CLICK WITH A FILTER ALREADY SET, which is the
  // one way to reach the stale-filter defect. See the walk step of this name.
  ["monitor-axis-switch", "/monitor"],
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
  /**
   * ── THE DRILL-DOWNS EVERY MORNING CIO FIGURE NOW OPENS ────────────────────
   *
   * Walked AFTER `cio`, because each address is the one that page drew (see
   * `CIO_DRILLDOWNS`) and each invariant compares the destination against the
   * figure the reader clicked. A typed address would be a second source for a
   * generated bucket key, and a page walked before the figures were captured
   * would silently check nothing.
   *
   * FOUR OF THEM, chosen because each is a DIFFERENT branch of the same page
   * and one route would exercise only the easiest:
   *   • an allocation ROW, which is the request itself;
   *   • the whole BOOK, whose two counts are the concentration figures and
   *     whose return must be REFUSED (its Invested covers 309 of 369 rows);
   *   • the money-weighted COVERAGE, the one scope that must NOT dedupe;
   *   • the holdings reporting NO COST, which is the companion set the Capital
   *     invested tile names and which must render absent rather than ₹0.
   */
  ...BUCKET_SLOTS.map((n) => [`holdings-row-${n}`, () => CIO_BUCKET_HREFS[n - 1] ?? `/holdings?of=bucket&key=no-row-${n}-on-morning-cio`]),
  ["holdings-book", () => drilldownPath("book") ?? "/holdings?of=none-resolved-from-cio"],
  /**
   * ...AND THE CONCENTRATION FIGURES, which until now had their LINKS asserted
   * on the `cio` route and their DESTINATIONS asserted by nothing. A link that
   * opens the wrong set passes a pairing check and fails a reader, so each of
   * these compares the page's own total against the figure it opened from —
   * exactly what `holdings-row-N` does for the allocation table.
   *
   * Addresses come from the links Morning CIO drew, never typed here.
   */
  ["holdings-crossheld", () => drilldownPath("cross-held") ?? "/holdings?of=none-resolved-from-cio"],
  ["holdings-topnames", () => drilldownPath("top-names") ?? "/holdings?of=none-resolved-from-cio"],
  // THE TWO HALVES ARE FACETS OF THE NAV'S OWN PAGE NOW, and their addresses
  // come from the Concentration card, which still links each half directly.
  ["holdings-listed", () => drilldownPath("book#listed") ?? "/holdings?of=none-resolved-from-cio"],
  ["holdings-private", () => drilldownPath("book#private") ?? "/holdings?of=none-resolved-from-cio"],
  ["holdings-winners", () => drilldownPath("winners") ?? "/holdings?of=none-resolved-from-cio"],
  ["holdings-losers", () => drilldownPath("losers") ?? "/holdings?of=none-resolved-from-cio"],
  ["holdings-measured", () => drilldownPath("measured") ?? "/holdings?of=none-resolved-from-cio"],
  // ...AND THE CAPITAL INVESTED PAGE, which was never walked: only its no-cost
  // half was, back when that half was a scope of its own. It has to be walked
  // FIRST now, because the cost-less set is reachable only from the toggle it
  // draws — an address that comes from the page under test rather than from a
  // literal here, like every other drill-down in this sweep.
  ["holdings-invested", () => drilldownPath("invested") ?? "/holdings?of=none-resolved-from-cio"],
  ["holdings-nocost", () => drilldownPath("invested#no-cost") ?? "/holdings?of=none-resolved-from-invested"],
  // ...AND AN ADDRESS THAT NAMES NOTHING. A drill-down that silently falls back
  // to "everything" would answer a question it was not asked with a figure that
  // looks like the one the reader clicked, which is worse than saying so.
  ["holdings-unknown", "/holdings?of=a-set-this-book-does-not-define"],
  ["family", "/family"],
  // ...AND ONE ENTITY'S DRILL-DOWN, which is where the family's own complaint lands:
  // open a member and see, per row, whether they chose a holding or a manager did.
  // The owner is resolved from the book (see `FAMILY_ENTITY`) rather than typed, and
  // the scope now lives in the URL so this route can exist at all.
  ["family-entity", () => (FAMILY_ENTITY ? `/family?entity=${encodeURIComponent(FAMILY_ENTITY)}` : "/family?entity=none-resolved-from-the-book")],
  ["sectors", "/sectors"],
  ["compare", "/compare"],
  // Knowledge & Memory, Macro Research and Economy & Macro were REMOVED at the
  // family's request, so they are no longer walked — there is no page at any of
  // those three addresses to hold to the light-mode, overflow and stray-zero
  // bar. The removal itself is asserted in `check-family-inputs.mjs`: a removal
  // is verified by asserting it happened, never by deleting the test alongside
  // the feature.
  ["exposure", "/exposure"],
  ["thesis", "/thesis"],
  ["alerts", "/alerts"],
  ["stock", "/stock/aditya-birla-capital"],   // one company page — returns table, tools, research
  // ...AND ONE FUND PAGE, because the two must not render the same. A fund unit
  // has no price history, no PE, no filings and no insider trades, so the five
  // company panels are absent BY DECISION there. Walked as its own route so a
  // regression that puts them back is caught here rather than by the client.
  ["stock-fund", "/stock/sanshi-fund-i-open-ended-aif-cat-iii-class-e"],
  /**
   * ...AND ONE MUTUAL FUND, WHICH NOW HAS A LOOK-THROUGH THE AIF ABOVE CANNOT.
   *
   * Both branches are walked because the difference between them is the whole
   * claim: a mutual fund scheme publishes its portfolio monthly and this page
   * renders it; an AIF publishes none and the same page must keep SAYING so.
   * A build that showed one fund's holdings under the other's name would pass
   * either check alone.
   */
  ["stock-mf-lookthrough", () => (MF_KEY ? `/stock/${encodeURIComponent(MF_KEY)}` : "/stock/no-mutual-fund-in-the-book")],
  // ...AND ONE THE BOOK HAS NO COST FOR. Its Avg cost and Unrealised P&L tiles
  // are correctly a dash and must SAY SO: they used to print "invested —" (a
  // second dash) and "on cost" (a basis the figure does not have), which is the
  // one thing that leaves a reader unable to tell a custodian who does not
  // report cost from a dashboard that is broken.
  ["stock-nocost", () => (NO_COST_KEY ? `/stock/${encodeURIComponent(NO_COST_KEY)}` : "/stock/none-without-cost-in-the-book")],
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
const ENVIRONMENT_NOISE = /fonts\.googleapis\.com|\/api\/(news|quotes|fx|announcements|insider|research|ratios|prices|indices|chat)|ERR_CONNECTION_RESET|Failed to load resource/;

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
 *
 * THE COMMA PATH IS UNEXERCISED TODAY AND MUST STAY. Ring-fencing the ₹12,351 Cr
 * Polycab promoter block took this book back under ₹1,000 Cr (₹710.4 Cr), so no
 * figure on any page currently carries a thousands separator and nothing here
 * would fail if the comma handling were dropped. It comes straight back the first
 * time the book grows past ₹1,000 Cr or Polycab is folded back in — which is one
 * line in `build-book.mjs` — and it would come back silently, on a page computing
 * correctly, exactly as it did the first time.
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
/**
 * The same figure when `fmtFromBase` chose a smaller suffix. NaN in, NaN out.
 *
 * AND NO SUFFIX AT ALL IS RUPEES, NOT CRORE. `fmtFromBase` drops the suffix
 * below a lakh, so a real figure arrives as `−₹26,209` — read as crore that is
 * −₹2,620.9 Cr, four times this whole book, and it looks exactly like a number.
 * Found by summing the Mutual Fund category's unrealised P&L against its own
 * footer: the categories came to −₹26,136 Cr against a printed +₹72.5 Cr, which
 * is the plausible-wrong-number failure this file exists to catch, arriving in
 * the checker rather than in the page.
 */
const crU = (n, unit) => cr(n) * (unit === "Cr" ? 1 : unit === "L" ? 0.01 : unit === "K" ? 0.0001 : 1e-7);

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
 * ── AND ONE OF THOSE ROWS IS NOT A HOLDING ──────────────────────────────────
 *
 * "Show aggregate totals for every metric for each category." Every section now
 * closes with a row that totals its own columns, and that row is a table row by
 * every structural test above: it has a cell per column and therefore a tab per
 * boundary.
 *
 * IT MUST NOT BE COUNTED AS A HOLDING, and the reason is not tidiness. Six
 * invariants read `sectionOf(...).rows` as "the holdings drawn in this section"
 * — the first cell after the name is a quantity, every row in the PMS section is
 * a mandate, no fund unit stands under Direct Equity. A subtotal row satisfies
 * none of those and should not have to: its Qty cell is an em dash BY DESIGN,
 * because shares of one company and units of a fund do not add.
 *
 * Matched on the label's own trailing "· total", which is what the reader sees
 * and what the row is for. The `data-category-total` attribute is the stronger
 * handle and `ctx.categoryTotals` reads it — but `sectionOf` works on innerText,
 * where there are no attributes, so the text is what has to carry it here.
 */
const isCategoryTotalRow = (line) => /^[^\t]*·\s*total\t/i.test(line);
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
    // THE HOLDINGS, which is what every caller means by "rows" — the category's
    // own totals row is a table row and is not one of them.
    rows: block.filter((l) => isDataRow(l) && !isCategoryTotalRow(l)),
    /** The category's totals row as rendered, or undefined where none is drawn. */
    total: block.find(isCategoryTotalRow),
  };
}
/** `· N holdings · ₹X` off a section heading, in crore. */
function headingCount(head) {
  const m = /·\s*([\d,]+)\s*holdings?\s*·\s*₹([\d,.]+)\s*(Cr|L|K)?/i.exec(head ?? "");
  return m ? { holdings: cr(m[1]), mv: crU(m[2], m[3]) } : null;
}
/**
 * A MANDATE ROW, which is an ACCOUNT and not a security — read off the ROW'S OWN
 * ATTRIBUTES rather than out of the rendered text.
 *
 * These facts used to be parsed from a sub-line the row printed under its name
 * ("<manager> · account <no> · N holdings"). The family asked for that line to
 * go — the entity has its own column and the rest belongs on the mandate's own
 * page — and every one of the six invariants below would have gone with it,
 * silently, because a regex that matches nothing yields an empty list and an
 * empty list passes an `.every()`.
 *
 * So the row carries `data-mandate`, `data-manager`, `data-account`,
 * `data-holdings`, `data-account-holdings` and `data-bucket`, and these read
 * those. It is the same contract `data-row` / `data-days` already carry on the
 * transactions rollup, and for the same reason: a STRUCTURAL claim must not
 * depend on prose a redesign is free to delete.
 */
const MANDATE_BUCKET = "PMS mandates";
const DIRECT_EQUITY_BUCKET = "Direct Equity";
const mandatesIn = (mandates, bucket) =>
  (mandates ?? []).filter((m) => bucket === undefined || m.bucket === bucket);
/** A check needs its input: no rows captured is NOT CHECKED, never a pass. */
const needRows = (rows) => rows === null || rows === undefined
  ? { notChecked: "no table rows captured on this run" } : null;

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
/**
 * What the drill-down walk actually opened, counted off the DOM rather than off
 * the rendered text. Set during the `monitor-txn-drill` interaction and read by
 * its invariants; null anywhere else, which those invariants report as NOT
 * CHECKED rather than as a pass.
 */
let DRILL = null;
/** The same, for the Direct Equity view — see `monitor-txn-direct`. */
let DIRECT = null;
/** What the reloaded, network-less second open rendered — see `cio-cached`. */
let CACHED = null;
/** What the opened chat panel rendered — see the `chat` route. */
let CHAT = null;
/** Header geometry, for the single-line headline claim — see `monitor`. */
let HEAD = null;

/**
 * ── THE DRILL-DOWN ADDRESSES, AND THE FIGURES THEY MUST RECONSTRUCT ──────────
 *
 * "Every row of the allocation table on Morning CIO must open the holdings
 * behind it." The claim being asserted has TWO halves and neither implies the
 * other, so both are captured on the `cio` route and both are checked:
 *
 *   • Every row IS a link (read off the DOM, never off a caption — a sentence
 *     saying a drill-down exists is not a route to it).
 *   • The page it opens lists THE SAME SET the row is summed over, which is
 *     checked by comparing the destination's own total against the cell the
 *     reader clicked. A drill-down that shows a different set is the failure
 *     this whole change exists to avoid, and it looks identical to a working
 *     one from either page alone.
 *
 * Every address here is DERIVED FROM THE PAGE'S OWN LINK, the same discipline
 * `MANDATE_PATH` follows: typing `?of=bucket&key=AIF` in this file would be a
 * second source for a bucket key the book generates, and a stale one would keep
 * "passing" by rendering the drill-down's own not-found state.
 */
const CIO_DRILLDOWNS = new Map();   // scope id (+key) -> href, as the CIO drew it
/**
 * EVERY allocation row's address, in the order Morning CIO drew them.
 *
 * One row was not enough, and reintroducing the bug is what proved it: a
 * drill-down grouping on `assetClass` instead of `holdingBucket` is a real
 * defect — mandate-held shares would leave the PMS mandates row entirely — and
 * the sweep stayed green, because the single row it walked was AIF, where the
 * two groupings happen to agree. The discriminating rows are the ones the
 * regroup created, so all of them are walked.
 *
 * `BUCKET_SLOTS` is how many rows this sweep has addresses for. A book with
 * more buckets than slots would silently leave the extras unwalked, so the
 * `cio` invariants assert the count fits — a check that quietly stops checking
 * is the failure this file exists to prevent.
 */
/** What Morning CIO printed for each allocation row: label -> {invested, current, weight}. */
const CIO_ALLOCATION = new Map();
/** The KPI figures the drill-downs have to reproduce, in ₹ Cr. */
const CIO_FIGURES = new Map();

/** The first drill-down href whose `of=` matches, or null. */
const drilldownPath = (id) => CIO_DRILLDOWNS.get(id) ?? null;

/** A literal for use inside a RegExp — bucket keys carry `/`, `&` and `—`. */
const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The bucket a `holdings-row-N` route actually opened, read off the address it
 * was given rather than a label stored beside it. The address IS the fact —
 * a stored label could name a different row than the one walked, which is the
 * two-sources-for-one-figure failure this whole change is written against.
 */
const bucketKeyOf = (ctx) => {
  const q = String(ctx?.path ?? "").split("?")[1] ?? "";
  const key = new URLSearchParams(q).get("key");
  return key && !/^no-row-\d+-on-morning-cio$/.test(key) ? key : null;
};

/**
 * Morning CIO's allocation rows, read out of the rendered table.
 *
 * innerText joins a row's cells with tabs, so a row is
 * `Label \t ₹Invested \t ₹Current \t Return \t Weight` — and Invested is an
 * em dash on the rows whose statements report no cost, which is data rather
 * than a parse failure and must not drop the row.
 */
function cioAllocationRows(text) {
  const out = [];
  const money = String.raw`(—|₹[\d,]+(?:\.\d+)?\s*(?:Cr|L|K)?)`;
  const re = new RegExp(String.raw`^([^\t\n]+)\n?\t` + money + String.raw`\t` + money + String.raw`\t(.*?)\t([\d.]+)%$`, "gm");
  for (const m of text.matchAll(re)) {
    // `ret` is the cell VERBATIM — a signed percentage on the rows whose cost
    // covers them and an em dash on the rest. Kept as printed rather than parsed
    // to a number, because "it printed no percentage" is the half of this the
    // drill-down has to reproduce and `NaN` cannot say it.
    out.push({ label: m[1].trim(), invested: m[2], current: m[3], ret: m[4].trim(), weight: Number(m[5]) });
  }
  return out;
}

/** `₹352.3 Cr` / `₹68.3 L` / `—` -> a number in ₹ Cr, or NaN for an em dash. */
function money2cr(s) {
  const m = /₹([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?/.exec(s ?? "");
  return m ? crU(m[1], m[2]) : NaN;
}

/**
 * A drill-down's own headline total, in ₹ Cr — the figure directly under the
 * page title, which the page sums FROM the rows it lists.
 *
 * Read off `Market value`'s tile rather than the header chip, because the tile
 * is the one the table's footer also ties to, and comparing the header would
 * leave the table itself unchecked.
 */
const drilldownTotal = (t) => money2cr(new RegExp(String.raw`^MARKET VALUE$\n^(₹[\d,.]+\s*(?:Cr|L|K)?)$`, "im").exec(t)?.[1]);
/** One of the drill-down's KPI tiles, by its label, VERBATIM — `—` included. */
const tileValue = (t, label) => new RegExp(String.raw`^${label}$\n^(—|₹[\d,.\-+]+\s*(?:Cr|L|K)?|[+-][\d.]+%)$`, "im").exec(t)?.[1] ?? null;
/**
 * HOW MANY ROWS THE GROUPED TABLE DREW, off its own footer.
 *
 * The page has one table and no view modes now: a row is a MANDATE where the
 * set holds the whole of one, and a SECURITY otherwise. The footer names its
 * own unit, so this reads the count and the word together rather than assuming
 * either — a check that assumed "holdings" would go quietly blind on the PMS
 * bucket, which is the page the family was complaining about.
 */
const tableRows = (t) => {
  const m = /Total · ([\d,]+) (mandate|name|row)s?/i.exec(t);
  return m ? { n: cr(m[1]), unit: m[2].toLowerCase() } : null;
};

/** …and how many holdings and names it says it covers. */
function drilldownCounts(t) {
  const m = /([\d,]+)\s+holdings?\s*·\s*([\d,]+)\s+names?\s*·\s*([\d,]+)\s+accounts?/i.exec(t);
  return m ? { holdings: cr(m[1]), names: cr(m[2]), accounts: cr(m[3]) } : null;
}


/**
 * ── THE LIVE LAYER, FULFILLED FROM THE BOOK ─────────────────────────────────
 *
 * `vite preview` runs no Cloudflare Function, so `/api/quotes`, `/api/indices`
 * and `/api/prices` all 404 in this harness and the one figure the family asked
 * for first — the day's move, and the book set against the Nifty — was asserted
 * by nothing. These fixtures make it assertable, and the factors are chosen so
 * every answer is a CLOSED FORM rather than something to eyeball:
 *
 *   • every symbol is priced at ITS OWN statement mark × QUOTE_FACTOR, so
 *     `applyQuotes`'s 10× sanity band (which exists to reject a mis-mapped
 *     ticker) cannot silently discard the feed and leave the checks testing an
 *     empty page — the same reasoning `scripts/dev/mock-quotes.mjs` states;
 *   • prevClose is the mark itself, so EVERY position's day change is exactly
 *     +10.00% and the value-weighted book figure is exactly +10.00% too — which
 *     is the point: a tile that divided the rupee move by the WHOLE book, or
 *     averaged percentages across positions of different sizes, or counted an
 *     unpriced holding as flat, lands somewhere else;
 *   • every index moves −1.00%, so the book-against-index gap is exactly 11.00.
 *
 * The index fixture carries the CORRECT `name` on each entry, because the real
 * Function refuses an index whose upstream reports a different instrument. A
 * fixture without the name would exercise the refusal path and quietly stop
 * testing the strip.
 */
const QUOTE_FACTOR = 1.10;
const INDEX_FACTOR = 0.99;
const MARK_BY_SYMBOL = (() => {
  const m = new Map();
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const positions = bookArray(src, "BOOK_POSITIONS") ?? [];
    const symbols = JSON.parse(readFileSync(new URL("../src/data/nseSymbols.json", import.meta.url), "utf8"));
    for (const p of positions) {
      const sym = p.symbol || symbols[p.securityKey];
      if (sym && Number.isFinite(p.currentPrice) && p.currentPrice > 0 && !m.has(sym)) m.set(sym, p.currentPrice);
    }
  } catch { /* an unreadable book fails the route's own checks, loudly */ }
  return m;
})();

/**
 * HOW MANY DIRECT-EQUITY NAMES THE MOCKED FEED CAN PRICE — the exact number of
 * gainers the movers card must show on the `cio-live` walk.
 *
 * *"daily movers/losers should comprise of direct equity holdings only."* That
 * claim cannot be checked on the ROWS: the card lists six, and on any day the
 * mandate names happen not to move a rows-only assertion passes over a broken
 * filter. It can be checked on the COUNT. Every fixture price is the mark × 1.10,
 * so every priceable name rises and the gainer count is exactly the size of the
 * priced scope — 33 here. Fold the PMS mandates back in and it is 160-odd; fold
 * the ETFs in and it moves too. Derived from the book on every run rather than
 * typed, so the next drop brings its own expectation.
 *
 * The bucket is recomputed here from `assetClass` + the ACCOUNT's engagement,
 * deliberately duplicating `holdingBucket` rather than importing it: this file
 * is the independent check, and a check that imports the helper it is checking
 * agrees with itself by construction.
 */
const DIRECT_EQUITY_PRICED_NAMES = (() => {
  try {
    const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
    const positions = bookArray(src, "BOOK_POSITIONS") ?? [];
    const accounts = bookArray(src, "BOOK_ACCOUNTS") ?? [];
    const symbols = JSON.parse(readFileSync(new URL("../src/data/nseSymbols.json", import.meta.url), "utf8"));
    const engagement = new Map(accounts.map((a) => [a.accountId, a.engagement]));
    const names = new Set();
    for (const p of positions) {
      const e = engagement.get(p.accountId);
      if (p.assetClass !== "Equity") continue;
      if (e !== "Direct" && e !== "Execution") continue;      // a mandate is not direct
      const sym = p.symbol || symbols[p.securityKey];
      if (!sym || !MARK_BY_SYMBOL.has(sym)) continue;         // the fixture cannot price it
      names.add(p.securityKey);
    }
    return names.size;
  } catch { return null; }
})();

const MOCK_INDICES = [
  ["nifty-50", "Nifty 50", "^NSEI", "NIFTY 50", 24000],
  ["nifty-500", "Nifty 500", "^CRSLDX", "NIFTY 500", 23000],
  ["nifty-midcap-150", "Nifty Midcap 150", "NIFTYMIDCAP150.NS", "NIFTY MIDCAP 150", 22000],
  ["nifty-smallcap-250", "Nifty Smallcap 250", "NIFTYSMLCAP250.NS", "NIFTY SMLCAP 250", 18000],
];

/** A linear daily ramp, so the index's return between any two dates is exact. */
const PRICE_SLOPE = 0.0004;

/**
 * A FEED THAT NEVER ANSWERS, so the LOADING state is what renders.
 *
 * The defect this exists for is a card that asserts an absence while the
 * request is still in flight — "No holding in this book carries a day change
 * right now", printed on the first paint of every cold open. That window is
 * milliseconds against a real feed and cannot be caught by walking the page
 * normally: the plain `cio` walk 404s immediately and lands on the FAILED
 * branch, which is a different (and correct) state.
 *
 * So the quote and index routes are held open for the length of the walk. The
 * page is then in exactly the state a reader sees on a slow connection, and the
 * assertion is that it says it is loading and makes no claim about the book.
 */
async function installStalledFeeds(page) {
  const hold = (route) => new Promise(() => { void route; });
  await page.route("**/api/quotes", hold);
  await page.route("**/api/indices*", hold);
  // The snapshot cache would legitimately fill this card from a previous
  // session and skip the loading state entirely — which is the feature, and
  // exactly what must not be allowed to hide the branch under test.
  await page.addInitScript(() => { try { localStorage.removeItem("glow.quotes.v1"); } catch { /* no storage */ } });
}

/**
 * QUOTES ANSWER, INDICES DO NOT — the movers card's OTHER loading state.
 *
 * The index tile lives inside the branch that only renders once there are
 * priced rows, so on a cold open with the quote feed stalled there is no tile
 * to assert anything about. Exercising it needs the two feeds in DIFFERENT
 * states, which is what this does: the quote mocks fulfil, the index route is
 * held open. Registered after the mocks because Playwright matches routes
 * newest-first, so this override wins for `/api/indices`.
 */
async function installStalledIndices(page) {
  await installLiveMocks(page);
  await page.route("**/api/indices*", (route) => new Promise(() => { void route; }));
}

async function installLiveMocks(page) {
  await page.route("**/api/quotes", async (route) => {
    let want = [];
    try { want = JSON.parse(route.request().postData() ?? "{}").symbols ?? []; } catch { /* empty body */ }
    const quotes = {}, missing = [];
    for (const s of want) {
      const mark = MARK_BY_SYMBOL.get(s);
      if (!mark) { missing.push(s); continue; }
      quotes[s] = {
        price: Math.round(mark * QUOTE_FACTOR * 10000) / 10000, prevClose: mark,
        open: mark, dayLow: mark, dayHigh: mark, low52: null, high52: null,
        marketCap: null, volume: null, yearChangePct: null, ageS: 0,
      };
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, quotes, asOf: "2026-08-13T10:00:00.000Z", missing, fresh: Object.keys(quotes).length, stale: 0 }),
    });
  });
  await page.route("**/api/indices*", async (route) => {
    const indices = MOCK_INDICES.map(([id, label, symbol, name, prev]) => {
      const level = Math.round(prev * INDEX_FACTOR * 100) / 100;
      return {
        id, label, symbol, ok: true, reason: null, name, currency: "INR", exchange: "NSE",
        level, prevClose: prev, prevCloseDate: "2026-08-12",
        change: Math.round((level - prev) * 100) / 100, changePct: (INDEX_FACTOR - 1) * 100,
        dayHigh: level, dayLow: level, high52: prev * 1.2, low52: prev * 0.8,
        asOf: "2026-08-13T10:00:00.000Z",
      };
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, source: "fixture", fetchedAt: "2026-08-13T10:00:00.000Z", resolved: indices.length, requested: indices.length, indices }),
    });
  });
  await page.route("**/api/prices*", async (route) => {
    const t = [], v = [];
    const start = Date.UTC(2026, 0, 1);
    const today = new Date().toISOString().slice(0, 10);
    for (let n = 0; n < 400; n++) {
      const d = new Date(start + n * 86400000).toISOString().slice(0, 10);
      if (d >= today) break;                       // settled sessions only, as the real Function does
      t.push(d); v.push(Math.round(1000 * (1 + PRICE_SLOPE * n) * 10000) / 10000);
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true, source: "fixture", symbol: "^CRSLDX", currency: "INR", exchange: "NSE",
        first: t[0], last: t.at(-1), count: t.length, last_value: v.at(-1),
        returns: {}, spans: {}, high52: null, low52: null, t, v,
      }),
    });
  });
}

/**
 * ── A MISSING TOGGLE IS A FINDING, NOT AN ABSTENTION ────────────────────────
 *
 * The first draft of every facet invariant below returned `notChecked` when the
 * page drew no toggle — and deleting the toggle outright, which is precisely the
 * arrangement the family asked to be rid of, then reported the whole sweep
 * CLEAN with seven unchecked lines. That is `golden.mjs`'s rule arriving through
 * a control: a check that passes over no input claims confidence nobody earned.
 *
 * So abstention is allowed only where the BOOK genuinely has one side. The
 * evidence is the book's own, read off Morning CIO — the NAV caption printing
 * both halves, the Capital invested tile naming a cost-less set — never a
 * literal here, so a drop that really does hold nothing private abstains and a
 * drop like this one fails.
 */
const facetsOr = (ctx, evidence, why) =>
  ctx?.facets ? null : (evidence ? false : notChecked(why));

const BOOK_HAS_BOTH_HALVES = () =>
  [CIO_FIGURES.get("listed"), CIO_FIGURES.get("private")].every((v) => Number.isFinite(v) && v > 0);
const TILE_NAMES_COSTLESS = () => Number.isFinite(CIO_FIGURES.get("no-cost"));

/**
 * ── EVERY METRIC, TOTALLED FOR EACH CATEGORY ──────────────────────────────────
 *
 * "Show aggregate totals for every metric for each category investments."
 *
 * The section headings have always carried a holding count and a market value.
 * Everything else a reader compares categories on — what they cost, what they
 * are up, how much of the book they are, what moved today — had to be added by
 * eye down a column, which on a 84-row table is not something a reader does.
 *
 * Each section now closes with a row that totals its own columns. The claims
 * worth checking are not that the row EXISTS — it renders whatever the data does
 * — but that it ADDS UP and that every metric a category cannot answer says why:
 *
 *   1. the categories reconstruct the Total row, column by column;
 *   2. a return is refused wherever the cost side does not cover the category,
 *      which is the same test Morning CIO's allocation row runs on the same
 *      buckets (`costCoversSet`);
 *   3. no cell is blank without a reason a reader can read.
 *
 * They are struck on the RENDERED CELLS, by column, because a subtotal's whole
 * job is to sit under the column it totals. A page that printed the right
 * figures in the wrong columns passes every value comparison and is wrong in the
 * one way this row can be wrong.
 */
/** Column indices of the holdings table, which is what the cells are read by. */
const COL = { name: 0, qty: 1, avgCost: 2, invested: 3, cmp: 4, day: 5, mv: 6, weight: 7, pnl: 8, realised: 9, ret: 10, ytd: 11, sector: 12, entity: 13 };
/**
 * A money cell in crore. `null` for a rendered em dash — an ABSENT figure, which
 * is a different answer from an unparseable one; NaN for anything else, so a
 * caller guarding on `Number.isFinite` cannot mistake "could not read it" for a
 * measurement of zero (the `Number("")` trap this file already records).
 */
const moneyCell = (s) => {
  const t = String(s ?? "").trim();
  if (t === "—" || t === "") return null;
  // `[+\-−]`, with the hyphen ESCAPED. Unescaped it is a RANGE from "+" (U+002B)
  // to "−" (U+2212), which swallows every digit and the rupee sign with them:
  // `pctCell` read "13.4%" as 3.4 and "100.0%" as 0, and a weight column summing
  // to 30.1 against a printed 0 was the only sign of it.
  const m = /^([+\-−]?)₹([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?/.exec(t.replace(/\s+/g, " "));
  return m ? crU(m[2], m[3]) * (m[1] === "-" || m[1] === "−" ? -1 : 1) : NaN;
};
/** A percentage cell, same three outcomes. */
const pctCell = (s) => {
  const t = String(s ?? "").trim();
  if (t === "—" || t === "") return null;
  const m = /^([+\-−]?)(\d+(?:\.\d+)?)%/.exec(t);
  return m ? Number(m[2]) * (m[1] === "-" || m[1] === "−" ? -1 : 1) : NaN;
};
/**
 * Add one column across the categories and set it against the footer's own cell.
 *
 * The tolerance is the PRINTING PRECISION, not a fudge: `fmtFromBase` renders
 * compact to one decimal, so each of N categories and the total carry up to
 * ±0.05 Cr of rounding and the sum of N of them carries N times that. A figure
 * wrong by a holding is orders of magnitude outside it — the ₹3.17 Cr this
 * table's own headings once summed above their footer is 60 times the allowance
 * on a six-category book.
 */
const columnTies = (ct, col) => {
  const parts = ct.rows.map((r) => moneyCell(r.text[col]));
  const total = moneyCell(ct.footer.text[col]);
  if (total === null) return parts.every((p) => p === null);   // absent must stay absent
  const known = parts.filter((p) => p !== null);
  if (!known.length || known.some((p) => !Number.isFinite(p))) return false;
  return Math.abs(known.reduce((a, b) => a + b, 0) - total) <= Math.max(0.15, parts.length * 0.06);
};
/**
 * ── A MISSING TOTALS ROW IS A FINDING, NOT AN ABSTENTION ──────────────────────
 *
 * The first draft abstained whenever no totals row was captured, and that hole
 * was found by reintroducing the one bug this integration can have: partition
 * the totals on the CATEGORY axis while the table sections on Basket, and every
 * section's key misses, every totals row disappears, and the table looks
 * perfectly ordinary. The asset-class route failed — its keys overlap — and the
 * BASKET route reported NOT CHECKED six times and the sweep read CLEAN.
 *
 * That is `golden.mjs`'s rule and this file's own "a missing toggle must be a
 * finding": a check that passes over no input claims confidence nobody earned.
 * So abstention is allowed on exactly one evidenced condition — the page drew
 * FEWER THAN TWO SECTIONS, which is the single-category filter, where the
 * footer is the total and no second row is owed. Sections drawn and no rows
 * totalling them is a failure, and so is a footer that has lost its handle.
 */
const needTotals = (ctx) => {
  const ct = ctx?.categoryTotals;
  const secs = ctx?.sectionRows;
  if (!ct || !secs) return notChecked("the totals rows were not captured on this run");
  if (!ct.rows.length) {
    return secs.length > 1 ? false
      : notChecked("the table drew a single section, so the footer is its total and no per-section row is owed");
  }
  return ct.footer ? null : false;
};
const CATEGORY_TOTALS = [
  /**
   * ONE TOTALS ROW PER SECTION, MATCHED KEY FOR KEY.
   *
   * Read against the SECTION HEADINGS THE PAGE ITSELF DECLARED (`data-section`),
   * not against a hardcoded list of category names — so this holds on all three
   * of Stage 10z's axes, and a book whose categories change checks its own.
   *
   * The first draft counted `BUCKET_HEADINGS` that `sectionOf` could find, which
   * would have FAILED the asset-class and basket routes outright while claiming
   * to check them: those axes draw the family's own section names, which that
   * list does not and should not know. Matching keys is also the stronger claim
   * — equal counts pass a page that totals one section twice and another not at
   * all.
   */
  ["every section the table draws closes with its own totals row", (t, ctx) => {
    const gate = needTotals(ctx);
    if (gate) return gate;
    const secs = ctx?.sectionRows;
    if (!secs?.length) return { notChecked: "no section headings were rendered on this run" };
    const drawn = [...secs].map((x) => x.key).sort();
    const totalled = ctx.categoryTotals.rows.map((r) => r.key).sort();
    return drawn.length > 1 && drawn.length === totalled.length
      && drawn.every((k, i) => k === totalled[i]);
  }],
  /**
   * ── THE CATEGORIES ADD TO THE TOTAL ROW, COLUMN BY COLUMN ─────────────────
   *
   * Market value already had to: the headings have carried a subtotal since the
   * regroup, and the ₹3.17 Cr the AIF heading once summed above its own footer
   * is why. Invested and Unrealised P&L are the new exposure — and what these
   * catch, verified by reintroducing it, is a partition that skips the dedupe.
   *
   * WHAT THEY CANNOT CATCH IS NAMED IN THE PAGE BESIDE THE CODE: summing the
   * ROWS rather than the positions differs only where a security is consolidated
   * from a costed lot and an uncosted one, and this book has none of those (0 of
   * 216 groups). The wrong construction would tie here. The right one was
   * chosen anyway; this pair is what holds it once a drop makes it visible.
   */
  ["the category totals add to the footer's market value", (t, ctx) => {
    const gate = needTotals(ctx);
    return gate || columnTies(ctx.categoryTotals, COL.mv);
  }],
  ["the category totals add to the footer's invested and unrealised P&L", (t, ctx) => {
    const gate = needTotals(ctx);
    return gate || (columnTies(ctx.categoryTotals, COL.invested) && columnTies(ctx.categoryTotals, COL.pnl));
  }],
  /**
   * ...AND THE WEIGHT COLUMN HAS A TOTAL TO ADD TO. It was an empty cell, which
   * leaves a column of shares a reader cannot check by adding. Both halves are
   * asserted here because either alone passes a page missing the other: the
   * footer must print one, and the categories must reconstruct it.
   */
  ["the category weights add to the footer's own weight", (t, ctx) => {
    const gate = needTotals(ctx);
    if (gate) return gate;
    const total = pctCell(ctx.categoryTotals.footer.text[COL.weight]);
    const parts = ctx.categoryTotals.rows.map((r) => pctCell(r.text[COL.weight]));
    if (!Number.isFinite(total) || parts.some((p) => !Number.isFinite(p))) return false;
    return Math.abs(parts.reduce((a, b) => a + b, 0) - total) <= Math.max(0.2, parts.length * 0.05);
  }],
  /**
   * ── A RETURN IS REFUSED WHERE THE TWO COLUMNS BESIDE IT COVER DIFFERENT SETS ─
   *
   * `sumOrNull` skips a holding whose statement reports no cost, so Invested
   * covers a narrower set than Market value — and Direct Equity reports a cost
   * on 9 of its 37 holdings. A return on cost there sits between a printed
   * ₹1.2 Cr invested and a printed ₹94.9 Cr current and describes neither.
   *
   * THE UNCOVERED VALUE IS DERIVED FROM THE ROW'S OWN PRINTED CELLS —
   * `mv − (invested + P&L)` — which is exactly the arithmetic a reader does, and
   * is the reason this cannot pass by agreeing with a copy of itself. Two bands
   * with a gap between them: a category the cost side barely covers must show a
   * return, one it plainly does not must refuse. Compact printing rounds each
   * figure to a tenth of a crore, so the undecided middle is left undecided
   * rather than asserted through the noise.
   */
  ["a category whose cost side does not cover it refuses a return on cost", (t, ctx) => {
    const gate = needTotals(ctx);
    if (gate) return gate;
    let asserted = 0;
    for (const r of ctx.categoryTotals.rows) {
      const mv = moneyCell(r.text[COL.mv]);
      const cost = moneyCell(r.text[COL.invested]);
      const pnl = moneyCell(r.text[COL.pnl]);
      const ret = pctCell(r.text[COL.ret]);
      if (!Number.isFinite(mv)) return false;
      // A CATEGORY MEASURED AT NIL IS DECIDABLE, and this book has one: Cash is
      // ₹0 because every statement behind it reports a nil balance. There is
      // nothing to divide, so the return must be refused — and the first draft
      // treated it as unreadable and failed a page that was right.
      if (mv <= 0) { if (ret !== null) return false; asserted++; continue; }
      // No cost at all is the unambiguous case and is asserted outright.
      if (cost === null) { if (ret !== null) return false; asserted++; continue; }
      if (!Number.isFinite(cost) || !Number.isFinite(pnl)) return false;
      const uncovered = mv - (cost + pnl);
      if (uncovered > mv * 0.01) { if (ret !== null) return false; asserted++; }
      else if (uncovered < mv * 0.001) { if (ret === null || !Number.isFinite(ret)) return false; asserted++; }
    }
    // A run that decided nothing has checked nothing.
    return asserted > 1;
  }],
  /**
   * ── AND EVERY DASH ON THAT ROW NAMES ITS OWN ABSENCE ──────────────────────
   *
   * Four of the fourteen columns can never have a category total: quantities of
   * different securities do not add, an average cost and a price are per unit,
   * and a year-to-date return needs an opening value no statement in this book
   * is dated early enough to carry. Those are DECIDED absences and must read as
   * such — a reader who scans an empty cell learns nothing about whether a
   * figure was withheld or never existed, which is this book's founding rule
   * arriving one row below the footer that already keeps it.
   *
   * Struck on the `title`, because that is where `AbsentCell` puts the reason
   * and innerText cannot see it — the same blindness that left the cost-reason
   * invariant on /holdings reading text that never contained it.
   */
  ["every metric a category cannot total renders a dash with a reason", (t, ctx) => {
    const gate = needTotals(ctx);
    if (gate) return gate;
    const never = [COL.qty, COL.avgCost, COL.cmp, COL.ytd];
    const money = [COL.invested, COL.day, COL.mv, COL.weight, COL.pnl, COL.realised, COL.ret];
    return ctx.categoryTotals.rows.every((r) =>
      never.every((c) => r.text[c] === "—" && r.title[c].length > 20)
      // A figure may be absent here — several are — but never silently, and
      // never as an empty cell where a measurement belongs.
      && money.every((c) => r.text[c] !== "" && (r.text[c] !== "—" || r.title[c].length > 20)));
  }],
];
/**
 * ...AND THE ROW IS NOT A HOLDING. It is a table row by every structural test
 * the section reader applies, so `sectionOf` has to keep it out of `rows` or
 * six invariants that mean "the holdings drawn here" start reading a subtotal:
 * its Qty cell is an em dash by design and the first of them fails on it.
 * Asserted against the rows the DOM says are holdings, not against a count of
 * itself.
 *
 * SEPARATE FROM THE LIST ABOVE because it is struck through `sectionOf`, which
 * finds a section by the CATEGORY axis's own heading names — so it belongs on
 * the routes that draw those, and not on the two axes whose sections the family
 * names.
 */
const CATEGORY_TOTAL_NOT_A_HOLDING = [
  ["a category's totals row is not counted among its holdings", (t, ctx) => {
    const gate = needRows(ctx?.tableRows);
    if (gate) return gate;
    const de = sectionOf(t, "DIRECT EQUITY");
    if (!de || !de.total) return false;
    return de.rows.length === ctx.tableRows.filter((r) => r.bucket === DIRECT_EQUITY_BUCKET).length;
  }],
];
/**
 * ── THE THREE SLICES ────────────────────────────────────────────────────────
 *
 * Shared by both new axes, because the claims are the same claims and only the
 * expected section names differ. Struck on `data-section` / `data-subtotal`,
 * never on the heading's words: the axis multiplies the headings, and a check
 * that matched their prose would be retired silently by any rewording — which
 * is the failure `MANDATE_SUBLINE` already cost this sweep once.
 */
const NAV_TOL = 0.6;
const axisChecks = (axis, expected) => [
  // 1. THE SECTIONS ARE THE FAMILY'S OWN, and no others. A section this axis
  //    should not be able to produce means the grouping fell through to the raw
  //    asset class somewhere — which is exactly what a wrong key does.
  [`the ${axis} axis draws only the family's own sections`, (t, ctx) => {
    const secs = ctx?.sectionRows;
    if (!secs?.length) return { notChecked: "no section headings were rendered on this run" };
    const keys = secs.map((x) => x.key);
    return keys.length > 0 && keys.every((k) => expected.includes(k) || k === UNCLASSIFIED_KEY);
  }],
  // 2. EVERY HEADING SAYS IT IS ON THIS AXIS. A stale section left over from
  //    another axis would reconcile perfectly and be under the wrong heading.
  [`every ${axis} section declares the axis it was grouped on`, (t, ctx) => {
    const secs = ctx?.sectionRows;
    if (!secs?.length) return { notChecked: "no section headings on this run" };
    return secs.every((x) => x.axis === AXIS_PARAM[axis]);
  }],
  // 3. THE SECTIONS PARTITION THE BOOK. This is the whole safety property of
  //    regrouping: the same holdings, rearranged. Struck against the header
  //    chip's CONSOLIDATED NAV — deduped by construction, and generated, so it
  //    cannot go stale — and not against the sum of the sections' own copy of
  //    themselves, which would agree with itself however wrong both were.
  [`the ${axis} sections sum to the consolidated NAV`, (t, ctx) => {
    const secs = ctx?.sectionRows;
    if (!secs?.length) return { notChecked: "no section headings on this run" };
    const nav = cr(new RegExp(CR).exec(t)?.[1]);
    const sum = secs.reduce((a, x) => a + x.subtotal, 0) / 1e7;
    return Number.isFinite(nav) && Math.abs(sum - nav) <= NAV_TOL;
  }],
  // 4. ...AND SO DO THEIR HOLDING COUNTS, against the footer's own row count on
  //    the same page. Value alone can balance while a row is double-counted in
  //    one section and dropped from another.
  [`every holding lands in exactly one ${axis} section`, (t, ctx) => {
    const secs = ctx?.sectionRows;
    if (!secs?.length) return { notChecked: "no section headings on this run" };
    const keys = secs.map((x) => x.key);
    if (new Set(keys).size !== keys.length) return false;      // a repeated section
    const rows = ctx?.tableRows;
    if (!rows?.length) return { notChecked: "no holdings rows on this run" };
    // Mandate rows stand for many holdings; the section counts holdings, so
    // reconstruct the same figure from the rows themselves.
    const fromRows = rows.reduce((n, r) => n + (r.mandate ? (r.holdings || 1) : 1), 0);
    return secs.reduce((n, x) => n + x.holdings, 0) === fromRows;
  }],
  // 5. AN UNCLASSIFIED SECTION NAMES ITS CAUSE. "Other" would read as a bucket
  //    the family chose. If the axis ever classifies everything this passes
  //    vacuously and correctly — there is nothing to disclose.
  [`an unclassified ${axis} section says the review does not list it`, (t, ctx) => {
    const secs = ctx?.sectionRows;
    if (!secs?.length) return { notChecked: "no section headings on this run" };
    const un = secs.find((x) => x.key === UNCLASSIFIED_KEY);
    return !un || /review does not list/i.test(un.text);
  }],
  // 6. AND A SECTION FILLED BY THE FAMILY'S RULE SAYS HOW MUCH. The review
  //    naming a product and a rule covering a class are different claims, and
  //    under one heading they look identical.
  [`a rule-filled ${axis} section discloses how much of it was placed by rule`, (t, ctx) => {
    const secs = ctx?.sectionRows;
    if (!secs?.length) return { notChecked: "no section headings on this run" };
    return secs.every((x) => !(x.ruleMV > 0) || /by the family's stated rule/i.test(x.text));
  }],
  // 7. THE FILTER FOLLOWS THE AXIS. Its "all" option is the axis's own word, so
  //    a reader is never offered "All categories" over a table of baskets — and
  //    more to the point, never offered a category KEY that would match no row
  //    and empty the table without a message.
  [`the section filter offers this axis's own options`, (t) => new RegExp(ALL_LABEL_RE[axis], "i").test(t)],
];
const UNCLASSIFIED_KEY = "Not classified in the family's review";
const AXIS_PARAM = { "asset class": "assetClass", basket: "basket" };
const ALL_LABEL_RE = { "asset class": "All asset classes", basket: "All baskets" };
const INVARIANTS = {
  /**
   * THE RING-FENCED PROMOTER HOLDING RENDERS HERE — the other half of the
   * absence asserted on every other route in the sweep.
   *
   * Both halves are needed and neither implies the other: a page that named
   * Polycab everywhere would fail the absence check while this one passed, and a
   * `BOOK_POLYCAB` that came back empty would satisfy every absence check while
   * this page rendered nothing. Struck on the FIGURES the page draws, never on
   * its prose, which is the rule the exposure check's first draft broke — its
   * captions rendered whatever the data did and it could not fail.
   */
  /**
   * THE FAMILY'S INVESTMENT REGISTER — RENDERED HERE, AND IN NO PORTFOLIO TOTAL.
   *
   * Same pair of obligations as Polycab, and neither implies the other: this page
   * must RENDER the register, and every other route must be free of it (the
   * `REGISTER_SENTINEL` check in the walk). A page that rendered nothing would
   * satisfy every absence check while showing the family none of their own data.
   *
   * The register is a COST record — money that left a bank account on a date —
   * and roughly half of it is already inside the book at a statement mark. So the
   * assertions below are about the two things a reader could get wrong: that
   * these figures are values, and that they are additive.
   */
  register: [
    ["it renders the register's own largest name, so the absence check elsewhere means something",
      (t) => !!REGISTER_SENTINEL && new RegExp(REGISTER_SENTINEL, "i").test(t)],
    /**
     * THE FIGURES ARE COSTS AND THE PAGE SAYS SO. A reader who takes ₹842 Cr of
     * paid-in capital for a portfolio value has misread the page by an order of
     * magnitude against a ₹710 Cr book, which is exactly the contradiction the
     * "a total must tie" rule exists to prevent one page over.
     */
    ["it states these are amounts PAID and not a valuation",
      (t) => /money the family PAID/i.test(t) && /cash outflow/i.test(t)],
    ["it states the register is no part of the book's totals",
      (t) => /no part of the book/i.test(t) && /NAV/i.test(t)],
    /**
     * AND THE OVERLAP IS SHOWN RATHER THAN IMPLIED. The gross is NOT additive:
     * the first bucket is already inside NAV at a manager's own mark, so a page
     * that printed only the total would invite exactly the double count the
     * family asked us to rule out.
     */
    ["it partitions the register and says the overlap must not be added twice",
      (t) => /Already in the book/i.test(t) && /double count/i.test(t)],
    /**
     * NO PAID FIGURE IS PRESENTED AS A POSTED COST. The candidates table is the
     * one place a register figure sits beside a book figure for the same
     * holding, which is where a future edit is most likely to post one — so the
     * refusal is asserted on the CELL, with its reason, and never as a zero.
     */
    ["a register figure is never posted as a cost basis, and the refusal names its reason",
      (t, ctx) => {
        const why = (ctx?.titles ?? []).some((x) => /quantities tie/i.test(x) && /double-count/i.test(x));
        return why && !/₹\s*0(?:\.00)?(?![\d,.])/.test(t);
      }],
    /**
     * THE COSTLESS COUNT TIES TO THE BOOK'S OWN. The page claims to cover N of
     * the book's costless positions; if that denominator drifted from
     * BOOK_POSITIONS the page would be quietly describing a different book.
     */
    ["the costless denominator matches the book's own count of costless positions",
      (t) => {
        const m = /of the book's (\d+) costless positions/i.exec(t);
        return !!m && COSTLESS_IN_BOOK != null && Number(m[1]) === COSTLESS_IN_BOOK;
      }],
  ],
  polycab: [
    ["the holding is named, with a share count and a market value",
      (t) => /Polycab/i.test(t) && /[\d,]{7,}/.test(t) && new RegExp(CR).test(t)],
    /**
     * THE PAGE SAYS IT IS OUT OF THE BOOK'S TOTALS. A reader who lands here from
     * the nav has to be able to tell why this ₹12,351 Cr is not in the ₹710 Cr
     * headline two pages over — an unexplained figure of that size reads as a
     * contradiction, which is the "a total must tie" rule one page up.
     */
    ["it states that the holding is excluded from the portfolio totals",
      (t) => /excluded from portfolio totals/i.test(t) && /ring-fenced/i.test(t)],
    /**
     * COST IS ABSENT AND SAYS SO. A depository holds the shares; it did not buy
     * them, so there is no acquisition cost on the statement — and a ₹0 cost
     * would report the whole market value as profit at an infinite return, which
     * is the exact failure `costBasis: number | null` exists to prevent.
     */
    // SCOPED TO THE COST TILE'S OWN TEXT. Struck on the whole page this would
    // fail on any unrelated ₹0 — the top bar's, another tile's — and report the
    // cost tile as fabricating a zero when it is rendering correctly. The tile
    // is its label, its value and its reason, so the window between the label
    // and the reason is exactly the text this claim is about.
    ["cost renders absent with its reason, never as a zero",
      (t) => {
        const tile = /COST BASIS([\s\S]{0,120}?)depository reports no acquisition cost/i.exec(t);
        return !!tile && /—/.test(tile[1]) && !/₹\s*0(?:\.00)?(?![\d,.])/.test(tile[1]);
      }],
    /**
     * THE SECOND-STATEMENT CARD IS GONE, AND THIS ASSERTS THE REMOVAL RATHER
     * THAN DISAPPEARING WITH IT.
     *
     * The page used to carry a card naming the HDFC Bank NSDL scan — four JPEG
     * pages, zero fonts, `no-text-layer` — that holds a second family member's
     * promoter shares. The family asked for it to go, so the assertion INVERTS
     * instead of being deleted alongside the feature, which is the same
     * treatment the removed Public dashboard tab and the `/news` redirects get.
     *
     * It also guards the thing that would actually be dangerous: that scan is
     * still unread, so any share count from it appearing here would be a figure
     * recovered from a document nobody could machine-read.
     */
    ["the removed second-statement card stays removed, and no figure is claimed from the scan",
      (t) => !/could not be read/i.test(t) && !/no text layer/i.test(t) && !/51,?08,?911/.test(t)],

    /**
     * ── THE FIVE THINGS THE FAMILY ASKED THIS PAGE FOR ──────────────────────
     *
     * "Per demat, per holder, pledges, dividends and splits." Three of those
     * are reported by the statements behind this holding and two are not, and
     * the checks below hold each to the standard its own evidence allows:
     * the tables are RECONCILED, and the absences are asserted to stay
     * absences rather than acquiring a zero.
     */

    /**
     * THE PER-DEMAT TABLE ACCOUNTS FOR EVERY SHARE THE STRIP REPORTS.
     *
     * Struck twice over, and the second half is the one that matters. Summing
     * the rendered rows against the rendered tile catches a tile computed
     * independently of the table under it — the Private Market page shipped
     * exactly that, its footer printing a deduped total while every row above
     * carried the double count, each correct on its own terms and no check able
     * to see it. Comparing the tile against `BOOK_POLYCAB` then catches the
     * case that reconciliation cannot: a page that drops the same row from both
     * and agrees with itself perfectly.
     */
    ["the per-demat rows account for every share the strip reports, and the strip for every share in the book",
      (t) => {
        if (!FENCED) return { notChecked: "no ring-fenced holding in the book to reconcile against" };
        const tile = /SHARES HELD\s*\n\s*([\d,]+)/.exec(t);
        if (!tile) return false;
        const strip = Number(tile[1].replace(/,/g, ""));
        const section = sliceBetween(t, "SECURITY\tHOLDER\tDEPOSITORY ACCOUNT", "Per holder");
        const rows = [...section.matchAll(/\t([\d,]{4,})\t(?:₹[^\t\n]+|—)\t(?:₹[^\t\n]+|—)/g)];
        if (!rows.length) return false;
        const summed = rows.reduce((s, m) => s + Number(m[1].replace(/,/g, "")), 0);
        return summed === strip && strip === FENCED.shares;
      }],

    /**
     * ...AND SO DOES THE PER-HOLDER ROLLUP, over the same shares regrouped.
     *
     * A rollup keyed on the wrong field is wrong in one of two directions and
     * both are silent: keyed on the POSITION it reports one member twice for a
     * member holding the block in two demats, and deduped — which a per-owner
     * breakdown must never be (§"consolidated counts once, per-account does
     * not") — it drops a member's row entirely. Reconciling the column against
     * the same total the demat table ties to catches both, and the demat COUNT
     * is compared against the book's distinct accounts so a rollup that reports
     * rows rather than accounts fails here rather than the first time a member
     * holds promoter stock in two places.
     */
    ["the per-holder rollup regroups the same shares, over the book's own count of demats",
      (t) => {
        if (!FENCED) return { notChecked: "no ring-fenced holding in the book to reconcile against" };
        const section = sliceBetween(t, "SHARE OF THE BLOCK", "Pledges, dividends");
        const rows = [...section.matchAll(/\n([^\t\n]+)\t([\d,]+)\t([\d,]+|—)\t([^\t\n]+)\t(?:[\d.]+%|—)/g)];
        if (!rows.length) return false;
        const shares = rows.reduce((s, m) => s + (m[3] === "—" ? 0 : Number(m[3].replace(/,/g, ""))), 0);
        const demats = rows.reduce((s, m) => s + Number(m[2].replace(/,/g, "")), 0);
        return shares === FENCED.shares && demats === FENCED.demats && rows.length === FENCED.holders;
      }],

    /**
     * THE SHARE-OF-BLOCK COLUMN IS AGAINST THE BLOCK, NOT THE PORTFOLIO.
     *
     * This holding is ring-fenced OUT of the portfolio, so a weight struck
     * against consolidated NAV would be arithmetic on two sets that were
     * deliberately separated — and it renders as an ordinary percentage either
     * way. On this book the wrong denominator reads about 1,738%, so the
     * column summing to 100 is what says which figure it is. Rendered weights
     * only: a row whose value is absent renders `—` and must not be counted as
     * a zero, which would make a broken column sum correctly by shrinking.
     */
    ["the share-of-block column is a share OF THE BLOCK — its rendered weights sum to 100%",
      (t) => {
        const section = sliceBetween(t, "SHARE OF THE BLOCK", "Pledges, dividends");
        const weights = [...section.matchAll(/\t([\d.]+)%(?:\n|$)/g)].map((m) => Number(m[1]));
        return weights.length > 0 && Math.abs(weights.reduce((a, b) => a + b, 0) - 100) < 0.1;
      }],

    /**
     * EVERY DEMAT THE BOOK CARRIES THE HOLDING IN IS NAMED ON THE PAGE.
     *
     * "Per demat" is only answered if a reader can tell WHICH demat. The
     * account numbers come from the registry rather than being typed here, so
     * a drop that adds a second promoter statement extends this check by
     * itself; a page rendering one row per account without ever naming one
     * would pass every reconciliation above and answer nothing.
     */
    ["every demat account the book reports the holding in is named on the page",
      (t) => {
        if (!FENCED) return { notChecked: "no ring-fenced holding in the book to reconcile against" };
        const section = sliceBetween(t, "SECURITY\tHOLDER\tDEPOSITORY ACCOUNT", "Per holder");
        return FENCED.accountNos.length > 0 && FENCED.accountNos.every((no) => section.includes(no));
      }],

    /**
     * PLEDGES, DIVIDENDS AND CORPORATE ACTIONS ARE ABSENT — AND NEVER A ZERO.
     *
     * This is the assertion the whole card exists for. An NSDL holding
     * statement prints no pledge, lock-in, earmark or freeze column, and no
     * dividend statement or corporate-benefits report has ever been issued for
     * this demat — so all three are UNREPORTED. The CDSL statements elsewhere
     * in this book do print an encumbrance breakdown, with a measured `0.000`
     * in each column, which is precisely what makes a nil here dangerous: it is
     * a figure this book knows how to report honestly, so an invented one would
     * be indistinguishable from a measured one. On a promoter block "nil
     * pledged" is also the single most consequential zero available to invent.
     *
     * Struck on the REPORTED column's own cells rather than on the card's
     * prose, which renders whatever the data does. Each cell must be an em dash
     * or a real figure; a zero in any of them fails. The check does not require
     * the dash — a drop that finally supplies a dividend fills the cell and
     * still passes — because the claim is "never a fabricated zero", not "always
     * empty".
     */
    ["pledges, dividends and corporate actions each render absent or a real figure, never a fabricated zero",
      (t) => {
        const section = sliceBetween(t, "WHICH DOCUMENT CARRIES IT", "These three are absent");
        const reported = [...section.matchAll(/\n\t([^\t\n]*)\t/g)].map((m) => m[1].trim());
        if (reported.length !== 3) return false;
        return reported.every((c) => c !== "" && !/^(?:₹|Rs\.?\s?)?0(?:[.,]0+)?$/.test(c));
      }],

    /**
     * ...and all three are actually ASKED. The labels are prose and prose
     * cannot fail on its own — which is why this sits beside the cell check
     * above rather than instead of it. What it adds is that the three rows the
     * family named are the three rows rendered: a card that quietly dropped
     * "pledges" would satisfy every figure check on this page by having one
     * fewer figure to get wrong.
     */
    ["the three unreported facts are each named rather than silently omitted",
      (t) => /Pledged, locked-in or earmarked/i.test(t)
        && /Dividends received/i.test(t)
        && /Bonus, splits and spin-offs/i.test(t)],
  ],
  /**
   * ── THE YEAR'S TRADING IS FIVE LINES, NOT FOUR HUNDRED ─────────────────────
   *
   * *"Show the year's transactions as one line per entity / manager /
   * instrument, not a raw tape. I will only see five items … then I can drill
   * down."* The rollup either collapses the tape without losing any of it, or
   * it is a prettier screen that quietly drops trades — and a dropped trade is
   * invisible on a page whose entire purpose is showing fewer rows.
   */
  "monitor-txns": [
    /**
     * THE DEFAULT IS THE ROLLUP. Struck on the arithmetic rather than on the
     * heading: a tape re-labelled would satisfy any prose match, so this asserts
     * the footer counts FEWER groups than the trades they cover.
     */
    ["the tape opens rolled up — far fewer lines than trades",
      (t) => {
        const f = /Total · ([\d,]+) accounts\t([\d,]+)\t/.exec(t);
        if (!f) return false;
        const groups = Number(f[1].replace(/,/g, "")), trades = Number(f[2].replace(/,/g, ""));
        return groups > 0 && trades > groups * 3;
      }],

    /**
     * AND IT LOSES NOTHING. The header's own buy/sell counter is computed off
     * the FILTERED TAPE, on a path that never touches the rollup — so the
     * footer's trade count agreeing with it is a real cross-check rather than a
     * figure compared with its own copy. A rollup that dropped an account, a
     * security or a side fails here and nowhere else on the page.
     */
    ["every trade on the tape reaches the rollup — its footer ties to the tape's own counter",
      (t) => {
        const tape = /([\d,]+) buys · ([\d,]+) sells/.exec(t);
        const foot = /Total · [\d,]+ accounts\t([\d,]+)\t/.exec(t);
        if (!tape || !foot) return false;
        const n = (x) => Number(x.replace(/,/g, ""));
        return n(tape[1]) + n(tape[2]) === n(foot[1]);
      }],

    /**
     * A REALISED TOTAL THAT COVERS SOME OF ITS SELLS SAYS SO. Sixteen of this
     * book's accounts issue no capital gain statement, so the footer's realised
     * figure is struck over a fraction of the sells beside it — and a fraction
     * presented as a whole is the "shown for those and the rest are NAMED" rule
     * failing on a total. The count is rendered next to the figure.
     */
    ["the realised total names the fraction of sells it covers",
      (t) => {
        const m = /Total · [\d,]+ accounts\t[^\n]*?([\d,]+)\/([\d,]+)/.exec(t);
        if (!m) return false;
        const n = (x) => Number(x.replace(/,/g, ""));
        return n(m[1]) > 0 && n(m[1]) < n(m[2]);
      }],

    /**
     * AND A SIDE THAT DID NOT TRADE RENDERS A DASH, NOT ₹0. An account that
     * bought and never sold reported no proceeds; ₹0 says it sold and got
     * nothing. The book has such an account, and this asserts one line carries
     * the dash rather than a zero in its Sold column.
     */
    ["a group that sold nothing shows an em dash in Sold, never a zero",
      (t) => /—/.test(t) && !/₹\s*0(?:\.00)?(?![\d,.])/.test(t)],
  ],

  /**
   * A CARD STILL FETCHING SAYS SO — IT DOES NOT REPORT AN ABSENCE.
   *
   * "No holding in this book carries a day change right now" is a claim about
   * the BOOK, and it used to render on the first paint of every cold open while
   * the quote feed was still in flight. A reader who sees it either believes
   * their book cannot be priced or reloads until it goes away — the same defect
   * this repo already records on the company page, where a panel still fetching
   * asserted the security has no live quote. THE CAUSE PICKS THE HEADLINE.
   */
  "cio-loading": [
    ["the movers card says it is fetching",
      (t) => /Fetching prices…/.test(t)],

    /**
     * ...AND MAKES NO CLAIM ABOUT THE BOOK WHILE IT DOES. Both the settled
     * absence and the feed-failure wording are assertions this page has not
     * earned yet, and either one on a loading card is the bug.
     */
    /**
     * THE WORDING MOVED WITH THE CARD'S SCOPE, AND SO DOES THIS.
     *
     * The settled-absence line reads "No DIRECT-EQUITY holding carries a day
     * change right now" since the movers card was narrowed to direct equity.
     * Matching the old sentence here would pass because the STRING is gone
     * rather than because the CLAIM is — a check that has quietly stopped
     * checking. Both spellings are matched so this cannot silently lapse again
     * if the scope word changes once more.
     */
    ["...and asserts neither an empty book nor a failed feed while it is in flight",
      (t) => !/No (?:direct-equity )?holding (?:in this book )?carries a day change/i.test(t)
        && !/did not respond/i.test(t)],

  ],

  /**
   * THE INDEX TILE INSIDE THE CARD IS HELD TO THE SAME BAR.
   *
   * It printed "Index levels unavailable — the feed did not respond" whenever
   * its feed was null — true before the first response as well as after a
   * failed one. Asserted with the QUOTES answering, because the tile only
   * exists once the card has priced rows.
   *
   * AND STRUCK ON THE CARD'S OWN TEXT, NOT THE PAGE'S. The first draft matched
   * "Fetching index levels…" page-wide and passed against a broken tile: the
   * IndexStrip at the top of every route prints that exact phrase while IT
   * loads. Removing the tile's loading branch changed nothing the check could
   * see — a tautology found by reintroducing the bug, which is the point of
   * doing it.
   */
  /**
   * AN AI ANSWER IS NOT A MEASUREMENT, AND THE PANEL MUST SAY SO.
   *
   * Every figure elsewhere in this app traces to a statement; the chat renders
   * SENTENCES, and there is no `AbsentCell` in a paragraph. So the invariants
   * here are about what the surface says ABOUT ITSELF — that its output is
   * generated, what it was given, and that it can reach nothing else. A reader
   * who cannot tell an answer from a figure is the one failure this whole book
   * is built to prevent, arriving through prose instead of a table.
   */
  chat: [
    ["the panel opens where the search box was",
      () => {
        if (!CHAT) return { notChecked: "the chat walk did not run on this pass" };
        return CHAT.open === true;
      }],

    /**
     * ...AND THE DEAD SEARCH BOX IS GONE. It was an `<input>` with no value, no
     * onChange and no handler — a control that searched nothing, in the most
     * prominent slot on the app. Counted as an INPUT rather than matched as
     * text, because its placeholder could legitimately appear in prose.
     */
    ["...and the control it replaced, which searched nothing, is gone",
      () => {
        if (!CHAT) return { notChecked: "the chat walk did not run on this pass" };
        return CHAT.searchInputs === 0;
      }],

    /**
     * THE ANSWER IS MARKED AS GENERATED, IN WORDS. Not a badge to hover: a
     * reader scanning this panel beside a dashboard of traced figures has to
     * be able to see, without acting, that this text is a different kind of
     * thing.
     */
    ["the panel states plainly that its output is generated, not a statement figure",
      () => {
        if (!CHAT) return { notChecked: "the chat walk did not run on this pass" };
        return /AI ANSWER/i.test(CHAT.text) && /NOT A STATEMENT FIGURE/i.test(CHAT.text);
      }],

    /**
     * ...AND SAYS WHAT IT WAS GIVEN AND WHAT IT CANNOT REACH. An assistant that
     * looks omniscient invites questions it will answer by inventing; one that
     * names its snapshot invites the questions it can actually answer.
     */
    ["...and names its snapshot, and the limits of it",
      () => {
        if (!CHAT) return { notChecked: "the chat walk did not run on this pass" };
        return /snapshot of this dashboard/i.test(CHAT.intro)
          && /does not carry/i.test(CHAT.intro)
          && /cannot reach an account/i.test(CHAT.intro);
      }],

    /**
     * THE SCRIM COVERS THE PAGE, NOT THE BAR IT WAS OPENED FROM.
     *
     * `backdrop-filter` on an ancestor makes that ancestor the containing block
     * for `position: fixed` descendants, and the top bar carries
     * `backdrop-blur` — so `fixed inset-0` resolved against the HEADER and the
     * overlay measured 1304x55. The dashboard underneath was never dimmed, and
     * the reader saw a dialog mixed into the page. The fix is a portal out of
     * the bar; this is the check that it stays out, and it can only be struck
     * on geometry — not one rendered word changes when it regresses.
     */
    ["the overlay covers the viewport, not just the bar it was opened from",
      () => {
        if (!CHAT) return { notChecked: "the chat walk did not run on this pass" };
        const { overlay, viewport } = CHAT;
        if (!overlay) return false;
        return overlay.w >= viewport.w - 2 && overlay.h >= viewport.h - 2;
      }],

    /**
     * ...AND THE PANEL IS SIZED FOR READING. It was 672x614 on a 1500x900
     * window — under half the width, with the dashboard legible all around it.
     * Struck as a FRACTION of the viewport rather than in pixels, so the claim
     * survives a different window and the `--app-zoom` scale.
     */
    ["...and the panel takes a majority of it, rather than floating in the middle of a live page",
      () => {
        if (!CHAT) return { notChecked: "the chat walk did not run on this pass" };
        const { panelBox, viewport } = CHAT;
        if (!panelBox) return false;
        return panelBox.w / viewport.w >= 0.55 && panelBox.h / viewport.h >= 0.7;
      }],

    /**
     * A FAILURE NAMES ITSELF RATHER THAN RENDERING AN EMPTY ANSWER.
     *
     * This harness runs no Pages Function, so the ask 404s — and an empty
     * assistant bubble there reads as the model having considered the question
     * and had nothing. THE CAUSE PICKS THE HEADLINE: it must say the function
     * is not available here, which is a fact about the deployment.
     */
    ["a failed ask names the failure instead of rendering an empty answer",
      () => {
        if (!CHAT) return { notChecked: "the chat walk did not run on this pass" };
        return /server-side function/i.test(CHAT.text) && /not available in local preview/i.test(CHAT.text);
      }],
  ],

  /**
   * REOPENING THE DASHBOARD LANDS ON FIGURES, NOT ON A SPINNER.
   *
   * *"It should show data from the beginning… it can show a small loading
   * written text but never empty."* The loading state above makes a cold open
   * honest; this makes a reopen unnecessary. The walk loads once with the feeds
   * answering, then reloads with them held open, so anything on screen came out
   * of `localStorage`.
   *
   * Nothing is fabricated by that: every stored quote was pulled from the feed
   * at a stated instant, its `ageS` is re-derived on read, and a snapshot older
   * than the session is discarded rather than shown — a day change is struck
   * against the PREVIOUS CLOSE, so yesterday's snapshot would print yesterday's
   * move under a heading reading "Today".
   */
  "cio-cached": [
    ["a reopen with no network renders the day's figures from the stored snapshot",
      () => {
        if (!CACHED) return { notChecked: "the cached-reload walk did not run on this pass" };
        return CACHED.hasFigures === true;
      }],
    ["...and never the empty-book claim, nor a spinner where figures should be",
      () => {
        if (!CACHED) return { notChecked: "the cached-reload walk did not run on this pass" };
        return CACHED.body === false && CACHED.saysLoading === false;
      }],
  ],

  "cio-index-loading": [
    ["the movers card's index tile says it is fetching rather than reporting the feed down",
      (t) => {
        const card = sliceBetween(t, "NSE INDICES · TODAY", "GAINERS");
        return /Fetching index levels…/.test(card) && !/did not respond/.test(card);
      }],
  ],

  /**
   * DIRECT EQUITY IS A NARROWER SET, AND IT IS NOT EMPTY.
   *
   * The family asked for a view holding "all direct buy and sold equity
   * transactions" — the shares they chose themselves, as against the ones a
   * discretionary manager chose. That is `holdingRoute === "own"`, the axis
   * Stage 10L settled, and a filter keyed on it can fail in two directions that
   * look nothing alike on screen: matching nothing renders an empty table that
   * reads as "this family does not trade its own book", and matching everything
   * renders the whole tape under a heading that denies half of it.
   */
  "monitor-txn-direct": [
    ["Direct Equity renders rows, so the filter matched something",
      () => {
        if (!DIRECT) return { notChecked: "the Direct Equity view was not opened on this pass" };
        return DIRECT.rows > 0 && DIRECT.footTrades > 0;
      }],

    /**
     * ...AND IT IS A STRICT SUBSET. Compared against the header's own buy/sell
     * counter, which is computed off the FILTERED TAPE and never touches this
     * view — so a filter that quietly stopped filtering fails here.
     */
    ["...and it is a strict subset of the tape, not the whole of it",
      (t) => {
        if (!DIRECT) return { notChecked: "the Direct Equity view was not opened on this pass" };
        const tape = /([\d,]+) buys · ([\d,]+) sells/.exec(t);
        if (!tape) return false;
        const n = (x) => Number(x.replace(/,/g, ""));
        return DIRECT.footTrades < n(tape[1]) + n(tape[2]);
      }],

    /** The footer is summed from the rows above it, as everywhere else here. */
    ["its footer ties to the rows it renders",
      () => {
        if (!DIRECT) return { notChecked: "the Direct Equity view was not opened on this pass" };
        return DIRECT.rowTrades === DIRECT.footTrades && DIRECT.rows === DIRECT.footSecurities;
      }],

    /**
     * AND IT NAMES WHAT IT LEAVES OUT. This view is narrow for a reason the
     * corpus states — the family's other own-account trading is in demat
     * statements whose movements carry no price and are therefore not trades —
     * and without that line the table reads as a measurement of how little they
     * trade rather than of what this book can see.
     */
    ["...and says why it is narrow, rather than reading as a family that barely trades",
      (t) => /own broking accounts/i.test(t) && /not trades/i.test(t)],
  ],

  /**
   * THE DRILL-DOWN KEEPS EVERY TRANCHE — the other half of the collapse.
   *
   * *"Bandhan mutual fund staggered for the last seven eight months… I want to
   * see that as one line item and then drill down."* A collapsed line that
   * cannot be opened back into its dated rows is a summary, not a rollup, and
   * the two are indistinguishable until someone clicks.
   */
  "monitor-txn-drill": [
    /**
     * THE TAPE COLLAPSES TO FAR FEWER LINES THAN IT HAS TRADES — measured on
     * the DOM the walk actually opened, so a page that rendered every trade as
     * its own "instrument" fails here however the captions read.
     */
    ["expanding every manager still yields far fewer security lines than trades",
      (t) => {
        if (!DRILL) return { notChecked: "the drill-down walk did not run on this pass" };
        const tape = /([\d,]+) buys · ([\d,]+) sells/.exec(t);
        if (!tape) return false;
        const n = (x) => Number(x.replace(/,/g, ""));
        const trades = n(tape[1]) + n(tape[2]);
        return DRILL.groups > 0 && DRILL.instruments > 0 && DRILL.instruments < trades;
      }],

    ["at least one security is a staggered series, collapsed onto one line",
      () => {
        if (!DRILL) return { notChecked: "the drill-down walk did not run on this pass" };
        return DRILL.staggered > 0 && DRILL.staggered < DRILL.instruments;
      }],

    /**
     * ...AND EXPANDS INTO AT LEAST THAT MANY DATED ROWS. The collapsed line
     * claims a span in trading days; the expansion has to produce a row for
     * each. Two figures from different code paths — the day count is
     * `new Set(dates).size` in the rollup, the row count is what React drew —
     * so a truncated expansion fails while a caption match would pass. A series
     * that traded twice on one day legitimately shows MORE rows than days, so
     * the test is that it is never fewer.
     */
    ["...and expands into at least one dated tranche per day it claims",
      () => {
        if (!DRILL) return { notChecked: "the drill-down walk did not run on this pass" };
        return DRILL.openDays > 0 && DRILL.tranches >= DRILL.openDays;
      }],

    /**
     * AND A TRANCHE STATES WHAT IT WAS: quantity AT a unit price. The first
     * draft drew those two across the group table's own columns by position,
     * which put a per-share price under the heading "Bought" and the settled
     * amount under "Sold" — a caption asserting something of a figure that is
     * not true of it, which this book has paid for once already on a Morning
     * CIO tile. They ride with the date now.
     */
    ["each tranche prints its quantity at its unit price, not under another column's heading",
      () => {
        if (!DRILL) return { notChecked: "the drill-down walk did not run on this pass" };
        return DRILL.tranches > 0 && DRILL.trancheWithPrice === DRILL.tranches;
      }],
  ],

  /**
   * A HOLDING WITH NO COST NAMES THE CUSTODIAN THAT DOES NOT REPORT ONE.
   *
   * Struck on BOTH tiles, because the bug was that two of the four tiles on
   * that strip explained themselves and two did not — and on the absence of the
   * old text, so reverting either half fails rather than passing on prose that
   * happens to still be there.
   */
  /**
   * ── THE FUND LOOK-THROUGH ────────────────────────────────────────────────
   *
   * The one card on this site showing figures that are NOT the family's own, so
   * every invariant here is about the reader being able to tell that. Struck on
   * the FIGURES and the labels the page renders, never on the card merely being
   * present.
   */
  "stock-mf-lookthrough": [
    ["it renders the scheme card, naming the scheme and its AMC", (t) =>
      /The scheme — NAV, returns and what it holds/i.test(t) && /matched on (ISIN|name)/i.test(t)],
    /**
     * THE PROVENANCE IS ON THE CARD. These are the only figures on this site
     * that are not the family's own — a reader who takes them for statement
     * figures is wrong about what they can be checked against, and about why
     * they are in no total.
     */
    ["it says the figures are AMFI's and the AMC's, not this family's statement", (t) =>
      /not a statement issued to this family/i.test(t)],
    /**
     * NAV AND ITS DAILY CHANGE, which no mutual fund on this site could show
     * before: a fund resolves to no NSE symbol, so the quote feed never priced
     * one. The change must name the PREVIOUS NAV AND ITS DATE — a fund does not
     * publish on a non-business day, so "since yesterday" would be wrong across
     * a weekend.
     */
    ["the NAV, its change and the previous NAV's own date all render", (t) => {
      const i = t.search(/^NAV$/mi);
      if (i < 0) return false;
      const block = t.slice(i, i + 320);
      return /\d+\.\d{2,4}/.test(block)
        && /[+-]\d+\.\d\d%/.test(block)
        && /since [\d,.]+ on \d{1,2} \w{3,} \d{4}/i.test(block);
    }],
    // THE PLAN IS THE FAMILY'S OWN, resolved from the holding's ISIN — plans
    // differ in expense ratio and therefore NAV, so a NAV from the wrong plan
    // is the wrong number for this holding.
    ["the plan is named and says it came from this holding's ISIN", (t) =>
      /^(Direct|Regular)\b/mi.test(t) && /from this holding's ISIN/i.test(t)],
    /**
     * EVERY RETURN CARRIES THE WINDOW IT ACTUALLY SPANS.
     *
     * The label is the source's and the dates are the measurement, and on this
     * data they do not always agree — Helios's "1M" runs 19 Jun to 1 Sep. A
     * period label rendered alone is the one figure on this card a reader could
     * not check, so the count of windows must match the count of periods.
     */
    ["every return period prints the window it really covers", (t) => {
      const i = t.search(/SCHEME RETURNS/i);
      if (i < 0) return notChecked("this scheme carries no returns in the store on this run");
      const block = t.slice(i, i + 1200);
      const periods = (block.match(/[+-]\d+\.\d%/g) ?? []).length;
      const windows = (block.match(/\d{1,2} \w{3,} \d{4}\s*→\s*\d{1,2} \w{3,} \d{4}/g) ?? []).length;
      return periods > 0 && windows === periods;
    }],
    // WHICH DOCUMENT THE HOLDINGS CAME FROM. The AMC's own filing and a third
    // party's copy of it are different things and the card names which.
    ["the holdings name the document they came from", (t) =>
      /holdings from (the AMC's own disclosure|an aggregator's copy)/i.test(t)],
    // Both as-of dates, since a monthly portfolio and a statement mark rarely
    // coincide.
    ["both as-of dates are printed, the portfolio's and the holding's", (t) =>
      /portfolio\s+\d{1,2} \w{3,} \d{4}\s*·\s*holding\s+\d{1,2} \w{3,} \d{4}/i.test(t)],
    /**
     * THE DERIVED COLUMN RECONSTRUCTS FROM THE PAGE'S OWN FIGURES — the
     * holding's value times the scheme's published weight. A column that
     * silently switched basis fails here rather than looking plausible.
     */
    ["the look-through column is the holding's value times the disclosed weight", (t) => {
      const hv = cr(new RegExp(String.raw`HOLDING VALUE\s*\n\s*` + CR, "i").exec(t)?.[1]);
      const row = /\n[^\n\t]+\t[^\t\n]*\t(\d+\.\d\d)%\t(₹[\d,.]+\s*(?:Cr|L|K)?)\t/.exec(t);
      if (!Number.isFinite(hv)) return notChecked("the holding value did not parse on this run");
      if (!row) return notChecked("this scheme discloses no equity holdings, so there is no look-through row to reconcile");
      const pct = Number(row[1]);
      const shown = crU(/₹([\d,.]+)/.exec(row[2])?.[1], /(Cr|L|K)/.exec(row[2])?.[1]);
      const expect = (hv * pct) / 100;
      return Number.isFinite(shown) && Math.abs(shown - expect) <= Math.max(0.02, expect * 0.02);
    }],
    ["the card states none of it is in any total on the site", (t) =>
      /None of this is in any total on this site/i.test(t) && /count the same money twice/i.test(t)],
  ],
  "stock-nocost": [
    ["Avg cost and Unrealised P&L both name the statement that reports no cost",
      (t) => (t.match(/no cost on the .+? statement for this holding/gi) ?? []).length >= 2],
    ["neither falls back to a second dash or to a basis the figure does not have",
      (t) => !/invested\s*—/.test(t)],
    // The other two tiles on the same strip already did this; asserted here so a
    // future edit cannot fix one pair by breaking the other.
    ["realised P&L and change today still state their own reasons",
      (t) => /no capital gain statement covers this name/i.test(t) && /no live quote|price feed/i.test(t)],
  ],
  /**
   * `/stock/<the ring-fenced key>` LANDS ON THE POLYCAB PAGE, NOT ON A ₹0.
   *
   * Asserted on the RESULTING URL and on the figures that prove which page
   * rendered — matching prose alone would pass on either, and the wrong one
   * here prints a fabricated zero over the family's largest holding.
   */
  "polycab-stock-redirect": [
    ["it redirects to the Polycab page", (_t, ctx) => /\/polycab$/.test(ctx?.url ?? "")],
    ["and renders the holding, never the fully-exited ₹0 branch",
      (t) => /excluded from portfolio totals/i.test(t)
        && !/Position closed/i.test(t) && !/fully exited/i.test(t)],
  ],
  // "on the dashboard there's only one asset class" — the CIO allocation must
  // surface more than equity, and state the listed/private split.
  cio: [
    ["allocation shows more than one asset class (AIF + MF/Cash)", (t) => /\bAIF\b/.test(t) && /(Mutual Fund|Cash)/.test(t)],
  /**
   * ── THE DATED NAV SERIES, AND WHAT IT REFUSES TO CLAIM ────────────────────
   *
   * These are on `cio` rather than `cio-live` because every one of them is
   * driven by `BOOK_NAV_HISTORY`, which is baked into the bundle — the series
   * renders with no feed at all, and only the Nifty 500 comparison line needs
   * one. Each was verified by reintroducing its bug.
   */
  ["the NAV card renders a dated series with its date range and its coverage",
    (t) => /Portfolio NAV vs Nifty 500/.test(t)
      && /\d+ dated points, \d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/.test(t)
      && /\d+ of \d+ accounts/.test(sliceBetween(t, "Portfolio NAV vs Nifty 500", "Both lines are rebased"))],
  /**
   * THE ADJUSTMENT IS LOAD-BEARING, AND THE PAGE PRINTS BOTH FIGURES.
   *
   * The covered set's raw NAV runs +9.30% over this window and ₹11.24 Cr of that
   * is a Fund Deposit into V.E.C 128005 — net of it the book earned +0.54%. A
   * card that charted the raw NAV would show eight points of outperformance
   * against an index that moved 1.33%, none of it earned. So: both percentages
   * must be on screen, and they must DIFFER. A book where they happened to
   * coincide would pass a check that only looked for one of them, which is why
   * the gap is asserted rather than the literal — this is `accountXirr.test.ts`'s
   * "the guard must be load-bearing" rule, on a chart.
   */
  ["the NAV card prints the flow-adjusted return AND the unadjusted one, and they differ",
    (t) => {
      const note = sliceBetween(t, "Both lines are rebased", "The index is taken");
      const pcts = [...note.matchAll(/([+-]\d+\.\d+)%/g)].map((m) => Number(m[1]));
      if (pcts.length < 2) return false;
      return Math.max(...pcts) - Math.min(...pcts) > 1;
    }],
  ["the NAV card names the external capital it nets out, in rupees",
    // MONEY IN ANY SCALE. `CR` matches crore alone, and a drop whose only flow
    // was a few lakh would fail a check about a page that was correct — the
    // "a check that cannot read the figure it asserts on" failure this file
    // already names twice.
    (t) => /nets out\s+₹[\d,.]+\s*(?:Cr|L|K)?\s+of external capital/.test(t)],
  /**
   * A MOVE THAT CANNOT BE SHOWN TO BE PERFORMANCE IS NAMED, WITH ITS ACCOUNTS.
   *
   * Four covered accounts publish no dated capital record and hold more than one
   * security. Silence there would present their whole restatement as a return.
   */
  ["the NAV card names the value whose move is not proven to be performance, and the accounts behind it",
    (t) => /not proven to be performance/.test(t)
      && /₹[\d,.]+\s*(?:Cr|L|K)?[\s\S]{0,80}?not proven to be performance/.test(t)
      && /publish no dated capital record/.test(t)],
  /**
   * "…OR STATE THE ACCOUNTS THAT CANNOT SUPPLY ONE" — the other half of the ask,
   * asserted as a PARTITION rather than as a count. The three lists must account
   * for every account the page's own coverage line says exist: a filter that
   * widened or narrowed one list would keep printing a plausible count and only
   * the partition catches it.
   */
  ["the excluded accounts are listed, and the three lists partition the book",
    (t, ctx) => {
      /**
       * SCOPED TO THE CARD, BECAUSE "N of M accounts" IS NOT UNIQUE ON THIS PAGE.
       *
       * The first draft matched the whole page and picked up the Money-weighted
       * return tile's own coverage line ("7 of 49 accounts") four cards higher,
       * so it compared the XIRR's coverage against the NAV series' exclusions and
       * failed a page that was correct. Two figures of the same SHAPE describing
       * different sets is exactly what a page-wide regex cannot tell apart.
       */
      const card = sliceBetween(t, "Portfolio NAV vs Nifty 500", "Book performance");
      const cov = /(\d+) of (\d+) accounts/.exec(card);
      const ex = /The (\d+) accounts that cannot supply a series/.exec(t);
      const parts = /(\d+) publish exactly one dated valuation/.exec(t);
      const none = /(\d+) publish no valuation at all/.exec(t);
      if (!cov || !ex || !parts || !none) return false;
      // The COUNTS have to partition…
      if (Number(parts[1]) + Number(none[1]) !== Number(ex[1])) return false;
      if (Number(cov[1]) + Number(ex[1]) !== Number(cov[2])) return false;
      // …and the ROWS have to be there. A summary that counted 36 over two
      // empty lists would satisfy the arithmetic and name nobody, which is the
      // half of the request the arithmetic cannot check.
      return ctx.navListRows
        && ctx.navListRows.single === Number(parts[1])
        && ctx.navListRows.unvalued === Number(none[1]);
    }],
  /**
   * WITH NO FEED, THE MOVERS CARD SAYS SO AND PRINTS NO DAY CHANGE.
   *
   * A day change needs a live price and the previous close behind it. `₹0` or
   * `0.00%` here would be a measured flat day for a book nobody priced — the
   * absent-vs-zero rule, on the one figure a reader compares against an index.
   */
  ["with no quote feed, Today's movers states the cause and prints no day change",
    (t) => {
      const card = sliceBetween(t, "Today’s movers", "Allocation by asset class");
      if (!/No direct-equity holding carries a day change/.test(card)) return false;
      if (!/quote feed did not respond|can never have one/.test(card)) return false;
      return !/DIRECT EQUITY · TODAY/i.test(card);
    }],
  /**
   * ── TODAY'S MOVERS IS DIRECT EQUITY, AND THE HEADING SAYS SO ──────────────
   *
   * *"daily movers/losers should comprise of direct equity holdings only."* The
   * scope is asserted on the HEADING and the TILE rather than on the rows,
   * because a rows-only check passes on any day the mandate names happen not to
   * move — and that is most days for a book whose PMS half is 131 names.
   */
  ["Today's movers names its scope in the heading and on the tile",
    (t) => /Today’s movers\s*·\s*Direct Equity/i.test(t)
      && /DIRECT EQUITY · TODAY|No direct-equity holding carries a day change/i.test(t)],
  /**
   * ── THREE CAPTION BLOCKS THE FAMILY ASKED TO REMOVE ───────────────────────
   *
   * The movers footer that explained the ranking, the movers subtitle, and the
   * allocation table's subtitle. Asserted as ABSENCES so a future edit cannot
   * quietly restore them, and paired below with the facts they carried that a
   * reader still acts on — a removal that also removes a load-bearing figure is
   * not the removal that was asked for.
   */
  /**
   * SPLIT ACROSS TWO ROUTES, because half of this text only exists when the feed
   * does. With no quotes the movers card renders its absent state and its footer
   * is never drawn — so a check for that footer's ABSENCE passes here whether the
   * paragraph was removed or not. Reintroducing it proved exactly that: the
   * sentence came back and this route stayed green. The movers half is asserted
   * on `cio-live`, where the card actually renders; the allocation subtitle and
   * the removed card render with no feed at all and stay here.
   */
  ["the removed allocation caption stays removed",
    (t) => !/Shares chosen under a discretionary mandate roll up/.test(t)
      && !/The day’s move on the holdings the feed can price/.test(t)],
  /**
   * ...AND THE TWO FACTS THAT SUBTITLE CARRIED ARE STILL ON THE PAGE.
   *
   * That every return here is CUMULATIVE rather than annualised, and the DATE
   * the figures close at. Both were already stated outside the card — on the
   * Consolidated return tile and on the header's basis pill — which is why the
   * subtitle could go without taking a measurement with it. Asserted so a later
   * tidy-up of either of those cannot leave the table's basis unstated.
   */
  ["...and the basis and as-of that subtitle carried are still on the page",
    (t) => /cumulative, not annualised/i.test(t) && /as of \d{4}-\d{2}-\d{2}/i.test(t)],
  /**
   * ── THE BOOK PERFORMANCE CARD IS REMOVED, AND ITS FIGURES ARE NOT ─────────
   *
   * Both halves, because neither implies the other: a page that dropped the card
   * AND the listed/private split would pass the first check while losing a
   * measurement, and a page that merely renamed the card would pass the second.
   * Stage 10f's rule — a removal is verified by asserting it happened.
   */
  ["the Book performance card is gone", (t) => !/Book performance/i.test(t)
    && !/Listed vs private, on a like-for-like basis/i.test(t)],
  ["...and the listed/private split it carried is still on the page, with both figures",
    (t) => /Listed\s*₹[\d,.]+\s*(?:Cr|L|K)?\s*·\s*Private\s*₹[\d,.]+\s*(?:Cr|L|K)?/.test(t)
      && /Listed \/ Private/i.test(t)],
  ["...and the money-weighted return it carried still has its own tile and coverage",
    (t) => /MONEY-WEIGHTED\s*\n?\s*RETURN/i.test(t) && /\d+ of \d+ accounts/.test(t)],
  /**
   * AND THE ROADMAP DOES NOT PROMISE WHAT SHIPPED. Both of these were chips on
   * the "coming as live data lands" list; a chip for a feature already on the
   * reader's screen is the same defect as an absence recorded against a premise
   * that changed.
   */
  /**
   * ── ONE DESTINATION PER KPI TILE ──────────────────────────────────────────
   *
   * *"there are multiple links on these KPI tiles. Make these KPI tiles
   * clickable and remove all the other links."* The NAV tile carried three
   * addresses — its label, and the listed and private halves in its caption —
   * and Capital invested carried two. A reader had to know which of them
   * answered their question, and the largest target on the tile, the figure
   * itself, went nowhere.
   *
   * Struck on the ANCHORS INSIDE EACH TILE rather than on the page's link list:
   * a page-wide count cannot tell a tile with two links from two tiles with one
   * each, which is exactly the distinction being asserted.
   */
  ["each KPI tile offers exactly one destination", (t, ctx) => {
    if (!ctx?.kpiTiles) return { notChecked: "the KPI strip was not found on this run" };
    if (ctx.kpiTiles.length < 4) return false;
    return ctx.kpiTiles.every((tile) => tile.links.length <= 1);
  }],
  /**
   * ...AND THE TILES THAT HAVE A SET STILL OPEN IT. The rule above is satisfied
   * by a strip with no links at all, which would answer the request by removing
   * the feature — so the destinations are asserted too, by the figure they
   * belong to rather than by a count.
   */
  ["the NAV, Capital invested and money-weighted tiles each open their own set", (t, ctx) => {
    if (!ctx?.kpiTiles) return { notChecked: "the KPI strip was not found on this run" };
    const at = (re) => ctx.kpiTiles.find((x) => re.test(x.label))?.links?.[0] ?? "";
    return /of=book\b/.test(at(/consolidated nav/i))
      && /of=invested\b/.test(at(/capital invested/i))
      && /of=measured\b/.test(at(/money-weighted|xirr/i));
  }],
  /**
   * ...AND NO TILE LINKS AT A SCOPE THAT IS NOW A FACET. `?of=listed`,
   * `?of=private` and `?of=no-cost` still RESOLVE, deliberately, so a bookmark
   * keeps working — which is precisely why their absence from the strip has to
   * be asserted rather than assumed: nothing would break if one came back.
   */
  /**
   * ── NOTHING INSIDE A TILE ADVERTISES ITSELF AS THE THING TO CLICK ─────────
   *
   * *"remove the remaining underlines from the texts, and even the calculation
   * that we're showing that appears when click the underlined no."*
   *
   * The whole card is the target, and it used to carry two rival affordances
   * anyway: a dotted-underlined LABEL and a dashed-underlined FIGURE, the second
   * of which opened a popover. Both said "click this text" about a card where
   * the text is not the thing to click, and the popover then had to be dismissed
   * before the reader could do anything else.
   *
   * Struck on COMPUTED STYLE and on the element count, because the words are
   * identical either way — every figure check on this page passed throughout.
   */
  ["no KPI tile underlines its text or hides arithmetic behind it", (t, ctx) => {
    if (!ctx?.kpiTiles) return { notChecked: "the KPI strip was not found on this run" };
    if (ctx.kpiTiles.length < 4) return false;
    return ctx.kpiTiles.every((tile) => tile.underlined === 0 && tile.buttons === 0);
  }],
  /**
   * ...AND A TILE THAT OPENS SOMETHING LOOKS LIKE A BUTTON, while one that does
   * not still reads as a panel.
   *
   * *"Just make the KPI tiles look like 3-d clickable buttons."* This is the one
   * claim on this page that NO value or text check can reach, and the first
   * draft of the CSS proved why it needs its own: `html:not(.dark) .card` sets a
   * box-shadow of its own further down the stylesheet at equal specificity, so
   * source order decided it and every tile rendered FLAT while the whole sweep
   * stayed green. Asserted on the computed shadow.
   *
   * BOTH DIRECTIONS. A rule that raised every card would satisfy the first half
   * and make the affordance meaningless — a tile that presses under the pointer
   * and then does nothing is a worse lie than a flat one. So the drill-down
   * page's own four tiles, which open nothing, must stay flat (`holdings-book`).
   */
  ["each KPI tile that opens something is raised like a button", (t, ctx) => {
    if (!ctx?.kpiTiles) return { notChecked: "the KPI strip was not found on this run" };
    return ctx.kpiTiles.every((tile) => (tile.links.length > 0) === tile.raised);
  }],
  ["no KPI tile links at a scope that is now a facet", (t, ctx) => {
    if (!ctx?.kpiTiles) return { notChecked: "the KPI strip was not found on this run" };
    return ctx.kpiTiles.every((tile) =>
      tile.links.every((h) => !/[?&]of=(listed|private|no-cost)\b/.test(h)));
  }],
  ["the roadmap no longer lists the index strip or NAV-vs-benchmark as pending",
    (t) => !/Market overview — Nifty/.test(t) && !/NAV vs benchmark/.test(t)],

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
     * After the regroup, Direct Equity reported a cost for 9 of its 38 holdings,
     * so a return on cost read **−18.9%** in a row printing ₹1.22 Cr invested
     * and ₹12,446.1 Cr current. (Ring-fencing Polycab has since taken that row to
     * 9 of 37 and ₹94.9 Cr — the coverage is still nowhere near whole, so the row
     * still correctly refuses a return. The figures above are the ones the bug
     * was found on.) Every figure was right on its own terms and the
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
    /**
     * ── EVERY ALLOCATION ROW OPENS THE HOLDINGS BEHIND IT ────────────────────
     *
     * "Every row of the allocation table on Morning CIO must open the holdings
     * behind it — AIF, PMS mandates, Mutual Fund, Direct Equity and ETF alike."
     *
     * Struck on the LINKS THE PAGE DRAWS, read off the DOM. A sentence saying a
     * drill-down exists is not a route to it, and this file already records a
     * check that matched static prose and therefore could not fail. It counts
     * against the table's OWN row count — the `N buckets held` pill, which the
     * page derives from the book — so a drop that gains a bucket has to gain a
     * link with it rather than passing on a literal written today.
     */
    ["every allocation row links to its own holdings", (t, ctx) => {
      const held = Number(/(\d+) buckets? held/i.exec(t)?.[1] ?? NaN);
      if (!Number.isFinite(held)) return false;
      const rows = (ctx?.hrefs ?? []).filter((h) => /^\/holdings\?of=bucket&key=./.test(h));
      return rows.length === held;
    }],
    // ...AND THE SWEEP HAS AN ADDRESS FOR EVERY ONE OF THEM. `holdings-row-N`
    // walks the Nth allocation row; a book with more buckets than slots would
    // leave the extras unwalked and the sweep would go on reporting clean about
    // rows nothing looked at. A check that quietly stops checking is the
    // failure this file exists to prevent, so it says so instead.
    ["every allocation row is walked by this sweep", (t) => {
      const held = Number(/(\d+) buckets? held/i.exec(t)?.[1] ?? NaN);
      return Number.isFinite(held) && held <= BUCKET_SLOTS.length;
    }],
    // ...AND EACH ONE NAMES A DIFFERENT SET. Six links to one address would
    // satisfy the count above while opening the same holdings six times.
    ["each allocation row opens a different set", (t, ctx) => {
      const rows = (ctx?.hrefs ?? []).filter((h) => /^\/holdings\?of=bucket&key=./.test(h));
      return rows.length > 0 && new Set(rows).size === rows.length;
    }],
    /**
     * THE KPI TILES AND THE CONCENTRATION FIGURES ARE THE SAME FIX, so they are
     * asserted the same way — by the SETS that must be reachable from this page.
     *
     * Named individually rather than counted: a count passes when six links to
     * the wrong six sets are drawn, and the whole point is that the reader can
     * reach the holdings behind THIS figure.
     *
     * ── IT IS STRUCK IN TWO PLACES BECAUSE THE PAIRING MOVED, NOT BECAUSE THE
     *    CLAIM DID ─────────────────────────────────────────────────────────
     *
     * A KPI tile's target is now the WHOLE CARD — a stretched overlay anchor
     * with no inner text — so `ctx.links` yields an empty label for all six and
     * a label-to-href pairing read off the link list can no longer see them. It
     * would have gone on "passing" only by being unable to fail. The pairing for
     * those six lives in `ctx.kpiTiles`, which pairs each tile's own label with
     * the one anchor inside it; the concentration and allocation figures are
     * still text links and are still paired off the link list.
     *
     * AND THE TWO HALVES OF THE BOOK MOVED TO A FACET ADDRESS. `?of=listed` and
     * `?of=private` still resolve for a bookmark, so asserting the OLD address
     * here would keep passing against a page that had lost the toggle entirely.
     */
    ["every KPI tile and concentration figure opens ITS OWN set", (t, ctx) => {
      if (!ctx?.kpiTiles) return { notChecked: "the KPI strip was not found on this run" };
      // PAIRED, label to destination. "The page links to `of=book` somewhere"
      // is satisfied by any one tile and says nothing about the other twelve;
      // this asserts that the figure a reader clicks opens the set that figure
      // is summed over. Each entry is [what the reader clicks, where it goes].
      const tiles = [
        [/^consolidated nav$/i, "/holdings?of=book"],
        [/^capital invested$/i, "/holdings?of=invested"],
        [/^(money-weighted return|xirr \(annualised\))$/i, "/holdings?of=measured"],
        [/^consolidated return$/i, "/holdings?of=invested"],
      ];
      const texts = [
        [/^positions$/i, "/holdings?of=book"],
        [/^distinct names$/i, "/holdings?of=book"],
        [/^cross-held$/i, "/holdings?of=cross-held"],
        [/^top-10 conc\.?$/i, "/holdings?of=top-names"],
        [/^listed$/i, "/holdings?of=book&facet=listed"],
        [/^private$/i, "/holdings?of=book&facet=private"],
        [/^winners$/i, "/holdings?of=winners"],
        [/^losers$/i, "/holdings?of=losers"],
      ];
      const links = ctx?.links ?? [];
      return tiles.every(([label, href]) =>
        ctx.kpiTiles.some((tile) => label.test(tile.label) && tile.links[0] === href))
        && texts.every(([label, href]) => links.some((l) => label.test(l.text) && l.href === href));
    }],
    /**
     * ...AND THE 60 POSITIONS WITH NO COST ARE STILL NAMED ON THE TILE THAT
     * LEAVES THEM OUT. They used to be a SECOND link inside Capital invested and
     * are a facet of that tile's own page now — which is the whole request — so
     * what has to survive here is the SENTENCE, not the anchor. Without it the
     * reader is never told the set exists, and no toggle three clicks away tells
     * them: the answer decides whether they chase a custodian for a cost
     * statement or accept a permanent absence. That the facet itself resolves is
     * asserted where `holdings-invested` is walked.
     */
    ["the Capital invested tile still names the positions reporting no cost", (t) =>
      /positions? worth ₹[\d,.]+\s*(?:Cr|L|K)? carry no cost/i.test(t)],
    /**
     * THE COMMITMENT TILES REACH THE CAPITAL ACCOUNTS, NOT A HOLDINGS TABLE.
     *
     * Undrawn capital is not a holding — it has no row in `BOOK_POSITIONS` — so
     * a holdings drill-down structurally cannot contain it and would open a
     * table that could only ever be empty. Asserted by PAIRING the tile with its
     * destination: an earlier draft counted `/private-market` links instead and
     * passed while the Dry powder tile pointed at the holdings page, because the
     * Capital deployment card's own link kept the count up. Reintroducing that
     * bug is what found it.
     */
    ["the commitment figures open the capital accounts, not a holdings table", (t, ctx) => {
      if (!/DRY POWDER[\s\S]{0,40}₹/i.test(t)) return notChecked("this book reports no capital commitment, so the tiles are absent and carry no link");
      if (!ctx?.kpiTiles) return { notChecked: "the KPI strip was not found on this run" };
      const links = ctx?.links ?? [];
      // Two of the three are KPI TILES, whose target is the whole card and whose
      // anchor therefore carries no text — see the invariant above. Fund
      // commitments sits on the Capital deployment card and is still a text
      // link, so the same claim is struck in the two places the pairing lives.
      return [/^dry powder$/i, /^distributions$/i]
        .every((label) => ctx.kpiTiles.some((tile) => label.test(tile.label) && tile.links[0] === "/private-market"))
        && links.some((l) => /^fund commitments$/i.test(l.text) && l.href === "/private-market");
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
  /**
   * ── THE ALLOCATION ROW'S OWN DRILL-DOWN ──────────────────────────────────
   *
   * The address is the link Morning CIO drew for its largest bucket, and every
   * assertion here compares this page against WHAT THAT ROW PRINTED. That
   * comparison is the whole value of the route: each page is internally
   * consistent whichever set it shows, so a drill-down listing the wrong
   * holdings is invisible from either screen alone and obvious from both.
   */
  "holdings-row": [
    ["it opened the row Morning CIO linked, and says which figure it stands behind", (t, ctx) => {
      const key = bucketKeyOf(ctx);
      if (!key) return notChecked("Morning CIO drew no allocation link for this slot — the book has fewer buckets than the sweep has slots");
      return new RegExp(`behind the ${esc(key)} row`, "i").test(t) && new RegExp(`^${esc(key)}$`, "m").test(t);
    }],
    /**
     * ITS TOTAL IS THE CELL THE READER CLICKED. Bounded at the printing
     * precision — both figures render to one decimal in Cr, so they can differ
     * by rounding and by nothing else. A fraction-of-the-book bound would allow
     * crores of drift and swallow the exact error it exists to catch.
     */
    ["its market value reproduces that row's Current cell", (t, ctx) => {
      const key = bucketKeyOf(ctx);
      const row = key && CIO_ALLOCATION.get(key);
      if (!row) return notChecked(key ? `Morning CIO's "${key}" row did not parse on this run` : "the book has fewer buckets than the sweep has slots");
      const here = drilldownTotal(t), there = money2cr(row.current);
      return [here, there].every(Number.isFinite) && Math.abs(here - there) <= 0.15;
    }],
    ["...and its Invested cell, or both are absent together", (t, ctx) => {
      const key = bucketKeyOf(ctx);
      const row = key && CIO_ALLOCATION.get(key);
      if (!row) return notChecked(key ? `Morning CIO's "${key}" row did not parse on this run` : "the book has fewer buckets than the sweep has slots");
      const there = money2cr(row.invested);
      const here = money2cr(tileValue(t, "INVESTED"));
      // AN EM DASH ON ONE SIDE AND A FIGURE ON THE OTHER IS THE FAILURE. A row
      // whose statements report no cost must not acquire one by being opened.
      if (!Number.isFinite(there)) return !Number.isFinite(here);
      return Number.isFinite(here) && Math.abs(here - there) <= 0.15;
    }],
    /**
     * AND THE RETURN IS REFUSED ON EXACTLY THE ROWS MORNING CIO REFUSES IT ON.
     *
     * This is the invariant the page most needs. Three of six allocation rows
     * print an em dash because their Invested column covers a minority of their
     * holdings; a drill-down opening from that dash and printing a percentage
     * would be the two screens contradicting each other on the reader's own
     * click, with the specific figure — the one they went looking for — being
     * the wrong one.
     */
    ["the return is struck here only where that row struck one", (t, ctx) => {
      const key = bucketKeyOf(ctx);
      const row = key && CIO_ALLOCATION.get(key);
      if (!row) return notChecked(key ? `Morning CIO's "${key}" row did not parse on this run` : "the book has fewer buckets than the sweep has slots");
      const rowPct = /([+-]\d+\.\d)%/.exec(row.ret ?? "")?.[1];
      const herePct = /([+-]\d+\.\d)%/.exec(tileValue(t, "RETURN ON COST") ?? "")?.[1];
      if (rowPct == null) return herePct == null;
      return herePct != null && Math.abs(Number(herePct) - Number(rowPct)) <= 0.15;
    }],
    // A REFUSED FIGURE STILL HAS TO SAY WHY. An em dash with no cause is the
    // "second dash" failure the stock page was fixed for.
    ["a refused return names its cause", (t) =>
      tileValue(t, "RETURN ON COST") !== "—"
      || /(divide one set of holdings by another|nothing to strike a return against|measured figure, not a missing one|no unrealised gain)/i.test(t)],
  ],
  /**
   * ── THE WHOLE BOOK, WHICH IS THREE CONCENTRATION FIGURES AT ONCE ─────────
   *
   * Consolidated NAV, Positions and Distinct names are one set counted three
   * ways, so this page has to reproduce all three — and REFUSE a whole-book
   * return, because its Invested column covers 309 of 369 rows. That refusal is
   * the same one Morning CIO's own allocation footer makes, and a drill-down
   * that printed a percentage there would contradict the footer it opened from.
   */
  "holdings-book": [
    /**
     * ── THE TWO HALVES ARE A TOGGLE ON THIS PAGE ─────────────────────────────
     *
     * *"the listed/private book links and pages should not exist separately…
     * just give the toggle option inside the Consolidated NAV link page."* Every
     * other invariant on this page and on the two halves is a FIGURE check, and
     * every one of them passed while the halves were separate scopes reached
     * from two extra links inside the NAV tile — so none of them can see the
     * thing that was asked for. This is struck on the control.
     */
    ["the listed and private halves are a toggle on this page", (t, ctx) => {
      const g = facetsOr(ctx, BOOK_HAS_BOTH_HALVES(), "this book reports only one of the two halves, so there is nothing to toggle between");
      if (g !== null) return g;
      return ctx.facets.length === 3
        && /whole book|every holding|all holdings/i.test(ctx.facets[0].label)
        && ctx.facets.some((f) => /^listed/i.test(f.label))
        && ctx.facets.some((f) => /^private/i.test(f.label));
    }],
    /**
     * ...AND IT OPENS ON THE WHOLE BOOK. A toggle defaulting to a half would
     * put a NARROWED figure under a tile that reads Consolidated NAV — the
     * caption-that-does-not-describe-its-figure failure, arriving through a
     * control's initial state. The value checks below cannot see it: they would
     * simply reproduce the half and compare it against the wrong figure.
     */
    ["it opens on the whole book, not on a half", (t, ctx) => {
      const g = facetsOr(ctx, BOOK_HAS_BOTH_HALVES(), "this book reports only one of the two halves, so there is nothing to toggle between");
      if (g !== null) return g;
      return ctx.facets[0]?.active === true && ctx.facets.filter((f) => f.active).length === 1;
    }],
    /**
     * ...AND THE COUNTS ON THE TOGGLE PARTITION THE BOOK. The halves' own pages
     * already assert this against each other; this asserts it on the numbers
     * printed BEFORE a reader clicks, which is where they choose. A toggle whose
     * counts disagree with the pages behind it is the two-figures-for-one-set
     * contradiction this repo keeps paying for.
     */
    ["the toggle's own counts partition the book", (t, ctx) => {
      const g = facetsOr(ctx, BOOK_HAS_BOTH_HALVES(), "this book reports only one of the two halves, so there is nothing to toggle between");
      if (g !== null) return g;
      const [whole, ...halves] = ctx.facets;
      if (!whole || !Number.isFinite(whole.rows)) return false;
      return halves.every((f) => Number.isFinite(f.rows))
        && halves.reduce((a, f) => a + f.rows, 0) === whole.rows;
    }],
    /**
     * A TILE THAT OPENS NOTHING STAYS FLAT. The other half of Morning CIO's
     * raised-tile claim, struck where the flat tiles are: this page's four
     * summary tiles carry no href, so a stylesheet that raised every `.card`
     * would pass the strip's check and fail here.
     */
    ["its own summary tiles are not dressed as buttons", (t, ctx) => {
      if (!ctx?.metrics?.flatCards) return { notChecked: "no card geometry was captured on this run" };
      return ctx.metrics.flatCards.raisedWithoutLink === 0;
    }],
    /**
     * ── THE ARITHMETIC LANDED HERE ───────────────────────────────────────────
     *
     * *"even the calculation … we can show that inside the clickable KPI
     * pages."* Asserted as three separate things because each fails on its own:
     * the card exists, it carries a WORKED example (an expression with no
     * numbers in it explains nothing a reader clicked to find out), and the
     * worked example is struck on THIS page's rows.
     *
     * That last one is the whole point and the only one that can catch a real
     * regression: `drilldownFormula` reads `d.rows`, which is the ACTIVE FACET,
     * so a version that summed the whole scope would print the book's total on
     * the private half — a caption not describing its own figure, which is the
     * failure this repo has already paid for on the Capital invested tile. It is
     * compared against the page's OWN rendered total rather than against a
     * literal, so it stays true when the next drop moves the book.
     */
    ["the arithmetic behind the figure is on this page, not behind a click", (t, ctx) =>
      !!ctx?.formula && /Σ market value/.test(ctx.formula.text) && ctx.formula.worked.length > 0],
    ["its worked example ties to the total this page prints", (t, ctx) => {
      if (!ctx?.formula?.worked) return false;
      const here = drilldownTotal(t), worked = money2cr(/(₹[\d,.]+\s*(?:Cr|L|K)?)/.exec(ctx.formula.worked)?.[1]);
      if (!Number.isFinite(here)) return notChecked("this page printed no total on this run");
      return Number.isFinite(worked) && Math.abs(worked - here) <= 0.15;
    }],
    ["its market value reproduces the Consolidated NAV", (t) => {
      const nav = CIO_FIGURES.get("nav"), here = drilldownTotal(t);
      if (!Number.isFinite(nav)) return notChecked("Morning CIO's NAV tile did not parse on this run");
      return Number.isFinite(here) && Math.abs(here - nav) <= 0.15;
    }],
    ["its two counts reproduce Positions and Distinct names", (t) => {
      const c = drilldownCounts(t);
      const pos = CIO_FIGURES.get("positions"), names = CIO_FIGURES.get("names");
      if (!Number.isFinite(pos) || !Number.isFinite(names)) return notChecked("Morning CIO's concentration counts did not parse on this run");
      return c != null && c.holdings === pos && c.names === names;
    }],
    // THE WHOLE-BOOK RETURN STAYS REFUSED. 60 positions are in Value and in no
    // Invested, so a percentage across the two columns would divide one set of
    // holdings by another — which is the contradiction the allocation footer
    // was fixed for, arriving one click deeper.
    ["no whole-book return is struck where the cost side does not cover it", (t) =>
      tileValue(t, "RETURN ON COST") === "—" && /divide one set of holdings by another/i.test(t)],
    // Its footer is summed FROM its rows, so the two must agree. A footer
    // computed beside its table rather than from it is the tautology this repo
    // found on the Private Market page, where the rows carried a double count
    // the footer correctly did not and no check could see it.
    /**
     * IT IS A WAY INTO THE MANDATE DRILL-DOWN, NOT A REPLACEMENT FOR IT.
     *
     * A share a discretionary manager chose belongs inside that manager's
     * mandate — the page the family asked for three times — so a drill-down
     * that flattened 281 mandate-held shares into one undifferentiated list
     * would be re-committing the grouping mistake one screen over. Every
     * mandate in the set is summarised and linked, and the count is checked
     * against the mandates the book actually has rather than a literal.
     */
    ["every mandate in the book is one row, linked to its own page", (t, ctx) => {
      if (!Number.isFinite(MANDATE_COUNT)) return notChecked("this book carries no discretionary mandate");
      const links = new Set((ctx?.hrefs ?? []).filter((h) => /^\/mandate\/./.test(h)));
      return links.size === MANDATE_COUNT;
    }],
    /**
     * THE WHOLE BOOK DOES form mandate rows, which is the other side of the
     * check on the winners page — and its table is a MIX, so its footer counts
     * rows rather than claiming either noun. Both are asserted because a page
     * that grouped nothing would pass the winners check while failing readers
     * here, and one that grouped everything would pass here and mislabel a
     * filtered set there.
     */
    ["the whole book forms mandate rows and says its table is mixed", (t) => {
      const table = tableRows(t), pos = CIO_FIGURES.get("positions");
      if (!table || !Number.isFinite(pos)) return notChecked("the footer or Morning CIO's Positions count did not parse on this run");
      return table.unit === "row" && table.n < pos;
    }],
    ["the table's footer ties to the tile above it", (t) => {
      const tile = drilldownTotal(t);
      const foot = money2cr(new RegExp(String.raw`Total · [\d,]+ [a-z]+\s*\t?\s*(?:—|₹[\d,.]+\s*(?:Cr|L|K)?)\s*\t?\s*(₹[\d,.]+\s*(?:Cr|L|K)?)`, "i").exec(t)?.[1]);
      if (!Number.isFinite(foot)) return notChecked("the holdings table's footer did not parse on this run");
      return Number.isFinite(tile) && Math.abs(tile - foot) <= 0.15;
    }],
  ],
  /**
   * ── THE CONCENTRATION FIGURES' OWN DRILL-DOWNS ───────────────────────────
   *
   * Each compares the destination against the figure the reader clicked. The
   * `cio` route already asserts the LABEL is paired with the DESTINATION; this
   * is the other half, and neither implies the other — a correctly-labelled
   * link to a page listing the wrong set passes the first and fails a reader.
   */
  "holdings-crossheld": [
    ["its name count reproduces the Cross-held figure", (t) => {
      const there = CIO_FIGURES.get("crossHeld"), c = drilldownCounts(t);
      if (!Number.isFinite(there)) return notChecked("Morning CIO's Cross-held figure did not parse on this run");
      return c != null && c.names === there;
    }],
    // ...and every name here really is held by two or more entities, which is
    // what distinguishes a cross-held name from a DUPLICATE the consolidated set
    // has already collapsed.
    ["the page separates cross-held from the duplicate policy", (t) =>
      /counted once per member/i.test(t) && /already collapsed/i.test(t)],
  ],
  "holdings-topnames": [
    ["its value reproduces the Top-10 concentration share", (t) => {
      const pct = CIO_FIGURES.get("top10Pct"), nav = CIO_FIGURES.get("nav"), here = drilldownTotal(t);
      if (![pct, nav].every(Number.isFinite)) return notChecked("Morning CIO's Top-10 figure did not parse on this run");
      // The card prints the share to a whole percent, so the bound is half of
      // one — reconstructed from the two figures rather than compared to a
      // literal, which would go stale the next drop.
      return Number.isFinite(here) && Math.abs((here / nav) * 100 - pct) <= 0.5;
    }],
    ["it lists exactly the names the figure covers", (t) => {
      const c = drilldownCounts(t);
      const said = Number(/The (\d+) largest names/i.exec(t)?.[1] ?? NaN);
      return c != null && Number.isFinite(said) && c.names === said;
    }],
  ],
  /**
   * LISTED AND PRIVATE ARE ONE SPLIT, so each half is checked against the NAV
   * it came out of rather than against itself. Asserted from both ends: a page
   * showing the wrong half passes a check that only looks at its own figure.
   */
  "holdings-listed": [
    ["its value reproduces the listed half the NAV caption states", (t) => {
      const there = CIO_FIGURES.get("listed"), here = drilldownTotal(t);
      if (!Number.isFinite(there)) return notChecked("Morning CIO's listed/private caption did not parse on this run");
      return Number.isFinite(here) && Math.abs(here - there) <= 0.15;
    }],
    ["it carries holdings, and fewer than the whole book", (t) => {
      const c = drilldownCounts(t), pos = CIO_FIGURES.get("positions");
      if (!Number.isFinite(pos)) return notChecked("Morning CIO's Positions count did not parse on this run");
      return c != null && c.holdings > 0 && c.holdings < pos;
    }],
    /**
     * THE OTHER HALF IS ONE CLICK AWAY FROM HERE, AND SO IS THE WHOLE BOOK.
     *
     * This is the half of the request the figures cannot see. A reader who
     * opened the listed half and wants the private one must not have to go back
     * to Morning CIO to find it — that is the "two pages that exist separately"
     * arrangement, with the toggle merely drawn somewhere else. Struck on the
     * toggle this page draws, with THIS half current so the control also says
     * where the reader is.
     */
    ["the private half and the whole book are one click away from here", (t, ctx) => {
      // This route resolves ONLY from a `facet=listed` address the book drew, so
      // reaching it at all is the evidence that both halves exist.
      const g = facetsOr(ctx, true, "");
      if (g !== null) return g;
      const here = ctx.facets.find((f) => f.active);
      return !!here && /^listed/i.test(here.label)
        && ctx.facets.some((f) => /^private/i.test(f.label) && /facet=private/.test(f.href))
        // ...and back to the undivided book. Identified by the facet it names,
        // never by the SHAPE of its address: the whole-book half is written
        // `facet=all` rather than as a bare scope, and a check keyed on that
        // spelling asserts a URL convention instead of the reader's route.
        && ctx.facets.some((f) => !f.active && /whole book|every holding|all holdings/i.test(f.label));
    }],
  ],
  "holdings-private": [
    ["its value reproduces the private half the NAV caption states", (t) => {
      const there = CIO_FIGURES.get("private"), here = drilldownTotal(t);
      if (!Number.isFinite(there)) return notChecked("Morning CIO's listed/private caption did not parse on this run");
      return Number.isFinite(here) && Math.abs(here - there) <= 0.15;
    }],
    /**
     * THE TWO HALVES PARTITION THE BOOK — every holding in exactly one of them.
     *
     * Asserted on the COUNTS as well as the values, because the two answer
     * different failures: a widened filter that put a holding in both halves
     * moves the counts and can leave the values looking plausible, and a
     * narrowed one drops rows from both. Neither page can make this claim
     * alone, which is why the listed half's own figures are carried here.
     */
    ["the two halves hold every position between them, and none twice", (t) => {
      const here = drilldownCounts(t), listed = DRILLDOWN_COUNTS.get("holdings-listed");
      const pos = CIO_FIGURES.get("positions");
      if (!listed || !Number.isFinite(pos)) return notChecked("the listed half's counts were not captured on this run");
      return here != null && here.holdings + listed.holdings === pos;
    }],
    /**
     * THE WORKED EXAMPLE IS THE HALF'S OWN, NOT THE BOOK'S. The single most
     * likely regression in moving the arithmetic out of a popover: a formula
     * summed over the SCOPE rather than the active facet reads correct on the
     * undivided page and prints ₹710 Cr under a heading saying "Private".
     * Struck against this page's own total, which is the private half's.
     */
    ["its worked example is the private half's, not the whole book's", (t, ctx) => {
      if (!ctx?.formula?.worked) return false;
      const here = drilldownTotal(t), worked = money2cr(/(₹[\d,.]+\s*(?:Cr|L|K)?)/.exec(ctx.formula.worked)?.[1]);
      const nav = CIO_FIGURES.get("nav");
      if (!Number.isFinite(here)) return notChecked("this page printed no total on this run");
      return Number.isFinite(worked) && Math.abs(worked - here) <= 0.15
        && (!Number.isFinite(nav) || Math.abs(worked - nav) > 0.15);
    }],
    ["the two halves reconstruct the NAV between them", (t) => {
      const nav = CIO_FIGURES.get("nav"), listed = CIO_FIGURES.get("listed"), here = drilldownTotal(t);
      if (![nav, listed].every(Number.isFinite)) return notChecked("Morning CIO's NAV or listed figure did not parse on this run");
      return Number.isFinite(here) && Math.abs(listed + here - nav) <= 0.3;
    }],
  ],
  /**
   * WINNERS AND LOSERS DO NOT ADD TO THE BOOK, and the pages say so. A holding
   * exactly at cost is in neither; one whose cost the statements do not report
   * has no return to sort on at all. Both sets are named on the page rather than
   * left for a reader to discover by subtracting.
   */
  "holdings-winners": [
    ["its count reproduces the Winners figure", (t) => {
      const there = CIO_FIGURES.get("winners"), c = drilldownCounts(t);
      if (!Number.isFinite(there)) return notChecked("Morning CIO's winners/losers figure did not parse on this run");
      return c != null && c.holdings === there;
    }],
    /**
     * THE HOLDINGS IN NEITHER COUNT ARE NAMED, NOT DROPPED — and they are named
     * on the TOGGLE now rather than in a companion table below the rows, so the
     * check moved with them. It used to match the companion's prose, which is
     * the weaker claim: a page can print that sentence over an empty table. This
     * reads the facet's own row count, so the set has to actually be reachable.
     *
     * A holding exactly at cost and one whose cost the statements do not report
     * are both here, which is what lets Morning CIO's two counts be reconciled
     * against the book instead of assumed to cover it.
     */
    ["the holdings in neither count are named, not dropped", (t, ctx) => {
      if (!ctx?.facets) return false;
      const neither = ctx.facets.find((f) => /in neither count/i.test(f.label));
      if (!neither) return notChecked("every priced holding in this book falls on one side or the other, so there is no third set");
      return Number.isFinite(neither.rows) && neither.rows > 0 && /facet=neither/.test(neither.href);
    }],
    /**
     * A FILTERED SET FORMS NO MANDATE ROW.
     *
     * A mandate is one row only where the set holds ALL of it, because a row
     * carrying a manager's name over a subset of what they hold is the "caption
     * asserts what a named counterparty reports" failure this repo has already
     * paid for once — and its total would tie to no document. Winners is a
     * filtered set by construction, so its footer must count NAMES. Struck on
     * the footer's own noun, which the page derives from the rows it drew.
     */
    ["no partial mandate is drawn as a mandate row", (t) => {
      const table = tableRows(t);
      if (!table) return notChecked("the holdings table's footer did not parse on this run");
      return table.unit === "name";
    }],
  ],
  "holdings-losers": [
    ["its count reproduces the losers figure", (t) => {
      const there = CIO_FIGURES.get("losers"), c = drilldownCounts(t);
      if (!Number.isFinite(there)) return notChecked("Morning CIO's winners/losers figure did not parse on this run");
      return c != null && c.holdings === there;
    }],
    // AND THE TWO SETS ARE DISJOINT AND SMALLER THAN THE BOOK. Winners + losers
    // adding to the position count would mean something was double-counted or
    // the at-cost and uncosted holdings were swept into one side.
    ["winners and losers together are fewer than the book's positions", (t) => {
      const w = CIO_FIGURES.get("winners"), l = CIO_FIGURES.get("losers"), pos = CIO_FIGURES.get("positions");
      if (![w, l, pos].every(Number.isFinite)) return notChecked("Morning CIO's concentration counts did not parse on this run");
      return w + l < pos;
    }],
  ],
  /**
   * ── THE ONE SCOPE THAT MUST NOT DEDUPE ───────────────────────────────────
   *
   * The money-weighted return closes each account against the market value ITS
   * OWN STATEMENT prints, so its coverage is a PER-ACCOUNT figure. Collapsing a
   * holding two accounts both report would take it off whichever lost the
   * collapse and put this page below the coverage its own tile states. No
   * account carrying a duplicate publishes an opening portfolio value in this
   * drop, so the two agree today — which is exactly the condition under which
   * the mistake is invisible, and why the page says which basis it is on.
   */
  "holdings-measured": [
    ["its market value reproduces the coverage the money-weighted tile states", (t) => {
      const cov = CIO_FIGURES.get("measured"), here = drilldownTotal(t);
      if (!Number.isFinite(cov)) return notChecked("Morning CIO's money-weighted tile states no coverage on this run");
      return Number.isFinite(here) && Math.abs(here - cov) <= 0.15;
    }],
    ["it states that it is per-account and not consolidated", (t) => /as printed\s*·\s*per account/i.test(t)],
    // AND IT NAMES WHAT IT LEAVES OUT. A figure that exists for some accounts is
    // shown for those and the rest are named — the coverage line on the tile is
    // only half of that rule if the drill-down then hides them.
    ["the accounts outside the figure are named, not dropped", (t) =>
      /\d+ accounts outside this figure/i.test(t) && /\d{4,}/.test(t)],
  ],
  /**
   * ── THE CAPITAL INVESTED PAGE, WHICH WAS NEVER WALKED ────────────────────
   *
   * Only its cost-less half was, back when that half was a scope of its own —
   * so the set the tile's own figure is summed over had no page under test at
   * all, and the toggle that now reaches the other half is the only route to it.
   */
  "holdings-invested": [
    ["its market value covers the holdings that report a cost", (t) => {
      const c = drilldownCounts(t);
      return c != null && c.holdings > 0;
    }],
    /**
     * IT OPENS ON THE COSTED SET, because the tile it opens from reads Capital
     * invested. A toggle defaulting to the other half would put the holdings
     * that report NO cost under that heading — the whole of the figure's
     * complement, under the figure's own name.
     */
    ["it opens on the holdings that report a cost", (t, ctx) => {
      const g = facetsOr(ctx, TILE_NAMES_COSTLESS(), "every holding in this book reports a cost, so there is nothing to toggle between");
      if (g !== null) return g;
      return ctx.facets[0]?.active === true && /reports a cost/i.test(ctx.facets[0].label);
    }],
    /**
     * ...AND THE COST-LESS SET IS A TOGGLE HERE. This is the assertion the
     * Morning CIO invariant defers to: that tile no longer carries a second
     * link, so if this toggle went the 60 positions would be named on screen
     * and reachable from nowhere in the app.
     */
    ["the holdings reporting no cost are one click away, with their count", (t, ctx) => {
      const g = facetsOr(ctx, TILE_NAMES_COSTLESS(), "every holding in this book reports a cost, so there is nothing to toggle between");
      if (g !== null) return g;
      const none = ctx.facets.find((f) => /reports none/i.test(f.label));
      if (!none) return notChecked("every holding in this book reports a cost, so there is no second facet");
      return /facet=no-cost/.test(none.href) && Number.isFinite(none.rows) && none.rows > 0;
    }],
    /**
     * ...AND THE TWO SIDES PARTITION THE BOOK. `sumOrNull` skips a missing cost
     * rather than entering it as zero, so costed + cost-less is every holding —
     * and the toggle's own printed counts are where a reader sees it. Held
     * against Morning CIO's Positions count so the two pages cannot drift into
     * agreeing with each other about a set neither has right.
     */
    ["the two sides of the toggle account for every position", (t, ctx) => {
      const g = facetsOr(ctx, TILE_NAMES_COSTLESS(), "every holding in this book reports a cost, so there is nothing to toggle between");
      if (g !== null) return g;
      const pos = CIO_FIGURES.get("positions");
      if (!Number.isFinite(pos)) return notChecked("Morning CIO's Positions count did not parse on this run");
      return ctx.facets.every((f) => Number.isFinite(f.rows))
        && ctx.facets.reduce((a, f) => a + f.rows, 0) === pos;
    }],
  ],
  /**
   * ── THE 60 POSITIONS THE CAPITAL INVESTED TILE LEAVES OUT ────────────────
   *
   * Reachable at last, which is the other half of naming them: a reader told
   * that 60 positions worth ₹165.9 Cr carry no cost had no way to find out
   * WHICH, and the answer decides whether they chase a custodian for a cost
   * statement or accept a permanent absence.
   */
  "holdings-nocost": [
    ["its market value reproduces the figure the tile's coverage line names", (t) => {
      const there = CIO_FIGURES.get("no-cost"), here = drilldownTotal(t);
      if (!Number.isFinite(there)) return notChecked("Morning CIO reports no position without a cost on this run");
      return Number.isFinite(here) && Math.abs(here - there) <= 0.15;
    }],
    // EVERY MONETARY FIGURE ABOUT COST IS ABSENT HERE, NOT ZERO. This is the
    // page where a ₹0 would be worst: it would report the whole of ₹165.9 Cr as
    // profit at an infinite return, which is the exact failure `costBasis:
    // number | null` exists to prevent.
    ["invested, P&L and return are all absent with reasons — never ₹0", (t) =>
      ["INVESTED", "UNREALISED P&L", "RETURN ON COST"].every((l) => tileValue(t, l) === "—")
      && /absent, not zero/i.test(t)
      && /nothing to strike a return against/i.test(t)],
    // ...and the rows say WHICH custodian does not report a cost, per holding —
    // the fix the stock page already carries, arriving on the page that lists
    // every one of them.
    /**
     * EVERY DASHED COST CELL NAMES A CAUSE, AND MOST NAME A CUSTODIAN.
     *
     * Counted against the TABLE'S OWN ROWS, not against the caption's holdings
     * count — the table groups a name held in several accounts into one row, so
     * 60 holdings draw 52 rows and a check keyed on 60 reports a page that is
     * rendering correctly as broken. It accepts both honest wordings: a row
     * standing on one statement names that custodian, and a row spanning several
     * says how many report none. Anything else is a bare dash, which is the one
     * thing that leaves a reader unable to tell a custodian who does not report
     * a cost from a dashboard that is broken.
     */
    ["every row's dashed cost names its cause, and the single-statement ones name the custodian", (t, ctx) => {
      const titles = ctx?.titles ?? [];
      const named = titles.filter((x) => /no cost on the .+? statement for this holding/i.test(x));
      const plural = titles.filter((x) => /none of the \d+ statements carrying this name reports a cost/i.test(x));
      const table = tableRows(t);
      if (!table) return notChecked("the holdings table's footer did not parse on this run");
      return named.length + plural.length >= table.n
        && named.length > 0
        && new Set(named).size >= 2;   // a real custodian per row, not one blanket sentence
    }],
  ],
  /**
   * ── AN ADDRESS THAT NAMES NO SET SAYS SO ─────────────────────────────────
   *
   * The dangerous failure here is a silent fallback to "everything": the page
   * would answer a question it was not asked, with a total that looks exactly
   * like the one the reader clicked. So the assertion is on the FIGURES being
   * absent, not just on the words — matching prose alone would pass on a page
   * that rendered the whole book under an apology.
   */
  "holdings-unknown": [
    ["it says the address names no set, and lists the ones it can show", (t) =>
      /does not name a set of holdings/i.test(t) && /Every holding in the book/i.test(t)],
    ["it does not silently fall back to showing the whole book", (t, ctx) => {
      const nav = CIO_FIGURES.get("nav");
      const main = ctx?.main ?? "";
      if (!Number.isFinite(nav)) return notChecked("Morning CIO's NAV tile did not parse on this run");
      if (!main) return notChecked("this run did not capture the page's own content");
      // No holdings total in the page's own content, and specifically not the
      // NAV. Read off `<main>` because the top bar carries the book's value on
      // every route, so a body-scoped test matches the chrome and fails a page
      // that is behaving correctly.
      return !/MARKET VALUE/i.test(main)
        && !/holdings\s*·\s*[\d,]+\s*names/i.test(main)
        && !new RegExp(String.raw`₹\s*${nav.toFixed(1)}\s*Cr`).test(main);
    }],
  ],
  // "why are 70% holdings in unclassified" — and then, after the private book
  // was excluded, why Unclassified was STILL 49% with a mutual fund at its head.
  // A GICS sector is a property of a company; the page is direct equity only,
  // and every excluded class must be NAMED with its value rather than dropped.
  /**
   * ── PRIVATE MARKET ───────────────────────────────────────────────────────
   *
   * "there's no private market data anywhere on the dashboard." This page is the
   * answer, and it is the ONE screen where the whole of this book's double count
   * lives: both duplicated holdings — 360 ONE Special Opportunities under two
   * CRNs and Transition Venture Fund I under both family trusts — are private.
   * So the consolidated-counts-once / per-account-does-not rule is this page's
   * central arithmetic rather than a background concern, and PM-1 and PM-6
   * assert it from BOTH ends: a page that deduped everything would pass one and
   * fail the other.
   *
   * Every one of these is struck on a FIGURE THE PAGE RENDERS. The page also
   * carries a lot of true prose, and matching that is what made two earlier
   * drafts elsewhere in this file unable to fail.
   */
  "private-market": [
    // PM-1. The per-folio table shows every statement as printed; the fund table
    // counts each holding once. The difference is the double count, and the page
    // must NAME it rather than leave a reader to find it by adding.
    ["the folio total less the fund total is exactly the double count the page names", (t) => {
      // The footer prints Invested THEN Value, so the VALUE is the second money
      // in the row. Taking the first silently compares a cost against a market
      // value — which is how this check failed the first time it was run.
      const consol = cr(new RegExp(String.raw`Total\s*·\s*\d+\s*funds\s*` + CR + String.raw`\s*` + CR, "i").exec(t)?.[2]);
      const raw = cr(new RegExp(String.raw`Total\s*·\s*\d+\s*rows[\s\S]{0,120}?` + CR + String.raw`\s*as printed`, "i").exec(t)?.[1]);
      const dup = cr(new RegExp(CR + String.raw`\s*of the\s*` + CR + String.raw`\s*above is two holdings`, "i").exec(t)?.[1]);
      if (![consol, raw, dup].every(Number.isFinite)) return false;
      return dup > 0 && Math.abs(raw - consol - dup) <= Math.max(0.6, consol * 0.002);
    }],
    // PM-2. What the page shows plus what it says it left out must reconstruct
    // the whole book. Narrowing on the wrong axis moves one side and not the other.
    ["private value + the classes named as excluded reconstructs the consolidated NAV", (t) => {
      const nav = cr(new RegExp(CR).exec(t)?.[1]);                 // header chip, first ₹…Cr
      const priv = cr(new RegExp(String.raw`PRIVATE MARKET VALUE\s*\n?\s*` + CR, "i").exec(t)?.[1]);
      const rest = [...(new RegExp(String.raw`Not on this page:([^\n]{0,400})`, "i").exec(t)?.[1] ?? "")
        .matchAll(/₹([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?/g)].map((x) => crU(x[1], x[2]));
      if (![nav, priv].every(Number.isFinite) || rest.length < 2) return false;
      // THE BOUND IS THE PRINTING PRECISION, NOT A FRACTION OF THE NAV. Scaled
      // to the book (0.2% of ₹13,061 Cr) this would allow ₹26 Cr of drift and
      // swallow the exact error it exists to catch — the ₹18.2 Cr of drawn
      // capital being folded into the private value. Every figure here prints to
      // one decimal in Cr, so six of them can round by at most ~₹0.3 Cr in total.
      return Math.abs(priv + rest.reduce((a, b) => a + b, 0) - nav) <= 0.6;
    }],
    // PM-3. Invested and Unrealised are struck over the rows that HAVE a cost, so
    // they add to the COSTED market value and not to the whole private book — and
    // the coverage count must be a strict subset. `costBasis ?? 0` leaves the
    // totals untouched and silently makes the count read 19 of 19.
    ["invested + unrealised = the costed value, and the cost covers fewer rows than the book holds", (t) => {
      const inv = cr(new RegExp(String.raw`CAPITAL INVESTED\s*\n?\s*` + CR, "i").exec(t)?.[1]);
      const pnl = cr(new RegExp(String.raw`UNREALISED P&L\s*\n?\s*\+?` + CR, "i").exec(t)?.[1]);
      const cov = cr(new RegExp(String.raw`covering\s*` + CR, "i").exec(t)?.[1]);
      const n = /(\d+) of (\d+) folio rows report one/i.exec(t);
      if (![inv, pnl, cov].every(Number.isFinite) || !n) return false;
      return Math.abs(inv + pnl - cov) <= Math.max(0.6, cov * 0.002) && Number(n[1]) < Number(n[2]);
    }],
    // PM-4. Undrawn is summed AS PRINTED. Two folios print a commitment and a
    // drawdown and no undrawn figure; a `?? 0`, or deriving committed − drawn,
    // puts a figure on all fifteen and the coverage count gives it away.
    ["the dry-powder tile covers fewer capital accounts than the register holds", (t) => {
      const tile = cr(new RegExp(String.raw`STILL TO CALL \(DRY POWDER\)\s*\n?\s*` + CR, "i").exec(t)?.[1]);
      const foot = new RegExp(String.raw`Still to call\s*` + CR + String.raw`\s*\((\d+) of (\d+)\)`, "i").exec(t);
      if (!Number.isFinite(tile) || !foot) return false;
      const total = cr(foot[1]), have = Number(foot[2]), rows = Number(foot[3]);
      return Number.isFinite(total) && Math.abs(total - tile) <= 0.6 && have > 0 && have < rows;
    }],
    // PM-5. The capital paid into funds that value nothing ties to its own table
    // and is NOT inside the private market value. Carrying drawn capital as a
    // mark would report what was paid as what the stake is worth.
    ["the drawn-against-no-valuation tile is the sum of its own table's rows, and stays out of the private total", (t) => {
      const tile = cr(new RegExp(String.raw`DRAWN AGAINST NO VALUATION\s*\n?\s*` + CR, "i").exec(t)?.[1]);
      const priv = cr(new RegExp(String.raw`PRIVATE MARKET VALUE\s*\n?\s*` + CR, "i").exec(t)?.[1]);
      const consol = cr(new RegExp(String.raw`Total\s*·\s*\d+\s*funds\s*` + CR + String.raw`\s*` + CR, "i").exec(t)?.[2]);
      const i = t.search(/Private accounts whose fund publishes no valuation/i);
      const j = t.search(/of drawn capital across \d+ of these accounts/i);
      if (![tile, priv, consol].every(Number.isFinite) || i < 0 || j <= i) return false;
      // RECONSTRUCTED FROM THE RENDERED ROWS, not compared against another
      // rendering of the same variable — that version was tautological and
      // passed while the tile was halved. Each row is
      // `account \t owner \t drawn \t still-to-call \t — \t why`.
      const drawn = [...t.slice(i, j).matchAll(/\n[^\t\n]+\t[^\t\n]+\t(?:₹([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?|—)\t/g)]
        .filter((r) => r[1]).map((r) => crU(r[1], r[2]));
      if (!drawn.length) return false;
      return tile > 0
        && Math.abs(drawn.reduce((a, b) => a + b, 0) - tile) <= 0.6
        // …and the private total is still the fund table's own footer, so the
        // drawn capital has not been folded into it.
        && Math.abs(priv - consol) <= 0.6;
    }],
    // PM-6. The other end of PM-1: a per-owner figure counts each member's own
    // statement and therefore does NOT dedupe. Computing this table off the
    // deduped set empties two owners' rows and the sum lands short of the footer.
    ["the per-owner subtotals add to the folio total, not to the consolidated one", (t) => {
      const raw = cr(new RegExp(String.raw`Total\s*·\s*\d+\s*rows[\s\S]{0,120}?` + CR + String.raw`\s*as printed`, "i").exec(t)?.[1]);
      const said = new RegExp(String.raw`these add to\s*` + CR + String.raw`\s*and not to the consolidated\s*` + CR, "i").exec(t);
      const owners = [...t.matchAll(/\n[^\n\t]+\t+\d+ rows?\t+(?:₹[\d,.]+\s*(?:Cr|L|K)?|—)\t+₹([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?/g)]
        .map((x) => crU(x[1], x[2]));
      if (!Number.isFinite(raw) || !said || owners.length < 2) return false;
      const sum = owners.reduce((a, b) => a + b, 0);
      // It adds to the RAW total and is DIFFERENT from the consolidated one.
      return Math.abs(sum - raw) <= Math.max(0.6, owners.length * 0.06)
        && Math.abs(cr(said[1]) - raw) <= 0.6 && Math.abs(cr(said[1]) - cr(said[2])) > 0.05;
    }],
    // PM-7. The book closes newer than every private mark on this page, so
    // printing `portfolio.asOf` over these rows would date them forward. The
    // expected date is DERIVED from the book, never typed here.
    ["the newest private mark rendered is the newest one the book carries", (t) => {
      if (!PRIV_ASOF_MAX) return false;         // the harness could not read the book: a failure, not a skip
      const want = new Date(`${PRIV_ASOF_MAX}T00:00:00Z`)
        .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
        .replace(/^0/, "");
      return new RegExp(String.raw`Marks span[^\n]*?${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(t);
    }],
    // PM-8. A fund whose statement reports no cost shows no return — a percentage
    // over an absent cost is struck against nothing. Asserted on the ROW: the
    // depository-held fund prints a value, an em dash for cost, and no return.
    ["no fund row prints a return where its cost is absent", (t) => {
      const rows = [...t.matchAll(/\n[^\n\t]+\t[^\n\t]*\t\d+\t[\d,.]+\t(—|₹[\d,.]+\s*(?:Cr|L|K)?)\t(?:₹[\d,.]+\s*(?:Cr|L|K)?|₹0)\t(—|[+-][\d.]+%)/g)];
      if (!rows.length) return false;
      // Every row whose Invested cell is a dash must have a dash in Return too.
      return rows.filter((r) => r[1] === "—").every((r) => r[2] === "—")
        && rows.some((r) => r[1] === "—");     // and the book really does carry one
    }],
  ],
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
/**
   * ── THE DAY'S MOVE, WITH THE LIVE LAYER FULFILLED ─────────────────────────
   *
   * Every fixture is priced at its own statement mark × 1.10 with every index at
   * ×0.99 (see `installLiveMocks`), so the right answers are closed forms:
   * +10.00% for the book, −1.00% per index, 11.00 points of gap. None of these
   * is a literal typed to match what the page happens to print — each is the
   * arithmetic the fixture makes true, which is what lets them FAIL.
   */
  "cio-live": [
    /**
     * THE DAY'S MOVE IS STRUCK ON THE PRICED SUBSET, NOT ON THE WHOLE BOOK.
     *
     * This is the check the card exists for. The feed prices about ₹200 Cr of a
     * ₹710 Cr book, so dividing the same rupee move by the whole NAV gives ~2.8%
     * against a true 10.00% — a real figure, on the wrong denominator, and the
     * one a reader sets against the Nifty. Averaging the per-name percentages
     * instead of value-weighting them, or counting an unpriced holding as flat,
     * both land somewhere else too.
     */
    ["the book's day move is +10.00%, struck on the priced subset rather than the whole book",
      (t) => {
        const card = sliceBetween(t, "Today’s movers", "Allocation by asset class");
        const m = /DIRECT EQUITY · TODAY\s*\n\s*[+-]?₹[\d,.]+\s*(?:Cr|L|K)?\s*\n\s*([+-]\d+\.\d+)%/i.exec(card);
        return !!m && Math.abs(Number(m[1]) - 10) < 0.02;
      }],
    /** ...and the tile SAYS what it covers, on its face rather than in a hover. */
    ["the day-move tile names its own coverage, in rupees and in names",
      (t) => /on ₹[\d,.]+\s*(?:Cr|L|K)? across \d+ of \d+ direct-equity names/.test(t)],
    /**
     * ALL FOUR INDICES, EACH WITH A LEVEL AND A MOVE — the family named these
     * four. An index that resolved but printed no level would satisfy a check
     * that only looked for the label.
     */
    ["all four NSE indices render a level and a −1.00% day move",
      (t) => ["Nifty 50", "Nifty 500", "Nifty Midcap 150", "Nifty Smallcap 250"].every((label) =>
        new RegExp(`${label}\\s*\\n\\s*[\\d,]+\\.\\d+\\s*\\n\\s*-1\\.00%`).test(t))],
    /**
     * AND THE GAP IS THE SUBTRACTION, NOT A RESTATEMENT OF ONE SIDE.
     *
     * +10.00% against −1.00% is 11.00 points. A card printing the book's own
     * figure here, or the index's, would read plausibly and answer a different
     * question — which is exactly what the family asked for ("my stocks are up,
     * Sensex is down this much").
     */
    ["the book-against-Nifty-500 gap is the difference between the two, 11.00 points",
      (t) => {
        const m = /Direct equity is\s*([+-]\d+\.\d+)%\s*against the\s*\n?\s*Nifty 500 today/.exec(t)
          ?? /Direct equity is\s*([+-]\d+\.\d+)%/.exec(t);
        return !!m && Math.abs(Number(m[1]) - 11) < 0.03;
      }],
    /**
     * THE MOVERS SET IS DIRECT EQUITY, CHECKED ON A COUNT RATHER THAN ON NAMES.
     *
     * Every fixture price is the mark × 1.10, so every priceable name in scope
     * rises: the gainer count IS the size of the priced scope. Widening the
     * filter back to the whole book takes it from 33 to 160-odd, and narrowing
     * it further drops it — neither can pass. The expectation is derived from
     * the book on every run (see `DIRECT_EQUITY_PRICED_NAMES`), never typed.
     */
    ["the gainers are exactly the priced DIRECT-EQUITY names, not the whole book",
      (t) => {
        if (DIRECT_EQUITY_PRICED_NAMES == null) {
          return { notChecked: "the book could not be read, so the expected count could not be derived" };
        }
        const card = sliceBetween(t, "Today’s movers", "Allocation by asset class");
        const g = /(\d+)\s+GAINERS/i.exec(card);
        const l = /(\d+)\s+LOSERS/i.exec(card);
        if (!g || !l) return false;
        // Every priced name rose in this fixture, so losers must be nil and the
        // gainers must account for the whole priced scope.
        return Number(l[1]) === 0 && Number(g[1]) === DIRECT_EQUITY_PRICED_NAMES;
      }],
    /**
     * ...AND WHAT THE NARROWING LEFT OUT IS NAMED, not silently dropped. The PMS
     * mandates are the bulk of the book's priceable value; a card that stopped
     * covering them without saying so is a scope change a reader cannot see.
     */
    ["the card names the buckets it no longer covers, with their value",
      (t) => /Direct equity only\. Also moved today and not counted here:/.test(t)
        && /\d+ PMS mandates ₹[\d,.]+/.test(t)],
    /**
     * ...AND THE FOOTER PARAGRAPH THE FAMILY ASKED TO REMOVE STAYS REMOVED.
     *
     * Asserted HERE rather than on `cio` because it is only drawn when the card
     * has rows, and `cio` serves no feed — a check for its absence there passes
     * over a page that would print it the moment a quote arrived.
     */
    ["the removed movers footer stays removed",
      (t) => !/the other ranking is one click away/.test(t)
        && !/closed unchanged and are in neither list/.test(t)
        && !/never averaged across positions of different sizes/.test(t)],
    /** The gainers list is populated and ranked, and every row carries both figures. */
    ["gainers are listed with a percentage and a rupee impact each",
      (t) => {
        const card = sliceBetween(t, "Today’s movers", "Allocation by asset class");
        const rows = [...card.matchAll(/\t\+10\.00%\t\+₹[\d,.]+\s*(?:Cr|L|K)?/g)];
        return /\d+ GAINERS/i.test(card) && rows.length >= 3;
      }],
    /**
     * NOTHING FELL IN THIS FIXTURE, AND AN EMPTY LIST HAS NO TOTAL. `₹0` beside
     * "0 losers" is a formatter reaching an empty collection, which §2 forbids
     * exactly as it forbids it on a tile.
     */
    ["an empty losers list shows a dash rather than a summed ₹0",
      (t) => {
        const card = sliceBetween(t, "0 LOSERS", "Allocation by asset class");
        return /0 LOSERS/.test(t) ? !/^\s*[-+]?₹0\b/m.test(card) : true;
      }],
    /** And with a price history in hand the NAV card draws the comparison. */
    ["the NAV card draws the Nifty 500 line and states its return",
      (t) => new RegExp(String.raw`Nifty 500\s*\n?\s*[+-]\d+\.\d+%`).test(
        sliceBetween(t, "Portfolio NAV vs Nifty 500", "Both lines are rebased"))],
    /**
     * ...AND THE COMPARISON IS AGAINST THE ADJUSTED LINE. On this fixture the
     * index rises ~1.26% and the book's adjusted return is +0.54%, so the book
     * must read BELOW the index — while the unadjusted NAV (+9.30%) would read
     * far above it. A card that compared the wrong curve inverts the answer,
     * which is the whole reason the adjustment exists.
     */
    ["the headline compares the flow-adjusted book against the index, not the raw NAV",
      (t) => {
        const head = sliceBetween(t, "Portfolio NAV vs Nifty 500", "Both lines are rebased");
        const book = /Book\s*\n?\s*([+-]\d+\.\d+)%/.exec(head);
        const idx = /Nifty 500\s*\n?\s*([+-]\d+\.\d+)%/.exec(head);
        if (!book || !idx) return false;
        const raw = /it reads\s*([+-]\d+\.\d+)%\s*against the book/.exec(t);
        return !!raw && Number(book[1]) !== Number(raw[1]) && Number(book[1]) < Number(idx[1]);
      }],
  ],

  monitor: [
    ...CATEGORY_TOTALS,
    ...CATEGORY_TOTAL_NOT_A_HOLDING,

    /**
     * THE HEADLINE IS ONE LINE, AND THE VIEW SWITCH RIDES WITH IT.
     *
     * *"Write daily and portfolio monitor as a single line headline, daily in
     * smaller font … also shift the holdings/transactions toggle beside it.
     * Will give us further space to show a bigger table."* That is a claim
     * about GEOMETRY, so it is struck on geometry — the three boxes must
     * overlap vertically. Matching the words "Daily" and "Portfolio Monitor"
     * would pass just as happily with them stacked three rows deep.
     */
    /**
     * THE REMOVED CONTROLS STAY REMOVED — asserted rather than deleted with the
     * feature, the same treatment the retired Public dashboard tab and the
     * `/news` redirects get.
     *
     * The Holdings basis switch and the Review deck button both went at the
     * family's request. Struck on the BUTTONS a reader can press, not on the
     * words: "By security" and "By entity" still appear in the Transactions
     * card's own controls and in this page's prose, so a text match would fail
     * a page that is correct.
     */
    ["the removed Holdings basis switch and Review deck button stay removed",
      () => {
        if (!HEAD) return { notChecked: "the header geometry was not measured on this pass" };
        return HEAD.basisSwitch === 0 && HEAD.deckButton === 0;
      }],

    /** ...and the one action that is left sits on the filter row, not below it. */
    ["Export Excel is on the filter row rather than wrapping onto its own",
      () => {
        if (!HEAD) return { notChecked: "the header geometry was not measured on this pass" };
        return HEAD.exportInline === true;
      }],

    ["the eyebrow, the title and the view switch share one line, with the eyebrow smaller",
      () => {
        if (!HEAD) return { notChecked: "the header geometry was not measured on this pass" };
        return HEAD.hasEyebrow && HEAD.eyebrowInline && HEAD.toggleInline && HEAD.eyebrowSmaller;
      }],
    /**
     * ── THE THIRD ROUND: A GROUPING, NOT A WORD ──────────────────────────────
     *
     * "We are mixing AIF investments and Direct Equity holdings. Any stock held
     * through an AIF or PMS should be shown inside that AIF/PMS drill-down."
     * The model never mixed them — every AIF folio has always been its own AIF
     * row — but ₹127 Cr of shares a discretionary manager chose sat in the same
     * section as the ₹12,446 Cr the family bought itself (₹94.9 Cr of it now that
     * the Polycab promoter block is ring-fenced onto its own page), under a heading that
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
    ["no mandate row stands inside the Direct Equity section", (t, ctx) => {
      const gate = needRows(ctx?.tableRows);
      if (gate) return gate;
      const de = sectionOf(t, "DIRECT EQUITY");
      if (!de) return false;                          // heading gone → nothing checked is nothing passed
      // Both halves: no row CARRIES the mandate attributes under that bucket,
      // and the pill a mandate draws appears nowhere in its text either.
      return mandatesIn(ctx.mandateRows, DIRECT_EQUITY_BUCKET).length === 0
        && !/\bPMS mandate\b/.test(de.body);
    }],
    ["no manager named in the PMS section appears under Direct Equity", (t, ctx) => {
      const gate = needRows(ctx?.tableRows);
      if (gate) return gate;
      const de = sectionOf(t, "DIRECT EQUITY");
      if (!de) return false;
      // Harvested from the ROWS rather than typed here, so this cannot go stale
      // when a manager arrives or leaves.
      const managers = [...new Set(mandatesIn(ctx.mandateRows, MANDATE_BUCKET).map((m) => m.manager))];
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
    ["every row in the PMS section is a mandate, not a share", (t, ctx) => {
      const gate = needRows(ctx?.tableRows);
      if (gate) return gate;
      // EVERY row filed under the bucket carries the mandate attributes: a
      // constituent share drawn back out as its own row would not.
      const inBucket = ctx.tableRows.filter((r) => r.bucket === MANDATE_BUCKET);
      const rows = mandatesIn(ctx.mandateRows, MANDATE_BUCKET);
      return rows.length >= 2 && rows.length === inBucket.length;
    }],
    ["the PMS heading's holding count is the sum of its mandates' own counts", (t, ctx) => {
      const gate = needRows(ctx?.tableRows);
      if (gate) return gate;
      const head = headingCount(sectionOf(t, "PMS MANDATES")?.head);
      if (!head) return false;
      const rows = mandatesIn(ctx.mandateRows, MANDATE_BUCKET);
      if (rows.length === 0) return false;
      const constituents = rows.reduce((n, r) => n + r.holdings, 0);
      // A roll-up that stands for no more than it draws is not a roll-up. Today
      // it is 281 shares across 10 rows; the relation is asserted, not the pair.
      return constituents === head.holdings && constituents > rows.length;
    }],
    /**
     * ── THE ROW IS THE NAME AND WHAT IT IS, AND NOTHING ELSE ────────────────
     *
     * "Do not write the entity along with the PMS name… remove the smaller text
     * details from the front table so it is a clean row."
     *
     * The manager, the account number and the constituent count used to print
     * under every mandate's name. They are on the mandate's own page, and the
     * row now carries them only as `data-*` and in the link's hover title.
     */
    ["a mandate row prints no manager-and-account sub-line", (t) => {
      const pms = sectionOf(t, "PMS MANDATES");
      if (!pms) return false;
      return !/·\s+account\s+\S+\s+·\s+\d+\s+holdings?/.test(pms.body);
    }],
    /**
     * ...AND THE OWNER IS NOT INSIDE THE NAME EITHER — but it must still be on
     * the row, in its own column. THIS IS THE RISK THE CHANGE INTRODUCES and the
     * reason it is checked rather than assumed: FOUR of this book's ten mandates
     * share a strategy name with another (the same strategy run for two members),
     * and the owner was inside the name precisely so those pairs could be told
     * apart. Dropping it is safe ONLY because Entities closes every row. If a
     * future change empties that cell for mandates, two rows become
     * indistinguishable and this fails — which is the whole point.
     */
    ["no two mandate rows are indistinguishable once the owner leaves the name", (t, ctx) => {
      const gate = needRows(ctx?.tableRows);
      if (gate) return gate;
      const rows = mandatesIn(ctx.mandateRows, MANDATE_BUCKET);
      if (rows.length < 2) return false;
      // The name must not carry the owner inside it — read off the CELL, since
      // that is the text on screen; the `data-mandate` attribute is a different
      // field and stayed clean while the rendered name carried the owner again.
      if (rows.some((r) => / · /.test((r.nameCell ?? "").replace(" PMS mandate", "")))) return false;
      // ...and name + account must be unique, which is what a reader sees once
      // the Entities column separates the pairs.
      const seen = new Set(rows.map((r) => `${r.mandate}@@${r.accountNo}`));
      return seen.size === rows.length;
    }],
    // ...and each of those rows is a way IN. A mandate a reader cannot open is
    // a section that hides 271 positions instead of filing them.
    ["every mandate row links to its own drill-down", (t, ctx) => {
      const gate = needRows(ctx?.tableRows);
      if (gate) return gate;
      const rows = mandatesIn(ctx.mandateRows, MANDATE_BUCKET);
      const links = new Set((ctx?.hrefs ?? []).filter((h) => /^\/mandate\/./.test(h)));
      return rows.length > 0 && links.size === rows.length;
    }],
    // AND THE SECTIONS MUST ADD UP TO THE FOOTER. A reader who sums the four
    // headings and lands somewhere other than the Total row has found the
    // contradiction this book's own rule says no caption rescues — and the
    // heading subtotal is the one place it could happen, because BOTH of this
    // book's duplicates are AIF holdings: in the by-entity view the AIF heading
    // summed ₹3.17 Cr that the (deduped) footer beneath it correctly did not.
    /**
     * THE DEFAULT SLICE IS STILL CATEGORY, AND IS STILL THE ONE IT WAS.
     *
     *   "Default view will remain the current one, category wise."
     *
     * Two new axes were added beside it, and the whole risk of that change is
     * that the DEFAULT quietly becomes one of them — the page would render
     * perfectly, every figure would be right, and the family would be looking
     * at a different table from the one they asked to keep. So the plain
     * `/monitor` walk (no `?group=`) asserts the axis it landed on, off the
     * heading's own attribute rather than its words.
     */
    ["the default slice is still the category axis", (t, ctx) => {
      const secs = ctx?.sectionRows;
      if (!secs?.length) return { notChecked: "no section headings were rendered on this run" };
      return secs.every((x) => x.axis === "category");
    }],
    // ...and the sections are the ones it has always drawn. A category axis that
    // started emitting a basket name would satisfy the check above.
    ["the default slice draws the category sections and no family basket", (t, ctx) => {
      const secs = ctx?.sectionRows;
      if (!secs?.length) return { notChecked: "no section headings on this run" };
      const BASKETS = ["Stable Growth", "Entrepreneurial Growth", "Thematic & Tactical", "Liquidity"];
      return secs.some((x) => x.key === MANDATE_BUCKET)
        && secs.every((x) => !BASKETS.includes(x.key));
    }],
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
    /**
     * ── THE MONEY READS FIRST, AND SECTOR / ENTITY CLOSE THE TABLE ───────────
     *
     * "It should be all holdings, it's not all companies, because I'm buying
     * multiple things" — and "reorder the columns so the money reads first and
     * Sector / Entity close the table."
     *
     * Struck on the RENDERED ROWS, never on the header: innerText breaks a
     * sortable header cell across lines (the sort arrow is its own flex item),
     * so a header-order test would be reading a shape the reader never sees.
     * A data row is one tab-joined line and is exactly what they do see.
     */
    ["the pick-list is of holdings, not of companies",
      (t) => /All holdings/.test(t) && !/All compan(y|ies)/i.test(t)],
    /**
     * MONEY FIRST — the cell immediately after the security name is the
     * QUANTITY. Under the old order it was the sector, so this flips on a
     * revert rather than passing both ways. Direct Equity is the section to
     * strike it on: every row in it is a share with a quantity, where a mandate
     * row carries an em dash there by design.
     */
    ["the first cell after the security name is a figure, not a descriptor", (t) => {
      const de = sectionOf(t, "DIRECT EQUITY");
      if (!de || de.rows.length === 0) return false;   // no rows is never a pass
      return de.rows.every((r) => /^[\d,]+(\.\d+)?$/.test(r.split("\t")[1]?.trim() ?? ""));
    }],
    /**
     * ...AND THE SECTOR IS SECOND FROM THE END. Keyed on the app's own word for
     * an unmapped sector — `analytics.ts` vocabulary, the same kind of literal
     * the section headings above are matched on, not a figure copied out of the
     * book. It sat at index 1 before; a revert puts it back there.
     */
    ["the sector column is second from the end of every row that renders one", (t) => {
      const rows = t.split("\n").filter(isDataRow).filter((l) => /\bUnclassified\b/.test(l));
      if (rows.length === 0) return false;             // nothing to check is nothing passed
      return rows.every((r) => {
        const cells = r.split("\t");
        return cells[cells.length - 2]?.trim() === "Unclassified";
      });
    }],
    /**
     * AND THE FOOTER ENDS IN TWO EMPTY CELLS. A column of words has no sum to be
     * missing, so these are empty rather than absent — and their presence is
     * what says the two descriptor columns are past the last figure. The cell
     * before them is the total return, which is where the money now stops.
     */
    ["the footer totals nothing under the two descriptor columns", (t) => {
      const foot = t.split("\n").find((l) => /^Total\s*·\s*\d+\s*rows\t/.test(l));
      if (!foot) return false;
      const cells = foot.split("\t");
      // …Return, YTD, Sector, Entities. The two descriptor columns stay empty;
      // the YTD total is ABSENT rather than empty (nobody can strike it), and
      // the last figure the footer carries is the return.
      return cells.length >= 4
        && cells[cells.length - 1].trim() === ""
        && cells[cells.length - 2].trim() === ""
        && cells[cells.length - 3].trim() === "—"
        && /^[+-]?[\d.]+%$/.test(cells[cells.length - 4].trim());
    }],
    /**
     * ── DENSITY, MEASURED RATHER THAN DESCRIBED ─────────────────────────────
     *
     * "Realign everything on the page so that I can see more companies at the
     * same view — right now I cannot even see 2 companies completely."
     *
     * Struck on the GEOMETRY the browser reports, because that is the thing
     * that was wrong: the page printed every row correctly and still spent its
     * first screen on three stacked rows of chrome and a security column so
     * narrow that "Fractal Analytics Limited" wrapped onto three lines. Ten is
     * a floor well above the two the complaint names and well below what the
     * page now draws, so it fails on a real regression without tracking the
     * exact number, which moves with the viewport and the book.
     */
    ["at least ten holdings are fully visible without scrolling",
      (t, ctx) => !ctx?.metrics ? { notChecked: "no geometry captured on this run" }
        : ctx.metrics.rowsInView >= 10],
    // ...and the table starts in the top third of the viewport. A page that got
    // its rows back by growing the window rather than by tightening the chrome
    // would pass the count above and fail this.
    ["the first holding sits in the top third of the screen",
      (t, ctx) => !ctx?.metrics ? { notChecked: "no geometry captured on this run" }
        : ctx.metrics.firstRowTop !== null && ctx.metrics.firstRowTop < ctx.metrics.viewportH / 3],
    /**
     * ── THE RETURN TOGGLE EXISTS AND DEFAULTS TO ABSOLUTE ───────────────────
     * The guard itself is asserted on the `monitor-cagr` route, which clicks it.
     */
    ["the return basis toggle offers Absolute and CAGR",
      (t) => /\bAbsolute\b/.test(t) && /\bCAGR\b/.test(t)],
    /**
     * ── THE YTD COLUMN IS THE HOLDING'S, AND IT NEVER GUESSES ───────────────
     *
     * "Add YTD… for the holding itself, not just the security's market return"
     * and "if it is not possible to show data then just show a dash."
     *
     * The share's market move since January IS available from `/api/prices`,
     * which is exactly what makes this dangerous: the cheap way to fill this
     * column is to substitute a figure that answers a different question. So
     * the assertion is on the CELLS — every one is an em dash or a signed
     * percentage, and never a zero, which is the shape a fabricated "no change
     * this year" would take.
     */
    ["a YTD column is drawn, sitting between Return and the descriptors",
      (t) => /\bYTD\b/.test(t)],
    ["the YTD column shows exactly as many figures as it claims to measure", (t) => {
      // FULL-WIDTH ROWS ONLY. `isDataRow` is a tab count, and innerText renders
      // the sticky header with five tabs of its own, so it matches there too —
      // a header is not a row and its cells are not in these columns.
      const rows = t.split("\n").filter(isDataRow).filter((r) => r.split("\t").length === 14);
      if (rows.length === 0) return false;             // nothing drawn is nothing checked
      // ... Return, YTD, Sector, Entities — so YTD is third from the end.
      const cell = (r) => r.split("\t")[r.split("\t").length - 3].trim();
      const shapeOk = rows.every((r) => cell(r) === "—" || /^[+-]\d+(\.\d+)?%$/.test(cell(r)));
      const drawn = rows.filter((r) => cell(r) !== "—").length;
      /**
       * AND THE COUNT MUST TIE TO THE CAPTION. Shape alone is too weak: a
       * fabricated "+0.00%" — the exact shape a defaulted YTD would take — is a
       * signed percentage and would sail through. The caption is computed from
       * `ytdCoverage` over the same rows, so a column that started inventing
       * figures disagrees with the sentence underneath it, which is the
       * contradiction this book's own footer rule is written to catch.
       */
      const none = /No row can be measured on this drop/.test(t);
      const some = /measurable on (\d+) of \d+ rows/.exec(t);
      if (!none && !some) return false;                // no caption is not a pass
      const claimed = none ? 0 : Number(some[1]);
      // THE BOOK IS THE THIRD PARTY. Cells and caption both come from
      // `holdingYtd`, so they agree even when both are wrong; `YTD_MEASURABLE`
      // is counted off `glowData.ts` and is what makes this able to fail.
      if (YTD_MEASURABLE === null) return { notChecked: "could not read heldSince out of the generated book" };
      return shapeOk && drawn === claimed && drawn === YTD_MEASURABLE;
    }],
    // ...and the column says what it covers rather than leaving a wall of
    // dashes to be read as a broken feed.
    ["the YTD column states what it can and cannot measure",
      (t) => /YTD is the holding.s own return this year, not the share.s market move/.test(t)
        && /1 January/.test(t)],
    ["...and the column is headed Return, not an annual rate, until CAGR is picked",
      (t) => /\bReturn\b/.test(t) && !/Return p\.a\./.test(t)],
  ],
  /**
   * ── THE CAGR VIEW, AND THE GUARD THAT MAKES IT SAFE ─────────────────────────
   *
   * "More than one year it'll be CAGR, less than one year I'd rather see
   * absolute… never an annualised extrapolation."
   *
   * The danger here is specific and this repo has met it twice: a short window
   * compounded onto a year. Morning CIO once read +99.0% that way, and the PMS
   * statements' own `positionIrrPct` reaches +47,695% on this book doing exactly
   * it. So these are struck on the FIGURES the page renders, not on the caption:
   * a page that annualised everything would keep every word of the prose.
   */
  "monitor-cagr": [
    ["the column names the basis it switched to", (t) => /Return p\.a\./.test(t)],
    /**
     * NO TRIPLE-DIGIT ANNUAL RATE ANYWHERE IN THE TABLE. This book's longest
     * measured hold is 527 days and its returns are tens of percent; a
     * four-figure rate here is the extrapolation bug regressing, which is how
     * both previous occurrences announced themselves.
     */
    ["no return of 100% p.a. or more appears once the basis is annualised", (t) => {
      const rows = t.split("\n").filter(isDataRow);
      if (rows.length === 0) return false;             // nothing drawn is nothing checked
      return !rows.some((r) => /[+-]\s?\d{3,}(\.\d+)?%/.test(r));
    }],
    /**
     * THE COVERAGE LINE IS COUNTED OFF THE BOOK, and it must reconcile: the
     * rows it says are annualised, guarded and absent have to add to the row
     * count the header chip prints. A caption that claimed more coverage than
     * the column has is the failure this whole feature exists to avoid.
     */
    ["the coverage note partitions the rows it describes", (t) => {
      const m = /Annualised where a year can be measured\s*—\s*(\d+) of (\d+) rows/.exec(t);
      if (!m) return false;
      const [, cagr, total] = m.map(Number);
      const guarded = Number(/(\d+) rows? (?:is|are) held under a year/.exec(t)?.[1] ?? 0);
      const absent = Number(/(\d+) report no purchase date/.exec(t)?.[1] ?? 0);
      return cagr + guarded + absent === total && total > 0;
    }],
    // ...and the guard is VISIBLY firing: a sub-year row is marked, never
    // silently annualised. Empty is not a pass — this book holds such rows.
    ["a holding held under a year is marked as absolute rather than annualised",
      (t) => /held under a year/.test(t) && /\babs\b/.test(t)],
  ],
  // The by-entity view of the holdings table. Every statement's row shows as
  // printed here, so this is where "carry both, count once" is visible — and
  // where the class heading above the rows must still be on the footer's basis.

  /**
   * SWITCHING AXIS MUST NOT LEAVE THE TABLE EMPTY. The walk picks a section
   * from the category filter and then clicks through to the basket axis. If the
   * selection survived, it would match no basket and the table would render
   * nothing — so this asserts the table still has rows AND that the page really
   * did change axis, because a switch that silently failed would also "pass"
   * a rows-only check by never having filtered anything.
   */
  "monitor-axis-switch": [
    ["switching axis with a filter set leaves the table populated", (t, ctx) => {
      const rows = ctx?.tableRows;
      if (rows === null) return { notChecked: "rows were not collected on this run" };
      return rows.length > 0;
    }],
    ["...and the page really did move to the basket axis", (t, ctx) => {
      const secs = ctx?.sectionRows;
      if (!secs?.length) return { notChecked: "no section headings on this run" };
      return secs.every((x) => x.axis === "basket");
    }],
    ["...and the filter went back to offering every basket", (t) => /All baskets/i.test(t)],
  ],
  // The totals row renders on every axis, so its claims are checked on every
  // axis: the sections it totals are the family's own here, and a partition that
  // adds up on the category axis can still miss on one the family defined.
  "monitor-assetclass": [...axisChecks("asset class", ["Equity", "Debt", "Alternate", "Cash"]), ...CATEGORY_TOTALS],
  "monitor-basket": [...axisChecks("basket", ["Stable Growth", "Entrepreneurial Growth", "Thematic & Tactical", "Liquidity"]), ...CATEGORY_TOTALS],
  "monitor-entity": [
    ...CATEGORY_TOTALS,
    ...CATEGORY_TOTAL_NOT_A_HOLDING,
    ["the by-entity view still sections into Direct Equity, PMS mandates and the wrappers",
      (t) => !!sectionOf(t, "DIRECT EQUITY") && !!sectionOf(t, "PMS MANDATES") && !!sectionOf(t, "AIF")],
    // A mandate row is one account's statement already, so the by-entity toggle
    // — which splits a CONSOLIDATED security back into the statements that
    // reported it — must leave the mandates rolled up exactly as they were.
    // This is where a "show every statement's row" switch would most plausibly
    // unroll them, so it is asserted on the view where the risk lives.
    ["the mandates stay rolled up when every statement's row is shown", (t, ctx) => {
      const gate = needRows(ctx?.tableRows);
      if (gate) return gate;
      const head = headingCount(sectionOf(t, "PMS MANDATES")?.head);
      if (!head) return false;
      const inBucket = ctx.tableRows.filter((r) => r.bucket === MANDATE_BUCKET);
      const rows = mandatesIn(ctx.mandateRows, MANDATE_BUCKET);
      return rows.length >= 2 && rows.length === inBucket.length
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
    // ── AND THIS IS NOW THE CHECK THAT KEEPS `series.ts` ALIVE ──────────────
    //
    // Macro Research and Economy & Macro were the most visible readers of
    // `src/lib/series.ts` and `SeriesChart.tsx`, and both pages have been
    // removed. With them gone the two modules LOOK dead, and the next session
    // deletes them — which is the half a removal like that breaks silently, the
    // same way `watchlist.ts` looked dead the day its own tab went.
    //
    // They are not dead: `ReturnsTable` draws this card with `Point`,
    // `SeriesMeta`, `HORIZON_COLS`, `RANGES`, `fmtLevel`, `fmtReturn` and
    // `rebase`, off `/api/prices` rather than off the store. So the card
    // rendering here is the assertion that they survived.
    //
    // WHAT THIS CANNOT REACH, stated rather than implied: `/api/prices` does not
    // answer in this harness, so the card resolves to its named absence and the
    // CHART itself never mounts. `SeriesChart` is held up by the build instead —
    // delete it and `tsc -b` fails on the import — which is why the gate for
    // this change is build AND sweep, not either alone.
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
    /**
     * AND AN AIF STILL HAS NO LOOK-THROUGH, WITH THE REASON.
     *
     * This is the other half of the mutual-fund claim and neither implies the
     * other: a mutual fund scheme discloses its portfolio monthly and its page
     * now renders it, while an AIF publishes none. A build that grew a
     * constituent table here could only have filled it from some other scheme,
     * which is the fabrication the look-through store must not enable.
     */
    ["an AIF renders no look-through table", (t) => !/What this fund holds/i.test(t)],
    ["...and says why: an AIF publishes no monthly portfolio disclosure", (t) =>
      /publishes no such disclosure/i.test(t) && /Category II or III/i.test(t)],
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
  /**
   * ── THE SNAPSHOT PAGE DESCRIBES THE SERIES THAT EXISTS ────────────────────
   *
   * `navHistory` was empty for several drops and this page's captions were
   * written for the series it EXPECTED — "year-end listed-book snapshots, as
   * reported by the ingested performance-history statements". The series that
   * arrived is none of those three things: statement dates inside a five-week
   * window, spanning every asset class the covered accounts hold, taken from
   * each account's authoritative HOLDINGS issue. An absence's WORDING surviving
   * the arrival of its data is the same defect as the absence itself, and it is
   * caught by nothing unless it is asserted.
   */
  history: [
    /**
     * EVERY ONE OF THESE IS CASE-INSENSITIVE AND THE COLUMN ONES ARE STRUCK ON
     * THE HEADER ROW, both of which were found by reintroducing their bugs.
     *
     * `label-xs` applies `uppercase`, and `innerText` returns the TRANSFORMED
     * text — so restoring the old "Listed NAV" heading left a check reading
     * `/Listed NAV/` green against a page rendering `LISTED NAV`. And renaming
     * the capital column to "Flows" left `/Capital in/` green too, because the
     * FOOTNOTE under the table contains that phrase: a page-wide match for a
     * COLUMN name is satisfied by prose about the column. `innerText` joins a
     * header row's cells with tabs, so the header is one line and is where a
     * claim about a column has to be struck.
     */
    ["the page does not claim year-ends, a listed-only NAV, or performance-history statements",
      (t) => !/year-end/i.test(t) && !/listed nav/i.test(t) && !/performance-history statements/i.test(t)],
    ["it states its own coverage — how many accounts the series spans",
      (t) => /\d+ of \d+ accounts/.test(t)],
    /**
     * AND EACH POINT SAYS HOW MUCH OF ITS STEP WAS MONEY RATHER THAN VALUE. The
     * largest step in this series is a deposit; a table of NAV changes with no
     * capital column presents it as performance.
     */
    ["each dated point carries the external capital that entered its interval, and its composition",
      (t) => /^.*\bas of\b.*\bcapital in\b.*\bmarked on this date\b.*$/im.test(t)],
    ["a ₹0 in the capital column has its cause on the page, not only in a hover",
      (t) => !/₹0/.test(t) || /under capital in is measured/i.test(t)],
    /**
     * NOTHING HERE IS "ARCHIVED". These are statement dates and every one of
     * them still stands; the word read as an upload log of superseded files.
     */
    ["no dated point is labelled Archived or Active", (t) => !/\barchived\b/i.test(t)],
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
      if (!walked(name)) continue;
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
      // THE LIVE LAYER, ON THE ONE ROUTE THAT ASSERTS IT. Installed before the
      // navigation so the first render already has the feed; the plain `cio`
      // walk deliberately does NOT get them, because the absent states are
      // themselves invariants and a harness that always mocked would stop
      // checking them.
      if (name === "cio-live") await installLiveMocks(page);
      if (name === "cio-loading") await installStalledFeeds(page);
      if (name === "cio-index-loading") await installStalledIndices(page);
      // The first load answers, so the snapshot is written; the reload below
      // then has to render from it.
      if (name === "cio-cached") await installLiveMocks(page);
      const errors = [], failed = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));
      page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

      /**
       * `networkidle` CANNOT BE REACHED WHILE A REQUEST IS DELIBERATELY HELD.
       *
       * `cio-loading` keeps the quote and index calls open for the length of
       * the walk — that is the whole point of it — so waiting for the network
       * to go quiet times out against a page that is rendering exactly as
       * intended. It waits for `load` instead, which is the state its
       * invariants are about: the page painted, the feeds still in flight.
       */
      const settle = (name === "cio-loading" || name === "cio-index-loading")
        ? "load" : (FAST ? "load" : "networkidle");
      await page.goto(`${BASE}${path}`, { waitUntil: settle, timeout: 45000 });
      if (name === "cio-cached") {
        /**
         * THE SECOND OPEN MUST NOT START FROM NOTHING.
         *
         * The first load answered and wrote the snapshot. The feeds are now
         * held open — a cold network — and the page is reloaded. Whatever it
         * renders comes from `localStorage` alone, which is exactly the state a
         * reader is in when they reopen the dashboard: figures immediately,
         * refined when the live rounds land.
         *
         * `unrouteAll` first, because the mocks installed before navigation
         * would otherwise still fulfil and this would test nothing.
         */
        await page.waitForSelector('[data-testid="movers-coverage"]', { timeout: 20000 }).catch(() => {});
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await page.route("**/api/quotes", (r) => new Promise(() => { void r; }));
        await page.route("**/api/indices*", (r) => new Promise(() => { void r; }));
        await page.reload({ waitUntil: "load", timeout: 45000 });
        await page.waitForTimeout(600);
        CACHED = await page.evaluate(() => ({
          hasFigures: !!document.querySelector('[data-testid="movers-coverage"]'),
          saysLoading: !!document.querySelector('[data-testid="movers-loading"]'),
          // Matched on both spellings for the reason given on the `cio-loading`
          // invariant above: the card's absent-state wording narrowed with its
          // scope, and a probe pinned to the old sentence reports "no claim on
          // screen" whether or not one is there.
          body: /No (?:direct-equity )?holding (?:in this book )?carries a day change/i.test(document.body.innerText),
        }));
      }
      if (name === "chat") {
        // Open the panel and ask one question. `/api/chat` is a Pages Function
        // and `vite preview` runs none, so the ask lands on the FAILURE path —
        // which is the branch worth walking anyway: a chat that cannot reach
        // its API must say which failure it was, not render an empty answer
        // that reads as the model having nothing to say.
        const t = page.getByTestId("muns-chat-open");
        if (await t.count()) { await t.click(); await page.waitForTimeout(400); }
        // THE INTRO IS CAPTURED BEFORE THE ASK. Sending a question replaces the
        // empty state with the conversation, so an invariant about what the
        // panel says it was GIVEN has to be struck on the state that says it.
        const intro = await page.evaluate(() =>
          document.querySelector('[data-testid="muns-chat-panel"]')?.innerText ?? "");
        const box = page.getByTestId("muns-chat-input");
        if (await box.count()) {
          await box.fill("What is the book worth?");
          await page.keyboard.press("Enter");
          await page.waitForTimeout(2500);
        }
        CHAT = await page.evaluate((introText) => {
          const panel = document.querySelector('[data-testid="muns-chat-panel"]');
          return {
            open: !!panel,
            intro: introText,
            text: panel ? panel.innerText : "",
            // The dead search box this replaced. Counted as an INPUT, because
            // its placeholder text could legitimately appear in prose.
            searchInputs: [...document.querySelectorAll("input")]
              .filter((i) => /search holdings/i.test(i.placeholder || "")).length,
            // GEOMETRY, because the bug this catches is invisible in the text.
            // `backdrop-filter` on an ancestor makes THAT ancestor the
            // containing block for a `position: fixed` child — and the top bar
            // the trigger lives in carries `backdrop-blur`. The overlay
            // measured 1304x55, a scrim over the header strip alone, so the
            // dashboard was never dimmed and the dialog read as part of the
            // page. Nothing in the rendered words changes when that happens.
            overlay: panel ? (() => {
              const r = panel.parentElement.getBoundingClientRect();
              return { w: Math.round(r.width), h: Math.round(r.height) };
            })() : null,
            panelBox: panel ? (() => {
              const r = panel.getBoundingClientRect();
              return { w: Math.round(r.width), h: Math.round(r.height) };
            })() : null,
            viewport: { w: window.innerWidth, h: window.innerHeight },
          };
        }, intro);
      }
      if (name === "monitor-txns" || name === "monitor-txn-drill" || name === "monitor-txn-direct") {
        const t = page.getByRole("button", { name: /transactions/i }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(1200); }
      }
      if (name === "monitor-cagr") {
        const t = page.getByRole("button", { name: /^CAGR$/ }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(1200); }      }
      /**
       * THE ONE DEFECT HERE THAT A URL CANNOT REACH: switching axis while a
       * SECTION FILTER is set. The filter is an equality test on the section
       * key, so a category key carried into the basket axis matches no row and
       * empties the table — silently, on a page that renders perfectly. That
       * is why `setGroupAxis` clears it, and a guard nothing exercises is a
       * guard that stops working without anyone noticing. So this route does
       * what a reader does: pick a section, then change the slice.
       */
      if (name === "monitor-axis-switch") {
        const sel = page.locator("select").nth(2);        // the section filter
        if (await sel.count()) {
          const opts = await sel.locator("option").allTextContents();
          const pick = opts.find((o) => !/^All /.test(o));
          if (pick) { await sel.selectOption({ label: pick }); await page.waitForTimeout(400); }
        }
        const b = page.locator("button[data-group-axis='basket']").first();
        if (await b.count()) { await b.click(); await page.waitForTimeout(1200); }
      }
      /**
       * A COLLAPSED `<details>` IS NOT IN `innerText`, AND THE LIST INSIDE IT IS
       * THE HALF OF THE FAMILY'S ASK THAT THE CHART CANNOT ANSWER.
       *
       * The NAV card folds its 36 excluded accounts behind a summary, which is
       * right on screen and invisible to a check struck on the rendered text —
       * the same class of failure as a reason living in a `title` attribute.
       * Opened here, on these routes only: opening every `<details>` on every
       * route would change the text other invariants read.
       */
      if (name === "cio" || name === "cio-live") {
        await page.$$eval("main details", (ds) => ds.forEach((d) => { d.open = true; }));
        await page.waitForTimeout(200);
      }
      if (name === "monitor-txn-direct") {
        const t = page.getByRole("button", { name: /^Direct Equity$/ }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(900); }
        DIRECT = await page.evaluate(() => {
          const rows = [...document.querySelectorAll('tr[data-row="group"]')];
          const foot = document.querySelector("tfoot tr");
          const cell = (r, i) => (r?.cells?.[i]?.innerText ?? "").trim();
          const n = (x) => Number((/[\d,]+/.exec(x) ?? ["0"])[0].replace(/,/g, ""));
          return {
            rows: rows.length,
            // READ OFF `data-trades`, NOT OFF THE CELL. That cell renders the
            // count and a "11B/1S" split beside it, so `innerText` is "211B/1S"
            // and the first number in it is 21 — a parser that happens to
            // produce a number, which is exactly the class of wrong answer this
            // sweep exists to catch rather than commit.
            rowTrades: rows.reduce((s, r) => s + Number(r.dataset.trades || 0), 0),
            footTrades: n(cell(foot, 1)),
            footSecurities: n(cell(foot, 2)),
          };
        });
      }
      if (name === "monitor-txn-drill") {
        /**
         * EXPAND EVERY MANAGER, THEN THE FIRST STAGGERED SECURITY.
         *
         * The first draft expanded only the FIRST group — Buoyant, two trades,
         * no series in it — and every drill invariant then failed against a
         * page that was working. Which manager happens to carry a staggered
         * series is a fact about the current drop, so the walk opens all of
         * them and lets the book decide, rather than typing in a name that goes
         * stale on the next delivery.
         *
         * Rows are found by `data-row`, not by their rendered text: matching a
         * caption is matching prose, which renders whatever the data does.
         * Clicked LAST FIRST so expanding one group cannot shift the index of
         * the ones still to be clicked.
         */
        const gs = page.locator('tr[data-row="group"]');
        for (let i = (await gs.count()) - 1; i >= 0; i--) {
          await gs.nth(i).click();
          await page.waitForTimeout(60);
        }
        await page.waitForTimeout(400);
        /**
         * THE LONGEST SERIES, NOT THE FIRST ONE — and that distinction was
         * found by reintroducing the bug it exists to catch.
         *
         * Expanding whichever staggered row came first, a drill-down truncated
         * to two tranches still PASSED: that row spanned two trading days, so
         * "at least one row per day" was satisfied by the truncation itself.
         * The longest series in the book spans two dozen days, and against it a
         * truncation cannot hide. Chosen from `data-days` rather than by name,
         * so the next drop picks its own worst case.
         */
        const st = page.locator('tr[data-row="instrument"][data-staggered]');
        const nSt = await st.count();
        let pick = -1, best = -1;
        for (let i = 0; i < nSt; i++) {
          const d = Number(await st.nth(i).getAttribute("data-days")) || 0;
          if (d > best) { best = d; pick = i; }
        }
        if (pick >= 0) { await st.nth(pick).click(); await page.waitForTimeout(700); }
        DRILL = await page.evaluate(() => ({
          groups: document.querySelectorAll('tr[data-row="group"]').length,
          instruments: document.querySelectorAll('tr[data-row="instrument"]').length,
          staggered: document.querySelectorAll('tr[data-row="instrument"][data-staggered]').length,
          tranches: document.querySelectorAll('tr[data-row="tranche"]').length,
          // The row the walk actually opened — the one immediately above the
          // first tranche, not the first staggered row on the page.
          openDays: Number(document.querySelector('tr[data-row="tranche"]')
            ?.previousElementSibling?.dataset.days ?? 0),
          // Tranche rows whose FIRST cell carries "<qty> @ <price>" — the two
          // figures that have no column of their own on this table and so ride
          // with the date. Counted off the cell rather than off the page text,
          // because `innerText` puts the side pill on its own line and a
          // whole-page regex then matches nothing while the row renders fine.
          trancheWithPrice: [...document.querySelectorAll('tr[data-row="tranche"]')]
            .filter((r) => / @ /.test(r.cells[0]?.innerText ?? "")).length,
        }));
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
      /**
       * THE `title` ATTRIBUTES INSIDE `<main>`, for the same reason as `hrefs`.
       *
       * `AbsentCell` puts its REASON in a title — an em dash a reader hovers —
       * so a rule like "every dashed cell names the custodian that reports no
       * cost" is unreadable from `innerText` and a check struck on the text can
       * only ever report that it is missing. A check that cannot read the thing
       * it asserts on is the failure this file already names twice; the fix is
       * to read it, not to move the reason onto the screen where it would make
       * a 60-row table unreadable.
       */
      const titles = FAST ? [] : await page.$$eval("main [title]", (els) => els.map((e) => e.getAttribute("title") ?? ""));
      /**
       * HOW MANY ACCOUNTS THE NAV CARD ACTUALLY NAMES, counted off the DOM.
       *
       * The partition invariant reads counts out of prose; these are the rows
       * behind them. Two empty lists under a summary saying "36 accounts" is
       * arithmetic that reconciles and names nobody.
       */
      /**
       * ONE LINK PER KPI TILE, COUNTED OFF THE DOM.
       *
       * *"there are multiple links on these KPI tiles. Make these KPI tiles
       * clickable and remove all the other links."* That is a claim about what a
       * reader can click, and no amount of matching `innerText` can see it: the
       * captions that used to be links render identical text either way. So the
       * anchors inside each tile are counted where they are.
       */
      const kpiTiles = FAST ? null : await page.evaluate(() => {
        const strip = document.querySelector('[data-testid="kpi-strip"]');
        if (!strip) return null;
        return [...strip.querySelectorAll(".card")].map((c) => ({
          label: (c.querySelector(".label-xs")?.textContent ?? "").trim(),
          links: [...c.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? ""),
          /**
           * ── THE TWO THINGS `innerText` CANNOT SEE ───────────────────────
           *
           * *"remove the remaining underlines from the texts… Just make the KPI
           * tiles look like 3-d clickable buttons."* Both halves are pure
           * presentation: a tile renders the identical words underlined or not,
           * raised or flat, so every value check on this page passes either way.
           * They are read off the COMPUTED style for that reason.
           */
          underlined: [...c.querySelectorAll("*")].filter((e) =>
            (e.textContent ?? "").trim()
            && getComputedStyle(e).textDecorationLine.includes("underline")).length,
          // A popover trigger is a <button>; nothing else in a tile is one.
          buttons: c.querySelectorAll("button").length,
          /**
           * RAISED = the shadow carries a HARD OFFSET LAYER (a `0 Npx 0` with
           * N ≥ 2) — the tile's own thickness, which a flat card has no
           * equivalent of. Matched on the shape rather than on the exact colour
           * so a palette change does not fail a correct tile, and it is a real
           * distinction rather than "has any shadow": every `.card` in this app
           * already carries a soft one.
           */
          raised: /\b0px\s+([2-9]|\d{2,})px\s+0px\s+0px\b/.test(getComputedStyle(c).boxShadow),
        }));
      });
      /**
       * ── THE ARITHMETIC, ON THE PAGE THE TILE OPENS ────────────────────────
       *
       * *"even the calculation that we're showing that appears when click the
       * underlined no. we can show that inside the clickable KPI pages."* The
       * popover it replaced was opened by a click and rendered into a fixed box,
       * so a sweep that never clicked could not have seen it at all; this is
       * rendered with the page and is read straight off it.
       */
      const formula = FAST ? null : await page.evaluate(() => {
        const box = document.querySelector('[data-testid="drilldown-formula"]');
        if (!box) return null;
        const worked = box.querySelector('[data-testid="drilldown-formula-worked"]');
        return {
          text: (box.innerText ?? "").replace(/\s+/g, " ").trim(),
          worked: ((worked?.textContent ?? "")).replace(/\s+/g, " ").trim(),
        };
      });
      /**
       * ── THE FACET TOGGLE, READ OFF THE TOGGLE ITSELF ─────────────────────
       *
       * *"the listed/private book links and pages should not exist separately…
       * just give the toggle option inside the Consolidated NAV link page."*
       * That is a claim about a CONTROL, and every figure on these pages
       * renders identically whether the halves are reached by a toggle here or
       * by two links on the page before — the value and partition invariants
       * below all passed while the halves were separate scopes. So the toggle's
       * own buttons are read: each one's label, the count it prints, its
       * address, and which is current.
       */
      const facets = FAST ? null : await page.evaluate(() => {
        const box = document.querySelector('[data-testid="drilldown-facets"]');
        if (!box) return null;
        return [...box.querySelectorAll("a[href]")].map((a) => ({
          label: (a.textContent ?? "").replace(/[\d,]+\s*$/, "").replace(/\s+/g, " ").trim(),
          rows: Number(((a.textContent ?? "").match(/([\d,]+)\s*$/)?.[1] ?? "").replace(/,/g, "")),
          href: a.getAttribute("href") ?? "",
          active: a.getAttribute("aria-current") === "true",
        }));
      });
      const navListRows = FAST ? null : await page.evaluate(() => ({
        single: document.querySelectorAll('[data-testid="nav-single-list"] li').length,
        unvalued: document.querySelectorAll('[data-testid="nav-unvalued-list"] li').length,
      }));
      /**
       * EVERY ROW OF THE HOLDINGS TABLE, BY WHAT IT IS rather than by what it
       * prints. `bucket` is on every row and the mandate fields only on the
       * rows that are mandates, which is exactly the distinction the invariants
       * below need and the one the rendered text no longer carries.
       */
      const tableRows = FAST ? null : await page.evaluate(() =>
        [...document.querySelectorAll("tbody tr[data-bucket]")].map((tr) => ({
          bucket: tr.getAttribute("data-bucket"),
          // The rendered first cell, which is what the reader actually reads.
          nameCell: (tr.cells[0]?.innerText ?? "").replace(/\s+/g, " ").trim(),
          mandate: tr.getAttribute("data-mandate"),
          manager: tr.getAttribute("data-manager"),
          accountNo: tr.getAttribute("data-account"),
          holdings: Number(tr.getAttribute("data-holdings")),
          accountHoldings: Number(tr.getAttribute("data-account-holdings")),
        })));
      const mandateRows = tableRows === null ? null : tableRows.filter((r) => r.mandate);
      /**
       * ── THE PER-CATEGORY TOTALS ROW, READ OFF ITS CELLS ─────────────────────
       *
       * "Show aggregate totals for every metric for each category." The claim is
       * that each category's figures add to the Total row beneath them, and that
       * a metric a category cannot answer says WHY rather than sitting blank —
       * so the check needs the cells, in order, and the `title` on each.
       *
       * The reasons are the half that innerText cannot see: `AbsentCell` puts its
       * cause in a hover, which is right on a table this dense and is exactly how
       * the cost-reason invariant on `/holdings` came to be struck on text that
       * never contained it. So the titles are collected alongside the text and
       * the invariants read whichever the claim is actually about.
       */
      const categoryTotals = FAST ? null : await page.evaluate(() => {
        /**
         * A row read BY COLUMN, not by cell.
         *
         * The footer's label spans three columns and a category's does not, so
         * `cells[4]` is a different measurement on each — and an invariant that
         * adds the categories up against the footer is comparing exactly those.
         * Accumulating `colSpan` puts both on the table's own 14 columns, which
         * is the only basis on which the comparison means anything.
         */
        const byColumn = (tr) => {
          const text = [], title = [];
          for (const td of tr.cells) {
            const t = (td.innerText ?? "").replace(/\s+/g, " ").trim();
            const h = td.getAttribute("title") ?? td.querySelector("[title]")?.getAttribute("title") ?? "";
            for (let i = 0; i < (td.colSpan || 1); i++) { text.push(i === 0 ? t : ""); title.push(i === 0 ? h : ""); }
          }
          return { text, title };
        };
        const foot = document.querySelector("tfoot tr[data-footer-total]");
        return {
          rows: [...document.querySelectorAll("tbody tr[data-category-total]")].map((tr) => ({
            key: tr.getAttribute("data-category-total"), ...byColumn(tr),
          })),
          footer: foot ? byColumn(foot) : null,
        };
      });
      /**       * …AND EVERY SECTION HEADING, OFF ITS OWN ATTRIBUTES.
       *
       * The holdings table can be sectioned on three axes now — category (the
       * default and unchanged), the family's asset class, and their baskets —
       * and the heading TEXT was the only thing that said where a section
       * began. `BUCKET_HEADINGS` is a hardcoded list of those names, and its own
       * comment records why that is fragile: a heading it does not know is not
       * a boundary, so the section above silently swallows every row below it.
       * Three axes would triple the names that list has to track, and the
       * failure is invisible when it happens. So a heading declares itself, the
       * same contract `data-mandate` and `data-row` already carry.
       */
      const sectionRows = FAST ? null : await page.evaluate(() =>
        [...document.querySelectorAll("tr[data-section]")].map((tr) => ({
          key: tr.getAttribute("data-section"),
          axis: tr.getAttribute("data-axis"),
          subtotal: Number(tr.getAttribute("data-subtotal")),
          holdings: Number(tr.getAttribute("data-holdings")),
          ruleMV: Number(tr.getAttribute("data-rule-mv")),
          text: (tr.innerText ?? "").replace(/\s+/g, " ").trim(),
        })));      /**
       * …AND WHAT EACH LINK IS LABELLED, because "the page contains a link to
       * X" is a weaker claim than "the figure the reader clicks opens X" — and
       * the weaker one passed a bug that was really there. Reintroducing it
       * proved it: pointing the Dry powder tile at the holdings drill-down left
       * the sweep green, because another link elsewhere on the page still
       * satisfied a check that only counted addresses. A drill-down invariant
       * has to pair the LABEL with the DESTINATION or it is not asserting the
       * thing a reader experiences.
       */
      const links = FAST ? [] : await page.$$eval("main a[href]", (as) =>
        as.map((a) => ({ href: a.getAttribute("href") ?? "", text: (a.innerText ?? "").replace(/\s+/g, " ").trim() })));
      // What the monitor printed about each mandate, so the drill-down can be
      // checked against it — and the address of the drill-down itself.
      if (name === "monitor") {
        MANDATE_PATH = hrefs.find((h) => /^\/mandate\/./.test(h)) ?? MANDATE_PATH;
        for (const m of mandateRows ?? []) MANDATE_ROWS.set(m.accountNo, m);
      }
      /**
       * WHAT MORNING CIO DREW, so the drill-downs below can be checked against
       * it rather than against a figure typed into this file.
       *
       * The addresses come off the DOM and the figures off the rendered text —
       * the same two sources a reader uses. Captured on the primary theme/width
       * pass only, which is the one where `innerText` is real.
       */
      // WHAT EACH DRILL-DOWN PRINTED, so a later one can be checked against it.
      // The listed and private halves have to PARTITION the book, and that is a
      // claim about the two pages together which neither can make alone.
      if (!FAST && name.startsWith("holdings-")) {
        DRILLDOWN_COUNTS.set(name, drilldownCounts(text));
      }
      if (name === "cio") {
        // THE ADDRESSES ARE COLLECTED EVEN IN FAST MODE, for the reason
        // `MANDATE_PATH` is: the responsive sweep would otherwise walk each
        // drill-down's not-found page at every width, measuring the layout of a
        // screen nobody sees. The FIGURES below need real `innerText` and are
        // gated; the invariants that read them are gated the same way.
        for (const h of hrefs) {
          const m = /^\/holdings\?of=([a-z-]+)/.exec(h);
          // FIRST WINS, so the row captured is the allocation table's largest —
          // stable across drops in a way "whichever sorted last" is not.
          if (m && !CIO_DRILLDOWNS.has(m[1])) CIO_DRILLDOWNS.set(m[1], h);
          if (/^\/holdings\?of=bucket&key=./.test(h) && !CIO_BUCKET_HREFS.includes(h)) CIO_BUCKET_HREFS.push(h);
        }
      }
      /**
       * ── FACET ADDRESSES, KEYED `scope#facet` ─────────────────────────────
       *
       * The listed half, the private half and the cost-less positions were each
       * their own scope, linked from a SECOND link inside a KPI tile. They are
       * facets of their tile's own drill-down now, so their addresses come from
       * two places: the Concentration card still links the two halves directly,
       * and the no-cost set is reachable only from the toggle on the Capital
       * invested page. Collected from EVERY route that draws one, so a walk that
       * loses a publisher fails by resolving no address rather than by silently
       * checking a different page.
       */
      for (const h of hrefs) {
        const m = /^\/holdings\?of=([a-z-]+)(?:&key=[^&]*)?&facet=([a-z-]+)/.exec(h);
        if (m && !CIO_DRILLDOWNS.has(`${m[1]}#${m[2]}`)) CIO_DRILLDOWNS.set(`${m[1]}#${m[2]}`, h);
      }
      if (name === "cio" && !FAST) {
        for (const r of cioAllocationRows(text)) CIO_ALLOCATION.set(r.label, r);
        const grab = (label, re) => { const v = money2cr(re.exec(text)?.[1]); if (Number.isFinite(v)) CIO_FIGURES.set(label, v); };
        grab("nav", new RegExp(String.raw`CONSOLIDATED NAV\s*\n\s*(₹[\d,.]+\s*(?:Cr|L|K)?)`, "i"));
        grab("invested", new RegExp(String.raw`CAPITAL INVESTED\s*\n\s*(₹[\d,.]+\s*(?:Cr|L|K)?)`, "i"));
        grab("no-cost", new RegExp(String.raw`positions? worth (₹[\d,.]+\s*(?:Cr|L|K)?) carry no cost`, "i"));
        grab("measured", new RegExp(String.raw`\d+ of \d+ accounts\s*·\s*(₹[\d,.]+\s*(?:Cr|L|K)?) of `, "i"));
        const counts = /Positions\s*\n?\s*([\d,]+)[\s\S]{0,40}?Distinct names\s*\n?\s*([\d,]+)/i.exec(text);
        if (counts) { CIO_FIGURES.set("positions", cr(counts[1])); CIO_FIGURES.set("names", cr(counts[2])); }
        // The rest of the Concentration card, so each drill-down can be held to
        // the figure a reader clicked rather than to a literal written here.
        const num = (label, re) => { const v = Number(re.exec(text)?.[1] ?? NaN); if (Number.isFinite(v)) CIO_FIGURES.set(label, v); };
        num("crossHeld", /Cross-held\s*\n?\s*([\d,]+)/i);
        num("top10Pct", /Top-10 conc\.?\s*\n?\s*(\d+)%/i);
        const wl = /Winners\s*\/\s*losers\s*\n?\s*([\d,]+)\s*\/\s*([\d,]+)/i.exec(text);
        if (wl) { CIO_FIGURES.set("winners", cr(wl[1])); CIO_FIGURES.set("losers", cr(wl[2])); }
        grab("listed", new RegExp(String.raw`^Listed (₹[\d,.]+\s*(?:Cr|L|K)?)`, "im"));
        grab("private", new RegExp(String.raw`Private (₹[\d,.]+\s*(?:Cr|L|K)?)`, "i"));
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
      /**
       * THE RING-FENCE, ASSERTED ON EVERY PAGE THAT IS NOT THE POLYCAB PAGE.
       *
       * The family asked for Polycab to be limited to its own page, so "it is
       * gone" is a claim about EVERY OTHER ROUTE and cannot be checked one page
       * at a time. `build-book.mjs` keeps it out of `BOOK_POSITIONS`, but a page
       * could still name it from a caption, a preview or a hard-coded example —
       * which is exactly the failure class this file exists to catch. So the
       * absence is asserted where a reader would see it: the rendered text.
       *
       * EXEMPTED BY WHERE THE PAGE LANDED, NOT BY ROUTE NAME. Two routes in this
       * sweep resolve to the Polycab page — `/polycab`, and the `/stock/<key>`
       * address that redirects to it — and naming Polycab is the whole point of
       * both. An exemption keyed on the route NAME would have to list them, and
       * would silently stop exempting the day one is renamed; keyed on the
       * RESOLVED URL it cannot drift, because it asks the question the rule
       * actually asks: is this the Polycab page?
       *
       * SCOPED TO `<main>`, DELIBERATELY. The other invariants read
       * `document.body.innerText`, which includes the persistent left nav — and
       * the nav carries a "Polycab" ENTRY, by request, on every page. Read off
       * the body this check fails on all 27 routes at once for the one reason
       * that is correct, which is the "a check that cannot read the figure it
       * asserts on" failure this file already names once. The claim is about a
       * page's CONTENT, so it is struck on the content.
       */
      /**
       * IS THE HEADLINE ONE LINE? Measured, not asserted in prose.
       *
       * The eyebrow used to sit above the title and the view switch on a
       * toolbar row of its own — three rows to say where you are. The claim
       * that they now share one is geometric, so it is struck on geometry: the
       * three boxes must overlap vertically. A CSS regression that stacks them
       * again fails here; a caption never could.
       */
      if (!FAST && name === "monitor" && theme === THEMES[0] && width === WIDTHS[0]) {
        HEAD = await page.evaluate(() => {
          const h1 = document.querySelector("main h1");
          if (!h1) return null;
          const btn = [...document.querySelectorAll("main button")];
          const bar = h1.parentElement;
          const eyebrow = bar?.firstElementChild;
          const toggle = [...(bar?.children ?? [])].find((el) => /Holdings/.test(el.textContent ?? "") && el !== h1);
          const box = (el) => (el ? el.getBoundingClientRect() : null);
          const overlap = (a, b) => !!a && !!b && a.top < b.bottom && b.top < a.bottom;
          const r = { h1: box(h1), eyebrow: box(eyebrow), toggle: box(toggle) };
          return {
            hasEyebrow: !!eyebrow && eyebrow !== h1,
            eyebrowInline: overlap(r.eyebrow, r.h1),
            toggleInline: overlap(r.toggle, r.h1),
            // The eyebrow reads smaller than the title it precedes.
            eyebrowSmaller: !!r.eyebrow && !!r.h1 && (r.eyebrow.height < r.h1.height),
            // The two retired controls, counted as BUTTONS. Matching their
            // words would hit the Transactions card's own view controls and
            // this page's prose, and fail a page that is correct.
            basisSwitch: btn.filter((b) => /^By (security|entity)$/i.test((b.textContent ?? "").trim())).length,
            deckButton: btn.filter((b) => /review deck/i.test(b.textContent ?? "")).length,
            // Export Excel shares a line with the last filter control, rather
            // than wrapping below it — which is the space the family asked for.
            exportInline: (() => {
              const ex = btn.find((b) => /export excel/i.test(b.textContent ?? ""));
              const sel = [...document.querySelectorAll("main select")].at(-1);
              if (!ex || !sel) return false;
              const a = ex.getBoundingClientRect(), b = sel.getBoundingClientRect();
              return a.top < b.bottom && b.top < a.bottom;
            })(),
          };
        });
      }
      const mainText = FAST ? "" : await page.evaluate(() => document.querySelector("main")?.innerText ?? "");
      /**
       * HOW MANY TABLE ROWS A READER ACTUALLY SEES WITHOUT SCROLLING.
       *
       * "Right now I cannot even see 2 companies completely, which is very
       * inefficient presentation." That complaint is about GEOMETRY, and no
       * amount of matching on innerText can catch it — a page can print every
       * row correctly and still spend the first screen on chrome. So the sweep
       * measures it in the page and hands it to the invariants, which is the
       * only way an assertion about density can fail when density regresses.
       */
      const metrics = FAST ? null : await page.evaluate(() => {
        const vh = window.innerHeight;
        const rows = [...document.querySelectorAll("tbody tr")]
          .map((tr) => tr.getBoundingClientRect())
          .filter((r) => r.height > 0);
        const inView = rows.filter((r) => r.top >= 0 && r.bottom <= vh).length;
        const firstTop = rows.length ? Math.round(rows[0].top) : null;
        /**
         * A RAISED CARD MUST BE A BUTTON. Morning CIO's strip asserts that every
         * tile which opens something looks pressable; this is the converse,
         * measured on every card on whatever page is being walked. A stylesheet
         * that raised `.card` outright would satisfy the strip's check and turn
         * every panel in the app into a button that does nothing.
         */
        const raised = (el) => /\b0px\s+([2-9]|\d{2,})px\s+0px\s+0px\b/.test(getComputedStyle(el).boxShadow);
        const cards = [...document.querySelectorAll("main .card")];
        const flatCards = {
          raisedWithoutLink: cards.filter((c) => raised(c) && !c.querySelector("a[href]")).length,
          total: cards.length,
        };
        return { rowsInView: inView, firstRowTop: firstTop, viewportH: vh, flatCards };
      });
      const isPolycabPage = /\/polycab$/.test(page.url());
      if (!FAST && theme === THEMES[0] && width === WIDTHS[0] && !isPolycabPage && /polycab/i.test(mainText)) {
        invariants.push("Polycab is ring-fenced to its own page, and this page names it");
      }
      /**
       * AND THE REGISTER REACHES NO OTHER PAGE. `registerData.ts` is a cost
       * record the book deliberately does not carry; a name from it appearing on
       * a page that computes a portfolio figure means the two have been mixed,
       * which is the double count the family asked us to rule out.
       */
      const isRegisterPage = /\/register$/.test(page.url());
      if (!FAST && theme === THEMES[0] && width === WIDTHS[0] && !isRegisterPage
          && REGISTER_SENTINEL && new RegExp(REGISTER_SENTINEL, "i").test(mainText)) {
        invariants.push(`the investment register is its own page, and this page names ${REGISTER_SENTINEL} from it`);
      }
      // `holdings-row-3` shares its invariant list with every other allocation
      // row: the assertions compare each page against ITS OWN row's cells, so
      // one list serves all of them and a per-row copy would be eight places to
      // drift apart.
      const checks = INVARIANTS[name] ?? INVARIANTS[name.replace(/-\d+$/, "")];
      if (!FAST && theme === THEMES[0] && width === WIDTHS[0] && checks) {
        for (const [desc, test] of checks) {
          let r;
          // A CHECK THAT THREW HAS NOT PASSED, and it must not take the sweep
          // down with it either. Reported by name with the message, so a
          // broken matcher reads as a broken matcher rather than as a clean
          // page — the same rule as `golden.mjs`'s BLOCKED.
          // `path` is what was REQUESTED; `url` is where the app actually
          // landed. A redirect invariant needs the second — asserting on the
          // first would test the harness's own input rather than the app.
          try { r = test(text, { hrefs, titles, links, main: mainText, metrics, navListRows, tableRows, mandateRows, categoryTotals, sectionRows, kpiTiles, facets, formula, path, url: page.url() }); }
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
