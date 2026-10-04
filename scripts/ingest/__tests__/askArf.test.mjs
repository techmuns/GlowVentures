// The ASK ABSOLUTE RETURN FUND reader, and the checks that license it.
// Run: node scripts/ingest/__tests__/askArf.test.mjs
//
// ASK's AIF statement of account carries an Account Summary and a dated
// Transaction Summary, and both folios the September 2026 delivery brings are
// REDEEMED TO NIL. The reader publishes each table ONLY where the statement's
// own arithmetic ties it, and what it publishes is what FIFO strikes the
// family's realised gain on (Stage 10ca) — so a row it misread, or a row it
// walked past, would print a gain that looks ordinary and is wrong.
//
// Every mutation below is the committed statement's own text, rebuilt exactly
// as `extract()` joins it, with ONE figure or ONE line changed. A suite that
// only asserted the real statement is published would prove the patterns
// match; breaking the statement one figure at a time and watching the reader
// refuse — with the failure that names that figure — is what proves each check
// can fail.
//
// The statements print holder names, PANs, an address, a bank account and a
// mobile number. Nothing here prints the text: a failure line carries figures,
// dates and docKeys only, and `safe()` masks anything shaped like a PAN, an
// email or a long number in case a reader's own message ever quotes one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  askArfClassName, askArfParse, askArfSummaryFails, askArfHoldingRows, askArfFlows, extract,
} from "../providers/altFundStatements.mjs";
import { fifoFromCashFlows } from "../../../shared/fifo.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");
let pass = 0, fail = 0;
const safe = (s) => String(s)
  .replace(/[A-Z]{5}[0-9]{4}[A-Z]/g, "<PAN>")
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<EMAIL>")
  .replace(/\d{10,}/g, "<NUMBER>");
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${safe(detail)}` : ""}`); }
};
console.log("askArf");

const pagesOf = (docKey) => (JSON.parse(fs.readFileSync(path.join(AUDIT, docKey, "pages.json"), "utf8")).pages ?? [])
  .map((p) => ({ text: p.text ?? "" }));
/** The text the reader parses, joined and collapsed exactly as `extract()` does. */
const textOf = (docKey) => pagesOf(docKey).map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
const docOf = (docKey) => JSON.parse(fs.readFileSync(path.join(AUDIT, docKey, "document.json"), "utf8"));

/** ONE edit, at an anchor that occurs exactly `times` times — never a guess about which. */
const mutate = (text, from, to, times = 1) => {
  const n = text.split(from).length - 1;
  if (n !== times) throw new Error(`the fixture carries ${n} occurrence(s) of an anchor this case expects ${times} of: ${safe(from.slice(0, 60))}`);
  return text.split(from).join(to);
};
const flowsOf = (text) => {
  const warns = [];
  const rows = askArfFlows(text, (code, detail) => warns.push({ code, detail }));
  return { rows, warns, codes: warns.map((w) => w.code) };
};
const holdingsOf = (text) => {
  const warns = [];
  const rows = askArfHoldingRows(text, (code, detail) => warns.push({ code, detail }));
  return { rows, warns, codes: warns.map((w) => w.code) };
};
const summaryFails = (text) => askArfSummaryFails(askArfParse(text));
const NOT_PUBLISHED = "the Transaction Summary is not published for this folio: ";
/** The individual failures a `dated-table-does-not-tie` warning names. */
const failsOf = (r) => {
  const w = r.warns.find((x) => x.code === "dated-table-does-not-tie");
  return w && w.detail.startsWith(NOT_PUBLISHED) ? w.detail.slice(NOT_PUBLISHED.length).split("; ") : [];
};
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
const near = (a, b, tol = 0.005) => typeof a === "number" && Math.abs(a - b) <= tol;

const K_AJAY = "ask-absolute-return-fund-9039917111-2026-03-31-holdings";
const K_AJAY_TWIN = "ask-absolute-return-fund-9039917111-2026-03-31-holdings-2";
const K_ANKITA = "ask-absolute-return-fund-9039917144-2026-03-31-holdings";
const SERIES = askArfClassName("A6", "31/01/2025");

// What each statement PRINTS, written out here by hand from the PDF rather than
// read back through the reader — so a reader that misread a figure cannot
// agree with itself. Figures only; no holder detail.
const PRINTED = {
  [K_AJAY]: {
    contribution: { units: 199990.001, invested: 199990000.5, stamp: 9999.5 },
    redemptions: [{ date: "2026-03-31", gross: 213262637.4, tax: 5223498.84, net: 208039138.56, units: 199990.001 }],
    realised: 8039138.56, costSold: 200000000,
  },
  [K_ANKITA]: {
    contribution: { units: 187990.6, invested: 187990600.47, stamp: 9399.53 },
    redemptions: [
      { date: "2025-09-30", gross: 101494665.47, tax: 1494665.47, net: 100000000, units: 97715.461 },
      { date: "2026-03-31", gross: 96266384.01, tax: 2357878.3, net: 93908505.71, units: 90275.139 },
    ],
    realised: 5908505.71, costSold: 188000000,
  },
};

// The book's own figures, read off the GENERATED file as text: the realised
// gain FIFO struck for each folio, and the accounts whose capital record is
// shown to begin at inception. A drop that moves either moves this suite.
const glow = fs.readFileSync(path.join(ROOT, "src", "data", "glowData.ts"), "utf8");
const exportBlock = (name) => {
  const at = glow.indexOf(`export const ${name}`);
  if (at < 0) return "";
  const next = glow.indexOf("\nexport const ", at + 1);
  return glow.slice(at, next < 0 ? undefined : next);
};
const bookPosition = (accountId, securityKey) => {
  const block = exportBlock("BOOK_POSITIONS");
  const objects = block.split(/\n  \{\n/).slice(1);
  const hit = objects.find((o) => o.includes(`"accountId": "${accountId}"`) && o.includes(`"securityKey": "${securityKey}"`));
  if (!hit) return null;
  const num = (k) => { const m = new RegExp(`"${k}": (-?[\\d.]+|null)`).exec(hit); return m ? (m[1] === "null" ? null : Number(m[1])) : undefined; };
  return { quantity: num("quantity"), realizedPnL: num("realizedPnL"), costOfUnitsSold: num("costOfUnitsSold"), currentPrice: num("currentPrice") };
};
const fromInception = (() => {
  const m = /export const BOOK_CAPITAL_FROM_INCEPTION: string\[\] = (\[[\s\S]*?\]);/.exec(glow);
  return m ? JSON.parse(m[1]) : null;
})();

// ── 1. THE ARCHIVE'S OWN STATEMENTS ARE PUBLISHED, AND SAY WHAT THEY PRINT ───
ok("the two files of folio 9039917111 carry the same statement text — one statement delivered twice",
  textOf(K_AJAY) === textOf(K_AJAY_TWIN));

for (const key of [K_AJAY, K_ANKITA]) {
  const T = textOf(key);
  const want = PRINTED[key];
  const tag = key.replace("ask-absolute-return-fund-", "").replace("-2026-03-31-holdings", "");
  const P = askArfParse(T);

  // The Account Summary: one series, redeemed to nil, three NAVs printed.
  const s = P.series[0] ?? {};
  ok(`${tag}: the Account Summary prints one series, Class A6 Series 31/01/2025 INF0V6R22JL5, NAV date 31 Mar 2026`,
    P.series.length === 1 && s.cls === "A6" && s.series === "31/01/2025" && s.isin === "INF0V6R22JL5"
    && s.navDate === "2026-03-31", JSON.stringify(P.series.map((x) => [x.cls, x.series, x.isin, x.navDate])));
  ok(`${tag}: its unit balance is a dash and every valuation 0.00 — redeemed to nil`,
    s.unitsPrinted === "-" && s.units === null && s.grossValue === 0 && s.valueNetFee === 0 && s.valueNetFeeTax === 0);
  ok(`${tag}: the three NAVs are read in their printed columns`,
    s.grossNav === 1087.4566 && s.navNetFee === 1066.3665 && s.navNetFeeTax === 1040.2477,
    JSON.stringify([s.grossNav, s.navNetFee, s.navNetFeeTax]));
  ok(`${tag}: the Total row prints a dash and three nil valuations`,
    P.total?.unitsPrinted === "-" && P.total?.units === null
    && P.total?.grossValue === 0 && P.total?.valueNetFee === 0 && P.total?.valueNetFeeTax === 0);
  ok(`${tag}: the Account Summary ties`, summaryFails(T).length === 0, JSON.stringify(summaryFails(T)));
  const H = holdingsOf(T);
  ok(`${tag}: the holding is published, and no warning is raised`, H.rows.length === 1 && H.warns.length === 0,
    `${H.rows.length} row(s) ${JSON.stringify(H.codes)}`);

  // The Transaction Summary: every dated line a declared row, nothing walked past.
  const L = P.ledger;
  ok(`${tag}: every dated line of the Transaction Summary is a declared row, and no line is left unread`,
    L && L.undeclared.length === 0 && L.unread.length === 0 && L.rows.length === 2 + 3 * want.redemptions.length,
    L ? `${L.rows.length} rows, ${L.undeclared.length} undeclared, ${L.unread.length} unread` : "no ledger");
  const tax = (L?.rows ?? []).filter((r) => r.type === "tax");
  const net = (L?.rows ?? []).filter((r) => r.type === "net");
  ok(`${tag}: a label wrapped above and below its row is read whole — the tax and the net rows`,
    tax.length === want.redemptions.length && net.length === want.redemptions.length
    && tax.every((r) => r.description === "Tax on Return of Capital Contribution Tax on Redemption")
    && net.every((r) => r.description === "Net Return on Capital Contribution"),
    JSON.stringify([...tax, ...net].map((r) => r.description)));

  // The dated record, as the book reads it.
  const F = flowsOf(T);
  ok(`${tag}: the dated record is published, and no warning is raised`,
    F.rows.length === 1 + want.redemptions.length && F.warns.length === 0,
    `${F.rows.length} row(s) ${JSON.stringify(F.codes)}`);
  const c = F.rows.find((r) => r.kind === "contribution");
  ok(`${tag}: the contribution is every rupee paid — the invested amount and the stamp duty, two printed rows`,
    c && near(c.amount, want.contribution.invested + want.contribution.stamp)
    && c.netAmount === want.contribution.invested && c.expenses === want.contribution.stamp,
    JSON.stringify(c && [c.amount, c.netAmount, c.expenses]));
  ok(`${tag}: …with the units it allotted`, c && c.units === want.contribution.units, JSON.stringify(c?.units));
  const outs = F.rows.filter((r) => r.kind === "withdrawal");
  ok(`${tag}: each redemption is one withdrawal of the cash paid out — the printed net, out of the folio`,
    outs.length === want.redemptions.length && want.redemptions.every((w, i) => outs[i]
      && outs[i].date === w.date && outs[i].amount === -w.net && near(outs[i].units, -w.units, 0.0005)),
    JSON.stringify(outs.map((o) => [o.date, o.amount, o.units])));
  ok(`${tag}: …and every printed redemption is gross less tax, to the paisa`,
    want.redemptions.every((w) => near(w.gross - w.tax, w.net)));
  ok(`${tag}: the units the table allots and redeems net to the Account Summary's nil`,
    near(F.rows.reduce((a, r) => a + (r.units ?? 0), 0), 0, 0.0005));
  ok(`${tag}: every row names the same series the holding does, and the day it was issued`,
    F.rows.every((r) => r.security === SERIES && r.isin === "INF0V6R22JL5" && r.seriesIssued === "2025-01-31"));
  ok(`${tag}: the record is in date order, a contribution ahead of anything on its date`,
    F.rows.every((r, i) => i === 0 || F.rows[i - 1].date <= r.date));

  // The whole document, through `extract()` — and against what the archive holds.
  const ex = extract({ grid: { pages: pagesOf(key) } });
  const doc = docOf(key);
  ok(`${tag}: the document is ok, with only the two warnings that describe the statement`,
    ex?.status === "ok" && sameSet((ex?.warnings ?? []).map((w) => w.code), ["statement-basis", "redeemed-to-nil"]),
    `${ex?.status} ${JSON.stringify((ex?.warnings ?? []).map((w) => w.code))}`);
  const h = ex?.holdings?.[0];
  // The reader hands over PRIMITIVES — nil units and the NAV net of fee — and
  // the statement's own nil valuation as a CHECK (rule 4); the value is derived
  // later, and on the archive it is a MEASURED zero, never a null.
  ok(`${tag}: the holding is nil units at the NAV net of fee, with the printed nil valuation as a check`,
    ex?.holdings?.length === 1 && h.quantity === 0 && h.marketPrice === 1066.3665
      && h.marketValue === null && h.printed?.marketValue === 0,
    JSON.stringify(h && [h.quantity, h.marketPrice, h.marketValue, h.printed?.marketValue]));
  ok(`${tag}: …and the archive derives a MEASURED zero from them — never a null`,
    (doc.holdings ?? []).length === 1 && doc.holdings[0].quantity === 0
      && doc.holdings[0].marketValue === 0 && doc.holdings[0].marketValueFromPrinted === false,
    JSON.stringify(doc.holdings?.[0] && [doc.holdings[0].quantity, doc.holdings[0].marketValue]));
  ok(`${tag}: the holding and every dated row land on one securityKey`,
    h && (ex.cashFlows ?? []).length > 0 && ex.cashFlows.every((r) => r.securityKey === h.securityKey));
  ok(`${tag}: the archive holds exactly the dated record the reader writes now`,
    JSON.stringify(ex?.cashFlows ?? null) === JSON.stringify(doc.cashFlows ?? null));
  ok(`${tag}: …and the holding it writes now`,
    (doc.holdings ?? []).length === 1 && doc.holdings[0].securityKey === h?.securityKey
    && doc.holdings[0].quantity === h?.quantity && doc.holdings[0].marketPrice === h?.marketPrice);
  ok(`${tag}: both printed tables are archived, because both tie`,
    ex?.sections && "account-summary" in ex.sections && "transaction-summary" in ex.sections);
  ok(`${tag}: the joint holder is read where the statement prints one, and none where it prints NA`,
    (ex?.jointHolders ?? []).length === (doc.jointHolders ?? []).length
    && (key === K_AJAY ? ex.jointHolders.length === 1 : ex.jointHolders.length === 0),
    `${(ex?.jointHolders ?? []).length} read, ${(doc.jointHolders ?? []).length} archived`);

  // What the family made, struck by FIFO over the published record.
  const run = fifoFromCashFlows(ex?.cashFlows ?? []);
  const realised = (run?.ledger?.realised ?? []).reduce((a, r) => a + r.gain, 0);
  const costSold = (run?.ledger?.realised ?? []).reduce((a, r) => a + r.cost, 0);
  ok(`${tag}: FIFO matches every unit redeemed against the contribution, and none is left`,
    run?.ledger && run.ledger.shortfalls.length === 0 && run.ledger.lots.length === 0,
    run?.reason ?? JSON.stringify({ lots: run?.ledger?.lots?.length, shortfalls: run?.ledger?.shortfalls?.length }));
  ok(`${tag}: the realised gain is what was paid out less every rupee paid in`,
    near(realised, want.realised) && near(costSold, want.costSold)
    && near(want.redemptions.reduce((a, w) => a + w.net, 0) - (want.contribution.invested + want.contribution.stamp), want.realised),
    `realised ${realised} cost ${costSold}`);
  const accountId = `ask-absolute-return-fund-${tag}`;
  const pos = bookPosition(accountId, h?.securityKey ?? "");
  ok(`${tag}: the book carries that realised gain and that cost of units sold`,
    pos && pos.quantity === 0 && near(pos.realizedPnL, want.realised) && near(pos.costOfUnitsSold, want.costSold),
    JSON.stringify(pos));
  ok(`${tag}: the book lists the account's capital record as beginning at inception — its first allotment is on the series' issue day`,
    Array.isArray(fromInception) && fromInception.includes(accountId) && c?.date === c?.seriesIssued);
}

// ── 2. THE ACCOUNT SUMMARY TIES OR IT IS NOT PUBLISHED ───────────────────────
{
  const T = textOf(K_AJAY);
  const ROW = "31 Mar 2026 - 1,087.4566 0.00 1,066.3665 0.00 1,040.2477 0.00";
  const TOTAL = "Total - 0.00 0.00 0.00";

  // A row whose columns are not the declared order is not read at all — and the
  // dated record, whose series the summary no longer prints, is withheld too.
  const m1 = mutate(T, ROW, "31 Mar 2026 1,087.4566 0.00 1,066.3665 0.00 1,040.2477 0.00");
  const h1 = holdingsOf(m1);
  ok("summary: a row out of the declared column order is not read, and the holding is withheld",
    sameSet(summaryFails(m1), ["no Account Summary row matched the declared column order"])
    && h1.rows.length === 0 && sameSet(h1.codes, ["summary-does-not-tie"]), JSON.stringify(summaryFails(m1)));
  const f1 = flowsOf(m1);
  ok("summary: …and no dated row is published against a series the summary does not print",
    f1.rows.length === 0 && failsOf(f1).length === 5
    && failsOf(f1).every((x) => x.endsWith("is not a series the Account Summary prints")), JSON.stringify(failsOf(f1)));

  // A dash is nil only beside valuations of nil.
  const m2 = mutate(T, "1,087.4566 0.00 1,066.3665", "1,087.4566 100.00 1,066.3665");
  ok("summary: a dash beside a valuation that is not nil refuses the summary",
    sameSet(summaryFails(m2), [
      "Class A6 Series 31/01/2025: the unit balance prints a dash beside a valuation that is not nil",
      "the Total row's gross valuation 0 is not the rows' 100",
    ]), JSON.stringify(summaryFails(m2)));
  const f2 = flowsOf(m2);
  ok("summary: …and withholds the dated record, which has no printed balance left to reach",
    f2.rows.length === 0 && sameSet(failsOf(f2), [
      "Class A6 Series 31/01/2025: the Account Summary prints a dash beside a valuation that is not nil, so the balance the table's units must reach is not printed",
    ]), JSON.stringify(failsOf(f2)));

  // Units beside nil valuations: each valuation is its units at its NAV.
  const m3 = mutate(T, "31 Mar 2026 - 1,087.4566", "31 Mar 2026 10.000 1,087.4566");
  ok("summary: units printed beside nil valuations fail all three NAVs and the Total row",
    sameSet(summaryFails(m3), [
      "Class A6 Series 31/01/2025: 10 unit(s) at the gross NAV 1087.4566 is not the printed 0",
      "Class A6 Series 31/01/2025: 10 unit(s) at the net of fee NAV 1066.3665 is not the printed 0",
      "Class A6 Series 31/01/2025: 10 unit(s) at the net of fee & tax NAV 1040.2477 is not the printed 0",
      "the Total row prints - unit(s) against 10 across the rows",
    ]), JSON.stringify(summaryFails(m3)));
  ok("summary: …and the dated record, whose units run to nil, no longer reaches the printed balance",
    sameSet(failsOf(flowsOf(m3)), ["Class A6 Series 31/01/2025: the table's units run to 0 against the Account Summary's 10.000"]),
    JSON.stringify(failsOf(flowsOf(m3))));

  // The Total row is the rows added up, and it must be printed.
  const m4 = mutate(T, `${TOTAL}\n`, "");
  ok("summary: with no Total row the summary is not published",
    sameSet(summaryFails(m4), ["the Account Summary prints no Total row to tie its rows to"])
    && holdingsOf(m4).rows.length === 0);
  ok("summary: …while the dated record, which ties on its own figures, still is — each table stands on its own checks",
    flowsOf(m4).rows.length === 2 && flowsOf(m4).warns.length === 0);
  ok("summary: a Total valuation that is not its rows refuses the summary",
    sameSet(summaryFails(mutate(T, TOTAL, "Total - 0.00 7.00 0.00")), ["the Total row's valuation net of fee 7 is not the rows' 0"]),
    JSON.stringify(summaryFails(mutate(T, TOTAL, "Total - 0.00 7.00 0.00"))));
  ok("summary: a Total unit count that is not its rows refuses the summary",
    sameSet(summaryFails(mutate(T, TOTAL, "Total 5.000 0.00 0.00 0.00")), ["the Total row prints 5.000 unit(s) against 0 across the rows"]),
    JSON.stringify(summaryFails(mutate(T, TOTAL, "Total 5.000 0.00 0.00 0.00"))));
}

// ── 3. THE TRANSACTION SUMMARY TIES OR IT IS NOT PUBLISHED ──────────────────
{
  const T = textOf(K_AJAY);
  const STAMP = "Stamp Duty - (9,999.50)";
  const PREFIX = "ASK ARF - Class A6 Series 31/01/2025 INF0V6R22JL5";
  const withheld = (r, code) => r.rows.length === 0 && r.codes.length === 1 && r.codes[0] === code;

  // A row this reader does not declare, or cannot read, withholds the table.
  const u1 = flowsOf(mutate(T, STAMP, "Stamp Duty Refund - (9,999.50)"));
  ok("table: a row type the reader does not declare withholds the record, and names the row",
    withheld(u1, "transaction-type-not-declared") && u1.warns[0].detail.includes("(31/01/2025 Stamp Duty Refund)"),
    JSON.stringify(u1.warns));
  const u2 = flowsOf(mutate(T, STAMP, "Stamp Duty -"));
  ok("table: a dated line whose figures are not in the declared columns withholds the record",
    withheld(u2, "transaction-type-not-declared") && u2.warns[0].detail.includes("(31/01/2025)"), JSON.stringify(u2.warns));
  const u3 = flowsOf(mutate(T, `${STAMP}\n`, `${STAMP}\nAdjustment as advised\n`));
  ok("table: a line inside the table that no row claims withholds the record",
    withheld(u3, "transaction-line-not-read") && u3.warns[0].detail.startsWith("1 line(s)"), JSON.stringify(u3.warns));

  // Each redemption: gross less tax is the net, to the paisa.
  const g1 = flowsOf(mutate(T, "(20,80,39,138.56)", "(20,80,39,138.66)"));
  ok("table: a net that is not gross less tax withholds the record, naming the three figures",
    withheld(g1, "dated-table-does-not-tie") && sameSet(failsOf(g1), [
      "2026-03-31 Class A6 Series 31/01/2025: Return of Capital Contribution 213262637.4 less tax 5223498.84 is 208039138.56, against a printed net 208039138.66",
    ]), JSON.stringify(failsOf(g1)));
  const g2 = flowsOf(mutate(T, "- (52,23,498.84)", "- (52,23,498.84)").replace(
    `Tax on Return of Capital\n31/03/2026 ${PREFIX} - (52,23,498.84)\nContribution Tax on Redemption\n`, () => ""));
  ok("table: a redemption with no tax row is gross against net, and fails",
    withheld(g2, "dated-table-does-not-tie") && sameSet(failsOf(g2), [
      "2026-03-31 Class A6 Series 31/01/2025: Return of Capital Contribution 213262637.4 less tax 0 is 213262637.4, against a printed net 208039138.56",
    ]), JSON.stringify(failsOf(g2)));

  // On the Account Summary's own NAV date the gross and the net are the redeemed
  // units at the two NAVs. Gross and tax moved together still net — only the
  // NAV check can see it.
  const n1 = flowsOf(mutate(mutate(T, "(21,32,62,637.40)", "(21,32,72,637.40)"), "(52,23,498.84)", "(52,33,498.84)"));
  ok("table: a gross that is not the redeemed units at the NAV net of fee fails, even where gross less tax is the net",
    withheld(n1, "dated-table-does-not-tie") && sameSet(failsOf(n1), [
      "2026-03-31 Class A6 Series 31/01/2025: 199990.001 unit(s) at the Account Summary's NAV 1066.3665 is not the printed gross 213272637.4",
    ]), JSON.stringify(failsOf(n1)));
  const n2 = flowsOf(mutate(T, "1,99,990.001", "1,99,991.001", 2));
  ok("table: units moved on both sides still net to nil — and fail at both NAVs",
    withheld(n2, "dated-table-does-not-tie") && sameSet(failsOf(n2), [
      "2026-03-31 Class A6 Series 31/01/2025: 199991.001 unit(s) at the Account Summary's NAV 1066.3665 is not the printed gross 213262637.4",
      "2026-03-31 Class A6 Series 31/01/2025: 199991.001 unit(s) at the Account Summary's NAV 1040.2477 is not the printed net 208039138.56",
    ]), JSON.stringify(failsOf(n2)));

  // The units the table allots and redeems reach the printed balance.
  const r1 = flowsOf(mutate(T, "Capital Contribution 1,99,990.001", "Capital Contribution 1,99,990.011"));
  ok("table: units that do not run to the Account Summary's nil withhold the record",
    withheld(r1, "dated-table-does-not-tie") && sameSet(failsOf(r1), [
      "Class A6 Series 31/01/2025: the table's units run to 0.01 against the Account Summary's -",
    ]), JSON.stringify(failsOf(r1)));
  const net = `Net Return on Capital\n31/03/2026 ${PREFIX} 1,99,990.001 (20,80,39,138.56)\nContribution\n`;
  const r2 = flowsOf(mutate(T, net, ""));
  ok("table: a redemption that prints no Net Return fails twice — the pair, and the units",
    withheld(r2, "dated-table-does-not-tie") && sameSet(failsOf(r2), [
      "2026-03-31 Class A6 Series 31/01/2025: a redemption that does not print both its Return of Capital Contribution and its Net Return",
      "Class A6 Series 31/01/2025: the table's units run to 199990.001 against the Account Summary's -",
    ]), JSON.stringify(failsOf(r2)));

  // Each row type carries what its type carries, on the right side of nil.
  const s1 = flowsOf(mutate(T, "Capital Contribution 1,99,990.001 19,99,90,000.50", "Capital Contribution 1,99,990.001 (19,99,90,000.50)"));
  ok("table: a contribution printed as money out is on the wrong side of nil",
    withheld(s1, "dated-table-does-not-tie") && sameSet(failsOf(s1), [
      "2025-01-31 Capital Contribution: prints -199990000.5, the wrong side of nil for the type",
    ]), JSON.stringify(failsOf(s1)));
  const s2 = flowsOf(mutate(T, STAMP, "Stamp Duty 5.000 (9,999.50)"));
  ok("table: a Stamp Duty row that prints units fails",
    withheld(s2, "dated-table-does-not-tie") && sameSet(failsOf(s2), [
      "2025-01-31 Stamp Duty: prints 5.000 unit(s) where the type carries none",
    ]), JSON.stringify(failsOf(s2)));
  const s3 = flowsOf(mutate(T, "Capital Contribution 1,99,990.001", "Capital Contribution -"));
  ok("table: a contribution that prints no units fails — the row, and the run",
    withheld(s3, "dated-table-does-not-tie") && sameSet(failsOf(s3), [
      "2025-01-31 Capital Contribution: prints no unit count",
      "Class A6 Series 31/01/2025: the table's units run to -199990.001 against the Account Summary's -",
    ]), JSON.stringify(failsOf(s3)));
  const s4 = flowsOf(mutate(T, "INF0V6R22JL5 Stamp Duty", "INF0V6R22JL6 Stamp Duty"));
  ok("table: a row on a series the Account Summary does not print fails — and leaves its charge with no contribution",
    withheld(s4, "dated-table-does-not-tie") && sameSet(failsOf(s4), [
      "2025-01-31 Stamp Duty: Class A6 Series 31/01/2025 INF0V6R22JL6 is not a series the Account Summary prints",
      "2025-01-31 Class A6 Series 31/01/2025: Stamp Duty with no Capital Contribution beside it",
    ]), JSON.stringify(failsOf(s4)));
  const stampLine = `31/01/2025 ${PREFIX} ${STAMP}\n`;
  const s5 = flowsOf(mutate(T, stampLine, stampLine + stampLine));
  ok("table: a row type printed twice on one date fails — which charge is whose is not printed",
    withheld(s5, "dated-table-does-not-tie") && sameSet(failsOf(s5), [
      "2025-01-31 Class A6 Series 31/01/2025: a row type is printed twice on one date, so which charge belongs to which row is not printed",
    ]), JSON.stringify(failsOf(s5)));

  // A contribution with no Stamp Duty row is published as printed.
  const c1 = flowsOf(mutate(T, stampLine, ""));
  const c1c = c1.rows.find((r) => r.kind === "contribution");
  ok("table: a contribution with no Stamp Duty row is published as printed, its charge null and not zero",
    c1.warns.length === 0 && c1c && c1c.amount === 199990000.5 && c1c.netAmount === 199990000.5 && c1c.expenses === null
    && /no Stamp Duty row is printed/.test(c1c.notes ?? ""), JSON.stringify(c1c && [c1c.amount, c1c.netAmount, c1c.expenses]));

  // A printed table with no row, and a statement with no table.
  const head = T.slice(0, T.indexOf(`31/01/2025 ${PREFIX}`));
  const notes = T.slice(T.search(/^1\. This is a Statement/m));
  const e1 = flowsOf(head + notes);
  ok("table: a Transaction Summary with no row read is not a record of nothing — it is withheld and says so",
    withheld(e1, "dated-table-does-not-tie") && /no row of it was read/.test(e1.warns[0].detail), JSON.stringify(e1.warns));
  const noTable = T.slice(0, T.search(/^Transaction Summary\s*$/m)) + notes;
  const e2 = flowsOf(noTable);
  ok("table: a statement that prints no Transaction Summary publishes no dated record and raises nothing",
    e2.rows.length === 0 && e2.warns.length === 0 && holdingsOf(noTable).rows.length === 1);
}

// ── 4. A TABLE THAT RUNS ONTO A SECOND PAGE ──────────────────────────────────
{
  // Ankita's table breaks across two pages: the footer every page carries — the
  // manager's name, its office, its phone — lands INSIDE the table, and the
  // running title opens the second page. The footer is furniture only because
  // the same lines are printed again after the notes have ended.
  const T = textOf(K_ANKITA);
  const F = flowsOf(T);
  ok("page break: the table is read whole across it, both redemptions included", F.rows.length === 3 && F.warns.length === 0);
  const inTable = "(23,57,878.30)\nContribution Tax on Redemption\nASK Long-Short Fund Managers Private Limited\n";
  const p1 = flowsOf(mutate(T, inTable, "(23,57,878.30)\nContribution Tax on Redemption\nASK Long-Short Fund Managers Pvt Limited\n"));
  ok("page break: a line inside the table that is NOT printed again after the notes is not furniture — the record is withheld",
    p1.rows.length === 0 && p1.codes.length === 1 && p1.codes[0] === "transaction-line-not-read", JSON.stringify(p1.codes));

  // The first redemption dropped: what is left no longer reaches nil.
  const PREFIX = "ASK ARF - Class A6 Series 31/01/2025 INF0V6R22JL5";
  const first = [
    `30/09/2025 ${PREFIX} Return of Capital Contribution - (10,14,94,665.47)`,
    "Tax on Return of Capital",
    `30/09/2025 ${PREFIX} - (14,94,665.47)`,
    "Contribution Tax on Redemption",
    "Net Return on Capital",
    `30/09/2025 ${PREFIX} 97,715.461 (10,00,00,000.00)`,
    "Contribution",
    "",
  ].join("\n");
  const p2 = flowsOf(mutate(T, first, ""));
  ok("page break: a redemption dropped from the table leaves units the Account Summary does not hold, and is withheld",
    p2.rows.length === 0 && sameSet(failsOf(p2), [
      "Class A6 Series 31/01/2025: the table's units run to 97715.461 against the Account Summary's -",
    ]), JSON.stringify(failsOf(p2)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
