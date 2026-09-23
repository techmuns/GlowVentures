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
} from "@/data/glowData";
import {
  capitalRollup, capitalMovesWithCalls, capitalReturn, capitalXirr, capitalTotals, type CapitalGroup,
} from "@/lib/tranches";
import type { Account, CapitalMove, Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, a: number | null | undefined, b: number | null | undefined, tol = 0.01) =>
  ok(name, a != null && b != null && Math.abs(a - b) <= tol, `${a} vs ${b}`);
const cr = (n: number | null | undefined) => (n == null ? "—" : `₹${(n / 1e7).toFixed(4)} Cr`);

const RECORD = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS);
const book = (opts: { windowed?: boolean } = {}, side: "all" | "in" | "out" = "all") =>
  capitalRollup(RECORD, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES, side, "recent", {
    commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION, ...opts,
  });
const G = book();
const byId = new Map(G.map((g) => [g.accountId, g]));

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

// ── 8. A FUND THAT PAID BACK AN UNDATED TOTAL AND IS STILL HELD ─────────────
console.log("\n── an undated payout ──");
{
  const neo = byId.get("neo-infra-income-opportunities-fund-9039920536");
  ok("Neo Infra is on the table through its dated calls", neo?.source === "calls");
  if (neo) {
    near("its redemption is the payout total its statement prints", neo.redemption, 4_948_221);
    ok("…carried as undated", neo.undatedOut === 4_948_221);
    ok("appreciation is struck", neo.appreciation != null);
    ok("…but its split is WITHHELD, not guessed", neo.realised === null && neo.unrealised === null && !!neo.realisedNote);
    ok("XIRR is withheld — an undated payout cannot be placed in time",
      !capitalReturn(neo, "xirr").shown && /undated/.test((capitalReturn(neo, "xirr") as { reason: string }).reason));
    ok("…and auto falls back to HPR, saying so", capitalReturn(neo, "auto").shown && capitalReturn(neo, "auto").tag === "HPR");
    near("committed is the fund's printed commitment", neo.committed, 50_000_000);
  }
}

// ── 9. DRAWDOWN FUNDS: calls are purchases, and never on top of a record ───
console.log("\n── capital calls as purchases ──");
{
  const recorded = new Set(BOOK_CAPITAL_MOVES.map((m) => m.accountId));
  const calls = RECORD.filter((m) => m.fromCall);
  ok("calls reach the table for funds with no capital record", calls.length > 0, `${calls.length} calls`);
  ok("…and never for an account that already publishes one", calls.every((m) => !recorded.has(m.accountId)));
  for (const c of BOOK_COMMITMENTS) {
    if (recorded.has(c.accountId) || !c.calls.length) continue;
    const g = byId.get(c.accountId);
    near(`${c.accountId}: purchase is the fund's dated calls`, g?.paidIn, c.calls.reduce((s, x) => s + x.amount, 0));
  }
  // The two Transition Venture trusts publish BOTH a record and a call — the
  // record wins and the ₹75 L is counted once.
  for (const id of ["transition-venture-capital-TVC262", "transition-venture-capital-TVC263"]) {
    near(`${id}: purchased once, not twice`, byId.get(id)?.paidIn, 7_500_000);
  }
  // AN UNVALUED FUND IS NOT WORTH ₹0.
  const unvalued = G.filter((g) => g.value === null);
  ok("a fund no statement values has NO value, rather than ₹0", unvalued.length > 0
    && unvalued.every((g) => g.appreciation === null && /valued by no statement/.test(g.appreciationReason ?? "")),
    unvalued.map((g) => g.accountId).join(", "));
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
  const acct = (o: Partial<Account> = {}) => ({
    accountId: "x", provider: "Fund", accountNo: "1", owner: "O", strategy: null,
    inceptionDate: "2025-01-01", asOf: "2026-06-30", engagement: "AIF", ...o,
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
  ok("…where the old 'net invested' would have divided by ₹40 L and read +50%", true,
    `(6 + 6 − 10) ÷ (10 − 6) = 50% against the honest 20%`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall capital-record checks passed");
process.exit(fails ? 1 : 0);
