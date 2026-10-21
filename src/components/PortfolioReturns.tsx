/**
 * ── MORNING CIO → RETURNS (Stage 10dq) ───────────────────────────────────────
 *
 * A period selector (MTD, YTD, FYTD, trailing 1Y/2Y/3Y, since investment and a
 * custom From/To), a return-type DROPDOWN over the three selected types
 * `RETURN_TYPES` carries, each explained in one short line beside it (Stage
 * 10eb), and an info popup for the calculation selected, with the window
 * actually measured printed beside the one asked for.
 *
 * ONE COLUMN: the portfolio's card first, the benchmarks under it (Stage 10dy,
 * at the family's request). The panel scrolls inside itself; the page does not.
 *
 * A DATED WINDOW OPENS ON A MARKET VALUE, NEVER A COST. Each account opens on
 * its latest statement valuation on or before the opening date and closes on
 * its latest on or before the end; capital moved inside the window is a dated
 * flow (`periodReturns.ts`). Since investment is struck on the capital paid in
 * (`capitalRollup`, the Transactions card's own record). An account that cannot
 * be measured is NAMED with its reason, never blended in as zero.
 *
 * ONE RECORD, AND NEVER A PARTIAL RETURN (Stage 10fb). A dated window reads the
 * same verified account records every other return surface reads
 * (`accountReturnRecords`) — the tab once built its own from NAV history and
 * cash-flow rows and measured 9 accounts over FYTD where 17 are verified. The
 * portfolio's figures are struck only when EVERY account that holds value is
 * measured; otherwise they are absent, and the accounts and the records they
 * lack are named. An account with nothing of its own to measure (a verified
 * nil, or valued nowhere in the book) is outside the whole, not a gap in it.
 *
 * No line on the face reads as a sentence (Stage 10cp): every explanation is a
 * hover on the figure or control it explains.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/Card";
import { AbsentCell } from "@/components/Absent";
import { ReturnCalculationInfo } from "@/components/ReturnCalculation";
import { PeriodReturnCalculation } from "@/components/PeriodReturnCalculation";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { BENCHMARKS, benchmarkIdentity, benchmarkMismatchReason } from "@/lib/benchmarks";
import { fetchPriceHistory, priceErrorReason, type PriceHistory, type PriceResult } from "@/lib/prices";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate, fmtCr, DASH, changeColor } from "@/lib/format";
import { mandateLabel } from "@/lib/analytics";
import { inScopeAccount } from "@/lib/memberScope";
import { capitalMovesWithCalls, capitalRollup, capitalWindow } from "@/lib/tranches";
import {
  BOOK_ACCOUNT_NAV_HISTORY, BOOK_CAPITAL_FROM_INCEPTION, BOOK_CAPITAL_MOVES,
  BOOK_COMMITMENTS, BOOK_POSITION_TRANCHES, BOOK_REVIEW_FLOWS, BOOK_UNDATED_CAPITAL,
} from "@/data/glowData";
import { nothingToMeasure } from "@/lib/returns";
import {
  PERIODS, RETURN_TYPES, FORMULAS, INCEPTION_FORMULAS, periodStart, windowReturns, measureWindow,
  measureInception, daysBetween,
  type AccountInput, type InceptionRow, type PeriodKey, type ReturnType, type Measured,
} from "@/lib/periodReturns";

const OPENING_ROW = /^opening portfolio value/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pctText = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const basisWord = (m: Measured) => m.basis === "annual" ? "a year" : "not annualised";

const BENCH_COLS = ["bench", "ret", "gap"] as const;

export default function PortfolioReturns() {
  const { statementPortfolio, fmtFromBase, displayCurrency, scope } = usePortfolio();
  const [params, setParams] = useSearchParams();
  const money = (n: number) => fmtFromBase(n, { compact: true });
  const benchView = useTableView("cio-returns-bench", BENCH_COLS);

  const period = (PERIODS.find((p) => p.key === params.get("rp"))?.key ?? "fytd") as PeriodKey;
  const rtype = (RETURN_TYPES.find((r) => r.key === params.get("rtype"))?.key ?? "xirr") as ReturnType;
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v == null ? next.delete(k) : next.set(k, v);
    setParams(next, { replace: true });
  };

  // ── Every account's valuations and dated flows ───────────────────────────
  const inputs = useMemo<AccountInput[]>(() => {
    if (!statementPortfolio) return [];
    const out: AccountInput[] = [];
    for (const a of statementPortfolio.accounts) {
      const label = mandateLabel(a) || a.provider;
      const base = { accountId: a.accountId, label: `${label} · ${a.accountNo}`, owner: a.owner };
      const undated = BOOK_UNDATED_CAPITAL.filter((u) => u.accountId === a.accountId)
        .map((u) => ({ from: u.from, to: u.to, amount: u.undated }));
      const coverage = statementPortfolio.accountReturnRecords?.[a.accountId];
      const record = coverage?.record;
      const opening = record?.flows.find((f) => OPENING_ROW.test(f.description ?? ""));
      if (!record || !opening) {
        out.push({ ...base, valuations: [], flows: [], knownFrom: null, knownTo: null, undated,
          outside: nothingToMeasure(statementPortfolio, a),
          flowsUnknown: a.reviewHolder
            ? "the family's review values its lines on one date and dates no capital, so no window can be struck over it"
            : coverage?.gap ?? "no verified opening value and dated capital record" });
        continue;
      }
      // The verified record: its opening value at the close of the day before
      // its first dated flow, its dated capital, and its closing valuation. A
      // statement valuation between the two is a mark a window may open or
      // close on, because the capital between them is complete.
      const d = new Date(`${opening.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      const openDate = d.toISOString().slice(0, 10);
      const vals = new Map<string, number>();
      for (const p of BOOK_ACCOUNT_NAV_HISTORY[a.accountId] ?? []) if (p.date > openDate && p.date < record.asOf) vals.set(p.date, p.nav);
      vals.set(openDate, -opening.amount);
      vals.set(record.asOf, record.value);
      out.push({ ...base, valuations: [...vals].map(([date, value]) => ({ date, value })),
        flows: record.flows.filter((f) => f !== opening).map((f) => ({ date: f.date, amount: f.amount })),
        knownFrom: openDate, knownTo: record.capitalRecordTo ?? record.asOf, flowsUnknown: null, undated });
    }
    return out;
  }, [statementPortfolio]);

  const inception = useMemo<{ rows: InceptionRow[]; skipped: { label: string; reason: string }[] }>(() => {
    if (!statementPortfolio) return { rows: [], skipped: [] };
    const moves = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, statementPortfolio.accounts, BOOK_REVIEW_FLOWS)
      .filter((m) => inScopeAccount(scope.accountIds, m.accountId));
    const groups = capitalRollup(moves, statementPortfolio.accounts, statementPortfolio.positions, BOOK_POSITION_TRANCHES, "all", "recent",
      { commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION });
    const outside = new Set(statementPortfolio.accounts.filter((a) => nothingToMeasure(statementPortfolio, a)).map((a) => a.accountId));
    const rows: InceptionRow[] = [];
    const skipped: { label: string; reason: string }[] = [];
    for (const g of groups) {
      const w = capitalWindow(g);
      const label = `${g.label} · ${g.accountNo}`;
      const complete = !g.atCost && w && g.flows && g.value != null && g.appreciation != null;
      if (!complete && outside.has(g.accountId)) continue;
      if (g.atCost) { skipped.push({ label, reason: "held at its cost: no valuation states its gain" }); continue; }
      if (!w || !g.flows || g.value == null || g.appreciation == null) {
        skipped.push({ label, reason: g.incompleteReason ?? "its dated capital record or its value is incomplete" });
        continue;
      }
      rows.push({ accountId: g.key, label, owner: g.owner, first: w.from, valueAsOf: w.to,
        paidIn: g.paidIn, takenOut: g.tookOut ?? 0, value: g.value,
        flows: g.flows.map((f) => ({ date: f.date, amount: f.amount })) });
    }
    // An account holding value that dates no capital at all is a gap in the
    // whole too, not an account the period never heard of.
    for (const a of statementPortfolio.accounts) {
      if (outside.has(a.accountId) || groups.some((g) => g.accountId === a.accountId)) continue;
      skipped.push({ label: `${mandateLabel(a) || a.provider} · ${a.accountNo}`, reason: "no statement dates the capital put in or taken out since its first purchase" });
    }
    return { rows, skipped };
  }, [statementPortfolio, scope.accountIds]);

  // ── The window ──────────────────────────────────────────────────────────
  const latest = useMemo(() => inputs.flatMap((a) => a.valuations.map((v) => v.date)).sort().at(-1) ?? null, [inputs]);
  const toParam = params.get("rto");
  const fromParam = params.get("rfrom");
  const end = toParam && ISO.test(toParam) ? toParam : latest;
  const start = period === "custom"
    ? (fromParam && ISO.test(fromParam) ? fromParam : null)
    : period === "inception" ? null : end ? periodStart(period, end) : null;

  const win = useMemo(() => (start && end && start < end ? windowReturns(inputs, start, end) : null), [inputs, start, end]);

  // ── The whole portfolio: one window, one set of figures — or none ────────
  const excluded = period === "inception" ? inception.skipped : (win?.excluded ?? []).map((e) => ({ label: e.label, reason: e.reason }));
  const coveredCount = period === "inception" ? inception.rows.length : (win?.included.length ?? 0);
  const accountsTotal = coveredCount + excluded.length;
  // NEVER A PARTIAL RETURN: a figure over some accounts is not the portfolio's.
  const whole = coveredCount > 0 && excluded.length === 0;
  const incomplete = `${coveredCount === 0 ? `None of the ${accountsTotal} accounts holding value has a` : `${excluded.length} of ${accountsTotal} accounts holding value ${excluded.length === 1 ? "has" : "have"} no`} verified ${period === "inception"
    ? "dated capital record and valuation since the first purchase"
    : `valuation on or before ${start ? fmtDate(start) : "the opening date"} with dated capital through a closing valuation`}, so no whole-portfolio return is struck`;
  const measured: Measured | null = !(period === "inception" || win) ? null
    : !whole ? { shown: false, formula: (period === "inception" ? INCEPTION_FORMULAS : FORMULAS)[rtype],
      reason: coveredCount === 0 && excluded.length === 0 ? "no account holds anything to measure over this window" : incomplete }
    : period === "inception" ? measureInception(inception.rows, rtype, money)
    : measureWindow(win!.included, rtype, money);

  const total = !whole ? null : period === "inception"
    ? { open: null as number | null, cin: inception.rows.reduce((s, r) => s + r.paidIn, 0), cout: inception.rows.reduce((s, r) => s + r.takenOut, 0), close: inception.rows.reduce((s, r) => s + r.value, 0) }
    : win ? { open: win.openValue, cin: win.capitalIn, cout: win.capitalOut, close: win.closeValue } : null;
  const gainTotal = total ? total.close - (total.open ?? 0) - total.cin + total.cout : null;
  const measuredFrom = !whole ? null : period === "inception" ? inception.rows.map((r) => r.first).sort()[0] ?? null : win?.measuredFrom ?? null;
  const measuredTo = !whole ? null : period === "inception" ? inception.rows.map((r) => r.valueAsOf).sort().at(-1) ?? null : win?.measuredTo ?? null;
  const days = measuredFrom && measuredTo ? daysBetween(measuredFrom, measuredTo) : null;
  const typeLabel = RETURN_TYPES.find((r) => r.key === rtype)!.label;
  const excludedHover = excluded.length
    ? `No portfolio return until every account is measured. Not measured: ${excluded.map((e) => `${e.label} — ${e.reason}`).join("; ")}. None is counted as zero.`
    : "Every account holding value is measured over this window.";

  // ── Benchmarks over the same measured window ─────────────────────────────
  const [hist, setHist] = useState<Record<string, PriceResult | undefined>>({});
  useEffect(() => {
    let live = true;
    for (const b of BENCHMARKS) {
      fetchPriceHistory(b.symbol).then((r) => { if (live) setHist((h) => ({ ...h, [b.key]: r })); });
    }
    return () => { live = false; };
  }, []);

  const benchFrom = measuredFrom ?? start;
  const benchTo = measuredTo ?? end;
  const annualise = !!(measured?.shown && measured.basis === "annual");
  const portfolioPct = measured?.shown && measured.pct != null ? measured.pct : null;
  const requested = period === "inception" ? "since first purchase" : start && end ? `${fmtDate(start)} → ${fmtDate(end)}` : DASH;
  const measuredDates = measuredFrom && measuredTo ? `${fmtDate(measuredFrom)} → ${fmtDate(measuredTo)} · ${days} days` : DASH;
  const needsYear = rtype === "cagr" && !!measured?.reason?.includes("at least 365 days");
  const benchRows: BenchRow[] = BENCHMARKS.map((b) => {
    const h = hist[b.key];
    const base = { key: b.key, label: b.label, title: b.title };
    if (!h) return { ...base, pct: null, reason: `Fetching the ${b.label} closes`, span: null };
    if (!h.ok) return { ...base, pct: null, reason: priceErrorReason(h, true), span: null };
    const id = benchmarkIdentity(h, b);
    if (!id.ok) return { ...base, pct: null, reason: benchmarkMismatchReason(b, id.reportedName), span: null };
    if (!benchFrom || !benchTo || benchFrom >= benchTo) return { ...base, pct: null, reason: "No window is measured, so no benchmark return is struck", span: null };
    const c0 = closeOnOrBefore(h, benchFrom);
    const c1 = closeOnOrBefore(h, benchTo);
    if (!c0) return { ...base, pct: null, reason: `${b.name}'s published history starts on ${h.first}, after the window opens on ${benchFrom}`, span: null };
    if (!c1 || c1.date <= c0.date) return { ...base, pct: null, reason: `No ${b.label} close inside the window`, span: null };
    const r = c1.value / c0.value - 1;
    const d = daysBetween(c0.date, c1.date);
    const pct = (annualise && d >= 365 ? Math.pow(1 + r, 365 / d) - 1 : r) * 100;
    return { ...base, pct, reason: null, span: { from: c0.date, to: c1.date, v0: c0.value, v1: c1.value, days: d } };
  });
  const gapOf = (r: BenchRow) => (portfolioPct != null && r.pct != null ? portfolioPct - r.pct : null);
  const benchSorted = sortRows(benchRows, benchView.sort, { bench: (r) => r.label, ret: (r) => r.pct, gap: (r) => gapOf(r) });

  const btn = (on: boolean) => `rounded-md px-2.5 py-1 text-[12px] font-semibold transition ${on ? "bg-champagne-400 text-ink-900" : "text-slate-400 hover:text-slate-200 hover:bg-ink-700/50"}`;
  const basisTag = annualise ? "a year" : "not annualised";

  return (
    <div className="flex h-auto min-h-0 flex-col gap-4 lg:h-full" data-portfolio-returns>
      {/* ── Selectors ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-ink-700 p-1" data-returns-periods>
          {PERIODS.map((p) => (
            <button key={p.key} type="button" title={p.title} className={btn(period === p.key)} data-returns-period={p.key} aria-pressed={period === p.key}
              onClick={() => set(p.key === "custom" ? { rp: "custom", rfrom: start ?? fromParam } : { rp: p.key === "fytd" ? null : p.key })}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-400" title="Opening date — the window opens on each account's value at the close of this day">
          From
          <input type="date" className="rounded border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-slate-200" data-returns-from
            value={period === "inception" ? (measuredFrom ?? "") : (start ?? "")} disabled={period === "inception"}
            onChange={(e) => set({ rp: "custom", rfrom: e.target.value || null })} />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-400" title="Closing date — each account closes on its latest statement value on or before this day">
          To
          <input type="date" className="rounded border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-slate-200" data-returns-to
            value={end ?? ""} max={latest ?? undefined} disabled={period === "inception"}
            onChange={(e) => set({ rto: e.target.value || null })} />
        </label>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-slate-400" data-returns-types
          title={RETURN_TYPES.find((r) => r.key === rtype)!.title}>
          Return type
          <select className="rounded border border-ink-700 bg-ink-800 px-2 py-1 text-[12.5px] font-semibold text-slate-100" data-returns-type-select
            value={rtype} onChange={(e) => set({ rtype: e.target.value === "xirr" ? null : e.target.value })}>
            {RETURN_TYPES.map((r) => (
              <option key={r.key} value={r.key} title={r.title} data-returns-type={r.key} data-active={rtype === r.key ? "true" : "false"}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-slate-300" data-returns-type-desc={rtype}>
            {RETURN_TYPES.find((r) => r.key === rtype)!.short}
          </span>
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto" data-returns-stack>
        {/* ── The selected accounts: window, figures and calculation info ── */}
        <div className="shrink-0" data-returns-portfolio>
        <Card title="Portfolio return" subtitle={`The whole portfolio over one window, by ${typeLabel}. Open the info button for the calculation.`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3" data-returns-figure="Return">
            <div>
              <div className="flex items-center gap-2">
                <div className="label-xs">Return · {typeLabel}</div>
                <ReturnCalculationInfo key={`${period}:${rtype}:${start}:${end}`} label={typeLabel} value={portfolioPct != null ? pctText(portfolioPct) : DASH}>
                  <PeriodReturnCalculation measured={measured} type={rtype} inception={period === "inception"}
                    result={portfolioPct != null ? pctText(portfolioPct) : DASH} money={fmtFromBase} shortMoney={(n) => fmtFromBase(n, { compact: true })}
                    stepMoney={(n) => typeof n === "number" && displayCurrency === "INR" && portfolioPct != null && Math.abs(portfolioPct) >= 0.005 ? fmtCr(n, 4) : fmtFromBase(n)}
                    context={<><p>Requested: {requested}</p><p>Measured: {measuredDates}</p><p>Measured {coveredCount} of {accountsTotal} accounts holding value.{!whole && excluded.length > 0 && " No portfolio return is shown until every one is measured."}</p></>}
                    accounts={period === "inception" ? inception.rows.map((r) => ({ label: r.label, from: r.first, to: r.valueAsOf }))
                      : (win?.included ?? []).map((r) => ({ label: r.label, from: r.openDate, to: r.closeDate, openedInWindow: r.openedInWindow }))}
                    excluded={excluded} />
                </ReturnCalculationInfo>
              </div>
              {portfolioPct != null && measured ? (
                <div className={`mono font-display text-[28px] font-semibold ${changeColor(portfolioPct)}`} data-returns-pct={portfolioPct.toFixed(4)} data-returns-basis={measured.basis}>
                  {pctText(portfolioPct)} <span className="text-[12px] font-normal text-slate-500">{basisWord(measured)}</span>
                </div>
              ) : (
                <div className="text-[20px]" data-returns-pct=""><AbsentCell reason={measured?.reason ?? "pick a window whose opening date is before its closing date"} /></div>
              )}
              {portfolioPct == null && <p data-returns-unavailable data-prose-ok="The actual reason the selected return is unavailable must stay visible" className="mt-1 max-w-lg text-xs text-slate-400">{needsYear ? `Needs at least 1 year · ${days} days available` : measured?.reason ?? "Choose an opening date before the closing date."}</p>}
            </div>
            <div className="space-y-0.5 text-right text-[12px] text-slate-400" data-returns-window>
              <div title="The window asked for">Requested <span className="mono text-slate-200" data-returns-requested>
                {period === "inception" ? "since first purchase" : start && end ? `${fmtDate(start)} → ${fmtDate(end)}` : DASH}
              </span></div>
              <div title="Each account opens on its latest statement value on or before the opening date asked for, and closes on its latest on or before the closing date — so the measured window can start earlier than the one asked for">Measured <span className="mono text-slate-100" data-returns-measured
                data-measured-from={measuredFrom ?? ""} data-measured-to={measuredTo ?? ""} data-measured-days={days ?? ""}>
                {measuredFrom && measuredTo ? `${fmtDate(measuredFrom)} → ${fmtDate(measuredTo)} · ${days} days` : DASH}
              </span></div>
              <div title={excludedHover}>Accounts measured <span className="mono text-slate-200" data-returns-coverage data-returns-excluded={excluded.length}>{coveredCount} of {accountsTotal} accounts</span></div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t sm:grid-cols-5 border-ink-700 pt-3 text-[12px]">
            {[
              ["Opening", total?.open ?? null, period === "inception" ? "Since investment is struck on the capital paid in, not on an opening value" : "Market value at the opening date — never the original cost"],
              ["Capital in", total?.cin ?? null, "Money put in during the window, on its dates"],
              ["Capital out", total?.cout ?? null, "Money taken out during the window, on its dates"],
              ["Closing", total?.close ?? null, "Market value at each account's closing date"],
              ["Gain", gainTotal, "Closing − opening − capital in + capital out"],
            ].map(([l, v, h]) => (
              <div key={l as string} title={h as string} data-returns-figure={l as string}>
                <div className="label-xs">{l as string}</div>
                <div className={`mono ${l === "Gain" && typeof v === "number" ? changeColor(v) : "text-slate-100"}`}>
                  {typeof v === "number" ? money(v) : <AbsentCell reason={whole ? h as string : incomplete} />}
                </div>
              </div>
            ))}
          </div>
        </Card>
        </div>

        {/* ── Benchmarks over the same window ── */}
        <div className="shrink-0" data-returns-benchmarks>
        <Card pad={false} title="Benchmarks"
          subtitle={`Each index's close-to-close return over the measured window, ${annualise ? "annualised because the selected return is" : "not annualised, as the selected return is not"}. Price indices exclude dividends. ${whole ? `Selected measure: ${typeLabel}.` : "With no whole-portfolio return measured, each index runs over the window asked for."}`}
>
          <div className="overflow-x-auto">
            <table className="min-w-full whitespace-nowrap text-[12.5px]" data-returns-bench-table>
              <thead className="border-b border-ink-700 bg-ink-800">
                <Tr view={benchView}>
                  <SortHeader col="bench" view={benchView} align="left" pad="px-4 py-2">Index</SortHeader>
                  <SortHeader col="ret" view={benchView} pad="px-3 py-2">Return · {basisTag}</SortHeader>
                  <SortHeader col="gap" view={benchView} pad="px-4 py-2">Portfolio vs index</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                <Tr view={benchView} className="bg-ink-700/30" data-returns-bench-portfolio>
                  <td className="px-4 py-2 font-semibold text-slate-100">Portfolio · {typeLabel}</td>
                  <td className="px-3 py-2 text-right mono">
                    {portfolioPct != null ? <span className={changeColor(portfolioPct)}>{pctText(portfolioPct)}</span> : <AbsentCell reason={measured?.reason ?? "not measured on this window"} />}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">{DASH}</td>
                </Tr>
                {benchSorted.map((r) => {
                  const gap = gapOf(r);
                  return (
                    <Tr view={benchView} key={r.key} data-returns-bench={r.key} data-bench-pct={r.pct != null ? r.pct.toFixed(4) : ""}
                      data-bench-gap={gap != null ? gap.toFixed(4) : ""} data-bench-from={r.span?.from ?? ""} data-bench-to={r.span?.to ?? ""}>
                      <td className="px-4 py-2 text-slate-200" title={r.title}>{r.label}</td>
                      <td className="px-3 py-2 text-right mono">
                        {r.pct != null && r.span
                          ? <span className={changeColor(r.pct)} title={`${fmtDate(r.span.from)} close ${r.span.v0.toFixed(2)} → ${fmtDate(r.span.to)} close ${r.span.v1.toFixed(2)} · ${r.span.days} days`}>{pctText(r.pct)}</span>
                          : <AbsentCell reason={r.reason ?? "not measured"} />}
                      </td>
                      <td className="px-4 py-2 text-right mono">
                        {gap != null
                          ? <span className={changeColor(gap)} title="The portfolio's return less the index's, in percentage points">{gap >= 0 ? "+" : ""}{gap.toFixed(2)} pp</span>
                          : <AbsentCell reason={portfolioPct == null ? "The portfolio's return is not measured on this window" : (r.reason ?? "no index return")} />}
                      </td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}

type BenchRow = {
  key: string; label: string; title: string; pct: number | null; reason: string | null;
  span: { from: string; to: string; v0: number; v1: number; days: number } | null;
};

/** The latest settled close on or before a date — never a later one. */
function closeOnOrBefore(h: PriceHistory, date: string): { date: string; value: number } | null {
  let lo = 0, hi = h.t.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (h.t[mid] <= date) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at < 0 ? null : { date: h.t[at], value: h.v[at] };
}
