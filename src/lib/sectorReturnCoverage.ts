import { ownerOf, type AccountIndex } from "./accounts";
import type { Position } from "./types";

/** The sector rollup's cost gate. Keep coverage and its explanation on one set. */
export const hasSectorReturnCost = (p: Position): boolean =>
  typeof p.costBasis === "number" && !p.costUnavailable;

/** One statement holding, not one company: the same stock can have several owners/accounts. */
export function sectorReturnHolding(p: Position, accounts: AccountIndex) {
  const account = accounts.get(p.accountId);
  return {
    position: p,
    owner: ownerOf(accounts, p),
    provider: account?.provider || "Statement provider not recorded",
    accountNo: account?.accountNo || p.accountId,
    statementDate: account?.asOf || null,
    missing: hasSectorReturnCost(p) ? null : p.costUnavailable && typeof p.costBasis === "number"
      ? "The purchase cost cannot be verified."
      : "The purchase cost is missing.",
  };
}
