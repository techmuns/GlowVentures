// A SCAN IS READ ONLY WHERE THE PAGE CHECKS IT — the pieces, without OCR.
// Run: node scripts/ingest/__tests__/scanRead.test.mjs
//
// The OCR itself runs where a scan arrives (the intake, or `npm run extract`),
// and what it published for Bharat's HDFC statement is held against figures a
// person read off the page in `golden.mjs`. This suite pins the parts that
// decide whether a reading is PUBLISHED: an ISIN's check digit and the repair of
// OCR's confusions, the two printings of a quantity, a removal notice or a
// mislabelled file, and the reader's refusals.
import { isinValid, isinCandidates, resolveIsin } from "../lib/isin.mjs";
import { quantityReadings } from "../lib/scan.mjs";
import { extract, matchesScan, SCAN_LAYOUT } from "../providers/nsdlScan.mjs";
import { isRemovalNotice, checkStatementBytes } from "../../../shared/statementBytes.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("scanRead");

// ── the ISIN ────────────────────────────────────────────────────────────────
ok("a printed ISIN passes its check digit", ["INE455K01017", "INF0RO522964", "INE07LN01014", "INF1ISW22079"].every(isinValid));
ok("a one-digit misread fails it", !isinValid("INE455K01018") && !isinValid("INE455K01O17"));
// Readings OCR actually produced off the scan, with what the page prints.
const READ = [
  [["INFOROS522964", "INFOROS522964", "INFORO522964"], "INF0RO522964"],
  [["INEO7LNO01014", "INEO7LNO01014", "INEO7LNO1014"], "INE07LN01014"],
  [["INFOXAZ22055", "INFO XAZ22055", "INFOXAZ220S5"], "INF0XAZ22055"],
  [["JINEONVS01016", "INEONV501016", "INEONVS01016"], "INE0NV501016"],
  [["INE4SSK01017", "INEA455K01017", "INE455K01017"], "INE455K01017"],
  [["INE1VXEOI1I018", "INE1VXE01018", "INE1VXE01018"], "INE1VXE01018"],
  [["INFORLL22CH4", "INFORLL22CH4", "INFORLL22CH4"], "INF0RLL22CH4"],
];
for (const [readings, want] of READ) {
  const got = resolveIsin(readings);
  ok(`${readings[0]} resolves to ${want}`, got.isin === want, JSON.stringify(got));
}
ok("an Indian issuer code starts with a digit — `INFORL1Z2CH4` is not a candidate",
  !isinCandidates("INFORLL22CH4").some((c) => c.isin === "INFORL1Z2CH4"));
ok("a reading nothing repairs resolves to nothing", resolveIsin(["HELLO WORLD"]).isin === null);

// ── the two printings of a quantity ─────────────────────────────────────────
const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
ok("Indian grouping", same(quantityReadings("51,08,911"), [5108911]));
ok("western grouping", same(quantityReadings("5,108,911"), [5108911]));
ok("units to three decimals, a space before the point", same(quantityReadings("9,90,429 .684"), [990429.684]));
ok("a grouped figure's point is a point", same(quantityReadings("12,11,186.597"), [1211186.597]));
ok("a lone d.ddd could be a lost comma — both kept, the other cell decides", same(quantityReadings("7.250"), [7.25, 7250]));
ok("specks and table rules are not figures", quantityReadings("|").length === 0 && quantityReadings("—").length === 0);

// ── the bytes ───────────────────────────────────────────────────────────────
const enc = (s) => new TextEncoder().encode(s);
const NOTICE = "This attachment was removed because it contains data that could pose a security risk.";
ok("LKP's removal notice is a removal notice", isRemovalNotice(enc(NOTICE)));
ok("…refused at the upload, saying the statement never arrived",
  (() => { const r = checkStatementBytes(enc(NOTICE), "519_06102026124925.xls"); return !r.ok && r.removalNotice && /never arrived/i.test(r.why); })());
ok("a PDF is a PDF", checkStatementBytes(enc("%PDF-1.5\n%…"), "x.pdf").ok);
ok("a sign-in page saved as .pdf is not", !checkStatementBytes(enc("<!DOCTYPE html><html><body>Sign in</body></html>"), "x.pdf").ok);
ok("an HTML-table .xls export is a workbook", checkStatementBytes(enc("<html><table><tr><td>ISIN</td></tr></table></html>"), "x.xls").ok);
ok("a ZIP is a ZIP", checkStatementBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), "x.zip").ok);
ok("an empty file is refused", !checkStatementBytes(new Uint8Array(0), "x.pdf").ok);

// ── the reader ──────────────────────────────────────────────────────────────
ok("the layout is told apart by its own title, the depository and a participant line",
  matchesScan("STATEMENT OF HOLDINGS National Securities Depository Limited DP: HDFC BANK LIMITED [IN301151]")
  && !matchesScan("STATEMENT OF HOLDINGS for your mutual fund folio"));
const scan = (extra = {}) => ({
  layout: SCAN_LAYOUT, engine: "test", skew: [0], pageOrder: [1], printedPages: { of: 1, seen: [1] }, endOfReport: true,
  dp: { name: "HDFC BANK LIMITED", id: "IN301151" }, clientId: "22025655", holder: "BHARAT JAISINGHANI", asOn: "31-Mar-2026",
  rows: [{ page: 1, isin: "INE455K01017", name: "POLYCAB INDIA LIMITED EQ", description: "Free Balance", quantity: 5108911 }],
  problems: [], ...extra,
});
{
  const r = extract({ grid: { scan: scan() }, meta: {} });
  ok("a verified scan is published: its holder, account, date and units, and NO value",
    r.status === "ok" && r.provider === "HDFC Bank (NSDL demat)" && r.accountNo === "22025655" && r.asOf === "2026-03-31"
    && r.holdings.length === 1 && r.holdings[0].quantity === 5108911 && r.holdings[0].marketValue === null
    && r.warnings.some((w) => w.code === "text-recovered-from-scan"), JSON.stringify(r).slice(0, 400));
}
{
  const r = extract({ grid: { scan: scan({ problems: ["page 1: a row the page could not check"] }) }, meta: {} });
  ok("ONE unchecked row refuses the whole statement, and says which",
    r.status === "failed" && r.holdings.length === 0 && r.warnings.some((w) => w.code === "scan-not-verified" && /could not check/.test(w.detail)));
}
{
  const r = extract({ grid: { scan: scan({ dp: { name: "SOME OTHER BANK LIMITED", id: "IN300000" } }) }, meta: {} });
  ok("a participant this book has no account at is refused by name", r.status === "failed" && r.warnings.some((w) => w.code === "scan-participant-unknown"));
}
{
  const r = extract({ grid: { pages: [{ text: "STATEMENT OF HOLDINGS" }] }, meta: {} });
  ok("archived page text alone publishes nothing — the archived reading stands", r.status === "failed" && r.holdings.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
