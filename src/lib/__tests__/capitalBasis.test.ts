// THE CAPITAL BEHIND AN INVESTMENT, CHECKED AGAINST THE GENERATED BOOK.
//   npm run test:family
//
// ── WHY NONE OF THIS COULD BE SEEN ON A PAGE ────────────────────────────────
//
// Every return this dashboard printed was a real division of two real figures —
// an unrealised gain over the cost of the units held — and every one of them
// was on the wrong basis for an investment. Ajay's Buoyant folio read +3.71%
// and Buoyant's own fact sheet, for the same account on the same day, prints a
// money-weighted 15.30%. No value check can see that: the page ties to its own
// columns perfectly, it simply answers a different question.
//
// ── SO THE ANCHORS ARE OUTSIDE THE CODE UNDER TEST ──────────────────────────
//
//   1. THE MANAGER'S OWN PRINTED IRR. An XIRR over the dated deposits this book
//      now reads must reproduce the "Performance(IRR)" the fact sheet PRINTS,
//      read out of the committed `pages.json` — to the two decimals printed.
//      That is a primary source standing as witness for the flows AND the
//      solver at once.
//   2. TWO PATHS TO ONE NET CAPITAL. Where an account has a dated record AND a
//      since-inception statement, the deposits (one table, one reader) and the
//      Net Capital In the appraisal prints (another document, another reader)
//      must agree to within the one printed residual that is named below.
//   3. THE DEFECT, AS AN INEQUALITY. On the accounts that realised something the
//      return on capital must differ from the return on cost — in BOTH
//      directions — or a suite asserting the new basis would pass just as
//      happily against the old one. Buoyant's cost is carried through its class
//      switch since Stage 10bv, so there it is an EQUALITY instead, to the paisa,
//      up to the one distribution the fund reinvested.
import fs from "node:fs";
import path from "node:path";
import {
  BOOK_ACCOUNTS, BOOK_ACCOUNT_BRIDGES, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS,
  BOOK_POSITIONS, BOOK_POSITION_TRANCHES,
} from "@/data/glowData";
import { accountCapital, buildCapitalModel, describeCapital } from "@/lib/capital";
import { currentHoldings, dedupedPositions, measuredReturn, onCapitalBasis, type ReturnInput } from "@/lib/analytics";
import { GROUP_AXES, groupKeyFor } from "@/lib/groupAxis";
import { privateScope, fundRollup } from "@/lib/privateMarket";
import { fundDatedRecords, fundMeasuredReturn } from "@/lib/fundReturns";
import { accountIndex } from "@/lib/accounts";
import type { Position } from "@/lib/types";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
const cr = (v: number | null | undefined) => (v == null ? "—" : `₹${(v / 1e7).toFixed(2)} Cr`);

const universe = currentHoldings(BOOK_POSITIONS);
const book = {
  accounts: BOOK_ACCOUNTS, capitalMoves: BOOK_CAPITAL_MOVES, bridges: BOOK_ACCOUNT_BRIDGES,
  commitments: BOOK_COMMITMENTS, tranches: BOOK_POSITION_TRANCHES, positions: universe,
};
const model = buildCapitalModel(book);
const own = (id: string) => universe.filter((p) => p.accountId === id);
const AJAY = "buoyant-capital-103473";
const ANKITA = "buoyant-capital-103472";

// ── 1. The manager's own printed IRR ────────────────────────────────────────
{
  const AUDIT = path.join(process.cwd(), "public", "audit");
  const printedIrr = (accountId: string): number | null => {
    const acct = accountId.split("-").at(-1);
    const p = path.join(AUDIT, `buoyant-capital-${acct}-2026-07-31-fact-sheet`, "pages.json");
    if (!fs.existsSync(p)) return null;
    const text = (JSON.parse(fs.readFileSync(p, "utf8")).pages as { text: string }[]).map((x) => x.text).join("\n");
    const m = /Performance\(IRR\)[\s\S]*?Portfolio\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(text);
    return m ? Number(m[4]) : null;
  };
  for (const id of [AJAY, ANKITA]) {
    const b = model.behind(own(id));
    const printed = printedIrr(id);
    ok(`${id}: the fact sheet prints an IRR to check against`, printed !== null);
    ok(`${id}: is measured on its dated record`,
      b.onCapital.length === 1 && b.onCapital[0].capital.source === "dated-record",
      JSON.stringify(b.onCapital.map((x) => x.capital.source)));
    ok(`${id}: the window is over a year, so the rate is annual`, !!b.xirr?.annualised, JSON.stringify(b.xirr));
    ok(`${id}: XIRR over the deposits reproduces the IRR the manager prints`,
      printed !== null && b.xirr?.pct != null && Math.abs(Math.round(b.xirr.pct * 100) / 100 - printed) < 0.005,
      `solved ${b.xirr?.pct?.toFixed(4)} against printed ${printed}`);
  }
}

// ── 2. Two paths to one net capital ─────────────────────────────────────────
//
// SUMMED TO EACH STATEMENT'S OWN DATE. A first draft compared the dated net as
// of the account's as-of with an appraisal struck two weeks later, and failed
// Green Lantern 510861 by ₹11,930 for a reason that was the test's, not the
// book's. Summed to the right date, it found the real one: that account's
// dated record comes from a QUARTERLY report ending 30 Jun, so it had not seen
// the withdrawals between then and 27 Jul. That is what `capitalRecordTo`
// exists to catch, and this section is what proves it catches something.
{
  let agreed = 0, stoppedShort = 0;
  for (const a of BOOK_ACCOUNTS) {
    const moves = BOOK_CAPITAL_MOVES.filter((m) => m.accountId === a.accountId);
    if (!moves.length) continue;
    const stated = (BOOK_ACCOUNT_BRIDGES[a.accountId] ?? []).filter((b) => b.basis === "since-inception");
    for (const s of stated) {
      const printed = typeof s.netCapitalInOut === "number" ? s.netCapitalInOut
        : typeof s.contribution === "number" ? s.contribution - (s.withdrawal ?? 0) : null;
      if (printed === null) continue;
      const dated = moves.filter((m) => m.date <= s.periodTo)
        .reduce((t, m) => t + (m.amount ?? 0) * (m.direction === "in" ? 1 : -1), 0);
      const residual = dated - printed;
      if (a.capitalRecordTo && a.capitalRecordTo >= s.periodTo) {
        agreed += 1;
        // The ONE printed residual in this corpus: Ankita's 1 Feb 2025 switch
        // left Class A1 at ₹2,09,10,446.38 and entered A4 at ₹2,09,10,446.32,
        // and the appraisal books those 6 paise as capital out.
        ok(`${a.accountId} on ${s.periodTo}: the dated deposits and the printed ${s.reportType} agree`,
          Math.abs(residual) <= 1, `residual ${residual.toFixed(2)}`);
      } else {
        stoppedShort += 1;
        ok(`${a.accountId} on ${s.periodTo}: a record that stops on ${a.capitalRecordTo} is not the capital`,
          model.of(a.accountId)?.source !== "dated-record", JSON.stringify(model.of(a.accountId)?.source));
      }
    }
  }
  ok("two paths agree on more than one account", agreed >= 2, String(agreed));
  // LOAD-BEARING: the reach rule must have something to refuse on this book, or
  // a gate that stopped checking would pass unnoticed.
  ok("and the reach rule refuses at least one record that stops short", stoppedShort >= 1, String(stoppedShort));
  const gl = model.of("green-lantern-capital-llp-510861");
  ok("Green Lantern 510861 is measured on the statement struck on its own date", gl?.source === "statement"
    && Math.abs((gl?.net ?? 0) - (100000000 - 109251)) <= 1, JSON.stringify(gl));

  // …and where two statements BOTH state it on the account's own date, they agree.
  for (const a of BOOK_ACCOUNTS) {
    const on = (BOOK_ACCOUNT_BRIDGES[a.accountId] ?? []).filter((b) => b.basis === "since-inception" && b.periodTo === a.asOf);
    const nets = on.map((b) => (typeof b.netCapitalInOut === "number" ? b.netCapitalInOut
      : typeof b.contribution === "number" ? b.contribution - (b.withdrawal ?? 0) : null)).filter((v): v is number => v !== null);
    if (nets.length < 2) continue;
    ok(`${a.accountId}: the fact sheet and the appraisal state one capital`, nets.every((n) => Math.abs(n - nets[0]) <= 1),
      nets.join(" vs "));
  }
}

// ── 3. The defect, as an inequality, in both directions ─────────────────────
{
  const onCost = (id: string) => {
    const ps = own(id).filter((p) => p.costBasis != null && !p.costUnavailable);
    const cost = ps.reduce((t, p) => t + (p.costBasis as number), 0);
    const mv = ps.reduce((t, p) => t + p.marketValue, 0);
    return cost > 0 ? ((mv - cost) / cost) * 100 : null;
  };
  const cases = [
    // The three largest gaps either way. Buoyant is NOT among them any more, and
    // that is Stage 10bv rather than a weaker test: its cost is now CARRIED
    // through the class switch, so on this account the cost and the capital are
    // two paths to one figure — asserted as such below.
    { id: "v-e-c-assago-capital-management-llp-128004", dir: "up" as const, min: 15 },
    { id: "molecule-ventures-llp-7810404", dir: "up" as const, min: 4 },
    { id: "carnelian-asset-management-and-advisors-pvt-ltd-3517383", dir: "down" as const, min: 3 },
  ];
  for (const c of cases) {
    const b = model.behind(own(c.id));
    const was = onCost(c.id);
    const now = b.returnPct;
    const gap = now !== null && was !== null ? now - was : null;
    ok(`${c.id}: the return on capital ${c.dir === "up" ? "exceeds" : "falls below"} the return on cost by > ${c.min} pp`,
      gap !== null && (c.dir === "up" ? gap > c.min : gap < -c.min),
      `on cost ${was?.toFixed(2)}% · on capital ${now?.toFixed(2)}%`);
  }
  // And Ajay's own figure, exactly: ₹49,29,81,982.01 against ₹46,00,00,000.
  const a = model.behind(own(AJAY));
  ok("Ajay's Buoyant: invested is the ₹46 Cr he paid in, not the ₹47.54 Cr the statement's cost column prints",
    a.invested === 460000000, cr(a.invested));
  ok("Ajay's Buoyant: +7.17% on capital", a.returnPct !== null && Math.abs(a.returnPct - 7.1700) < 0.01, String(a.returnPct));

  // TWO PATHS TO BUOYANT'S MONEY, AND THEY MUST AGREE TO THE PAISA. Stage 10bv
  // carries each dated contribution through the class switch in `build-book`
  // (`scripts/lib/classSwitch.mjs`) and sets the units' cost to what bought
  // them; this module reads the same deposits as the capital put in. They differ
  // by exactly one printed figure and it is not a discrepancy: the ₹58,861.66
  // Gain Distr. the fund paid on 1 Apr 2026 and reinvested in that day's
  // allotment. It BOUGHT units, so it is cost — the family's own review carries
  // Buoyant at ₹70,85,58,861.66 for that reason — and it never left the family's
  // bank, so it is not capital: it is part of the return. So carried cost =
  // capital + reinvested, account by account, and a change to either path that
  // moved a rupee fails here by name.
  let tied = 0, withReinvestment = 0;
  for (const id of [...new Set(universe.filter((p) => p.costBasisSource === "carried-through-switch").map((p) => p.accountId))]) {
    const cap = model.of(id);
    const carried = own(id).filter((p) => p.costBasisSource === "carried-through-switch")
      .reduce((t, p) => t + (p.costBasis ?? 0), 0);
    const reinvested = BOOK_CAPITAL_MOVES.filter((m) => m.accountId === id && m.direction === "in")
      .reduce((t, m) => t + ((m.invested ?? m.amount ?? 0) - (m.amount ?? 0)), 0);
    if (reinvested > 0) withReinvestment += 1;
    const ties = cap?.source === "dated-record" && Math.abs(cap.net + reinvested - carried) <= 1;
    if (ties) tied += 1;
    ok(`${id}: the capital put in and the cost carried through the switch differ by exactly the reinvested distribution`,
      ties, `capital ${cap?.net} + reinvested ${reinvested.toFixed(2)} vs carried ${carried}`);
  }
  ok("...on both of Buoyant's folios", tied >= 2, String(tied));
  // LOAD-BEARING: the reinvestment is what makes the two paths DIFFERENT, so at
  // least one account must carry one, or the equality above could not tell the
  // capital from the cost.
  ok("...and on at least one of them the reinvested distribution is not zero", withReinvestment >= 1, String(withReinvestment));
}

// ── 4. The whole-account rule ───────────────────────────────────────────────
{
  const mandate = "carnelian-asset-management-and-advisors-pvt-ltd-3517383";
  const whole = model.behind(own(mandate));
  ok("a whole mandate is measured on its capital", whole.onCapital.length === 1 && whole.onCost.count === 0,
    JSON.stringify({ onCapital: whole.onCapital.length, onCost: whole.onCost }));

  // One share out of that mandate is a HOLDING, and keeps its own return on cost.
  const share = own(mandate).find((p) => p.assetClass === "Equity" && p.costBasis != null)!;
  const one = model.behind([share]);
  ok("a share inside a mandate is not measured on the mandate's capital", one.onCapital.length === 0 && one.onCost.count === 1);
  ok("…and its return is exactly the position's own", one.returnPct !== null && share.returnPct !== null
    && Math.abs(one.returnPct - (share.returnPct as number)) < 0.01, `${one.returnPct} vs ${share.returnPct}`);

  // COUNTED ONCE. Transition Venture Fund I is one holding the two family
  // trusts both report. The consolidated set keeps one row, so exactly one
  // trust's capital may stand behind it — never both, and never a trust whose
  // row the set dropped, whose capital would then sit over no value at all.
  const tvc = dedupedPositions(universe).filter((p) => p.accountId.startsWith("transition-venture-capital"));
  const t = model.behind(tvc);
  ok("a holding reported twice is one capital in the consolidated set",
    tvc.length === 1 && t.onCapital.length === 1 && t.invested === t.onCapital[0].capital.net,
    JSON.stringify({ rows: tvc.length, onCapital: t.onCapital.map((x) => x.accountId), invested: t.invested }));

  // The whole book, two ways: the model over everything, and the per-account
  // figures summed by hand. They must be the same number.
  const all = model.behind(universe);
  let byHand = 0;
  for (const a of BOOK_ACCOUNTS) {
    const cap = model.of(a.accountId);
    if (cap && own(a.accountId).length) { byHand += cap.net; continue; }
    for (const p of own(a.accountId)) {
      if (p.costBasis != null && !p.costUnavailable && !(p.costBasis === 0 && p.marketValue > 0)) byHand += p.costBasis;
    }
  }
  ok("the book's invested is every account's capital, or its units' cost", all.invested !== null
    && Math.abs(all.invested - byHand) < 1, `${cr(all.invested)} vs ${cr(byHand)}`);
}

// ── 5. A fund's capital account, on its DATED calls and payouts ─────────────
//
// It used to be paid in less the PRINTED distribution total, and Neo Infra is
// the measurement that retired that: its statement is struck at 30 June and
// prints a total that includes a payout dated 9 July, still inside the 30 June
// value. So the capital is the dated calls less the dated payouts ON OR BEFORE
// the valuation, every kind, at gross — and it must be the SAME money the
// Private Market fund table solves its XIRR over (`fundReturns.ts`), which is a
// second path to one rate, written by a different stage for a different page.
{
  const neo = BOOK_ACCOUNTS.find((a) => a.accountId.startsWith("neo-infra"))!;
  const nc = model.of(neo.accountId);
  const neoC = BOOK_COMMITMENTS.find((c) => c.accountId === neo.accountId)!;
  const payouts = neoC.payouts ?? [];
  const inside = payouts.filter((r) => r.date <= neo.asOf!);
  const after = payouts.filter((r) => r.date > neo.asOf!);
  const insideGross = inside.reduce((t, r) => t + r.gross, 0);
  const called = neoC.calls.reduce((t, k) => t + k.amount, 0);
  ok("Neo Infra is measured on its capital account, dated", nc?.source === "capital-account" && !!nc.flows,
    JSON.stringify({ source: nc?.source, flows: nc?.flows?.length }));
  ok("…paid in is its dated calls, which ARE the money paid", nc !== null && nc.paidIn === called
    && Math.abs(called - (neoC.paid as number)) <= 1 && nc.payments === neoC.calls.length,
    JSON.stringify({ paidIn: nc?.paidIn, called, paid: neoC.paid, payments: nc?.payments }));
  ok("…taken out is every payout dated on or before the valuation, at gross",
    nc !== null && Math.abs((nc.tookOut as number) - insideGross) < 1e-6 && Math.abs(nc.net - (called - insideGross)) < 1e-6,
    JSON.stringify({ tookOut: nc?.tookOut, insideGross, net: nc?.net }));
  // LOAD-BEARING, IN BOTH HALVES. There is a payout after the valuation, and the
  // printed distribution total counts it — so using the total would count that
  // money twice. And equalisation is cash back too, so a rule reading income
  // and principal alone would state a different capital.
  const afterGross = after.reduce((t, r) => t + r.gross, 0);
  ok("…and a payout after the valuation is NOT subtracted, though the printed total includes it",
    after.length > 0 && afterGross > 0 && neoC.distributed !== null
      && Math.abs((neoC.distributed as number) - insideGross) > 1e5 && nc !== null && nc.net < (neoC.paid as number),
    JSON.stringify({ after: after.map((r) => r.date), afterGross, printed: neoC.distributed, insideGross }));
  const equalisation = inside.filter((r) => r.kind === "equalisation").reduce((t, r) => t + r.gross, 0);
  ok("…and equalisation received is counted as cash back", equalisation > 0 && nc !== null
    && (nc.tookOut as number) > insideGross - equalisation, String(equalisation));

  // TWO PATHS, ONE RATE. The fund table's XIRR (`fundDatedRecords` →
  // `fundMeasuredReturn`) and the capital model's, over the same fund.
  const accIdx = accountIndex(BOOK_ACCOUNTS);
  const scope = privateScope(universe, BOOK_ACCOUNTS);
  const funds = fundRollup(scope.dedupedRows, accIdx, scope.rows, model);
  const dated = fundDatedRecords(scope.dedupedRows, BOOK_COMMITMENTS, accIdx, (n) => String(n), (d) => d);
  let tied = 0;
  for (const f of funds) {
    const d = dated.get(f.securityKey);
    const onCap = f.capital?.onCapital ?? [];
    if (!d || d.gap || !onCap.length || onCap.some((x) => x.capital.source !== "capital-account")) continue;
    const table = fundMeasuredReturn(f, d, "xirr", (n) => String(n), (x) => x);
    const mine = model.behind(scope.dedupedRows.filter((p) => p.securityKey === f.securityKey)).xirr;
    const same = table.shown && table.tag === "XIRR" && mine?.pct != null && Math.abs(mine.pct - table.pct) < 1e-6;
    if (same) tied++;
    ok(`${f.security}: the capital model's XIRR is the fund table's, to the millionth of a point`, same,
      JSON.stringify({ table: table.shown ? table.pct : table.reason, model: mine?.pct }));
    ok(`${f.security}: …and its Invested is the capital, net of the payouts the XIRR dates`,
      f.cost !== null && Math.abs((f.cost as number) - onCap.reduce((t, x) => t + x.capital.net, 0)) < 1e-6
        && Math.abs(onCap.reduce((t, x) => t + (x.capital.tookOut ?? 0), 0) - d.paidOut) < 1,
      JSON.stringify({ cost: f.cost, paidOut: d.paidOut }));
  }
  ok("…on both funds whose capital account dates every call and payout", tied >= 2, String(tied));

  // A FUND WHOSE PAYOUT TABLE IS NOT RECONCILED GETS NO CAPITAL FROM ITS ACCOUNT.
  // Reading an unread payout record as nil would assert it returned nothing.
  const unread = BOOK_COMMITMENTS.filter((c) => c.payouts === null && c.calls.length > 0
    && own(c.accountId).length > 0);
  ok("a fund whose payout table is not reconciled is not put on its capital account",
    unread.length > 0 && unread.every((c) => model.of(c.accountId)?.source !== "capital-account"),
    unread.map((c) => `${c.accountId}: ${model.of(c.accountId)?.source ?? "none"}`).join("; "));

  // AND THE GATES, ON CONSTRUCTED INPUTS — the book cannot exercise them all.
  const acct = { ...neo, accountId: "t-fund", asOf: "2026-06-30", inceptionDate: null } as typeof neo;
  const pos = [{ ...own(neo.accountId)[0], accountId: "t-fund" }];
  const base = {
    ...neoC, accountId: "t-fund", asOf: "2026-06-30", paid: 300,
    calls: [{ date: "2024-01-01", label: null, amount: 100 }, { date: "2025-01-01", label: null, amount: 200 }],
    payouts: [
      { date: "2025-06-30", kind: "income", label: null, gross: 10, tds: 1, net: 9, inPrintedTotal: true },
      { date: "2026-06-30", kind: "equalisation", label: null, gross: -5, tds: null, net: -5, inPrintedTotal: true },
      { date: "2026-07-09", kind: "income", label: null, gross: 40, tds: 4, net: 36, inPrintedTotal: true },
    ],
  } as unknown as typeof neoC;
  const run = (c: typeof neoC) => accountCapital({ account: acct, moves: [], bridges: [], commitment: c, positions: pos, tranches: {} });
  const r = run(base);
  ok("constructed: calls less payouts to the valuation — the one after it is left in the value",
    r !== null && r.paidIn === 300 && r.tookOut === 5 && r.net === 295 && r.flows?.length === 4,
    JSON.stringify(r));
  ok("constructed: an equalisation the family PAID is money in, in the flows' own sign",
    !!r?.flows?.some((f) => f.amount === -5), JSON.stringify(r?.flows));
  ok("constructed: an unreconciled payout table gives no capital", run({ ...base, payouts: null }) === null);
  ok("constructed: calls that are not the money paid give no capital", run({ ...base, paid: 250 }) === null);
  ok("constructed: a call after the valuation gives no capital",
    run({ ...base, calls: [...base.calls, { date: "2026-07-01", label: null, amount: 0 }] }) === null);
  ok("constructed: a capital account struck on another date gives no capital", run({ ...base, asOf: "2026-03-31" }) === null);
}

// ── 6. A money-weighted return only where every rupee is dated ──────────────
{
  const pms = model.behind(own("v-e-c-assago-capital-management-llp-128004"));
  ok("a mandate whose capital is a printed total has no XIRR", pms.xirr === null && !!pms.xirrWhy, JSON.stringify(pms.xirr));
  const buoyant = model.behind([...own(AJAY), ...own(ANKITA)]);
  ok("two dated folios pool into one XIRR", buoyant.xirr?.pct != null && buoyant.payments === 10,
    JSON.stringify({ xirr: buoyant.xirr, payments: buoyant.payments }));
  const mixed = model.behind([...own(AJAY), ...own("v-e-c-assago-capital-management-llp-128004")]);
  ok("a set that is only partly dated has no XIRR", mixed.xirr === null && /total since inception/.test(mixed.xirrWhy ?? ""),
    mixed.xirrWhy ?? "");
}

// ── 7. Every source's capital is struck on the account's own as-of ─────────
{
  for (const a of BOOK_ACCOUNTS) {
    const c = accountCapital({
      account: a, moves: BOOK_CAPITAL_MOVES, bridges: BOOK_ACCOUNT_BRIDGES[a.accountId] ?? [],
      commitment: BOOK_COMMITMENTS.find((x) => x.accountId === a.accountId) ?? null,
      positions: universe, tranches: BOOK_POSITION_TRANCHES,
    });
    if (!c) continue;
    ok(`${a.accountId}: capital stands on the account's own date`, c.asOf === a.asOf, `${c.asOf} vs ${a.asOf}`);
    ok(`${a.accountId}: capital is positive`, c.net > 0, String(c.net));
  }
}

// ── 8. Every measure, on a row that IS a whole investment ───────────────────
//
// `measuredReturn` is the ONE methodology every return column reads, and a row
// carrying `capital` is struck on the capital put in. The family's own rule —
// several dated payments → XIRR; one payment a year or more ago → CAGR;
// otherwise the holding-period return — asserted against the real book, with
// the printed IRR as the witness on the dated case.
{
  const row = (set: Position[]): ReturnInput => {
    const c = model.behind(set);
    return { returnPct: c.covers ? c.returnPct : null, heldSince: null, assetClass: set[0]?.assetClass, capital: c };
  };
  const AS = "2026-08-13";
  const aj = row(own(AJAY));
  const auto = measuredReturn(aj, "auto", AS);
  ok("auto on a folio paid into ten times is its XIRR — the family's multiple-tranche rule",
    auto.shown && auto.tag === "XIRR" && Math.abs(auto.pct - 15.30) < 0.01, JSON.stringify(auto));
  const hpr = measuredReturn(aj, "absolute", AS);
  ok("HPR on that folio is the return on the capital put in", hpr.shown && Math.abs(hpr.pct - 7.17) < 0.01, JSON.stringify(hpr));
  ok("…and its note says what it is struck on", hpr.shown && /capital the family put in/.test(hpr.note ?? ""), hpr.shown ? hpr.note ?? "" : "");
  const cagr = measuredReturn(aj, "cagr", AS);
  ok("the CAGR column shows the money-weighted rate, tagged XIRR — money that went in on ten dates has no single start",
    cagr.shown && cagr.tag === "XIRR" && Math.abs(cagr.pct - 15.30) < 0.01, JSON.stringify(cagr));
  const x = measuredReturn(aj, "xirr", AS);
  ok("the XIRR column is no longer absent for a whole investment with dated payments", x.shown && x.tag === "XIRR", JSON.stringify(x));
  const ytd = measuredReturn(aj, "ytd", AS);
  ok("YTD stays absent for an investment funded before the year began", !ytd.shown && /1 January/.test(ytd.shown ? "" : ytd.reason));

  // A capital published only as a TOTAL dates nothing: no annual rate at all.
  const gl = row(own("green-lantern-capital-llp-510861"));
  const glAuto = measuredReturn(gl, "auto", AS);
  ok("auto on a statement-sourced mandate is its HPR on capital, marked not annualised",
    glAuto.shown && glAuto.tag === "HPR" && /Not annualised/.test(glAuto.note ?? ""), JSON.stringify(glAuto));
  const glX = measuredReturn(gl, "xirr", AS);
  ok("…and its XIRR is refused, naming the total since inception", !glX.shown && /total since inception/.test(glX.shown ? "" : glX.reason),
    JSON.stringify(glX));
  const glC = measuredReturn(gl, "cagr", AS);
  ok("…and so is its CAGR — annualising a total would assume every rupee went in on day one", !glC.shown, JSON.stringify(glC));

  // ONE payment in, nothing out: the money-weighted rate IS the CAGR, and the
  // cell says CAGR. Found in the book rather than typed, so the next drop picks
  // its own — and a book with none says so rather than passing over nothing.
  const single = BOOK_ACCOUNTS.map((a) => ({ a, c: model.behind(own(a.accountId)) }))
    .find(({ c }) => onCapitalBasis(c) && c.dated && c.payments === 1 && c.paymentsOut === 0 && !!c.xirr?.annualised);
  if (single) {
    const r = measuredReturn(row(own(single.a.accountId)), "auto", AS);
    const days = single.c.xirr!.windowDays!;
    const byHand = (Math.pow(1 + (single.c.returnPct as number) / 100, 365 / days) - 1) * 100;
    ok(`${single.a.accountId}: one payment a year ago is tagged CAGR`, r.shown && r.tag === "CAGR", JSON.stringify(r));
    ok(`${single.a.accountId}: …and equals the HPR compounded by hand`, r.shown && Math.abs(r.pct - byHand) < 0.01,
      `${r.shown ? r.pct.toFixed(4) : "—"} vs ${byHand.toFixed(4)}`);
  } else {
    console.log("  NOT CHECKED  no single-payment dated investment a year old in this book — exercised synthetically below");
  }
  // …and synthetically, so the CAGR branch is checked on every run whatever the
  // book holds: one payment on 1 Jan 2025, valued 1.21x on 31 Jul 2026.
  {
    const acc = { ...BOOK_ACCOUNTS[0], accountId: "synth-one", asOf: "2026-07-31", capitalRecordTo: "2026-07-31", inceptionDate: "2025-01-01" };
    const pos = { ...own(AJAY)[0], accountId: "synth-one", marketValue: 1.21e7, costBasis: 1.1e7 } as Position;
    const m1 = buildCapitalModel({
      accounts: [acc], capitalMoves: [{ accountId: "synth-one", date: "2025-01-01", direction: "in", amount: 1e7 } as never],
      bridges: {}, commitments: [], tranches: {}, positions: [pos],
    });
    const b1 = m1.behind([pos]);
    const r1 = measuredReturn({ returnPct: b1.returnPct, heldSince: null, assetClass: "AIF", capital: b1 }, "auto", "2026-07-31");
    const days = Math.round((Date.parse("2026-07-31") - Date.parse("2025-01-01")) / 864e5);
    const byHand = (Math.pow(1.21, 365 / days) - 1) * 100;
    ok("one payment a year or more ago: auto is tagged CAGR", r1.shown && r1.tag === "CAGR", JSON.stringify(r1));
    ok("…and equals the 21% compounded over its own window by hand", r1.shown && Math.abs(r1.pct - byHand) < 0.01,
      `${r1.shown ? r1.pct.toFixed(4) : "—"} vs ${byHand.toFixed(4)}`);
  }

  // THE GUARD, on capital: dated, but under a year — the total return stands.
  // THE SAME OBJECT in the universe and in the set: the model compares a set
  // with its universe BY IDENTITY, so a copy would (correctly) not be whole.
  const synthPos = { ...own(AJAY)[0], accountId: "synth", marketValue: 2.2e7, costBasis: 2.1e7 } as Position;
  const synth = buildCapitalModel({
    accounts: [{ ...BOOK_ACCOUNTS[0], accountId: "synth", asOf: "2026-07-31", capitalRecordTo: "2026-07-31", inceptionDate: "2026-02-01" }],
    capitalMoves: [
      { accountId: "synth", date: "2026-02-01", direction: "in", amount: 1e7 } as never,
      { accountId: "synth", date: "2026-05-01", direction: "in", amount: 1e7 } as never,
    ],
    bridges: {}, commitments: [], tranches: {},
    positions: [synthPos],
  });
  const sp = synth.behind([synthPos]);
  ok("a COPY of a universe position is not the account — the model compares by identity",
    !onCapitalBasis(synth.behind([{ ...synthPos }])));
  ok("a synthetic sub-year investment is on its dated capital", onCapitalBasis(sp) && sp.dated, JSON.stringify({ dated: sp.dated, on: sp.onCapital.length }));
  const sr: ReturnInput = { returnPct: sp.returnPct, heldSince: null, assetClass: "AIF", capital: sp };
  const sa = measuredReturn(sr, "auto", "2026-07-31");
  ok("…auto shows the total return on capital, tagged HPR, never an annual rate over 180 days",
    sa.shown && sa.tag === "HPR" && Math.abs(sa.pct - 10) < 1e-9, JSON.stringify(sa));
  const sx = measuredReturn(sr, "xirr", "2026-07-31");
  ok("…and the XIRR column falls back to it too, tagged HPR", sx.shown && sx.tag === "HPR", JSON.stringify(sx));
}

// ── 9. A total stands an account on capital only where ONE row carries it ───
{
  const mandate = own("carnelian-asset-management-and-advisors-pvt-ltd-3517383");
  const whole = model.behind(mandate, () => "one-row");
  ok("one row carrying the whole mandate: on capital", whole.onCapital.length === 1);
  const split = model.behind(mandate, (p) => (p.assetClass === "Cash" ? "cash-row" : "share-rows"));
  ok("the same positions split across two rows: on cost, as each row is", split.onCapital.length === 0,
    JSON.stringify(split.onCapital.map((x) => x.accountId)));

  // A ₹0 LINE CANNOT SPLIT AN ACCOUNT. Buoyant prints a ₹0 cash line beside the
  // fund's units and the category axis files it under Cash — measured, that
  // put both folios on cost in the Holdings footer while their own AIF section
  // stood them on capital, and the sections stopped adding to the footer.
  const idx = accountIndex(BOOK_ACCOUNTS);
  const buoyant = own(AJAY);
  ok("Buoyant carries a ₹0 cash line beside its units (the case this rule is for)",
    buoyant.some((p) => p.marketValue === 0 && (p.costBasis ?? 0) === 0) && buoyant.some((p) => p.marketValue > 0),
    JSON.stringify(buoyant.map((p) => [p.assetClass, p.marketValue])));
  const byCategory = (p: Position) => groupKeyFor("category", idx, p);
  ok("…those two lines sit in two category sections",
    new Set(buoyant.map(byCategory)).size === 2, [...new Set(buoyant.map(byCategory))].join(" | "));
  const footer = model.behind(buoyant, byCategory);
  ok("…and the footer still stands the folio on its capital", footer.onCapital.length === 1,
    JSON.stringify({ onCap: footer.onCapital.length, cost: footer.onCost.count }));
  const section = model.behind(buoyant.filter((p) => p.marketValue > 0), byCategory);
  ok("…exactly as its own AIF section does, so the two add up",
    onCapitalBasis(section) && section.invested === footer.invested,
    `${cr(section.invested)} vs ${cr(footer.invested)}`);
  // …and the rule is about MONEY, not about zero value: a line carrying a cost
  // at ₹0 value (a write-off) is part of the account and still splits it.
  const writeOff = buoyant.map((p) => (p.marketValue === 0 ? { ...p, costBasis: 1e7 } : p));
  const wModel = buildCapitalModel({ ...book, positions: [...universe.filter((p) => p.accountId !== AJAY), ...writeOff] });
  // …and it must still HAVE capital, or the case passes for the wrong reason.
  ok("a ₹0 line that carries a cost still splits the account across two rows",
    wModel.of(AJAY) !== null && wModel.behind(writeOff).onCapital.length === 1
      && wModel.behind(writeOff, byCategory).onCapital.length === 0,
    JSON.stringify({ cap: !!wModel.of(AJAY) }));
}

// ── 10. No capital account splits across the sections of any axis ──────────
//
// The section totals on the Holdings table add to its footer BY CONSTRUCTION
// only while each whole investment sits in ONE section — otherwise the footer
// could stand it on capital and its sections on cost. Asserted on all three
// axes over the generated book, so the drop that first splits one fails here.
{
  const idx = accountIndex(BOOK_ACCOUNTS);
  let checked = 0;
  for (const axis of GROUP_AXES) {
    for (const a of BOOK_ACCOUNTS) {
      if (!model.of(a.accountId)) continue;
      const ps = own(a.accountId).filter((p) => p.marketValue !== 0);
      if (!ps.length) continue;
      const keys = new Set(ps.map((p) => groupKeyFor(axis, idx, p)));
      checked++;
      ok(`${a.accountId} sits in one ${axis} section`, keys.size === 1, [...keys].join(" | "));
    }
  }
  ok("the section rule has capital accounts to check", checked > 10, String(checked));
}

// ── 11. The hover names the source, the dates and the cost it replaced ─────
{
  const b = model.behind(own(AJAY));
  const words = describeCapital(b, (n) => `₹${(n / 1e7).toFixed(2)} Cr`, 475353990.9);
  ok("the Invested hover names paid in and taken out", /paid in less .* taken out/.test(words), words);
  ok("…and the dated source and its count", /dated/.test(words) && /10 dated payments|dated payment/.test(words), words);
  ok("…and the cost of the units it replaced", /units held today cost ₹47\.54 Cr/.test(words), words);
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
