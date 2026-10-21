// THE FAMILY'S "SEPARATE INVESTMENTS", HELD TO THE BOOK.
//
//   "both are separate investments" — the family, 28 Sep 2026, about the two
//   pairs this book had been counting once: 360 ONE Special Opportunities
//   Series 8 under Ajay's CRN37702 and Bharat's CRN60117, and Transition
//   Venture Fund I under both family trusts.
//
// `shared/separateInvestments.mjs` is the answer and `reconcile.mjs` applies it
// where the tags are made (`scripts/ingest/__tests__/separateInvestments.test.mjs`
// proves that half). This suite proves the other half: the GENERATED book says
// the same thing — every row the decision names is in the book, untagged,
// counted in the consolidated total, and its capital counted with it.
//
// A drifted key is the failure it exists for. The table is keyed on
// `securityKey`, and a change to `securityKeyOf` it did not follow would match
// nothing: the pair would quietly go back to being counted once, against the
// family's word, and no figure on screen could say why.
import { BOOK_ACCOUNTS, BOOK_COMMITMENTS, BOOK_POSITIONS, BOOK_SUMMARY } from "@/data/glowData";
import { dedupedPositions, currentHoldings, isPrivateClass } from "@/lib/analytics";
import { privateCapital } from "@/lib/privateMarket";
import { SEPARATE_INVESTMENTS, sameAccount } from "../../../shared/separateInvestments.mjs";
import { VALUED_HOLDERS } from "../../../shared/reviewHolders.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const rupees = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

// ── 1. EVERY ROW THE DECISION NAMES IS IN THE BOOK, AND NONE IS TAGGED ──────
const named: { key: string; accountId: string; marketValue: number }[] = [];
for (const d of SEPARATE_INVESTMENTS) {
  for (const n of d.accounts) {
    const acc = BOOK_ACCOUNTS.filter((a) => sameAccount(n, { provider: a.provider, accountNo: a.accountNo }));
    ok(`${d.securityKey}: ${n.provider} ${n.accountNo} is one account in the book`, acc.length === 1, `${acc.length} found`);
    if (acc.length !== 1) continue;
    const rows = BOOK_POSITIONS.filter((p) => p.accountId === acc[0].accountId && p.securityKey === d.securityKey);
    ok(`${d.securityKey}: ${n.provider} ${n.accountNo} holds it — no dead entry`, rows.length === 1, `${rows.length} row(s)`);
    for (const p of rows) {
      ok(`${d.securityKey}: ${n.accountNo}'s row carries no dedupe tag`,
        !p.dedupeGroup && !(p.alsoReportedUnder ?? []).length, p.dedupeGroup ?? "");
      named.push({ key: d.securityKey, accountId: p.accountId, marketValue: p.marketValue });
    }
  }
}
ok("the decision reaches four rows — both pairs, both accounts each", named.length === 4, String(named.length));

// ── 2. THE CONSOLIDATED TOTAL COUNTS EVERY ONE OF THEM ──────────────────────
{
  const consolidated = dedupedPositions(BOOK_POSITIONS);
  const counted = named.filter((n) => consolidated.some((p) => p.accountId === n.accountId && p.securityKey === n.key));
  ok("every named row is in the consolidated set", counted.length === named.length, `${counted.length} of ${named.length}`);
  const total = consolidated.reduce((t, p) => t + p.marketValue, 0);
  ok("BOOK_SUMMARY.totalValue is that set's sum — nothing counted once in it",
    Math.abs(total - BOOK_SUMMARY.totalValue) < 0.01, `${rupees(total)} vs ${rupees(BOOK_SUMMARY.totalValue)}`);
  const tagged = BOOK_POSITIONS.filter((p) => p.dedupeGroup);
  // Not a failure on its own: the policy stays for the next pair a drop brings,
  // pending the family's answer exactly as these two were. Printed, so a drop
  // that brings one is seen here first.
  console.log(`     ${tagged.length} position(s) in the book carry a dedupe tag for a pair the family has not been asked about`);
  const byKey = SEPARATE_INVESTMENTS.map((d) => ({ key: d.securityKey, second: named.filter((n) => n.key === d.securityKey).slice(1) }));
  const added = byKey.flatMap((b) => b.second).reduce((t, n) => t + n.marketValue, 0);
  // Since Stage 10dh both pairs are private-market lines of the family's
  // consolidated review, which is their source: each second row carries the
  // review's own value of that holder's line, read here off the table the book
  // was built from (by key AND account) rather than typed. It was the
  // statements' ₹3.17 Cr while the statements were the source.
  const reviewValueOf = (key: string, accountId: string) => VALUED_HOLDERS
    .filter((h) => h.key === key).flatMap((h) => h.split).find((s) => s.account === accountId)?.value;
  const expected = byKey.flatMap((b) => b.second).map((n) => reviewValueOf(n.key, n.accountId));
  ok("the second statement of each pair carries the review's own value of that line",
    expected.length === 2 && expected.every((v): v is number => typeof v === "number" && v > 0)
      && byKey.flatMap((b) => b.second).every((n, i) => Math.abs(n.marketValue - (expected[i] as number)) < 0.01),
    byKey.flatMap((b) => b.second).map((n, i) => `${n.accountId} ${n.marketValue} vs ${expected[i]}`).join("; "));
  ok("…so counting both adds the review's own figures, not a figure nobody printed",
    added > 0 && Math.abs(added - expected.reduce<number>((t, v) => t + (v ?? 0), 0)) < 0.01, rupees(added));
  ok("…and every named row is a review row, as the family's review is their source",
    named.every((n) => BOOK_POSITIONS.some((p) => p.accountId === n.accountId && p.securityKey === n.key && p.review)));
  const priv = BOOK_POSITIONS.filter((p) => p.marketSide === "private").reduce((t, p) => t + p.marketValue, 0);
  ok("…and the private side is the plain sum of its rows",
    Math.abs(priv - BOOK_SUMMARY.privateValue) < 0.01, `${rupees(priv)} vs ${rupees(BOOK_SUMMARY.privateValue)}`);
}

// ── 3. THE CAPITAL GOES WITH THE HOLDING ────────────────────────────────────
//
// Stage 10ct counted Transition Venture's second trust's capital once, with
// its holding, pending the family's answer. The answer is two investments, so
// both trusts' commitments are counted in every consolidated capital figure —
// and no capital account in the private scope is left out on this book.
{
  const cap = privateCapital(BOOK_COMMITMENTS, BOOK_ACCOUNTS, BOOK_POSITIONS);
  ok("no private capital account is left out as a second statement",
    cap.counting.alsoReported.length === 0,
    cap.counting.alsoReported.map((x) => x.commitment.accountId).join(", "));
  const tv = SEPARATE_INVESTMENTS.find((d) => d.securityKey === "transition-venture-capital-fund-i-class-a1")!;
  const tvAccounts = tv.accounts.map((n) => BOOK_ACCOUNTS.find((a) => sameAccount(n, { provider: a.provider, accountNo: a.accountNo }))?.accountId);
  const counted = tvAccounts.filter((id) => cap.counting.counted.some((c) => c.accountId === id));
  ok("both Transition Venture trusts' capital accounts are counted", counted.length === 2, counted.join(", "));

  // Load-bearing: had the pair still been tagged, one trust's capital would be
  // left out. Re-tag it here and the rule must drop exactly one.
  const retagged = BOOK_POSITIONS.map((p) => (p.securityKey === tv.securityKey ? { ...p, dedupeGroup: `dg-${tv.securityKey}-2` } : p));
  const once = privateCapital(BOOK_COMMITMENTS, BOOK_ACCOUNTS, retagged);
  ok("…and tagged again, one of them would be left out — the answer is what counts both",
    once.counting.alsoReported.length === 1 && tvAccounts.includes(once.counting.alsoReported[0].commitment.accountId));
  const privateHeld = currentHoldings(BOOK_POSITIONS).filter(isPrivateClass);
  ok("the rows that carry it are current private holdings",
    tvAccounts.every((id) => privateHeld.some((p) => p.accountId === id && p.securityKey === tv.securityKey)));
}

console.log(`\n${fails ? `${fails} FAILED` : "all passed"}`);
process.exit(fails ? 1 : 0);
