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
//      happily against the old one.
import fs from "node:fs";
import path from "node:path";
import {
  BOOK_ACCOUNTS, BOOK_ACCOUNT_BRIDGES, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS,
  BOOK_POSITIONS, BOOK_POSITION_TRANCHES,
} from "@/data/glowData";
import { accountCapital, buildCapitalModel } from "@/lib/capital";
import { currentHoldings, dedupedPositions } from "@/lib/analytics";

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
    // The account the family reported, and the three largest gaps either way.
    { id: AJAY, dir: "up" as const, min: 3 },
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
  ok("Ajay's Buoyant: invested is the ₹46 Cr he paid in, not the ₹47.54 Cr the units cost",
    a.invested === 460000000, cr(a.invested));
  ok("Ajay's Buoyant: +7.17% on capital", a.returnPct !== null && Math.abs(a.returnPct - 7.1700) < 0.01, String(a.returnPct));
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

// ── 5. A payout line is used only where it is printed ───────────────────────
{
  const neo = BOOK_ACCOUNTS.find((a) => a.accountId.startsWith("neo-infra"))!;
  const nc = model.of(neo.accountId);
  ok("Neo Infra is measured on its capital account", nc?.source === "capital-account", JSON.stringify(nc));
  ok("…net of the distributions it printed", nc !== null && nc.tookOut === 4948221 && nc.net === 50000000 - 4948221,
    JSON.stringify({ paid: nc?.paidIn, out: nc?.tookOut, net: nc?.net }));
  // Baring prints no distribution line at all, so reading it as nil would
  // assert the fund has paid nothing back. It stays on the cost of its units.
  const baring = BOOK_ACCOUNTS.find((a) => a.accountId.startsWith("baring"))!;
  const bc = BOOK_COMMITMENTS.find((c) => c.accountId === baring.accountId)!;
  ok("Baring prints no distribution line", bc.distributed === null, String(bc.distributed));
  ok("…so it is not given a capital figure that assumes one", model.of(baring.accountId) === null,
    JSON.stringify(model.of(baring.accountId)));
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

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
