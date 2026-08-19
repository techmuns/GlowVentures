// MOTILAL OSWAL FINANCIAL SERVICES — the family's own CDSL demat accounts.
//
// Twelve documents, SEVEN accounts, and almost nothing about them is what the
// file names say. This reader exists because the client's consolidated review
// carries ₹21.64 Cr of "Direct Equity - MO" plus the gold and silver ETFs, the
// arbitrage funds and the hybrid funds, and no other statement in this drop
// reports any of it.
//
// ── THE FILE NAME IS NOT THE ACCOUNT, AND HERE IT IS WRONG THREE TIMES ──────
//
// `H46082_Aarti Ajay Jaisinghani_Transation 1.pdf` is AJAY's account 37359311.
// `H43383 -BHARAT JAISINGHANI FAMILY TRUST_Transaction.pdf` is BHARAT's 12838320.
// `H46082_Aarti Ajay Jaisinghani_Transation.pdf` is account 32387399, the one the
// OTHER file names call the family trust. Every one of those would have filed a
// statement under the wrong member. The account is the `Client ID:` the page
// prints, and nothing else — the same rule that made `rekey()` necessary when a
// Goldstandard fact sheet named `G100023_…` printed `Account: 100022`.
//
// ── AND THE UCC IS NOT THE ACCOUNT EITHER ───────────────────────────────────
//
// Ajay's UCC H19119 covers TWO demat accounts: 37359311, which holds his AIF
// units, and 12539150, which is the one his Delphi and Hedged Equity statements
// print as their depository account. Keying on the UCC would merge them.
//
// ── WHAT THIS DOCUMENT CAN AND CANNOT BE TRUSTED FOR ────────────────────────
//
// Its own three columns do not agree, and which one to believe had to be
// MEASURED rather than assumed:
//
//   Birla Cable   11,900.000 units   rate 170.600   printed value 34,120.00
//
// 11,900 × 170.60 is 20,30,140, and the printed value implies ₹2.87 a share for
// a stock the same row prices at ₹170.60. That is not an extraction artifact —
// the row is four text items on one line and there is nothing else on it. It
// happens on 22 of 67 rows across the five statements.
//
// THE PRINTED VALUE COLUMN TIES TO THE PRINTED TOTAL, TO THE RUPEE, on all five
// documents. So the depository stands behind it, and it is still the column
// that cannot be used: it implies impossible prices. What settles it is the
// family's own consolidated review, which is independent of both:
//
//   PG Electroplast   demat 180,000 units × 502.200 = ₹9.04 Cr
//                     review 180,000 units at ₹10.04 Cr as on 30 Jun
//   Onesource         demat  48,000 × 1,792.850 = ₹8.61 Cr
//                     review 91,000 sh at ₹15.03 Cr → ₹1,651/sh
//   Birla Cable       demat  11,900 × 170.600 = ₹0.20 Cr
//                     review 15,193 sh at ₹0.31 Cr → ₹205.8/sh
//
// Quantities match exactly where the holders line up and every derived price is
// within ordinary drift of the review's. So QUANTITY and RATE are the
// primitives, market value is DERIVED, and the printed value goes to
// `printed.marketValue` where the reconciler reports it — rule 3 and rule 4,
// applied to a document whose own arithmetic is broken.
//
// ── A RATE OF 0.000 IS NOT PRICED, AND IS NULL ──────────────────────────────
//
// Fifteen rows print `0.000` in the rate column and `0.00` in the value column —
// the unlisted names (National Stock Exchange, Cheelizza, Clean Max) and the AIF
// units the depository does not mark. Read as zero they would each contribute a
// measured ₹0 to an account total and report the whole cost as a loss. They
// carry no market value and the account names them.
//
// ── THE RATE ALSO CONTRADICTS ITSELF ACROSS ACCOUNTS, AND THAT IS REPORTED ──
//
// The same ISIN on the same date carries two different rates on two members'
// statements — Helios 15.740 / 14.180, ICICI IOPPF 39.290 / 40.250, DSP Gold
// 151.100 / 141.240, ICICI Liquid 394.625 / 409.572. Nothing here reconciles
// them; each account is carried on the rate ITS OWN statement prints, and the
// disagreement is a warning rather than an average nobody published.
//
// ── THE MASKED PAN IS A CHECK, NOT AN IDENTIFIER ────────────────────────────
//
// Every account prints `PAN No: AAXXX-XX-9J` — three characters of ten. That
// cannot resolve an owner, but it can REFUSE one, and on this drop it does:
// account 32387399 prints `Client Name: AARTI AJAY JAISINGHANI` with
// `AAXXX-XX-8H`, and Aarti's PAN is AFIPJ4151N. The name says Aarti, the PAN
// says not-Aarti, and the file name says a family trust whose two known PANs
// (…3D and …4G) it does not match either. Three identifiers, three answers.
// The account is EXCLUDED with the reason rather than attributed to a guess,
// by the same mechanism that held folio 1000633 out until its password arrived.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, makeTransaction } from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";
import { OWNERS, resolveOwner } from "../../../shared/owners.mjs";

export const PROVIDER = "Motilal Oswal Financial Services (demat)";

const n = (v) => (v == null ? null : parseNum(String(v)));
const warn = (warnings, code, detail) => warnings.push({ code, detail });

/**
 * COLUMN BANDS, from the header's own x positions.
 *
 * The header is three printed lines — `ISIN | ISIN NAME | FREE BAL. | PLEDGE /
 * PLEDGED SETUP | PLEDGEE REPLEDGE | EARMARK LOCKIN + FREEZE | SAFE / DEMAT +
 * REMAT | PENDING BAL | TOTAL HOLDING | Rs RATE | Rs VALUE` — and every data row
 * wraps onto two further lines whose zeros sit under the middle columns. Only
 * three columns are read, and each is taken from the band its own header word
 * occupies, never by counting items along the line: the wrap lines carry four
 * more numbers and a positional read would take them.
 */
const BAND = {
  isin: [20, 80],
  name: [80, 188],
  quantity: [415, 470],   // TOTAL HOLDING  (header "TOTAL" 429.6 / "HOLDING" 426.6)
  rate: [470, 505],       // Rs RATE        (header "Rs" 478.6 / "RATE" 475.1)
  value: [505, 620],      // Rs VALUE — right-aligned, so its left edge moves with width
};
const ISIN_RE = /^IN[EF][A-Z0-9]{9}$/;

/**
 * The row's own text items, with their x positions — NOT `row.cells`.
 *
 * `inferColumns` cannot find this table's boundaries: every data row wraps onto
 * two further lines that carry only the middle columns, so the horizontal
 * occupancy histogram never sees a clean corridor and the whole row comes back
 * as ONE cell. `row.items` is the measurement underneath that inference and it
 * is exact — each figure with the x it was printed at. The bands below then do
 * the column assignment from the header's own coordinates, which is the same
 * discipline `bandToHeader` applies to the fact sheet's two-column layout.
 */
function cellsOf(row) {
  return (row.items ?? [])
    .map((c) => ({ x: c.x ?? 0, text: String(c.text ?? "").trim() }))
    .filter((c) => c.text)
    .sort((a, b) => a.x - b.x);
}
const inBand = (cells, [lo, hi]) => cells.find((c) => c.x >= lo && c.x < hi)?.text ?? null;

/**
 * A rate of exactly zero means the depository holds no price for the security,
 * not that the security is worthless. Null, and the row carries no value.
 */
const rateOrNull = (v) => {
  const r = n(v);
  return r == null || r === 0 ? null : r;
};

/**
 * WHAT THE INSTRUMENT IS, from the ISIN's own third character.
 *
 * India's numbering has `INE` for a company's securities and `INF` for a mutual
 * fund or AIF scheme. That is a fact about the identifier, not a guess about the
 * name — which matters, because these names are clipped to the column
 * (`ICICI NFT NT 50 DP G`, `WOC MAAF D-GROW`) and would not survive a keyword
 * rule. Within `INF` the two refinements are narrow and are the only ones the
 * evidence supports: an ETF says so in its own name, and an AIF is recognised
 * from the committed register below rather than from a pattern.
 */
function assetClassOf(isin, name, isAif) {
  if (isAif) return "AIF";
  if (/^INE/.test(isin)) return "Equity";
  if (/\bETF\b|BEES/i.test(name ?? "")) return "ETF";
  return "Mutual Fund";
}

/**
 * THE AIF UNITS ON A DEMAT STATEMENT, AND WHICH FOLIO ALREADY REPORTS THEM.
 *
 * A depository holds the units; the fund publishes what they are worth. Every
 * entry here is a security this book ALREADY carries from the fund's own
 * statement at the fund's own NAV — so carrying the demat row too would count
 * the same money twice and mark it at a rate the depository admits it does not
 * have (all but one of these print 100.000, the face value, or 0.000).
 *
 * `reportedBy` is the account in the book that carries it. It is a COMMITTED
 * decision, one line per security per holder, and `build-book` verifies each
 * against that account's own unit count rather than trusting this table: a
 * mismatch is reported, never silently dropped or silently doubled.
 *
 * An `INF` row that is NOT here is carried, because nothing else reports it.
 */
export const AIF_UNITS = {
  INF0R4I22066: { name: "3P India Equity Fund 1 — Class B3", reportedBy: "3P Investment Managers" },
  INF0RRI22040: { name: "Buoyant Opportunities Strategy — Class A4", reportedBy: "Buoyant Capital" },
  INF0ROG22363: { name: "Carnelian Bharat Amritkaal Fund — Class A2", reportedBy: "Carnelian Bharat Amritkaal Fund" },
  INF15Q422013: { name: "Baring Private Equity India Fund 6 — Class A1", reportedBy: "Baring Private Equity India Fund" },
  INF1ISW22079: { name: "Sanshi Fund-I — Class E", reportedBy: "Sanshi Fund" },
  INF0XAZ22055: { name: "India SME Investments Fund II — Class A2", reportedBy: "India SME Investments" },
  INF0RRH22DW6: { name: "Motilal Oswal Founders Fund Series II — Class G1", reportedBy: "Motilal Oswal Founders Fund" },
  INF0VIS22016: { name: "Transition Venture Capital Fund I — Class A1", reportedBy: "Transition Venture Capital" },
  // Recognised as AIF units, reported by NOTHING in this drop, so they are
  // CARRIED. Named here so the class is right and so a future drop that brings
  // their fund statements has one place to record the join.
  INF0RW922016: { name: "ITF — Class A", reportedBy: null },
  INF0RSB22019: { name: "TOCF-I — Class A2", reportedBy: null },
  INF0UXX22017: { name: "PVC-II — Class A1", reportedBy: null },
  INF2O4Z22020: { name: "VOF I — Class A2", reportedBy: null },
  INF0VGG22429: { name: "BAVF Series 20 — Class C6", reportedBy: null },
};

/** `AAXXX-XX-9J` against a registry PAN — three characters of ten. */
export function maskedPanMatches(masked, pan) {
  const m = /^([A-Z]{2})X{3}-XX-(\d[A-Z])$/.exec(String(masked ?? "").trim().toUpperCase());
  const p = String(pan ?? "").trim().toUpperCase();
  if (!m || !/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) return null;   // cannot be checked
  return p.startsWith(m[1]) && p.endsWith(m[2]);
}

/**
 * The owner, and whether the printed PAN AGREES with it.
 *
 * The name resolves through the ordinary registry. The masked PAN then has one
 * job: to refuse a resolution it contradicts. It can never confirm one on its
 * own — three characters are not an identity — so an account whose holder is
 * not in the registry at all stays unresolved exactly as it would elsewhere.
 */
function investor(name, maskedPan) {
  const { owner, matchedBy } = resolveOwner(name);
  if (!owner) return { owner: null, ownerId: null, panAgrees: null, matchedBy: null };
  const pans = OWNERS.find((o) => o.ownerId === owner.ownerId)?.pans ?? [];
  const checks = pans.map((p) => maskedPanMatches(maskedPan, p)).filter((v) => v !== null);
  return {
    owner: owner.displayName,
    ownerId: owner.ownerId,
    // null when the registry holds no PAN for this holder — unchecked, not failed.
    panAgrees: checks.length ? checks.some(Boolean) : null,
    matchedBy,
  };
}

const FIELD = (text, label, stop = "\\s{2,}|$") =>
  (new RegExp(`${label}\\s*:?\\s*(.+?)(?=${stop})`, "m").exec(text) ?? [])[1]?.trim() ?? null;

/** Which of the two documents is this? The page says, in its own heading. */
export function reportTypeOf(text) {
  if (/DP Holdings As On/i.test(text)) return "holdings";
  if (/STATEMENT OF ACCOUNT FOR THE PERIOD/i.test(text)) return "demat-transactions";
  if (/NO HOLDING IS AVAILABLE AS ON/i.test(text)) return "holdings";
  return null;
}

/** `16-04-2026 CA-Redemption of AIF units DEBIT 199990.001 0.000` */
const TXN_ROW = new RegExp(
  String.raw`^(\d{2}-\d{2}-\d{4})\s+` +          // 1 date
  String.raw`(.+?)\s+` +                         // 2 particulars
  String.raw`(CREDIT|DEBIT|CR PSB|DR PSB)\s+` +  // 3 direction
  String.raw`([\d,]+\.\d{3})\s+` +               // 4 quantity
  String.raw`([\d,]+\.\d{3})\s*$`,               // 5 running balance
);

export function extract({ grid, meta = {} }) {
  const warnings = [];
  const pages = grid?.pages ?? [];
  const text = pages.map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
  if (!/Motilal Oswal Financial Services Limited/i.test(text)) return null;
  const reportType = reportTypeOf(text);
  if (!reportType) return null;

  // ── identity, from inside the page ────────────────────────────────────────
  const clientId = (/Client ID:\s*(\d{10,})/i.exec(text) ?? [])[1] ?? null;
  const ucc = (/UCC Code:\s*(\S+)/i.exec(text) ?? [])[1] ?? null;
  const holderName = (/Client Name:\s*([A-Z][A-Z .]*?)\s+PAN No:/.exec(text) ?? [])[1]?.trim() ?? null;
  const maskedPan = (/PAN No:\s*([A-Z]{2}X{3}-XX-\d[A-Z])/.exec(text) ?? [])[1] ?? null;
  const acType = (/A\/C Type:\s*([A-Za-z-]+)/.exec(text) ?? [])[1] ?? null;
  const second = FIELD(text, "Second Holder");
  const third = FIELD(text, "Third Holder");

  if (!clientId) warn(warnings, "client-id-not-read", "no `Client ID:` on the page — the account cannot be keyed, and the FILE NAME is not a substitute: three of these twelve name the wrong member");

  const { owner, ownerId, panAgrees } = investor(holderName, maskedPan);
  if (!owner) {
    warn(warnings, "owner-unresolved",
      `\`Client Name: ${holderName ?? "(not read)"}\` matches no canonical owner`);
  } else if (panAgrees === false) {
    warn(warnings, "pan-contradicts-name",
      `the page prints \`Client Name: ${holderName}\` with \`PAN No: ${maskedPan}\`, and ${owner}'s PAN in the registry does not end that way. The name and the PAN name different taxpayers, so the account is not attributed to either.`);
  }

  const asOf = reportType === "holdings"
    ? toIso((/DP Holdings As On:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]?.replace(/\//g, "-"))
      // An empty account states its date in the sentence that says it is empty.
      ?? toIso((/NO HOLDING IS AVAILABLE AS ON\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]?.replace(/\//g, "-"))
    : toIso((/PERIOD FROM:\s*\S+\s*TO:\s*(\d{2}-\d{2}-\d{4})/i.exec(text) ?? [])[1]);
  const periodFrom = reportType === "demat-transactions"
    ? toIso((/PERIOD FROM:\s*(\d{2}-\d{2}-\d{4})/i.exec(text) ?? [])[1]) : null;

  /**
   * A CONTRADICTION EXCLUDES THE ACCOUNT, AND IT HAS TO SAY SO EXPLICITLY.
   *
   * Returning `owner: null` is not enough: `extract.mjs` falls back to the name
   * the classifier read off the flat text, which is the same name the PAN
   * contradicts — so the account came back attributed to Aarti anyway.
   * `excludedFromBook` is the mechanism the HOPE INDIA TRUST folios already use
   * and `build-book` honours it before it resolves an owner at all. The
   * statement stays fully read and fully in the archive; it is only the family
   * total it stays out of, and it returns the moment a PAN settles the holder.
   */
  const excludedFromBook = panAgrees === false
    ? `this account's holder cannot be established: the page prints \`Client Name: ${holderName}\` with \`PAN No: ${maskedPan}\`, which is not ${owner}'s PAN, and the file it arrived in is named for a family trust whose two PANs it does not match either. Three identifiers, three answers — so it is not summed into anybody's total. One line in shared/owners.mjs, once the family names the holder, puts it in the book.`
    : null;

  const base = {
    provider: PROVIDER,
    accountNo: clientId,
    owner: panAgrees === false ? null : owner,
    ownerId: panAgrees === false ? null : ownerId,
    excludedFromBook,
    asOf,
    reportType,
    engagement: "Direct",
    providerEngagement: `CDSL depository account — ${acType ?? "type not read"}`,
    jointHolders: [second, third].filter(Boolean),
    warnings,
  };

  if (reportType === "holdings") return { ...base, ...readHoldings(pages, text, meta, warnings) };
  return { ...base, periodFrom, ...readTransactions(pages, warnings) };
}

function readHoldings(pages, text, meta, warnings) {
  const source = meta.docKey ?? null;
  const holdings = [];
  const unpriced = [];
  const faceValued = [];

  for (const page of pages) {
    for (const row of page.rows ?? []) {
      const cells = cellsOf(row);
      const isin = cells[0]?.text;
      if (!isin || !ISIN_RE.test(isin) || cells[0].x >= BAND.isin[1]) continue;
      const name = inBand(cells, BAND.name);
      const quantity = n(inBand(cells, BAND.quantity));
      const marketPrice = rateOrNull(inBand(cells, BAND.rate));
      const printedValue = n(inBand(cells, BAND.value));
      if (quantity == null) continue;

      const aif = AIF_UNITS[isin] ?? null;
      /**
       * A DEPOSITORY PRINTS A FUND'S FACE VALUE, NOT ITS NAV.
       *
       * Every AIF row on these statements carries a rate of exactly 100.000 or
       * 10.000 — the price the unit was ISSUED at, which is what a depository
       * records and holds forever. It is not a mark, and multiplying by it
       * produces a valuation nobody struck: 3P's units come to ₹34.71 Cr at face
       * against the ₹52.12 Cr the family's own review carries them at, and
       * Buoyant's to ₹34.17 Cr against a folio the fund itself values at
       * ₹49.30 Cr.
       *
       * So an AIF row from this issuer carries its UNITS and no price. Where the
       * fund's own statement is in this book the position comes from there and
       * this row is dropped as a duplicate; where it is not, the units are in the
       * archive and the account says what is missing. That is the same rule as
       * "a depository does not know what shares cost", one column over.
       */
      const priceIsFaceValue = Boolean(aif);
      holdings.push(makeHolding({
        security: aif?.name ?? name,
        isin,
        assetClass: assetClassOf(isin, name, Boolean(aif)),
        quantity,
        marketPrice: priceIsFaceValue ? null : marketPrice,
        /**
         * THE PRINTED VALUE IS THE CHECK, AND ONLY WHERE THERE IS SOMETHING TO
         * CHECK. `makeHolding` files `marketValue` under `printed.*` and
         * `deriveHolding` recomputes it as price x quantity, so a priced row
         * carries both and the delta reaches the reconciler.
         *
         * An UNPRICED row must not pass its printed figure through, because
         * `deriveHolding` adopts the printed value when it has no price — and
         * the depository prints `0.00` beside every `0.000` rate. Adopted, that
         * would put a MEASURED zero on National Stock Exchange and on every AIF
         * unit the depository does not mark. Null, and the holding carries units
         * with no value and says why.
         */
        marketValue: priceIsFaceValue || marketPrice == null ? null : printedValue,
        /** What the depository DID print, so the archive shows the document. */
        faceValue: priceIsFaceValue ? marketPrice : null,
        source,
      }));
      if (priceIsFaceValue) faceValued.push(`${aif.name} (${quantity} units at a face value of ${marketPrice ?? "—"})`);
      else if (marketPrice == null) unpriced.push(`${name} (${isin})`);
    }
  }

  if (!holdings.length) {
    warn(warnings, /NO HOLDING IS AVAILABLE/i.test(text) ? "account-holds-nothing" : "no-holding-rows",
      /NO HOLDING IS AVAILABLE/i.test(text)
        ? "the statement prints `NO HOLDING IS AVAILABLE` — the account is open and empty, and that is a measurement"
        : "no row matched the ISIN column; nothing is read rather than reading the wrong columns");
  }

  // (a2) in miniature, and it must be loud: the statement's own value column
  // disagrees with its own quantity x rate on a third of these rows.
  const printedTotal = n((/Total Holding Valuation\s*:\s*([\d,]+\.\d+)/i.exec(text) ?? [])[1]);
  const disagree = holdings.filter((h) =>
    h.quantity != null && h.marketPrice != null && h.printed?.marketValue != null &&
    Math.abs(h.quantity * h.marketPrice - h.printed.marketValue) > Math.max(1, h.printed.marketValue * 1e-4));
  if (disagree.length) {
    warn(warnings, "printed-value-not-quantity-times-rate",
      `${disagree.length} of ${holdings.length} row(s) print a value that is not their own quantity x rate — e.g. ${disagree[0].security} at ${disagree[0].quantity} x ${disagree[0].marketPrice} = ${(disagree[0].quantity * disagree[0].marketPrice).toFixed(2)} against a printed ${disagree[0].printed.marketValue}. The printed column sums to the printed total exactly and still implies impossible prices, so market value is DERIVED and the printed figure is kept only as the check.`);
  }
  if (faceValued.length) {
    warn(warnings, "aif-units-carry-face-value-not-nav",
      `${faceValued.length} AIF holding(s) are carried with units and NO market value, because the rate this statement prints for them is the FACE VALUE the units were issued at rather than a NAV — ${faceValued.slice(0, 3).join("; ")}${faceValued.length > 3 ? "; …" : ""}. Where the fund itself issues a statement in this book, that is where the valuation comes from.`);
  }
  if (unpriced.length) {
    warn(warnings, "no-rate-published",
      `the depository prints no rate for ${unpriced.length} holding(s) — ${unpriced.slice(0, 4).join(", ")}${unpriced.length > 4 ? ", …" : ""}. A rate of 0.000 is read as NOT PRICED, never as a price of zero, so these carry units and no market value.`);
  }

  const priced = holdings.filter((h) => h.quantity != null && h.marketPrice != null);
  return {
    holdings,
    totals: makeTotals({
      totalMarketValue: priced.length ? priced.reduce((t, h) => t + h.quantity * h.marketPrice, 0) : null,
      positionCount: holdings.length,
      source,
    }),
    printedTotalValuation: printedTotal,
  };
}

/**
 * The transaction tape — one block per ISIN, each with an opening balance, its
 * dated movements and a closing balance.
 *
 * THE CLOSING BALANCE IS A QUANTITY AT THE PERIOD END, and it is the only thing
 * this book has for account 12539150, whose holding statement is not in the
 * drop. It is carried as `positionsAsOf` rather than as holdings, the same
 * separation `lkpSecurities.mjs` makes: a quantity with no price is not a
 * valuation, and merging one into the holdings table would produce a position
 * that looks marked and is not.
 */
function readTransactions(pages, warnings) {
  const lines = pages.flatMap((p) => p.text.split("\n")).map((l) => l.replace(/[ \t]+/g, " ").trim());
  const transactions = [];
  const positionsAsOf = [];
  let isin = null, name = null, opening = null;

  for (const line of lines) {
    const mIsin = /^ISIN:\s*(IN[EF][A-Z0-9]{9})\b/.exec(line);
    if (mIsin) { isin = mIsin[1]; name = null; opening = null; continue; }
    const mName = /^ISIN NAME:\s*(.+)$/.exec(line);
    if (mName) { name = mName[1].trim(); continue; }
    const mOpen = /^Opening Balance\s+([\d,]+\.\d{3})$/.exec(line);
    if (mOpen) { opening = n(mOpen[1]); continue; }
    const mClose = /^Closing Balance\s+([\d,]+\.\d{3})$/.exec(line);
    if (mClose && isin) {
      positionsAsOf.push({ isin, security: name, opening, quantity: n(mClose[1]) });
      continue;
    }
    const m = TXN_ROW.exec(line);
    if (!m || !isin) continue;
    const [, date, particulars, dir, qty, balance] = m;
    transactions.push(makeTransaction({
      date: toIso(date),
      security: name,
      isin,
      // A depository movement is not a trade: there is no price and no
      // consideration on this document, only units in or units out. `side` says
      // which direction the SHARES went, and no settlement figure is invented.
      side: /^(CREDIT|CR PSB)$/i.test(dir) ? "receipt" : "delivery",
      quantity: n(qty),
      description: `${particulars.trim()} — balance ${balance}`,
    }));
  }

  if (!transactions.length && !positionsAsOf.length) {
    warn(warnings, "no-transaction-rows", "no `date … CREDIT/DEBIT … quantity balance` row matched on this statement");
  }
  warn(warnings, "depository-movements-are-not-trades",
    `${transactions.length} depository movement(s) read. A demat credit or debit carries units and no price, so none of these is a trade and none contributes a settlement, a cost or a realised gain.`);

  return { transactions, positionsAsOf, holdings: [], totals: null };
}
