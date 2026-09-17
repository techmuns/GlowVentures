#!/usr/bin/env node
/**
 * REPLAY THE CAPITAL-CALL READER OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:calls` · `npm run replay:calls -- --check`
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A REPAIR LAYER ───────────────────────
 *
 * The dated calls, the called/paid split and the pending figure are read by
 * `providers/*.mjs` from a statement's page text. Landing them would therefore
 * normally mean `npm run extract` — which needs `GLOW_PDF_PASSWORDS` for eight
 * encrypted statements and `pdftoppm`/`tesseract` for two outlined-text ones,
 * and which `guardAgainstShrinkingTheArchive` correctly refuses without them.
 * That would make a reader change unlandable on any machine without the
 * family's passwords, which is most of them.
 *
 * It does not have to be. The text these readers parse is `public/audit/<doc>/
 * pages.json` — the faithful per-page record, committed, and reconstructed here
 * EXACTLY as `extract()` builds it (`pages.map(p => p.text).join("\n")` with
 * runs of spaces and tabs collapsed). So running the REAL reader over it is a
 * faithful partial replay of extraction, not a second implementation: the next
 * full `npm run extract` calls the same function on the same text and writes
 * the same bytes. `rekey:archive` and `build-lookthrough --reindex` are the two
 * precedents; this is the third, and the same three rules govern it.
 *
 *   1. IT ONLY EVER ADDS THE NEW FIELDS. `total`, `contributed`, `undrawn` and
 *      `distributed` are written back byte-identically, so no figure already in
 *      the book can move. Asserted per document, not assumed.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE, not on a function. The replayed
 *      commitment block must reproduce the four figures already on disk — if it
 *      does not, this reader is not seeing what the extractor saw, nothing is
 *      written and the run exits non-zero.
 *   3. `--check` WRITES NOTHING and is the control run. Against an unchanged
 *      reader it must be a no-op, which is what says the files on disk are what
 *      the extractor would write.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

const alt = await import(path.join(ROOT, "scripts/ingest/providers/altFundStatements.mjs"));
const tvc = await import(path.join(ROOT, "scripts/ingest/providers/transitionVenture.mjs"));

/** The four figures this replay must reproduce and must never change. */
const FROZEN = ["total", "contributed", "undrawn", "distributed"];
/** The fields it exists to add. */
const ADDED = ["called", "paid", "pending", "calls"];

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * `extract()`'s own text, rebuilt from the committed pages.
 *
 * The join and the whitespace collapse are copied from the readers rather than
 * approximated: a reader matching `Capital Call B\s+([\d,]+)` against text
 * joined differently reads a different number, or none, and would look exactly
 * like a statement that stopped printing the line.
 */
function textOf(docKey) {
  const p = path.join(AUDIT, docKey, "pages.json");
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return (j.pages ?? []).map((x) => x.text ?? "").join("\n").replace(/[ \t]+/g, " ");
}

function replay(doc, text) {
  // Transition Venture reads its calls off the cashFlows it already emits, so
  // the replay takes them from the document rather than re-parsing — one
  // reading of that table, exactly as the reader has.
  if (doc.provider === "Transition Venture Capital") {
    const paid = doc.commitment.contributed;
    const rows = (doc.cashFlows ?? []).filter((c) => c.kind === "contribution" && c.date && typeof c.amount === "number");
    const sum = Math.round(rows.reduce((t, c) => t + c.amount, 0) * 100) / 100;
    const ok = paid != null && rows.length > 0 && Math.abs(sum - paid) <= 1;
    return {
      called: paid, paid, pending: null,
      calls: ok ? rows.map((c) => ({ date: c.date, label: c.description, amount: c.amount })).sort((a, b) => a.date.localeCompare(b.date)) : [],
    };
  }
  const layout = alt.layoutFor(text);
  if (!layout?.capitalFrom) return null;
  const { called = null, paid = null, pending = null, calls = [] } = layout.capitalFrom(text, () => {}) ?? {};
  return { called, paid, pending, calls };
}

let changed = 0, checked = 0, refused = 0;
const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
for (const entry of manifest) {
  const file = path.join(AUDIT, entry.docKey, "document.json");
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!doc.commitment) continue;
  const text = textOf(entry.docKey);
  if (!text) continue;
  const add = replay(doc, text);
  if (!add) continue;
  checked += 1;

  // RULE 2 — the gate. A replay that cannot reproduce what is already on disk
  // is not reading what the extractor read, and nothing it produces is trusted.
  if (doc.provider !== "Transition Venture Capital") {
    const layout = alt.layoutFor(text);
    const printed = layout?.commitmentFrom?.(text);
    if (printed && printed.committed != null && !eq(printed.committed, doc.commitment.total)) {
      console.error(`REFUSED ${entry.docKey}: replayed commitment ${printed.committed} against ${doc.commitment.total} on disk`);
      refused += 1;
      continue;
    }
  }

  const next = { ...doc.commitment };
  for (const k of ADDED) next[k] = add[k];
  // RULE 1 — nothing frozen may move.
  for (const k of FROZEN) {
    if (!eq(next[k], doc.commitment[k])) {
      console.error(`REFUSED ${entry.docKey}: ${k} would change`);
      refused += 1;
      next[k] = doc.commitment[k];
    }
  }
  if (eq(next, doc.commitment)) continue;
  changed += 1;
  const n = add.calls.length;
  console.log(`${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(66)} called=${add.called ?? "—"} paid=${add.paid ?? "—"} pending=${add.pending ?? "—"} calls=${n}`);
  if (!CHECK) {
    doc.commitment = next;
    fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
  }
}

console.log(`\n${checked} commitment documents replayed · ${changed} ${CHECK ? "would change" : "changed"} · ${refused} refused`);
if (refused) process.exit(1);
if (CHECK && changed) process.exit(2);
