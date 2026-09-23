import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePortfolio } from "@/context/PortfolioContext";
import { Card } from "./Card";
import { AbsentCell } from "./Absent";
import { dedupedPositions } from "@/lib/analytics";
import { positionActionKey } from "@/lib/corporateActions";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { useTableView, sortRows } from "@/lib/tableView";
import { SortHeader, Tr } from "./SortHeader";

const COLS = ["holding", "window", "total", "dividends", "shares", "capital", "evidence"] as const;
const LABELS: Record<string, string> = { holding: "Holding / account", window: "Window", shares: "Shares: statement → adjusted", capital: "Capital return", dividends: "Gross dividend entitlement", total: "Total return incl. dividends", evidence: "Evidence & coverage" };

export function CorporateActionReturns({ securityKey }: { securityKey?: string }) {
  const { statementPortfolio, corporateActions, corporateActionsStatus, corporateActionReturns, fmtFromBase } = usePortfolio();
  const [search, setSearch] = useState("");
  const view = useTableView("corporate-actions-returns", COLS);
  const rows = useMemo(() => {
    const positions = dedupedPositions(statementPortfolio?.positions ?? [])
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
  return <Card className="mt-5" title="Corporate actions & total return" pad={false}>
    <div className="space-y-2 border-b border-ink-700 p-4 text-xs text-slate-400">
      <p><strong className="text-slate-200">Since each statement date, not since purchase.</strong> Includes gross declared dividends and split/bonus adjustments, assuming no later trades or transfers.</p>
      <p>Dividends are <strong className="text-slate-200">entitlements, not confirmed cash receipts</strong>. Missing evidence shows —.</p>
      <details><summary className="cursor-pointer text-champagne-400">How this return is calculated</summary>
        <p className="mt-2">Splits and equity bonuses adjust projected shares and average investment cost; they do not create profit. Dividends are included once, without reinvestment or tax deductions, and are not added to account cash, NAV or account XIRR.
          Lifetime dividend-inclusive returns require the full holding and payment history. Confirmed receipts must be reconciled to the payment statement.</p>
      </details>
      <p data-action-coverage>{covered} of {rows.length} position windows calculable · {adjusted} share quantities adjusted ·{" "}
        {corporateActions
          ? <>Research captured {new Date(corporateActions.capturedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
            {corporateActionsStatus !== "current" ? " · saved capture; refresh unavailable or pending" : ""} · event history from {fmtDate(corporateActions.requestedFrom)}</>
          : corporateActionsStatus === "loading" ? "Loading corporate-action capture…" : "Corporate-action feed unavailable"}</p>
      {!securityKey && <div className="flex flex-wrap gap-3 pt-2">
        <input aria-label="Search corporate action holdings" placeholder="Find a company, owner or account" value={search} onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-900 px-3 py-2 text-slate-100" />

      </div>}
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-corporate-return-table>
        <thead className="bg-ink-900 text-slate-400"><Tr view={view}>
          {view.columns.map((col) => <SortHeader key={col} view={view} col={col} align="left">{LABELS[col]}</SortHeader>)}
        </Tr></thead>
        <tbody>{rows.map(({ p, account, result: r }) => {
          const issues = r ? [...r.quantityIssues, ...r.incomeIssues] : ["Corporate-action evidence is loading"];
          const events = r?.lines.filter((l) => l.status !== "in-statement") ?? [];
          const cells = {
            holding: <td key="holding" className="min-w-[170px] px-4 py-3"><Link className="text-champagne-400 hover:underline" to={`/stock/${p.securityKey}`}>{p.security}</Link>
              <div className="mt-1 text-[11px] text-slate-500">{account?.owner} · {account?.provider} · {account?.accountNo}</div></td>,
            window: <td key="window" className="whitespace-nowrap px-4 py-3 text-slate-400">{r ? <>{fmtDate(r.statementDate)}<br />→ {fmtDate(r.through)}</> : "—"}</td>,
            shares: <td key="shares" className="whitespace-nowrap px-4 py-3 mono">{fmtNum(p.quantity)} → {fmtNum(r?.adjustedQuantity ?? p.quantity)}
              {r && r.factor !== 1 && <div className="mt-1 text-[11px] text-champagne-400">×{r.factor.toFixed(4)} · cost unchanged</div>}</td>,
            capital: <td key="capital" className="whitespace-nowrap px-4 py-3 mono">{fmtPct(r?.priceReturnPct, { sign: true, decimals: 2 })}</td>,
            dividends: <td key="dividends" className="px-4 py-3 mono" data-dividend-entitlement>{r?.dividendEntitlement == null ? "—" : fmtFromBase(r.dividendEntitlement, { compact: true })}
              <div className="mt-1 text-[10px] font-sans text-slate-500">Gross · receipt unconfirmed</div></td>,
            total: <td key="total" className="whitespace-nowrap px-4 py-3 mono font-semibold" data-dividend-total-return>{fmtPct(r?.totalReturnPct, { sign: true, decimals: 2 })}</td>,
            evidence: <td key="evidence" className="min-w-[230px] max-w-md px-4 py-3 text-slate-400">
              {/* The FIRST open question on screen and every one in the hover —
                  joined, three of them ran to 232 characters in one cell, the
                  wall of text the family asked to be rid of (Stage 10ci). */}
              {issues.length > 0
                ? (() => {
                    const open = [...new Set(issues)];
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
    {/* ONE LINE, the formula in its hover — it was a 268-character note under
        the table, and the family asked for the notes around the tables to go
        (Stage 10cg). Why there is no total stays on screen: an absent total a
        reader is not told about reads as one that was forgotten. */}
    <p className="border-t border-ink-700 px-4 py-3 text-[11px] text-slate-500"
      title="Total return = (adjusted holding value + gross dividends declared during the window − opening statement value) ÷ opening statement value. Fund distributions remain in their fund-specific return model.">
      Total return adds the dividends declared in the window · no portfolio total, as accounts open on different dates</p>
  </Card>;
}
