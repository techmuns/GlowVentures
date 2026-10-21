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
 *
 * EMPTY SINCE 21 OCT 2026, and both of the files it held are accounted for:
 *   • Bharat Jaisinghani's scanned HDFC NSDL statement is READ — by OCR, every
 *     figure checked by the page itself (`lib/scan.mjs`, `providers/nsdlScan.mjs`).
 *   • LKP's two October workbooks are mail-server removal notices. Such a file
 *     needs no entry: `extract` files it as `attachment-removed`, naming the
 *     statement that never arrived, and `check:reads` lists every one on every
 *     run instead of failing on it — there is no reader to write for a file
 *     with no statement in it, only a sender to ask.
 */
export const ACCEPTED_UNREAD = Object.freeze({});
