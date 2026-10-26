// Unit identity is dated. A NAV under a successor ISIN cannot price the old
// count until the exchange's conversion has been applied. These are source
// terms, never portfolio amounts or inferred price-ratio adjustments.
import { FUND_UNIT_SPLITS } from './fundUnitSplits.mjs';
export const FUND_UNIT_ACTIONS = Object.freeze(FUND_UNIT_SPLITS.map(s => ({
  oldIsin: s.isin, newIsin: s.successorIsin, exDate: s.exDate,
  factor: s.factor, sources: s.sources, source: s.source,
})));

const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** Walk only documented successor identities, including multi-step changes. */
function resolveFundUnits(isin, asOf, through, actions, checkSnapshot = true) {
  const applied = [], seen = new Set();
  let current = isin, factor = 1;
  const blocked = reason => ({ isin, factor: 1, actions: [], reason });
  if (!isin || !day(asOf) || !day(through) || through < asOf) return blocked('A dated holding and a later NAV are required');
  if (checkSnapshot && actions.some(a => a.newIsin === isin && a.exDate > asOf))
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

export const fundUnitBasis = (isin, asOf, through, actions = FUND_UNIT_ACTIONS) => resolveFundUnits(isin, asOf, through, actions);

/** A price lookup follows the entire identity chain without asserting that a
 * successor already existed at an invented holding date. */
export const fundPricingIsin = (isin, through, actions = FUND_UNIT_ACTIONS) => resolveFundUnits(isin, '1900-01-01', through, actions, false).isin;

/** Compare identifier tiers only after their documented successor chains. */
export const fundIdentityDisagrees = (left, right, through) => !!left && !!right
  && fundPricingIsin(left, through) !== fundPricingIsin(right, through);

/** Retain ETF classification from current and last-published scheme metadata,
 * including balances whose custody tape did not state an asset class. */
export function heldEtfCoverageGaps(wanted, priced, schemeRecords) {
  const etfs = new Set(schemeRecords.filter(r => /\bETFs?\b/i.test(r.category ?? ''))
    .flatMap(r => [r.isin, r.pricingIsin, r.securityKey]).filter(Boolean));
  const covered = new Set(priced.filter(r => r.usableForValue).map(r => r.securityKey));
  return wanted.filter(w => w.holds && (w.assetClass === 'ETF' || etfs.has(w.bookIsin) || etfs.has(w.pricingIsin) || etfs.has(w.key))
    && !covered.has(w.key));
}

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
