#!/usr/bin/env node
/**
 * ── RE-DERIVE `securityKey` ACROSS THE COMMITTED ARCHIVE ────────────────────
 *
 * `npm run extract` reads `source/` and writes `public/audit/`. Eight of those
 * statements are encrypted and two are read by rendering their outlined glyphs,
 * so a full re-extraction needs `GLOW_PDF_PASSWORDS`, `pdftoppm` and
 * `tesseract` — and `guardAgainstShrinkingTheArchive` correctly refuses a run
 * that has fewer of them than the archive already holds. A change to
 * `securityKeyOf` would therefore be unlandable on any machine without the
 * family's passwords, which is most of them.
 *
 * IT DOES NOT HAVE TO BE. `securityKey` is not READ off a page: it is DERIVED,
 * by one function, from a field the archive already carries verbatim — the
 * security NAME the statement printed. So re-deriving it from the committed
 * archive is a faithful partial replay of extraction, not a repair: the next
 * full `npm run extract` calls the same function on the same name and produces
 * the same bytes.
 *
 * THAT PREMISE IS ASSERTED ON EVERY RUN, NEVER ASSUMED. Before writing anything
 * this pass checks that the archive's stored keys really are a FUNCTION of its
 * stored names — see `gate()` below for why that, and not "does some version of
 * `securityKeyOf` reproduce them" — and refuses outright if they are not,
 * because a row whose key came from somewhere other than its name is a row this
 * script would silently overwrite with a different identity. Measured on this
 * archive: 4,041 keys across six row kinds, 324 distinct names, zero exceptions.
 *
 * AND IT IS NOT A REPAIR LAYER. It rewrites exactly two fields — `securityKey`,
 * and the key embedded in `dedupeGroup` (`dg-<securityKey>-<n>`, composed in
 * `reconcile.mjs`) — and nothing else. Every figure, every warning and every
 * piece of provenance is written back byte-for-byte, in `extract.mjs`'s own
 * `JSON.stringify(doc, null, 1) + "\n"`. Running it with an unchanged
 * `securityKeyOf` must leave the tree clean, which is the control run this book
 * already requires of a pipeline change, and `--check` is that control.
 *
 * Usage:
 *   npm run rekey:archive -- --check    report what would move; write nothing
 *   npm run rekey:archive               re-derive and write
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { securityKeyOf } from "../shared/securityKey.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

/** `dg-<securityKey>-<n>` — composed in reconcile.mjs and nowhere else. */
const DEDUPE_GROUP = /^dg-(.+)-(\d+)$/;

const moved = new Map();          // old key -> { to, rows, names:Set }
let rowsSeen = 0, rowsChanged = 0, docsChanged = 0, groupsChanged = 0;

/**
 * THE GATE, AND WHY IT IS STRUCK ON THE ARCHIVE RATHER THAN ON A FUNCTION.
 *
 * This pass may only replace a key it can prove came from the row's own NAME.
 * The obvious test — "does some known version of `securityKeyOf` reproduce the
 * stored key" — goes stale the moment the function changes, which is the only
 * occasion this script ever runs: after the first re-key the stored keys are
 * the NEW derivation and the old test refuses everything, so the pass would be
 * one-way and a second change to the rule unlandable.
 *
 * What stays true whatever the rule is, is the PROPERTY the rule must have:
 * the key is a FUNCTION of the name, so one name never carries two stored keys.
 * (The converse is not required and must not be: two names sharing a key is
 * exactly what a merge IS.) An archive that violates it has a key that came
 * from somewhere other than the name, this pass cannot reproduce it, and
 * overwriting it would substitute one identity for another — so nothing is
 * written and the run exits non-zero. The archive then needs a real
 * `npm run extract`, not this.
 */
/**
 * EVERY ROW IN A DOCUMENT THAT CARRIES A KEY — AT ANY DEPTH.
 *
 * This walked the document's TOP-LEVEL arrays only, and one row kind is not at
 * the top: `positionsAsOf.positions`, the balances a transaction statement
 * closes on — and on LKP's, the OPENING ledger rows `costFor` in `build-book`
 * joins a depository holding's cost from. Measured the first time a key change
 * reached one: aliasing LKP's `Crompton Greaves Consumer Elec` re-keyed its
 * holding and left its opening row behind, so the cost join found nothing and
 * the position lost ₹15.47 L of cost basis and its return — on a run that
 * reported success. A replay that misses a row kind is not a faithful replay,
 * so the gate and the rewrite now walk the same thing: every object inside any
 * array, wherever it sits, that carries a `securityKey`.
 */
function* keyedRows(node) {
  if (Array.isArray(node)) {
    for (const x of node) {
      if (x && typeof x === "object" && !Array.isArray(x) && "securityKey" in x) yield x;
      yield* keyedRows(x);
    }
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) yield* keyedRows(v);
  }
}

function gate() {
  const keyOfName = new Map();
  const broken = [];
  for (const dir of readdirSync(AUDIT_DIR).sort()) {
    const file = path.join(AUDIT_DIR, dir, "document.json");
    if (!existsSync(file)) continue;
    for (const r of keyedRows(JSON.parse(readFileSync(file, "utf8")))) {
      if (!r.securityKey || !r.security) continue;
      const seen = keyOfName.get(r.security);
      if (seen === undefined) keyOfName.set(r.security, r.securityKey);
      else if (seen !== r.securityKey) broken.push({ dir, name: r.security, keys: [seen, r.securityKey] });
    }
  }
  return { names: keyOfName.size, broken };
}
const { names: distinctNames, broken } = gate();
if (broken.length) {
  console.error(`REFUSING TO WRITE: ${broken.length} name(s) carry more than one stored securityKey, so the `
    + "stored key is not a function of the stored name and this pass cannot reproduce it. Re-extract instead.");
  for (const b of broken) console.error(`  !! ${b.dir}: ${JSON.stringify(b.name)} ${b.keys.join(" vs ")}`);
  process.exit(1);
}

for (const dir of readdirSync(AUDIT_DIR).sort()) {
  const file = path.join(AUDIT_DIR, dir, "document.json");
  if (!existsSync(file)) continue;
  const doc = JSON.parse(readFileSync(file, "utf8"));
  let touched = false;

  for (const r of keyedRows(doc)) {
    if (r.securityKey == null || !r.security) continue;
    rowsSeen++;
    const next = securityKeyOf(r.security);
    if (next !== r.securityKey) {
      const e = moved.get(r.securityKey) ?? { to: next, rows: 0, names: new Set() };
      e.rows++; e.names.add(r.security);
      moved.set(r.securityKey, e);
      r.securityKey = next;
      rowsChanged++; touched = true;
    }
    // The dedupe tag carries the key inside it, so it moves with the key.
    const m = typeof r.dedupeGroup === "string" ? r.dedupeGroup.match(DEDUPE_GROUP) : null;
    if (m && m[1] !== r.securityKey) {
      r.dedupeGroup = `dg-${r.securityKey}-${m[2]}`;
      groupsChanged++; touched = true;
    }
  }

  if (!touched) continue;
  docsChanged++;
  if (!CHECK) writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
}

console.log(`${CHECK ? "would re-key" : "re-keyed"} ${rowsChanged} of ${rowsSeen} rows`
  + ` across ${docsChanged} document(s); ${groupsChanged} dedupe tag(s) moved with them.`);
for (const [old, e] of [...moved].sort()) {
  console.log(`  ${old}\n    -> ${e.to}   (${e.rows} row${e.rows === 1 ? "" : "s"})`
    + `  ${[...e.names].map((n) => JSON.stringify(n)).join(" | ")}`);
}
// A safety check that only speaks when it fires is indistinguishable, on a
// clean run, from one that was quietly deleted.
console.log(`gate: ${distinctNames} distinct security name(s), 0 carrying more than one stored key — `
  + "the stored key is a function of the stored name, which is what licenses this pass.");
