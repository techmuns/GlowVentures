// WHAT A FILE'S BYTES SAY IT IS — whatever its name says.
//
// LKP's October equity workbooks reached this book as two `.xls` files of 85
// bytes each: "This attachment was removed because it contains data that could
// pose a security risk." A mail server stripped the statements in transit and
// left its notice under the original names. Nothing anywhere can read a
// statement out of that notice, and for months the second one was invisible —
// byte-identical to the first, it was taken for a copy of it.
//
// So a file is judged by its BYTES, at every door a statement comes through:
// the upload (`functions/api/statement-uploads.js`) refuses one that is not what
// it claims to be, the intake run holds one, and `extract` files each removal
// notice as its own `attachment-removed` document naming the statement that
// never arrived. Plain JS, no Node APIs, so the Pages Function and the scripts
// share one implementation.

const ascii = (bytes, n = 4096) => {
  let s = "";
  const end = Math.min(bytes.length, n);
  for (let i = 0; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
};
const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);

/**
 * A mail server's notice left in place of an attachment it removed — short,
 * plain text, and saying so. Every gateway words it a little differently.
 */
export function isRemovalNotice(bytes) {
  if (!bytes || bytes.length === 0 || bytes.length > 4096) return false;
  const s = ascii(bytes);
  if (!/^[\x09\x0a\x0d\x20-\x7e]*$/.test(s)) return false;
  return /attachment\s+(?:was|has\s+been)\s+(?:removed|stripped|deleted|blocked)|removed\s+because\s+it\s+contain|(?:blocked|quarantined)\s+(?:by|for)\s+(?:security|policy)/i.test(s);
}

const PDF = /^\s{0,16}%PDF-/;
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Does a file's head (its first few KB are enough) carry what its extension
 * claims? `{ ok: true }`, or `{ ok: false, why }` with the sentence a person
 * reads. A legacy `.xls` may honestly be an HTML or delimited-text export —
 * `lib/sheet.mjs` reads those — so text passes for `.xls`, unless it is a
 * removal notice or a web page.
 */
export function checkStatementBytes(bytes, name) {
  const ext = String(name ?? "").toLowerCase().split(".").pop();
  if (!bytes || !bytes.length) return { ok: false, why: "The file is empty." };
  if (isRemovalNotice(bytes)) {
    return { ok: false, removalNotice: true,
      why: `This is not the statement: it is the ${bytes.length}-byte notice a mail server left after REMOVING the real attachment ("${ascii(bytes, 160).trim()}"). The statement never arrived — ask the sender to re-send it another way (a download link, or zipped).` };
  }
  const head = ascii(bytes, 1024);
  const webPage = /^\s*<!doctype\s+html|^\s*<html[\s>]/i.test(head) && !/<table/i.test(ascii(bytes, 65536));
  if (ext === "pdf") {
    if (PDF.test(head)) return { ok: true };
    return { ok: false, why: webPage ? "This .pdf is a web page (often a sign-in or error page saved by mistake), not a statement." : "This file is named .pdf but is not a PDF." };
  }
  if (ext === "zip" || ext === "xlsx" || ext === "xlsm") {
    if (startsWith(bytes, ZIP) || startsWith(bytes, ZIP_EMPTY)) return { ok: true };
    if (ext !== "zip" && startsWith(bytes, OLE2)) return { ok: true };
    return { ok: false, why: `This file is named .${ext} but is not ${ext === "zip" ? "a ZIP archive" : "an Excel workbook"}.` };
  }
  if (ext === "xls") {
    if (startsWith(bytes, OLE2) || startsWith(bytes, ZIP)) return { ok: true };
    if (webPage) return { ok: false, why: "This .xls is a web page (often a sign-in or error page saved by mistake), not a workbook." };
    return { ok: true };   // an HTML-table, XML or delimited export — the workbook reader sniffs which
  }
  return { ok: true };
}
