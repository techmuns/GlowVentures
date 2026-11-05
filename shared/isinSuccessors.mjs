// AN ISIN A FACE-VALUE SPLIT RETIRED, AND THE ONE THAT REPLACED IT (Stage 10he).
// A statement or fund filing dated before the split still prints the old ISIN,
// which no listing carries any more, so the holding lost its quote identity.
// Each pair must be the same issuer and instrument class (the first nine
// characters), and the successor must still carry any symbol the statement
// printed.
//
// Read by `build-upstox-instruments` (where the old ISIN has no listing left)
// and by build-book's identity check (Stage 10lx): a manager that reprints its
// history after the split prints the successor on rows that an earlier issue
// printed under the retired ISIN, and the two are one security, not two.
export const ISIN_SUCCESSORS = Object.freeze({
  // Shankara Buildpro: ₹10 → ₹2 sub-division, ex 8 Oct 2026 (NSE, in the saved
  // corporate-action capture); Upstox lists BUILDPRO under INE24OJ01029 only.
  // SVAN's 4 Nov 2026 capital gain statements print the 19 May 2026 sale under
  // INE24OJ01029; the 30 Sep issues printed the same sale under INE24OJ01011.
  INE24OJ01011: "INE24OJ01029",
  // JSW Dulux: 1:10 sub-division, record date 22 Oct 2026 (the company's
  // notice, reported by Kotak Neo on 22 Sep 2026); Upstox lists JSWDULUX under
  // INE133A01029 only.
  INE133A01011: "INE133A01029",
});
for (const [from, to] of Object.entries(ISIN_SUCCESSORS)) {
  if (from.slice(0, 9) !== to.slice(0, 9)) throw new Error(`isinSuccessors: ${from} -> ${to} is not the same issuer and class`);
}

/** The ISIN now current for `isin`: its recorded successor, or itself. */
export function currentIsin(isin) {
  return (typeof isin === "string" && ISIN_SUCCESSORS[isin]) || isin;
}
