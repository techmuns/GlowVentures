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

/**
 * A figure inside a worked example, or the em-dash when the book does not carry
 * it. A popover that reads `= ₹23,25,000 − ₹0 ÷ ₹0 × 100` teaches the reader a
 * calculation nobody performed; `= ₹23,25,000 − — ÷ — × 100` shows exactly which
 * input is missing, which is the question they clicked to ask.
 */
const has = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const orDash = <T,>(n: number | null | undefined, f: (v: number) => string) => (has(n) ? f(n) : "—");

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

// THE "LEDGER" LINK USED TO POINT AT A DOCUMENT THAT DOES NOT EXIST.
//
// This was `{ file: "current", sheet: "holdings" }` — the reference dashboard's
// one big workbook sheet, and the same phantom path that left src/lib/ledger.ts
// reading nothing. Dozens of `<Auditable>` figures across the app carried a
// "trace to the ledger" link to `/audit?file=current&sheet=holdings`. Data Audit
// looks that key up in the manifest, does not find it, and silently leaves
// whichever document was already open — so the reader clicks a number, lands on
// an unrelated statement, and has no way to tell it is the wrong one.
//
// This archive is keyed BY DOCUMENT. A holding's source is its account's
// PORTFOLIO APPRAISAL — precedence names that authoritative for every holdings
// figure — and its docKey is `<accountId>-<account asOf>-appraisal`, which is
// exactly how extract.mjs composes it.
//
// So there is no single ledger to link to, and pretending there is one is what
// broke this. `holdingHref` needs the account; `AUDIT_INDEX` is the honest
// fallback for a CONSOLIDATED figure, which has no one source document because
// it spans five.
export const AUDIT_INDEX = {};
/** The appraisal that sourced a holding, for a per-position deep link. */
export const appraisalDocKey = (a: { accountId: string; asOf: string }) => `${a.accountId}-${a.asOf}-appraisal`;
/** Deep link to a holding's own row in its own account's appraisal. */
export const holdingHref = (a: { accountId: string; asOf: string } | undefined, find: string) =>
  a ? auditHref({ file: appraisalDocKey(a), find }) : auditHref({ find });

// Kept as the name every call site already uses, now meaning "the archive
// index" rather than a specific sheet: a consolidated figure spans documents,
// so it links to the archive rather than asserting one source.
export const LEDGER = AUDIT_INDEX;
export const ledgerHref = (find: string) => auditHref({ find });

// Deep-link to a security's Stock Info drill-down page, keyed by securityKey.
export const stockHref = (securityKey: string) => `/stock/${encodeURIComponent(securityKey)}`;

// The private-markets extract has one sheet per instrument type. A row links to
// its own sheet and highlights its exact investment-name cell (`eq` matches the
// whole cell, so one fund's name doesn't also hit a longer name containing it).
export type PrivateSheet = "private-equity-funds" | "pre-ipo" | "debt-fund" | "startup";
export const privateHref = (sheet: PrivateSheet, name: string) => auditHref({ file: "private", sheet, eq: name });

const pct = (n: number, dp = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;

// ── Reusable formula builders for the metrics that repeat across tables ────────
export const pnlFormula = (mv: number, cost: number | null | undefined, pnl: number | null | undefined, m: Money, href?: string): FormulaDef => ({
  title: "Unrealised P&L",
  excel: "= Market value − Cost",
  plain: "What the shares you still hold are worth today, minus what you paid for them. It's on paper — nothing has been sold.",
  worked: `= ${m(mv)} − ${orDash(cost, (c) => m(c))} = ${orDash(pnl, (v) => m(v, true))}`,
  auditHref: href,
});

export const returnFormula = (
  mv: number,
  cost: number | null | undefined,
  retPct: number | null | undefined,
  m: Money,
  href?: string,
): FormulaDef => ({
  title: "Return",
  excel: "= (Market value − Cost) ÷ Cost × 100",
  plain: has(cost)
    ? "How much the holding has gained or lost against what you paid, as a percentage."
    : "This holding's statement reports a market value and no cost — a depository holds shares, it does not record what they cost — so there is nothing to measure the gain against.",
  worked: `= (${m(mv)} − ${orDash(cost, (c) => m(c))}) ÷ ${orDash(cost, (c) => m(c))} × 100 = ${orDash(retPct, pct)}`,
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

/**
 * A weight — and THE DENOMINATOR'S MEANING IS THE CALLER'S TO STATE.
 *
 * This popover asserted "as a share of the whole listed book" and was wrong on
 * every one of its three callers, three different ways: Family Entities divides
 * by the whole CONSOLIDATED book (every asset class, listed AND private),
 * Sector Composition by the COMPANY-SHARE subtotal that page is narrowed to,
 * and the Portfolio Monitor by its own footer total across every bucket. None
 * of them is the listed book, and this is the one popover a reader opens
 * precisely because they want to CHECK the arithmetic — a wrong scope here is
 * the "caption that narrows a figure it does not narrow" rule failing at the
 * exact place a reader went looking for the truth.
 *
 * So the scope is a PARAMETER. `ofWhat` is a short noun phrase naming the set
 * the total covers, in the caller's own words — it is the caller, not this
 * helper, that knows what it divided by.
 *
 * It is OPTIONAL, and the default NAMES THE FIGURE WITHOUT NAMING THE SET. A
 * helper that guesses a scope for a caller that has not said is how the wrong
 * sentence got here — but a default that only confesses the gap leaves the
 * reader with nothing to check the arithmetic against, which is the one thing
 * they opened this popover to do. So the default prints the total ITSELF: the
 * figure is unambiguous (it is the number in the division below, in money), and
 * the one clause about what that total covers says the page has not stated it
 * rather than inventing a scope. An un-updated caller therefore still hands over
 * a checkable equation.
 *
 * THE WORKED EXAMPLE ALSO CHECKS ITSELF, AND A CHECK OVER NO INPUT IS NOT A
 * PASS. `total` and `wPct` arrive as separate arguments, so a caller can hand
 * over a total it did not actually divide by — the Portfolio Monitor strikes its
 * row weights against a `weightBase` that is not always its footer `totMV`. When
 * the division does not reproduce the percentage it is shown beside, the popover
 * says so rather than printing an equation whose two halves disagree.
 *
 * The divide-by-zero guard used to EXEMPT a zero or negative total from that
 * check (`has(wPct) && total > 0 ? … : true`), so `= ₹4.39 Cr ÷ ₹0 × 100 =
 * 11.1%` — the one equation a reader can see is impossible — was reported as
 * reproducing, having been checked against nothing. It is a FAILURE now, and it
 * gets its own sentence: an undefined division and a percentage struck against a
 * different total are two different findings with two different remedies, and a
 * reader who cannot tell them apart cannot act on either.
 */
export const weightFormula = (
  mv: number,
  total: number,
  wPct: number | null | undefined,
  m: Money,
  ofWhat?: string,
): FormulaDef => {
  // Half of the last decimal this line prints — the same "reproduce the
  // statement's own precision" bound the reconciler uses, never a tolerance
  // widened until it fits. Inside it the two halves round to the same digit on
  // screen and the equation a reader reads does reproduce.
  //
  // Three states, not two, because the failures are not the same finding:
  //   • no percentage was printed  → nothing to contradict; the worked line
  //     already shows an em dash where the answer would be.
  //   • a positive total          → the division is defined, so check it.
  //   • a zero or negative total  → the division is NOT defined. Only a zero
  //     weight is consistent with it; anything else came from elsewhere.
  const dividable = total > 0;
  const reproduces = !has(wPct) ? true
    : dividable ? Math.abs((mv / total) * 100 - wPct) <= 0.05
    : wPct === 0;
  const failure = reproduces ? ""
    : dividable
      ? " — this does not reproduce: the percentage shown was struck against a different total from the one above."
      : " — this does not reproduce: the total above is not a positive number, so the division is undefined and the percentage beside it was measured against something else.";
  return {
    title: "Weight",
    excel: "= Market value ÷ Total market value × 100",
    plain: ofWhat
      ? `How big this holding is as a share of ${ofWhat}.`
      : `How big this holding is as a share of ${m(total)} — the total in the division below, which is the figure this page divided by. WHAT that total covers is not stated here: the page showing this figure has not named the set, and this popover will not guess at one.`,
    worked: `= ${m(mv)} ÷ ${m(total)} × 100 = ${orDash(wPct, (v) => `${v.toFixed(1)}%`)}${failure}`,
  };
};

export const sumFormula = (title: string, plain: string, parts: { label: string; value: number }[], total: number, m: Money): FormulaDef => ({
  title,
  excel: `= ${parts.map((p) => p.label).join(" + ")}`,
  plain,
  worked: `= ${parts.map((p) => m(p.value)).join(" + ")} = ${m(total)}`,
});

export const embeddedReturnFormula = (pnl: number | null | undefined, cost: number | null | undefined, retPct: number | null | undefined, m: Money, href?: string): FormulaDef => ({
  title: "Embedded return",
  excel: "= Unrealised P&L ÷ Cost × 100",
  plain: "The gain still sitting inside the book — unrealised profit measured against what those holdings cost.",
  worked: `= ${orDash(pnl, (v) => m(v))} ÷ ${orDash(cost, (v) => m(v))} × 100 = ${orDash(retPct, pct)}`,
  auditHref: href,
});
