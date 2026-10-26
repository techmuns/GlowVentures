// Unit identity is dated. A NAV under a successor ISIN cannot price the old
// count until the exchange's conversion has been applied. These are source
// terms, never portfolio amounts or inferred price-ratio adjustments.
const sources = [
  'https://nsearchives.nseindia.com/content/circulars/CML75868.pdf',
  'https://nsearchives.nseindia.com/content/circulars/CMPT75902.pdf',
];
export const FUND_UNIT_ACTIONS = Object.freeze([
  { oldIsin: 'INF740KA1SW3', newIsin: 'INF740KA1ZP2', exDate: '2026-08-28', factor: 10, sources },
  { oldIsin: 'INF740KA1RE3', newIsin: 'INF740KA1ZQ0', exDate: '2026-08-28', factor: 10, sources },
]);

const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** Walk only documented successor identities, including multi-step changes. */
export function fundUnitBasis(isin, asOf, through, actions = FUND_UNIT_ACTIONS) {
  const applied = [], seen = new Set();
  let current = isin, factor = 1;
  const blocked = reason => ({ isin, factor: 1, actions: [], reason });
  if (!isin || !day(asOf) || !day(through) || through < asOf) return blocked('A dated holding and a later NAV are required');
  if (actions.some(a => a.newIsin === isin && a.exDate > asOf))
    return blocked('The successor ISIN did not exist on the holding date');
  while (true) {
    if (seen.has(current)) return blocked('Cyclic fund-unit identity changes');
    seen.add(current);
    const next = actions.filter(a => a.oldIsin === current && a.exDate <= through);
    if (!next.length) return { isin: current, factor, actions: applied, reason: null };
    if (next.length !== 1) return blocked('Conflicting fund-unit identity changes');
    const a = next[0];
    if (!day(a.exDate) || !Number.isFinite(a.factor) || a.factor <= 0 || !a.newIsin || !a.sources?.length)
      return blocked('Incomplete fund-unit conversion evidence');
    if (a.exDate <= asOf) return blocked('The holding still reports a retired ISIN after its conversion date');
    if (applied.length && a.exDate <= applied.at(-1).exDate) return blocked('Fund-unit conversions are not in date order');
    applied.push(a); factor *= a.factor; current = a.newIsin;
    if (!Number.isFinite(factor)) return blocked('Invalid fund-unit conversion factor');
  }
}

/** A price lookup may follow identity; a quantity still needs its own date. */
export const fundPricingIsin = (isin, through) => fundUnitBasis(isin, '1900-01-01', through).isin;

/** Recover lots against the original source balance, even after a verified split. */
export function acquisitionIdentity(position) {
  const a = position.fundUnitAdjustment;
  if (!a) return position;
  const basis = fundUnitBasis(a.isin, a.asOf, a.through);
  if (basis.reason || basis.isin !== position.isin || basis.factor !== a.factor
    || typeof position.quantity !== 'number' || Math.abs(a.quantity * basis.factor - position.quantity) > .0005)
    return position; // A stale or edited balance cannot borrow the source lots.
  return { ...position, isin: a.isin, quantity: a.quantity };
}
