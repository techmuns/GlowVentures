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
// ── WHAT THE RATE AND VALUE COLUMNS ARE: THE LAST MOVEMENT, NOT A VALUATION ─
//
// Beside every balance the statement prints `Rs RATE` and `Rs VALUE`. Neither
// is a 31 July valuation, and the rate is not the average cost either. The rate
// is the price of the holding's LAST DEPOSITORY MOVEMENT, and the value is that
// rate times the MOVEMENT's own quantity, not the balance's:
//
//   Axis Bank   7,300 held   rate 1,368.25   value 21,33,101.75
//               value ÷ rate = 1,559, the credit of 2 Jul on this account's
//               own transaction statement
//   HDFC BAF    37,755.485 held   rate 517.054   value ÷ rate = 8,407.246,
//               the DEBIT of 27 Jul — a SALE price standing as the "rate"
//   ICICI Nifty Next 50   0.048 units held, value ₹2.90 Cr — the redemption
//               that left 0.048 units behind, which no reading of the column
//               as a valuation can produce
//
// Measured over all 56 priced rows against the same account's own transaction
// tape, which runs from 1 April: on 30 rows value ÷ rate is exactly the
// quantity of the LAST movement the tape prints (20 a part of the holding, 10
// the whole of it), and the other 26 do not move on the tape at all, so their
// last movement predates it. Not one row contradicts the reading. Seven rates
// are the price of a movement OUT — five sales or redemptions on the tape, and
// two ICICI index funds whose balance (0.048 and 0.629 units) is smaller than
// the movement the value describes.
//
// That is also what made the document look BROKEN. Its value column ties to
// its printed total to the rupee because the total is the sum of those movement
// values, and the "impossible" price it implied — Birla Cable at ₹2.87 a share,
// from 11,900 units and a value of 34,120 — is a last lot of 200 shares at the
// ₹170.60 rate, divided across the whole balance. And one ISIN carrying two
// rates on one date (Helios 15.740 / 14.180, DSP Gold 151.100 / 141.240) is two
// accounts that last moved on different days.
//
// SO NOTHING HERE VALUES A HOLDING WITH THE RATE. A row carries its QUANTITY —
// the primitive the depository stands behind — and the rate and value as
// `lastMovementRate` / `lastMovementValue`: a transaction price a reader can
// see, which `build-book` dates from the tape, and which the live layer uses as
// its witness that a published NAV is on the same unit basis as the balance.
// What values the units is a real current price: the exchange's quote for a
// share or an ETF, the scheme's published NAV for a fund.
//
// THE FIRST READING OF THIS SECTION IS KEPT, IN THE ORDER IT WAS LEARNT. It
// concluded that "QUANTITY and RATE are the primitives, market value is
// DERIVED", so it valued ₹102 Cr of the book at the price of each holding's
// last movement, under a label reading "statement mark, 31 July". It cited the
// family's review as corroboration: PG Electroplast 180,000 × 502.20 = ₹9.04 Cr
// against the review's ₹10.04 Cr on 30 June. A 10% gap in a month is not
// "ordinary drift", and it was the clue — ₹502.20 was the price of the last
// 4,500 shares to move, before April.
//
// ── A RATE OF 0.000 IS NOT PRICED, AND IS NULL ──────────────────────────────
//
// Eleven rows print `0.000` in the rate column and `0.00` in the value column —
// the unlisted names (National Stock Exchange, Cheelizza), Clean Max, three
// mutual-fund lines and the AIF units the depository does not mark. Read as zero they would each contribute a
// measured ₹0 to an account total and report the whole cost as a loss. They
// carry no market value and the account names them.
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
const sum = (xs) => xs.reduce((t, x) => t + (x ?? 0), 0);
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
 *
 * IT IS A REGISTER ABOUT DEPOSITORIES, NOT ABOUT THIS READER. `nsdlDemat.mjs`
 * reads the family's NSDL account at ICICI Bank and hits exactly the same thing
 * — Sanshi's Class A2 and Class E, India SME's Class A2, Sky Capital's Oncare A3
 * — so `dropDepositoryDuplicates` checks BOTH providers against it. It lives
 * here because this is where it was first needed; a third depository is the
 * point at which it should move to `shared/`.
 */
export const AIF_UNITS = {
  INF0R4I22066: { name: "3P India Equity Fund 1 — Class B3", reportedBy: "3P Investment Managers" },
  INF0RRI22040: { name: "Buoyant Opportunities Strategy — Class A4", reportedBy: "Buoyant Capital" },
  INF0ROG22363: { name: "Carnelian Bharat Amritkaal Fund — Class A2", reportedBy: "Carnelian Bharat Amritkaal Fund" },
  INF15Q422013: { name: "Baring Private Equity India Fund 6 — Class A1", reportedBy: "Baring Private Equity India Fund" },
  INF1ISW22038: { name: "Sanshi Fund-I — Class A2", reportedBy: "Sanshi Fund" },
  INF1ISW22079: { name: "Sanshi Fund-I — Class E", reportedBy: "Sanshi Fund" },
  INF1V9N22050: { name: "Sky Capital Rising Titans Fund I — Oncare Class A3", reportedBy: "Sky Capital Rising Titans Fund" },
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
/**
 * A MOVEMENT ROW, AND WHY THE DIRECTION IS NOT READ OFF THE ROW.
 *
 * The block's header is `Date | Transaction Particulars | Credit | Debit |
 * Current Balance` — THREE numeric columns, of which a row fills exactly one of
 * Credit and Debit. Flattened to text only two figures survive, and WHICH of
 * the two money columns the first one sat under is gone with the geometry.
 *
 * The previous pattern stood a literal `CREDIT|DEBIT|CR PSB|DR PSB` token in
 * for it, and that token is printed on a WRAPPED CONTINUATION LINE on most
 * rows (`1201090037205769 CR PSB`) and on no line at all for the rest
 * (`PAYOUT-CR CM M50175 …`). So it matched 14 rows of the 362 these six
 * statements print, and the other 348 — every purchase, every sale, every
 * dividend reinvestment — reached nothing.
 *
 * THE RUNNING BALANCE IS THE WITNESS, and it is a better one than the token
 * ever was: the direction is the SIGN OF ITS OWN CHANGE, which is a primitive
 * the statement prints on every row rather than a label wrapped off the end of
 * one. Measured over all 90 blocks the balance walks from the printed Opening
 * Balance to the printed Closing Balance EXACTLY, 90 of 90, and every
 * particular is consistently in, out or balance-neutral — not one disagrees
 * with its own delta. `readTransactions` refuses a block that does not walk.
 */
const TXN_ROW = new RegExp(
  String.raw`^(\d{2}-\d{2}-\d{4})\s+` +          // 1 date
  String.raw`(.*?)\s+` +                          // 2 particulars
  String.raw`([\d,]+\.\d{3})\s+` +               // 3 quantity (Credit or Debit)
  String.raw`([\d,]+\.\d{3})\s*$`,               // 4 running balance
);

/**
 * WHAT MOVED THE UNITS — the particular, classified.
 *
 * A depository movement carries no price and no counterparty, so none of these
 * is a trade and none of them is called one: they are UNITS IN and UNITS OUT.
 * The four kinds are what a reader adding up their own opening balance needs to
 * tell apart, and an ENCUMBRANCE is the one that must never be counted — a
 * pledge moves units between free and pledged without changing the balance, so
 * summing it as a purchase would report a holding twice its size.
 */
const MOVEMENT_KINDS = [
  // A corporate action is the security itself changing, never a decision the
  // family made. Anchored on the issuer's own `CA-` prefix.
  [/^CA-/i, "corporate-action"],
  // Balance-NEUTRAL by construction, and measured to be: pledge setup and
  // accept, unpledge, and the early-payin reversal and remat pairs.
  [/\b(pledge|unpledge|lock|EP-REVL|EP-IREM)\b/i, "encumbrance"],
  // Units arriving or leaving through the market or another depository.
  [/\b(PAYOUT|INTDEP-CR|ON-CR|Demat)\b/i, "settlement"],
  [/\b(BSEDR|NSEDR|EP-DR|PAYIN|PAY-IN|Remat)\b/i, "settlement"],
];

function movementKind(particulars) {
  for (const [re, kind] of MOVEMENT_KINDS) if (re.test(particulars)) return kind;
  // NAMED rather than folded into settlement: a movement nobody classified is
  // still counted in the in/out totals (the balance proves which way it went)
  // and is reported so the next drop's new wording is a one-line diagnosis.
  return "unclassified";
}

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
  const { periodFrom, periodTo } = reportType === "demat-transactions"
    ? dematPeriod(text) : { periodFrom: null, periodTo: null };

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
  return { ...base, periodFrom, periodTo, ...readTransactions(pages, warnings) };
}

function readHoldings(pages, text, meta, warnings) {
  const source = meta.docKey ?? null;
  const holdings = [];
  const unpriced = [];
  const faceValued = [];
  const lastMoved = [];
  // Every figure the value column prints, AIF rows and all — the completeness
  // witness below, and nothing else.
  const valueColumn = [];

  for (const page of pages) {
    for (const row of page.rows ?? []) {
      const cells = cellsOf(row);
      const isin = cells[0]?.text;
      if (!isin || !ISIN_RE.test(isin) || cells[0].x >= BAND.isin[1]) continue;
      const name = inBand(cells, BAND.name);
      const quantity = n(inBand(cells, BAND.quantity));
      const rate = rateOrNull(inBand(cells, BAND.rate));
      const printedValue = n(inBand(cells, BAND.value));
      if (quantity == null) continue;
      if (printedValue != null) valueColumn.push(printedValue);

      const aif = AIF_UNITS[isin] ?? null;
      /**
       * A DEPOSITORY PRINTS A FUND'S FACE VALUE, NOT ITS NAV.
       *
       * Every AIF row on these statements carries a rate of exactly 100.000 or
       * 10.000 — the price the unit was ISSUED at, which is also the price its
       * last credit went through at, because an AIF's units are allotted at
       * face. It is not a mark, and multiplying by it produces a valuation
       * nobody struck: 3P's units come to ₹34.71 Cr at face against the
       * ₹52.12 Cr the family's own review carries them at, and Buoyant's to
       * ₹34.17 Cr against a folio the fund itself values at ₹49.30 Cr.
       *
       * So an AIF row from this issuer carries its UNITS and no price. Where the
       * fund's own statement is in this book the position comes from there and
       * this row is dropped as a duplicate; where it is not, the units are in the
       * archive and the account says what is missing.
       */
      const priceIsFaceValue = Boolean(aif);
      holdings.push(makeHolding({
        security: aif?.name ?? name,
        isin,
        assetClass: assetClassOf(isin, name, Boolean(aif)),
        quantity,
        /**
         * NEVER A MARKET PRICE, AND NEVER A MARKET VALUE — see the header. The
         * rate is the price of the holding's last movement and the value is that
         * price times the movement's own quantity, so neither describes the
         * balance on the statement's date. `deriveHolding` would adopt a printed
         * value as the market value of a row with no price, which is why the
         * printed figure is not passed as `marketValue` either: it goes where it
         * belongs, `lastMovementValue`, and values nothing.
         */
        marketPrice: null,
        marketValue: null,
        /** What the depository DID print, so the archive shows the document. */
        faceValue: priceIsFaceValue ? rate : null,
        lastMovementRate: priceIsFaceValue ? null : rate,
        lastMovementValue: priceIsFaceValue || rate == null ? null : printedValue,
        source,
      }));
      if (priceIsFaceValue) faceValued.push(`${aif.name} (${quantity} units at a face value of ${rate ?? "—"})`);
      else if (rate == null) unpriced.push(`${name} (${isin})`);
      else lastMoved.push({ name, quantity, rate, value: printedValue });
    }
  }

  if (!holdings.length) {
    warn(warnings, /NO HOLDING IS AVAILABLE/i.test(text) ? "account-holds-nothing" : "no-holding-rows",
      /NO HOLDING IS AVAILABLE/i.test(text)
        ? "the statement prints `NO HOLDING IS AVAILABLE` — the account is open and empty, and that is a measurement"
        : "no row matched the ISIN column; nothing is read rather than reading the wrong columns");
  }

  /**
   * THE VALUE COLUMN'S OWN TOTAL IS THE COMPLETENESS WITNESS, AND ONLY THAT.
   *
   * `Total Holding Valuation` is the sum of the value column, so reproducing it
   * says every row of the table was read — the licence `hdfcNsdl.mjs` needs to
   * publish a rendered figure. It says nothing about what the holdings are
   * worth, because what it sums is last-movement values: that is exactly the
   * reading this reader used to make, and it is why the figure is checked here
   * and never carried as `totals.totalMarketValue`.
   */
  const printedTotal = n((/Total Holding Valuation\s*:\s*([\d,]+\.\d+)/i.exec(text) ?? [])[1]);
  const readTotal = valueColumn.length ? valueColumn.reduce((t, v) => t + v, 0) : null;
  const tied = printedTotal != null && readTotal != null && Math.abs(readTotal - printedTotal) <= 1;
  if (printedTotal != null && readTotal != null && !tied) {
    warn(warnings, "value-column-does-not-reproduce-total",
      `the value column read sums to ${readTotal.toFixed(2)} against a printed Total Holding Valuation of ${printedTotal.toFixed(2)} — a row was missed or misread, so what this document holds is not complete`);
  }
  if (lastMoved.length) {
    const ex = lastMoved.find((r) => r.value != null && r.rate > 0 && Math.abs(r.value / r.rate - r.quantity) > 0.001) ?? lastMoved[0];
    const moved = ex.value != null && ex.rate > 0 ? ex.value / ex.rate : null;
    warn(warnings, "rate-is-last-movement-price",
      `${lastMoved.length} holding(s) print a rate and a value that describe the holding's LAST DEPOSITORY MOVEMENT, not its balance — e.g. ${ex.name}: ${ex.quantity} held, rate ${ex.rate}, value ${ex.value}${moved != null ? `, which is ${moved.toFixed(3)} units, the quantity of that movement` : ""}. So these carry their units and no market value; the rate and value are kept as \`lastMovementRate\` / \`lastMovementValue\`, a transaction price rather than a valuation.${tied ? ` The value column sums to the printed Total Holding Valuation of Rs ${printedTotal.toFixed(2)} to the rupee, so every row was read — and that total is a sum of last-movement values, not what the account is worth.` : ""}`);
  }
  if (faceValued.length) {
    warn(warnings, "aif-units-carry-face-value-not-nav",
      `${faceValued.length} AIF holding(s) are carried with units and NO market value, because the rate this statement prints for them is the FACE VALUE the units were issued at rather than a NAV — ${faceValued.slice(0, 3).join("; ")}${faceValued.length > 3 ? "; …" : ""}. Where the fund itself issues a statement in this book, that is where the valuation comes from.`);
  }
  if (unpriced.length) {
    warn(warnings, "no-rate-published",
      `the depository prints no rate for ${unpriced.length} holding(s) — ${unpriced.slice(0, 4).join(", ")}${unpriced.length > 4 ? ", …" : ""}. A rate of 0.000 is read as NOT PRICED, never as a price of zero, so these carry units and no market value.`);
  }

  return {
    holdings,
    // No market value: nothing this statement prints values a balance.
    totals: makeTotals({ totalMarketValue: null, positionCount: holdings.length, source }),
  };
}

/**
 * THE WINDOW THE TWO PRINTED BALANCES BOUND, read once and shared.
 *
 * An opening balance means nothing without it: "the quantity at the start" is a
 * claim about a DATE, and these statements run the Indian FINANCIAL year from
 * 1 April rather than the calendar year — so a table headed "start of the year"
 * over this data has to say which year it means.
 *
 * Exported because `scripts/replay-demat-movements.mjs` needs the same answer,
 * and a second regex there would be a second reading of one line.
 */
export function dematPeriod(text) {
  const m = /PERIOD FROM:\s*(\d{2}-\d{2}-\d{4})\s*TO:\s*(\d{2}-\d{2}-\d{4})/i.exec(text);
  return { periodFrom: toIso(m?.[1]), periodTo: toIso(m?.[2]) };
}

/**
 * The replay's door to the reader, so `scripts/replay-demat-movements.mjs`
 * runs THIS function rather than a second copy of it — the rule
 * `rekey:archive` and `replay:calls` both follow.
 */
export function readTransactionsForReplay(pages, warnings) {
  return readTransactions(pages, warnings);
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
  let isin = null, name = null, opening = null, balance = null, pending = [];
  const refused = [];
  // Counted in the loop rather than re-scanned: see the warning at the end.
  let encumbranceRows = 0, encumbranceMoved = 0;

  /**
   * A BLOCK IS PUBLISHED ONLY IF ITS ROWS WALK ITS OWN PRINTED BALANCE.
   *
   * The statement prints the opening, every movement's running balance and the
   * closing, so the rows either reproduce the closing or they do not, and there
   * is no third answer to settle by judgement. A block that does not walk has a
   * row this reader misread or did not see, and publishing its in/out split
   * would state a movement the document does not support — so nothing is
   * emitted for it beyond the two balances, and the reason is warned.
   */
  const closeBlock = (close) => {
    const walked = balance != null && Math.abs(balance - close) < 5e-4;
    const moves = walked ? pending : [];
    if (!walked && pending.length) {
      refused.push(`${name ?? isin}: ${pending.length} movement(s) walk to ${balance} against a printed closing of ${close}`);
    }
    const tally = (kind, dir) => sum(moves.filter((m) => m.kind === kind && m.dir === dir).map((m) => m.quantity));
    positionsAsOf.push({
      isin, security: name, opening, quantity: close,
      // The family's own table: opening, plus, minus, closing. Every term is a
      // sum of dated rows the statement prints, and the four add across to the
      // difference between the two printed balances exactly or the block is not
      // here at all. `null` where the block was refused — never a zero, which
      // would read as a year in which nothing moved.
      movements: walked ? {
        unitsIn: tally("settlement", "in") + tally("unclassified", "in"),
        unitsOut: tally("settlement", "out") + tally("unclassified", "out"),
        corporateActionIn: tally("corporate-action", "in"),
        corporateActionOut: tally("corporate-action", "out"),
        // Balance-NEUTRAL and therefore in no total: a pledge moves units
        // between free and pledged without any leaving the account.
        encumbrance: moves.filter((m) => m.kind === "encumbrance").length,
        rows: moves.length,
        unclassified: moves.filter((m) => m.kind === "unclassified").length,
      } : null,
      movementsReason: walked ? null
        : `the ${pending.length} movement(s) read walk this holding's balance to ${balance}, and the statement prints a closing balance of ${close} — so a row was misread or missed, and no opening-to-closing split is published for it`,
    });
    for (const m of moves) transactions.push(m.txn);
    pending = [];
  };

  for (const line of lines) {
    const mIsin = /^ISIN:\s*(IN[EF][A-Z0-9]{9})\b/.exec(line);
    if (mIsin) { isin = mIsin[1]; name = null; opening = null; balance = null; pending = []; continue; }
    const mName = /^ISIN NAME:\s*(.+)$/.exec(line);
    if (mName) { name = mName[1].trim(); continue; }
    const mOpen = /^Opening Balance\s+([\d,]+\.\d{3})$/.exec(line);
    if (mOpen) { opening = n(mOpen[1]); balance = opening; continue; }
    const mClose = /^Closing Balance\s+([\d,]+\.\d{3})$/.exec(line);
    if (mClose && isin) { closeBlock(n(mClose[1])); continue; }
    const m = TXN_ROW.exec(line);
    if (!m || !isin || balance == null) continue;
    const [, date, particulars, qty, runningBalance] = m;
    const after = n(runningBalance);
    const delta = after - balance;
    balance = after;
    const kind = movementKind(particulars);
    if (kind === "encumbrance") encumbranceRows += 1;
    // The SIGN OF THE BALANCE'S OWN CHANGE, never a token wrapped off the end
    // of the row. A row that leaves the balance where it was moved nothing in
    // or out of the account, whatever else it did inside it.
    const dir = delta > 5e-4 ? "in" : delta < -5e-4 ? "out" : "flat";
    if (kind === "encumbrance" && dir !== "flat") encumbranceMoved += 1;
    pending.push({
      kind, dir, quantity: n(qty),
      txn: makeTransaction({
        date: toIso(date),
        security: name,
        isin,
        // A depository movement is not a trade: there is no price and no
        // consideration on this document, only units in or units out. `side`
        // says which direction the SHARES went, and no settlement is invented.
        side: dir === "in" ? "receipt" : dir === "out" ? "delivery" : "encumbrance",
        quantity: n(qty),
        description: `${particulars.trim()} — ${kind}, balance ${runningBalance}`,
      }),
    });
  }

  if (!transactions.length && !positionsAsOf.length) {
    warn(warnings, "no-transaction-rows", "no `date … quantity balance` row matched on this statement");
  }
  for (const r of refused) warn(warnings, "movement-block-does-not-walk", r);
  const split = positionsAsOf.filter((p) => p.movements).length;
  /**
   * AN ENCUMBRANCE THAT MOVED A BALANCE WOULD BE COUNTED NOWHERE.
   *
   * A pledge, an unpledge and an early pay-in earmark are balance-NEUTRAL by
   * construction, which is why they are excluded from the in/out totals — and
   * that exclusion is only safe while it stays true. One that DID move a
   * balance would leave its units in no column, and the block would still walk
   * if another row happened to compensate: wrong figures, nothing failing.
   *
   * Measured on this corpus it is ZERO, and the count is printed anyway. A
   * guard that only speaks when it fires is indistinguishable, on a clean run,
   * from one that was quietly deleted.
   */
  warn(warnings, "depository-movements-are-not-trades",
    `${transactions.length} depository movement(s) read across ${positionsAsOf.length} holding(s), ${split} of which walk their own printed opening balance to their own printed closing balance and carry an opening-to-closing split. ${encumbranceMoved} of the ${encumbranceRows} pledge / lock-in row(s) changed a balance, so their exclusion from the in/out totals rests on evidence rather than on the assumption that they are neutral. A demat credit or debit carries units and no price, so none of these is a trade and none contributes a settlement, a cost or a realised gain.`);

  return { transactions, positionsAsOf, holdings: [], totals: null };
}
