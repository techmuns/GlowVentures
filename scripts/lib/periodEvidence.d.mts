import type { EarlierBalance, StatementUnitNavs, UnitWindow } from '../../src/lib/types';

export declare const STATEMENT_NAV_LINKS: readonly { securityKey: string; isin: string }[];
// The build's own inputs, loosely typed: the statement documents and the book as built.
export declare function periodEvidence(input: {
  byAccount: Map<string, readonly any[]>;
  accounts: readonly any[];
  positions: readonly any[];
  accountReturnRecords: Record<string, any>;
  links?: readonly { securityKey: string; isin: string }[];
}): { earlierBalances: EarlierBalance[]; statementUnitNavs: Record<string, StatementUnitNavs>; unitWindows: Record<string, UnitWindow> };
