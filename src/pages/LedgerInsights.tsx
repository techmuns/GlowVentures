import { useEffect, useState } from "react";
import { TrendingUp, Coins, ShieldAlert, ArrowLeftRight, Scissors, LogOut, Receipt, Gift } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtNum, changeColor, fmtDate } from "@/lib/format";
import { Auditable } from "@/components/Auditable";
import { StockLink } from "@/components/StockLink";
import { auditHref } from "@/lib/auditFormulas";
import { AbsentCell, AbsentSection, absentTile, DASH } from "@/components/Absent";
import {
  loadTransactions, loadRealisedLots, loadIncome, loadSales,
  type TxnData, type LotData, type IncomeData, type SalesData,
} from "@/lib/ledger";

// Ledger Insights — the DATED record behind the book, straight from the archive.
//
// WHAT THIS PAGE USED TO SHOW, AND WHY IT DOESN'T. Three tabs — Annualized
// Returns, Sales & Exits, Dividends — computed off one wide workbook sheet.
// This book has no such sheet, so every load failed and the page rendered
// "Couldn't load the ledgers … your session may have expired, so sign in again."
// The session was fine. The fetch was aimed at a path this pipeline never
// writes, and the page turned that into an accusation the reader would act on.
//
// The tabs are now the three things the archive genuinely carries, each stating
// the WINDOW it covers and which accounts contributed:
//
//   • Transactions   — every dated buy and sell on the transaction statements.
//   • Realised gains — the capital gain statements' lots, purchase date and all.
//   • Income         — cash dividends, and the corporate actions (bonus, split,
//                      rights) that a dividend statement cannot carry.
//
// WHAT IS DELIBERATELY ABSENT. There is no annualised per-security return here.
// XIRR needs every lot from first purchase; these statements cover the current
// period only, and a rate computed over a partial window is a real-looking
// number for the wrong period. The money-weighted returns this book DOES support
// are per-account, over dated external capital movements, on NAV & Performance.

type Tab = "transactions" | "gains" | "income";
const TABS: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
  { key: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { key: "gains", label: "Realised Gains", icon: Receipt },
  { key: "income", label: "Income & Corporate Actions", icon: Coins },
];

const window = (from: string | null, to: string | null) =>
  from && to ? `${fmtDate(from)} → ${fmtDate(to)}` : from ? `from ${fmtDate(from)}` : to ? `to ${fmtDate(to)}` : null;

export function LedgerInsights() {
  const [status, setStatus] = useState<"loading" | "ready" | "unreachable">("loading");
  const [tab, setTab] = useState<Tab>("transactions");
  const [txn, setTxn] = useState<TxnData | null>(null);
  const [lots, setLots] = useState<LotData | null>(null);
  const [income, setIncome] = useState<IncomeData | null>(null);
  const [sales, setSales] = useState<SalesData | null>(null);

  useEffect(() => {
    let alive = true;
    loadTransactions().then((t) => {
      if (!alive) return;
      if (!t) { setStatus("unreachable"); return; }
      setTxn(t); setStatus("ready");
      loadRealisedLots().then((x) => alive && setLots(x));
      loadIncome().then((x) => alive && setIncome(x));
      loadSales().then((x) => alive && setSales(x));
    });
    return () => { alive = false; };
  }, []);

  if (status === "unreachable") {
    return (
      <div className="flex h-full flex-col">
        <PageHeader eyebrow="Analytics" title="Ledger Insights"
          subtitle="The dated record behind the book — transactions, realised gains and income, read from the audit archive." />
        <div className="grid flex-1 place-items-center py-16 text-center">
          <div className="max-w-lg">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-slate-100">The audit archive didn't respond</h2>
            <p className="mt-2 text-sm text-slate-400">
              These views read <span className="mono text-slate-300">/audit/manifest.json</span> and the extracted
              documents behind it. That request didn't come back. Refresh to retry — the archive is written by
              <span className="mono text-slate-300"> npm run extract</span> and served alongside the app, so if the
              site is up and this persists, the archive is missing rather than your session being stale.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Analytics" title="Ledger Insights"
        subtitle="The dated record behind the book — read from the extracted statements, not from the position snapshot."
        right={txn ? <Pill tone="info">as of {fmtDate(txn.asOf)}</Pill> : undefined} />

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
        {status === "loading" && <div className="grid h-40 place-items-center text-sm text-slate-500">Reading the archive…</div>}
        {tab === "transactions" && txn && <TransactionsView data={txn} sales={sales} />}
        {tab === "gains" && <GainsView data={lots} />}
        {tab === "income" && <IncomeView data={income} />}
      </div>
    </div>
  );
}

// ── Transactions ─────────────────────────────────────────────────────────────
function TransactionsView({ data, sales }: { data: TxnData; sales: SalesData | null }) {
  const { fmtFromBase } = usePortfolio();
  const win = window(data.periodFrom, data.periodTo);
  const bought = data.txns.filter((t) => t.side === "Buy").reduce((s, t) => s + t.amount, 0);
  const sold = data.txns.filter((t) => t.side === "Sell").reduce((s, t) => s + t.amount, 0);

  if (!data.txns.length) {
    return (
      <AbsentSection what="No dated transactions in this book"
        needs="Transactions come from each manager's transaction statement. No account in this drop issued one." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Transactions" value={fmtNum(data.txns.length)}
          sub={`${fmtNum(data.buys)} buys · ${fmtNum(data.sells)} sells`} icon={<ArrowLeftRight className="h-4 w-4" />} />
        <StatTile label="Bought" value={fmtFromBase(bought, { compact: true })} sub="settled cost, over the window" />
        <StatTile label="Sold"
          {...(data.sells
            ? { value: fmtFromBase(sold, { compact: true }), sub: "settled proceeds, over the window" }
            : absentTile("no sells over this window", "Every transaction on these statements is a purchase."))} />
        {sales?.totalRealized == null ? (
          <StatTile label="Realised on those sells"
            {...absentTile("no capital gain statement covers them",
              "Realised gain is a tax determination the manager makes on its own statement. Where none was issued, the sells are real but what they realised was never reported.")}
            icon={<Receipt className="h-4 w-4" />} />
        ) : (
          <StatTile label="Realised on those sells"
            value={<span className={changeColor(sales.totalRealized)}>{fmtFromBase(sales.totalRealized, { compact: true, sign: true })}</span>}
            sub={`on the ${sales.matchedSales} sales the statements settle`}
            hint={sales.statementRealized != null
              ? `A DIFFERENT BASIS from the ${fmtFromBase(sales.statementRealized, { compact: true, sign: true })} on Capital Gains. That figure is the capital gain statements' own total over their period — all ${sales.statementLots} lots, including demerger allotments and fund redemptions that never appear as a sell on a transaction statement. This one covers only the sales listed below. Both are right; they measure different sets.`
              : undefined}
            icon={<Receipt className="h-4 w-4" />} />
        )}
      </div>

      {sales?.statementRealized != null && sales.totalRealized != null
        && Math.abs(sales.statementRealized - sales.totalRealized) > 1 && (
        <p className="rounded-lg border border-dashed border-ink-600/70 px-3 py-2 text-xs leading-relaxed text-slate-500">
          <span className="font-medium text-slate-400">Two realised totals, two bases, both right.</span>{" "}
          {fmtFromBase(sales.totalRealized, { compact: true, sign: true })} above is what the {sales.matchedSales} sales
          listed here realised. The Capital Gains page shows{" "}
          {fmtFromBase(sales.statementRealized, { compact: true, sign: true })} — the capital gain statements' own total
          across all {sales.statementLots} lots, which also settles demerger allotments and fund redemptions that never
          appear as a sell on a transaction statement. They are not a disagreement to reconcile; they measure different sets.
        </p>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        <span className="font-medium text-slate-400">This is the statements' window, not the holding period.</span>{" "}
        {win ? <>These transaction statements cover <span className="text-slate-300">{win}</span>.</> : "These statements do not print their window."}{" "}
        {data.accounts.length} of {data.accounts.length + data.accountsWithout.length} accounts issued one
        {data.accountsWithout.length > 0 && <> — {data.accountsWithout.join(", ")} did not, so nothing they traded appears here</>}.
        A purchase made before this window is not listed, which is why no annualised per-security return is computed
        from it: a rate over a partial history would be a real number for the wrong period.
      </p>

      <Card pad={false}>
        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-ink-700 bg-ink-800 text-left">
              <tr>
                <th className="label-xs px-4 py-2 font-medium">Date</th>
                <th className="label-xs px-4 py-2 font-medium">Security</th>
                <th className="label-xs px-4 py-2 font-medium">Account</th>
                <th className="label-xs px-4 py-2 text-center font-medium">Side</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Quantity</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Price</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Net amount</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Realised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {data.txns.map((t, i) => (
                <tr key={`${t.date}-${t.securityKey}-${i}`} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2 mono text-slate-400 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-4 py-2 text-slate-100"><StockLink securityKey={t.securityKey} name={t.security} /></td>
                  <td className="px-4 py-2 text-[12px] text-slate-400">{t.account}</td>
                  <td className="px-4 py-2 text-center"><Pill tone={t.side === "Buy" ? "info" : "warn"}>{t.side}</Pill></td>
                  <td className="px-4 py-2 text-right mono text-slate-300">{fmtNum(Math.round(t.qty))}</td>
                  <td className="px-4 py-2 text-right mono text-slate-400">{fmtFromBase(t.price)}</td>
                  <td className="px-4 py-2 text-right mono text-slate-200">{fmtFromBase(t.amount, { compact: true })}</td>
                  <td className="px-4 py-2 text-right mono">
                    {t.realized == null
                      ? <AbsentCell reason={t.realizedNote ?? (t.side === "Buy" ? "a purchase realises nothing" : "no capital gain statement covers this account")} />
                      : <span className={changeColor(t.realized)}>{fmtFromBase(t.realized, { compact: true, sign: true })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {sales && sales.rows.length > 0 && (
        <Card title="Sales &amp; exits" subtitle="Per security, over the same window — and whether the name is still held" pad={false}
          right={<Pill tone="info">{sales.exits} exited · {sales.trims} trimmed</Pill>}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700 text-left">
                <tr>
                  <th className="label-xs px-4 py-2 font-medium">Security</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Shares sold</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Proceeds</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Realised</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Still held</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {sales.rows.map((r) => (
                  <tr key={r.securityKey} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 text-slate-100"><StockLink securityKey={r.securityKey} name={r.security} /></td>
                    <td className="px-4 py-2 text-right mono text-slate-300">{fmtNum(Math.round(r.soldQty))}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">{fmtFromBase(r.proceeds, { compact: true })}</td>
                    <td className="px-4 py-2 text-right mono">
                      {r.realized == null
                        ? <AbsentCell reason="no capital gain statement covers this name's sells" />
                        : <span className={changeColor(r.realized)}>{fmtFromBase(r.realized, { compact: true, sign: true })}</span>}
                    </td>
                    <td className="px-4 py-2 text-right mono text-slate-400">
                      {r.heldQty > 0 ? fmtNum(Math.round(r.heldQty)) : <span className="text-slate-600">{DASH}</span>}
                    </td>
                    <td className="px-4 py-2">
                      <Pill tone={r.exited ? "warn" : "info"}>{r.exited ? <><LogOut className="mr-1 inline h-3 w-3" />Exited</> : <><Scissors className="mr-1 inline h-3 w-3" />Trimmed</>}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Realised gains ───────────────────────────────────────────────────────────
function GainsView({ data }: { data: LotData | null }) {
  const { fmtFromBase } = usePortfolio();
  if (!data) return <div className="grid h-40 place-items-center text-sm text-slate-500">Reading the capital gain statements…</div>;
  if (!data.lots.length) {
    return (
      <AbsentSection what="No capital gain statement in this book"
        needs="Realised short- and long-term gains are a determination the manager makes on its own statement. No account in this drop issued one, so there is nothing to show — which is different from having realised nothing." />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Lots settled" value={fmtNum(data.lots.length)}
          sub={`across ${data.accounts.length} account${data.accounts.length === 1 ? "" : "s"}`} icon={<Receipt className="h-4 w-4" />} />
        <StatTile label="Realised short-term"
          {...(data.totalShort == null
            ? absentTile("no lot carries a short-term figure")
            : { value: <span className={changeColor(data.totalShort)}>{fmtFromBase(data.totalShort, { compact: true, sign: true })}</span>, sub: "as the managers split it" })} />
        <StatTile label="Realised long-term"
          {...(data.totalLong == null
            ? absentTile("no lot carries a long-term figure")
            : { value: <span className={changeColor(data.totalLong)}>{fmtFromBase(data.totalLong, { compact: true, sign: true })}</span>, sub: "as the managers split it" })} />
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Short vs long term is <span className="font-medium text-slate-400">read from the statement, not re-derived here</span> —
        the holding-period rule differs by asset and the determination is the manager's.
        {data.accountsWithout.length > 0 && <> {data.accountsWithout.join(", ")} issued no capital gain statement,
          so nothing they realised appears here or in any total on this page.</>}
        {" "}These lots are the only place in the book that carries a purchase DATE, and only for lots already sold —
        which is why the hold-to-LTCG planner on Capital Gains has nothing to work from.
      </p>

      <Card pad={false}>
        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-ink-700 bg-ink-800 text-left">
              <tr>
                <th className="label-xs px-4 py-2 font-medium">Security</th>
                <th className="label-xs px-4 py-2 font-medium">Account</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Bought</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Sold</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Held (days)</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Quantity</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Proceeds</th>
                <th className="label-xs px-4 py-2 text-center font-medium">Term</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Gain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {data.lots.map((l, i) => (
                <tr key={`${l.securityKey}-${l.saleDate}-${i}`} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2 text-slate-100"><StockLink securityKey={l.securityKey} name={l.security} /></td>
                  <td className="px-4 py-2 text-[12px] text-slate-400">{l.account}</td>
                  <td className="px-4 py-2 text-right mono text-slate-400 whitespace-nowrap">{l.purchaseDate ? fmtDate(l.purchaseDate) : <AbsentCell reason="the statement does not print a purchase date for this lot" />}</td>
                  <td className="px-4 py-2 text-right mono text-slate-400 whitespace-nowrap">{l.saleDate ? fmtDate(l.saleDate) : <AbsentCell />}</td>
                  <td className="px-4 py-2 text-right mono text-slate-400">{l.daysHeld == null ? <AbsentCell /> : fmtNum(l.daysHeld)}</td>
                  <td className="px-4 py-2 text-right mono text-slate-300">{l.quantity == null ? <AbsentCell /> : fmtNum(Math.round(l.quantity))}</td>
                  <td className="px-4 py-2 text-right mono text-slate-200">{l.saleAmount == null ? <AbsentCell /> : fmtFromBase(l.saleAmount, { compact: true })}</td>
                  <td className="px-4 py-2 text-center">{l.term == null ? <AbsentCell reason="the statement books no gain against this lot" /> : <Pill tone={l.term === "Long" ? "info" : "warn"}>{l.term}</Pill>}</td>
                  <td className={`px-4 py-2 text-right mono ${changeColor(l.gain)}`}>
                    <Auditable to={auditHref({ file: l.source })} title="Realised gain — trace to the capital gain statement">
                      {fmtFromBase(l.gain, { compact: true, sign: true })}
                    </Auditable>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Income & corporate actions ───────────────────────────────────────────────
function IncomeView({ data }: { data: IncomeData | null }) {
  const { fmtFromBase } = usePortfolio();
  if (!data) return <div className="grid h-40 place-items-center text-sm text-slate-500">Reading the dividend statements…</div>;
  if (!data.cash.length && !data.corporate.length) {
    return (
      <AbsentSection what="No income events in this book"
        needs="Cash dividends come from each manager's dividend statement and non-cash actions from its corporate benefits report. No account in this drop issued either." />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Cash dividends"
          {...(data.totalCash == null
            ? absentTile("no dividend carries an amount")
            : { value: fmtFromBase(data.totalCash, { compact: true }), sub: `${fmtNum(data.cash.length)} event${data.cash.length === 1 ? "" : "s"}` })}
          icon={<Coins className="h-4 w-4" />} />
        <StatTile label="TDS withheld"
          {...(data.totalTds == null
            ? absentTile("no statement prints a TDS column")
            : { value: fmtFromBase(data.totalTds, { compact: true }), sub: "deducted at source" })} />
        <StatTile label="Corporate actions"
          {...(data.corporate.length
            ? { value: fmtNum(data.corporate.length), sub: "bonus / split / rights — not cash" }
            : absentTile("no corporate benefits report in this book",
              "Bonus issues, splits and rights are carried on a corporate benefits report; a dividend statement cannot hold them."))}
          icon={<Gift className="h-4 w-4" />} />
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        The dividend statement is authoritative for <span className="font-medium text-slate-400">cash</span>; the
        corporate benefits report is authoritative for <span className="font-medium text-slate-400">non-cash</span>{" "}
        actions it alone can carry. Where both list the same cash event it is counted once, on the dividend
        statement's figures. Preferring one report wholesale would silently drop every bonus and split.
        {data.accountsWithout.length > 0 && <> {data.accountsWithout.join(", ")} issued neither, so nothing
          they received appears in these totals.</>}
      </p>

      {data.cash.length > 0 && (
        <Card title="Cash dividends" pad={false}>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-ink-700 bg-ink-800 text-left">
                <tr>
                  <th className="label-xs px-4 py-2 font-medium">Security</th>
                  <th className="label-xs px-4 py-2 font-medium">Account</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Ex-date</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Quantity</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Per unit</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">TDS</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {data.cash.map((r, i) => (
                  <tr key={`${r.securityKey}-${r.date}-${i}`} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 text-slate-100"><StockLink securityKey={r.securityKey} name={r.security} /></td>
                    <td className="px-4 py-2 text-[12px] text-slate-400">{r.account}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400 whitespace-nowrap">{r.date ? fmtDate(r.date) : <AbsentCell />}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{r.quantity == null ? <AbsentCell /> : fmtNum(Math.round(r.quantity))}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{r.ratePerUnit == null ? <AbsentCell /> : fmtFromBase(r.ratePerUnit)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{r.tds == null ? <AbsentCell /> : fmtFromBase(r.tds, { compact: true })}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">
                      {r.net == null ? <AbsentCell /> : (
                        <Auditable to={auditHref({ file: r.source })} title="Dividend — trace to the dividend statement">
                          {fmtFromBase(r.net, { compact: true })}
                        </Auditable>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.corporate.length > 0 && (
        <Card title="Corporate actions" subtitle="Bonus, split and rights — an entitlement in shares, never an amount" pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700 text-left">
                <tr>
                  <th className="label-xs px-4 py-2 font-medium">Security</th>
                  <th className="label-xs px-4 py-2 font-medium">Account</th>
                  <th className="label-xs px-4 py-2 font-medium">Action</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Ex-date</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Held</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Entitlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {data.corporate.map((r, i) => (
                  <tr key={`${r.securityKey}-${r.date}-${i}`} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 text-slate-100"><StockLink securityKey={r.securityKey} name={r.security} /></td>
                    <td className="px-4 py-2 text-[12px] text-slate-400">{r.account}</td>
                    <td className="px-4 py-2"><Pill tone="info">{r.kind}</Pill></td>
                    <td className="px-4 py-2 text-right mono text-slate-400 whitespace-nowrap">{r.date ? fmtDate(r.date) : <AbsentCell />}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{r.quantity == null ? <AbsentCell /> : fmtNum(Math.round(r.quantity))}</td>
                    <td className="px-4 py-2 text-[12px] text-slate-300">{r.entitlement ?? <AbsentCell reason="the report prints no ratio for this action" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
