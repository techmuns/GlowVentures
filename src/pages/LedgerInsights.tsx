import { useEffect, useState } from "react";
import { TrendingUp, Coins, ShieldAlert, Layers, ArrowLeftRight, Scissors, LogOut } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtPct, fmtNum, changeColor, fmtDate } from "@/lib/format";
import { Auditable } from "@/components/Auditable";
import { StockLink } from "@/components/StockLink";
import { ledgerHref, auditHref, LEDGER } from "@/lib/auditFormulas";
import {
  loadReturns, loadDividends, loadSales, LEDGER_AS_OF,
  type ReturnsData, type DivData, type SalesData, type Grouped,
} from "@/lib/ledger";

type Tab = "returns" | "sales" | "dividends";
const TABS: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
  { key: "returns", label: "Annualized Returns", icon: TrendingUp },
  { key: "sales", label: "Sales & Exits", icon: ArrowLeftRight },
  { key: "dividends", label: "Dividends", icon: Coins },
];

export function LedgerInsights() {
  const [status, setStatus] = useState<"loading" | "ready" | "restricted">("loading");
  const [tab, setTab] = useState<Tab>("returns");
  const [returns, setReturns] = useState<ReturnsData | null>(null);
  const [div, setDiv] = useState<DivData | null>(null);
  const [sales, setSales] = useState<SalesData | null>(null);

  useEffect(() => {
    let alive = true;
    loadReturns().then((r) => {
      if (!alive) return;
      if (!r) { setStatus("restricted"); return; }
      setReturns(r); setStatus("ready");
      loadDividends().then((x) => alive && setDiv(x));
      loadSales().then((x) => alive && setSales(x));
    });
    return () => { alive = false; };
  }, []);

  if (status === "restricted") {
    return (
      <div className="flex h-full flex-col">
        <PageHeader eyebrow="Analytics" title="Ledger Insights"
          subtitle="Annualized returns, reconciliation and dividends from the real multi-year ledgers." />
        <div className="grid flex-1 place-items-center py-16 text-center">
          <div className="max-w-lg">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-slate-100">Couldn't load the ledgers</h2>
            <p className="mt-2 text-sm text-slate-400">
              These views are computed from the real transaction ledgers. They couldn't be loaded —
              refresh to try again; if it persists, your session may have expired, so sign in again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Analytics" title="Ledger Insights"
        subtitle="Computed from the real multi-year transaction ledgers — not the demo book."
        right={<Pill tone="info">as of {fmtDate(LEDGER_AS_OF)}</Pill>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
              tab === key ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400"
              : "border-ink-700 bg-ink-800 text-slate-300 hover:bg-ink-700/60"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {status === "loading" && <div className="grid h-40 place-items-center text-sm text-slate-500">Loading ledgers…</div>}
        {tab === "returns" && returns && <ReturnsView data={returns} />}
        {tab === "sales" && <SalesView data={sales} />}
        {tab === "dividends" && <DividendsView data={div} />}
      </div>
    </div>
  );
}

// ── Annualized Returns ───────────────────────────────────────────────────────
function ReturnsView({ data }: { data: ReturnsData }) {
  const { fmtFromBase } = usePortfolio();
  const [by, setBy] = useState<"entity" | "security">("entity");
  const rows = by === "entity" ? data.entities : data.names.slice(0, 20);
  const xirrFormula = {
    title: "XIRR (money-weighted)",
    excel: "= rate r where Σ cashflow ÷ (1 + r)^years = 0",
    plain: "The single yearly growth rate that makes all dated buys and sells balance to today's value — like Excel's XIRR().",
    auditHref: auditHref(LEDGER),
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Current value" value={<Auditable to={auditHref(LEDGER)} title="Current value — trace to the ledger">{fmtFromBase(data.totalMV, { compact: true })}</Auditable>} sub="live market value" icon={<Layers className="h-4 w-4" />} />
        <StatTile label="Cost (held)" value={<Auditable to={auditHref(LEDGER)} title="Cost (held) — trace to the ledger">{fmtFromBase(data.totalCost, { compact: true })}</Auditable>} sub="of current holdings" />
        <StatTile label="Unrealized P&L" value={<span className={changeColor(data.totalUnrealized)}><Auditable to={auditHref(LEDGER)} title="Unrealised P&L — trace to the ledger">{fmtFromBase(data.totalUnrealized, { compact: true, sign: true })}</Auditable></span>} />
        <StatTile label="Overall XIRR" value={<span className={changeColor(data.overallXirrPct ?? 0)}>{data.overallXirrPct == null ? "—" : <Auditable formula={xirrFormula}>{fmtPct(data.overallXirrPct, { sign: true, decimals: 1 })}</Auditable>}</span>} sub="p.a., money-weighted" icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <p className="text-xs text-slate-500">
        Money-weighted annualized return (XIRR) from the real dated buys &amp; sells in the ledger, plus
        current market value as the terminal flow. Purchase dates span 2010–2026.
      </p>

      <Card pad={false}>
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="h-section">Annualized return</div>
          <div className="flex gap-1 text-[12px]">
            {(["entity", "security"] as const).map((k) => (
              <button key={k} onClick={() => setBy(k)}
                className={`rounded-md px-2.5 py-1 transition-colors ${by === k ? "bg-ink-700 text-slate-100" : "text-slate-400 hover:bg-ink-700/40"}`}>
                {k === "entity" ? "By entity" : "By security"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-ink-700 text-left">
              <tr>
                <th className="label-xs px-4 py-2 font-medium">{by === "entity" ? "Owning entity" : "Security"}</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Cost (held)</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Current value</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&L</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Since</th>
                <th className="label-xs px-4 py-2 text-right font-medium">XIRR p.a.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {rows.map((r: Grouped) => {
                const rowHref = by === "security" && r.sub ? ledgerHref(r.sub) : auditHref(LEDGER);
                return (
                <tr key={r.key} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-100">{r.label}</div>
                    {by === "security" && <div className="mono text-[10px] text-slate-500">{r.sub} · {r.lots} lots</div>}
                    {by === "entity" && <div className="text-[10px] text-slate-500">{r.lots} lots</div>}
                  </td>
                  <td className="px-4 py-2 text-right mono text-slate-400"><Auditable to={rowHref} title="Cost (held) — trace to the ledger">{fmtFromBase(r.cost, { compact: true })}</Auditable></td>
                  <td className="px-4 py-2 text-right mono text-slate-100"><Auditable to={rowHref} title="Current value — trace to the ledger">{fmtFromBase(r.currentMV, { compact: true })}</Auditable></td>
                  <td className={`px-4 py-2 text-right mono ${changeColor(r.unrealized)}`}><Auditable to={rowHref} title="Unrealised P&L — trace to the ledger">{fmtFromBase(r.unrealized, { compact: true, sign: true })}</Auditable></td>
                  <td className="px-4 py-2 text-right mono text-slate-500">{r.since ? r.since.slice(0, 4) : "—"}</td>
                  <td className={`px-4 py-2 text-right mono font-medium ${r.xirrPct == null ? "text-slate-500" : changeColor(r.xirrPct)}`}>
                    {r.xirrPct == null ? "—" : <Auditable formula={xirrFormula}>{fmtPct(r.xirrPct, { sign: true, decimals: 1 })}</Auditable>}
                  </td>
                </tr>
                );
              })}
            </tbody>
            {by === "entity" && (
              <tfoot className="border-t border-ink-700 font-semibold">
                <tr>
                  <td className="px-4 py-2 text-slate-200">Total · {data.entities.length} entities</td>
                  <td className="px-4 py-2 text-right mono text-slate-300"><Auditable to={auditHref(LEDGER)} title="Total cost (held) — trace to the ledger">{fmtFromBase(data.totalCost, { compact: true })}</Auditable></td>
                  <td className="px-4 py-2 text-right mono text-slate-100"><Auditable to={auditHref(LEDGER)} title="Total current value — trace to the ledger">{fmtFromBase(data.totalMV, { compact: true })}</Auditable></td>
                  <td className={`px-4 py-2 text-right mono ${changeColor(data.totalUnrealized)}`}><Auditable to={auditHref(LEDGER)} title="Total unrealised P&L — trace to the ledger">{fmtFromBase(data.totalUnrealized, { compact: true, sign: true })}</Auditable></td>
                  <td />
                  <td className={`px-4 py-2 text-right mono ${changeColor(data.overallXirrPct ?? 0)}`}>{data.overallXirrPct == null ? "—" : <Auditable formula={xirrFormula}>{fmtPct(data.overallXirrPct, { sign: true, decimals: 1 })}</Auditable>}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Sales & Exits ────────────────────────────────────────────────────────────
function SalesView({ data }: { data: SalesData | null }) {
  const { fmtFromBase } = usePortfolio();
  if (!data) return <div className="grid h-40 place-items-center text-sm text-slate-500">Loading sales…</div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Gross sale proceeds" value={<Auditable to={auditHref(LEDGER)} title="Gross sale proceeds — trace to the ledger">{fmtFromBase(data.totalProceeds, { compact: true })}</Auditable>} sub="cash raised from sales" icon={<Coins className="h-4 w-4" />} />
        <StatTile label="Realized profit" value={<span className={changeColor(data.totalRealized)}><Auditable to={auditHref(LEDGER)} title="Realized profit — trace to the ledger">{fmtFromBase(data.totalRealized, { compact: true, sign: true })}</Auditable></span>} sub="booked gain on sold lots" icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label="Fully exited" value={fmtNum(data.exits)} sub="sold out — no longer held" icon={<LogOut className="h-4 w-4" />} />
        <StatTile label="Trimmed" value={fmtNum(data.trims)} sub="partly sold, still held" icon={<Scissors className="h-4 w-4" />} />
      </div>

      <p className="text-xs text-slate-500">
        Every holding shown across the dashboard is <span className="text-slate-300">net of these sales</span> — quantities and market values
        already exclude what was sold. Fully-exited names don&rsquo;t appear in Portfolio Monitor at all; trimmed names show only the shares
        still held. Sold quantity, proceeds and realized profit are read from the dated buy/sell ledger (as of {fmtDate(data.asOf)}).
      </p>

      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-ink-700 text-left">
              <tr>
                <th className="label-xs px-4 py-2 font-medium">Security</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Shares sold</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Gross proceeds</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Realized P&L</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Still held</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {data.rows.map((r) => (
                <tr key={r.securityKey} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2 text-slate-100"><StockLink securityKey={r.securityKey} name={r.security} /></td>
                  <td className="px-4 py-2 text-right mono text-slate-300"><Auditable to={ledgerHref(r.security)} title="Shares sold — trace to the ledger">{fmtNum(Math.round(r.soldQty))}</Auditable></td>
                  <td className="px-4 py-2 text-right mono text-slate-200"><Auditable to={ledgerHref(r.security)} title="Gross proceeds — trace to the ledger">{fmtFromBase(r.proceeds, { compact: true })}</Auditable></td>
                  <td className={`px-4 py-2 text-right mono ${changeColor(r.realized)}`}><Auditable to={ledgerHref(r.security)} title="Realized P&L — trace to the ledger">{fmtFromBase(r.realized, { compact: true, sign: true })}</Auditable></td>
                  <td className="px-4 py-2 text-right mono text-slate-400">{r.exited ? "—" : <Auditable to={ledgerHref(r.security)} title="Still held — trace to the ledger">{fmtFromBase(r.heldMV, { compact: true })}</Auditable>}</td>
                  <td className="px-4 py-2"><Pill tone={r.exited ? "warn" : "info"}>{r.exited ? "Exited" : "Trimmed"}</Pill></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-ink-700 font-semibold">
              <tr>
                <td className="px-4 py-2 text-slate-200">Total · {data.rows.length} names sold</td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2 text-right mono text-slate-100"><Auditable to={auditHref(LEDGER)} title="Total gross proceeds — trace to the ledger">{fmtFromBase(data.totalProceeds, { compact: true })}</Auditable></td>
                <td className={`px-4 py-2 text-right mono ${changeColor(data.totalRealized)}`}><Auditable to={auditHref(LEDGER)} title="Total realized P&L — trace to the ledger">{fmtFromBase(data.totalRealized, { compact: true, sign: true })}</Auditable></td>
                <td className="px-4 py-2" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Dividends (honest first cut over sparse source) ──────────────────────────
function DividendsView({ data }: { data: DivData | null }) {
  const { fmtFromBase } = usePortfolio();
  if (!data) return <div className="grid h-40 place-items-center text-sm text-slate-500">Loading dividends…</div>;
  const withValues = data.rows.filter((r) => r.perShare != null);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Securities tracked" value={fmtNum(data.tracked)} sub={`dividend mastersheet · ${data.fy}`} icon={<Coins className="h-4 w-4" />} />
        <StatTile label="With recorded figures" value={fmtNum(data.withValues)} sub="per-share captured" />
        <StatTile label="Awaiting figures" value={fmtNum(data.tracked - data.withValues)} sub="blank in source" />
      </div>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/90">
        Dividend tracking in the source workbooks is sparse — per-share and amount figures are largely
        blank, so totals aren't computed here to avoid fabricating numbers. Securities the mastersheet
        lists are shown below; this view will total dividends by security &amp; entity once the source is populated.
      </div>
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-ink-700 text-left">
              <tr>
                <th className="label-xs px-4 py-2 font-medium">Security</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Date</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Dividend / share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {(withValues.length ? withValues : data.rows).map((r, i) => (
                <tr key={i} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2 text-slate-200">{r.security}</td>
                  <td className="px-4 py-2 text-right mono text-slate-500">{r.date ? fmtDate(r.date) : "—"}</td>
                  <td className="px-4 py-2 text-right mono text-slate-300">{r.perShare == null ? "—" : <Auditable to={auditHref(LEDGER)} title="Dividend per share — trace to the ledger">{fmtFromBase(r.perShare)}</Auditable>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
