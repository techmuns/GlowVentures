// Franklin India Credit AIF – Scheme I (Stage 10hx): the sealed statement is read
// from its archived page text, every printed figure ties to the others, and a
// statement where one does not publishes nothing.
import assert from "node:assert/strict";
import fs from "node:fs";
import { classify } from "../lib/classify.mjs";
import { extract, franklinParse, franklinFails, franklinText } from "../providers/franklinAif.mjs";

const DIR = "public/audit/franklin-india-credit-aif-10387-2026-10-22-holdings";
const pages = JSON.parse(fs.readFileSync(`${DIR}/pages.json`, "utf8")).pages
  .map((p) => ({ page: p.page, text: p.text, rows: [] }));
const raw = pages.map((p) => p.text).join(" ");

const meta = classify({ fileName: "10387.pdf", text: raw });
assert.equal(meta.provider, "Franklin India Credit AIF", "the fund's name, not the investor's bank");
assert.equal(meta.accountNo, "10387");

const text = franklinText(pages);
assert.ok(!/Ɵ/.test(text), "the issuer's `ti` ligature is spelled out");
const p = franklinParse(text);
assert.deepEqual(franklinFails(p), []);
assert.equal(p.unitClass, "DB2");
assert.equal(p.isin, "INF1CLO22066");
assert.equal(p.category, "II");
assert.equal(p.balanceUnits, 201254.604);
assert.equal(p.nav, 993.7164);
assert.equal(p.navDate, "2026-10-21");
assert.equal(p.closingDate, "2026-10-22");
assert.equal(p.ledger.length, 3);

const d = extract({ grid: { pages }, meta: { docKey: "k" } });
assert.equal(d.status, "ok");
assert.equal(d.reportType, "holdings");
assert.equal(d.asOf, "2026-10-22", "the closing balance's date; the NAV's own date rides on the holding");
assert.equal(d.owner, "Ajay Jaisinghani");
assert.match(d.providerEngagement, /Category II .*IN\/AIF2\/24-25\/1592/);
const [h] = d.holdings;
assert.equal(h.quantity, 201254.604);
assert.equal(h.totalCost, 199990000.5, "the statement's own cost is the net that bought units");
assert.equal(h.priceAsOn, "2026-10-21");
assert.deepEqual(d.cashFlows.map((c) => [c.kind, c.amount, c.units]),
  [["contribution", 200000000, null], ["expense", 9999.5, null], ["contribution", 199990000.5, 201254.604]],
  "Sanshi's three-row shape: gross, charge, allotment");
assert.equal(d.commitment.undrawn, 0, "uncalled 0.00 is a measured nil");

// A figure that does not tie publishes nothing.
const broken = pages.map((pg) => ({ ...pg, text: pg.text.replace("199,990,000.57", "199,990,100.57") }));
const refused = extract({ grid: { pages: broken }, meta: { docKey: "k" } });
assert.equal(refused.status, "failed");
assert.equal(refused.holdings.length, 0);
assert.match(refused.warnings[0].detail, /units × NAV/);
const redeemed = pages.map((pg) => ({ ...pg, text: pg.text.replace("201,254.604 0.000 201,254.604", "201,254.604 1.000 201,253.604") }));
assert.match(franklinFails(franklinParse(franklinText(redeemed))).join("; "), /redemption, repayment or distribution/);

console.log("franklinAif: classified on the fund, every printed figure ties, three-row ledger, and a mismatch publishes nothing");
