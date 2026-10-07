// ── WHOSE BOOK THE DASHBOARD SHOWS — the family, or the members picked ────────
//
// *"they should be able to select consolidated family view and then … each
// family member or family entity so that the whole dashboard is then only
// showing information regarding that particular family member or family entity
// … they should be able to multi select family members as well."* (Stage 10di)
//
// ONE MEMBER IS ONE `ownerId`, AND THE FILTER IS THE ACCOUNT. Every position,
// capital-gain row, commitment and dated flow in this book names the account it
// belongs to, and every account names its canonical owner (`Account.ownerId`,
// §6 "one person, one ownerId"). So narrowing the book to some members is a
// filter on ACCOUNTS and nothing else: no figure is split, apportioned or
// re-derived, and a figure a member's own accounts do not carry stays absent.
//
// PURE — every input is an argument, so the suite and the page cannot disagree
// about which rows a scope keeps. `PortfolioContext` is the one seam that applies
// it, which is what makes "the whole dashboard" follow the selector without a
// per-page edit; the few pages that read a generated table directly filter on
// the `accountIds` it hands out (see `useMemberScope`).
import type { Account, Portfolio } from "@/lib/types";
import { publicPrivateSplit } from "@/lib/analytics";

/** The address parameter that carries a scope: `?members=ajay-jaisinghani,…`. */
export const MEMBERS_PARAM = "members";

export type MemberKind = "member" | "trust" | "unattributed";

export type MemberOption = {
  ownerId: string;
  label: string;
  kind: MemberKind;
  /** How many accounts in the book this owner holds. */
  accounts: number;
};

const kindOf = (ownerId: string, label: string): MemberKind =>
  ownerId === "not-attributed" ? "unattributed" : /\btrust\b/i.test(label) ? "trust" : "member";

/**
 * The owners a reader can pick, in the order the BOOK lists them (`BOOK_OWNERS`:
 * the family members first, then the trusts, then the review's unattributed
 * lines). An owner with no account in the book is not offered — picking it would
 * open a dashboard with nothing on it, which reads as a measured nothing.
 */
export function memberOptions(
  accounts: readonly Pick<Account, "ownerId" | "owner">[],
  order: readonly { ownerId: string; displayName: string }[],
): MemberOption[] {
  const count = new Map<string, number>();
  const name = new Map<string, string>();
  for (const a of accounts) {
    if (!a.ownerId) continue;
    count.set(a.ownerId, (count.get(a.ownerId) ?? 0) + 1);
    if (!name.has(a.ownerId)) name.set(a.ownerId, a.owner);
  }
  const rank = new Map(order.map((o, i) => [o.ownerId, i]));
  const labelOf = new Map(order.map((o) => [o.ownerId, o.displayName]));
  return [...count.keys()]
    .sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b))
    .map((ownerId) => {
      const label = labelOf.get(ownerId) ?? name.get(ownerId) ?? ownerId;
      return { ownerId, label, kind: kindOf(ownerId, label), accounts: count.get(ownerId) ?? 0 };
    });
}

/**
 * Read `?members=`. `null` is the whole family (no parameter, or an empty one).
 * An id the book does not carry is returned in `unknown` and never kept, so a
 * stale bookmark can never narrow the dashboard to an owner that does not exist
 * — and the page can SAY that the address named nobody it knows, rather than
 * quietly widening to the whole family.
 */
export function parseMembersParam(
  raw: string | null | undefined,
  known: ReadonlySet<string>,
): { ids: string[] | null; unknown: string[] } {
  if (raw == null) return { ids: null, unknown: [] };
  const asked = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (!asked.length) return { ids: null, unknown: [] };
  return { ids: asked.filter((id) => known.has(id)), unknown: asked.filter((id) => !known.has(id)) };
}

/** The parameter's value for a selection, in a stable order; null = whole family. */
export function serializeMembers(ids: readonly string[] | null, order: readonly string[]): string | null {
  if (!ids || !ids.length) return null;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...new Set(ids)].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b)).join(",");
}

/** What the selector's button reads. */
export function scopeLabel(ids: readonly string[] | null, options: readonly MemberOption[]): string {
  if (!ids) return "Whole family";
  if (!ids.length) return "No member";
  const names = ids.map((id) => options.find((o) => o.ownerId === id)?.label ?? id);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${firstName(names[0])} + ${firstName(names[1])}`;
  return `${names.length} members`;
}

/** "Ajay Jaisinghani" → "Ajay"; a trust keeps enough of its name to stay distinct. */
function firstName(label: string): string {
  const trust = label.match(/trust\s*(\d+)?$/i);
  if (trust) return trust[1] ? `Trust ${trust[1]}` : "Family Trust";
  if (/^not attributed/i.test(label)) return "Unattributed";
  return label.split(/\s+/)[0];
}

/** Every account the chosen owners hold. */
export function accountIdsFor(
  accounts: readonly Pick<Account, "accountId" | "ownerId">[],
  owners: ReadonlySet<string>,
): Set<string> {
  return new Set(accounts.filter((a) => a.ownerId != null && owners.has(a.ownerId)).map((a) => a.accountId));
}

/**
 * THE BOOK OF THE CHOSEN MEMBERS, AND NOTHING ELSE.
 *
 * - accounts, positions, commitments, dated flows and capital-gain rows are
 *   kept where their ACCOUNT is one of the members' — never by a name match;
 * - the per-owner flows are kept by the owner's display name, which is how
 *   `BOOK_ENTITY_CASH_FLOWS` is keyed;
 * - the totals are re-struck over the kept positions by the SAME split the book
 *   uses (`publicPrivateSplit`), so the three sides still add to the total;
 * - `asOf` is the newest of the kept accounts' own dates;
 * - THE DATED NAV SERIES IS EMPTIED. It is chained over the whole covered panel
 *   of accounts and is not split by owner anywhere, so carrying it would put the
 *   whole family's line under one member's name. The pages that draw it say so.
 */
export function scopePortfolio(p: Portfolio, owners: ReadonlySet<string>): Portfolio {
  const accounts = p.accounts.filter((a) => a.ownerId != null && owners.has(a.ownerId));
  const ids = new Set(accounts.map((a) => a.accountId));
  const names = new Set(accounts.map((a) => a.owner));
  const positions = p.positions.filter((x) => ids.has(x.accountId));
  const { listed, private: priv, unplaced } = publicPrivateSplit(positions);
  const keep = <T,>(rec: Record<string, T> | undefined, ok: (k: string) => boolean) =>
    rec ? Object.fromEntries(Object.entries(rec).filter(([k]) => ok(k))) : rec;
  const asOf = accounts.reduce((m, a) => (a.asOf && a.asOf > m ? a.asOf : m), "");
  return {
    ...p,
    asOf: asOf || p.asOf,
    accounts,
    positions,
    listedValue: listed,
    privateValue: priv,
    unplacedValue: unplaced,
    totalValue: listed + priv + unplaced,
    navHistory: [],
    capitalGains: p.capitalGains.filter((cg) =>
      cg.accountId ? ids.has(cg.accountId) : cg.ownerId ? owners.has(cg.ownerId) : false),
    accountCashFlows: keep(p.accountCashFlows, (k) => ids.has(k)),
    entityCashFlows: keep(p.entityCashFlows, (k) => names.has(k)),
    entityNavHistory: keep(p.entityNavHistory, (k) => names.has(k)),
    commitments: p.commitments.filter((c) => ids.has(c.accountId)),
  };
}

/** The sentence a page prints where a figure is whole-family only. */
export function wholeFamilyOnly(what: string, label: string): string {
  return `${what} is struck over the whole family's accounts and is not split by member, so it is not shown for ${label}. Choose Whole family at the top to see it.`;
}
