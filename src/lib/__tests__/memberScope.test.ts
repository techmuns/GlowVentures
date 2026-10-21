// WHOSE BOOK THE DASHBOARD SHOWS — the member scope, held to the generated book
// (Stage 10di).
//
// *"they should be able to multi select family members … the whole dashboard
// would show the information regarding just those selected family members or
// entities."*
//
// The scope is a filter on ACCOUNTS and nothing else, so the checks here are
// partitions: every owner's own book, added up, must be the whole family's book
// to the paisa — positions, value, the three sides, capital-gain rows,
// commitments, dated trades, lots and dividends. A scope that split a figure, or
// dropped or doubled a row, breaks a partition. Anchored on `glowData.ts` and on
// the ledger as the archive derives it, never on a fixture.
import type { Portfolio } from "@/lib/types";
import {
  BOOK_ACCOUNTS, BOOK_OWNERS, BOOK_POSITIONS, BOOK_SUMMARY, BOOK_NAV_HISTORY, BOOK_CAPITAL_GAINS,
  BOOK_ACCOUNT_CASH_FLOWS, BOOK_ENTITY_CASH_FLOWS, BOOK_COMMITMENTS,
} from "@/data/glowData";
import {
  accountIdsFor, inScopeAccount, inScopeOwner, labelInScope, memberOptions, parseMembersParam,
  scopeIncomeData, scopeLabel, scopeLotData, scopePortfolio, scopeTxnData, serializeMembers, wholeFamilyOnly,
} from "@/lib/memberScope";
import { loadIncome, loadRealisedLots, loadTransactions } from "./archiveLedger";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const paise = (x: number) => Math.round(x * 100);
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

const book: Portfolio = {
  fileName: "test", uploadedAt: new Date(0).toISOString(), baseCurrency: "INR",
  asOf: BOOK_SUMMARY.asOf, totalValue: BOOK_SUMMARY.totalValue, listedValue: BOOK_SUMMARY.listedValue,
  privateValue: BOOK_SUMMARY.privateValue, unplacedValue: BOOK_SUMMARY.unplacedValue,
  accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, navHistory: BOOK_NAV_HISTORY,
  capitalGains: BOOK_CAPITAL_GAINS, accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS,
  entityCashFlows: BOOK_ENTITY_CASH_FLOWS, commitments: BOOK_COMMITMENTS,
  privateMarkets: { peFunds: [], preIpoFunds: [], unlistedCompanies: [], debtFunds: [], closedFunds: [], startups: [] },
} as Portfolio;

// ── 1. who can be picked ──
const options = memberOptions(BOOK_ACCOUNTS, BOOK_OWNERS);
const withAccounts = new Set(BOOK_ACCOUNTS.map((a) => a.ownerId).filter((o): o is string => !!o));
ok("every owner with an account is offered, and no other", options.length === withAccounts.size
  && options.every((o) => withAccounts.has(o.ownerId)), `${options.length} offered`);
ok("the offered owners are in the book's own order", options.map((o) => o.ownerId).join() ===
  BOOK_OWNERS.map((o) => o.ownerId).filter((id) => withAccounts.has(id)).join());
ok("each option counts its own accounts", options.every((o) =>
  o.accounts === BOOK_ACCOUNTS.filter((a) => a.ownerId === o.ownerId).length));
ok("every account in the book belongs to an offered owner", BOOK_ACCOUNTS.every((a) => !!a.ownerId && withAccounts.has(a.ownerId)),
  `${BOOK_ACCOUNTS.filter((a) => !a.ownerId).length} with no owner`);
ok("a trust is offered as a trust", options.filter((o) => /trust/i.test(o.label)).every((o) => o.kind === "trust")
  && options.some((o) => o.kind === "trust"));

// ── 2. the address ──
const known = new Set(options.map((o) => o.ownerId));
const [a, b, c] = options.map((o) => o.ownerId);
ok("no parameter is the whole family", parseMembersParam(null, known).ids === null);
ok("an empty parameter is the whole family", parseMembersParam(" , ", known).ids === null);
{
  const r = parseMembersParam(`${b},nobody-here,${a},${b}`, known);
  ok("an id the book does not carry is reported, never kept", r.unknown.join() === "nobody-here"
    && r.ids!.length === 2 && r.ids!.includes(a) && r.ids!.includes(b));
}
ok("a selection is written in the book's order", serializeMembers([c, a], options.map((o) => o.ownerId)) === `${a},${c}`);
ok("an empty selection is written as no parameter", serializeMembers([], options.map((o) => o.ownerId)) === null);
ok("round trip", parseMembersParam(serializeMembers([b, a], [...known]), known).ids!.join() === `${a},${b}`);

// ── 3. what the button reads ──
ok("Whole family", scopeLabel(null, options) === "Whole family");
ok("one member reads their name", scopeLabel([a], options) === options[0].label, scopeLabel([a], options));
ok("two members read both first names", /^\S+ \+ \S+/.test(scopeLabel([a, b], options)), scopeLabel([a, b], options));
ok("three or more read a count", scopeLabel([a, b, c], options) === "3 members");
{
  const trusts = options.filter((o) => o.kind === "trust");
  if (trusts.length >= 2) {
    const l = scopeLabel([trusts[0].ownerId, trusts[1].ownerId], options);
    ok("two trusts stay distinct on the button", !/^(\S+) \+ \1$/.test(l), l);
  }
}

// ── 4. each owner's book, and the partition ──
let posCount = 0, value = 0, listed = 0, priv = 0, unplaced = 0, cg = 0, commit = 0;
for (const o of options) {
  const p = scopePortfolio(book, new Set([o.ownerId]));
  const ids = accountIdsFor(BOOK_ACCOUNTS, new Set([o.ownerId]));
  ok(`${o.label}: only their own accounts`, p.accounts.every((x) => x.ownerId === o.ownerId) && p.accounts.length === o.accounts);
  ok(`${o.label}: only positions in those accounts`, p.positions.every((x) => ids.has(x.accountId))
    && p.positions.length === BOOK_POSITIONS.filter((x) => ids.has(x.accountId)).length);
  ok(`${o.label}: the three sides add to the total`, paise(p.listedValue + p.privateValue + p.unplacedValue) === paise(p.totalValue));
  ok(`${o.label}: the total is their positions' own value`, paise(p.totalValue) === paise(sum(p.positions.map((x) => x.marketValue))));
  ok(`${o.label}: the NAV series is not carried under one member's name`, p.navHistory.length === 0);
  ok(`${o.label}: commitments are their accounts' own`, p.commitments.every((x) => ids.has(x.accountId)));
  ok(`${o.label}: dated flows are their accounts' own`, Object.keys(p.accountCashFlows ?? {}).every((k) => ids.has(k)));
  posCount += p.positions.length; value += p.totalValue; listed += p.listedValue; priv += p.privateValue; unplaced += p.unplacedValue;
  cg += p.capitalGains.length; commit += p.commitments.length;
}
ok("every position is in exactly one owner's book", posCount === BOOK_POSITIONS.length, `${posCount} of ${BOOK_POSITIONS.length}`);
ok("the owners' values add to the family's", paise(value) === paise(sum(BOOK_POSITIONS.map((x) => x.marketValue))));
ok("…and each side adds to the family's side", paise(listed) === paise(BOOK_SUMMARY.listedValue)
  && paise(priv) === paise(BOOK_SUMMARY.privateValue) && paise(unplaced) === paise(BOOK_SUMMARY.unplacedValue),
  `listed ${listed.toFixed(2)} private ${priv.toFixed(2)}`);
ok("every capital-gain row is in exactly one owner's book", cg === BOOK_CAPITAL_GAINS.length, `${cg} of ${BOOK_CAPITAL_GAINS.length}`);
ok("every commitment is in exactly one owner's book", commit === BOOK_COMMITMENTS.length, `${commit} of ${BOOK_COMMITMENTS.length}`);
{
  const two = scopePortfolio(book, new Set([a, b]));
  const one = (id: string) => scopePortfolio(book, new Set([id])).totalValue;
  ok("two members' book is the two books added", paise(two.totalValue) === paise(one(a) + one(b)));
}
ok("the whole family is every account", inScopeAccount(null, "anything") && inScopeOwner(null, null) && labelInScope(null, "x"));
ok("a row with no account is outside a scope", !inScopeAccount(new Set(["x"]), null));
ok("the whole-family sentence names the scope and the way back", /Whole family/.test(wholeFamilyOnly("The NAV series", "Ajay")) && /for Ajay/.test(wholeFamilyOnly("The NAV series", "Ajay")));

// ── 5. the dated record ──
const accountsOf = (id: string) => BOOK_ACCOUNTS.filter((x) => x.ownerId === id);
{
  const t = await loadTransactions();
  if (!t) ok("the transaction tape loaded", false);
  else {
    let n = 0, own = 0, buys = 0, sells = 0;
    for (const o of options) {
      const s = scopeTxnData(t, new Set([o.ownerId]), accountsOf(o.ownerId));
      ok(`${o.label}: only their own trades`, s.txns.every((x) => x.ownerId === o.ownerId));
      ok(`${o.label}: the counts are of their own trades`, s.buys + s.sells === s.txns.filter((x) => x.side === "Buy" || x.side === "Sell").length);
      ok(`${o.label}: no other member's unsettled lots`, s.lotsNoTrade.lots === 0);
      n += s.txns.length; own += s.ownAllotments.length; buys += s.buys; sells += s.sells;
    }
    ok("every owned trade is in exactly one owner's tape", n === t.txns.filter((x) => x.ownerId).length, `${n} of ${t.txns.length}`);
    ok("every trade names its owner", t.txns.every((x) => !!x.ownerId));
    ok("the buy and sell counts partition", buys === t.buys && sells === t.sells, `${buys}/${sells} vs ${t.buys}/${t.sells}`);
    ok("every own allotment is in exactly one owner's tape", own === t.ownAllotments.length);
  }
}
{
  const l = await loadRealisedLots();
  if (!l) ok("the capital-gain lots loaded", false);
  else {
    let n = 0, st = 0, lt = 0, cls = 0;
    for (const o of options) {
      const s = scopeLotData(l, accountsOf(o.ownerId));
      n += s.lots.length; st += s.totalShort ?? 0; lt += s.totalLong ?? 0; cls += sum(s.byClass.map((x) => x.total));
      ok(`${o.label}: the class split adds to their own lots`, paise(sum(s.byClass.map((x) => x.total))) === paise(sum(s.lots.map((x) => (x.shortTerm ?? 0) + (x.longTerm ?? 0)))));
    }
    ok("every lot is in exactly one owner's book", n === l.lots.length, `${n} of ${l.lots.length}`);
    ok("short-term and long-term partition", paise(st) === paise(l.totalShort ?? 0) && paise(lt) === paise(l.totalLong ?? 0));
    ok("the class split partitions", paise(cls) === paise(sum(l.byClass.map((x) => x.total))));
  }
}
{
  const inc = await loadIncome();
  if (!inc) ok("the income record loaded", false);
  else {
    let cash = 0, corp = 0, net = 0;
    for (const o of options) {
      const s = scopeIncomeData(inc, accountsOf(o.ownerId));
      cash += s.cash.length; corp += s.corporate.length; net += s.totalCash ?? 0;
    }
    ok("every dividend is in exactly one owner's book", cash === inc.cash.length, `${cash} of ${inc.cash.length}`);
    ok("every corporate action is in exactly one owner's book", corp === inc.corporate.length, `${corp} of ${inc.corporate.length}`);
    ok("the cash dividends partition", paise(net) === paise(inc.totalCash ?? 0));
  }
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log("\nmember scope: all checks passed");
