import { useMemo, useState } from "react";
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
import { PreviewBadge, PreviewPill } from "@/components/Preview";
import { usePortfolio } from "@/context/PortfolioContext";
import { byEntity, bySecurity, consolidatedMarketValue, dedupedPositions, publicPrivateSplit, sumOrNull } from "@/lib/analytics";
import { accountIndex, ownerOf } from "@/lib/accounts";
import { entityXirrPct } from "@/lib/returns";
import { fmtPct, changeColor } from "@/lib/format";

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
const TILE_ABSENT: Record<string, string> = {
  networth: "needs the family's off-book assets — property, bank balances, unlisted stakes — which no statement here carries",
  cash: "no bank statement in this drop; the book's cash is the sweep inside each mandate, not the family's bank balance",
  liq: "liquidity coverage is cash over a committed-outflow schedule, and no outflow schedule has been supplied",
  bench: "no benchmark series — the muns catalogue serves no index history endpoint",
  charity: "no charity pool is identified in the statements; it would need the family to ring-fence one",
};

export function FamilyDashboard() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const [scope, setScope] = useState<string>(FAMILY);

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
  const xirr = useMemo(() => (portfolio && scope !== FAMILY ? entityXirrPct(portfolio, scope, mv) : null), [portfolio, scope, mv]);

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

  if (!portfolio) return null;
  const money = (n: number) => fmtFromBase(n, { compact: true });

  return (
    <div>
      <PageHeader
        eyebrow="Family Dashboard · Layer 6"
        title="Family Dashboard"
        subtitle="Net worth, portfolio, liquidity and buckets — for each family member and for the family as a whole."
        right={<BasisPill liveText="Portfolio value marked live" hint="Portfolio value, the public/private split, top exposures and undrawn commitments are live from the book. Net worth, cash, liquidity coverage, benchmark and charity need sources this drop does not carry and render as absent with the reason." />}
      />

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
        <StatTile label="Net worth" {...absentTile(TILE_ABSENT.networth)} icon={<Landmark className="h-4 w-4" />} />
        <StatTile label="Cash available" {...absentTile(TILE_ABSENT.cash)} icon={<Droplets className="h-4 w-4" />} />
        <StatTile label="Liquidity coverage" {...absentTile(TILE_ABSENT.liq)} icon={<Gauge className="h-4 w-4" />} />
        <StatTile
          label={scope === FAMILY ? "Return on cost" : "Annual return (XIRR)"}
          value={scope === FAMILY
            ? <span className={changeColor(retPct)}>{fmtPct(retPct, { sign: true })}</span>
            : xirr == null
              ? <AbsentCell reason="no dated capital movements for this entity, so a money-weighted return cannot be measured" />
              : <span className={changeColor(xirr)}>{fmtPct(xirr, { sign: true })}</span>}
          sub={scope === FAMILY ? "holding-period, live" : xirr == null ? "not measurable" : "money-weighted"}
          icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label="Benchmark return" {...absentTile(TILE_ABSENT.bench)} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        {/* IPS BUCKETS ARE A MAPPING NOBODY HAS SUPPLIED, AND THE BARS SAID
            OTHERWISE. Growth 62 / Liquidity 18 / Tactical 12 / Hedge 8 summed to
            exactly 100%, each drawn as a filled bar across the card — the visual
            grammar of a measured allocation of this family's real ₹335.4 Cr.
            Nothing measured it. Which holding sits in which bucket is a family
            decision, and until they make it there is no weight to draw, so the
            card names the buckets and shows each as absent. */}
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><PieChart className="h-4 w-4 text-champagne-400" /> IPS buckets</span>}
          subtitle="Growth · Liquidity · Tactical · Hedge" right={<PreviewBadge label="Not mapped" />}>
          <ul className="space-y-2.5">
            {["Growth", "Liquidity", "Tactical", "Hedge"].map((b) => (
              <li key={b} className="flex items-center justify-between text-[12.5px]">
                <span className="text-slate-300">{b}</span>
                <AbsentCell reason={`no holding is mapped to the ${b} bucket — the mapping is a family IPS decision`} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Bucket mapping is a family IPS decision, not a statement figure. Once each holding carries a bucket, these
            weights compute from the book like every other allocation on this page.
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
            <AbsentCell reason={TILE_ABSENT.charity} />
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
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-champagne-400" /> Decisions required</span>}
          subtitle="What would surface here" right={<PreviewBadge label="Not wired" />}>
          <ul className="space-y-2.5">
            {[
              { t: "A commitment or top-up proposed and awaiting the family's approval", tag: "Commitment" },
              { t: "A bucket outside its IPS band, with the rebalancing trade it implies", tag: "IPS" },
              { t: "A manager event a mandate has disclosed and the family must respond to", tag: "Manager" },
              { t: "A capital call due against an undrawn commitment, and whether cash covers it", tag: "Liquidity" },
            ].map((d) => (
              <li key={d.t} className="flex items-start justify-between gap-2 rounded-md border border-ink-700 bg-ink-800/60 p-2.5">
                <span className="text-[12.5px] leading-snug text-slate-400">{d.t}</span>
                <PreviewPill>{d.tag}</PreviewPill>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">
            Nothing feeds this queue yet, so <span className="text-slate-400">no decision is outstanding</span> — these are
            the kinds of item it would carry.
          </p>
        </Card>
      </div>
    </div>
  );
}
