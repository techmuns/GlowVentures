import { useEffect, useMemo, useState } from "react";
import { Factory, ClipboardList, Newspaper, LineChart as LineIcon, Package } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { StockLink } from "@/components/StockLink";
import { AbsentSection } from "@/components/Absent";
import { SeriesChart } from "@/components/SeriesChart";
import { usePortfolio } from "@/context/PortfolioContext";
import { dedupedPositions } from "@/lib/analytics";
import { getHoldingsNews, type NewsResponse, type NewsHolding } from "@/lib/news";
import { fmtPct, changeColor } from "@/lib/format";
import {
  fetchSeriesIndex, fetchSeriesPoints, sliceRange, yearForRange,
  fmtLevel, fmtReturn, returnTone,
  type SeriesIndex, type SeriesEntry, type Point,
} from "@/lib/series";

// LAYER 2 · INDUSTRY RESEARCH (FOOS spec).
//
// WHAT IS LIVE HERE, AND WHY IT IS THE HALF THAT MATTERS MOST
// ──────────────────────────────────────────────────────────
// The spec splits an industry dashboard in two: INDUSTRY STRUCTURE (size, growth,
// capacity, utilisation, order book) and INDUSTRY ECONOMICS (raw material prices,
// input cost trends, realisations). The economics half is now entirely live —
// every input cost below is a real series out of `public/series/`, with its full
// history, its returns and a chart, because Phases 0–2 harvested exactly these:
// coal, iron ore, HRC steel, the base metals, crude, gas, spot power and the
// fertiliser complex.
//
// The STRUCTURE half is not, and is named rather than drawn. Indian capacity and
// production come from CEA, the Ministry of Coal and the Joint Plant Committee as
// monthly PDF and XLS reports behind dynamic selectors — a reader per source, not
// a URL. Order books exist only inside individual companies' filings.
//
// THE BOOK CARRIES SECTORS, NOT INDUSTRIES, and this page does not pretend
// otherwise. `Position.sector` is GICS ("Materials", "Utilities"); there is no
// "Cement" classification anywhere in the archive. So the exposure panel says
// which SECTORS it matched and lists the holdings in them — it never claims those
// companies are in the industry above. Asserting an industry the statements never
// stated would be a fabricated classification, which is the same failure as an
// index-cycled valuation method.

type Input = { id: string; role: string };

type IndustryDef = {
  key: string;
  label: string;
  /** Series from the store that ARE this industry's input costs or output price. */
  inputs: Input[];
  /** GICS sectors in the book that overlap. Named as sectors, never as the industry. */
  sectors: string[];
  /** What the spec asks for that no source we have serves. */
  absent: { what: string; why: string }[];
};

const CAPACITY_ABSENT = {
  what: "Capacity, capacity utilisation and production",
  why: "Each of these is a separate ministry report with its own layout, and only one has turned out to be both free and machine-readable: CEA's monthly installed-capacity workbook, which the Electricity industry below now reads. The Ministry of Coal and the Joint Plant Committee publish theirs as PDF, and SIAM's vehicle statistics sit behind a member subscription — that last one is a commercial licence rather than a reader.",
};
const ORDERBOOK_ABSENT = {
  what: "Order book and order inflows",
  why: "These are disclosed per company in results and filings, not as an industry aggregate. Building the aggregate means parsing every constituent's filing and summing — derivable in principle, but from a corpus this book does not hold.",
};
const REALISATION_ABSENT = {
  what: "Realisations and pricing power",
  why: "A realisation is revenue divided by volume shipped, both of which are company disclosures. The input costs below are the observable half of the margin; the output half needs company data.",
};

const INDUSTRIES: IndustryDef[] = [
  {
    key: "cement", label: "Cement",
    inputs: [
      { id: "thermal-coal", role: "Kiln fuel" },
      { id: "electricity-india", role: "Grinding power" },
      { id: "brent-crude", role: "Freight & fuel" },
    ],
    sectors: ["Materials"],
    absent: [
      CAPACITY_ABSENT,
      { what: "Region-wise (North / South / East / West) pricing", why: "Indian cement prices are regional and are published by trade press and paid research (CMA, Crisil), not by any free source. The spec names this explicitly and it stays absent rather than being approximated from a national figure." },
      REALISATION_ABSENT, ORDERBOOK_ABSENT,
    ],
  },
  {
    key: "steel", label: "Steel",
    inputs: [
      { id: "iron-ore", role: "Raw material" },
      { id: "steel-hrc", role: "Output price (US HRC)" },
      { id: "zinc", role: "Galvanising" },
      { id: "electricity-india", role: "Power" },
    ],
    sectors: ["Materials"],
    absent: [
      { what: "Coking coal", why: "The Pink Sheet publishes thermal coal only, and no free feed carries metallurgical coal. It is steel's second input cost and needs a commercial source (Platts, Argus)." },
      { what: "Indian HRC and long-product prices", why: "The output price shown is the US Midwest HRC future, which is a global reference and NOT the Indian domestic price. Indian mill prices come from paid trade press." },
      CAPACITY_ABSENT, ORDERBOOK_ABSENT,
    ],
  },
  {
    key: "crude-derivatives", label: "Crude Derivatives & PVC",
    inputs: [
      { id: "brent-crude", role: "Feedstock" },
      { id: "wti-crude", role: "Feedstock" },
      { id: "natural-gas", role: "Feedstock & energy" },
    ],
    sectors: ["Materials"],
    absent: [
      { what: "PVC resin, and the petrochemical chain generally", why: "PVC, ethylene, naphtha and polymer spreads are priced by ICIS and Platts under licence. Crude and gas are the upstream feedstocks and are shown as such — they are not a substitute for the resin price the spec asks for." },
      CAPACITY_ABSENT, REALISATION_ABSENT,
    ],
  },
  {
    key: "fertilisers", label: "Fertilisers",
    inputs: [
      { id: "urea", role: "Output price" },
      { id: "dap", role: "Output price" },
      { id: "phosphate-rock", role: "Raw material" },
      { id: "potassium-chloride", role: "Output price (potash)" },
      { id: "natural-gas", role: "Urea feedstock" },
    ],
    sectors: ["Materials"],
    absent: [
      CAPACITY_ABSENT,
      { what: "Indian subsidy and retail price", why: "Urea and P&K retail prices in India are administered and the subsidy is set by the Department of Fertilizers. The prices below are international benchmarks, which drive the SUBSIDY BILL rather than the farm-gate price." },
    ],
  },
  {
    key: "coal", label: "Coal",
    inputs: [
      { id: "thermal-coal", role: "Benchmark (Newcastle)" },
      // Only the Newcastle benchmark is carried. Richards Bay was a second
      // seaborne origin the spec never asked for; one thermal-coal benchmark
      // answers the requirement.
      { id: "electricity-india", role: "Demand-side price" },
    ],
    sectors: ["Energy", "Utilities", "Materials"],
    absent: [
      { what: "Indian coal production and despatch", why: "Coal India and the Ministry of Coal publish monthly production, despatch and stock as PDF releases. The benchmarks below are seaborne import prices, not Indian pithead notified prices, which are administered." },
      CAPACITY_ABSENT,
    ],
  },
  {
    key: "electricity", label: "Electricity",
    inputs: [
      { id: "electricity-india", role: "Spot price (IEX day-ahead)" },
      { id: "thermal-coal", role: "Fuel" },
      { id: "natural-gas", role: "Fuel (gas-based)" },
      // CAPACITY IS NOW SOURCED — CEA's monthly workbook, discovered from its
      // landing page rather than a hardcoded path. This is the spec's industry
      // STRUCTURE data, and electricity is the one industry of the seven where
      // it turned out to be both free and machine-readable.
      { id: "india-power-capacity", role: "Installed capacity (CEA)" },
      { id: "india-power-coal", role: "Capacity — coal" },
      { id: "india-power-solar", role: "Capacity — solar" },
      { id: "india-power-wind", role: "Capacity — wind" },
      { id: "india-power-nonfossil", role: "Capacity — non-fossil" },
    ],
    sectors: ["Utilities"],
    absent: [
      // Capacity came off this list; generation and PLF did not. CEA publishes
      // both, but in the monthly GENERATION report, which is a different
      // document with a different layout — claiming them here because the
      // capacity workbook parsed would be asserting a source nobody read.
      { what: "Generation and PLF (plant load factor)", why: "CEA publishes both monthly, but in the generation report rather than the installed-capacity workbook this page now reads. PLF is the spec's 'capacity utilisation' for this industry and needs that second report's own reader." },
    ],
  },
  {
    key: "base-metals", label: "Base Metals",
    inputs: [
      { id: "aluminium", role: "Output price" },
      { id: "copper", role: "Output price" },
      { id: "zinc", role: "Output price" },
      { id: "nickel", role: "Output price" },
      { id: "lead", role: "Output price" },
      { id: "tin", role: "Output price" },
      { id: "electricity-india", role: "Smelting power" },
    ],
    sectors: ["Materials"],
    absent: [CAPACITY_ABSENT, ORDERBOOK_ABSENT],
  },
];

export function IndustryResearch() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [active, setActive] = useState<string>(INDUSTRIES[0].key);
  const [index, setIndex] = useState<SeriesIndex | null | undefined>(undefined);
  const [points, setPoints] = useState<Record<string, Point[]>>({});
  const [news, setNews] = useState<NewsResponse | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetchSeriesIndex().then((i) => { if (alive) setIndex(i); });
    return () => { alive = false; };
  }, []);

  const ind = INDUSTRIES.find((i) => i.key === active)!;

  const byId = useMemo(() => {
    const m = new Map<string, SeriesEntry>();
    for (const s of index?.series ?? []) m.set(s.id, s);
    return m;
  }, [index]);

  /** The industry's inputs that the store actually carries. */
  const live = useMemo(
    () => ind.inputs.map((i) => ({ ...i, s: byId.get(i.id) })).filter((x): x is Input & { s: SeriesEntry } => !!x.s),
    [ind, byId],
  );

  // Load a 5-year window for the basket chart — one or two year-chunks per series.
  useEffect(() => {
    let alive = true;
    const missing = live.filter((x) => !points[x.id]);
    if (!missing.length) return;
    Promise.all(missing.map(async (x) => {
      const pts = await fetchSeriesPoints(x.s, yearForRange(x.s, "5Y"));
      return [x.id, sliceRange(pts, x.s, "5Y")] as const;
    })).then((pairs) => { if (alive) setPoints((p) => ({ ...p, ...Object.fromEntries(pairs) })); });
    return () => { alive = false; };
  }, [live, points]);

  /**
   * Holdings in the SECTORS this industry overlaps. Consolidated (each
   * dedupeGroup once) because this is a book-wide figure.
   */
  const holdings = useMemo(() => {
    if (!portfolio) return [];
    const m = new Map<string, { key: string; name: string; mv: number; sector: string; ret: number | null }>();
    for (const p of dedupedPositions(portfolio.positions)) {
      if (!ind.sectors.includes(p.sector)) continue;
      const e = m.get(p.securityKey) ?? { key: p.securityKey, name: p.security, mv: 0, sector: p.sector, ret: p.returnPct };
      e.mv += p.marketValue;
      m.set(p.securityKey, e);
    }
    return [...m.values()].sort((a, b) => b.mv - a.mv);
  }, [portfolio, ind]);

  // News about the companies we actually hold in those sectors — not a generic
  // industry query, which would put companies this book does not own on screen.
  useEffect(() => {
    let alive = true;
    setNews(undefined);
    const hs: NewsHolding[] = holdings.slice(0, 8).map((h) => ({ name: h.name, key: h.key, weight: 0 }));
    if (!hs.length) { setNews({ ok: true, articles: [] }); return; }
    getHoldingsNews(hs).then((r) => { if (alive) setNews(r); });
    return () => { alive = false; };
  }, [holdings]);

  const chartSeries = live.map((x) => ({ meta: x.s, points: points[x.id] ?? [] })).filter((x) => x.points.length > 0);
  const money = (n: number) => fmtFromBase(n, { compact: true });

  return (
    <div>
      <PageHeader
        eyebrow="Research · Layer 2"
        title="Industry Research"
        subtitle="A dashboard per industry — the input and output prices that drive its economics, the book's exposure to related sectors, and what the spec asks for that no source yet serves."
        right={index ? <Pill tone="gain">{live.length} live inputs</Pill> : null} />

      {/* Industry selector */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {INDUSTRIES.map((i) => (
          <button key={i.key} onClick={() => setActive(i.key)}
            className={["rounded-md border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]",
              active === i.key
                ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400"
                : "border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
            {i.label}
          </button>
        ))}
      </div>

      {index === null ? (
        <AbsentSection what="The series store did not respond"
          needs="Every input cost on this page is read from public/series/, which is committed and served statically — so this is a deployment problem rather than a missing feed." />
      ) : (
        <>
          {/* ── Industry economics: LIVE ─────────────────────────────────── */}
          <Card
            title={<span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-champagne-400" /> {ind.label} — input & output prices</span>}
            subtitle="Every row is a real series from the store, with its own history and returns"
            right={<Pill tone="gain">{live.length} live</Pill>} pad={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full whitespace-nowrap text-[12.5px]">
                <thead className="border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Series</th>
                    <th className="label-xs px-3 py-2 text-left font-medium">Role</th>
                    <th className="label-xs px-3 py-2 text-right font-medium">Level</th>
                    <th className="label-xs px-3 py-2 text-right font-medium">1M</th>
                    <th className="label-xs px-3 py-2 text-right font-medium">1Y</th>
                    <th className="label-xs px-3 py-2 text-right font-medium">5Y</th>
                    <th className="label-xs px-3 py-2 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {live.map(({ id, role, s }) => (
                    <tr key={id} className="hover:bg-ink-700/30">
                      <td className="px-4 py-2 font-medium text-slate-300">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-gain" title={`Live · observation dated ${s.last}`} />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{role}</td>
                      <td className="px-3 py-2 text-right mono text-slate-100">{fmtLevel(s.last_value, s.unit)}</td>
                      {(["m1", "y1", "y5"] as const).map((k) => (
                        <td key={k} className={`px-3 py-2 text-right mono ${returnTone(s.returns[k])}`}>
                          {fmtReturn(s.returns[k], s.kind)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-[11px] text-slate-500">
                        {s.source.name}
                        <span className="text-slate-600"> · {s.frequency}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
              These are the observable half of an industry's margin. The other half — what it SELLS at, and how much it
              ships — is company data; where a row is a global benchmark rather than the Indian price, it is labelled and
              the gap is named below.
            </p>
          </Card>

          {/* ── Basket chart ─────────────────────────────────────────────── */}
          <Card className="mt-5"
            title={<span className="flex items-center gap-2"><LineIcon className="h-4 w-4 text-champagne-400" /> Input cost trend</span>}
            subtitle="Five years, rebased to 100 — these series are quoted in different units, so only their paths are comparable">
            {chartSeries.length
              ? <SeriesChart series={chartSeries} type="line" height={280} forceRebase />
              : <div className="grid h-[280px] place-items-center text-[12px] text-slate-500">Loading observations…</div>}
          </Card>

          <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
            {/* ── Book exposure ──────────────────────────────────────────── */}
            <Card title={<span className="flex items-center gap-2"><Package className="h-4 w-4 text-champagne-400" /> The book's related holdings</span>}
              subtitle={`Holdings in ${ind.sectors.join(" / ")} — the sectors this industry sits in`}
              right={<Pill tone="info">{holdings.length}</Pill>}>
              {holdings.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-slate-500">
                  The book holds nothing in {ind.sectors.join(" or ")}.
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {holdings.slice(0, 10).map((h) => (
                      <li key={h.key} className="flex items-center justify-between gap-2 text-[12.5px]">
                        <StockLink securityKey={h.key} name={h.name} />
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="mono text-slate-300">{money(h.mv)}</span>
                          <span className={`mono w-16 text-right ${changeColor(h.ret)}`}>{fmtPct(h.ret, { sign: true })}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
                    Matched on <span className="font-medium text-slate-400">GICS sector</span>, which is what the
                    statements support. The archive carries no industry classification, so these are the book's holdings
                    in a related sector — not a claim that each one operates in {ind.label.toLowerCase()}.
                  </p>
                </>
              )}
            </Card>

            {/* ── Industry news ──────────────────────────────────────────── */}
            <Card title={<span className="flex items-center gap-2"><Newspaper className="h-4 w-4 text-champagne-400" /> Industry intelligence</span>}
              subtitle="News on the companies the book holds in these sectors">
              {news === undefined ? (
                <p className="text-[12px] text-slate-500">Loading…</p>
              ) : !news.ok || !news.articles?.length ? (
                <p className="text-[12px] leading-relaxed text-slate-500">
                  {news.reason === "not_configured"
                    ? "The news service needs its upstream token, which is set in the deployed environment and not in local preview."
                    : holdings.length === 0
                      ? "No holdings in these sectors, so there is nothing to search news for."
                      : "No recent articles returned for these holdings."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {news.articles.slice(0, 6).map((a) => (
                    <li key={a.url} className="rounded-md border border-ink-700 bg-ink-800/60 p-2.5">
                      <a href={a.url} target="_blank" rel="noreferrer"
                        className="text-[12.5px] font-medium text-slate-200 hover:text-champagne-400">{a.title}</a>
                      <div className="mt-0.5 text-[10.5px] text-slate-500">{a.holding} · {a.source} · {a.age}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* ── What the spec asks for and nothing serves ─────────────────── */}
          <Card className="mt-5"
            title={<span className="flex items-center gap-2"><Factory className="h-4 w-4 text-champagne-400" /> Industry structure — asked for, not yet sourced</span>}
            subtitle="Named with the reason rather than shown as an illustrative number"
            right={<Pill>{ind.absent.length}</Pill>}>
            <ul className="space-y-2.5">
              {ind.absent.map((a) => (
                <li key={a.what} className="border-b border-ink-700/50 pb-2.5 last:border-0 last:pb-0">
                  <div className="text-[12.5px] font-medium text-slate-300">{a.what}</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{a.why}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
