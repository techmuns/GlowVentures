// One statement-basis projection of the canonical book and reconciled ledger.
// Built with every deployment, never maintained as a second portfolio register.
//
// TWO TABS (Stage 10je). The family (29 Oct 2026): *"All I need is just two
// tabs here: one is consolidated view, and the second is transaction level
// view … so that it becomes one single source of truth"*. The 17-tab workbook
// is folded into them:
//
//   Consolidated View  one row per holding (account × security), the security
//                      first, and every mapping the dashboard carries for it as
//                      a column: owner, account, provider, asset class,
//                      category, basket, sector, market side, cost, value,
//                      unrealised / realised / income, FIFO return, XIRR, the
//                      fund commitment, the source document. Unvalued custody
//                      units, review write-offs and accounts with no holding
//                      row are rows too, each with its reason.
//   Transactions       every dated record the archive carries, newest first:
//                      trades, external capital, income and corporate actions
//                      (the cash rows), and the capital-gain statements' sold
//                      and open tax lots (detail rows, which carry no cash flow
//                      so nothing is counted twice).
//
// Full INR throughout, so a reader (or another system) can add the columns.
import { investedOnOf } from "./investedOn";
import { custodyAuditRows } from "./custodyAudit";
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_AS_OF, BOOK_UNVALUED_HOLDINGS,
  BOOK_COMMITMENTS, BOOK_CAPITAL_MOVES, BOOK_POSITION_TRANCHES,
  BOOK_CAPITAL_FROM_INCEPTION, BOOK_REVIEW_FLOWS, BOOK_REVIEW_WRITTEN_OFF, BOOK_SHARE_MOVEMENTS, BOOK_RECOVERED_COSTS, BOOK_POLYCAB,
} from "../data/glowData";
import { dedupedPositions, holdingBucket, bucketLabel, isMandateHeld, MANDATE_BUCKET } from "./analytics";
import { basketKeyOf, familyClassKeyOf } from "./familyTaxonomy";
import { ownerDisplayName, ownerById } from "./owners";
import { securityLabel } from "./securityLabel";
import { readAifCategory } from "./aifCategory";
import { isIncomeBucket } from "./ledgerModel";
import { buildDatedCapital } from "./datedCapital";
import { capitalMovesWithCalls } from "./tranches";
import { fifoTotals } from "./fifo";
import { deriveTransactions, deriveRealisedLots, deriveIncome, type ArchiveDoc } from "./ledgerModel";
import { isAssetClass, type Account, type Position } from "./types";

export type ConsolidatedCell = string | number | null;
export type ConsolidatedColumn = { key: string; label: string; format: string; width: number };
export type ConsolidatedLink = { sheet?: string; find?: string; where?: Record<string, string>; row?: number; file?: string; record?: string; field?: string; isin?: string };
export type ConsolidatedRow = { values: ConsolidatedCell[]; kind?: "group" | "total"; links?: Record<string, ConsolidatedLink> };
export type ConsolidatedTab = { name: string; note: string; columns: ConsolidatedColumn[]; rows: ConsolidatedRow[] };
export type ConsolidatedBook = { client: string; asOf: string; totalValue: number; documents: number; tabs: ConsolidatedTab[] };
type RecordRow = Record<string, ConsolidatedCell>;
type TaxEvidence = { priceOn31Jan2018?: number | null; effectiveCost?: number | null; effectiveLongTerm?: number | null };

export const CONSOLIDATED_VIEW = "Consolidated View";
export const TRANSACTIONS = "Transactions";

const MONEY = "#,##0.00;[Red]-#,##0.00", PCT = "0.0%;[Red]-0.0%", QTY = "#,##0.000;[Red]-#,##0.000",
  RATE = "#,##0.0000;[Red]-#,##0.0000", DATE = "dd-mmm-yyyy", COUNT = "#,##0";
const col = (key: string, label: string, format = "", width = 18): ConsolidatedColumn => ({ key, label, format, width });
const money = (key: string, label: string) => col(key, label, MONEY, 16);
const pct = (key: string, label: string) => col(key, label, PCT, 11);
const date = (key: string, label: string) => col(key, label, DATE, 12);
const ratio = (n: number | null | undefined, d: number | null | undefined) => n != null && d != null && d > 0 ? n / d : null;
const dates = (xs: (string | null | undefined)[]) => xs.filter((d): d is string => !!d).sort();
const fiscalYear = (d: string | null) => {
  if (!d) return null;
  const y = Number(d.slice(0, 4)) - (Number(d.slice(5, 7)) < 4 ? 1 : 0);
  return `FY ${y}-${String(y + 1).slice(-2)}`;
};
const mask = (v: string) => v.length > 4 ? `XXXX${v.slice(-4)}` : v;
const yn = (b: boolean) => b ? "Y" : "N";
const sideLabel = (s: Position["marketSide"]) => s === "listed" ? "Listed" : s === "private" ? "Private" : null;
const reviewNote = "Family consolidated review (MOPWM), 30-Jun-2026";

const VIEW_COLUMNS: ConsolidatedColumn[] = [
  col("name", "Security", "", 34), col("printed", "Name as printed on statement", "", 28), col("sec", "Security ID", "", 28), col("isin", "ISIN", "", 14), col("symbol", "NSE symbol", "", 12),
  col("ent", "Owner / entity", "", 20), col("enttype", "Entity type", "", 12), col("acct", "Account ID", "", 24), col("acno", "Account / folio no. (masked)", "", 14),
  col("provider", "Platform / provider", "", 24), col("custodian", "Custodian", "", 18), col("engagement", "Account type", "", 12), col("strategy", "Strategy / scheme", "", 24),
  col("ac", "Asset class", "", 12), col("cat", "Category", "", 18), col("basket", "Basket", "", 18), col("instrument", "Instrument type (statement)", "", 14),
  col("side", "Listed / private", "", 10), col("aif", "SEBI AIF category", "", 12), col("sector", "Sector", "", 18), col("psector", "Sector as printed", "", 18),
  date("first", "First investment date"), date("last", "Last investment date"), date("stmt", "Valuation date"), date("acctasof", "Account statement date"),
  col("qty", "Quantity / units", QTY, 14), money("avg", "Average cost (₹ per unit)"), money("cost", "Invested cost of units held (₹)"), money("costsold", "Cost of units sold (₹)"),
  col("price", "Price (₹ per unit)", RATE, 14), col("basis", "Valuation basis", "", 14), money("mv", "Market value (₹)"), pct("alloc", "Allocation (% of family total)"),
  money("ugain", "Unrealised P&L (₹)"), money("rgain", "Realised P&L (₹)"), money("income", "Dividend / interest received (₹)"), money("accrued", "Accrued income (₹)"),
  money("tgain", "Total gain: unrealised + realised + income (₹)"), money("deployed", "Capital deployed: cost held + cost sold (₹)"), pct("absret", "Absolute return (%)"),
  pct("xirr", "XIRR (% a year)"), col("shown", "Return measure", "", 12), money("stcost", "Short-term cost held (₹)"), money("ltcost", "Long-term cost held (₹)"),
  col("daystolt", "Days until next lot turns long-term", COUNT, 10),
  money("comm", "Commitment (₹)"), money("called", "Called to date (₹)"), money("paid", "Paid in to date (₹)"), money("dist", "Distributions received (₹)"),
  money("uncalled", "Uncalled commitment (₹)"), money("unpaid", "Called, not yet paid (₹)"), col("dpi", "DPI (x)", "0.00", 8), col("tvpi", "TVPI (x)", "0.00", 8),
  date("commasof", "Commitment statement date"),
  col("txns", "Transactions on file", COUNT, 10), col("counted", "Counted in family total (Y/N)", "", 10), col("dup", "Also reported under", "", 22),
  col("src", "Source document", "", 30), col("notes", "Notes", "", 48), col("check", "Row check", "", 22), col("hid", "Row ID", "", 8),
];
const TXN_COLUMNS: ConsolidatedColumn[] = [
  date("date", "Date"), col("name", "Security", "", 30), col("sec", "Security ID", "", 28), col("isin", "ISIN", "", 14),
  col("ent", "Owner / entity", "", 20), col("acct", "Account ID", "", 24), col("provider", "Platform / provider", "", 22),
  col("ac", "Asset class", "", 12), col("cat", "Category", "", 18), col("basket", "Basket", "", 18), col("sector", "Sector", "", 16),
  col("record", "Record", "", 16), col("type", "Type (as printed)", "", 16), col("counts", "Counts as", "", 14),
  col("qty", "Quantity / units", QTY, 14), col("price", "Price (₹ per unit)", RATE, 14), money("gross", "Gross amount (₹)"), money("chg", "Charges / TDS (₹)"),
  money("net", "Net cash flow to family (₹)"),
  date("pdate", "Lot purchase date"), money("pamt", "Lot purchase amount (₹)"), date("sdate", "Lot sale date"), money("samt", "Lot sale amount (₹)"),
  col("days", "Days held", COUNT, 9), col("term", "Term", "", 8), money("rgain", "Realised gain (₹)"), money("st", "Short-term gain (₹)"), money("lt", "Long-term gain (₹)"),
  col("gf", "FMV on 31-Jan-2018 (₹ per unit)", RATE, 14), money("taxcost", "Tax-effective cost (₹)"), money("taxlt", "Taxable long-term gain (₹)"), col("fy", "Financial year", "", 10),
  col("src", "Source document", "", 30), col("notes", "Notes", "", 44), col("check", "Row check", "", 18), col("tid", "Row ID", "", 8),
];

export function buildConsolidatedSheet(docs: ArchiveDoc[], input: { accounts: Account[]; positions: Position[]; asOf: string } = {
  accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, asOf: BOOK_AS_OF,
}): ConsolidatedBook {
  const { accounts, positions, asOf } = input;
  const accountById = new Map(accounts.map(a => [a.accountId, a]));
  const accountBySource = new Map(accounts.map(a => [`${a.provider}|${a.accountNo}`, a]));
  const docById = new Map(docs.map(d => [d.docKey, d]));
  const sourceAccount = (source: string) => {
    const d = docById.get(source);
    return d ? accountBySource.get(`${d.provider}|${d.accountNo}`) : undefined;
  };
  const rows = dedupedPositions(positions);
  const totalValue = rows.reduce((s, p) => s + p.marketValue, 0);
  const classify = (p: Pick<Position, "accountId" | "securityKey" | "assetClass"> & Partial<Position>) => {
    const a = accountById.get(p.accountId), mandate = isMandateHeld(a?.engagement);
    return { ac: familyClassKeyOf(p, mandate), cat: bucketLabel(holdingBucket(p, a?.engagement)), basket: basketKeyOf(p, mandate) };
  };
  const positionOf = (acct: string | null | undefined, sec: string | null | undefined) =>
    acct && sec ? positions.find(p => p.accountId === acct && p.securityKey === sec) : undefined;
  // What a dated record files under: its holding's mapping where the book holds
  // it, otherwise only what the statement itself named.
  const mapping = (acct: string | null | undefined, sec: string | null | undefined, stated: string | null = null) => {
    // An exited security has no holding left, so it is classified as one would
    // be from the class its own statements stated, in its own account.
    const p = positionOf(acct, sec);
    const c = p ? classify(p) : acct && sec && isAssetClass(stated) ? classify({ accountId: acct, securityKey: sec, assetClass: stated }) : null;
    // A mandate's every record is the mandate's, whatever it is in (`holdingBucket`).
    const mandate = acct && isMandateHeld(accountById.get(acct)?.engagement) ? MANDATE_BUCKET : null;
    return { ac: c?.ac ?? null, cat: c?.cat ?? mandate ?? stated, basket: c?.basket ?? null, sector: p?.sector ?? null, isin: p?.isin ?? null };
  };
  const accountCols = (a: Account | undefined) => ({ acct: a?.accountId ?? null, ent: a ? ownerDisplayName(a.ownerId) : null, provider: a?.provider ?? null });
  const txns = deriveTransactions(docs), realised = deriveRealisedLots(docs), income = deriveIncome(docs);
  const dated = buildDatedCapital({ moves: BOOK_CAPITAL_MOVES, commitments: BOOK_COMMITMENTS, accounts, positions,
    tranches: BOOK_POSITION_TRANCHES, fromInception: BOOK_CAPITAL_FROM_INCEPTION, reviewFlows: BOOK_REVIEW_FLOWS });
  const movements = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, accounts, BOOK_REVIEW_FLOWS);

  // ── TRANSACTIONS ──────────────────────────────────────────────────────────
  const transactions: RecordRow[] = [];
  for (const t of txns.txns) {
    const a = accountBySource.get(`${t.provider}|${t.accountNo}`);
    const raw = docs.filter(d => d.provider === t.provider && d.accountNo === t.accountNo)
      .sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))
      .flatMap(d => (d.transactions ?? []).map(row => ({ d, row })))
      .find(({ row }) => row.securityKey === t.securityKey && row.date === t.date && row.quantity === t.qty && row.side === t.side.toLowerCase()
        && (row.printed?.settlementAmount ?? row.net ?? row.gross ?? null) === t.amount);
    const m = mapping(a?.accountId, t.securityKey, t.assetClass);
    transactions.push({ date: t.date, ...accountCols(a), sec: t.securityKey, name: securityLabel(t.securityKey, t.security), ...m, isin: t.isin ?? m.isin,
      record: "Trade", type: t.side, counts: "Internal trade",
      qty: raw ? raw.row.quantity : t.qty || null, price: t.price, gross: raw?.row.gross ?? null, chg: raw?.row.charges ?? null,
      net: t.amount == null ? null : t.amount * (t.side === "Buy" ? -1 : 1),
      // The realised gain of a sale is its capital-gain lots' (`realizedBasis`
      // "lot" / "sibling"); it sits on those lot rows below, counted once.
      notes: `Manager dealing, separate from external family capital. Net is the source settlement amount.${t.side !== "Sell" ? ""
        : t.realizedBasis === "lot" || t.realizedBasis === "sibling" ? " Realised gain is on this sale's tax-lot rows." : t.realizedNote ? ` Realised gain: ${t.realizedNote}.` : ""}`,
      check: a ? "OK" : "Account join missing", src: raw?.d.docKey ?? null, _source: raw?.d.docKey ?? null });
  }
  // An account-level capital record (a fund's payout, a call) belongs to the
  // account's one holding where it holds exactly one. Never a PMS mandate's:
  // its capital is the whole account's, whatever single line is left in it.
  const soleSecurity = (acct: string) => {
    const keys = new Set(positions.filter(p => p.accountId === acct).map(p => p.securityKey));
    return keys.size === 1 && !isMandateHeld(accountById.get(acct)?.engagement) ? [...keys][0] : null;
  };
  for (const mv of movements) {
    const a = accountById.get(mv.accountId), sec = mv.securityKey ?? soleSecurity(mv.accountId), m = mapping(mv.accountId, sec, a?.engagement ?? null);
    const held = sec ? positionOf(mv.accountId, sec) : undefined;
    transactions.push({ date: mv.date, ...accountCols(a), acct: mv.accountId, sec,
      name: sec ? securityLabel(sec, mv.security ?? held?.security ?? sec) : mv.security ?? a?.strategy ?? a?.provider ?? null, ...m,
      record: "Capital flow", type: mv.label,
      counts: mv.payoutKind === "income" || mv.payoutKind === "equalisation" ? "Income" : mv.direction === "in" ? "Investment" : "Divestment",
      qty: mv.units, gross: mv.amount, chg: mv.charges ?? null, net: mv.amount == null ? null : mv.amount * (mv.direction === "in" ? -1 : 1),
      notes: [mv.fromReview ? reviewNote : mv.fromCall ? "Reconciled call schedule; this is a call, not proof of payment" : "External capital record",
        !mv.securityKey && sec ? "Account-level record; the account holds only this security" : null].filter(Boolean).join("; "),
      src: mv.fromReview ? reviewNote : null, check: mv.amount == null ? "Amount not reported" : "OK" });
  }
  for (const e of [...income.cash, ...income.corporate]) {
    const a = sourceAccount(e.source), sec = isIncomeBucket(e.securityKey) ? null : e.securityKey, cash = income.cash.includes(e);
    transactions.push({ date: e.date, ...accountCols(a), sec, name: e.security, ...mapping(a?.accountId, sec),
      record: cash ? "Income" : "Corporate action", type: e.kind, counts: cash ? "Income" : "Non-cash", qty: e.quantity, price: e.ratePerUnit,
      gross: e.net != null && e.tds != null ? e.net + e.tds : null, chg: e.tds, net: e.net,
      notes: e.entitlement ?? null, src: e.source, check: "Reported event", _source: e.source });
  }
  // SOLD TAX LOTS. Detail of a sale, never a second cash flow: the money moved
  // on the trade row, so a lot carries its purchase and sale in its own columns.
  for (const l of realised.lots) {
    const a = sourceAccount(l.source), m = mapping(a?.accountId, l.securityKey, l.assetClass);
    const candidates = (docById.get(l.source)?.capitalGains ?? []).filter(r => r.purchaseDate === l.purchaseDate && r.saleDate === l.saleDate
      && r.quantity === l.quantity && r.purchaseAmount === l.purchaseAmount && r.saleAmount === l.saleAmount
      && r.shortTerm === l.shortTerm && r.longTerm === l.longTerm);
    const exact = candidates.filter(r => r.securityKey === l.securityKey);
    const matched = exact.length ? exact : candidates;
    const original = matched.length === 1 ? matched[0] : null;
    const tax = original as (NonNullable<ArchiveDoc["capitalGains"]>[number] & TaxEvidence) | null;
    transactions.push({ date: l.saleDate, ...accountCols(a), sec: l.securityKey, name: securityLabel(l.securityKey, l.security), ...m, isin: original?.isin ?? m.isin,
      record: "Tax lot — sold", type: "Sale (capital gain statement)", counts: "Tax detail",
      qty: l.quantity, price: original?.saleRate ?? ratio(l.saleAmount, l.quantity),
      pdate: l.purchaseDate, pamt: l.purchaseAmount, sdate: l.saleDate, samt: l.saleAmount, days: l.daysHeld, term: l.term,
      rgain: l.shortTerm != null || l.longTerm != null ? l.gain : null, st: l.shortTerm, lt: l.longTerm,
      gf: tax?.priceOn31Jan2018 ?? null, taxcost: tax?.effectiveCost ?? null, taxlt: tax?.effectiveLongTerm ?? null, fy: fiscalYear(l.saleDate),
      notes: "Realised FIFO lot as the capital gain statement prints it. Carries no cash flow: the sale's money is on its trade row.",
      src: l.source, check: a ? "Reported realised lot" : "Account join missing", _source: l.source });
  }
  // OPEN TAX LOTS, from each account's newest open-lot register.
  type OpenLot = { securityKey: string; security: string; isin?: string; purchaseDate: string | null; quantity: number | null; unitCost: number | null; totalCost: number | null };
  const latestOpen = new Map<string, ArchiveDoc & { openLots: OpenLot[] }>();
  for (const d of docs as (ArchiveDoc & { openLots?: OpenLot[] })[]) {
    if (!d.openLots?.length) continue;
    const k = `${d.provider}|${d.accountNo}`, old = latestOpen.get(k);
    if (!old || d.asOf > old.asOf) latestOpen.set(k, d as ArchiveDoc & { openLots: OpenLot[] });
  }
  for (const d of latestOpen.values()) for (const l of d.openLots) {
    const a = sourceAccount(d.docKey), p = positionOf(a?.accountId, l.securityKey);
    // The book licenses a lot as part of today's holding only when its own
    // quantity gate accepted this register; an unmatched lot stays, named.
    const supported = !!p && p.stCostBasis != null && p.ltCostBasis != null;
    const m = mapping(a?.accountId, l.securityKey);
    transactions.push({ date: l.purchaseDate, ...accountCols(a), sec: l.securityKey, name: securityLabel(l.securityKey, l.security), ...m, isin: l.isin ?? m.isin,
      record: "Tax lot — open", type: "Purchase lot (open-lot register)", counts: "Tax detail",
      qty: l.quantity, price: l.unitCost, pdate: l.purchaseDate, pamt: l.totalCost,
      notes: `Open register at ${d.asOf}. ${supported ? "Units reconcile to the holding." : "Register does not reconcile to the current holding; kept as history."} Carries no cash flow.`,
      src: d.docKey, check: supported ? "Quantity reconciles" : "Historical lot", _source: d.docKey });
  }
  // NEWEST FIRST; an undated record last, never placed on a guessed date.
  transactions.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  transactions.forEach((t, i) => { t.tid = `T${i + 1}`; });
  const txnCount = new Map<string, number>();
  for (const t of transactions) if (t.acct && t.sec) txnCount.set(`${t.acct}|${t.sec}`, (txnCount.get(`${t.acct}|${t.sec}`) ?? 0) + 1);

  // ── CONSOLIDATED VIEW ─────────────────────────────────────────────────────
  const owner = (a: Account | undefined) => a ? { ent: ownerDisplayName(a.ownerId), enttype: ownerById(a.ownerId ?? "")?.kind ?? null } : { ent: null, enttype: null };
  const accountMeta = (a: Account | undefined) => a ? { acct: a.accountId, acno: mask(a.accountNo), provider: a.provider, custodian: a.custodian ?? null,
    engagement: a.reviewHolder ? "Review holder" : a.engagement, strategy: a.strategy, acctasof: a.asOf, ...owner(a) } : {};
  const commitment = (acct: string, sec: string): RecordRow => {
    // A commitment is the account's; it rides its holding row only where the
    // account holds that one security, so it is never repeated across rows.
    const own = positions.filter(p => p.accountId === acct);
    const c = own.length && own.every(p => p.securityKey === sec) ? BOOK_COMMITMENTS.find(c => c.accountId === acct) : undefined;
    if (!c) return {};
    const a = accountById.get(acct), ps = rows.filter(p => p.accountId === acct);
    // A review-held value has a different date and basis from a fund statement's
    // commitment. Keep the value, but never combine it into an invented multiple.
    const value = ps.length ? ps.reduce((s, p) => s + p.marketValue, 0) : null;
    const sameBasis = ps.length > 0 && ps.every(p => !p.review && (p.priceAsOf ?? a?.asOf) === c.asOf);
    // TVPI ADDS DISTRIBUTIONS TO A VALUE STRUCK ON ONE DATE, so only the ones
    // paid by that date (Stage 10fz): a payout after the NAV date is inside the
    // NAV. With no dated payout record a distribution cannot be placed before
    // the value, and the multiple is withheld.
    const after = (c.payouts ?? []).filter(x => x.inPrintedTotal && x.kind !== "equalisation" && c.asOf != null && x.date > c.asOf);
    const distToValue = c.distributed == null ? null : c.distributed === 0 ? 0 : c.payouts == null ? null
      : c.distributed - after.reduce((s, x) => s + x.gross, 0);
    const tvpiWhy = !sameBasis ? "TVPI withheld: the current value has a different basis or date from the commitment statement"
      : c.distributed != null && c.distributed !== 0 && c.payouts == null ? "TVPI withheld: the distributions carry no dated record to place them before the valuation"
      : after.length ? `TVPI counts the distributions paid by ${c.asOf}, not the ${after.length} paid after it (${after.map(x => x.date).join(", ")})` : null;
    return { comm: c.committed, called: c.called, paid: c.paid, dist: c.distributed, uncalled: c.undrawn, unpaid: c.pending, commasof: c.asOf,
      dpi: ratio(c.distributed, c.paid), tvpi: sameBasis && value != null && distToValue != null ? ratio(value + distToValue, c.paid) : null,
      _commnote: [tvpiWhy, c.arithmeticHolds === false ? "Statement commitment arithmetic differs" : null].filter(Boolean).join("; ") || null };
  };
  // The other rows a duplicated holding is reported on, by account.
  const groups = new Map<string, Position[]>();
  for (const p of positions) if (p.dedupeGroup) groups.set(p.dedupeGroup, [...(groups.get(p.dedupeGroup) ?? []), p]);
  const view: RecordRow[] = positions.map((p, i) => {
    const a = accountById.get(p.accountId), c = classify(p);
    const tranche = BOOK_POSITION_TRANCHES[`${p.accountId}|${p.securityKey}`];
    const purchaseDates = dates(tranche?.moves.map(m => m.date) ?? []);
    // EVERY DATE THAT DATES THE HOLDING (Stage 10fw): allotments, a lot register,
    // its own dated trades, a drawdown call, the review — the holdings tables' one rule.
    const invested = investedOnOf([p]);
    const capital = dated.behind([p], positions);
    const xirr = capital?.dated && capital.days >= 365 && capital.annualPct != null ? capital.annualPct / 100 : null;
    // The holding's FIFO return — unrealised, realised and the income it paid,
    // over every rupee that bought a unit (Stage 10fb) — never unrealised ÷ cost.
    const fifo = !p.valuedAtCost && p.costBasis != null && !p.costUnavailable ? fifoTotals([p]) : null;
    // The builder retained its actual selected row. Equal values in two
    // statements are not evidence that either one supplied this field.
    const source = p.statementRecord ? docById.get(p.statementRecord.document) : undefined;
    const counted = rows.includes(p);
    const check = !counted ? "Duplicate reporting: excluded from family total" : p.valuedAtCost ? "Held at cost; no measured gain"
      : p.costBasis == null ? "Cost not reported" : "OK";
    const twins = (p.dedupeGroup ? groups.get(p.dedupeGroup) ?? [] : []).filter(q => q !== p).map(q => q.accountId);
    const fund = commitment(p.accountId, p.securityKey);
    const notes = [p.review ? p.reviewNote ?? "" : "",
      !invested ? "Purchase dates not reported" : "",
      xirr == null ? capital?.dated ? "History under one year: XIRR withheld" : capital?.reason ?? "No complete dated capital record for this holding" : "",
      p.valuedAtCost ? "Value is recorded cost, not a market valuation" : "",
      p.hprUnavailableReason ?? "",
      String(fund._commnote ?? ""),
      !counted ? `Counted once, on ${twins.join(", ") || p.alsoReportedUnder?.join(", ") || p.dedupeGroup}` : ""].filter(Boolean).join("; ");
    const aif = p.assetClass === "AIF" || a?.engagement === "AIF" ? readAifCategory(p, a).category : null;
    return { hid: `H${String(i + 1).padStart(4, "0")}`, name: securityLabel(p.securityKey, p.security), printed: p.security, sec: p.securityKey,
      isin: p.isin ?? null, symbol: p.symbol ?? null, ...accountMeta(a), ...c, instrument: p.assetClass, side: sideLabel(p.marketSide), aif,
      sector: p.sector || null, psector: p.providerSector ?? null,
      first: invested?.first ?? null, last: invested && invested.last !== invested.first ? invested.last : purchaseDates.at(-1) ?? null,
      stmt: p.priceAsOf ?? a?.asOf ?? null, qty: p.quantity, avg: p.avgCost, cost: p.costBasis, costsold: p.costOfUnitsSold ?? null,
      price: p.currentPrice, basis: p.valuedAtCost ? "At cost" : p.review ? "Review value" : "Statement value", mv: p.marketValue,
      alloc: counted ? ratio(p.marketValue, totalValue) : null,
      ugain: p.valuedAtCost ? null : p.unrealizedPnL, rgain: p.realizedPnL ?? null, income: p.dividendReceived, accrued: p.accruedIncome ?? null,
      tgain: fifo?.gain ?? null, deployed: fifo?.gain != null ? fifo.deployed : null,
      absret: p.valuedAtCost || p.returnPct == null ? null : p.returnPct / 100, xirr,
      shown: xirr != null ? "XIRR" : !p.valuedAtCost && p.returnPct != null ? "Absolute" : null,
      stcost: p.stCostBasis, ltcost: p.ltCostBasis, daystolt: p.daysToLT, ...fund,
      txns: txnCount.get(`${p.accountId}|${p.securityKey}`) ?? 0, counted: yn(counted), dup: twins.length ? [...new Set(twins)].join(", ") : null,
      src: p.review ? reviewNote : source?.docKey ?? null, notes: notes || null, check,
      _source: source?.docKey ?? null, _pointer: p.statementRecord?.pointer ?? null, _isin: p.isin ?? null };
  });
  // Raw custody rows share the account/ISIN/unit reconciliation used by the
  // portfolio. Missing statement prices stay absent and never enter the total.
  const custody = custodyAuditRows({ accounts, positions, unvalued: BOOK_UNVALUED_HOLDINGS,
    movements: BOOK_SHARE_MOVEMENTS, recoveredCosts: BOOK_RECOVERED_COSTS,
    excludedSecurities: new Set(BOOK_POLYCAB.map(p => p.securityKey)) });
  for (const u of custody) {
    const a = accountById.get(u.accountId), cost = u.cost;
    const evidence = cost?.evidence.map(e => `${e.path}, ${e.sheet}, rows ${e.rows.join(", ")}`).join("; ");
    // Classified as a valued holding is, wherever the statement names the instrument.
    const c = u.assetClass ? classify({ accountId: u.accountId, securityKey: u.securityKey, assetClass: u.assetClass }) : {};
    view.push({ hid: `U${view.length + 1}`, name: securityLabel(u.securityKey, u.security), printed: u.security, sec: u.securityKey, isin: u.isin,
      ...accountMeta(a), ...c, instrument: u.assetClass, qty: u.quantity, stmt: u.asOf,
      first: cost?.heldPurchases?.first ?? null, last: cost?.heldPurchases?.last ?? null,
      cost: cost?.costBasis ?? null, avg: cost ? cost.costBasis / cost.quantity : null,
      rgain: cost?.realizedPnL ?? null, income: cost?.dividendReceived ?? null, basis: "No statement value",
      txns: txnCount.get(`${u.accountId}|${u.securityKey}`) ?? 0, counted: "N", src: u.source,
      notes: [u.reason, cost?.hprUnavailableReason, evidence ? `Verified supplementary purchase lots: ${evidence}` : null].filter(Boolean).join("; "),
      check: cost ? "Reconciled custody units and purchase cost; no statement valuation" : "Quantity only; no usable statement valuation",
      _source: u.source });
  }
  for (const w of BOOK_REVIEW_WRITTEN_OFF) view.push({ hid: `W${w.reviewRow}`, name: w.security, printed: w.security, counted: "N", basis: "Written off",
    src: reviewNote, notes: `Private Investments row ${w.reviewRow}: ${w.remark}`, check: "Written off in review; amounts not reported" });
  // An account the book carries with no holding row is still part of the record.
  const held = new Set(view.map(r => r.acct).filter(Boolean));
  for (const a of accounts) if (!held.has(a.accountId)) view.push({ hid: `A${view.length + 1}`, name: `${a.strategy ?? a.provider} — no holding row`,
    ...accountMeta(a), counted: "N", txns: transactions.filter(t => t.acct === a.accountId).length,
    notes: a.noPositionsReason ?? "No holding row on this account's statements", check: "Account carries no holding row" });

  const holdingLinks = (r: RecordRow): Record<string, ConsolidatedLink> => ({
    ...(r._source ? { name: { file: String(r._source), record: r._pointer ? String(r._pointer) : undefined },
      src: { file: String(r._source), record: r._pointer ? String(r._pointer) : undefined } } : {}),
    ...(r._source && r.qty != null ? { qty: { file: String(r._source), record: r._pointer ? String(r._pointer) : undefined, field: "quantity", isin: r._isin ? String(r._isin) : undefined } } : {}),
    ...(r.acct && typeof r.txns === "number" && r.txns > 0 ? { txns: { sheet: TRANSACTIONS, where: r.sec ? { acct: String(r.acct), sec: String(r.sec) } : { acct: String(r.acct) } } } : {}),
  });
  const viewKeys = new Set(view.filter(r => r.acct && r.sec).map(r => `${r.acct}|${r.sec}`));
  const txnLinks = (r: RecordRow): Record<string, ConsolidatedLink> => ({
    ...(r.acct && r.sec && viewKeys.has(`${r.acct}|${r.sec}`) ? { name: { sheet: CONSOLIDATED_VIEW, where: { acct: String(r.acct), sec: String(r.sec) } } } : {}),
    ...(r._source ? { src: { file: String(r._source) } } : {}),
  });
  const tab = (name: string, note: string, columns: ConsolidatedColumn[], records: RecordRow[], links: (r: RecordRow) => Record<string, ConsolidatedLink>): ConsolidatedTab =>
    ({ name, note, columns, rows: records.map(r => ({ values: columns.map(c => r[c.key] ?? null), links: links(r) })) });
  const crore = (n: number) => `₹${(n / 1e7).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
  const counted = view.filter(r => r.counted === "Y").length;
  return { client: "Glow Ventures", asOf, totalValue, documents: docs.length, tabs: [
    tab(CONSOLIDATED_VIEW, `One row per holding, full ₹, statement and review marks on each account's own date (newest ${asOf}). `
      + `Market value over the ${counted} rows counted in the family total adds to ${crore(totalValue)}; a holding two statements report is kept on both rows and counted once. `
      + "Absolute return is FIFO: unrealised + realised + income over capital deployed. Blank means the source does not report it.",
      VIEW_COLUMNS, view, holdingLinks),
    tab(TRANSACTIONS, `Every dated record on file, newest first: ${transactions.filter(t => !String(t.record).startsWith("Tax lot")).length} trades, capital flows and income rows, `
      + `and ${transactions.filter(t => String(t.record).startsWith("Tax lot")).length} tax-lot rows from capital-gain statements. Tax lots carry no cash flow and trades carry no realised gain, so neither is counted twice. `
      + "Internal trades are manager dealing, not family capital. A capital call is not proof of payment.",
      TXN_COLUMNS, transactions, txnLinks),
  ] };
}
