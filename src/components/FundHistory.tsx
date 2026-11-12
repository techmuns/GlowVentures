/**
 * ── THE HISTORY TAB ON PRIVATE MARKET (client #414 / #415) ───────────────────
 *
 * The family asked to see each private fund's JOURNEY, not just its standing
 * figures: when each drawdown was called and each distribution came back, how its
 * value and money-weighted return moved over time, and the return over a window
 * they choose.
 *
 * Everything here is read from dated records the book already carries
 * (`src/lib/fundHistory.ts`), and NOTHING is fabricated:
 *
 *  - The capital-flow timeline and the cumulative paid-in / distributed chart are
 *    the fund's REAL dated calls and distributions.
 *  - The value / NAV trajectory is drawn only from dated valuations on record.
 *    A private fund files ONE dated valuation today, so the trajectory is a
 *    single point and the rest is an honest `AbsentSection` — it fills on its own
 *    when the family's periodic (quarterly) NAV statements arrive.
 *  - A money-weighted return over a CHOSEN window is shown only where a valuation
 *    exists at each end of it; otherwise the cell is a dash with the exact reason,
 *    never a guess. Today only the full inception→latest window computes.
 */
import { useMemo, type ReactNode } from "react";
import { useNavigationState } from "@/lib/useNavigationState";
import { fmtDate, fmtPct } from "@/lib/format";
import { sumOrNull } from "@/lib/analytics";
import { ExportableTable } from "@/components/ExportableTable";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { AbsentSection, AbsentCell, DASH } from "@/components/Absent";
import type { FundRow } from "@/lib/privateMarket";
import type { FundDated } from "@/lib/fundReturns";
import type { SchemeCall } from "@/lib/capitalCalls";
import { fundHistoryModel, periodFundXirr, type FlowEvent } from "@/lib/fundHistory";

type Money = (n: number | null | undefined, sign?: boolean) => string;

const KIND_WORD: Record<FlowEvent["kind"], string> = {
  call: "Capital call", income: "Income distribution", capital: "Capital distribution", equalisation: "Equalisation",
};
const FLOW_COLS = ["date", "event", "in", "out", "paidIn", "distributed"] as const;

/** A stat on the summary strip: a dash when absent, never a zero standing in for one. */
function Stat({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div className="min-w-[7rem] rounded-lg border border-ink-700 bg-ink-800/40 px-3 py-2" title={title}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

/**
 * The cumulative paid-in and distributed lines over the fund's own flow dates —
 * two step lines, REAL data. `currentColor` + a text class keeps it themed in
 * both modes with no new utility to remap. Deliberately NOT a value/NAV line:
 * that is the one series the book cannot draw yet, and it is an absence below.
 */
function CashChart({ events, money }: { events: FlowEvent[]; money: Money }) {
  if (events.length < 2) return null;
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const t0 = t(events[0].date), t1 = t(events[events.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const maxV = Math.max(1, ...events.map((e) => Math.max(e.paidIn, e.distributed)));
  const W = 640, H = 120, padL = 4, padR = 4, padT = 8, padB = 18;
  const x = (d: string) => padL + ((t(d) - t0) / span) * (W - padL - padR);
  const y = (v: number) => H - padB - (v / maxV) * (H - padT - padB);
  // Step-after path: hold a level until the next event, then step to the new level.
  const step = (pick: (e: FlowEvent) => number) => {
    let d = `M ${x(events[0].date).toFixed(1)} ${y(pick(events[0])).toFixed(1)}`;
    for (let i = 1; i < events.length; i++) {
      d += ` L ${x(events[i].date).toFixed(1)} ${y(pick(events[i - 1])).toFixed(1)} L ${x(events[i].date).toFixed(1)} ${y(pick(events[i])).toFixed(1)}`;
    }
    return d;
  };
  return (
    <figure className="mt-3 rounded-lg border border-ink-700 bg-ink-900/40 p-3" data-fund-cash-chart aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "120px" }} preserveAspectRatio="none">
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="currentColor" className="text-ink-600" strokeWidth={1} />
        <g className="text-champagne-400"><path d={step((e) => e.paidIn)} fill="none" stroke="currentColor" strokeWidth={1.75} /></g>
        <g className="text-emerald-400"><path d={step((e) => e.distributed)} fill="none" stroke="currentColor" strokeWidth={1.75} /></g>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-champagne-400 align-middle" />Cumulative paid in · {money(events[events.length - 1].paidIn)}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" />Cumulative distributed · {money(events[events.length - 1].distributed)}</span>
        <span className="text-slate-500">{fmtDate(events[0].date)} → {fmtDate(events[events.length - 1].date)}</span>
      </figcaption>
    </figure>
  );
}

export function FundHistory({ funds, fundDated, schemes, money, moneyFull }: {
  funds: FundRow[];
  fundDated: Map<string, FundDated>;
  schemes: SchemeCall[];
  money: Money;
  moneyFull: Money;
}) {
  // The selectable holdings: every private fund/company, largest value first, so
  // the default lands on the one most worth reading. The choice is in the URL.
  const options = useMemo(() => [...funds].sort((a, b) => b.mv - a.mv), [funds]);
  const [selKey, setSelKey] = useNavigationState<string>("pm-history-fund", options[0]?.securityKey ?? "");
  const sel = options.find((f) => f.securityKey === selKey) ?? options[0];
  const fd = sel ? fundDated.get(sel.securityKey) : undefined;
  const model = useMemo(() => fundHistoryModel(fd, sel?.securityKey ?? ""), [fd, sel?.securityKey]);

  // Committed / still-to-call, joined from the capital-account statements of the
  // accounts this holding actually spans. sumOrNull keeps a missing figure absent.
  const accountIds = useMemo(() => new Set([...(fd?.calls ?? []), ...(fd?.parts ?? [])].map((r) => r.accountId)), [fd]);
  const ownSchemes = schemes.filter((s) => accountIds.has(s.accountId));
  const committed = sumOrNull(ownSchemes.map((s) => s.committed));
  const stillToCall = sumOrNull(ownSchemes.map((s) => s.uncalled));

  const flowView = useTableView("pm-history-flows", FLOW_COLS, { manualEditor: false });
  const rows = sortRows(model.timeline, flowView.sort, {
    date: (e) => e.date, event: (e) => KIND_WORD[e.kind], in: (e) => (e.direction === "in" ? e.amount : null),
    out: (e) => (e.direction === "out" ? e.amount : null), paidIn: (e) => e.paidIn, distributed: (e) => e.distributed,
  });

  // The chosen window — defaults to the full inception→latest window the fund can
  // actually offer, so the control opens on the real IRR rather than a dash.
  const [from, setFrom] = useNavigationState<string>("hfrom", model.fullWindow?.from ?? "");
  const [to, setTo] = useNavigationState<string>("hto", model.fullWindow?.to ?? "");
  const effFrom = from || model.fullWindow?.from || "";
  const effTo = to || model.fullWindow?.to || "";
  const irr = effFrom && effTo ? periodFundXirr(fd, effFrom, effTo) : null;
  const dpi = model.dpi, tvpi = model.tvpi;

  if (!sel) {
    return <div className="p-6 text-sm text-slate-400">No private funds to show.</div>;
  }

  return (
    <div className="p-4" data-pm-table="history">
      {/* The holding picker — a fund or company, by its legal name. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-slate-400" htmlFor="pm-history-select">Fund or company</label>
        <select id="pm-history-select" data-fund-history-select value={sel.securityKey}
          onChange={(e) => setSelKey(e.target.value)}
          className="rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-sm text-slate-200">
          {options.map((f) => <option key={f.securityKey} value={f.securityKey}>{f.security}</option>)}
        </select>
        {sel.asOf.length > 0 && <span className="text-xs text-slate-500">valued {sel.asOf.map(fmtDate).join(" · ")}</span>}
      </div>

      {/* Summary — real figures; a missing one is a dash with its reason, never a zero. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Stat label="Value" value={money(sel.mv)} title="The fund's own mark on its latest statement." />
        <Stat label="Cost" value={sel.cost == null ? <AbsentCell reason="No statement reports a cost for this holding." /> : money(sel.cost)} />
        <Stat label="Paid in" value={model.paidIn > 0 ? money(model.paidIn) : <AbsentCell reason="No dated capital call is on record for this fund." />}
          title="Cash drawn by the fund across its dated calls." />
        <Stat label="Distributed" value={model.distributionsKnown ? money(model.distributed) : <AbsentCell reason="No distribution record is on file for this fund, so what it has paid back is not known." label="no record" />}
          title="What the fund has paid back, across its dated distribution records. A measured ₹0 means its papers report nothing paid back yet." />
        <Stat label="Committed" value={committed == null ? <AbsentCell reason="No capital-account statement for this holding states a commitment." /> : money(committed)} />
        <Stat label="Still to call" value={stillToCall == null ? <AbsentCell reason="No capital-account statement states an uncalled amount." /> : money(stillToCall)} />
        <Stat label="DPI" value={dpi == null ? <AbsentCell reason={model.distributionsKnown ? "DPI needs paid-in capital on record." : "DPI needs the fund's distribution record, which this book does not carry for it."} label={model.distributionsKnown ? "no paid-in" : "no record"} /> : `${dpi.toFixed(2)}×`}
          title="Distributions ÷ paid-in (ILPA)." />
        <Stat label="TVPI" value={tvpi == null ? <AbsentCell reason="TVPI needs both paid-in capital and a current valuation." label="awaiting data" /> : `${tvpi.toFixed(2)}×`}
          title="(Distributions + current value) ÷ paid-in (ILPA)." />
      </div>

      {/* ── BLOCK A — Capital flow history (REAL) ───────────────────────────── */}
      <h3 className="mt-6 text-[13px] font-semibold text-slate-200" data-prose-ok="section heading, not an explainer line">Capital flow history</h3>
      {model.timeline.length === 0 ? (
        <AbsentSection what="No dated capital events on record for this fund"
          needs={fd?.gap ?? "the fund's dated capital-account statements — its calls and distribution letters — which this book does not carry for this holding yet"} />
      ) : (
        <>
          <CashChart events={model.timeline} money={money} />
          <div className="mt-3 overflow-x-auto">
            <ExportableTable exportName={`Fund history — ${sel.security} — capital flows`} className="min-w-full text-[13px]" data-fund-flow-table>
              <thead className="border-b border-ink-700">
                <Tr view={flowView}>
                  <SortHeader col="date" view={flowView} align="left">Date</SortHeader>
                  <SortHeader col="event" view={flowView} align="left"
                    title="The fund's own kind of event — a capital call, or a distribution (income, capital or equalisation).">Event</SortHeader>
                  <SortHeader col="in" view={flowView} title="Cash the fund called from the family.">Money in</SortHeader>
                  <SortHeader col="out" view={flowView} title="Cash the fund paid back.">Money out</SortHeader>
                  <SortHeader col="paidIn" view={flowView} title="Running total paid in, after this event.">Paid in to date</SortHeader>
                  <SortHeader col="distributed" view={flowView} title="Running total distributed, after this event.">Distributed to date</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {rows.map((e, i) => (
                  <Tr view={flowView} key={`${e.accountId}-${e.date}-${e.kind}-${i}`} className="hover:bg-ink-700/40" data-fund-flow-row={e.date}>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-300">{fmtDate(e.date)}</td>
                    <td className="px-4 py-2 text-slate-300">{KIND_WORD[e.kind]}{e.afterValuation ? <span className="ml-1 text-[10px] text-slate-500" title="Dated after the fund's valuation — already inside that value, shown for the record and not added to it again.">post-valuation</span> : null}</td>
                    <td className="px-4 py-2 text-right mono text-champagne-300">{e.direction === "in" ? moneyFull(e.amount) : DASH}</td>
                    <td className="px-4 py-2 text-right mono text-emerald-300">{e.direction === "out" ? moneyFull(e.amount) : DASH}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{money(e.paidIn)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{money(e.distributed)}</td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <TrFoot view={flowView} className="border-t-2 border-ink-600 px-4 py-2.5 font-semibold text-slate-200"
                  label={<>{rows.length} events</>}
                  cells={{
                    paidIn: <td key="paidIn" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{money(model.paidIn)}</td>,
                    distributed: <td key="distributed" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{money(model.distributed)}</td>,
                  }} />
              </tfoot>
            </ExportableTable>
          </div>
        </>
      )}

      {/* ── BLOCK B — Value & NAV over time (trajectory awaits quarterly NAVs) ── */}
      <h3 className="mt-6 text-[13px] font-semibold text-slate-200" data-prose-ok="section heading, not an explainer line">Value &amp; NAV over time</h3>
      {model.hasTrajectory ? (
        <div className="mt-3 overflow-x-auto" data-fund-nav-trajectory>
          <table className="min-w-full text-[13px]" data-table-static="a short dated valuation series, in date order">
            <thead className="border-b border-ink-700"><tr>
              <th scope="col" className="px-4 py-2 text-left text-slate-400">Valued on</th>
              <th scope="col" className="px-4 py-2 text-right text-slate-400">Value</th>
              <th scope="col" className="px-4 py-2 text-right text-slate-400">Cost</th>
            </tr></thead>
            <tbody className="divide-y divide-ink-700/60">
              {model.valuations.map((v) => (
                <tr key={v.date}><td className="px-4 py-2 text-slate-300">{fmtDate(v.date)}</td>
                  <td className="px-4 py-2 text-right mono text-slate-200">{money(v.value)}</td>
                  <td className="px-4 py-2 text-right mono text-slate-400">{v.cost == null ? DASH : money(v.cost)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3">
          {model.latestValuedAt && (
            <p className="mb-3 text-sm text-slate-300" data-prose-ok="states the one valuation on record, the half an absence must keep on its face">
              One dated valuation on record: <span className="font-semibold text-slate-100">{money(model.latestValue)}</span> on {fmtDate(model.latestValuedAt)}.
            </p>
          )}
          <AbsentSection what="A quarter-by-quarter value &amp; NAV trajectory" needs={model.trajectoryNeeds} />
        </div>
      )}

      {/* ── BLOCK C — Money-weighted return over a chosen window (#415) ─────── */}
      <h3 className="mt-6 text-[13px] font-semibold text-slate-200" data-prose-ok="section heading, not an explainer line">Money-weighted return (IRR)</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400">From
          <input type="date" data-fund-irr-from value={effFrom} max={effTo || undefined} onChange={(e) => setFrom(e.target.value)}
            className="ml-2 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-sm text-slate-200" />
        </label>
        <label className="text-xs text-slate-400">To
          <input type="date" data-fund-irr-to value={effTo} min={effFrom || undefined} onChange={(e) => setTo(e.target.value)}
            className="ml-2 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-sm text-slate-200" />
        </label>
        {model.fullWindow && (
          <button type="button" data-fund-irr-reset onClick={() => { setFrom(model.fullWindow!.from); setTo(model.fullWindow!.to); }}
            className="rounded-md border border-ink-600 px-2 py-1 text-xs text-slate-400 hover:bg-ink-700/60">Full history</button>
        )}
      </div>
      <div className="mt-3 rounded-lg border border-ink-700 bg-ink-800/40 px-4 py-3" data-fund-irr>
        {!irr ? (
          <span className="text-sm text-slate-400">Choose a start and end date.</span>
        ) : irr.ok ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xl font-semibold text-slate-100">{fmtPct(irr.pct)}</span>
            <span className="text-xs text-slate-400">{irr.annualised ? "annualised (window ≥ 1 year)" : "absolute return over the window (under a year, not annualised)"} · {fmtDate(irr.from)} → {fmtDate(irr.to)}</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm" data-fund-irr-absent>
            <AbsentCell reason={`${irr.reason}.`} label="needs a NAV" />
            <span className="text-slate-400">{irr.reason}.</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500" data-prose-ok="names the live limit and when it lifts — the honest caveat the whole feature turns on">
        A money-weighted return over a window needs the fund's value at both ends of it.
        {model.latestValuedAt ? ` Only one dated valuation (${fmtDate(model.latestValuedAt)}) is on record, so only the full inception-to-latest window computes today; a narrower range fills on its own the moment the fund's quarterly NAV statements are added.` : " No dated valuation is on record yet, so no window computes until the fund's NAV statements are added."}
      </p>
    </div>
  );
}
