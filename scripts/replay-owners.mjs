#!/usr/bin/env node
/**
 * REPLAY THE BENEFICIAL-OWNER JOIN OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:owners` · `npm run replay:owners -- --check`
 *
 * ── WHAT IT LANDS ───────────────────────────────────────────────────────────
 *
 *   "Bharat Jaisinghani Trust looks empty on holdings, so check that as well
 *    since the client has provided half of the statements already."
 *
 * The two HDFC Bank NSDL statements in `source/august-2026-f/` hold 347 Swapeco
 * Pre-Series-A CCPS each — the family trusts' holdings, per the family's own
 * investment register — and print `AJAY T JAISINGHANI` on the holder line,
 * because he is the TRUSTEE. `providers/hdfcNsdl.mjs` now carries the join, keyed
 * on the DP account number the page prints and cited to the register; see the
 * long note at the top of that file for the four things that had to hold before
 * a statement was re-attributed against the name printed on it.
 *
 * ── WHY A REPLAY AND NOT `npm run extract` ──────────────────────────────────
 *
 * Extraction needs `GLOW_PDF_PASSWORDS` for eight encrypted statements and
 * `pdftoppm`/`tesseract` for the two outlined-text ones — these two — and
 * `guardAgainstShrinkingTheArchive` correctly refuses a run that produced fewer
 * documents than are on disk. So a reader change is unlandable on any machine
 * without the family's passwords, which is most of them.
 *
 * It does not have to be. The owner is DERIVED from text this archive already
 * carries verbatim in `pages.json`, so re-deriving it here is a faithful partial
 * replay of extraction rather than a repair layer: the next full `npm run
 * extract` calls the same function on the same text and writes the same bytes.
 * `rekey:archive`, `build-lookthrough --reindex`, `replay:calls` and
 * `replay:movements` are the four precedents; this is the fifth, on the same
 * three rules.
 *
 *   1. IT ONLY EVER TOUCHES THE OWNER. `owner` and `ownerId` on the document
 *      and its manifest entry, plus one warning recording the join. Every other
 *      byte of both files is written back unchanged — asserted, not assumed.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. The holder line re-read from the
 *      committed pages must reproduce EITHER the owner already on disk (a
 *      document this has not run against) or the owner the join produces (one
 *      it has). Anything else means this is not reading what the extractor
 *      read, nothing is written, and the run exits non-zero.
 *   3. `--check` WRITES NOTHING and is the control run. Against an archive
 *      already carrying the join it must be a no-op, which is what says the
 *      files on disk are what the extractor would write.
 *
 * ── AND A SECOND JOIN, ON A SECOND DEPOSITORY (Stage 10db) ──────────────────
 *
 * Motilal Oswal demat 1201090032387399 prints the trustees of the unnumbered
 * "Bharat Jaisinghani Family Trust" on its holder lines, and its masked PAN fits
 * none of them, so it sat EXCLUDED as an account whose holder could not be
 * established. `providers/motilalDemat.mjs` now carries the join, keyed on the
 * client ID the page prints and cited to the family's own register and review;
 * the note at the top of that file sets out what each records.
 *
 * This replay calls that reader's own `identityOf` on the committed text — the
 * same function a full run calls — so nothing here re-reads a page by a regex
 * of its own. Three more fields may move on those documents, because the join
 * moves them: `excludedFromBook` (an account whose holder is now established is
 * not excluded) and the reader's IDENTITY warnings, replaced in place and in
 * the order the reader writes them. Its gate is the same rule 2, struck the
 * same way: what is on disk must be EITHER the reader's reading with the join
 * (already landed) or its reading with no entry at all (not yet landed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ownerIdFor } from "../shared/owners.mjs";
import { BENEFICIAL_OWNER_BY_DP_ACCOUNT, PROVIDER } from "./ingest/providers/hdfcNsdl.mjs";
import * as motilal from "./ingest/providers/motilalDemat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

/** The warning code the join writes, so a re-run recognises its own work. */
const CODE = "owner-from-register";

/**
 * `extract()`'s own text, rebuilt from the committed pages — the same join and
 * whitespace collapse the other replays use, copied from the readers rather
 * than approximated. A holder regex run against text joined differently reads a
 * different name, or none, and would look exactly like a statement that stopped
 * printing the line.
 */
function textOf(docKey) {
  const p = path.join(AUDIT, docKey, "pages.json");
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return (j.pages ?? []).map((x) => x.text ?? "").join("\n").replace(/[ \t]+/g, " ");
}

/** The reader's own two reads, over the committed text. */
const accountNoIn = (t) => (/DP\s*Account\s*No\s*:?\s*(\d{6,})/i.exec(t) ?? [])[1] ?? null;
const holderIn = (t) => (/DP\s*Account\s*No\s*:?\s*\d{6,}\s*\n\s*([A-Z][A-Z .]+)/i.exec(t) ?? [])[1]?.trim() ?? null;

const manifestFile = path.join(AUDIT, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

let checked = 0, changed = 0, refused = 0, manifestDirty = false;
for (const entry of manifest) {
  if (entry.provider !== PROVIDER) continue;
  const file = path.join(AUDIT, entry.docKey, "document.json");
  if (!fs.existsSync(file)) continue;
  const text = textOf(entry.docKey);
  if (!text) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  checked += 1;

  const accountNo = accountNoIn(text);
  const printedHolder = holderIn(text);
  const join = accountNo ? BENEFICIAL_OWNER_BY_DP_ACCOUNT[Number(accountNo)] ?? null : null;

  // RULE 2 — the gate, struck on the archive. The account number must be the
  // one the archive already carries, and the owner on disk must be explicable:
  // either the holder this text prints (not yet joined) or the owner the join
  // produces (already joined). A third value means somebody else wrote it.
  if (accountNo !== doc.accountNo) {
    console.error(`REFUSED ${entry.docKey}: replayed account ${accountNo} against ${doc.accountNo} on disk`);
    refused += 1;
    continue;
  }
  const explicable = doc.owner === printedHolder || (join && doc.owner === join.owner);
  if (!explicable) {
    console.error(`REFUSED ${entry.docKey}: owner "${doc.owner}" on disk is neither the printed holder `
      + `"${printedHolder}" nor the register's "${join?.owner ?? "(no join)"}"`);
    refused += 1;
    continue;
  }
  if (!join) continue;

  const owner = join.owner;
  const ownerId = ownerIdFor(owner);
  if (!ownerId) {
    console.error(`REFUSED ${entry.docKey}: "${owner}" resolves to no canonical owner — add it to shared/owners.mjs first`);
    refused += 1;
    continue;
  }

  const warnings = (doc.warnings ?? []).filter((w) => w.code !== CODE);
  warnings.unshift({
    code: CODE,
    detail: `DP account ${accountNo} is attributed to ${owner}, not to the "${printedHolder}" the `
      + `holder line prints: ${join.via}`,
  });

  const next = { ...doc, owner, ownerId, warnings };
  // RULE 1 — nothing but the owner, its id and that one warning may move.
  const frozen = (o) => { const c = { ...o }; delete c.owner; delete c.ownerId; delete c.warnings; return c; };
  if (JSON.stringify(frozen(next)) !== JSON.stringify(frozen(doc))) {
    console.error(`REFUSED ${entry.docKey}: a field other than the owner would change`);
    refused += 1;
    continue;
  }
  if (JSON.stringify(next) === JSON.stringify(doc)) continue;

  changed += 1;
  console.log(`${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(52)} ${doc.owner} → ${owner}`);
  if (!CHECK) {
    fs.writeFileSync(file, JSON.stringify(next, null, 1) + "\n");
    entry.owner = owner;
    entry.ownerId = ownerId;
    entry.warnings = warnings.length;
    manifestDirty = true;
  }
}

const hdfc = { checked, changed, refused };

// ── Motilal Oswal (CDSL) — the client-ID join ───────────────────────────────

const IDENTITY = new Set(motilal.IDENTITY_WARNING_CODES);
const identityCodes = (ws) => (ws ?? []).filter((w) => IDENTITY.has(w.code)).map((w) => w.code);

/** What a full run writes for these four fields, from one reading of the page. */
function landedState(id) {
  // extract.mjs falls back to the classifier's name where the reader returns no
  // owner — on these statements the same `Client Name:` this reading carries.
  const owner = id.owner ?? id.holderName;
  return {
    owner,
    ownerId: id.owner ? id.ownerId : ownerIdFor(owner),
    excludedFromBook: id.excludedFromBook,
    identity: id.warnings,
  };
}

let mChecked = 0, mChanged = 0, mRefused = 0;
for (const entry of manifest) {
  if (entry.provider !== motilal.PROVIDER) continue;
  const file = path.join(AUDIT, entry.docKey, "document.json");
  if (!fs.existsSync(file)) continue;
  const text = textOf(entry.docKey);
  if (!text) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  mChecked += 1;

  const now = motilal.identityOf(text);
  const pre = motilal.identityOf(text, {});
  if (now.clientId !== doc.accountNo) {
    console.error(`REFUSED ${entry.docKey}: replayed client ID ${now.clientId} against ${doc.accountNo} on disk`);
    mRefused += 1;
    continue;
  }

  const want = landedState(now);
  const was = landedState(pre);
  const onDisk = {
    owner: doc.owner,
    ownerId: doc.ownerId,
    excludedFromBook: doc.excludedFromBook ?? null,
    identity: (doc.warnings ?? []).filter((w) => IDENTITY.has(w.code)),
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const landed = same(onDisk, want);
  // The state before the entry existed. The exclusion's WORDING has moved since
  // it was written to disk, so its presence is what is compared, with the owner,
  // its id and the identity warning codes.
  const preJoin = onDisk.owner === was.owner && onDisk.ownerId === was.ownerId
    && (onDisk.excludedFromBook == null) === (was.excludedFromBook == null)
    && same(identityCodes(doc.warnings), was.identity.map((w) => w.code));
  if (!landed && !preJoin) {
    console.error(`REFUSED ${entry.docKey}: the owner on disk ("${doc.owner}", ${doc.ownerId}) is neither the reader's `
      + `reading with the join ("${want.owner}") nor without it ("${was.owner}")`);
    mRefused += 1;
    continue;
  }
  if (landed) continue;
  if (!want.ownerId) {
    console.error(`REFUSED ${entry.docKey}: "${want.owner}" resolves to no canonical owner — add it to shared/owners.mjs first`);
    mRefused += 1;
    continue;
  }

  const warnings = [...want.identity, ...(doc.warnings ?? []).filter((w) => !IDENTITY.has(w.code))];
  const next = { ...doc, owner: want.owner, ownerId: want.ownerId, excludedFromBook: want.excludedFromBook, warnings };
  const frozen = (o) => { const c = { ...o }; for (const k of ["owner", "ownerId", "excludedFromBook", "warnings"]) delete c[k]; return c; };
  if (!same(frozen(next), frozen(doc))) {
    console.error(`REFUSED ${entry.docKey}: a field other than the owner would change`);
    mRefused += 1;
    continue;
  }

  mChanged += 1;
  console.log(`${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(82)} ${doc.owner} → ${want.owner}`);
  if (!CHECK) {
    fs.writeFileSync(file, JSON.stringify(next, null, 1) + "\n");
    entry.owner = want.owner;
    entry.ownerId = want.ownerId;
    entry.warnings = warnings.length;
    manifestDirty = true;
  }
}

if (manifestDirty) fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + "\n");
console.log(`\n${hdfc.checked} ${PROVIDER} document(s) replayed · ${hdfc.changed} ${CHECK ? "would change" : "changed"} · ${hdfc.refused} refused`);
console.log(`${mChecked} ${motilal.PROVIDER} document(s) replayed · ${mChanged} ${CHECK ? "would change" : "changed"} · ${mRefused} refused`);
if (hdfc.refused || mRefused) process.exit(1);
if (CHECK && (hdfc.changed || mChanged)) process.exit(2);
