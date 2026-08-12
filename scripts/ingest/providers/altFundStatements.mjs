// SINGLE-SCHEME ACCOUNT STATEMENTS — the AIF and mutual-fund folios the client's
// August 2026 drop introduced, and which nothing here could read.
//
// ₹123.55 Cr OF THE FAMILY'S MONEY WAS OUTSIDE THE BOOK. Eight documents came in
// classified but with `no-extractor`, so they contributed nothing while the
// coverage table named them. Four of them carry a valuation:
//
//   Buoyant Opportunities Strategy — Cat III, Class A4   Ajay    ₹49.30 Cr
//   Helios Flexi Cap Fund — Direct Growth                Ajay    ₹31.00 Cr
//   Motilal Oswal Founders Fund Series II — Class G1     Ajay    ₹21.83 Cr
//   Motilal Oswal Active Momentum Fund — Direct Growth   Ankita  ₹21.42 Cr
//
// ── ONE READER, SIX DECLARED LAYOUTS ────────────────────────────────────────
//
// These share a shape — one investor, one scheme, a summary row and a
// transaction ledger — and share no layout beyond it. Rather than six files for six
// near-identical jobs, each layout declares the header text that identifies it
// and the columns it prints, in the order they appear. A document matching no
// layout is NOT guessed at: it returns null and stays in the coverage report as
// unread, which is the same outcome it has today and an honest one.
//
// ── WHAT IS A PRIMITIVE HERE ────────────────────────────────────────────────
//
// UNITS and NAV. Every one of these statements prints a valuation too, and on
// all four it equals units × NAV to the rupee — so the printed figure is kept in
// `printed.marketValue` as the CHECK it is, and the book uses the derived one.
// That is the same rule the appraisals follow, and it is what makes the
// reconciler able to say these documents are internally consistent rather than
// simply assumed to be.
//
// ── AND TWO STATEMENTS THAT VALUE NOTHING ───────────────────────────────────
//
// **India SME Investments Fund II** (three folios, one per member) prints a
// commitment, the contributions drawn against it and the units those bought —
// and NO NAV and NO valuation, on any of the three. Contributions are not a
// market value: carrying ₹8.1 Cr of drawn capital as if it were what the stake
// is worth would be inventing a valuation the fund has not published. So the
// holding is carried with its units and its cost, its market value stays NULL,
// and the undrawn commitment goes to the commitment register beside Transition
// Venture's — which is exactly where a drawdown fund's uncalled capital belongs.
//
// **3P India Equity Fund 1** prints three classes, all reclassified out on
// 31-03-2026, all standing at 0.000 units and ₹0.000. That is a MEASURED ZERO
// and it keeps its zero — the fund is telling us the position was moved, not
// that it forgot to value it. Where the units went is not on this statement and
// is not guessed at.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals } from "../lib/document.mjs";
import { toIso, trimPersonName } from "../lib/classify.mjs";

export const PROVIDERS = {
  buoyant: "Buoyant Capital",
  helios: "Helios Mutual Fund",
  founders: "Motilal Oswal Founders Fund",
  activeMomentum: "Motilal Oswal Active Momentum Fund",
  threeP: "3P Investment Managers",
  indiaSme: "India SME Investments",
};

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const n = (s) => parseNum(s);

/**
 * Every layout this reader claims, each identified by text only its own issuer
 * prints.
 *
 * `match` is deliberately the FUND'S OWN NAME rather than the letterhead: four
 * of these arrive on Motilal Oswal stationery because Motilal Oswal is the
 * DISTRIBUTOR or the depository participant, not the manager. Filing Buoyant's
 * Category III AIF under Motilal Oswal would put two different managers' money
 * in one account — the same mistake as reading WhiteOak's disclosure as a
 * 360 ONE client report, one layer down.
 */
const LAYOUTS = [
  {
    key: "buoyant",
    engagement: "AIF",
    providerEngagement: "Category III AIF - the statement titles the class CATEGORY III",
    provider: PROVIDERS.buoyant,
    match: /Buoyant\s+Opportunities\s+Strategy/i,
    assetClass: "AIF",
    /**
     * `BUOYANT OPPORTUNITIES 31/07/2026 34,16,657.4167 47,53,53,990.90 144.2878
     *  49,29,81,982.01 3.71 24.80` — the scheme name wraps across three lines
     * around the figures, so the row is matched on the FIGURES and the name is
     * taken from the summary heading rather than reassembled from the wrap.
     */
    row: new RegExp(
      String.raw`(\d{2}\/\d{2}\/\d{4})\s+` +      // 1 NAV date
      String.raw`([\d,]+\.\d+)\s+` +              // 2 units
      String.raw`([\d,]+\.\d+)\s+` +              // 3 cost
      String.raw`([\d,]+\.\d+)\s+` +              // 4 NAV
      String.raw`([\d,]+\.\d+)\s+` +              // 5 value
      String.raw`(-?[\d,]+\.\d+)\s+` +            // 6 absolute %
      String.raw`(-?[\d,]+\.\d+)`,                // 7 annualised %
    ),
    read: (m) => ({
      navDate: toIso(m[1]), quantity: n(m[2]), totalCost: n(m[3]),
      marketPrice: n(m[4]), printedValue: n(m[5]),
      absoluteYieldPct: n(m[6]), annualizedYieldPct: n(m[7]),
    }),
    security: (text) => (/CLASS\s+([A-Z]\d?)/i.exec(text)
      ? `Buoyant Opportunities Strategy — Category III — Class ${/CLASS\s+([A-Z]\d?)/i.exec(text)[1]}`
      : "Buoyant Opportunities Strategy — Category III"),
    account: (text) => FIELD(text, "Account", String.raw`(\d{4,})`),
    folio: (text) => FIELD(text, "Folio", String.raw`([A-Z0-9]{4,})`),
    asOf: (text) => toIso((/As of\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]),
    // `Account : 103473 AJAY THAKURDAS JAISINGHANI` — the holder is on the
    // title line, after the account number and with no label of its own.
    holder: (text) => (/Account\s*:\s*\d{4,}\s+([A-Z][A-Z\s]{6,44}?)\s*(?:\n|Buoyant)/i.exec(text) ?? [])[1],
  },
  {
    key: "founders",
    engagement: "AIF",
    providerEngagement: "Category II AIF - drawdown, with a commitment and called capital",
    provider: PROVIDERS.founders,
    match: /Motilal\s+Oswal\s+Founders\s+Fund/i,
    assetClass: "AIF",
    /** `CLASS G1 31-07-2026 11.5502 1,88,95,852.360 20,00,00,000.00 20,00,00,000.00 21,82,50,873.93` */
    row: new RegExp(
      String.raw`CLASS\s+([A-Z]\d?)\s+` +          // 1 class
      String.raw`(\d{2}-\d{2}-\d{4})\s+` +         // 2 NAV date
      String.raw`([\d,]+\.\d+)\s+` +               // 3 post-tax NAV
      String.raw`([\d,]+\.\d+)\s+` +               // 4 units
      String.raw`([\d,]+\.\d+)\s+` +               // 5 commitment
      String.raw`([\d,]+\.\d+)\s+` +               // 6 contribution
      String.raw`([\d,]+\.\d+)`,                   // 7 valuation
    ),
    read: (m) => ({
      klass: m[1], navDate: toIso(m[2]), marketPrice: n(m[3]), quantity: n(m[4]),
      commitment: n(m[5]), totalCost: n(m[6]), printedValue: n(m[7]),
    }),
    security: (_t, r) => `Motilal Oswal Founders Fund Series II — Class ${r.klass}`,
    account: (text) => FIELD(text, "Account No", String.raw`(\d{6,})`),
    asOf: (text) => toIso((/As on\s*:?\s*(\d{2}\s+\w{3}\s+\d{4})/i.exec(text) ?? [])[1]),
    holder: (text) => FIELD(text, "Name"),
    // THE NAV IS POST-TAX AND THE STATEMENT SAYS WHAT THAT MEANS: tax on
    // realised gains only, nothing for unrealised. Recorded rather than
    // adjusted — we do not know the unrealised position or the rate.
    note: "the NAV on this statement is POST-TAX on REALISED gains only; the fund states that tax on unrealised gains is not in it and appears only in the redemption NAV",
  },
  {
    key: "activeMomentum",
    engagement: "Direct",
    providerEngagement: "mutual-fund folio, Direct Plan as the statement states",
    provider: PROVIDERS.activeMomentum,
    match: /Active\s+Momentum\s+Fund/i,
    assetClass: "Mutual Fund",
    /** `Motilal Oswal Active Momentum Fund - Direct Plan Growth Option 1,52,45,765.959 21,42,00,000.00 14.0491 21,41,89,290.53` */
    row: new RegExp(
      String.raw`(Motilal\s+Oswal\s+Active\s+Momentum\s+Fund[^\n]*?)\s+` +  // 1 scheme
      String.raw`([\d,]+\.\d+)\s+` +               // 2 units
      String.raw`([\d,]+\.\d+)\s+` +               // 3 cost
      String.raw`([\d,]+\.\d+)\s+` +               // 4 NAV
      String.raw`([\d,]+\.\d+)`,                   // 5 value
    ),
    read: (m) => ({
      scheme: m[1].trim(), quantity: n(m[2]), totalCost: n(m[3]),
      marketPrice: n(m[4]), printedValue: n(m[5]),
    }),
    security: (_t, r) => r.scheme,
    folio: (text) => FIELD(text, "FOLIO", String.raw`(\d{6,})`),
    asOf: (text) => toIso((/Portfolio Summary as on\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]),
    holder: (text) => FIELD(text, "Name"),
  },
  {
    key: "helios",
    engagement: "Direct",
    providerEngagement: "mutual-fund folio, Direct plan as the statement states",
    provider: PROVIDERS.helios,
    match: /HELIOS\s+MUTUAL\s+FUND|Helios\s+Flexi\s+Cap/i,
    assetClass: "Mutual Fund",
    /**
     * `Helios Flexi Cap Fund - Direct Lump sum 06-Aug-2026 16.21 19,123,041.380
     *  310,000,000.00 309,984,500.77` — the scheme name wraps ("Growth" lands on
     * the next line), so the row is matched from the NAV DATE onward and the
     * scheme is named from the ISIN line, which does not wrap.
     */
    row: new RegExp(
      String.raw`(\d{2}-\w{3}-\d{4})\s+` +         // 1 NAV date
      String.raw`([\d,]+\.\d+)\s+` +               // 2 NAV
      String.raw`([\d,]+\.\d+)\s+` +               // 3 units
      String.raw`([\d,]+\.\d+)\s+` +               // 4 cost
      String.raw`([\d,]+\.\d+)`,                   // 5 market value
    ),
    read: (m) => ({
      navDate: toIso(m[1]), marketPrice: n(m[2]), quantity: n(m[3]),
      totalCost: n(m[4]), printedValue: n(m[5]),
    }),
    security: (text) => {
      const m = /\/\s*(Helios[^\n]*?)\s*-\s*(INF[0-9A-Z]{9})/i.exec(text);
      return m ? m[1].replace(/\s*\*\s*/g, " ").replace(/\s+/g, " ").trim() : "Helios Flexi Cap Fund - Direct Growth";
    },
    isin: (text) => (/(INF[0-9A-Z]{9})/.exec(text) ?? [])[1] ?? null,
    folio: (text) => (/Folio No\.?\s*:\s*(\d+)\s*\/\s*(\d+)/i.exec(text) ?? [])[1] ?? null,
    asOf: (text) => toIso((/Account Summary as on\s+(\d{2}-\w{3}-\d{4})/i.exec(text) ?? [])[1]),
    // CAMS prints the holder on its own line, immediately before the address,
    // with `Joint Holder 2 :` trailing it on the same printed row.
    holder: (text) => (/\n\s*([A-Z][A-Za-z]+(?:\s+[A-Z]\.?[A-Za-z]*){1,3})\s+Joint Holder 2/i.exec(text) ?? [])[1],
  },
  {
    key: "threeP",
    engagement: "AIF",
    providerEngagement: "Category III AIF - unit classes B1/B2/B3",
    provider: PROVIDERS.threeP,
    match: /3P\s+India\s+Equity\s+Fund/i,
    assetClass: "AIF",
    /**
     * `3P India Equity Fund 1 - Class B1 169.2210 155.2142 - 0.000 0.000` —
     * pre-tax NAV, post-tax NAV, pledged units, free units, current value.
     * ALL THREE CLASSES stand at zero: every one was reclassified out on
     * 31-03-2026 and the fund prints the zero explicitly. `allRows` because a
     * position that has gone to nil is still a position this book should show.
     */
    allRows: true,
    row: new RegExp(
      String.raw`(3P\s+India\s+Equity\s+Fund\s+\d+\s*-\s*Class\s+[A-Z]\d?)\s+` +  // 1 scheme+class
      String.raw`([\d,]+\.\d+)\s+` +               // 2 pre-tax NAV
      String.raw`([\d,]+\.\d+)\s+` +               // 3 post-tax NAV
      String.raw`(-|[\d,]+\.\d+)\s+` +             // 4 pledged units
      String.raw`([\d,]+\.\d+)\s+` +               // 5 free units
      String.raw`([\d,]+\.\d+)`,                   // 6 current value
      "g",
    ),
    read: (m) => ({
      scheme: m[1].replace(/\s+/g, " ").trim(), marketPrice: n(m[2]),
      postTaxNav: n(m[3]), quantity: n(m[5]), printedValue: n(m[6]),
    }),
    security: (_t, r) => r.scheme,
    folio: (text) => (/Folio No\.?\s*:\s*(\d{4,})/i.exec(text) ?? [])[1] ?? null,
    asOf: (text) => toIso((/Account Summary as on\s+(\d{2}-\d{2}-\d{4})/i.exec(text) ?? [])[1]),
    // `AJAY JAISINGHANI Mode of Holding : SINGLE` — the holder shares its
    // printed line with the next label, so it is cut at that label.
    holder: (text) => (/\n\s*([A-Z][A-Z\s]{6,44}?)\s+Mode of Holding/i.exec(text) ?? [])[1],
    note: "every class on this statement stands at zero units: the fund reclassified them out on 31-03-2026 and prints the zero. Where the units went is not on this document",
  },
  {
    key: "indiaSme",
    engagement: "AIF",
    providerEngagement: "Category II AIF - drawdown, with a commitment and uncalled capital",
    provider: PROVIDERS.indiaSme,
    match: /India\s+SME\s+Investments\s+Fund/i,
    assetClass: "AIF",
    /**
     * THIS STATEMENT VALUES NOTHING. It prints the commitment, what has been
     * drawn against it, and the units that bought — and no NAV and no valuation
     * anywhere on the page. The units are read, the drawn capital is read as
     * COST, and market value stays null. Carrying contributions as a value
     * would publish a valuation the fund never struck.
     */
    valuesNothing: true,
    row: new RegExp(String.raw`Total\s+([\d,]+)\s+([\d,]+)\s+\(([\d,]+)\)\s+([\d,]+)`),
    read: (m) => ({
      totalCost: n(m[1]), deemedIncome: n(m[2]), tds: -Math.abs(n(m[3]) ?? 0), quantity: n(m[4]),
    }),
    security: (text) => {
      const k = (/Class of Unit\s*:\s*([A-Z]\d?)/i.exec(text) ?? [])[1];
      return k ? `India SME Investments Fund II — Class ${k}` : "India SME Investments Fund II";
    },
    folio: (text) => FIELD(text, "Folio Number", String.raw`(\d{4,})`),
    holder: (text) => FIELD(text, "Investor Name"),
    asOf: (text) => toIso((/Statement of Account as on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i.exec(text) ?? [])[1]),
    commitmentFrom: (text) => ({
      committed: n((/Commitment Amount\s*\(a\)\s*:\s*INR\s*([\d,]+)/i.exec(text) ?? [])[1]),
      drawn: n((/Cumulative Contribution\s*\(b\)\s*:\s*INR\s*([\d,]+)/i.exec(text) ?? [])[1]),
      undrawn: n((/Undrawn Amount[^:]*:\s*INR\s*([\d,]+)/i.exec(text) ?? [])[1]),
    }),
    note: "this statement carries NO NAV and NO valuation — only the commitment, the capital drawn against it and the units that bought. Market value is null rather than the contributions, which are what was paid and not what it is worth",
  },
];

/**
 * A labelled field, cut at the first token that begins another label.
 *
 * The capture is GREEDY TO END OF LINE and then cut, not lazy. These pages put
 * two columns on one printed line — `Investor Name : Ajay Jaisinghani Branch
 * Address : Imperial Mahal…` — and a lazy `([^\n]{1,80}?)` with nothing
 * anchoring its right edge matches the shortest thing that satisfies the
 * pattern, which is one character. It failed silently on every layout that
 * labels its holder, which is most of them.
 */
const NEXT_LABEL = /\s+(?:Bank|Address|Date|Tel|Mobile|Email|Nominee|POA|Distributor|Joint|Mode|PAN|Status|Folio|Investor|IFSC|MICR|Class|Statement|Other|Branch|Payout|Multiple|CAN|BOID|UMRN|Phone)\b/i;
function FIELD(text, label, pattern = String.raw`([^\n]{1,90})`) {
  const m = new RegExp(label + String.raw`\s*:?\s*` + pattern, "i").exec(text);
  if (!m) return null;
  return String(m[1]).split(NEXT_LABEL)[0].trim() || null;
}

/**
 * The investor, by the name and the PAN the statement prints — both, because
 * the PAN is what settles who a name belongs to.
 *
 * Each issuer labels the holder differently and two of them do not label it at
 * all: Buoyant prints `Account : 103473 AJAY THAKURDAS JAISINGHANI` on the
 * title line, and Helios puts the name on its own line above the address. The
 * labels are tried in order and the bare-line fallback is LAST, so a labelled
 * name always wins over a guess at the layout.
 */
function investor(text, layout) {
  const pan = (/\b([A-Z]{5}\d{4}[A-Z])\b/.exec(text) ?? [])[1] ?? null;
  const labelled = layout?.holder?.(text)
    ?? FIELD(text, "Investor Name") ?? FIELD(text, "Name")
    ?? (/Account\s*:?\s*\d{4,}\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3})/.exec(text) ?? [])[1]
    ?? (/Folio\s*No\.?\s*:[^\n]*\n(?:[^\n]*\n){0,2}?\s*([A-Z][A-Za-z]+(?:\s+[A-Z]\.?[A-Za-z]*){1,3})\s*(?:Joint|$)/m.exec(text) ?? [])[1]
    ?? null;
  return { owner: labelled ? trimPersonName(labelled) : null, pan };
}

/** Which layout is this? Null when none claims it — never a guess. */
export function layoutFor(text) {
  return LAYOUTS.find((l) => l.match.test(text)) ?? null;
}

export function extract({ grid, meta = {} }) {
  const warnings = [];
  // The page text, whitespace-collapsed: every figure this reader wants sits on
  // one printed line, and the layouts are matched on that line's own order.
  const text = (grid?.pages ?? []).map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
  const layout = layoutFor(text);
  if (!layout) return null;

  const { owner, pan } = investor(text, layout);
  const holdings = [];
  let commitment = null;

  const rows = layout.allRows
    ? [...text.matchAll(layout.row)]
    : [layout.row.exec(text)].filter(Boolean);

  if (!rows.length) {
    warn(warnings, "summary-row-not-matched",
      `this document is a ${layout.provider} statement but its summary row did not match the declared column order; nothing is read from it rather than reading the wrong columns`);
    return { provider: layout.provider, owner, pan, holdings: [], totals: null, asOf: layout.asOf?.(text) ?? null, commitment: null, warnings };
  }

  for (const m of rows) {
    const r = layout.read(m);
    const security = typeof layout.security === "function" ? layout.security(text, r) : layout.security;
    holdings.push(makeHolding({
      security,
      isin: layout.isin?.(text) ?? null,
      assetClass: layout.assetClass,
      quantity: r.quantity ?? null,
      // A fund that publishes no NAV publishes no price. The contributions are
      // carried as COST, which is what they are.
      marketPrice: layout.valuesNothing ? null : r.marketPrice ?? null,
      totalCost: r.totalCost ?? null,
      absoluteYieldPct: r.absoluteYieldPct ?? null,
      annualizedYieldPct: r.annualizedYieldPct ?? null,
      priceAsOn: r.navDate ?? null,
      // makeHolding files the statement's own figures under `printed.*` itself;
      // `marketValue` here is the PRINTED one, and the book uses units × NAV.
      marketValue: layout.valuesNothing ? null : r.printedValue ?? null,
    }));
  }

  if (layout.commitmentFrom) {
    const c = layout.commitmentFrom(text);
    if (c.committed) commitment = c;
  }
  if (rows[0] && layout.read(rows[0]).commitment) {
    commitment = { committed: layout.read(rows[0]).commitment, drawn: layout.read(rows[0]).totalCost, undrawn: null };
  }
  if (layout.note) warn(warnings, "statement-basis", layout.note);
  if (layout.valuesNothing) {
    warn(warnings, "no-valuation-published",
      `${layout.provider} publishes no NAV on this statement, so this holding has units and cost and NO market value. It is not counted in the consolidated total.`);
  }

  return {
    provider: layout.provider,
    owner, pan,
    accountNo: layout.account?.(text) ?? layout.folio?.(text) ?? null,
    asOf: layout.asOf?.(text) ?? null,
    // These ARE holdings statements — one scheme, its units and its NAV. Left
    // as `unknown` the docKey reads `…-unknown` and precedence has nothing to
    // key on.
    reportType: "holdings",
    // WHAT THE VEHICLE IS, in the fund's own words. Left unset these accounts
    // came out `engagement: "unknown"` with a null providerEngagement, which
    // section 5 of CLAUDE.md warns is never to be defaulted - and null is not
    // even in the contract, so the typecheck refused the book outright.
    engagement: layout.engagement ?? "unknown",
    providerEngagement: layout.providerEngagement ?? undefined,
    holdings,
    commitment,
    totals: makeTotals({
      totalMarketValue: layout.valuesNothing ? null : holdings.reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0) || null,
      totalCost: holdings.reduce((t, h) => t + (h.totalCost ?? 0), 0) || null,
      positionCount: holdings.length,
    }),
    warnings,
  };
}

export const PROVIDER = Object.values(PROVIDERS);
