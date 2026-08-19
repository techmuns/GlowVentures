import { useMemo, useRef, useState } from "react";
import {
  Scale, Target, Globe2, Layers, Clock, ScrollText, TrendingUp, TrendingDown, CalendarRange, Receipt, Download, Upload,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { StockLink } from "@/components/StockLink";
import { PreviewBadge } from "@/components/Preview";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { bySector, bySecurity, consolidatedMarketValue, isPrivateClass, isDirectEquity, isFundVehicle, excludedClasses, byAssetClass, sum } from "@/lib/analytics";
import {
  IPS_BUCKETS, readFamilyInputs, writeFamilyInputs, ipsTargetTotal, pct,
  exportFamilyInputs, importFamilyInputs, type FamilyInputs, type IpsBucketKey,
} from "@/lib/familyInputs";
import { bucketActuals, bucketWeightPct } from "@/lib/alertEngine";
import { MCAP_BANDS, bandWeightPct, mcapExposure } from "@/lib/marketCap";
import { fmtPct, changeColor } from "@/lib/format";

// LAYER 3 — PORTFOLIO & EXPOSURE (FOOS spec). Family charter & IPS buckets, GAP
// analysis (actual vs desired), top holdings/sectors, MOM/QOQ/YOY movement and
// attribution, plus the monthwise capital-call & tax-liability chart.
//
// MIXED. Actual exposure, top-10 lists and attribution are LIVE from the book.
// Desired allocations, the family charter, the geography/market-cap/duration GAP
// and the monthwise projections are family decisions or need a valuation series —
// those render as clearly-marked PREVIEW.

// THERE IS NO DESIRED-WEIGHT TABLE HERE, AND THERE MUST NOT BE ONE.
//
// This held nine sector targets, with `?? 5` for anything unmatched, and the
// column beside it printed `gap = actual − desired` in percentage points. The
// actual side is real, measured off the family's own holdings; the desired side
// was typed into this file; and the GAP — the only figure a reader looks at, the
// one that says buy or sell — was arithmetic between the two.
//
// CLAUDE.md names this exact case in the list of things no current source can
// serve: the actuals are in the book, "the DESIRED allocations are a family
// decision nobody has supplied, and inventing a target weight would fabricate
// the entire gap". A greyed +6.7pp against Financial Services is not a shape,
// it is an instruction, and it was produced by subtracting a real number from an
// invented one.
//
// So the actual column stays live and the desired and gap columns render `—`
// with the reason. When the family records an IPS, one map here fills both.

export function ExposureIPS() {
  const { portfolio, consolidated, fmtFromBase, quotesStatus } = usePortfolio();

  const [inputs, setInputs] = useState<FamilyInputs>(() => readFamilyInputs());
  const save = (next: FamilyInputs) => setInputs(writeFamilyInputs(next));
  const fileRef = useRef<HTMLInputElement>(null);

  const totalMV = useMemo(() => consolidatedMarketValue(consolidated), [consolidated]);
  /** Asset classes actually in the book — what the family maps to IPS buckets. */
  const classes = useMemo(() => byAssetClass(consolidated), [consolidated]);
  const actuals = useMemo(
    () => (portfolio ? bucketActuals(portfolio, inputs) : null),
    [portfolio, inputs],
  );
  const targetTotal = ipsTargetTotal(inputs);
  /**
   * SECTOR AND MARKET-CAP ARE DIRECT-EQUITY VIEWS — `isDirectEquity`, not
   * `!isPrivateClass`.
   *
   * Excluding only the PRIVATE classes fixed the AIF folios and left every
   * other wrapper in: a mutual fund is marked daily at a published NAV, so it
   * is not private, and it has no more of a GICS sector than an AIF folio does.
   * This book holds ₹52.4 Cr of mutual-fund units and ₹6.8 Cr of cash — all of
   * which landed in the sector table (funds under "Unclassified", cash under
   * "Cash") and, worse, in the market-cap card's `unmeasured` bucket, which
   * reports a shortfall against a market cap a fund can never have. That is
   * Sector Composition's own bug, one page over. Both now narrow to shares in
   * companies and NAME what they left out.
   */
  const equity = useMemo(() => consolidated.filter(isDirectEquity), [consolidated]);
  const equityMV = useMemo(() => consolidatedMarketValue(equity), [equity]);
  const sectors = useMemo(() => bySector(equity), [equity]);
  /** What the sector and market-cap views do not cover, named with its value. */
  const nonEquity = useMemo(() => excludedClasses(consolidated, isDirectEquity), [consolidated]);
  const nonEquityMV = useMemo(() => sum(nonEquity.map((c) => c.mv)), [nonEquity]);
  const fundMV = useMemo(() => consolidatedMarketValue(consolidated.filter(isFundVehicle)), [consolidated]);
  const mcap = useMemo(() => mcapExposure(equity), [equity]);
  const nameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of consolidated) if (!m.has(p.securityKey)) m.set(p.securityKey, p.security);
    return m;
  }, [consolidated]);
  /**
   * TOP HOLDINGS SPANS THE WHOLE BOOK, AND EVERY ROW SAYS WHAT IT IS.
   *
   * Six of this book's ten largest holdings are fund units, not companies — the
   * Sanshi folios, Buoyant, Helios, Motilal Oswal — and in a bare Security /
   * Value / Weight table each of them reads as a stock the family owns. That is
   * the client's complaint in its plainest form. Narrowing the list to direct
   * equity would be the wrong fix: these ARE the family's largest holdings and
   * hiding them understates the book. So the list stays whole and each row
   * carries its asset class, which is the one fact that separates a share in a
   * company from one line standing for somebody else's portfolio.
   */
  const classByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of consolidated) if (!m.has(p.securityKey)) m.set(p.securityKey, p.assetClass);
    return m;
  }, [consolidated]);
  const topHoldings = useMemo(
    () => bySecurity(consolidated).slice(0, 10)
      .map((b) => ({ ...b, name: nameByKey.get(b.key) ?? b.key, assetClass: classByKey.get(b.key) ?? null })),
    [consolidated, nameByKey, classByKey]);
  // costBasis / unrealizedPnL are nullable where no statement reported a cost;
  // a missing figure sorts as 0 (neutral) rather than distorting the ranking.
  const contributors = useMemo(() => [...consolidated].sort((a, b) => (b.unrealizedPnL ?? 0) - (a.unrealizedPnL ?? 0)).slice(0, 5), [consolidated]);
  const laggards = useMemo(() => [...consolidated].sort((a, b) => (a.unrealizedPnL ?? 0) - (b.unrealizedPnL ?? 0)).slice(0, 5), [consolidated]);

  // Undrawn capital across the book, so the call-schedule card can name the real
  // amount it cannot place in time. `sumOrNull` semantics by hand: no commitment
  // at all is null, not zero.
  const undrawnTotal = useMemo(() => {
    const set = (portfolio?.commitments ?? []).map((c) => c.undrawn).filter((v): v is number => v != null);
    return set.length ? set.reduce((a, b) => a + b, 0) : null;
  }, [portfolio]);

  if (!portfolio) return null;
  const money = (n: number | null, sign?: boolean) => fmtFromBase(n, { compact: true, sign });

  return (
    <div>
      <PageHeader
        eyebrow="Allocation · Layer 3"
        title="Exposure & IPS"
        subtitle="The family charter and IPS buckets, GAP analysis of actual vs desired exposure, top holdings and sectors, movement and attribution."
        right={<BasisPill liveText="Exposure marked live" hint="Actual exposure, top-10 lists and attribution are live. Desired weights, the charter, and the monthwise projections are illustrative." />}
      />

      {/* ── Family charter & IPS — the family's own decisions ─────────── */}
      <Card title={<span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-champagne-400" /> Family charter &amp; IPS buckets</span>}
        subtitle="The one-page IPS the whole book is measured against — recorded by the family, not read from a statement"
        right={
          <div className="flex items-center gap-1.5">
            {/* ONE FILE CARRIES THE WHOLE FAMILY-INPUT STORE, not just this
                page's fields — the charter and IPS, the theses, the alert rules,
                the private deal register and the household balance sheet. A
                partial export would look like a backup and lose the rest. */}
            <button onClick={() => exportFamilyInputs(inputs)}
              title="Writes every family-entered record — charter, IPS targets, bucket mapping, theses, alert rules, the private deal register and the household balance sheet — to one JSON file."
              className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-700/60">
              <Download className="h-3 w-3" /> Export
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-700/60">
              <Upload className="h-3 w-3" /> Import
            </button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) { try { setInputs(await importFamilyInputs(f)); } catch { /* malformed file */ } }
                e.target.value = "";
              }} />
          </div>
        }>
        <textarea
          value={inputs.charter}
          onChange={(e) => save({ ...inputs, charter: e.target.value })}
          rows={3}
          placeholder="Write the family's investment charter here — the principles every decision below is measured against."
          className="w-full rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2 text-[12.5px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />

        {/* Asset class -> bucket. Without this mapping no actual can be measured. */}
        <div className="mt-4">
          <div className="label-xs mb-1.5">Which IPS bucket does each asset class belong to?</div>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <label key={c.key} className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800/60 px-2.5 py-1.5">
                <span className="text-[12px] text-slate-300">{c.key}</span>
                <span className="text-[10px] text-slate-600">{money(c.mv)}</span>
                <select
                  value={inputs.bucketByAssetClass[c.key] ?? ""}
                  onChange={(e) => save({
                    ...inputs,
                    bucketByAssetClass: { ...inputs.bucketByAssetClass, [c.key]: (e.target.value || null) as IpsBucketKey | null },
                  })}
                  className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none">
                  <option value="">not mapped</option>
                  {IPS_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        {/* The GAP itself — actual from the book, target from the family. */}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-2 py-2 text-left font-medium">Bucket</th>
                <th className="label-xs px-2 py-2 text-right font-medium">Actual %</th>
                <th className="label-xs px-2 py-2 text-right font-medium">Target %</th>
                <th className="label-xs px-2 py-2 text-right font-medium">Gap (pp)</th>
                <th className="label-xs px-2 py-2 text-left font-medium">What it is for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {IPS_BUCKETS.map((b) => {
                const actual = actuals ? bucketWeightPct(actuals, b.key) : null;
                const target = inputs.ipsTargets[b.key] ?? null;
                {/* THE GAP EXISTS ONLY WHEN BOTH SIDES DO. Either half missing and
                    this is a dash: a gap against a defaulted target is a
                    fabricated instruction to buy or sell. */}
                const gap = actual != null && target != null ? actual - target : null;
                return (
                  <tr key={b.key} className="hover:bg-ink-700/30">
                    <td className="px-2 py-2 font-medium text-slate-200">{b.label}</td>
                    <td className="px-2 py-2 text-right mono text-slate-300">
                      {actual == null
                        ? <AbsentCell reason={`No asset class is mapped to ${b.label}, so the book's actual weight in it cannot be measured.`} />
                        : `${actual.toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        inputMode="decimal"
                        value={target ?? ""}
                        placeholder="—"
                        onChange={(e) => save({ ...inputs, ipsTargets: { ...inputs.ipsTargets, [b.key]: pct(e.target.value) } })}
                        className="w-16 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-right mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
                    </td>
                    <td className={`px-2 py-2 text-right mono ${gap == null ? "" : changeColor(gap)}`}>
                      {gap == null
                        ? <AbsentCell reason={target == null ? "No target weight recorded for this bucket — the gap is actual minus target, and half of it is missing." : `Nothing is mapped to ${b.label}, so there is no actual to compare.`} />
                        : `${gap >= 0 ? "+" : ""}${gap.toFixed(1)}`}
                    </td>
                    <td className="px-2 py-2 text-[11px] text-slate-500">{b.hint}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
          {targetTotal == null
            ? <>No target weights recorded yet. Every gap stays absent until one is — a gap measured against a defaulted zero would read as an instruction to sell.</>
            : Math.abs(targetTotal - 100) > 0.5
              ? <><span className="font-medium text-amber-400">Targets sum to {targetTotal.toFixed(1)}%, not 100%.</span> Each gap is still that bucket&rsquo;s own actual minus its own target — they do not assume the rest.</>
              : <>Targets sum to 100%.</>}
          {actuals && actuals.unmappedValue > 0 && (
            <> {money(actuals.unmappedValue)} ({((actuals.unmappedValue / actuals.total) * 100).toFixed(0)}% of the book) sits in{" "}
              <span className="font-medium text-slate-400">{actuals.unmappedClasses.join(", ")}</span>, mapped to no bucket — so the actual column is a partial view until it is.</>
          )}
          {" "}These are the family&rsquo;s own entries and live in this browser only. <span className="font-medium text-slate-400">Export</span> writes
          the whole family-input store — this charter and its targets, the bucket mapping, the theses on Thesis &amp; Triggers, the
          alert rules, the private deal register and the household balance sheet — to one JSON file you can back up, share and
          re-import; a shared always-on view would need a server-side store.
        </p>
      </Card>

      {/* GAP analysis by sector — actual real, desired preview */}
      <Card className="mt-5" title={<span className="flex items-center gap-2"><Target className="h-4 w-4 text-champagne-400" /> GAP analysis — by sector</span>}
        subtitle="Actual weight is live from the book; the desired weight is a family IPS decision, and none has been recorded" right={<Pill tone="info">actual live · desired yours</Pill>} pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Sector</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Actual %</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Desired %</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {sectors.slice(0, 12).map((s) => (
                <tr key={s.key} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 font-medium text-slate-200">{s.key}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-300">{money(s.mv)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{(s.weight * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right">
                    <input inputMode="decimal" value={inputs.sectorTargets[s.key] ?? ""} placeholder="—"
                      onChange={(e) => save({ ...inputs, sectorTargets: { ...inputs.sectorTargets, [s.key]: pct(e.target.value) } })}
                      className="w-16 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-right mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
                  </td>
                  <td className="px-4 py-2.5 text-right mono">
                    {(() => {
                      const t = inputs.sectorTargets[s.key] ?? null;
                      const gap = t == null ? null : s.weight * 100 - t;
                      return gap == null
                        ? <AbsentCell reason="the gap is actual minus desired, and no desired weight is recorded for this sector" />
                        : <span className={changeColor(gap)}>{gap >= 0 ? "+" : ""}{gap.toFixed(1)}</span>;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          Sectors cover <span className="font-medium text-slate-400">direct equity</span> ({money(equityMV)}) — shares in
          companies the family holds, whether through a manager's mandate or its own demat.
          {nonEquity.length > 0 && <> The other {money(nonEquityMV)} is excluded rather than folded in:{" "}
            {nonEquity.map((c, i) => (
              <span key={c.key}>
                {i > 0 && (i === nonEquity.length - 1 ? " and " : ", ")}
                <span className="font-medium text-slate-400">{money(c.mv)}</span> of {c.key}
              </span>
            ))}. A fund is a wrapper holding many companies and no statement here prints a sector for one, so folding
            them in would put {money(fundMV)} of fund units under a single "Unclassified" slice — the largest row in an
            equity sector table, describing nothing.</>}{" "}
          The GAP also spans geography, market-cap, duration, tangible vs
          intangible, entity and advisor allocation — actuals for those need a look-through the book does not yet carry,
          so they are previewed below.
        </p>
      </Card>

      {/* ── THE OTHER GAP DIMENSIONS ────────────────────────────────────────
          These three cards printed an ACTUAL and a DESIRED column each — "India
          88% / 80%", "Large 54% / 50%", "Liquid 82% / 75%" — and both sides were
          typed into this file. The desired side was already known to be a
          fabrication; the ACTUAL side is worse, because it claims to have
          measured this family's real book. A reader comparing 88% against 80%
          is reading an instruction assembled from two invented numbers.

          MARKET CAP IS NOW REAL. The quote feed's `marketCap` was checked against
          screener.in on 2026-08-11 and is in rupees to 0.05% — see
          `src/lib/marketCap.ts`, which also explains why the bands are a stated
          convention rather than SEBI's rank-based classification.

          GEOGRAPHY AND DURATION STAY ABSENT, and not for want of effort: no
          statement in this book carries a country of listing or a liquidity
          horizon, so an actual for either would be a classification nobody
          made — the same failure as assigning "DCF" to a company by row order. */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title={<span className="flex items-center gap-2 text-[13px]"><Layers className="h-4 w-4 text-champagne-400" />By market cap</span>}
          right={<Pill tone="info">live</Pill>}>
          {/* A PARTIAL FEED SILENTLY RE-BASES THIS SPLIT, so it is not shown
              until the feed settles. Measured mid-load at 14s the bands read
              Large 23.0 / Mid 29.5 / Small 47.4 over ₹78.7 Cr; at 45s, with the
              same book and the same code, Large 16.0 / Mid 25.7 / Small 58.3
              over ₹122.1 Cr. Neither is wrong on its own terms and the caption
              states the coverage either way — but a reader glancing early takes
              away a large-cap weight seven points off the settled one, and
              percentages that move while nothing about the book changed are the
              "two bases mixed together" failure in motion. */}
          {quotesStatus === "loading" ? (
            <AbsentSection
              what="Still measuring"
              needs="The bands are weights of the priced book, so a partial feed would re-base them as quotes arrive.
                They appear once the quote feed settles." />
          ) : mcap.measured > 0 ? (
            <>
              <table className="w-full text-[12px]">
                <thead><tr className="text-slate-500">
                  <th className="py-1 text-left font-medium">Band</th>
                  <th className="py-1 text-right font-medium">Actual</th>
                  <th className="py-1 text-right font-medium">Desired</th>
                </tr></thead>
                <tbody>
                  {MCAP_BANDS.map((band) => {
                    const w = bandWeightPct(mcap, band.key);
                    return (
                      <tr key={band.key}>
                        <td className="py-1 text-slate-400" title={band.note}>{band.label}</td>
                        <td className="py-1 text-right mono text-slate-200">{w === null ? <AbsentCell reason="nothing measured" /> : `${w.toFixed(1)}%`}</td>
                        {/* The desired side is the family's, and no dimension
                            beyond the IPS buckets is captured yet. */}
                        <td className="py-1 text-right"><AbsentCell reason="no market-cap target recorded — the IPS above captures buckets, not bands" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
                Of the direct-equity book, {money(mcap.measured)} carries a market cap from the quote feed
                {mcap.unmeasured > 0 && <> and {money(mcap.unmeasured)} does not ({mcap.unmeasuredNames.length} name{mcap.unmeasuredNames.length === 1 ? "" : "s"} with no live quote), which is excluded from the weights rather than banded as small</>}.
                Bands are this dashboard's stated convention — <span className="text-slate-400">≥₹1,00,000 Cr</span>,{" "}
                <span className="text-slate-400">₹25,000 Cr–₹1,00,000 Cr</span>, below that — not SEBI's rank-based
                classification, which AMFI publishes over the whole listed universe.
              </p>
            </>
          ) : (
            <AbsentSection
              what="No direct-equity holding carries a market cap"
              needs="The figure comes from the live quote feed. With no quote resolved for any name there is nothing to
                band, and banding on statement marks alone is not possible — a mark is a price, not a company's size." />
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2 text-[13px]"><Globe2 className="h-4 w-4 text-slate-500" />By geography</span>}>
          <AbsentSection
            what="The book carries no country of listing"
            needs="Every holding here is priced in rupees off Indian statements, but nothing in the model records where a
              company is listed or where it earns. Splitting the book by geography needs either a country field at
              ingest or a look-through into each fund's own holdings." />
        </Card>

        <Card title={<span className="flex items-center gap-2 text-[13px]"><Clock className="h-4 w-4 text-slate-500" />By duration / liquidity</span>}>
          <AbsentSection
            what="No liquidity horizon is recorded against any holding"
            needs="Liquid, semi-liquid and illiquid are judgements about how fast a position could be realised. An AIF
              unit's lock-in is in its scheme document and a listed share's is a matter of volume — neither is in this
              book, and a split assigned by asset class would be a classification nobody made." />
        </Card>
      </div>

      {/* Top holdings & sectors — real */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <Card title="Top 10 holdings" subtitle="Live from the book · every class, each row saying which" right={<Pill tone="info">live</Pill>} pad={false}>
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-ink-700"><tr>
              <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
              <th className="label-xs px-4 py-2 text-left font-medium">Class</th>
              <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
              <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
            </tr></thead>
            <tbody className="divide-y divide-ink-700/60">
              {topHoldings.map((t) => (
                <tr key={t.key} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={t.key} name={t.name} /></td>
                  <td className="px-4 py-2.5">
                    {t.assetClass
                      ? <Pill tone={t.assetClass === "Equity" ? "info" : undefined}>{t.assetClass}</Pill>
                      : <AbsentCell reason="no statement in the book states an asset class for this holding" />}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{money(t.mv)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{(t.weight * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Top 10 sectors" subtitle="Direct equity only — a fund has no sector" right={<Pill tone="info">live</Pill>} pad={false}>
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-ink-700"><tr>
              <th className="label-xs px-4 py-2 text-left font-medium">Sector</th>
              <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
              <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
            </tr></thead>
            <tbody className="divide-y divide-ink-700/60">
              {sectors.slice(0, 10).map((s) => (
                <tr key={s.key} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-200">{s.key}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{money(s.mv)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{(s.weight * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Attribution — real */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <Card title={<span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gain" /> Largest contributors</span>} subtitle="By unrealised P&L · live" right={<Pill tone="info">live</Pill>} pad={false}>
          <table className="min-w-full text-[13px]">
            <tbody className="divide-y divide-ink-700/60">
              {contributors.map((p) => (
                <tr key={p.securityKey + p.accountId} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100">
                    <StockLink securityKey={p.securityKey} name={p.security} />
                    {/* A fund unit's gain is as real as a company's and belongs
                        in this ranking; what it must not do is read as a stock.
                        The class rides beside the name for that reason alone. */}
                    {!isDirectEquity(p) && <span className="ml-1.5 text-[10.5px] text-slate-500">{p.assetClass}</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(p.unrealizedPnL)}`}>{money(p.unrealizedPnL, true)}</td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(p.returnPct)}`}>{fmtPct(p.returnPct, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={<span className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-loss" /> Largest laggards</span>} subtitle="By unrealised P&L · live" right={<Pill tone="info">live</Pill>} pad={false}>
          <table className="min-w-full text-[13px]">
            <tbody className="divide-y divide-ink-700/60">
              {laggards.map((p) => (
                <tr key={p.securityKey + p.accountId} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100">
                    <StockLink securityKey={p.securityKey} name={p.security} />
                    {/* A fund unit's gain is as real as a company's and belongs
                        in this ranking; what it must not do is read as a stock.
                        The class rides beside the name for that reason alone. */}
                    {!isDirectEquity(p) && <span className="ml-1.5 text-[10.5px] text-slate-500">{p.assetClass}</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(p.unrealizedPnL)}`}>{money(p.unrealizedPnL, true)}</td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(p.returnPct)}`}>{fmtPct(p.returnPct, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* ── PORTFOLIO MOVEMENT AND THE CALL/TAX SCHEDULE ──────────────────
          This card printed "Month on month +2.1% · Quarter on quarter +6.4% ·
          Year on year +18.7%" under the heading Portfolio movement, directly
          beneath this family's real top-ten holdings and their real weights.
          Its own caption already said the book cannot measure it — "needs a
          dated valuation series, the book carries two dates per account" — and
          it printed the numbers anyway.

          That is the sharpest form of the failure this cockpit exists to
          prevent: a RETURN figure about a real ₹335 Cr book, on the family's own
          allocation page, with the absence named in small text beside it. A
          reader who takes away "+18.7% year on year" has been told something
          nobody measured, and the caption does not unsay it.

          The condition is stated instead, and it stays true whether or not the
          series ever arrives. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <Card title={<span className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-slate-500" /> Portfolio movement</span>}
          subtitle="MoM · QoQ · YoY">
          <AbsentSection
            what="This book cannot measure a movement over time"
            needs="Each account's statements carry an opening and a closing value for one window — two dated points, not
              a series. A month-on-month figure needs a monthly or quarterly valuation statement per account; until one
              is ingested, every horizon here is absent rather than estimated from the two dates that do exist." />
        </Card>
        <Card className="lg:col-span-2" title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-slate-500" /> Monthwise: capital calls & tax liability</span>}
          subtitle="Expected fund calls and estimated tax by month">
          <AbsentSection
            what="No month-by-month schedule can be drawn"
            needs={`A capital account states the UNDRAWN BALANCE, not when the fund will call it${undrawnTotal === null ? "" : ` — ${money(undrawnTotal)} is
              committed across this book`} and no statement says in which month. The tax half needs the family's own
              expected realisations. A bar chart here would put a shape on both, and the shape is the claim.`} />
        </Card>
      </div>
    </div>
  );
}
