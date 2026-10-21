// A COPY OF THE BOOK WITH THE FAMILY'S TWO SEPARATE PAIRS TAGGED AGAIN.
//
// Not a suite: `scripts/test-family.mjs` lists its suites by name, and this is
// imported by the ones that need it.
//
// *"both are separate investments"* (28 Sep 2026) took the only two dedupe
// groups this book carried out of it — 360 ONE Special Opportunities Series 8
// under Ajay's CRN37702 and Bharat's CRN60117, and Transition Venture Fund I
// under both family trusts — so every consolidated figure now counts every row,
// and the count-once policy (CLAUDE.md §4c) has NO SUBJECT on the real book.
//
// The policy still stands. It is how the next pair a drop brings is carried
// until the family answers for it, and one line of
// `shared/separateInvestments.mjs` puts either pair back under it. So its
// arithmetic must still be proven rather than left unexercised — a helper that
// is right into no caller is the failure this repo keeps naming — and the
// suites that proved it on the real book prove it here instead: on the SAME
// rows, tagged exactly as `applyDedupePolicy` tagged them before the family
// answered. One `dedupeGroup` per pair, `dg-<securityKey>-<members>`, and each
// row naming the OTHER owners whose statements report it.
//
// THE COPY IS BUILT FROM THE FAMILY'S OWN TABLE, NEVER FROM A TYPED LIST OF
// ACCOUNTS, so it tags exactly what the decision covers. `pairsFound` says how
// many rows each decision reached: a suite reads it and fails on a decision
// that reached fewer than two, because a copy tagging nothing would let every
// check written against it pass over a book with no overlap in it.
import type { Account, Position } from "@/lib/types";
import { SEPARATE_INVESTMENTS, sameAccount } from "../../../shared/separateInvestments.mjs";

export type TaggedBook = {
  positions: Position[];
  /** Per decision, the rows it reached — each must be at least two. */
  pairsFound: { securityKey: string; rows: number }[];
  /** The value the count-once policy would leave out: every member but the one kept. */
  secondStatements: number;
};

export function withPairsTagged(positions: readonly Position[], accounts: readonly Account[]): TaggedBook {
  const accById = new Map(accounts.map((a) => [a.accountId, a]));
  const out = positions.map((p) => ({ ...p }));
  const pairsFound: TaggedBook["pairsFound"] = [];
  let secondStatements = 0;
  for (const d of SEPARATE_INVESTMENTS) {
    const members = out.filter((p) => {
      if (p.securityKey !== d.securityKey) return false;
      const a = accById.get(p.accountId);
      return !!a && d.accounts.some((n) => sameAccount(n, { provider: a.provider, accountNo: a.accountNo }));
    });
    pairsFound.push({ securityKey: d.securityKey, rows: members.length });
    if (members.length < 2) continue;
    const group = `dg-${d.securityKey}-${members.length}`;
    for (const p of members) {
      p.dedupeGroup = group;
      p.alsoReportedUnder = members.filter((q) => q !== p)
        .map((q) => accById.get(q.accountId)?.ownerId)
        .filter((o): o is string => !!o);
    }
    // `dedupedPositions` keeps the FIRST member in array order, so the policy
    // leaves out every other one — stated the way the helper under test would
    // decide it, but struck here on the rows alone.
    secondStatements += members.slice(1).reduce((t, p) => t + p.marketValue, 0);
  }
  return { positions: out, pairsFound, secondStatements };
}
