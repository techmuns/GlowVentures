// ICICI BANK — the family's NSDL depository account, and the first statement in
// this book whose rows are almost entirely UNLISTED.
//
// One document, one account: `Statement of Holding 31-Mar-2026` for Ajay
// Jaisinghani, Client Id 49794950, DP ID IN302902. It arrived after every other
// delivery and it is the only source anywhere in `source/` for the family's
// pre-IPO allotments, their private-company shares and preference shares, and
// their promoter holding in a listed company. Nothing else in the corpus
// mentions any of it.
//
// ── WHY THIS IS NOT `motilalDemat.mjs` ──────────────────────────────────────
//
// That reader serves CDSL accounts at one broker and is built around a `Rs RATE`
// column. This is NSDL through a bank, and its table is `ISIN Code | Scrip Name
// | Account Description | Balance | Value (Rs.)` — there is NO RATE COLUMN AT
// ALL. Quantity and value are the primitives here and the per-unit price is
// derived, which is the opposite arrangement, and it is what makes the
// face-value problem below a different shape.
//
// ── A RECORD IS UP TO THREE LINES, AND THE ISIN IS THE MIDDLE ONE ───────────
//
// A cell too wide for its column wraps ABOVE and BELOW the line carrying the
// ISIN, not after it:
//
//   y 681   RADIANT INNOVATIVE MANUFACTURING LIMITED - EQ      <- name, part 1
//   y 676   INE007Z01022 … Beneficiary  71400.000  714,000.00  <- the anchor
//   y 671   NEW FV RS. 10/-                                    <- name, part 2
//
// Read line by line that is three records, one of them a company called "NEW FV
// RS. 10/-". So the anchor rows are found first and every other line is assigned
// to the NEAREST anchor BY Y — which is a measurement, not a guess: within a
// record the gaps here are 4.6-9.6pt and between records 15-21pt, and the
// assignment is unambiguous on all 39 rows. Walking outward from each anchor
// instead would be wrong, because a wrap line sitting between two anchors
// belongs to exactly one of them.
//
// ── AND ONE VALUE WRAPS TOO, WHICH IS THE ROW THAT MATTERS MOST ─────────────
//
//   y 703   x508  123,512,419,665.0
//   y 698   x442  INE455K01017  POLYCAB INDIA LIMITED - EQ  13901229.000
//   y 693   x572  0
//
// The figure is too wide for the column, so its last digit is drawn on the line
// below at the x the first fragment ended at. Read as printed, the largest
// holding in this statement has NO VALUE and the two fragments look like two
// stray numbers. They are stitched only where the join yields ONE well-formed
// number — `layout.mjs`'s own rule, applied one level up — and the join is
// checked against the statement's printed grand total, which it reproduces to
// the rupee.
//
// ── THE VALUE COLUMN IS A MARK ON SOME ROWS AND PAR ON OTHERS ───────────────
//
// This is the same failure `motilalDemat.mjs` met in its rate column, arriving
// through a column that has no rate to inspect. Divide value by balance and 21
// of 39 rows come to a face-value denomination EXACTLY:
//
//   NATIONAL STOCK EXCHANGE OF INDIA LTD   125,000 sh   Rs 125,000.00   = Re 1.00
//   INDIA SME INVESTMENTS AIF TRUST II      67,500 u    Rs 6,75,00,000  = Rs 1,000
//   SKS FASTENERS LIMITED                   24,800 sh   Rs 2,48,000.00  = Rs 10.00
//
// NSE's unlisted share is not worth a rupee and India SME's units are not worth
// their subscription price; both are the par value a depository records at
// allotment and holds forever. Fourteen different securities coming to exactly
// Rs 10.0000 is not fourteen coincidences.
//
// So a par row carries its QUANTITY and NO VALUE, in three graded tiers, and
// every row in the weakest tier is NAMED in a warning so a reader can challenge
// any one of them. The error runs towards absence, which renders as an em dash
// with a reason; the alternative is a mark nobody struck, which renders as a
// number.
//
// ── AND THE FUND UNITS ARE THE FUNDS' OWN, ALREADY IN THIS BOOK ─────────────
//
// Four `INF` rows are units of funds that issue their own statements here, at
// unit counts matching those statements exactly — Sanshi Class A2 and Class E,
// Sky Capital's Oncare A3, India SME's Class A2. `AIF_UNITS` in
// `motilalDemat.mjs` is the committed register that names which fund reports
// each ISIN, and `dropDepositoryDuplicates` in `build-book.mjs` CHECKS it
// against the reporting account's own units rather than trusting it.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals } from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";
import { resolveOwner } from "../../../shared/owners.mjs";

export const PROVIDER = "ICICI Bank (NSDL demat)";

const n = (v) => (v == null ? null : parseNum(String(v)));
const warn = (warnings, code, detail) => warnings.push({ code, detail });

/**
 * The ISIN, and why this pattern is WIDER than the one next door.
 *
 * `motilalDemat.mjs` matches `IN[EF]` because every identifier on a CDSL
 * statement in this drop is a company security or a fund scheme. This statement
 * carries `IN90SE903019` — INFOBAY AI LIMITED's preference share — and an
 * `IN[EF]` pattern drops that row silently. India's numbering is `IN` plus ten
 * alphanumerics; the THIRD character is what says which kind, and that is read
 * separately below rather than being folded into the shape test.
 */
const ISIN_RE = /^IN[0-9A-Z]{10}$/;

/**
 * THE LETTERHEAD, and it takes two lines to be one.
 *
 * `ICICI BANK LIMITED` on its own is not evidence: it appears on a Motilal
 * transaction statement already in this book, as an `ISIN NAME:` — a security
 * the family holds, not the house that issued the document. `DP ID :` on its own
 * is worse, printed on thirty statements as a field about the INVESTOR's
 * depository account. Only the two together, adjacent, are the ICICI depository
 * participant's own letterhead. Same rule as `CDSL AND NSDL : IN-DP-…` one
 * reader over, and the same reason: a name a document MENTIONS is not the name
 * that ISSUED it.
 */
export const LETTERHEAD = /ICICI\s+BANK\s+LIMITED[\s\S]{0,40}?DP\s*ID\s*:\s*IN\d{6}/i;

/**
 * Face-value denominations, in rupees.
 *
 * India issues ordinary shares at Re 1, Rs 2, Rs 5 or Rs 10 and AIF units at
 * Rs 100 or Rs 1,000, and a depository that has no price for a security records
 * the value it was allotted at. The list is the denominations themselves and
 * nothing else — it is not widened until it fits the rows, and a row whose
 * implied price is Rs 10.01 is a mark.
 */
const FACE_VALUES = [1, 2, 5, 10, 100, 1000];

/** `EQ NEW FV RS. 10/-`, `NEW FV RE.1/-` — the face value the NAME declares. */
function declaredFaceValue(name) {
  const m = /\bF\.?V\.?\s*(?:RS\.?|RE\.?)\s*([\d.]+)\s*\/?-/i.exec(String(name ?? ""));
  const v = m ? Number(m[1]) : null;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * IS THIS VALUE A MARK, OR THE PAR THE UNITS WERE ISSUED AT?
 *
 * Three tiers, strongest evidence first, and each one says what it rests on so
 * the extraction report can grade them separately:
 *
 *   declared — the SCRIP NAME states the face value and the implied price is
 *              exactly it. The document contradicts itself and says so.
 *   scheme   — an `INF` identifier (a fund or AIF scheme) at exactly Rs 10 /
 *              100 / 1,000. `motilalDemat.mjs` already commits to this: the
 *              depository prints the issue price of a unit, never its NAV.
 *   par      — a whole-rupee face denomination with no paise, on an identifier
 *              that declares nothing. The weakest tier, and the rows are LISTED
 *              individually in the warning rather than only counted.
 *
 * Returns null where the value is a mark.
 */
export function faceValueBasis({ isin, name, quantity, value }) {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(value)) return null;
  const price = value / quantity;
  const declared = declaredFaceValue(name);
  // Exactly, to the paise the statement prints. A price within a rounding of a
  // denomination is not a denomination.
  const isExactly = (v) => Math.abs(price - v) < 0.005 / quantity + 1e-9;
  if (declared != null && isExactly(declared)) return { tier: "declared", price, declared };
  if (!FACE_VALUES.some(isExactly)) return null;
  if (/^INF/i.test(isin)) return { tier: "scheme", price, declared };
  return { tier: "par", price, declared };
}

/**
 * WHAT THE INSTRUMENT IS.
 *
 * `INF` is a fund or AIF scheme — a fact about the identifier, the same read
 * `motilalDemat.mjs` makes. Everything else is a company's security, and the two
 * refinements below are taken from what the NAME ITSELF declares rather than
 * from the price or from any outside knowledge of what trades where:
 *
 *   PRIVATE LIMITED — a private company's shares cannot be listed, by
 *                     definition. Sixteen rows here.
 *   PREF            — a preference share is a different instrument from the
 *                     ordinary share and none of these are exchange-traded;
 *                     every one is carried at par above, which is the
 *                     corroboration rather than the reason.
 *
 * A public company's ordinary share stays `Equity` even where the depository
 * prices it at par — National Stock Exchange of India Ltd is exactly that. The
 * class says what the instrument IS; the absent price says the depository does
 * not mark it, and those are two different statements.
 */
export function assetClassOf(isin, name) {
  if (/^INF/i.test(isin)) return "AIF";
  const t = String(name ?? "").toUpperCase();
  if (/\bPRIVATE\s+LIMITED\b/.test(t)) return "Unlisted";
  if (/\bPREF\b/.test(t)) return "Unlisted";
  return "Equity";
}

/** A row's items with their coordinates, sorted left to right. */
const itemsOf = (row) =>
  (row.items ?? [])
    .map((c) => ({ x: c.x ?? 0, y: c.y ?? row.y ?? 0, text: String(c.text ?? "").trim() }))
    .filter((c) => c.text)
    .sort((a, b) => a.x - b.x);

/**
 * COLUMN BOUNDARIES FROM THE HEADER'S OWN X POSITIONS.
 *
 * The header prints `ISIN Code` at x22, `Scrip Name` at x91, `Account
 * Description` at x337, `Balance` at x463 and `Value (Rs.)` at x534, and the two
 * money columns are RIGHT-aligned so their left edges move with the width of
 * each figure — balances span x442-470 and values x508-572. A fixed boundary
 * would be a guess about the widest figure a future statement carries; the
 * midpoint between the two header labels is derived from the document.
 *
 * Returns null where the header is not found, so a layout change is reported as
 * a header that did not match rather than as columns read at the wrong x.
 */
export function bandsFromHeader(pages) {
  for (const [pageIndex, page] of pages.entries()) {
    for (const row of page.rows ?? []) {
      const it = itemsOf(row);
      const at = (re) => it.find((c) => re.test(c.text))?.x ?? null;
      const isin = at(/^ISIN\s*Code$/i);
      const name = at(/^Scrip\s*Name$/i);
      const bal = at(/^Balance$/i);
      const val = at(/^Value\s*\(Rs\.?\)$/i);
      if (isin == null || name == null || bal == null || val == null) continue;
      /**
       * `Account` and `Description` are printed on their own two lines, one
       * above the header row and one below it, because the label is too wide for
       * its column. It is looked for across the whole page rather than on the
       * header line, and the band still comes from a HEADER WORD's x — never
       * from the x of a data cell, which would move with the widest row.
       */
      const desc = pages.flatMap((pg) => pg.rows ?? [])
        .flatMap((r) => itemsOf(r))
        .find((c) => /^(Account|Description)$/i.test(c.text) && c.x > name && c.x < bal)?.x ?? null;
      if (desc == null) continue;
      /**
       * WHERE THE TABLE ENDS, from the document's own total row.
       *
       * The last record has no anchor below it, so without a terminator the
       * nearest-anchor assignment hands it every line to the bottom of the page:
       * Zenith Leisure Holidays came back named `ZENITH LEISURE HOLIDAYS LIMITED
       * - EQ Total Value of Holding ( Prices as on 30-Mar-2026 ) Rs.
       * 124,799,000,337.69 This is a computer generated report …`, and that
       * string became its securityKey. Same failure as the letterhead above it,
       * at the other end of the table, and the same fix: the body is bounded by
       * the document's own furniture rather than by a distance nobody printed.
       */
      const footY = pages.flatMap((pg, pi) => (pg.rows ?? []).map((r) => ({ pi, r })))
        .find(({ r }) => itemsOf(r).some((c) => /^Total\s+Value\s+of\s+Holding\b/i.test(c.text)));
      return {
        name: [name - 10, desc - 6],
        desc: [desc - 6, bal - 40],
        // Values and balances are the only numbers to the right of the
        // description column; the split is the midpoint of the two header words.
        balance: [bal - 40, (bal + val) / 2],
        value: [(bal + val) / 2, Infinity],
        header: { isin, name, desc, bal, val, page: pageIndex, y: row.y ?? null },
        footer: footY ? { page: footY.pi, y: footY.r.y ?? null } : null,
      };
    }
  }
  return null;
}

/**
 * Every line of the table, flattened, with the ISIN-bearing lines marked.
 *
 * The pages are walked in order and rows within a page in printed order, so the
 * y values are comparable within a page and never across one — which is why the
 * page index rides along and the nearest-anchor search below is confined to it.
 */
function tableLines(pages, bands) {
  const lines = [];
  pages.forEach((page, pi) => {
    for (const row of page.rows ?? []) {
      const it = itemsOf(row);
      if (!it.length) continue;
      const y = row.y ?? it[0].y ?? 0;
      /**
       * THE TABLE STARTS BELOW ITS OWN HEADER, and that is load-bearing.
       *
       * The letterhead and the investor block sit in the same x band as the
       * scrip names, so without this the first holding on page 1 came back named
       * `ICICI BANK LIMITED DP ID : IN302902 ICICI BANK` — the bank's own address
       * absorbed into the nearest record, and Assetgro Fintech's real name lost
       * with it. y DESCENDS down the page, so "below the header" is a SMALLER y.
       */
      if (pi === bands.header.page && bands.header.y != null && y >= bands.header.y) continue;
      // ...and at the total row, on whichever page carries it.
      const f = bands.footer;
      if (f && f.y != null && (pi > f.page || (pi === f.page && y <= f.y))) continue;
      const first = it[0];
      const isin = first.x < bands.name[0] && ISIN_RE.test(first.text) ? first.text : null;
      lines.push({ page: pi, y, items: it, isin });
    }
  });
  return lines;
}

/** Text of the items falling in a band, left to right. */
const inBand = (items, [lo, hi]) =>
  items.filter((c) => c.x >= lo && c.x < hi).map((c) => c.text);

export function extract({ grid, meta = {} }) {
  const warnings = [];
  const pages = grid?.pages ?? [];
  const text = pages.map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
  if (!LETTERHEAD.test(text)) return null;
  if (!/Statement\s+of\s+Holding/i.test(text)) return null;

  // ── identity, from inside the page ────────────────────────────────────────
  const clientId = (/\bClient\s*Id\s+(\d{6,})/i.exec(text) ?? [])[1] ?? null;
  const dpId = (/DP\s*ID\s*:\s*(IN\d{6})/i.exec(text) ?? [])[1] ?? null;
  const holderName = (/\bName\s+([A-Z][A-Z .]+?)\s+Client\s*Id\b/.exec(text) ?? [])[1]?.trim() ?? null;
  const category = (/\bCategory\s+(.+?)\s+Status\b/.exec(text) ?? [])[1]?.trim() ?? null;
  const acType = (/\bType\s*\/\s*Sub\s*Type\s+(.+?)\s+BSDA\b/.exec(text) ?? [])[1]?.trim() ?? null;

  if (!clientId) {
    warn(warnings, "client-id-not-read",
      "no `Client Id` on the page — the account cannot be keyed, and the FILE NAME is not a substitute");
  }

  /**
   * THE STATEMENT DATE IS THE TITLE'S, NOT THE PRICE DATE'S.
   *
   * The heading reads `Statement of Holding 31-Mar-2026` and the total row reads
   * `Total Value of Holding ( Prices as on 30-Mar-2026 )`. Those are two
   * different facts: the holdings are as at the 31st and the marks are the
   * 30th's close. `asOf` is the holdings date, because that is what the account
   * registry means by it; the price date is carried separately so the one-day
   * skew is visible rather than assumed away.
   */
  const asOf = toIso((/Statement\s+of\s+Holding\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(text) ?? [])[1]);
  const priceAsOf = toIso((/Prices\s+as\s+on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(text) ?? [])[1]);
  if (asOf && priceAsOf && asOf !== priceAsOf) {
    warn(warnings, "price-date-precedes-holding-date",
      `the holdings are stated as at ${asOf} and every mark on them is the close of ${priceAsOf}. `
      + "Both dates are the statement's own; the account is dated by its holdings and the price date is recorded here.");
  }

  /**
   * `resolveOwner` returns the registry ENTRY, not a name — the same shape
   * `motilalDemat.mjs` unpacks. Destructured as `{ owner, ownerId }` it puts the
   * whole object in `owner` and leaves `ownerId` undefined, and the account then
   * reaches `build-book` resolving to nobody. It was excluded with the reason
   * printed rather than carried under a name nothing matched, which is the
   * registry rule doing its job on a bug rather than on a document.
   */
  const resolved = resolveOwner(holderName)?.owner ?? null;
  const owner = resolved?.displayName ?? null;
  const ownerId = resolved?.ownerId ?? null;
  if (!owner) {
    warn(warnings, "owner-unresolved",
      `\`Name ${holderName ?? "(not read)"}\` matches no canonical owner in shared/owners.mjs`);
  }

  const base = {
    provider: PROVIDER,
    accountNo: clientId,
    owner,
    ownerId,
    asOf,
    priceAsOf,
    reportType: "holdings",
    engagement: "Direct",
    providerEngagement: `NSDL depository account at ${dpId ?? "DP not read"} — ${[category, acType].filter(Boolean).join(", ") || "type not read"}`,
    warnings,
  };

  return { ...base, ...readHoldings(pages, text, meta, warnings) };
}

function readHoldings(pages, text, meta, warnings) {
  const source = meta.docKey ?? null;
  const bands = bandsFromHeader(pages);
  if (!bands) {
    warn(warnings, "header-not-matched",
      "the `ISIN Code | Scrip Name | Balance | Value (Rs.)` header row was not found, so no column boundary "
      + "could be derived from the document. Nothing is read rather than reading columns at a guessed x.");
    return { holdings: [], totals: makeTotals({ positionCount: 0, source }), printedTotalValuation: null };
  }

  const lines = tableLines(pages, bands);
  const anchors = lines.filter((l) => l.isin);

  /**
   * EVERY NON-ANCHOR LINE JOINS ITS NEAREST ANCHOR, BY Y AND WITHIN ITS PAGE.
   *
   * A wrapped cell is drawn above or below the line carrying the ISIN, so a line
   * between two anchors could belong to either. Nearest-by-y decides it from the
   * geometry: the gaps within a record on this statement are 4.6-9.6pt and the
   * gaps between records 15-21pt, so no assignment here is close. A line that is
   * nearer the record above than the record below belongs to the record above,
   * which is the whole of the rule.
   */
  const parts = new Map(anchors.map((a) => [a, [a]]));
  for (const line of lines) {
    if (line.isin) continue;
    let best = null, bestD = Infinity;
    for (const a of anchors) {
      if (a.page !== line.page) continue;
      const d = Math.abs(a.y - line.y);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best) parts.get(best).push(line);
  }

  const holdings = [];
  const unpriced = { declared: [], scheme: [], par: [] };
  const stitched = [];
  const printedValues = [];
  let unstitchable = 0;

  for (const anchor of anchors) {
    // Reading order within a record: down the page, then left to right.
    const record = parts.get(anchor).sort((a, b) => b.y - a.y || 0);
    const isin = anchor.isin;
    const name = record.flatMap((l) => inBand(l.items, bands.name)).join(" ").replace(/\s+/g, " ").trim();

    const balances = inBand(anchor.items, bands.balance);
    const quantity = n(balances[0] ?? null);

    /**
     * THE VALUE, STITCHED ONLY WHERE THE JOIN IS ONE WELL-FORMED NUMBER.
     *
     * Polycab's `123,512,419,665.00` is drawn as `123,512,419,665.0` on one line
     * and `0` on the next. Concatenated in reading order the join parses as a
     * single grouped figure and reproduces the statement's printed grand total
     * to the rupee; any join that does not parse is refused and the row carries
     * no value, because a figure assembled out of two numbers that were never
     * one is exactly the wrong answer that looks right.
     */
    const onAnchor = inBand(anchor.items, bands.value);
    let value = null;
    if (onAnchor.length === 1) {
      value = n(onAnchor[0]);
    } else {
      const frags = record.flatMap((l) => inBand(l.items, bands.value));
      if (frags.length > 1) {
        const joined = frags.join("");
        const parsed = n(joined);
        if (parsed !== null) {
          value = parsed;
          stitched.push(`${name || isin}: ${frags.join(" + ")} -> ${joined}`);
        } else {
          unstitchable++;
          warn(warnings, "value-fragments-not-one-number",
            `${name || isin} prints its value across ${frags.length} fragment(s) (${frags.join(" | ")}) `
            + "and the join is not a well-formed number, so the row carries NO value rather than a figure "
            + "assembled from parts that may not belong together.");
        }
      } else if (frags.length === 1) {
        value = n(frags[0]);
      }
    }

    if (quantity == null) {
      warn(warnings, "balance-not-read",
        `${name || isin} carries no readable balance in the \`Balance\` column, so the row is not carried.`);
      continue;
    }

    const face = faceValueBasis({ isin, name, quantity, value });
    /**
     * WHAT THE STATEMENT PRINTED, kept before the face-value decision drops it.
     *
     * The check below is against the document's own grand total, and it has to
     * be struck on every row the document printed — including the ones this
     * reader deliberately refuses to carry a value for. Reading it back off the
     * holdings would make the check agree with itself by construction.
     */
    if (value != null) printedValues.push(value);
    const label = `${name || isin} (${quantity} at ${face?.price?.toFixed(4) ?? "—"})`;
    if (face) unpriced[face.tier].push(label);

    holdings.push(makeHolding({
      security: name || isin,
      isin,
      assetClass: assetClassOf(isin, name),
      quantity,
      /**
       * NO RATE COLUMN EXISTS ON THIS DOCUMENT, so the value is the primitive
       * and `deriveHolding` adopts it with `marketValueFromPrinted` set — the
       * path CLAUDE.md already names for a holding reported by value only. A
       * per-unit price is NOT synthesised from it and handed back as if the
       * statement had printed one.
       */
      marketPrice: null,
      marketValue: face ? null : value,
      /** What the depository DID print, so the archive shows the document. */
      faceValue: face ? face.price : null,
      source,
    }));
  }

  if (!holdings.length) {
    warn(warnings, "no-holding-rows",
      "no line carried an ISIN in the `ISIN Code` column; nothing is read rather than reading the wrong columns");
  }
  if (stitched.length) {
    warn(warnings, "value-stitched-across-lines",
      `${stitched.length} value(s) are printed across two lines because the figure is wider than its column, `
      + `and are joined only because each join parses as one number — ${stitched.join("; ")}.`);
  }

  for (const [tier, rows] of Object.entries(unpriced)) {
    if (!rows.length) continue;
    const why = {
      declared: "the SCRIP NAME declares this face value and the printed value divided by the balance is exactly it",
      scheme: "the identifier is an `INF` fund or AIF scheme and the implied price is exactly a unit's issue price, never a NAV",
      par: "the implied price is exactly a face-value denomination with no paise, on a name that declares none",
    }[tier];
    warn(warnings, `value-is-face-value-${tier}`,
      `${rows.length} holding(s) carry units and NO market value, because ${why}. A depository records the `
      + `value a security was allotted at where it has no price for it, and multiplying by that produces a `
      + `valuation nobody struck — National Stock Exchange of India Ltd at Re 1 a share is the plainest case. `
      + `Rows: ${rows.join("; ")}.`);
  }

  // (a) in miniature. The printed grand total is the CHECK on the rows read,
  // and it is the only independent evidence that the stitched value is right.
  // Bounded rather than negated: the label reads `Total Value of Holding
  // ( Prices as on 30-Mar-2026 ) Rs. 124,799,000,337.69`, and a `[^R]*` gap
  // under the `i` flag also excludes the lowercase `r` in "Prices", so it never
  // matched and the statement's own total silently read as absent.
  const printedTotal = n((/Total\s+Value\s+of\s+Holding\b[\s\S]{0,80}?\bRs\.?\s*([\d,]+\.\d\d)/i.exec(text) ?? [])[1]);
  const rowSum = printedValues.reduce((t, v) => t + v, 0);
  if (printedTotal != null && Math.abs(rowSum - printedTotal) > 1) {
    warn(warnings, "rows-do-not-sum-to-printed-total",
      `the rows read sum to ${rowSum.toFixed(2)} against a printed \`Total Value of Holding\` of ${printedTotal.toFixed(2)} `
      + `— a difference of ${(rowSum - printedTotal).toFixed(2)}. The sum here restores the face values the book `
      + "does not carry, so that it is comparable with what the statement printed.");
  }

  const priced = holdings.filter((h) => h.printed?.marketValue != null);
  return {
    holdings,
    totals: makeTotals({
      totalMarketValue: priced.length ? priced.reduce((t, h) => t + h.printed.marketValue, 0) : null,
      positionCount: holdings.length,
      source,
    }),
    printedTotalValuation: printedTotal,
  };
}
