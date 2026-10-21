// ONE READER FOR THE FAMILY'S INVESTMENT REGISTER.
//
// `source/august-2026-f/NEW INVESTMENT SHEET.xlsx` is the family's own record of
// what they PAID. It has no reader in `scripts/ingest/` BY DECISION and never
// becomes a source for `glowData.ts` — no institution struck it, so folding it in
// would end the guarantee that every figure traces to the statement of the
// institution that did. `lib/classify.mjs` labels it
// `Family investment register (not a statement)` and no extractor can reach it.
//
// IT HAD TWO CONSUMERS AND NOW HAS TWO AGAIN, ONE OF THEM A CHECK:
//   • `scripts/register-reconcile.mjs` -> docs/REGISTER-RECONCILIATION.md
//   • `scripts/check-pages.mjs`        -> `REGISTER_SENTINEL`
// so the parsing, the subtotal rules and the book partition live here once. Two
// copies would be two chances for the report and the sweep to state different
// figures about the same workbook, which is the failure `drilldown.ts` exists to
// stop for the book's own numbers.
//
// `scripts/build-register.mjs` -> `src/data/registerData.ts` WAS the second, and
// both went when the family asked for the Investment Register page: that module
// had exactly one reader, and a builder whose output nothing reads is the
// dead-code-that-looks-alive failure this repo keeps naming. THIS FILE STAYS,
// because the reconciler is an independent cross-check of the book and was never
// the page — and because the sweep's own absence check needs the workbook's
// largest not-in-book name to have anything to assert.
//
// It is under `scripts/` and not `shared/` deliberately: it imports `xlsx`, and
// nothing the browser bundles may reach it.
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { readSpreadsheet } from "../ingest/lib/sheet.mjs";
import { makeSecurityMatcher } from "../../shared/nameMatch.mjs";
import { ownerIdFor } from "../../shared/owners.mjs";

export const REGISTER_PATH = "source/august-2026-f/NEW INVESTMENT SHEET.xlsx";

/** A sheet of exits is not live capital. */
export const EXIT_SHEET = /WRITE\s*OFF|EXIT/i;

/**
 * MANAGERS ARE MATCHED ON A COMMITTED LIST, NOT ON TOKENS.
 *
 * The register writes a manager's name however the family types it — "VEC ASSAGO
 * PMS", "CARNELIAN BESPOKE", "MOTILAL OSWAL HEDGED". A token overlap rule was
 * tried and matched `KIRANAKART TECHNOLOGIES PRIVATE - ZEPTO` to `TATA
 * TECHNOLOGIES LIMITED` on the word "TECHNOLOGIES", `MAN INDUSTRIES` to `Deep
 * Industries` and `INTEGRIS HEALTH` to `Star Health`. Each is a different company
 * and each looked like a confident match, which is `securityKey`'s own rule
 * arriving one layer up: merging two different things is worse than showing them
 * apart. Every entry below is one line and can be challenged.
 */
export const MANAGER_ALIASES = [
  [/^SANSHI\s+FUND/i, "Sanshi Fund"],
  [/BUOYANT/i, "Buoyant Capital"],
  [/^CARNELIAN\s+BESPOKE|^CARNELIAN$/i, "Carnelian Asset Management and Advisors Pvt Ltd"],
  [/CARNELIAN.*AMRITKAAL|AMRITKAAL/i, "Carnelian Bharat Amritkaal Fund"],
  [/ARISTOS|GOLDSTANDARD|GOLD\s*STANDARD/i, "Goldstandard Wealth Private Limited"],
  [/GREEN\s+LANTERN/i, "Green Lantern Capital LLP"],
  [/^SVAN/i, "SVAN Investment Managers LLP"],
  [/V\.?\s*E\.?\s*C\s+ASSAGO|^VEC\s+ASSAGO/i, "V.E.C Assago Capital Management LLP"],
  [/MOLECULE/i, "Molecule Ventures LLP"],
  [/HELIOS/i, "Helios Mutual Fund"],
  [/MOTILAL\s+OSWAL\s+HEDGED/i, "Motilal Oswal Hedged Equity Multi Factor Strategy"],
  [/FOUNDERS\s+FUND/i, "Motilal Oswal Founders Fund"],
  [/ACTIVE\s+MOMENTUM/i, "Motilal Oswal Active Momentum Fund"],
  [/DELPHI/i, "Motilal Oswal Delphi Equity Fund"],
  [/NEO\s+INFRA/i, "Neo Infra Income Opportunities Fund"],
  [/BARING/i, "Baring Private Equity India Fund"],
  [/SKY\s+CAPITAL/i, "Sky Capital Rising Titans Fund"],
  [/TRANSITION\s+VENTURE/i, "Transition Venture Capital"],
  [/INDIA\s+SME/i, "India SME Investments"],
  [/^3P\b/i, "3P Investment Managers"],
  [/^LKP/i, "LKP Securities"],
  [/360\s*ONE/i, "360 ONE Private Wealth"],
];

/** Read the workbook into tranche rows, per-sheet stats and the owner tally. */
export function readRegister(path = REGISTER_PATH) {
  const bytes = readFileSync(path);
  if (!readSpreadsheet(bytes).sheets?.length) throw new Error(`${path}: no sheets`);
  const wb = XLSX.read(bytes, { type: "buffer", cellDates: true });

  const rows = [];
  const perSheet = [];
  const ownerRows = new Map();
  let qtyRows = 0;

  for (const name of wb.SheetNames) {
    const rr = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    const hdr = (rr[0] ?? []).map((c) => String(c ?? "").trim().toUpperCase());
    const iSr = hdr.indexOf("SR. NO.");
    const iName = hdr.indexOf("INVESTMENT NAME");
    const iUnder = hdr.indexOf("INVESTMENT DONE UNDER");
    const iAmt = hdr.indexOf("INVESTMENT AMOUNT");
    const iCur = hdr.indexOf("CURRENT VALUATION");
    const iVal = hdr.indexOf("VALUATION AT THE TIME OF INVESTMENT");
    const iRet = hdr.findIndex((h) => h.includes("LOAN RETURNED"));
    const iDate = hdr.lastIndexOf("DATE");
    let sum = 0, n = 0, subtotals = 0, returned = 0, valued = 0, subtotalValue = 0;

    for (const r of rr.slice(1)) {
      const nm = String(r[iName] ?? "").trim();
      /**
       * THE LOAN COLUMN HAS ITS OWN SUBTOTALS, AND THEY ARE KEYED IN A DIFFERENT
       * COLUMN FROM THE ONE THE ROW RULE READS.
       *
       * `LOAN RETURNED BACK` runs alongside a second `DATE` column, and three
       * rows carry the word TOTAL in THAT date cell rather than in the investment
       * name: ₹58,00,000, ₹2,67,65,000 and ₹4,25,000. The row rule below reads
       * the NAME, so it never sees them and the column summed to ₹6.5980 Cr —
       * exactly twice the truth. The three subtotals sum to ₹3.2990 Cr and so do
       * the 25 dated cells, which is a self-proving partition, not a tolerance.
       */
      if (iRet >= 0 && typeof r[iRet] === "number" && !/\bTOTAL\b/i.test(String(r[iDate] ?? ""))) returned += r[iRet];
      if (iCur >= 0 && typeof r[iCur] === "number") valued++;
      const amt = typeof r[iAmt] === "number" ? r[iAmt] : null;
      if (!nm || amt == null) continue;
      /**
       * A SUBTOTAL ROW IS NOT A TRANCHE, AND ONE OF THEM DOES NOT SAY "TOTAL".
       *
       * The register prints "<NAME> - TOTAL" under each multi-tranche investment,
       * and summing the column blind counts every one of those twice. Matching
       * the WORD alone finds 63 of them, carrying ₹429.85 Cr.
       *
       * It misses a 64th. `FUND HOUSE` repeats "BARING PRIVATE EQUITY INDIA FUND
       * 6" under its own four tranches with ₹2,02,50,000 — exactly 65 + 50 + 25 +
       * 62.5 lakh — and no "TOTAL" anywhere in it. What gives it away is its
       * SHAPE: a subtotal carries no serial number and no `INVESTMENT DONE
       * UNDER`, because it is not an investment anybody made on a date. Measured,
       * that structural test finds exactly this one row and no data row, so the
       * two rules together are strictly safer than the word alone.
       *
       * This is the rule `dataGovIn.mjs` and `amfi.mjs` already state one layer
       * down — a headline row is NAMED, never summed — meeting a workbook that
       * forgot to name one.
       */
      const isSubtotal = /\bTOTAL\b/i.test(nm)
        || (!String(r[iSr] ?? "").trim() && !String(r[iUnder] ?? "").trim());
      if (isSubtotal) { subtotals++; subtotalValue += amt; continue; }
      sum += amt; n++;
      /**
       * A SHARE COUNT IS IN HERE, BUT AS PROSE AND ONLY SOMETIMES.
       *
       * `costFor` may only join a cost where the QUANTITIES MATCH EXACTLY, so
       * whether this register can supply one turns on whether it states a
       * quantity at all. It does — inside the free-text "VALUATION AT THE TIME OF
       * INVESTMENT" column, as "3932 EQUITY SHARES - FACE VALUE OF 10 -
       * DISTICTIVE FROM…". Counted rather than assumed, in either direction.
       */
      if (/^[\d,]+(?:\.\d+)?\s*(EQUITY|SHARES?|CCPS|PREFERENCE|UNITS?|SEEDS?|SERIES)/i.test(String(r[iVal] ?? "").trim())) qtyRows++;
      const under = String(r[iUnder] ?? "").trim();
      if (under) ownerRows.set(under, (ownerRows.get(under) ?? 0) + amt);
      rows.push({ sheet: name, name: nm, under, amt });
    }
    perSheet.push({ name, tranches: n, subtotals, subtotalValue, sum, returned, valued, isExit: EXIT_SHEET.test(name) });
  }

  const byName = new Map();
  for (const r of rows) {
    const k = r.name.toUpperCase();
    if (!byName.has(k)) byName.set(k, { name: r.name, sheets: new Set(), unders: new Set(), amt: 0, tranches: 0 });
    const g = byName.get(k);
    g.sheets.add(r.sheet); if (r.under) g.unders.add(r.under); g.amt += r.amt; g.tranches++;
  }

  const gross = [...byName.values()].reduce((s, g) => s + g.amt, 0);
  const returned = perSheet.reduce((s, x) => s + x.returned, 0);
  const blindSum = gross + perSheet.reduce((s, x) => s + x.subtotalValue, 0);
  const valuedRows = perSheet.reduce((s, x) => s + x.valued, 0);
  let ownerResolved = 0, ownerUnresolved = 0;
  for (const [k, v] of ownerRows) (ownerIdFor(k) ? (ownerResolved += v) : (ownerUnresolved += v));

  return { rows, perSheet, byName, ownerRows, qtyRows, gross, returned, blindSum, valuedRows, ownerResolved, ownerUnresolved };
}

/**
 * PARTITION EVERY REGISTER NAME AGAINST THE BOOK — the whole point of reading it.
 *
 * The gross figure is NOT additive to the book: roughly half of it is mandates
 * and positions the book already carries in full, and some of it has been repaid
 * or written off. Four buckets, and no name is in two:
 *
 *   mgr  — a MANAGED ACCOUNT in the book (BOOK_ACCOUNTS provider)
 *   pos  — a POSITION in the book (BOOK_POSITIONS securityKey)
 *   none — no counterpart anywhere in the book
 *   exit — on the WRITE OFF / EXIT sheet
 *
 * @param {Map} byName            from readRegister()
 * @param {Map} bookByKey         securityKey -> position
 * @param {Set} providersInBook   BOOK_ACCOUNTS provider names
 */
export function partitionAgainstBook(byName, bookByKey, providersInBook) {
  const matchSecurity = makeSecurityMatcher(bookByKey);
  const matchManager = (name) => {
    const hit = MANAGER_ALIASES.find(([re]) => re.test(name))?.[1] ?? null;
    return hit && providersInBook.has(hit) ? hit : null;
  };
  const B = { mgr: [], pos: [], none: [], exit: [] };
  for (const g of byName.values()) {
    if ([...g.sheets].some((s) => EXIT_SHEET.test(s))) { B.exit.push(g); continue; }
    const m = matchManager(g.name);
    if (m) { g.hit = m; g.how = "manager"; B.mgr.push(g); continue; }
    const s = matchSecurity(g.name);
    if (s.key) { g.hit = s.key; g.how = s.how; B.pos.push(g); continue; }
    g.how = s.how; B.none.push(g);
  }
  return B;
}
