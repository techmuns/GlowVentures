// NSDL'S STATEMENT OF HOLDINGS, READ OFF A SCAN.
//
// The depository's own standard layout, issued through any NSDL participant:
//
//   STATEMENT OF HOLDINGS · National Securities Depository Limited
//   DP: HDFC BANK LIMITED [IN301151]
//   Statement of Holdings as on : 31-Mar-2026
//   Client Id | Status · Category | Type | Sub Type · Name(s) · Address · …
//   ISIN | ISIN Description | ISIN Status | Account Description | Quantity | Total Balance
//
// and the copy in this book is a PHOTOGRAPH of it: Bharat Jaisinghani's account
// 22025655 at HDFC Bank, printed on 10 June 2026 and scanned back as four JPEG
// pages, out of order. `lib/scan.mjs` turns each page into words; this reader
// turns the words into holdings, and refuses any it cannot check.
//
// ── WHAT LICENSES EACH ROW ──────────────────────────────────────────────────
//
//   • THE QUANTITY IS PRINTED TWICE and must read the same in both places:
//     `51,08,911` under Quantity and `5,108,911` under Total Balance — two
//     printings, in two digit groupings, on two lines of the row. OCR does not
//     make the same mistake in two different renderings of a number by
//     accident; where the two agree the figure is what the page printed. Where
//     a cell cannot be read on the whole page, it is read again on its own,
//     raw and cleaned (`lib/scan.mjs`), and the agreement is still required.
//   • THE ISIN PASSES ITS OWN CHECK DIGIT, repaired only where one candidate is
//     clearly the cheapest undoing of OCR's usual confusions (`lib/isin.mjs`)
//     across three independent readings of the cell.
//   • NO ROW IS MISSED: every page the footer counts (`Page N of M`) is present,
//     the last says `End of Report`, and no figure in the quantity columns lies
//     outside a row. A figure in no row is a row this reader failed to anchor.
//
// One unchecked row refuses the whole statement — a partial reading of a
// holdings statement understates the account and says nothing about it.
//
// ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────────
//
// The statement prints NO RATE AND NO VALUE — quantities only — so every row
// carries its units and no market value: a depository balance, not a mark.
// Security NAMES are not checkable the way a quantity is; where another
// statement in this book prints the same ISIN, extract's ISIN pass gives the row
// that statement's spelling, and the rest are the scan's own words, named in a
// note.
import { makeHolding } from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";
import { resolveIsin } from "../lib/isin.mjs";
import { quantityReadings, SCAN_ENGINE } from "../lib/scan.mjs";
import { assetClassOf } from "./nsdlDemat.mjs";

export const SCAN_LAYOUT = "nsdl-statement-of-holdings";

/** The depository's own title and its name, with a participant line. */
export const matchesScan = (text) =>
  /STATEMENT\s+OF\s+HOLDINGS/i.test(text ?? "") && /National\s+Securities\s+Depository/i.test(text ?? "")
  && /\bDP\s*:\s*[A-Z]/i.test(text ?? "");

/** The NSDL participants this book knows, by the name the statement prints. */
export const DP_PROVIDER = [
  [/HDFC\s+BANK/i, "HDFC Bank (NSDL demat)"],
  [/ICICI\s+BANK/i, "ICICI Bank (NSDL demat)"],
];

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const NOISE = /^[^A-Za-z0-9%&()/.-]+$/;
/** The Account Description column's own words. */
const DESC_WORDS = /^(Free|Balance|Ba|Pending|Demat|Pledged?|Lock-?in|Lent|Remat)$/i;
const isinLike = (t) => /^[^A-Za-z0-9]*[A-Z]?[I1l|][NM][EF]/i.test(t) && t.replace(/[^A-Z0-9]/gi, "").length >= 11;

/** Words grouped into lines, each line left to right. */
function linesOf(words, lh) {
  const out = [];
  for (const w of [...words].sort((a, b) => a.y - b.y)) {
    const line = out.find((l) => Math.abs(l.y - w.y) < lh * 0.5);
    if (line) line.words.push(w); else out.push({ y: w.y, words: [w] });
  }
  for (const l of out) l.words.sort((a, b) => a.x - b.x);
  return out.sort((a, b) => a.y - b.y);
}
const lineText = (l) => l.words.map((w) => w.text).join(" ");

/**
 * Read the statement off an open scan session (`lib/scan.mjs`). Asynchronous —
 * it asks the session to re-read cells — and returns plain data, which rides on
 * the grid to `extract` below.
 */
export async function readScan(session) {
  const problems = [];
  const pages = [];
  for (const p of session.pages) {
    const alpha = p.words.filter((w) => /[A-Za-z]{3,}/.test(w.text)).map((w) => w.h);
    const lh = (median(alpha) ?? 40) * 1.1;
    const W = Math.max(...p.words.map((w) => w.x + w.w));
    const lines = linesOf(p.words, lh);
    const footer = lines.map(lineText).map((t) => /Page\s+(\d+)\s+of\s+(\d+)/i.exec(t)).find(Boolean);
    const footerLine = lines.find((l) => /Page\s+\d+\s+of\s+\d+/i.test(lineText(l)));
    pages.push({ p, lh, W, lines, printed: footer ? Number(footer[1]) : null, of: footer ? Number(footer[2]) : null, end: footerLine?.y ?? p.h });
  }
  const of = median(pages.map((x) => x.of).filter(Boolean));
  const seen = pages.map((x) => x.printed).filter(Boolean);
  if (!of) problems.push("no page footer (`Page N of M`) was read, so the statement cannot be shown to be complete");
  else {
    const missing = [...Array(of).keys()].map((i) => i + 1).filter((n) => !seen.includes(n));
    if (missing.length) problems.push(`the footers count ${of} page(s) and page(s) ${missing.join(", ")} are not in this file`);
  }
  pages.sort((a, b) => (a.printed ?? 99) - (b.printed ?? 99));
  const allText = pages.map((x) => x.lines.map(lineText).join("\n")).join("\n");
  const endOfReport = /End\s+of\s+Report/i.test(allText);
  if (!endOfReport) problems.push("the `End of Report` line was not read, so the statement may be truncated");

  // ── the header ──────────────────────────────────────────────────────────
  const dp = /\bDP\s*:\s*([A-Z][A-Z .&]+?LIMITED)\s*\[\s*(IN\d{6})\s*\]/i.exec(allText);
  const asOnM = /Holdings\s+as\s*on\s*:?[^0-9]{0,12}(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(allText);
  const holderLine = pages[0]?.lines.find((l) => /^Name\(?s\)?/i.test(lineText(l).replace(/^[^A-Za-z]+/, "")));
  const holder = holderLine
    ? lineText(holderLine).replace(/^[^A-Za-z]*Name\(?s\)?\s*/i, "").replace(/[^A-Za-z .]/g, " ").replace(/\s+/g, " ").trim() || null
    : null;

  /**
   * THE CLIENT ID is printed once, with no check digit, so it is read several
   * ways — raw crops and cleaned lines of its band, the rows between the `as on`
   * line and `Name(s)` in the value column — and taken only by a clear majority
   * of eight-digit readings, at least two of them. The cell's own left border
   * reads as a leading `1` (`122025655`); a nine-digit reading starting so is
   * counted without it. An identifier, not a figure: it names the account, and
   * the holder is resolved from the printed name independently.
   */
  let clientId = null;
  const clientReadings = [];
  {
    const first = pages.find((x) => x.printed === 1) ?? pages[0];
    const asOnLine = first?.lines.find((l) => /as\s*on/i.test(lineText(l)) && /\d{4}/.test(lineText(l)));
    if (first && asOnLine && holderLine && holderLine.y > asOnLine.y) {
      const valueX = holderLine.words.find((w) => /[A-Z]{3,}/.test(w.text) && !/^Name/i.test(w.text))?.x ?? first.W * 0.2;
      const rect = { left: valueX - first.lh * 0.6, top: asOnLine.y + first.lh * 0.8, right: valueX + first.lh * 12, bottom: holderLine.y - first.lh * 0.2 };
      clientReadings.push(...await session.readCell(first.p, rect, { whitelist: "0123456789", psms: ["6", "4"] }));
      clientReadings.push(...await session.readCellClean(first.p, rect, first.lh, { whitelist: "0123456789", psms: ["7", "8"] }));
      const eight = clientReadings.map((t) => t.replace(/\D/g, ""))
        .map((t) => (t.length === 9 && t.startsWith("1") ? t.slice(1) : t)).filter((t) => /^\d{8}$/.test(t));
      const votes = [...eight.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]);
      if (votes.length && votes[0][1] >= 2 && (votes.length === 1 || votes[0][1] > votes[1][1])) clientId = votes[0][0];
    }
    if (!clientId) problems.push(`the Client Id was not read clearly (${clientReadings.filter((t) => /\d{6,}/.test(t)).join(", ") || "nothing like one"})`);
  }

  // ── the rows ────────────────────────────────────────────────────────────
  const rows = [];
  for (const pg of pages) {
    const { p, lh, W, lines, end } = pg;
    const anchors = p.words.filter((w) => w.x < W * 0.22 && isinLike(w.text) && w.y < end).sort((a, b) => a.y - b.y);
    const descX = median(p.words.filter((w) => /^(Free|Pending|Pledge|Lock|Lent|Remat|Demat)/i.test(w.text)).map((w) => w.x)) ?? W * 0.45;
    const numTok = (w) => /\d/.test(w.text) && /^[\d,.\s:;'|]+$/.test(w.text);
    // Fragments a space split apart ("9,90,429" ".684") are one figure.
    const joinNums = (ws) => {
      const out = [];
      for (const w of [...ws].sort((a, b) => a.y - b.y || a.x - b.x)) {
        const prev = out.at(-1);
        if (prev && /^\.\d+$/.test(w.text.trim()) && Math.abs(prev.y - w.y) < lh && w.x - (prev.x + prev.w) < lh * 2) {
          prev.text += w.text.trim(); prev.w = w.x + w.w - prev.x; continue;
        }
        out.push({ ...w });
      }
      return out;
    };
    const span = anchors.map((a, i) => ({
      a, top: a.y - lh * 1.2,
      bottom: Math.min(anchors[i + 1] ? anchors[i + 1].y - lh * 0.6 : a.y + lh * 8, end - 5),
    }));
    const nums = joinNums(p.words.filter((w) => w.x > W * 0.55 && w.y < end && numTok(w)));
    // First, the page's two quantity columns — where the figures of rows whose
    // two printings already agree END (they are right-aligned).
    const learned = span.map(({ a, top, bottom }) => {
      const right = nums.filter((n) => n.y >= top && n.y < bottom);
      const qs = right.filter((n) => Math.abs(n.y - a.y) < lh * 1.6);
      const ts = right.filter((n) => n.y - a.y >= lh * 0.6 && !qs.includes(n));
      const q = qs.find((x) => ts.some((t) => t.x > x.x && quantityReadings(t.text).some((v) => quantityReadings(x.text).includes(v))));
      const t = q && ts.find((x) => x.x > q.x && quantityReadings(x.text).some((v) => quantityReadings(q.text).includes(v)));
      return { qR: q ? q.x + q.w : null, tR: t ? t.x + t.w : null };
    });
    const qR = median(learned.map((r) => r.qR).filter(Boolean)) ?? W * 0.77;
    const tR = median(learned.map((r) => r.tR).filter(Boolean)) ?? W * 0.9;
    const near = (n, col) => Math.abs(n.x + n.w - col) < W * 0.05;
    /**
     * Then every figure is assigned by COLUMN as well as by height. A row's
     * Quantity can print a line above or below its ISIN, and the next row's
     * Quantity sits just above the next ISIN — inside this row's span, but in
     * the Quantity column, never under Total Balance.
     */
    const qWinOf = (a) => ({ left: qR - W * 0.12, top: a.y - lh * 1.6, right: qR + W * 0.045, bottom: a.y + lh * 2.4 });
    const tWinOf = (a, bottom) => ({ left: tR - W * 0.085, top: a.y + lh * 0.5, right: tR + W * 0.045, bottom: Math.max(a.y + lh * 2.5, bottom + lh * 0.5) });
    const pageRows = span.map(({ a, top, bottom }) => {
      const qw = qWinOf(a), tw = tWinOf(a, bottom);
      return {
        a, top, bottom,
        qRead: nums.filter((n) => near(n, qR) && n.y >= qw.top && n.y <= qw.bottom).map((x) => x.text),
        tRead: nums.filter((n) => near(n, tR) && n.y >= tw.top && n.y <= tw.bottom).map((x) => x.text),
      };
    });

    for (const r of pageRows) {
      const { a } = r;
      const agree = () => {
        const votes = new Map();
        const qv = r.qRead.map(quantityReadings), tv = r.tRead.map(quantityReadings);
        for (const v of new Set(qv.flat())) {
          if (!tv.some((x) => x.includes(v))) continue;
          votes.set(v, qv.filter((x) => x.includes(v)).length + tv.filter((x) => x.includes(v)).length);
        }
        const ranked = [...votes.entries()].sort((x, y) => y[1] - x[1]);
        return ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
      };
      let quantity = agree();
      if (quantity === null) {
        const qWin = qWinOf(a), tWin = tWinOf(a, r.bottom);
        const opts = { whitelist: "0123456789,.", psms: ["7", "6", "13"] };
        r.qRead.push(...await session.readCell(p, qWin, opts), ...await session.readCellClean(p, qWin, lh, { whitelist: opts.whitelist }));
        r.tRead.push(...await session.readCell(p, tWin, opts), ...await session.readCellClean(p, tWin, lh, { whitelist: opts.whitelist }));
        quantity = agree();
        /**
         * STILL NOT ONE FIGURE: read tight around whatever ink the page's OCR
         * found in each column of the row — it may have misread the figure
         * ("10" as "="), but it found where it is, and a crop that holds the
         * figure alone reads it.
         */
        if (quantity === null) {
          const around = (col, win) => p.words
            .filter((w) => near(w, col) && w.y >= win.top && w.y <= win.bottom && w.h > lh * 0.4)
            .map((w) => ({ left: w.x - lh * 1.5, top: w.y - lh * 0.5, right: w.x + w.w + lh * 0.6, bottom: w.y + w.h + lh * 0.5 }));
          for (const rect of around(qR, qWin)) r.qRead.push(...await session.readCellClean(p, rect, lh, { whitelist: opts.whitelist }));
          for (const rect of around(tR, tWin)) r.tRead.push(...await session.readCellClean(p, rect, lh, { whitelist: opts.whitelist }));
          quantity = agree();
        }
      }
      const isinWin = { left: a.x - 30, top: a.y - lh * 0.5, right: a.x + a.w + 60, bottom: a.y + a.h + lh * 0.4 };
      const isinReadings = [a.text, ...await session.readCell(p, isinWin, { whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", psms: ["7", "8"] })];
      const isin = resolveIsin(isinReadings);
      const inRow = p.words.filter((w) => w.y >= r.top && w.y < r.bottom);
      /**
       * THE NAME: the description column's confident words, line by line, until
       * a gap. A dotted separator OCR'd as letters ("BI oi be WEY") is low
       * confidence; `Free Balance` drifting left on a skewed page is the next
       * column's vocabulary; neither is the name.
       */
      const nameLines = linesOf(inRow.filter((w) => w.x > a.x + a.w * 0.9 && w.x + w.w < descX - lh * 0.2
        && w.conf >= 60 && !(DESC_WORDS.test(w.text) && w.x > descX - lh * 5)), lh);
      const kept = [];
      for (const l of nameLines) {
        if (kept.length && l.y - kept.at(-1).y > lh * 1.8) break;
        const text = l.words.map((w) => w.text).filter((t) => !NOISE.test(t) && !/[—–_]{2,}/.test(t)).join(" ");
        if (text) kept.push({ y: l.y, text });
      }
      const name = kept.map((k) => k.text).join(" ").replace(/^['"`|]+/, "").replace(/\s+/g, " ").trim();
      const description = inRow.filter((w) => w.x >= descX - lh && w.x < W * 0.62 && Math.abs(w.y - a.y) < lh * 1.6)
        .sort((x, y) => x.x - y.x).map((w) => w.text).join(" ").replace(/[^A-Za-z ]/g, "").trim();
      rows.push({
        page: pg.printed, isin: isin.isin, isinWhy: isin.why ?? null, isinReadings, name, description, quantity,
        quantityReadings: { quantity: r.qRead, totalBalance: r.tRead },
      });
    }

    // A FIGURE IN NO ROW is a row this reader did not anchor.
    const firstTop = span[0]?.top ?? end;
    const inSomeRow = (y) => span.some((s) => y >= s.top && y < s.bottom + lh * 0.5);
    const orphans = nums.filter((n) => (near(n, qR) || near(n, tR)) && n.y > firstTop && n.y < end - lh)
      .filter((n) => quantityReadings(n.text).length && !inSomeRow(n.y));
    for (const o of orphans) problems.push(`page ${pg.printed ?? "?"}: the figure "${o.text}" in the quantity columns is in no row — a row was not anchored`);
  }
  for (const r of rows) {
    if (!r.isin) problems.push(`page ${r.page}: the ISIN read as ${r.isinReadings.map((x) => `"${x}"`).join(" / ")} — ${r.isinWhy}`);
    if (r.quantity === null) {
      problems.push(`page ${r.page}: ${r.name || r.isin || "a row"} — the Quantity (${r.quantityReadings.quantity.join(", ") || "unread"}) `
        + `and Total Balance (${r.quantityReadings.totalBalance.join(", ") || "unread"}) cells were not read as one figure`);
    }
  }
  return {
    layout: SCAN_LAYOUT, engine: SCAN_ENGINE, meanConfidence: session.meanConfidence,
    skew: session.pages.map((p) => Number(p.skew.toFixed(2))),
    pageOrder: pages.map((x) => x.p.number), printedPages: { of, seen },
    endOfReport, dp: dp ? { name: dp[1].replace(/\s+/g, " ").trim(), id: dp[2] } : null,
    clientId, clientReadings, holder, asOn: asOnM ? asOnM[1] : null,
    rows, problems,
  };
}

const warn = (warnings, code, detail) => warnings.push({ code, detail });

/** The holdings, from what `readScan` verified. Synchronous: everything it needs rides on the grid. */
export function extract({ grid, meta = {} }) {
  const scan = grid?.scan;
  const warnings = [];
  if (!scan || scan.layout !== SCAN_LAYOUT) {
    warn(warnings, "no-scan-reading", "this reader reads only a scan `lib/scan.mjs` has read in this run; from archived page text alone there is nothing it can check");
    return { holdings: [], status: "failed", warnings };
  }
  const source = meta.source ?? null;
  const asOf = scan.asOn ? toIso(scan.asOn) : null;
  if (scan.problems.length) {
    warn(warnings, "scan-not-verified",
      `this scanned statement was read by OCR (${scan.engine}) and NOT published, because the page could not check `
      + `everything read off it: ${scan.problems.join("; ")}. A figure recovered from a photograph is only published `
      + "where the page itself confirms it — a better scan, or the issuer's text PDF, reads in full.");
    return { accountNo: scan.clientId, owner: scan.holder, asOf, holdings: [], status: "failed", warnings };
  }
  const holdings = scan.rows.map((r) => makeHolding({
    security: r.name || r.isin,
    isin: r.isin,
    assetClass: assetClassOf(r.isin, r.name),
    quantity: r.quantity,
    marketPrice: null,
    marketValue: null,
    source,
  }));
  const pending = scan.rows.filter((r) => /pending/i.test(r.description));
  warn(warnings, "text-recovered-from-scan",
    `this statement is a SCAN — ${scan.printedPages.of} photographed page(s), no text layer — read by OCR `
    + `(${scan.engine}) after deskewing (${scan.skew.join("°, ")}°) and enlarging each page. Every one of its `
    + `${holdings.length} row(s) is published only because the page checks it: the quantity read the same under `
    + "Quantity and under Total Balance (two printings, two digit groupings), and the ISIN passed its own check digit. "
    + `All ${scan.printedPages.of} page(s) the footers count are present${scan.pageOrder.join(",") !== [...scan.pageOrder].sort().join(",") ? ` (scanned out of order: ${scan.pageOrder.join(", ")})` : ""}, `
    + "the statement ends with its `End of Report` line, and no figure lies outside a row. The Client Id was read the same "
    + "way by every reading of its cell.");
  warn(warnings, "no-rate-published",
    "NSDL's Statement of Holdings prints a quantity and a balance for each ISIN and NO RATE AND NO VALUE, so every row "
    + "carries its units and no market value — a depository balance, not a mark.");
  if (pending.length) {
    warn(warnings, "pending-demat",
      `${pending.length} row(s) are printed under \`Pending Demat\` rather than \`Free Balance\` — shares lodged for `
      + `dematerialisation and not yet credited free: ${pending.map((r) => `${r.name} (${r.quantity})`).join("; ")}. `
      + "They are the holder's shares and are carried at the quantity printed.");
  }
  const provider = DP_PROVIDER.find(([re]) => re.test(scan.dp?.name ?? ""))?.[1] ?? null;
  if (!provider) {
    warn(warnings, "scan-participant-unknown",
      `the statement is issued through ${scan.dp?.name ?? "a participant whose name was not read"} [${scan.dp?.id ?? "?"}], `
      + "which this book has no account at. Name it in DP_PROVIDER (providers/nsdlScan.mjs) and give it a precedence "
      + "block (scripts/ingest/precedence.mjs) — a provider with no block contributes nothing.");
    return { accountNo: scan.clientId, owner: scan.holder, asOf, holdings: [], status: "failed", warnings };
  }
  return {
    provider,
    accountNo: scan.clientId,
    owner: scan.holder,
    asOf,
    reportType: "holdings",
    engagement: "Direct",
    providerEngagement: `NSDL depository account at ${scan.dp?.id ?? "DP not read"} — scanned Statement of Holdings`,
    holdings,
    status: "ok",
    warnings,
  };
}
