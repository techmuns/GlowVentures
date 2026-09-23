/**
 * THE FAMILY'S OWN THREE SLICES OF ONE BOOK.
 *
 *   "We should also be able to see this information: category wise (MF, direct
 *    equity, Bonds, PMS, AIF etc), asset class wise (Equity, debt etc), my
 *    basket definition wise (core, tactical etc)."
 *
 * The same holdings, sliced three ways. One of those slices this app already
 * had; the other two are the FAMILY'S JUDGEMENT and could not be derived from
 * any statement in `source/`:
 *
 *   CATEGORY     — `holdingBucket` in `analytics.ts`. What KIND of thing this is
 *                  and who chose it: Direct Equity, PMS mandates, AIF, Mutual
 *                  Fund, ETF, Cash. Unchanged, still the default, not in this file.
 *   ASSET CLASS  — the family's Equity / Debt / Alternate / Cash. NOT our
 *                  `AssetClass`, which answers a different question (see below).
 *   BASKET       — Stable Growth / Entrepreneurial Growth / Thematic & Tactical
 *                  / Liquidity.
 *
 * ── WHY THIS CANNOT BE DERIVED, MEASURED RATHER THAN ASSUMED ────────────────
 *
 * Our `AssetClass` says what an instrument IS. The family's asset class says
 * what ECONOMIC EXPOSURE it carries, and one does not imply the other. Measured
 * over `BOOK_POSITIONS`, three of our five classes are genuinely ambiguous:
 *
 *   AIF (14 names)   → Sanshi and Buoyant are the family's EQUITY; Baring PE,
 *                      Transition Venture and 360 ONE Special Opportunities are
 *                      ALTERNATE; Neo Infra is DEBT.
 *   Mutual Fund (20) → Helios Flexi Cap is EQUITY; ABSL and ICICI Liquid are
 *                      CASH; the review files its arbitrage funds as DEBT, and
 *                      the family have since overruled that — arbitrage is CASH
 *                      (see `cashByInstruction` below).
 *   ETF (3)          → DSP Gold and DSP Silver are ALTERNATE; Liquid BeES is CASH.
 *
 * Only two are safe, and they are safe by definition rather than by luck: a
 * company share is equity exposure under any taxonomy, and cash is cash. Those
 * two are DERIVED below. Everything else must be stated by the family, and
 * ₹480 Cr of this book sits in the three ambiguous classes — so guessing here
 * would misfile most of the money.
 *
 * DERIVATION FILLS A GAP AND THE REVIEW OVERRIDES IT, which is not a hedge: two
 * holdings in this book are `Equity` to us and ALTERNATE to the family — an
 * unlisted company's shares and a preferential WARRANT, both of them private
 * capital that happens to sit in a depository account. `familyAssetClass`
 * therefore consults the map before it derives anything.
 *
 * ── WHERE THESE ASSIGNMENTS COME FROM ───────────────────────────────────────
 *
 * The family supplied their consolidated review workbook (as on 30 June 2026)
 * and an email stating the four baskets. The workbook carries the answer THREE
 * times over, and the three agree:
 *
 *   - four BASKET sheets (Stable Growth / Entrepreneruial Growth /
 *     Thematic,Tactical / Liquid) — the sheet a product is listed on IS its basket;
 *   - four ASSET-CLASS sheets (Equity / Debt / Cash / Alternate) — likewise;
 *   - a basket CODE column (SG / EG / TT / Liquid) on the asset-class sheets.
 *
 * The code column and the basket sheets are INDEPENDENT WITNESSES to the same
 * fact, and they were cross-checked before a line of this map was written: they
 * agree on all 33 products where both speak, with ZERO disagreements, and all
 * 82 basket-sheet products appear on an asset-class sheet. That check is why
 * this map is committed rather than treated as one reading of a spreadsheet.
 *
 * A FOURTH WITNESS, AND IT ONLY EVER FILLS A GAP: the `Private Investments` tab
 * (corroborated row for row by `Private Equity Excl Pre IPO`) itemises the
 * aggregate `Private Equity` line the Alternate sheet carries. It is read AFTER
 * the live sheets and never over them — see the private-equity block below for
 * the two rows that prove why that order is load-bearing.
 *
 * ── AND THE WORKBOOK IS NOW THE TEST, NOT JUST THE SOURCE ───────────────────
 *
 * `familyTaxonomy.test.ts` reads the committed workbook and checks EVERY entry
 * below against the row it names: the product must exist, and the basket and
 * asset class must both agree wherever the workbook states them. Measured today
 * that is 57 entries, with 57 baskets and 57 classes witnessed, ZERO mismatches.
 * It was written because the audit that produced it found a defect nothing else
 * could see — a `reviewProduct` reading "Motilal Oswal Founders Fund  II" with
 * a DOUBLE SPACE, which matches no row in the family's document. The
 * classification was right and the citation was unverifiable, and a citation
 * nobody can follow is exactly what this field exists to prevent.
 *
 * ── WHAT THE REVIEW NAMES AND THIS MAP DELIBERATELY DOES NOT JOIN ───────────
 *
 * Each of these is a near miss LISTED rather than committed, which is the rule
 * `shared/nameMatch.mjs` already holds for the register reconciler:
 *
 *   - `EMA Preferred Shares` (₹0.46 Cr, Private Equity) against this book's
 *     `EMA PARTNERS INDIA LIMITED - EQ NEW FV RS 5/` (₹0.37 Cr). PREFERENCE
 *     shares are not the EQUITY, and `CLAUDE.md` already names this exact pair
 *     as a near miss a human must commit. The equity falls to the direct-stock
 *     rule below, which is where the review's own `Direct Equity - Non MO`
 *     block — coded TT — puts the demat's direct holdings anyway.
 *   - `National Stock Exchange` (Stable Growth / Equity, ₹41.5 Cr on 200,000
 *     shares). This book's ICICI NSDL statement carries 125,000 of them at an
 *     implied Re 1.00 — a PAR row, so it carries its quantity and NO market
 *     value and is not in `BOOK_POSITIONS` at all. An entry for it would match
 *     no holding and fail this map's own no-dead-entries check. The answer is
 *     recorded here for the drop that first values it.
 *   - `SKS Fastener`, `Incred Holdings`, `Swapeco Solutions`, `Aksum Trademart`,
 *     `EDUGORILLA` and `Blue Ashva India Pool Account` are private investments
 *     this book carries no valued position for, by the same par/quantity-only
 *     rule. Nothing to classify until a statement values them.
 *
 * ── AND WHY IT IS A HAND-VERIFIED MAP AND NOT A NAME MATCHER ────────────────
 *
 * A name matcher was written first, and it produced FALSE POSITIVES that would
 * each have filed a real holding under the wrong basket:
 *
 *     "Motilal Oswal Active Momentum Fund" → "Motilal Oswal Founders Fund II"
 *     "Motilal Oswal Wealth Delphi Equity Fund" → "Motilal Oswal Founders Fund II"
 *     "ICICI PRU BAF" (Balanced Advantage) → "ICICI Pru India Opportunities Fund"
 *
 * Sharing a fund HOUSE is not sharing a FUND. That is this repository's
 * index-cycled-valuation-method failure arriving through string similarity: the
 * wrong answer is invisible on screen, because a basket heading looks exactly
 * as authoritative whichever rows are under it. So every entry below was read
 * off the workbook and then adversarially re-checked, and the depository's own
 * abbreviations — `WOC MAAF D-GROW`, `BNDH L&MCF DP GR`, `ICICI IOPPF D-GRW` —
 * were decoded by hand rather than by similarity, which is precisely what a
 * matcher cannot do and a reader can.
 *
 * `reviewProduct` on every entry is the workbook row it came from, so any one
 * of these can be challenged against the family's own document.
 *
 * ── THIS NEVER REACHES `glowData.ts` ────────────────────────────────────────
 *
 * A basket is a family judgement, and the book regenerates byte-identically
 * from `source/` alone (§7). So this is a PRESENTATION-layer map, read only by
 * the pages that group holdings — `build-book.mjs` must never import it. It is
 * committed rather than held in `localStorage` (unlike `familyInputs.ts`)
 * because the family supplied it as a DOCUMENT rather than typing it in, which
 * is the same standing `shared/sectors.mjs` has: a committed map, nothing inferred.
 */
import type { Position } from "./types";
import { isCashEquivalent } from "./analytics";

export type FamilyBasket =
  | "Stable Growth" | "Entrepreneurial Growth" | "Thematic & Tactical" | "Liquidity";
export type FamilyAssetClass = "Equity" | "Debt" | "Alternate" | "Cash";

/** Reading order for the two new axes. Sections sort by this, never alphabetically. */
export const BASKET_ORDER: readonly FamilyBasket[] =
  ["Stable Growth", "Entrepreneurial Growth", "Thematic & Tactical", "Liquidity"];
export const FAMILY_CLASS_ORDER: readonly FamilyAssetClass[] =
  ["Equity", "Debt", "Alternate", "Cash"];

/**
 * WHAT A HOLDING THE FAMILY HAS NOT CLASSIFIED IS CALLED, and it is deliberately
 * a sentence rather than "Other". A reader who sees "Other" learns nothing about
 * whether to go and find something; this names the document that would fill it.
 * Both axes share it, because both have the same remedy.
 */
export const UNCLASSIFIED = "Not classified in the family's review";
export const UNCLASSIFIED_WHY =
  "The family's consolidated review (30 June 2026) does not list this holding, so neither its asset class nor its basket is stated. A later review naming it fills both.";

/** How an assignment was arrived at — surfaced on screen, never collapsed. */
export type TaxonomySource = "review" | "rule" | "derived";

export type TaxonomyEntry = {
  assetClass: FamilyAssetClass;
  basket: FamilyBasket;
  /** The row in the family's workbook this came from. */
  reviewProduct: string;
};

/**
 * THE PRODUCT KEY: a PMS mandate is one product (the mandate), everything else
 * is its security. That is the level the family's own review lists — it carries
 * "Carnelian Bespoke Portfolio" as one row, not its twelve shares — so keying
 * any other way would have nothing to join to.
 */
/**
 * ── THE THREE FIELDS THE TAXONOMY ACTUALLY READS ────────────────────────────
 *
 * Every function below reaches for exactly these: the account (a mandate is one
 * product), the security (everything else is), and our own asset class (the two
 * derivations). Nothing here reads a quantity, a price or a market value.
 *
 * It is stated as a type because a DATED RECORD has to be filed under the same
 * section as a holding — the Transactions table sections on the same three axes
 * the Holdings table does — and a trade is not a `Position`. The alternative was
 * to build a `Position`-shaped object around the three real fields with zeros
 * for the rest, which is a fabricated figure sitting one refactor away from
 * being rendered. Naming what is read is the honest version of the same join,
 * and `Position` is still assignable to it, so every existing caller is
 * unchanged.
 */
export type Classifiable = {
  /**
   * NULL IS "THE STATEMENT DID NOT SAY", and only a dated record can carry it —
   * a `Position` always states one. Both derivations below are already
   * null-safe by construction (they test for a specific class and answer null
   * otherwise), which is the honest answer: nothing was said, so nothing is
   * derived, and the record lands in the section that names the absence.
   */
  assetClass: Position["assetClass"] | null;
  securityKey: Position["securityKey"];
  accountId: Position["accountId"];
};

export const productKeyOf = (p: Classifiable, isMandate: boolean) =>
  isMandate ? `mandate:${p.accountId}` : `sec:${p.securityKey}`;

/**
 * The family's review, product by product. Ordered by value so the largest
 * assignments are the easiest to check against the workbook.
 */
export const FAMILY_TAXONOMY: Readonly<Record<string, TaxonomyEntry>> = {
  // ── Category-III and Category-II AIF folios ──────────────────────────────
  "sec:sanshi-fund-i-open-ended-aif-cat-iii-class-e":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Sanshi Fund 1" },
  "sec:sanshi-fund-i-open-ended-aif-cat-iii-class-a2":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Sanshi Fund 1" },
  "sec:buoyant-opportunities-strategy-category-iii-class-a4":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Buoyant Opportunities Portfolio AIF" },
  "sec:motilal-oswal-founders-fund-series-ii-class-g1":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Motilal Oswal Founders Fund II" },
  "sec:3p-india-equity-fund-1-class-b1":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "3P India Equity Fund 1" },
  "sec:3p-india-equity-fund-1-class-b2":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "3P India Equity Fund 1" },
  "sec:3p-india-equity-fund-1-class-b3":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "3P India Equity Fund 1" },
  "sec:carnelian-bharat-amritkaal-fund":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Carnelian Bharat Amritkaal Fund" },
  /**
   * DELPHI IS THE REVIEW'S "FUND OF FUNDS", and the workbook is the only place
   * that says so — it lists this holding under what it OWNS rather than under
   * the manager's own name for it. `CLAUDE.md` had already recorded the same
   * identification from the other direction, when Delphi's ₹11,12,87,535.35 was
   * tied to the review's ₹11,12,87,435.35 (₹100 apart, because the review rounds
   * the NAV to two decimals and we derive from four).
   */
  "sec:motilal-oswal-wealth-delphi-equity-fund":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Fund of Funds (VEC+ Carnelian+Girik Cap+Insightful)" },
  // A DEBT holding wearing an AIF wrapper — the case our own class cannot see.
  "sec:neo-infra-income-opportunities-fund-i-class-a5":
    { assetClass: "Debt", basket: "Stable Growth", reviewProduct: "Neo Infra Income Opportunities Fund Share Class A5" },
  // Private capital: the family's ALTERNATE, all Entrepreneurial Growth.
  "sec:baring-private-equity-india-fund-6-class-a1":
    { assetClass: "Alternate", basket: "Entrepreneurial Growth", reviewProduct: "Baring PE India Fund 6" },
  "sec:transition-venture-capital-fund-i-class-a1":
    { assetClass: "Alternate", basket: "Entrepreneurial Growth", reviewProduct: "Transition Venture Capital fund I" },
  "sec:360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii":
    { assetClass: "Alternate", basket: "Entrepreneurial Growth", reviewProduct: "360 One Special Opportunities Fund - Series 8 - Class A3 (AIF Category II)" },

  // ── THE PRIVATE-EQUITY BLOCK, ITEMISED ON ITS OWN TAB ────────────────────
  /**
   * The review's `Private Equity ₹136.16 Cr` is ONE AGGREGATE LINE on the
   * Alternate sheet, and `CLAUDE.md` already records that the reconciler has to
   * carry it as a block with no custodian to ask for it. It IS itemised — on the
   * workbook's own `Private Investments` tab, corroborated row for row by
   * `Private Equity Excl Pre IPO` — and three of those rows are holdings this
   * book carries. All three are Entrepreneurial Growth / Alternate, and none of
   * them appears on any basket sheet, so there is no second answer to weigh.
   *
   * THAT TAB FILLS A GAP AND NEVER OVERRIDES, and the workbook itself is why.
   * Two of its rows — `M/S Grand Continent Hotels` and `Parth Electrical &
   * Engineering` — also sit on the live `Thematic,Tactical` sheet with real
   * figures whose share counts tie to this book exactly (262,125 and 59,000),
   * while their Private Investments rows are ₹0 and Parth's carries the remark
   * "Listed in Aug'25". The family moved both out of private capital when they
   * listed. Reading the tab as authoritative would drag them back and refile
   * ₹5.31 Cr of listed equity as Alternate — so the live sheets win, and the
   * private tab speaks only where nothing else does.
   */
  /**
   * THE WARRANT — AND WHY THIS JOIN IS LICENSED WHERE A NAME MATCH IS NOT.
   * `CLAUDE.md` names "a Borosil WARRANT against the Borosil EQUITY" as a join
   * that must never be made, and this book holds BOTH: 11,495 Borosil Renewables
   * SHARES inside two PMS mandates, and these 283,018 WARRANTS in the ICICI NSDL
   * demat. On the name alone they are indistinguishable. On the ARITHMETIC they
   * are not: the workbook's ₹3,74,99,885 over 283,018 warrants is ₹132.5000 each,
   * and ₹132.50 × 4 = ₹530.00 — the 25% upfront an Indian preferential warrant
   * allotment is subscribed at, reproduced to the rupee. The quantity is the
   * witness, which is the standard `dropDepositoryDuplicates` and `costFor`
   * already hold a join to. The mandate-held shares belong to their mandate's
   * own product and never reach this map.
   */
  "sec:borosil-renewables-limited-warrants-13ag26":
    { assetClass: "Alternate", basket: "Entrepreneurial Growth", reviewProduct: "Borosil Renewables" },
  /**
   * TWO BLUE ASHVA VEHICLES ARE IN THE REVIEW and only one is in this book:
   * `Blue Ashva Varenya Account` (₹0.02 Cr) and `Blue Ashva India Pool Account`
   * (₹3.74 Cr). The demat holds BAVF-SER20-C6, whose own name carries VARENYA,
   * and that distinguishing word is what joins it — matched on "Blue Ashva"
   * there would have been two candidates and no way to choose between them.
   */
  "sec:blue-ashva-varenya-fund-bavf-ser20-c6-restricted-transferability":
    { assetClass: "Alternate", basket: "Entrepreneurial Growth", reviewProduct: "Blue Ashva Varenya Account" },
  // `EVEREST FLEET-EQ1/` is the depository's clipping of Everest Fleet Private
  // Ltd, an unlisted company marked at its Re 1 face value — so it is worth ₹580
  // here while the review carries the family's ₹4.76 Cr of it under Private
  // Equity. The classification is of the COMPANY and holds either way.
  "sec:everest-fleet":
    { assetClass: "Alternate", basket: "Entrepreneurial Growth", reviewProduct: "Everest Fleet Private Ltd - SIDDHARTH LADSARIYA" },

  // ── PMS mandates ─────────────────────────────────────────────────────────
  /**
   * CARNELIAN IS STABLE GROWTH, AND IT IS THE REASON THE EMAIL'S RULE CANNOT
   * OVERRIDE THIS MAP. The family's email lists "PMS" under Thematic & Tactical;
   * their own workbook puts this PMS under Stable Growth. Both are the family's,
   * and the per-product statement is the more specific one — so the map always
   * wins and the rule only ever fills a gap (see `basketByRule` below).
   */
  "mandate:carnelian-asset-management-and-advisors-pvt-ltd-3517383":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Carnelian Bespoke Portfolio" },
  "mandate:goldstandard-wealth-private-limited-100023":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Aristos Equity Potrfolio - SB" },
  "mandate:goldstandard-wealth-private-limited-100022":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Aristos Equity Potrfolio - SB" },
  "mandate:svan-investment-managers-llp-8710067":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Svan Investment" },
  "mandate:svan-investment-managers-llp-8710090":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Svan Investment" },
  "mandate:green-lantern-capital-llp-510861":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Green Lantern Growth Strategy" },
  "mandate:green-lantern-capital-llp-510854":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Green Lantern Growth Strategy" },
  "mandate:v-e-c-assago-capital-management-llp-128005":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "VEC Small and Mid cap fund" },
  "mandate:v-e-c-assago-capital-management-llp-128004":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "VEC Small and Mid cap fund" },
  "mandate:molecule-ventures-llp-7810404":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Molecule Growth Strategy" },

  // ── Mutual funds, including the demat's abbreviated names ────────────────
  // These abbreviations are the depository's, and each was decoded by hand:
  // no similarity measure gets from "WOC MAAF D-GROW" to "WhiteOak Capital
  // Multi Asset Allocation Fund", and one that stretched far enough to try
  // would also match funds that merely share a house.
  "sec:helios-flexi-cap-fund-direct-growth":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Helios Flexi Cap Fund Direct (G)" },
  "sec:helios-fcf-d-grow":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Helios Flexi Cap Fund Direct (G)" },
  "sec:icici-ioppf-d-grw":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "ICICI Pru India Opportunities Fund" },
  "sec:bndh-l-and-mcf-dp-gr":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Bandhan Large & Mid Cap Fund - Direct Plan - Growth" },
  "sec:kotak-mtcf-d-grow":
    { assetClass: "Equity", basket: "Stable Growth", reviewProduct: "Kotak Multicap Fund-Direct Plan-Growth" },
  // Hybrid and multi-asset funds: the family's EQUITY by exposure, LIQUIDITY by
  // purpose. Both halves come from the workbook — the fund is listed on the
  // Equity sheet AND on the Liquid basket sheet.
  "sec:absl-bal-adv-growth":
    { assetClass: "Equity", basket: "Liquidity", reviewProduct: "Aditya Birla SL Balanced Advantage Fund(G)" },
  "sec:hdfc-baf-d-grow":
    { assetClass: "Equity", basket: "Liquidity", reviewProduct: "HDFC Balanced Advantage Fund" },
  "sec:hdfc-baf-r-grow":
    { assetClass: "Equity", basket: "Liquidity", reviewProduct: "HDFC Balanced Advantage Fund" },
  "sec:icici-pru-baf-dp-grw":
    { assetClass: "Equity", basket: "Liquidity", reviewProduct: "ICICI Pru Balanced Advantage Fund" },
  "sec:woc-maaf-d-grow":
    { assetClass: "Equity", basket: "Liquidity", reviewProduct: "WhiteOak Capital Multi Asset Allocation Fund-Direct(G)" },
  // Liquid funds — the family's CASH, not Debt. Their own Cash sheet lists them.
  "sec:absl-liqf-d-growth":
    { assetClass: "Cash", basket: "Liquidity", reviewProduct: "Aditya Birla SL Liquid Fund-Direct (G)" },
  "sec:icici-liqf-d-growth":
    { assetClass: "Cash", basket: "Liquidity", reviewProduct: "ICICI Pru Liquid Fund-Direct(G)" },
  "sec:hdfc-liquid-fund-direct-plan-growth-option":
    { assetClass: "Cash", basket: "Liquidity", reviewProduct: "HDFC Liquid Fund -Direct(G)" },

  // ── ETFs: two are the family's ALTERNATE, one is CASH ────────────────────
  // The single clearest case for why an ETF cannot be bucketed by its wrapper.
  "sec:dsp-gold-etf":
    { assetClass: "Alternate", basket: "Thematic & Tactical", reviewProduct: "DSP Gold ETF" },
  "sec:dsp-silver-etf":
    { assetClass: "Alternate", basket: "Thematic & Tactical", reviewProduct: "DSP Silver ETF" },
  "sec:nip-etnf1d-rtliqbees":
    { assetClass: "Cash", basket: "Liquidity", reviewProduct: "Nippon India ETF Nifty 1D Rate Liquid Bees-IDCW" },

  // ── Direct equity the review names individually ──────────────────────────
  // Every one of these is Thematic & Tactical on the family's own sheet, which
  // is what licenses the rule below for the ones it does not name.
  "sec:fractal-analytics":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Fractal Analytics Limited" },
  "sec:clean-max-enviro-energy-solutions":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Clean Max Enviro Energy Solutions Ltd" },
  "sec:yash-highvoltage":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Yash High Voltage Ltd." },
  "sec:smartworks-coworking-spaces":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Smart Works" },
  "sec:pg-electro":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "PG Electro." },
  "sec:onesource-special":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Onesource Specialty Pharma" },
  // "Jaro Education" is the review's name for Jaro Institute of Technology
  // Management and Research Limited — the brand, not a different company.
  "sec:jaro-institute-of-technology-management-and-research":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Jaro Education" },
  "sec:grand-continent-hotels":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "M/S Grand Continent Hotels" },
  "sec:parth-electricals-and-engineering":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Parth Electrical & Engineering" },
  "sec:insolation-energy":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Insolation Energy Ltd" },
  "sec:kaynes-technology":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Kaynes Technology India ltd" },
  "sec:zaggle-prepaid":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Zaggle Prepaid Ocean Services Ltd." },
  "sec:birla-cable":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Birla Cable Ltd." },
  "sec:infinium-pharma":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Infinium Pharmachem Ltd." },
  "sec:bharat-parenteral":
    { assetClass: "Equity", basket: "Thematic & Tactical", reviewProduct: "Bharat Parenterals Ltd" },
};

/**
 * THE FAMILY'S STATED RULE, APPLIED ONLY WHERE THEIR MAP IS SILENT.
 *
 *   "Thematic & Tactical - Themes like Gold, Silver, Sectoral funds, sectoral
 *    etfs, ALL THE DIRECT STOCKS, PMS, Hybrid funds, multi asset funds, Direct Bonds"
 *
 * That is the family instructing, not this file inferring, and their own
 * workbook corroborates the direct-stock clause on every case it names: all 15
 * individually-listed direct stocks above are Thematic & Tactical, with no
 * counterexample. So a company share the review does not name is filed there
 * and TAGGED `rule` — never `review` — so the page can say how much of a basket
 * was assigned this way rather than presenting the two as one fact.
 *
 * THE OTHER CLAUSES OF THAT SENTENCE ARE DELIBERATELY NOT APPLIED. "PMS" is in
 * the same list, and the family's own workbook puts the Carnelian PMS under
 * Stable Growth — so using the rule to fill a gap for an unmapped mandate would
 * contradict the more specific thing they said. A rule with a known
 * counterexample is not a rule this book will apply to money.
 */
const basketByRule = (p: Classifiable): FamilyBasket | null =>
  p.assetClass === "Equity" ? "Thematic & Tactical" : null;

/**
 * The family's asset class where OUR class already answers it beyond doubt.
 * Exactly two cases, and both hold by definition rather than by observation: a
 * share in a company is equity exposure under every taxonomy, and cash is cash.
 * `AIF`, `Mutual Fund` and `ETF` are absent on purpose — each is genuinely
 * ambiguous on this book, and each is measured in this file's header.
 */
const classByDerivation = (p: Classifiable): FamilyAssetClass | null =>
  p.assetClass === "Equity" ? "Equity" : p.assetClass === "Cash" ? "Cash" : null;

export type Resolved<T> = { value: T; source: TaxonomySource; reviewProduct: string | null };

/**
 * ── CASH ON THE FAMILY'S OWN AXES TOO, BECAUSE THEY SAID "EVERYWHERE" ──────
 *
 *   "Wherever we have cash as asset class or category … arbitrage funds are
 *    nothing but basically cash … need not be classified into any other
 *    category except for cash."
 *
 * Their review files its arbitrage funds on the DEBT sheet, which is why this
 * is a RULE and not a map entry: a map entry reading Cash would cite a workbook
 * row that says Debt, and `familyTaxonomy.test.ts` would rightly fail it as a
 * citation nobody can follow. So the family's instruction is applied here and
 * tagged `rule`, and the page can say how much of its Cash was placed that way
 * rather than presenting it as the review's answer.
 *
 * ON THE BASKET AXIS "CASH" IS LIQUIDITY. There is no Cash basket; the family's
 * four are Stable Growth, Entrepreneurial Growth, Thematic & Tactical and
 * Liquidity, and their own workbook files EVERY cash equivalent it names — the
 * four liquid funds, Liquid BeES and all four arbitrage funds — on its Liquid
 * sheet, with no counterexample. That is the evidence that licenses this as a
 * rule, the same standing the direct-stock rule has below.
 *
 * NEVER INSIDE A MANDATE. A liquid sleeve a PMS holds belongs to the mandate
 * product, whose row has to tie to its own statement — the order
 * `holdingBucket` keeps on the category axis, kept here for the same reason.
 *
 * WHERE THE REVIEW ALREADY SAYS CASH, THE REVIEW IS THE SOURCE. The liquid
 * funds are on its Cash sheet by name, so they keep `review`; only a cash
 * equivalent the review files elsewhere, or does not name, is `rule`.
 */
const cashByInstruction = (p: Classifiable, isMandate: boolean): boolean =>
  !isMandate && isCashEquivalent(p);

/**
 * WHICH BASKET, AND ON WHOSE AUTHORITY. `null` where nobody has said — which is
 * a section on screen with its reason, never a holding quietly dropped from the
 * table or swept into whichever basket happens to be first.
 */
export function familyBasket(p: Classifiable, isMandate: boolean): Resolved<FamilyBasket> | null {
  const hit = FAMILY_TAXONOMY[productKeyOf(p, isMandate)];
  if (cashByInstruction(p, isMandate)) {
    return hit?.basket === "Liquidity"
      ? { value: "Liquidity", source: "review", reviewProduct: hit.reviewProduct }
      : { value: "Liquidity", source: "rule", reviewProduct: hit?.reviewProduct ?? null };
  }
  if (hit) return { value: hit.basket, source: "review", reviewProduct: hit.reviewProduct };
  // A mandate is never rule-filled: see `basketByRule`.
  const byRule = isMandate ? null : basketByRule(p);
  return byRule ? { value: byRule, source: "rule", reviewProduct: null } : null;
}

/** The family's asset class, same contract. */
export function familyAssetClass(p: Classifiable, isMandate: boolean): Resolved<FamilyAssetClass> | null {
  const hit = FAMILY_TAXONOMY[productKeyOf(p, isMandate)];
  if (cashByInstruction(p, isMandate)) {
    return hit?.assetClass === "Cash"
      ? { value: "Cash", source: "review", reviewProduct: hit.reviewProduct }
      : { value: "Cash", source: "rule", reviewProduct: hit?.reviewProduct ?? null };
  }
  if (hit) return { value: hit.assetClass, source: "review", reviewProduct: hit.reviewProduct };
  const derived = classByDerivation(p);
  return derived ? { value: derived, source: "derived", reviewProduct: null } : null;
}

/** Section key for a holding on each axis — `UNCLASSIFIED` where nobody has said. */
export const basketKeyOf = (p: Classifiable, isMandate: boolean) =>
  familyBasket(p, isMandate)?.value ?? UNCLASSIFIED;
export const familyClassKeyOf = (p: Classifiable, isMandate: boolean) =>
  familyAssetClass(p, isMandate)?.value ?? UNCLASSIFIED;

/** Reading order, with the unclassified section always last on either axis. */
export const basketOrd = (k: string) => {
  const i = (BASKET_ORDER as readonly string[]).indexOf(k);
  return i < 0 ? BASKET_ORDER.length : i;
};
export const familyClassOrd = (k: string) => {
  const i = (FAMILY_CLASS_ORDER as readonly string[]).indexOf(k);
  return i < 0 ? FAMILY_CLASS_ORDER.length : i;
};

/**
 * HOW MANY OF THESE ROWS THE FAMILY ACTUALLY NAMED, per section. A basket whose
 * every row came from the rule is a different claim from one the review states
 * product by product, and on screen they are the same heading — so the section
 * says which, and this is what it counts.
 */
export function taxonomyCoverage(
  rows: readonly { position: Position; isMandate: boolean; marketValue: number }[],
  axis: "basket" | "assetClass",
) {
  const out = { review: 0, rule: 0, derived: 0, none: 0, reviewMV: 0, ruleMV: 0, derivedMV: 0, noneMV: 0 };
  for (const r of rows) {
    const res = axis === "basket" ? familyBasket(r.position, r.isMandate) : familyAssetClass(r.position, r.isMandate);
    const k = res?.source ?? "none";
    out[k]++; out[`${k}MV` as "reviewMV"] += r.marketValue;
  }
  return out;
}
