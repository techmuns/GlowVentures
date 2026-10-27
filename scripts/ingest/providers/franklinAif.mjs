// FRANKLIN INDIA CREDIT AIF – SCHEME I — Franklin Templeton's Category II credit
// AIF, one Statement of Account per folio (Stage 10hx).
//
// `source/october-2026-e/10387.pdf`, sent by the client on 27 Oct 2026, is
// Ajay's folio 10387, Unit Class DB2: a ₹20 Cr commitment called and paid in
// full on 22 Oct 2026, 201,254.604 units allotted at 993.7164. It is sealed with
// the holder's PAN, so it was opened once by a run holding the saved statement
// passwords and every later run reads its archived page text (`extract.mjs`,
// `carriedForward`). This reader therefore reads TEXT, never coordinates.
//
// Nothing here is new as a shape: the summary prints commitment, called,
// contributed, stamp duty and net (Sanshi's three-row ledger, `sanshiFund.mjs`),
// then balance capital, NAV and the value of the units, then the distribution
// heads and the unit balance. Every one of those ties to the others and to the
// dated ledger below them, and a statement where any does not is not published.
//
// The issuer prints the investor's BANK on the page (HDFC Bank), which is how the
// classifier first filed it under "HDFC"; it is matched on the fund's own name
// in `lib/classify.mjs`.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, makeFlows, makeCashFlow } from "../lib/document.mjs";
import { toIso, trimPersonName } from "../lib/classify.mjs";

export const PROVIDER = "Franklin India Credit AIF";
const SCHEME = "Franklin India Credit AIF – Scheme I";

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const AMOUNT = String.raw`\(?-?[\d,]+\.\d+\)?`;
const amounts = (line) => [...String(line ?? "").matchAll(new RegExp(AMOUNT, "g"))].map((m) => parseNum(m[0].replace(/[()]/g, "")));
const date = (raw) => toIso(String(raw ?? "").replace(/-/g, " "));
const near = (a, b, tol) => a !== null && b !== null && Math.abs(a - b) <= tol;

/**
 * The page's text with the issuer's `ti` ligature spelled out. Its PDF draws
 * "ti" as one glyph that extracts as `Ɵ` — "AlternaƟve", "ContribuƟon",
 * "TransacƟon" — and every label below is matched in plain words.
 */
export function franklinText(pages) {
  return pages.map((p) => p.text).join("\n").replace(/Ɵ/g, "ti").replace(/[ \t]+/g, " ");
}

export const matches = (text) => /Franklin\s+India\s+Credit\s+AIF/i.test(text)
  && /Statement\s+of\s+Account/i.test(text);

/** The line after a label line — the summary prints its figures under their headings. */
const after = (lines, re) => {
  const i = lines.findIndex((l) => re.test(l));
  return i < 0 ? null : lines[i + 1] ?? null;
};

/** Everything the statement prints, as read. Exported for the test. */
export function franklinParse(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const capital = amounts(after(lines, /^Commitment Amount Capital Called Amount Contributed Stamp Duty Net Contribution$/i));
  const balanceLine = lines.find((l) => /^[\d,]+\.\d+ [\d,]+\.\d+ [\d,]+\.\d+ \d+ [\d,]+\.\d+ [\d,]+\.\d+$/.test(l)) ?? null;
  const value = balanceLine ? balanceLine.split(" ").map((x) => parseNum(x)) : [];
  const unitsLine = lines.find((l, i) => /^Income Gain\/Loss Gain\/Loss Income$/i.test(lines[i - 1] ?? "") ) ?? null;
  const dist = amounts(unitsLine);
  const navAsOn = /As on (\d{2}-[A-Za-z]{3}-\d{4}) NAV : ([\d,]+\.\d+)/i.exec(text);
  const ledger = [];
  for (const l of lines) {
    const m = /^(\d{2}-[A-Za-z]{3}-\d{4}) (?:(\d{2}-[A-Za-z]{3}-\d{4}) )?(.+?) (?:([\d,]+\.\d+) ([\d,]+\.\d+) )?(\(?[\d,]+\.\d{2}\)?)$/.exec(l);
    if (!m) continue;
    ledger.push({
      date: date(m[1]), realizedOn: m[2] ? date(m[2]) : null, description: m[3].trim(),
      nav: m[4] ? parseNum(m[4]) : null, units: m[5] ? parseNum(m[5]) : null,
      amount: parseNum(m[6].replace(/[()]/g, "")), negative: m[6].startsWith("("),
    });
  }
  const closing = /Closing Balance as on (\d{2}-[A-Za-z]{3}-\d{4}) ([\d,]+\.\d{2})/i.exec(text);
  return {
    folio: (/Folio No\s*:\s*(\d{3,})/i.exec(text) ?? [])[1] ?? null,
    unitClass: (/Unit Class\s*:\s*([A-Z0-9]+)/i.exec(text) ?? [])[1] ?? null,
    holder: (/Bank and Demat account Details\s*\n\s*([A-Z][A-Za-z.']+(?: [A-Z][A-Za-z.']+){1,3})\s*\n/.exec(text) ?? [])[1] ?? null,
    pan: (/First Holder\s*:\s*([A-Z]{5}\d{4}[A-Z])/.exec(text) ?? [])[1] ?? null,
    statementDate: date((/Statement Date\s*:\s*(\d{2}-[A-Za-z]{3}-\d{4})/i.exec(text) ?? [])[1]),
    isin: (/ISIN\s*:\s*(INF[A-Z0-9]{9})/.exec(text) ?? [])[1] ?? null,
    registration: (/registration number (IN\/AIF\d\/[\d-]+\/\d+)/i.exec(text) ?? [])[1] ?? null,
    category: /Category\s+II\s+Alternative\s+Investment\s+Fund/i.test(text) ? "II" : null,
    navDate: navAsOn ? date(navAsOn[1]) : null,
    nav: navAsOn ? parseNum(navAsOn[2]) : null,
    commitment: capital[0] ?? null, called: capital[1] ?? null, contributed: capital[2] ?? null,
    stampDuty: capital[3] ?? null, net: capital[4] ?? null,
    uncalled: value[0] ?? null, principalRepaid: value[1] ?? null, balanceCapital: value[2] ?? null,
    faceValue: value[3] ?? null, latestNav: value[4] ?? null, value: value[5] ?? null,
    distributions: dist.length === 8 ? dist.slice(0, 5) : null,
    unitsAllotted: dist.length === 8 ? dist[5] : null, unitsRedeemed: dist.length === 8 ? dist[6] : null,
    balanceUnits: dist.length === 8 ? dist[7] : null,
    ledger,
    closingDate: closing ? date(closing[1]) : null,
    closingBalance: closing ? parseNum(closing[2]) : null,
  };
}

/**
 * Every identity the statement prints between its figures. Empty when it is
 * internally consistent; otherwise each line names what did not tie.
 */
export function franklinFails(p) {
  const fails = [];
  const need = ["folio", "unitClass", "isin", "nav", "navDate", "commitment", "called", "contributed", "stampDuty", "net",
    "uncalled", "principalRepaid", "balanceCapital", "value", "unitsAllotted", "unitsRedeemed", "balanceUnits", "closingDate", "closingBalance"];
  for (const k of need) if (p[k] === null || p[k] === undefined) fails.push(`${k} not read`);
  if (fails.length) return fails;
  if (!near(p.contributed - p.stampDuty, p.net, 0.01)) fails.push(`contributed ${p.contributed} − stamp duty ${p.stampDuty} ≠ net ${p.net}`);
  if (!near(p.commitment - p.called, p.uncalled, 0.01)) fails.push(`commitment − called ≠ uncalled ${p.uncalled}`);
  if (!near(p.net - p.principalRepaid, p.balanceCapital, 0.01)) fails.push(`net − principal repaid ≠ balance capital ${p.balanceCapital}`);
  if (p.latestNav !== p.nav) fails.push(`summary NAV ${p.latestNav} ≠ dated NAV ${p.nav}`);
  if (!near(p.unitsAllotted - p.unitsRedeemed, p.balanceUnits, 0.0005)) fails.push("units allotted − redeemed ≠ balance units");
  if (!near(p.balanceUnits * p.nav, p.value, 0.5)) fails.push(`units × NAV ${(p.balanceUnits * p.nav).toFixed(2)} ≠ printed value ${p.value}`);
  if (!near(p.closingBalance, p.balanceCapital, 0.01)) fails.push(`closing balance ${p.closingBalance} ≠ balance capital ${p.balanceCapital}`);
  const sum = (f) => p.ledger.filter(f).reduce((s, r) => s + r.amount, 0);
  const gross = sum((r) => /^Capital Contribution$/i.test(r.description));
  const charges = sum((r) => /Stamp Duty/i.test(r.description));
  const allotted = p.ledger.filter((r) => /Allotment of Units/i.test(r.description));
  if (!near(gross, p.contributed, 0.01)) fails.push(`ledger contributions ${gross} ≠ amount contributed ${p.contributed}`);
  if (!near(charges, p.stampDuty, 0.01)) fails.push(`ledger stamp duty ${charges} ≠ ${p.stampDuty}`);
  if (!near(allotted.reduce((s, r) => s + r.amount, 0), p.net, 0.01)) fails.push("ledger allotments ≠ net contribution");
  if (!near(allotted.reduce((s, r) => s + (r.units ?? 0), 0), p.unitsAllotted, 0.0005)) fails.push("ledger units ≠ units allotted");
  if (p.unitsRedeemed !== 0 || p.principalRepaid !== 0 || p.distributions.some((d) => d !== 0)
    || p.ledger.some((r) => !/^(Capital Contribution|Stamp Duty on allotment.*|Net Contribution-Allotment of Units)$/i.test(r.description)))
    fails.push("a redemption, repayment or distribution row this reader has not been taught");
  return fails;
}

export function extract({ grid, meta }) {
  const warnings = [];
  const source = meta.docKey;
  const text = franklinText(grid.pages ?? []);
  const p = franklinParse(text);
  const fails = franklinFails(p);
  const owner = trimPersonName(p.holder);
  const security = `${SCHEME} — Unit Class ${p.unitClass}`;
  const base = {
    provider: PROVIDER, accountNo: p.folio, owner, pan: p.pan,
    // The units are the 22 Oct closing balance; the NAV that values them is
    // struck as on 21 Oct (`priceAsOn` below).
    asOf: p.closingDate, reportType: "holdings", strategy: SCHEME, engagement: "AIF",
    // Quoted verbatim, as `shared/aifCategory.mjs` reads a category from it.
    providerEngagement: `${p.category ? "Franklin Templeton Category II Alternative Investment Fund Trust" : "AIF"}`
      + `${p.registration ? `; SEBI registration ${p.registration}` : ""}`,
  };
  if (fails.length) {
    warn(warnings, "statement-does-not-tie", `nothing is published from this statement: ${fails.join("; ")}`);
    return { ...base, holdings: [], totals: null, warnings, status: "failed" };
  }

  const holding = makeHolding({
    security, isin: p.isin, assetClass: "AIF",
    quantity: p.balanceUnits, marketPrice: p.nav, priceAsOn: p.navDate,
    // The statement's own cost is the NET it allotted units for; `build-book`
    // restates it to the gross paid from the three-row ledger (`grossPaid`).
    totalCost: p.net, marketValue: p.value, source,
  });
  const cashFlows = p.ledger.map((r) => makeCashFlow({
    date: r.date, description: r.description, security, source,
    kind: /Stamp Duty/i.test(r.description) ? "expense" : "contribution",
    units: r.units, amount: r.amount,
  }));
  return {
    ...base,
    holdings: [holding],
    totals: makeTotals({ totalMarketValue: p.value, totalCost: p.net, positionCount: 1, source }),
    flows: makeFlows({ contribution: p.contributed, corpus: p.value, periodFrom: p.ledger[0]?.date ?? null, periodTo: p.closingDate, source }),
    cashFlows,
    // Every head of the distributions summary prints 0.00: a measured nil.
    commitment: { committed: p.commitment, called: p.called, drawn: p.contributed, paid: p.contributed,
      undrawn: p.uncalled, distributed: 0 },
    sections: {
      summary: {
        name: "summary",
        rows: [["class", "isin", "navDate", "nav", "units", "commitment", "called", "contributed", "stampDuty", "net", "value"],
          [p.unitClass, p.isin, p.navDate, String(p.nav), String(p.balanceUnits), String(p.commitment), String(p.called),
            String(p.contributed), String(p.stampDuty), String(p.net), String(p.value)]],
      },
      transactions: {
        name: "transactions",
        rows: [["date", "description", "kind", "nav", "units", "amount"],
          ...cashFlows.map((c, i) => [c.date, c.description, c.kind, p.ledger[i].nav ?? "", c.units ?? "", c.amount])],
      },
    },
    warnings,
    status: "ok",
  };
}
