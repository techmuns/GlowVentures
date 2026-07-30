// The account registry: who owns an account, who runs it, and how current it is.
//
// This replaces the substring heuristic the previous cockpit used to guess a
// custodian out of an account label. That guess was only ever safe because the
// old book had four managers with distinctive names; here the same string has to
// answer two different questions ("whose money is this?" and "who manages it?"),
// and statements from several platforms give no reason to expect either answer
// to be readable out of the account code. Both come from `Portfolio.accounts`.
import type { Account, Portfolio, Position } from "./types";

export type AccountIndex = Map<string, Account>;

export function accountIndex(accounts: Account[]): AccountIndex {
  return new Map(accounts.map((a) => [a.accountId, a]));
}

/** Label to fall back to when a position references an account the book doesn't carry. */
const UNKNOWN = "Unattributed";

export const accountOf = (idx: AccountIndex, p: Position): Account | undefined => idx.get(p.accountId);

export const ownerOf = (idx: AccountIndex, p: Position): string => idx.get(p.accountId)?.owner || UNKNOWN;
export const providerOf = (idx: AccountIndex, p: Position): string => idx.get(p.accountId)?.provider || UNKNOWN;
export const strategyOf = (idx: AccountIndex, p: Position): string => idx.get(p.accountId)?.strategy || "";
export const engagementOf = (idx: AccountIndex, p: Position): string => idx.get(p.accountId)?.engagement || "";

/**
 * Custody label for allocation views: the provider that holds the assets, or
 * "Direct / In-house" for anything the family runs itself. Unlike the heuristic
 * it replaces, this reads the registry — it never infers a manager from text.
 */
export const DIRECT = "Direct / In-house";
export function custodyLabelOf(idx: AccountIndex, p: Position): string {
  const a = idx.get(p.accountId);
  if (!a) return UNKNOWN;
  return isDirect(a) ? DIRECT : a.provider || UNKNOWN;
}

/** True when the family runs the account itself rather than through a manager. */
export const isDirect = (a: Account): boolean => /^direct$/i.test(a.engagement.trim());

// ── Per-account as-of ────────────────────────────────────────────────────────
// Statements for different accounts are dated differently, so a consolidated
// total is almost always a blend of report dates. `Portfolio.asOf` is the newest
// of them; these name the ones lagging behind it so a page can say so out loud
// rather than presenting the blend as a single clean date.

export type StaleAccount = { account: Account; daysBehind: number };

const DAY_MS = 864e5;

/** Accounts whose latest statement predates the book's newest, oldest first. */
export function staleAccounts(portfolio: Portfolio): StaleAccount[] {
  const newest = Date.parse(portfolio.asOf);
  if (!Number.isFinite(newest)) return [];
  const out: StaleAccount[] = [];
  for (const account of portfolio.accounts) {
    const t = Date.parse(account.asOf);
    if (!Number.isFinite(t) || t >= newest) continue;
    out.push({ account, daysBehind: Math.round((newest - t) / DAY_MS) });
  }
  return out.sort((a, b) => b.daysBehind - a.daysBehind);
}

/** One-line summary of the staleness spread, or null when every account is current. */
export function stalenessNote(portfolio: Portfolio): string | null {
  const stale = staleAccounts(portfolio);
  if (!stale.length) return null;
  const worst = stale[0];
  const names = stale
    .slice(0, 4)
    .map((s) => `${s.account.provider} ${s.account.accountNo} (${s.account.asOf})`)
    .join(", ");
  const more = stale.length > 4 ? ` and ${stale.length - 4} more` : "";
  return `${stale.length} of ${portfolio.accounts.length} accounts are older than the book's ${portfolio.asOf}: ${names}${more}. The oldest is ${worst.daysBehind} days behind, so any consolidated total below blends report dates.`;
}
