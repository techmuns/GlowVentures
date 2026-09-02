import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from "recharts";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { BOOK_NAV_COVERAGE } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { navIndexSeries, rebasedIndex, navCoverageStats, windowReturnPct } from "@/lib/navSeries";
import { fetchPriceHistory, toPoints, type PriceHistory } from "@/lib/prices";
import { NIFTY_500_SYMBOL, NIFTY_500_LABEL } from "@/lib/indices";
import { fmtPct, fmtNum, changeColor, DASH } from "@/lib/format";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle } from "@/lib/chartTheme";

// ── THE DATED NAV SERIES, CHARTED AGAINST THE NIFTY 500 ──────────────────────
//
// This card replaces one that rendered an `AbsentSection` reading "No valuation
// series in this book · each account's statements carry exactly two points".
// That was true of the nine-account corpus it was written against and has been
// false since the first drop REISSUED a statement. Thirteen accounts now publish
// two or more dated valuations. Leaving the absence up would have been the FIFTH
// time this repo told a reader to stop looking for something already in the
// archive — after FRED, the RBI, the release calendar and the ISIN tier.
//
// THE LINE THAT IS DRAWN IS FLOW-ADJUSTED, AND THAT IS THE WHOLE CARD. The raw
// NAV runs +9.29% over this window against the Nifty 500's +1.33%; ₹11.24 Cr of
// that is a deposit into V.E.C 128005 on 28–29 July, and net of it the book
// earned +0.54%. Both curves are drawn, because a reader whose NAV went up ₹12 Cr
// is entitled to see that too — but the one labelled as the book's RETURN is the
// one the money did not walk into.
//
// EVERY ACCOUNT THE SERIES CANNOT COVER IS NAMED, which is the half of the
// family's request that the chart cannot answer on its own.

const BOOK_COLOR = "#d9c48f";
const INDEX_COLOR = "#6366f1";
const NAV_COLOR = "#64748b";

export function NavVsIndex() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [index, setIndex] = useState<PriceHistory | null>(null);
  const [indexState, setIndexState] = useState<"loading" | "ok" | "down">("loading");
  const [showRaw, setShowRaw] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPriceHistory(NIFTY_500_SYMBOL).then((r) => {
      if (!alive) return;
      if (r.ok) { setIndex(r); setIndexState("ok"); } else setIndexState("down");
    });
    return () => { alive = false; };
  }, []);

  const model = useMemo(() => {
    if (!portfolio) return null;
    const book = navIndexSeries(portfolio.navHistory);
    const stats = navCoverageStats(BOOK_NAV_COVERAGE, portfolio);
    const dates = book.map((p) => p.date);
    const idx = index ? rebasedIndex(toPoints(index), dates) : new Map<string, number>();
    const rows = book.map((p) => ({
      date: p.date,
      book: Number(p.index.toFixed(3)),
      nav: Number(p.navIndex.toFixed(3)),
      navRupees: p.nav,
      flowIn: p.flowIn,
      accountsOnDate: p.accountsOnDate,
      accountsCarried: p.accountsCarried,
      unreportedFlowValue: p.unreportedFlowValue,
      index: idx.has(p.date) ? Number((idx.get(p.date) as number).toFixed(3)) : null,
    }));
    const bookRet = windowReturnPct(book);
    const lastIdx = [...idx.values()].at(-1);
    const indexRet = lastIdx === undefined ? null : lastIdx - 100;
    // The steps a reader would otherwise read as performance: an interval that
    // took external capital. Marked ON the chart, not explained underneath it.
    const flowMarks = rows.filter((r) => Math.abs(r.flowIn) > 1e5);
    const unproven = rows.filter((r) => r.unreportedFlowValue > 0);
    return { book, rows, stats, bookRet, indexRet, flowMarks, unproven, dates };
  }, [portfolio, index]);

  if (!model || !portfolio) return null;
  const { rows, stats, bookRet, indexRet, flowMarks, unproven } = model;
  const cov = BOOK_NAV_COVERAGE;
  // NAMED FROM THE REGISTRY, NOT FROM THE ID. `accountId` is a slug and reads
  // as one; the registry is where "who runs this and whose money it is" lives,
  // and `custodianOf()` was deleted for guessing it out of text (§2).
  const accts = accountIndex(portfolio.accounts);
  const nameOf = (id: string) => {
    const a = accts.get(id);
    if (!a) return id;
    const owner = a.ownerId ? ownerDisplayName(a.ownerId) : a.owner;
    return `${a.provider}${owner ? ` · ${owner}` : ""}`;
  };

  // A series needs at least two points and a set to hold constant over. Both
  // halves of the family's ask are answered here: the series when it exists, and
  // the accounts that cannot supply one either way.
  if (rows.length < 2) {
    return (
      <Card className="flex flex-col lg:col-span-2" title="Portfolio NAV vs Nifty 500"
        subtitle="Dated portfolio values from the statements, against the index">
        <AbsentSection
          what="No account in this book publishes more than one dated valuation"
          needs={`A NAV series needs the same account valued at two or more dates. ${stats.singleCount} account(s) publish exactly one and ${stats.unvaluedCount} publish none, so there is no set over which a series could hold its composition constant. The next monthly reissue of any statement already in the archive starts one.`} />
        <ExcludedAccounts cov={cov} nameOf={nameOf} fmt={fmtFromBase} />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col lg:col-span-2"
      title="Portfolio NAV vs Nifty 500"
      subtitle={<>
        {rows.length} dated points, {cov.from} → {cov.to}, over the{" "}
        <strong className="text-slate-300">{stats.coveredCount} of {stats.accountsTotal} accounts</strong> that publish more than one
        dated valuation — {fmtFromBase(rows[rows.length - 1].navRupees, { compact: true })} of the{" "}
        {fmtFromBase(stats.consolidatedValue, { compact: true })} book.
        {/* THE NUMERATOR IS THE SERIES' OWN LAST POINT, NOT THE PER-ACCOUNT SUM.
            Those differ by ₹1.46 Cr here — 360 ONE Special Opportunities under
            both CRNs — and the denominator beside it is the CONSOLIDATED NAV,
            which counts that holding once. A per-account numerator over a
            consolidated denominator is two bases in one fraction, which is the
            mistake the allocation footer already cost this book once. */}
        {" "}Each point holds every account at its most recent mark on that date and counts each duplicated holding once.
      </>}
      right={
        <div className="flex flex-col items-end gap-1">
          {bookRet == null ? <Pill>— no return</Pill> : (
            <Pill tone={bookRet >= 0 ? "gain" : "loss"}>Book {fmtPct(bookRet, { sign: true })}</Pill>
          )}
          {indexRet == null
            ? <span title="The index history could not be fetched, so no comparison is drawn."><Pill>— {NIFTY_500_LABEL}</Pill></span>
            : <Pill tone="info">{NIFTY_500_LABEL} {fmtPct(indexRet, { sign: true })}</Pill>}
        </div>
      }>

      <div className="min-h-[15rem] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="date" stroke="#6b6880" fontSize={11} />
            {/* INDEX POINTS, NOT RUPEES. Both curves are rebased to 100 at the
                first dated point, so the axis is a ratio and must not be run
                through the money formatter — `fmtFromBase` would put a ₹ on a
                number that is not an amount of anything. */}
            <YAxis stroke="#6b6880" fontSize={11} width={52} domain={["auto", "auto"]}
              tickFormatter={(v: number) => fmtNum(v, 1)} />
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
              formatter={(v: number, name: string) => [`${fmtNum(v, 2)} (${fmtPct(v - 100, { sign: true })})`, name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="book" stroke={BOOK_COLOR} strokeWidth={2} dot={{ r: 2 }}
              name="Book · ex capital flows" connectNulls />
            <Line type="monotone" dataKey="index" stroke={INDEX_COLOR} strokeWidth={2} dot={false}
              name={NIFTY_500_LABEL} connectNulls />
            {showRaw && (
              <Line type="monotone" dataKey="nav" stroke={NAV_COLOR} strokeWidth={1.5} strokeDasharray="4 3" dot={false}
                name="NAV incl. capital added" connectNulls />
            )}
            {/* THE STEP THAT IS MONEY, MARKED WHERE IT HAPPENS. A reader looking
                at the dashed line jumping 8% in one interval must be able to see
                on the chart that a deposit landed there, not read it in a
                paragraph below the fold. */}
            {flowMarks.map((f) => (
              <ReferenceDot key={f.date} x={f.date} y={f.nav} r={5} fill="none" stroke="#f59e0b" strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-slate-400">
        <p data-testid="nav-flow-note">
          <strong className="text-slate-300">Both lines are rebased to 100 at {cov.from}.</strong>{" "}
          {flowMarks.length > 0 ? (
            <>The book line nets out{" "}
              <strong className="text-slate-300">{fmtFromBase(flowMarks.reduce((a, f) => a + Math.max(f.flowIn, 0), 0), { compact: true })}</strong>{" "}
              of external capital that entered over the window (circled), because money added is not money earned.
              The dashed line is the NAV with it left in — it reads{" "}
              {fmtPct(rows[rows.length - 1].nav - 100, { sign: true })} against the book&rsquo;s{" "}
              {bookRet == null ? "—" : fmtPct(bookRet, { sign: true })}, and the difference is the deposit rather than performance.{" "}
              <button type="button" onClick={() => setShowRaw((v) => !v)}
                className="underline decoration-dotted underline-offset-2 hover:text-champagne-400">
                {showRaw ? "Hide" : "Show"} the unadjusted NAV line
              </button>.
            </>
          ) : (
            <>No external capital entered or left the covered accounts over this window, so the book line and the raw NAV are the same measurement.</>
          )}
        </p>
        {unproven.length > 0 && (
          <p data-testid="nav-unproven-note">
            <strong className="text-amber-400">
              {fmtFromBase(Math.max(...unproven.map((u) => u.unreportedFlowValue)), { compact: true })}
            </strong>{" "}
            of the move is not proven to be performance: it was restated by{" "}
            {stats.unreportedFlowAccounts.length} covered account(s) that publish no dated capital record and hold more than one
            security — {stats.unreportedFlowAccounts.map(nameOf).join(", ")} — so a subscription or redemption inside one of
            them would appear here as a return. The other covered accounts either publish a capital register or hold a single
            security whose unit count is identical at every snapshot, which rules a movement out from the statement itself.
          </p>
        )}
        <p>
          The index is taken at its last close <em>on or before</em> each statement date, never the nearest in either
          direction — a book date is a statement date and an index date is a trading session, and taking the nearer close
          would credit the index with a move that had not happened when the mark was struck.
        </p>
      </div>

      {indexState === "down" && (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-400">
          The {NIFTY_500_LABEL} history could not be fetched, so no comparison line is drawn — the book&rsquo;s own series is
          unaffected and is shown alone. The price service runs as a server-side function on the deployed site and is not
          available in local preview.
        </p>
      )}

      <ExcludedAccounts cov={cov} nameOf={nameOf} fmt={fmtFromBase} />
    </Card>
  );
}

/**
 * THE OTHER HALF OF THE ASK — "or state the accounts that cannot supply one".
 *
 * Two lists, kept apart because they send a reader to two different places: an
 * account publishing ONE dated valuation needs its next monthly statement, and
 * an account publishing NONE needs a fund that values it at all. Folding them
 * into one "not covered" count would hide which is which.
 */
function ExcludedAccounts({ cov, nameOf, fmt }: {
  cov: typeof BOOK_NAV_COVERAGE;
  nameOf: (id: string) => string;
  fmt: (n: number | null | undefined, o?: { compact?: boolean }) => string;
}) {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  if (!cov.single.length && !cov.unvalued.length) return null;
  return (
    <details className="mt-3 rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2" data-testid="nav-excluded">
      {/* THE SPLIT IS IN THE SUMMARY, NOT ONLY INSIDE THE FOLD. "36 accounts
          cannot supply a series" is one fact; "23 publish one valuation and 13
          publish none" is two, and they send a reader to two different places —
          a next monthly statement, or a fund that values the folio at all. A
          reader who never opens the details still gets both. */}
      <summary className="cursor-pointer text-[11.5px] text-slate-400">
        The <strong className="text-slate-300">{cov.single.length + cov.unvalued.length} accounts</strong> that cannot supply a
        series — {fmt(sum(cov.single.map((s) => s.bookValue)) + sum(cov.unvalued.map((u) => u.bookValue)), { compact: true })} ·{" "}
        {cov.single.length} publish exactly one dated valuation, {cov.unvalued.length} publish no valuation at all — named
      </summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="label-xs">{cov.single.length} publish exactly one dated valuation</div>
          <p className="mt-1 text-[11px] text-slate-500">
            A level, never a change. Carrying them into the series as a flat line would drag its return towards a figure
            nothing measured. The next reissue of any of these statements gives each a second point.
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid="nav-single-list">
            {[...cov.single].sort((a, b) => b.bookValue - a.bookValue).map((s) => (
              <li key={s.accountId} className="flex justify-between gap-3">
                <span className="truncate" title={s.accountId}>{nameOf(s.accountId)} · {s.accountNo}</span>
                <span className="shrink-0 tabular text-slate-500">{s.date} · {fmt(s.bookValue, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label-xs">{cov.unvalued.length} publish no valuation at all</div>
          <p className="mt-1 text-[11px] text-slate-500">
            Sky Capital&rsquo;s angel folios, India SME&rsquo;s Fund II, 360 ONE&rsquo;s income-only folios, the redeemed and
            transaction-only demats. They carry units, drawdowns or nothing, and no statement puts a NAV on them — which is
            why they contribute nothing to the book&rsquo;s own total either.
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid="nav-unvalued-list">
            {/* A DASH, NOT `₹0`. These accounts contribute nothing to the book
                because NO STATEMENT VALUES THEM — an absent measurement, not a
                measured zero, and §2 forbids the two looking alike. The `single`
                list above keeps its ₹0 where one appears, because there the fund
                did strike a valuation and it was zero (3P Investment Managers),
                which is the computed zero the same rule preserves. */}
            {cov.unvalued.map((u) => (
              <li key={u.accountId} className="flex justify-between gap-3">
                <span className="truncate" title={u.accountId}>{nameOf(u.accountId)} · {u.accountNo}</span>
                <span className="shrink-0 tabular text-slate-500"
                  title="No statement in this drop puts a NAV on this folio, so it contributes nothing to the book's total either. That is an absent valuation, not a measured zero.">
                  {DASH}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 border-t border-ink-700 pt-2 text-[11px] text-slate-500">
        The three lists account for every account in the book. Their values sum to{" "}
        {fmt(sum(cov.covered.map((c) => c.bookValue)) + sum(cov.single.map((s) => s.bookValue)) + sum(cov.unvalued.map((u) => u.bookValue)), { compact: true })},
        which is ABOVE the consolidated NAV by the value two members both report — a per-account sum does not dedupe and a
        consolidated one does.
      </p>
    </details>
  );
}
