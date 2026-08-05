// MUTUAL-FUND FOLIO STATEMENTS — read in full, then sorted by WHOSE THEY ARE.
//
// Five statements, four AMCs. The book's standing note said all five belong to
// `HOPE INDIA TRUST` and were therefore out of scope. Reading them says
// otherwise on one of the five:
//
//   ABSL  1038104611   HOPE INDIA TRUST        Status : Trust
//   ABSL  1019265797   HOPE INDIA TRUST        Status : Trust
//   Kotak 4295974      Hope India Trust        Tax Status : Trust
//   Mirae 70413280453  HOPE INDIA TRUST        Status TRUST
//   HDFC  16180583/58  Bharat A Jaisinghani    Tax Status : Individual
//                      Joint 1: ANKITA JAISINGHANI
//
// The HDFC folio is held by two people already in this book, jointly, with both
// their PANs on the page. It is not the trust's and never was — it was excluded
// on a premise nobody had checked, which is exactly what "verify the source
// before trusting the calculation" is for. It carries no value today (both
// schemes redeemed to zero units), and that is a MEASURED zero with a reason,
// not an absence.
//
// ── HOW THE SORTING WORKS, AND WHY IT IS NOT A GUESS ────────────────────────
//
// Every one of these statements prints the holder's TAX STATUS in words —
// `Status : Trust`, `Tax Status : Individual` — because the AMC has to. That
// printed word is the signal, not an inference from the name, and not the PAN:
// two of these mask it (`XXXXX4894A`), so a PAN-only rule would have failed on
// exactly the statements it was needed for. Where a PAN IS printed in full it is
// carried too, and `shared/owners.mjs` resolves the holder on it.
//
// A folio held by an entity that resolves to no canonical owner carries
// `excludedFromBook` with the reason. Nothing filters it downstream; it simply
// belongs to nobody this book knows, and the build report says so rather than
// dropping an account silently.
//
// ── FOUR AMCs, THREE LAYOUTS ────────────────────────────────────────────────
//
//   ABSL      a PORTFOLIO SUMMARY table: scheme, units, NAV, value, cost
//   HDFC      per-scheme blocks closed by
//   Kotak     `Market Value of Balance Units at NAV of <nav> on <date> (INR) : <v>`
//   Mirae     `ISIN : … Balance Units : …` then `Current Value : … Investment Value : …`
//
// All three are located by ANCHOR TEXT rather than by position, so an AMC
// changing its column order surfaces as "no scheme block matched" instead of as
// units read out of the NAV column.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals } from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";
import { panHolderType } from "../../../shared/owners.mjs";

export const PROVIDER = "Mutual fund folio";

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const num = (s) => parseNum(s);

/** The AMC, off its own statement — the same names classify.mjs already knows. */
const AMCS = [
  [/Aditya\s+Birla\s+Sun\s+Life/i, "Aditya Birla Sun Life Mutual Fund"],
  [/Kotak\s+Mahindra\s+Mutual\s+Fund|Kotak\s+Mutual\s+Fund|kotakmf\.com/i, "Kotak Mahindra Mutual Fund"],
  [/Mirae\s+Asset/i, "Mirae Asset Mutual Fund"],
  [/HDFC\s+(?:Mutual\s+Fund|Asset\s+Management)|hdfcfund\.com/i, "HDFC Mutual Fund"],
];

/**
 * Strip the HTML the Mirae statement leaves in the PDF text layer —
 * `<font size="1.5" …><b>Scheme name</b></font>` — plus the footnote asterisk
 * every AMC appends to a scheme that has been renamed. Markup that never
 * rendered is not part of a security's name, and a name carrying it keys to
 * something that matches nothing.
 */
const cleanName = (s) => String(s ?? "")
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .replace(/\s*\*+\s*$/, "")
  .trim();

// ── The three layouts ───────────────────────────────────────────────────────

/**
 * HDFC / Kotak: `<code> / <scheme>* - <ISIN> UCC : <ucc>` opening a block that
 * `Market Value of Balance Units at NAV of <nav> on <date> (INR) : <value>`
 * closes. Balance units come from the block's last `Balance Units` figure, which
 * is what the transaction ledger leaves standing.
 */
const BLOCK_HEAD = /^\s*[A-Z0-9]{2,8}\s*\/\s*(.+?)\s*-\s*(IN[EF][0-9A-Z]{9})\b/;
const BLOCK_VALUE = /Market Value of Balance Units at NAV of\s*([\d,]+\.?\d*)\s*on\s*(\d{2}\/\d{2}\/\d{4})\s*\(INR\)\s*:\s*([\d,]+\.?\d*)/i;
const CLOSING_UNITS = /(?:Closing|Opening) (?:Unit )?Balance(?: as on \d{2}\/\d{2}\/\d{4})?\s*:?\s*([\d,]+\.\d{3})/i;

/**
 * ABSL: one row per scheme under `PORTFOLIO SUMMARY`.
 * `ABSL Liquid Fund - Direct-Growth 1,752.565 30-Jun-2026 453.2856 794,412.48 537,146.28 0.00`
 *
 * The scheme name WRAPS (`… - IDCW Daily -` / `Reinvestment`), so the row is
 * anchored on its numeric tail and the name is whatever precedes it.
 */
const ABSL_ROW = new RegExp(
  String.raw`^(.*?)\s+([\d,]+\.\d{3})\s+` +                   // 1 scheme, 2 units
  String.raw`(\d{1,2}-[A-Za-z]{3}-\d{4})\s+` +                // 3 NAV date
  String.raw`([\d,]+\.\d{2,})\s+` +                           // 4 NAV
  String.raw`([\d,]+\.\d{2})\s+` +                            // 5 current value
  String.raw`([\d,]+\.\d{2})\s+` +                            // 6 cost
  String.raw`([\d,]+\.\d{2})\s*$`,                            // 7 IDCW earned
);
/** `B153GZ Aditya Birla Sun Life Liquid Fund - Growth-Direct Plan - INF209K01VA3` */
const ABSL_ISIN = /\b(IN[EF][0-9A-Z]{9})\b/;

/** Mirae: `ISIN : INF769K01CM1 Balance Units : 316.190` */
const MIRAE_ISIN = /ISIN\s*:\s*(IN[EF][0-9A-Z]{9})\s*(?:Balance\s*Units\s*:?\s*([\d,]+\.?\d*))?/i;
const MIRAE_VALUE = /Current Value\s*:?\s*\(?[`₹]?\)?\s*([\d,]+\.?\d*)/i;
const MIRAE_COST = /Investment Value\s*:?\s*\(?[`₹]?\)?\s*([\d,]+\.?\d*)/i;
const MIRAE_NAV = /NAV\s*:?\s*\(?[`₹]?\)?\s*([\d,]+\.?\d*)\s*\(as on\s*(\d{2}\/\d{2}\/\d{4})\)/i;

function readBlockLayout(lines, source) {
  const out = [];
  const heads = lines.map((l, i) => (BLOCK_HEAD.test(l) ? i : -1)).filter((i) => i >= 0);
  const seen = new Set();
  for (let k = 0; k < heads.length; k++) {
    const i = heads[k];
    const head = BLOCK_HEAD.exec(lines[i]);
    /**
     * THE BLOCK RUNS TO THE NEXT SCHEME HEADING, NOT A FIXED NUMBER OF LINES.
     *
     * A fixed window looked sufficient on the two HDFC schemes, which hold
     * nothing and close within eight lines of their heading. Kotak's liquid fund
     * has thirty days of daily IDCW reinvestment between its heading and its
     * `Market Value` line, so a 14-line window found no value, skipped the block
     * as a continuation-page repeat, and reported the folio at Rs 0 — with
     * Rs 7,73,610.75 printed inside it.
     *
     * The heading DOES repeat on a continuation page, which is why the ISIN is
     * deduped rather than the window being narrowed to exclude it.
     */
    const window = lines.slice(i, heads[k + 1] ?? lines.length).join("\n");
    const v = BLOCK_VALUE.exec(window);
    if (!v || seen.has(head[2])) continue;
    seen.add(head[2]);
    // The LAST balance figure in the block is what the ledger left standing.
    const balances = [...window.matchAll(new RegExp(CLOSING_UNITS.source, "gi"))];
    const units = balances.length ? num(balances[balances.length - 1][1]) : null;
    out.push(makeHolding({
      security: cleanName(head[1]),
      isin: head[2],
      assetClass: "Mutual Fund",
      quantity: units,
      marketPrice: num(v[1]),
      marketValue: num(v[3]),
      priceAsOn: toIso(v[2]),
      source,
    }));
  }
  return out;
}

function readAbslLayout(lines, source) {
  const out = [];
  const start = lines.findIndex((l) => /PORTFOLIO SUMMARY/i.test(l));
  if (start < 0) return out;
  // The ISIN is printed BELOW the summary, on the scheme's own detail heading.
  const isinFor = (name) => {
    const key = name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14);
    for (const l of lines) {
      const m = ABSL_ISIN.exec(l);
      if (m && l.toLowerCase().replace(/[^a-z]/g, "").includes(key)) return m[1];
    }
    return null;
  };
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (/^TOTAL\s*:/i.test(raw)) break;
    const m = ABSL_ROW.exec(raw);
    if (!m) continue;
    const name = cleanName(m[1]);
    if (!name) continue;
    out.push(makeHolding({
      security: name,
      isin: isinFor(name),
      assetClass: "Mutual Fund",
      quantity: num(m[2]),
      marketPrice: num(m[4]),
      totalCost: num(m[6]),
      marketValue: num(m[5]),
      priceAsOn: toIso(m[3]),
      source,
    }));
  }
  return out;
}

function readMiraeLayout(lines, source, warnings) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = MIRAE_ISIN.exec(lines[i]);
    if (!m) continue;
    const isin = m[1];
    let name = null;
    for (let k = i - 1; k >= 0 && k >= i - 4 && !name; k--) {
      const c = cleanName(lines[k]);
      if (c.length >= 8 && !/^ISIN|^Folio|^Trade Date/i.test(c)) name = c;
    }
    const window = lines.slice(i, i + 8).join(" ");
    const nav = MIRAE_NAV.exec(window);
    if (!name) { warn(warnings, "scheme-name-not-read", `ISIN ${isin} has no readable scheme name above it`); continue; }
    out.push(makeHolding({
      security: name,
      isin,
      assetClass: "Mutual Fund",
      quantity: num(m[2]) ?? num((/Balance\s*Units\s*:?\s*([\d,]+\.?\d*)/i.exec(window) || [])[1]),
      marketPrice: nav ? num(nav[1]) : null,
      totalCost: num((MIRAE_COST.exec(window) || [])[1]),
      marketValue: num((MIRAE_VALUE.exec(window) || [])[1]),
      priceAsOn: nav ? toIso(nav[2]) : null,
      source,
    }));
  }
  return out;
}

export function extract({ grid, meta }) {
  const warnings = [];
  const source = meta.docKey;
  const lines = (grid.pages ?? []).flatMap((p) => p.text.split("\n"));
  const flat = lines.join("\n").replace(/[ \t]+/g, " ");

  // ── identity ──────────────────────────────────────────────────────────────
  const amc = AMCS.find(([re]) => re.test(flat))?.[1] ?? meta.provider ?? null;
  // `Folio Number : 1038104611`, `Folio No. : 16180583 / 58`, `Folio No. 7041 3280 453`.
  // HDFC's suffix after the slash is the branch code, not part of the folio.
  const folio = (/Folio\s*(?:No\.?|Number)\s*:?\s*([\d][\d\s]{4,24}?)(?=\s*\/|\s{2,}|\s*CAN|\s*Statement|\n|$)/i.exec(flat) || [])[1]
    ?.replace(/\s+/g, "") || null;
  /**
   * THE HOLDER'S TAX STATUS, IN THE AMC'S OWN WORDS.
   *
   * This is the field that decides whether a folio belongs in a family book, and
   * every one of these statements prints it because the AMC is required to. It
   * is read rather than inferred from the name — `HOPE INDIA TRUST` looks like a
   * trust, but `Bharat A Jaisinghani` looks like an individual and one of these
   * five is filed the way the name suggests only by coincidence.
   */
  const printedStatus = (/(?:Tax\s+)?Status\s*:?\s*([A-Za-z]{4,})\b/.exec(flat) || [])[1] ?? null;
  // Every PAN on the page, in the order the holder table prints them. Masked
  // ones (`XXXXX4894A`) are skipped: a partial identifier is not an identifier.
  const pans = [...flat.matchAll(/(?:1st|2nd|First|Second)\s+(?:Unit\s+)?Holder\s+([A-Z]{5}\d{4}[A-Z])\b/gi)].map((m) => m[1]);
  const pan = pans[0] ?? null;
  /**
   * A JOINT FOLIO HAS MORE THAN ONE OWNER, and this book has an accountId per
   * account, not per person. HDFC 16180583 is held by Bharat with Ankita as
   * first joint holder — two PANs on the page, both already in the registry.
   *
   * The account is attributed to the FIRST holder, which is whose PAN the AMC
   * reports the income under, and the others are recorded so a per-person view
   * can say the holding is shared rather than implying sole ownership.
   */
  const jointHolders = [...flat.matchAll(/Joint\s*\d?\s*:?\s*([A-Z][A-Za-z .'-]{4,50}?)(?=\s{2,}|\n|$)/g)]
    .map((m) => m[1].trim())
    .filter((n) => n && !/^N\/?A$/i.test(n));
  /**
   * The holder's name. Each AMC puts it on its own line among the address block,
   * followed by a different label — `Status`, `Mode of Holding`, `Nominee`,
   * `Email Address`. Matched as a capitalised run followed by any of them.
   */
  const ownerCandidates = [
    // ABSL / Mirae / Kotak: the name shares a line with the next label.
    ...[...flat.matchAll(/\n\s*([A-Z][A-Za-z0-9 .&'-]{4,60}?)\s+(?:Status|Mode of Holding|Nominee\s*\d|Email Address|Joint\s*\d)\b/g)].map((m) => m[1]),
    // HDFC: the name is alone on its line above `Mode of Holding`.
    ...[...flat.matchAll(/\n\s*((?:[A-Z][A-Za-z.'-]+\s+){1,4}(?:TRUST|Trust|Jaisinghani))\s*\n/g)].map((m) => m[1]),
  ].map((x) => x.trim()).filter(Boolean);
  /**
   * `NON-TRANSFERABLE` is a WATERMARK, not a holder.
   *
   * ABSL prints it above the address block, on its own line, followed by
   * `Mode of Holding : Single` — the same shape the holder's line has, and it
   * comes first. Taken as the name it made the folio's owner a stamp on the
   * page, which then resolved to nobody and put a real trust holding into the
   * "unidentified" bucket for the wrong reason.
   *
   * Statement furniture is excluded by name rather than by position, because
   * position is what put it here.
   */
  const FURNITURE = /^(?:NON[- ]?TRANSFERABLE|CONSOLIDATED|DUPLICATE|ACCOUNT STATEMENT|STATEMENT OF ACCOUNT)$/i;
  const owner = ownerCandidates.find((c) => !FURNITURE.test(c)) ?? null;
  const asOf = toIso((/Statement\s*Date\s*:?\s*(\d{1,2}[-\s][A-Za-z]{3,}[-\s]\d{4})/i.exec(flat) || [])[1])
    ?? toIso((/as on\s*(\d{2}\/\d{2}\/\d{4})/i.exec(flat) || [])[1]);
  const period = /From\s*(\d{2}[-/][A-Za-z0-9]{2,3}[-/]\d{4})\s*To\s*(\d{2}[-/][A-Za-z0-9]{2,3}[-/]\d{4})/i.exec(flat);

  if (!folio) warn(warnings, "folio-not-read", "no `Folio No.` / `Folio Number` on the statement");
  if (!owner) warn(warnings, "holder-not-read", "no holder name line matched in the address block");

  // ── the holdings, whichever layout this AMC uses ──────────────────────────
  const holdings = [
    ...readBlockLayout(lines, source),
    ...readAbslLayout(lines, source),
    ...readMiraeLayout(lines, source, warnings),
  ];
  if (!holdings.length) warn(warnings, "holdings-not-read", "no scheme block matched in any of the three known folio layouts");

  /**
   * WHOSE FOLIO IS THIS?
   *
   * A holder whose printed tax status is anything but `Individual` is a separate
   * taxpayer, and its assets are not a person's net worth. That is a fact off the
   * page, so it is recorded as one; whether the family wants the trust
   * consolidated is a decision for them, and making it here would be inventing an
   * owner. One entry in `shared/owners.mjs` reverses it.
   */
  const statusKind = printedStatus ? printedStatus.toLowerCase() : null;
  const isIndividual = statusKind === "individual";
  const panKind = panHolderType(pan);
  const excludedFromBook = isIndividual
    ? null
    : `holder ${owner ?? "(unread)"} is filed by the AMC as ${printedStatus ?? "an entity of unstated status"}`
      + `${panKind && panKind !== "individual" ? `, and its PAN carries the ${panKind} holder code` : ""}`
      + " — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets "
      + "into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book.";

  const printedValue = holdings.reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0);
  const printedCost = holdings.reduce((t, h) => t + (h.totalCost ?? 0), 0);

  return {
    provider: amc ?? PROVIDER,
    accountNo: folio,
    owner,
    pan,
    jointHolders: jointHolders.length ? jointHolders : undefined,
    asOf,
    periodFrom: period ? toIso(period[1]) : null,
    periodTo: period ? toIso(period[2]) : null,
    strategy: null,
    engagement: "Direct",
    providerEngagement: printedStatus ? `folio held by a ${printedStatus.toLowerCase()}` : null,
    holdings,
    totals: makeTotals({
      totalMarketValue: holdings.length ? printedValue : null,
      totalCost: printedCost || null,
      positionCount: holdings.length,
      source,
    }),
    returns: [],
    excludedFromBook,
    sections: {
      holdings: {
        name: "holdings",
        rows: [["isin", "scheme", "units", "nav", "navDate", "invested", "currentValue"],
          ...holdings.map((h) => [h.isin ?? "", h.security, h.quantity, h.marketPrice, h.priceAsOn ?? "", h.totalCost, h.printed.marketValue])],
      },
    },
    warnings,
    status: holdings.length ? (warnings.length ? "partial" : "ok") : "failed",
  };
}
