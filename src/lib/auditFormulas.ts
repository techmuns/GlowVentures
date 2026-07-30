// Audit trail helpers. Every number on the dashboard is either:
//   • a RAW value → link to where it lives in the Data Audit workbooks, or
//   • a CALCULATION → a plain-language, Excel-style formula the user can inspect.
//
// This module builds the deep-links into Data Audit and the reusable formula
// definitions the <Auditable> popover renders.

export type FormulaDef = {
  title: string;      // e.g. "Return"
  excel: string;      // e.g. "= (Market value − Cost) ÷ Cost × 100"
  plain: string;      // plain-language explanation
  worked?: string;    // the same formula with the actual numbers plugged in
  auditHref?: string; // optional link to the underlying source rows in Data Audit
};

type Money = (n: number, sign?: boolean) => string;

// Build a Data Audit deep-link: opens the extracted sheet and filters/highlights
// rows. `find` matches any cell that CONTAINS the text (a security name, an
// account number…); `eq` matches any cell that EXACTLY equals the value (use for
// short or overlapping keys, so a two-letter entity code doesn't also match every
// longer string containing it).
export function auditHref(o: { file?: string; sheet?: string; find?: string; eq?: string }): string {
  const p = new URLSearchParams();
  if (o.file) p.set("file", o.file);
  if (o.sheet) p.set("sheet", o.sheet);
  if (o.find) p.set("find", o.find);
  if (o.eq) p.set("eq", o.eq);
  const qs = p.toString();
  return qs ? `/audit?${qs}` : "/audit";
}

// The master current-book ledger: the row-level holdings table the ingest
// pipeline writes to public/audit/current/holdings.json, the source of every
// listed holding's quantity, cost and value. Rows are keyed by security name,
// not ISIN — most of this book's providers print no ISIN.
export const LEDGER = { file: "current", sheet: "holdings" };
export const ledgerHref = (find: string) => auditHref({ ...LEDGER, find });

// Deep-link to a security's Stock Info drill-down page, keyed by securityKey.
export const stockHref = (securityKey: string) => `/stock/${encodeURIComponent(securityKey)}`;

// The private-markets extract has one sheet per instrument type. A row links to
// its own sheet and highlights its exact investment-name cell (`eq` matches the
// whole cell, so one fund's name doesn't also hit a longer name containing it).
export type PrivateSheet = "private-equity-funds" | "pre-ipo" | "debt-fund" | "startup";
export const privateHref = (sheet: PrivateSheet, name: string) => auditHref({ file: "private", sheet, eq: name });

const pct = (n: number, dp = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;

// ── Reusable formula builders for the metrics that repeat across tables ────────
export const pnlFormula = (mv: number, cost: number, pnl: number, m: Money, href?: string): FormulaDef => ({
  title: "Unrealised P&L",
  excel: "= Market value − Cost",
  plain: "What the shares you still hold are worth today, minus what you paid for them. It's on paper — nothing has been sold.",
  worked: `= ${m(mv)} − ${m(cost)} = ${m(pnl, true)}`,
  auditHref: href,
});

export const returnFormula = (mv: number, cost: number, retPct: number, m: Money, href?: string): FormulaDef => ({
  title: "Return",
  excel: "= (Market value − Cost) ÷ Cost × 100",
  plain: "How much the holding has gained or lost against what you paid, as a percentage.",
  worked: `= (${m(mv)} − ${m(cost)}) ÷ ${m(cost)} × 100 = ${pct(retPct)}`,
  auditHref: href,
});

// Net total return — the private book's one money-multiple. TVPI once a holding
// has returned cash, MOIC while it hasn't; the popover names whichever applies
// so the figure stays auditable against the workbook either way.
export const netReturnFormula = (
  what: string,
  { invested, current, distributed, multiple }: { invested: number; current: number; distributed: number; multiple: number },
  m: Money,
  href?: string,
): FormulaDef => {
  const paid = distributed > 0;
  return {
    title: `${what} — total return × (${paid ? "TVPI" : "MOIC"})`,
    excel: paid ? "= (Current value + Cash returned) ÷ Invested" : "= Current value ÷ Invested",
    plain: paid
      ? "Everything ₹1 of capital has produced — what's still held plus what's already been paid back. Counting the mark alone would understate anything that returns capital as it succeeds, like a debt fund in repayment."
      : "Current value per ₹1 invested. Nothing has been paid back yet, so the mark is the whole return and TVPI and MOIC are the same number.",
    worked: paid
      ? `= (${m(current)} + ${m(distributed)}) ÷ ${m(invested)} = ${multiple.toFixed(2)}×`
      : `= ${m(current)} ÷ ${m(invested)} = ${multiple.toFixed(2)}×`,
    auditHref: href,
  };
};

export const weightFormula = (mv: number, total: number, wPct: number, m: Money): FormulaDef => ({
  title: "Weight",
  excel: "= Market value ÷ Total market value × 100",
  plain: "How big this holding is as a share of the whole listed book.",
  worked: `= ${m(mv)} ÷ ${m(total)} × 100 = ${wPct.toFixed(1)}%`,
});

export const sumFormula = (title: string, plain: string, parts: { label: string; value: number }[], total: number, m: Money): FormulaDef => ({
  title,
  excel: `= ${parts.map((p) => p.label).join(" + ")}`,
  plain,
  worked: `= ${parts.map((p) => m(p.value)).join(" + ")} = ${m(total)}`,
});

export const embeddedReturnFormula = (pnl: number, cost: number, retPct: number, m: Money, href?: string): FormulaDef => ({
  title: "Embedded return",
  excel: "= Unrealised P&L ÷ Cost × 100",
  plain: "The gain still sitting inside the book — unrealised profit measured against what those holdings cost.",
  worked: `= ${m(pnl)} ÷ ${m(cost)} × 100 = ${pct(retPct)}`,
  auditHref: href,
});
