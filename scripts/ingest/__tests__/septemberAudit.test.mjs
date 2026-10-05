// September Drive delivery: original-file identities, every dated spreadsheet
// field against its PDF's normalized record, and the book's account controls.
// The spreadsheet column letters below are the inspected export layout, not
// the PDF reader's inferred columns. A moved column or added row must fail.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readSpreadsheet } from "../lib/sheet.mjs";
import { extractLayout } from "../lib/layout.mjs";
import { extract as readPms } from "../providers/pmsStatements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const document = (key) => readJson(`public/audit/${key}/document.json`);
let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) pass++;
  else { fail++; if (fail <= 20) console.log(`  FAIL ${label}`); }
}
const near = (a, b, tolerance = 1e-7) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tolerance;
const sum = (rows, field) => rows.reduce((n, r) => n + (r[field] ?? 0), 0);
const col = (s) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const num = (v) => !v || /^(?:N\.A\.?|NA|-)$/i.test(v.trim()) ? null : Number(v.replaceAll(",", ""));
function date(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(v ?? "");
  return m ? `${m[3].length === 2 ? "20" : ""}${m[3]}-${m[2]}-${m[1]}` : null;
}
const manifest = readJson("docs/september-2026-drive-audit.json");
check("the verified folder contains 27 files", manifest.files.length === 27);
for (const f of manifest.files) {
  const bytes = fs.readFileSync(path.join(ROOT, "source/september-2026", f.name));
  check(`${f.name}: matches the Drive original`, bytes.length === f.size
    && crypto.createHash("sha256").update(bytes).digest("hex") === f.sha256);
}

const reports = [
  { file: "BankBook178CT", type: "bank-book", field: "cashFlows", dates: { B: "date", D: "settlementDate" },
    nums: { K: "buySellAmount", L: "income", N: "expenses", P: "depositWithdrawal", Q: "balance" } },
  { file: "CapitalGain90CT", type: "capital-gain", field: "capitalGains", dates: { E: "saleDate", M: "purchaseDate" },
    nums: { F: "quantity", H: "saleRate", I: "saleAmount", R: "purchaseRate", S: "priceOn31Jan2018", V: "purchaseAmount", Y: "effectiveCost", AC: "daysHeld", AH: "shortTerm", AJ: "longTerm", AM: "effectiveLongTerm" } },
  { file: "DividendStatement_India177CT", type: "dividend-statement", field: "income", dates: { A: "exDate", E: "receivedDate" },
    nums: { N: "quantity", O: "ratePerUnit", S: "receivable", W: "received", AE: "netAmount", AS: "tds" } },
  { file: "TransactionStatement_India94CT", type: "transaction-statement", field: "transactions", dates: { D: "date", F: "settlementDate" },
    nums: { O: "quantity", Q: "unitPrice", V: "brokerageRate", X: "stt", AB: "settlementAmount" } },
];
const controls = {
  "10032723": { owner: "ankita-jaisinghani", counts: [3644, 1101, 278, 1040], tdsTransfers: 195, closing: 0.01, contribution: 46000000, withdrawal: 85383320.61, dividend: 1197629.52, tds: 11152.10 },
  "10034025": { owner: "ajay-jaisinghani", counts: [3523, 1041, 262, 968], tdsTransfers: 232, closing: 0.34, contribution: 85000000, withdrawal: 151211941.19, dividend: 1955242.11, tds: 22052.84 },
};
const bookText = fs.readFileSync(path.join(ROOT, "src/data/glowData.ts"), "utf8");
const book = (name) => JSON.parse(new RegExp(`export const ${name}[^=]*= ([\\s\\S]*?);\\n`).exec(bookText)[1]);
const accounts = book("BOOK_ACCOUNTS");
const positions = book("BOOK_POSITIONS");
const moves = book("BOOK_CAPITAL_MOVES");
const gains = book("BOOK_CAPITAL_GAINS");
for (const [account, want] of Object.entries(controls)) {
  const prefix = `ask-investment-managers-limited-${account}-2026-09-08-`;
  for (const [ri, spec] of reports.entries()) {
    const file = `askimpms_${account}_${spec.file}.xlsx`;
    const workbook = readSpreadsheet(fs.readFileSync(path.join(ROOT, "source/september-2026", file)));
    check(`${file}: readable, exactly one sheet`, !workbook.error && workbook.sheets.length === 1);
    const raw = workbook.sheets[0].rows.filter((r) => date(r[col(Object.keys(spec.dates)[0])]));
    const rows = spec.type === "transaction-statement" ? raw.filter((r) => /^(Buy|Sell|Buyback Shares)$/.test(r[0])) : raw;
    if (spec.type === "transaction-statement") {
      const other = raw.filter((r) => !/^(Buy|Sell|Buyback Shares)$/.test(r[0]));
      check(`${account}: only documented TDS transfers are excluded from trades`, other.length === want.tdsTransfers
        && other.every((r) => /^(Trf to TDS A\/c|TDS Trf to Capital A\/c)$/.test(r[0])));
    }
    const doc = document(prefix + spec.type);
    const archived = doc[spec.field];
    check(`${account} ${spec.type}: owner and full row count`, doc.ownerId === want.owner
      && archived.length === want.counts[ri] && rows.length === archived.length);
    for (const [i, row] of rows.entries()) {
      const got = archived[i];
      for (const [letter, field] of Object.entries(spec.dates)) {
        check(`${account} ${spec.type} row ${i + 1} ${field}`, date(row[col(letter)]) === got?.[field]);
      }
      for (const [letter, field] of Object.entries(spec.nums)) {
        const expected = num(row[col(letter)]);
        const value = field === "settlementAmount" ? got?.printed?.settlementAmount : got?.[field];
        check(`${account} ${spec.type} row ${i + 1} ${field}`, expected === null ? value === null : near(value, expected));
      }
    }
    if (spec.type === "bank-book") {
      let balance = 0;
      for (const [i, r] of archived.entries()) {
        check(`${account}: running bank balance ${i + 1}`, near(balance + r.buySellAmount + r.income - r.expenses + r.depositWithdrawal, r.balance, 0.025));
        balance = r.balance;
      }
      check(`${account}: closing cash`, near(balance, want.closing));
    }
    if (spec.type === "dividend-statement") {
      check(`${account}: gross dividend total`, near(sum(archived, "received"), want.dividend, 0.02));
      check(`${account}: TDS total`, near(sum(archived, "tds"), want.tds, 0.02));
      const bytes = fs.readFileSync(path.join(ROOT, "source/september-2026", file.replace(/xlsx$/, "pdf")));
      const grid = await extractLayout(new Uint8Array(bytes));
      check(`${account}: fresh PDF read`, !grid.error);
      const meta = { provider: doc.provider, accountNo: account, reportType: spec.type, docKey: doc.docKey };
      const fresh = readPms({ grid, meta });
      check(`${account}: every printed TDS including zero survives extraction`, fresh.income.length === rows.length
        && fresh.income.every((r, i) => r.tds === num(rows[i][col("AS")])));
      // Make the formerly lost field nonzero without changing its geometry.
      // This proves the fix reads that column instead of filling blanks with 0.
      const changed = structuredClone(grid);
      const page = changed.pages[4];
      const tdsItem = page.rows.flatMap((r) => r.items ?? []).find((it) => it.text === "0.00" && it.x > page.width * 0.9);
      check(`${account}: mutation locates a printed TDS cell`, !!tdsItem);
      if (tdsItem) {
        tdsItem.text = "7.50";
        const mutated = readPms({ grid: changed, meta });
        check(`${account}: a nonzero TDS value survives the blank Balance column`, near(sum(mutated.income, "tds") - sum(fresh.income, "tds"), 7.5));
      }
      const blank = structuredClone(grid);
      let removed = 0;
      for (const row of blank.pages[4].rows) row.items = (row.items ?? []).filter((it) => {
        if (it.text === "0.00" && it.x > blank.pages[4].width * 0.9) { removed++; return false; }
        return true;
      });
      const absent = readPms({ grid: blank, meta });
      check(`${account}: an actually blank TDS column stays absent`, removed > 0
        && absent.income.length === fresh.income.length
        && absent.income.filter((r) => r.tds === null).length === removed);
    }
  }
  const flows = document(prefix + "profit-and-loss").flows;
  check(`${account}: P&L capital and cash controls`, near(flows.contribution, want.contribution)
    && near(flows.withdrawal, want.withdrawal) && near(flows.corpus, want.closing));
  const id = `ask-investment-managers-limited-${account}`;
  const registered = accounts.find((a) => a.accountId === id);
  check(`${account}: dashboard owner and capital record date`, registered?.ownerId === want.owner
    && registered.capitalRecordTo === "2026-09-08");
  const capital = moves.filter((m) => m.accountId === id);
  check(`${account}: complete contributions and withdrawals reach the dashboard`,
    near(sum(capital.filter((m) => m.direction === "in"), "amount"), want.contribution, 0.01)
    && near(sum(capital.filter((m) => m.direction === "out"), "amount"), want.withdrawal, 0.01));
  const lots = document(prefix + "capital-gain").capitalGains;
  const cg = gains.find((g) => g.accountId === id);
  check(`${account}: realised gains reach the correct owner's account once`, cg?.ownerId === want.owner
    && cg.lots === lots.length && near(cg.realisedST, sum(lots, "shortTerm"), 0.01)
    && near(cg.realisedLT, sum(lots, "effectiveLongTerm"), 0.01));
}

for (const [account, owner, value, cost] of [
  ["103472", "ankita-jaisinghani", 282663341.57, 248500000],
  ["103473", "ajay-jaisinghani", 503276370.81, 460058861.66],
]) {
  const id = `buoyant-capital-${account}`;
  const a = accounts.find((a) => a.accountId === id);
  const rows = positions.filter((p) => p.accountId === id);
  check(`${account}: latest Buoyant valuation and original carried cost reach the book`,
    a?.ownerId === owner && a.asOf === "2026-08-31" && rows.length === 1
    && near(rows[0].marketValue, value) && near(rows[0].costBasis, cost));
}
for (const [account, owner, realised, returned, count] of [
  ["9039917111", "ajay-jaisinghani", 8039138.56, 208039138.56, 2],
  ["9039917144", "ankita-jaisinghani", 5908505.71, 193908505.71, 3],
]) {
  const id = `ask-absolute-return-fund-${account}`;
  const a = accounts.find((a) => a.accountId === id);
  const rows = positions.filter((p) => p.accountId === id);
  const capital = moves.filter((m) => m.accountId === id);
  check(`${account}: redeemed AIF and proceeds counted once despite duplicate delivery`,
    a?.ownerId === owner && rows.length === 1 && rows[0].quantity === 0 && rows[0].marketValue === 0
    && near(rows[0].realizedPnL, realised) && capital.length === count
    && near(sum(capital.filter((m) => m.direction === "out"), "amount"), returned, 0.01));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
