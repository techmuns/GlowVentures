import { useMemo, useState } from "react";
import { Receipt, Landmark, Timer, Percent } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { SearchInput } from "@/components/SearchInput";
import { BasisPill } from "@/components/BasisPill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { sumOrNull, sum } from "@/lib/analytics";
import { accountIndex, ownerOf } from "@/lib/accounts";
import { fmtPct, changeColor, fmtDate } from "@/lib/format";
import { Auditable } from "@/components/Auditable";
import { AbsentSection, AbsentCell, absentTile, DASH } from "@/components/Absent";
import { ledgerHref, auditHref, LEDGER, sumFormula } from "@/lib/auditFormulas";

// Capital Gains & Tax — honest about two holes.
//
// HOLE 1: TWO ACCOUNTS HAVE NO CAPITAL GAIN STATEMENT. Three of the five
// accounts publish one; the two Goldstandard accounts do not, in this drop.
// Those rows say so. They are neither dropped — which would let the totals read
// as the family's whole realised position — nor zeroed, which would claim those
// accounts realised nothing, a thing nobody measured.
//
// HOLE 2: NO LOT ACQUISITION DATES ANYWHERE. Every unrealised short/long-term
// figure, and the whole hold-to-LTCG planner, needs to know when each lot was
// bought. The CAPITAL REGISTER these managers issue is a capital-account ledger
// — contributions, withdrawals, TDS transfers — not a lot register, so the split
// cannot be made. The planner is disabled with its reason rather than shown as
// an empty table, and the code path is kept intact: `daysToLT` becomes non-null
// the moment a lot-level statement is ingested, and the planner revives here
// with no change.
//
// WHAT SURVIVES BOTH HOLES: loss harvesting. Unrealised P&L per position is
// real, so the underwater names and their size are real. What cannot be computed
// is the TAX effect of booking them, which turns on whether each lot is short or
// long term — so the table lists the losses and says the tax effect is
// unavailable, rather than quoting a saving it cannot support.

// Illustrative Indian equity rates: STCG u/s 111A = 20%; LTCG u/s 112A = 12.5%
// (beyond the ₹1.25L annual exemption, which we don't net per-entity here).
const STCG_RATE = 0.20;
const LTCG_RATE = 0.125;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const DAY_MS = 864e5;
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);

export function CapitalGains() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [harvestQ, setHarvestQ] = useState("");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const p = portfolio?.positions ?? [];
  const asOf = portfolio?.asOf ?? today;
  const elapsed = daysBetween(asOf, today);

  // The planner's calculation, unchanged and dormant. `daysToLT` is null on
  // every position in this book; the moment a lot-level statement supplies it,
  // this yields candidates and the card renders them instead of the notice.
  const { holdCandidates, crossed, crossedGain } = useMemo(() => {
    const all = p.filter((x) => x.daysToLT != null && x.unrealizedPnL > 0 && !x.costUnavailable)
      .map((x) => ({
        ...x,
        saving: x.unrealizedPnL * (STCG_RATE - LTCG_RATE),
        ltDate: addDays(asOf, x.daysToLT!),
        daysLeft: x.daysToLT! - elapsed,
      }));
    const done = all.filter((x) => x.daysLeft <= 0);
    return {
      holdCandidates: all.filter((x) => x.daysLeft > 0).sort((a, b) => a.daysLeft - b.daysLeft),
      crossed: done.length,
      crossedGain: sum(done.map((x) => x.unrealizedPnL)),
    };
  }, [p, asOf, elapsed]);

  const harvest = useMemo(() =>
    p.filter((x) => x.unrealizedPnL < 0 && !x.costUnavailable)
      .sort((a, b) => a.unrealizedPnL - b.unrealizedPnL), [p]);

  if (!portfolio) return null;
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const accIdx = accountIndex(portfolio.accounts);
  const cg = portfolio.capitalGains;

  // Only accounts that HAVE a statement contribute to a total. The others are
  // listed with their reason — never averaged in, never counted as zero.
  const reported = cg.filter((c) => c.realisedST !== null || c.realisedLT !== null);
  const unreported = cg.filter((c) => c.realisedST === null && c.realisedLT === null);
  const totRealST = sumOrNull(reported.map((c) => c.realisedST));
  const totRealLT = sumOrNull(reported.map((c) => c.realisedLT));
  const realisedTotal = totRealST === null && totRealLT === null
    ? null : (totRealST ?? 0) + (totRealLT ?? 0);
  const totUnrealST = sumOrNull(cg.map((c) => c.unrealisedST));
  const totUnrealLT = sumOrNull(cg.map((c) => c.unrealisedLT));
  const unrealisedTotal = totUnrealST === null && totUnrealLT === null
    ? null : (totUnrealST ?? 0) + (totUnrealLT ?? 0);
  const estTaxRealised = realisedTotal === null
    ? null : Math.max(0, totRealST ?? 0) * STCG_RATE + Math.max(0, totRealLT ?? 0) * LTCG_RATE;

  const totalSaving = sum(holdCandidates.map((x) => x.saving));
  const harvestRows = harvestQ.trim()
    ? harvest.filter((h) => h.security.toLowerCase().includes(harvestQ.trim().toLowerCase()))
    : harvest;
  const harvestTotal = sum(harvest.map((x) => x.unrealizedPnL));
  const byEnt = [...cg].sort((a, b) =>
    ((b.realisedST ?? -Infinity) + (b.realisedLT ?? 0)) - ((a.realisedST ?? -Infinity) + (a.realisedLT ?? 0)));

  return (
    <div>
      <PageHeader eyebrow="Tax &amp; Income" title="Capital Gains &amp; Tax"
        right={<BasisPill liveText="Unrealised gains live"
          hint="Unrealised P&amp;L moves with live prices; realised gains come from each account's capital gain statement, each over its own window." />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {realisedTotal === null ? (
          <StatTile label="Realised gains (period)"
            {...absentTile("no capital gain statement in this book",
              "Realised gains come from the manager's capital gain statement. No account in this book has one.")}
            icon={<Receipt className="h-4 w-4" />} />
        ) : (
          <StatTile label="Realised gains (period)"
            value={<Auditable formula={sumFormula("Realised gains (period)",
              "The short- and long-term gains booked over each account's own window, added together.",
              [{ label: "Realised ST", value: totRealST ?? 0 }, { label: "Realised LT", value: totRealLT ?? 0 }],
              realisedTotal, money)}>
              <span className={changeColor(realisedTotal)}>{fmtFromBase(realisedTotal, { compact: true, sign: true })}</span>
            </Auditable>}
            sub={<>ST {fmtFromBase(totRealST ?? 0, { compact: true, sign: true })} · LT {fmtFromBase(totRealLT ?? 0, { compact: true, sign: true })}</>}
            hint={unreported.length
              ? `From ${reported.length} of ${cg.length} accounts. The other ${unreported.length} publish no capital gain statement and are excluded, not counted as zero.`
              : `All ${cg.length} accounts.`}
            icon={<Receipt className="h-4 w-4" />} />
        )}

        <StatTile label="Embedded (unrealised) gains"
          {...(unrealisedTotal === null
            ? absentTile("needs lot acquisition dates",
              "The short/long-term split needs to know when each lot was bought. No statement in this drop carries lot dates.")
            : {
              value: fmtFromBase(unrealisedTotal, { compact: true }),
              sub: <>ST {fmtFromBase(totUnrealST ?? 0, { compact: true })} · LT {fmtFromBase(totUnrealLT ?? 0, { compact: true })}</>,
            })}
          icon={<Landmark className="h-4 w-4" />} />

        {estTaxRealised === null ? (
          <StatTile label="Est. tax on realised"
            {...absentTile("no realised gains to tax", "Needs a capital gain statement.")}
            icon={<Percent className="h-4 w-4" />} />
        ) : (
          // A COMPUTED zero, and the reason belongs in the tile rather than on
          // hover: a reader scanning "₹0" next to a −₹1.97 Cr realised loss must
          // be able to see it is the arithmetic, not a gap.
          <StatTile label="Est. tax on realised"
            value={<Auditable formula={{
              title: "Est. tax on realised",
              excel: "= max(0, Realised ST) × 20% + max(0, Realised LT) × 12.5%",
              plain: "Illustrative tax on the gains actually booked. Losses are not netted against other heads here.",
              worked: `= max(0, ${money(totRealST ?? 0)}) × 20% + max(0, ${money(totRealLT ?? 0)}) × 12.5% = ${money(estTaxRealised)}`,
              auditHref: auditHref(LEDGER),
            }}>{fmtFromBase(estTaxRealised, { compact: true })}</Auditable>}
            sub={realisedTotal !== null && realisedTotal < 0
              ? <span className="text-slate-400">net realised LOSS · nothing to tax</span>
              : "STCG 20% · LTCG 12.5% · illustrative"}
            hint={realisedTotal !== null && realisedTotal < 0
              ? "The book's realised position is a net LOSS, so there is no tax to estimate on it — the figure is zero because the arithmetic gives zero, not because anything is missing. Rates would be STCG 20% and LTCG 12.5% on a gain."
              : undefined}
            icon={<Percent className="h-4 w-4" />} />
        )}

        <StatTile label="Hold-to-LTCG saving"
          {...(holdCandidates.length
            ? {
              value: fmtFromBase(totalSaving, { compact: true }),
              sub: `${holdCandidates.length} still short-term${crossed ? ` · ${crossed} already crossed` : ""}`,
            }
            : absentTile("needs lot acquisition dates",
              "The planner defers short-term winners past their one-year mark. Without a lot date there is no mark to count to."))}
          icon={<Timer className="h-4 w-4" />} />
      </div>

      {/* ── Realised, per account ── */}
      <Card className="mt-5" title="Realised gains by account"
        subtitle="Short- and long-term as the MANAGER split them — a tax determination taken from the statement, not re-derived here"
        pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Account</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Window</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Lots</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Realised ST</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Realised LT</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Unrealised ST</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Unrealised LT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {byEnt.map((c) => (
                <tr key={c.entity} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 font-medium text-slate-100">{c.entity}</td>
                  {c.absent ? (
                    <td className="px-4 py-2.5 text-[11.5px] text-slate-500" colSpan={6}>{DASH} {c.absent}</td>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-[11px] text-slate-400">{c.periodFrom} → {c.periodTo}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">{c.lots ?? DASH}</td>
                      <td className={`px-4 py-2.5 text-right mono ${changeColor(c.realisedST ?? 0)}`}>
                        <Auditable to={c.source ? auditHref({ file: c.source }) : auditHref(LEDGER)}
                          title={`${c.entity} · realised short-term — trace to the capital gain statement`}>
                          {fmtFromBase(c.realisedST ?? 0, { compact: true, sign: true })}
                        </Auditable>
                      </td>
                      <td className={`px-4 py-2.5 text-right mono ${changeColor(c.realisedLT ?? 0)}`}>
                        <Auditable to={c.source ? auditHref({ file: c.source }) : auditHref(LEDGER)}
                          title={`${c.entity} · realised long-term — trace to the capital gain statement`}>
                          {fmtFromBase(c.realisedLT ?? 0, { compact: true, sign: true })}
                        </Auditable>
                      </td>
                      <td className="px-4 py-2.5 text-right mono"><AbsentCell reason="needs lot acquisition dates" /></td>
                      <td className="px-4 py-2.5 text-right mono"><AbsentCell reason="needs lot acquisition dates" /></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-ink-700 font-semibold">
              <tr>
                <td className="px-4 py-2.5 text-slate-200">Total</td>
                <td className="px-4 py-2.5 text-[11px] text-slate-500" colSpan={2}>
                  {reported.length} of {cg.length} accounts
                </td>
                <td className={`px-4 py-2.5 text-right mono ${changeColor(totRealST ?? 0)}`}>
                  {totRealST === null ? <AbsentCell /> : fmtFromBase(totRealST, { compact: true, sign: true })}
                </td>
                <td className={`px-4 py-2.5 text-right mono ${changeColor(totRealLT ?? 0)}`}>
                  {totRealLT === null ? <AbsentCell /> : fmtFromBase(totRealLT, { compact: true, sign: true })}
                </td>
                <td className="px-4 py-2.5 text-right mono"><AbsentCell reason="needs lot acquisition dates" /></td>
                <td className="px-4 py-2.5 text-right mono"><AbsentCell reason="needs lot acquisition dates" /></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          Each account's window is its own — Green Lantern's statements close 25 June, Carnelian's 10 July — so
          the total is a sum of what each manager booked over its own period, not a single-period figure.
        </p>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        {/* ── Hold-to-LTCG planner: dormant, with its reason ── */}
        <Card title="Hold-to-LTCG planner"
          subtitle={holdCandidates.length
            ? `Short-term winners nearing their 1-year mark. Counted to today, ${fmtDate(today)}.`
            : "Deferring a short-term winner past one year moves its gain from 20% to 12.5%"}>
          {holdCandidates.length === 0 ? (
            <AbsentSection
              what="No lot acquisition dates in this book"
              needs={`The planner works out how long each lot has left before its gain becomes long-term, which
                needs the date that lot was bought. The CAPITAL REGISTER these managers issue is a
                capital-account ledger — contributions, withdrawals, TDS transfers — not a lot register, and no
                other statement in the drop carries acquisition dates. A lot-level holding statement switches
                this on; the calculation is already wired and dormant.`} />
          ) : (
            <div className="max-h-[440px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Unreal. gain</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Turns LT</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Tax saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {holdCandidates.slice(0, 30).map((h) => (
                    <tr key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={h.securityKey} name={h.security} /></td>
                      <td className="px-4 py-2.5 text-right mono text-gain">{money(h.unrealizedPnL)}</td>
                      <td className="px-4 py-2.5 text-right text-[11px] text-slate-400">{fmtDate(h.ltDate)} · {h.daysLeft}d</td>
                      <td className="px-4 py-2.5 text-right mono text-champagne-400">{money(h.saving)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {crossed > 0 && (
                <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] text-slate-500">
                  {crossed} position{crossed === 1 ? "" : "s"} carrying {money(crossedGain)} of gain passed the
                  one-year mark since {fmtDate(asOf)}.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* ── Loss harvesting: real, minus the part that isn't ── */}
        <Card title="Tax-loss harvesting" subtitle="Positions underwater — booking a loss can offset realised gains"
          right={<SearchInput value={harvestQ} onChange={setHarvestQ} placeholder="Search security…" className="w-44"
            suggestions={harvest.map((x) => x.security)} />}>
          {harvest.length === 0 ? (
            <AbsentSection what="No position is in unrealised loss"
              needs="Every priced holding in the book is above its cost, so there is nothing to harvest." />
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-[11.5px] text-slate-400">
                  {harvest.length} position{harvest.length === 1 ? "" : "s"} underwater
                </span>
                <span className="mono text-[13px] text-loss">{money(harvestTotal, true)}</span>
              </div>
              <div className="max-h-[380px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                    <tr>
                      <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                      <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Unreal. loss</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">ST / LT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/70">
                    {harvestRows.slice(0, 30).map((h) => (
                      <tr key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
                        <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={h.securityKey} name={h.security} /></td>
                        <td className="px-4 py-2.5 text-slate-400">{ownerOf(accIdx, h)}</td>
                        <td className="px-4 py-2.5 text-right mono text-loss">
                          <Auditable to={ledgerHref(h.security)} title="Unrealised loss — trace to the ledger">
                            {money(h.unrealizedPnL, true)}
                          </Auditable>
                        </td>
                        <td className={`px-4 py-2.5 text-right mono ${changeColor(h.returnPct)}`}>
                          {fmtPct(h.returnPct, { sign: true, decimals: 1 })}
                        </td>
                        <td className="px-4 py-2.5 text-right mono">
                          <AbsentCell reason="no lot acquisition date, so the holding period is unknown" />
                        </td>
                      </tr>
                    ))}
                    {harvestRows.length === 0 && (
                      <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                        No security matches "{harvestQ}".
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 border-t border-dashed border-ink-700 px-1 pt-2.5 text-[11px] leading-relaxed text-slate-500">
                The losses and their size are real. <span className="font-medium text-slate-400">The tax effect
                is not computed</span>: whether booking one offsets at 20% or 12.5% turns on whether the lot is
                short- or long-term, and no statement in this book carries lot acquisition dates.
              </p>
            </>
          )}
        </Card>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Tax figures are <span className="font-medium text-slate-400">illustrative</span>, using current Indian
        equity rates (STCG 20% u/s 111A, LTCG 12.5% u/s 112A). They do not apply the ₹1.25L LTCG exemption, do
        not net losses across heads or years, and exclude surcharge and cess. Not tax advice. Unrealised figures
        move with live prices; realised figures are as each manager's capital gain statement reports them, each
        over its own window.
      </p>
    </div>
  );
}
