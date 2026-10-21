/**
 * ── FILES THAT CANNOT BE READ, AND WHY — DECIDED ONE BY ONE, NEVER BY DEFAULT ──
 *
 * `npm run check:reads` fails on any document that is not read in full. A file
 * may stand here instead only when NO READER COULD read it — the file itself
 * carries nothing to read — and each entry says what would let it be read. A
 * file a reader could read (a new layout, a new report type, a column the reader
 * misses) never belongs here: it gets the reader.
 *
 * Keyed by `sourcePath` exactly as the archive records it. An entry whose file
 * is no longer failed — re-sent, or read after all — fails the check too, so
 * this list cannot outlive the reason it was written for.
 *
 * Files held out BY DECISION (the family's review and register) need no entry:
 * they are read perfectly, and `held-out-by-decision` says so on the document.
 */
export const ACCEPTED_UNREAD = Object.freeze({
  "source/_extracted/october-2026-c/LKP EQUITY/519_06102026124925.xls": {
    reason: "Not a workbook: an 85-byte notice a mail server left in place of the attachment "
      + "(\"This attachment was removed because it contains data that could pose a security risk.\"). "
      + "The statement itself never arrived.",
    action: "Ask LKP to re-send the October equity workbook another way (a link, or zipped), drop it in a new "
      + "delivery folder and re-run the pipeline.",
  },
  "source/august-2026-e/HOLDING STATEMENT AS ON 31 MARCH 2026.pdf": {
    reason: "Bharat Jaisinghani's HDFC NSDL holding statement, scanned to four JPEGs: no text layer, and this "
      + "book does not take figures from OCR of a photograph (CLAUDE.md, The data model).",
    action: "Ask HDFC Bank for the same statement as a text PDF (the e-statement, not a scan).",
  },
});
