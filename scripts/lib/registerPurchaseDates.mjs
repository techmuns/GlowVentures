// A PRIVATE LINE THE REVIEW DATES ONLY BY MONTH, DATED BY THE FAMILY'S OWN
// PAYMENTS (Stage 10mw).
//
// *"We need to make sure that we are not missing out on capturing dates and not
//  accounting for those in our calculations, even though we already have them
//  in the files."* — the family, 12 Nov 2026.
//
// The 30 June review prints a private investment's dates as a span of months —
// Waterwala Labs "Feb 2020 – Jul 2023", Everest Fleet "Jan 2022 – May 2023" —
// and one cost for all of it. The family's investment register
// (`source/august-2026-f/NEW INVESTMENT SHEET.xlsx`) prints every payment behind
// that cost, each on its day: Waterwala's eight, ₹8,10,01,152 in all, from 17 Feb
// 2020 to 31 Jul 2023. The register stays what it is — a record of what was
// paid, never a valuation or a statement — and here it only sharpens a date the
// review already prints, never moves it:
//
//   1. the line is named in `REGISTER_LINES` — a committed alias, because a
//      token match on these names has joined Zepto to Tata Technologies
//      (`registerRead.mjs`);
//   2. every payment in the register's serial group is the line's holder's, is
//      dated, and is a positive amount;
//   3. they add to the review's own cost for the line to the rupee;
//   4. the review prints the line's dates as MONTHS, and every payment falls
//      inside them. A day the review prints is never replaced, and a payment
//      outside the review's months (Zepto: paid 13 Nov 2024, review "Feb 2025")
//      is a disagreement for the family, not a correction for this file.
//
// Any gate short and the line keeps the review's months, with the reason in the
// book report. A source for the Invested on column: the lines it dates are
// carried at cost, so no return is struck on these dates.

import fs from "node:fs";
import path from "node:path";
import { readSpreadsheet } from "../ingest/lib/sheet.mjs";
import { serialToIso } from "./reviewPrivateRead.mjs";

export const REGISTER_PATH = "source/august-2026-f/NEW INVESTMENT SHEET.xlsx";

/**
 * [review account, review line's securityKey, register sheet, register serial
 * group] — identity only, never an amount or a date. Each was checked against
 * the register's name, holder and total; a new entry needs the same check.
 */
export const REGISTER_LINES = Object.freeze([
  ["review-ajay-jaisinghani", "assetgro-fintech-private-limited-1-series-b-pref-25nv44", "AJAY SIR - AARTI", "41"],
  ["review-ajay-jaisinghani", "everest-fleet", "AJAY SIR - AARTI", "4"],
  ["review-ajay-jaisinghani", "urb-ventures", "AJAY SIR - AARTI", "2"],
  ["review-ankita-jaisinghani", "everest-fleet", "PVT INV", "16"],
  ["review-ankita-jaisinghani", "pvc-ii-class-a1", "FUND HOUSE", "2"],
  ["review-ankita-jaisinghani", "urb-ventures", "PVT INV", "25"],
  ["review-bharat-jaisinghani", "autocracy-machinery", "PVT INV", "35"],
  ["review-bharat-jaisinghani", "everest-fleet", "PVT INV", "15"],
  ["review-bharat-jaisinghani", "fh-enable-llp-aakash-sachdev", "PVT INV", "7"],
  ["review-bharat-jaisinghani", "waterwala-labs-private-limited-drink-prime", "PVT INV", "3"],
  // Same name, holder and total, but the register's payments fall outside the
  // review's months — named in the book report for the family, never applied:
  ["review-ajay-jaisinghani", "zepto", "AJAY SIR - AARTI", "25"],
  ["review-ankita-jaisinghani", "transition-venture-capital-fund-i-class-a1", "FUND HOUSE", "23"],
  ["review-ankita-jaisinghani", "inflexor-technologies", "FUND HOUSE", "4"],
  ["review-bharat-jaisinghani", "hyprkytchen-foodtech-private-limited-mr-bansi", "PVT INV", "12"],
]);

/** The register's "INVESTMENT DONE UNDER" words, for the three members it names this way. */
const HOLDER = { AJAY: "ajay-jaisinghani", ANKITA: "ankita-jaisinghani", BHARAT: "bharat-jaisinghani" };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** A register date: an Excel serial (number or digits), or dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy. */
export function registerDate(v) {
  if (isNum(v) || /^\d{5}(\.\d+)?$/.test(String(v ?? "").trim())) return serialToIso(Number(v));
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** Every payment row, with its sheet, serial group and 1-based row. */
export function registerPayments(workbook) {
  const out = [];
  for (const s of workbook.sheets ?? []) {
    const cols = (s.rows[0] ?? []).map((c) => String(c ?? "").trim().toUpperCase());
    const at = (r, label) => r[cols.indexOf(label)];
    if (!cols.includes("INVESTMENT NAME") || !cols.includes("SR. NO.")) continue;
    s.rows.slice(1).forEach((r, i) => {
      const sr = String(at(r, "SR. NO.") ?? "").trim();
      if (!sr) return; // a subtotal row carries no serial number (`registerRead.mjs`)
      const amount = Number(at(r, "INVESTMENT AMOUNT"));
      out.push({
        sheet: s.name.trim(), row: i + 2, serial: sr, group: sr.replace(/[a-z]+$/i, ""),
        name: String(at(r, "INVESTMENT NAME") ?? "").trim(),
        under: String(at(r, "INVESTMENT DONE UNDER") ?? "").trim().toUpperCase(),
        date: registerDate(at(r, "INVESTMENT DATE")),
        amount: Number.isFinite(amount) ? amount : null,
      });
    });
  }
  return out;
}

/**
 * The register's dated payments behind one review line — null where no alias
 * names it, `{ reason }` where a gate fails, else `{ payments, evidence }`.
 */
export function registerPurchaseDates({ position, ownerId, payments, workbookPath = REGISTER_PATH }) {
  const alias = REGISTER_LINES.find(([a, k]) => a === position.accountId && k === position.securityKey);
  if (!alias) return null;
  const [, , sheet, group] = alias;
  const rows = payments.filter((p) => p.sheet === sheet && p.group === group);
  if (!rows.length) return { reason: `the register's ${sheet} sheet has no serial group ${group}` };
  if (rows.some((r) => HOLDER[r.under] !== ownerId)) return { reason: `a payment in the register's ${sheet} group ${group} is not this holder's` };
  if (rows.some((r) => !r.date || !(r.amount > 0))) return { reason: `a payment in the register's ${sheet} group ${group} is undated or has no amount` };
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (!isNum(position.costBasis) || Math.abs(total - position.costBasis) > 1) {
    return { reason: `the register's ${rows.length} payment(s) add to ₹${total.toFixed(2)}, the review's cost to ₹${isNum(position.costBasis) ? position.costBasis.toFixed(2) : "—"}` };
  }
  const d = position.investedDates;
  if (!d || !/^\d{4}-\d{2}$/.test(d.from) || !/^\d{4}-\d{2}$/.test(d.to)) {
    return { reason: "the review prints this line's date as a day, which the register never replaces" };
  }
  const outside = rows.filter((r) => r.date.slice(0, 7) < d.from || r.date.slice(0, 7) > d.to);
  if (outside.length) {
    return { reason: `the register's payment(s) of ${outside.map((r) => r.date).join(", ")} fall outside the review's ${d.text}, so the two records disagree on when this money went in` };
  }
  return {
    payments: rows.map((r) => ({ date: r.date, amount: Math.round(r.amount * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    evidence: { path: workbookPath, sheet, rows: rows.map((r) => r.row) },
  };
}

/** Read the register once, for the build. */
export function loadRegisterPayments(root, workbook) {
  return registerPayments(workbook ?? readSpreadsheet(fs.readFileSync(path.join(root, REGISTER_PATH))));
}
