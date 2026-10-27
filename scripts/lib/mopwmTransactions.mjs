// THE ADVISER'S TRANSACTION REPORT — Motilal Oswal Private Wealth's family-wide
// record of dated trades, generated 23 Oct 2026 and sent by the client on 27 Oct
// (`ANKITA_JAISINGHANI_FAMILY_23Oct2026131535.xlsx`, Stage 10hu). Five tabs:
// Direct Equity (exchange trades with their settlement reference), Mutual Funds
// (every folio's purchases, redemptions, switches and reinvestments, the folio
// of a demat-held scheme being the demat client ID), PMS_AIF_SP (capital in and
// out of each PMS/AIF folio), Fixed Income and Derivative.
//
// LIKE THE CONSOLIDATED REVIEW, IT IS NOT A STATEMENT. No custodian or fund
// struck it; it is the adviser's own compilation of what it recorded, and it
// carries no holding, no valuation and no ISIN. `extract.mjs` archives it held
// out by decision. Its one licensed use is the 21 Oct 2026 cost-recovery
// instruction (`recoverHoldingCosts.mjs`): a holding whose statement prints no
// cost takes the cost of the lots these rows leave ONLY where the owner, the
// security (an exact alias below), the account and every unit reconcile on the
// statement's own date. It never changes a quantity, a valuation or a date.
//
// Columns are found by HEADER TEXT, never by position; a holder heading is a row
// whose only cell is the holder's name. Rows of people the owner registry does
// not know (the family's mutual-fund group carries nine) are read and counted,
// never attributed to anyone.
import fs from "node:fs";
import path from "node:path";
import { readSpreadsheet, findHeader } from "../ingest/lib/sheet.mjs";
import { ownerIdFor } from "../../shared/owners.mjs";
import { fifoLedger, UNIT_TIE } from "../../shared/fifo.mjs";
import { num } from "./reviewPrivateRead.mjs";

export const MOPWM_TRANSACTIONS = "source/october-2026-e/ANKITA_JAISINGHANI_FAMILY_23Oct2026131535.xlsx";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** `22-Sep-2021` → `2021-09-22`; anything else is null. */
export function dmyToIso(cell) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(cell ?? "").trim());
  const mo = m && MONTHS[m[2].toLowerCase()];
  if (!mo || Number(m[1]) < 1 || Number(m[1]) > 31) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** The report's own generation stamp, which its generator writes into the file name. */
export function reportDate(file = MOPWM_TRANSACTIONS) {
  const m = /_(\d{2})([A-Za-z]{3})(\d{4})\d{6}\.xlsx$/.exec(path.basename(file));
  const iso = m && dmyToIso(`${m[1]}-${m[2]}-${m[3]}`);
  if (!iso) throw new Error(`MOPWM transaction report: no generation date in "${file}"`);
  return iso;
}

const COLS = {
  security: [/^scheme scrip name$/], folio: [/^folio number$/], asset: [/^asset$/],
  date: [/^transaction date$/], type: [/^transaction type$/], subType: [/^transaction sub type$/],
  price: [/^transaction price$/], qty: [/^transaction qty$/, /^transaction unit s$/],
  amount: [/^transaction amt$/], ref: [/^description$/, /^tran desc$/],
};
/** Each tab and the columns it cannot be read without. */
export const TABS = Object.freeze({
  "Direct Equity": ["security", "date", "type", "price", "qty", "amount", "ref"],
  "Mutual Funds": ["security", "folio", "date", "type", "subType", "price", "qty", "amount"],
  "PMS_AIF_SP": ["security", "folio", "asset", "date", "type", "price", "amount"],
  "Fixed Income": ["security", "date", "type", "price", "qty", "amount", "ref"],
  "Derivative": ["security", "date", "type", "price", "qty", "amount"],
});
/** A heading naming a market segment (the Derivative tab's `COMMODITIES`), not a holder. */
const SEGMENT = /^(commodities|currency|equity|interest rate)$/i;

/** Every row of every tab, with its Excel row and its holder. Throws rather than guesses. */
export function readMopwmTransactions(wb) {
  const rows = [], tabs = [];
  for (const [name, required] of Object.entries(TABS)) {
    const s = wb.sheets.find((x) => x.name.trim() === name);
    if (!s) throw new Error(`MOPWM transaction report: no "${name}" tab`);
    const want = Object.fromEntries(required.map((k) => [k, COLS[k]]));
    const h = findHeader(s.rows, want, { minFields: required.length, require: required });
    if (!h) throw new Error(`MOPWM transaction report: ${name} has no header carrying ${required.join(", ")}`);
    let holder = null, segment = null, read = 0;
    for (let i = h.headerRow + 1; i < s.rows.length; i++) {
      const cells = (s.rows[i] ?? []).map((c) => String(c ?? "").trim());
      const filled = cells.filter(Boolean);
      if (!filled.length) continue;
      const at = (k) => cells[h.columns[k]] ?? "";
      if (filled.length === 1 && cells[0]) {
        if (SEGMENT.test(cells[0])) { segment = cells[0]; holder = null; } else holder = cells[0];
        continue;
      }
      const where = `${name} row ${i + 1}`;
      const date = dmyToIso(at("date"));
      if (!holder) throw new Error(`MOPWM transaction report: ${where} sits under no holder`);
      if (!at("security") || !date || !at("type")) throw new Error(`MOPWM transaction report: ${where} has no security, date or type`);
      const number = (k) => {
        if (!(k in h.columns) || at(k) === "") return null;
        const v = num(at(k));
        if (v === null) throw new Error(`MOPWM transaction report: ${where} ${k} "${at(k)}" is not a number`);
        return v;
      };
      rows.push({
        sheet: name, row: i + 1, holder, ownerId: ownerIdFor(holder.replace(/^M\/S\.?\s+/i, "")),
        ...(segment ? { segment } : {}),
        security: at("security"), folio: "folio" in h.columns ? at("folio") || null : null,
        asset: "asset" in h.columns ? at("asset") || null : null,
        date, type: at("type"), subType: "subType" in h.columns ? at("subType") || null : null,
        price: number("price"), qty: number("qty"), amount: number("amount"),
        ref: "ref" in h.columns ? at("ref") || null : null,
      });
      read++;
    }
    tabs.push({ name, header: h.headerRow + 1, rows: read });
  }
  return { tabs, rows };
}

export function loadMopwmTransactions(root = ".", file = MOPWM_TRANSACTIONS) {
  const wb = readSpreadsheet(fs.readFileSync(path.join(root, file)));
  if (wb.error) throw new Error(`MOPWM transaction report: ${wb.error}`);
  return { path: file, asOf: reportDate(file), ...readMopwmTransactions(wb) };
}

/**
 * Identity aliases, not cost overrides: the name this report gives each ISIN a
 * statement prints. A fund's name carries its plan and option ("Direct-G"), so
 * an alias pins exactly one ISIN. Nothing else — no amount, quantity or date —
 * is kept here.
 */
export const MOPWM_SECURITIES = Object.freeze({
  INE036D01028: "Karur Vysya Bank Ltd", INE062A01020: "State Bank of India",
  INE090A01021: "ICICI Bank Ltd", INE095A01012: "IndusInd Bank Ltd",
  INE171A01029: "Federal Bank Ltd", INE238A01034: "Axis Bank Ltd",
  INE491A01021: "City Union Bank Ltd", INE562A01011: "Indian Bank",
  INE918Z01012: "Kaynes Technology India Ltd", INE976G01028: "RBL Bank Ltd",
  INE1CDF01017: "Vedanta Aluminium Metal Ltd", INE531F01023: "Nuvama Wealth Management Ltd",
  INE0LGX01024: "Insolation Energy Ltd",
  INF174K01LC6: "Kotak Arbitrage Direct-G", INF247L01ED1: "Motilal Oswal Arbitrage Direct-G",
  INF194K01V89: "Bandhan Large AND Mid Cap Direct-G", INF194K01Y60: "Bandhan Arbitrage Direct-G",
  INF179K01830: "HDFC Balanced Advantage Reg-G", INF179K01WA6: "HDFC Balanced Advantage Direct-G",
  INF209K01VA3: "Aditya Birla SL Liquid Direct-G", INF109K012M7: "ICICI Pru Nifty 50 Index Direct-G",
  INF109K01Y80: "ICICI Pru Nifty Next 50 Index Direct-G", INF769K01AX2: "Mirae Asset Large Cap Direct-G",
  INF174K01NH1: "Kotak Liquid Direct-IDCWD Reinvestment",
});

/** An exchange settlement reference (`NSE/M/121/D`): a priced trade, not a book entry. */
const EXCHANGE = /^(NSE|BSE)\//;
const FUND_BUY = new Set(["Purchase", "Switch In", "Div Reinvest"]);
const FUND_SELL = new Set(["Redemption", "Switch Out"]);
const r2 = (v) => Math.round(v * 100) / 100;

/** One row as a FIFO event, or the reason it cannot be one. */
function eventOf(r, isin) {
  let kind = null;
  if (r.sheet === "Direct Equity") {
    if (!EXCHANGE.test(r.ref ?? "")) return { reason: `row ${r.row} (${r.date}) is a ${String(r.ref ?? "").split("/")[0].trim() || "non-exchange"} entry, not a trade; its original lots are not mapped` };
    kind = r.type === "PURCHASE" ? "buy" : r.type === "SELL" ? "sell" : null;
  } else if (r.sheet === "Mutual Funds") {
    kind = r.type === "Buy" && FUND_BUY.has(r.subType) ? "buy" : r.type === "Sell" && FUND_SELL.has(r.subType) ? "sell" : null;
  }
  if (!kind) return { reason: `row ${r.row} (${r.date}): unsupported transaction ${[r.type, r.subType].filter(Boolean).join(" / ")}` };
  if (!(r.qty > 0) || !(r.amount > 0)) return { reason: `row ${r.row} (${r.date}) has no positive units and amount` };
  // A fund purchase's amount includes the 0.005% stamp duty its units exclude.
  if (r.price !== null && Math.abs(r.amount - r.qty * r.price) > Math.max(1, r.amount * 0.0001))
    return { reason: `row ${r.row} (${r.date}): units × price does not tie to the amount` };
  return { event: { date: r.date, kind, cls: isin, units: r.qty, amount: r.amount } };
}

/**
 * Replay one identity's rows to the statement's date. The lots left must hold
 * EXACTLY the units the statement records; every row on or before that date
 * must be a priced trade. Later sales are counted, never applied.
 */
export function replayMopwmRows(rows, { isin, asOf, quantity }) {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);
  const events = [];
  for (const r of ordered.filter((x) => x.date <= asOf)) {
    const e = eventOf(r, isin);
    if (e.reason) return { reason: e.reason };
    events.push(e.event);
  }
  if (!events.some((e) => e.kind === "buy")) return { reason: "no purchase lots on or before the statement date" };
  const ledger = fifoLedger(events);
  if (ledger.shortfalls.length) return { reason: "a sale consumes units not covered by recorded purchases" };
  if (Math.abs(ledger.unitsHeld - quantity) > UNIT_TIE)
    return { reason: `FIFO holds ${Math.round(ledger.unitsHeld * 1000) / 1000} units; custodian records ${quantity}` };
  const heldDates = ledger.lots.filter((l) => l.units > UNIT_TIE).map((l) => l.date).sort();
  const later = ordered.filter((r) => r.date > asOf && /^(SELL|Sell)$/.test(r.type));
  return {
    costBasis: r2(ledger.costHeld), realizedPnL: r2(ledger.realisedGain), costOfUnitsSold: r2(ledger.costSold),
    ...(heldDates.length ? { heldPurchases: { first: heldDates[0], last: heldDates.at(-1), lots: heldDates.length } } : {}),
    // The report carries no cash dividends: unreported, never a measured zero.
    dividendReceived: null,
    rows: ordered.filter((r) => r.date <= asOf).map((r) => r.row),
    ...(later.length ? { salesAfter: later.length, salesAfterRows: later.map((r) => r.row) } : {}),
  };
}

/**
 * A HOLDING SOLD TO NIL AFTER ITS STATEMENT — the one use of the report's later
 * sales, and only for a holding the family confirmed exiting
 * (`shared/confirmedExits.mjs`, Stage 10ib). The rows must first reconcile the
 * statement's own units on its own date (`replayMopwmRows`); every row after it
 * must then be a priced exchange trade, and together they must leave exactly
 * nil. The report prints no closing balance, so nothing short of nil is ever
 * applied: a holding partly sold stays at the statement's quantity.
 */
export function exitAfterStatement(rows, { isin, asOf, quantity }) {
  const held = replayMopwmRows(rows, { isin, asOf, quantity });
  if (held.reason) return { reason: `the report does not reconcile the statement's ${quantity} units on ${asOf}: ${held.reason}` };
  const later = rows.filter((r) => r.date > asOf).sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);
  if (!later.length) return { reason: `the report records no trade after ${asOf}` };
  let units = quantity, sold = 0;
  for (const r of later) {
    const e = eventOf(r, isin);
    if (e.reason) return { reason: e.reason };
    if (e.event.kind === "sell") sold += e.event.units;
    units += e.event.kind === "buy" ? e.event.units : -e.event.units;
    if (units < -UNIT_TIE) return { reason: `row ${r.row} (${r.date}) sells units the holding no longer has` };
  }
  if (Math.abs(units) > UNIT_TIE)
    return { reason: `the report's trades after ${asOf} leave ${Math.round(units * 1000) / 1000} units, not nil` };
  return { exitedOn: later.at(-1).date, unitsSold: sold, rows: later.map((r) => r.row) };
}

/**
 * The rows that can speak for one recorded holding: its owner's, under the
 * alias of its ISIN — a fund's in the folio that IS this account, a share's
 * only where the account is the Motilal Oswal depository its trades settle in.
 * Null where the report records nothing for it.
 */
export function mopwmRowsFor(report, { isin, account }) {
  const alias = MOPWM_SECURITIES[isin];
  if (!alias || !account?.ownerId) return null;
  const fund = isin.startsWith("INF");
  if (!fund && account.provider !== "Motilal Oswal Financial Services (demat)") return null;
  const rows = report.rows.filter((r) => r.ownerId === account.ownerId && r.security === alias
    && r.sheet === (fund ? "Mutual Funds" : "Direct Equity") && (!fund || r.folio === account.accountNo));
  return rows.length ? rows : null;
}
