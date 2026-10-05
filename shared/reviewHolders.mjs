// WHO HOLDS EACH PRIVATE-MARKET LINE OF THE FAMILY'S CONSOLIDATED REVIEW — and
// where in this book it lives.
//
// The family asked on 5 Oct 2026 for the consolidated review (MOPWM, as on 30 June
// 2026) to be THE SOURCE of every private-market figure on the dashboard (Stage
// 10dh). The review's `Private Investments` tab prints each line once, for the
// whole family, with no holder. This table is the hand-checked answer to whose it
// is, line by line — never a name matcher:
//
//   • a line ONE member holds is that member's, whole;
//   • a line several members hold is split by the family's own investment
//     register (`NEW INVESTMENT SHEET.xlsx`, the paid amounts per holder, to the
//     rupee), and the split must add to the review's own line cost;
//   • the part of a line no document names a holder for is NOT ATTRIBUTED — kept
//     under its own heading rather than given to anybody (`notAttributed`).
//
// The builder (`scripts/lib/reviewBook.mjs`) refuses a table where a split does
// not add to its review line, where a line matches no row or two, or where a
// line of the tab is covered by no entry.
//
// FIGURES IN RUPEES. A value of `null` means "at cost": the review carries the line
// at what was paid and nothing measures what it is worth.

/** The book account each holder's line sits in, unless the entry names one. */
export const REVIEW_ACCOUNT_PREFIX = "review-";

/** Holder ids are the book's ownerIds; `not-attributed` is the one this table adds. */
export const NOT_ATTRIBUTED = "not-attributed";
export const NOT_ATTRIBUTED_NAME = "Not attributed to a member";

const AJ = "ajay-jaisinghani";
const BH = "bharat-jaisinghani";
const AN = "ankita-jaisinghani";
const T2 = "bharat-jaisinghani-family-trust-2";
const T3 = "bharat-jaisinghani-family-trust-3";
const NA = NOT_ATTRIBUTED;

/** The register is the family's own record of what each member paid. */
const REG = "the family's investment register";

const one = (owner, why = "one holder on the review's own Transactions and on the register") => ({ split: [{ owner }], why });

/**
 * THE PRIVATE INVESTMENTS TAB — lines held at cost.
 *
 * `line` matches the review's product text exactly once. `key` is the book's
 * securityKey where a statement in this book reports the same instrument (the
 * first key of `REVIEW_PRIVATE_JOIN`), so the line and the statement's row are
 * one holding; otherwise the line's own key. `assetClass` is what the line IS.
 */
export const PRIVATE_INVESTMENT_HOLDERS = [
  { line: /^Everest Fleet Private Ltd/, key: "everest-fleet", assetClass: "Unlisted",
    split: [{ owner: AJ, cost: 25318588 }, { owner: AN, cost: 16093284 }, { owner: BH, cost: 6195952 }], why: `three holders; ${REG} records each one's payment` },
  { line: /^URB Ventures/, key: "urb-ventures", assetClass: "Unlisted",
    split: [{ owner: AJ, cost: 10000000 }, { owner: AN, cost: 12500000 }], why: `two holders; ${REG} records each one's payment` },
  { line: /^Waterwala Labs Private Limited/, assetClass: "Unlisted", ...one(BH, `${REG} records both Waterwala payments under Bharat`) },
  { line: /^Integris$/, key: "integris-medtech", assetClass: "Unlisted",
    split: [{ owner: AJ, cost: 99998625 }, { owner: BH, cost: 29999419 }, { owner: NA, cost: 29999418.8 }],
    why: `${REG} records Ajay's ₹9,99,98,625 and Bharat's ₹2,99,99,419; the review's line is ₹2,99,99,418.80 more, which no document names a holder for` },
  { line: /^MOTHER INDIA FORMING/, assetClass: "Unlisted", ...one(AJ) },
  { line: /^SKS Fastener$/, key: "sks-fasteners", assetClass: "Unlisted", ...one(AJ) },
  { line: /^Transigo Fleet LLP$/, assetClass: "Unlisted", ...one(BH) },
  { line: /^FH Enable LLP/, assetClass: "Unlisted", ...one(BH) },
  { line: /^PROCYON ENTERPRISE LLP/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Spray Engineering Devices/, key: "spray-engineering-devices", assetClass: "Unlisted", ...one(AJ) },
  { line: /^Matrix Gas And Renewables/, key: "matrix-gas-and-renewables", assetClass: "Unlisted",
    split: [{ owner: AJ, cost: 30000000 }, { owner: BH, cost: 15000000 }], why: `two holders; ${REG} records each one's payment` },
  { line: /^Telawne Power$/, assetClass: "Unlisted", ...one(AJ) },
  { line: /^Innoviti Payment Solutions/, assetClass: "Unlisted",
    split: [{ owner: AJ, cost: 14999980.38 }, { owner: BH, cost: 4999993.46 }], why: `two holders; ${REG} records each one's payment` },
  { line: /^Oil Max$/, key: "oilmax-energy", assetClass: "Unlisted", ...one(AJ, "the ICICI Bank NSDL statement holds the 17,000 shares in Ajay's account") },
  { line: /^Borosil Renewables$/, key: "borosil-renewables-limited-warrants-13ag26", assetClass: "Unlisted", ...one(AJ) },
  { line: /^BIG BANG BOOM$/, key: "big-bang-boom-solutions-private-limited-0-001-pref-12sp44", assetClass: "Unlisted",
    split: [{ owner: AJ, cost: 30240000 }, { owner: BH, cost: 10080000 }], why: `two holders; ${REG} records each one's payment` },
  { line: /^RAY's$/, key: "rays-power-experts", assetClass: "Unlisted", ...one(AJ) },
  { line: /^Pivot Ventures/, key: "pvc-ii-class-a1", assetClass: "AIF", ...one(AN) },
  { line: /^Stay Vista Private Limited - ARTHA/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Incred Holdings/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Autocracy Machinery/, assetClass: "Unlisted", ...one(BH) },
  { line: /^The OAKS Consumer Fund I/, key: "tocf-i-class-a2", assetClass: "AIF", ...one(AN) },
  { line: /^SOTEFIN$/, key: "sotefin-bharat", assetClass: "Unlisted", ...one(AJ) },
  { line: /^WE VOISE$/, assetClass: "Unlisted", ...one(AJ) },
  { line: /^Zenith$/, key: "zenith-leisure-holidays", assetClass: "Unlisted", ...one(AJ) },
  { line: /^Radiant$/, key: "radiant-innovative-manufacturing", assetClass: "Unlisted", ...one(AJ) },
  { line: /^Vineet Sethia - Drink Prime$/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Third Eye Distillery/, assetClass: "Unlisted", ...one(BH) },
  { line: /^HYPRKYTCHEN/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Inflexor Technologies - /, assetClass: "Unlisted", ...one(AN) },
  // Bharat's own 244 EQUITY shares — a different instrument from the trusts' CCPS below.
  { line: /^SWAPECO SOLUTIONS PRIVATE LIMITED - /, key: "swapeco-solutions-equity", assetClass: "Unlisted", ...one(BH) },
  { line: /^A K Enterprises - /, assetClass: "Unlisted", ...one(BH) },
  { line: /^Sky Enable Tech Llp$/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Since 99 Apparel/, assetClass: "Unlisted", ...one(AN) },
  { line: /^EMA Preferred Shares$/, assetClass: "Unlisted", ...one(AJ) },
  { line: /^Stay Vista Private Limited - Anandkumar/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Ajay Jain - Drink Prime$/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Hanok Reuben Medhari/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Head Infotech$/, assetClass: "Unlisted", split: [{ owner: NA }], why: "no document in the drop names its holder" },
  { line: /^Nopo Nanotechnologies/, assetClass: "Unlisted", ...one(BH) },
  { line: /^FH Edutech LLP$/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Home Pecked/, assetClass: "Unlisted", ...one(BH) },
  { line: /^AL Trust - Collabmates/, assetClass: "AIF", ...one(AN) },
  { line: /^Aksum Trademart/, assetClass: "Unlisted", ...one(BH) },
  { line: /^AL Trust - Karban/, assetClass: "AIF", ...one(BH) },
  { line: /^Zippmat Private Ltd/, assetClass: "Unlisted", ...one(BH) },
  { line: /^LV Angel Fund/, assetClass: "AIF", ...one(BH) },
  { line: /^Rurash Financials/, assetClass: "Unlisted", ...one(BH) },
  { line: /^Variance PT Ventures/, assetClass: "Unlisted", ...one(BH) },
  { line: /^LANDCRAFT RETAIL/, assetClass: "Unlisted", ...one(AJ) },
  { line: /^Sky Vision Cure LLP$/, assetClass: "Unlisted", ...one(AN) },
  { line: /^Blue Ashva India Pool Account$/, assetClass: "AIF",
    split: [{ owner: AN, cost: 15251640 }, { owner: AJ, cost: 5108000 }, { owner: NA, cost: 17048360 }],
    why: `${REG} records Ankita's ₹1,52,51,640 and Ajay's ₹51,08,000 into the pool account; the rest of the review's line names no holder` },
  { line: /^Electromech Infraprojects/, key: "electromech-infraprojects", assetClass: "Unlisted", ...one(AJ) },
  // The two family trusts' 347 Pre-Series-A CCPS each — on both trusts' HDFC NSDL statements.
  { line: /^Swapeco Solutions Private Limited$/, key: "swapeco-solutions", assetClass: "Unlisted",
    split: [{ owner: T2, cost: 13500875 }, { owner: T3, cost: 13500875 }], why: "347 CCPS per family trust on both trusts' HDFC Bank NSDL statements, ₹1,35,00,875 each on the review's own member summary" },
  { line: /^PERPLEXITY INVESTMENT$/, assetClass: "Unlisted", split: [{ owner: NA }], why: "no document in the drop names its holder" },
  { line: /^RUNABLE INVESTMENT$/, assetClass: "Unlisted", split: [{ owner: NA }], why: "no document in the drop names its holder" },
  { line: /^Blue Ashva Varenya Account$/, key: "blue-ashva-varenya-fund-bavf-ser20-c6-restricted-transferability", assetClass: "AIF",
    split: [{ owner: AJ, cost: 100000 }, { owner: AN, cost: 100000 }], why: `two holders; ${REG} records ₹1 L each` },
  { line: /^EDUGORILLA COMMUNITY/, assetClass: "Unlisted", ...one(AJ) },
  { line: /^Onix Renewable$/, key: "onix-renewable", assetClass: "Unlisted", ...one(AJ) },
];

/**
 * PRIVATE INVESTMENTS LINES THAT ARE NOT A REVIEW POSITION, each for its reason.
 * Every line of the tab is in exactly one of the two lists, or the build refuses.
 */
export const PRIVATE_INVESTMENT_ELSEWHERE = [
  { line: /^ESDS$/, why: "listed since; the ICICI Bank NSDL statement's 3,30,898 shares stay on the statement and are valued at the live quote" },
  { line: /^Credit Fair-K M Global/, why: "counted once, inside the review's own 15% K M Global credit line on its Debt tab" },
  { line: /^M\/S Grand Continent Hotels$/, why: "now listed — a statement holds the shares" },
  { line: /^Parth Electrical & Engineering$/, why: "listed in Aug'25 — a statement holds the shares" },
  { line: /^Fractual Analytics$/, why: "now listed — a statement holds the shares" },
  { line: /^Clean Max Solar$/, why: "now listed — a statement holds the shares" },
];

/**
 * THE PE FUNDS, THE UNLISTED SHARES AND THE CREDIT LINE — each holder with the
 * figures the review's own dated rows print (Transactions since inception), and
 * the account in this book the holding sits in.
 */
export const VALUED_HOLDERS = [
  { tab: "peFunds", line: /^India SME$/, key: "india-sme-investments-fund-ii-class-a2", assetClass: "AIF",
    split: [
      { owner: AJ, account: "india-sme-investments-175962", cost: 81000000, value: 95580000, qty: 81000 },
      { owner: BH, account: "india-sme-investments-175964", cost: 27000000, value: 31860000, qty: 27000 },
      { owner: AN, account: "india-sme-investments-177302", cost: 27000000, value: 31860000, qty: 27000 },
    ],
    why: "each folio's own statement; the review's closings (₹1,180 a unit on 31 Mar 2026), and the units the fund's own statements print" },
  { tab: "peFunds", line: /^Baring PE India Fund 6$/, key: "baring-private-equity-india-fund-6-class-a1", assetClass: "AIF",
    split: [{ owner: AN, account: "baring-private-equity-india-fund-AIFM_BPEPF6_0584", cost: 20250000, value: 18842208.74, qty: 202.5 }],
    why: "Ankita's folio" },
  { tab: "peFunds", line: /^360 One Special Opportunities Fund/, key: "360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii", assetClass: "AIF",
    split: [
      { owner: AJ, account: "360-one-private-wealth-37702", cost: 9921180.02, value: 14580413, qty: 990429.68 },
      { owner: BH, account: "360-one-private-wealth-60117", cost: 9921180.02, value: 14580412.51, qty: 990429.68 },
    ],
    why: "one folio under each CRN — two investments, as the family confirmed on 28 Sep 2026" },
  { tab: "peFunds", line: /^Sky Capital Titan Rising Funds 1$/, key: "sky-capital-rising-titans-fund-i", assetClass: "AIF", atCost: true,
    split: [
      { owner: BH, account: "sky-capital-rising-titans-fund-SKY003", cost: 17150000, qty: 17000 },
      { owner: AJ, account: "sky-capital-rising-titans-fund-SKY022", cost: 15000000, qty: 15000 },
      { owner: T2, account: "sky-capital-rising-titans-fund-SKY023", cost: 7500000, qty: 7500 },
      { owner: T3, account: "sky-capital-rising-titans-fund-SKY024", cost: 7500000, qty: 7500 },
    ],
    why: "each folio's own statement" },
  { tab: "peFunds", line: /^Assetgro Fintech Private Limited$/, key: "assetgro-fintech-private-limited-1-series-b-pref-25nv44", assetClass: "Unlisted", atCost: true,
    split: [{ owner: AJ, cost: 50032848, qty: 636 }],
    why: "the review's Transactions row: 636 preference shares at ₹78,668, and the ICICI Bank NSDL statement's 636 in Ajay's account" },
  { tab: "peFunds", line: /^Transition Venture Capital fund I$/, key: "transition-venture-capital-fund-i-class-a1", assetClass: "AIF",
    split: [
      { owner: T2, account: "transition-venture-capital-TVC262", cost: 7500000, value: 9680754, qty: 7500 },
      { owner: T3, account: "transition-venture-capital-TVC263", cost: 7500000, value: 9680754, qty: 7500 },
      { owner: AN, cost: 2500000, value: 3285877, qty: 2500 },
    ],
    why: "each trust's own folio, and Ankita's 2,500 units on the review's Transactions" },
  { tab: "unlisted", line: /^National Stock Exchange$/, key: "national-stock-exchange-of-india", assetClass: "Unlisted",
    split: [
      { owner: AJ, cost: 75531250, value: 259375000, qty: 125000 },
      { owner: AN, cost: 45318750, value: 155625000, qty: 75000 },
    ],
    why: "1,25,000 shares on Ajay's ICICI Bank NSDL statement and 75,000 on Ankita's Motilal Oswal demat; the review's ₹12.085 Cr cost split by shares, which is this book's judgement — the review prints one cost for the 2,00,000" },
  { tab: "unlisted", line: /^Zepto$/, key: "zepto", assetClass: "Unlisted",
    split: [{ owner: AJ, cost: 150015960, value: 228285156.52, qty: 4716 }],
    why: "the review's own Transactions rows — 4,716 bought on 24 Feb 2025, closing at ₹22.83 Cr on 31 Jul 2025" },
  { tab: "credit", line: /^15% K M Global/, key: "15-percent-k-m-global-credit", assetClass: "Bond",
    split: [{ owner: BH, cost: 7000149.8, value: 10434584.46 }],
    why: "Bharat's, on the review's own Transactions; the Private Investments tab's ₹20 L Credit Fair-K M Global line is the same loan, counted here once" },
];

/**
 * STATEMENT ROWS THE REVIEW NOW STANDS FOR — taken out of the book so nothing is
 * counted twice, and named in BOOK_REVIEW_SUPERSEDED. `kind` is what was taken out.
 */
export const SUPERSEDED = [
  ...[
    "bavf-series-20-class-c6", "pvc-ii-class-a1", "efpl-pref-18042043", "everest-fleet", "national-stock-ex",
    "transition-venture-capital-fund-i-class-a1", "baring-private-equity-india-fund-6-class-a1",
    "india-sme-investments-fund-ii-class-a2", "tocf-i-class-a2", "cheelizza-ind",
  ].map((securityKey) => ({ accountId: "motilal-oswal-financial-services-demat-1201090012838316", securityKey, kind: "unvalued" })),
  ...[
    "sky-capital-rising-titans-fund-i-skycrtf-oncarea3-restricted-transferability",
    "india-sme-investments-aif-trust-ii-cl-a2-restricted-transferability",
    "everest-fleet", "everest-fleet-private-limited-0-001-series-b-new-pref-18ap43",
    "urb-ventures", "urb-ventures-private-limited-0-001-pref-07jl42", "integris-medtech", "sks-fasteners",
    "spray-engineering-devices", "matrix-gas-and-renewables", "oilmax-energy",
    "big-bang-boom-solutions-private-limited-0-001-pref-12sp44", "rays-power-experts", "sotefin-bharat",
    "zenith-leisure-holidays", "radiant-innovative-manufacturing", "electromech-infraprojects", "onix-renewable",
    "assetgro-fintech-private-limited-1-series-b-pref-25nv44", "national-stock-exchange-of-india",
  ].map((securityKey) => ({ accountId: "icici-bank-nsdl-demat-49794950", securityKey, kind: "unvalued" })),
  { accountId: "icici-bank-nsdl-demat-49794950", securityKey: "borosil-renewables-limited-warrants-13ag26", kind: "position" },
  { accountId: "icici-bank-nsdl-demat-49794950", securityKey: "blue-ashva-varenya-fund-bavf-ser20-c6-restricted-transferability", kind: "position" },
  ...["india-sme-investments-175962", "india-sme-investments-175964", "india-sme-investments-177302"]
    .map((accountId) => ({ accountId, securityKey: "india-sme-investments-fund-ii-class-a2", kind: "unvalued" })),
  { accountId: "sky-capital-rising-titans-fund-SKY003", securityKey: "sky-capital-rising-titans-fund-hudle-class-a1", kind: "unvalued" },
  { accountId: "sky-capital-rising-titans-fund-SKY003", securityKey: "sky-capital-rising-titans-fund-ted-class-a2", kind: "unvalued" },
  ...["SKY022", "SKY023", "SKY024"].map((n) => ({ accountId: `sky-capital-rising-titans-fund-${n}`, securityKey: "sky-capital-rising-titans-fund-oncare-class-a3", kind: "unvalued" })),
  ...["67786547", "67786137"].map((n) => ({ accountId: `hdfc-bank-nsdl-demat-${n}`, securityKey: "swapeco-solutions", kind: "unvalued" })),
  { accountId: "baring-private-equity-india-fund-AIFM_BPEPF6_0584", securityKey: "baring-private-equity-india-fund-6-class-a1", kind: "position" },
  ...["37702", "60117"].map((n) => ({ accountId: `360-one-private-wealth-${n}`, securityKey: "360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii", kind: "position" })),
  ...["TVC262", "TVC263"].map((n) => ({ accountId: `transition-venture-capital-${n}`, securityKey: "transition-venture-capital-fund-i-class-a1", kind: "position" })),
  ...["zepto-limited-0-01-div-cum-comp-conv-pref-sh-sr-ii-g-rd-14-11-2044", "zepto-limited-new-equity-shares-with-face-value-rs-5-after-sub-division"]
    .map((securityKey) => ({ accountId: "motilal-oswal-financial-services-demat-1201090012539150", securityKey, kind: "window" })),
];

/**
 * WHERE A NEWER STATEMENT SAYS SOMETHING DIFFERENT. The family asked for the
 * review to be the source, so its figure is used — and the statement's is named,
 * on the row's hover and in docs/BOOK-REPORT.md, never dropped.
 */
export const FRESHER_STATEMENT = [
  { key: "360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii", owner: AJ,
    text: "CRN37702's statement of 31 Jul 2026 values the same units at ₹1,46,68,362.66" },
  { key: "transition-venture-capital-fund-i-class-a1", owner: T2,
    text: "the trust's own statement of 31 Mar 2026 values its 7,500 units at ₹1,71,45,962.25 (₹2,286.13 a unit) against the review's 28 Feb mark" },
  { key: "transition-venture-capital-fund-i-class-a1", owner: T3,
    text: "the trust's own statement of 31 Mar 2026 values its 7,500 units at ₹1,71,45,962.25 (₹2,286.13 a unit) against the review's 28 Feb mark" },
  { key: "blue-ashva-varenya-fund-bavf-ser20-c6-restricted-transferability", owner: AJ,
    text: "the ICICI Bank NSDL statement of 31 Mar 2026 values Ajay's units at ₹98,742" },
  { key: "borosil-renewables-limited-warrants-13ag26", owner: AJ,
    text: "the ICICI Bank NSDL statement of 31 Mar 2026 values the 2,83,018 warrants at ₹70,754.50" },
  { key: "sky-capital-rising-titans-fund-i", owner: BH,
    text: "SKY003's statement of 31 Jul 2026 prints ₹1,73,00,000 drawn" },
  { key: "baring-private-equity-india-fund-6-class-a1", owner: AN,
    text: "Ankita's Motilal Oswal demat records 252.5 units on 31 Jul 2026, against the 202.5 the fund's statement and the review carry" },
  { key: "zepto", owner: AJ,
    text: "Ajay's Motilal Oswal demat 1201090012539150 shows the 4,716 preference shares converted, and 37,38,119 equity shares held on 31 Jul 2026" },
  { key: "india-sme-investments-fund-ii-class-a2", owner: AJ,
    text: "the review's own closing carries 54,000 units at ₹1,770 a unit; the fund's statement prints the 81,000 units held" },
  { key: "india-sme-investments-fund-ii-class-a2", owner: BH,
    text: "the review's own closing carries 18,000 units; the fund's statement prints the 27,000 units held" },
  { key: "india-sme-investments-fund-ii-class-a2", owner: AN,
    text: "the review's own closing carries 18,000 units; the fund's statement prints the 27,000 units held" },
];
