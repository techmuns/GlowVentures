// INVESTMENTS THE FAMILY ADVISED IN WRITING, keyed on the DP account they landed in.
//
// A depository's holding statement proves the units and nothing else: its Market
// Rate on an unlisted share is the face value (`faceValueBasis`), so it carries
// no value and no date. The family's note delivered with the two LLP statements
// of 29 Oct 2026 carries both of what is missing: the day each block was paid for
// and the amount. It is a table in a covering note, not a statement, so it lives
// here rather than under `source/`, word for word, and it joins the statement only
// where the units agree (`applyFamilyAdvice`). Nothing here is a valuation: the
// line is held at what was paid (`valuedAtCost`) until someone strikes a mark.
//
// THE EQUITY AMOUNTS DO NOT EQUAL THEIR OWN UNITS × RATE, and the note does not
// say why. Each equity line reads "at 17.75" and pays about 16.70 a share (₹47.54
// lakh short on Glowsphere, ₹1.43 Cr short on Glowterra); both preference lines
// tie to the paisa. `amount` is what the family say they invested, so it is the
// cost; `printedRate` stays beside it as the check, and the shortfall is named on
// the holding and in the book report until the family explain it.

const SOURCE = "the family's note delivered with the HDFC Bank NSDL holding statements of 29 Oct 2026";

export const FAMILY_ADVISED_INVESTMENTS = {
  67776432: {
    holder: "Glowterra LLP",
    source: SOURCE,
    lines: [
      { instrument: "preference", date: "2026-09-25", amount: 250499999, units: 14112676, printedRate: 17.75,
        printed: "INVESTMENT - 14112676 PREFERENCE SHARES OF 17.75 INR EACH" },
      { instrument: "equity", date: "2026-10-01", amount: 225710084, units: 13521127, printedRate: 17.75,
        printed: "INVESTMENT - 13521127 EQUITY SHARES OF INR 17.75 PER SHARE" },
    ],
  },
  67776424: {
    holder: "Glowsphere LLP",
    source: SOURCE,
    lines: [
      { instrument: "preference", date: "2026-09-25", amount: 83499993.75, units: 4704225, printedRate: 17.75,
        printed: "INVESTMENT - 47,04,225 PREFERENCE SHARES AT THE RATE OF 17.75 INR" },
      { instrument: "equity", date: "2026-10-01", amount: 75245856, units: 4507042, printedRate: 17.75,
        printed: "INVESTMENT - 4507042 EQUITY SHARES AT THE RATE OF 17.75 INR" },
    ],
  },
};

const instrumentOf = (h) => (/\bPREF\b/i.test(h.security ?? "") ? "preference" : "equity");

/**
 * The advice laid over one archived statement, returning a copy. The archive keeps
 * what the statement printed; only the book sees the cost, the date and the at-cost
 * value. A line whose units disagree with the statement is refused and named, and
 * that holding stays a quantity with no value.
 *
 * @returns {{ doc: object, notes: string[] }}
 */
export function applyFamilyAdvice(doc) {
  const advice = doc.accountNo ? FAMILY_ADVISED_INVESTMENTS[Number(doc.accountNo)] : null;
  if (!advice || doc.status === "failed") return { doc, notes: [] };
  const notes = [];
  const cashFlows = [...(doc.cashFlows ?? [])];
  const holdings = (doc.holdings ?? []).map((h) => {
    const line = advice.lines.find((l) => l.instrument === instrumentOf(h));
    if (!line) {
      notes.push(`${advice.holder}: ${h.security} is on the statement and not in ${advice.source}; it stays a quantity`);
      return h;
    }
    if (line.units !== h.quantity) {
      notes.push(`${advice.holder}: ${h.security} — ${advice.source} says ${line.units} units, the statement ${h.quantity}; `
        + "the advised cost is refused and the holding stays a quantity");
      return h;
    }
    const atRate = line.units * line.printedRate;
    const short = Math.round((atRate - line.amount) * 100) / 100;
    const mismatch = Math.abs(short) > 1;
    if (mismatch) {
      notes.push(`${advice.holder}: ${h.security} — amount invested ₹${line.amount} is ₹${short} below its own `
        + `${line.units} units × ₹${line.printedRate}; the amount is the cost, and the family have not said why they differ`);
    }
    cashFlows.push({
      date: line.date, description: line.printed, security: h.security, securityKey: h.securityKey, isin: h.isin ?? null,
      kind: "contribution", memberId: null, amount: line.amount, units: line.units,
      // Self-contained, as `capitalMovesFrom` asks: the row is the money that bought these units.
      netAmount: line.amount,
      settlementDate: null, source: doc.docKey, advised: true,
    });
    return {
      ...h,
      totalCost: line.amount,
      marketValue: line.amount,
      valuedAtCost: true,
      advisedNote: `Units from the HDFC Bank NSDL statement of ${doc.asOf}, whose rate is face value. Bought ${line.date} `
        + `for what ${advice.source} records: "${line.printed}".${mismatch
          ? ` The amount invested is ₹${short.toLocaleString("en-IN")} below those units at ₹${line.printedRate}; the note does not say why.` : ""}`,
    };
  });
  return { doc: { ...doc, holdings, cashFlows }, notes };
}
