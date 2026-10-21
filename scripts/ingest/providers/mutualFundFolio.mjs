// MUTUAL-FUND FOLIO STATEMENTS — read in full, then sorted by WHOSE THEY ARE.
//
// Five statements, four AMCs. The book's standing note said all five belong to
// `HOPE INDIA TRUST` and were therefore out of scope. Reading them says
// otherwise on one of the five:
//
//   ABSL  1038104611   HOPE INDIA TRUST        Status : Trust
//   ABSL  1019265797   HOPE INDIA TRUST        Status : Trust
//   Kotak 4295974      Hope India Trust        Tax Status : Trust
//   Mirae 70413280453  HOPE INDIA TRUST        Status TRUST
//   HDFC  16180583/58  Bharat A Jaisinghani    Tax Status : Individual
//                      Joint 1: ANKITA JAISINGHANI
//
// The HDFC folio is held by two people already in this book, jointly, with both
// their PANs on the page. It is not the trust's and never was — it was excluded
// on a premise nobody had checked, which is exactly what "verify the source
// before trusting the calculation" is for. It carries no value today (both
// schemes redeemed to zero units), and that is a MEASURED zero with a reason,
// not an absence.
//
// ── HOW THE SORTING WORKS, AND WHY IT IS NOT A GUESS ────────────────────────
//
// Every one of these statements prints the holder's TAX STATUS in words —
// `Status : Trust`, `Tax Status : Individual` — because the AMC has to. That
// printed word is the signal, not an inference from the name, and not the PAN:
// two of these mask it (`XXXXX4894A`), so a PAN-only rule would have failed on
// exactly the statements it was needed for. Where a PAN IS printed in full it is
// carried too, and `shared/owners.mjs` resolves the holder on it.
//
// A non-individual holder that resolves to no canonical owner carries
// `excludedFromBook` with the reason. One that DOES resolve — Hope India Trust,
// registered in shared/owners.mjs by the family's decision of 21 Oct 2026 — is
// in the book as its own entity; its printed tax status stays on the document
// (`providerEngagement`). Nothing filters it downstream; it simply
// belongs to nobody this book knows, and the build report says so rather than
// dropping an account silently.
//
// ── FOUR AMCs, THREE LAYOUTS ────────────────────────────────────────────────
//
//   ABSL      a PORTFOLIO SUMMARY table: scheme, units, NAV, value, cost
//   HDFC      per-scheme blocks closed by
//   Kotak     `Market Value of Balance Units at NAV of <nav> on <date> (INR) : <v>`
//   Mirae     `ISIN : … Balance Units : …` then `Current Value : … Investment Value : …`
//
// All three are located by ANCHOR TEXT rather than by position, so an AMC
// changing its column order surfaces as "no scheme block matched" instead of as
// units read out of the NAV column.
//
// ── AND TWO MORE: THE DISTRIBUTOR'S PARTIAL TRANSACTION LISTING ─────────────
//
// The October 2026 drop brought two folios as a "Partial Transaction Listing" —
// the registrar's extract of the transactions put through ONE distributor —
// rather than as the AMC's account statement, and neither matched any of the
// four layouts above:
//
//   ABSL   1019265797 (CAMS, through LKP)     one block per scheme, headed
//          `B153DZ-<scheme> NAV as on 05-10-2026 : 100.1950`, closed by
//          `Current Unit Balance : … Current Investment Value : … Cost Value : …`
//   ICICI  14320536   (through Motilal Oswal) the ICICI ledger above, but its
//          ACCOUNT SUMMARY row prints code, name and figures on ONE line, and
//          its two ledgers belong to schemes the summary does not list
//
// Both print the same disclaimer — the listing "may not reflect the actual unit
// balance in the folio account" — exactly as the August Kotak listing for the
// trust's folio does, and are read the way that one is: the figures are the
// ones printed, and the CAMS `Current Unit Balance` is the folio's own (it is
// printed apart from the `… through this Intermediary` balance beneath it, and
// is the figure the running Balance Units column walks to).
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, makeCashFlow } from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";
import { panHolderType, resolveOwner } from "../../../shared/owners.mjs";

export const PROVIDER = "Mutual fund folio";

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const num = (s) => parseNum(s);

/** The AMC, off its own statement — the same names classify.mjs already knows. */
const AMCS = [
  [/Aditya\s+Birla\s+Sun\s+Life/i, "Aditya Birla Sun Life Mutual Fund"],
  [/Kotak\s+Mahindra\s+Mutual\s+Fund|Kotak\s+Mutual\s+Fund|kotakmf\.com/i, "Kotak Mahindra Mutual Fund"],
  [/Mirae\s+Asset/i, "Mirae Asset Mutual Fund"],
  // ICICI Prudential BEFORE HDFC: its statement prints the holder's bank as
  // "HDFC Bank Ltd", which is not the AMC.
  [/ICICI\s+Prudential|icicipruamc\.com|iciciprumf\.com/i, "ICICI Prudential Mutual Fund"],
  [/HDFC\s+(?:Mutual\s+Fund|Asset\s+Management)|hdfcfund\.com/i, "HDFC Mutual Fund"],
];

/**
 * Strip the HTML the Mirae statement leaves in the PDF text layer —
 * `<font size="1.5" …><b>Scheme name</b></font>` — plus the footnote asterisk
 * every AMC appends to a scheme that has been renamed. Markup that never
 * rendered is not part of a security's name, and a name carrying it keys to
 * something that matches nothing.
 */
const cleanName = (s) => String(s ?? "")
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .replace(/\s*\*+\s*$/, "")
  .trim();

// ── The three layouts ───────────────────────────────────────────────────────

/**
 * HDFC / Kotak: `<code> / <scheme>* - <ISIN> UCC : <ucc>` opening a block that
 * `Market Value of Balance Units at NAV of <nav> on <date> (INR) : <value>`
 * closes. Balance units come from the block's last `Balance Units` figure, which
 * is what the transaction ledger leaves standing.
 */
const BLOCK_HEAD = /^\s*[A-Z0-9]{2,8}\s*\/\s*(.+?)\s*-\s*(IN[EF][0-9A-Z]{9})\b/;
const BLOCK_VALUE = /Market Value of Balance Units at NAV of\s*([\d,]+\.?\d*)\s*on\s*(\d{2}\/\d{2}\/\d{4})\s*\(INR\)\s*:\s*([\d,]+\.?\d*)/i;
const CLOSING_UNITS = /Closing (?:Unit )?Balance(?: as on \d{2}\/\d{2}\/\d{4})?\s*:?\s*([\d,]+\.\d{3})/i;

/**
 * ABSL: one row per scheme under `PORTFOLIO SUMMARY`.
 * `ABSL Liquid Fund - Direct-Growth 1,752.565 30-Jun-2026 453.2856 794,412.48 537,146.28 0.00`
 *
 * The scheme name WRAPS (`… - IDCW Daily -` / `Reinvestment`), so the row is
 * anchored on its numeric tail and the name is whatever precedes it.
 */
const ABSL_ROW = new RegExp(
  String.raw`^(.*?)\s+([\d,]+\.\d{3})\s+` +                   // 1 scheme, 2 units
  String.raw`(\d{1,2}-[A-Za-z]{3}-\d{4})\s+` +                // 3 NAV date
  String.raw`([\d,]+\.\d{2,})\s+` +                           // 4 NAV
  String.raw`([\d,]+\.\d{2})\s+` +                            // 5 current value
  String.raw`([\d,]+\.\d{2})\s+` +                            // 6 cost
  String.raw`([\d,]+\.\d{2})\s*$`,                            // 7 IDCW earned
);
/** `B153GZ Aditya Birla Sun Life Liquid Fund - Growth-Direct Plan - INF209K01VA3` */
const ABSL_ISIN = /\b(IN[EF][0-9A-Z]{9})\b/;

/** Mirae: `ISIN : INF769K01CM1 Balance Units : 316.190` */
const MIRAE_ISIN = /ISIN\s*:\s*(IN[EF][0-9A-Z]{9})\s*(?:Balance\s*Units\s*:?\s*([\d,]+\.?\d*))?/i;
const MIRAE_VALUE = /Current Value\s*:?\s*\(?[`₹]?\)?\s*([\d,]+\.?\d*)/i;
const MIRAE_COST = /Investment Value\s*:?\s*\(?[`₹]?\)?\s*([\d,]+\.?\d*)/i;
const MIRAE_NAV = /NAV\s*:?\s*\(?[`₹]?\)?\s*([\d,]+\.?\d*)\s*\(as on\s*(\d{2}\/\d{2}\/\d{4})\)/i;

function readBlockLayout(lines, source) {
  const out = [];
  const heads = lines.map((l, i) => (BLOCK_HEAD.test(l) ? i : -1)).filter((i) => i >= 0);
  const seen = new Set();
  for (let k = 0; k < heads.length; k++) {
    const i = heads[k];
    const head = BLOCK_HEAD.exec(lines[i]);
    /**
     * THE BLOCK RUNS TO THE NEXT SCHEME HEADING, NOT A FIXED NUMBER OF LINES.
     *
     * A fixed window looked sufficient on the two HDFC schemes, which hold
     * nothing and close within eight lines of their heading. Kotak's liquid fund
     * has thirty days of daily IDCW reinvestment between its heading and its
     * `Market Value` line, so a 14-line window found no value, skipped the block
     * as a continuation-page repeat, and reported the folio at Rs 0 — with
     * Rs 7,73,610.75 printed inside it.
     *
     * The heading DOES repeat on a continuation page, which is why the ISIN is
     * deduped rather than the window being narrowed to exclude it.
     */
    const window = lines.slice(i, heads[k + 1] ?? lines.length).join("\n");
    const v = BLOCK_VALUE.exec(window);
    if (!v || seen.has(head[2])) continue;
    seen.add(head[2]);
    // The LAST balance figure in the block is what the ledger left standing.
    const balances = [...window.matchAll(new RegExp(CLOSING_UNITS.source, "gi"))];
    const available = /Available Units to Redeem\s*:\s*([\d,]+\.\d{3})/.exec(window);
    const lien = /Total Units Under Lien\s*:\s*([\d,]+\.\d{3})/.exec(window);
    // Opening units are not closing units. Available units only witness the
    // whole holding when the same closing line explicitly reports no lien.
    const units = balances.length ? num(balances[balances.length - 1][1])
      : available && lien && num(lien[1]) === 0 ? num(available[1]) : null;
    out.push(makeHolding({
      security: cleanName(head[1]),
      isin: head[2],
      assetClass: "Mutual Fund",
      quantity: units,
      marketPrice: num(v[1]),
      marketValue: num(v[3]),
      priceAsOn: toIso(v[2]),
      source,
    }));
  }
  return out;
}

// Some new folios have a complete multi-year ledger and no financial movement
// during this FY. A reconciled prior balance is enough to establish the FY's
// units; it does not require treating old switches as new external cash.
// Since Stage 10ev the ledger itself is read (layout 7, `schemeLedgerFlows`)
// and carries the printed opening; this remains the fallback for a statement
// whose blocks print no dated movement and no ledger warning.
function staticBlockOpenings(lines, holdings, from, to) {
  if (!from || !to) return [];
  const year = Number(to.slice(0,4)) - (to.slice(5,7) < '04' ? 1 : 0);
  const start = `${year}-04-01`;
  if (from > start) return [];
  const groups = new Map(); let current = null;
  for (const line of lines) {
    const head = BLOCK_HEAD.exec(line);
    if (head) { current = head[2]; if (!groups.has(current)) groups.set(current, []); }
    else if (current) groups.get(current).push(line);
  }
  const out = [];
  for (const h of holdings) {
    const rows = groups.get(h.isin);
    if (!rows || h.quantity == null) return [];
    let last = null;
    for (let i=0;i<rows.length;i++) {
      const dated = /^\s*(\d{2}\/\d{2}\/\d{4})(?:\s+(.+))?\s*$/.exec(rows[i]);
      if (!dated) continue;
      const on = toIso(dated[1]);
      const description = dated[2] ?? '';
      const administrative = /^(?:\*{3})?(?:Address Updated|KYC\b)/;
      if (administrative.test(description) || (!description && [rows[i-1],rows[i+1]].some(s => administrative.test(s ?? '')))) continue;
      if (on >= start) return []; // cash, reinvestment or units need their full reader
      // NAV, amount, price, signed unit movement and resulting unit balance.
      const tail = /([\d,]+\.\d+)\s+(\(?[\d,]+\.\d+\)?)\s+([\d,]+\.\d+)\s+(\(?[\d,]+\.\d{3}\)?)\s+([\d,]+\.\d{3})\s*$/.exec(description);
      if (tail) last = { date:on, balance:num(tail[5]) };
    }
    if (!last) {
      const opening = /Opening (?:Unit )?Balance as on (\d{2}\/\d{2}\/\d{4})\s+([\d,]+\.\d{3})/.exec(rows.join('\n'));
      if (opening) last = { date:toIso(opening[1]), balance:num(opening[2]) };
    }
    if (!last || last.date >= start || Math.abs(last.balance - h.quantity) > .0005) return [];
    out.push(makeCashFlow({ date:last.date, security:h.security, isin:h.isin, kind:'opening-units',
      description:'Prior unit balance; complete statement has no FY financial movements', units:last.balance, balance:last.balance }));
  }
  return out;
}

function readAbslLayout(lines, source) {
  const out = [];
  const start = lines.findIndex((l) => /PORTFOLIO SUMMARY/i.test(l));
  if (start < 0) return out;
  // The ISIN is printed BELOW the summary, on the scheme's own detail heading.
  const isinFor = (name) => {
    const key = name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14);
    for (const l of lines) {
      const m = ABSL_ISIN.exec(l);
      if (m && l.toLowerCase().replace(/[^a-z]/g, "").includes(key)) return m[1];
    }
    return null;
  };
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (/^TOTAL\s*:/i.test(raw)) break;
    const m = ABSL_ROW.exec(raw);
    if (!m) continue;
    const name = cleanName(m[1]);
    if (!name) continue;
    out.push(makeHolding({
      security: name,
      isin: isinFor(name),
      assetClass: "Mutual Fund",
      quantity: num(m[2]),
      marketPrice: num(m[4]),
      totalCost: num(m[6]),
      marketValue: num(m[5]),
      priceAsOn: toIso(m[3]),
      source,
    }));
  }
  return out;
}

function readMiraeLayout(lines, source, warnings) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = MIRAE_ISIN.exec(lines[i]);
    if (!m) continue;
    const isin = m[1];
    let name = null;
    for (let k = i - 1; k >= 0 && k >= i - 4 && !name; k--) {
      const c = cleanName(lines[k]);
      if (c.length >= 8 && !/^ISIN|^Folio|^Trade Date/i.test(c)) name = c;
    }
    const window = lines.slice(i, i + 8).join(" ");
    const nav = MIRAE_NAV.exec(window);
    if (!name) { warn(warnings, "scheme-name-not-read", `ISIN ${isin} has no readable scheme name above it`); continue; }
    out.push(makeHolding({
      security: name,
      isin,
      assetClass: "Mutual Fund",
      quantity: num(m[2]) ?? num((/Balance\s*Units\s*:?\s*([\d,]+\.?\d*)/i.exec(window) || [])[1]),
      marketPrice: nav ? num(nav[1]) : null,
      totalCost: num((MIRAE_COST.exec(window) || [])[1]),
      marketValue: num((MIRAE_VALUE.exec(window) || [])[1]),
      priceAsOn: nav ? toIso(nav[2]) : null,
      source,
    }));
  }
  return out;
}

/**
 * ICICI Prudential: `<code> / <ISIN> / <scheme>` heads each scheme's ledger, and
 * the ACCOUNT SUMMARY prints `<NAV> <NAV date> <units> <cost> <IDCW reinvested>
 * <IDCW paid> <current value>` on one line. The summary row is matched on its
 * numeric tail; the ISIN and the full name come from the ledger heading whose
 * scheme code the summary row's wrapped name starts with.
 */
const ICICI_HEAD = /^\s*(\d{2,6})\s*\/\s*(IN[EF][0-9A-Z]{9})\s*\/\s*(.+?)\s*$/;
const ICICI_SUMMARY = /^\s*([\d,]+\.\d{2,})\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+([\d,]+\.\d{3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;
/**
 * One dated ledger row: `<date> <transaction type> <amount> <NAV> <price>
 * <units> <balance units>`. The amount and the units are PARENTHESISED on a
 * redemption — `(15,303,436.91)` … `(1,030,482.325)` — which is the sign.
 *
 * The transaction type is anything that does not start with a digit, matched
 * lazily so the numeric tail decides where it ends: `Purchase Appln :
 * 0000010371 - INP000004409` carries digits of its own, and the narrower
 * `Purchase[^\d]*?` this replaced refused it.
 */
const ICICI_ROW = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(\D.*?)\s+(\(?[\d,]+\.\d{2}\)?)\s+([\d,]+\.\d{2,})\s+([\d,]+\.\d{2,})\s+(\(?[\d,]+\.\d{3}\)?)\s+([\d,]+\.\d{3})\s*$/;
/**
 * A row whose TYPE CELL WRAPPED. The PDF text layer puts the type's first line
 * and the figures on one line and the date — vertically centred in the taller
 * cell — on the next, with the rest of the type and the balance:
 *
 *   Redemption - ELECTRONIC PAYMENT - (16,054,245.36) 28.1423 28.1423 (570,472.417)
 *   15/04/2021 HDFCR52021042088639021 less STT 0.000
 *
 * Read as two lines, the second is a dated movement that matches nothing and
 * withholds the whole ledger. The pair is re-joined into the one row it is.
 */
const ICICI_WRAP_HEAD = /^\s*((?:Purchase|Redemption|IDCW|Switch)\b.*?)\s+(\(?[\d,]+\.\d{2}\)?)\s+([\d,]+\.\d{2,})\s+([\d,]+\.\d{2,})\s+(\(?[\d,]+\.\d{3}\)?)\s*$/i;
const ICICI_WRAP_TAIL = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s*([\d,]+\.\d{3})\s*$/;
/** `*** STT Paid *** (153.04)` — the tax withheld from the redemption above it. */
const ICICI_STT = /^\s*\*{3}\s*STT Paid\s*\*{3}\s*\(?([\d,]+\.\d{2})\)?\s*$/i;
/** `*** TDS … ***` under an IDCW row — the tax withheld from the distribution. */
const ICICI_TDS = /^\s*\*{3}\s*TDS\b.*?\*{3}\s*\(?([\d,]+\.\d{2})\)?\s*$/i;
/**
 * The ACCOUNT SUMMARY row printed on ONE line, code first — the distributor
 * listing's form (layout 6):
 *   `EDWRG Balanced Advantage Fund Growth 76.30 30-Sep-2026 0.000 0.00 0.00 0.00 0.00`
 * NAV, NAV date, units, cost, IDCW reinvested, IDCW paid, current value — the
 * same seven figures the wrapped form prints, in the same order.
 */
const ICICI_SUMMARY_INLINE = /^\s*([A-Z0-9]{2,8})\s+(\D.*?)\s+([\d,]+\.\d{2,})\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+([\d,]+\.\d{3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;
/** Stamp duty on mutual-fund purchases runs from 1 July 2020 — the statement prints the date itself. */
const STAMP_DUTY_FROM = "2020-07-01";

function readIciciLayout(lines, source) {
  const out = [];
  const heads = new Map();
  for (const l of lines) {
    const m = ICICI_HEAD.exec(l);
    if (m && !heads.has(m[1])) heads.set(m[1], { isin: m[2], name: cleanName(m[3]) });
  }
  if (!heads.size) return out;
  for (let i = 0; i < lines.length; i++) {
    const m = ICICI_SUMMARY.exec(lines[i]);
    if (!m) continue;
    // The scheme code opens the wrapped name on the line above.
    const code = (/^\s*(\d{2,6})\b/.exec(lines[i - 1] ?? "") || [])[1];
    const head = code ? heads.get(code) : null;
    if (!head) continue;
    out.push(makeHolding({
      security: head.name,
      isin: head.isin,
      assetClass: "Mutual Fund",
      quantity: num(m[3]),
      marketPrice: num(m[1]),
      totalCost: num(m[4]),
      marketValue: num(m[7]),
      priceAsOn: toIso(m[2]),
      source,
    }));
  }
  return out;
}

/**
 * Layout 6 — ICICI Prudential's DISTRIBUTOR LISTING. The ACCOUNT SUMMARY row
 * prints its scheme code and name on the same line as its figures:
 *
 *   ACCOUNT SUMMARY AS ON 01-OCT-2026
 *   EDWRG Balanced Advantage Fund Growth 76.30 30-Sep-2026 0.000 0.00 0.00 0.00 0.00
 *   Total : 0.000 0.00 0.00 0.00 0.00
 *
 * The code here is the AMC's alphabetic scheme code, not the numeric one that
 * heads a ledger (`8177 / INF109K015O6 / …`), so a ledger is joined only where
 * the codes are the same; otherwise the scheme is the name the row prints and
 * no ISIN, because none is printed beside it. Read only between the summary
 * heading and its `Total :` line — the wrapped form above starts with the NAV
 * and never matches this.
 */
function readIciciInlineLayout(lines, source) {
  const out = [];
  const start = lines.findIndex((l) => /ACCOUNT SUMMARY/.test(l));
  if (start < 0) return out;
  const heads = new Map();
  for (const l of lines) {
    const m = ICICI_HEAD.exec(l);
    if (m && !heads.has(m[1])) heads.set(m[1], { isin: m[2], name: cleanName(m[3]) });
  }
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*Total\s*:/i.test(lines[i])) break;
    const m = ICICI_SUMMARY_INLINE.exec(lines[i]);
    if (!m) continue;
    const head = heads.get(m[1]);
    out.push(makeHolding({
      security: head?.name ?? cleanName(m[2]),
      isin: head?.isin ?? null,
      assetClass: "Mutual Fund",
      quantity: num(m[5]),
      marketPrice: num(m[3]),
      totalCost: num(m[6]),
      marketValue: num(m[9]),
      priceAsOn: toIso(m[4]),
      source,
    }));
  }
  return out;
}

/**
 * One ICICI ledger, read row by row from its `<code> / <ISIN> / <scheme>`
 * heading to the next scheme's heading (or `Non Financial Transaction`).
 *
 * Pure: it returns what it read and the dated lines it could NOT read, in
 * printed order, and leaves the warnings to the caller — the same ledger is read
 * once to establish a closed scheme's units and once to publish its flows, and
 * an unread movement must be reported once.
 */
function iciciLedger(lines, i) {
  const h = ICICI_HEAD.exec(lines[i]);
  let opening = null;
  const rows = [];
  for (let k = i + 1; k < lines.length; k++) {
    let l = lines[k];
    if (/^Non Financial Transaction/i.test(l)) break;
    if (ICICI_HEAD.test(l) && ICICI_HEAD.exec(l)[2] !== h[2]) break;
    const ob = /Opening Balance as on\s*(\d{2}\/\d{2}\/\d{4})\s+([\d,]+\.\d{3})/i.exec(l);
    if (ob && opening === null) opening = num(ob[2]);
    // Re-join a wrapped type cell (see ICICI_WRAP_HEAD) before reading the row.
    const wrap = ICICI_WRAP_HEAD.exec(l);
    const tail = wrap && !ICICI_ROW.test(lines[k + 1] ?? "") ? ICICI_WRAP_TAIL.exec(lines[k + 1] ?? "") : null;
    if (wrap && tail) {
      l = `${tail[1]} ${wrap[1]} ${tail[2]} ${wrap[2]} ${wrap[3]} ${wrap[4]} ${wrap[5]} ${tail[3]}`.replace(/\s+/g, " ");
      k += 1;
    }
    const p = ICICI_ROW.exec(l);
    if (/^\s*\d{2}\/\d{2}\/\d{4}\s+/.test(l) && !p) {
      const rest = l.replace(/^\s*\d{2}\/\d{2}\/\d{4}\s*/, '');
      const administrative = /^\*{3}(?:Address Updated|KYC\b)/;
      if (administrative.test(rest) || (/^(?:Holder\*{3})?$/.test(rest)
        && [lines[k - 1], lines[k + 1]].some(s => administrative.test(s ?? '')))) continue;
      rows.push({ unsupported: true });
      continue;
    }
    if (!p) continue;
    const type = p[2].trim();
    const kind = /^Purchase\b/i.test(type) ? "purchase"
      : /^IDCW\s+Reinvest/i.test(type) ? "reinvest"
      : /^Redemption\b/i.test(type) ? "redeem"
      : null;
    if (!kind) { rows.push({ unsupported: true }); continue; }
    const next = lines[k + 1] ?? "";
    const g = /Gross Amount:\s*Rs\.?\s*([\d,]+(?:\.\d+)?)\/?-?;?\s*Stamp Duty charges Levied\s*~?\s*([\d,]+\.\d{2})/i.exec(next);
    const stt = ICICI_STT.exec(next);
    const tds = ICICI_TDS.exec(next);
    rows.push({ kind, date: toIso(p[1]), type, net: num(p[3]), nav: num(p[4]), units: num(p[6]), balance: num(p[7]),
      gross: g ? num(g[1]) : null, stamp: g ? num(g[2]) : null,
      stt: stt ? num(stt[1]) : null, tds: tds ? num(tds[1]) : null });
  }
  return { isin: h[2], name: h[3].trim(), opening, rows };
}

/**
 * A scheme the folio's ledger records and its ACCOUNT SUMMARY does not list.
 *
 * The Motilal Oswal listing for folio 14320536 prints two ledgers — ICICI
 * Prudential Arbitrage Fund's IDCW and Growth plans, bought in 2019–20 and
 * redeemed in 2020–21 — and a summary row for a third scheme with no ledger. A
 * ledger that ends at a printed `0.000` balance is a CLOSED holding, and its
 * zero value is computed from that zero, not assumed: units 0 × any NAV is 0.
 * Its flows need it — a redemption's proceeds belong to a scheme the account
 * held.
 *
 * A ledger that ends at a NON-zero balance with no summary row has no NAV on the
 * page to value it at, so it is carried with its units and NO value, and says
 * so; the NAV of its last transaction is not a mark (see folioLedger.mjs).
 */
function iciciLedgerHoldings(lines, holdings, source, warnings) {
  const out = [];
  const seen = new Set(holdings.map((h) => h.isin).filter(Boolean));
  for (let i = 0; i < lines.length; i++) {
    const h = ICICI_HEAD.exec(lines[i]);
    if (!h || seen.has(h[2])) continue;
    seen.add(h[2]);
    const ledger = iciciLedger(lines, i);
    const last = [...ledger.rows].reverse().find((r) => !r.unsupported);
    const units = last ? last.balance : ledger.opening;
    if (units == null) continue;
    if (units !== 0) {
      warn(warnings, "scheme-not-valued", `${cleanName(h[3])}: the ledger ends at ${units} units and the account summary prints no NAV or value for it`);
    }
    // A ledger CLOSED by a redemption carries that redemption's NAV, dated to
    // the day it was struck: the fund pricing units the family no longer holds,
    // which is how the book recognises a redemption to nil (`isRedeemedToNil`)
    // and keeps the row off every current-holdings surface. It is not a current
    // mark — `priceAsOn` says when it was — and on zero units it values nothing.
    const closedBy = units === 0 && last?.kind === "redeem" && last.nav != null ? last : null;
    out.push(makeHolding({
      security: cleanName(h[3]),
      isin: h[2],
      assetClass: "Mutual Fund",
      quantity: units,
      marketPrice: closedBy ? closedBy.nav : null,
      priceAsOn: closedBy ? closedBy.date : null,
      marketValue: units === 0 ? 0 : null,
      source,
    }));
  }
  return out;
}

/**
 * ICICI Prudential's dated ledger, published only where the statement's own
 * figures tie, row by row and as a whole:
 *
 *   PURCHASE   the printed gross less the printed stamp duty is the net, and
 *              net = units × NAV within the precision the two are printed to.
 *              Before 1 July 2020 no stamp duty was levied and the statement
 *              prints no gross line: the printed amount is then both gross and
 *              net, and the row carries NO charge (`expenses: null`), which is
 *              how `shared/fifo.mjs` reads a row that prints no charge line.
 *   IDCW       `IDCW Reinvested @ Rs.0.0177 per unit` — amount = units × NAV.
 *   REINVEST   An ALLOTMENT, not a contribution: the units were bought with the
 *              fund's own distribution, so no capital came in from outside. The
 *              FIFO engine takes an allotment as a lot at its own amount, which
 *              is the cost of a reinvested unit; nothing that measures external
 *              capital counts it.
 *   REDEMPTION printed as `(net) NAV price (units)`, with `*** STT Paid ***
 *              (stt)` on the next line: units × NAV is the gross, and the gross
 *              less the STT is the printed net. Published as the net paid out,
 *              negative, with the STT as its charge — folioLedger.mjs's shape.
 *
 * The running balance walks from the printed opening, every row reaches its
 * printed Balance Units, and the last balance is the holding's own units. Any
 * failure publishes nothing for that scheme and says why.
 */
function iciciLedgerFlows(lines, holdings, warnings) {
  const flows = [];
  for (let i = 0; i < lines.length; i++) {
    const h = ICICI_HEAD.exec(lines[i]);
    if (!h) continue;
    const holding = holdings.find((x) => x.isin === h[2]);
    if (!holding) continue;
    const { opening: bal, rows } = iciciLedger(lines, i);
    for (const r of rows) {
      if (r.unsupported) warn(warnings, 'unsupported-movement', `${h[3].trim()}: a dated movement is outside the verified purchase / IDCW-reinvestment / redemption layout`);
    }
    if (!rows.length) continue;
    // The code names what was withheld: a purchase that does not tie withholds
    // the purchases this reader has always published; any other row, the ledger.
    const fail = (why, r) => {
      warn(warnings, !r || r.unsupported || r.kind === "purchase" ? "purchases-not-published" : "ledger-not-published", `${h[3].trim()}: ${why}`);
      return true;
    };
    const tie = (units, nav, amount) => Math.abs(units * nav - amount) <= units * 0.00005 + nav * 0.0005 + 0.01;
    let failed = false;
    let running = bal ?? 0;
    for (const r of rows) {
      if (r.unsupported) { failed = fail('dated ledger contains an unread movement', r); break; }
      if (r.kind === "purchase") {
        const preStamp = r.date < STAMP_DUTY_FROM && r.gross == null && r.stamp == null;
        if (!preStamp && (r.gross == null || r.stamp == null)) { failed = fail(`${r.date}: no printed gross or stamp duty`, r); break; }
        if (!preStamp && Math.abs(r.gross - r.stamp - r.net) > 0.011) { failed = fail(`${r.date}: gross ${r.gross} less stamp ${r.stamp} is not the printed net ${r.net}`, r); break; }
        if (r.net <= 0 || r.units <= 0) { failed = fail(`${r.date}: a purchase prints a negative amount or units`, r); break; }
        if (!tie(r.units, r.nav, r.net)) { failed = fail(`${r.date}: ${r.units} units × ${r.nav} is not ${r.net}`, r); break; }
        if (preStamp) r.gross = r.net;
      } else if (r.kind === "reinvest") {
        if (r.net <= 0 || r.units <= 0) { failed = fail(`${r.date}: an IDCW reinvestment prints a negative amount or units`, r); break; }
        if (!tie(r.units, r.nav, r.net)) { failed = fail(`${r.date}: ${r.units} units × ${r.nav} is not ${r.net}`, r); break; }
      } else {
        if (r.net >= 0 || r.units >= 0) { failed = fail(`${r.date}: a redemption prints a positive amount or units`, r); break; }
        if (!tie(-r.units, r.nav, -r.net + (r.stt ?? 0))) {
          failed = fail(`${r.date}: ${-r.units} units × ${r.nav} is not the net ${-r.net}${r.stt != null ? ` plus STT ${r.stt}` : ""}`, r); break;
        }
      }
      running = Math.round((running + r.units) * 1000) / 1000;
      if (Math.abs(running - r.balance) > 0.0005) { failed = fail(`${r.date}: running units ${running} do not reach the printed balance ${r.balance}`, r); break; }
    }
    if (failed) continue;
    if (holding.quantity != null && Math.abs(running - holding.quantity) > 0.0005) {
      fail(`the ledger ends at ${running} units against the summary's ${holding.quantity}`);
      continue;
    }
    for (const r of rows) {
      if (r.kind === "purchase") {
        flows.push(makeCashFlow({
          date: r.date,
          description: r.type,
          security: holding.security,
          kind: "contribution",
          amount: r.gross,
          netAmount: r.net,
          expenses: r.stamp,
          units: r.units,
          balance: r.balance,
          notes: r.stamp != null ? `allotted at NAV ${r.nav}; stamp duty ${r.stamp}`
            : `allotted at NAV ${r.nav}; no stamp duty line (levied only from 1 July 2020)`,
        }));
      } else if (r.kind === "reinvest") {
        flows.push(makeCashFlow({
          date: r.date,
          description: r.type,
          security: holding.security,
          kind: "allotment",
          amount: r.net,
          netAmount: r.net,
          expenses: r.tds,
          units: r.units,
          balance: r.balance,
          notes: `IDCW reinvested at NAV ${r.nav}${r.tds != null ? `; TDS ${r.tds}` : ""}`,
        }));
      } else {
        flows.push(makeCashFlow({
          date: r.date,
          description: r.type,
          security: holding.security,
          kind: "withdrawal",
          amount: r.net,
          netAmount: r.net,
          expenses: r.stt,
          units: r.units,
          balance: r.balance,
          notes: `redeemed at NAV ${r.nav}${r.stt != null ? `; STT ${r.stt}` : ""}`,
        }));
      }
    }
  }
  return flows;
}

/**
 * Layout 5 — CAMS's PARTIAL TRANSACTION LISTING (ABSL folio 1019265797,
 * through LKP Wealth Advisory). One block per scheme:
 *
 *   B153DZ-Aditya Birla Sun Life Liquid Fund - Daily IDCW-Direct Plan NAV as on 05-10-2026 : 100.1950
 *   Date Transaction Type  Amount in INR  Price in INR  Number of Units  Balance Units
 *   01-09-2026 IDCW Reinvestment @ Rs.0.02589107 per unitLess TDS 179.95 100.1950 1.796 7,724.755
 *   01-09-2026 *** TDS on Above *** 20.00
 *   …
 *   Current Unit Balance : 7,756.542 Current Investment Value : 777,166.73 Cost Value : 777,961.25
 *   Current Unit Balance through this Intermediary : 33.583
 *
 * The heading REPEATS at the top of each continuation page, so blocks are keyed
 * on the scheme code and a repeat continues the block rather than opening one.
 * The holding is the closing line's three figures as printed, at the heading's
 * NAV and NAV date — the same columns the ABSL account statement's PORTFOLIO
 * SUMMARY carries. No ISIN is printed anywhere in the listing, so none is set.
 */
const CAMS_HEAD = /^\s*([A-Z0-9]{4,8})-(.+?)\s+NAV as on\s+(\d{2}-\d{2}-\d{4})\s*:\s*([\d,]+\.\d+)\s*$/;
const CAMS_ROW = /^\s*(\d{2}-\d{2}-\d{4})\s+(\D.*?)\s+(\(?[\d,]+\.\d{2}\)?)\s+([\d,]+\.\d{2,})\s+(\(?[\d,]+\.\d{3}\)?)\s+([\d,]+\.\d{3})\s*$/;
const CAMS_TDS = /^\s*(\d{2}-\d{2}-\d{4})\s+\*{3}\s*TDS on Above\s*\*{3}\s+([\d,]+\.\d{2})\s*$/i;
const CAMS_CLOSE = /^\s*Current Unit Balance\s*:\s*([\d,]+\.\d{3})\s+Current Investment Value\s*:\s*([\d,]+\.\d{2})(?:\s+Cost Value\s*:\s*([\d,]+\.\d{2}))?/i;

function camsBlocks(lines) {
  const blocks = new Map();
  let current = null;
  for (const l of lines) {
    const h = CAMS_HEAD.exec(l);
    if (h) {
      if (!blocks.has(h[1])) blocks.set(h[1], { code: h[1], name: cleanName(h[2]), navDate: toIso(h[3]), nav: num(h[4]), lines: [], close: null });
      current = blocks.get(h[1]);
      continue;
    }
    if (!current) continue;
    const c = CAMS_CLOSE.exec(l);
    if (c) { current.close = { units: num(c[1]), value: num(c[2]), cost: c[3] ? num(c[3]) : null }; current = null; continue; }
    current.lines.push(l);
  }
  return [...blocks.values()];
}

function readCamsListingLayout(lines, source, warnings) {
  const out = [];
  for (const b of camsBlocks(lines)) {
    if (!b.close) { warn(warnings, "closing-balance-not-read", `${b.name}: no \`Current Unit Balance\` line closes the block`); continue; }
    // The printed value is used, as every layout here uses it; a value that is
    // not the units at the heading's NAV is reported rather than corrected.
    if (b.nav != null && Math.abs(b.close.units * b.nav - b.close.value) > b.close.units * 0.00005 + b.nav * 0.0005 + 0.01) {
      warn(warnings, "value-does-not-tie", `${b.name}: ${b.close.units} units × NAV ${b.nav} is not the printed value ${b.close.value}`);
    }
    out.push(makeHolding({
      security: b.name,
      isin: null,
      assetClass: "Mutual Fund",
      quantity: b.close.units,
      marketPrice: b.nav,
      totalCost: b.close.cost,
      marketValue: b.close.value,
      priceAsOn: b.navDate,
      source,
    }));
  }
  return out;
}

/**
 * The listing's dated rows. This drop's listing carries one kind of movement —
 * a DAILY IDCW REINVESTMENT, each followed by the TDS withheld from it:
 *
 *   01-09-2026 IDCW Reinvestment @ Rs.0.02589107 per unitLess TDS 179.95 100.1950 1.796 7,724.755
 *   01-09-2026 *** TDS on Above *** 20.00
 *
 * Each is an ALLOTMENT (see `iciciLedgerFlows`): units bought with the fund's own
 * distribution, at the printed amount, with the TDS line carried as its charge
 * — as the STT is on a redemption. Published only where every row ties: amount
 * = units × price, and the Balance Units column walks row to row and ends at
 * the block's `Current Unit Balance`. The listing prints NO opening balance, so
 * the walk starts from the balance the first row implies; that implied figure
 * is never published. A purchase, redemption or switch in this layout has not
 * been seen in a CAMS listing, so it is reported and withholds the scheme's
 * record rather than being read by a guessed rule.
 */
function camsListingFlows(lines, holdings, warnings) {
  const flows = [];
  for (const b of camsBlocks(lines)) {
    const holding = holdings.find((h) => h.security === b.name);
    if (!holding || !b.close) continue;
    const rows = [];
    for (let k = 0; k < b.lines.length; k++) {
      const l = b.lines[k];
      if (!/^\s*\d{2}-\d{2}-\d{4}\s+/.test(l)) continue;
      const tds = CAMS_TDS.exec(l);
      if (tds) {
        const prior = rows[rows.length - 1];
        if (prior && !prior.unsupported && prior.date === toIso(tds[1]) && prior.tds == null) { prior.tds = num(tds[2]); continue; }
        rows.push({ unsupported: true, line: l.trim() });
        continue;
      }
      const m = CAMS_ROW.exec(l);
      const type = m ? m[2].replace(/(\S)(Less TDS)/, "$1 $2").trim() : null;
      if (!m || !/^IDCW\s+Reinvest/i.test(type)) { rows.push({ unsupported: true, line: l.trim() }); continue; }
      rows.push({ date: toIso(m[1]), type, amount: num(m[3]), price: num(m[4]), units: num(m[5]), balance: num(m[6]), tds: null });
    }
    if (!rows.length) continue;
    const fail = (why) => { warn(warnings, "ledger-not-published", `${b.name}: ${why}`); return true; };
    let failed = false;
    let running = null;
    for (const r of rows) {
      if (r.unsupported) {
        warn(warnings, "unsupported-movement", `${b.name}: a dated movement is outside the verified IDCW-reinvestment layout — ${r.line}`);
        failed = fail("dated ledger contains an unread movement"); break;
      }
      if (r.amount <= 0 || r.units <= 0) { failed = fail(`${r.date}: an IDCW reinvestment prints a negative amount or units`); break; }
      if (Math.abs(r.units * r.price - r.amount) > r.units * 0.00005 + r.price * 0.0005 + 0.01) { failed = fail(`${r.date}: ${r.units} units × ${r.price} is not ${r.amount}`); break; }
      running = Math.round(((running ?? r.balance - r.units) + r.units) * 1000) / 1000;
      if (Math.abs(running - r.balance) > 0.0005) { failed = fail(`${r.date}: running units ${running} do not reach the printed balance ${r.balance}`); break; }
    }
    if (failed) continue;
    if (Math.abs(running - b.close.units) > 0.0005) { fail(`the ledger ends at ${running} units against the printed Current Unit Balance ${b.close.units}`); continue; }
    for (const r of rows) {
      flows.push(makeCashFlow({
        date: r.date,
        description: r.type,
        security: holding.security,
        kind: "allotment",
        amount: r.amount,
        netAmount: r.amount,
        expenses: r.tds,
        units: r.units,
        balance: r.balance,
        notes: `IDCW reinvested at ${r.price}${r.tds != null ? `; TDS ${r.tds} (\`*** TDS on Above ***\`)` : ""}`,
      }));
    }
  }
  return flows;
}

// ── Layout 7: THE AMC'S OWN UNIT LEDGER, PRINTED INSIDE EACH SCHEME BLOCK ────
//
// The HDFC and Kotak account statements (CAMS-serviced) print, under each
// `<code> / <scheme> - <ISIN>` heading, `Opening Balance as on <date> <units>`
// and then every movement: purchase, switch in and out, IDCW reinvestment and
// redemption, as `<date> <type> <NAV> <amount> <price> <units> <balance>` —
// amount and units parenthesised when they leave. A since-inception statement
// (HDFC 15644806: 17-APR-2019 to 31-AUG-2026) prints the folio's whole history,
// including the schemes it has since redeemed to nil. Stage 10em read only the
// last balance from it (`staticBlockOpenings`); the dated rows are read here.
//
// The text layer breaks rows four ways, each seen on the archived statements:
//
//   Gross Purchase Physical 25,000,000.00      a purchase or switch-in levied
//   Less: Stamp Duty 1,249.94                   stamp duty prints its GROSS and
//   03/08/2022 Net Purchase 301.183 24,998,750.06 …  the duty ABOVE the net row (HDFC);
//   07/07/2020 Switch-In - From … 424,978.75 …  Kotak prints the duty BELOW it,
//   Less: Stamp Duty 21.25                      and the gross is net + duty;
//   29/05/2025 153.314 (4,045,420.78) …         the type cell wraps BELOW its figures,
//   Switch out - To HDFC Arbitrage Fund …       or its last word (`… , less` / `STT`);
//   *** STT Paid *** (40.45)                    and the STT / TDS line follows the row.
//
// What each row is (the kinds the book already consumes — see iciciLedgerFlows):
//
//   PURCHASE     contribution: gross (net + stamp duty), net, the duty as its charge.
//   REDEMPTION   withdrawal: the printed amount is what was PAID — units × price
//                is the gross, and gross less the STT line is the printed amount
//                ("grossed upward to provide for the deduction of STT").
//   IDCW         allotment: units bought with the fund's own distribution.
//   SWITCH       a switch between two schemes OF THIS FOLIO moves no money in or
//                out: both legs are carried as `reclassification` (the class-switch
//                convention, classSwitch.mjs), the out-leg at the rupees paid out,
//                the in-leg at its gross, which is the same rupees. The in-leg is
//                credited on the switch-out scheme's settlement day ("switch-in will
//                be processed based on the settlement cycle of the switch-out
//                scheme"), so the two legs can carry DIFFERENT printed dates; the
//                out-leg's `settlementDate` is the in-leg's printed date, which is
//                how the pair is found again downstream. A switch-in whose out-leg
//                this statement does not print (Kotak 7125255's Overnight Fund) is
//                money from outside the record, carried as a contribution under
//                its own words, as Invesco's `Lateral shift in` is.
//
// Published per document only where EVERY row ties: amount = units × price
// (within the price's printed precision), gross − duty = net, units × price −
// STT = the paid amount, the running units reach every printed balance from the
// printed opening, the last balance is the scheme's closing units, and every
// switch-out finds its switch-in. One failure publishes no row of the
// document's ledger and says why — a half-read history reads like a whole one.
const LD = String.raw`\d{2}\/\d{2}\/\d{4}`;
const LN = String.raw`[\d,]+\.\d+`;
const LU = String.raw`\(?[\d,]+\.\d{3}\)?`;
const LEDGER_ROW = new RegExp(String.raw`^(${LD})\s+(\D.*?)\s+(${LN})\s+(\(?${LN}\)?)\s+(${LN})\s+(${LU})\s+([\d,]+\.\d{3})$`);
const LEDGER_ROW_UNTYPED = new RegExp(String.raw`^(${LD})\s+(${LN})\s+(\(?${LN}\)?)\s+(${LN})\s+(${LU})\s+([\d,]+\.\d{3})$`);
const LEDGER_OPEN = new RegExp(String.raw`^Opening (?:Unit )?Balance as on (${LD})\s+([\d,]+\.\d{3})$`, "i");
const LEDGER_GROSS = /^Gross\s+(.+?)\s+([\d,]+\.\d{2})$/i;
const LEDGER_STAMP = /^Less\s*:\s*Stamp Duty\s+([\d,]+\.\d{2})$/i;
const LEDGER_STT = /^\*{3}\s*STT Paid\s*\*{3}\s*\(?([\d,]+\.\d{2})\)?$/i;
const LEDGER_TDS = /^\*{3}\s*TDS on (?:Cumulative IDCW|Above)\s*\*{3}\s*([\d,]+\.\d{2})?$/i;
const LEDGER_ADMIN = new RegExp(String.raw`^${LD}\s+\*{3}.*\*{3}$`);
/**
 * An IDCW wholly withheld as TDS: NAV, price and the unchanged balance, no
 * amount and no units (Kotak 4295974, 1–4 Jun 2026), its TDS on the next line.
 */
const LEDGER_ROW_NIL = new RegExp(String.raw`^(${LD})\s+(IDCW Reinvest.*?)\s+(${LN})\s+(${LN})\s+([\d,]+\.\d{3})$`, "i");
/** `16/09/2026 IDCW Reinvested 16-SEP-2026_Duplicate Request received 640.290` — a notice, not a movement; its balance is checked. */
const LEDGER_NOTICE = new RegExp(String.raw`^(${LD})\s+(.*?Duplicate Request received)\s+([\d,]+\.\d{3})$`, "i");
/** A non-dated line that still carries a movement word and an amount is a row this reader lost. */
const LEDGER_STRAY = /\b(?:Purchase|Redemption|Switch|Reinvest(?:ed|ment)?\s*@|STT|Stamp Duty|TDS)\b.*\d[\d,]*\.\d{2}\b/i;
const furnitureFree = (s) => s.replace(/\s*EISC-\S+.*$/, "").replace(/\s+/g, " ").trim();
const decimalsOf = (s) => (/\.(\d+)\)?$/.exec(String(s)) || [, ""])[1].length;
const unitsTie = (units, priceText, amount) => {
  const price = num(priceText);
  return Math.abs(Math.abs(units) * price - Math.abs(amount))
    <= Math.abs(units) * 0.5 * 10 ** -decimalsOf(priceText) + price * 0.0005 + 0.011;
};
const kindOfType = (type) => /^(?:Net\s+)?Purchase\b/i.test(type) ? "purchase"
  : /^\*?Redemption\b/i.test(type) ? "redeem"
  : /^IDCW\s+Reinvest/i.test(type) ? "reinvest"
  : /^(?:Net\s+)?Switch[- ]?In\b/i.test(type) ? "switch-in"
  : /^\*?Switch[- ]?Out\b/i.test(type) ? "switch-out"
  : null;
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/**
 * The units the ACCOUNT SUMMARY prints for a scheme valued at `nav` on `navDate`
 * (summed over its rows — Kotak splits one scheme into `Lump sum` and `IDCW
 * REINVESTMENT`), or null. `<NAV date> <NAV> [NA] <units> <cost> <value>`.
 */
function accountSummaryUnits(lines, nav, navDate) {
  if (nav === null || nav === undefined || !navDate) return null;
  const start = lines.findIndex((l) => /^\s*Account Summary as on/i.test(l));
  if (start < 0) return null;
  let units = null;
  for (let i = start + 1; i < lines.length && !BLOCK_HEAD.test(lines[i]); i++) {
    const m = /(\d{2}-[A-Za-z]{3}-\d{4})\s+([\d,]+\.\d+)\s+(?:NA\s+)?([\d,]+\.\d{3})\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/.exec(lines[i]);
    if (m && toIso(m[1]) === navDate && num(m[2]) === nav) units = Math.round(((units ?? 0) + num(m[3])) * 1000) / 1000;
  }
  return units;
}

/** Every scheme block's lines, keyed by ISIN; a repeated heading continues its block. */
function schemeLedgerBlocks(lines) {
  const blocks = new Map();
  let cur = null, closed = null;
  for (const raw of lines) {
    const l = furnitureFree(raw);
    if (!l) continue;
    const h = BLOCK_HEAD.exec(l);
    if (h) {
      if (!blocks.has(h[2])) blocks.set(h[2], { isin: h[2], name: cleanName(h[1]), lines: [], idcw: null });
      cur = blocks.get(h[2]);
      closed = null;
      continue;
    }
    if (/^Non Financial Transaction/i.test(l)) { cur = null; closed = null; continue; }
    // The block's own IDCW figure for the period, printed under its closing.
    const idcw = /^IDCW reinvested \/ paid \(INR\)\s*:\s*([\d,]+\.\d{2})\b/i.exec(l);
    if (idcw && closed && closed.idcw === null) { closed.idcw = num(idcw[1]); continue; }
    if (!cur) continue;
    if (/^(?:Available Units to Redeem|Market Value of Balance Units)\b/i.test(l)) { closed = cur; cur = null; continue; }
    cur.lines.push(l);
  }
  return [...blocks.values()];
}

/** One block's opening and rows, in printed order. `unsupported` names a line it could not read. */
function parseSchemeLedger(block) {
  const out = { opening: null, rows: [], unsupported: [] };
  const L = block.lines;
  let pendingGross = null;
  for (let k = 0; k < L.length; k++) {
    const l = L[k];
    const open = LEDGER_OPEN.exec(l);
    if (open) {
      if (out.opening) out.unsupported.push(`a second opening balance: ${l}`);
      else out.opening = { date: toIso(open[1]), units: num(open[2]) };
      continue;
    }
    const gross = LEDGER_GROSS.exec(l);
    if (gross) {
      if (pendingGross) out.unsupported.push(`a gross line with no row: ${pendingGross.line}`);
      pendingGross = { label: gross[1], amount: num(gross[2]), stamp: null, line: l };
      continue;
    }
    const stamp = LEDGER_STAMP.exec(l);
    if (stamp) {
      const last = out.rows.at(-1);
      if (pendingGross && pendingGross.stamp === null) pendingGross.stamp = num(stamp[1]);
      else if (last && last.stampAfter === null && last.gross === null) last.stampAfter = num(stamp[1]);
      else out.unsupported.push(`a stamp duty line with no row: ${l}`);
      continue;
    }
    const stt = LEDGER_STT.exec(l);
    if (stt) {
      const last = out.rows.at(-1);
      if (last && last.stt === null) last.stt = num(stt[1]);
      else out.unsupported.push(`an STT line with no row: ${l}`);
      continue;
    }
    const tds = LEDGER_TDS.exec(l);
    if (tds) {
      let amount = tds[1];
      if (!amount && /^[\d,]+\.\d{2}$/.test(L[k + 1] ?? "")) { amount = L[k + 1]; k += 1; }
      const last = out.rows.at(-1);
      if (amount && last && last.tds === null) last.tds = num(amount);
      else out.unsupported.push(`a TDS line with no row: ${l}`);
      continue;
    }
    if (LEDGER_ADMIN.test(l)) continue;
    const notice = LEDGER_NOTICE.exec(l);
    if (notice) { out.rows.push({ date: toIso(notice[1]), type: notice[2], kind: "notice", balance: num(notice[3]) }); continue; }
    // Tried only after the full row: five figures also end in "number number units".
    const nil = LEDGER_ROW.test(l) || LEDGER_ROW_UNTYPED.test(l) ? null : LEDGER_ROW_NIL.exec(l);
    if (nil) {
      out.rows.push({ date: toIso(nil[1]), type: nil[2].trim(), kind: "reinvest", nav: num(nil[3]), amount: null, priceText: nil[4],
        price: num(nil[4]), units: null, balance: num(nil[5]), gross: null, stampBefore: null, stampAfter: null, stt: null, tds: null });
      continue;
    }
    let m = LEDGER_ROW.exec(l);
    let date, type, nav, amount, price, units, balance;
    if (m) {
      [, date, type, nav, amount, price, units, balance] = m;
      // `… , less` / `STT`: the type's last word wrapped below the figures.
      if (/^STT$/i.test(L[k + 1] ?? "")) { type = `${type} ${L[k + 1]}`; k += 1; }
    } else if ((m = LEDGER_ROW_UNTYPED.exec(l))) {
      [, date, nav, amount, price, units, balance] = m;
      const next = L[k + 1] ?? "";
      if (!kindOfType(next)) { out.unsupported.push(`a row whose type is not printed: ${l}`); continue; }
      type = next;
      k += 1;
    } else {
      if (new RegExp(`^${LD}\\b`).test(l) || LEDGER_STRAY.test(l)) out.unsupported.push(l);
      continue;
    }
    const kind = kindOfType(type);
    if (!kind) { out.unsupported.push(l); continue; }
    if (pendingGross && !(kind === "purchase" || kind === "switch-in")) {
      out.unsupported.push(`a gross line above a ${kind}: ${pendingGross.line}`);
      pendingGross = null;
    }
    out.rows.push({
      date: toIso(date), type: type.replace(/\s+/g, " ").trim(), kind,
      nav: num(nav), amount: num(amount), priceText: price, price: num(price), units: num(units), balance: num(balance),
      gross: pendingGross?.amount ?? null, stampBefore: pendingGross?.stamp ?? null,
      stampAfter: null, stt: null, tds: null,
    });
    pendingGross = null;
  }
  if (pendingGross) out.unsupported.push(`a gross line with no row: ${pendingGross.line}`);
  return out;
}

/**
 * Verify one scheme's rows (see the layout note above) and return them with
 * their gross and charges resolved, or the reason they do not tie. `rows` are
 * in printed order; a ledger printed newest-first is walked oldest-first.
 */
function walkSchemeLedger(name, opening, printed, closingUnits) {
  if (!opening) return { why: "no printed opening balance" };
  let rows = printed;
  const dates = rows.map((r) => r.date);
  const ascending = dates.every((d, i) => i === 0 || dates[i - 1] <= d);
  const descending = dates.every((d, i) => i === 0 || dates[i - 1] >= d);
  if (!ascending && descending) rows = [...rows].reverse();
  else if (!ascending) return { why: "dated rows are in neither date order" };
  let running = opening.units;
  const out = [];
  for (const r of rows) {
    const at = `${r.date} ${r.type}`;
    if (r.kind === "notice") {
      if (Math.abs(running - r.balance) > 0.0005) return { why: `${at}: a notice printing ${r.balance} units where the ledger stands at ${running}` };
      continue;
    }
    if (r.units === null && r.amount === null) {
      // An IDCW wholly withheld as TDS prints no amount and no units — and, on
      // ABSL, no balance either; where one is printed it must not have moved.
      if (r.kind !== "reinvest" || r.tds === null) return { why: `${at}: no amount or units printed` };
      if (r.balance !== null && Math.abs(running - r.balance) > 0.0005) return { why: `${at}: no units printed, yet the balance reads ${r.balance}` };
      out.push({ ...r, charges: r.tds });
      continue;
    }
    let gross = null, stamp = null, charges = null;
    if (r.kind === "purchase" || r.kind === "switch-in") {
      if (r.amount <= 0 || r.units <= 0) return { why: `${at}: prints a negative amount or units` };
      stamp = r.stampBefore ?? r.stampAfter;
      gross = r.gross !== null ? r.gross : stamp !== null ? Math.round((r.amount + stamp) * 100) / 100 : r.amount;
      if (r.gross !== null && (stamp === null || Math.abs(r.gross - stamp - r.amount) > 0.011)) {
        return { why: `${at}: gross ${r.gross} less stamp duty ${stamp} is not the printed net ${r.amount}` };
      }
      if (r.date >= STAMP_DUTY_FROM && stamp === null) return { why: `${at}: no stamp duty printed on a purchase after 1 July 2020` };
      if (!unitsTie(r.units, r.priceText, r.amount)) return { why: `${at}: ${r.units} units × ${r.price} is not ${r.amount}` };
      charges = stamp;
    } else if (r.kind === "reinvest") {
      if (r.amount <= 0 || r.units <= 0) return { why: `${at}: prints a negative amount or units` };
      stamp = r.stampAfter ?? r.stampBefore;
      if (r.gross !== null && (stamp === null || Math.abs(r.gross - stamp - r.amount) > 0.011)) {
        return { why: `${at}: gross ${r.gross} less stamp duty ${stamp} is not the printed amount ${r.amount}` };
      }
      if (!unitsTie(r.units, r.priceText, r.amount)) return { why: `${at}: ${r.units} units × ${r.price} is not ${r.amount}` };
      gross = r.gross;
      charges = r.tds !== null || stamp !== null ? Math.round(((r.tds ?? 0) + (stamp ?? 0)) * 100) / 100 : null;
    } else {
      if (r.amount >= 0 || r.units >= 0) return { why: `${at}: a redemption or switch-out prints a positive amount or units` };
      if (r.gross !== null || r.stampAfter !== null) return { why: `${at}: a stamp duty line under money going out` };
      if (!unitsTie(r.units, r.priceText, -r.amount + (r.stt ?? 0))) {
        return { why: `${at}: ${-r.units} units × ${r.price} is not the paid ${-r.amount}${r.stt !== null ? ` plus STT ${r.stt}` : ""}` };
      }
      charges = r.stt;
    }
    running = Math.round((running + r.units) * 1000) / 1000;
    if (Math.abs(running - r.balance) > 0.0005) return { why: `${at}: running units ${running} do not reach the printed balance ${r.balance}` };
    out.push({ ...r, gross, stamp, charges });
  }
  if (closingUnits !== null && closingUnits !== undefined && Math.abs(running - closingUnits) > 0.0005) {
    return { why: `the ledger ends at ${running} units against the ${closingUnits} the statement closes ${name} at` };
  }
  return { rows: out, closing: running };
}

/**
 * Pair every switch-out with the switch-in it funded: the same rupees (the
 * out-leg's paid amount is the in-leg's gross), credited on or after the
 * switch-out within a settlement week, into a scheme the out-leg's own words
 * name. Returns the pairs, or the switch-out nothing in the statement received.
 */
function pairSwitches(schemes) {
  const legs = schemes.flatMap((s) => s.rows.filter((r) => r.kind === "switch-in" || r.kind === "switch-out")
    .map((r) => ({ r, s })));
  const ins = legs.filter((x) => x.r.kind === "switch-in");
  const used = new Set();
  const pairs = [];
  for (const o of legs.filter((x) => x.r.kind === "switch-out").sort((a, b) => a.r.date.localeCompare(b.r.date))) {
    const to = squash(/\bTo\s+(.+?)(?:\s*,\s*less\b.*)?$/i.exec(o.r.type)?.[1]);
    const i = ins.find((x) => !used.has(x) && x.s !== o.s
      && Math.abs(x.r.gross - -o.r.amount) <= 0.011
      && x.r.date >= o.r.date && daysBetween(o.r.date, x.r.date) <= 7
      && to.slice(0, 10) === squash(x.s.security).slice(0, 10));
    if (!i) return { unpaired: o };
    used.add(i);
    pairs.push({ out: o, in: i });
  }
  return { pairs, inbound: ins.filter((x) => !used.has(x)) };
}

/** Layout 7's flows for every scheme block whose holding this document carries. */
function schemeLedgerFlows(lines, holdings, warnings) {
  const blocks = schemeLedgerBlocks(lines).map((b) => ({ ...b, ...parseSchemeLedger(b) }));
  if (!blocks.some((b) => b.rows.length || b.unsupported.length)) return [];
  const fail = (why) => { warn(warnings, "ledger-not-published", why); return []; };
  for (const b of blocks) {
    for (const u of b.unsupported) warn(warnings, "unsupported-movement", `${b.name}: a dated movement is outside the verified ledger layout — ${u}`);
  }
  if (blocks.some((b) => b.unsupported.length)) return fail("the scheme ledgers contain a line this reader could not place, so no row of them is published");
  const schemes = [];
  for (const b of blocks) {
    const holding = holdings.find((h) => h.isin === b.isin);
    if (!holding) {
      if (b.rows.length) return fail(`${b.name}: a ledger with no scheme block value to close it`);
      continue;
    }
    const walked = walkSchemeLedger(b.name, b.opening, b.rows, null);
    if (walked.why) return fail(`${b.name}: ${walked.why}`);
    // The block's printed `IDCW reinvested / paid` for the period is the sum of
    // the reinvestments the ledger reads — every scheme in this archive ties to
    // the paisa (HDFC 15644806's ₹21,84,195.27 over 270 rows).
    const reinvested = Math.round(walked.rows.filter((r) => r.kind === "reinvest").reduce((t, r) => t + (r.amount ?? 0), 0) * 100) / 100;
    if (b.idcw !== null && Math.abs(reinvested - b.idcw) > 0.011) {
      return fail(`${b.name}: the reinvestments read sum to ${reinvested} against the ${b.idcw} of IDCW the statement prints for the period`);
    }
    /**
     * THE LEDGER MUST CLOSE AT A UNIT BALANCE THE STATEMENT PRINTS. The block's
     * own closing units first; where they differ, the Account Summary's units
     * for the same NAV and NAV date are a second printed closing. Kotak 4295974's
     * 5 Oct statement walks every row to 641.448, which its Account Summary
     * prints (451.356 + 190.092), while the block's `Available Units to Redeem`
     * reads 641.954 — the statement's own ₹619 disagreement (Stage 10eu). The
     * rows are published with that named on the opening row; the holding keeps
     * the figure it always read.
     */
    let disagreement = null;
    if (holding.quantity === null || Math.abs(walked.closing - holding.quantity) > 0.0005) {
      const summary = accountSummaryUnits(lines, holding.marketPrice, holding.priceAsOn);
      if (summary === null || Math.abs(walked.closing - summary) > 0.0005) {
        return fail(`${b.name}: the ledger ends at ${walked.closing} units against the ${holding.quantity} the block closes at`
          + `${summary !== null ? ` and the ${summary} its Account Summary prints` : ""}`);
      }
      if (holding.quantity !== null) {
        disagreement = `the ledger closes at ${walked.closing} units, the Account Summary's own figure; the scheme block's `
          + `closing reads ${holding.quantity}, and the statement does not reconcile the two`;
      }
    }
    schemes.push({ security: holding.security, isin: holding.isin, opening: b.opening, rows: walked.rows, disagreement });
  }
  const switches = pairSwitches(schemes);
  if (switches.unpaired) {
    const o = switches.unpaired;
    return fail(`${o.s.security}: the ${o.r.date} switch-out of ${-o.r.amount} reaches no switch-in this statement prints`);
  }
  const partner = new Map();
  for (const p of switches.pairs) { partner.set(p.out.r, p.in); partner.set(p.in.r, p.out); }
  const flows = [];
  for (const s of schemes) {
    flows.push(makeCashFlow({ date: s.opening.date, description: "Opening Balance", security: s.security, isin: s.isin,
      kind: "opening-units", units: s.opening.units, balance: s.opening.units, notes: s.disagreement }));
    for (const r of s.rows) {
      const base = { date: r.date, description: r.type, security: s.security, isin: s.isin, units: r.units, balance: r.balance };
      const at = `at NAV ${r.price}`;
      const other = partner.get(r);
      if (r.kind === "purchase" || (r.kind === "switch-in" && !other)) {
        flows.push(makeCashFlow({ ...base, kind: "contribution", amount: r.gross, netAmount: r.amount, expenses: r.stamp,
          notes: [`allotted ${at}`, r.stamp !== null ? `stamp duty ${r.stamp}` : r.date < STAMP_DUTY_FROM ? "no stamp duty line (levied only from 1 July 2020)" : null,
            r.kind === "switch-in" ? "switched in from a scheme whose ledger this statement does not print" : null].filter(Boolean).join("; ") }));
      } else if (r.kind === "switch-in") {
        flows.push(makeCashFlow({ ...base, kind: "reclassification", amount: r.gross, netAmount: r.amount, expenses: r.stamp,
          notes: [`allotted ${at}`, r.stamp !== null ? `stamp duty ${r.stamp}` : null,
            `switched in from ${other.s.security} (switched out ${other.r.date})`].filter(Boolean).join("; ") }));
      } else if (r.kind === "switch-out") {
        flows.push(makeCashFlow({ ...base, kind: "reclassification", amount: r.amount, netAmount: r.amount, expenses: r.stt,
          settlementDate: other.r.date,
          notes: [`switched out ${at}`, r.stt !== null ? `STT ${r.stt}` : null,
            `switched into ${other.s.security} (credited ${other.r.date})`].filter(Boolean).join("; ") }));
      } else if (r.kind === "redeem") {
        flows.push(makeCashFlow({ ...base, kind: "withdrawal", amount: r.amount, netAmount: r.amount, expenses: r.stt,
          notes: `redeemed ${at}${r.stt !== null ? `; STT ${r.stt}` : ""}` }));
      } else {
        flows.push(makeCashFlow({ ...base, kind: "allotment", amount: r.amount, netAmount: r.amount, expenses: r.charges,
          notes: r.units === null
            ? `IDCW wholly withheld as TDS ${r.tds}: no amount, units or balance printed, and the next balance shows none allotted`
            : [`IDCW reinvested ${at}`, r.gross !== null ? `gross ${r.gross}` : null, r.stamp !== null ? `stamp duty ${r.stamp}` : null,
              r.tds !== null ? `TDS ${r.tds}` : null].filter(Boolean).join("; ") }));
      }
    }
  }
  return flows;
}

/**
 * ABSL's own ACCOUNT STATEMENT ledger (the trust's monthly statements, 1 Jul
 * and 3 Aug 2026). Per scheme:
 *
 *   B153DZ Aditya Birla Sun Life Liquid Fund - Daily IDCW # -Direct Plan - NAV as on 30/06/2026 : 100.1950
 *   Reinvestment - INF209K01UZ2
 *   Closing Balance as on 30/06/2026 : 766,421.41 7,649.298
 *   30/06/2026 IDCW Reinvestment @ Rs.0.06231576 per unit 428.39 100.1950 100.1950 4.276 7,649.298
 *   Gross Amount: Rs.428.41/-; Stamp Duty charges Levied 0.02
 *   *** TDS on Cumulative IDCW *** 48.00
 *   04/06/2026 IDCW Reinvestment @ Rs.0.02343048 per unit 100.1950 100.1950    ← all of it TDS
 *   *** TDS on Cumulative IDCW *** 178.00
 *   Opening Balance as on 01/06/2026 7,609.792
 *
 * Columns: Amount, Price, NAV, Units, Balance. The June statement prints
 * newest-first and the July one oldest-first; both are walked oldest-first.
 * The block is joined to the PORTFOLIO SUMMARY holding whose units and value
 * are the block's printed closing balance — the summary prints no ISIN.
 */
const ABSL_LEDGER_HEAD = /^([A-Z0-9]{2,8})\s+(Aditya Birla Sun Life .+?)\s+NAV as on\s+(\d{2}\/\d{2}\/\d{4})\s*:\s*([\d,]+\.\d+)$/;
const ABSL_LEDGER_ROW = new RegExp(String.raw`^(${LD})\s+(\D.*?)\s+(${LN})\s+(${LN})\s+(${LN})\s+(${LU})\s+([\d,]+\.\d{3})$`);
const ABSL_LEDGER_EMPTY = new RegExp(String.raw`^(${LD})\s+(IDCW Reinvestment\b.*?)\s+(${LN})\s+(${LN})$`, "i");
const ABSL_LEDGER_GROSS = /^Gross Amount:\s*Rs\.?\s*([\d,]+(?:\.\d+)?)\/-;?\s*Stamp Duty charges Levied\s*([\d,]+\.\d{2})$/i;
const ABSL_LEDGER_CLOSE = new RegExp(String.raw`^Closing Balance as on (${LD})\s*:\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{3})$`, "i");

function abslLedgerFlows(lines, holdings, warnings) {
  const blocks = new Map();
  let cur = null;
  for (const raw of lines) {
    const l = furnitureFree(raw);
    if (!l) continue;
    const h = ABSL_LEDGER_HEAD.exec(l);
    if (h) {
      if (!blocks.has(h[1])) blocks.set(h[1], { code: h[1], name: cleanName(h[2]), opening: null, close: null, rows: [], unsupported: [] });
      cur = blocks.get(h[1]);
      continue;
    }
    if (!cur) continue;
    if (/^(?:Your Advisor|Lien Units)\b/i.test(l)) { cur = null; continue; }
    const open = LEDGER_OPEN.exec(l);
    if (open) { cur.opening = { date: toIso(open[1]), units: num(open[2]) }; continue; }
    const close = ABSL_LEDGER_CLOSE.exec(l);
    if (close) { cur.close = { date: toIso(close[1]), value: num(close[2]), units: num(close[3]) }; continue; }
    const g = ABSL_LEDGER_GROSS.exec(l);
    if (g) {
      const last = cur.rows.at(-1);
      if (last && last.gross === null) { last.gross = num(g[1]); last.stampAfter = num(g[2]); } else cur.unsupported.push(l);
      continue;
    }
    const tds = LEDGER_TDS.exec(l);
    if (tds) {
      const last = cur.rows.at(-1);
      if (last && last.tds === null) last.tds = tds[1] ? num(tds[1]) : "pending"; else cur.unsupported.push(l);
      continue;
    }
    if (/^[\d,]+\.\d{2}$/.test(l) && cur.rows.at(-1)?.tds === "pending") { cur.rows.at(-1).tds = num(l); continue; }
    const m = ABSL_LEDGER_ROW.exec(l);
    const e = m ? null : ABSL_LEDGER_EMPTY.exec(l);
    if (m || e) {
      const type = (m ? m[2] : e[2]).trim();
      const kind = kindOfType(type);
      if (kind !== "reinvest") { cur.unsupported.push(l); continue; }
      cur.rows.push(m
        ? { date: toIso(m[1]), type, kind, amount: num(m[3]), priceText: m[4], price: num(m[4]), nav: num(m[5]), units: num(m[6]), balance: num(m[7]),
          gross: null, stampBefore: null, stampAfter: null, stt: null, tds: null }
        : { date: toIso(e[1]), type, kind, amount: null, priceText: e[3], price: num(e[3]), nav: num(e[4]), units: null, balance: null,
          gross: null, stampBefore: null, stampAfter: null, stt: null, tds: null });
      continue;
    }
    if (LEDGER_ADMIN.test(l)) continue;
    if (new RegExp(`^${LD}\\b`).test(l) || LEDGER_STRAY.test(l)) cur.unsupported.push(l);
  }
  const withRows = [...blocks.values()].filter((b) => b.rows.length || b.unsupported.length);
  if (!withRows.length) return [];
  const fail = (why) => { warn(warnings, "ledger-not-published", why); return []; };
  for (const b of withRows) {
    for (const u of b.unsupported) warn(warnings, "unsupported-movement", `${b.name}: a dated movement is outside the verified ledger layout — ${u}`);
    if (b.rows.some((r) => r.tds === "pending")) return fail(`${b.name}: a TDS line prints no amount`);
  }
  if (withRows.some((b) => b.unsupported.length)) return fail("the scheme ledger contains a line this reader could not place, so no row of it is published");
  const flows = [];
  for (const b of withRows) {
    if (!b.close) return fail(`${b.name}: no Closing Balance line`);
    const matches = holdings.filter((h) => h.quantity !== null && Math.abs(h.quantity - b.close.units) <= 0.0005
      && Math.abs((h.printed?.marketValue ?? NaN) - b.close.value) <= 0.011);
    if (matches.length !== 1) return fail(`${b.name}: the closing balance ${b.close.units} / ${b.close.value} is not one summary holding's units and value`);
    const holding = matches[0];
    const walked = walkSchemeLedger(b.name, b.opening, b.rows, b.close.units);
    if (walked.why) return fail(`${b.name}: ${walked.why}`);
    // The PORTFOLIO SUMMARY's `IDCW Earned` for the scheme is the month's
    // reinvestments read here (₹3,958.33 in June, ₹3,606.75 in July).
    const earned = lines.map((x) => ABSL_ROW.exec(x.trim())).find((x) => x && Math.abs(num(x[2]) - b.close.units) <= 0.0005);
    const reinvested = Math.round(walked.rows.reduce((t, r) => t + (r.amount ?? 0), 0) * 100) / 100;
    if (earned && Math.abs(num(earned[7]) - reinvested) > 0.011) {
      return fail(`${b.name}: the reinvestments read sum to ${reinvested} against the IDCW Earned of ${num(earned[7])} the summary prints`);
    }
    // An all-TDS row allots nothing: the balance either side of it must agree.
    const ordered = walked.rows;
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].units !== null) continue;
      const before = i ? ordered.slice(0, i).reverse().find((r) => r.balance !== null)?.balance ?? b.opening.units : b.opening.units;
      const after = ordered.slice(i + 1).find((r) => r.units !== null);
      const next = after ? Math.round((after.balance - after.units) * 1000) / 1000 : walked.closing;
      if (Math.abs(before - next) > 0.0005) return fail(`${b.name}: ${ordered[i].date}: a row with no units printed, across which the balance moves`);
    }
    flows.push(makeCashFlow({ date: b.opening.date, description: "Opening Balance", security: holding.security, isin: holding.isin,
      kind: "opening-units", units: b.opening.units, balance: b.opening.units }));
    for (const r of ordered) {
      flows.push(makeCashFlow({ date: r.date, description: r.type, security: holding.security, isin: holding.isin,
        kind: "allotment", amount: r.amount, netAmount: r.amount, expenses: r.charges, units: r.units, balance: r.balance,
        notes: r.units === null
          ? `IDCW wholly withheld as TDS ${r.tds}: no amount, units or balance printed, and the balance either side shows none allotted`
          : [`IDCW reinvested at ${r.price}`, r.gross !== null ? `gross ${r.gross}` : null, r.stamp !== null ? `stamp duty ${r.stamp}` : null,
            r.tds !== null ? `TDS ${r.tds}` : null].filter(Boolean).join("; ") }));
    }
  }
  return flows;
}

export function extract({ grid, meta }) {
  const warnings = [];
  const source = meta.docKey;
  const lines = (grid.pages ?? []).flatMap((p) => p.text.split("\n"));
  const flat = lines.join("\n").replace(/[ \t]+/g, " ");

  // ── identity ──────────────────────────────────────────────────────────────
  const amc = AMCS.find(([re]) => re.test(flat))?.[1] ?? meta.provider ?? null;
  // `Folio Number : 1038104611`, `Folio No. : 16180583 / 58`, `Folio No. 7041 3280 453`.
  // HDFC's suffix after the slash is the branch code, not part of the folio.
  const folio = (/Folio\s*(?:No\.?|Number)\s*:?\s*([\d][\d\s]{4,24}?)(?=\s*\/|\s{2,}|\s*CAN|\s*Statement|\n|$)/i.exec(flat) || [])[1]
    ?.replace(/\s+/g, "") || null;
  /**
   * THE HOLDER'S TAX STATUS, IN THE AMC'S OWN WORDS.
   *
   * This is the field that decides whether a folio belongs in a family book, and
   * every one of these statements prints it because the AMC is required to. It
   * is read rather than inferred from the name — `HOPE INDIA TRUST` looks like a
   * trust, but `Bharat A Jaisinghani` looks like an individual and one of these
   * five is filed the way the name suggests only by coincidence.
   */
  const printedStatus = (/(?:Tax\s+)?Status\s*:?\s*([A-Za-z]{4,})\b/.exec(flat) || [])[1] ?? null;
  // Every PAN on the page, in the order the holder table prints them. Masked
  // ones (`XXXXX4894A`) are skipped: a partial identifier is not an identifier.
  const pans = [...flat.matchAll(/(?:1st|2nd|First|Second)\s+(?:Unit\s+)?Holder\s+([A-Z]{5}\d{4}[A-Z])\b/gi)].map((m) => m[1]);
  const pan = pans[0] ?? null;
  /**
   * A JOINT FOLIO HAS MORE THAN ONE OWNER, and this book has an accountId per
   * account, not per person. HDFC 16180583 is held by Bharat with Ankita as
   * first joint holder — two PANs on the page, both already in the registry.
   *
   * The account is attributed to the FIRST holder, which is whose PAN the AMC
   * reports the income under, and the others are recorded so a per-person view
   * can say the holding is shared rather than implying sole ownership.
   */
  const jointHolders = [...flat.matchAll(/Joint\s*\d?\s*:?\s*([A-Z][A-Za-z .'-]{4,50}?)(?=\s{2,}|\n|$)/g)]
    .map((m) => m[1].trim())
    .filter((n) => n && !/^N\/?A$/i.test(n));
  // ICICI Prudential prints `2 nd Holder <Name>` rather than `Joint 1 :`.
  for (const m of flat.matchAll(/\b[23]\s*(?:nd|rd)\s+Holder\s*:?\s*([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/g)) {
    if (!jointHolders.includes(m[1])) jointHolders.push(m[1]);
  }
  /**
   * The holder's name. Each AMC puts it on its own line among the address block,
   * followed by a different label — `Status`, `Mode of Holding`, `Nominee`,
   * `Email Address`. Matched as a capitalised run followed by any of them.
   */
  // ICICI Prudential prints the holder on the `Bank Account Number` line and
  // wraps the address onto the `Tax Status` line below it — so on that layout
  // the `Status` rule matches an ADDRESS FRAGMENT first. Where the ICICI line
  // is present it is the holder and outranks every other candidate.
  const iciciHolder = [...flat.matchAll(/\n\s*([A-Z][A-Za-z .'-]{4,60}?)\s+Bank Account Number\b/g)].map((m) => m[1]);
  // CAMS's partial listing prints the holder in its address block on the same
  // line as the AMC branch's address (`Hope India Trust BSL AMC - Ahura`), which
  // no rule can split; its transaction slip prints the name ALONE between two
  // labels: `Unitholder (UH) : Hope India Trust PAN: AABTH4894A`.
  const camsHolder = [...flat.matchAll(/Unitholder\s*\(UH\)\s*:\s*([A-Z][A-Za-z0-9 .&'-]{4,60}?)\s+PAN\s*:/g)].map((m) => m[1]);
  const ownerCandidates = [
    ...iciciHolder,
    ...camsHolder,
    // ABSL / Mirae / Kotak: the name shares a line with the next label.
    ...[...flat.matchAll(/\n\s*([A-Z][A-Za-z0-9 .&'-]{4,60}?)\s+(?:Status|Mode of Holding|Nominee\s*\d|Email Address|Joint\s*\d)\b/g)].map((m) => m[1]),
    // HDFC: the name is alone on its line above `Mode of Holding`.
    ...[...flat.matchAll(/\n\s*((?:[A-Z][A-Za-z.'-]+\s+){1,4}(?:TRUST|Trust|Jaisinghani))\s*\n/g)].map((m) => m[1]),
  ].map((x) => x.trim()).filter(Boolean);
  /**
   * `NON-TRANSFERABLE` is a WATERMARK, not a holder.
   *
   * ABSL prints it above the address block, on its own line, followed by
   * `Mode of Holding : Single` — the same shape the holder's line has, and it
   * comes first. Taken as the name it made the folio's owner a stamp on the
   * page, which then resolved to nobody and put a real trust holding into the
   * "unidentified" bucket for the wrong reason.
   *
   * Statement furniture is excluded by name rather than by position, because
   * position is what put it here.
   */
  const FURNITURE = /^(?:NON[- ]?TRANSFERABLE|CONSOLIDATED|DUPLICATE|ACCOUNT STATEMENT|STATEMENT OF ACCOUNT)$/i;
  const owner = ownerCandidates.find((c) => !FURNITURE.test(c)) ?? null;
  const asOf = toIso((/Statement\s*Date\s*:?\s*(\d{1,2}[-\s][A-Za-z]{3,}[-\s]\d{4})/i.exec(flat) || [])[1])
    ?? toIso((/as on\s*(\d{2}\/\d{2}\/\d{4})/i.exec(flat) || [])[1])
    // CAMS's listing prints the statement date in numbers: `Statement Date : 06-10-2026`.
    ?? toIso((/Statement\s*Date\s*:?\s*(\d{2}-\d{2}-\d{4})\b/i.exec(flat) || [])[1]);
  const period = /From\s*(\d{2}[-/][A-Za-z0-9]{2,3}[-/]\d{4})\s*To\s*(\d{2}[-/][A-Za-z0-9]{2,3}[-/]\d{4})/i.exec(flat);

  if (!folio) warn(warnings, "folio-not-read", "no `Folio No.` / `Folio Number` on the statement");
  if (!owner) warn(warnings, "holder-not-read", "no holder name line matched in the address block");

  // ── the holdings, whichever layout this AMC uses ──────────────────────────
  const holdings = [
    ...readBlockLayout(lines, source),
    ...readAbslLayout(lines, source),
    ...readMiraeLayout(lines, source, warnings),
    ...readIciciLayout(lines, source),
    ...readCamsListingLayout(lines, source, warnings),
    ...readIciciInlineLayout(lines, source),
  ];
  // A scheme an ICICI ledger records and its summary does not list — only once
  // the summary has been read, so a ledger is never mistaken for the summary.
  if (holdings.length) holdings.push(...iciciLedgerHoldings(lines, holdings, source, warnings));
  if (!holdings.length) warn(warnings, "holdings-not-read", "no scheme block matched in any of the six known folio layouts");
  // ICICI Prudential prints every purchase, IDCW reinvestment and redemption
  // dated, with its amount, NAV, units and running balance (and the gross and
  // stamp duty, or STT, beside it) — published only where all of them tie. The
  // CAMS listing prints its daily IDCW reinvestments the same way.
  // HDFC's and Kotak's scheme blocks print the same ledger, NAV column first
  // (layout 7), and ABSL's account statement its own (newest-first in June).
  const cashFlows = [
    ...iciciLedgerFlows(lines, holdings, warnings),
    ...camsListingFlows(lines, holdings, warnings),
    ...schemeLedgerFlows(lines, holdings, warnings),
    ...abslLedgerFlows(lines, holdings, warnings),
  ];
  if (/^Account Statement\s+Since Inception\b/im.test(flat) && cashFlows.length) {
    cashFlows[0].notes = [cashFlows[0].notes, 'Ledger scope: since inception'].filter(Boolean).join('\n');
  }
  if (!cashFlows.length && !warnings.some(w => /not-published|unsupported-movement/.test(w.code))) {
    cashFlows.push(...staticBlockOpenings(lines, holdings, period ? toIso(period[1]) : null, period ? toIso(period[2]) : null));
  }

  /**
   * WHOSE FOLIO IS THIS?
   *
   * A holder whose printed tax status is anything but `Individual` is a separate
   * taxpayer, and its assets are not a person's net worth. That is a fact off the
   * page, so it is recorded as one (`providerEngagement`); whether the family
   * wants the trust consolidated is a decision for them, and making it here would
   * be inventing an owner. The decision lives in ONE place: an entry in
   * `shared/owners.mjs`. A holder that resolves there — by PAN first, then by
   * name, exactly as extract.mjs resolves `ownerId` — is consolidated as its own
   * entity (Hope India Trust, 21 Oct 2026); one that does not stays out, with the
   * reason.
   */
  const statusKind = printedStatus ? printedStatus.toLowerCase() : null;
  const isIndividual = statusKind === "individual";
  const panKind = panHolderType(pan);
  const registered = resolveOwner(owner, pan).owner;
  const excludedFromBook = isIndividual || registered
    ? null
    : `holder ${owner ?? "(unread)"} is filed by the AMC as ${printedStatus ?? "an entity of unstated status"}`
      + `${panKind && panKind !== "individual" ? `, and its PAN carries the ${panKind} holder code` : ""}`
      + " — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets "
      + "into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book.";

  const printedValue = holdings.reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0);
  const printedCost = holdings.reduce((t, h) => t + (h.totalCost ?? 0), 0);

  return {
    provider: amc ?? PROVIDER,
    // The classifier types a folio by its ACCOUNT SUMMARY wording, and CAMS's
    // partial listing has none, so it arrives `unknown`. A folio whose schemes
    // were read carries units, NAV and value — a holdings document, which is the
    // report type the precedence block takes every folio fact from. A type the
    // classifier did establish is left as it is.
    ...(holdings.length && (!meta.reportType || meta.reportType === "unknown") ? { reportType: "holdings" } : {}),
    accountNo: folio,
    owner,
    pan,
    jointHolders: jointHolders.length ? jointHolders : undefined,
    asOf,
    periodFrom: period ? toIso(period[1]) : null,
    periodTo: period ? toIso(period[2]) : null,
    strategy: null,
    engagement: "Direct",
    providerEngagement: printedStatus ? `folio held by a ${printedStatus.toLowerCase()}` : null,
    holdings,
    totals: makeTotals({
      totalMarketValue: holdings.length ? printedValue : null,
      totalCost: printedCost || null,
      positionCount: holdings.length,
      source,
    }),
    returns: [],
    ...(cashFlows.length ? { cashFlows } : {}),
    excludedFromBook,
    sections: {
      holdings: {
        name: "holdings",
        rows: [["isin", "scheme", "units", "nav", "navDate", "invested", "currentValue"],
          ...holdings.map((h) => [h.isin ?? "", h.security, h.quantity, h.marketPrice, h.priceAsOn ?? "", h.totalCost, h.printed.marketValue])],
      },
    },
    warnings,
    status: holdings.length ? (warnings.length ? "partial" : "ok") : "failed",
  };
}
