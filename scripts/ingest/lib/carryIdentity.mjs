import { securityKeyOf } from '../../../shared/securityKey.mjs';

// A reviewed alias can rename an encrypted statement's archived reading when
// its exact ISIN, units and value still agree. Unknown name changes abstain.
export function keepsHolding(before, after) {
  return after.quantity === before.quantity && after.marketValue === before.marketValue
    && (after.securityKey === before.securityKey || (!!before.isin && after.isin === before.isin
      && securityKeyOf(after.securityKey) === securityKeyOf(before.securityKey)));
}
