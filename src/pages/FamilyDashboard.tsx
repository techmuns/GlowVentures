import { useEffect, useMemo, useState } from "react";
import {
  Wallet, Landmark, Droplets, Gauge, TrendingUp, HeartHandshake, PhoneCall, ClipboardCheck, Building2, PieChart,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { StockLink } from "@/components/StockLink";
import { AbsentCell, absentTile } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { byEntity, bySecurity, consolidatedMarketValue, dedupedPositions, publicPrivateSplit, sumOrNull } from "@/lib/analytics";
import { accountIndex, ownerOf } from "@/lib/accounts";
import { ownerMeasuredReturn } from "@/lib/returns";
import { fmtPct, changeColor } from "@/lib/format";
import { readFamilyInputs, IPS_BUCKETS } from "@/lib/familyInputs";
import { bucketActuals, bucketWeightPct } from "@/lib/alertEngine";
import { liquidityMonths, outflowsWithin, viewHousehold } from "@/lib/household";
import { fetchSeriesIndex, type SeriesEntry } from "@/lib/series";
import { HouseholdSheet } from "./family/HouseholdSheet";
import { Registers } from "./family/Registers";

// LAYER 6 — FAMILY DASHBOARD (FOOS spec). Per family member and for the whole
// family: net worth, portfolio value, cash, liquidity coverage, annual return,
// benchmark, charity pool, capital calls, buckets, public/private, top exposures
// and decisions required.
//
// MIXED page. Portfolio value, the public/private split, the top exposures and
// the undrawn commitments are REAL and carry a basis pill. Net worth (needs
// off-book assets), cash, liquidity coverage, benchmark and charity are family
// facts no statement in this book carries — those render ABSENT with the reason,
// never as a sample figure standing beside the real ones.

const FAMILY = "Whole family";

// WHY THERE ARE NO SAMPLE FIGURES FOR THIS PAGE'S TILES.
//
// These were a per-scope table of placeholders — ₹128.4 Cr net worth, ₹6.2 Cr
// cash, 14 months of liquidity, +11.8% benchmark, ₹3.1 Cr charity for the
// family, with a fallback giving every individual member ₹1.4 Cr and 9 months.
// They keyed on the REAL owner name, so selecting Ajay Jaisinghani printed a net
// worth for a real, identifiable person.
//
// One of them was self-refuting on screen: net worth ₹128.4 Cr sat in the tile
// beside a live portfolio value of ₹335.4 Cr, so the page showed a family whose
// entire net worth was a third of the portfolio it was measuring. A placeholder
// that contradicts the real figure next to it is not illustrating a layout, it
// is arguing with the book.
//
// Each of these needs something no statement in this drop carries — off-book
// assets, bank balances, a committed-outflow schedule, a benchmark series, a
// charity pool — so each renders `—` through `Absent` with that reason, which is
// the same treatment every other unmeasurable figure in this cockpit gets.
//
// FOUR OF THE FIVE ARE NOW FILLABLE, AND THE REASONS SAY SO. What changed is
// not that a feed appeared: it is that each of these was waiting on the FAMILY
// rather than on a vendor, and there is now a register to put them in
// (`src/lib/household.ts`, edited on the Balance sheet tab). The reasons below
// are the state BEFORE anything is entered, and they now name the register
// instead of describing a permanent gap — an absence recorded against the wrong
// cause tells a reader to stop looking for something they could supply in ten
// minutes.
//
// The benchmark is the odd one out and stays a CHOICE. A series to measure
// against does exist — the harvest store carries twelve indices — but picking
// one on the family's behalf would put a comparison on screen they never agreed
// to, and this book is majority private by value.
const TILE_ABSENT: Record<string, string> = {
  networth: "needs the family's off-book assets — property, bank balances, unlisted stakes. No statement carries them; enter them on the Balance sheet tab and this computes",
  cash: "no bank statement in this drop, and the book's cash is the sweep inside each mandate rather than the family's bank balance. Add a bank line on the Balance sheet tab",
  liq: "liquidity coverage is cash over a committed-outflow schedule. Enter both on the Balance sheet tab — cash alone is not unlimited coverage",
  bench: "no benchmark chosen — the harvest store carries the indices, but which one measures this family is their decision, not a default",
  charity: "no charity pool ring-fenced. Tick 'charity pool' against an asset on the Balance sheet tab",
};

type Tab = "dashboard" | "sheet" | "registers";

export function FamilyDashboard() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const [scope, setScope] = useState<string>(FAMILY);
  const [tab, setTab] = useState<Tab>("dashboard");

  // The family's own register. Read on mount and after an edit tab is left, so
  // returning to the dashboard shows what was just entered.
  const [family, setFamily] = useState(() => readFamilyInputs());
  const household = family.household;

  // The chosen benchmark's precomputed returns, from the harvest store. Fetched
  // only when one has been chosen — an unchosen benchmark is not a failed one.
  const [benchmark, setBenchmark] = useState<SeriesEntry | null>(null);
  useEffect(() => {
    if (!household.benchmarkSeriesId) { setBenchmark(null); return; }
    let alive = true;
    fetchSeriesIndex()
      .then((i) => { if (alive) setBenchmark(i?.series.find((s) => s.id === household.benchmarkSeriesId) ?? null); })
      .catch(() => { if (alive) setBenchmark(null); });
    return () => { alive = false; };
  }, [household.benchmarkSeriesId]);

  const accIdx = useMemo(() => accountIndex(portfolio?.accounts ?? []), [portfolio]);
  const entities = useMemo(() => (portfolio ? byEntity(portfolio.positions, portfolio.accounts) : []), [portfolio]);

  // Positions in scope: the whole (deduped) book for the family, or one owner's
  // rows (NOT deduped — a per-owner figure shows each statement as printed).
  const scoped = useMemo(() => {
    if (!portfolio) return [];
    if (scope === FAMILY) return consolidated;
    return portfolio.positions.filter((p) => ownerOf(accIdx, p) === scope);
  }, [portfolio, consolidated, scope, accIdx]);

  const mv = useMemo(() => (scope === FAMILY ? consolidatedMarketValue(scoped) : scoped.reduce((s, p) => s + p.marketValue, 0)), [scoped, scope]);
  // costBasis is nullable where no statement reported a cost — sum only the real
  // ones (sumOrNull), and leave the return absent rather than dividing by a cost
  // that folded missing figures in as zero.
  const cost = useMemo(() => sumOrNull(scoped.map((p) => p.costBasis)), [scoped]);
  const retPct = cost !== null && cost > 0 ? ((mv - cost) / cost) * 100 : null;
  // Money-weighted return for one member — measurable accounts only, de-annualised
  // to the window (a sibling of what /performance and Morning CIO show). Closing
  // the member's whole value against partial openings previously produced an
  // annualised tile figure in the thousands of percent.
  const mwr = useMemo(() => (portfolio && scope !== FAMILY ? ownerMeasuredReturn(portfolio, portfolio.positions, scope) : null), [portfolio, scope]);

  // Top exposures by security, aggregated across accounts in scope.
  const topExposures = useMemo(() => {
    const nameByKey = new Map<string, string>();
    for (const p of scoped) if (!nameByKey.has(p.securityKey)) nameByKey.set(p.securityKey, p.security);
    return bySecurity(scope === FAMILY ? scoped : dedupedPositions(scoped))
      .slice(0, 10)
      .map((b) => ({ ...b, name: nameByKey.get(b.key) ?? b.key }));
  }, [scoped, scope]);

  // Public / private on the SAME rule the book uses, over the scoped rows.
  const split = useMemo(() => publicPrivateSplit(scoped), [scoped]);

  // Undrawn commitments for the accounts in scope. Null — not zero — when the
  // scope holds no drawdown fund at all: "nothing committed" and "no capital
  // account issued" are different facts, and the reason below says which.
  const undrawn = useMemo(() => {
    if (!portfolio) return { total: null as number | null, count: 0 };
    const inScope = portfolio.commitments.filter(
      (c) => scope === FAMILY || (accIdx.get(c.accountId)?.owner ?? null) === scope,
    );
    return { total: sumOrNull(inScope.map((c) => c.undrawn)), count: inScope.length };
  }, [portfolio, scope, accIdx]);

  // ── The four household figures, on the current scope ──────────────────────
  //
  // `viewHousehold` takes null for the whole family, which takes every line;
  // a member scope takes only lines attributed to them. Lines attributed to
  // nobody are the family's and are NOT spread across members — a share nobody
  // stated is a share nobody can check.
  const hv = useMemo(() => viewHousehold(household, scope === FAMILY ? null : scope), [household, scope]);
  // IPS bucket actuals, on the family's own asset-class mapping. Book-wide by
  // construction (`bucketActuals` reads the whole deduped book), so it is shown
  // as such rather than being silently re-labelled per member.
  const buckets = useMemo(() => {
    if (!portfolio) return null;
    const actuals = bucketActuals(portfolio, family);
    return { actuals, mappedPct: actuals.total > 0 ? ((actuals.total - actuals.unmappedValue) / actuals.total) * 100 : 0 };
  }, [portfolio, family]);
  const yearOut = useMemo(() => outflowsWithin(household, new Date(), 12), [household]);
  // NET WORTH IS ABSENT UNTIL THE REGISTER HAS SOMETHING IN IT. It does NOT
  // fall back to the portfolio value: "the family owns nothing else" and
  // "nobody has entered what else they own" are different claims, and the
  // portfolio alone under a heading reading Net worth asserts the first.
  const netWorth = hv.offBookNet === null ? null : mv + hv.offBookNet;
  const liqMonths = liquidityMonths(hv.cash.total, yearOut.total);

  if (!portfolio) return null;
  const money = (n: number) => fmtFromBase(n, { compact: true });
  const moneyOrNull = (n: number | null) => (n === null ? null : fmtFromBase(n, { compact: true }));
  const owners = entities.map((e) => e.key);

  const tabs: { key: Tab; label: string; title: string }[] = [
    { key: "dashboard", label: "Dashboard", title: "The family's position, measured" },
    { key: "sheet", label: "Balance sheet", title: "Off-book assets, liabilities and committed outflows — the family's own register" },
    { key: "registers", label: "Advisers & decisions", title: "Who the family engages, what it owes an answer on, and its chosen benchmark" },
  ];

  const tabStrip = (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {tabs.map((t) => (
        <button key={t.key} title={t.title}
          onClick={() => {
            // Re-read on leaving an editor so the dashboard reflects the edit.
            if (tab !== "dashboard" && t.key === "dashboard") setFamily(readFamilyInputs());
            setTab(t.key);
          }}
          className={["rounded-md border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]",
            tab === t.key ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
          {t.label}
        </button>
      ))}
    </div>
  );

  if (tab !== "dashboard") {
    return (
      <div>
        <PageHeader eyebrow="Family Dashboard · Layer 6" title="Family Dashboard"
          subtitle="The family's own record — off-book assets, committed outflows, advisers, decisions and the benchmark. None of it is in any statement, and none of it reaches the book." />
        {tabStrip}
        {tab === "sheet" ? <HouseholdSheet owners={owners} /> : <Registers />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Family Dashboard · Layer 6"
        title="Family Dashboard"
        subtitle="Net worth, portfolio, liquidity and buckets — for each family member and for the family as a whole."
        right={<BasisPill liveText="Portfolio value marked live" hint="Portfolio value, the public/private split, top exposures and undrawn commitments are live from the book. Net worth, cash, liquidity coverage, benchmark and charity come from the family's own register on the tabs beside this — they are absent until entered, never defaulted." />}
      />

      {tabStrip}

      {/* Member selector */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {[FAMILY, ...entities.map((e) => e.key)].map((m) => {
          const active = scope === m;
          return (
            <button key={m} onClick={() => setScope(m)}
              className={["rounded-md border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]",
                active ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {m}
            </button>
          );
        })}
      </div>

      {/* KPI strip — real + preview side by side, each labelled */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Portfolio value" value={money(mv)} sub={`${scoped.length} positions · live`} icon={<Wallet className="h-4 w-4" />} />
        {/* NET WORTH = measured portfolio + entered off-book net. The caption
            names how many register lines it spans, because a net worth over one
            bank balance reads exactly like a complete one. */}
        <StatTile label="Net worth" icon={<Landmark className="h-4 w-4" />}
          {...(netWorth === null
            ? absentTile(TILE_ABSENT.networth)
            : {
                value: money(netWorth),
                sub: `portfolio + ${hv.assets.of} asset${hv.assets.of === 1 ? "" : "s"} − ${hv.liabilities.of} liabilit${hv.liabilities.of === 1 ? "y" : "ies"}`,
                hint: `${money(mv)} portfolio, ${moneyOrNull(hv.assets.total) ?? "no"} off-book assets, ${moneyOrNull(hv.liabilities.total) ?? "no"} liabilities.${hv.outOfScope ? ` ${hv.outOfScope} register line${hv.outOfScope === 1 ? "" : "s"} attributed elsewhere and excluded from this scope.` : ""}`,
              })} />
        <StatTile label="Cash available" icon={<Droplets className="h-4 w-4" />}
          {...(hv.cash.total === null
            ? absentTile(TILE_ABSENT.cash)
            : { value: money(hv.cash.total), sub: `${hv.cash.of} line${hv.cash.of === 1 ? "" : "s"} marked liquid` })} />
        {/* BOTH SIDES OR NOTHING. Cash with no schedule is not unlimited
            coverage, and a schedule with no cash is not zero months. */}
        <StatTile label="Liquidity coverage" icon={<Gauge className="h-4 w-4" />}
          {...(liqMonths === null
            ? absentTile(hv.cash.total === null && yearOut.total === null ? TILE_ABSENT.liq
                : hv.cash.total === null ? "no cash entered — an outflow schedule alone does not make coverage zero"
                : "nothing is committed in the next twelve months, so there is no outflow to divide cash by")
            : {
                value: `${liqMonths.toFixed(1)} mo`,
                sub: `${money(hv.cash.total as number)} against ${money(yearOut.total as number)} due in 12 months`,
              })} />
        <StatTile
          label={scope === FAMILY ? "Return on cost" : "Return (to date)"}
          value={scope === FAMILY
            ? <span className={changeColor(retPct)}>{fmtPct(retPct, { sign: true })}</span>
            : mwr == null || mwr.toDatePct == null
              ? <AbsentCell reason="no account for this member carries an opening portfolio value, so a money-weighted return cannot be measured without overstating it" />
              : <span className={changeColor(mwr.toDatePct)}
                  title={`${mwr.annPct == null ? "" : `${fmtPct(mwr.annPct, { sign: true })} p.a. annualised. `}Covers ${money(mwr.measuredMV)} of ${money(mwr.totalMV)}${mwr.excluded.length ? ` — ${mwr.excluded.length === 1 ? "account" : "accounts"} ${mwr.excluded.join(", ")} carry no opening portfolio value` : ""}.`}>
                  {fmtPct(mwr.toDatePct, { sign: true })}</span>}
          sub={scope === FAMILY ? "holding-period, live" : mwr == null || mwr.toDatePct == null ? "not measurable" : "money-weighted · to date"}
          icon={<TrendingUp className="h-4 w-4" />} />
        {/* THE BENCHMARK'S OWN HORIZON, NOT THE PORTFOLIO'S. The book's return
            is a holding-period figure over a window the statements set; the
            store's 1-year is a calendar year. Labelling the benchmark by ITS
            horizon keeps the two from reading as a like-for-like race they are
            not — the tile states the window rather than implying a comparison. */}
        <StatTile label="Benchmark (1Y)" icon={<TrendingUp className="h-4 w-4" />}
          {...(!household.benchmarkSeriesId
            ? absentTile(TILE_ABSENT.bench)
            : benchmark === null
            ? absentTile("the chosen benchmark is not in the series store — it may have been renamed or dropped by a harvest")
            : benchmark.returns.y1 == null
            ? absentTile(`${benchmark.label} does not reach back a year in the store, so a 1-year return would be a shorter window relabelled`)
            : {
                value: <span className={changeColor(benchmark.returns.y1)}>{fmtPct(benchmark.returns.y1, { sign: true })}</span>,
                sub: `${benchmark.label} · to ${benchmark.last}`,
                hint: "The benchmark's own trailing year from the harvested store. The portfolio figure beside it is a holding-period return over the statements' window — different measurements, not a race.",
              })} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        {/* IPS BUCKETS ARE A MAPPING NOBODY HAS SUPPLIED, AND THE BARS SAID
            OTHERWISE. Growth 62 / Liquidity 18 / Tactical 12 / Hedge 8 summed to
            exactly 100%, each drawn as a filled bar across the card — the visual
            grammar of a measured allocation of this family's real ₹335.4 Cr.
            Nothing measured it. Which holding sits in which bucket is a family
            decision, and until they make it there is no weight to draw, so the
            card names the buckets and shows each as absent. */}
        {/* THE MAPPING EXISTS NOW, AND THE CARD READS IT RATHER THAN ASSERTING
            EITHER WAY. It used to draw Growth 62 / Liquidity 18 / Tactical 12 /
            Hedge 8 — summing to exactly 100%, as filled bars across this
            family's real ₹335 Cr, with nothing measuring any of it. It then
            went the other way and showed every bucket absent whatever the family
            had entered. Both are wrong in the same direction: the card was not
            reading the one place the answer lives. `bucketActuals` maps on
            ASSET CLASS — the family's four or five decisions on Exposure & IPS —
            and an unmapped class contributes to no bucket and is named below.

            The pill reads "not mapped" rather than "0% mapped": nothing measured
            a zero there, the family has simply not made the mapping yet, and a
            percentage reads as the result of a calculation over something. */}
        <Card title={<span className="flex items-center gap-2"><PieChart className="h-4 w-4 text-champagne-400" /> IPS buckets</span>}
          subtitle="Actual weight of the book, on the family's own asset-class mapping"
          right={<Pill tone={buckets && buckets.mappedPct > 0 ? "info" : "default"}>
            {buckets && buckets.mappedPct > 0 ? `${buckets.mappedPct.toFixed(0)}% mapped` : "not mapped"}
          </Pill>}>
          <ul className="space-y-2.5">
            {IPS_BUCKETS.map((b) => {
              const w = buckets ? bucketWeightPct(buckets.actuals, b.key) : null;
              return (
                <li key={b.key} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-300" title={b.hint}>{b.label}</span>
                  {w === null
                    ? <AbsentCell reason={`no asset class is mapped to ${b.label} — the mapping is a family IPS decision, made on Exposure & IPS`} />
                    : <span className="mono text-slate-200">{w.toFixed(1)}%</span>}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            {buckets && buckets.actuals.unmappedValue > 0
              ? <>{money(buckets.actuals.unmappedValue)} — {((buckets.actuals.unmappedValue / buckets.actuals.total) * 100).toFixed(0)}% of the
                  book — sits in <span className="text-slate-400">{buckets.actuals.unmappedClasses.join(", ")}</span>, mapped to no
                  bucket. These weights are a partial view until it is, which is why they need not sum to 100.</>
              : <>Every asset class in the book is mapped, so these weights cover it all.</>}
            {" "}Bucket mapping is a family IPS decision and is made on <span className="text-slate-400">Exposure &amp; IPS</span>.
          </p>
        </Card>

        {/* Public vs private — real, and split on assetClass.
            This printed the WHOLE portfolio as "Public (listed)" and rendered
            private absent with the reason "no private-market holding in this
            book". The book's own summary says otherwise: ₹127.78 Cr listed
            against ₹207.65 Cr private. The reason was true of an earlier drop
            and false from the moment the AIF statements got a reader — 62% of
            this family's money was being labelled as something it is not, and
            then denied outright. */}
        <Card title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-champagne-400" /> Public vs private</span>}
          subtitle="Live from the book, split on what each holding IS" right={<Pill tone="info">live</Pill>}>
          <div className="flex items-center justify-between border-b border-ink-700/60 py-2.5 text-sm">
            <span className="text-slate-400">Public (listed)</span>
            <span className="mono text-slate-200">{money(split.listed)}</span>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-slate-400">Private (AIF &amp; unlisted)</span>
            {split.private > 0
              ? <span className="mono text-slate-200">{money(split.private)}</span>
              : <AbsentCell reason="no AIF, unlisted or structured holding in this scope" />}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            The split is on <span className="text-slate-400">assetClass</span> — what a holding is, not how its account is
            run. A PMS mandate holds ordinary listed equity; the AIF folios do not.
          </p>
        </Card>

        {/* UNDRAWN CAPITAL IS IN THE BOOK, AND THIS CARD USED TO INVENT IT.
            "Upcoming capital calls ₹2.4 Cr" and "Upcoming commitments ₹5.0 Cr"
            were typed constants while BOOK_COMMITMENTS carried the real figure —
            ₹75 L undrawn on each of the two Transition Venture trusts. That is
            the same failure CLAUDE.md records against the Morning CIO's
            dry-powder tile: denying or inventing a figure the archive holds is
            worse than omitting it, because a reader plans around it. */}
        <Card title={<span className="flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-champagne-400" /> Charity & commitments</span>}
          right={<Pill tone="info">commitments live</Pill>}>
          <div className="flex items-center justify-between border-b border-ink-700/60 py-2.5 text-[12.5px]">
            <span className="text-slate-400">Charity pool</span>
            {hv.charity.total === null
              ? <AbsentCell reason={TILE_ABSENT.charity} />
              : <span className="mono text-slate-200" title={`${hv.charity.of} ring-fenced line${hv.charity.of === 1 ? "" : "s"} on the balance sheet`}>{money(hv.charity.total)}</span>}
          </div>
          <div className="flex items-center justify-between border-b border-ink-700/60 py-2.5 text-[12.5px]">
            <span className="flex items-center gap-1.5 text-slate-400"><PhoneCall className="h-3.5 w-3.5" /> Undrawn commitments</span>
            {undrawn.total !== null
              ? <span className="mono text-slate-200">{money(undrawn.total)}</span>
              : <AbsentCell reason={undrawn.count
                  ? "a capital account is on file for this scope but states no undrawn balance"
                  : "no drawdown-fund capital account in this scope — nothing here can be called"} />}
          </div>
          <div className="flex items-center justify-between py-2.5 text-[12.5px]">
            <span className="text-slate-400">Call date</span>
            <AbsentCell reason="a capital account states the undrawn balance, not when the fund will call it" />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Undrawn capital is a liability the fund can call, not a holding — it is never summed into portfolio value.
          </p>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        {/* Top exposures — real */}
        <Card className="lg:col-span-2" title="Top 10 exposures" subtitle={`${scope} · live from the book`} right={<Pill tone="info">live</Pill>} pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {topExposures.map((t) => (
                  <tr key={t.key} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={t.key} name={t.name} /></td>
                    <td className="px-4 py-2.5 text-right mono text-slate-200">{money(t.mv)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">{(t.weight * 100).toFixed(1)}%</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(t.returnPct)}`}>{fmtPct(t.returnPct, { sign: true })}</td>
                  </tr>
                ))}
                {topExposures.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-500">No holdings in scope.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* WHAT WOULD LAND HERE, not four decisions the family has to make.
            "Review FM change at Aristos" and "Approve GLC Growth Fund top-up"
            named two of this book's own managers and asserted an event and a
            pending approval, neither of which exists. An item on a decisions
            queue is a to-do: a reader who sees one either acts or worries. */}
        {/* THE QUEUE IS REAL NOW, AND IT IS STILL ONLY WHAT SOMEBODY TYPED.
            Nothing generates an item. The previous build of this card carried
            four sample to-dos that named two of this book's own managers and
            asserted a pending approval — a reader who sees an item on a
            decisions queue either acts or worries, and a badge undoes neither.
            An empty queue below says nothing has been ENTERED, which is not the
            same claim as "the family has no decisions outstanding". */}
        {(() => {
          const open = household.decisions.filter((d) => d.state === "Open" || d.state === "In progress");
          const overdue = open.filter((d) => d.dueOn && Date.parse(`${d.dueOn}T00:00:00Z`) < Date.now());
          return (
            <Card title={<span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-champagne-400" /> Decisions required</span>}
              subtitle="The family's own queue — nothing here is generated"
              right={<Pill tone={overdue.length ? "warn" : open.length ? "info" : "default"}>{open.length} outstanding</Pill>}>
              {open.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-slate-500">
                  {household.decisions.length === 0
                    ? <>Nothing has been entered on the queue. That records the state of the <span className="text-slate-400">register</span>, not of the family's affairs — add items on the Advisers &amp; decisions tab.</>
                    : <>All {household.decisions.length} recorded decision{household.decisions.length === 1 ? " has" : "s have"} been settled or dropped.</>}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {open.slice(0, 6).map((d) => {
                    const late = !!d.dueOn && Date.parse(`${d.dueOn}T00:00:00Z`) < Date.now();
                    return (
                      <li key={d.id} className="flex items-start justify-between gap-2 rounded-md border border-ink-700 bg-ink-800/60 p-2.5">
                        <span className="text-[12.5px] leading-snug text-slate-300">
                          {d.title}
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {d.owner || "nobody named"}
                            {d.dueOn ? <span className={late ? " text-rose-400" : ""}> · due {d.dueOn}{late ? " · overdue" : ""}</span> : " · no due date set"}
                          </span>
                        </span>
                        <Pill tone={late ? "warn" : "info"}>{d.category}</Pill>
                      </li>
                    );
                  })}
                  {open.length > 6 && <li className="text-[11px] text-slate-500">and {open.length - 6} more on the Advisers &amp; decisions tab.</li>}
                </ul>
              )}
            </Card>
          );
        })()}
      </div>
    </div>
  );
}
