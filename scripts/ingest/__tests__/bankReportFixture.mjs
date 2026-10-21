// FOUR SYNTHETIC BANK STATEMENTS, FOR RENDERING THE BOOK REPORT'S BANK SECTION.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `build-book`'s bank section is a BRANCH NO ARCHIVED DOCUMENT REACHES: the
// family asked for `source/october-2026/` to stay out of this repository, so
// `public/audit/` carries no bank tape and the section is dead code on every
// ordinary run. It was written anyway, and when it was finally RENDERED against
// a synthetic archive four of its claims turned out to be wrong — a rupee
// figure printed to the rupee in a section whose own gate is struck in paise, a
// Checks cell silent about the one thing a reader acts on, a refused statement
// identified as "—", and camelCase field names in a sentence. Not one of them
// was found by reading it.
//
// So the section is rendered on every `test:ingest` run, by `bankReport.test.mjs`
// over this fixture. Reading a branch is not checking it.
//
// ── AND NOTHING HERE IS A FAMILY FIGURE ─────────────────────────────────────
//
// Every account number, holder, narration, reference and amount below is
// INVENTED. What is taken from the real statements is their GEOMETRY — which x
// each column's label and data sit at — because the geometry is what the reader
// meets, and the same reasoning `bankStatement.test.mjs` states at length.
//
// The four are chosen for the branches they reach, and each is one the report
// could not otherwise exercise:
//
//   1. HDFC, account …0001, Q1   prints an opening, both totals and both counts
//   2. HDFC, account …0001, Q2   the SAME account again, so the closing-balance
//                                total has something to deduplicate
//   3. ICICI, account …0000      prints no opening, no totals and no counts, so
//                                five checks are NOT APPLICABLE and the opening
//                                is DERIVED — the one that makes row 1 unwitnessed
//   4. HDFC, account …0002       FAILS its own gate (the printed closing is not
//                                the last row's balance), so the reader publishes
//                                NOTHING — the refused branch
//   5. HDFC, account …0003, Q1   published, and
//   6. HDFC, account …0003, Q2   REFUSED and NEWER than it, so the account's latest
//                                RECONCILED balance is not its newest statement —
//                                which the closing-balance total must not claim
import fs from "node:fs";
import path from "node:path";

const it = (x, width, text) => ({ x, width, height: 7, text });
const row = (y, ...items) => ({ y, items: items.map((i) => ({ ...i, y })) });
const RIGHT = { withdrawal: 470.2, deposit: 548.2, balance: 626.7 };
const atRight = (edge, text, perChar = 5.0) => it(edge - text.length * perChar, text.length * perChar, text);

function hdfcRow(y, o) {
  const items = [it(33.7, 28.0, o.date), it(68.0, o.narration.length * 4.2, o.narration)];
  if (o.reference) items.push(it(283.5, o.reference.length * 4.2, o.reference));
  if (o.valueDate) items.push(it(361.5, 38.0, o.valueDate));
  if (o.withdrawal) items.push(atRight(RIGHT.withdrawal, o.withdrawal));
  if (o.deposit) items.push(atRight(RIGHT.deposit, o.deposit));
  items.push(atRight(RIGHT.balance, o.balance));
  return row(y, ...items);
}
const hdfcHeader = (y) => row(y,
  it(39.9, 24.0, "Date"), it(144.2, 44.0, "Narration"), it(283.5, 62.0, "Chq./Ref.No."),
  it(361.5, 40.0, "Value Dt"), it(405.3, 56.0, "Withdrawal Amt."), it(491.1, 46.0, "Deposit Amt."),
  it(564.3, 62.0, "Closing Balance"));

/**
 * @param o.account   the account number the page prints
 * @param o.holder    the holder line
 * @param o.period    "01/04/2026 To : 30/06/2026"
 * @param o.rows      two movement rows, as `hdfcRow` takes them
 * @param o.summary   the printed opening, counts, totals and closing
 */
const hdfc = (o) => ({ pages: [{ rows: [
  row(720.4, it(36.0, 120.0, "HDFC BANK LIMITED")),
  row(696.2, it(36.0, 90.0, "Account Branch : TEST"), it(396.8, 160.0, `Account No : ${o.account}`)),
  row(660.0, it(36.0, 120.0, `ACCOUNT HOLDER : ${o.holder}`)),
  row(620.2, it(36.0, 230.0, `Statement From : ${o.period}`)),
  hdfcHeader(596.0),
  hdfcRow(576.0, o.rows[0]),
  hdfcRow(560.0, o.rows[1]),
  row(300.0, it(40.0, 86.0, "Opening Balance"), it(170.0, 54.0, "Dr Count"), it(250.0, 54.0, "Cr Count"),
    it(340.0, 40.0, "Debits"), it(430.0, 44.0, "Credits"), it(520.0, 62.0, "Closing Bal")),
  row(286.0, it(48.0, 70.0, o.summary.opening), it(182.0, 14.0, o.summary.drCount),
    it(262.0, 14.0, o.summary.crCount), it(336.0, 60.0, o.summary.debits),
    it(426.0, 60.0, o.summary.credits), it(524.0, 60.0, o.summary.closing)),
] }] });

function iciciRow(y, { serial, date, cheque, remarks, withdrawal, deposit, balance }) {
  const items = [it(30.0, 18.0, String(serial)), it(61.4, 50.0, date)];
  if (cheque) items.push(it(142.9, cheque.length * 4.2, cheque));
  items.push(it(192.0, remarks.length * 4.0, remarks));
  if (withdrawal) items.push(atRight(453.0, withdrawal));
  if (deposit) items.push(atRight(519.0, deposit));
  items.push(it(525.9, balance.length * 5.0, balance));
  return row(y, ...items);
}

const icici = () => ({ pages: [{ rows: [
  row(740.0, it(36.0, 120.0, "ICICI Bank Limited")),
  row(716.0, it(36.0, 180.0, "Account Number : 032001510000")),
  row(700.0, it(36.0, 200.0, "Statement From 01.04.2026 To 30.06.2026")),
  row(676.0,
    it(30.0, 30.0, "S No"), it(61.4, 70.0, "Transaction Date"), it(142.9, 46.0, "Cheque"),
    it(192.0, 110.0, "Transaction Remarks"), it(410.0, 60.0, "Withdrawal"),
    it(480.0, 46.0, "Deposit"), it(525.9, 46.0, "Balance")),
  iciciRow(656.0, { serial: 1, date: "01.04.2026", remarks: "NEFT-TESTREF0001-TEST PAYEE ONE",
    withdrawal: "50,000.00", balance: "150,000.00" }),
  iciciRow(640.0, { serial: 2, date: "15.05.2026", cheque: "000123",
    remarks: "RTGS-TESTREF0002-TEST PAYER TWO", deposit: "75,000.25", balance: "225,000.25" }),
  iciciRow(624.0, { serial: 3, date: "20.06.2026", remarks: "UPI/TESTREF0003/TEST PAYEE THREE",
    withdrawal: "25,000.25", balance: "200,000.00" }),
] }] });

/** The six statements, each with the status its own gate must reach. */
export const BANK_FIXTURE = Object.freeze([
  {
    name: "HDFC …0001 Q1",
    docKey: "hdfc-bank-savings-50100000000001-2026-06-30-bank-statement",
    accountNo: "50100000000001", asOf: "2026-06-30",
    sourcePath: "source/synthetic/hdfc-0001-q1.pdf", status: "ok",
    grid: hdfc({
      account: "50100000000001", holder: "TEST HOLDER ONE", period: "01/04/2026 To : 30/06/2026",
      rows: [
        { date: "01/04/26", narration: "NEFT DR-TESTBANK0001-PAY", reference: "N001000001",
          valueDate: "01/04/26", withdrawal: "25,000.00", balance: "75,000.00" },
        { date: "15/04/26", narration: "NEFT CR-TESTBANK0002-RECEIPT", reference: "N002000002",
          valueDate: "15/04/26", deposit: "10,500.50", balance: "85,500.50" },
      ],
      summary: { opening: "100,000.00", drCount: "1", crCount: "1",
        debits: "25,000.00", credits: "10,500.50", closing: "85,500.50" },
    }),
  },
  {
    name: "HDFC …0001 Q2 — the same account again",
    docKey: "hdfc-bank-savings-50100000000001-2026-09-30-bank-statement",
    accountNo: "50100000000001", asOf: "2026-09-30",
    sourcePath: "source/synthetic/hdfc-0001-q2.pdf", status: "ok",
    grid: hdfc({
      account: "50100000000001", holder: "TEST HOLDER ONE", period: "01/07/2026 To : 30/09/2026",
      rows: [
        { date: "05/07/26", narration: "NEFT DR-TESTBANK0003-PAY", reference: "N003000003",
          valueDate: "05/07/26", withdrawal: "25,000.00", balance: "60,500.50" },
        { date: "20/08/26", narration: "NEFT CR-TESTBANK0004-RECEIPT", reference: "N004000004",
          valueDate: "20/08/26", deposit: "5,000.00", balance: "65,500.50" },
      ],
      summary: { opening: "85,500.50", drCount: "1", crCount: "1",
        debits: "25,000.00", credits: "5,000.00", closing: "65,500.50" },
    }),
  },
  {
    name: "ICICI …0000 — prints no opening, totals or counts",
    docKey: "icici-bank-savings-032001510000-2026-06-30-bank-statement",
    accountNo: "032001510000", asOf: "2026-06-30",
    sourcePath: "source/synthetic/icici-0000.pdf", status: "ok",
    grid: icici(),
  },
  {
    // THE PRINTED CLOSING IS NOT THE LAST ROW'S BALANCE. Everything else ties,
    // so exactly ONE check fails — which is the point: a gate that only fires
    // when a statement is broken in several ways would not prove it is
    // all-or-nothing.
    name: "HDFC …0002 — fails its own closing-balance check",
    docKey: "hdfc-bank-savings-50100000000002-2026-06-30-bank-statement",
    accountNo: "50100000000002", asOf: "2026-06-30",
    sourcePath: "source/synthetic/hdfc-0002-broken.pdf", status: "partial",
    grid: hdfc({
      account: "50100000000002", holder: "TEST HOLDER TWO", period: "01/04/2026 To : 30/06/2026",
      rows: [
        { date: "01/04/26", narration: "NEFT DR-TESTBANK0005-PAY", reference: "N005000005",
          valueDate: "01/04/26", withdrawal: "25,000.00", balance: "75,000.00" },
        { date: "15/04/26", narration: "NEFT CR-TESTBANK0006-RECEIPT", reference: "N006000006",
          valueDate: "15/04/26", deposit: "10,500.50", balance: "85,500.50" },
      ],
      summary: { opening: "100,000.00", drCount: "1", crCount: "1",
        debits: "25,000.00", credits: "10,500.50", closing: "90,000.00" },
    }),
  },
  {
    // PUBLISHED, AND ITS SIBLING BELOW IS NEWER AND REFUSED. So this account's
    // latest RECONCILED balance is its 30 Jun one while its newest statement is
    // the 30 Sep one the gate threw out — the pair that makes the closing-balance
    // total's "newest" claim falsifiable. Without it the total iterated the
    // published issues alone and nothing could see that the newer issue had been
    // dropped before the comparison.
    name: "HDFC …0003 Q1 — published, with a NEWER refused sibling",
    docKey: "hdfc-bank-savings-50100000000003-2026-06-30-bank-statement",
    accountNo: "50100000000003", asOf: "2026-06-30",
    sourcePath: "source/synthetic/hdfc-0003-q1.pdf", status: "ok",
    grid: hdfc({
      account: "50100000000003", holder: "TEST HOLDER THREE", period: "01/04/2026 To : 30/06/2026",
      rows: [
        { date: "01/04/26", narration: "NEFT DR-TESTBANK0007-PAY", reference: "N007000007",
          valueDate: "01/04/26", withdrawal: "10,000.00", balance: "40,000.00" },
        { date: "15/04/26", narration: "NEFT CR-TESTBANK0008-RECEIPT", reference: "N008000008",
          valueDate: "15/04/26", deposit: "2,000.75", balance: "42,000.75" },
      ],
      summary: { opening: "50,000.00", drCount: "1", crCount: "1",
        debits: "10,000.00", credits: "2,000.75", closing: "42,000.75" },
    }),
  },
  {
    // THE SAME ACCOUNT, A LATER PERIOD, AND REFUSED — the printed debits total
    // is not the rows'. One check fails, so nothing is published, exactly as
    // …0002 does; what is new is that this account already HAS a reconciled
    // balance from an earlier issue.
    name: "HDFC …0003 Q2 — newer than Q1 and refused",
    docKey: "hdfc-bank-savings-50100000000003-2026-09-30-bank-statement",
    accountNo: "50100000000003", asOf: "2026-09-30",
    sourcePath: "source/synthetic/hdfc-0003-q2.pdf", status: "partial",
    grid: hdfc({
      account: "50100000000003", holder: "TEST HOLDER THREE", period: "01/07/2026 To : 30/09/2026",
      rows: [
        { date: "05/07/26", narration: "NEFT DR-TESTBANK0009-PAY", reference: "N009000009",
          valueDate: "05/07/26", withdrawal: "1,000.00", balance: "41,000.75" },
        { date: "20/08/26", narration: "NEFT CR-TESTBANK0010-RECEIPT", reference: "N010000010",
          valueDate: "20/08/26", deposit: "500.00", balance: "41,500.75" },
      ],
      summary: { opening: "42,000.75", drCount: "1", crCount: "1",
        debits: "9,999.00", credits: "500.00", closing: "41,500.75" },
    }),
  },
]);

/**
 * Reads each fixture through the REAL reader and writes the four documents into
 * `archive` (a scratch copy of `public/audit/`), appending to its manifest.
 *
 * THE READER IS NOT STUBBED, and the status it reaches is CHECKED against the
 * one the fixture declares — so a reader change that stopped refusing the broken
 * statement, or started refusing a sound one, fails here rather than quietly
 * rendering a different report.
 *
 * @param root     the repository root
 * @param archive  a writable copy of `public/audit/`
 * @returns one summary row per statement
 */
export async function installBankFixture({ root, archive }) {
  const mod = await import(path.join(root, "scripts/ingest/providers/bankStatement.mjs"));
  const manifestPath = path.join(archive, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const written = [];

  for (const f of BANK_FIXTURE) {
    // Cells are what the header regexes read; rebuilt from the items, as
    // `bankStatement.test.mjs`'s own `withCells` does.
    const grid = structuredClone(f.grid);
    for (const p of grid.pages) for (const r of p.rows) r.cells = r.items.map((i) => ({ text: i.text }));

    const doc = mod.extract({ grid, meta: { docKey: f.docKey } });
    if (doc.status !== f.status) {
      throw new Error(`${f.name}: the reader reached status "${doc.status}", not the fixture's `
        + `"${f.status}" — ${(doc.warnings ?? []).map((w) => `${w.code}: ${w.detail}`).join(" | ")}`);
    }

    const d = {
      ...doc, docKey: f.docKey, fileKey: f.docKey, accountNo: f.accountNo,
      owner: "Ajay Thakurdas Jaisinghani", ownerId: "ajay-jaisinghani",
      asOf: f.asOf, reportType: "bank-statement", sourcePath: f.sourcePath, pages: 1,
    };
    fs.mkdirSync(path.join(archive, f.docKey), { recursive: true });
    fs.writeFileSync(path.join(archive, f.docKey, "document.json"), JSON.stringify(d, null, 1) + "\n");
    manifest.push({
      docKey: f.docKey, provider: d.provider, accountNo: d.accountNo, owner: d.owner, ownerId: d.ownerId,
      familyGroup: null, strategy: null, asOf: d.asOf, reportType: d.reportType,
      sourcePath: d.sourcePath, pages: 1, sections: Object.keys(d.sections ?? {}),
      status: d.status ?? "ok", warnings: (d.warnings ?? []).length, fileKey: f.docKey,
      label: `${d.provider} · ${d.accountNo} · bank-statement`,
      fy: d.asOf, source: d.sourcePath, sheets: [],
    });
    written.push({
      name: f.name, docKey: f.docKey, status: d.status ?? "ok",
      flows: (d.cashFlows ?? []).length, closing: d.flows?.closingBalance ?? null,
      passed: (d.checks?.passed ?? []).length,
      notApplicable: (d.checks?.notApplicable ?? []).length,
      failed: (d.checks?.failed ?? []).length,
    });
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
  return written;
}
