// The account registry: who owns an account, who runs it, and how current it is.
//
// This replaces the substring heuristic the previous cockpit used to guess a
// custodian out of an account label. That guess was only ever safe because the
// old book had four managers with distinctive names; here the same string has to
// answer two different questions ("whose money is this?" and "who manages it?"),
// and statements from several platforms give no reason to expect either answer
// to be readable out of the account code. Both come from `Portfolio.accounts`.
import type { Account, Engagement, Portfolio, Position } from "./types";
import { ownerDisplayName } from "./owners";

export type AccountIndex = Map<string, Account>;

export function accountIndex(accounts: Account[]): AccountIndex {
  return new Map(accounts.map((a) => [a.accountId, a]));
}

/** Label to fall back to when a position references an account the book doesn't carry. */
const UNKNOWN = "Unattributed";

export const accountOf = (idx: AccountIndex, p: Position): Account | undefined => idx.get(p.accountId);

/**
 * The owning entity, as ONE name per person.
 *
 * Resolves through the canonical registry, because the same person is printed
 * three different ways across these providers and grouping on the printed name
 * splits one family member into three. An account whose owner never resolved
 * falls back to its printed name — visible and odd-looking, which is the point.
 */
export const ownerOf = (idx: AccountIndex, p: Position): string => {
  const a = idx.get(p.accountId);
  if (!a) return UNKNOWN;
  return a.ownerId ? ownerDisplayName(a.ownerId) : a.owner || UNKNOWN;
};

/** The canonical owner id, for grouping and joins. Null when unresolved. */
export const ownerIdOf = (idx: AccountIndex, p: Position): string | null =>
  idx.get(p.accountId)?.ownerId ?? null;

export const providerOf = (idx: AccountIndex, p: Position): string => idx.get(p.accountId)?.provider || UNKNOWN;
export const strategyOf = (idx: AccountIndex, p: Position): string => idx.get(p.accountId)?.strategy || "";
export const engagementOf = (idx: AccountIndex, p: Position): Engagement | "" => idx.get(p.accountId)?.engagement || "";
/** The provider's own wording for the engagement, when it differs from ours. */
export const providerEngagementOf = (idx: AccountIndex, p: Position): string =>
  idx.get(p.accountId)?.providerEngagement || "";
export const familyGroupOf = (idx: AccountIndex, p: Position): string => idx.get(p.accountId)?.familyGroup || "";

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
export const isDirect = (a: Account): boolean => a.engagement === "Direct";

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

// ── THE ACCOUNTS AN ENTITY HOLDS THAT THIS BOOK CANNOT VALUE ────────────────
//
//   "Bharat Jaisinghani Trust looks empty on holdings, so check that as well
//    since the client has provided half of the statements already."
//
// The trusts' entity page listed ONE holding, and the trusts hold three
// accounts. The other two are a Sky Capital angel-fund folio, whose statement
// reports units and the capital drawn against a commitment and NO NAV anywhere,
// and an HDFC Bank NSDL custody account holding 347 unlisted preference shares
// the depository records at their FACE VALUE, which is not a mark. Neither
// yields a valued position, so neither stood in any table — and a page reading
// "1 position · ₹1.71 Cr" over a trust with three funded accounts tells a reader
// the other two do not exist.
//
// THIS IS THE STANDING RULE, NOT A NEW ONE: a figure that exists for SOME
// accounts is shown for those and THE REST ARE NAMED. It had simply never been
// applied per entity, because the surface that names them — Private Market's
// own unvalued card — is scoped to `engagement === "AIF"` and a custody account
// is `Direct`. Here the axis is the ENTITY, so the scope is every account it
// owns.
//
// ── AND THE MONEY IS DELIBERATELY NOT ADDED TO ANYTHING ─────────────────────
//
// `drawn` is what was PAID into a fund, not what the stake is WORTH. Summed
// into an entity's NAV it would report a valuation nobody struck, which is the
// fabrication rule applied to a drawdown fund. It is stated per account, under
// its own heading, and in no total on the page.

export type UnvaluedHolding = {
  account: Account;
  /** Why no position stands for it — the account's own generated reason. */
  reason: string | null;
  /** Capital called to date, where a statement prints one. NEVER summed into a value. */
  drawn: number | null;
};

/**
 * Every account belonging to `owner` that carries no position in this book.
 *
 * Takes the commitments so a folio that has swallowed real money can say how
 * much; an account with none reports `null` rather than 0, because a fund that
 * publishes no capital account has not told us it called nothing.
 */
export function unvaluedHoldingsOf(
  owner: string,
  accounts: readonly Account[],
  positions: readonly Position[],
  commitments: readonly { accountId?: string | null; drawn?: number | null }[] = [],
): UnvaluedHolding[] {
  const held = new Set(positions.map((p) => p.accountId));
  const drawnBy = new Map(commitments.map((c) => [c.accountId ?? "", c.drawn ?? null]));
  return accounts
    .filter((a) => a.owner === owner && !held.has(a.accountId))
    .map((a) => ({ account: a, reason: a.noPositionsReason ?? null, drawn: drawnBy.get(a.accountId) ?? null }))
    .sort((x, y) => (y.drawn ?? 0) - (x.drawn ?? 0) || x.account.provider.localeCompare(y.account.provider));
}
