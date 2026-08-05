// LKP SECURITIES — a DIRECT demat account, and the only lot register in this book.
//
// Every other account here is a managed mandate: a manager holds the securities,
// prints a valuation, and the family sees positions. This one is the family's own
// CDSL demat account with a broker, and it publishes four documents that between
// them carry something no PMS statement in this drop does.
//
//   DEPOSITORY HOLDING STATEMENT   pdf   as on 31/03/2026 — ISIN, quantity, rate,
//                                        value. The ONLY holdings table in this
//                                        book that prints an ISIN.
//   TRANSACTION STATEMENT (CDSL)   pdf   dated demat credits and debits per ISIN
//   519: Annual P&L II             xls   PER-LOT realised gains, WITH THE BUY DATE
//                                        AND THE SALE DATE — and open lots too
//   Global Details Report          xls   the trade ledger and the net position
//
// ── WHY THE .xls FILES MATTER MORE THAN THEIR SIZE SUGGESTS ──────────────────
//
// `docs/BOOK-REPORT.md` says the short/long-term split cannot be produced because
// "the CAPITAL REGISTER is a capital-account ledger, not a lot register" and what
// would fix it is "a holding statement with lot-level acquisition dates". That
// document is in this drop. Annual P&L II prints one row per LOT:
//
//   BELRISE INDUSTRIES LIMITED-INE894V01022  10/09/2025  6500  141.89  922285.00
//                                            (no sale)   — an OPEN lot, dated
//   BELRISE INDUSTRIES LIMITED-INE894V01022  10/09/2025  6000  141.89  851340.00
//                                            25/06/2026  6000  251.50 1508976.00
//                                            → 657636.00 SHORT TERM
//
// So for THIS account — and only this account — days held, the ST/LT split of
// unrealised gain, and the cost basis on each side are all measurable. They stay
// absent everywhere else, and the difference is stated rather than smoothed over.
//
// ── THE STALENESS IS REAL AND IS NOT REPAIRED HERE ──────────────────────────
//
// The holding statement is as on 31/03/2026; the trade ledger runs to 01/07/2026
// and shows Belrise down 6,000 shares, Capri out entirely, and two new positions
// bought on 1 July. The quantities in the valuation are therefore THREE MONTHS
// STALE, and this reader does not paper over that:
//
//   • The holdings carry `asOf: 2026-03-31`, which is what the statement says.
//     The cockpit's per-account as-of machinery then reports this account as the
//     one lagging furthest behind, which is true and is the useful thing to know.
//   • The ledger's net positions are carried SEPARATELY as `positionsAsOf`, not
//     merged into the valuation. Merging them would produce a holding with a
//     July quantity at a March price — a number no statement contains, on two
//     dates at once, and it would look exactly like a valuation.
//
// ── ISINs ARE GLUED ONTO NAMES IN THE .xls, AND SPLIT OFF HERE ──────────────
//
// `BELRISE INDUSTRIES LIMITED-INE894V01022` — the same shape Carnelian's capital
// gain statement uses. `splitSecurityName` (via makeHolding/makeCapitalGain)
// separates them so the key comes from the clean name and the ISIN is kept as
// enrichment, joining these lots to the depository statement's own ISIN column.
import { parseNum } from "../lib/parseNum.mjs";
import {
  makeHolding, makeTotals, makeCapitalGain, makeTransaction, makeExpense,
} from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";
import { findHeader, readRows } from "../lib/sheet.mjs";
import { splitSecurityName, securityKeyOf } from "../../../shared/securityKey.mjs";

/**
 * One dated acquisition lot for a position still held.
 *
 * Not a holding — it carries no market price and no value. It is the answer to
 * "when was this bought and at what cost", which is the input a short/long-term
 * split of unrealised gain needs and which no other document in this book has.
 */
function makeOpenLot(input) {
  const { security, isin } = splitSecurityName(input.security);
  return {
    security,
    securityKey: security ? securityKeyOf(security) : null,
    isin,
    purchaseDate: input.purchaseDate ?? null,
    quantity: parseNum(input.quantity),
    unitCost: parseNum(input.unitCost),
    totalCost: parseNum(input.totalCost),
    source: input.source ?? null,
  };
}

export const PROVIDER = "LKP Securities";

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const num = (s) => parseNum(s);

/** Rows the broker uses for charges rather than for a security. */
const EXPENSE_SCRIP = /^expenses?$/i;

// ── Annual P&L II — the lot register ────────────────────────────────────────
//
// Matched by LABEL, never by index. The Buy and Sale groups repeat the same
// three headings under a banner of asterisks (`****Buy**** Quantity`), so the
// quantity/rate/amount labels are disambiguated by the banner they carry.
// `norm()` in lib/sheet.mjs folds every non-alphanumeric run to a single space,
// so `CLIENT_ID` arrives as `client id` and `SCRIP_SYMBOL` as `scrip symbol`.
// An alias written against the printed label (`client_?id`) matches neither, and
// the header then resolves with those two columns MISSING — which is not a
// failure until every row reads from column `undefined` and the document reports
// zero lots. Aliases are written against the NORMALISED label throughout.
const PNL_COLUMNS = {
  clientId:    [/^client\s*id/],
  scrip:       [/^scrip\s*symbol/],
  buyDate:     [/^buy\s*date/],
  buyQty:      [/buy[^a-z]*quantity/],
  buyRate:     [/^rate$/],
  buyAmount:   [/^total\s*amt$/],
  saleQty:     [/sale[^a-z]*quantity/],
  soldDate:    [/^sold\s*date/],
  shortTerm:   [/^short\s*term/],
  longTerm:    [/^long\s*term/],
  speculation: [/^speculation/],
};

// ── Global Details Report — the trade ledger ────────────────────────────────
const LEDGER_COLUMNS = {
  exchange:  [/^exchange/],
  security:  [/^security/],
  tradeDate: [/^trade\s*date/],
  narration: [/^narration/],
  buyQty:    [/^buy\s*qty/],
  buyRate:   [/^buy\s*rate/],
  saleQty:   [/^sale\s*qty/],
  saleRate:  [/^sale\s*rate/],
  netQty:    [/^net\s*qty/],
  netRate:   [/^net\s*rate/],
  netAmount: [/^net\s*amount/],
};

/**
 * A ledger row that is a POSITION BROUGHT FORWARD, not a trade.
 *
 * `OPENING:CARRY FORWARD DATA FROM 2025` carries zero buy and zero sale quantity
 * and a net quantity that is the whole holding. Counted as a trade it would
 * invent a purchase of 12,500 Belrise shares on a date the family did not buy
 * them; counted as an opening balance it is what it says it is.
 */
const IS_OPENING = /opening\s*:?\s*carry\s*forward/i;

/**
 * `544405 BELRISE INDUSTRIES LIMITED` — the ledger prefixes the BSE scrip code.
 * Stripped so the security key matches the P&L's own name for the same holding;
 * the code is kept as `symbol` because it is a real identifier, just not ours.
 */
function splitScripCode(raw) {
  const m = /^(\d{6})\s+(.+)$/.exec(String(raw ?? "").trim());
  return m ? { code: m[1], name: m[2].trim() } : { code: null, name: String(raw ?? "").trim() };
}

/**
 * Drop the exchange SERIES marker the depository appends to a clipped name.
 *
 * `PRICOL LIMITED-EQ`, `JYOTHY LABS-EQ1/-`, `MRS. BECTORS-EQ2/-`, `TRANSRAIL-EQ2/-`
 * — `EQ` is the cash-market series and the digits are the face value in rupees.
 * None of it is part of the company, and leaving it on keys `pricol-limited-eq`
 * against a book that keys `pricol-limited` everywhere else, so the one account
 * with ISINs joins to nothing.
 *
 * Fixed HERE, in the extractor, and not on the read side: a presentation layer
 * that repairs identity hides the defect from the reconciler.
 *
 * The pattern is anchored and narrow, the same discipline `splitSecurityName`
 * uses for a glued ISIN: a hyphen, one of the four series codes SEBI actually
 * issues, optional face-value digits, and the end of the string. An unanchored
 * or looser rule reaches into real names — `LARSEN & TOUBRO-EQUIPMENT` would
 * lose its second word.
 */
const stripSeries = (name) => String(name).replace(/-(?:EQ|BE|SM|ST)\d*\s*\/?\s*-?$/i, "").trim();

/** The depository holding statement's own rows, off the coordinate grid. */
const HOLDING_ROW = new RegExp(
  String.raw`^\s*(\d{1,3})\s+` +                        // 1 serial
  String.raw`(IN[EF][0-9A-Z]{9})\s+` +                  // 2 ISIN
  String.raw`(.+?)\s+` +                                // 3 company name
  String.raw`([\d,]+\.\d{2})\s+` +                      // 4 free balance
  String.raw`([\d,]+\.\d{3})\s+` +                      // 5 total quantity
  String.raw`([\d,]+\.\d{2})\s+` +                      // 6 rate
  String.raw`([\d,]+\.\d{2})\s*$`,                      // 7 value
);

/**
 * Read the depository holding statement out of the flat page text.
 *
 * A name can WRAP (`CROMPTON GRE CONS-` / `EQ`), so a line that does not match
 * is held and re-tried joined to the next one. The pattern is anchored at both
 * ends, which is what makes that safe: a wrongly joined pair simply fails again
 * rather than matching something plausible.
 */
function readDepositoryHoldings(flat, source, warnings) {
  const holdings = [];
  const lines = flat.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let m = HOLDING_ROW.exec(lines[i]);
    if (!m && i + 1 < lines.length) m = HOLDING_ROW.exec(`${lines[i].trimEnd()} ${lines[i + 1].trim()}`);
    if (!m) continue;
    const [, , isin, nameRaw, , qty, rate, value] = m;
    const printed = nameRaw.replace(/\s+/g, " ").trim();
    holdings.push(makeHolding({
      security: stripSeries(printed),
      // What the depository actually printed, kept beside the cleaned name for
      // the same reason `splitSecurityName` keeps a glued ISIN: the archive shows
      // the document, the key uses the identity.
      printedSecurity: printed,
      isin,
      // `NIP ETNF1D RTLIQBEES` is Nippon's 1-day liquid ETF — the cash sweep of a
      // demat account. Its ISIN starts INF (a mutual fund) rather than INE.
      assetClass: isin.startsWith("INF") ? "Mutual Fund" : "Equity",
      quantity: num(qty),
      marketPrice: num(rate),
      marketValue: num(value),
      source,
    }));
  }
  if (!holdings.length) warn(warnings, "depository-holdings-not-read", "no `<sr> <ISIN> <name> … <qty> <rate> <value>` row matched");
  return holdings;
}

/** The statement's own printed total, the row-sum check's other side. */
function readPrintedTotal(flat, holdings) {
  // It prints as a bare figure on its own line under the last row, with no label
  // at all — so it is matched as the last standalone amount after the table, and
  // only accepted when it is in the right neighbourhood of the rows themselves.
  const candidates = [...flat.matchAll(/^\s*([\d,]+\.\d{2})\s*$/gm)].map((m) => num(m[1]));
  if (!candidates.length) return null;
  const rowSum = holdings.reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0);
  // The nearest candidate to the row sum, and only if within 1% of it. An
  // unlabelled figure that is not close to the total is some other number on the
  // page, and adopting it would put a fabricated total into a CHECK.
  const best = candidates.reduce((a, b) => (Math.abs(b - rowSum) < Math.abs(a - rowSum) ? b : a));
  return rowSum && Math.abs(best - rowSum) / rowSum <= 0.01 ? best : null;
}

// ── The workbook readers ────────────────────────────────────────────────────

/**
 * Annual P&L II → realised lots, OPEN lots and broker charges.
 *
 * One row is one lot. A row with a sale quantity is a realised lot and carries
 * both dates; a row without one is a position still held, and its buy date is the
 * acquisition date that makes the short/long-term split measurable.
 */
function readPnl(sheet, source, warnings) {
  const header = findHeader(sheet.rows, PNL_COLUMNS, { minFields: 6, require: ["clientId", "scrip", "buyDate"] });
  if (!header) {
    warn(warnings, "pnl-header-not-matched", "no CLIENT_ID / SCRIP_SYMBOL / Buy Date header row in the Annual P&L sheet");
    return null;
  }
  if (header.missing?.length) warn(warnings, "columns-not-matched", header.missing.join(", "));

  const lots = [];
  const openLots = [];
  const expenses = [];
  let owner = null;
  let clientId = null;

  for (const { fields: f, cells } of readRows(sheet.rows, header)) {
    clientId ??= f.clientId || null;
    // The owner's name sits in the UNLABELLED column beside CLIENT_ID — the
    // header row has an empty cell where the name column is, so there is no
    // label to match. Taken as the cell immediately after CLIENT_ID, which is
    // where the broker prints it on every row.
    owner ??= String(cells[header.columns.clientId + 1] ?? "").trim() || null;

    const scrip = String(f.scrip ?? "").trim();
    // Likewise the security: the column right of SCRIP_SYMBOL carries the name
    // (with its ISIN glued on), and that column has no heading either.
    const security = String(cells[header.columns.scrip + 1] ?? "").trim();

    // ── broker charges ──
    if (EXPENSE_SCRIP.test(scrip)) {
      /**
       * A CHARGE ROW USES THE SAME COLUMNS FOR DIFFERENT THINGS.
       *
       * `98245 | BHARAT… | EXPENSES | | CGST | 0.000 | -1034.84 | -1034.84`
       *
       * The security column is blank and the charge's NAME sits under `Buy Date`
       * — the broker reuses the row rather than printing a second table. Reading
       * it from the security column gives an empty string, the row is skipped as
       * unnamed, and ₹8,103 of CGST, SGST, STT, stamp duty and exchange charges
       * disappears without anything failing.
       */
      const detail = String(f.buyDate ?? "").trim();
      const amount = num(f.buyAmount);
      // These print NEGATIVE (a charge against the account). The sign is the
      // statement's; an expense is recorded at its magnitude with the direction
      // in the field name, so nothing downstream can subtract it twice.
      if (detail && amount !== null) {
        expenses.push(makeExpense({ date: null, detail, amount: Math.abs(amount), source }));
      }
      continue;
    }
    if (!security) continue;

    const buyDate = toIso(f.buyDate);
    const buyQty = num(f.buyQty);
    const buyRate = num(f.buyRate);
    const buyAmount = num(f.buyAmount);
    const saleQty = num(f.saleQty);
    const soldDate = toIso(f.soldDate);
    const st = num(f.shortTerm);
    const lt = num(f.longTerm);

    if (saleQty && soldDate) {
      lots.push(makeCapitalGain({
        security,
        saleDate: soldDate,
        quantity: saleQty,
        // Sale rate and amount are the two unheaded columns after Sale Quantity —
        // the banner `****Sale**** Quantity` names only the first of the three.
        saleRate: num(cells[header.columns.saleQty + 1]),
        saleAmount: num(cells[header.columns.saleQty + 2]),
        purchaseDate: buyDate,
        purchaseRate: buyRate,
        purchaseAmount: buyAmount,
        shortTerm: st,
        longTerm: lt,
        // The broker prints both dates, so days held is a SUBTRACTION rather than
        // a figure to trust or to guess. Every other capital-gain statement in
        // this book prints its own "Days Held" and this one does not.
        daysHeld: buyDate && soldDate
          ? Math.round((Date.parse(soldDate) - Date.parse(buyDate)) / 86400000)
          : null,
        source,
      }));
      continue;
    }

    // An OPEN lot: bought, dated, still held.
    //
    // Built through `makeOpenLot` so it carries the same identity every other
    // record does — the clean name, its securityKey and the ISIN split off the
    // end. Pushed as a bare `{security}` these read `Electronics Mart India
    // Limited-INE02YR01019` as the whole name, which keys to a security that
    // exists nowhere else and joins to no holding.
    if (buyQty && buyDate) {
      openLots.push(makeOpenLot({
        security, purchaseDate: buyDate, quantity: buyQty, unitCost: buyRate, totalCost: buyAmount, source,
      }));
    }
  }

  return { lots, openLots, expenses, owner, clientId, header };
}

/** Global Details Report → dated trades and the net position per security. */
function readLedger(sheet, source, warnings) {
  const header = findHeader(sheet.rows, LEDGER_COLUMNS, { minFields: 6, require: ["security", "tradeDate", "netQty"] });
  if (!header) {
    warn(warnings, "ledger-header-not-matched", "no Exchange / Security / Trade_Date header row in the Global Details sheet");
    return null;
  }
  if (header.missing?.length) warn(warnings, "columns-not-matched", header.missing.join(", "));

  const transactions = [];
  const position = new Map();
  let latest = null;

  for (const { fields: f } of readRows(sheet.rows, header)) {
    const { code, name } = splitScripCode(f.security);
    if (!name) continue;
    const date = toIso(f.tradeDate);
    const netQty = num(f.netQty);
    if (date && (!latest || date > latest)) latest = date;

    // Running position: every row's net quantity is a MOVEMENT (the opening row
    // included, which is why it is summed rather than assigned).
    const key = securityKeyOf(name);
    const p = position.get(name) ?? {
      security: name, securityKey: key, symbol: code,
      quantity: 0, asOf: null, opening: null,
    };
    p.quantity += netQty ?? 0;
    if (date && (!p.asOf || date > p.asOf)) p.asOf = date;

    if (IS_OPENING.test(f.narration ?? "")) {
      /**
       * THE OPENING ROW IS THE COST BASIS OF THE POSITION CARRIED FORWARD.
       *
       * `OPENING:CARRY FORWARD DATA FROM 2025 … 12500 141.8900 -1773625.00` —
       * quantity, average rate and total cost of the shares held at the start of
       * the year. The depository's own holding statement prints those same
       * shares with a rate and a value and NO COST, so this is the only place a
       * cost basis for that account exists.
       *
       * Kept as its own field rather than folded into the running total: it is a
       * balance on a date, not a movement, and the book's join checks the
       * quantity before it dares use the cost (see build-book).
       */
      p.opening = {
        date,
        quantity: netQty,
        unitCost: num(f.netRate),
        totalCost: num(f.netAmount) === null ? null : Math.abs(num(f.netAmount)),
      };
      position.set(name, p);
      continue;
    }
    position.set(name, p);

    const buyQty = num(f.buyQty);
    const saleQty = num(f.saleQty);
    const side = buyQty ? "buy" : saleQty ? "sell" : null;
    if (!side || !date) continue;
    transactions.push(makeTransaction({
      date,
      security: name,
      symbol: code,
      side,
      quantity: side === "buy" ? buyQty : saleQty,
      unitPrice: side === "buy" ? num(f.buyRate) : num(f.saleRate),
      exchange: String(f.exchange ?? "").replace(/_CASH$/i, "") || null,
      // The ledger prints its own net amount, signed as the account experiences
      // it — a purchase is money out and prints negative. Kept as the check.
      settlementAmount: num(f.netAmount) === null ? null : Math.abs(num(f.netAmount)),
      assetClass: "Equity",
      source,
    }));
  }
  return { transactions, positions: [...position.values()], asOf: latest };
}

// ── The document ────────────────────────────────────────────────────────────

export function extract({ grid, meta }) {
  const warnings = [];
  const source = meta.docKey;
  const sheets = grid.sheets ?? [];
  const flat = (grid.pages ?? []).map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");

  const isWorkbook = sheets.length > 0;
  const boName = (/BO\s*Name\s+([A-Z][A-Z .']{4,60}?)(?=\s{2,}|\s+Second|\n)/.exec(flat) || [])[1]?.trim() ?? null;
  const toName = (/^To,\s*\n\s*([A-Z][A-Z .']{4,60})$/m.exec(flat) || [])[1]?.trim() ?? null;
  const boId = (/BO\s*ID\s+(\d{10,})/.exec(flat) || [])[1]
    ?? (() => {
      const dp = /DP\s*ID:\s*(\d{6,})/.exec(flat);
      const cl = /Client\s*ID:\s*(\d{6,})/.exec(flat);
      return dp && cl ? `${dp[1]}${cl[1]}` : null;
    })();
  const tradingId = (/Trading\s*Id\s+(\d{3,})/.exec(flat) || [])[1] ?? null;

  // ── the workbooks ─────────────────────────────────────────────────────────
  if (isWorkbook) {
    const isPnl = sheets.some((s) => s.rows.some((r) => r.some((c) => /annual\s*p\s*&?\s*l/i.test(String(c ?? "")))))
      || /annual\s*p\s*&?\s*l/i.test(flat);
    const sheet = sheets[0];

    if (isPnl) {
      const p = readPnl(sheet, source, warnings);
      if (!p) return failed(meta, warnings, { accountNo: tradingId });
      return {
        provider: PROVIDER,
        accountNo: p.clientId ?? tradingId,
        owner: p.owner,
        asOf: toIso((/To\s*Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(flat) || [])[1]),
        periodFrom: toIso((/Year\s*:\s*(\d{4})/i.exec(flat) || [])[1] ? `01/04/${/Year\s*:\s*(\d{4})/i.exec(flat)[1] - 1}` : null),
        periodTo: toIso((/To\s*Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(flat) || [])[1]),
        engagement: "Execution",
        providerEngagement: "broker account — self-directed",
        holdings: [],
        totals: null,
        capitalGains: p.lots,
        expenses: p.expenses,
        /**
         * THE LOT REGISTER. Not holdings — these are acquisition records for
         * positions the DEPOSITORY statement values. Carried as their own fact so
         * the book can split unrealised gain short/long term for this account
         * and leave it absent for the eight that publish no such thing.
         */
        openLots: p.openLots,
        returns: [],
        sections: {
          realisedLots: {
            name: "realisedLots",
            rows: [["security", "isin", "purchaseDate", "saleDate", "quantity", "purchaseAmount", "shortTerm", "longTerm", "daysHeld"],
              ...p.lots.map((l) => [l.security, l.isin ?? "", l.purchaseDate, l.saleDate, l.quantity, l.purchaseAmount, l.shortTerm, l.longTerm, l.daysHeld])],
          },
          openLots: {
            name: "openLots",
            rows: [["security", "purchaseDate", "quantity", "unitCost", "totalCost"],
              ...p.openLots.map((l) => [l.security, l.purchaseDate, l.quantity, l.unitCost, l.totalCost])],
          },
          charges: {
            name: "charges",
            rows: [["detail", "amount"], ...p.expenses.map((e) => [e.detail, e.amount])],
          },
        },
        warnings,
        status: p.lots.length || p.openLots.length ? (warnings.length ? "partial" : "ok") : "failed",
      };
    }

    const l = readLedger(sheet, source, warnings);
    if (!l) return failed(meta, warnings, { accountNo: tradingId });
    return {
      provider: PROVIDER,
      accountNo: tradingId,
      owner: null,
      asOf: l.asOf,
      engagement: "Execution",
      providerEngagement: "broker account — self-directed",
      holdings: [],
      totals: null,
      transactions: l.transactions,
      /**
       * NET QUANTITY PER SECURITY, AS OF THE LEDGER'S LAST TRADE — and carried
       * apart from the holdings on purpose. The depository statement values this
       * account at 31/03/2026; this ledger runs to 01/07/2026 and disagrees with
       * it on quantity for five securities. Pairing July quantities with March
       * prices would produce a valuation on two dates at once that no statement
       * contains, so the two sit side by side and the cockpit says which is
       * which.
       */
      positionsAsOf: { asOf: l.asOf, positions: l.positions },
      returns: [],
      sections: {
        trades: {
          name: "trades",
          rows: [["date", "security", "side", "quantity", "rate", "netAmount"],
            ...l.transactions.map((t) => [t.date, t.security, t.side, t.quantity, t.unitPrice, t.printed.settlementAmount])],
        },
        positions: {
          name: "positions",
          rows: [["security", "scripCode", "netQuantity", "asOf"],
            ...l.positions.map((p) => [p.security, p.symbol ?? "", p.quantity, p.asOf])],
        },
      },
      warnings,
      status: l.transactions.length ? (warnings.length ? "partial" : "ok") : "failed",
    };
  }

  // ── the depository holding statement ──────────────────────────────────────
  if (/DEPOSITORY\s+HOLDING\s+STATEMENT/i.test(flat)) {
    const asOf = toIso((/DEPOSITORY HOLDING STATEMENT AS ON\s+(\d{2}\/\d{2}\/\d{4})/i.exec(flat) || [])[1]);
    const holdings = readDepositoryHoldings(flat, source, warnings);
    const printedTotal = readPrintedTotal(flat, holdings);
    return {
      provider: PROVIDER,
      accountNo: tradingId ?? boId,
      clientCode: boId,
      owner: boName,
      asOf,
      engagement: "Execution",
      providerEngagement: "CDSL demat account — self-directed",
      holdings,
      totals: makeTotals({ totalMarketValue: printedTotal, positionCount: holdings.length, source }),
      returns: [],
      sections: {
        holdings: {
          name: "holdings",
          rows: [["isin", "security", "assetClass", "quantity", "rate", "value"],
            ...holdings.map((h) => [h.isin ?? "", h.security, h.assetClass, h.quantity, h.marketPrice, h.printed.marketValue])],
        },
      },
      warnings,
      status: holdings.length ? (warnings.length ? "partial" : "ok") : "failed",
    };
  }

  // ── the CDSL transaction statement ────────────────────────────────────────
  if (/TRANSACTION\s+STATEMENT/i.test(flat)) {
    /**
     * READ FOR ITS BALANCES, NOT ITS MOVEMENTS.
     *
     * This is a DEPOSITORY statement: it records shares moving in and out of the
     * demat account, not trades. A share can be debited for a pledge, a rematting
     * or an off-market transfer with no purchase or sale behind it, and the
     * statement prints no price for any of them. The broker's own Global Details
     * ledger has the trades WITH rates, and precedence names it authoritative.
     *
     * What this document alone carries is the opening and closing balance per
     * ISIN over a window that ENDS AFTER the holding statement's date — evidence
     * about how stale that valuation is, which is why it is worth reading.
     */
    const balances = [];
    let isin = null;
    for (const line of flat.split("\n")) {
      const i = /ISIN\s*:\s*(IN[EF][0-9A-Z]{9})/.exec(line);
      if (i) { isin = i[1]; continue; }
      const b = /(\d{2}-\d{2}-\d{4})\s+(Opening|Closing)\s+Balance\s+([\d,]+\.\d{3})/i.exec(line);
      if (b && isin) balances.push({ isin, date: toIso(b[1]), kind: b[2].toLowerCase(), quantity: num(b[3]) });
    }
    if (!balances.length) warn(warnings, "balances-not-read", "no `<date> Opening/Closing Balance <qty>` row matched under an ISIN heading");
    const period = /FROM:\s*(\d{2}-\d{2}-\d{4})\s*TO:\s*(\d{2}-\d{2}-\d{4})/i.exec(flat);
    return {
      provider: PROVIDER,
      accountNo: null,
      clientCode: boId,
      owner: toName ?? boName,
      asOf: period ? toIso(period[2]) : null,
      periodFrom: period ? toIso(period[1]) : null,
      periodTo: period ? toIso(period[2]) : null,
      engagement: "Execution",
      providerEngagement: "CDSL demat account — self-directed",
      holdings: [],
      totals: null,
      returns: [],
      dematBalances: balances,
      sections: {
        balances: {
          name: "balances",
          rows: [["isin", "date", "kind", "quantity"], ...balances.map((b) => [b.isin, b.date, b.kind, b.quantity])],
        },
      },
      warnings,
      status: balances.length ? (warnings.length ? "partial" : "ok") : "failed",
    };
  }

  warn(warnings, "no-reader-for-report-type",
    "this engine reads LKP's depository holding statement, its CDSL transaction statement, the Annual P&L lot register and the Global Details ledger; this document is none of them");
  return failed(meta, warnings, { accountNo: tradingId, owner: boName });
}

function failed(meta, warnings, extra = {}) {
  return {
    provider: PROVIDER,
    accountNo: null,
    owner: null,
    asOf: meta.asOfDate ?? null,
    engagement: "Execution",
    holdings: [],
    totals: null,
    returns: [],
    warnings,
    status: "failed",
    ...extra,
  };
}
