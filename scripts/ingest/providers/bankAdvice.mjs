// ICICI BANK — ADVICE RECEIPT. A bank's proof that a payment happened.
//
// Two of these arrived inside `MOTILAL REPORTS.zip`, named `3P_Folio 3000048.pdf`
// and `3P_Folio 3000049.pdf`, and they are not 3P statements. Each is a single
// page carrying four facts: a masked account number, a date, an amount and a
// direction.
//
//     Account number: XXXXXXXX1520
//     Transaction Date: 04/08/2026
//     Transaction Amount: INR 31,05,82,835.17
//     Debit/Credit: Debit
//
// ── WHY IT IS READ, AND WHY IT ATTACHES TO NOTHING ──────────────────────────
//
// Before this reader they sat in the coverage report as two documents with no
// reader, which reads as a gap in the pipeline. They are not a gap: they are
// documents that carry no position, no holder and no security, and the honest
// state is "read, and deliberately attributed to no account" rather than "could
// not be read". That distinction is the whole point of the coverage table.
//
// THE FILE NAME NAMES THE FOLIOS AND THE PAGE DOES NOT. `3P_Folio 3000048` and
// `3000049` are 3P India Equity Fund folios, and the two amounts sum to
// ₹52.49 Cr against the ₹52.12 Cr the family's consolidated review carries 3P at
// as on 30 June. That is a compelling story — the fund paying the family out on
// 4 August — and it is still only a file name plus an arithmetic coincidence.
// This book has already been bitten three times by a document filed on a name it
// merely MENTIONS (SVAN's footnote, WhiteOak's holding of 360 One WAM, V.E.C's
// `G128005_` prefix), and once by a fact sheet whose file name carried a
// different account from the one it printed.
//
// So the amount is recorded, the folios the file name asserts are recorded AS AN
// ASSERTION OF THE FILE NAME, and `excludedFromBook` keeps it out of every total
// until a statement from the fund says the same thing. A payment receipt is also
// the wrong instrument to book a redemption from: it says money moved between
// two banks, not which units were sold, at what NAV, on whose folio, or whether
// any of it was capital gain.
import { parseNum } from "../lib/parseNum.mjs";
import { toIso } from "../lib/classify.mjs";

export const PROVIDER = "ICICI Bank (payment advice)";

export function extract({ grid, meta = {} }) {
  const text = (grid?.pages ?? []).map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
  if (!/ICICI Bank Advice Receipt/i.test(text)) return null;

  const warnings = [];
  const amount = parseNum((/Transaction Amount:\s*INR\s*([\d,]+\.?\d*)/i.exec(text) ?? [])[1] ?? "");
  const date = toIso((/Transaction Date:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]?.replace(/\//g, "-"));
  const direction = (/Debit\/Credit:\s*(Debit|Credit)/i.exec(text) ?? [])[1] ?? null;
  const account = (/Account number:\s*(X*\d+)/i.exec(text) ?? [])[1] ?? null;
  const description = (/Transaction Description\s*:\s*([\s\S]{0,120}?)(?=\s*Note:)/i.exec(text) ?? [])[1]
    ?.replace(/\s+/g, " ").trim() ?? null;

  // What the FILE NAME claims, kept as the file name's claim and nothing more.
  const claimedFolio = (/(\d{7})/.exec(meta.sourcePath?.split("/").pop() ?? "") ?? [])[1] ?? null;

  if (amount == null) warnings.push({ code: "amount-not-read", detail: "no `Transaction Amount: INR …` on the receipt" });
  warnings.push({
    code: "payment-receipt-not-a-statement",
    detail: `a bank advice records that ${direction === "Debit" ? "money left" : "money reached"} account ${account ?? "(masked)"} on ${date ?? "an unread date"}`
      + `${amount != null ? ` — ₹${amount.toLocaleString("en-IN")}` : ""}. It names no holder, no security and no folio: `
      + `${claimedFolio ? `the file name asserts folio ${claimedFolio}, and a file name is not a letterhead. ` : ""}`
      + "So it is read in full, kept in the archive as provenance, and attributed to no account.",
  });

  return {
    provider: PROVIDER,
    accountNo: null,
    owner: null,
    asOf: date,
    reportType: "payment-advice",
    bankAdvice: { account, date, amount, direction, description, folioClaimedByFileName: claimedFolio },
    holdings: [],
    totals: null,
    excludedFromBook:
      "an ICICI Bank advice receipt: it records that a payment happened and carries no holder, no security and no folio. "
      + "The file name asserts a 3P folio; the page does not, and this book files a document on what it PRINTS. "
      + "It is in the archive and in no total.",
    sections: {
      advice: {
        name: "advice",
        rows: [["account", "date", "amount", "direction", "description", "folioClaimedByFileName"],
          [account, date, amount, direction, description, claimedFolio]],
      },
    },
    warnings,
    status: amount != null && date ? "ok" : "partial",
  };
}
