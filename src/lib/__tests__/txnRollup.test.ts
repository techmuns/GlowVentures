// THE TRANSACTION ROLLUP'S ARITHMETIC.
//   npm run test:family
//
// ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
//
// The rollup turns 462 dated rows into 12 lines, and every one of those lines
// is a SUM over rows that are frequently absent: `amount` is null wherever a
// statement printed no settlement, no net and no gross, and `realized` is null
// on every sell from the sixteen accounts whose manager issues no capital gain
// statement. A `?? 0` anywhere in that chain changes no total visibly — it turns
// "not reported" into "nothing", which reads as a measurement — so the traps are
// checked against FIXTURES where the right answer is known by construction, not
// against whatever this drop happens to contain.
//
// The one figure anchored to the real book is the reconciliation: the rollup's
// own totals must reproduce the flat tape's, because a rollup that quietly drops
// a row is exactly what a rollup is for and exactly what nothing else would see.
import { rollup, rollupTotals, STAGGERED_MIN, acctKey } from "@/lib/txnRollup";
import type { Txn } from "@/lib/ledger";
import type { Account } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, a: number | null, b: number | null, tol = 0.01) =>
  ok(name, a != null && b != null && Math.abs(a - b) <= tol, `${a} vs ${b}`);

// ── fixtures ────────────────────────────────────────────────────────────────
const txn = (o: Partial<Txn>): Txn => ({
  date: "2026-04-01", security: "Acme Ltd", securityKey: "acme", account: "A · P 1",
  provider: "Provider A", accountNo: "1", ownerId: "ajay", assetClass: "Equity",
  side: "Buy", qty: 10, price: 100, amount: 1000, realized: null, ...o,
});
const acct = (o: Partial<Account>): Account => ({
  accountId: "a", provider: "Provider A", accountNo: "1", owner: "Ajay Jaisinghani",
  ownerId: "ajay", strategy: null, engagement: "PMS", providerEngagement: null,
  members: [], asOf: "2026-04-01", inceptionDate: null, custodian: null,
  noPositionsReason: null, ...o,
} as Account);

// ── a null amount is skipped, never added as zero ────────────────────────────
{
  const rows = [txn({ amount: 1000 }), txn({ amount: null }), txn({ amount: 500 })];
  const [g] = rollup(rows, [], "manager");
  near("a null settled amount is skipped, not summed as zero", g.bought, 1500);
  ok("...and the coverage count says how many rows reported one", g.boughtOf === 2 && g.buys === 3,
    `${g.boughtOf} of ${g.buys}`);
}
{
  const [g] = rollup([txn({ amount: null }), txn({ amount: null })], [], "manager");
  ok("a group where NO row reports an amount is absent, never ₹0", g.bought === null);
}

// ── realised is absent, not zero, where no capital gain statement covers it ──
{
  const rows = [
    txn({ side: "Sell", amount: 900, realized: 250 }),
    txn({ side: "Sell", amount: 900, realized: null }),
    txn({ side: "Sell", amount: 900, realized: null }),
  ];
  const [g] = rollup(rows, [], "manager");
  near("realised sums only the sells that report one", g.realized, 250);
  ok("...and says how many of the sells it covers", g.realizedOf === 1 && g.sells === 3,
    `${g.realizedOf} of ${g.sells}`);
}
{
  const [g] = rollup([txn({ side: "Sell", realized: null })], [], "manager");
  ok("a group with sells but no realised figure anywhere renders absent", g.realized === null);
}

// ── the group footer is summed FROM the rows it renders ──────────────────────
{
  const rows = [
    txn({ securityKey: "a", security: "A", amount: 100 }),
    txn({ securityKey: "b", security: "B", amount: 200 }),
    txn({ securityKey: "b", security: "B", amount: 300 }),
  ];
  const [g] = rollup(rows, [], "manager");
  near("the group's Bought equals the sum of its own instrument rows",
    g.bought, g.instruments.reduce((s, i) => s + (i.bought ?? 0), 0));
  ok("...over one row per security, not one per trade", g.instruments.length === 2 && g.trades === 3,
    `${g.instruments.length} instruments from ${g.trades} trades`);
}

// ── A STAGGERED SERIES COLLAPSES BY CONSTRUCTION ─────────────────────────────
{
  const days = ["2026-04-01", "2026-05-02", "2026-06-03", "2026-07-04", "2026-08-05"];
  const rows = days.map((d) => txn({ date: d, amount: 1000 }));
  const [g] = rollup(rows, [], "manager");
  ok("five monthly purchases of one name are ONE line", g.instruments.length === 1,
    `${g.trades} trades → ${g.instruments.length} row`);
  const ins = g.instruments[0];
  ok("...marked as staggered, with the number of trading days it spans",
    ins.staggered && ins.days === 5, `staggered=${ins.staggered} days=${ins.days}`);
  ok("...and every tranche survives on the row, newest first",
    ins.tranches.length === 5 && ins.tranches[0].date === "2026-08-05",
    `${ins.tranches.length} tranches, first ${ins.tranches[0].date}`);
  near("...with the whole series' value intact", ins.bought, 5000);
  ok("...and its span is the first and last trade date",
    ins.first === "2026-04-01" && ins.last === "2026-08-05", `${ins.first} → ${ins.last}`);
}
{
  // The threshold is a LABEL on an already-collapsed row. One under it still
  // collapses; it just is not called a series.
  const rows = Array.from({ length: STAGGERED_MIN - 1 }, (_, i) =>
    txn({ date: `2026-04-0${i + 1}`, amount: 100 }));
  const [g] = rollup(rows, [], "manager");
  ok("a short run collapses too, and is simply not LABELLED staggered",
    g.instruments.length === 1 && !g.instruments[0].staggered);
}
{
  // Marked per side: four buys and four sells is two campaigns, not one series
  // of eight — and a naive `rows.length >= MIN` would call a single buy and a
  // single sell of four names "staggered" the moment they shared a security.
  const rows = [
    ...Array.from({ length: 3 }, (_, i) => txn({ date: `2026-04-0${i + 1}`, side: "Buy" as const })),
    ...Array.from({ length: 3 }, (_, i) => txn({ date: `2026-05-0${i + 1}`, side: "Sell" as const })),
  ];
  const ins = rollup(rows, [], "manager")[0].instruments[0];
  ok("staggered is judged per SIDE, so 3 buys + 3 sells is not a 6-row series",
    !ins.staggered && ins.buys === 3 && ins.sells === 3);
}

// ── grouping joins on provider + account number, never on a re-derived slug ──
{
  const rows = [
    txn({ provider: "Provider A", accountNo: "1", account: "Ajay · A 1" }),
    txn({ provider: "Provider A", accountNo: "2", account: "Ankita · A 2" }),
  ];
  const accounts = [
    acct({ accountId: "a1", accountNo: "1", strategy: "Aristos Equity Portfolio", owner: "Ajay Jaisinghani" }),
    acct({ accountId: "a2", accountNo: "2", strategy: "Aristos Equity Portfolio", owner: "Ankita Jaisinghani" }),
  ];
  const gs = rollup(rows, accounts, "manager");
  ok("two accounts on ONE strategy are two lines, not one", gs.length === 2);
  ok("...each qualified by whose money it runs, so they are distinguishable",
    gs.every((g) => g.label === "Aristos Equity Portfolio") &&
    new Set(gs.map((g) => g.sublabel)).size === 2,
    gs.map((g) => g.sublabel).join(" | "));
  ok("the join key is provider + account number", acctKey("Provider A", "1") === "Provider A|1");
}
{
  // An account the registry does not carry must still group — under the
  // provider and number its own statement prints.
  const [g] = rollup([txn({ provider: "Unknown House", accountNo: "9" })], [], "manager");
  ok("an account missing from the registry still groups, under its own provider",
    g.label === "Unknown House" && g.sublabel === "9");
}
{
  // A NON-PMS account is named by its PROVIDER, not by a strategy it has none
  // of — "the direct stocks" is a broker, not a mandate.
  const [g] = rollup([txn({ provider: "LKP Securities", accountNo: "5" })],
    [acct({ accountNo: "5", engagement: "Execution", strategy: null, provider: "LKP Securities" })], "manager");
  ok("a broker account is named by its provider", g.label === "LKP Securities");
}

// ── by entity, and by security ──────────────────────────────────────────────
{
  const rows = [
    txn({ provider: "P", accountNo: "1", securityKey: "x" }),
    txn({ provider: "P", accountNo: "2", securityKey: "x" }),
  ];
  const accounts = [
    acct({ accountNo: "1", owner: "Ajay Jaisinghani", provider: "P" }),
    acct({ accountNo: "2", owner: "Ajay Jaisinghani", provider: "P" }),
  ];
  ok("by entity, one member's two accounts are ONE line", rollup(rows, accounts, "entity").length === 1);
  ok("by manager, the same two are two", rollup(rows, accounts, "manager").length === 2);
}
{
  // Grouped BY SECURITY the second level would repeat the first, so it splits
  // by side instead — the useful cut there.
  const rows = [txn({ side: "Buy" }), txn({ side: "Sell", realized: 5 })];
  const [g] = rollup(rows, [], "instrument");
  ok("grouped by security, the drill-down splits buys from sells",
    g.instruments.length === 2, `${g.instruments.length} inner rows`);
}

// ── the totals reconcile with the tape they came from ───────────────────────
{
  const rows = [
    txn({ provider: "P", accountNo: "1", securityKey: "a", amount: 100 }),
    txn({ provider: "P", accountNo: "1", securityKey: "b", amount: null }),
    txn({ provider: "P", accountNo: "2", securityKey: "a", amount: 300, side: "Sell", realized: 7 }),
    txn({ provider: "Q", accountNo: "3", securityKey: "c", amount: 50 }),
  ];
  const gs = rollup(rows, [], "manager");
  const t = rollupTotals(gs);
  ok("every trade on the tape reaches exactly one group", t.trades === rows.length, `${t.trades} of ${rows.length}`);
  near("the footer's Bought is the tape's reported buys", t.bought, 150);
  near("the footer's Sold is the tape's reported sells", t.sold, 300);
  near("the footer's realised is the tape's", t.realized, 7);
  ok("distinct securities are counted once across groups", t.securities === 3, String(t.securities));
  ok("the footer's group count is the rows rendered", t.groups === gs.length && gs.length === 3);
}
{
  const t = rollupTotals(rollup([txn({ amount: null }), txn({ amount: null })], [], "manager"));
  ok("a footer over nothing reported is absent, never ₹0", t.bought === null);
}

process.exit(fails ? 1 : 0);
