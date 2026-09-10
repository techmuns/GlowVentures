// The committed provider-sector → GICS map, for the browser app.
//
// The implementation lives in `shared/sectors.mjs` so `build-book` and this app
// resolve a sector with the SAME code and the SAME table. That matters more
// since the Sector Composition page grew its Consolidated view: the book's own
// positions carry a sector `build-book` already resolved, and a fund's monthly
// disclosure carries the AMFI industry label its AMC filed. Both are read
// through this one map, so a company held directly and the same company held
// inside a scheme land in the same sector rather than in two.
//
// Nothing here infers a sector. A label absent from the map is Unclassified and
// says so; see the note in `shared/sectors.mjs`.
export { resolveSector, UNCLASSIFIED, GICS_SECTORS } from "../../shared/sectors.mjs";
