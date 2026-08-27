import { useMemo } from "react";
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, ReferenceLine,
} from "recharts";
import { Percent, TrendingDown, Target, Scale } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { StatTile } from "@/components/StatTile";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtPct, changeColor } from "@/lib/format";
import { sum, isPriced, unpriced, isPrivateClass, isFundVehicle, bucketLabel } from "@/lib/analytics";
import { Auditable } from "@/components/Auditable";
import { BasisPill } from "@/components/BasisPill";
import { AbsentCell, AbsentSection, DASH } from "@/components/Absent";
import { auditHref, LEDGER, stockHref } from "@/lib/auditFormulas";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle } from "@/lib/chartTheme";

const GAIN = "#10b981", LOSS = "#ef4444";

// Return & Drawdown — the return half, built from what the book carries.
//
// DRAWDOWN IS GONE, AND SAYS SO. A drawdown is peak-to-trough of a VALUATION
// SERIES: it needs the book's value at many dates. This corpus carries two dated
// values per account and nothing between them, so there is no peak to fall from.
// The page previously drew a drawdown area against a seeded placeholder
// benchmark — an axis with a shape on it and no measurement behind it. That is
// replaced by a statement of exactly which document would produce one.
//
// WHAT IS REAL HERE. Every position carries a cost basis, a market value and
// therefore a return. That supports a genuine distribution, a
// contribution-to-return decomposition by position and by sector, the best and
// worst name per account, and the spread between ACCOUNTS — which is what the
// registry supports. A spread between MANAGERS would have to be struck over the
// discretionary mandates alone; the ends of this one are a venture-fund capital
// account and the family's own broking account, and neither is a manager.
//
// All of it is point-in-time on the statements' own marks, which is stated
// rather than dressed up as a time series.

/** Return bands, lowest first so the axis reads left to right. */
const BANDS = [
  { label: "< −25%", lo: -Infinity, hi: -25 },
  { label: "−25 to −10%", lo: -25, hi: -10 },
  { label: "−10 to 0%", lo: -10, hi: 0 },
  { label: "0 to 10%", lo: 0, hi: 10 },
  { label: "10 to 25%", lo: 10, hi: 25 },
  { label: "25 to 50%", lo: 25, hi: 50 },
  { label: "> 50%", lo: 50, hi: Infinity },
];

const acctLabel = (a: { owner?: string | null; provider: string; accountNo: string }) =>
  `${a.owner ?? a.accountNo} · ${a.provider.split(" ")[0]} ${a.accountNo}`;

/**
 * The short form for the spread tile's two ends. It carries the ACCOUNT NUMBER
 * as well as the provider because a provider is not an account: this book holds
 * two Transition Venture Capital folios, two SVAN accounts, two Green Lanterns,
 * two V.E.Cs and two Goldstandards, so the provider word alone does not say
 * which row of the table below the figure came from.
 */
const acctEnd = (a: { provider: string; accountNo: string }) =>
  `${a.provider.split(" ")[0]} ${a.accountNo}`;

export function ReturnAnalysis() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();

  const model = useMemo(() => {
    if (!portfolio) return null;
    // CONSOLIDATED: the book-wide figures on this page — the return
    // distribution, the contribution decomposition by name and by sector, the
    // embedded return — count a holding reported under two members once. Without
    // this the distribution puts the same ₹1.46 Cr in the same band twice. The
    // PER-ACCOUNT table below, and the spread struck from it, read the full
    // position set instead: see the note above `pricedByAccount`.
    const priced = consolidated.filter(isPriced);
    // Named, not just dropped: a position whose statement reports no cost cannot
    // answer a question about return, and the page says how many that is.
    const withoutCost = unpriced(consolidated);
    const cost = sum(priced.map((x) => x.costBasis));
    const pnl = sum(priced.map((x) => x.unrealizedPnL));

    // Distribution by VALUE, not by count: ten small losers and one large winner
    // is a different book from the reverse, and a count hides that.
    const dist = BANDS.map((b) => {
      const inBand = priced.filter((x) => x.returnPct >= b.lo && x.returnPct < b.hi);
      return { label: b.label, value: sum(inBand.map((x) => x.marketValue)), names: inBand.length, loss: b.hi <= 0 };
    });

    // Contribution to return: each position's unrealised P&L over the book's
    // TOTAL cost, so the parts add to the embedded return exactly.
    const contrib = priced
      .map((x) => ({
        key: x.securityKey, security: x.security, pnl: x.unrealizedPnL, returnPct: x.returnPct,
        contribPct: cost > 0 ? (x.unrealizedPnL / cost) * 100 : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);

    // A FUND UNIT CARRIES NO EQUITY SECTOR — and the test for that is
    // `isFundVehicle`, not `isPrivateClass`.
    //
    // Keying a wrapper under "Unclassified" made it the single largest "sector",
    // which is why AIF units were moved to their own asset-class row. That fix
    // stopped one class short: a mutual fund is marked at a published NAV so it
    // is not PRIVATE, and this book holds ₹52.4 Cr of mutual-fund units — Helios
    // Flexi Cap ₹31.0 Cr and Motilal Oswal Active Momentum ₹21.4 Cr — which went
    // on sitting in "Unclassified" beside shares that genuinely have no sector
    // printed. Bucket every wrapper under its asset class instead. Its P&L still
    // counts, so the rows still sum to the embedded return exactly; only the
    // label changes, from a sector it never had to the thing it is.
    //
    // THE COMPANY SIDE IS `isCompanyShare`'S SET AND STAYS THAT WAY. A share a
    // discretionary manager chose under a PMS mandate has a GICS sector exactly
    // like one the family bought itself, so it belongs in this table under that
    // sector — narrowing to own-held shares here would drop ₹127 Cr of real
    // sector exposure and answer a narrower question than the heading asks. The
    // holdings TABLES regroup by mandate; a sector attribution does not, and the
    // caption says so rather than leaving the reader to infer it from a word.
    //
    // A ROW IS A SECTOR OR A CLASS, AND WHICH IT IS TRAVELS WITH IT. The label
    // for a class comes from `bucketLabel` — the one place a class becomes a
    // word — so this table cannot print a class name that Portfolio Monitor,
    // Morning CIO or Exposure & IPS have since relabelled. A sector is the
    // provider's own normalised taxonomy and is never passed through it.
    const bySector = new Map<string, { pnl: number; cost: number; mv: number; isClass: boolean }>();
    for (const x of priced) {
      const byClass = isFundVehicle(x) || isPrivateClass(x);
      const secKey = byClass ? x.assetClass : x.sector;
      const e = bySector.get(secKey) ?? { pnl: 0, cost: 0, mv: 0, isClass: byClass };
      e.pnl += x.unrealizedPnL; e.cost += x.costBasis; e.mv += x.marketValue;
      bySector.set(secKey, e);
    }
    // The wrapper classes this table bucketed BY CLASS, derived from the same
    // rows the table is built from and carrying the SAME label the rows do.
    // Named in the caption so the page states which of its rows are asset
    // classes rather than sectors — and so the rendering check has something on
    // the page to hold the table against: a class named here with no row in the
    // table is a wrapper that leaked back into "Unclassified", which is exactly
    // the regression being guarded. Labelled through `bucketLabel` on both
    // sides, because a caption naming "Mutual Fund" over a row headed something
    // else would satisfy a reader and fail the reader's arithmetic.
    const wrapperClasses = [...new Set(
      priced.filter((x) => isFundVehicle(x) || isPrivateClass(x)).map((x) => bucketLabel(x.assetClass)),
    )].sort();
    const sectors = [...bySector.entries()]
      .map(([sector, e]) => ({
        sector, ...e,
        label: e.isClass ? bucketLabel(sector) : sector,
        returnPct: e.cost > 0 ? (e.pnl / e.cost) * 100 : null,
        contribPct: cost > 0 ? (e.pnl / cost) * 100 : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);

    // PER ACCOUNT, so this reads the full position set, NOT the deduped one.
    // Deduping here emptied Bharat's 360 ONE account entirely — his only holding
    // is the AIF also reported under Ajay's CRN, and dedupe keeps whichever row
    // comes first. The row then rendered `0  ₹0  ₹0`, which says the account
    // measured nothing when it holds ₹1.46 Cr. Book-wide figures above dedupe;
    // an account's own row shows its own statement.
    // AN EMPTY SUM IS NOT A MEASUREMENT OF ZERO. `sum([])` is 0, so an account
    // this page found no priced rows for rendered `0 · ₹0 · ₹0` — and two
    // accounts here have no rows at all because NO STATEMENT VALUES THEM. The
    // 360 ONE Alternates folios (1000632, 1000633) issue distribution letters and
    // statements of earnings and never a valuation; the book already says so in
    // `Account.noPositionsReason`, and this table printed ₹0 over the top of it.
    // That is the standing rule's exact failure — a measured zero and an absent
    // measurement looking the same — against an account whose units ARE marked,
    // on another member's statement.
    //
    // Contrast HDFC 16180583, which really is ₹0: both its schemes are redeemed
    // to nil units, its `noPositionsReason` is null, and its zero stays.
    const pricedByAccount = portfolio.positions.filter(isPriced);
    const byAccount = portfolio.accounts.map((a) => {
      const rows = pricedByAccount.filter((x) => x.accountId === a.accountId);
      const held = portfolio.positions.filter((x) => x.accountId === a.accountId).length;
      const measured = rows.length > 0;
      const c = sum(rows.map((x) => x.costBasis));
      const pl = sum(rows.map((x) => x.unrealizedPnL));
      const sorted = [...rows].sort((x, y) => y.returnPct - x.returnPct);
      return {
        account: a, names: rows.length, held,
        // Null, not zero, when nothing on this account carries a cost to sum.
        cost: measured ? c : null,
        pnl: measured ? pl : null,
        returnPct: measured && c > 0 ? (pl / c) * 100 : null,
        // Why the row is empty: the book's own reason where it has one, else the
        // fact that the account's holdings report no cost.
        absentReason: a.noPositionsReason
          ?? (held === 0
            ? "no holding on this account in the book"
            : "no holding on this account reports a cost basis, so cost and gain are not measurable"),
        best: sorted[0] ?? null,
        worst: sorted[sorted.length - 1] ?? null,
      };
    }).sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity));

    const rated = byAccount.filter((a) => a.returnPct !== null);
    const winners = priced.filter((x) => x.unrealizedPnL > 0);
    return {
      priced, withoutCost, cost, pnl, dist, contrib, sectors, wrapperClasses, byAccount, winners: winners.length,
      embeddedRet: cost > 0 ? (pnl / cost) * 100 : null,
      hitRate: priced.length ? (winners.length / priced.length) * 100 : null,
      // Only across accounts that HAVE a return — an account without one is
      // named, never folded in as zero.
      spread: rated.length >= 2 ? rated[0].returnPct! - rated[rated.length - 1].returnPct! : null,
      spreadEnds: rated.length >= 2 ? [rated[0], rated[rated.length - 1]] : null,
      unrated: byAccount.filter((a) => a.returnPct === null).map((a) => a.account.accountNo),
    };
  }, [portfolio]);

  if (!portfolio || !model) return null;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const m = model;

  if (!m.priced.length) {
    return (
      <div>
        <PageHeader eyebrow="Analytics" title="Return &amp; Drawdown" />
        <AbsentSection what="No priced positions in this book"
          needs="A return needs a cost basis and a market value on the same position. No holding in this book carries both." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Analytics" title="Return &amp; Drawdown"
        subtitle="Where the book's return comes from, name by name and sector by sector. Point-in-time, on the statements' own marks."
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Returns are unrealised gain on cost, rebuilt from live prices where a quote exists; cost basis is as the statements report it." />
          <Pill tone="info">{m.priced.length} priced positions</Pill>
        </div>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Embedded return"
          value={<Auditable to={auditHref(LEDGER)} title="Unrealised gain on cost — trace to the ledger">
            <span className={changeColor(m.embeddedRet ?? 0)}>{fmtPct(m.embeddedRet ?? 0, { sign: true })}</span>
          </Auditable>}
          sub={<>{money(m.pnl, true)} on {money(m.cost)} of cost</>} icon={<Percent className="h-4 w-4" />} />

        <StatTile label="Names in profit" value={`${(m.hitRate ?? 0).toFixed(0)}%`}
          sub={`${m.winners} of ${m.priced.length} positions`} icon={<Target className="h-4 w-4" />} />

        {/* SPREAD BETWEEN ACCOUNTS, WHICH IS WHAT IS MEASURED. `rated` is every
            account in the registry that carries a cost basis, and on this book
            the two ends are a drawdown venture-fund capital account (Transition
            Venture Capital, engagement AIF) and the family's own self-directed
            broking account (LKP, engagement Execution). Neither is a manager
            running a discretionary mandate, so "Spread between managers" over
            them asserts manager dispersion nobody measured — the same failure as
            a word claiming how a holding is run over a set where it is not true.
            The table directly below is headed "Per account" and says a PMS
            mandate and the family's own demat are each one row of it; this tile
            is the same set and now uses the same word. Restricting `rated` to
            `isMandateHeld` accounts would be the other honest answer, and it is
            deliberately not taken: the widest dispersion in the book is a real
            finding, and narrowing it to the ten mandates would hide it. */}
        <StatTile label="Spread between accounts"
          value={m.spread === null ? <span className="text-slate-500">{DASH}</span> : `${m.spread.toFixed(1)} pp`}
          sub={m.spread === null
            ? "needs two accounts with a cost basis"
            : `${acctEnd(m.spreadEnds![0].account)} to ${acctEnd(m.spreadEnds![1].account)}`}
          hint={m.unrated.length ? `${m.unrated.length === 1 ? "Account" : "Accounts"} ${m.unrated.join(", ")} ${m.unrated.length === 1 ? "has" : "have"} no cost basis and ${m.unrated.length === 1 ? "is" : "are"} excluded rather than counted as zero.` : undefined}
          icon={<Scale className="h-4 w-4" />} />

        <StatTile label="Maximum drawdown" value={<span className="text-slate-500">{DASH}</span>}
          sub="needs a valuation series"
          hint="Peak-to-trough needs the book's value at many dates; this corpus carries two per account."
          icon={<TrendingDown className="h-4 w-4" />} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5 items-start">
        <Card className="lg:col-span-3" title="Return distribution"
          subtitle="Market value in each return band — by value, not by count">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.dist} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" stroke="#6b6880" fontSize={10} interval={0} angle={-20} textAnchor="end" height={58} />
                <YAxis stroke="#6b6880" fontSize={11} tickFormatter={(v: number) => fmtFromBase(v, { compact: true })} width={78} />
                <ReferenceLine y={0} stroke="#3a3570" />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                  formatter={(v: number, _n, o) => [`${fmtFromBase(v as number, { compact: true })} · ${(o?.payload as { names: number })?.names ?? 0} names`, "Market value"]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {m.dist.map((d, i) => <Cell key={i} fill={d.loss ? LOSS : GAIN} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* THE SET NAME IS A SENTENCE, NOT A CLASS LABEL. This card's rows are
            every share in a company — own-held and mandate-held alike — plus one
            row per fund wrapper, and no class word names that set.

            It used to read `assetClassLabel("Equity")`, the ONLY hardcoded call
            to that helper in src/ and the one place a class label was being used
            as a noun phrase for a set rather than as a row label. That is a
            binding no caption should have: `CLASS_LABEL` exists to answer "what
            IS this holding?", it has already been rewritten twice as the family
            read successive words as claims about WHO CHOSE the position, and
            each rewrite silently changed the meaning of this sentence — which
            then went on to say "a manager's mandate included" in its own next
            clause. Whatever the class vocabulary settles on, a caption that
            reads "<class word> by sector — a manager's mandate included" is
            either redundant or self-contradicting, and nothing on the `returns`
            route checks its vocabulary.

            The phrase below states the set outright, so it is true under either
            vocabulary and cannot go stale when a class is relabelled. The class
            words this card DOES render — its row labels and the wrapper classes
            named under the table — still come from `bucketLabel`, which is
            correct: those ARE classes. */}
        <Card className="lg:col-span-2" title="Contribution by sector"
          subtitle={<>Every share in a company, by sector — a manager&rsquo;s mandate included — and every
            fund wrapper under its own class, each as a share of total cost</>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="label-xs border-b border-ink-700">
                <tr>
                  <th className="px-2 py-2 text-left">Sector / class</th>
                  <th className="px-2 py-2 text-right">P&amp;L</th>
                  <th className="px-2 py-2 text-right">Return</th>
                  <th className="px-2 py-2 text-right">Contrib.</th>
                </tr>
              </thead>
              <tbody>
                {m.sectors.map((s) => (
                  <tr key={s.sector} className="border-t border-ink-700/60">
                    <td className="px-2 py-2 text-slate-200">{s.label}</td>
                    <td className={`px-2 py-2 text-right mono ${changeColor(s.pnl)}`}>{money(s.pnl, true)}</td>
                    <td className="px-2 py-2 text-right mono">
                      {s.returnPct === null
                        ? <span className="text-slate-500" title="no cost basis on these rows">{DASH}</span>
                        : <span className={changeColor(s.returnPct)}>{fmtPct(s.returnPct, { sign: true, decimals: 1 })}</span>}
                    </td>
                    <td className={`px-2 py-2 text-right mono ${changeColor(s.contribPct)}`}>{fmtPct(s.contribPct, { sign: true, decimals: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink-600 font-semibold">
                <tr>
                  <td className="px-2 py-2 text-slate-200">Total</td>
                  <td className={`px-2 py-2 text-right mono ${changeColor(m.pnl)}`}>{money(m.pnl, true)}</td>
                  <td className={`px-2 py-2 text-right mono ${changeColor(m.embeddedRet ?? 0)}`}>{fmtPct(m.embeddedRet ?? 0, { sign: true, decimals: 1 })}</td>
                  <td className={`px-2 py-2 text-right mono ${changeColor(m.embeddedRet ?? 0)}`}>{fmtPct(m.embeddedRet ?? 0, { sign: true, decimals: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Contributions are each row's P&amp;L over the book's TOTAL cost, so they add to the embedded
            return exactly. A GICS sector is a property of a COMPANY, so every share in a company is bucketed by
            one — including the shares a discretionary manager chose under a PMS mandate, which carry a sector
            like any other share. This is an attribution, not a holdings table: seeing into a mandate is what
            makes the sector picture real, so those names are not rolled up into their manager here.
            A fund is a wrapper holding many companies and has no sector of its own, so it appears under its
            asset class instead. Its gain still counts — it is not a sector.
            {m.wrapperClasses.length > 0 && <> Bucketed by class here:{" "}
              <span className="text-slate-400">{m.wrapperClasses.join(", ")}</span>.</>}
          </p>
        </Card>
      </div>

      <Card className="mt-5" title="Per account"
        subtitle="The same measure on every account the book carries, and each one's best and worst name — a PMS mandate is one account here, and so is the family's own demat">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="label-xs border-b border-ink-700">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Names</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Unrealised P&amp;L</th>
                <th className="px-3 py-2 text-right">Return</th>
                <th className="px-3 py-2 text-left">Best</th>
                <th className="px-3 py-2 text-left">Worst</th>
              </tr>
            </thead>
            <tbody>
              {m.byAccount.map((a) => (
                <tr key={a.account.accountId} className="border-t border-ink-700/60">
                  <td className="px-3 py-2.5 font-medium text-slate-100">{acctLabel(a.account)}</td>
                  <td className="px-3 py-2.5 text-right mono text-slate-400">
                    {a.cost === null ? <AbsentCell reason={a.absentReason} /> : a.names}
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-slate-300">
                    {a.cost === null ? <AbsentCell reason={a.absentReason} /> : money(a.cost)}
                  </td>
                  <td className={`px-3 py-2.5 text-right mono ${a.pnl === null ? "" : changeColor(a.pnl)}`}>
                    {a.pnl === null ? <AbsentCell reason={a.absentReason} /> : money(a.pnl, true)}
                  </td>
                  <td className="px-3 py-2.5 text-right mono">
                    {a.returnPct === null
                      ? <AbsentCell reason={a.absentReason} />
                      : <span className={changeColor(a.returnPct)}>{fmtPct(a.returnPct, { sign: true, decimals: 1 })}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.best
                      ? <a className="text-slate-200 hover:text-accent-400" href={stockHref(a.best.securityKey)}>
                          {a.best.security} <span className="mono text-gain">{fmtPct(a.best.returnPct, { sign: true, decimals: 0 })}</span>
                        </a>
                      : <span className="text-slate-500">{DASH}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.worst
                      ? <a className="text-slate-200 hover:text-accent-400" href={stockHref(a.worst.securityKey)}>
                          {a.worst.security} <span className="mono text-loss">{fmtPct(a.worst.returnPct, { sign: true, decimals: 0 })}</span>
                        </a>
                      : <span className="text-slate-500">{DASH}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          These are point-in-time returns on cost, not time-weighted, so they are not a like-for-like ranking of
          manager skill — an account funded later shows a different figure for the same performance. Each
          manager's own time-weighted return is on <span className="font-medium text-slate-400">NAV &amp; Performance</span>.
        </p>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <Card title="Largest contributors" subtitle="By unrealised P&amp;L">
          <ContribTable rows={m.contrib.slice(0, 10)} money={money} />
        </Card>
        <Card title="Largest detractors" subtitle="By unrealised P&amp;L">
          <ContribTable rows={[...m.contrib].reverse().slice(0, 10)} money={money} />
        </Card>
      </div>

      <Card className="mt-5" title="Drawdown" subtitle="Peak-to-trough decline in the book's value">
        <AbsentSection
          what="No drawdown can be computed for this book"
          needs={`A drawdown is the largest peak-to-trough fall in the book's VALUE, which needs that value at
            many dates. Each account's statements carry two — the opening and closing figures on the performance
            summary — so there is no peak to fall from. A periodic (monthly or quarterly) valuation statement per
            account, or a daily NAV feed from the managers, is what this needs. Nothing here is drawn against a
            placeholder series.`} />
      </Card>
    </div>
  );
}

function ContribTable({ rows, money }: {
  rows: { key: string; security: string; pnl: number; returnPct: number; contribPct: number }[];
  money: (n: number, sign?: boolean) => string;
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-[11.5px] text-slate-500">{DASH} no priced positions in the book</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead className="label-xs border-b border-ink-700">
          <tr>
            <th className="px-2 py-2 text-left">Security</th>
            <th className="px-2 py-2 text-right">P&amp;L</th>
            <th className="px-2 py-2 text-right">Return</th>
            <th className="px-2 py-2 text-right">Contrib.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.key}-${r.pnl}`} className="border-t border-ink-700/60">
              <td className="px-2 py-2">
                <a className="text-slate-200 hover:text-accent-400" href={stockHref(r.key)}>{r.security}</a>
              </td>
              <td className={`px-2 py-2 text-right mono ${changeColor(r.pnl)}`}>{money(r.pnl, true)}</td>
              <td className={`px-2 py-2 text-right mono ${changeColor(r.returnPct)}`}>{fmtPct(r.returnPct, { sign: true, decimals: 1 })}</td>
              <td className={`px-2 py-2 text-right mono ${changeColor(r.contribPct)}`}>{fmtPct(r.contribPct, { sign: true, decimals: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
