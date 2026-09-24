import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePortfolio } from "@/context/PortfolioContext";
import { Card } from "./Card";
import { AbsentCell } from "./Absent";
import { currentHoldings, dedupedPositions } from "@/lib/analytics";
import { positionActionKey } from "@/lib/corporateActions";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { useTableView, sortRows } from "@/lib/tableView";
import { SortHeader, Tr } from "./SortHeader";

const COLS = ["holding", "window", "total", "dividends", "shares", "capital", "evidence"] as const;
const LABELS: Record<string, string> = { holding: "Holding / account", window: "Window", shares: "Shares: statement → adjusted", capital: "Capital return", dividends: "Gross dividend entitlement", total: "Total return incl. dividends", evidence: "Evidence & coverage" };
/**
 * WHAT EACH COLUMN MEANS, ON ITS HEADING (Stage 10cp). *"We have such random
 * one-liners, two-liners, and footnotes everywhere across the product … no one
 * is genuinely reading them."* The card carried two sentences above the table,
 * a "How this return is calculated" fold and a line under it; each fact is the
 * hover on the column it qualifies now — the window's basis on Window, the
 * entitlement caveat on the dividend column (whose every cell also says "receipt
 * unconfirmed"), the formula and why there is no total on Total return.
 */
const TITLES: Record<string, string> = {
  window: "Since each statement date, not since purchase — from the statement that carries the holding to the date the return is struck. It assumes no later trades or transfers.",
  shares: "Splits and equity bonuses adjust the projected shares and the average cost; they do not create profit.",
  dividends: "Dividends are entitlements, not confirmed cash receipts — gross, without reinvestment or tax, and never added to account cash, NAV or account XIRR. Missing evidence shows —. Confirmed receipts must be reconciled to the payment statement.",
  total: "Total return = (adjusted holding value + gross dividends declared during the window − opening statement value) ÷ opening statement value. Since each statement date, not since purchase; a lifetime return needs the full holding and payment history. Fund distributions stay in their fund-specific return model. There is no portfolio total, as accounts open on different dates.",
};

const LOADING = "Corporate-action evidence is loading";
/**
 * THE CAUSE TO NAME FIRST. A security no NSE symbol resolves for can never be
 * priced live, so that is the reason — not the feed-coverage or reconciliation
 * sentences that follow from it, which read as a gap somebody could close.
 */
function leadIssue(issues: readonly string[]): string | null {
  return issues.find((x) => /^No NSE symbol resolves/.test(x)) ?? issues[0] ?? null;
}

export function CorporateActionReturns({ securityKey }: { securityKey?: string }) {
  const { statementPortfolio, corporateActions, corporateActionsStatus, corporateActionReturns, fmtFromBase } = usePortfolio();
  const [search, setSearch] = useState("");
  const view = useTableView("corporate-actions-returns", COLS);
  const rows = useMemo(() => {
    // CURRENT HOLDINGS, like every allocation surface: a closed position and a
    // speck under the ₹1,000 floor are not rows (the page drew Everest Fleet and
    // EFPL, both under ₹1,000, as two of its 300). `currentHoldings` is the one
    // definition, applied to the consolidated set as the Monitor applies it.
    const positions = currentHoldings(dedupedPositions(statementPortfolio?.positions ?? []))
      .filter((p) => p.assetClass === "Equity" && (!securityKey || p.securityKey === securityKey));
    const accounts = new Map(statementPortfolio?.accounts.map((a) => [a.accountId, a]));
    const items = positions.map((p) => ({ p, account: accounts.get(p.accountId), result: corporateActionReturns.get(positionActionKey(p)) }))
      .filter(({ p, account }) => !search || `${p.security} ${account?.owner} ${account?.provider} ${account?.accountNo}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.p.security.localeCompare(b.p.security));
    return sortRows(items, view.sort, {
      holding: (r) => r.p.security, window: (r) => r.result?.statementDate ?? null,
      shares: (r) => r.result?.adjustedQuantity ?? r.p.quantity,
      capital: (r) => r.result?.priceReturnPct ?? null,
      dividends: (r) => r.result?.dividendEntitlement ?? null,
      total: (r) => r.result?.totalReturnPct ?? null,
      evidence: (r) => r.result ? [...r.result.quantityIssues, ...r.result.incomeIssues].join(". ") : null,
    });
  }, [statementPortfolio, corporateActionReturns, securityKey, search, view.sort]);
  if (securityKey && !rows.length) return null;
  const covered = rows.filter((r) => r.result?.totalReturnPct != null).length;
  const adjusted = rows.filter((r) => r.result && r.result.factor !== 1).length;
  // THE COVERAGE LINE IS ITS FIGURES; WHEN THE CAPTURE WAS TAKEN AND HOW FAR
  // BACK IT READS ARE ITS HOVER (Stage 10cp). A saved capture still SAYS so on
  // the face — a figure drawn from yesterday's copy must not read as current.
  const captured = corporateActions
    ? `Corporate actions captured ${new Date(corporateActions.capturedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST, event history from ${fmtDate(corporateActions.requestedFrom)}${corporateActionsStatus !== "current" ? " — a saved capture, the refresh is unavailable or pending" : ""}.`
    : undefined;
  return <Card className="mt-5" title="Corporate actions & total return" pad={false}
    subtitle="Since each statement date, not since purchase. Includes gross declared dividends and split/bonus adjustments, assuming no later trades or transfers.">
    <div className="space-y-2 border-b border-ink-700 p-4 text-xs text-slate-400">
      <p data-action-coverage title={captured}>{covered} of {rows.length} windows calculable · {adjusted} adjusted
        {corporateActions
          ? corporateActionsStatus !== "current" ? " · saved capture" : ""
          : corporateActionsStatus === "loading" ? " · loading the capture…" : " · corporate-action feed unavailable"}</p>
      {!securityKey && <div className="flex flex-wrap gap-3 pt-2">
        <input aria-label="Search corporate action holdings" placeholder="Find a company, owner or account" value={search} onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-900 px-3 py-2 text-slate-100" />

      </div>}
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-corporate-return-table>
        <thead className="bg-ink-900 text-slate-400"><Tr view={view}>
          {view.columns.map((col) => <SortHeader key={col} view={view} col={col} align="left" title={TITLES[col]}>{LABELS[col]}</SortHeader>)}
        </Tr></thead>
        <tbody>{rows.map(({ p, account, result: r }) => {
          const issues = r ? [...r.quantityIssues, ...r.incomeIssues] : [LOADING];
          const lead = leadIssue(issues) ?? LOADING;
          const events = r?.lines.filter((l) => l.status !== "in-statement") ?? [];
          const cells = {
            holding: <td key="holding" className="min-w-[170px] px-4 py-3"><Link className="text-champagne-400 hover:underline" to={`/stock/${p.securityKey}`}>{p.security}</Link>
              <div className="mt-1 text-[11px] text-slate-500">{account?.owner} · {account?.provider} · {account?.accountNo}</div></td>,
            window: <td key="window" className="whitespace-nowrap px-4 py-3 text-slate-400" data-action-window={r ? `${r.statementDate}|${r.through}` : ""}>{r ? <>{fmtDate(r.statementDate)}<br />→ {fmtDate(r.through)}</> : <AbsentCell reason={LOADING} />}</td>,
            shares: <td key="shares" className="whitespace-nowrap px-4 py-3 mono">{fmtNum(p.quantity)} → {fmtNum(r?.adjustedQuantity ?? p.quantity)}
              {r && r.factor !== 1 && <div className="mt-1 text-[11px] text-champagne-400">×{r.factor.toFixed(4)} · cost unchanged</div>}</td>,
            capital: <td key="capital" className="whitespace-nowrap px-4 py-3 mono" data-capital-return>
              {r?.priceReturnPct == null
                ? <AbsentCell reason={`No period return — ${lead}`} />
                : fmtPct(r.priceReturnPct, { sign: true, decimals: 2 })}</td>,
            // A COMPUTED ZERO CARRIES ITS REASON IN THE CELL: the window is priced
            // and no dividend was declared in it. An entitlement the evidence
            // cannot establish is an absence, and says which evidence.
            dividends: <td key="dividends" className="px-4 py-3 mono" data-dividend-entitlement>
              {r?.dividendEntitlement == null
                ? <AbsentCell reason={r ? `Not established — ${leadIssue(r.incomeIssues) ?? lead}` : LOADING} />
                : <>{fmtFromBase(r.dividendEntitlement, { compact: true })}
                    <div className="mt-1 text-[10px] font-sans text-slate-500">
                      {r.dividendEntitlement === 0 ? "none declared in this window" : "Gross · receipt unconfirmed"}</div></>}
            </td>,
            total: <td key="total" className="whitespace-nowrap px-4 py-3 mono font-semibold" data-dividend-total-return>
              {r?.totalReturnPct == null
                ? <AbsentCell reason={r?.priceReturnPct != null
                    ? `No total — the dividends in the window are not established: ${leadIssue(r.incomeIssues) ?? lead}`
                    : `No period return — ${lead}`} />
                : fmtPct(r.totalReturnPct, { sign: true, decimals: 2 })}</td>,
            evidence: <td key="evidence" className="min-w-[230px] max-w-md px-4 py-3 text-slate-400" data-action-lead={issues.length ? lead : ""}>
              {/* The FIRST open question on screen and every one in the hover —
                  joined, three of them ran to 232 characters in one cell, the
                  wall of text the family asked to be rid of (Stage 10ci). */}
              {issues.length > 0
                ? (() => {
                    const open = [...new Set(issues)];
                    const first = open.indexOf(lead);
                    if (first > 0) open.unshift(...open.splice(first, 1));
                    return <p className="text-amber-400/90" title={`${open.join(". ")}.`}>
                      {open[0]}{open.length > 1 ? ` · +${open.length - 1} more` : ""}.</p>;
                  })()
                : <span>Calculated on carried statement holdings.</span>}
              {events.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-champagne-400">{events.length} events · show sources</summary>
                <ul className="mt-2 space-y-3">{events.map((l) => <li key={l.action.id}>
                  <div>{l.action.exDate ? fmtDate(l.action.exDate) : "Undated"} · {l.action.purpose}</div>
                  <div className="text-[11px]">{l.status === "declared" ? `Gross entitlement ${fmtFromBase(l.amount)} · payment not verified`
                    : l.status === "adjusted" ? "Applied to the projected holding"
                    : l.status === "upcoming" ? "After this valuation date — not included" : l.reason || "Needs review"}</div>
                  {l.action.sourceUrl && <a href={l.action.sourceUrl} target="_blank" rel="noreferrer" className="text-champagne-400 hover:underline">{l.action.source}</a>}
                </li>)}</ul>
              </details>}
              {securityKey && r && r.lines.some((l) => l.status === "in-statement") &&
                <details className="mt-2"><summary className="cursor-pointer">Earlier events · not reapplied</summary>
                  <ul className="mt-2 space-y-1">{r.lines.filter((l) => l.status === "in-statement").map((l) =>
                    <li key={l.action.id}>{fmtDate(l.action.exDate!)} · {l.action.purpose} · at or before this statement</li>)}</ul>
                </details>}
            </td>,
          };
          return <Tr key={positionActionKey(p)} view={view} className="border-t border-ink-700/70 align-top" data-corporate-return-row={positionActionKey(p)}>{COLS.map((col) => cells[col])}</Tr>;
        })}</tbody>
      </table>
      {!rows.length && <div className="p-5"><AbsentCell reason="No listed-equity holdings match this selection" /></div>}
    </div>
    {/* THE LINE UNDER THE TABLE IS GONE (Stage 10cp): the formula and why
        there is no portfolio total are the Total return heading's hover, where
        a reader looking for the total asks. */}
  </Card>;
}
