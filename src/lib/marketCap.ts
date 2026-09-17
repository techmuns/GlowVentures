// ── NO SCREEN READS THIS FILE. IT IS A DOCUMENTED NO-CALLER ─────────────────
//
// Exposure & IPS was its LAST reader and the family asked for that page to go.
// They were shown what it costs first and chose it anyway, so this module is
// kept rather than deleted. It is the `series.ts` and `attribution.ts`
// treatment and never the SILENT orphan this repo keeps naming: a future
// session reading this header knows nothing calls it before it goes looking.
//
// The bands had exactly one surface, and the measurement that earned them
// their place — the quote feed's `marketCap` being RUPEES, verified against
// two independent sources — is recorded below and does not expire with the
// page that drew them.
//
// `familyMath.test.ts` still asserts the arithmetic below, which is what stops
// it rotting while nothing renders it. Re-wiring means importing from here
// again — nothing about this file has to change first.
//
// MARKET-CAP EXPOSURE — the one GAP dimension that became measurable.
//
// Exposure & IPS carried three preview cards — by geography, by market cap, by
// duration — each printing an ACTUAL column about this family's real book that
// nothing had measured. Two of them stay absent, because the book carries no
// country field and no liquidity field and inventing either would fabricate the
// classification the whole GAP rests on.
//
// Market cap is different, and only after a measurement settled it. The quote
// feed returns a `marketCap` per symbol, and `CompanyResearchPreview` carried a
// note saying a rupee figure could not be shown because that field's UNIT was
// unverified and "a value here could be wrong by a factor of a crore". Probed
// against the deployed API on 2026-08-11, it is RUPEES:
//
//     ABCAPITAL   quote feed  ₹1,11,403 Cr     screener.in  ₹1,11,347 Cr
//     RELIANCE    quote feed  ₹17,91,564 Cr    (~₹18 lakh Cr, as published)
//
// Two independent sources agreeing to 0.05% — the residual is the two snapshots
// being taken minutes apart — is what a declared unit needs. The note was right
// to withhold the figure until someone checked; this is the check.
//
// ── THE BANDS ARE A DECLARED CONVENTION, NOT SEBI'S CLASSIFICATION ──────────
//
// SEBI defines large / mid / small by RANK across the whole listed universe —
// top 100, next 150, the rest — recalculated half-yearly by AMFI, who publish
// the authoritative list. That is a ranking over ~4,000 listed companies, and
// this dashboard holds quotes for 140. A rank computed over 140 names would put
// this book's 100th-largest holding in the large-cap band, which is not what the
// label means.
//
// So these are THRESHOLDS, and they are deliberately round. A cutoff written as
// ₹1,00,637 Cr would read as the authoritative figure it is not; ₹1,00,000 Cr
// reads as what it is — a convention this dashboard chose, stated on screen next
// to the numbers it produces, in the same spirit as the committed sector map.
// Swap them for AMFI's published cutoffs and the classification becomes theirs.
import type { Position } from "./types";

/** One crore, in rupees — the unit every threshold below is written in. */
const CR = 1e7;

export type McapBandKey = "large" | "mid" | "small";

export const MCAP_BANDS: { key: McapBandKey; label: string; floorCr: number; note: string }[] = [
  { key: "large", label: "Large cap", floorCr: 100_000, note: "≥ ₹1,00,000 Cr" },
  { key: "mid", label: "Mid cap", floorCr: 25_000, note: "₹25,000 – ₹1,00,000 Cr" },
  { key: "small", label: "Small cap", floorCr: 0, note: "< ₹25,000 Cr" },
];

/** Which band a rupee market cap falls in. Null when there is no figure. */
export function bandOf(marketCap: number | null | undefined): McapBandKey | null {
  if (typeof marketCap !== "number" || !Number.isFinite(marketCap) || marketCap <= 0) return null;
  const cr = marketCap / CR;
  for (const b of MCAP_BANDS) if (cr >= b.floorCr) return b.key;
  return "small";
}

export type McapExposure = {
  /** Value in each band, in rupees. A band with nothing in it is absent from the map. */
  byBand: Partial<Record<McapBandKey, number>>;
  /** Value of listed holdings the feed priced — the denominator the weights use. */
  measured: number;
  /** Listed value carrying no market cap, and how many distinct names that is. */
  unmeasured: number;
  unmeasuredNames: string[];
  /** Every listed holding, measured or not. */
  total: number;
};

/**
 * Market-cap exposure across a set of positions.
 *
 * THE DENOMINATOR IS WHAT WAS MEASURED, AND THE REST IS NAMED. A name with no
 * live quote has no market cap, and folding its value in as "small" would
 * classify a company by the fact that a price feed did not answer. So the
 * weights are of the MEASURED subset and `unmeasured` carries the rest, for the
 * caller to state — the same rule as realised gains covering 7 of 23 accounts.
 *
 * Callers pass the LISTED book only. An AIF unit is a fund wrapper with no
 * market cap of its own, and counting it as unmeasured would report a permanent
 * shortfall against a figure that can never exist.
 */
export function mcapExposure(positions: Position[]): McapExposure {
  const byBand: Partial<Record<McapBandKey, number>> = {};
  const unmeasuredNames = new Set<string>();
  let measured = 0;
  let unmeasured = 0;
  let total = 0;

  for (const p of positions) {
    total += p.marketValue;
    const band = bandOf(p.marketCap);
    if (!band) {
      unmeasured += p.marketValue;
      unmeasuredNames.add(p.security);
      continue;
    }
    byBand[band] = (byBand[band] ?? 0) + p.marketValue;
    measured += p.marketValue;
  }
  return { byBand, measured, unmeasured, unmeasuredNames: [...unmeasuredNames].sort(), total };
}

/** A band's share of the MEASURED book, in percent. Null when nothing measured. */
export function bandWeightPct(e: McapExposure, band: McapBandKey): number | null {
  if (!(e.measured > 0)) return null;
  const v = e.byBand[band];
  // A band with no holdings is a MEASURED zero and returns 0, not null: the feed
  // priced every name and none of them fell in this band, which is a finding.
  return ((v ?? 0) / e.measured) * 100;
}
