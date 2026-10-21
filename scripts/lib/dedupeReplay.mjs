/**
 * WHAT `npm run replay:dedupe` WOULD WRITE — THE PLAN, AS A PURE FUNCTION.
 *
 * The replay script and its suite (`ingest/__tests__/separateInvestments
 * .test.mjs`) both call `planDedupeReplay`, so the gate the suite exercises is
 * the gate the script runs. It reads nothing from disk and writes nothing: the
 * caller hands it the documents and applies the plan.
 *
 * ── RULE 2, THE GATE ────────────────────────────────────────────────────────
 *
 * A holding's tags on disk must be ones the duplicate policy itself writes.
 * The policy writes a group's tags in one of two states, and nothing else:
 *
 *   • TAGGED — every member of a group check (c) finds carries the group's id
 *     and names the others. What it writes where no answer covers the group.
 *   • UNTAGGED, WHOLE — every member carries no tag. What it writes where the
 *     family's answer covers the group.
 *
 * So a holding may be rewritten only if it is in one of those two states now.
 * The untagged state is judged over the WHOLE group, never a holding alone:
 * one member tagged and the other not is not a state the policy writes under
 * any answer, and is refused.
 *
 * The second state is what lets an answer be WITHDRAWN. Delete an entry from
 * `SEPARATE_INVESTMENTS` and the pair's rows are untagged on disk while the
 * policy now tags them; the gate accepts the untagged whole group as the
 * policy's own writing and the plan puts the tags back. Without it a withdrawn
 * answer could land only through `npm run extract`, which needs the PDF
 * passwords most machines do not have.
 *
 * ── RULE 1 ──────────────────────────────────────────────────────────────────
 *
 * Only `dedupeGroup` and `alsoReportedUnder` on a holding may change. Every
 * planned write is checked against its document with those two fields removed.
 */
import { duplicateHoldings, applyDedupePolicy } from "../ingest/reconcile.mjs";

/** The extractor's own serialisation — see `writeArchive` in `ingest/extract.mjs`. */
export const serialise = (doc) => JSON.stringify(doc, null, 1) + "\n";

const tagsOf = (h) => ({ dedupeGroup: h.dedupeGroup ?? null, alsoReportedUnder: h.alsoReportedUnder ?? [] });
const UNTAGGED = { dedupeGroup: null, alsoReportedUnder: [] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The tags the policy writes under `decisions`, over a fresh copy of every document. */
export function tagsUnder(docs, decisions) {
  const copy = docs.map((d) => structuredClone(d));
  for (const d of copy) for (const h of d.holdings ?? []) { h.dedupeGroup = null; h.alsoReportedUnder = []; }
  const { groups } = duplicateHoldings(copy, { decisions });
  applyDedupePolicy(copy, groups);
  return copy.map((d) => (d.holdings ?? []).map(tagsOf));
}

/**
 * The plan for `docs` under `decisions`:
 *   `updates`   one entry per holding whose tags would change
 *   `writes`    `{ index, text }` per document to rewrite — `index` into `docs`
 *   `refusals`  one sentence per holding or document the gate refuses
 * With any refusal the caller must write nothing.
 */
export function planDedupeReplay(docs, decisions) {
  const withNoAnswer = tagsUnder(docs, []);
  const planned = tagsUnder(docs, decisions);

  // Each group the policy forms with no answer, and its members' tags on disk.
  const members = new Map();
  withNoAnswer.forEach((hs, i) => hs.forEach((t, j) => {
    if (!t.dedupeGroup) return;
    const m = members.get(t.dedupeGroup) ?? [];
    m.push(tagsOf(docs[i].holdings[j]));
    members.set(t.dedupeGroup, m);
  }));
  const wholeGroupUntagged = (i, j) => {
    const id = withNoAnswer[i][j].dedupeGroup;
    return Boolean(id) && (members.get(id) ?? []).every((t) => same(t, UNTAGGED));
  };

  const updates = [];
  const writes = [];
  const refusals = [];
  docs.forEach((doc, i) => {
    const holdings = doc.holdings ?? [];
    const next = structuredClone(doc);
    let dirty = false;
    holdings.forEach((h, j) => {
      const onDisk = tagsOf(h);
      const policyWrote = same(onDisk, withNoAnswer[i][j]) || same(onDisk, planned[i][j])
        || (same(onDisk, UNTAGGED) && wholeGroupUntagged(i, j));
      if (!policyWrote) {
        refusals.push(`${doc.docKey} · ${h.securityKey}: tag on disk ${JSON.stringify(onDisk)} is not one the policy `
          + `writes — neither its group's tag ${JSON.stringify(withNoAnswer[i][j])}, nor ${JSON.stringify(planned[i][j])} under `
          + "the family's answers, nor an untagged whole group");
        return;
      }
      if (same(onDisk, planned[i][j])) return;
      next.holdings[j].dedupeGroup = planned[i][j].dedupeGroup;
      next.holdings[j].alsoReportedUnder = planned[i][j].alsoReportedUnder;
      dirty = true;
      updates.push({ docKey: doc.docKey, securityKey: h.securityKey, from: onDisk.dedupeGroup, to: planned[i][j].dedupeGroup });
    });
    if (!dirty) return;
    const frozen = (d) => {
      const c = structuredClone(d);
      for (const x of c.holdings ?? []) { delete x.dedupeGroup; delete x.alsoReportedUnder; }
      return JSON.stringify(c);
    };
    if (frozen(next) !== frozen(doc)) {
      refusals.push(`${doc.docKey}: a field other than the dedupe tags would change`);
      return;
    }
    writes.push({ index: i, text: serialise(next) });
  });
  return { updates, writes, refusals };
}
