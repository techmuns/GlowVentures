// Custody facts stay in the audit even when no statement values their units.
// A NAV/quote is never a requirement for retaining the underlying source row.
import { recoveredCostFor } from '../../shared/recoveredCosts.mjs';
import type { Account, Position, RecoveredHoldingCost, ShareMovement, UnvaluedStatementHolding } from './types';
export type CustodyAuditRow = {
  accountId: string; ownerId: string | null; securityKey: string; security: string; isin: string | null;
  /** What the statement called the instrument; null where it said nothing (a depository roll). */
  assetClass: Position['assetClass'] | null;
  quantity: number | null; asOf: string | null; source: string | null; reason: string;
  cost: RecoveredHoldingCost | undefined;
};
export function custodyAuditRows(input: {
  accounts: readonly Account[]; positions: readonly Pick<Position, 'accountId' | 'securityKey'>[];
  unvalued: readonly UnvaluedStatementHolding[]; movements: Readonly<Record<string, ShareMovement>>;
  recoveredCosts: readonly RecoveredHoldingCost[]; excludedSecurities?: ReadonlySet<string>;
}): CustodyAuditRow[] {
  const accounts = new Map(input.accounts.map(a => [a.accountId, a]));
  const key = (p: { accountId: string; securityKey: string }) => p.accountId + '|' + p.securityKey;
  const seen = new Set(input.positions.map(key));
  const rows: CustodyAuditRow[] = [];
  const append = (row: Omit<CustodyAuditRow, 'cost'>) => {
    if (seen.has(key(row)) || input.excludedSecurities?.has(row.securityKey)) return;
    const account = accounts.get(row.accountId); if (!account) return;
    if (account.ownerId !== row.ownerId) throw new Error('Custody audit owner differs from its canonical account: ' + row.accountId);
    const cost = recoveredCostFor(row, input.recoveredCosts);
    // A different closing snapshot cannot borrow an old unit reconciliation.
    rows.push({ ...row, cost: cost && row.asOf === cost.asOf ? cost : undefined });
    seen.add(key(row));
  };
  for (const u of input.unvalued) append({ accountId: u.accountId, ownerId: u.ownerId, securityKey: u.securityKey,
    security: u.security, isin: u.isin, assetClass: u.assetClass, quantity: u.quantity, asOf: u.asOf, source: u.statementRecord?.document ?? null, reason: u.reason });
  for (const w of Object.values(input.movements)) {
    const account = accounts.get(w.accountId);
    if (!account?.transactionsOnly || input.positions.some(p => p.accountId === w.accountId)
      || w.reason != null || !(typeof w.closing === 'number' && Number.isFinite(w.closing) && w.closing > 0)) continue;
    append({ accountId: w.accountId, ownerId: account.ownerId, securityKey: w.securityKey, security: w.security ?? w.securityKey,
      isin: w.isin, assetClass: null, quantity: w.closing, asOf: w.periodTo, source: w.source,
      reason: 'Reconciled depository closing balance; no statement valuation.' });
  }
  return rows;
}
