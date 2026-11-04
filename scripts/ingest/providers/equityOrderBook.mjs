// A BROKER'S EQUITY ORDER BOOK — the executed trades on one demat account.
//
// `orderBook_Equity_<n>.csv` (November 2026 delivery) is a tab-separated export
// of executed equity trades: date, NSE/BSE symbol, buy or sell, quantity, an
// average price, the trade value and every charge, and the demat account each
// trade settled into as `DP Id - Client DP Id`. It names no broker, no holder
// and no ISIN, and it prints no period — it is the rows it holds.
//
// The demat column is what places it. `IN302902-49794950` is Ajay's ICICI Bank
// NSDL account, whose own Statement of Holding prints that DP ID on its
// letterhead (`lib/depositoryParticipants.mjs`), so the trades are that account's
// and the document is filed under it; its holder comes from that account's own
// statements (`backfillOwners`). Every trade on it ties to the account's two
// holding statements: Smartworks 1,87,778 and Insolation Energy 2,12,000 sold to
// nil, EMA Partners 44,643 → 643 and Yash Highvoltage 1,38,462 → 1,04,462 between
// 31 March and 31 October 2026, exactly the units sold here.
//
// ── THE PRICE IS THE ORDER'S, THE TRADE VALUE IS THE CONSIDERATION ──────────
//
// A row is one ORDER, and `Price` is not what it filled at: `10000 @ 453.94`
// carries a Trade Value of 45,32,918.55, ₹453.29 a share. The Trade Value is the
// turnover the charges are struck on — STT on the four Smartworks sales of
// 27 October sums to ₹16,548.00, 0.1% of their summed Trade Value of
// ₹1,65,47,637.75. So the Trade Value is the primitive and the unit price is
// derived from it; the order price is kept in the trade's description only. The
// row's own check is that its four charges add to its printed `Brokerage Incl.
// Taxes`.
import { parseNum } from "../lib/parseNum.mjs";
import { makeTransaction } from "../lib/document.mjs";
import { findHeader, readRows } from "../lib/sheet.mjs";
import { toIso, ORDER_BOOK_HEADER } from "../lib/classify.mjs";
import { dematAccountOf } from "../lib/depositoryParticipants.mjs";
import { UPSTOX_INSTRUMENTS } from "../../../shared/upstoxInstruments.mjs";

export const REPORT_TYPE = "transaction-statement";

/** The header classify.mjs files this export by. */
export { ORDER_BOOK_HEADER };

const COLUMNS = {
  date:      [/^date$/],
  stock:     [/^stock$/],
  action:    [/^action$/],
  quantity:  [/^qty$/],
  price:     [/^price$/],
  value:     [/^trade value$/],
  orderRef:  [/^order ref$/],
  settlement:[/^settlement$/],
  segment:   [/^segment$/],
  demat:     [/^dp id client dp id$/],
  exchange:  [/^exchange$/],
  stt:       [/^stt$/],
  turnover:  [/^transaction and sebi turnover charges$/],
  stamp:     [/^stamp duty$/],
  brokerage: [/^brokerage service tax$/],
  allIn:     [/^brokerage incl taxes$/],
};

/**
 * SYMBOLS THE EXCHANGES' INSTRUMENT MASTER DOES NOT CARRY, each pinned by the
 * account's own statements. Nothing else is aliased.
 *
 * `EMAIN` is not EMA Partners India's NSE symbol (`EMAPARTNER`). But the account
 * held 44,643 of its shares (INE0ZOL01023) on 31 March and 643 on 31 October, at
 * ₹82.00 and ₹84.95 a share, and this book sells 44,000 `EMAIN` at ₹82.00 on
 * 26 October — the whole difference, at that price.
 */
const EVIDENCED_SYMBOLS = Object.freeze({
  EMAIN: { isin: "INE0ZOL01023", why: "ICICI Bank's statements of holding for 49794950 hold 44,643 EMA Partners India (INE0ZOL01023) on 31 Mar 2026 and 643 on 31 Oct 2026 — the 44,000 `EMAIN` sold here on 26 Oct at ₹82.00" },
});

/** The ISIN behind a traded symbol, from the instrument master on its own exchange first. */
export function isinOfSymbol(symbol, exchange) {
  const keys = exchange === "BSE" ? [`BSE:${symbol}`, symbol] : [symbol, `BSE:${symbol}`];
  for (const k of keys) {
    const key = UPSTOX_INSTRUMENTS[k]?.key;
    const isin = key ? /\|(IN[A-Z0-9]{10})$/.exec(key)?.[1] : null;
    if (isin) return { isin, via: `the exchange instrument master (${key})` };
  }
  const e = EVIDENCED_SYMBOLS[symbol];
  return e ? { isin: e.isin, via: e.why } : null;
}

const num = (v) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : parseNum(s);
};

export function extract({ grid, meta = {} }) {
  const warnings = [];
  const warn = (code, detail) => warnings.push({ code, detail });
  const source = meta.docKey ?? null;
  const rows = grid?.sheets?.[0]?.rows ?? [];
  const header = findHeader(rows, COLUMNS, { minFields: 10, require: ["date", "stock", "action", "quantity", "price", "value", "demat"] });
  if (!header) return null;

  const read = readRows(rows, header, { requireField: "stock" });
  const accounts = new Map();
  for (const { fields } of read) {
    const a = dematAccountOf(fields.demat);
    const k = a ? `${a.dpId}-${a.clientId}` : String(fields.demat || "(blank)");
    accounts.set(k, a);
  }
  /**
   * ONE DOCUMENT IS ONE ACCOUNT. An order book that settles into two demat
   * accounts would put one account's trades under the other, so it is refused
   * whole and the accounts it names are listed.
   */
  if (accounts.size !== 1 || ![...accounts.values()][0]?.provider) {
    warn("demat-account-not-placed",
      `the trades settle into ${[...accounts.keys()].join(", ")}; a document is read only where every row settles into ONE demat account whose depository participant a statement in this book names on its letterhead (lib/depositoryParticipants.mjs)`);
    return { reportType: REPORT_TYPE, warnings, transactions: [] };
  }
  const account = [...accounts.values()][0];

  const transactions = [];
  const unresolved = new Set();
  const resolvedBy = new Map();
  for (const { fields: f, row } of read) {
    const date = toIso(f.date);
    const side = /^buy$/i.test(f.action) ? "buy" : /^sell$/i.test(f.action) ? "sell" : null;
    const quantity = num(f.quantity);
    const price = num(f.price);
    const value = num(f.value);
    const symbol = String(f.stock).trim().toUpperCase();
    const exchange = String(f.exchange ?? "").trim().toUpperCase() || null;
    const charges = [num(f.stt), num(f.turnover), num(f.stamp), num(f.brokerage)];
    const allIn = num(f.allIn);
    const fails = [];
    if (!date) fails.push(`date \`${f.date}\` not read`);
    if (!side) fails.push(`action \`${f.action}\` is neither Buy nor Sell`);
    if (!(quantity > 0) || !(value > 0)) fails.push("no quantity or trade value");
    if (charges.some((c) => c == null) || allIn == null || Math.abs(charges.reduce((a, c) => a + c, 0) - allIn) > 0.02) {
      fails.push(`STT + turnover charges + stamp duty + brokerage do not add to the printed Brokerage Incl. Taxes ${f.allIn}`);
    }
    if (fails.length) { warn("trade-row-not-read", `row ${row + 1} (${symbol} ${f.date}): ${fails.join("; ")}`); continue; }

    const found = isinOfSymbol(symbol, exchange);
    if (found) resolvedBy.set(symbol, found);
    else unresolved.add(symbol);
    transactions.push(makeTransaction({
      date,
      settlementDate: null,
      side,
      // Named by the symbol this file prints; the ISIN names the company where
      // another statement in this drop prints one against it (extract.mjs).
      security: symbol,
      isin: found?.isin ?? null,
      exchange,
      assetClass: "Equity",
      description: `order ${f.orderRef} at ${price ?? "—"}, settlement ${f.settlement} (${f.segment})`,
      quantity,
      unitPrice: value / quantity,
      stt: charges[0],
      otherCharges: Math.round((charges[1] + charges[2] + charges[3]) * 100) / 100,
      source,
    }));
  }

  if (resolvedBy.size) {
    warn("symbol-isin-from-instrument-master",
      `this export prints NSE/BSE symbols and no ISIN; each symbol's ISIN is ${[...resolvedBy].map(([s, r]) => `${s} → ${r.isin} (${r.via})`).join("; ")}`);
  }
  if (unresolved.size) {
    warn("symbol-not-resolved",
      `${[...unresolved].join(", ")}: no exchange instrument master entry and no statement evidence gives an ISIN, so the trade carries the symbol as its name and joins no holding by ISIN`);
  }
  const dates = transactions.map((t) => t.date).sort();
  return {
    provider: account.provider,
    accountNo: account.clientId,
    asOf: dates.at(-1) ?? null,
    reportType: REPORT_TYPE,
    engagement: "Direct",
    providerEngagement: `${ENGAGEMENT_PREFIX} — every trade settles into ${account.dpId}-${account.clientId}; the broker is not named on the export`,
    warnings,
    transactions,
  };
}

const ENGAGEMENT_PREFIX = "equity order book";
const isOrderBook = (d) => d.reportType === REPORT_TYPE && String(d.providerEngagement ?? "").startsWith(ENGAGEMENT_PREFIX);

/**
 * A TRADE NAMED BY ITS SYMBOL TAKES THE NAME A STATEMENT PRINTS FOR ITS ISIN.
 *
 * `SMARTWORKS` keys `smartworks` and the holding it sold keys
 * `smartworks-coworking-spaces`: without a name the trades join nothing. The
 * ISIN is the join — never a name resembling a name. The account's own holding
 * statements are asked first, since the trade must join THAT account's holding;
 * failing those, any statement in the drop, and only where every name printed
 * against the ISIN keys to ONE security. The symbol stays in the description.
 */
export function nameTradesByIsin(docs) {
  let named = 0;
  const namesOf = (pred, sections = ["holdings", "transactions"]) => {
    const byIsin = new Map();
    for (const d of docs) {
      if (!pred(d) || isOrderBook(d) || d.twinOf) continue;
      for (const r of sections.flatMap((s) => d[s] ?? [])) {
        if (!r.isin || !r.security || !r.securityKey) continue;
        const m = byIsin.get(r.isin) ?? new Map();
        if (!m.has(r.securityKey)) m.set(r.securityKey, r.security);
        byIsin.set(r.isin, m);
      }
    }
    return byIsin;
  };
  // A depository tape spells a company its own way beside the holding statement
  // (`axis-bank` held, `axis-bank-limited-new-equity-shares-…` traded): where the
  // rows printing an ISIN disagree, the key it is HELD under decides.
  const held = namesOf(() => true, ["holdings"]);
  const anywhere = namesOf(() => true);
  for (const book of docs.filter(isOrderBook)) {
    const own = namesOf((d) => d.provider === book.provider && d.accountNo === book.accountNo && d.reportType === "holdings");
    const done = [];
    for (const t of book.transactions ?? []) {
      if (!t.isin) continue;
      const pick = (m) => (m && m.size === 1 ? [...m][0] : null);
      const hit = pick(own.get(t.isin)) ?? pick(held.get(t.isin)) ?? pick(anywhere.get(t.isin));
      if (!hit) continue;
      const [securityKey, security] = hit;
      if (t.securityKey === securityKey) continue;
      done.push(`${t.security} → ${security}`);
      t.description = `${t.security}: ${t.description ?? ""}`.trim();
      t.security = security;
      t.securityKey = securityKey;
      named++;
    }
    if (done.length) {
      book.warnings.push({
        code: "security-name-from-isin",
        detail: `the export names each trade by its symbol; named as a statement in this drop prints the symbol's ISIN: ${[...new Set(done)].join("; ")}`,
      });
    }
  }
  return named;
}
