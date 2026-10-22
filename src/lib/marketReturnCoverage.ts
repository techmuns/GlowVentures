import type { Account, Position } from './types';
import type { MarketGap } from './marketReturns';
import { holdingBucket, bucketLabel, mandateLabel, isMandateHeld, assetClassLabel } from './analytics';
import { fmtDate } from './format';
/** Use the attribution table's classification and the registry's exact mandate. */
export function marketHoldingContext(p: Position, a?: Account) {
  const managed = isMandateHeld(a?.engagement ?? null);
  const category = bucketLabel(holdingBucket(p, a?.engagement ?? null));
  const heldThrough = managed ? mandateLabel(a)
    : p.assetClass === 'AIF' || p.assetClass === 'Mutual Fund' || p.assetClass === 'ETF' ? p.security
    : a?.strategy || a?.provider || 'Account not linked';
  return { category, heldThrough, instrument: assetClassLabel(p.assetClass), owner: a?.owner || 'Owner not linked',
    provider: a?.provider || 'Provider not linked', account: a?.accountNo || p.accountId,
    statementDate: a?.asOf || null };
}
export function marketGapExplanation(g: MarketGap, start: string | null, end: string | null) {
  const p = g.position;
  const noun = p.assetClass === 'Mutual Fund' || p.assetClass === 'AIF' ? 'fund unit price (NAV)' : 'price';
  const at = (date: string | null) => date ? ` near ${fmtDate(date)}` : ' at the selected date';
  switch (g.code) {
    case 'value': return { missing: 'Current holding value is missing.', needed: 'A current value, so we can work out this holding’s weight.' };
    case 'dates': return { missing: 'The selected dates do not form a valid period.', needed: 'Choose a start date before the end date.' };
    case 'start': return { missing: `Starting ${noun} is missing${at(start)}.`, needed: g.first && start && g.first > start
      ? `Available history starts ${fmtDate(g.first)}. Choose a later start, or provide an earlier ${noun}.`
      : `A published ${noun} on or within seven days before the start date.` };
    case 'end': return { missing: `Ending ${noun} is missing${at(end)}.`, needed: `A published ${noun} on or within seven days before the end date.${g.last ? ` Latest available: ${fmtDate(g.last)}.` : ''}` };
    case 'shared': return { missing: `A ${noun} is missing${g.dates?.length ? ` on ${g.dates.map(fmtDate).join(' and ')}` : ' on the shared calculation dates'}.`, needed: `The ${noun} on those dates, so this holding uses the same period as the others.` };
    case 'source': {
      if (/HTTP 404/i.test(g.reason)) return { missing: 'The price source has no history for this listing.', needed: 'A price history for this exact stock or fund over the selected period.' };
      if (/did not match|not match|verified.*(symbol|fund)|ISIN/i.test(g.reason)) return { missing: 'The price source could not confirm this investment’s identity.', needed: 'Check its exact exchange symbol, or fund scheme code and ISIN.' };
      if (/adjusted.*not available/i.test(g.reason)) return { missing: 'Prices that allow for dividends and share splits are missing.', needed: 'A dividend- and split-adjusted price history for this stock.' };
      if (/No completed daily prices/i.test(g.reason)) return { missing: 'The source has no published daily prices for this investment.', needed: 'A published daily price history covering the selected dates.' };
      return { missing: 'The price service could not load this history.', needed: 'Retry missing histories. No new statement is needed for this loading error.' };
    }
    default:
      if (p.assetClass === 'AIF') return { missing: 'We do not have this fund’s unit prices for these dates.', needed: 'The fund manager’s unit prices (NAVs) at the start and end of this period. Stock prices alone do not value the AIF.' };
      if (p.marketSide === 'private' || p.valuedAtCost || p.assetClass === 'Unlisted') return { missing: 'Public price history is missing.', needed: 'Dated prices or valuations for this period. For returns from your statements, check Recorded return.' };
      if (p.assetClass === 'Mutual Fund') return { missing: 'This fund has not been matched to a price history.', needed: 'Its exact scheme code and ISIN, then the fund’s daily unit prices (NAVs).' };
      if (p.assetClass === 'Cash') return { missing: 'Cash has no traded market price.', needed: 'Use dated account balances and money in/out for its recorded return.' };
      if (p.assetClass === 'Bond' || p.assetClass === 'Structured Product') return { missing: 'This instrument has no matched price history.', needed: 'Dated prices or valuations for this exact instrument during the period.' };
      return { missing: 'This holding has not been matched to a stock listing.', needed: 'Its confirmed exchange symbol or ISIN, so we can find the right price history.' };
  }
}
