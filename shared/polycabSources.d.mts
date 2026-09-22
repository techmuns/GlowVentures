// Types for shared/polycabSources.mjs — the ONE reading of what the exchange
// and the disclosure aggregators say about the ring-fenced promoter holding.
//
// The implementation is plain JS in shared/ so that the DAILY builder
// (`scripts/build-polycab-live.mjs`, Node) and the LIVE edge function
// (`functions/api/polycab.js`, Cloudflare) parse the same upstream with
// identical code. Two readings would be two chances for the committed figure
// and the intraday one to disagree about what a day change is — the seam
// `shared/seriesReturns.mjs` already holds between the harvester and
// `/api/prices`. See the long note there.

export declare const BSE_API: string;
export declare const BSE_SCRIP: string;
export declare const NSE_SYMBOL: string;
export declare const BROWSER_HEADERS: Readonly<Record<string, string>>;

/** A number, or null. NEVER 0 for something that did not parse. */
export declare function num(v: unknown): number | null;

/** `18 Jun 2019` / `2026-07-30T00:00:00` / `20190618` → `YYYY-MM-DD`, else null. */
export declare function isoDate(v: unknown): string | null;

export type PolycabActionKind = "dividend" | "bonus" | "split" | "spinoff" | "rights" | "other";

/**
 * What kind of corporate action the exchange's purpose line describes, and what
 * it is worth per share. An amount is read ONLY off a dividend: `Bonus issue
 * 1:1` contains digits, and a naive scrape would report a bonus "worth ₹1".
 */
export declare function classifyAction(purpose: unknown): {
  kind: PolycabActionKind;
  amountPerShare: number | null;
  ratio: string | null;
  purpose: string;
};

export interface ParsedAction {
  exDate: string | null;
  kind: PolycabActionKind;
  purpose: string;
  amountPerShare: number | null;
  ratio: string | null;
  recordDate: string | null;
  bookClosureFrom: string | null;
  bookClosureTo: string | null;
  paymentDate: string | null;
}

/** The exchange's own corporate-action record, newest first. Null if unreadable. */
export declare function parseCorporateActions(rows: unknown): ParsedAction[] | null;

/**
 * The payment date lives on a SHORTER second endpoint and is joined on the
 * ex-date. It only ever FILLS an empty field and never overwrites one.
 */
export declare function mergePaymentDates(actions: ParsedAction[], caTable2: unknown): ParsedAction[];

export interface ParsedQuote {
  ltp: number;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePct: number | null;
  /** The exchange's OWN printed change — a `printed.*` CHECK, never a source. */
  printedChange: number | null;
  printedChangePct: number | null;
}

/** Null where the response carries no last-traded price — never a zero. */
export declare function parseQuote(hdr: unknown): ParsedQuote | null;

/** Null unless the response carries a well-formed ISIN. */
export declare function parseIdentity(h: unknown): {
  isin: string;
  scripCode: string | null;
  securityId: string | null;
  faceValue: number | null;
  industry: string | null;
  group: string | null;
  index: string | null;
} | null;

/**
 * Promoter holding and pledge per quarter, out of the page's own embedded JSON.
 * A quarter whose block omits a field yields null for it, never 0 — the
 * distinction that matters most on a PROMOTER pledge.
 */
export declare function parseTickertapeHoldings(html: unknown): {
  asOf: string;
  holdingPct: number | null;
  pledgePct: number | null;
}[] | null;

/** Promoter holding per quarter from the SECOND witness. */
export declare function parseScreenerPromoter(html: unknown): {
  quarter: string;
  holdingPct: number;
}[] | null;

/**
 * Does this page prove it is about the holding the BOOK carries? `"isin"` is
 * the strongest tier and `"scrip"` the weaker one; null is a refusal, and a
 * refused page yields no figure rather than a figure with a caveat.
 */
export declare function pageIdentity(html: unknown, bookIsin?: string | null): "isin" | "scrip" | null;

/** `Jun 2026` → `2026-06-30`. */
export declare function quarterEndIso(q: unknown): string | null;

/** `2026-06-30` → `Jun 2026`. */
export declare function quarterLabel(iso: unknown): string | null;
