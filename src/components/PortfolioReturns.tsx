/**
 * ── MORNING CIO → RETURNS (Stage 10dq) ───────────────────────────────────────
 *
 * A period selector (MTD, YTD, FYTD, trailing 1Y/2Y/3Y, since investment and a
 * custom From/To), a return-type selector (XIRR, Absolute, Simple, CAGR) and
 * the formula of the type selected, with the window actually measured printed
 * beside the one asked for.
 *
 * A DATED WINDOW OPENS ON A MARKET VALUE, NEVER A COST. Each account opens on
 * its latest statement valuation on or before the opening date and closes on
 * its latest on or before the end; capital moved inside the window is a dated
 * flow (`periodReturns.ts`). Since investment is struck on the capital paid in
 * (`capitalRollup`, the Transactions card's own record). An account that cannot
 * be measured is NAMED with its reason, never blended in as zero.
 *
 * No line on the face reads as a sentence (Stage 10cp): every explanation is a
 * hover on the figure or control it explains.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/Card";
import { AbsentCell } from "@/components/Absent";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate, DASH, changeColor } from "@/lib/format";
import { mandateLabel } from "@/lib/analytics";
import { inScopeAccount } from "@/lib/memberScope";
import { capitalMovesWithCalls, capitalRollup, capitalWindow } from "@/lib/tranches";
import {
  BOOK_ACCOUNT_CASH_FLOWS, BOOK_ACCOUNT_NAV_HISTORY, BOOK_CAPITAL_FROM_INCEPTION, BOOK_CAPITAL_MOVES,
  BOOK_COMMITMENTS, BOOK_NAV_COVERAGE, BOOK_POSITION_TRANCHES, BOOK_REVIEW_FLOWS, BOOK_UNDATED_CAPITAL,
} from "@/data/glowData";
import {
  PERIODS, RETURN_TYPES, FORMULAS, INCEPTION_FORMULAS, periodStart, windowReturns, measureWindow,
  measureInception, daysBetween,
  type AccountInput, type InceptionRow, type PeriodKey, type ReturnType, type Measured,
} from "@/lib/periodReturns";

const OPENING_ROW = /^opening portfolio value/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pctText = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const basisWord = (m: Measured) => m.basis === "annual" ? "a year" : "not annualised";

/** The formula's visible part, and the explanation that belongs in its hover. */
function splitFormula(f: string): { face: string; hover: string } {
  const i = f.indexOf(" — ");
  return i < 0 ? { face: f, hover: "" } : { face: f.slice(0, i), hover: f.slice(i + 3) };
}

const RET_COLS = ["account", "owner", "open", "close", "in", "out", "gain", "ret"] as const;

export default function PortfolioReturns() {
  const { statementPortfolio, fmtFromBase, scope } = usePortfolio();
  const [params, setParams] = useSearchParams();
  const money = (n: number) => fmtFromBase(n, { compact: true });
  const view = useTableView("cio-returns", RET_COLS);

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
    const coverage = new Map(BOOK_NAV_COVERAGE.covered.map((c) => [c.accountId, c]));
    const groups = capitalRollup(
      capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, statementPortfolio.accounts, BOOK_REVIEW_FLOWS),
      statementPortfolio.accounts, statementPortfolio.positions, BOOK_POSITION_TRANCHES, "all", "recent",
      { commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION },
    );
    const out: AccountInput[] = [];
    for (const a of statementPortfolio.accounts) {
      const label = mandateLabel(a) || a.provider;
      const base = { accountId: a.accountId, label: `${label} · ${a.accountNo}`, owner: a.owner };
      const undated = BOOK_UNDATED_CAPITAL.filter((u) => u.accountId === a.accountId)
        .map((u) => ({ from: u.from, to: u.to, amount: u.undated }));
      if (a.reviewHolder) {
        out.push({ ...base, valuations: [], flows: [], knownFrom: null, knownTo: null, undated,
          flowsUnknown: "the family's review values its lines on one date, so no window can be struck over it" });
        continue;
      }
      const vals = new Map<string, number>();
      for (const p of BOOK_ACCOUNT_NAV_HISTORY[a.accountId] ?? []) vals.set(p.date, p.nav);
      const held = statementPortfolio.positions.filter((p) => p.accountId === a.accountId);
      if (held.length && !vals.has(a.asOf)) vals.set(a.asOf, held.reduce((s, p) => s + (p.marketValue ?? 0), 0));
      const cash = BOOK_ACCOUNT_CASH_FLOWS[a.accountId] ?? [];
      const opening = cash.find((c) => OPENING_ROW.test(c.description ?? ""));
      let flows: { date: string; amount: number }[] = [];
      let knownFrom: string | null = null;
      let knownTo: string | null = null;
      let flowsUnknown: string | null = null;
      const mine = groups.filter((g) => g.accountId === a.accountId);
      if (opening) {
        const d = new Date(`${opening.date}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        const openDate = d.toISOString().slice(0, 10);
        vals.set(openDate, -opening.amount);
        flows = cash.filter((c) => c !== opening).map((c) => ({ date: c.date, amount: c.amount }));
        knownFrom = openDate;
        knownTo = a.capitalRecordTo ?? a.asOf;
      } else if (mine.length === 1 && mine[0].flows && mine[0].appreciation != null && capitalWindow(mine[0])) {
        flows = mine[0].flows.map((f) => ({ date: f.date, amount: f.amount }));
        knownTo = capitalWindow(mine[0])!.to;
      } else if (coverage.get(a.accountId)?.flowBasis === "units-unchanged") {
        const c = coverage.get(a.accountId)!;
        knownFrom = c.first; knownTo = c.last;
      } else {
        flowsUnknown = mine.length
          ? (mine.find((g) => g.incompleteReason)?.incompleteReason ?? "its capital record does not reach the date its value is struck on")
          : "no statement dates the capital put in or taken out";
      }
      out.push({ ...base, valuations: [...vals].map(([date, value]) => ({ date, value })), flows, knownFrom, knownTo, flowsUnknown, undated });
    }
    return out;
  }, [statementPortfolio]);

  const inception = useMemo<{ rows: InceptionRow[]; skipped: { label: string; reason: string }[] }>(() => {
    if (!statementPortfolio) return { rows: [], skipped: [] };
    const moves = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, statementPortfolio.accounts, BOOK_REVIEW_FLOWS)
      .filter((m) => inScopeAccount(scope.accountIds, m.accountId));
    const groups = capitalRollup(moves, statementPortfolio.accounts, statementPortfolio.positions, BOOK_POSITION_TRANCHES, "all", "recent",
      { commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION });
    const rows: InceptionRow[] = [];
    const skipped: { label: string; reason: string }[] = [];
    for (const g of groups) {
      const w = capitalWindow(g);
      const label = `${g.label} · ${g.accountNo}`;
      if (g.atCost) { skipped.push({ label, reason: "held at its cost, so it carries no gain" }); continue; }
      if (!w || !g.flows || g.value == null || g.appreciation == null) {
        skipped.push({ label, reason: g.incompleteReason ?? "its dated capital record or its value is incomplete" });
        continue;
      }
      rows.push({ accountId: g.key, label, owner: g.owner, first: w.from, valueAsOf: w.to,
        paidIn: g.paidIn, takenOut: g.tookOut ?? 0, value: g.value,
        flows: g.flows.map((f) => ({ date: f.date, amount: f.amount })) });
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
  const measured: Measured | null = period === "inception"
    ? measureInception(inception.rows, rtype, money)
    : win ? measureWindow(win.included, rtype, money) : null;
  const formula = splitFormula(period === "inception" ? INCEPTION_FORMULAS[rtype] : FORMULAS[rtype]);

  // ── Rows ───────────────────────────────────────────────────────────────
  type Row = { id: string; label: string; owner: string; open: number | null; openDate: string; close: number; closeDate: string; cin: number; cout: number; gain: number; m: Measured };
  const rows: Row[] = useMemo(() => {
    if (period === "inception") {
      return inception.rows.map((r) => ({
        id: r.accountId, label: r.label, owner: r.owner, open: null, openDate: r.first,
        close: r.value, closeDate: r.valueAsOf, cin: r.paidIn, cout: r.takenOut,
        gain: r.value + r.takenOut - r.paidIn, m: measureInception([r], rtype, money),
      }));
    }
    return (win?.included ?? []).map((w) => ({
      id: w.accountId, label: w.label, owner: w.owner, open: w.openValue, openDate: w.openDate,
      close: w.closeValue, closeDate: w.closeDate, cin: w.capitalIn, cout: w.capitalOut, gain: w.gain,
      m: measureWindow([w], rtype, money),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, inception, win, rtype]);
  const sorted = sortRows(rows, view.sort, {
    account: (r) => r.label, owner: (r) => r.owner, open: (r) => r.open, close: (r) => r.close,
    in: (r) => r.cin, out: (r) => r.cout, gain: (r) => r.gain, ret: (r) => (r.m.shown ? r.m.pct ?? null : null),
  });
  const excluded = period === "inception" ? inception.skipped : (win?.excluded ?? []).map((e) => ({ label: e.label, reason: e.reason }));

  const total = period === "inception"
    ? { open: null as number | null, cin: inception.rows.reduce((s, r) => s + r.paidIn, 0), cout: inception.rows.reduce((s, r) => s + r.takenOut, 0), close: inception.rows.reduce((s, r) => s + r.value, 0) }
    : win ? { open: win.openValue, cin: win.capitalIn, cout: win.capitalOut, close: win.closeValue } : null;
  const gainTotal = total ? total.close - (total.open ?? 0) - total.cin + total.cout : null;
  const measuredFrom = period === "inception" ? inception.rows.map((r) => r.first).sort()[0] ?? null : win?.measuredFrom ?? null;
  const measuredTo = period === "inception" ? inception.rows.map((r) => r.valueAsOf).sort().at(-1) ?? null : win?.measuredTo ?? null;
  const days = measuredFrom && measuredTo ? daysBetween(measuredFrom, measuredTo) : null;
  const accountsTotal = period === "inception" ? inception.rows.length + inception.skipped.length : inputs.length;

  const btn = (on: boolean) => `rounded-md px-2.5 py-1 text-[12px] font-semibold transition ${on ? "bg-champagne-400 text-ink-900" : "text-slate-400 hover:text-slate-200 hover:bg-ink-700/50"}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4" data-portfolio-returns>
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
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-ink-700 p-1" data-returns-types>
          {RETURN_TYPES.map((r) => (
            <button key={r.key} type="button" title={r.title} className={btn(rtype === r.key)} data-returns-type={r.key} aria-pressed={rtype === r.key}
              onClick={() => set({ rtype: r.key === "xirr" ? null : r.key })}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Window, figures, formula ── */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <Card title="Window" subtitle="The window asked for, and the one the accounts' own statement dates actually span">
          <div className="space-y-1 text-[12.5px]" data-returns-window>
            <div className="text-slate-400">Requested <span className="mono text-slate-200" data-returns-requested>
              {period === "inception" ? "since each account's first purchase" : start && end ? `${fmtDate(start)} → ${fmtDate(end)}` : DASH}
            </span></div>
            <div className="text-slate-400" title="Each account opens on its latest statement value on or before the opening date asked for, and closes on its latest on or before the closing date — so the measured window can start earlier than the one asked for, and is shown here as measured">Measured <span className="mono text-slate-100" data-returns-measured
              data-measured-from={measuredFrom ?? ""} data-measured-to={measuredTo ?? ""} data-measured-days={days ?? ""}>
              {measuredFrom && measuredTo ? `${fmtDate(measuredFrom)} → ${fmtDate(measuredTo)} · ${days} days` : DASH}
            </span></div>
            <div className="text-slate-400" title="Accounts left out are named below, each with its reason">Covers <span className="mono text-slate-200" data-returns-coverage>{rows.length} of {accountsTotal} accounts</span></div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
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
                  {typeof v === "number" ? money(v) : <AbsentCell reason={h as string} />}
                </div>
              </div>
            ))}
            <div title={measured?.reason ?? measured?.worked ?? ""} data-returns-figure="Return">
              <div className="label-xs">Return · {RETURN_TYPES.find((r) => r.key === rtype)!.label}</div>
              {measured?.shown && measured.pct != null ? (
                <div className={`mono font-semibold ${changeColor(measured.pct)}`} data-returns-pct={measured.pct.toFixed(4)} data-returns-basis={measured.basis}>
                  {pctText(measured.pct)} <span className="text-[11px] font-normal text-slate-500">{basisWord(measured)}</span>
                </div>
              ) : (
                <div data-returns-pct=""><AbsentCell reason={measured?.reason ?? "pick a window whose opening date is before its closing date"} /></div>
              )}
            </div>
          </div>
        </Card>
        <Card title="Formula" subtitle={RETURN_TYPES.find((r) => r.key === rtype)!.title}>
          <div className="mono text-[13px] text-slate-100" data-returns-formula={rtype} title={formula.hover || undefined}>{formula.face}</div>
          <div className="mt-2 text-[12px] text-slate-400" title={measured?.worked ?? measured?.reason ?? ""} data-returns-worked>
            {measured?.shown && measured.pct != null ? `= ${pctText(measured.pct)} · ${basisWord(measured)}` : "Not measured on this window"}
          </div>
        </Card>
      </div>

      {/* ── Per account ── */}
      <Card pad={false} className="flex min-h-0 flex-1 flex-col" title="By account" subtitle="Each account on its own dates; the return beside it is the measure picked above">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]" data-returns-table>
            <thead className="sticky top-0 z-10 bg-ink-800 border-b border-ink-700">
              <Tr view={view}>
                <SortHeader col="account" view={view} align="left" pad="px-4 py-2">Account</SortHeader>
                <SortHeader col="owner" view={view} align="left" pad="px-3 py-2">Owner</SortHeader>
                <SortHeader col="open" view={view} pad="px-3 py-2">{period === "inception" ? "First purchase" : "Opening"}</SortHeader>
                <SortHeader col="close" view={view} pad="px-3 py-2">Closing</SortHeader>
                <SortHeader col="in" view={view} pad="px-3 py-2">Capital in</SortHeader>
                <SortHeader col="out" view={view} pad="px-3 py-2">Capital out</SortHeader>
                <SortHeader col="gain" view={view} pad="px-3 py-2">Gain</SortHeader>
                <SortHeader col="ret" view={view} pad="px-3 py-2">Return</SortHeader>
              </Tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {sorted.map((r) => (
                <Tr view={view} key={r.id} data-returns-account={r.id}>
                  <td className="px-4 py-2 text-slate-200">{r.label}</td>
                  <td className="px-3 py-2 text-slate-400">{r.owner}</td>
                  <td className="px-3 py-2 text-right mono text-slate-300">
                    {r.open == null ? fmtDate(r.openDate) : <span title={`Statement value on ${r.openDate}`}>{money(r.open)}</span>}
                  </td>
                  <td className="px-3 py-2 text-right mono text-slate-300" title={`Statement value on ${r.closeDate}`}>{money(r.close)}</td>
                  <td className="px-3 py-2 text-right mono text-slate-400">{money(r.cin)}</td>
                  <td className="px-3 py-2 text-right mono text-slate-400">{money(r.cout)}</td>
                  <td className={`px-3 py-2 text-right mono ${changeColor(r.gain)}`}>{money(r.gain)}</td>
                  <td className="px-3 py-2 text-right mono" data-returns-row-pct={r.m.shown && r.m.pct != null ? r.m.pct.toFixed(4) : ""}>
                    {r.m.shown && r.m.pct != null
                      ? <span className={changeColor(r.m.pct)} title={r.m.worked}>{pctText(r.m.pct)} <span className="text-[10.5px] text-slate-500">{r.m.basis === "annual" ? "p.a." : "abs"}</span></span>
                      : <AbsentCell reason={r.m.reason ?? "not measured"} />}
                  </td>
                </Tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-4 py-3 text-[12.5px] text-slate-500" data-returns-empty>No account can be measured over this window</p>}
          {excluded.length > 0 && (
            <details className="border-t border-ink-700 px-4 py-2 text-[12px]" data-returns-excluded={excluded.length}>
              <summary className="cursor-pointer text-slate-400" title="Each is named with the reason it cannot be measured; none is counted as zero">
                Not measured · {excluded.length} accounts
              </summary>
              <ul className="mt-1 space-y-0.5">
                {excluded.map((e) => (
                  <li key={e.label} className="text-slate-400" title={e.reason} data-returns-excluded-row>{e.label} · {DASH}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Card>
    </div>
  );
}
