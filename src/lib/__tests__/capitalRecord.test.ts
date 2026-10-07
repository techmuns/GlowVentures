// PURCHASE, REDEMPTION, APPRECIATION — AND THE RETURN ON THE FAMILY'S OWN MONEY.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   *"how can net invested be negative? … Appreciation is being carried into
//    net invested, so the principal is wrong and every return struck on it is
//    wrong with it … the returns that we are showing in transactions are also
//    wrong. Make sure that there are no calculation errors or logical errors."*
//
// Net invested was purchases less redemptions, and a redemption is principal
// PLUS appreciation. 3P was bought for ₹28.5 Cr and redeemed for ₹31.06 Cr, so
// it read −₹2.56 Cr and its return could not be struck; any account that had
// paid something back had its return inflated by the gain it had returned. The
// errors worth catching are all ones that produce a PLAUSIBLE number:
//
//   • a redemption subtracted from a purchase to make a "principal";
//   • a return divided by anything but money that went IN;
//   • an absent redemption, value or split summed in as ₹0;
//   • an XIRR over a window under a year printed as an annual rate;
//   • a figure struck over the whole record while a filter shows part of it;
//   • a drawdown fund's calls added on top of a capital record that already
//     carries the same payments.
//
// Anchored on the GENERATED book where the answer is a fact about it, and on
// constructed rows where the trap needs a shape this book does not contain.
import {
  BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_ACCOUNTS, BOOK_POSITIONS,
  BOOK_POSITION_TRANCHES, BOOK_CAPITAL_FROM_INCEPTION,
  BOOK_REVIEW_FLOWS, BOOK_REVIEW_SUPERSEDED,
} from "@/data/glowData";
import {
  capitalRollup, capitalMovesWithCalls, capitalReturn, capitalXirr, capitalTotals, type CapitalGroup,
} from "@/lib/tranches";
import type { Account, CapitalMove, Commitment, Position } from "@/lib/types";
import { privateScope } from "@/lib/privateMarket";
import { fundDatedRecords, pooledFundXirr } from "@/lib/fundReturns";
import { accountIndex } from "@/lib/accounts";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, a: number | null | undefined, b: number | null | undefined, tol = 0.01) =>
  ok(name, a != null && b != null && Math.abs(a - b) <= tol, `${a} vs ${b}`);
const cr = (n: number | null | undefined) => (n == null ? "—" : `₹${(n / 1e7).toFixed(4)} Cr`);

const RECORD = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_ACCOUNTS, BOOK_REVIEW_FLOWS);
const book = (opts: { windowed?: boolean } = {}, side: "all" | "in" | "out" = "all") =>
  capitalRollup(RECORD, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES, side, "recent", {
    commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION, ...opts,
  });
const G = book();
const byId = new Map(G.map((g) => [g.accountId, g]));
// THE ACCOUNTS THE FAMILY'S REVIEW DATES (Stage 10dh). Their statement record,
// calls and payouts describe the statement's holding, which the review's line
// replaced, so each is held to the review's own rows below and never to the
// statement's.
const REVIEWED = new Set(BOOK_REVIEW_FLOWS.map((f) => f.accountId));
const reviewSum = (id: string, kinds: readonly string[]) =>
  BOOK_REVIEW_FLOWS.filter((f) => f.accountId === id && kinds.includes(f.kind)).reduce((t, f) => t + (f.amount ?? 0), 0);

// ── 1. THE LOAD-BEARING GATE — a suite over no input claims nothing ────────
console.log("\n── the book's capital record ──");
ok("the book carries capital rows", G.length > 10, `${G.length} accounts`);
ok("…and some publish appreciation", G.some((g) => g.appreciation != null));
ok("…and some withhold it, with a reason", G.some((g) => g.appreciation == null && !!g.appreciationReason));

// ── 2. NOTHING IS CALLED "NET INVESTED" ANY MORE ───────────────────────────
ok("no capital row carries a net-invested figure", G.every((g) => !("net" in g)));
ok("…and no total does", !("net" in capitalTotals(G)));

// ── 3. THE IDENTITY, ON EVERY ROW THAT STATES ALL FOUR TERMS ───────────────
//     Purchase − Redemption + Appreciation = Value today, and
//     Realised + Unrealised = Appreciation.
console.log("\n── the identity ──");
const stated = G.filter((g) => g.appreciation != null);
ok("the identity has rows to hold on", stated.length >= 5, `${stated.length}`);
for (const g of stated) {
  near(`${g.accountId}: purchase − redemption + appreciation = value`, g.paidIn - (g.redemption ?? NaN) + g.appreciation!, g.value);
  if (g.realised != null && g.unrealised != null) {
    near(`${g.accountId}: realised + unrealised = appreciation`, g.realised + g.unrealised, g.appreciation);
  }
}

// ── 4. EVERY RETURN IS ON MONEY THAT WENT IN ───────────────────────────────
console.log("\n── returns ──");
for (const g of stated) {
  const hpr = capitalReturn(g, "absolute");
  ok(`${g.accountId}: HPR is appreciation ÷ purchase`,
    hpr.shown && Math.abs(hpr.pct - (g.appreciation! / g.paidIn) * 100) < 1e-9,
    hpr.shown ? `${hpr.pct.toFixed(4)}%` : hpr.reason);
}
ok("no return is shown where appreciation is withheld",
  G.filter((g) => g.appreciation == null).every((g) =>
    (["auto", "absolute", "cagr", "xirr", "ytd", "calendar"] as const).every((m) => !capitalReturn(g, m).shown)));

// ── 5. 3P — THE CLIENT'S OWN EXAMPLE ───────────────────────────────────────
console.log("\n── 3P, redeemed in full ──");
{
  const g = byId.get("3p-investment-managers-3000048");
  ok("3P is on the table", !!g);
  if (g) {
    near("purchase is what was paid, ₹28.5 Cr", g.paidIn, 285_000_000);
    near("redemption is the statement's Full Units Redemption", g.redemption, 310_582_835.17);
    ok("THE OLD DEFECT: purchase less redemption is negative", g.paidIn - (g.redemption ?? 0) < 0,
      `${cr(g.paidIn - (g.redemption ?? 0))} — the figure the family were shown as 'net invested'`);
    near("appreciation is the redemption less the purchase", g.appreciation, 310_582_835.17 - 285_000_000);
    near("…all of it realised, because nothing is held", g.realised, g.appreciation);
    ok("…and unrealised is a computed zero", g.unrealised === 0);
    ok("the record reaches inception on the statement's own running balance",
      BOOK_CAPITAL_FROM_INCEPTION.includes(g.accountId) && g.incompleteReason === null);
    const hpr = capitalReturn(g, "absolute");
    ok("HPR is positive and struck on ₹28.5 Cr", hpr.shown && hpr.pct > 0 && Math.abs(hpr.pct - 8.9764) < 0.01,
      hpr.shown ? `${hpr.pct.toFixed(4)}%` : "absent");
    // TWO PATHS TO ONE RATE. The book's solver, against an independent
    // bisection written here over the same dated flows.
    const x = capitalXirr(g);
    const flows = (g.flows ?? []).map((f) => ({ t: Date.parse(f.date), a: f.amount }));
    const t0 = Math.min(...flows.map((f) => f.t));
    const npv = (r: number) => flows.reduce((s, f) => s + f.a / Math.pow(1 + r, (f.t - t0) / (365 * 864e5)), 0);
    let lo = -0.99, hi = 5;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; }
    near("XIRR agrees with an independent bisection", x, ((lo + hi) / 2) * 100, 1e-4);
    const auto = capitalReturn(g, "auto");
    ok("auto resolves to XIRR (several dated flows over more than a year)", auto.shown && auto.tag === "XIRR");
    ok("CAGR is refused, naming XIRR", !capitalReturn(g, "cagr").shown
      && /XIRR/.test((capitalReturn(g, "cagr") as { reason: string }).reason));
  }
}

// ── 6. A FUND NOTHING HAS COME BACK FROM ───────────────────────────────────
console.log("\n── nothing redeemed ──");
{
  const sanshi = G.filter((g) => g.accountId.startsWith("sanshi-fund-"));
  ok("the Sanshi folios are on the table", sanshi.length >= 4, `${sanshi.length}`);
  for (const g of sanshi) {
    ok(`${g.accountId}: realised is a computed zero`, g.realised === 0 && g.redemption === 0);
    near(`${g.accountId}: unrealised is value less the WHOLE purchase`, g.unrealised, (g.value ?? NaN) - g.paidIn);
  }
}

// ── 6b. A DISTRIBUTION THE FUND REINVESTED ─────────────────────────────────
// Buoyant's allotment worth MORE than was paid is a gain distributed and put
// back into units. It is realised; the rest ties to the Holdings page's own
// unrealised P&L for the fund — a second path to one figure.
console.log("\n── a distribution reinvested ──");
{
  const withReinvest = G.filter((g) => {
    const ins = BOOK_CAPITAL_MOVES.filter((m) => m.accountId === g.accountId && m.direction === "in");
    return ins.some((m) => m.amount != null && m.invested != null && m.invested > m.amount);
  });
  ok("the book carries a reinvested distribution (LOAD-BEARING)", withReinvest.length > 0,
    withReinvest.map((g) => g.accountId).join(", "));
  for (const g of withReinvest) {
    const ins = BOOK_CAPITAL_MOVES.filter((m) => m.accountId === g.accountId && m.direction === "in");
    const reinvested = ins.reduce((s, m) => s + Math.max(0, (m.invested ?? 0) - (m.amount ?? 0)), 0);
    ok(`${g.accountId}: nothing else came back`, g.redemption === 0);
    near(`${g.accountId}: realised is the distribution reinvested`, g.realised, reinvested);
    const own = BOOK_POSITIONS.filter((p) => p.accountId === g.accountId);
    const holdingsUnrealised = own.reduce((s, p) => s + p.marketValue - (p.costBasis ?? NaN), 0);
    near(`${g.accountId}: unrealised = the holdings' own unrealised P&L`, g.unrealised, holdingsUnrealised);
    ok(`${g.accountId}: …and it is NOT value less the cash paid`, Math.abs((g.unrealised ?? NaN) - ((g.value ?? NaN) - g.paidIn)) > 1);
  }
}

// ── 7. A PMS MANDATE — the split ties to the Holdings page ─────────────────
console.log("\n── PMS mandates ──");
{
  const pms = G.filter((g) => BOOK_ACCOUNTS.find((a) => a.accountId === g.accountId)?.engagement === "PMS" && g.appreciation != null);
  ok("the book has PMS rows with a stated appreciation", pms.length >= 2, `${pms.length}`);
  for (const g of pms) {
    // The Holdings page's unrealised P&L for the mandate, by a second path.
    const own = BOOK_POSITIONS.filter((p) => p.accountId === g.accountId && !(p.quantity === 0 && p.marketValue === 0));
    const holdingsUnrealised = own.reduce((s, p) => s + p.marketValue - (p.costBasis ?? NaN), 0);
    near(`${g.accountId}: unrealised = the holdings' own unrealised P&L`, g.unrealised, holdingsUnrealised);
  }
}

// ── 8. A FUND THAT PAID BACK, DATED AND TYPED, AND IS STILL HELD ───────────
// Stage 10bw read Neo Infra's and Baring's payouts — every row dated and typed
// by the fund (income, principal, equalisation) and reconciled against the
// statement's own totals. They are redemptions on their dates now, which makes
// both the split and the XIRR strikable. Two independent witnesses:
//   · the fund's OWN typing, read straight off `Commitment.payouts` here;
//   · the Private Market page's `fundDatedRecords` / `pooledFundXirr`, a
//     separate module over the same statements — the two pages must agree.
console.log("\n── dated, typed payouts ──");
{
  const s = privateScope(BOOK_POSITIONS, BOOK_ACCOUNTS);
  const recs = fundDatedRecords(s.dedupedRows, BOOK_COMMITMENTS, BOOK_REVIEW_FLOWS, accountIndex(BOOK_ACCOUNTS), String, String);
  const allWithPayouts = BOOK_COMMITMENTS.filter((c) => c.payouts != null && c.payouts.length > 0);
  // A fund the family's review dates is held to the review's rows in §8a.
  const withPayouts = allWithPayouts.filter((c) => !REVIEWED.has(c.accountId));
  const recorded = new Set(BOOK_CAPITAL_MOVES.map((m) => m.accountId));
  if (withPayouts.some((c) => !recorded.has(c.accountId))) {
    ok("the book carries a fund with dated payouts and no capital record (LOAD-BEARING)", true,
      withPayouts.filter((c) => !recorded.has(c.accountId)).map((c) => c.accountId).join(", "));
  } else {
    // EVIDENCED, NEVER SILENT: such a fund still exists — Baring — and the
    // family's review dates it since Stage 10dh. §8c holds the statement rule
    // on a constructed fund, so the path is still checked.
    const taken = allWithPayouts.filter((c) => !recorded.has(c.accountId) && REVIEWED.has(c.accountId));
    ok("every fund with dated payouts and no capital record is dated by the family's review now", taken.length > 0,
      taken.map((c) => c.accountId).join(", "));
    console.log("NOT CHECKED a statement-dated fund with dated payouts and no capital record, on this book: the review dates the only one since Stage 10dh — §8c holds the rule on a constructed fund");
  }
  // …AND ONE WITH A CAPITAL RECORD OF ITS OWN. Since Stage 10ca Neo Infra's unit
  // record is in `BOOK_CAPITAL_MOVES` (FIFO needs it), and "one record per
  // account" then dropped every payout it published. Both kinds are held to the
  // same checks below, so the record cannot quietly lose the income again.
  ok("…and one whose own unit record is a capital record, which keeps its payouts (LOAD-BEARING)",
    withPayouts.some((c) => recorded.has(c.accountId)), withPayouts.map((c) => c.accountId).join(", "));
  for (const c of withPayouts) {
    const g = byId.get(c.accountId);
    const asOf = BOOK_ACCOUNTS.find((x) => x.accountId === c.accountId)?.asOf ?? "";
    const before = (c.payouts ?? []).filter((r) => r.date <= asOf);
    const byKind = (k: string) => before.filter((r) => r.kind === k).reduce((t, r) => t + r.gross, 0);
    ok(`${c.accountId}: on the table, no undated total`, !!g && g.undatedOut === null);
    if (!g) continue;
    near(`${c.accountId}: redemption is every payout dated on or before the valuation`, g.redemption,
      before.reduce((t, r) => t + r.gross, 0));
    const after = (c.payouts ?? []).filter((r) => r.date > asOf);
    ok(`${c.accountId}: a payout dated after the valuation is inside the value and is not counted again`,
      after.every((r) => !RECORD.some((m) => m.accountId === c.accountId && m.date === r.date && m.payoutKind === r.kind)),
      `${after.length} after`);
    near(`${c.accountId}: realised is the income and equalisation the fund typed`, g.realised,
      byKind("income") + byKind("equalisation"));
    near(`${c.accountId}: unrealised is value less the purchase net of principal returned`, g.unrealised,
      (g.value ?? NaN) - (g.paidIn - byKind("capital")));
    // THE SECOND PATH: the Private Market page's own money-weighted rate for
    // the fund this account holds.
    const key = BOOK_POSITIONS.find((p) => p.accountId === c.accountId)?.securityKey;
    const rec = key ? recs.get(key) : undefined;
    const theirs = rec ? pooledFundXirr([rec])?.annualPct ?? null : null;
    const ours = capitalReturn(g, "xirr");
    ok(`${c.accountId}: XIRR is struck`, ours.shown && ours.tag === "XIRR");
    near(`${c.accountId}: XIRR agrees with the Private Market page's, by its own module`,
      ours.shown ? (ours as { pct: number }).pct : null, theirs, 0.01);
  }
  const neo = byId.get("neo-infra-income-opportunities-fund-9039920536");
  ok("Neo Infra returned principal, so its unrealised is struck on the purchase less that principal, not on the whole call",
    !!neo && neo.unrealised != null && Math.abs(neo.unrealised - ((neo.value ?? 0) - 50_000_000)) > 1_000_000,
    neo ? `${cr(neo.unrealised)} vs ${cr((neo.value ?? 0) - 50_000_000)}` : "missing");
  // …WHICH IS NOW THE HOLDINGS PAGE'S OWN FIGURE. Before Stage 10ca the Holdings
  // page printed the statement's cost — the whole ₹5 Cr called — so the two
  // read ₹14.16 L apart. FIFO carries the cost of the units still held, which
  // is the purchase less the principal redeemed, so the two pages now agree by
  // a second path: the book's own positions, not this module.
  const neoHeld = BOOK_POSITIONS.filter((p) => p.accountId === neo?.accountId && !(p.quantity === 0 && p.marketValue === 0));
  near("…which is the Holdings page's unrealised P&L now that FIFO carries the cost of the units held", neo?.unrealised,
    neoHeld.reduce((t, p) => t + p.marketValue - (p.costBasis ?? NaN), 0));
  ok("…and its income and equalisation are realised on the card, as the fund typed them", !!neo && neo.realised != null && neo.realised > 0,
    neo ? cr(neo.realised) : "missing");
  near("committed is the fund's printed commitment", neo?.committed, 50_000_000);
}

// ── 8a. THE REVIEW'S DATED PAYOUTS ─────────────────────────────────────────
// Since Stage 10dh the family's consolidated review dates every purchase, sale
// and income row behind its private-market lines (`BOOK_REVIEW_FLOWS`), and an
// account carrying any of them is dated by the review alone. A sale returns
// capital and Div / Int is gain paid out — the review's own words — so the
// split is struck on its rows. Two witnesses again: the review's rows, read
// straight off the book here, and the Private Market page's own module on the
// same account's line alone.
console.log("\n── the review's dated payouts ──");
{
  const s = privateScope(BOOK_POSITIONS, BOOK_ACCOUNTS);
  const idx = accountIndex(BOOK_ACCOUNTS);
  const ids = [...new Set(BOOK_REVIEW_FLOWS.filter((f) => f.kind !== "purchase").map((f) => f.accountId))];
  ok("the review dates payouts for some accounts (LOAD-BEARING)", ids.length > 0, ids.join(", "));
  for (const id of ids) {
    const keys = [...new Set(BOOK_REVIEW_FLOWS.filter((f) => f.accountId === id).map((f) => f.securityKey))];
    const g = G.find((x) => x.accountId === id && (x.securityKey == null || keys.includes(x.securityKey)));
    ok(`${id}: on the table, dated by the review alone`, !!g && g.source === "review"
      && RECORD.filter((m) => m.accountId === id).every((m) => m.fromReview));
    if (!g) continue;
    near(`${id}: purchase is the review's dated purchases`, g.paidIn, reviewSum(id, ["purchase"]));
    near(`${id}: redemption is the review's sales and Div / Int`, g.redemption, reviewSum(id, ["sale", "income"]));
    near(`${id}: realised is the Div / Int the review prints`, g.realised, reviewSum(id, ["income"]));
    near(`${id}: unrealised is value less the purchase net of sale proceeds`, g.unrealised,
      (g.value ?? NaN) - (g.paidIn - reviewSum(id, ["sale"])));
    const statementPayouts = BOOK_COMMITMENTS.find((c) => c.accountId === id)?.payouts ?? [];
    ok(`${id}: no payout its statement prints is counted beside the review's`,
      statementPayouts.every((r) => !RECORD.some((m) => m.accountId === id && !m.fromReview && m.date === r.date)),
      `${statementPayouts.length} statement payout(s)`);
    // THE SECOND PATH, on this account's own line: a fund several accounts hold
    // pools them on the Private Market page, so only this account's rows go in.
    const rows = s.dedupedRows.filter((p) => p.accountId === id && keys.includes(p.securityKey));
    const rec = rows.length ? fundDatedRecords(rows, BOOK_COMMITMENTS, BOOK_REVIEW_FLOWS, idx, String, String).get(rows[0].securityKey) : undefined;
    const theirs = rec ? pooledFundXirr([rec])?.annualPct ?? null : null;
    const ours = capitalReturn(g, "xirr");
    if (ours.shown && ours.tag === "XIRR") {
      near(`${id}: XIRR agrees with the Private Market page's, by its own module`, (ours as { pct: number }).pct, theirs, 0.01);
    } else {
      ok(`${id}: XIRR is not annualised under a year, and says so`, ours.shown && ours.tag === "HPR",
        ours.shown ? ours.tag : (ours as { reason: string }).reason);
    }
  }
}

// ── 8b. …AND ONE WHOSE STATEMENT PRINTS ONLY AN UNDATED TOTAL ──────────────
// No fund in this book since Stage 10bw, so a constructed one: a payout that
// cannot be placed in time refuses the XIRR, and one that is not typed refuses
// the split rather than guessing it.
console.log("\n── an undated payout (constructed) ──");
{
  const acc = [{ accountId: "u", provider: "Fund", accountNo: "1", owner: "O", strategy: null,
    inceptionDate: "2024-01-01", asOf: "2026-06-30", engagement: "AIF" }];
  const commitment = { accountId: "u", name: "Fund", total: 10_000_000, contributed: 10_000_000,
    called: 10_000_000, paid: 10_000_000, pending: null, undrawn: 0, distributed: 500_000,
    calls: [{ date: "2024-01-01", amount: 10_000_000, label: "Call 1" }], payouts: null } as unknown as Commitment;
  const moves = capitalMovesWithCalls([], [commitment], acc, []);
  ok("no payout row is invented from an undated total", !moves.some((m) => m.direction === "out"));
  const u = capitalRollup(moves, acc, [{ accountId: "u", securityKey: "f", security: "Fund", assetClass: "AIF",
    quantity: 1, marketValue: 11_000_000, costBasis: 10_000_000 } as Position], {}, "all", "recent",
    { commitments: [commitment] })[0];
  ok("the undated total is carried as undated", u?.undatedOut === 500_000);
  ok("…its split is WITHHELD, not guessed", !!u && u.realised === null && u.unrealised === null && !!u.realisedNote);
  ok("…and XIRR is withheld — an undated payout cannot be placed in time",
    !!u && !capitalReturn(u, "xirr").shown && /undated/.test((capitalReturn(u, "xirr") as { reason: string }).reason));
}

// ── 8c. DATED PAYOUTS AND NO CAPITAL RECORD (constructed) ──────────────────
// The statement rule §8 held on Baring until the family's review took it over
// (Stage 10dh): a drawdown fund's calls are its purchases, every payout dated on
// or before the valuation is a redemption on its date, one after it is inside
// the value, and the fund's own typing is the split.
console.log("\n── dated payouts and no capital record (constructed) ──");
{
  const acc = [{ accountId: "d", provider: "Fund", accountNo: "2", owner: "O", strategy: null,
    inceptionDate: "2024-01-01", asOf: "2026-03-31", engagement: "AIF" }];
  const commitment = { accountId: "d", name: "Fund", total: 20_000_000, contributed: 20_000_000,
    called: 20_000_000, paid: 20_000_000, pending: null, undrawn: 0, distributed: null,
    calls: [{ date: "2024-01-01", amount: 10_000_000, label: "Call 1" }, { date: "2025-01-01", amount: 10_000_000, label: "Call 2" }],
    payouts: [
      { date: "2025-06-30", kind: "income", label: "Income", gross: 300_000, tds: 30_000, net: 270_000, inPrintedTotal: true },
      { date: "2025-09-30", kind: "capital", label: "Principal", gross: 1_000_000, tds: 0, net: 1_000_000, inPrintedTotal: true },
      { date: "2025-12-31", kind: "equalisation", label: "Equalisation", gross: 50_000, tds: 0, net: 50_000, inPrintedTotal: true },
      { date: "2026-05-31", kind: "income", label: "After the valuation", gross: 99_000, tds: 0, net: 99_000, inPrintedTotal: true },
    ] } as unknown as Commitment;
  const moves = capitalMovesWithCalls([], [commitment], acc, []);
  const d = capitalRollup(moves, acc, [{ accountId: "d", securityKey: "f2", security: "Fund", assetClass: "AIF",
    quantity: 1, marketValue: 22_000_000, costBasis: 19_000_000 } as Position], {}, "all", "recent", { commitments: [commitment] })[0];
  near("its calls are its purchases", d?.paidIn, 20_000_000);
  near("redemption is every payout dated on or before the valuation", d?.redemption, 1_350_000);
  ok("…and a payout dated after it is inside the value and is not counted again", !moves.some((m) => m.date === "2026-05-31"));
  near("realised is the income and equalisation the fund typed", d?.realised, 350_000);
  near("unrealised is value less the purchase net of principal returned", d?.unrealised, 22_000_000 - (20_000_000 - 1_000_000));
  const x = d ? capitalReturn(d, "xirr") : null;
  ok("XIRR is struck over the calls, the payouts and the value", !!x && x.shown && x.tag === "XIRR",
    x && x.shown ? `${x.pct.toFixed(3)}%` : "absent");
}

// ── 9. DRAWDOWN FUNDS: calls are purchases, and never on top of a record ───
console.log("\n── capital calls as purchases ──");
{
  const recorded = new Set(BOOK_CAPITAL_MOVES.map((m) => m.accountId));
  const calls = RECORD.filter((m) => m.fromCall);
  ok("calls reach the table for funds with no capital record", calls.length > 0, `${calls.length} calls`);
  ok("…and never for an account that already publishes one", calls.every((m) => !recorded.has(m.accountId)));
  ok("…nor for an account the family's review dates", calls.every((m) => !REVIEWED.has(m.accountId)));
  for (const c of BOOK_COMMITMENTS) {
    if (recorded.has(c.accountId) || !c.calls.length) continue;
    const g = byId.get(c.accountId);
    if (REVIEWED.has(c.accountId)) {
      // The review's dated purchases, which can differ from the statement's
      // calls (Sky Capital SKY003: ₹1.715 Cr against ₹1.7285 Cr) — the review
      // is the family's source for this line.
      near(`${c.accountId}: purchase is the review's dated purchases, not its statement's calls`, g?.paidIn,
        reviewSum(c.accountId, ["purchase"]));
      continue;
    }
    near(`${c.accountId}: purchase is the fund's dated calls`, g?.paidIn, c.calls.reduce((s, x) => s + x.amount, 0));
  }
  // The two Transition Venture trusts publish a record and a call, and the
  // family's review dates each trust's line since Stage 10dh — the ₹75 L is
  // counted once.
  for (const id of ["transition-venture-capital-TVC262", "transition-venture-capital-TVC263"]) {
    near(`${id}: purchased once, not twice`, byId.get(id)?.paidIn, 7_500_000);
  }
  // AN UNVALUED FUND IS NOT WORTH ₹0.
  const unvalued = G.filter((g) => g.value === null);
  if (unvalued.length) {
    ok("a fund no statement values has NO value, rather than ₹0",
      unvalued.every((g) => g.appreciation === null && /valued by no statement/.test(g.appreciationReason ?? "")),
      unvalued.map((g) => g.accountId).join(", "));
  } else {
    // EVIDENCED: the folios no statement valued (India SME, Sky Capital) are
    // the review's lines since Stage 10dh, each with the review's value or its
    // cost. The rule is held on a constructed fund below.
    const took = new Set(BOOK_REVIEW_SUPERSEDED.filter((x) => x.kind === "unvalued").map((x) => x.accountId));
    const taken = G.filter((g) => took.has(g.accountId));
    ok("every capital account a statement left unvalued carries the review's value or cost now", taken.length > 0
      && taken.every((g) => g.value != null && g.source === "review"), taken.map((g) => g.accountId).join(", "));
    const acc = [{ accountId: "v", provider: "Fund", accountNo: "3", owner: "O", strategy: null,
      inceptionDate: "2024-01-01", asOf: "2026-03-31", engagement: "AIF",
      noPositionsReason: "this fund publishes no NAV: its statement carries 1 holding(s) with units and the capital drawn against a commitment, and no valuation" }];
    const commitment = { accountId: "v", name: "Fund", total: 10_000_000, contributed: 10_000_000,
      called: 10_000_000, paid: 10_000_000, pending: null, undrawn: 0, distributed: null,
      calls: [{ date: "2024-01-01", amount: 10_000_000, label: "Call 1" }], payouts: null } as unknown as Commitment;
    const v = capitalRollup(capitalMovesWithCalls([], [commitment], acc, []), acc, [], {}, "all", "recent", { commitments: [commitment] })[0];
    ok("a fund no statement values has NO value, rather than ₹0 (constructed)", !!v && v.value === null
      && v.appreciation === null && /valued by no statement/.test(v.appreciationReason ?? ""), v?.appreciationReason ?? "missing");
    console.log("NOT CHECKED an unvalued capital account on this book: the family's review values every one a statement left unvalued since Stage 10dh — the constructed fund above holds the rule");
  }
  // A DRAWDOWN FUND THAT PRINTS NO DISTRIBUTION LINE has no stated redemption.
  const noDist = G.filter((g) => g.source === "calls" && g.redemption === null && g.value != null);
  ok("a fund printing no distribution line states no redemption — never ₹0", noDist.length > 0
    && noDist.every((g) => g.appreciation === null), noDist.map((g) => g.accountId).join(", "));
  ok("…but still shows its unrealised mark against the statement's own cost",
    noDist.every((g) => g.unrealised != null));
}

// ── 10. A FILTER NARROWS THE MOVEMENTS AND WITHHOLDS THE WHOLE-RECORD FIGURES
console.log("\n── filters ──");
{
  const w = book({ windowed: true });
  ok("under a date filter, no row states appreciation", w.every((g) => g.appreciation === null && g.realised === null));
  ok("…and no row states a return", w.every((g) => !capitalReturn(g, "auto").shown));
  const s = book({}, "in");
  ok("under a side filter, likewise", s.every((g) => g.appreciation === null && g.redemption === null));
}

// ── 11. THE ANNUALISATION GUARD, ON CONSTRUCTED ROWS ───────────────────────
console.log("\n── the guard ──");
{
  // `capitalRecordTo` because a capital RECORD must reach the date its value is
  // struck on before it carries a return (Stage 10cf, `recordShortfall`).
  const acct = (o: Partial<Account> = {}) => ({
    accountId: "x", provider: "Fund", accountNo: "1", owner: "O", strategy: null,
    inceptionDate: "2025-01-01", asOf: "2026-06-30", capitalRecordTo: "2026-06-30", engagement: "AIF", ...o,
  });
  const mv = (o: Partial<CapitalMove>): CapitalMove => ({
    accountId: "x", date: "2025-01-01", direction: "in", label: "Subscription",
    amount: 10_000_000, invested: 10_000_000, units: null, security: null, securityKey: null, ...o,
  });
  const p = (v: number): Position => ({ accountId: "x", securityKey: "f", security: "Fund", assetClass: "AIF",
    quantity: 1, marketValue: v, costBasis: 10_000_000 } as Position);
  const one = (from: string, v: number): CapitalGroup =>
    capitalRollup([mv({ date: from })], [acct({ inceptionDate: from })], [p(v)], {}, "all", "recent")[0];

  const long = one("2024-06-30", 12_100_000);         // two years, +21%
  const cagr = capitalReturn(long, "cagr");
  ok("a single purchase held two years compounds", cagr.shown && cagr.tag === "CAGR" && Math.abs(cagr.pct - 10) < 0.02,
    cagr.shown ? `${cagr.pct.toFixed(3)}%` : "absent");
  ok("…and auto picks CAGR for it", capitalReturn(long, "auto").tag === "CAGR");
  const short = one("2026-03-01", 12_000_000);        // four months, +20%
  for (const m of ["cagr", "xirr", "auto"] as const) {
    const r = capitalReturn(short, m);
    ok(`a four-month window is never annualised (${m})`, r.shown && r.tag === "HPR" && Math.abs(r.pct - 20) < 1e-9,
      r.shown ? `${r.tag} ${r.pct.toFixed(2)}%` : "absent");
  }
  // A REDEMPTION WITH A GAIN IN IT, partially: the denominator stays the purchase.
  const partial = capitalRollup(
    [mv({ date: "2024-06-30", amount: 10_000_000 }), mv({ date: "2025-06-30", direction: "out", amount: 6_000_000, invested: null })],
    [acct({ inceptionDate: "2024-06-30", engagement: "PMS" })],
    [p(6_000_000)], {}, "all", "recent")[0];
  near("appreciation counts what came back and what is held", partial.appreciation, 2_000_000);
  near("HPR divides by the purchase, not by purchase less redemption",
    capitalReturn(partial, "absolute").shown ? (capitalReturn(partial, "absolute") as { pct: number }).pct : null, 20);
  const onNet = partial.appreciation != null ? (partial.appreciation / (partial.paidIn - (partial.redemption ?? 0))) * 100 : null;
  near("…where the old 'net invested' would have divided by ₹40 L and read +50%", onNet, 50);
  ok("…and the two are not the same figure", onNet != null && capitalReturn(partial, "absolute").shown
    && Math.abs(onNet - (capitalReturn(partial, "absolute") as { pct: number }).pct) > 1);
}

console.log(fails ? `\n${fails} FAILED` : "\nall capital-record checks passed");
process.exit(fails ? 1 : 0);
