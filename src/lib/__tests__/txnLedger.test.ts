// THE TWO DATED RECORDS, MERGED INTO ONE ROW SET.
//   npm run test:family
//
// ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
//
// The Transactions card carried a TOGGLE between the family's own dated capital
// and their managers' dealing, and the family asked for one table. The row
// merges; the MONEY must not. Summing the two blocks into one column reports the
// family as having put in ₹291.9 Cr where they put in ₹221.5 Cr — a figure that
// looks entirely ordinary beside its neighbours, which is exactly why the
// separation is asserted here rather than left to be read off a screen.
//
// The traps are all shapes where the wrong answer is a PLAUSIBLE number:
//
//   • a contribution added to a trade (the ₹70.4 Cr defect);
//   • an absent half summed as zero, which turns "this account publishes no
//     transaction statement" into "its manager bought nothing";
//   • a section disagreement resolved by picking one side, which files an
//     account's own money under a heading its holdings do not sit in;
//   • a footer computed beside its rows rather than from them, which can be
//     right on its own terms while every row above it is wrong.
//
// Each is checked against a FIXTURE where the right answer is known by
// construction. The one figure anchored to the real book is the cross-check that
// `capitalRollup`'s own account value and the merge's `valueOfAccount` agree —
// two paths to one number, so a second drifting definition of "what this account
// holds" fails here rather than on screen.
import { mergeDatedRecords, datedTotals, datedSectionRollup } from "@/lib/txnLedger";
import { rollup, acctKey } from "@/lib/txnRollup";
import { capitalRollup, capitalTotals } from "@/lib/tranches";
import type { Txn } from "@/lib/ledger";
import type { Account, CapitalMove, Position } from "@/lib/types";
import { BOOK_CAPITAL_MOVES, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES } from "@/data/glowData";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, a: number | null, b: number | null, tol = 0.01) =>
  ok(name, a != null && b != null && Math.abs(a - b) <= tol, `${a} vs ${b}`);

// ── fixtures ────────────────────────────────────────────────────────────────
const acct = (o: Partial<Account>): Account => ({
  accountId: "gl", provider: "Green Lantern", accountNo: "510861", owner: "Ajay Jaisinghani",
  ownerId: "ajay", strategy: "GLC Growth Fund", engagement: "PMS", providerEngagement: null,
  members: [], asOf: "2026-07-27", inceptionDate: "2025-01-16", custodian: null,
  noPositionsReason: null, ...o,
} as Account);
const txn = (o: Partial<Txn>): Txn => ({
  date: "2026-04-01", security: "Acme Ltd", securityKey: "acme", account: "Ajay · GL 510861",
  provider: "Green Lantern", accountNo: "510861", ownerId: "ajay", assetClass: "Equity",
  side: "Buy", qty: 10, price: 100, amount: 1000, realized: null, isin: null, isinFrom: null, ...o,
});
const move = (o: Partial<CapitalMove>): CapitalMove => ({
  accountId: "gl", date: "2025-01-16", direction: "in", label: "Initial Contribution",
  amount: 100_000_000, units: null, security: null, ...o,
} as CapitalMove);
const pos = (o: Partial<Position>): Position => ({
  accountId: "gl", security: "Acme Ltd", securityKey: "acme", assetClass: "Equity",
  quantity: 100, marketValue: 114_000_000, costBasis: null, currentPrice: null,
  ...o,
} as Position);

const SECTION = "PMS mandates";
const sectionOf = () => SECTION;
const valueOf = (id: string) => (id === "gl" ? 114_000_000 : 0);

// ── the row merges, and it merges on the key both halves already build ──────
{
  const a = acct({});
  const cap = capitalRollup([move({}), move({ date: "2026-06-25", direction: "out", amount: 100_000 })],
    [a], [pos({})], {}, "all", "recent");
  const trd = rollup([txn({ amount: 17_500_000 })], [a], "auto", "recent", () => SECTION);
  ok("the capital half rolls up to one account row", cap.length === 1, `${cap.length}`);
  ok("the trades half rolls up to one mandate row", trd.length === 1 && trd[0].key.includes("acct:"), trd[0]?.key);
  const rows = mergeDatedRecords(cap, trd, sectionOf, valueOf);
  ok("an account publishing BOTH records is ONE row", rows.length === 1, `${rows.length} rows`);
  ok("...carrying both halves", !!rows[0].capital && !!rows[0].trades);
  ok("...keyed the way `rollup` already keys it",
    rows[0].key === `${SECTION}\u0000acct:${acctKey("Green Lantern", "510861")}`, rows[0].key);
  ok("...and the row is the ACCOUNT, so it carries its id", rows[0].accountId === "gl" && rows[0].kind === "account");

  // THE DEFECT THIS WHOLE MODULE EXISTS TO REFUSE. One column over both halves
  // reports ₹11.75 Cr where the family paid in ₹10 Cr.
  const t = datedTotals(rows);
  near("Capital in is the family's payment ALONE", t.paidIn, 100_000_000);
  near("Bought is the manager's dealing ALONE", t.bought, 17_500_000);
  ok("...and the two are never one figure", t.paidIn !== (t.paidIn + (t.bought ?? 0)),
    `summed would read ${(t.paidIn + (t.bought ?? 0)) / 1e7} Cr against a real ${t.paidIn / 1e7} Cr`);

  // THE DATED SPAN COVERS BOTH HALVES, because the row does.
  ok("the row's span runs across both records", rows[0].first === "2025-01-16" && rows[0].last === "2026-06-25",
    `${rows[0].first} → ${rows[0].last}`);
  // THE COUNTS STAY IN THEIR OWN COLUMNS, and are asserted there: three dated
  // rows behind this account, two the family's and one its manager's.
  ok("...each half keeping its own count", rows[0].capital!.moves.length === 2 && rows[0].trades!.trades === 1,
    `${rows[0].capital!.moves.length} movements, ${rows[0].trades!.trades} trades`);
}

// ── an absent half is ABSENT, never a zero ──────────────────────────────────
{
  const a = acct({});
  const cap = capitalRollup([move({})], [a], [pos({})], {}, "all", "recent");
  const rows = mergeDatedRecords(cap, [], sectionOf, valueOf);
  ok("an account with no transaction statement still draws its row", rows.length === 1);
  ok("...with the trades half NULL rather than an empty group", rows[0].trades === null);
  const t = datedTotals(rows);
  ok("...so Bought is absent, never ₹0", t.bought === null, `${t.bought}`);
  ok("...and Sold with it", t.sold === null);
  ok("...and no trade is counted", t.trades === 0 && t.buys === 0 && t.sells === 0);
}
{
  const a = acct({});
  const trd = rollup([txn({ amount: 17_500_000 })], [a], "auto", "recent", () => SECTION);
  const rows = mergeDatedRecords([], trd, sectionOf, valueOf);
  ok("a mandate with no dated capital record still draws its row", rows.length === 1);
  ok("...with the capital half NULL rather than a zeroed group", rows[0].capital === null);
  const t = datedTotals(rows);
  ok("...so Redemption is absent, never ₹0", t.redemption === null, `${t.redemption}`);
  ok("...and no payment is counted", t.contributions === 0 && t.withdrawals === 0);
  near("...while Bought still totals", t.bought, 17_500_000);
  // AND THE ACCOUNT IS STILL WORTH SOMETHING TODAY. Nine of this book's ten
  // mandates publish no dated capital record, and a value withheld for want of
  // a document about a DIFFERENT question would be an absence nobody measured.
  near("...and the account's own value is still filled", rows[0].value, 114_000_000);
}

// ── a SECURITY row is an instrument, and has no account to value ────────────
{
  const trd = rollup([txn({ provider: "LKP", accountNo: "98245", amount: 500_000 })],
    [acct({ accountId: "lkp", provider: "LKP", accountNo: "98245", engagement: "Execution", strategy: null })],
    "auto", "recent", () => "Direct Equity");
  ok("a trade outside a mandate rolls up to its SECURITY", trd[0].key.includes("sec:"), trd[0].key);
  const rows = mergeDatedRecords([], trd, sectionOf, valueOf);
  ok("...and the merged row knows it is a security", rows[0].kind === "security" && rows[0].accountId === null);
  ok("...so it has no account value, rather than ₹0", rows[0].value === null, `${rows[0].value}`);
  const t = datedTotals(rows);
  ok("...and the Value today total is absent over a table of them", t.value === null && t.valueOf === 0);
}

// ── APPRECIATION IS AN AMOUNT, SO IT CARRIES A TOTAL — and a return is a
//    RATE, so it cannot. The total is the sum of the rows that PUBLISH one,
//    asserted as that relation rather than as a literal.
{
  const a = acct({});
  const cap = capitalRollup([move({})], [a], [pos({})], {}, "all", "recent");
  const rows = mergeDatedRecords(cap, [], sectionOf, () => 114_000_000);
  const t = datedTotals(rows);
  const published = rows.map((r) => r.capital?.appreciation).filter((g): g is number => g != null);
  ok("the Appreciation total covers exactly the rows that publish one", t.appreciationOf === published.length, `${t.appreciationOf} vs ${published.length}`);
  if (published.length) {
    near("...and it is their sum", t.appreciation ?? NaN, published.reduce((x, y) => x + y, 0));
  }
}

// ── ...AND AN UNPUBLISHED ONE IS SKIPPED, NEVER BLENDED IN AS ZERO ─────────
{
  const trd = rollup([txn({ provider: "LKP", accountNo: "98245", amount: 500_000 })],
    [acct({ accountId: "lkp", provider: "LKP", accountNo: "98245", engagement: "Execution", strategy: null })],
    "auto", "recent", () => "Direct Equity");
  const t = datedTotals(mergeDatedRecords([], trd, sectionOf, valueOf));
  ok("a table with no capital half at all totals NO appreciation, rather than ₹0",
    t.appreciation === null && t.appreciationOf === 0, `${t.appreciation} / ${t.appreciationOf}`);
  ok("...and no realised or unrealised part either",
    t.realisedGain === null && t.unrealisedGain === null);
}

// ── a SECTION disagreement draws TWO rows rather than picking one ───────────
{
  const a = acct({});
  const cap = capitalRollup([move({})], [a], [pos({})], {}, "all", "recent");
  // The trades half says one section; the account's own holdings say another.
  const trd = rollup([txn({ amount: 17_500_000 })], [a], "auto", "recent", () => "AIF");
  const rows = mergeDatedRecords(cap, trd, () => "PMS mandates", valueOf);
  ok("two halves that disagree about the section draw TWO rows", rows.length === 2, `${rows.length}`);
  ok("...one in each, rather than either winning silently",
    new Set(rows.map((r) => r.section)).size === 2, rows.map((r) => r.section).join(" / "));
  // AND NEITHER SECTION DOUBLE-COUNTS THE OTHER'S MONEY, which is the whole
  // reason the section is part of the key.
  const secs = datedSectionRollup(rows, (k) => [...k].sort());
  const pms = secs.find((s) => s.key === "PMS mandates")!;
  const aif = secs.find((s) => s.key === "AIF")!;
  near("...the capital lands in one section only", pms.totals.paidIn, 100_000_000);
  ok("...and not in the other", aif.totals.contributions === 0 && aif.totals.paidIn === 0);
  near("...the dealing lands in the other only", aif.totals.bought, 17_500_000);
  ok("...and not in the first", pms.totals.bought === null);
}

// ── the sections partition the table, and each subtotal is its own rows' ────
{
  const a = acct({});
  const b = acct({ accountId: "lkp", provider: "LKP", accountNo: "98245", engagement: "Execution", strategy: null });
  const cap = capitalRollup([move({})], [a], [pos({})], {}, "all", "recent");
  const trd = [
    ...rollup([txn({ amount: 17_500_000 })], [a], "auto", "recent", () => "PMS mandates"),
    ...rollup([txn({ provider: "LKP", accountNo: "98245", amount: 500_000 })], [b], "auto", "recent", () => "Direct Equity"),
  ];
  const rows = mergeDatedRecords(cap, trd, sectionOf, valueOf);
  const secs = datedSectionRollup(rows, (k) => [...k].sort());
  ok("every row lands in exactly one section",
    secs.reduce((n, s) => n + s.rows.length, 0) === rows.length, `${secs.reduce((n, s) => n + s.rows.length, 0)} of ${rows.length}`);
  const whole = datedTotals(rows);
  near("the sections' Capital in adds to the table's",
    secs.reduce((n, s) => n + s.totals.paidIn, 0), whole.paidIn);
  near("...and their Bought does too",
    secs.reduce((n, s) => n + (s.totals.bought ?? 0), 0), whole.bought);
  ok("...and the two are still different figures", whole.paidIn !== whole.bought);
}

// ── THE MERGE ORDERS ITS OWN OUTPUT ─────────────────────────────────────────
//
// The first cut returned the map's insertion order — every capital row, then
// every trades row — so most of the table was in no order at all under a card
// whose default the family asked for by name. Both rollups sort their own
// output and the merge threw it away. Found by WIDENING the sweep's ordering
// check from the capital rows to every row, which is the half that could not
// see it.
{
  const a = acct({});
  const b = acct({ accountId: "lkp", provider: "LKP", accountNo: "98245", engagement: "Execution", strategy: null });
  // A capital row whose last movement is OLD, and a security row traded since.
  const cap = capitalRollup([move({ date: "2023-05-04" })], [a], [pos({})], {}, "all", "recent");
  const trd = rollup([txn({ provider: "LKP", accountNo: "98245", date: "2026-08-01", amount: 500_000 })],
    [b], "auto", "recent", () => SECTION);
  const recent = mergeDatedRecords(cap, trd, sectionOf, valueOf, "recent");
  ok("recent first puts the newer row first, whichever half it came from",
    recent[0].last === "2026-08-01", recent.map((r) => r.last).join(" / "));
  const oldest = mergeDatedRecords(cap, [], sectionOf, valueOf, "recent");
  ok("...and a capital-only table is still ordered", oldest.length === 1);

  // LARGEST FIRST RANKS ON THE ROW'S BIGGEST SINGLE BLOCK, never on the two
  // added — which would be the ₹70.4 Cr defect arriving as an ORDER, where no
  // cell on the page could contradict it.
  const big = capitalRollup([move({ amount: 30_000_000 })], [a], [pos({})], {}, "all", "recent");
  const small = rollup([txn({ provider: "LKP", accountNo: "98245", amount: 50_000_000 })],
    [b], "auto", "recent", () => SECTION);
  const size = mergeDatedRecords(big, small, sectionOf, valueOf, "size");
  ok("largest first ranks the bigger block first", size[0].trades !== null,
    size.map((r) => (r.capital ? `cap ${r.capital.paidIn}` : `trd ${r.trades?.bought}`)).join(" / "));
}

// ── AN ACCOUNT NO STATEMENT VALUES IS UNVALUED, NOT WORTH ₹0 (A-06) ────────
// India SME's and Sky Capital's folios print the capital drawn and no NAV, so
// they carry no position at all. Summed over nothing the account read ₹0, and
// the appreciation struck against it was every rupee paid in, reported as a
// −100% return. Constructed, because the book this suite runs against may carry
// no such account on the day it runs — and a guard that passes over nothing
// claims confidence nobody earned. (Main's Stage 10cd model: `value` is null and
// `appreciation` withheld with `appreciationReason`.)
{
  // The record reaches the statement date (`capitalRecordTo`), so the reason
  // that fires is the one this block is about, not the record's shortfall.
  const a = acct({ noPositionsReason: "this fund publishes no NAV; the statement reports the capital drawn and the units it bought", capitalRecordTo: "2026-07-27" } as Partial<typeof BOOK_ACCOUNTS[number]>);
  const cap = capitalRollup([move({})], [a], [], {}, "all", "recent");
  ok("an account with no position row rolls up to one row", cap.length === 1, `${cap.length}`);
  ok("...whose value is ABSENT, never ₹0", cap[0]?.value === null, `${cap[0]?.value}`);
  ok("...so it carries no appreciation and no split", cap[0]?.appreciation === null && cap[0]?.realised === null && cap[0]?.unrealised === null,
    `appreciation ${cap[0]?.appreciation} · realised ${cap[0]?.realised} · unrealised ${cap[0]?.unrealised}`);
  ok("...and says why, in the account's own words", /publishes no NAV/.test(cap[0]?.appreciationReason ?? ""), cap[0]?.appreciationReason ?? "");
  // LOAD-BEARING: the same account holding a MEASURED zero keeps its zero, so
  // the rule is about a missing row, not a small figure.
  const zero = capitalRollup([move({})], [a], [pos({ marketValue: 0, quantity: 0 })], {}, "all", "recent");
  ok("a measured ₹0 (redeemed to nil) keeps its zero", zero[0]?.value === 0, `${zero[0]?.value}`);
  ok("...and is not given the unvalued account's reason", !/publishes no NAV/.test(zero[0]?.appreciationReason ?? ""), zero[0]?.appreciationReason ?? "");
  const t = capitalTotals([...cap]);
  ok("a set of unvalued accounts has no value total, never ₹0", t.value === null, `${t.value}`);
  const both = capitalTotals([...cap, ...zero]);
  ok("...and one beside a valued account adds nothing rather than ₹0", both.value === 0, `${both.value}`);
}

// ── ANCHORED ON THE GENERATED BOOK: one definition of what an account holds ──
{
  const byAccount = new Map<string, number>();
  for (const p of BOOK_POSITIONS) byAccount.set(p.accountId, (byAccount.get(p.accountId) ?? 0) + p.marketValue);
  const valueOfAccount = (id: string): number | null => (byAccount.has(id) ? byAccount.get(id)! : null);
  const cap = capitalRollup(BOOK_CAPITAL_MOVES, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES, "all", "recent");
  ok("the book's capital record rolls up to rows", cap.length > 0, `${cap.length} accounts`);
  // TWO PATHS TO ONE NUMBER. `capitalRollup` sums an account's positions itself;
  // the merge is handed a `valueOfAccount` built independently. A second,
  // drifting definition of "what this account holds" is the failure
  // `holdingBucket` and `companyExposure` were each extracted to stop, and it
  // would show as a Value today that disagreed with the Return beside it.
  const off = cap.filter((g) => {
    const v = valueOfAccount(g.accountId);
    return (g.value == null) !== (v == null) || (g.value != null && v != null && Math.abs(g.value - v) > 0.01);
  });
  ok("...and the merge's account value agrees with the rollup's own, to the paisa",
    off.length === 0, off.map((g) => `${g.accountId}: ${g.value} vs ${valueOfAccount(g.accountId)}`).join("; "));

  const rows = mergeDatedRecords(cap, [], () => "x", valueOfAccount);
  ok("every capital row carries its account id", rows.every((r) => r.accountId !== null));
  near("...and the merged Capital in reproduces the rollup's",
    datedTotals(rows).paidIn, cap.reduce((n, g) => n + g.paidIn, 0));
}

console.log(fails ? `\n${fails} failure(s)` : "\nall ok");
process.exit(fails ? 1 : 0);
