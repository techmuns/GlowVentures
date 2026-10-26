// A FUND UNIT A SUB-DIVISION RETIRED, AND THE ISIN THAT REPLACED IT (Stage 10hq).
//
// DSP split both of its metal ETFs ten for one on 28 Aug 2026, and NSE moved
// each to a new ISIN from that ex-date. The family's Motilal Oswal statements of
// 31 Jul 2026 print the OLD ISIN and the PRE-split units, while AMFI publishes
// the scheme only under the new ISIN and on the post-split unit. So those units
// never met a NAV, and the two ETFs sat on screen as unit counts with no value.
//
// Each entry is a corporate action with its own source, never a price:
//   - the successor ISIN is NSE's (circular NSE/CML/75868, 21 Aug 2026,
//     "Change in ISIN – ETFs of DSP Asset Managers Private Limited");
//   - the factor is the face value's own sub-division, ₹10 to ₹1, and the
//     record and ex-date are NSE Clearing's (NCL/CMPT/75902, 24 Aug 2026);
//   - AMFI's NAV history for the scheme drops by the same factor between
//     27 Aug and 28 Aug 2026 (Gold 152.3813 → 15.3425, Silver 228.7309 →
//     23.3002), so the published series agrees with the circulars.
//
// A unit count dated BEFORE the ex-date is on the old basis and is multiplied
// by the factor before it meets the successor's NAV. One dated on or after it
// under the retired ISIN cannot be placed on either basis and is not valued.
// The book's units are never changed: this is read only where a NAV meets them.
export const FUND_UNIT_SPLITS = Object.freeze([
  {
    isin: 'INF740KA1SW3', successorIsin: 'INF740KA1ZP2', scheme: 'DSP Gold ETF', symbol: 'GOLDADD',
    factor: 10, exDate: '2026-08-28',
    sources: ['https://nsearchives.nseindia.com/content/circulars/CML75868.pdf', 'https://nsearchives.nseindia.com/content/circulars/CMPT75902.pdf'],
    source: 'NSE circular NSE/CML/75868 (21 Aug 2026) and NSE Clearing circular NCL/CMPT/75902 (24 Aug 2026)',
  },
  {
    isin: 'INF740KA1RE3', successorIsin: 'INF740KA1ZQ0', scheme: 'DSP Silver ETF', symbol: 'SILVERADD',
    factor: 10, exDate: '2026-08-28',
    sources: ['https://nsearchives.nseindia.com/content/circulars/CML75868.pdf', 'https://nsearchives.nseindia.com/content/circulars/CMPT75902.pdf'],
    source: 'NSE circular NSE/CML/75868 (21 Aug 2026) and NSE Clearing circular NCL/CMPT/75902 (24 Aug 2026)',
  },
]);

for (const s of FUND_UNIT_SPLITS) {
  // Same issuer and instrument class: an ISIN's first nine characters.
  if (s.isin.slice(0, 9) !== s.successorIsin.slice(0, 9)) throw new Error(`fundUnitSplits: ${s.isin} -> ${s.successorIsin} is not the same issuer and class`);
  if (!(Number.isInteger(s.factor) && s.factor > 1) || !/^\d{4}-\d{2}-\d{2}$/.test(s.exDate)) throw new Error(`fundUnitSplits: ${s.isin} needs a whole factor above one and an ISO ex-date`);
}

/** The split that retired this ISIN, or null. */
export function fundUnitSplitFor(isin) {
  const k = typeof isin === 'string' ? isin.trim().toUpperCase() : null;
  return (k && FUND_UNIT_SPLITS.find((s) => s.isin === k)) || null;
}
