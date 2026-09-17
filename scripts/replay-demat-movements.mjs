#!/usr/bin/env node
/**
 * REPLAY THE DEMAT MOVEMENT READER OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:movements` · `npm run replay:movements -- --check`
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The fourth of its kind, after `rekey:archive`, `build-lookthrough --reindex`
 * and `replay:calls`, and governed by the same three rules. `npm run extract`
 * needs `GLOW_PDF_PASSWORDS` for eight encrypted statements and
 * `pdftoppm`/`tesseract` for two outlined-text ones, and
 * `guardAgainstShrinkingTheArchive` correctly refuses a run without them — so
 * a reader change would otherwise be unlandable on most machines.
 *
 * The text `motilalDemat.mjs` parses is `public/audit/<doc>/pages.json`, the
 * committed per-page record, and this rebuilds it EXACTLY as `extract()` does.
 * Running the real reader over it is a faithful partial replay, not a second
 * implementation: the next full `npm run extract` calls the same function on
 * the same text and writes the same bytes.
 *
 *   1. IT ONLY EVER ADDS. Every holding's `opening` and `quantity` — the two
 *      balances already on disk — must come back byte-identical; `movements`
 *      and `movementsReason` are the new fields. A run that would move a
 *      balance refuses that document and exits non-zero.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. The replayed block must reproduce the
 *      balances already stored, holding for holding and in the same order. If
 *      it cannot, this reader is not seeing what the extractor saw.
 *   3. `--check` WRITES NOTHING and is the control run, which must be a no-op
 *      against an unchanged reader.
 *
 * The TRANSACTIONS are rewritten too, and that is deliberate rather than a
 * fourth rule broken: this reader exists because 348 of the 362 movement rows
 * these statements print reached nothing, so the tape is the thing being
 * ADDED. Every row it replaces is re-derived from the same page text, and the
 * count may only grow — a replay that would LOSE a movement refuses, which is
 * `guardAgainstShrinkingTheArchive`'s own rule at the document level.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

const demat = await import(path.join(ROOT, "scripts/ingest/providers/motilalDemat.mjs"));

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * `extract()`'s own grid, rebuilt from the committed pages.
 *
 * `readTransactions` splits each page's text on newlines and collapses runs of
 * spaces itself, so the pages are handed over as the reader expects them —
 * never pre-joined, which would let a block's last row run into the next
 * block's header.
 */
function textOf(docKey) {
  const p = path.join(AUDIT, docKey, "pages.json");
  if (!fs.existsSync(p)) return "";
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return (j.pages ?? []).map((x) => x.text ?? "").join("\n").replace(/[ \t]+/g, " ");
}

function pagesOf(docKey) {
  const p = path.join(AUDIT, docKey, "pages.json");
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return (j.pages ?? []).map((x) => ({ text: x.text ?? "" }));
}

let checked = 0, changed = 0, refused = 0, rowsBefore = 0, rowsAfter = 0, split = 0;
const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));

for (const entry of manifest) {
  if (entry.reportType !== "demat-transactions") continue;
  const file = path.join(AUDIT, entry.docKey, "document.json");
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const pages = pagesOf(entry.docKey);
  if (!pages) continue;
  checked += 1;

  const warnings = [];
  const out = demat.readTransactionsForReplay(pages, warnings);
  const wasPos = doc.positionsAsOf ?? [];
  const wasTxn = doc.transactions ?? [];

  // RULE 2 — the gate. Same holdings, same order, same two printed balances.
  const sameBalances = out.positionsAsOf.length === wasPos.length
    && out.positionsAsOf.every((p, i) =>
      eq(p.isin, wasPos[i]?.isin) && eq(p.opening, wasPos[i]?.opening) && eq(p.quantity, wasPos[i]?.quantity));
  if (!sameBalances) {
    console.error(`REFUSED ${entry.docKey}: replayed balances do not reproduce the ${wasPos.length} already on disk`);
    refused += 1;
    continue;
  }
  // The tape may only GROW — this reader exists to recover rows, never to lose
  // any, and a replay that shrank one would be indistinguishable in the diff
  // from a statement that stopped printing them.
  if (out.transactions.length < wasTxn.length) {
    console.error(`REFUSED ${entry.docKey}: ${out.transactions.length} movement(s) against ${wasTxn.length} on disk`);
    refused += 1;
    continue;
  }

  rowsBefore += wasTxn.length;
  rowsAfter += out.transactions.length;
  const withSplit = out.positionsAsOf.filter((p) => p.movements).length;
  split += withSplit;

  // The window the two balances bound — read through the reader's own
  // `dematPeriod`, never a second regex here. `periodFrom` is already on disk
  // and is FROZEN: a replay that would move it refuses like any other.
  const period = demat.dematPeriod(textOf(entry.docKey));
  if (doc.periodFrom != null && !eq(period.periodFrom, doc.periodFrom)) {
    console.error(`REFUSED ${entry.docKey}: periodFrom would change ${doc.periodFrom} → ${period.periodFrom}`);
    refused += 1;
    continue;
  }

  const next = { ...doc, periodFrom: period.periodFrom ?? doc.periodFrom ?? null,
    periodTo: period.periodTo ?? doc.periodTo ?? null,
    positionsAsOf: out.positionsAsOf, transactions: out.transactions };
  if (eq(next, doc)) continue;
  changed += 1;
  console.log(`${CHECK ? "would update" : "updated"} ${entry.docKey.slice(0, 62).padEnd(64)} movements ${String(wasTxn.length).padStart(3)} → ${String(out.transactions.length).padStart(3)}  split on ${withSplit}/${out.positionsAsOf.length} holdings`);
  if (!CHECK) fs.writeFileSync(file, JSON.stringify(next, null, 1) + "\n");
}

console.log(`\n${checked} demat statement(s) replayed · ${changed} ${CHECK ? "would change" : "changed"} · ${refused} refused`);
console.log(`movement rows ${rowsBefore} → ${rowsAfter} · ${split} holdings carry an opening-to-closing split`);
if (refused) process.exit(1);
if (CHECK && changed) process.exit(2);
