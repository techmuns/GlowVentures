/**
 * ── MORNING CIO → RETURNS (Stage 10dq) ───────────────────────────────────────
 *
 * A period selector (MTD, YTD, FYTD, trailing 1Y/2Y/3Y, since investment and a
 * custom From/To), a return-type DROPDOWN over the three selected types
 * `RETURN_TYPES` carries, each explained in one short line beside it (Stage
 * 10eb). Benchmarks follow the selected window and return type.
 *
 * Return attribution (default) and Benchmarks are subtabs below the toolbar.
 * Both retain their state while switching; `?rview=` shares the selected tab.
 * The panel scrolls inside itself. Benchmarks are tiles on one bar scale.
 *
 * A DATED WINDOW OPENS ON A MARKET VALUE, NEVER A COST. Each account opens on
 * its latest statement valuation on or before the opening date and closes on
 * its latest on or before the end; capital moved inside the window is a dated
 * flow (`periodReturns.ts`). Since investment is struck on the capital paid in
 * (`capitalRollup`, the Transactions card's own record). An account that cannot
 * be measured is NAMED with its reason, never blended in as zero.
 *
 * ONE RECORD, AND NEVER A PARTIAL RETURN (Stage 10fc). A dated window reads the
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
import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/Card";
import { AbsentCell } from "@/components/Absent";
import SegmentReturns from "@/components/SegmentReturns";
import { useViewParam } from "@/components/ViewToggle";
import { BENCHMARKS, benchmarkIdentity, benchmarkMismatchReason } from "@/lib/benchmarks";
import { fetchPriceHistory, priceErrorReason, type PriceHistory, type PriceResult } from "@/lib/prices";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate, DASH, changeColor } from "@/lib/format";
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
const RETURN_VIEWS = [
  { key: "attribution", label: "Return attribution" },
  { key: "benchmarks", label: "Benchmarks" },
] as const;

export default function PortfolioReturns() {
  const { statementPortfolio, fmtFromBase, scope } = usePortfolio();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useViewParam(RETURN_VIEWS, {}, "rview");
  const tabsId = useId();
  const money = (n: number) => fmtFromBase(n, { compact: true });

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

  const measuredFrom = !whole ? null : period === "inception" ? inception.rows.map((r) => r.first).sort()[0] ?? null : win?.measuredFrom ?? null;
  const measuredTo = !whole ? null : period === "inception" ? inception.rows.map((r) => r.valueAsOf).sort().at(-1) ?? null : win?.measuredTo ?? null;
  const days = measuredFrom && measuredTo ? daysBetween(measuredFrom, measuredTo) : null;
  const typeLabel = RETURN_TYPES.find((r) => r.key === rtype)!.label;
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

  const btn = (on: boolean) => `rounded-md px-2.5 py-1 text-[12px] font-semibold transition ${on ? "bg-champagne-400 text-ink-900 shadow-sm" : "text-slate-400 hover:text-slate-200"}`;
  const basisTag = annualise ? "a year" : "not annualised";
  // THE BARS ARE ONE SCALE: the largest move on the table, the portfolio's
  // included, fills half a track either side of zero.
  const barScale = Math.max(1e-9, ...[portfolioPct, ...benchRows.map((r) => r.pct)].filter((v): v is number => v != null).map(Math.abs));
  const bar = (v: number | null) => (v == null ? <span className="ret-bar opacity-40" aria-hidden /> : (
    <span className="ret-bar" aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px" style={{ backgroundColor: "rgba(148, 163, 184, 0.55)" }} />
      <span className={`absolute inset-y-0 rounded-full ${v >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
        style={{ opacity: 0.75, width: `${(Math.abs(v) / barScale) * 50}%`, ...(v >= 0 ? { left: "50%" } : { right: "50%" }) }} />
    </span>
  ));
  return (
    <div className="flex h-auto min-h-0 flex-col gap-3 lg:h-full" data-portfolio-returns>
      {/* ── ONE TOOLBAR (Stage 10fp): the period, the window and the measure on
          one strip, so the cards below start at the top of the panel. ── */}
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2" data-returns-toolbar>
        <div className="ret-well flex flex-wrap items-center gap-0.5" data-returns-periods>
          {PERIODS.map((p) => (
            <button key={p.key} type="button" title={p.title} className={btn(period === p.key)} data-returns-period={p.key} aria-pressed={period === p.key}
              onClick={() => set(p.key === "custom" ? { rp: "custom", rfrom: start ?? fromParam } : { rp: p.key === "fytd" ? null : p.key })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
          <label className="flex items-center gap-1.5" title="Opening date — the window opens on each account's value at the close of this day">
            <span className="label-xs">From</span>
            <input type="date" className="rounded-md border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-[12px] text-slate-200" data-returns-from
              value={period === "inception" ? (measuredFrom ?? "") : (start ?? "")} disabled={period === "inception"}
              onChange={(e) => set({ rp: "custom", rfrom: e.target.value || null })} />
          </label>
          <span className="text-slate-500" aria-hidden>→</span>
          <label className="flex items-center gap-1.5" title="Closing date — each account closes on its latest statement value on or before this day">
            <span className="label-xs">To</span>
            <input type="date" className="rounded-md border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-[12px] text-slate-200" data-returns-to
              value={end ?? ""} max={latest ?? undefined} disabled={period === "inception"}
              onChange={(e) => set({ rto: e.target.value || null })} />
          </label>
        </div>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-slate-400" data-returns-types
          title={RETURN_TYPES.find((r) => r.key === rtype)!.title}>
          <span className="label-xs">Return type</span>
          <select className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-[12.5px] font-semibold text-slate-100" data-returns-type-select
            value={rtype} onChange={(e) => set({ rtype: e.target.value === "xirr" ? null : e.target.value })}>
            {RETURN_TYPES.map((r) => (
              <option key={r.key} value={r.key} title={r.title} data-returns-type={r.key} data-active={rtype === r.key ? "true" : "false"}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="max-w-[16rem] truncate text-[11.5px] text-slate-500" data-returns-type-desc={rtype}>
            {RETURN_TYPES.find((r) => r.key === rtype)!.short}
          </span>
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto" data-returns-stack>
        <div role="tablist" aria-label="Return details" data-returns-tabs
          className="inline-flex w-fit shrink-0 items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
          {RETURN_VIEWS.map((v, index) => (
            <button key={v.key} type="button" role="tab" id={`${tabsId}-tab-${v.key}`}
              aria-selected={view === v.key} aria-controls={`${tabsId}-panel-${v.key}`}
              tabIndex={view === v.key ? 0 : -1} data-returns-tab={v.key}
              className={btn(view === v.key)} onClick={() => setView(v.key)}
              onKeyDown={(e) => {
                const next = e.key === "Home" ? 0 : e.key === "End" ? RETURN_VIEWS.length - 1
                  : e.key === "ArrowRight" ? (index + 1) % RETURN_VIEWS.length
                  : e.key === "ArrowLeft" ? (index + RETURN_VIEWS.length - 1) % RETURN_VIEWS.length : null;
                if (next == null) return;
                e.preventDefault();
                setView(RETURN_VIEWS[next].key);
                e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
              }}>
              {v.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${tabsId}-panel-attribution`} aria-labelledby={`${tabsId}-tab-attribution`}
          hidden={view !== "attribution"} tabIndex={0} className="shrink-0" data-returns-panel="attribution">
          <SegmentReturns />
        </div>

        {/* ── BENCHMARKS AS TILES, ONE BAR SCALE (Stage 10fp). Three columns
            stretched across the panel left most of a table empty; eight tiles
            in two rows carry the same figures — each index's return, its bar,
            and the portfolio's lead over it — with the portfolio first. ── */}
        <div role="tabpanel" id={`${tabsId}-panel-benchmarks`} aria-labelledby={`${tabsId}-tab-benchmarks`}
          hidden={view !== "benchmarks"} tabIndex={0} className="shrink-0" data-returns-panel="benchmarks" data-returns-benchmarks
          data-measured-from={measuredFrom ?? ""} data-measured-to={measuredTo ?? ""} data-measured-days={days ?? ""}>
        <Card title="Benchmarks"
          subtitle={`Each index's close-to-close return over the measured window, ${annualise ? "annualised because the selected return is" : "not annualised, as the selected return is not"}. Price indices exclude dividends. ${whole ? `Selected measure: ${typeLabel}.` : "With no whole-portfolio return measured, each index runs over the window asked for."}`}
          right={<span className="label-xs pt-1">{benchFrom && benchTo ? `${fmtDate(benchFrom)} → ${fmtDate(benchTo)}` : DASH} · {basisTag}</span>}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-returns-bench-table>
            <div className="ret-stat border-champagne-400" data-returns-bench-portfolio
              data-returns-pct={portfolioPct?.toFixed(4) ?? ""} data-returns-basis={measured?.shown ? measured.basis : ""}
              data-returns-excluded={excluded.length}>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-100">
                <span className="h-2 w-2 rounded-full bg-champagne-400" aria-hidden />Portfolio · {typeLabel}
              </div>
              <div className="mono mt-1.5 text-[18px] font-semibold">
                {portfolioPct != null ? <span className={changeColor(portfolioPct)}>{pctText(portfolioPct)}</span> : <AbsentCell reason={measured?.reason ?? "not measured on this window"} />}
              </div>
              <div className="mt-2 flex items-center gap-3">{bar(portfolioPct)}</div>
            </div>
            {benchRows.map((r) => {
              const gap = gapOf(r);
              return (
                <div key={r.key} className="ret-stat" data-returns-bench={r.key} data-bench-pct={r.pct != null ? r.pct.toFixed(4) : ""}
                  data-bench-gap={gap != null ? gap.toFixed(4) : ""} data-bench-from={r.span?.from ?? ""} data-bench-to={r.span?.to ?? ""}>
                  <div className="text-[12px] font-semibold text-slate-200" title={r.title}>{r.label}</div>
                  <div className="mono mt-1.5 text-[18px] font-semibold">
                    {r.pct != null && r.span
                      ? <span className={changeColor(r.pct)} title={`${fmtDate(r.span.from)} close ${r.span.v0.toFixed(2)} → ${fmtDate(r.span.to)} close ${r.span.v1.toFixed(2)} · ${r.span.days} days`}>{pctText(r.pct)}</span>
                      : <AbsentCell reason={r.reason ?? "not measured"} />}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {bar(r.pct)}
                    <span className="mono shrink-0 text-[11px]">
                      {gap != null
                        ? <span className={changeColor(gap)} title="The portfolio's return less the index's, in percentage points">{gap >= 0 ? "+" : ""}{gap.toFixed(2)} pp</span>
                        : <AbsentCell reason={portfolioPct == null ? "The portfolio's return is not measured on this window, so no lead over the index is struck" : (r.reason ?? "no index return")} />}
                    </span>
                  </div>
                </div>
              );
            })}
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
