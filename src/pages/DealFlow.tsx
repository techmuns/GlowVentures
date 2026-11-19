// ── DEAL FLOW — the private-market deal universe (client #441–#448) ──────────
//
//   Gaurav, 12 Nov 2026: *"tracking investment activity: other companies which
//   are getting funding, what sector, what business, who are the investors …
//   a weekly list … we go through those businesses … put them under watch list
//   or … reach out to the founders."*
//
// The WHOLE market of Indian startup funding (Inc42, via Glow Central Research) —
// the companies the family does NOT hold — as a deal-sourcing funnel: filter by
// date, sector → sub-sector, stage (exclude seed/pre-seed) and theme, sort by
// round size, add a company to the Watchlist, and open one to see all its rounds.
// Nothing is invented: the feed is funding ROUNDS only (no M&A, #441) and carries
// no founder contacts (#446) — both are named as not yet captured, not faked.
import { useMemo, useState } from "react";
import { Plus, Check, ExternalLink, X, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { ExportableTable } from "@/components/ExportableTable";
import { AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate } from "@/lib/format";
import {
  usePrivateDeals, filterDeals, facetCounts, themesOf, dealSizeInr, dealNameKey, STAGE_ORDER,
  type Deal, type DealFilter,
} from "@/lib/privateDeals";
import { usePrivateWatchlist } from "@/lib/privateWatchlist";

const PRESETS: [string, string][] = [["7d", "This week"], ["1m", "1 month"], ["3m", "3 months"], ["6m", "6 months"], ["12m", "12 months"], ["all", "All"]];
const SELECT = "rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus";

const today = () => new Date().toISOString().slice(0, 10);
const minusMonths = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };
const minusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const presetFrom = (p: string, earliest: string | null): string | null =>
  p === "all" ? earliest : p === "7d" ? minusDays(7) : minusMonths(Number(p.replace("m", "")));

export function DealFlow() {
  const feed = usePrivateDeals();
  const { inrPerUsd } = usePortfolio();
  const watch = usePrivateWatchlist();

  const [preset, setPreset] = useState("3m");
  const [sector, setSector] = useState<string | null>(null);
  const [subsector, setSubsector] = useState<string | null>(null);
  const [stages, setStages] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"amount" | "date">("amount");
  const [open, setOpen] = useState<string | null>(null); // company drawer
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busyAdd, setBusyAdd] = useState<string | null>(null);

  const deals = feed.status === "ready" ? feed.deals : [];
  const earliest = feed.status === "ready" ? feed.meta.from : null;

  const filter: DealFilter = useMemo(() => ({
    from: presetFrom(preset, earliest), to: today(),
    sector, subsector, stageGroups: stages, themes: theme ? new Set([theme]) : new Set(), query,
  }), [preset, earliest, sector, subsector, stages, theme, query]);

  // Facets are over the date-scoped set, so the dropdowns reflect the window.
  const dateScoped = useMemo(() => filterDeals(deals, { ...filter, sector: null, subsector: null, stageGroups: new Set(), themes: new Set(), query: "" }), [deals, filter]);
  const sectors = useMemo(() => facetCounts(dateScoped, (d) => d.sector), [dateScoped]);
  const subsectors = useMemo(() => facetCounts(sector ? dateScoped.filter((d) => d.sector === sector) : dateScoped, (d) => d.subsector), [dateScoped, sector]);
  const themeFacets = useMemo(() => facetCounts(dateScoped, (d) => themesOf(d)), [dateScoped]);
  const stageFacets = useMemo(() => { const m = new Map<string, number>(); for (const d of dateScoped) m.set(d.stageGroup, (m.get(d.stageGroup) ?? 0) + 1); return m; }, [dateScoped]);

  const filtered = useMemo(() => {
    const rows = filterDeals(deals, filter);
    rows.sort((a, b) => sort === "date"
      ? b.date.localeCompare(a.date)
      : ((dealSizeInr(b, inrPerUsd) ?? -1) - (dealSizeInr(a, inrPerUsd) ?? -1)) || b.date.localeCompare(a.date));
    return rows;
  }, [deals, filter, sort, inrPerUsd]);

  const CAP = 500;
  const shown = filtered.slice(0, CAP);

  const watchKeys = useMemo(() => {
    const s = new Set<string>();
    if (watch.state.status === "ready") for (const it of watch.state.items) s.add(dealNameKey(it.name));
    for (const k of added) s.add(k);
    return s;
  }, [watch.state, added]);

  const addToWatch = async (d: Deal) => {
    if (busyAdd) return;
    setBusyAdd(d.id);
    const r = await watch.save({
      name: d.company, kind: "company", legalEntity: "", sector: d.sector ?? "",
      notes: `From Deal Flow — ${[d.stage, d.amountText].filter(Boolean).join(" ")} on ${fmtDate(d.date)}${d.leadInvestor ? `, led by ${d.leadInvestor}` : ""}`,
      addedBy: "",
    });
    setBusyAdd(null);
    if (r.ok) setAdded((prev) => new Set(prev).add(dealNameKey(d.company)));
  };

  if (feed.status === "unavailable") {
    return (
      <>
        <PageHeader title="Deal Flow" subtitle="The market of Indian startup funding — companies you don't yet hold, to shortlist from." />
        <div className="mt-4" data-deal-feed="unavailable"><AbsentSection what={feed.reason} needs={feed.hint} /></div>
      </>
    );
  }

  const companyRounds = open ? deals.filter((d) => d.company === open).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const resetFilters = () => { setSector(null); setSubsector(null); setStages(new Set()); setTheme(null); setQuery(""); };

  return (
    <>
      <PageHeader title="Deal Flow"
        subtitle="The market of Indian startup funding rounds (Inc42, via Glow Central Research) — the companies you don't hold yet, for sourcing. Filter the funnel, add a company to your Watchlist, or open one for all its rounds." />

      <p className="mt-2 text-[12px] text-slate-500" data-prose-ok="names the feed's own limits so no reader mistakes an absence for a gap in the market">
        Funding rounds only — mergers &amp; acquisitions aren't in this feed yet (#441). Founder contacts (#446) and sources beyond Inc42 such as ET / YourStory (#447) aren't captured yet, so they're not shown rather than guessed.
      </p>

      {/* ── FILTER FUNNEL ─────────────────────────────────────────────────── */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2" data-deal-filters>
          <div className="flex items-center gap-1" role="group" aria-label="Date range">
            {PRESETS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPreset(k)} data-deal-preset={k} aria-pressed={preset === k}
                className={`rounded-md px-2 py-1 text-xs ring-focus ${preset === k ? "bg-champagne-500 text-ink-950 font-semibold" : "border border-ink-600 text-slate-300 hover:bg-ink-700/60"}`}>{label}</button>
            ))}
          </div>
          <span className="mx-1 h-5 w-px bg-ink-700" aria-hidden />
          <select className={SELECT} value={sector ?? ""} onChange={(e) => { setSector(e.target.value || null); setSubsector(null); }} data-deal-sector aria-label="Sector">
            <option value="">All sectors</option>
            {sectors.map((s) => <option key={s.value} value={s.value}>{s.value} ({s.count})</option>)}
          </select>
          <select className={SELECT} value={subsector ?? ""} onChange={(e) => setSubsector(e.target.value || null)} data-deal-subsector aria-label="Sub-sector" disabled={!subsectors.length}>
            <option value="">All sub-sectors</option>
            {subsectors.map((s) => <option key={s.value} value={s.value}>{s.value} ({s.count})</option>)}
          </select>
          <select className={SELECT} value={theme ?? ""} onChange={(e) => setTheme(e.target.value || null)} data-deal-theme aria-label="Theme">
            <option value="">All themes</option>
            {themeFacets.map((t) => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
          </select>
          <select className={SELECT} value={sort} onChange={(e) => setSort(e.target.value as "amount" | "date")} data-deal-sort aria-label="Sort by">
            <option value="amount">Largest raise first</option>
            <option value="date">Newest first</option>
          </select>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-500" aria-hidden />
            <input className={`${SELECT} w-52 pl-7`} placeholder="Company or investor…" value={query} onChange={(e) => setQuery(e.target.value)} data-deal-search aria-label="Search deals" />
          </label>
          {(sector || subsector || theme || stages.size || query) &&
            <button type="button" onClick={resetFilters} className="text-xs text-slate-400 underline ring-focus" data-deal-reset>Clear</button>}
        </div>

        {/* Stage multi-select — untick Seed / Pre-Seed to shortlist Series A+ (#443). */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Funding stage" data-deal-stages>
          <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-500">Stage</span>
          {STAGE_ORDER.map((g) => {
            const n = stageFacets.get(g) ?? 0; const on = stages.size === 0 || stages.has(g);
            return (
              <button key={g} type="button" disabled={!n && !stages.has(g)} data-deal-stage={g} aria-pressed={on}
                onClick={() => setStages((prev) => { const next = new Set(prev.size ? prev : STAGE_ORDER.filter((x) => (stageFacets.get(x) ?? 0) > 0)); next.has(g) ? next.delete(g) : next.add(g); return next; })}
                className={`rounded-full px-2.5 py-0.5 text-[11px] ring-focus disabled:opacity-40 ${on ? "bg-ink-700 text-slate-100 border border-ink-500" : "border border-ink-700 text-slate-500"}`}>
                {g} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── THE DEALS ─────────────────────────────────────────────────────── */}
      <Card className="mt-4" pad={false}
        title={`${filtered.length.toLocaleString("en-IN")} deal${filtered.length === 1 ? "" : "s"}`}
        subtitle={feed.status === "ready" ? `${fmtDate(filter.from ?? feed.meta.from ?? "")} to ${fmtDate(filter.to ?? today())} · of ${feed.meta.count.toLocaleString("en-IN")} captured · ${feed.meta.source}${feed.meta.asOf ? ` · as of ${fmtDate(feed.meta.asOf.slice(0, 10))}` : ""}${filtered.length > CAP ? ` · showing the top ${CAP} — narrow the filters to see the rest` : ""}` : ""}>
        <div className="overflow-x-auto" data-navigation-scroll="dealflow-1">
          <ExportableTable exportName="Deal Flow — private market funding" className="min-w-full text-[12.5px]" data-deal-table
            data-table-static="one row per funding round, sorted by the chosen order; a deal-sourcing funnel, not a figure table to rearrange">
            <thead className="label-xs border-b border-ink-700 text-left">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Sector / theme</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2 text-right">Raised</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Lead / investors</th>
                <th className="px-3 py-2 text-right">Watchlist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {shown.map((d) => {
                const onWatch = watchKeys.has(dealNameKey(d.company));
                const ts = themesOf(d);
                return (
                  <tr key={d.id} data-deal-row={d.id} data-deal-company={d.company}>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setOpen(d.company)} className="text-left font-medium text-slate-100 hover:text-champagne-400 ring-focus" data-deal-open={d.company}>{d.company}</button>
                      {d.businessModel && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">{d.businessModel}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-slate-300">{d.sector ?? "—"}</span>{d.subsector ? <span className="text-slate-500"> · {d.subsector}</span> : null}
                      {ts.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{ts.slice(0, 2).map((t) => <span key={t} className="rounded bg-champagne-500/10 px-1.5 py-0.5 text-[10px] text-champagne-400" data-deal-theme-chip={t}>{t}</span>)}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{d.stage ?? <span className="text-slate-600">—</span>}</td>
                    <td className="px-3 py-2 text-right mono text-slate-200">{d.amountText ?? <span className="text-slate-600" title="the source does not disclose the round size">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-400">{fmtDate(d.date)}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {d.leadInvestor ?? (d.investors[0] ?? <span className="text-slate-600">—</span>)}
                      {d.investors.length > 1 && <span className="ml-1 text-slate-600" title={d.investors.join(", ")}>+{d.investors.length - 1}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {d.sourceUrl && <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" title={d.sourceTitle ?? "Source"} className="text-slate-500 hover:text-slate-300 ring-focus" data-deal-source={d.id}><ExternalLink size={13} aria-hidden /></a>}
                        {onWatch
                          ? <span className="inline-flex items-center gap-1 text-[11px] text-gain" data-deal-onwatch={d.company}><Check size={13} aria-hidden /> On watchlist</span>
                          : <button type="button" onClick={() => void addToWatch(d)} disabled={busyAdd === d.id} data-deal-add={d.company}
                              className="inline-flex items-center gap-1 rounded-md border border-ink-600 px-2 py-0.5 text-[11px] text-slate-200 ring-focus hover:bg-ink-700/60 disabled:opacity-50">
                              <Plus size={13} aria-hidden /> {busyAdd === d.id ? "Adding…" : "Add"}
                            </button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400" data-deal-empty>No deals match these filters. Widen the date range or clear a filter.</td></tr>
              )}
            </tbody>
          </ExportableTable>
        </div>
      </Card>

      {/* ── COMPANY DRAWER: every captured round for one company (#445) ──────── */}
      {open && companyRounds.length > 0 && (() => {
        const first = companyRounds[0];
        const onWatch = watchKeys.has(dealNameKey(open));
        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setOpen(null)} data-deal-drawer={open}>
            <div className="h-full w-full max-w-md overflow-y-auto bg-ink-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">{open}</h2>
                  <p className="mt-0.5 text-xs text-slate-400">{[first.sector, first.subsector, first.businessModel].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-ink-700/60 ring-focus"><X size={18} /></button>
              </div>
              <div className="mt-2 flex gap-2">
                {onWatch
                  ? <span className="inline-flex items-center gap-1 rounded-md bg-gain/10 px-2.5 py-1 text-xs text-gain"><Check size={13} aria-hidden /> On watchlist</span>
                  : <button type="button" onClick={() => void addToWatch(first)} disabled={busyAdd === first.id}
                      className="inline-flex items-center gap-1 rounded-md bg-champagne-500 px-2.5 py-1 text-xs font-semibold text-ink-950 ring-focus hover:bg-champagne-400 disabled:opacity-50">
                      <Plus size={13} aria-hidden /> Add to watchlist</button>}
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-wide text-slate-500">Captured rounds ({companyRounds.length})</p>
              <p className="mb-2 text-[11px] text-slate-500" data-prose-ok="names what the per-company view cannot carry from this public feed">No business description or founder contact is captured for the universe yet — those come with the deeper sources (#445, #446).</p>
              <ol className="space-y-2.5">
                {companyRounds.map((r) => (
                  <li key={r.id} className="rounded-lg border border-ink-700 bg-ink-800/50 p-3" data-deal-round={r.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-100">{r.stage ?? "Round"}</span>
                      <span className="mono text-slate-200">{r.amountText ?? "—"}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{fmtDate(r.date)}{r.leadInvestor ? ` · led by ${r.leadInvestor}` : ""}</div>
                    {r.investors.length > 0 && <div className="mt-1 text-xs text-slate-500">{r.investors.join(", ")}</div>}
                    {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-champagne-400 hover:underline ring-focus">{r.sourceTitle ? r.sourceTitle.slice(0, 60) : "Source"} <ExternalLink size={11} aria-hidden /></a>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        );
      })()}
    </>
  );
}

export default DealFlow;
