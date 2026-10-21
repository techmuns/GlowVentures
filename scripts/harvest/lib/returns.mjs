// The returns table lives in `shared/` because TWO callers must agree on it: the
// harvester (this side) and `functions/api/prices.js`, which computes the same
// table for a single company at the edge. Two implementations of "what is a
// 10-year CAGR when the series is only five years old" is exactly how one page
// ends up disagreeing with another, so there is one.
export { computeReturns, closeOnOrBefore, HORIZONS } from "../../../shared/seriesReturns.mjs";
