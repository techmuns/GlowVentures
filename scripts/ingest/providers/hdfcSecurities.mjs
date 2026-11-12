// HDFC SECURITIES — Ajay's self-directed equity account, trading account 3110320,
// as the broker's InvestRight app exports it (November 2026 delivery).
//
// Two comma-separated files, and neither carries a letterhead, a holder name or
// an ISIN:
//
//   Invest Right Equity Portfolio_3110320.csv
//       `Trading account: 3110320, Equity Portfolio Details as on 02/11/2026
//       16:50:13`, then one row per NSE SYMBOL: quantity, average price, LTP,
//       investment value, current value, unrealised and realised P&L. The
//       account and the snapshot's date are printed; the company is not.
//   Invest Right Demat Portfolio.csv
//       `Symbol | LTP | STOCK VAL. | FREE QTY | AVAIL QTY` — the DEPOSITORY's view
//       of the same demat, every security by its full scrip name, including four
//       the trading view leaves out (Sterlite Technologies, STL Networks and the
//       two unlisted Sterlite demerger shares). No account, no date.
//
// So each file has what the other lacks. They are ONE snapshot: on every row the
// trading view prints, the depository view prints the same quantity and the same
// LTP to the paisa (`pairDematPortfolio`, below). The trading view is the
// document — it is dated and keyed — and takes its company names from the
// depository view; the depository view becomes its witness, its rows kept and its
// four extra holdings carried in the trading view's document under their own
// source.
//
// A third export, `3110320_Equity_Trade_Details_Report.xlsx`, is the account's
// trades, one row per FILL, over the window its header prints
// (`readTradeDetails`, below).
//
// ── WHOSE ACCOUNT ─────────────────────────────────────────────────────────────
//
// Neither portfolio file prints a holder. `HOLDER_BY_TRADING_ACCOUNT` is the
// committed answer and says what it rests on; the reader names it on the
// document (`owner-from-register`) rather than resolving a name nobody printed.
// The trade details report does print one, and it must agree.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, deriveDocument, makeTransaction } from "../lib/document.mjs";
import { findHeader, readRows } from "../lib/sheet.mjs";
import { securityKeyOf } from "../../../shared/securityKey.mjs";

// The three exports, told apart by their own first lines (lib/classify.mjs).
import {
  HDFC_SECURITIES, INVESTRIGHT_EQUITY as EQUITY_PORTFOLIO, INVESTRIGHT_DEMAT as DEMAT_PORTFOLIO,
  TRADE_DETAILS, toIso,
} from "../lib/classify.mjs";

export const PROVIDER = HDFC_SECURITIES;

/**
 * TRADING ACCOUNT → HOLDER, with the evidence.
 *
 * The family's consolidated review (MOPWM, 30 June 2026) carries an `HDFC Bank`
 * custody block for Ajay whose quantities are this account's depository view to
 * the share: Deepak Fertilisers 10,930, Kingfa Science 1,808, Manorama 4,000,
 * Sterlite Technologies 1,850, STL Networks 1,850, Sterlite Grid 5 1,140 and
 * Sterlite Power (now Sterlite Electric) 1,140 — seven lines no other member's
 * block prints (docs/REVIEW-RECONCILIATION.md, rows 269–431). The delivery
 * itself is "ATJ Sir's Reports" (Ajay T Jaisinghani). A trading account not
 * listed here keeps no owner and the document says so.
 */
export const HOLDER_BY_TRADING_ACCOUNT = Object.freeze({
  3110320: {
    owner: "Ajay Jaisinghani",
    via: "the 30 June 2026 consolidated review's HDFC Bank block for Ajay holds Deepak Fertilisers 10,930, Kingfa 1,808, Manorama 4,000, Sterlite Technologies 1,850, STL Networks 1,850, Sterlite Grid 5 1,140 and Sterlite Power 1,140 — this account's depository view to the share",
  },
});

const num = (v) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : parseNum(s);
};
const warn = (warnings, code, detail) => warnings.push({ code, detail });
const close = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;

const EQUITY_COLUMNS = {
  symbol:       [/^symbol$/],
  quantity:     [/^qty$/],
  longTermQty:  [/^long term qty$/],
  avgPrice:     [/^avg price$/],
  ltp:          [/^ltp$/],
  ltpPct:       [/^ltp %$/],
  investment:   [/^investment value$/],
  current:      [/^current value$/],
  unrealised:   [/^unrealised p l$/],
  unrealisedPct:[/^unrealised p l %$/],
  totalPnl:     [/^total p l$/],
  todayPnl:     [/^today s p l$/],
  todayPct:     [/^today s chg %$/],
  realised:     [/^realised p l$/],
};

const DEMAT_COLUMNS = {
  name:      [/^symbol$/],
  ltp:       [/^ltp$/],
  value:     [/^stock val$/],
  freeQty:   [/^free qty$/],
  availQty:  [/^avail qty$/],
};

export function extract({ grid, meta = {} }) {
  const rows = grid?.sheets?.[0]?.rows ?? [];
  const text = rows.map((r) => r.join(" ")).join("\n");
  if (EQUITY_PORTFOLIO.test(text)) return readEquityPortfolio(rows, text, meta);
  if (DEMAT_PORTFOLIO.test(text)) return readDematPortfolio(rows, meta);
  if (TRADE_DETAILS.test(text.replace(/\s+/g, " "))) return readTradeDetails(rows, meta);
  return null;
}

// ── THE EQUITY TRADE DETAILS REPORT ─────────────────────────────────────────

const TRADE_COLUMNS = {
  scrip:         [/^scrip name$/],
  date:          [/^trade date$/],
  tradeNo:       [/^trade no$/],
  orderNo:       [/^order no$/],
  exchange:      [/^exchange$/],
  settNo:        [/^sett no$/],
  settType:      [/^sett type$/],
  side:          [/^buy sell$/],
  quantity:      [/^qty$/],
  price:         [/^market price$/],
  value:         [/^market value$/],
  delivery:      [/^squp del$/],
  brokerage:     [/^brok amount$/],
  gst:           [/^gst$/],
  stamp:         [/^stamp duty$/],
  txn:           [/^transaction charges$/],
  gstTxn:        [/^gst on transaction charges$/],
  stt:           [/^stt$/],
  sebi:          [/^sebi turnover taxes$/],
  eduCess:       [/^edu cess$/],
  higherEduCess: [/^higher edu cess$/],
  other:         [/^other charges$/],
  net:           [/^net amount$/],
  product:       [/^product$/],
};
/** Every charge the row prints; Net Amount is the market value less (a sell) or plus (a buy) their sum. */
const CHARGE_FIELDS = ["brokerage", "gst", "stamp", "txn", "gstTxn", "sebi", "eduCess", "higherEduCess", "other"];

/**
 * A SCRIP NAME THE BROKER CLIPS, pinned by the account's own statements.
 * Nothing else is aliased; every other scrip keys from the name it prints.
 *
 * `MAN INDUSTRIES (I) LTD.` keys `man-industries-i`, and the holding it sold
 * keys `man-industries-india`. The 30 June review's HDFC Bank block holds
 * 5,17,317 Man Industries for Ajay, the InvestRight portfolio of 2 November
 * holds 4,80,000 MANINDS on this account, and this report sells 37,317
 * `MAN INDUSTRIES (I) LTD.` on 23 September — the whole difference.
 */
const EVIDENCED_SCRIPS = Object.freeze({
  "MAN INDUSTRIES (I) LTD.": {
    security: "MAN INDUSTRIES (INDIA) LIMITED",
    why: "the 30 June 2026 review's HDFC Bank block holds 5,17,317 Man Industries for Ajay and the 2 November InvestRight portfolio holds 4,80,000 MANINDS on this account; the 37,317 sold here on 23 Sep 2026 are the whole difference",
  },
});

/**
 * A header date as the workbook stores it: an Excel serial (`46113` is
 * 1 April 2026), or `dd-Mon-yyyy` text. The export's own download stamp is
 * `11/2/2026` — month first — so a numeric `d/m` string is never guessed at.
 */
function sheetDate(v) {
  const s = String(v ?? "").trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5).toISOString().slice(0, 10);
  }
  return /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(s) ? toIso(s) : null;
}

const sameName = (a, b) => String(a ?? "").replace(/\s+/g, " ").trim().toUpperCase() === String(b ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/**
 * One row per FILL: an order split into many trades is many rows, each with its
 * own trade number, quantity, price and charges. Two fills of the same size at
 * the same price on one day are two events (build-book keeps a repeat within
 * one document), so nothing is merged here.
 *
 * Every row is checked against itself before it is read: QTY × MARKET PRICE is
 * the MARKET VALUE to the paisa, and the market value less (a sell) or plus (a
 * buy) its nine charges and STT is the printed NET AMOUNT to the rupee — the
 * charges are printed rounded from unrounded components, and across this
 * report's 466 fills the largest gap is ₹0.82.
 */
function readTradeDetails(rows, meta) {
  const warnings = [];
  const source = meta.docKey ?? null;
  const field = (label) => rows.find((r) => sameName(r?.[0], label))?.[1] ?? null;
  const accountNo = String(field("Trading ID") ?? "").trim() || null;
  const printedHolder = String(field("Customer Name") ?? "").trim() || null;
  const periodFrom = sheetDate(field("Start Date"));
  const periodTo = sheetDate(field("End Date"));
  const base = { provider: PROVIDER, accountNo, reportType: "transaction-statement", periodFrom, periodTo, asOf: periodTo };

  const holder = HOLDER_BY_TRADING_ACCOUNT[accountNo] ?? null;
  // The printed name, spelled as the register spells it where the two agree.
  let owner = printedHolder;
  if (holder && printedHolder && !sameName(holder.owner, printedHolder)) {
    warn(warnings, "owner-differs-from-register",
      `the report prints ${printedHolder} as the holder of trading account ${accountNo}; HOLDER_BY_TRADING_ACCOUNT records ${holder.owner} (${holder.via})`);
  } else if (holder) owner = holder.owner;
  if (!periodFrom || !periodTo) {
    warn(warnings, "period-not-read", `the header's Start Date \`${field("Start Date")}\` / End Date \`${field("End Date")}\` were not read as dates; no trade is read without the window it belongs to`);
    return { ...base, owner, warnings, transactions: [] };
  }

  const header = findHeader(rows, TRADE_COLUMNS, { minFields: 18, require: ["scrip", "date", "tradeNo", "side", "quantity", "price", "value", "stt", "net", ...CHARGE_FIELDS] });
  if (!header) {
    warn(warnings, "header-not-matched",
      "the `Scrip Name | Trade Date | Trade No. | … | Buy/Sell | Qty | Market Price | Market Value | … | Net Amount` header, with every charge column, was not found; nothing is read rather than reading columns by position");
    return { ...base, owner, warnings, transactions: [] };
  }

  const transactions = [];
  const evidenced = new Set();
  for (const { fields: f, row } of readRows(rows, header, { requireField: "scrip" })) {
    const scrip = String(f.scrip).replace(/\s+/g, " ").trim();
    const date = sheetDate(f.date);
    const side = /^buy$/i.test(f.side) ? "buy" : /^sell$/i.test(f.side) ? "sell" : null;
    const quantity = num(f.quantity);
    const price = num(f.price);
    const value = num(f.value);
    const net = num(f.net);
    const stt = num(f.stt);
    const charges = CHARGE_FIELDS.map((k) => num(f[k]));
    const fails = [];
    if (!date) fails.push(`trade date \`${f.date}\` not read`);
    else if (date < periodFrom || date > periodTo) fails.push(`trade date ${date} is outside the report's window ${periodFrom} – ${periodTo}`);
    if (!side) fails.push(`Buy/Sell \`${f.side}\` is neither`);
    if (!(quantity > 0) || !(price > 0)) fails.push("no quantity or market price");
    else if (!close(quantity * price, value, 0.01)) fails.push(`QTY × MARKET PRICE is ${(quantity * price).toFixed(2)}, not the printed MARKET VALUE ${f.value}`);
    if (stt == null || charges.some((c) => c == null) || net == null) fails.push("a charge or the net amount is blank");
    else if (side && value != null) {
      const all = stt + charges.reduce((a, c) => a + c, 0);
      const derived = side === "sell" ? value - all : value + all;
      if (!close(derived, net, 1)) fails.push(`MARKET VALUE ${side === "sell" ? "less" : "plus"} its charges is ${derived.toFixed(2)}, not the printed NET AMOUNT ${f.net}`);
    }
    if (fails.length) { warn(warnings, "trade-row-not-read", `row ${row + 1} (${scrip} ${f.date}, trade ${f.tradeNo}): ${fails.join("; ")}`); continue; }

    const alias = EVIDENCED_SCRIPS[scrip];
    if (alias) evidenced.add(scrip);
    transactions.push(makeTransaction({
      date,
      settlementDate: null,
      side,
      security: alias?.security ?? scrip,
      exchange: String(f.exchange ?? "").trim().toUpperCase() || null,
      assetClass: "Equity",
      description: `${alias ? `${scrip}: ` : ""}trade ${f.tradeNo}, order ${f.orderNo}, settlement ${f.settNo} (${f.settType}${/^d$/i.test(String(f.delivery).trim()) ? ", delivery" : `, ${f.delivery}`})`,
      quantity,
      unitPrice: price,
      stt,
      otherCharges: Math.round(charges.reduce((a, c) => a + c, 0) * 100) / 100,
      settlementAmount: net,
      source,
    }));
  }
  if (evidenced.size) {
    warn(warnings, "scrip-name-evidenced",
      `the report clips ${evidenced.size} scrip name(s); each trade is named as the account's holding it sold: ${[...evidenced].map((s) => `${s} → ${EVIDENCED_SCRIPS[s].security} (${EVIDENCED_SCRIPS[s].why})`).join("; ")}`);
  }
  if (!transactions.length) warn(warnings, "no-trade-rows", "no row under the header reproduced its own market value and net amount");

  // No `providerEngagement`: build-book describes the account by the first
  // document that prints one, and the account is the equity portfolio's — this
  // report only dates its trades.
  return { ...base, owner, engagement: "Direct", warnings, transactions };
}

function readEquityPortfolio(rows, text, meta) {
  const warnings = [];
  const source = meta.docKey ?? null;
  const [, accountNo, dd, mm, yyyy] = EQUITY_PORTFOLIO.exec(text);
  const asOf = `${yyyy}-${mm}-${dd}`;
  const holder = HOLDER_BY_TRADING_ACCOUNT[accountNo] ?? null;
  if (holder) {
    warn(warnings, "owner-from-register",
      `the export prints trading account ${accountNo} and no holder; HOLDER_BY_TRADING_ACCOUNT records it as ${holder.owner}'s — ${holder.via}`);
  }

  const header = findHeader(rows, EQUITY_COLUMNS, { minFields: 8, require: ["symbol", "quantity", "avgPrice", "ltp", "investment", "current", "realised"] });
  if (!header) {
    warn(warnings, "header-not-matched",
      "the `SYMBOL | QTY | AVG PRICE | LTP | INVESTMENT VALUE | CURRENT VALUE | … | REALISED P&L` header was not found; nothing is read rather than reading columns by position");
    return { provider: PROVIDER, accountNo, owner: holder?.owner ?? null, asOf, reportType: "holdings", warnings,
      holdings: [], totals: makeTotals({ positionCount: 0, source }) };
  }

  const holdings = [];
  for (const { fields: f } of readRows(rows, header, { requireField: "symbol" })) {
    const symbol = String(f.symbol).trim().toUpperCase();
    const quantity = num(f.quantity);
    const avg = num(f.avgPrice);
    const ltp = num(f.ltp);
    const investment = num(f.investment);
    const current = num(f.current);
    const unrealised = num(f.unrealised);
    const realised = num(f.realised);
    const total = num(f.totalPnl);
    const longTerm = num(f.longTermQty);
    /**
     * EVERY ROW IS CHECKED AGAINST ITSELF before a figure is taken: quantity ×
     * LTP is the current value, current less investment is the unrealised P&L,
     * and unrealised plus realised is the total. A row that fails any of them is
     * not read — the export's columns would no longer mean what their headers say.
     */
    const fails = [];
    if (!(quantity > 0)) fails.push("no quantity");
    if (!close(quantity * ltp, current, 0.01 * Math.max(1, quantity))) fails.push(`QTY × LTP is ${(quantity * ltp).toFixed(2)}, not the printed CURRENT VALUE ${f.current}`);
    if (!close(current - investment, unrealised, 0.02)) fails.push(`CURRENT − INVESTMENT is ${(current - investment).toFixed(2)}, not the printed UNREALISED P&L ${f.unrealised}`);
    if (total != null && !close(unrealised + (realised ?? 0), total, 0.02)) fails.push(`UNREALISED + REALISED is ${(unrealised + (realised ?? 0)).toFixed(2)}, not the printed TOTAL P&L ${f.totalPnl}`);
    if (longTerm != null && !(longTerm >= 0 && longTerm <= quantity)) fails.push(`LONG TERM QTY ${f.longTermQty} is not between nil and the QTY ${f.quantity}`);
    if (!close(avg * quantity, investment, 0.005 * quantity + 0.01)) fails.push(`AVG PRICE × QTY is ${(avg * quantity).toFixed(2)}, not the printed INVESTMENT VALUE ${f.investment}`);
    if (fails.length) {
      warn(warnings, "row-does-not-reproduce-itself", `${symbol}: ${fails.join("; ")} — the row is not read.`);
      continue;
    }
    holdings.push(makeHolding({
      // Named by its symbol until the depository view names the company
      // (`pairDematPortfolio`); the symbol is what this file printed.
      security: symbol,
      symbol,
      printedSecurity: symbol,
      assetClass: "Equity",
      quantity,
      // What the broker's own lot record holds past twelve months — a check on
      // any purchase dates the book is given for these units, never a date.
      longTermQuantity: longTerm,
      unitCost: avg,
      // The INVESTMENT VALUE is the primitive: AVG PRICE is printed to two
      // decimals and times the quantity misses it by the rounding.
      totalCost: investment,
      marketPrice: ltp,
      marketValue: current,
      unrealized: unrealised,
      realized: realised,
      priceAsOn: asOf,
      source,
    }));
  }
  if (!holdings.length) warn(warnings, "no-holding-rows", "no row under the header carried a symbol and a quantity that reproduce the row's own values");

  return {
    provider: PROVIDER,
    accountNo,
    owner: holder?.owner ?? null,
    asOf,
    reportType: "holdings",
    engagement: "Direct",
    providerEngagement: `HDFC Securities trading account ${accountNo} — the InvestRight equity portfolio, at the LTP of ${dd}/${mm}/${yyyy}`,
    warnings,
    holdings,
    totals: makeTotals({
      totalMarketValue: holdings.reduce((t, h) => t + (h.printed.marketValue ?? 0), 0),
      positionCount: holdings.length,
      source,
    }),
  };
}

/**
 * THE APP'S SCRIP NAME, WITH ITS OWN QUOTING UNDONE.
 *
 * The export prints the depository's face-value furniture with stray
 * apostrophes and dots — `VEDANTA LIMITED EQ NEW RS.1''''/-`, `MAN INDUSTRIES
 * (INDIA) LIMITED EQ NEW.RS. 5/-`, `… EQ NEW F.V. RS.2''/-` — which
 * `stripDepositoryTail` does not recognise, so each keyed apart from the same
 * company everywhere else in this book (`vedanta-limited-eq-new-rs-1` beside
 * `vedanta`). Only the furniture is touched; the printed name stays in
 * `printedSecurity`.
 */
export function cleanScripName(name) {
  return String(name ?? "")
    .replace(/'+/g, "")
    .replace(/\bNEW\.RS\./gi, "NEW RS.")
    .replace(/\bF\.V\./gi, "FV")
    .replace(/\s+/g, " ")
    .trim();
}

function readDematPortfolio(rows, meta) {
  const warnings = [];
  const source = meta.docKey ?? null;
  const header = findHeader(rows, DEMAT_COLUMNS, { minFields: 4, require: ["name", "ltp", "value", "freeQty"] });
  if (!header) {
    warn(warnings, "header-not-matched", "the `Symbol | LTP | STOCK VAL. | FREE QTY | AVAIL QTY` header was not found; nothing is read");
    return { provider: PROVIDER, reportType: "holdings", warnings, holdings: [], totals: makeTotals({ positionCount: 0, source }) };
  }
  const holdings = [];
  const unpriced = [];
  for (const { fields: f } of readRows(rows, header, { requireField: "name" })) {
    const name = String(f.name).replace(/\s+/g, " ").trim();
    const quantity = num(f.freeQty);
    const avail = num(f.availQty);
    const ltp = num(f.ltp);
    const value = num(f.value);
    if (!(quantity > 0)) { warn(warnings, "balance-not-read", `${name}: no FREE QTY — the row is not read`); continue; }
    if (avail != null && avail !== quantity) {
      warn(warnings, "free-and-available-differ", `${name}: FREE QTY ${f.freeQty} and AVAIL QTY ${f.availQty} differ — the row is not read, because which is the holding is not printed`);
      continue;
    }
    /**
     * AN LTP OF 0.00 IS NO PRICE. Sterlite Electric and Sterlite Grid 5 are the
     * demerged shares of Sterlite Technologies awaiting listing; the app prints
     * `0.00` for LTP and stock value because no exchange quotes them. Carried as a
     * value, that is a measured zero for a holding nobody measured.
     */
    const noPrice = ltp === 0 && value === 0;
    if (!noPrice && !close(quantity * ltp, value, 0.01 * Math.max(1, quantity))) {
      warn(warnings, "row-does-not-reproduce-itself", `${name}: FREE QTY × LTP is ${(quantity * ltp).toFixed(2)}, not the printed STOCK VAL. ${f.value} — the row is not read`);
      continue;
    }
    if (noPrice) unpriced.push(`${name} (${quantity})`);
    holdings.push(makeHolding({
      security: cleanScripName(name),
      printedSecurity: name,
      assetClass: "Equity",
      quantity,
      marketPrice: noPrice ? null : ltp,
      marketValue: noPrice ? null : value,
      source,
    }));
  }
  if (unpriced.length) {
    warn(warnings, "no-rate-published",
      `${unpriced.length} holding(s) print an LTP and a stock value of 0.00 — no exchange quotes them — and are carried as quantities with no value: ${unpriced.join("; ")}`);
  }
  return {
    provider: PROVIDER,
    reportType: "holdings",
    engagement: "Direct",
    providerEngagement: "HDFC Securities — the InvestRight demat portfolio (the depository's view of the account; it prints no account and no date)",
    warnings,
    holdings,
    totals: makeTotals({
      totalMarketValue: holdings.reduce((t, h) => t + (h.printed.marketValue ?? 0), 0),
      positionCount: holdings.length,
      source,
    }),
  };
}

const dirOf = (p) => String(p ?? "").replace(/[\\/][^\\/]*$/, "");
const isDematView = (d) => d.provider === PROVIDER && d.reportType === "holdings" && !d.accountNo && !d.twinOf;
const isTradingView = (d) => d.provider === PROVIDER && d.reportType === "holdings" && d.accountNo && d.asOf && !d.twinOf;

/**
 * ONE SNAPSHOT IN TWO FILES — the depository view adopts the trading view's
 * account and date, and the trading view takes its company names from it.
 *
 * The pair is struck only where it is one snapshot beyond doubt: the two files
 * sit in the same delivery folder, and EVERY row the trading view prints has
 * exactly one depository row with the same quantity and the same LTP to the
 * paisa (and no other trading row claims it). Anything less leaves both as they
 * were — the depository view unkeyed and the trading view named by symbol — and
 * says why, so check:reads names the file.
 *
 * `rekey` is extract.mjs's own, passed in so a re-keyed document carries every
 * back-reference with it.
 */
export function pairDematPortfolio(docs, { rekey }) {
  let paired = 0;
  for (const demat of docs.filter(isDematView)) {
    const candidates = docs.filter((d) => isTradingView(d) && dirOf(d.sourcePath) === dirOf(demat.sourcePath));
    const refuse = (why) => demat.warnings.push({ code: "demat-portfolio-not-paired", detail: why });
    if (candidates.length !== 1) {
      refuse(`${candidates.length} dated InvestRight equity portfolio(s) sit beside this export in ${dirOf(demat.sourcePath)}; it prints no account and no date, and is paired only with exactly one`);
      continue;
    }
    const trading = candidates[0];
    const used = new Set();
    const pairs = [];
    let broken = null;
    for (const h of trading.holdings) {
      const matches = demat.holdings.filter((r, i) => !used.has(i) && r.quantity === h.quantity
        && r.marketPrice != null && Math.abs(r.marketPrice - h.marketPrice) < 0.005);
      if (matches.length !== 1) { broken = `${h.symbol} (${h.quantity} at ${h.marketPrice}) matches ${matches.length} row(s) of the demat view`; break; }
      const i = demat.holdings.indexOf(matches[0]);
      used.add(i);
      pairs.push([h, matches[0]]);
    }
    if (broken) { refuse(`not the same snapshot as ${trading.docKey}: ${broken}`); continue; }

    const oldDematKey = demat.docKey;
    Object.assign(demat, { accountNo: trading.accountNo, asOf: trading.asOf, owner: trading.owner, ownerId: trading.ownerId });
    demat.reportType = "holdings";
    rekey(demat);
    // Key it apart from the trading view's document, whose own key it would take.
    if (demat.docKey === trading.docKey) {
      const was = demat.docKey;
      demat.docKey = `${trading.docKey}-demat`;
      for (const h of demat.holdings) if (h.source === was || h.source === oldDematKey) h.source = demat.docKey;
    }

    for (const [h, r] of pairs) {
      h.security = r.security;
      h.securityKey = securityKeyOf(r.security);
      h.printedSecurity = h.symbol;
    }
    const extra = demat.holdings.filter((_, i) => !used.has(i)).map((r) => ({ ...r, priceAsOn: r.marketPrice != null ? trading.asOf : null, source: demat.docKey }));
    trading.holdings.push(...extra);
    // Weights are shares of the whole account, which now has more rows.
    const rederived = deriveDocument(trading);
    trading.holdings = rederived.holdings;
    trading.derivedPortfolioTotal = rederived.derivedPortfolioTotal;
    trading.totals = makeTotals({
      totalMarketValue: trading.holdings.reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0),
      positionCount: trading.holdings.length,
      source: trading.docKey,
    });
    trading.warnings.push({
      code: "security-name-from-depository-view",
      detail: `this export names each holding by its NSE symbol only; every one of its ${pairs.length} rows is named as the depository view beside it (${demat.sourcePath}) prints it, the two being one snapshot — the same quantity and the same LTP to the paisa on every row. `
        + (extra.length ? `The depository view also holds ${extra.length} security(ies) this export leaves out, carried here under its own source: ${extra.map((r) => `${r.security} (${r.quantity})`).join("; ")}.` : ""),
    });
    for (const w of demat.warnings) if (w.code === "no-rate-published") trading.warnings.push({ ...w });

    demat.warnings.unshift({
      code: "witness-of",
      detail: `this export prints no account and no date; it is the depository view of ${trading.docKey} (${trading.sourcePath}) — every one of that document's ${pairs.length} rows has its quantity and LTP here to the paisa — and is read as its witness: its names and its ${extra.length} further holding(s) are in that document, and it adds no facts of its own.`,
    });
    demat.sections = { ...(demat.sections ?? {}), "demat-portfolio": { name: "demat portfolio", rows: demat.holdings.map((h) => [h.security, h.marketPrice, h.printed?.marketValue, h.quantity]) } };
    demat.holdings = [];
    demat.twinOf = trading.docKey;
    paired++;
  }
  /**
   * A TRADING VIEW NOTHING NAMED IS NOT READ IN FULL. Its holdings are keyed by
   * symbol, `deepakfert`, which joins nothing in this book — so the gap is named
   * on the document and check:reads holds the delivery until the depository view
   * of the same snapshot is supplied beside it.
   */
  for (const d of docs.filter(isTradingView)) {
    const bare = d.holdings.filter((h) => h.symbol && h.security === h.symbol);
    if (!bare.length) continue;
    d.warnings.push({
      code: "security-named-by-symbol-only",
      detail: `${bare.length} holding(s) are named only by the NSE symbol this export prints (${bare.map((h) => h.symbol).join(", ")}); `
        + "upload the InvestRight DEMAT portfolio exported at the same moment beside it, which names each company, and the two are read as one snapshot.",
    });
  }
  return paired;
}
