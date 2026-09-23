// ── ONE SEARCH BOX THAT TAKES A READER WHERE THEY MEANT ─────────────────────
//
//   *"this whole thing needs to be a very smart search bar which takes me to
//    exactly where i want to go when i type the data in this … that data can be
//    of any equity, any fund, any position that I have taken, any tab, etc. It
//    can be basically anything. So think as the customer: what all they can
//    type, and just make the search bar accordingly."*
//
// WHAT A READER TYPES, and what each one means here:
//
//   a company, a fund, a scheme       → its holding page (`/stock/:securityKey`)
//   an ISIN, an NSE symbol            → the same, matched EXACTLY and ranked first
//   a PMS manager or strategy         → the mandate (`/mandate/:accountId`)
//   an account or folio number        → the page that account's holdings live on
//   a family member or a trust        → their entity (`/family?entity=`)
//   a page, a tab, a view             → that page, on that tab
//   a category, a basket, a side      → the holdings behind that allocation row
//   a sector ("banks", "pharma")      → the holdings in it
//   a figure ("uncalled", "XIRR")     → the page that shows and explains it
//
// (A QUESTION used to go to Muns from the list's own last row. That row went
// with the top bar's Ask Muns button at the family's request — Stage 10bz — and
// `looksLikeQuestion` below is kept for the day it comes back.)
//
// ── EVERY ENTRY IS DERIVED FROM THE BOOK THE PAGE ALREADY HOLDS ─────────────
//
// No security, entity, account or amount is typed here. What IS typed is the
// vocabulary people use for a PAGE or a FIGURE ("dry powder" for uncalled
// capital, "tax" for Capital Gains) and the GICS synonyms ("banks" for
// Financials) — words about the dashboard, which is the legitimate exception
// CLAUDE.md names beside icon maps and sector tables. A synonym never places a
// holding: it only says which page answers a word.
//
// ── AND THE RING-FENCE HOLDS HERE TOO ────────────────────────────────────────
//
// This module reads `portfolio.positions`, which `build-book` has already
// spliced the promoter holding out of, and never `BOOK_POLYCAB`. So "polycab"
// finds the Polycab PAGE — the nav entry every page already carries — then
// that page's own two other tabs, and no holding row, no figure and no
// account. `/stock/polycab-india` would forward to that page anyway (App.tsx);
// the search simply never offers it.
//
// ── THE MATCH IS DETERMINISTIC AND EXPLAINABLE ──────────────────────────────
//
// An identifier (ISIN, symbol, account number) matched exactly outranks every
// name. Then, in order: the whole name, a prefix of it, every word the reader
// typed starting a word of the name, the name's initials, a substring, and a
// ONE-EDIT near miss on a word of four letters or more ("snashi" → Sanshi).
// There is no similarity score over whole names — the fuzzy tiers this repo has
// already refused matched `KIRANAKART TECHNOLOGIES` to `TATA TECHNOLOGIES` —
// and a near miss is only ever a way to a page, never a join between figures.
import type { Account, Position } from "./types";
import { accountIndex, type AccountIndex } from "./accounts";
import {
  currentHoldings, dedupedPositions, isMandateHeld, mandateLabel, bucketLabel,
  isRedeemedToNil, negligibleKeys, readerClassOf, sum,
} from "./analytics";
import { groupKeyFor, groupLabelFor, GROUP_AXES } from "./groupAxis";
import { AXIS_SCOPE, drilldownHref } from "./drilldown";
import { fundMarketSideOf } from "./aifCategory";
import { NAV } from "./nav";
import { printedSpellings } from "./securityLabel";

export type SearchKind =
  | "holding" | "mandate" | "person" | "account"
  | "page" | "view" | "category" | "sector" | "figure";

export type SearchEntry = {
  /** Stable across renders — the recents list and the DOM key read it. */
  id: string;
  kind: SearchKind;
  /** The chip beside the label: what this row IS, in a word. */
  chip: string;
  label: string;
  /** The second line — derived, and never empty. */
  detail: string;
  href: string;
  /** Names a reader would type for it, most specific first. */
  names: string[];
  /** Exact identifiers — ISIN, symbol, account number. An exact hit wins. */
  codes: string[];
  /** The words people use for it that are not its name. */
  keywords: string[];
  /** Tie-break inside one score tier: money for a holding, priority for a page. */
  weight: number;
  /** A position the family no longer holds — findable, ranked below any held one. */
  closed?: boolean;
};

/** A ranked hit, with the tier that matched it — for tests and for the hover. */
export type SearchHit = { entry: SearchEntry; score: number; matched: string };

type Money = (n: number) => string;

// ── normalisation ─────────────────────────────────────────────────────────────

/** Lower-case, accents gone, `&` read as "and", anything else a single space. */
export function normSearch(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
const compact = (s: string) => normSearch(s).replace(/ /g, "");

/** Optimal-string-alignment distance, capped — only ever asked "is it 0, 1 or more?". */
function osa(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** A typed word is a one-edit near miss of the START of a name's word. */
function nearWord(tok: string, word: string): boolean {
  if (tok.length < 4 || word.length < 4) return false;
  for (const len of [tok.length - 1, tok.length, tok.length + 1]) {
    if (len < 3 || len > word.length) continue;
    if (osa(tok, word.slice(0, len), 1) <= 1) return true;
  }
  return false;
}

/**
 * HOW WELL ONE TEXT MATCHES WHAT WAS TYPED. The tiers are the whole ranking —
 * a later tier never outranks an earlier one — so the order below IS the
 * explanation a reader would give for "why is that first".
 */
export function scoreText(query: string, text: string): { score: number; tier: string } {
  const q = normSearch(query);
  const t = normSearch(text);
  if (!q || !t) return { score: 0, tier: "" };
  if (t === q) return { score: 1000, tier: "exact" };
  const words = t.split(" ");
  const toks = q.split(" ");
  // THE WHOLE OF WHAT WAS TYPED IS THE START OF THE NAME, ending on a word
  // boundary — "hdfc" against "HDFC Balanced Advantage Fund".
  // (The length term is a nudge, never more than a few points: between two
  // names that both start with what was typed, the LARGER holding should lead,
  // and a name's length says nothing about which one the reader means.)
  if (t.startsWith(q) && t[q.length] === " ") return { score: 850 + Math.round((q.length / t.length) * 6), tier: "leading words" };
  // EVERY TYPED WORD IS A WHOLE WORD OF THE NAME — "gold" against "DSP Gold
  // ETF", which must outrank "gold" as the first letters of "Goldstandard".
  if (toks.every((k) => words.includes(k))) return { score: 760, tier: "whole words" };
  if (t.startsWith(q)) return { score: 700 + Math.round((q.length / t.length) * 6), tier: "prefix" };
  if (toks.every((k) => words.some((w) => w.startsWith(k)))) return { score: 650, tier: "word-start" };
  const initials = words.map((w) => w[0]).join("");
  if (!q.includes(" ") && q.length >= 2 && initials.startsWith(q)) return { score: 520, tier: "initials" };
  if (t.includes(q)) return { score: 450, tier: "substring" };
  const qc = q.replace(/ /g, "");
  if (qc.length >= 3 && t.replace(/ /g, "").includes(qc)) return { score: 420, tier: "joined" };
  if (toks.every((k) => t.includes(k))) return { score: 380, tier: "every word" };
  if (toks.every((k) => words.some((w) => w.startsWith(k) || nearWord(k, w)))) return { score: 300, tier: "near miss" };
  return { score: 0, tier: "" };
}

/** Kind boosts: small, and only ever a tie-break between two equal tiers. */
const KIND_BOOST: Record<SearchKind, number> = {
  page: 30, person: 25, view: 20, mandate: 15, holding: 10, figure: 8, category: 6, sector: 4, account: 0,
};

/** Rank every entry against what was typed. Empty query → nothing. */
export function searchEntries(entries: SearchEntry[], query: string, limit = 10): SearchHit[] {
  const q = normSearch(query);
  if (!q) return [];
  const code = compact(query).toUpperCase();
  const hits: SearchHit[] = [];
  for (const e of entries) {
    let best = 0, matched = "";
    if (code.length >= 3) {
      for (const c of e.codes) {
        const cc = compact(c).toUpperCase();
        if (!cc) continue;
        if (cc === code) { best = 1200; matched = "identifier"; break; }
        if (code.length >= 4 && cc.startsWith(code) && 700 > best) { best = 700; matched = "identifier prefix"; }
      }
    }
    for (const n of e.names) {
      const s = scoreText(query, n);
      if (s.score > best) { best = s.score; matched = s.tier; }
    }
    for (const k of e.keywords) {
      const s = scoreText(query, k);
      const v = Math.round(s.score * 0.85);
      if (v > best) { best = v; matched = `${s.tier} · a word for it`; }
    }
    if (!best) continue;
    const weight = e.weight > 0 ? Math.log10(1 + e.weight / 1e5) * 4 : 0;
    // AN ACCOUNT FOUND BY ITS PROVIDER'S NAME IS A FALLBACK, not a peer of the
    // holding the same name reaches: "sanshi" wants the fund, and four folio
    // rows under it would bury everything after. Found by its NUMBER it is the
    // answer and keeps its score.
    const fallback = e.kind === "account" && matched !== "identifier" && matched !== "identifier prefix" ? -150 : 0;
    // A position the family no longer holds is still findable — "where did my
    // 3P go" is a real question — but it never outranks one they hold.
    const closed = e.closed ? -60 : 0;
    hits.push({ entry: e, score: best + KIND_BOOST[e.kind] + weight + fallback + closed, matched });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
  // AT MOST TWO ACCOUNT ROWS unless they were asked for by number — a list of
  // folios is what the holding's own page is for.
  const out: SearchHit[] = [];
  let accounts = 0;
  for (const h of hits) {
    const byNumber = h.matched === "identifier" || h.matched === "identifier prefix";
    if (h.entry.kind === "account" && !byNumber && ++accounts > 2) continue;
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * IS THIS A QUESTION RATHER THAN A PLACE? Then Muns goes first. A search for
 * "HDFC" wants the holding; "how much HDFC do I hold across funds?" wants an
 * answer, and the one surface that composes answers is the chat.
 *
 * NO CALLER SINCE Stage 10bz: the search list's Ask Muns row it ordered went
 * with the top bar's button when the family paused the chat. Kept, and still
 * asserted in `searchIndex.test.ts`, because the chat is paused rather than
 * removed — see `MunsChat.tsx` for how both come back.
 */
export function looksLikeQuestion(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.endsWith("?")) return true;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  return /^(what|how|why|which|who|whom|whose|when|where|is|are|was|were|can|could|does|do|did|should|would|will|show me|tell me|explain|compare|list|give me|summari[sz]e)\b/.test(q);
}

// ── the index ─────────────────────────────────────────────────────────────────

/** GICS sector → the words people use for it. A sector table, which is a named exception. */
const SECTOR_WORDS: Record<string, string[]> = {
  "Financials": ["banks", "banking", "bank", "nbfc", "finance", "insurance", "financial services"],
  "Information Technology": ["it", "tech", "technology", "software", "it services"],
  "Health Care": ["pharma", "pharmaceuticals", "healthcare", "hospitals", "health"],
  "Consumer Discretionary": ["auto", "automobiles", "retail", "consumer durables", "discretionary"],
  "Consumer Staples": ["fmcg", "staples", "food", "beverages"],
  "Industrials": ["capital goods", "engineering", "defence", "defense", "industrial", "infra"],
  "Materials": ["chemicals", "metals", "cement", "steel", "mining", "materials"],
  "Energy": ["oil", "gas", "petroleum", "refining"],
  "Utilities": ["power", "electricity", "utility"],
  "Real Estate": ["realty", "property", "reit", "reits"],
  "Communication Services": ["telecom", "media", "communication"],
};

/** The words for each page, beyond its own label. About the DASHBOARD, never the book. */
const PAGE_WORDS: Record<string, string[]> = {
  "/cio": ["home", "dashboard", "summary", "overview", "morning", "briefing", "today"],
  "/monitor": ["holdings", "portfolio", "positions", "all holdings", "stocks", "monitor"],
  "/private-market": ["private", "private equity", "pe", "venture", "vc", "drawdown funds", "capital accounts"],
  "/polycab": ["promoter holding", "promoter"],
  "/family": ["family", "entities", "members", "people", "trusts", "custody"],
  "/sectors": ["sector", "sectors", "industry", "industries"],
  "/capital-gains": ["tax", "capital gains", "realised", "realized", "ltcg", "stcg", "gains"],
  "/performance": ["performance", "returns", "nav history", "benchmark"],
  "/returns": ["drawdown", "return analysis", "risk"],
  "/corporate-actions": ["corporate actions", "stock split", "bonus", "dividend adjustment", "dividend-inclusive return", "entitlements", "total return"],
  "/ledger": ["ledger", "dividends", "dividend", "income", "lots", "realised by trade"],
  "/audit": ["audit", "statements", "documents", "source", "pdf", "archive", "extraction"],
  "/history": ["upload history", "history", "uploads"],
};

/** Tabs and views INSIDE a page — each reachable by its own address. */
const VIEWS: { id: string; label: string; href: string; words: string[]; detail: string }[] = [
  { id: "view:transactions", label: "Transactions", href: "/monitor?show=transactions",
    words: ["trades", "buys", "sells", "bought", "sold", "what i invested", "capital in", "redemptions", "contributions"],
    detail: "Portfolio Monitor · every dated buy, sell, contribution and redemption, in the same sections as the holdings" },
  { id: "view:security", label: "Holdings by security", href: "/monitor?group=security",
    words: ["stock wise", "security wise", "exposure", "company exposure", "look through", "look-through", "clubbed", "through funds"],
    detail: "Portfolio Monitor · one row per company across every vehicle, with what the funds disclose" },
  { id: "view:basket", label: "Holdings by basket", href: "/monitor?group=basket", words: ["baskets", "basket wise"],
    detail: "Portfolio Monitor · sectioned on the family's four baskets" },
  { id: "view:assetClass", label: "Holdings by asset class", href: "/monitor?group=assetClass", words: ["asset class wise", "asset classes"],
    detail: "Portfolio Monitor · sectioned on the family's own asset classes" },
  { id: "view:movers", label: "Today's movers", href: "/cio", words: ["movers", "gainers", "losers today", "top movers", "daily movers", "what moved"],
    detail: "Morning CIO · the family's own direct equity against the previous close" },
  { id: "view:nav-movers", label: "Fund NAV movers", href: "/cio?movers=funds", words: ["nav movers", "fund movers", "mutual fund nav", "etf nav", "fund nav"],
    detail: "Morning CIO · each fund's published NAV against the one before it" },
  { id: "view:allocation", label: "Allocation & risk", href: "/cio?tab=allocation", words: ["allocation", "concentration", "split", "capital deployment", "risk"],
    detail: "Morning CIO · how the book is split, what is still to be called, and where it is concentrated" },
  { id: "view:nav-chart", label: "NAV vs Nifty 500", href: "/cio?tab=nav", words: ["nifty", "nifty 500", "benchmark", "nav chart", "index", "vs nifty"],
    detail: "Morning CIO · the book's dated valuation series against the index" },
  { id: "view:pm-owners", label: "Private market by owner", href: "/private-market?view=owners", words: ["private by owner", "who holds private"],
    detail: "Private Market · each member's private holdings, as their own statements print them" },
  { id: "view:pm-returns", label: "Private fund returns", href: "/private-market?ret=absolute,xirr", words: ["fund returns", "private returns", "fund xirr", "hpr"],
    detail: "Private Market · each fund's holding-period return beside its money-weighted XIRR" },
  // SECTOR COMPOSITION'S AND POLYCAB'S OWN TABS. Consolidated and Holding are
  // each page's default, so the page entry already opens them.
  { id: "view:sectors-direct", label: "Direct Equity by sector", href: "/sectors?view=direct",
    words: ["direct equity sectors", "direct sectors", "sectors of direct equity", "own shares by sector"],
    detail: "Sector Composition · the sectors of the shares the family bought themselves" },
  { id: "view:sectors-compare", label: "Compare sectors", href: "/sectors?view=compare",
    words: ["sector comparison", "sectors side by side", "compare sector"],
    detail: "Sector Composition · up to four sectors side by side, on both sets at once" },
  { id: "view:polycab-actions", label: "Polycab corporate actions", href: "/polycab?view=actions",
    words: ["polycab dividend", "polycab dividends", "polycab bonus", "polycab split"],
    detail: "Polycab · every dividend, bonus and split the company has declared, from the exchange's record" },
  { id: "view:polycab-promoter", label: "Polycab promoter group", href: "/polycab?view=promoter",
    words: ["polycab promoter", "polycab pledge", "promoter pledge", "promoter group"],
    detail: "Polycab · the promoter group's disclosed holding and pledge, quarter by quarter" },
];

/** Figures — each opens the page that shows it WITH its own explanation. */
const FIGURES: { id: string; label: string; href: string; words: string[]; detail: string }[] = [
  { id: "fig:book", label: "Current Value of Holdings", href: drilldownHref("book"),
    words: ["current value", "value", "nav", "net asset value", "total", "worth", "portfolio value", "aum", "net worth"],
    detail: "Every holding in the book, counted once, with each figure's basis" },
  { id: "fig:invested", label: "Capital invested", href: drilldownHref("book", undefined, "costed"),
    words: ["invested", "cost", "amount invested", "capital invested", "cost basis"],
    detail: "Current Value of Holdings, on the holdings that report a cost — and the return struck on it" },
  { id: "fig:no-cost", label: "Holdings with no cost reported", href: drilldownHref("book", undefined, "no-cost"),
    words: ["no cost", "missing cost", "cost not reported"],
    detail: "The positions whose statement prints a value and no cost — and why" },
  { id: "fig:xirr", label: "Money-weighted return (XIRR)", href: drilldownHref("measured"),
    words: ["xirr", "irr", "money weighted", "money-weighted return"],
    detail: "The accounts that carry dated flows and an opening value, and the rate across them" },
  { id: "fig:top", label: "Top 10 names", href: drilldownHref("top-names"),
    words: ["top 10", "top ten", "largest holdings", "biggest holdings", "top holdings", "concentration"],
    detail: "The ten largest names in the book" },
  { id: "fig:cross", label: "Names held by more than one member", href: drilldownHref("cross-held"),
    words: ["cross held", "common holdings", "overlap", "held by both"],
    detail: "The names two or more family members each hold" },
  { id: "fig:winners", label: "Holdings in profit", href: drilldownHref("winners"),
    words: ["winners", "gainers", "in profit", "profitable"], detail: "The holdings showing a gain on cost" },
  { id: "fig:losers", label: "Holdings at a loss", href: drilldownHref("losers"),
    words: ["losers", "in loss", "losing", "loss making"], detail: "The holdings showing a loss on cost" },
  { id: "fig:uncalled", label: "Uncalled capital", href: "/private-market",
    words: ["uncalled", "dry powder", "undrawn", "still to call", "commitments", "committed", "capital calls", "drawdowns", "due now"],
    detail: "Private Market · what the private funds can still call, fund by fund, with every dated call" },
  { id: "fig:distributions", label: "Distributions", href: "/private-market",
    words: ["distributions", "cash returned", "payouts", "paid back"],
    detail: "Private Market · the cash the private funds have paid back" },
];

/**
 * BUILD THE INDEX from the book this page already holds.
 *
 * `positions` is the RAW set (every statement row) and `consolidated` the
 * deduped one — a per-person or per-account figure is struck on the raw rows
 * and a holding's value on the consolidated ones, the rule this book keeps
 * everywhere (§"consolidated counts once, per-account does not").
 */
export function buildSearchIndex(input: {
  positions: Position[];
  consolidated: Position[];
  accounts: Account[];
  money: Money;
}): SearchEntry[] {
  const { positions, consolidated, accounts, money } = input;
  const idx: AccountIndex = accountIndex(accounts);
  const out: SearchEntry[] = [];
  const current = currentHoldings(consolidated);
  const bookMV = sum(current.map((p) => p.marketValue));
  const pctOfBook = (v: number) => (bookMV > 0 ? `${((v / bookMV) * 100).toFixed(v / bookMV >= 0.001 ? 1 : 2)}% of the book` : "");
  const small = negligibleKeys(positions);

  // ── holdings — one per security, current or closed ────────────────────────
  const byKey = new Map<string, Position[]>();
  for (const p of dedupedPositions(positions)) {
    if (small.has(p.securityKey)) continue;          // the family's ₹1,000 floor
    byKey.set(p.securityKey, [...(byKey.get(p.securityKey) ?? []), p]);
  }
  for (const [key, rows] of byKey) {
    const head = rows[0];
    const mv = sum(rows.map((p) => p.marketValue));
    const closed = rows.every((p) => isRedeemedToNil(p));
    const raw = positions.filter((p) => p.securityKey === key);
    const accountsHolding = new Set(raw.map((p) => p.accountId)).size;
    const owners = [...new Set(raw.map((p) => idx.get(p.accountId)?.owner).filter(Boolean))] as string[];
    const bucket = groupKeyFor("category", idx, head);
    // THE CLASS A READER IS SHOWN is `readerClassOf`'s, never the wrapper the
    // statement typed: a liquid or arbitrage fund is Cash on every screen, at
    // the family's instruction (Stage 10ce), and a chip reading "Mutual fund"
    // beside a detail line reading "Cash" would name it twice, two ways.
    const cls = readerClassOf(head);
    const chip = cls === "Equity" ? "Stock"
      : cls === "Mutual Fund" ? "Mutual fund" : cls;
    out.push({
      id: `holding:${key}`, kind: "holding", chip,
      label: head.security,
      detail: closed
        ? `Redeemed — no longer held · the redemption is on Transactions`
        : [bucketLabel(bucket), money(mv), pctOfBook(mv),
          accountsHolding === 1 ? `1 account · ${owners[0] ?? ""}` : `${accountsHolding} accounts · ${owners.length} member${owners.length === 1 ? "" : "s"}`]
          .filter(Boolean).join(" · "),
      // A redeemed fund's money is on the Transactions tab, where its
      // redemption is — its holding page would show a measured nil and little else.
      href: closed ? "/monitor?show=transactions" : `/stock/${encodeURIComponent(key)}`,
      // EVERY SPELLING A STATEMENT PRINTED, not only the one shown. The row is
      // named once, but a reader types whichever name they know: the depository
      // prints State Bank of India as `SBI`, and with the two keys joined the
      // label alone left "sbi" finding nothing.
      names: [head.security, ...printedSpellings(key).filter((n) => n !== head.security), key.replace(/-/g, " ")],
      codes: [head.isin, head.symbol].filter((c): c is string => !!c),
      keywords: [head.sector, bucketLabel(bucket)].filter((s): s is string => !!s && s !== "Unclassified"),
      weight: Math.abs(mv),
      closed,
    });
  }

  // ── PMS mandates — one per account ────────────────────────────────────────
  const byAccount = new Map<string, Position[]>();
  for (const p of positions) byAccount.set(p.accountId, [...(byAccount.get(p.accountId) ?? []), p]);
  for (const a of accounts) {
    const rows = byAccount.get(a.accountId) ?? [];
    const mv = sum(rows.map((p) => p.marketValue));
    if (isMandateHeld(a.engagement)) {
      out.push({
        id: `mandate:${a.accountId}`, kind: "mandate", chip: "PMS mandate",
        label: `${mandateLabel(a)} · ${a.owner}`,
        detail: `${a.provider} · account ${a.accountNo} · ${rows.length} holding${rows.length === 1 ? "" : "s"} · ${money(mv)}`,
        href: `/mandate/${encodeURIComponent(a.accountId)}`,
        names: [mandateLabel(a), a.provider, `${mandateLabel(a)} ${a.owner}`],
        codes: [a.accountNo],
        keywords: ["pms", "mandate", "portfolio manager"],
        weight: Math.abs(mv),
      });
      continue;
    }
    // ── every other account, reachable by its NUMBER and its provider ───────
    // Its one holding, cash sleeve aside — a fund folio is one fund, and its
    // page is where the folio's figures are.
    const keys = [...new Set(rows.filter((p) => p.assetClass !== "Cash").map((p) => p.securityKey))];
    const side = a.engagement === "AIF" ? fundMarketSideOf(a.strategy ?? a.provider, a) : null;
    // AN ACCOUNT WHOSE EVERY HOLDING IS CLOSED is where a redemption lives —
    // 3P's folio paid out in full, and the money is on the Transactions tab.
    const allClosed = rows.length > 0 && rows.every((p) => isRedeemedToNil(p));
    const href = allClosed ? "/monitor?show=transactions"
      : keys.length === 1 ? `/stock/${encodeURIComponent(keys[0])}`
      : keys.length === 0 && side === "private" ? "/private-market"
      : `/family?entity=${encodeURIComponent(a.owner)}`;
    out.push({
      id: `account:${a.accountId}`, kind: "account", chip: "Account",
      label: `${a.provider} · ${a.accountNo}`,
      // A FIGURE FOR SOME OF AN ACCOUNT'S HOLDINGS NAMES THE REST. On the live
      // basis a transaction-only demat values the cash-equivalent funds its
      // depository reports and nothing else on that statement (Stage 10ce), so
      // its total must not read as the account's — the words lead, because
      // this line is truncated to one row.
      detail: `${a.owner} · ${allClosed ? "every holding redeemed — the money is on Transactions"
        : rows.length ? `${a.partialValuation ? "partly valued · " : ""}${rows.length} holding${rows.length === 1 ? "" : "s"} · ${money(mv)}` : "holds no valued position"}`
        + (a.asOf ? ` · as of ${a.asOf}` : ""),
      href,
      names: [],
      codes: [a.accountNo],
      keywords: [a.provider, a.strategy ?? ""].filter(Boolean),
      weight: 0,
    });
  }

  // ── people and trusts ─────────────────────────────────────────────────────
  const byOwner = new Map<string, Account[]>();
  for (const a of accounts) byOwner.set(a.owner, [...(byOwner.get(a.owner) ?? []), a]);
  for (const [owner, accs] of byOwner) {
    const ids = new Set(accs.map((a) => a.accountId));
    const mv = sum(positions.filter((p) => ids.has(p.accountId)).map((p) => p.marketValue));
    const first = owner.split(/\s+/)[0] ?? owner;
    out.push({
      id: `person:${owner}`, kind: "person", chip: /trust/i.test(owner) ? "Trust" : "Family member",
      label: owner,
      detail: `${accs.length} account${accs.length === 1 ? "" : "s"} · ${money(mv)} as their own statements print it`,
      href: `/family?entity=${encodeURIComponent(owner)}`,
      names: [owner, first],
      codes: [],
      keywords: /trust/i.test(owner) ? ["trust", "family trust"] : ["family member"],
      weight: Math.abs(mv),
    });
  }

  // ── pages and views ───────────────────────────────────────────────────────
  NAV.forEach((n, i) => {
    out.push({
      id: `page:${n.to}`, kind: "page", chip: "Page",
      label: n.label, detail: `${n.group} · open the page`, href: n.to,
      names: [n.label], codes: [], keywords: PAGE_WORDS[n.to] ?? [], weight: NAV.length - i,
    });
  });
  for (const v of VIEWS) {
    out.push({ id: v.id, kind: "view", chip: "View", label: v.label, detail: v.detail, href: v.href,
      names: [v.label], codes: [], keywords: v.words, weight: 0 });
  }

  // ── categories, baskets, asset classes and the sides of the book ──────────
  for (const axis of GROUP_AXES) {
    const vals = new Map<string, { n: number; mv: number }>();
    for (const p of current) {
      const k = groupKeyFor(axis, idx, p);
      const v = vals.get(k) ?? { n: 0, mv: 0 };
      v.n++; v.mv += p.marketValue;
      vals.set(k, v);
    }
    const noun = axis === "category" ? "Category" : axis === "basket" ? "Basket" : "Asset class";
    for (const [key, v] of vals) {
      const label = groupLabelFor(axis)(key);
      out.push({
        id: `${axis}:${key}`, kind: "category", chip: noun,
        label: axis === "assetClass" ? `${label} (asset class)` : label,
        detail: `${v.n} holding${v.n === 1 ? "" : "s"} · ${money(v.mv)} · ${pctOfBook(v.mv)}`,
        href: drilldownHref(AXIS_SCOPE[axis], key),
        names: [label, key],
        codes: [],
        keywords: CATEGORY_WORDS[key] ?? [],
        weight: Math.abs(v.mv),
      });
    }
  }
  for (const [facet, label, words] of [
    ["listed", "Listed side of the book", ["listed", "public market", "public"]],
    ["private", "Private side of the book", ["private side", "private capital", "unlisted"]],
    ["unplaced", "Holdings placed on neither side", ["not placed", "unplaced", "neither side"]],
  ] as const) {
    const rows = current.filter((p) => (facet === "unplaced" ? p.marketSide == null : p.marketSide === facet));
    if (!rows.length) continue;
    const mv = sum(rows.map((p) => p.marketValue));
    out.push({
      id: `side:${facet}`, kind: "category", chip: "Side",
      label, detail: `${rows.length} holding${rows.length === 1 ? "" : "s"} · ${money(mv)} · ${pctOfBook(mv)}`,
      href: drilldownHref("book", undefined, facet),
      names: [label], codes: [], keywords: [...words], weight: Math.abs(mv),
    });
  }

  // ── sectors — the Monitor's own sector filter ─────────────────────────────
  const sectors = new Map<string, { n: number; mv: number }>();
  for (const p of current) {
    if (p.assetClass !== "Equity" || !p.sector || p.sector === "Unclassified") continue;
    const v = sectors.get(p.sector) ?? { n: 0, mv: 0 };
    v.n++; v.mv += p.marketValue;
    sectors.set(p.sector, v);
  }
  for (const [sector, v] of sectors) {
    out.push({
      id: `sector:${sector}`, kind: "sector", chip: "Sector",
      label: sector,
      detail: `${v.n} holding${v.n === 1 ? "" : "s"} whose statement names this sector · ${money(v.mv)}`,
      href: `/monitor?group=security&sector=${encodeURIComponent(sector)}`,
      names: [sector], codes: [], keywords: SECTOR_WORDS[sector] ?? [], weight: Math.abs(v.mv),
    });
  }

  // ── figures ────────────────────────────────────────────────────────────────
  for (const f of FIGURES) {
    out.push({ id: f.id, kind: "figure", chip: "Figure", label: f.label, detail: f.detail, href: f.href,
      names: [f.label], codes: [], keywords: f.words, weight: 0 });
  }
  return out;
}

/** Words for the category axis's own keys — what the instrument IS, in people's words. */
const CATEGORY_WORDS: Record<string, string[]> = {
  "Direct Equity": ["direct", "direct stocks", "own shares", "shares", "stocks i bought"],
  "PMS mandates": ["pms", "portfolio management", "mandates", "managers"],
  "Mutual Fund": ["mf", "mutual funds", "funds", "schemes"],
  "ETF": ["etfs", "exchange traded funds", "gold etf", "silver etf"],
  "AIF": ["aifs", "alternative investment funds", "category iii", "cat iii", "category ii", "cat ii", "category i", "cat i"],
  "Cash": ["liquid", "liquid funds", "cash equivalents", "arbitrage"],
};
