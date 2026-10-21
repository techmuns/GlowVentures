/**
 * ── WHAT `partial` MEANS: A READ GAP, NEVER A FACT ABOUT THE STATEMENT ────────
 *
 * Every reader ends with the same line — `warnings.length ? "partial" : "ok"` —
 * and every reader also records, as a warning, things that are true of the
 * STATEMENT rather than of the reading: 360 ONE prints "No data available to
 * generate Transaction Statement Report", Sky Capital publishes no NAV, a
 * depository's rate is the last movement's price, a TDS transfer is not a trade.
 * Each of those is the reader doing its job, and each turned a document read
 * line for line into `partial`. The Statement Library then showed eight 360 ONE
 * holding statements as "Partial" that had nothing left on them to read, and the
 * reader of that screen could not tell them from a document with an unread
 * table — which is the one thing the word has to tell them.
 *
 * So the warnings are split in two, here, once, for every reader:
 *
 *   • A STATEMENT NOTE says what the document is or prints — a basis, an absence
 *     the issuer printed, an inconsistency in the issuer's own figures, how an
 *     identity was established. It stays on the document, word for word, and it
 *     is shown wherever the document is; it does not make the reading partial.
 *   • Anything else is a READ GAP — a column, a table, a cell, a field or a
 *     whole report this pipeline did not read — and a document carrying one is
 *     `partial` exactly as before. A code not listed below is a gap: a new
 *     warning has to be argued into the note list, never defaulted into it.
 *
 * `settleStatus` only ever PROMOTES `partial` to `ok`, and only when the
 * document carries at least one warning and every one of them is a note. It
 * never touches `failed` (which is load-bearing downstream: build-book and the
 * reconcile skip it) and never demotes an `ok` a reader decided on. A `partial`
 * with no warning at all is left alone, because several readers use exactly
 * that to mean "the page did not give me what I needed" (bankAdvice,
 * aifDistribution, hdfcNsdl) and the absence of a warning there is not evidence
 * of a complete read.
 */

/** Warning codes that describe the statement, not the reading. */
export const STATEMENT_NOTES = Object.freeze(new Set([
  // What the statement printed, or pointedly did not.
  "section-reported-empty",          // "No data available to generate …"
  "portfolio-reported-nil",          // a printed nil portfolio, a measured zero
  "account-holds-nothing",           // `NO HOLDING IS AVAILABLE`
  "redeemed-to-nil",
  "no-valuation-published",          // the issuer publishes no NAV on this statement
  "no-rate-published",               // the depository prints no rate for the line
  "advice-only",                     // the advice e-mail announces, the letter carries the figures
  "statement-basis",                 // the basis the figures are struck on
  "weights-on-aum-basis",
  "price-date-precedes-holding-date",
  "profit-and-loss-capital-is-a-balance", // the window opens on a years-old account
  "profit-and-loss-not-only-cash",        // the balance sheet itemises no holding
  // How a printed column is to be read — read, and named for what it is.
  "rate-is-last-movement-price",
  "aif-units-carry-face-value-not-nav",
  "value-is-face-value-declared",
  "value-is-face-value-par",
  "value-is-face-value-scheme",
  "value-stitched-across-lines",
  "depository-movements-are-not-trades",
  "tds-transfers-are-not-trades",
  "unit-movements-are-not-trades",
  "payment-receipt-not-a-statement",
  // The issuer's own figures disagreeing with each other, retained as printed.
  "nav-does-not-reproduce-valuation",
  "payouts-row-not-in-printed-total",
  "value-bridge-mismatch",
  // Provenance: how the file was opened, split, keyed or attributed.
  "pdf-encrypted",
  "text-recovered-by-rendering",
  // A scan read by OCR, every published row checked by the page (lib/scan.mjs).
  "text-recovered-from-scan",
  // Printed under `Pending Demat`: the holder's shares, lodged and not yet free.
  "pending-demat",
  "from-bundle",
  "duplicate-doc-key",
  "witness-of",
  "provider-from-sibling",
  "owner-from-account-number",
  "owner-from-register",
  "account-no-from-client-code",
  "account-no-from-sole-account",
  "security-name-from-isin",
  // A scanned row no text-layer statement names: ISIN and quantity checked, spelling not.
  "security-name-from-scan",
]));

/**
 * Is this warning a statement note on THIS document? One code depends on the
 * document: `owner-unresolved` is written before the backfills run, and once a
 * sibling statement has settled the holder (`owner-from-account-number`) the
 * attribution is complete and the warning is the record of how it got there.
 */
export function isStatementNote(w, doc) {
  if (STATEMENT_NOTES.has(w?.code)) return true;
  if (w?.code === "owner-unresolved") return !!doc?.ownerId;
  return false;
}

/** The warnings on a document that are read gaps. */
export const readGaps = (doc) => (doc?.warnings ?? []).filter((w) => !isStatementNote(w, doc));

/**
 * `partial` → `ok` when every warning is a statement note; anything else is
 * returned as it came. Mutates and returns the document.
 */
export function settleStatus(doc) {
  if (doc?.status !== "partial") return doc;
  const warnings = doc.warnings ?? [];
  if (warnings.length && !readGaps(doc).length) doc.status = "ok";
  return doc;
}
