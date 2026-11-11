// ── THE FAMILY'S INVESTMENT REGISTER, WHERE IT DATES MONEY NO STATEMENT DOES ──
//
//   *"whatever data we have available, we need to use that, right?"* — the
//   family, 11 Nov 2026, after an audit of every holding the book could not date
//   (Stage 10mv). *"Yes, apply all four."*
//
// `source/august-2026-f/NEW INVESTMENT SHEET.xlsx` is the family's own record of
// what they PAID: one row per payment, with its date, its holder and, sometimes,
// the units it bought. It is never a valuation and never a holding. It dates
// money in exactly four places the statements do not, and each is a committed
// entry below, read row by row and held to a second document:
//
//   • Sotefin Bharat — Ajay's two purchases, tied to every unit his ICICI demat
//     holds through the 10:1 bonus the company's prospectus records;
//   • V.E.C 128005, Goldstandard 100023 and 100022 — the payment that opened each
//     mandate, on the inception date the manager itself prints, reconciled to the
//     manager's own 1 April 2026 capital balance;
//   • National Stock Exchange — Ankita's two payments for 15,000 shares, tied to
//     her 75,000 through the bonus MOPWM's transaction report records.
//
// A row is found by sheet and serial number and must carry the name and holder
// written here, or the build stops: a register edited under it is a question
// for the family, never a guess. Nothing here reads a name it was not told to.
import fs from "node:fs";
import path from "node:path";
import { readSpreadsheet } from "../ingest/lib/sheet.mjs";
import { serialToIso } from "./reviewPrivateRead.mjs";

export const REGISTER = "source/august-2026-f/NEW INVESTMENT SHEET.xlsx";

export const readRegisterWorkbook = (root = ".") => readSpreadsheet(fs.readFileSync(path.join(root, REGISTER)));

const fail = (msg) => { throw new Error(`investment register: ${msg}`); };
const num = (s) => Number(String(s ?? "").replace(/,/g, ""));

/** Every payment row of one sheet, with its 1-based row number. Subtotals carry no serial number. */
function sheetRows(wb, sheet) {
  const s = wb.sheets.find((x) => x.name.trim() === sheet) ?? fail(`no sheet "${sheet}"`);
  const header = s.rows.findIndex((r) => r.includes("INVESTMENT NAME"));
  if (header < 0) fail(`sheet "${sheet}" has no INVESTMENT NAME header`);
  const cols = s.rows[header];
  const at = (r, label) => { const i = cols.indexOf(label); return i < 0 ? "" : String(r[i] ?? "").trim(); };
  return s.rows.map((r, i) => ({ row: i + 1, sr: at(r, "SR. NO."), name: at(r, "INVESTMENT NAME"), under: at(r, "INVESTMENT DONE UNDER").toUpperCase(),
    date: serialToIso(at(r, "INVESTMENT DATE")), amount: num(at(r, "INVESTMENT AMOUNT")), detail: at(r, "VALUATION AT THE TIME OF INVESTMENT") }))
    .filter((x, i) => i > header && x.sr && x.name);
}

/** ONE ROW, by sheet and serial number, carrying exactly the name and holder given. */
export function registerRow(wb, { sheet, sr, name, under }) {
  const hits = sheetRows(wb, sheet).filter((x) => x.sr === sr);
  if (hits.length !== 1) fail(`${sheet} serial ${sr}: ${hits.length} rows, not one`);
  const r = hits[0];
  if (!name.test(r.name)) fail(`${sheet} row ${r.row} reads "${r.name}", not ${name}`);
  if (r.under !== under) fail(`${sheet} row ${r.row} is under ${r.under}, not ${under}`);
  if (!r.date || !(r.amount > 0)) fail(`${sheet} row ${r.row} carries no date or amount`);
  return { sheet, ...r };
}

/** Every payment row in the register under `under` whose name matches — what a "this is the only one" claim is held to. */
export function registerRowsFor(wb, nameRe, under) {
  return wb.sheets.flatMap((s) => (s.rows.some((r) => r.includes("INVESTMENT NAME")) ? sheetRows(wb, s.name.trim()) : [])
    .filter((x) => nameRe.test(x.name) && x.under === under && x.amount > 0).map((x) => ({ sheet: s.name.trim(), ...x })));
}

// ── 1. A MANDATE'S OPENING PAYMENT ──────────────────────────────────────────
//
// Each of these mandates' statements start on 1 April 2026 with an opening
// capital balance: the money paid in before then is in the balance and on no
// dated row, so the record "does not reach inception" and no money-weighted
// return could be solved. The register prints the one payment that opened each,
// on the day the manager's own fact sheet gives as inception. `build-book`
// lists it only where it reconciles to that opening balance (`inceptionMoves`).
export const REGISTER_INCEPTIONS = Object.freeze([
  { accountId: "v-e-c-assago-capital-management-llp-128005", sheet: "ATJ-AAJ FUND HOUSE", sr: "21", name: /^VEC ASSAGO PMS$/, under: "AJAY", manager: /V\.?\s*E\.?\s*C\s+ASSAGO/i },
  { accountId: "goldstandard-wealth-private-limited-100023", sheet: "ATJ-AAJ FUND HOUSE", sr: "22", name: /^ARISTOS EQUITY PORTFOLIO$/, under: "AJAY", manager: /ARISTOS|GOLD\s*STANDARD/i },
  { accountId: "goldstandard-wealth-private-limited-100022", sheet: "FUND HOUSE", sr: "28", name: /^Aristos Equity Portfolio - GoldStandard$/, under: "ANKITA", manager: /ARISTOS|GOLD\s*STANDARD/i },
]);

/**
 * The most a mandate's opening balance may fall short of the register's payment
 * and still be that payment: the TDS a manager nets out of capital in the months
 * before its first statement (₹7,050 – ₹21,531 here, at most 0.03%). A larger gap
 * is money that moved, and the payment is not listed.
 */
export const OPENING_TOLERANCE = 0.001;

export function registerInceptions(wb) {
  return REGISTER_INCEPTIONS.map((spec) => {
    const r = registerRow(wb, spec);
    const all = registerRowsFor(wb, spec.manager, spec.under);
    if (all.length !== 1) fail(`${spec.accountId}: ${all.length} register payments under ${spec.under} to this manager, not one`);
    return { accountId: spec.accountId, date: r.date, amount: r.amount, label: r.name, register: { sheet: r.sheet, row: r.row } };
  });
}

const dayBefore = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);

/**
 * THE REGISTER'S OPENING PAYMENT, RECONCILED TO THE MANAGER'S OPENING BALANCE.
 *
 * Listed only where all of it holds: the payment is on the inception date the
 * manager prints; no dated capital row of the account's own falls before its
 * first capital register opens; and that register's Opening Balance is the
 * payment less at most `OPENING_TOLERANCE` of it. The shortfall is listed as an
 * outflow the day before the register opens, its date ASSUMED (`assumedDate`):
 * the manager's own rows of that kind are TDS transfers out of capital, and no
 * statement dates these. Returns the moves and the date the record then provably
 * reaches, or the reason it is not listed.
 */
export function inceptionMoves(inc, { account, allIssues, typed }) {
  if (!account?.inceptionDate) return { reason: "the manager prints no inception date to hold the register's payment to" };
  if (account.inceptionDate !== inc.date) return { reason: `the register's payment is dated ${inc.date}, the manager's inception ${account.inceptionDate}` };
  const opens = allIssues.filter((d) => d.reportType === "capital-register")
    .map((d) => (d.cashFlows ?? []).find((c) => c.kind === "capital-register" && /^opening balance/i.test(c.description ?? "") && Number.isFinite(c.balance) && c.date))
    .filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const open = opens[0];
  if (!open) return { reason: "no capital register prints an opening balance to reconcile the payment to" };
  const early = typed.filter((m) => m.date < open.date);
  if (early.length) return { reason: `${early.length} dated capital row(s) before ${open.date} are already on the record` };
  const residual = Math.round((inc.amount - open.balance) * 100) / 100;
  if (residual < 0 || residual > inc.amount * OPENING_TOLERANCE) {
    return { reason: `the ${open.date} opening balance (${open.balance}) is ${residual} short of the register's ${inc.amount}, more than TDS netting explains` };
  }
  const base = { accountId: inc.accountId, units: null, security: null, securityKey: null };
  const moves = [{ ...base, date: inc.date, direction: "in", label: inc.label, amount: inc.amount, invested: inc.amount, fromRegister: inc.register }];
  if (residual > 0) {
    moves.push({ ...base, date: dayBefore(open.date), direction: "out", label: `Capital netted out before the ${open.date} opening balance`,
      amount: residual, invested: null, fromRegister: inc.register,
      assumedDate: `the manager's opening balance on ${open.date} is ₹${residual.toLocaleString("en-IN")} below the ₹${inc.amount.toLocaleString("en-IN")} paid on ${inc.date} (its own rows of this kind are TDS transfers out of capital); no statement dates it, so it is placed on ${dayBefore(open.date)}` });
  }
  return { moves, reach: dayBefore(open.date), open, residual };
}

// ── 2. SOTEFIN BHARAT: TWO PURCHASES AND A BONUS ────────────────────────────
//
// Ajay's ICICI demat holds 1,71,879 Sotefin Bharat shares and prints no cost.
// The register prints two payments, each with its units and rate; the company's
// Red Herring Prospectus (BSE, 9 Jul 2026) names "Ajay T Jaisinghani" as the
// allottee of 11,364 shares at ₹1,100 on 20 Jul 2024, of 1,13,640 bonus shares
// on 25 Jun 2025 (10:1), and of 46,875 at ₹160 in the pre-IPO placement. The
// register's Sotefin Parking row is that first allotment, under the company's
// earlier name. 11,364 + 1,13,640 + 46,875 = 1,71,879: every unit held.
const SOTEFIN_RHP = "https://www.bseindia.com/downloads/ipo/Sotefin%20Bharat%20Ltd%20-%20RHP&GID_150720262012.zip";
export const REGISTER_ALLOTMENTS = Object.freeze([{
  isin: "INE12Z301012", ownerId: "ajay-jaisinghani", security: "Sotefin Bharat",
  rows: [
    { sheet: "AJAY SIR - AARTI", sr: "14a", name: /^SOTEFIN PARKING PVT LTD$/, under: "AJAY", units: /^([\d,]+) EQUITY SHARES OF RS\. ([\d,]+) EACH/ },
    { sheet: "AJAY SIR - AARTI", sr: "14b", name: /^SOTEFIN BHARAT LTD$/, under: "AJAY", units: /^([\d,]+) SHARES AT SUBSCRIPTION RATE OF RS\. ([\d,]+) EACH/ },
  ],
  bonus: { date: "2025-06-25", per: 10, units: 113640,
    source: `Sotefin Bharat Limited, Red Herring Prospectus (BSE, 9 Jul 2026), bonus allotment of 25 Jun 2025: "Ajay T Jaisinghani 1,13,640" — ${SOTEFIN_RHP}` },
}]);

/**
 * A register purchase record for a holding of `isin` held by `ownerId`, or null
 * where no entry covers it. Every row's units × rate must be its amount to the
 * rupee, and the bonus must be exactly its ratio on the units held before it.
 */
export function registerAllotment(wb, { isin, ownerId }) {
  const spec = REGISTER_ALLOTMENTS.find((s) => s.isin === isin && s.ownerId === ownerId);
  if (!spec) return null;
  const buys = spec.rows.map((x) => {
    const r = registerRow(wb, x);
    const m = x.units.exec(r.detail) ?? fail(`${x.sheet} row ${r.row} prints no units and rate ("${r.detail}")`);
    const units = num(m[1]), rate = num(m[2]);
    if (Math.abs(units * rate - r.amount) > 1) fail(`${x.sheet} row ${r.row}: ${units} × ${rate} is not its ${r.amount}`);
    return { ...r, units, rate };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const before = buys.filter((b) => b.date < spec.bonus.date).reduce((s, b) => s + b.units, 0);
  if (before * spec.bonus.per !== spec.bonus.units) fail(`${spec.security}: a ${spec.bonus.per}:1 bonus on ${before} units is not the ${spec.bonus.units} recorded`);
  const events = [...buys.map((b) => ({ date: b.date, units: b.units })), { date: spec.bonus.date, units: spec.bonus.units }]
    .sort((a, b) => a.date.localeCompare(b.date));
  let held = 0;
  const unitRecord = events.map((e) => ({ date: e.date, units: (held += e.units) }));
  return { spec, buys, unitRecord, quantity: held, costBasis: buys.reduce((s, b) => s + b.amount, 0) };
}

// ── 3. NATIONAL STOCK EXCHANGE: ANKITA'S TWO PAYMENTS ───────────────────────
//
// The review prints one cost, ₹12.085 Cr, for the family's 2,00,000 NSE shares
// and a month span, "Dec-22 - Aug-23". The register dates Ankita's part: Chryseum
// Advisors' rows 28a (₹64,12,500, "15000 EQUITY SHARES OF NSE") and 28b
// (₹3,63,51,213), which its own subtotal row adds to ₹4,27,63,713. MOPWM's
// transaction report then carries those 15,000 into her Motilal demat on 27 Jul
// 2023 and 60,000 bonus shares onto them on 2 Nov 2024 — her 75,000. Her cost is
// what she paid, and Ajay's the review's total less it (`reviewHolders.mjs`).
export const REGISTER_REVIEW_FLOWS = Object.freeze([{
  key: "national-stock-exchange-of-india", owner: "ankita-jaisinghani", shares: 15000,
  rows: [
    { sheet: "PVT INV", sr: "28a", name: /^CHRYSEUM ADVISORS LLP$/, under: "ANKITA", detail: /^15000 EQUITY SHARES OF NSE$/ },
    { sheet: "PVT INV", sr: "28b", name: /^CHRYSEUM ADVISORS LLP$/, under: "ANKITA" },
  ],
  subtotal: { sheet: "PVT INV", name: /^CHRYSEUM ADVISORS LLP - TOTAL$/ },
  // MOPWM's transaction report, Direct Equity: the units the payments bought, then the bonus on them.
  custody: { isin: "INE721I01024", transfer: { date: "2023-07-27", qty: 15000 }, bonus: { date: "2024-11-02", qty: 60000 } },
}]);

/** The register's dated purchases behind a review line, or null where no entry covers it. */
export function registerReviewFlows(wb, { key, owner, quantity, mopwm }) {
  const spec = REGISTER_REVIEW_FLOWS.find((s) => s.key === key && s.owner === owner);
  if (!spec) return null;
  const rows = spec.rows.map((x) => {
    const r = registerRow(wb, x);
    if (x.detail && !x.detail.test(r.detail)) fail(`${x.sheet} row ${r.row} reads "${r.detail}", not ${x.detail}`);
    return r;
  });
  // THE SUBTOTAL THE TWO ROWS SIT UNDER: one counterparty's one purchase, not two.
  const s = wb.sheets.find((x) => x.name.trim() === spec.subtotal.sheet);
  const cols = s.rows[s.rows.findIndex((r) => r.includes("INVESTMENT NAME"))];
  const totals = s.rows.filter((r) => spec.subtotal.name.test(String(r[cols.indexOf("INVESTMENT NAME")] ?? "").trim()));
  if (totals.length !== 1) fail(`${spec.subtotal.sheet}: ${totals.length} subtotal rows for ${spec.subtotal.name}`);
  const paid = rows.reduce((t, r) => t + r.amount, 0);
  if (Math.abs(num(totals[0][cols.indexOf("INVESTMENT AMOUNT")]) - paid) > 1) fail(`${key}: the rows add to ${paid}, not their subtotal`);
  // THE UNITS: the report's own rows, owner and ISIN, must carry the 15,000 in and the bonus on them.
  const own = (mopwm?.rows ?? []).filter((x) => x.ownerId === owner && /National Stock Exchange/i.test(x.security));
  const has = (e) => own.some((x) => x.date === e.date && x.qty === e.qty && x.amount === 0);
  if (!has(spec.custody.transfer) || !has(spec.custody.bonus)) fail(`${key}: MOPWM's transaction report does not carry ${owner}'s transfer and bonus rows`);
  const walked = spec.shares + spec.custody.bonus.qty;
  if (walked !== quantity) return { reason: `the register's ${spec.shares} shares and the ${spec.custody.bonus.qty}-share bonus make ${walked}, not the ${quantity} held` };
  return {
    paid,
    flows: rows.map((r) => ({ date: r.date, kind: "purchase", amount: r.amount, units: null, rate: null, reviewRow: null, register: { sheet: r.sheet, row: r.row } })),
    note: `dated by the family's investment register (${rows[0].sheet} rows ${rows.map((r) => r.row).join(" and ")}: ₹${paid.toLocaleString("en-IN")} for ${spec.shares.toLocaleString("en-IN")} shares), carried to ${quantity.toLocaleString("en-IN")} by the ${spec.custody.bonus.qty.toLocaleString("en-IN")}-share bonus of ${spec.custody.bonus.date} in MOPWM's transaction report`,
  };
}
