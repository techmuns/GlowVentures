import { useMemo } from "react";
import { Crosshair, Gauge, Percent, Layers } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, consolidatedMarketValue, sumOrNull } from "@/lib/analytics";
import { fmtPct } from "@/lib/format";
import { xirrWithTerminal, pooledXirr, totalReturnFromXirr } from "@/lib/bucketXirr";
import { Auditable } from "@/components/Auditable";
import { BasisPill } from "@/components/BasisPill";
import { AbsentSection, AbsentCell, absentTile, DASH } from "@/components/Absent";
import { embeddedReturnFormula } from "@/lib/auditFormulas";
import { BOOK_ACCOUNT_RETURNS, BOOK_ACCOUNT_BRIDGES } from "@/data/glowData";
import type { AccountBridge, ReturnSeries } from "@/lib/types";

// NAV & Performance — built from what these statements actually carry.
//
// WHAT THIS PAGE USED TO DO, AND WHY IT DOESN'T. It led with a NAV trajectory
// chart plus growth and CAGR read off `navHistory`. This book's corpus carries
// exactly TWO dated portfolio values per account — the opening figure on the
// performance summary and the closing one — and two points are not a curve. A
// line between them would assert a path through the period that nothing
// measured, and the CAGR off it would be a real-looking number with no
// measurement behind it. So the chart is gone, and what replaced it is the three
// things the statements DO support: each manager's own time-weighted returns,
// the value bridge from opening to closing, and a money-weighted return over the
// real dated flows.
//
// THREE PERIOD VOCABULARIES, KEPT APART. Goldstandard publishes MTD / QTD / YTD
// against N50TRI; Green Lantern and Carnelian publish trailing 1m / 3m / 1y
// against S&P BSE 500. A trailing one-month return and a month-to-date return
// are different measurements over different windows, so each account shows the
// columns its own manager publishes and a dash for the rest — never a trailing
// figure under a to-date heading.

/** The to-date and trailing columns, in the order a reader scans them. */
const PERIODS = [
  { key: "mtd" as const, label: "MTD", title: "Month to date" },
  { key: "qtd" as const, label: "QTD", title: "Quarter to date" },
  { key: "fytd" as const, label: "FYTD", title: "Indian FINANCIAL year to date — 1 April to the report date, not the calendar year" },
  { key: "m1" as const, label: "1m", title: "Trailing one month — NOT month-to-date" },
  { key: "m3" as const, label: "3m", title: "Trailing three months" },
  { key: "m6" as const, label: "6m", title: "Trailing six months" },
  { key: "y1" as const, label: "1y", title: "Trailing twelve months" },
  { key: "si" as const, label: "Since inception", title: "Since the account's own inception date" },
];

/** The bridge rows, in the order the money moves. */
const BRIDGE_ROWS = [
  { key: "opening" as const, label: "Opening value", tone: 0 },
  { key: "contribution" as const, label: "Contributions", tone: 1 },
  { key: "withdrawal" as const, label: "Withdrawals", tone: -1 },
  { key: "netCapitalInOut" as const, label: "Net capital in / out", tone: 0 },
  { key: "realized" as const, label: "Realised gain", tone: 0 },
  { key: "unrealized" as const, label: "Unrealised gain", tone: 0 },
  { key: "income" as const, label: "Income received", tone: 1 },
  { key: "fees" as const, label: "Fees & expenses", tone: -1 },
  { key: "closing" as const, label: "Closing value", tone: 0 },
];

const acctLabel = (a: { owner?: string | null; provider: string; accountNo: string }) =>
  `${a.owner ?? a.accountNo} · ${a.provider.split(" ")[0]} ${a.accountNo}`;

export function Performance() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();

  const p = portfolio?.positions ?? [];
  // Concentration numerator counts each dedupeGroup once — over the raw set,
  // Transition Fund I and the 360 ONE AIF (each reported twice) entered at 2×
  // while the denominator (`listedMV`) already deduped, overstating the top-10.
  const consolidatedWeights = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of consolidated) m.set(x.securityKey, (m.get(x.securityKey) ?? 0) + x.marketValue);
    return [...m.values()].sort((a, b) => b - a);
  }, [consolidated]);
  if (!portfolio) return null;

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const accounts = portfolio.accounts;
  // Consolidated: counts each dedupeGroup once. `priced` is deduped too, or the
  // embedded return is computed over a cost and a P&L that include the same
  // holding twice — it read +17.64% against the CIO's +17.3% on the same book.
  // The per-account figures below filter by accountId and are unaffected.
  const priced = consolidated.filter((x) => !x.costUnavailable);
  const listedMV = consolidatedMarketValue(p);
  const listedCost = sumOrNull(priced.map((x) => x.costBasis));
  const listedPnL = sumOrNull(priced.map((x) => x.unrealizedPnL));
  // Null, not 0: an embedded return needs a cost on both sides.
  const embeddedRet = listedCost !== null && listedPnL !== null && listedCost > 0
    ? (listedPnL / listedCost) * 100
    : null;
  const mvOf = (accountId: string) =>
    sum(p.filter((x) => x.accountId === accountId).map((x) => x.marketValue));

  // ── Money-weighted return, per account and consolidated ──
  //
  // From the book's own dated flows — the capital register (or the bank book
  // where a manager issues none) plus the window's opening portfolio value —
  // closed against that account's market value on its own report date. An
  // account whose flows carry no opening value cannot produce a return over the
  // window, and says which document it is missing rather than showing a zero.
  const xirrByAccount = accounts.map((a) => {
    const flows = portfolio.accountCashFlows?.[a.accountId] ?? [];
    const hasOpening = flows.some((f) => /^opening portfolio value/i.test(f.description ?? ""));
    const mv = mvOf(a.accountId);
    return {
      account: a,
      mv,
      flows: flows.length,
      pct: hasOpening && flows.length
        ? xirrWithTerminal(flows.map((f) => ({ date: new Date(f.date), amount: f.amount })), mv, new Date(a.asOf))
        : null,
      reason: !flows.length ? "no dated capital movements in this account's statements"
        : !hasOpening ? "no performance summary for the window, so no opening value to measure against"
        : null,
    };
  });
  // THE CONSOLIDATED FIGURE COVERS ONLY THE ACCOUNTS THAT CAN BE MEASURED.
  //
  // Account 510854 publishes no FY performance summary, so its flows carry no
  // opening portfolio value. Pooling everything anyway put its ₹5.92 Cr of
  // market value into the terminal flow with no opening stake behind it — the
  // solver saw ₹5.92 Cr appear out of a handful of small movements and returned
  // 174.3% p.a. against 109.7% for the four accounts that CAN be measured. A
  // 64.6 pp overstatement, and precisely the failure §0 names: a missing value
  // blended in as zero.
  //
  // So the consolidated row is over the measurable accounts, its market value is
  // theirs alone, and the excluded account is named on screen.
  const measurable = xirrByAccount.filter((x) => x.pct !== null);
  const unmeasurable = xirrByAccount.filter((x) => x.pct === null);
  const measuredFlows = measurable.flatMap((x) => (portfolio.accountCashFlows?.[x.account.accountId] ?? [])
    .map((f) => ({ date: new Date(f.date), amount: f.amount })));
  const measuredMV = sum(measurable.map((x) => x.mv));
  /**
   * EACH ACCOUNT CLOSES ON ITS OWN REPORT DATE.
   *
   * This pooled every account's flows and closed the lot on `portfolio.asOf`,
   * the NEWEST date in the book. Green Lantern values at 25 June and the others
   * at 10 July, so that gave its ₹11.69 Cr fifteen days of standing still — and
   * over a one-quarter window the annualised pool rate came out points below the
   * same accounts measured one at a time. Two pages, two numbers, one book.
   *
   * `pooledXirr` dates each account's terminal inflow at the moment its value
   * was measured, which is what a money-weighted return means.
   */
  const consolidatedXirr = pooledXirr(measurable.map((x) => ({
    flows: (portfolio.accountCashFlows?.[x.account.accountId] ?? [])
      .map((f) => ({ date: new Date(f.date), amount: f.amount })),
    terminalValue: x.mv,
    asOf: new Date(x.account.asOf),
  })));
  const xirrMissing = unmeasurable.map((x) => x.account.accountNo);
  /**
   * THE WINDOW THE LABEL NAMES MUST BE THE WINDOW THE RATE MEASURED.
   *
   * This closed the stated window on `portfolio.asOf` — one date — while
   * `pooledXirr` directly above closes each account on ITS OWN as-of. The rate
   * was right and its caption was not: it read "2026-04-01 → 2026-07-10
   * (100 days)" for a pool in which Green Lantern actually closes on 25 June,
   * fifteen days earlier. A reader checking the annualisation against the window
   * on screen would not reproduce the number, which is the same defect as the
   * one the comment above describes — just moved from the arithmetic into the
   * sentence beside it.
   *
   * So the caption states a RANGE whenever the pool's report dates differ, and a
   * single date when they agree.
   */
  const windowStart = measuredFlows.reduce<string | null>((a, f) => {
    const iso = f.date.toISOString().slice(0, 10);
    return !a || iso < a ? iso : a;
  }, null);
  const closeDates = [...new Set(measurable.map((x) => x.account.asOf))].sort();
  const firstClose = closeDates[0] ?? portfolio.asOf;
  const lastClose = closeDates[closeDates.length - 1] ?? portfolio.asOf;
  const daysTo = (d: string) => (windowStart ? Math.round((Date.parse(d) - Date.parse(windowStart)) / 864e5) : null);
  const windowNote = !windowStart
    ? "to date"
    : firstClose === lastClose
      ? `over ${windowStart} → ${lastClose} (${daysTo(lastClose)} days)`
      : `over ${windowStart} → ${firstClose}–${lastClose} (${daysTo(firstClose)}–${daysTo(lastClose)} days) — each account closes on its own report date`;
  // The headline is the money-weighted return actually EARNED to date, not the
  // XIRR annualised — an annualised quarter reads >100% p.a. and misleads on a
  // cockpit. De-annualised over the window the pool closes on; the p.a. rate is
  // kept in the hint. Matches the Morning CIO, so the two pages state one number.
  const consWindowDays = daysTo(lastClose);
  const consolidatedTotalReturn = totalReturnFromXirr(consolidatedXirr, consWindowDays);

  // ── Time-weighted returns, per account, from each manager's own report ──
  const twrr = accounts.map((a) => {
    const blocks = BOOK_ACCOUNT_RETURNS[a.accountId] ?? [];
    // The fact sheet is what the manager publishes to the client; the
    // performance appraisal restates it on a trailing vocabulary. Prefer the
    // fact sheet, and name whichever report the figures came from.
    const block = blocks.find((b) => b.reportType === "fact-sheet") ?? blocks[0] ?? null;
    const series = (block?.series ?? []) as ReturnSeries[];
    return {
      account: a,
      block,
      portfolio: series.find((s) => !s.isBenchmark) ?? null,
      benchmark: series.find((s) => s.isBenchmark) ?? null,
    };
  });
  // A column is worth a heading only if some account publishes it.
  const livePeriods = PERIODS.filter((per) =>
    twrr.some((t) => t.portfolio && t.portfolio[per.key] !== null));

  const top10Val = sum(consolidatedWeights.slice(0, 10));
  const top10 = listedMV > 0 ? (top10Val / listedMV) * 100 : 0;
  const bridgeOf = (accountId: string): AccountBridge[] => BOOK_ACCOUNT_BRIDGES[accountId] ?? [];

  return (
    <div>
      <PageHeader eyebrow="Analytics" title="NAV &amp; Performance"
        subtitle="Time-weighted returns as each manager publishes them, the value bridge from opening to closing, and a money-weighted return over the real dated flows."
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Current value of holdings and embedded return are rebuilt from live prices where a quote exists; the managers' returns and the bridge are as reported." />
          <Pill tone="info">{accounts.length} accounts</Pill>
        </div>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Current Value of Holdings"
          value={money(listedMV)}
          sub={p.length === consolidated.length
            ? `${p.length} positions across ${accounts.length} accounts`
            : `${consolidated.length} of ${p.length} rows across ${accounts.length} accounts — ${p.length - consolidated.length} reported under two members and counted once`}
          icon={<Layers className="h-4 w-4" />} />

        <StatTile label="Embedded return"
          value={<Auditable formula={embeddedReturnFormula(listedPnL, listedCost, embeddedRet, money)}>{fmtPct(embeddedRet, { sign: true })}</Auditable>}
          sub={<>{money(listedPnL, true)} unrealised on cost</>} delta={embeddedRet} icon={<Gauge className="h-4 w-4" />} />

        {consolidatedXirr == null ? (
          <StatTile label="Money-weighted return (XIRR)"
            {...absentTile("no dated capital movements to measure against",
              "XIRR needs dated external flows. No statement in this book carries them.")}
            icon={<Percent className="h-4 w-4" />} />
        ) : (
          <StatTile label="Money-weighted return (to date)"
            value={<span className={(consolidatedTotalReturn ?? 0) >= 0 ? "text-gain" : "text-loss"}>{fmtPct(consolidatedTotalReturn, { sign: true, decimals: 1 })}</span>}
            sub={<>to date · {windowNote}</>}
            hint={`${xirrMissing.length
              ? `Over the ${measurable.length} of ${accounts.length} accounts whose statements carry an opening portfolio value, closed against THEIR market value (${money(measuredMV)}) at ${portfolio.asOf}. ${xirrMissing.length === 1 ? "Account" : "Accounts"} ${xirrMissing.join(", ")} ${xirrMissing.length === 1 ? "is" : "are"} excluded on both sides — counting ${xirrMissing.length === 1 ? "its value without its" : "their value without their"} opening stake would overstate this figure.`
              : `Over all ${accounts.length} accounts' dated flows, closed against the current market value at ${portfolio.asOf}.`} This is the money-weighted return actually earned over the window${consWindowDays ? ` (${consWindowDays} days)` : ""}; the annualised XIRR${consolidatedXirr != null ? ` is ${fmtPct(consolidatedXirr, { sign: true, decimals: 1 })} p.a.` : ""}, kept off the tile because a >100% annualised quarter reads as a sustained yearly rate.`}
            icon={<Percent className="h-4 w-4" />} />
        )}

        <StatTile label="Top-10 concentration"
          value={<Auditable formula={{ title: "Top-10 concentration", excel: "= Top 10 holdings' value ÷ Total market value × 100", plain: "How much of the consolidated book sits in just its ten biggest holdings.", worked: `= ${money(top10Val)} ÷ ${money(listedMV)} × 100 = ${top10.toFixed(0)}%`,  }}>{`${top10.toFixed(0)}%`}</Auditable>}
          sub="of the current value of holdings in the 10 biggest holdings" icon={<Crosshair className="h-4 w-4" />} />
      </div>

      {/* ── NAV trajectory: absent, and why ── */}
      <Card className="mt-5" title="NAV trajectory" subtitle="A dated series of portfolio values">
        <AbsentSection
          what="No valuation series in this book"
          needs={`Each account's statements carry exactly two dated portfolio values — the opening figure on the
            performance summary and the closing one. Two points are not a trajectory: a line between them would
            assert a path through the period that nothing measured, and any growth or CAGR read off it would be a
            real-looking number with nothing behind it. A periodic — monthly or quarterly — valuation statement
            per account is what this needs.`} />
      </Card>

      {/* ── TWRR grid ── */}
      <Card className="mt-5" title="Time-weighted return"
        subtitle="As each manager publishes it — portfolio against that manager's own benchmark"
        right={<Pill tone="info">{twrr.filter((t) => t.portfolio).length} of {accounts.length} accounts</Pill>}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="label-xs border-b border-ink-700">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Series</th>
                {livePeriods.map((per) => (
                  <th key={per.key} className="px-3 py-2 text-right" title={per.title}>{per.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {twrr.flatMap((t) => {
                if (!t.portfolio || !t.block) {
                  return [(
                    <tr key={t.account.accountId} className="border-t border-ink-700/60">
                      <td className="px-3 py-2.5 font-medium text-slate-100">{acctLabel(t.account)}</td>
                      <td className="px-3 py-2.5 text-slate-500" colSpan={livePeriods.length + 1}>
                        {DASH} no time-weighted return series in this account's statements
                      </td>
                    </tr>
                  )];
                }
                const rows = [t.portfolio, t.benchmark].filter(Boolean) as ReturnSeries[];
                return rows.map((s, i) => (
                  <tr key={`${t.account.accountId}-${s.series}`} className={i === 0 ? "border-t border-ink-700/60" : ""}>
                    <td className="px-3 py-2.5 font-medium text-slate-100">{i === 0 ? acctLabel(t.account) : ""}</td>
                    <td className={`px-3 py-2.5 ${s.isBenchmark ? "text-slate-400" : "text-slate-200"}`}>
                      {s.series}{s.isBenchmark ? " (benchmark)" : ""}
                    </td>
                    {livePeriods.map((per) => {
                      const v = s[per.key];
                      return (
                        <td key={per.key} className="px-3 py-2.5 text-right mono">
                          {v === null
                            ? <AbsentCell reason={`${t.account.provider.split(" ")[0]} does not publish a ${per.label} figure`} />
                            : <span className={v >= 0 ? "text-gain" : "text-loss"}>
                                {fmtPct(v, { sign: true, decimals: 2 })}
                              </span>}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
              <tr className="border-t-2 border-ink-600">
                <td className="px-3 py-2.5 font-semibold text-slate-200">Consolidated</td>
                <td className="px-3 py-2.5 text-slate-500" colSpan={livePeriods.length + 1}>
                  {DASH} time-weighted returns cannot be consolidated across these accounts: the three managers
                  publish different periods, against different benchmarks, from different inception dates. The
                  money-weighted return above is the consolidated figure this book does support.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Value bridge ── */}
      <Card className="mt-5" title="Value bridge"
        subtitle="Opening value to closing value, per account — every component read from the statements">
        <div className="space-y-6">
          {accounts.map((a) => {
            const bridges = bridgeOf(a.accountId);
            return (
              <div key={a.accountId}>
                <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-[12.5px] font-semibold text-slate-200">{acctLabel(a)}</span>
                  <span className="text-[10.5px] text-slate-500">inception {a.inceptionDate ?? DASH}</span>
                </div>
                {!bridges.length ? (
                  <p className="text-[11.5px] text-slate-500">{DASH} no flow block in this account's statements</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead className="label-xs border-b border-ink-700">
                        <tr>
                          <th className="px-3 py-1.5 text-left">Component</th>
                          {bridges.map((b) => (
                            <th key={b.source} className="px-3 py-1.5 text-right">
                              {b.basis === "since-inception" ? "Since inception" : "FY to date"}
                              <div className="font-normal normal-case tracking-normal text-slate-600">{b.periodFrom} → {b.periodTo}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {BRIDGE_ROWS.map((row) => (
                          <tr key={row.key} className="border-t border-ink-700/60">
                            <td className="px-3 py-1.5 text-slate-300">{row.label}</td>
                            {bridges.map((b) => {
                              const v = b[row.key];
                              return (
                                <td key={b.source} className="px-3 py-1.5 text-right mono">
                                  {v === null
                                    ? <AbsentCell reason={`the ${b.reportType} does not print this component`} />
                                    : <span className={row.tone === -1 ? "text-loss" : row.tone === 1 ? "text-gain" : "text-slate-200"}>
                                          {money(v)}
                                        </span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Money-weighted return, per account ── */}
      <Card className="mt-5" title="Money-weighted return to date, per account"
        subtitle="From each account's own dated capital movements, closed against its current market value — the return earned to date, not annualised">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="label-xs border-b border-ink-700">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Dated flows</th>
                <th className="px-3 py-2 text-right">Market value</th>
                <th className="px-3 py-2 text-right">Terminal date</th>
                <th className="px-3 py-2 text-right" title="Money-weighted return earned to date — the annualised XIRR de-annualised to the account's window.">Return (to date)</th>
              </tr>
            </thead>
            <tbody>
              {xirrByAccount.map((x) => (
                <tr key={x.account.accountId} className="border-t border-ink-700/60">
                  <td className="px-3 py-2.5 font-medium text-slate-100">{acctLabel(x.account)}</td>
                  <td className="px-3 py-2.5 text-right mono text-slate-400">{x.flows}</td>
                  <td className="px-3 py-2.5 text-right mono text-slate-200">
                    {/* `₹0` on an account nobody valued is a claim, not a
                        measurement — see Account.noPositionsReason. */}
                    {x.account.noPositionsReason
                      ? <AbsentCell reason={x.account.noPositionsReason} />
                      : money(x.mv)}
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-slate-400">{x.account.asOf}</td>
                  <td className="px-3 py-2.5 text-right mono">
                    {x.pct == null
                      ? <span className="text-[11px] text-slate-500">{DASH} {x.reason}</span>
                      : (() => { const tr = totalReturnFromXirr(x.pct, daysTo(x.account.asOf)); return <span className={(tr ?? 0) >= 0 ? "text-gain" : "text-loss"} title={`${fmtPct(x.pct, { sign: true, decimals: 1 })} p.a. annualised`}>{fmtPct(tr, { sign: true, decimals: 1 })}</span>; })()}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink-600 font-semibold">
                <td className="px-3 py-2.5 text-slate-200">
                  Consolidated
                  {unmeasurable.length > 0 && (
                    <div className="text-[10.5px] font-normal text-slate-500">
                      {measurable.length} of {accounts.length} accounts · {money(measuredMV)} of {money(listedMV)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right mono text-slate-400">{measuredFlows.length}</td>
                <td className="px-3 py-2.5 text-right mono text-slate-200">{money(measuredMV)}</td>
                <td className="px-3 py-2.5 text-right mono text-slate-400">{portfolio.asOf}</td>
                <td className="px-3 py-2.5 text-right mono">
                  {consolidatedTotalReturn == null
                    ? <span className="text-slate-500">{DASH}</span>
                    : <span className={consolidatedTotalReturn >= 0 ? "text-gain" : "text-loss"} title={consolidatedXirr != null ? `${fmtPct(consolidatedXirr, { sign: true, decimals: 1 })} p.a. annualised` : undefined}>{fmtPct(consolidatedTotalReturn, { sign: true, decimals: 1 })}</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
