// MUTUAL FUND DATA — NAV, its daily change, returns and what the scheme holds —
// read at runtime from the committed store `npm run build-lookthrough` writes
// out of a READ-ONLY checkout of the family's own `techmuns/amfibeas` repo.
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
  /** Shares the FUND holds — not the family's. */
  shares: number | null;
  /** The underlying's own ISIN, where the AMC's filing gives one. */
  isin: string | null;
  /** The AMC's own sector label — not this book's GICS taxonomy. */
  sector: string | null;
};

/** The scheme's NAV and the move since the previous published one. */
export type FundNav = {
  value: number | null;
  date: string | null;
  prev: number | null;
  prevDate: string | null;
  changePct: number | null;
};

/**
 * ONE PERIOD'S RETURN, WITH THE WINDOW IT ACTUALLY SPANS.
 *
 * The label is the SOURCE's (`1M`, `3Y`) and the dates are the MEASUREMENT —
 * and on this data they do not always agree: Helios's `1M` runs 2026-06-19 to
 * 2026-09-01. So both travel together and the screen prints both, because a
 * period label rendered alone is the one figure here a reader could not check.
 * `kind` is the source's own basis: `simple` over a short window, `CAGR` where
 * it annualises.
 */
export type FundReturn = {
  value: number;
  kind: string | null;
  startDate: string | null;
  endDate: string | null;
  startNav: number | null;
  endNav: number | null;
};

export type FundPortfolio = {
  schemecode: string;
  scheme: string | null;
  /** AMFI's full scheme name, which states the plan in words. */
  amfiSchemeName: string | null;
  amc: string | null;
  plan: string | null;
  option: string | null;
  classification: string | null;
  isin: string | null;
  nav: FundNav;
  returns: Record<string, FundReturn>;
  returnsAsOf: string | null;
  fundAumCr: number | null;
  /** The disclosure's own date — NOT the family's statement date. */
  holdingsAsOf: string | null;
  /**
   * WHICH DOCUMENT THE HOLDINGS CAME FROM. `amc` is the fund house's own
   * monthly disclosure page; `aggregator` is a third party's copy of it. One is
   * the filing and the other is somebody's reading of the filing, so the card
   * names which.
   */
  holdingsSource: { kind: "amc" | "aggregator"; url: string | null } | null;
  /**
   * The section the source file covers. It is "Equity Holdings" on every one,
   * which is why a debt or liquid scheme has no rows: it holds no equity, and
   * its debt book is not in this store. The card says that rather than drawing
   * an empty table.
   */
  section: string | null;
  equity: LookthroughHolding[];
  counts: { equity: number };
};

export type SchemeMatch = {
  schemecode: string;
  scheme: string;
  /**
   * The plan this holding's own ISIN resolves to — so NAV and returns are the
   * family's plan, not a near neighbour's. Plans differ in expense ratio, and
   * therefore NAV, not in what the fund owns.
   */
  plan: string;
  isin: string | null;
  /** `isin` · `name` · `name+plan` — see the ingest's tiers. */
  matchedVia: string;
  navDate: string | null;
  holdingsAsOf: string | null;
  holdingsSource: "amc" | "aggregator" | null;
};

type Index = {
  source: Record<string, string>;
  schemes: Record<string, SchemeMatch>;
  unresolved: { securityKey: string; name: string; isin: string | null; reason: string }[];
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
 * Sum of the disclosed EQUITY weights.
 *
 * It does not reach 100% and is not meant to: the store carries the equity
 * section alone, so a fund's cash and debt sleeves are outside it, as is its own
 * rounding. The card prints this total and names what the remainder is, rather
 * than implying the rows account for the whole scheme.
 */
export const disclosedWeight = (pf: FundPortfolio): number =>
  pf.equity.reduce((a, h) => a + (h.pctAum ?? 0), 0);

/** Whether a holding could ever have a look-through — mirrors the ingest. */
export const canHaveLookthrough = (p: Position): boolean =>
  p.assetClass === "Mutual Fund" || p.assetClass === "ETF";
