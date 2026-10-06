/**
 * BANK STATEMENTS — HDFC Bank and ICICI Bank savings accounts.
 *
 * Every other reader in this pipeline reads a document about INVESTMENTS. This
 * one reads a bank's own record of a current account: a dated tape of debits and
 * credits with the running balance printed after each, and a closing balance.
 *
 * Three things follow, and each is a decision rather than a detail.
 *
 * 1. THE ROW KIND IS `bank-statement`, AND IT IS NOT `bank-book`.
 *    `bank-book` already means something here: the cash leg of a PMS mandate,
 *    which a manager prints beside the trades it settles and whose columns are
 *    Buy/Sell, Income, Expenses and Dep/With. A savings account prints
 *    Withdrawal, Deposit and Closing Balance, and the money in it is the
 *    family's own rather than a mandate's. One kind for both would put a
 *    household transfer into a mandate's cash reconciliation.
 *
 * 2. THE KIND IS DELIBERATELY NOT IN `CAPITAL_KINDS`.
 *    A rupee leaving a savings account is not a contribution to anything. Some
 *    of these rows ARE the family funding a mandate — and which ones is a
 *    judgement about their affairs that the narration alone does not settle, so
 *    nothing here is counted as capital. §4c's rule: carry it, name it, and let
 *    the family answer.
 *
 * 3. THE CLOSING BALANCE IS IN NO TOTAL ON THIS SITE.
 *    A bank balance is real money and it is NOT a holding: this book's
 *    `Cash` section is the cash sleeve a manager or a depository reports inside
 *    an investment account, and summing a household current account into it
 *    would change every allocation weight and every return denominator on the
 *    strength of a decision nobody made. So the document carries
 *    `excludedFromBook` with the reason, and the question goes to the family.
 *
 * WHAT MAKES IT PUBLISHABLE IS THE TIE-OUT, AND NOTHING ELSE.
 *
 * A dated tape a reader acts on is the one thing that must not be published on
 * trust, and a bank statement is the richest self-checking document in this
 * corpus: it prints its own opening balance, its own running balance after every
 * row, its own debit and credit totals, its own transaction counts and its own
 * closing balance. `tieOut` holds the rows to every one of those the statement
 * prints, IN PAISE INTEGERS — floating-point addition over several hundred rows
 * drifts, and a tolerance wide enough to absorb the drift is wide enough to
 * absorb a misread paisa. Any failure publishes NOTHING and says which check
 * failed on which row. That is `hdfcNsdl.mjs`'s own licence and `threePFlows`'s,
 * applied to a tape instead of a holding.
 *
 * A check whose printed figure the statement does not carry is recorded NOT
 * APPLICABLE, never as a pass: ICICI prints no debit or credit total, so those
 * two checks have nothing to compare against and say so. Where the opening
 * balance itself is not printed it is DERIVED from the first row and labelled
 * derived, because a running-balance check whose first point is an assumption is
 * a check over rows 2..N and must not claim to be one over 1..N.
 *
 * THE NARRATION IS A DESCRIPTION AND NOT A FIGURE, and it is gated differently.
 * HDFC hard-wraps it into fixed-width chunks that split mid-word, so rebuilding
 * it is a question about spacing rather than about money. A difference there is
 * at most a warning; the gate is on the amounts.
 */
import { findTable, readRows, toAuditSheet } from "../lib/table.mjs";
import { makeCashFlow, makeFlows } from "../lib/document.mjs";
import { parseNum, parseNumInfo } from "../lib/parseNum.mjs";
import { rowText } from "../lib/layout.mjs";

/** Both banks' savings statements go through this one reader. */
export const PROVIDER = ["HDFC Bank (savings account)", "ICICI Bank (savings account)"];
export const HDFC = "HDFC Bank (savings account)";
export const ICICI = "ICICI Bank (savings account)";

/** The report type the classifier assigns and `BY_REPORT_TYPE` dispatches on. */
export const REPORT_TYPE = "bank-statement";
/**
 * The `cashFlow.kind` every row carries. NOT in `CAPITAL_KINDS` — see the head
 * of this file — and deliberately the same string as the report type, because a
 * bank statement carries one kind of row and nothing else.
 */
export const CASH_FLOW_KIND = "bank-statement";

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const LAYOUT = { minColumnGap: 3 };

// ── Money in paise ───────────────────────────────────────────────────────────

/**
 * A printed figure as an INTEGER NUMBER OF PAISE, or null.
 *
 * Every check in `tieOut` runs on these. Summing 361 rupee floats and comparing
 * against a printed total needs a tolerance; summing the same rows as integers
 * needs none, and a tie-out with no tolerance is the only kind that can tell a
 * misread paisa from an accumulated rounding error.
 *
 * `Math.round` IS LOAD-BEARING, and that was measured rather than assumed —
 * the first version of this comment claimed the opposite. Over 400,000 random
 * two-decimal figures up to ₹400 Cr, **38,506 of them — about one in ten — are
 * not integers after `× 100`**: `20,125,887.08` comes back 2012588707.9999998
 * and `2,651,054,336.99` comes back 265105433698.99997. Without the round the
 * running balance stops being integer arithmetic on the first such row, every
 * `===` against a printed total becomes a lottery, and the tape fails its gate
 * for a reason that has nothing to do with the statement. (The 19 figures this
 * delivery actually prints all happen to be exact, so a suite built only on
 * them would not have shown this. The suite's section 1 carries one of the
 * drifting figures for exactly that reason.)
 *
 * A FIGURE PRINTED WITH MORE THAN TWO DECIMALS IS REFUSED, NOT ROUNDED, and the
 * test is on the TEXT rather than on the float, because what was printed is the
 * thing in question: a money column carrying three decimals is a column a
 * narration or a unit count has leaked into. Rounded, `0.001` came back a
 * MEASURED ZERO and `1,234.567` came back ₹1,234.57 — a figure no bank printed.
 * The gate would still have caught the consequence, since the running balance
 * then breaks, but it would have named the balance rather than the column, and
 * a wrong diagnosis sends the next reader to the wrong line.
 */
export function paise(text) {
  const info = parseNumInfo(text);
  if (info.status !== "ok") return null;
  const s = String(text ?? "");
  const dot = s.lastIndexOf(".");
  if (dot >= 0) {
    const frac = /^(\d+)/.exec(s.slice(dot + 1));
    if (frac && frac[1].length > 2) return null;
  }
  return Math.round(info.value * 100);
}
/** Paise back to rupees, for the archived primitive. */
const rupees = (p) => (p === null ? null : Math.round(p) / 100);
const inr = (p) => (p === null ? "—" : (p / 100).toFixed(2));

// ── The two layouts ──────────────────────────────────────────────────────────

/**
 * HDFC's columns, by the labels it prints.
 *
 * The Narration LABEL sits at x≈144 while its DATA starts at x≈68, which is why
 * this goes through `findTable`: that measures columns from the BODY, so the
 * narration column is the span the narration actually occupies. Boundaries drawn
 * midway between the LABELS would put the first forty characters of every
 * narration in the Date column.
 */
export const HDFC_COLUMNS = {
  date: [/^date$/, /^txn\s*date$/, /^transaction\s*date$/],
  narration: [/^narration$/, /^particulars$/, /^description$/],
  reference: [/^chq\s*ref\s*no/, /^ref\s*no/, /^cheque/, /^chq\s*no/],
  valueDate: [/^value\s*dt/, /^value\s*date/],
  withdrawal: [/^withdrawal/, /^withdrawl/, /^debit/, /^dr\b/],
  deposit: [/^deposit/, /^credit/, /^cr\b/],
  balance: [/^closing\s*bal/, /^balance/, /^running\s*bal/],
};

/**
 * ICICI's columns. It prints a serial number and no value date.
 *
 * The serial is what makes this layout checkable in a way HDFC's is not: it runs
 * 1..N with no gap, so a row the reader dropped is a hole in a sequence rather
 * than a silent absence. `tieOut` checks it.
 */
export const ICICI_COLUMNS = {
  serial: [/^s\s*no/, /^sr\s*no/, /^serial/, /^no$/],
  date: [/^tran(?:saction)?\s*date/, /^txn\s*date/, /^date$/],
  reference: [/^cheque/, /^chq/, /^ref(?:erence)?\s*(?:no|number)?$/],
  narration: [/^(?:transaction\s*)?remarks/, /^narration/, /^particulars/, /^description/],
  withdrawal: [/^withdrawal/, /^debit/, /^dr\b/],
  deposit: [/^deposit/, /^credit/, /^cr\b/],
  balance: [/^balance/, /^closing\s*bal/, /^available\s*bal/],
};

/**
 * WHICH BANK'S LAYOUT A PAGE IS, FROM THE PAGE'S OWN HEADER LABELS.
 *
 * Not from `meta.provider`, which is the classifier's reading of the letterhead:
 * the two are independent evidence and where they DISAGREE the document is
 * refused rather than read on one of them. A letterhead rule that starts
 * claiming the wrong bank's statements is exactly the failure this book has paid
 * for four times (§"a document is not what it MENTIONS"), and a reader that
 * trusts it has no way to notice.
 */
export function layoutOf(pages) {
  const text = pages.map((p) => p.rows.map((r) => rowText(r).join(" ")).join("\n")).join("\n");
  const hdfc = /\bNarration\b/i.test(text) && /\bValue\s*Dt/i.test(text);
  const icici = /\bTransaction\s+Remarks\b/i.test(text) || (/\bS\s*No\b/i.test(text) && /\bTran(?:saction)?\s*Date\b/i.test(text));
  if (hdfc && !icici) return HDFC;
  if (icici && !hdfc) return ICICI;
  return null;
}

// ── Narration, rebuilt from its own chunks ───────────────────────────────────

/**
 * JOIN A NARRATION'S WRAPPED CHUNKS BACK INTO ONE STRING.
 *
 * HDFC wraps the narration into fixed-width chunks and splits mid-word, so the
 * chunks join with NOTHING: `NEFT DR-UTIB0000...` arrives as
 * `NEFT DR-UTIB000` + `0123-AJAY JAIS`. A chunk whose own first character was a
 * space is a word boundary the grid has already trimmed away, and it shows up as
 * a chunk starting a couple of points to the RIGHT of the column's own left
 * edge. So the left edge decides: flush with it, join with nothing; indented
 * from it, join with a space.
 *
 * Measured on the three HDFC statements in this delivery: the narration column's
 * chunks start at x≈68.0, and a chunk carrying a leading space starts at x≈70.0.
 * The threshold is HALF A CHARACTER rather than that exact pair, so it is a
 * statement about the geometry rather than about three files.
 *
 * ICICI wraps on PIXEL WIDTH instead, which breaks at word boundaries and leaves
 * a trailing hyphen where it breaks mid-token. Its chunks therefore join with a
 * space, except after a trailing `-`.
 */
export function joinNarration(chunks, { wrap = "fixed-width", left = null } = {}) {
  const parts = chunks.map((c) => ({ x: c.x ?? 0, text: String(c.text ?? "") })).filter((c) => c.text.trim());
  if (!parts.length) return "";
  const edge = left ?? Math.min(...parts.map((p) => p.x));
  let out = "";
  for (const [i, p] of parts.entries()) {
    const text = p.text.replace(/\s+/g, " ").trim();
    if (i === 0) { out = text; continue; }
    if (wrap === "pixel") out += /-$/.test(out) ? text : ` ${text}`;
    else out += p.x - edge > INDENT ? ` ${text}` : text;
  }
  return out.trim();
}
/** Half a character at the size these statements print narration at. */
const INDENT = 1.2;

// ── The gate ─────────────────────────────────────────────────────────────────

/**
 * HOLD THE ROWS TO EVERY FIGURE THE STATEMENT PRINTED ABOUT THEM.
 *
 * All in paise integers, and all or nothing: a caller that gets `ok: false`
 * publishes no tape and says which check failed. Three outcomes per check —
 * passed, failed, or NOT APPLICABLE because the statement prints no figure to
 * compare against. The third is never counted as a pass: a run reporting "6 of 6
 * checks passed" over a statement that printed two of them has told the reader
 * nothing, which is `golden.mjs`'s rule arriving in a bank tape.
 *
 * @param {Array} rows   {serial, date, debit, credit, balance} in paise
 * @param {object} printed {opening, debits, credits, closing, drCount, crCount} in paise/counts
 */
export function tieOut(rows, printed, opts = {}) {
  const failures = [];
  const notApplicable = [];
  const passed = [];
  const { openingDerived = false, serials = false } = opts;
  const note = (name, ok, detail) => (ok ? passed.push(name) : failures.push(`${name}: ${detail}`));

  if (!rows.length) return { ok: false, failures: ["rows: the table located no dated row"], notApplicable, passed };

  // 1. EXACTLY ONE SIDE PER ROW. A row with neither is not a movement and a row
  //    with two is a misread column, and both would leave the running balance to
  //    absorb the difference silently.
  const sided = [];
  for (const [i, r] of rows.entries()) {
    const dr = r.debit, cr = r.credit;
    const nonZero = [["debit", dr], ["credit", cr]].filter(([, v]) => v !== null && v !== 0);
    if (nonZero.length === 1) { sided.push(nonZero[0][0]); continue; }
    if (nonZero.length === 0 && (dr !== null || cr !== null)) {
      // A printed 0.00 on both sides is a row that moved nothing. The running
      // balance below is what proves it, so it is carried and counted as
      // neither a debit nor a credit.
      sided.push("none");
      continue;
    }
    failures.push(`one amount side per row: row ${i + 1} (${r.date ?? "no date"}) carries `
      + `${nonZero.length === 0 ? "neither a withdrawal nor a deposit" : `both (${inr(dr)} / ${inr(cr)})`}`);
    sided.push(null);
  }
  if (!failures.length) passed.push("one amount side per row");

  // 2. THE RUNNING BALANCE, from the opening the statement printed.
  if (printed.opening === null) {
    notApplicable.push("running balance: the statement prints no opening balance and none could be derived");
  } else {
    let bal = printed.opening;
    let broke = null;
    for (const [i, r] of rows.entries()) {
      bal = bal - (r.debit ?? 0) + (r.credit ?? 0);
      if (r.balance === null) { broke ??= `row ${i + 1} (${r.date}) prints no balance`; continue; }
      if (r.balance !== bal) {
        broke ??= `row ${i + 1} (${r.date}) derives ${inr(bal)} against a printed ${inr(r.balance)}`;
        break;
      }
    }
    note(openingDerived ? "running balance (opening derived)" : "running balance", !broke, broke ?? "");
  }

  // 3. The debit and credit totals, where the statement prints them.
  const sumOf = (key) => rows.reduce((a, r) => a + (r[key] ?? 0), 0);
  for (const [key, label] of [["debit", "debits"], ["credit", "credits"]]) {
    if (printed[label] === null) { notApplicable.push(`${label} total: the statement prints none`); continue; }
    const got = sumOf(key);
    note(`${label} total`, got === printed[label], `Σ ${inr(got)} against a printed ${inr(printed[label])}`);
  }

  // 4. The transaction counts, where the statement prints them. Counted over the
  //    rows that MOVED money, which is what a bank's Dr/Cr count counts.
  for (const [side, label] of [["debit", "drCount"], ["credit", "crCount"]]) {
    if (printed[label] === null || printed[label] === undefined) {
      notApplicable.push(`${label}: the statement prints no count`);
      continue;
    }
    const got = sided.filter((s) => s === side).length;
    note(label, got === printed[label], `${got} rows against a printed ${printed[label]}`);
  }

  // 5. The closing balance — the last row's own printed balance.
  const last = [...rows].reverse().find((r) => r.balance !== null) ?? null;
  if (printed.closing === null) notApplicable.push("closing balance: the statement prints none");
  else if (!last) failures.push("closing balance: no row prints a balance");
  else note("closing balance", last.balance === printed.closing,
    `last row ${inr(last.balance)} against a printed ${inr(printed.closing)}`);

  // 6. ICICI's serial, 1..N with no gap — a dropped row is a hole in a sequence.
  if (serials) {
    const got = rows.map((r) => r.serial);
    const bad = got.findIndex((s, i) => s !== i + 1);
    note("serial numbers run 1..N", bad < 0,
      bad < 0 ? "" : `row ${bad + 1} is numbered ${got[bad] ?? "nothing"}`);
  }

  return { ok: failures.length === 0, failures, notApplicable, passed };
}

// ── HDFC ─────────────────────────────────────────────────────────────────────

const HDFC_DATE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
const ICICI_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ANY_DATE = /^(\d{2})[./-](\d{2})[./-](\d{2}(?:\d{2})?)$/;

/** `dd/mm/yy`, `dd.mm.yyyy` or `dd-mm-yyyy` → ISO. A two-digit year is 20xx. */
export function toIso(text) {
  const m = ANY_DATE.exec(clean(text));
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 4 ? Number(y) : 2000 + Number(y);
  const day = Number(d), month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The labelled figures HDFC prints in its own summary block.
 *
 * The labels sit on one row and their values on the next, so a value is matched
 * to a label by NEAREST CENTRE rather than by order — a label with no value
 * beneath it would otherwise shift every figure after it onto the wrong label,
 * which is the positional-read failure this module exists to avoid.
 */
const HDFC_SUMMARY = {
  opening: /^opening\s*bal/i,
  drCount: /^dr\s*count/i,
  crCount: /^cr\s*count/i,
  debits: /^debits?$/i,
  credits: /^credits?$/i,
  closing: /^closing\s*bal/i,
};

/**
 * WHERE THE TAPE ENDS — the row carrying the summary block's own labels.
 *
 * The summary sits BELOW the tape on the last page, so without this it is part
 * of the table's body, and `findTable` measures a table's columns from its body.
 * Its labels are nowhere near the tape's columns and `Opening Balance` is wide:
 * measured on this module's own fixture it spans x 40→126, straight across the
 * corridor between the Date column (ending about x 62) and the Narration data
 * (starting at x 68). The two columns then merge, `splitAtHeaderLabels` cuts the
 * merged column at the Narration LABEL's x instead (x≈144) — and the first
 * seventy-five points of every narration land in the Date column, which is the
 * failure `HDFC_COLUMNS`'s own note names. Every row then reads as dateless, the
 * tape comes back EMPTY and the gate refuses the document.
 *
 * So the table is bounded before the summary rather than left to be rescued.
 * The marker is two of the labels above on ONE row, which is the summary block
 * and cannot be a movement: no tape row carries both an opening and a closing
 * balance. `readSummaryByCentre` still reads the block, because it walks the
 * pages rather than the table.
 *
 * CUTTING THE PAGE BEFORE `findTable` INSTEAD WAS TRIED AND IS NOT KEPT.
 * `findTable` scans for its stop only from after the header span it chose, so a
 * summary landing within three rows of a reprinted header is absorbed into the
 * header rather than stopping the table — and the summary labels do score for
 * `balance`, on the `balance` inside `Opening Balance`. Slicing the page cannot
 * be reached around that way. But measured on every page shape these statements
 * print — a summary alone on a final page, a summary after one movement, a
 * summary after a wrap — the two forms produce the IDENTICAL document, so the
 * slice would be a second mechanism doing nothing, which is worse than none.
 */
const HDFC_TAPE_END = /opening\s*bal[\s\S]*closing\s*bal/i;

function readSummaryByCentre(pages, labels) {
  const out = {};
  for (const page of pages) {
    for (let i = 0; i < page.rows.length - 1; i++) {
      const items = (page.rows[i].items ?? []).map((it) => ({ ...it, text: clean(it.text) })).filter((it) => it.text);
      const found = Object.entries(labels)
        .map(([key, re]) => [key, items.find((it) => re.test(it.text))])
        .filter(([, it]) => it);
      // One stray label is a coincidence; three on one row is the summary block.
      if (found.length < 3) continue;
      const values = (page.rows[i + 1].items ?? [])
        .map((it) => ({ centre: (it.x ?? 0) + (it.width ?? 0) / 2, text: clean(it.text) }))
        .filter((v) => parseNumInfo(v.text).status === "ok");
      if (!values.length) continue;
      for (const [key, label] of found) {
        if (key in out) continue;
        const centre = (label.x ?? 0) + (label.width ?? 0) / 2;
        let best = null, dist = Infinity;
        for (const v of values) {
          const d = Math.abs(v.centre - centre);
          if (d < dist) { dist = d; best = v; }
        }
        if (best) out[key] = best.text;
      }
    }
  }
  return out;
}

/** The first figure to the right of a label, anywhere on the pages. */
function labelledText(pages, re) {
  for (const page of pages) {
    for (const row of page.rows) {
      const items = (row.items ?? []).map((it) => ({ ...it, text: clean(it.text) })).filter((it) => it.text);
      const idx = items.findIndex((it) => re.test(it.text));
      if (idx < 0) continue;
      // The label's own item first — these statements print `Account No :
      // 50100xxxxxxxx0394` as one span as often as two.
      const inline = items[idx].text.replace(re, "").replace(/^[\s:#-]+/, "").trim();
      if (inline) return inline;
      const right = items.slice(idx + 1).map((it) => it.text).join(" ").trim();
      if (right) return right;
    }
  }
  return null;
}

/**
 * The window a statement covers, from its own `Statement From … To …` line.
 *
 * Read as two dates in order on one row rather than by position, so the row's
 * own wording can change without silently binding the wrong one.
 */
function readPeriod(pages) {
  for (const page of pages) {
    for (const row of page.rows) {
      const joined = rowText(row).join(" ");
      if (!/statement\s*(?:from|of\s*account|period)/i.test(joined) && !/\bfrom\b[\s\S]{0,40}\bto\b/i.test(joined)) continue;
      const dates = (joined.match(/\d{2}[./-]\d{2}[./-]\d{2,4}/g) ?? []).map(toIso).filter(Boolean);
      if (dates.length >= 2) return { from: dates[0], to: dates[dates.length - 1] };
    }
  }
  return { from: null, to: null };
}

function readHdfc(pages, warnings) {
  const rows = [];
  let missing = null;

  for (const page of pages) {
    // A PAGE WHOSE COLUMNS CANNOT BE MEASURED IS SKIPPED, AND WHAT THAT COSTS IS
    // ONE NARRATION. `findTable` measures a table's columns from the data rows
    // of its own body, so a page whose whole body is a single wrap fragment —
    // the page break falling between a movement's dated line and its
    // continuation, with the summary below — has nothing to measure, and which
    // column that fragment sits in is then a guess. The fragment is dropped: the
    // row above keeps the narration it already had, every AMOUNT is untouched,
    // and the gate is on the amounts. Reading it on the previous page's
    // measurement is defensible and is not done, because no page of the three
    // statements in this delivery has that shape and the claim would be
    // unverifiable here.
    const table = findTable(page, HDFC_COLUMNS, { minFields: 5, stopRe: HDFC_TAPE_END, ...LAYOUT });
    if (!table) continue;
    // A page that does not separate the two money columns cannot be read: a
    // withdrawal read as a deposit moves the running balance by twice itself.
    if (!["date", "narration", "withdrawal", "deposit", "balance"].every((f) => f in table.columns)) continue;
    missing ??= table.missing;

    const narrationCol = table.columns.narration;
    const left = Math.min(...table.grid.columns.filter((c) => c.index === narrationCol).map((c) => c.x0));
    const start = table.bodyFrom ?? table.headerRows ?? 1;
    for (let i = start; i < table.grid.rows.length; i++) {
      const row = table.grid.rows[i];
      const cellOf = (field) => {
        const col = table.columns[field];
        return col === undefined ? null : (row.cells.find((c) => c.column === col)?.text ?? null);
      };
      const date = toIso(cellOf("date"));
      const chunks = (row.items ?? []).filter((it) => {
        const x0 = it.x ?? 0, x1 = x0 + (it.width ?? 0);
        const col = table.grid.columns[narrationCol];
        return col && x1 > col.x0 && x0 < col.x1;
      });
      const narration = joinNarration(chunks, { wrap: "fixed-width", left });

      if (!date) {
        // A CONTINUATION LINE: no date, narration only, and it can cross a page
        // break. It is the rest of the row above it, never a row of its own.
        const prev = rows[rows.length - 1];
        if (prev && narration && !row.cells.some((c) => parseNumInfo(c.text).status === "ok")) {
          prev.narration += narration;
          prev.chunkLines += 1;
        }
        continue;
      }
      rows.push({
        serial: null,
        date,
        valueDate: toIso(cellOf("valueDate")),
        narration,
        reference: clean(cellOf("reference")) || null,
        debit: paise(cellOf("withdrawal")),
        credit: paise(cellOf("deposit")),
        balance: paise(cellOf("balance")),
        chunkLines: 1,
        cells: rowText(row),
      });
    }
  }

  if (missing?.length) warn(warnings, "columns-not-matched", missing.join(", "));
  const s = readSummaryByCentre(pages, HDFC_SUMMARY);
  const count = (v) => {
    const n = parseNum(v);
    return n === null || !Number.isInteger(n) || n < 0 ? null : n;
  };
  return {
    rows,
    printed: {
      opening: paise(s.opening ?? null),
      debits: paise(s.debits ?? null),
      credits: paise(s.credits ?? null),
      closing: paise(s.closing ?? null),
      drCount: count(s.drCount ?? null),
      crCount: count(s.crCount ?? null),
    },
    openingDerived: false,
    serials: false,
    accountNo: readAccountNo(pages),
    period: readPeriod(pages),
  };
}

// ── ICICI ────────────────────────────────────────────────────────────────────

function readIcici(pages, warnings) {
  const rows = [];
  let missing = null;

  for (const page of pages) {
    const table = findTable(page, ICICI_COLUMNS, { minFields: 5, ...LAYOUT });
    if (!table) continue;
    if (!["date", "narration", "withdrawal", "deposit", "balance"].every((f) => f in table.columns)) continue;
    missing ??= table.missing;

    const narrationCol = table.columns.narration;
    const start = table.bodyFrom ?? table.headerRows ?? 1;
    for (let i = start; i < table.grid.rows.length; i++) {
      const row = table.grid.rows[i];
      const cellOf = (field) => {
        const col = table.columns[field];
        return col === undefined ? null : (row.cells.find((c) => c.column === col)?.text ?? null);
      };
      const date = toIso(cellOf("date"));
      const chunks = (row.items ?? []).filter((it) => {
        const x0 = it.x ?? 0, x1 = x0 + (it.width ?? 0);
        const col = table.grid.columns[narrationCol];
        return col && x1 > col.x0 && x0 < col.x1;
      });
      const narration = joinNarration(chunks, { wrap: "pixel" });

      if (!date) {
        const prev = rows[rows.length - 1];
        if (prev && narration && !row.cells.some((c) => parseNumInfo(c.text).status === "ok")) {
          prev.narration += /-$/.test(prev.narration) ? narration : ` ${narration}`;
          prev.chunkLines += 1;
        }
        continue;
      }
      const serial = parseNum(cellOf("serial"));
      rows.push({
        serial: Number.isInteger(serial) ? serial : null,
        date,
        // ICICI's PDF prints no value date. Null is "the statement printed none",
        // which is what the archive should record rather than repeating the
        // transaction date into a column the bank left empty.
        valueDate: null,
        narration,
        reference: clean(cellOf("reference")) || null,
        debit: paise(cellOf("withdrawal")),
        credit: paise(cellOf("deposit")),
        balance: paise(cellOf("balance")),
        chunkLines: 1,
        cells: rowText(row),
      });
    }
  }

  if (missing?.length) warn(warnings, "columns-not-matched", missing.join(", "));

  /**
   * ICICI PRINTS NO OPENING BALANCE AND NO TOTALS, SO THE OPENING IS DERIVED.
   *
   * The first row's own printed balance less what that row moved IS the opening,
   * and the running-balance check then binds on rows 2..N rather than 1..N. It
   * is labelled derived everywhere it appears for exactly that reason: a figure
   * the statement did not print must never read as one it did.
   */
  const first = rows[0] ?? null;
  const opening = first && first.balance !== null
    ? first.balance + (first.debit ?? 0) - (first.credit ?? 0)
    : null;
  if (opening !== null) warn(warnings, "opening-balance-derived",
    `${inr(opening)} — the first row's own printed balance less what that row moved; the statement prints no opening balance`);

  const last = [...rows].reverse().find((r) => r.balance !== null) ?? null;
  return {
    rows,
    printed: {
      opening,
      debits: null,
      credits: null,
      // The last row's own printed balance IS the closing balance on a statement
      // that prints no summary. It is the same figure read twice, so `tieOut`
      // records the closing check as passing on its own terms and the running
      // balance is what actually proves the tape.
      closing: last ? last.balance : null,
      drCount: null,
      crCount: null,
    },
    openingDerived: true,
    serials: rows.length > 0 && rows.every((r) => r.serial !== null),
    accountNo: readAccountNo(pages),
    period: readPeriod(pages),
  };
}

// ── Identity ─────────────────────────────────────────────────────────────────

const ACCOUNT_LABEL = /^(?:account|a\s*\/?\s*c)\s*(?:no|number)\b[\s.:#-]*/i;

/**
 * The account number the page prints.
 *
 * Read by label and never from the file name — four documents in this corpus are
 * named for the wrong holder (§"THE FILE NAME IS WRONG THREE TIMES OUT OF
 * TWELVE"). A masked number is kept exactly as printed: this book files a
 * document on what it prints, and a mask is what the bank chose to print.
 */
function readAccountNo(pages) {
  const raw = labelledText(pages, ACCOUNT_LABEL);
  if (!raw) return null;
  const m = /([0-9Xx*]{6,24})/.exec(raw.replace(/\s+/g, ""));
  return m ? m[1] : null;
}

/**
 * The holder, from a labelled field only.
 *
 * HDFC prints the name in an unlabelled address block, so there is routinely no
 * labelled field to read and this returns null — which `extract.mjs` then fills
 * from the classifier's own reading of the same text. Guessing which line of an
 * address block is a person would be the fourth round of the filename lesson.
 */
function readHolder(pages) {
  const raw = labelledText(pages, /^(?:account\s*holder|a\s*\/?\s*c\s*holder|joint\s*holders?|customer\s*name|name)\b[\s.:#-]*/i);
  if (!raw) return null;
  const name = raw.replace(/\s{2,}.*$/, "").trim();
  return /[A-Za-z]{3}/.test(name) ? name : null;
}

/**
 * A warning, in the shape the pipeline reads.
 *
 * `{ code, detail }` and never a string: `reconcile.mjs` renders every warning
 * as `${w.code}: ${w.detail}` into the extraction report's coverage section, and
 * `extract.mjs` matches `w.code` to count the documents that reported a password
 * problem. A string reads `undefined: undefined` there — on exactly the
 * documents whose reason a reader has gone to the report to find.
 */
const warn = (warnings, code, detail = "") => { warnings.push({ code, detail }); };

// ── The document ─────────────────────────────────────────────────────────────

/**
 * WHY THE CLOSING BALANCE IS IN NO TOTAL ON THIS SITE.
 *
 * One sentence per clause, because each is a separate decision and a reader of
 * `docs/BOOK-REPORT.md` has to be able to act on them one at a time.
 */
const EXCLUDED_REASON =
  "a savings-account statement: it records the family's own banking rather than an investment, and its "
  + "closing balance is in no total on this dashboard. This book's Cash is the cash sleeve a manager or a "
  + "depository reports INSIDE an investment account; a household current account is a different kind of "
  + "money, and summing one into Cash would move every allocation weight and every return denominator on a "
  + "decision nobody has made. Some of these rows are the family funding a mandate and which ones the "
  + "narration alone does not settle, so none of them is counted as capital either. The tape, its running "
  + "balance and its closing balance are in the archive, and whether to count the balance is the family's "
  + "to answer.";

export function extract({ grid, meta = {} }) {
  const warnings = [];
  const pages = grid?.pages ?? [];
  if (!pages.length) {
    return { provider: meta.provider ?? null, reportType: REPORT_TYPE, holdings: [], totals: null,
      warnings: [{ code: "no-pages", detail: "" }], status: "failed" };
  }

  const layout = layoutOf(pages);
  if (!layout) {
    return refusal(meta, ["the page's own header labels name neither bank's layout"], warnings);
  }
  // TWO INDEPENDENT READINGS OF WHICH BANK THIS IS, AND THEY MUST AGREE.
  if (meta.provider && PROVIDER.includes(meta.provider) && meta.provider !== layout) {
    return refusal(meta, [
      `the letterhead was classified ${meta.provider} and the table's own header labels are ${layout}'s`,
    ], warnings);
  }

  const read = layout === HDFC ? readHdfc(pages, warnings) : readIcici(pages, warnings);
  const gate = tieOut(read.rows, read.printed, { openingDerived: read.openingDerived, serials: read.serials });

  const accountNo = read.accountNo ?? meta.accountNo ?? null;
  if (!read.accountNo) warn(warnings, "account-number-from-classifier",
    "the reader found no labelled account number on the page and took the classifier's reading of the same text");
  const owner = readHolder(pages);
  if (!owner) warn(warnings, "holder-not-labelled",
    "the statement prints its holder in an unlabelled address block, so the reader read none");

  const asOf = read.period.to ?? meta.asOfDate ?? null;
  const summarySheet = {
    name: "summary",
    rows: [
      ["Figure", "Value", "Source"],
      ["Opening balance", inr(read.printed.opening), read.openingDerived ? "derived from the first row" : "printed"],
      ["Debits", inr(read.printed.debits), read.printed.debits === null ? "not printed" : "printed"],
      ["Credits", inr(read.printed.credits), read.printed.credits === null ? "not printed" : "printed"],
      ["Closing balance", inr(read.printed.closing), read.printed.closing === null ? "not printed" : "printed"],
      ["Dr count", read.printed.drCount ?? "—", read.printed.drCount === null ? "not printed" : "printed"],
      ["Cr count", read.printed.crCount ?? "—", read.printed.crCount === null ? "not printed" : "printed"],
      ["Rows read", read.rows.length, "read"],
      ["Checks passed", gate.passed.join(" · ") || "—", "tie-out"],
      ["Checks not applicable", gate.notApplicable.join(" · ") || "—", "tie-out"],
    ],
  };

  if (!gate.ok) {
    // NOTHING IS PUBLISHED. The tape is the whole of what this document carries,
    // so a tape that does not reconcile leaves the document with no facts and a
    // reason — never a partial tape, which would read as a complete one.
    return {
      provider: layout,
      accountNo,
      owner,
      asOf,
      reportType: REPORT_TYPE,
      holdings: [],
      totals: null,
      cashFlows: [],
      excludedFromBook: EXCLUDED_REASON,
      sections: { summary: summarySheet },
      warnings: [...warnings, ...gate.failures.map((f) => ({ code: "tie-out-failed", detail: f }))],
      status: "partial",
    };
  }

  const source = `${layout} ${REPORT_TYPE}`;
  const cashFlows = read.rows.map((r) => makeCashFlow({
    date: r.date,
    description: r.narration,
    kind: CASH_FLOW_KIND,
    // A debit is money out and a credit money in, so the signed amount is the
    // movement — and `debit`/`credit` carry the statement's own two columns
    // beside it, because a reader checking this against the PDF reads columns.
    amount: rupees((r.credit ?? 0) - (r.debit ?? 0)),
    debit: rupees(r.debit),
    credit: rupees(r.credit),
    balance: rupees(r.balance),
    valueDate: r.valueDate,
    reference: r.reference,
    source,
  }));

  const flows = makeFlows({
    // Printed primitives only. ICICI's derived opening is in the summary sheet
    // and labelled there; carrying it here would make a figure the bank never
    // printed indistinguishable from one it did.
    openingBalance: read.openingDerived ? null : rupees(read.printed.opening),
    closingBalance: rupees(read.printed.closing),
    debits: rupees(read.printed.debits),
    credits: rupees(read.printed.credits),
    periodFrom: read.period.from,
    periodTo: read.period.to,
    source,
  });

  const header = ["Date", "Value date", "Narration", "Reference", "Withdrawal", "Deposit", "Balance"];
  const tapeSheet = {
    name: REPORT_TYPE,
    rows: [header, ...read.rows.map((r) => [
      r.date, r.valueDate ?? "", r.narration, r.reference ?? "",
      r.debit === null ? "" : inr(r.debit),
      r.credit === null ? "" : inr(r.credit),
      inr(r.balance),
    ])],
  };

  return {
    provider: layout,
    accountNo,
    owner,
    asOf,
    reportType: REPORT_TYPE,
    holdings: [],
    totals: null,
    cashFlows,
    flows,
    excludedFromBook: EXCLUDED_REASON,
    sections: { [REPORT_TYPE]: tapeSheet, summary: summarySheet },
    warnings,
    status: "ok",
  };
}

/** A document this reader will not publish, and why. */
function refusal(meta, reasons, warnings) {
  return {
    provider: meta.provider ?? null,
    accountNo: meta.accountNo ?? null,
    owner: null,
    asOf: meta.asOfDate ?? null,
    reportType: REPORT_TYPE,
    holdings: [],
    totals: null,
    cashFlows: [],
    excludedFromBook: EXCLUDED_REASON,
    sections: {},
    warnings: [...warnings, ...reasons.map((r) => ({ code: "refused", detail: r }))],
    status: "partial",
  };
}
