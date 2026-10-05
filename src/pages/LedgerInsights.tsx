import { PagedTableBody } from "@/components/PagedTableBody";
import { useEffect, useState } from "react";
import { TrendingUp, Coins, ShieldAlert, ArrowLeftRight, Scissors, LogOut, Receipt, Gift } from "lucide-react";
import { BasisPill } from "@/components/BasisPill";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtNum, changeColor, fmtDate } from "@/lib/format";
import { StockLink } from "@/components/StockLink";

import { AbsentCell, AbsentSection, absentTile, DASH } from "@/components/Absent";
import { holdingBucket, bucketLabel, isMandateHeld, MANDATE_BUCKET } from "@/lib/analytics";
import type { Account } from "@/lib/types";
import {
  loadTransactions, loadRealisedLots, loadIncome, loadSales,
  type TxnData, type LotData, type Lot, type IncomeData, type SalesData,
} from "@/lib/ledger";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

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
    });
    loadSales().then((x) => alive && setSales(x));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (tab === "gains") loadRealisedLots().then((x) => alive && setLots(x));
    if (tab === "income") loadIncome().then((x) => alive && setIncome(x));
    return () => { alive = false; };
  }, [tab]);

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
        right={<span className="inline-flex items-center gap-1.5">
          {/* Always STATEMENT: every figure here is a dated primitive read off a
              statement. Nothing on this page is price-derived, so there is
              nothing for the live layer to mark. */}
          <BasisPill statement liveText="Statement records"
            hint="Transactions, capital gain lots and income events are dated primitives read off the statements. No figure on this page is price-derived, so the live feed does not apply." />
          {/* THE TAPE'S OWN WINDOW, NOT THE ARCHIVE'S NEWEST DATE (XA-18).
              `txn.asOf` is the newest statement of ANY kind in the archive —
              29 Aug, the two trusts' NSDL holding statements, which carry no
              trade — so "as of 29 Aug" dated a tape that ends on 13 Aug. The
              window the transaction statements cover is what dates it. */}
          {txn && window(txn.periodFrom, txn.periodTo) ? (
            <Pill tone="info">
              <span data-xa="ledger-window" data-from={txn.periodFrom ?? ""} data-to={txn.periodTo ?? ""}
                title={`The window the transaction statements cover — every trade on this page falls in it. The archive's newest statement of any kind is dated ${fmtDate(txn.asOf)}, and it dates no trade.`}>
                tape {window(txn.periodFrom, txn.periodTo)}
              </span>
            </Pill>
          ) : null}
        </span>} />

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
/**
 * Each table's columns in DECLARED order — the order their cells are written
 * in below, which is what `<Tr>` permutes from. The first is the row's SUBJECT
 * and never moves (see `src/lib/tableView.ts`).
 */
const TXN_COLS = ["date", "security", "account", "side", "qty", "price", "amount", "realised"] as const;
const SALE_COLS = ["security", "sold", "proceeds", "realised", "held", "status"] as const;
const LOT_BUCKET_COLS = ["bucket", "lots", "short", "long", "total"] as const;
const LOT_COLS = ["security", "account", "bought", "sold", "days", "qty", "proceeds", "term", "gain"] as const;
const CASH_COLS = ["security", "account", "date", "qty", "rate", "tds", "net"] as const;
const CORP_COLS = ["security", "account", "action", "date", "held", "entitlement"] as const;

function TransactionsView({ data, sales }: { data: TxnData; sales: SalesData | null }) {
  const txnView = useTableView("ledger-txns", TXN_COLS);
  const saleView = useTableView("ledger-sales", SALE_COLS);
  // THE DEFAULT ORDER IS THE LEDGER'S OWN and stays untouched until a reader
  // ranks a column: `ledger.ts` returns these dated rows newest-first, which is
  // a fact about the record rather than a ranking this page chose.
  const txnRows = sortRows(data.txns, txnView.sort, {
    date: (t) => t.date,
    security: (t) => t.security,
    account: (t) => t.account,
    side: (t) => t.side,
    qty: (t) => t.qty,
    price: (t) => t.price,
    amount: (t) => t.amount,
    realised: (t) => t.realized,
  });
  const saleRows = sortRows(sales?.rows ?? [], saleView.sort, {
    security: (r) => r.security,
    sold: (r) => r.soldQty,
    proceeds: (r) => r.proceeds,
    realised: (r) => r.realized,
    held: (r) => (r.heldQty > 0 ? r.heldQty : null),
    status: (r) => (r.exited ? "Exited" : "Trimmed"),
  });
  const { fmtFromBase } = usePortfolio();
  const win = window(data.periodFrom, data.periodTo);
  /**
   * `Txn.amount` is `number | null` — a trade whose statement prints no
   * settlement, net or gross reported nothing, which is not the same as a trade
   * that settled for nothing. These skip the nulls rather than adding them as
   * zero, which is `sumOrNull`'s rule applied to a running total, and the tiles
   * say how many rows each figure covers.
   */
  const buys = data.txns.filter((t) => t.side === "Buy");
  const sells = data.txns.filter((t) => t.side === "Sell");
  const bought = buys.reduce((s, t) => s + (t.amount ?? 0), 0);
  const sold = sells.reduce((s, t) => s + (t.amount ?? 0), 0);
  const boughtOf = buys.filter((t) => t.amount != null).length;
  const soldOf = sells.filter((t) => t.amount != null).length;
  const coverage = (n: number, of: number) => (n === of ? "" : ` · ${n} of ${of} rows report one`);

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
        <StatTile label="Bought" value={fmtFromBase(bought, { compact: true })} sub={`settled cost, ${win ?? "over the statements' windows"}${coverage(boughtOf, buys.length)}`} />
        <StatTile label="Sold"
          {...(data.sells
            ? { value: fmtFromBase(sold, { compact: true }), sub: `settled proceeds, ${win ?? "over the statements' windows"}${coverage(soldOf, sells.length)}` }
            : absentTile("no sells over this window", "Every transaction on these statements is a purchase."))} />
        {/* THE STATEMENT FIGURE IS THE HEADLINE. It is the printed primitive —
            what the managers determined and what Capital Gains shows. The
            roll-up we derive from the tape is a cross-check and sits below,
            never in a tile where it could be mistaken for the answer. */}
        {sales?.statementRealized == null ? (
          <StatTile label="Realised (as the statements report it)"
            {...absentTile("no capital gain statement covers these sells",
              "Realised gain is a tax determination the manager makes on its own statement. Where none was issued, the sells are real but what they realised was never reported.")}
            icon={<Receipt className="h-4 w-4" />} />
        ) : (
          <StatTile label="Realised (as the statements report it)"
            value={<span className={changeColor(sales.statementRealized)}>{fmtFromBase(sales.statementRealized, { compact: true, sign: true })}</span>}
            sub={`all ${sales.statementLots} lots · the printed figure`}
            hint="This is the capital gain statements' own total, and it is the figure Capital Gains shows. Everything below is derived from it, never the other way round."
            icon={<Receipt className="h-4 w-4" />} />
        )}
      </div>

      {sales?.statementRealized != null && sales.totalRealized != null
        && Math.abs(sales.statementRealized - sales.totalRealized) > 1 && (
        <div className="rounded-lg border border-dashed border-ink-600/70 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
          <div className="font-medium text-slate-400" title="Each lot attributed to the sale that produced it, set against the statement's own total.">Cross-check · lots by sale</div>
          <table className="mt-2 w-full max-w-2xl">
            <tbody className="mono">
              <tr>
                <td className="py-0.5 pr-4">Statement total — <span className="text-slate-400">canonical</span></td>
                <td className="py-0.5 pr-3 text-right">{sales.statementLots} lots</td>
                <td className={`py-0.5 text-right ${changeColor(sales.statementRealized)}`}>{fmtFromBase(sales.statementRealized, { sign: true })}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-4">…attributed to a sale on the tape</td>
                <td className="py-0.5 pr-3 text-right">{sales.statementLots - sales.unattributedLots} lots</td>
                <td className={`py-0.5 text-right ${changeColor(sales.totalRealized)}`}>{fmtFromBase(sales.totalRealized, { sign: true })}</td>
              </tr>
              {sales.unattributedRealized != null && (
                <tr className="border-t border-ink-700/60">
                  <td className="py-0.5 pr-4">…not on the tape at all</td>
                  <td className="py-0.5 pr-3 text-right">{sales.unattributedLots} lots</td>
                  <td className={`py-0.5 text-right ${changeColor(sales.unattributedRealized)}`}>{fmtFromBase(sales.unattributedRealized, { sign: true })}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Card pad={false}>
        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-ink-700 bg-ink-800 text-left">
              <Tr view={txnView}>
                <SortHeader col="date" view={txnView} align="left">Date</SortHeader>
                <SortHeader col="security" view={txnView} align="left">Security</SortHeader>
                <SortHeader col="account" view={txnView} align="left">Account</SortHeader>
                <SortHeader col="side" view={txnView} align="center">Side</SortHeader>
                <SortHeader col="qty" view={txnView}>Quantity</SortHeader>
                <SortHeader col="price" view={txnView}>Price</SortHeader>
                <SortHeader col="amount" view={txnView}>Net amount</SortHeader>
                <SortHeader col="realised" view={txnView}>Realised</SortHeader>
              </Tr>
            </thead>
            <PagedTableBody rows={txnRows} columns={TXN_COLS.length} resetKey={JSON.stringify(txnView.sort)} className="divide-y divide-ink-700/70">
              {(t, i) => (
                <Tr view={txnView} key={`${t.date}-${t.securityKey}-${i}`} className="hover:bg-ink-700/40">
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
                </Tr>
              )}
            </PagedTableBody>
          </table>
        </div>
      </Card>

      {sales && sales.rows.length > 0 && (
        <Card title="Sales &amp; exits" subtitle="Per security, over the same window — and whether the name is still held" pad={false}
          right={<Pill tone="info">{sales.exits} exited · {sales.trims} trimmed</Pill>}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700 text-left">
                <Tr view={saleView}>
                  <SortHeader col="security" view={saleView} align="left">Security</SortHeader>
                  <SortHeader col="sold" view={saleView}>Shares sold</SortHeader>
                  <SortHeader col="proceeds" view={saleView}>Proceeds</SortHeader>
                  <SortHeader col="realised" view={saleView}>Realised</SortHeader>
                  <SortHeader col="held" view={saleView}>Still held</SortHeader>
                  <SortHeader col="status" view={saleView} align="left">Status</SortHeader>
                </Tr>
              </thead>
              <PagedTableBody rows={saleRows} columns={SALE_COLS.length} resetKey={JSON.stringify(saleView.sort)} className="divide-y divide-ink-700/70">
                {(r) => (
                  <Tr view={saleView} key={r.securityKey} className="hover:bg-ink-700/40">
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
                  </Tr>
                )}
              </PagedTableBody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Realised gains ───────────────────────────────────────────────────────────

/**
 * WHICH ACCOUNT A LOT CAME FROM, so the split below can be made on HOW that
 * account is run rather than on what the security is.
 *
 * ON THE DOCUMENT KEY, NEVER ON THE DISPLAY LABEL. `Lot.account` is
 * `<owner as printed> · <provider> <accountNo>`, composed in `ledger.ts` out of
 * what the STATEMENT prints — and recovering an account by string-matching a
 * label built for a reader is exactly the inference `custodianOf()` was deleted
 * for. `Lot.source` is the `docKey`, which this repo composes as
 * `<accountId>-<asOf>-<reportType>`, exactly as `extract.mjs` composes it. So
 * the join is id to id: the account whose
 * `accountId` the docKey is prefixed with.
 *
 * A docKey matching two accounts or none RESOLVES TO NOTHING and its row says
 * so. That direction is deliberate: a wrong match would print "Direct Equity"
 * over a mandate's realised loss, which is the exact claim this grouping exists
 * to stop, and there is nothing on screen a reader could catch it by.
 *
 * What it still cannot catch, stated rather than papered over: a document whose
 * printed account number the registry does not carry produces no `accountId` to
 * prefix-match, so its lots fall to the unrouted line — named there, never
 * silently relabelled. Removing that residue means putting the account id on the
 * `Lot` itself, which is a change to `src/lib/ledger.ts`.
 */
function accountForLot(accounts: Account[], docKey: string): Account | undefined {
  const hits = accounts.filter((a) => docKey.startsWith(`${a.accountId}-`));
  return hits.length === 1 ? hits[0] : undefined;
}

type LotSplit = {
  key: string; label: string; heldNote: string | null; unclassified: boolean;
  lots: number; short: number; long: number; total: number;
  securities: string[]; accounts: string[]; unresolved: string[];
  noClassLots: number; noClassSecurities: string[];
};

/**
 * The canonical realised total, split by HOW THE HOLDING WAS RUN.
 *
 * `LotData.byClass` splits it by asset class, and `assetClassLabel` is a word
 * about what a security IS. Nearly every account publishing a capital gain
 * statement in this book is a PMS mandate, so that word put a manager's realised
 * figure under a heading claiming the family picked the share. `holdingBucket`
 * is the one place that decision is made and the engagement comes from the
 * ACCOUNT, never from the row.
 *
 * The arithmetic is `byClass`'s own, lot for lot — every lot counted once, short
 * and long added as the manager split them — so the rows still reconstruct the
 * statements' printed total in the footer. Only the grouping changed.
 *
 * THE UNCLASSIFIED LINE IS NOT THE CASH SWEEP, and an earlier draft of the
 * caption below said it was. `loadRealisedLots` joins each lot's class from the
 * same security's rows on the appraisals, fact sheets and transaction
 * statements; the liquid-fund instruments these mandates sweep into ARE carried
 * on other reports in this drop, so those lots come back classified `Equity`,
 * land in the mandate bucket and are netted there. Only the security no report
 * classifies reaches the last line. Describing it as the sweep would put a
 * caption over a figure a fraction of the size of the thing it named.
 *
 * A MANDATE'S LOT IS HELD AS A PMS MANDATE WHATEVER ITS CLASS (Stage 10df):
 * the September delivery's closed ASK and Marathon mandates sold shares no
 * statement in the drop classifies, every one in a PMS account. How an account
 * is run is known where the security's class is not, so those lots are counted
 * on the mandate line and its hover says how many carry no asset class. Only a
 * lot outside a mandate whose class is unknown keeps a line of its own.
 */
function splitLotsByBucket(lots: Lot[], accounts: Account[]): LotSplit[] {
  type Row = Omit<LotSplit, "securities" | "accounts" | "unresolved" | "total" | "noClassSecurities">
    & { securities: Set<string>; accounts: Set<string>; unresolved: Set<string>; noClassSecurities: Set<string> };
  const m = new Map<string, Row>();
  for (const l of lots) {
    const acc = accountForLot(accounts, l.source);
    // A mandate takes its whole account, including the sleeve whose asset class
    // no statement carries: how an account is run is a fact about the ACCOUNT,
    // knowable even where the security's class is not.
    const held = acc && isMandateHeld(acc.engagement) ? MANDATE_BUCKET
      : l.assetClass ? holdingBucket({ assetClass: l.assetClass, securityKey: l.securityKey }, acc?.engagement)
      : null;
    const inMandate = held === MANDATE_BUCKET;
    const unclassified = l.assetClass === null && !inMandate;
    const key = `${held ?? "unbucketed"}::${unclassified ? "no-class" : "class"}`;
    const e = m.get(key) ?? {
      key,
      label: held ? bucketLabel(held) : "",
      heldNote: held ? bucketLabel(held) : null,
      unclassified,
      lots: 0, short: 0, long: 0,
      securities: new Set<string>(), accounts: new Set<string>(), unresolved: new Set<string>(),
      noClassLots: 0, noClassSecurities: new Set<string>(),
    };
    e.lots++; e.short += l.shortTerm ?? 0; e.long += l.longTerm ?? 0;
    if (l.assetClass === null && inMandate) { e.noClassLots++; e.noClassSecurities.add(l.security); }
    e.securities.add(l.security);
    e.accounts.add(l.account);
    if (!acc) e.unresolved.add(l.account);
    m.set(key, e);
  }
  return [...m.values()]
    .map((e) => ({
      ...e, total: e.short + e.long,
      securities: [...e.securities].sort(),
      accounts: [...e.accounts].sort(),
      unresolved: [...e.unresolved].sort(),
      noClassSecurities: [...e.noClassSecurities].sort(),
    }))
    // The classified buckets first, biggest book first; an absence last.
    .sort((a, b) => Number(a.unclassified) - Number(b.unclassified) || b.lots - a.lots);
}

function GainsView({ data }: { data: LotData | null }) {
  const bucketView = useTableView("ledger-lot-bucket", LOT_BUCKET_COLS);
  const lotView = useTableView("ledger-lots", LOT_COLS);
  // STATEMENT BASIS, like the rest of this page: the account registry is read
  // only to resolve how each account is RUN, and reading the live-overlaid book
  // for it on a page pinned to statement records is the trap the BasisPill names.
  const { statementPortfolio, fmtFromBase } = usePortfolio();
  if (!data) return <div className="grid h-40 place-items-center text-sm text-slate-500">Reading the capital gain statements…</div>;
  if (!data.lots.length) {
    return (
      <AbsentSection what="No capital gain statement in this book"
        needs="Realised short- and long-term gains are a determination the manager makes on its own statement. No account in this drop issued one, so there is nothing to show — which is different from having realised nothing." />
    );
  }
  const byBucket = splitLotsByBucket(data.lots, statementPortfolio?.accounts ?? []);
  const bucketRows = sortRows(byBucket, bucketView.sort, {
    bucket: (c) => (c.unclassified ? null : c.label),
    lots: (c) => c.lots,
    short: (c) => c.short,
    long: (c) => c.long,
    total: (c) => c.total,
  });
  const lotRows = sortRows(data.lots, lotView.sort, {
    security: (l) => l.security,
    account: (l) => l.account,
    bought: (l) => l.purchaseDate,
    sold: (l) => l.saleDate,
    days: (l) => l.daysHeld,
    qty: (l) => l.quantity,
    proceeds: (l) => l.saleAmount,
    term: (l) => l.term,
    gain: (l) => l.gain,
  });
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

      {/* THE HEADLINE NETS UNLIKE BOOKS — shares a manager chose, shares the
          family bought itself, and lots whose asset class no report in this drop
          carries. The split changes no figure and makes that visible. It is cut
          on HOW each account is run rather than on what was sold: nearly every
          account publishing a capital gain statement here is a PMS mandate, and
          the class label claimed the family had picked their shares. */}
      {byBucket.length > 1 && (
        <Card title="Realised, by how the holding was run" subtitle="The same canonical total, split — the headline nets these together" pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700 text-left">
                <Tr view={bucketView}>
                  <SortHeader col="bucket" view={bucketView} align="left">Held as</SortHeader>
                  <SortHeader col="lots" view={bucketView}>Lots</SortHeader>
                  <SortHeader col="short" view={bucketView}>Short-term</SortHeader>
                  <SortHeader col="long" view={bucketView}>Long-term</SortHeader>
                  <SortHeader col="total" view={bucketView}>Total</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {bucketRows.map((c) => (
                  <Tr view={bucketView} key={c.key} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5">
                      {!c.unclassified ? (
                        <>
                          <span className="font-medium text-slate-100" data-li-bucket-noclass={c.noClassLots}
                            title={c.noClassLots > 0
                              ? `${c.noClassLots} of these ${fmtNum(c.lots)} lots are in ${c.noClassSecurities.length} ${c.noClassSecurities.length === 1 ? "security" : "securities"} no statement in this drop gives an asset class for (${c.noClassSecurities.join(", ")}). The account is a PMS mandate, so its lots are held as one whatever the security was; no asset class is asserted for them.`
                              : undefined}>{c.label}</span>
                        </>
                      ) : (
                          <>
                            {/* One line, the explanation in its hover (Stage 10cp). */}
                            <span className="text-slate-400" data-li-unclassified={c.lots}
                              title={`${c.securities.join(", ")} — no appraisal, fact sheet or transaction statement in this drop carries an asset class for ${c.securities.length === 1 ? "it" : "them"}, and the account is not a PMS mandate, so neither how it was held nor what it was is known. It keeps its own line rather than being added into another bucket, so the absence is not buried inside a labelled group.`}>
                              {DASH} no asset class on any statement · {c.securities.length} {c.securities.length === 1 ? "security" : "securities"}
                            </span>
                          </>
                        )}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">{fmtNum(c.lots)}</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(c.short)}`}>{fmtFromBase(c.short, { compact: true, sign: true })}</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(c.long)}`}>{fmtFromBase(c.long, { compact: true, sign: true })}</td>
                    <td className={`px-4 py-2.5 text-right mono font-semibold ${changeColor(c.total)}`}>{fmtFromBase(c.total, { compact: true, sign: true })}</td>
                  </Tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink-600 font-semibold">
                <TrFoot view={bucketView} className="px-4 py-2.5 text-slate-200"
                  label={<>Total — the canonical figure</>}
                  cells={{
                    lots: <td key="lots" className="px-4 py-2.5 text-right mono text-slate-400">{fmtNum(data.lots.length)}</td>,
                    short: <td key="short" className={`px-4 py-2.5 text-right mono ${changeColor(data.totalShort ?? 0)}`}>{data.totalShort == null ? <AbsentCell /> : fmtFromBase(data.totalShort, { compact: true, sign: true })}</td>,
                    long: <td key="long" className={`px-4 py-2.5 text-right mono ${changeColor(data.totalLong ?? 0)}`}>{data.totalLong == null ? <AbsentCell /> : fmtFromBase(data.totalLong, { compact: true, sign: true })}</td>,
                    total: <td key="total" className={`px-4 py-2.5 text-right mono ${changeColor((data.totalShort ?? 0) + (data.totalLong ?? 0))}`}>{fmtFromBase((data.totalShort ?? 0) + (data.totalLong ?? 0), { compact: true, sign: true })}</td>,
                  }} />
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* ONE LINE, THE REST ITS HOVER (Stage 10cp) — including the accounts that
          issued no capital gain statement, named rather than dropped. */}
      <p className="text-xs leading-relaxed text-slate-500"
        title={`The holding-period rule differs by asset and the determination is the manager's.${data.accountsWithout.length > 0 ? ` ${data.accountsWithout.join(", ")} issued no capital gain statement, so nothing they realised appears here or in any total on this page.` : ""} These lots are the only place in the book that carries a purchase DATE, and only for lots already sold — which is why the hold-to-LTCG planner on Capital Gains has nothing to work from.`}>
        Short vs long term is <span className="font-medium text-slate-400">read from the statement, not re-derived here</span>
      </p>

      <Card pad={false}>
        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-ink-700 bg-ink-800 text-left">
              <Tr view={lotView}>
                <SortHeader col="security" view={lotView} align="left">Security</SortHeader>
                <SortHeader col="account" view={lotView} align="left">Account</SortHeader>
                <SortHeader col="bought" view={lotView}>Bought</SortHeader>
                <SortHeader col="sold" view={lotView}>Sold</SortHeader>
                <SortHeader col="days" view={lotView}>Held (days)</SortHeader>
                <SortHeader col="qty" view={lotView}>Quantity</SortHeader>
                <SortHeader col="proceeds" view={lotView}>Proceeds</SortHeader>
                <SortHeader col="term" view={lotView} align="center">Term</SortHeader>
                <SortHeader col="gain" view={lotView}>Gain</SortHeader>
              </Tr>
            </thead>
            <PagedTableBody rows={lotRows} columns={LOT_COLS.length} resetKey={JSON.stringify(lotView.sort)} className="divide-y divide-ink-700/70">
              {(l, i) => (
                <Tr view={lotView} key={`${l.securityKey}-${l.saleDate}-${i}`} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2 text-slate-100"><StockLink securityKey={l.securityKey} name={l.security} /></td>
                  <td className="px-4 py-2 text-[12px] text-slate-400">{l.account}</td>
                  <td className="px-4 py-2 text-right mono text-slate-400 whitespace-nowrap">{l.purchaseDate ? fmtDate(l.purchaseDate) : <AbsentCell reason="the statement does not print a purchase date for this lot" />}</td>
                  <td className="px-4 py-2 text-right mono text-slate-400 whitespace-nowrap">{l.saleDate ? fmtDate(l.saleDate) : <AbsentCell />}</td>
                  <td className="px-4 py-2 text-right mono text-slate-400">{l.daysHeld == null ? <AbsentCell /> : fmtNum(l.daysHeld)}</td>
                  <td className="px-4 py-2 text-right mono text-slate-300">{l.quantity == null ? <AbsentCell /> : fmtNum(Math.round(l.quantity))}</td>
                  <td className="px-4 py-2 text-right mono text-slate-200">{l.saleAmount == null ? <AbsentCell /> : fmtFromBase(l.saleAmount, { compact: true })}</td>
                  <td className="px-4 py-2 text-center">{l.term == null ? <AbsentCell reason="the statement books no gain against this lot" /> : <Pill tone={l.term === "Long" ? "info" : "warn"}>{l.term}</Pill>}</td>
                  <td className={`px-4 py-2 text-right mono ${changeColor(l.gain)}`}>
                    {fmtFromBase(l.gain, { compact: true, sign: true })}
                  </td>
                </Tr>
              )}
            </PagedTableBody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Income & corporate actions ───────────────────────────────────────────────
function IncomeView({ data }: { data: IncomeData | null }) {
  const cashView = useTableView("ledger-cash", CASH_COLS);
  const corpView = useTableView("ledger-corp", CORP_COLS);
  const { fmtFromBase } = usePortfolio();
  if (!data) return <div className="grid h-40 place-items-center text-sm text-slate-500">Reading the dividend statements…</div>;
  if (!data.cash.length && !data.corporate.length) {
    return (
      <AbsentSection what="No income events in this book"
        needs="Cash dividends come from each manager's dividend statement and non-cash actions from its corporate benefits report. No account in this drop issued either." />
    );
  }
  const cashRows = sortRows(data.cash, cashView.sort, {
    security: (r) => r.security,
    account: (r) => r.account,
    date: (r) => r.date,
    qty: (r) => r.quantity,
    rate: (r) => r.ratePerUnit,
    tds: (r) => r.tds,
    net: (r) => r.net,
  });
  const corpRows = sortRows(data.corporate, corpView.sort, {
    security: (r) => r.security,
    account: (r) => r.account,
    action: (r) => r.kind,
    date: (r) => r.date,
    held: (r) => r.quantity,
    entitlement: (r) => r.entitlement,
  });
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

      {/* ONE LINE, THE REST ITS HOVER (Stage 10cp). */}
      <p className="text-xs leading-relaxed text-slate-500"
        title={`Where both list the same cash event it is counted once, on the dividend statement's figures. Preferring one report wholesale would silently drop every bonus and split.${data.accountsWithout.length > 0 ? ` ${data.accountsWithout.join(", ")} issued neither, so nothing they received appears in these totals.` : ""}`}>
        Cash from the dividend statement · non-cash from corporate benefits
      </p>

      {data.cash.length > 0 && (
        <Card title="Cash dividends" pad={false}>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-ink-700 bg-ink-800 text-left">
                <Tr view={cashView}>
                  <SortHeader col="security" view={cashView} align="left">Security</SortHeader>
                  <SortHeader col="account" view={cashView} align="left">Account</SortHeader>
                  <SortHeader col="date" view={cashView}>Ex-date</SortHeader>
                  <SortHeader col="qty" view={cashView}>Quantity</SortHeader>
                  <SortHeader col="rate" view={cashView}>Per unit</SortHeader>
                  <SortHeader col="tds" view={cashView}>TDS</SortHeader>
                  <SortHeader col="net" view={cashView}>Net</SortHeader>
                </Tr>
              </thead>
              <PagedTableBody rows={cashRows} columns={CASH_COLS.length} resetKey={JSON.stringify(cashView.sort)} className="divide-y divide-ink-700/70">
                {(r, i) => (
                  <Tr view={cashView} key={`${r.securityKey}-${r.date}-${i}`} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 text-slate-100"><StockLink securityKey={r.securityKey} name={r.security} /></td>
                    <td className="px-4 py-2 text-[12px] text-slate-400">{r.account}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400 whitespace-nowrap">{r.date ? fmtDate(r.date) : <AbsentCell />}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{r.quantity == null ? <AbsentCell /> : fmtNum(Math.round(r.quantity))}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{r.ratePerUnit == null ? <AbsentCell /> : fmtFromBase(r.ratePerUnit)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{r.tds == null ? <AbsentCell /> : fmtFromBase(r.tds, { compact: true })}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">
                      {r.net == null ? <AbsentCell /> : (
                        fmtFromBase(r.net, { compact: true })
                      )}
                    </td>
                  </Tr>
                )}
              </PagedTableBody>
            </table>
          </div>
        </Card>
      )}

      {data.corporate.length > 0 && (
        <Card title="Corporate actions" subtitle="Bonus, split and rights — an entitlement in shares, never an amount" pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700 text-left">
                <Tr view={corpView}>
                  <SortHeader col="security" view={corpView} align="left">Security</SortHeader>
                  <SortHeader col="account" view={corpView} align="left">Account</SortHeader>
                  <SortHeader col="action" view={corpView} align="left">Action</SortHeader>
                  <SortHeader col="date" view={corpView}>Ex-date</SortHeader>
                  <SortHeader col="held" view={corpView}>Held</SortHeader>
                  <SortHeader col="entitlement" view={corpView} align="left">Entitlement</SortHeader>
                </Tr>
              </thead>
              <PagedTableBody rows={corpRows} columns={CORP_COLS.length} resetKey={JSON.stringify(corpView.sort)} className="divide-y divide-ink-700/70">
                {(r, i) => (
                  <Tr view={corpView} key={`${r.securityKey}-${r.date}-${i}`} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 text-slate-100"><StockLink securityKey={r.securityKey} name={r.security} /></td>
                    <td className="px-4 py-2 text-[12px] text-slate-400">{r.account}</td>
                    <td className="px-4 py-2"><Pill tone="info">{r.kind}</Pill></td>
                    <td className="px-4 py-2 text-right mono text-slate-400 whitespace-nowrap">{r.date ? fmtDate(r.date) : <AbsentCell />}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{r.quantity == null ? <AbsentCell /> : fmtNum(Math.round(r.quantity))}</td>
                    <td className="px-4 py-2 text-[12px] text-slate-300">{r.entitlement ?? <AbsentCell reason="the report prints no ratio for this action" />}</td>
                  </Tr>
                )}
              </PagedTableBody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
