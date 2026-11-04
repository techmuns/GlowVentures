// A HOLDING'S DOCUMENTS (Stage 10kx) — the files uploaded from Private Market
// under a company or fund, read off the statement inbox's own log
// (`shared/statementInbox.mjs`, `holdingDocuments`).
//
// The log is the index: each file carries its `subject` — the Private Market row
// it was filed under and the `securityKey`s behind it — so the Portfolio
// Library files it in that security's folder and Private Market links it from
// the row, with no second list to drift from the first.
import type { PrivateBook, BookFolio } from "./privateBook";
import { holdingDocuments } from "../../shared/statementInbox.mjs";
import type { InboxBatch, InboxFile, InboxSubject } from "./statementUploads";

export type HoldingDocument = { batch: string; uploadedAt: string; file: InboxFile; subject: InboxSubject };

/**
 * A FUND IS WHAT ITS STATEMENT CALLS ONE: a row any of whose folios is an AIF
 * or mutual-fund unit, or a capital account with no holding (a drawdown fund's).
 * Everything else — unlisted shares, a company's debentures — is a company,
 * whether or not a funding round is on file for it.
 */
const isFundRow = (folios: BookFolio[]) =>
  folios.some((f) => !f.position || f.position.assetClass === "AIF" || f.position.assetClass === "Mutual Fund");

/** Every Private Market row an upload can be filed under: one per fund row, companies named as such. */
export function uploadSubjects(
  book: PrivateBook,
  companyOf: (folios: BookFolio[]) => { id: string } | null | undefined,
): InboxSubject[] {
  const seen = new Set<string>();
  const out: InboxSubject[] = [];
  for (const section of Object.values(book.sections)) {
    for (const g of section.groups) {
      if (seen.has(g.key)) continue;
      seen.add(g.key);
      const keys = [...new Set(g.folios.flatMap((f) => [f.securityKey, f.fundKey]).filter((k): k is string => !!k))];
      out.push({ kind: companyOf(g.folios) || !isFundRow(g.folios) ? "company" : "fund", key: g.key, label: g.label, keys });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Every file filed under a holding, newest first. */
export function holdingDocumentsOf(batches: readonly InboxBatch[]): HoldingDocument[] {
  return holdingDocuments({ batches: [...batches] })
    .flatMap((d) => (d.file.subject ? [{ ...d, subject: d.file.subject }] : []));
}

/** True when a document belongs to a row or folder answering to any of these keys. */
export const documentMatches = (d: HoldingDocument, keys: readonly string[]) =>
  keys.includes(d.subject.key) || d.subject.keys.some((k) => keys.includes(k));

/** The Portfolio Library folder a holding's documents open in (`?stock=`). */
export const subjectFolderHref = (s: Pick<InboxSubject, "key" | "keys">) =>
  `/portfolios?stock=${encodeURIComponent(s.keys[0] ?? s.key)}`;
