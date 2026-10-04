// Styled Excel export for the whole Portfolio Monitor tab (Holdings + the
// managers' dated trade tape), carrying the dashboard's champagne-on-ink design
// language into the workbook. Values are in INR (the model's base currency) so a
// saved file never drifts with the FX rate.
//
// ── THE SHEET IS THE SCREEN IT EXPORTS (B-08) ───────────────────────────────
//
// It kept its own row build, and three of the screen's decisions never reached
// it: it listed the closed positions and the sub-₹1,000 specks the tab drops
// (`currentHoldings`), its Return was always the cumulative return on cost where
// the tab's default measure shows a CAGR on a lot-dated holding a year or older,
// and nothing in the file said what date a figure was struck on or why a cell
// was blank. Each of those now goes through the helper the screen uses:
//
//   • WHICH HOLDINGS — `currentHoldings`, applied here, so the sheet cannot be
//     handed a set the tab does not draw;
//   • WHICH RETURN   — `measuredReturn(…, "auto", …)`, the tab's default, on
//     the same inputs the tab's row carries — the dated capital behind a row
//     that is whole accounts included — with the measure it resolved to
//     written beside it (HPR, CAGR or XIRR);
//   • WHICH PRICE    — `commonMark` (one mark or none) and `costedFigures`
//     (cost, average and gain over one set), as the tab's clubbed row;
//   • WHICH DATE     — `valueDateOf`, per row, and a line under the title naming
//     the blend of statement dates, published NAVs and live quotes.
import ExcelJS from "exceljs";
import type { Account, Position } from "./types";
import type { Txn, TxnData } from "./ledger";
import { basketKeyOf, familyClassKeyOf } from "./familyTaxonomy";
import { displaySecurity, fmtCr, fmtCurrency, DASH } from "./format";
import {
  valueDateOf, commonValueDate, measuredReturn, isFixedIncome,
  currentHoldings, droppedHoldings, NEGLIGIBLE_VALUE_FLOOR,
} from "./analytics";
import { accountIndex, accountOf, ownerOf, providerOf, engagementOf } from "./accounts";
import { fifoTotals } from "./fifo";
import { costedFigures, commonMark, markKey, VACUOUS_COST_REASON } from "./clubbedFigures";
import { buildDatedCapital, type DatedCapital } from "./datedCapital";
import { labelledAccounts, labelledPositions } from "./securityLabel";
import { describeDepositoryUnits } from "./fundNavs";
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS,
  BOOK_POSITION_TRANCHES, BOOK_CAPITAL_FROM_INCEPTION,
} from "@/data/glowData";
import {
  sumOrNull, dedupedPositions, consolidatedMarketValue,
  holdingBucket, bucketLabel, holdingRoute, ROUTE_LABEL,
  isMandateHeld, mandateLabelWithOwner, MANDATE_BUCKET,
} from "./analytics";

// Brand palette (ARGB — leading FF = opaque).
const C = {
  ink: "FF151233",
  inkHead: "FF1F1B45",
  champagne: "FFD9C48F",
  champagneText: "FFECDCAE",
  text: "FF1A1830",
  muted: "FF6B6880",
  gain: "FF059669",
  loss: "FFDC2626",
  border: "FFE4DDCD",
  zebra: "FFFAF8F1",
  totalFill: "FFF4F2EC",
};

/** How a line's value was struck — the three bases a figure on the tab can carry. */
type Basis = "live" | "nav" | "statement";
const BASIS_LABEL: Record<Basis, string> = { live: "Live quote", nav: "AMFI NAV", statement: "Statement" };
/** The basis a live quote, a published NAV and a statement mark each carry — the overlays' own flags. */
const basisOf = (p: Position): Basis => (p.live ? "live" : p.navPriced ? "nav" : "statement");

/**
 * Rupees for a sentence: compact above a lakh, to the paisa below it — a
 * ₹840.99 of specks printed "₹0 Cr" would be a zero nobody measured.
 */
const inr = (n: number) => (Math.abs(n) >= 1e5 ? fmtCurrency(n, "INR", { compact: true }) : fmtCurrency(n, "INR"));

/**
 * THE DATED CAPITAL BEHIND A ROW THAT IS WHOLE ACCOUNTS — the index the tab
 * reads through `useDatedCapital`, built by the same function over the same
 * committed inputs: the family's dated payments and the funds' calls, struck on
 * the STATEMENT book (the page's `statementPortfolio`, which is always this
 * book — `PortfolioContext` can only ever reset to it). Never the live book the
 * sheet is handed: a rate struck on NAV-overlaid values would not be the rate
 * the tab prints beside the same row. Built once, on the first export.
 */
let bookCapital: DatedCapital | null = null;
function bookDatedCapital(): DatedCapital {
  return (bookCapital ??= buildDatedCapital({
    moves: BOOK_CAPITAL_MOVES, commitments: BOOK_COMMITMENTS,
    accounts: labelledAccounts(BOOK_ACCOUNTS), positions: labelledPositions(BOOK_POSITIONS),
    tranches: BOOK_POSITION_TRANCHES, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
  }));
}

type HoldingRow = {
  security: string; bucket: string; heldVia: string; sector: string; entities: string;
  /** The family's own two slices — see `familyTaxonomy.ts`. */
  familyClass: string; basket: string;
  /** The mandate this row sits in, or null for a row no manager runs. */
  mandate: string | null;
  /** The issuers whose statements carry this row — named when it reports no cost. */
  sources: string;
  /**
   * True when NO cost was reported for this row at all, as against a cost that
   * summed to zero beside a positive market value. Both are left out of the P&L
   * total — a zero cost books the whole holding as profit — and they are
   * different findings, so the note under the total counts them apart.
   */
  costNone: boolean;
  /**
   * The value of the lines inside a PARTLY costed row that report no cost —
   * ICICI Bank's 14,500 depository shares beside 7,000 costed ones. Its P&L is
   * struck over the costed lines alone (A-02), so the note under the total
   * counts this beside the rows that report no cost at all.
   */
  uncostedValue: number;
  qty: number; avgCost: number | null; cmp: number | null; marketValue: number;
  weight: number | null; pnl: number | null;
  /**
   * THE TAB'S DEFAULT RETURN, NOT A SECOND ONE (MSX-10). `measuredReturn(…,
   * "auto", …)` on the same inputs the tab's row carries: the FIFO return on the
   * capital deployed, annualised only where a lot register dates every unit
   * held and the window to the row's own valuation is a year or longer — and,
   * on a row that is whole accounts with a dated record of the family's
   * payments, the family's rule on those payments (XIRR over several, CAGR on
   * one, HPR under a year).
   */
  returnPct: number | null;
  /** Which return `returnPct` is — the tag the tab prints in the cell. Null where there is none. */
  returnTag: string | null;
  /** Every (basis, date) the row's lines are valued on, oldest first. */
  bases: { basis: Basis; date: string | null }[];
  /** Why each blank figure is blank, and what a shown return covers — in column order. */
  notes: string[];
};

/**
 * Consolidate the CURRENT holdings into the rows the Holdings sheet exports —
 * the full set the tab draws, independent of any on-screen filter, so the
 * export is always complete.
 *
 * ONE ROW PER SECURITY **PER BUCKET**, because the tab this file is named after
 * is sectioned by bucket (`holdingBucket`), and a workbook that flattens the
 * sections back out is no longer the tab it claims to be. Grouping on
 * securityKey alone also forces a single Class cell onto a name held two ways,
 * and there is no honest value to put in it: a `Cash` securityKey spans the
 * mandate sleeves (which belong to their manager) and the unmanaged cash rows,
 * and one liquid ETF's securityKey arrives classed `ETF` on one statement and
 * `Mutual Fund` on another. Splitting keeps every cell a fact about the rows
 * under it; the grand total is unmoved either way.
 *
 * AND ONE ROW PER **MANDATE** INSIDE THE PMS BUCKET, which is the half a flat
 * sheet was missing. The tab rolls a mandate's shares into one expandable row
 * that drills into `/mandate/<accountId>`; a workbook has no expansion, so the
 * mandate has to travel on the row itself. Merged on securityKey alone, a PMS
 * row routinely spans two or more mandates — these managers hold the same names
 * for several members — so the Mandate cell would have had to list
 * them all and the sheet still could not answer WHICH mandate holds a given
 * company, the question the regroup was built for. Split, every cell is one
 * fact and each mandate's rows sum to the mandate row on the tab.
 */
function consolidate(held: Position[], accounts: Account[], nowMs: number, dated: DatedCapital): HoldingRow[] {
  const idx = accountIndex(accounts);
  /**
   * THE TAB'S FIFO OPTIONS: a PMS mandate the set holds whole is struck on the
   * capital paid into it, measured against the current holdings unfiltered —
   * exactly `fifoOpts` on the Portfolio Monitor. A row here is one security, so
   * this binds only on a mandate that holds one; it is passed so the sheet
   * cannot strike a return the tab does not.
   */
  const fifoOpts = { accounts: idx, universe: held };
  /**
   * THE BOOK'S NEWEST REPORT DATE — the fallback a return's window is given
   * where a row carries no value date of its own, exactly as the tab passes
   * `portfolio.asOf`. Every row here carries one (or `null`, where its lines are
   * valued on different dates), so it only ever reaches a sentence.
   */
  const bookAsOf = accounts.reduce((a, x) => (x.asOf && x.asOf > a ? x.asOf : a), "");
  /**
   * THE DATE EACH LINE'S VALUE IS STRUCK, not `new Date()` and not the book's
   * newest date: a statement mark on its statement's date, a published NAV on
   * AMFI's, a live quote on its own day (`valueDateOf`). `nowMs` only dates a
   * live quote; a statement mark never reads the clock.
   */
  const valueDate = (x: Position) => valueDateOf(x, idx.get(x.accountId)?.asOf, nowMs);
  // CONSOLIDATED export: each dedupeGroup counts once, so the grand total is the
  // book's true NAV and a holding reported on two members' statements appears at
  // its real value rather than 2×. A raw sum exported more than the book holds.
  // Struck over the CURRENT holdings, which is the tab's weight base unfiltered.
  const totalMV = consolidatedMarketValue(held);
  const bySecurity = new Map<string, Position[]>();
  for (const p of held) {
    const arr = bySecurity.get(p.securityKey);
    if (arr) arr.push(p); else bySecurity.set(p.securityKey, [p]);
  }
  const rows: HoldingRow[] = [];
  for (const raw of bySecurity.values()) {
    // Dedupe across the WHOLE security first and split afterwards, never the
    // other way round: a group collapsed inside each bucket separately would
    // survive once per bucket and be counted twice.
    const kept = new Set(dedupedPositions(raw));
    const groups = new Map<string, { bucket: string; mandate: string | null; kept: Position[]; raw: Position[] }>();
    for (const p of raw) {
      // Engagement comes from the ACCOUNT, never the position: how a holding is
      // run is a fact about the account holding it.
      const eng = engagementOf(idx, p);
      const bucket = holdingBucket(p, eng);
      // A mandate-held row is grouped per MANDATE ACCOUNT as well as per bucket,
      // so its Mandate cell names one mandate rather than every manager that
      // happens to hold the name. The key is the accountId and never the label:
      // one strategy run for two members prints the same name on both.
      const mandate = isMandateHeld(eng) ? mandateLabelWithOwner(accountOf(idx, p), ownerOf(idx, p)) : null;
      const k = isMandateHeld(eng) ? MANDATE_BUCKET + "\u0000" + p.accountId : bucket;
      const g = groups.get(k) ?? { bucket, mandate, kept: [], raw: [] };
      g.raw.push(p);
      if (kept.has(p)) g.kept.push(p);
      groups.set(k, g);
    }
    for (const g of groups.values()) {
      // Every row of this group was collapsed into an identical row counted in
      // another one, so it contributes nothing and must not be exported as a
      // zero-valued line. No dedupeGroup in this book spans two buckets; this is
      // written because the first one that did would otherwise be silent.
      if (!g.kept.length) continue;
      const bucket = g.bucket;
      const ps = g.kept;
      const mv = ps.reduce((s, x) => s + x.marketValue, 0);
      // COST, ITS UNITS AND ITS GAIN OVER ONE SET — `costedFigures`, the same
      // helper the tab's clubbed row uses (A-02), so the sheet and the screen
      // cannot print two average costs for one holding. A position whose
      // statement reported no cost contributes nothing, never a zero.
      const cf = costedFigures(ps);
      const cost = cf.cost;
      const qty = ps.reduce((s, x) => s + x.quantity, 0);
      const zeroCost = cost === 0 && mv > 0;
      const costNA = cost === null || zeroCost;
      // ONE MARK OR NONE (A-03): where the statements disagree on a price no
      // single figure covers every unit, and the sheet leaves it blank — with
      // the marks named in the row's note, as the tab's hover names them.
      const mark = commonMark(ps, markKey);
      const sources = [...new Set(ps.map((x) => providerOf(idx, x)))].sort().join(" + ");
      const avgCost = !costNA ? cf.avgCost : null;
      /**
       * THE RETURN THE TAB SHOWS BY DEFAULT, ON THE INPUTS ITS ROW CARRIES.
       *
       * FIFO over the row's own deduped holdings — the realised gain on units
       * already sold stays in it — then `measuredReturn(…, "auto", …)`, which
       * annualises only where every unit's purchase date is on a lot register
       * (`heldSince` on EVERY line: one missing start makes the row's start
       * unknown, not older) and the window to the row's ONE value date is a
       * year or longer. Crompton at LKP is the case the sheet used to get
       * wrong: −27.78% on cost printed under the same heading the tab fills
       * with its CAGR.
       */
      const fifo = fifoTotals(ps, fifoOpts);
      const fifoRet = costNA || (cost as number) <= 0 ? null : fifo.returnPct;
      const since = ps.every((x) => x.heldSince)
        ? ps.reduce((a: string, x) => (x.heldSince! < a ? x.heldSince! : a), ps[0].heldSince!)
        : null;
      const valuedAt = commonValueDate(ps.map(valueDate));
      /**
       * THE DATED CAPITAL, WHERE THIS ROW IS WHOLE ACCOUNTS — `behind`, against
       * the current holdings unfiltered, as the tab asks it. A fund folio the
       * family funded on several dates is its account, and the tab's default
       * shows that account's money-weighted rate; a holding inside an account
       * carries none (`null`), and every rule below it is unchanged.
       */
      const capital = dated.behind(ps, held) ?? undefined;
      const input = { returnPct: fifoRet, heldSince: since, valuedAt, assetClass: ps[0].assetClass, costNA, capital };
      const ret = measuredReturn(input, "auto", bookAsOf);

      // How each line was priced and on what date, oldest first.
      const basisSeen = new Map<string, { basis: Basis; date: string | null }>();
      for (const x of ps) {
        const b = { basis: basisOf(x), date: valueDate(x) };
        basisSeen.set(`${b.basis}|${b.date}`, b);
      }
      const bases = [...basisSeen.values()].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.basis.localeCompare(b.basis));

      /**
       * EVERY BLANK FIGURE SAYS WHY (MSX-17), in the words the tab's own cells
       * carry in their hover — and, for a cost nobody reported, naming WHOSE
       * statement it is rather than asserting one cause over all of them.
       */
      const notes: string[] = [];
      if (costNA) {
        const why = cf.vacuous ? VACUOUS_COST_REASON
          : zeroCost ? "the statement reports a cost of zero against a positive market value, which would book the whole holding as profit, so no cost-based figure is struck on it"
          : `no statement behind this holding reports what it cost — it is reported by ${sources}. A ₹0 here would report the whole holding as profit`;
        notes.push(`Avg Cost, Unreal. P&L, Return — ${why}`);
      } else {
        if (avgCost === null) notes.push("Avg Cost — the lines that report a cost hold no units to divide it by");
        if (!cf.complete && cf.uncosted.value !== 0) {
          notes.push(`Avg Cost, Unreal. P&L${ret.shown ? ", Return" : ""} — struck over the costed units alone: `
            + `${cf.uncosted.lines} line${cf.uncosted.lines === 1 ? "" : "s"} worth ${inr(cf.uncosted.value)} `
            + `${cf.uncosted.lines === 1 ? "reports" : "report"} no cost and ${cf.uncosted.lines === 1 ? "is" : "are"} left out of all three, never counted at zero`);
        }
      }
      // WHERE A DEPOSITORY LINE'S UNITS CAME FROM — the tab's own words: no
      // statement priced these units, so a reader must not take their value for
      // a statement mark replaced. WHICH depository record it is follows the
      // line's own kind (Stage 10cz): a transaction-only account's closing
      // balance, a holding statement's balance beside the price of its LAST
      // MOVEMENT, one printed with no rate, or one with no usable price — and
      // only the first may say the account sent no holding statement.
      const depoLines = ps.filter((x) => !!x.depositoryUnits);
      if (depoLines.length) {
        const phrases = [...new Set(depoLines.map((x) => describeDepositoryUnits(x.depositoryUnits!, idx)))];
        const nav = depoLines.some((x) => x.navPriced);
        const quote = depoLines.some((x) => !x.navPriced);
        const at = nav && quote ? "AMFI's published NAV or the live quote"
          : nav ? "AMFI's published NAV" : "the live quote";
        notes.push(`Qty — ${depoLines.length === ps.length ? "these units are" : "some of these units are"} `
          + `${phrases.join("; and ")} — no statement priced them, and they are valued at ${at}`);
      }
      if (mark.price === null) {
        // The tab's own sentence names the marks and then says "open the row";
        // a workbook row does not open, so the sheet says what the lines are.
        notes.push(`CMP — ${mark.values.length > 1
          ? `the statements reporting this holding mark it at ${mark.values.map((v) => fmtCurrency(v, "INR")).join(" and ")}; `
            + `no one price covers every unit, and a weighted mean of them is a figure no statement printed`
          : "marked at a total value, not a per-unit price"}`);
      }
      if (!costNA) {
        if (!ret.shown) {
          // A cost is reported, but it covers too little of the row to strike a
          // return over — `fifoTotals`' coverage test. A return over part of a
          // holding would describe neither part.
          notes.push(fifoRet === null
            ? (mv <= 0
              // A nil cash sleeve, or a settlement payable carried at a
              // negative value: nothing of value is held, so nothing earns.
              ? `Return — this line holds nothing of positive value (a nil balance, or a settlement payable carried at ${inr(mv)}), so there is no return to strike`
              : `Return — the lines that report a cost cover ${inr(cf.costedValue)} of this row's ${inr(mv)}, too little of it to strike a return over the whole`)
            : `Return — ${ret.reason}`);
        } else {
          const parts: string[] = [];
          // The measure's own sentence where the row is DATED — a CAGR's
          // window, dated end to end the way the tab's CAGR measure words it,
          // or a lot-dated holding under a year — and never the generic "no
          // purchase date" line, which the note under the total states once for
          // every HPR row.
          const dated = ret.tag === "CAGR" ? measuredReturn(input, "cagr", bookAsOf) : ret;
          const note = dated.shown ? dated.note : undefined;
          if (note && (since || valuedAt === null || isFixedIncome(ps[0].assetClass) || capital?.dated)) parts.push(note);
          if (typeof fifo.realised === "number" && Math.abs(fifo.realised) >= 0.005) {
            parts.push(fifo.realised > 0
              ? `includes ${inr(fifo.realised)} realised on units already sold (FIFO), which Unreal. P&L does not`
              : `includes a realised loss of ${inr(-fifo.realised)} on units already sold (FIFO), which Unreal. P&L does not`);
          }
          if (parts.length) notes.push(`Return — ${parts.join("; ")}`);
        }
      }

      rows.push({
        security: ps[0].security, bucket, sector: ps[0].sector,
        // THE FAMILY'S OWN AXES, struck on the same position the bucket is and
        // through the same helpers the tab uses, so the sheet and the screen
        // can never disagree about which basket a holding is in.
        familyClass: familyClassKeyOf(ps[0], isMandateHeld(engagementOf(idx, ps[0]))),
        basket: basketKeyOf(ps[0], isMandateHeld(engagementOf(idx, ps[0]))),
        // Both of these are PER-ACCOUNT facts and read the RAW rows, not the
        // deduped ones: an owner whose statement was collapsed still reported
        // the holding, and so did the account that states the route.
        heldVia: [...new Set(g.raw.map((x) => ROUTE_LABEL[holdingRoute(engagementOf(idx, x))]))].join(", "),
        entities: [...new Set(g.raw.map((x) => ownerOf(idx, x)))].join(", "),
        mandate: g.mandate,
        // WHOSE STATEMENT THIS ROW CAME FROM, read off the registry. The note
        // under the Total names these for the rows that report no cost, so a
        // reader chasing a missing cost basis is sent to the right document
        // instead of to one cause asserted over all of them.
        sources,
        costNone: cost === null,
        uncostedValue: cost === null ? 0 : cf.uncosted.value,
        // `cmp` is the per-unit mark and is genuinely absent for a holding whose
        // provider prints none (360 ONE marks its AIF at a Net Asset Value with no
        // NAV per unit). Kept null here and rendered as an em dash by the caller,
        // never as a zero price that would read as a measurement.
        qty, avgCost, cmp: mark.price,
        marketValue: mv, weight: totalMV > 0 ? (mv / totalMV) * 100 : null,
        // NULL, NEVER 0. The cell already rendered an em dash; the zero survived
        // in the model and was summed into the Total row below.
        pnl: costNA ? null : cf.unrealised,
        returnPct: ret.shown ? ret.pct : null,
        returnTag: ret.shown ? ret.tag : null,
        bases,
        notes,
      });
    }
  }
  /**
   * READING ORDER, DERIVED FROM THE FIGURES: classes largest first, mandates
   * largest first inside the PMS class, names largest first inside each. Every
   * key is computed from the rows themselves, so the order cannot drift away
   * from the values it is ordering.
   *
   * It is deliberately NOT a copy of the tab's fixed section order. That list
   * lives in the page component and re-typing it here would give this book two
   * orders to disagree in — the subtitle says what this sheet does instead of
   * claiming to reproduce the tab's sections.
   */
  const bucketMV = new Map<string, number>();
  const mandateMV = new Map<string, number>();
  for (const r of rows) {
    bucketMV.set(r.bucket, (bucketMV.get(r.bucket) ?? 0) + r.marketValue);
    if (r.mandate) mandateMV.set(r.mandate, (mandateMV.get(r.mandate) ?? 0) + r.marketValue);
  }
  return rows.sort((a, b) => {
    if (a.bucket !== b.bucket) {
      return (bucketMV.get(b.bucket) ?? 0) - (bucketMV.get(a.bucket) ?? 0) || a.bucket.localeCompare(b.bucket);
    }
    if (a.mandate !== b.mandate) {
      return (mandateMV.get(b.mandate ?? "") ?? 0) - (mandateMV.get(a.mandate ?? "") ?? 0)
        || (a.mandate ?? "").localeCompare(b.mandate ?? "");
    }
    return b.marketValue - a.marketValue;
  });
}

type ColSpec = {
  /** How a row names this column's value. See `writeRow`. */
  key: string;
  header: string; width: number; numFmt?: string; align?: "left" | "right" | "center"; signed?: boolean;
  /**
   * A number format chosen from the VALUE, where one format cannot show every
   * value faithfully — a unit count is whole on most rows and fractional on a
   * few, and `#,##0` would display 3,859.667 units as 3,860.
   */
  numFmtFor?: (v: unknown) => string | undefined;
};

/** The header row sits under the title and the two lines that describe the sheet. */
const HEADER_ROW = 4;

/**
 * The title, then TWO lines under it: what the sheet is, and what its figures
 * are AS OF. The second is the one a reader needs before any figure (MSX-17) —
 * it used to end at "exported <date>", which dates the FILE and none of the
 * figures in it.
 */
function titleBlock(ws: ExcelJS.Worksheet, cols: ColSpec[], subtitle: string, asOfLine: string) {
  const span = cols.length;
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell("A1");
  t.value = "Glow Ventures Family Office — Portfolio Monitor";
  t.font = { name: "Calibri", size: 14, bold: true, color: { argb: C.champagneText } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.ink } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;
  // A merged cell CLIPS rather than overflowing and Excel does not auto-fit a
  // merged row, so each line is wrapped and its height computed from the
  // span's own width in character units (conservative at Calibri 9).
  const perLine = cols.reduce((w, c) => w + c.width, 0);
  const line = (r: number, text: string, italic: boolean) => {
    ws.mergeCells(r, 1, r, span);
    const s = ws.getCell(r, 1);
    s.value = text;
    s.font = { name: "Calibri", size: 9, italic, color: { argb: C.muted } };
    s.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true };
    ws.getRow(r).height = 13 * Math.max(1, Math.ceil(text.length / perLine)) + 3;
  };
  line(2, subtitle, true);
  line(3, asOfLine, false);
}

function headerRow(ws: ExcelJS.Worksheet, cols: ColSpec[], rowIdx: number) {
  const row = ws.getRow(rowIdx);
  cols.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.champagneText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.inkHead } };
    cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: C.champagne } } };
  });
  row.height = 20;
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
}

function styleDataCell(cell: ExcelJS.Cell, c: ColSpec, value: unknown, zebra: boolean, signedVal?: number) {
  cell.value = value as any;
  const fmt = c.numFmtFor?.(value) ?? c.numFmt;
  if (fmt) cell.numFmt = fmt;
  const color = c.signed && typeof signedVal === "number"
    ? (signedVal > 0 ? C.gain : signedVal < 0 ? C.loss : C.text)
    : C.text;
  cell.font = { name: "Calibri", size: 10, color: { argb: color } };
  cell.alignment = { vertical: "middle", horizontal: c.align ?? "left" };
  if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
}

/**
 * WRITE A ROW BY COLUMN KEY, NEVER BY A LITERAL INDEX.
 *
 * Every cell used to be written as `row.getCell(9), cols[8]` — an index paired
 * by hand with the spec that formats it, thirteen times over. Reordering the
 * sheet is precisely the edit that breaks that pairing, and it breaks it
 * SILENTLY: one missed pair formats a return as rupees, or writes a sector into
 * the money column, and the file still opens. So the order now lives in `cols`
 * alone and a row arrives as a record keyed by the same strings — the ingest's
 * own rule (`lib/table.mjs`: match on the HEADER, never on the column index)
 * applied to the writing side.
 *
 * The sign colour is derived from the value rather than passed beside it: a
 * signed column carries either its number or `DASH`, so "is this a number" is
 * exactly the old `?? undefined` and cannot fall out of step with the value.
 */
function writeRow(ws: ExcelJS.Worksheet, cols: ColSpec[], r: number, rec: Record<string, unknown>, zebra: boolean) {
  const row = ws.getRow(r);
  cols.forEach((c, i) => {
    const v = rec[c.key];
    styleDataCell(row.getCell(i + 1), c, v, zebra, typeof v === "number" ? v : undefined);
  });
}

/** A column's 1-based position, by key. Throws rather than writing to the wrong cell. */
function colAt(cols: ColSpec[], key: string): number {
  const i = cols.findIndex((c) => c.key === key);
  if (i < 0) throw new Error(`exportPortfolioExcel: no column keyed "${key}"`);
  return i + 1;
}

/** A merged, wrapped note row under a table, tall enough to show its text. */
function noteRow(ws: ExcelJS.Worksheet, cols: ColSpec[], r: number, text: string) {
  ws.mergeCells(r, 1, r, cols.length);
  const note = ws.getRow(r).getCell(1);
  note.value = text;
  note.font = { name: "Calibri", size: 9, italic: true, color: { argb: C.muted } };
  // WRAPPED, AND THE ROW MADE TALL ENOUGH TO SHOW IT. A merged cell CLIPS rather
  // than overflowing, so at `wrapText: false` and a fixed 16pt a sentence — the
  // one thing standing between a P&L struck over part of the book and one that
  // reads as struck over all of it — was invisible in the file the moment it
  // outgrew the merged span by a character. Excel does not auto-fit a merged
  // row, so the height is computed: the span's own width in column units is the
  // characters that fit on a line (conservative at Calibri 9 against the
  // Calibri 11 those units are measured in).
  note.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true };
  const perLine = cols.reduce((w, c) => w + c.width, 0);
  ws.getRow(r).height = 14 * Math.max(1, Math.ceil(text.length / perLine)) + 4;
}

const MONEY = '#,##0;[Red]-#,##0';
const MONEY_SIGNED = '+#,##0;-#,##0;0';
const PRICE = "#,##0.00";
const PCT = '+0.0"%";-0.0"%";0.0"%"';
const QTY = "#,##0";
/**
 * A UNIT COUNT IS STORED AS PRINTED AND DISPLAYED THE SAME WAY (MSX-22). The
 * cell used to hold `Math.round(qty)`, so 3,859.667 Shoppers Stop shares became
 * 3,860 in the VALUE — a reader's own Qty × Price then missed the Amount beside
 * it. Whole counts keep `#,##0`; a fractional one shows the decimals the
 * statement printed (up to four), never a rounded figure.
 */
const QTY_FRAC = "#,##0.0###";
const qtyFormat = (v: unknown) =>
  typeof v === "number" && Math.abs(v - Math.round(v)) > 1e-9 ? QTY_FRAC : QTY;

/**
 * The line that dates a sheet's figures: how many rows are valued on each
 * basis, and on which dates. A total over them BLENDS those dates, which is the
 * thing a reader must be told before they compare it with a statement.
 */
function holdingsAsOfLine(rows: HoldingRow[]): string {
  let statement = 0, nav = 0, live = 0, mixed = 0;
  const statementDates: string[] = [];
  const navDates = new Set<string>();
  const liveDates = new Set<string>();
  for (const r of rows) {
    const kinds = new Set(r.bases.map((b) => b.basis));
    if (kinds.size > 1) mixed++;
    else if (kinds.has("live")) live++;
    else if (kinds.has("nav")) nav++;
    else statement++;
    for (const b of r.bases) {
      if (!b.date) continue;
      if (b.basis === "statement") statementDates.push(b.date);
      else if (b.basis === "nav") navDates.add(b.date);
      else liveDates.add(b.date);
    }
  }
  statementDates.sort();
  const plural = (n: number, w: string) => `${n} row${n === 1 ? "" : "s"}${w}`;
  const parts: string[] = [];
  if (statement) {
    const lo = statementDates[0], hi = statementDates[statementDates.length - 1];
    parts.push(`${plural(statement, "")} at statement marks dated ${lo === hi ? lo : `${lo} → ${hi}`}`);
  }
  if (nav) parts.push(`${plural(nav, "")} at AMFI's published NAV for ${[...navDates].sort().join(", ")}`);
  parts.push(live ? `${plural(live, "")} at live quotes of ${[...liveDates].sort().join(", ")}` : "no row at a live quote");
  if (mixed) parts.push(`${plural(mixed, "")} mixing these bases`);
  return `Values as struck, not on one date: ${parts.join("; ")}. Every total below blends these dates — `
    + `each row's own basis and date is in "Priced as of", and a figure left blank says why in "Notes".`;
}

function buildHoldings(wb: ExcelJS.Workbook, positions: Position[], accounts: Account[], nowMs: number) {
  const ws = wb.addWorksheet("Holdings", { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  /**
   * THE MONEY READS FIRST AND THE DESCRIPTORS CLOSE THE SHEET — the same
   * reading order the tab was given, at the family's request, and for the same
   * reason: five columns of words between the security's name and its first
   * figure push Qty, cost and value off the first screen on a sheet whose
   * reader is scanning for value.
   *
   * The workbook is not a copy of the tab and still carries columns the screen
   * does not — Class, Held via and Mandate, which are what the regrouped tab
   * turns on: WHICH SECTION a row sits in, WHO CHOSE IT, and where a manager
   * did, WHICH MANDATE. Without them the sheet flattens the tab's sections into
   * one undifferentiated list and cannot answer which mandate holds a given
   * company. And "Priced as of" and "Notes", which are the tab's hovers: a
   * workbook has no hover, so the basis a figure was struck on and the reason a
   * cell is blank travel on the row.
   */
  const cols: ColSpec[] = [
    { key: "security", header: "Security", width: 34 },
    { key: "qty", header: "Qty", width: 14, numFmt: QTY, numFmtFor: qtyFormat, align: "right" },
    { key: "avgCost", header: "Avg Cost (₹)", width: 13, numFmt: PRICE, align: "right" },
    { key: "cmp", header: "CMP (₹)", width: 12, numFmt: PRICE, align: "right" },
    { key: "marketValue", header: "Market Value (₹)", width: 18, numFmt: MONEY, align: "right" },
    // Named on the header rather than left to be assumed: the denominator is the
    // WHOLE consolidated book the tab draws — every class, listed and private —
    // not the class section the row sits in.
    { key: "weight", header: "Weight of book", width: 14, numFmt: '0.0"%"', align: "right" },
    { key: "pnl", header: "Unreal. P&L (₹)", width: 18, numFmt: MONEY_SIGNED, align: "right", signed: true },
    // THE TAB'S DEFAULT MEASURE, AND WHICH ONE IT IS (HPR, CAGR or XIRR). The
    // tab prints the tag inside the cell; a spreadsheet cell holding "−26.1%
    // CAGR" is text a reader's SUM() and sort cannot use, so the tag has a
    // column of its own.
    { key: "returnPct", header: "Return", width: 11, numFmt: PCT, align: "right", signed: true },
    { key: "returnTag", header: "Measure", width: 10, align: "center" },
    /*
     * NO YTD COLUMN, BECAUSE THE TAB HAS NONE. *"The holdings table gets ONE
     * return column, remove YTD etc. from the table"* (Stage 10af), and the
     * sheet follows the tab at the family's request (Stage 10n). It stayed here
     * after the tab lost it — an em dash on every row of this book, with no
     * reason anywhere in the file. YTD is still a measure the tab's picker
     * offers; this sheet carries the tab's DEFAULT, which is the Return beside.
     */
    { key: "bucket", header: "Class", width: 18 },
    /**
     * THE FAMILY'S OWN TWO SLICES, AS COLUMNS RATHER THAN AS SECTIONS.
     *
     * The tab can only be sectioned one way at a time; a spreadsheet can be
     * pivoted on any column, so the sheet carries all three axes at once and
     * lets the reader group by whichever they want. That is the one thing the
     * workbook can do that the screen cannot, and it is why these belong here
     * rather than being left to a second export.
     *
     * Both fall back to the same sentence the tab's section heading uses, never
     * to a blank: an empty cell in a column of classifications reads as an
     * oversight, and `SUM(...)` over a pivot silently drops it.
     */
    { key: "heldVia", header: "Held via", width: 20 },
    { key: "mandate", header: "Mandate", width: 34 },
    { key: "familyClass", header: "Asset Class (family)", width: 22 },
    { key: "basket", header: "Basket (family)", width: 24 },
    { key: "sector", header: "Sector", width: 20 },
    { key: "entities", header: "Entities", width: 24 },
    { key: "pricedAsOf", header: "Priced as of", width: 22 },
    { key: "notes", header: "Notes", width: 80 },
  ];
  const exported = new Date(nowMs).toISOString().slice(0, 10);

  /**
   * THE SET THE TAB DRAWS, AND NOTHING ELSE (B-08 / MSX-9).
   *
   * `currentHoldings` — the one definition of what the family holds — applied
   * HERE rather than trusted to the caller, so the sheet cannot be handed a set
   * the tab does not draw. It listed the five closed positions (3P's three
   * classes, two HDFC schemes: redeemed to nil, a measured ₹0) and the six
   * sub-₹1,000 specks, and its footer ran ₹840.99 above the tab's. What it
   * leaves out is NAMED under the total, not silently gone.
   *
   * THE CATEGORY VIEW'S SET, AND THE SUBTITLE SAYS SO. The tab opens on All
   * Securities (Stage 10cm), where only a company share is a row and a fund is
   * not; a sheet of that view would drop every fund's money. Category is the
   * view on which every current holding is a row.
   */
  const idx = accountIndex(accounts);
  const held = currentHoldings(positions);
  const dropped = droppedHoldings(positions);
  const rows = consolidate(held, accounts, nowMs, bookDatedCapital());

  // WHAT THIS SHEET DOES, not what another screen does. It used to claim the
  // rows were laid out "in the Portfolio Monitor's own sections", which a reader
  // can check and find false: the tab orders its sections by reading order and
  // rolls each mandate into ONE expandable row, while this sheet orders classes
  // by value and prints every constituent. The Class, Held via and Mandate
  // columns carry the tab's grouping; the subtitle no longer claims its layout.
  titleBlock(ws, cols,
    `Holdings · the current holdings the Portfolio Monitor draws on its Category view, where every holding is a row `
    + `(what it leaves out is named under the total) · `
    + `one row per security per class, and per mandate inside PMS mandates · classes largest first · `
    + `each dedupeGroup counted once · values in INR · exported ${exported}`,
    holdingsAsOfLine(rows));
  headerRow(ws, cols, HEADER_ROW);

  let r = HEADER_ROW + 1;
  for (const h of rows) {
    // `?? DASH` on every absent cell, never null and never a blank: an empty
    // cell is a third state beside their em dashes, and the one a reader's own
    // formula silently treats as zero. A row no manager runs has no mandate.
    writeRow(ws, cols, r, {
      security: displaySecurity(h.security),
      qty: h.qty,
      avgCost: h.avgCost ?? DASH,
      cmp: h.cmp ?? DASH,
      marketValue: h.marketValue,
      weight: h.weight ?? DASH,
      pnl: h.pnl ?? DASH,
      returnPct: h.returnPct ?? DASH,
      returnTag: h.returnTag ?? DASH,
      bucket: bucketLabel(h.bucket),
      heldVia: h.heldVia,
      familyClass: h.familyClass,
      basket: h.basket,
      mandate: h.mandate ?? DASH,
      sector: h.sector,
      entities: h.entities,
      pricedAsOf: h.bases.map((b) => `${BASIS_LABEL[b.basis]} ${b.date ?? "undated"}`).join(" + "),
      notes: h.notes.length ? h.notes.join(" · ") : DASH,
    }, (r % 2) === 0);
    r++;
  }
  // Totals. Market value covers every row; unrealised P&L cannot, and says so.
  const totMV = rows.reduce((s, h) => s + h.marketValue, 0);
  // `sumOrNull`, not a plain sum over a column that carried a 0 for every
  // cost-less row. The cell already rendered an em dash while the zero went
  // silently into this total, dragging it towards a figure nobody measured. How
  // many rows that is, and what they are worth, is COUNTED into the note printed
  // under the total rather than stated here — a figure typed into a comment does
  // not regenerate with the book.
  const priced = rows.filter((h) => h.pnl !== null);
  const totPnL = sumOrNull(rows.map((h) => h.pnl));
  const unpricedRows = rows.length - priced.length;
  const unpricedMV = rows.reduce((s, h) => s + (h.pnl === null ? h.marketValue : 0), 0);
  // …and the uncosted lines INSIDE rows that do carry a P&L, which that P&L
  // is not struck over either.
  const partRows = rows.filter((h) => h.pnl !== null && h.uncostedValue > 0);
  const partMV = partRows.reduce((s, h) => s + h.uncostedValue, 0);
  /**
   * WHERE THE COST-LESS ROWS COME FROM, derived per row from the account behind
   * it. The note used to assert ONE cause for all of them — "a depository holds
   * shares, it did not buy them" — which is true of the demat rows and false of
   * the rest: a fund's own account statement and an AMC folio statement carry
   * rows here too, and a reader chasing one of those for a depository statement
   * is looking for a document that was never the source. Naming the issuers is a
   * measured fact about every row the sentence covers.
   */
  const bySource = new Map<string, number>();
  for (const h of rows) if (h.pnl === null) bySource.set(h.sources, (bySource.get(h.sources) ?? 0) + 1);
  // A cost of zero beside a positive market value is skipped for a different
  // reason than a cost nobody reported, so it is counted apart and the clause
  // naming it writes itself on the drop where one lands.
  const zeroCostRows = rows.filter((h) => h.pnl === null && !h.costNone).length;
  const sourceList = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => `${name} ${n} row${n === 1 ? "" : "s"}`)
    .join(", ");
  const tr = ws.getRow(r);
  const set = (col: number, val: unknown, fmt?: string, signed?: number) => {
    const cell = tr.getCell(col);
    cell.value = val as any;
    if (fmt) cell.numFmt = fmt;
    const color = typeof signed === "number" ? (signed > 0 ? C.gain : signed < 0 ? C.loss : C.text) : C.text;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: color } };
    // FROM THE COLUMN'S OWN SPEC, never a literal boundary. This read
    // `col >= 7`, which was where the money began in the old layout and became
    // wrong the moment the sheet was reordered — the same index-versus-header
    // failure `writeRow` exists to end.
    cell.alignment = { vertical: "middle", horizontal: cols[col - 1].align ?? "left" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalFill } };
    cell.border = { top: { style: "thin", color: { argb: C.champagne } } };
  };
  set(1, `Total · ${rows.length} holdings`);
  for (let c = 2; c <= cols.length; c++) set(c, "");
  // A total over NO rows is not ₹0 — an empty book is the absence of a
  // statement, and a zero here would read as one that measured nothing held.
  set(colAt(cols, "marketValue"), rows.length ? totMV : DASH, rows.length ? MONEY : undefined);
  set(colAt(cols, "pnl"), totPnL ?? DASH, totPnL === null ? undefined : MONEY_SIGNED, totPnL ?? undefined);
  tr.height = 18;

  // WHAT THE TOTAL COVERS, printed under it rather than left to be discovered by
  // adding the column up. A P&L total struck over two thirds of the rows reads
  // exactly like one struck over all of them.
  r++;
  noteRow(ws, cols, r, unpricedRows === 0
    ? `Unrealised P&L covers all ${rows.length} rows. Market value covers all ${rows.length}.`
    : `Unrealised P&L covers ${priced.length} of ${rows.length} rows. The other ${unpricedRows}`
      + ` (${fmtCr(unpricedMV, 2)} of market value) have no cost basis this total can stand on, so they are`
      + ` left out of it rather than counted as zero`
      + (zeroCostRows > 0
        ? ` — ${zeroCostRows} of them report a cost of zero against a positive market value, which would book`
          + ` the whole holding as profit`
        : ``)
      + `. Whose statements they are: ${sourceList}.`
      + (partRows.length > 0
        ? ` ${partRows.length} more row${partRows.length === 1 ? " is" : "s are"} only partly costed, and ${fmtCr(partMV, 2)} of`
          + ` ${partRows.length === 1 ? "its" : "their"} value is on statements that report no cost; ${partRows.length === 1 ? "its" : "their"}`
          + ` average cost and P&L are struck over the costed units alone.`
        : ``)
      + ` Market value covers all ${rows.length}.`);

  /**
   * WHAT THE SHEET DOES NOT LIST, AND WHY — each with its own reason (MSX-18).
   * A closed position is a MEASURED ₹0 — the fund still prices units the family
   * no longer holds — and not a holding missing its cost, which is what the note
   * above used to call the redeemed rows while they were still listed.
   */
  r++;
  // NAMED WITH WHOSE STATEMENT IT IS, because a current holding can share the
  // name: HDFC Liquid Fund · Direct is redeemed to nil in the HDFC folio and
  // held, valued, on a demat.
  const closedFunds = [...new Set(dropped.closed.map((p) => `${displaySecurity(p.security)} (${providerOf(idx, p)})`))];
  const smallValue = dropped.negligible.reduce((s, p) => s + p.marketValue, 0);
  noteRow(ws, cols, r, `Not listed, exactly as on the Portfolio Monitor: `
    + (dropped.closed.length
      ? `${dropped.closed.length} closed position${dropped.closed.length === 1 ? "" : "s"} (${closedFunds.join(", ")}) — `
        + `the fund still publishes a NAV and the family holds none of its units, a measured zero rather than a missing cost`
      : `no closed position`)
    + `; `
    + (dropped.negligible.length
      ? `${dropped.negligible.length} holding${dropped.negligible.length === 1 ? "" : "s"} worth under ${inr(NEGLIGIBLE_VALUE_FLOOR)} each, `
        + `${inr(smallValue)} in total, dropped at the family's instruction — the book still carries them and the statements still report them`
      : `no holding under the ${inr(NEGLIGIBLE_VALUE_FLOOR)} floor`)
    + `.`);

  // WHICH RETURN, stated once for every row — the Measure column says which
  // one each row carries, and Notes carries a row's own window where it has one.
  r++;
  const tagged = (tag: string) => rows.filter((h) => h.returnTag === tag).length;
  const n = (k: number) => `${k} row${k === 1 ? "" : "s"}`;
  const xirrRows = tagged("XIRR");
  noteRow(ws, cols, r, `Return is the Portfolio Monitor's default measure. HPR (${n(tagged("HPR"))}): `
    + `the FIFO return on the capital deployed — unrealised plus realised, over the cost of the units still held and of`
    + ` the units already sold — not annualised; it stands wherever a holding is under a year old or no statement dates`
    + ` its purchase. CAGR (${n(tagged("CAGR"))}): the same return annualised over a window of a year or longer, where a`
    + ` lot register dates every unit held, or the row is a whole account the family funded in one dated payment.`
    + (xirrRows
      ? ` XIRR (${n(xirrRows)}): the money-weighted rate over the family's own dated payments into the whole account(s) a`
        + ` row is, where the money went in on several dates a year or more ago — the record the Transactions card solves over.`
      : ``)
    + ` Unreal. P&L excludes gains already realised, so a Return can differ from P&L ÷ cost — Notes names the realised`
    + ` figure where there is one. Individual-share returns exclude separately paid dividends.`);
}

/**
 * What the Transactions sheet is handed. `TxnData` is `loadTransactions()`'s
 * whole answer and `null` is that loader saying the archive did not answer —
 * the two cases the sheet must never render alike (MSX-19). A bare array is
 * rows alone, from a caller that did not keep the difference.
 */
export type TxnInput = TxnData | readonly Txn[] | null;

function buildTransactions(wb: ExcelJS.Workbook, input: TxnInput, nowMs: number) {
  const ws = wb.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  // Entity closes the row's figures, as it does on the tape this sheet mirrors.
  // Type stays beside Security: one narrow column saying what the row IS, not a
  // block of descriptors standing between the name and the first figure. Notes
  // closes the sheet: why a figure on the row is blank.
  const cols: ColSpec[] = [
    { key: "date", header: "Date", width: 12, align: "left" },
    { key: "security", header: "Security", width: 34 },
    { key: "side", header: "Type", width: 8, align: "center" },
    { key: "qty", header: "Qty", width: 14, numFmt: QTY, numFmtFor: qtyFormat, align: "right" },
    { key: "price", header: "Price (₹)", width: 12, numFmt: PRICE, align: "right" },
    { key: "amount", header: "Amount (₹)", width: 18, numFmt: MONEY, align: "right" },
    { key: "realized", header: "Realized P&L (₹)", width: 18, numFmt: MONEY_SIGNED, align: "right", signed: true },
    { key: "account", header: "Entity", width: 24 },
    { key: "notes", header: "Notes", width: 70 },
  ];
  const exported = new Date(nowMs).toISOString().slice(0, 10);
  const data = input !== null && !Array.isArray(input) ? (input as TxnData) : null;
  const txns: readonly Txn[] = input === null ? [] : Array.isArray(input) ? (input as readonly Txn[]) : (input as TxnData).txns;

  /**
   * WHAT THIS TAPE IS, NOT "THE FULL DATED BUY/SELL TAPE" (MSX-19). It is the
   * managers' dealing as the transaction statements print it, over the window
   * those statements cover, from the accounts that issue one — the family's own
   * capital in and out is the dated capital record, which is not on this sheet.
   * And an archive that did not answer must not export as a tape with no rows,
   * which reads exactly like a quarter in which nobody traded.
   */
  const scope = data
    ? `Transactions · the managers' dealing as the transaction statements print it, `
      + `${data.periodFrom && data.periodTo ? `${data.periodFrom} → ${data.periodTo}` : "over the window those statements cover"} · `
      + `${data.accounts.length} account${data.accounts.length === 1 ? " issues" : "s issue"} a transaction statement and `
      + `${data.accountsWithout.length} do${data.accountsWithout.length === 1 ? "es" : ""} not · `
      + (data.ownAllotments.length
        ? `${data.ownAllotments.length} row${data.ownAllotments.length === 1 ? "" : "s"} a fund's own statement prints for the family buying or redeeming its units `
          + `${data.ownAllotments.length === 1 ? "is" : "are"} the family's capital and are in the dated capital record, not here · `
        : ``)
      + `values in INR · exported ${exported}`
    : `Transactions · the managers' dealing as the transaction statements print it · values in INR · exported ${exported}`;
  const state = input === null
    ? `The transaction archive did not answer when this file was exported, so NO TRADES ARE LISTED — this is not a statement `
      + `that there were none. Export again once the archive is reachable.`
    : txns.length === 0
    ? (data
      ? `The transaction statements in this book print no trades for this window, so no row is listed.`
      : `No trades were handed to this export, so no row is listed — this is not a statement that there were none.`)
    : `${txns.length} dated row${txns.length === 1 ? "" : "s"}, `
      + `${txns.filter((t) => t.side === "Buy").length} buys and ${txns.filter((t) => t.side === "Sell").length} sells, `
      + `each as its statement printed it; a blank figure says why in "Notes".`;
  titleBlock(ws, cols, scope, state);
  headerRow(ws, cols, HEADER_ROW);

  let r = HEADER_ROW + 1;
  if (!txns.length) {
    // THE EMPTY STATE IS A ROW, NOT ONLY A SUBTITLE: a reader who scrolls past
    // the title lands on the table, and an empty table reads as "no trades".
    noteRow(ws, cols, r, state);
    return;
  }
  for (const t of txns) {
    const why: string[] = [];
    // `?? DASH`, never `|| DASH`: a zero is a figure and a null is its absence,
    // and `||` sent both to the same dash.
    if (t.price === null) why.push("Price — the statement prints no price for this row");
    if (t.amount === null) why.push("Amount — the statement prints no settled amount for this row");
    if (t.realized === null) {
      why.push(`Realized P&L — ${t.realizedNote
        ?? (t.side === "Buy" ? "a purchase realises nothing" : "no capital gain statement reports what this sale realised")}`);
    }
    writeRow(ws, cols, r, {
      date: t.date,
      security: displaySecurity(t.security),
      side: t.side,
      // THE UNITS AS PRINTED — the display format does the rounding a reader
      // sees, and the value stays the one Qty × Price × Amount ties on.
      qty: t.qty,
      price: t.price ?? DASH,
      amount: t.amount ?? DASH,
      realized: t.realized ?? DASH,
      account: t.account,
      notes: why.length ? why.join(" · ") : DASH,
    }, (r % 2) === 0);
    r++;
  }
}

/**
 * The workbook itself, with no browser in it — `exportPortfolioExcel` is the
 * same thing plus the download, which is `document` and `URL.createObjectURL`
 * and therefore unreachable from a test. Split so the COLUMN LAYOUT can be
 * asserted on the real book: this file had no coverage at all, and a sheet
 * whose columns have silently swapped opens perfectly.
 *
 * `positions` is the page's own `portfolio.positions` — every row, closed ones
 * included; the Holdings sheet narrows it to the current holdings itself.
 * `nowMs` dates a live quote and the file; a test passes its own.
 */
export function buildPortfolioWorkbook(
  positions: Position[], accounts: Account[], txns: TxnInput, nowMs: number = Date.now(),
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Glow Ventures Family Office";
  wb.created = new Date(nowMs);
  buildHoldings(wb, positions, accounts, nowMs);
  buildTransactions(wb, txns, nowMs);
  return wb;
}

// Build the styled workbook and trigger a browser download.
export async function exportPortfolioExcel(positions: Position[], accounts: Account[], txns: TxnInput): Promise<void> {
  const wb = buildPortfolioWorkbook(positions, accounts, txns);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glow-portfolio-monitor-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
