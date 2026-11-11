// A DEMERGER: SHARES OF A NEW COMPANY ALLOTTED AGAINST A PARENT'S, AND THE
// RECORD DATE THAT DECIDED WHO GOT THEM (Stage 10ly).
//
// The saved NSE corporate-action capture names each of these as "Demerger" and
// flags it for statement reconciliation: it carries the record date but not the
// entitlement. So each entry here is the company's own entitlement, cited, and
// it is read only where a holding's own trades reconcile through it
// (`demergedLots` in scripts/lib/shareActions.mjs): the parent's dated trades,
// carried through its own splits, must close on exactly what the statements
// hold of it, and the child's inherited units plus its own trades on exactly
// the units its statement holds. The inherited units keep the dates the parent's
// were bought on — the dates SVAN's own capital gain statement prints for a
// sale of the child (Shankara Buildpro's 19 May 2026 sale, bought 29 Oct 2024).
//
// `ratio` is child shares per parent share held on the record date.
export const DEMERGERS = Object.freeze([
  {
    parentKey: 'shankara-building-products', parentSymbol: 'SHANKARA', parentIsin: 'INE274V01019',
    childKey: 'shankara-buildpro', childSymbol: 'BUILDPRO',
    recordDate: '2025-09-24', ratio: 1,
    source: "Shankara Building Products' record-date intimation to NSE and BSE, 12 Sep 2025: 1 equity share of Shankara Buildpro (₹10) for every 1 equity share of the company (₹10) held on 24 Sep 2025",
    sources: ['https://nsearchives.nseindia.com/corporate/SHANKARA_12092025123741_Filing.pdf'],
  },
  {
    parentKey: 'heg-advanced-materials', parentSymbol: 'HEGAM', parentIsin: 'INE545A01024',
    childKey: 'heg-graphite', childSymbol: null,
    recordDate: '2026-09-07', ratio: 1,
    source: "HEG's composite scheme, effective 1 Sep 2026: 1 share of HEG Graphite for every 1 HEG share held on the 7 Sep 2026 record date (the record date is NSE's, in the saved corporate-action capture; the entitlement as ICICIdirect reported the company's filing)",
    sources: [
      'https://www.nseindia.com/companies-listing/corporate-filings-actions?symbol=HEGAM&tabIndex=equity',
      'https://www.icicidirect.com/research/equity/trending-news/heg-sets-sept-1-effective-date-for-demerger-merger-sept-7-record-date-for-1-1-swap',
    ],
  },
  {
    // Stage 10mw: Green Lantern 510854/510861 hold VAML on no trade of their own;
    // their from-inception tapes hold exactly that many Vedanta on the record date.
    parentKey: 'vedanta', parentSymbol: 'VEDL', parentIsin: 'INE205A01025',
    childKey: 'vedanta-aluminium-metal', childSymbol: 'VAML',
    recordDate: '2026-04-30', ratio: 1,
    source: "Vedanta's demerger: record date 1 May 2026, a market holiday, so ex-date 30 Apr (NSE's saved capture, the date this replay keys on; units held at its start are every trade to 29 Apr, the T+1 cutoff): 1 share of Vedanta Aluminium Metal for every 1 Vedanta share held, as the resulting company announced the allotment",
    sources: ['https://vedantaaluminium.com/?p=10310', 'https://www.nseindia.com/companies-listing/corporate-filings-actions?symbol=VEDL&tabIndex=equity'],
  },
]);

for (const d of DEMERGERS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.recordDate) || !(d.ratio > 0) || d.parentKey === d.childKey) {
    throw new Error(`demergers: ${d.parentKey} -> ${d.childKey} needs an ISO record date, a positive ratio and two keys`);
  }
}

/** The demerger that allotted `childKey`, or null. */
export function demergerInto(childKey) {
  return DEMERGERS.find((d) => d.childKey === childKey) ?? null;
}
