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
// ── WHOSE ACCOUNT ─────────────────────────────────────────────────────────────
//
// Neither file prints a holder. `HOLDER_BY_TRADING_ACCOUNT` is the committed
// answer and says what it rests on; the reader names it on the document
// (`owner-from-register`) rather than resolving a name nobody printed.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, deriveDocument } from "../lib/document.mjs";
import { findHeader, readRows } from "../lib/sheet.mjs";
import { securityKeyOf } from "../../../shared/securityKey.mjs";

// The two exports, told apart by their own first lines (lib/classify.mjs).
import { HDFC_SECURITIES, INVESTRIGHT_EQUITY as EQUITY_PORTFOLIO, INVESTRIGHT_DEMAT as DEMAT_PORTFOLIO } from "../lib/classify.mjs";

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
  return null;
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
