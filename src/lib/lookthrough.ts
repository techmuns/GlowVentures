// WHAT THE COMPANIES INSIDE A FUND ARE — read at runtime from the committed
// store that `npm run build-lookthrough` writes.
//
// It is fetched rather than bundled for the same reason `ledger.ts` fetches the
// audit archive: it is ~300 KB across 20 schemes and only one of them is ever
// wanted at a time, on a page that may never be opened.
//
// ── THE PROVENANCE IS NOT THE BOOK'S, AND EVERY CALLER MUST SAY SO ──────────
//
// Everything else on this site traces to the statement of the institution that
// struck the figure. These holdings trace to the AMC's own monthly SEBI
// portfolio disclosure, as a third party (rupeevest) aggregates it. That is a
// real source and a different one, so:
//
//   • it is never summed into a book total, an allocation, a sector split or a
//     concentration figure — the fund's value stays whole, exactly as it did
//     before this store existed;
//   • the scheme, the plan matched, and the portfolio's own as-of date ride on
//     every record so the screen can print them;
//   • `pctAum` is the PUBLISHED figure — a share of the FUND. The family's
//     exposure is derived from it here, by `familyValue`, and is labelled as
//     derived wherever it is rendered.
import type { Position } from "./types";

export type LookthroughHolding = {
  name: string;
  /** Percent of the FUND's AUM, as the AMC disclosed it. */
  pctAum: number;
  /** Shares the FUND holds — not the family's. Null on debt and cash rows. */
  shares: number | null;
};

export type FundPortfolio = {
  schemecode: number;
  scheme: string | null;
  classification: string | null;
  fundAumCr: number | null;
  /** The disclosure's own date — NOT the family's statement date. */
  asOf: string | null;
  equity: LookthroughHolding[];
  debt: LookthroughHolding[];
  cash: LookthroughHolding[];
  misc: LookthroughHolding[];
  counts: { equity: number; debt: number; cash: number; misc: number };
};

export type SchemeMatch = {
  schemecode: number;
  scheme: string;
  /** Which plan rupeevest lists. A scheme's plans hold the SAME portfolio. */
  plan: string;
  amfiName: string | null;
  isin: string | null;
  matchedVia: string;
  asOf: string | null;
};

type Index = {
  source: Record<string, string>;
  schemes: Record<string, SchemeMatch>;
  unresolved: { securityKey: string; name: string; isin: string | null; amfiName: string | null; reason: string }[];
};

/** `undefined` = still loading · `null` = the store did not respond. */
export type LookthroughState =
  | { status: "loading" }
  | { status: "unreachable" }
  /** The store answered and carries no look-through for this holding. */
  | { status: "none"; reason: string | null }
  | { status: "ok"; match: SchemeMatch; portfolio: FundPortfolio };

const base = () => `${import.meta.env.BASE_URL}lookthrough`;

let indexOnce: Promise<Index | null> | null = null;
const loadIndex = (): Promise<Index | null> => {
  if (!indexOnce) {
    indexOnce = fetch(`${base()}/index.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .catch(() => null);
  }
  return indexOnce;
};

/**
 * The portfolio behind one holding, or the reason there is none.
 *
 * A HOLDING THE STORE DOES NOT COVER IS NOT AN ERROR. Most of them are not funds
 * at all, and a fund can be genuinely unresolved — the caller gets `none` with
 * the store's own reason where it recorded one, and renders an absence rather
 * than a failure. Only a store that does not answer is `unreachable`, which is
 * a fact about the fetch and is worded as one.
 */
export async function loadLookthrough(securityKey: string): Promise<LookthroughState> {
  const idx = await loadIndex();
  if (!idx) return { status: "unreachable" };
  const match = idx.schemes?.[securityKey];
  if (!match) {
    const miss = idx.unresolved?.find((u) => u.securityKey === securityKey);
    return { status: "none", reason: miss?.reason ?? null };
  }
  try {
    const r = await fetch(`${base()}/${match.schemecode}.json`, { cache: "no-store" });
    if (!r.ok) return { status: "unreachable" };
    return { status: "ok", match, portfolio: (await r.json()) as FundPortfolio };
  } catch {
    return { status: "unreachable" };
  }
}

/**
 * THE FAMILY'S SHARE OF ONE UNDERLYING COMPANY — derived, and labelled as such
 * wherever it renders.
 *
 * `pctAum` is a share of the FUND, so this is the family's holding value times
 * that share. It is NOT a figure anybody disclosed about this family, and two
 * things follow that the caller must honour: it is stated as a look-through
 * rather than a position, and it is never added to a book total, which would
 * double-count the fund's own value that is already in the NAV.
 *
 * The two sides are also dated differently — the disclosure is monthly and the
 * holding is valued on its statement's date — so the screen prints both dates.
 */
export const familyValue = (holdingValue: number, pctAum: number): number =>
  (holdingValue * pctAum) / 100;

/**
 * Sum of the disclosed weights. Published percentages do not add to exactly 100
 * — a fund's own rounding, plus sleeves this store does not carry — so the page
 * prints the total rather than implying completeness.
 */
export const disclosedWeight = (pf: FundPortfolio): number =>
  [...pf.equity, ...pf.debt, ...pf.cash, ...pf.misc].reduce((a, h) => a + (h.pctAum ?? 0), 0);

/** Whether a holding could ever have a look-through — mirrors the ingest. */
export const canHaveLookthrough = (p: Position): boolean =>
  p.assetClass === "Mutual Fund" || p.assetClass === "ETF";
