// ── WHICH SEBI CATEGORY AN AIF IS, AND WHICH SIDE OF THE BOOK THAT PUTS IT ──
//
//   "Sanshi, Buoyant and Carnelian. These are not private market investments.
//    They should come under AIFs. In fact they are already in AIF."
//
// The read itself was written for the AIF drill-down's own sections (Stage
// 10aw) and lived in `src/lib/aifCategory.ts`, where only the browser could
// reach it. It is HERE now because `build-book` needs the same answer: the
// listed/private split is generated, and a second copy of this rule on the Node
// side would be a second taxonomy — the failure `shared/sectors.mjs` exists to
// prevent one map over.
//
// `src/lib/aifCategory.ts` is the browser's door to this file. Nothing about
// the read changed when it moved; what is NEW below is `marketSideOf`.
//
// ── THE DEFECT THIS FIXES ───────────────────────────────────────────────────
//
// `PRIVATE_CLASSES = {AIF, Unlisted, Structured Product}` put EVERY AIF on the
// private side. That was true of the AIFs this book held when it was written —
// 360 ONE Special Opportunities and Transition Venture, both drawdown vehicles
// — and false from the drop that brought the Category III folios, which nobody
// re-measured. **₹297.78 Cr, 84% of the "private" half, is Category III**:
// Sanshi, Buoyant and Carnelian Bharat Amritkaal, the three the family named.
//
// It is the same shape as `listedValue: totalValue, privateValue: 0`, which
// CLAUDE.md already records: true when every account in the book was a
// listed-equity mandate, false the moment the AIF statements got a reader.
//
// AND THE STATED PRINCIPLE DID NOT SURVIVE ITS OWN BOOK. The old rule's comment
// said the split is "a mark from an exchange vs a mark from a manager" — but a
// MUTUAL FUND's NAV comes from its AMC and sits on the LISTED side, while a
// Category III AIF's NAV comes from its manager and sat on the private one.
// Same shape, opposite sides. The axis was never the mark; it was
// `assetClass === "AIF"` standing in for private capital.
//
// ── SO IT IS READ, NEVER INFERRED ───────────────────────────────────────────
//
// SEBI's three categories are what the statements print, and what they mean is
// regulation rather than a judgement about any particular fund: Category III is
// the funds that trade in LISTED securities and derivatives; Categories I and
// II are the private-capital ones — venture, angel, infrastructure, private
// equity, debt and funds of funds. So the side follows the category, and a fund
// whose statement prints NO category is placed on NEITHER side and is named.
//
// ── AND THE FAMILY'S OWN REVIEW IS A SECOND WITNESS THAT AGREES ─────────────
//
// `familyTaxonomy.ts` carries the asset class the family's consolidated review
// gives each product. Measured across the AIF rows where both documents speak,
// **11 of 13 agree** — every Category III row is `Equity` in the review, and
// every private-equity row is `Alternate`:
//
//     Category III   Sanshi ×4, Buoyant ×2, Carnelian Amritkaal   → Equity
//     Private equity Baring PE, Transition Venture                → Alternate
//     Category II    360 ONE Special Opportunities                → Alternate
//     Category II    Motilal Oswal Founders Fund II (2 folios)    → Equity  ✗
//
// The two that differ are one fund, and **THE STATEMENT WINS** — the rule
// `shared/sectors.mjs` already applies where its own tiers disagree, and
// `build-symbols` where an ISIN and a name do. The review is reported as a
// cross-check and is never a tier here: it is not a total function onto this
// axis (its `Debt` maps to neither side), and a rule with a known counterexample
// is not a rule this book will apply to money.
//
// The disagreement is NAMED in `docs/BOOK-REPORT.md` rather than resolved
// silently, so a human can settle it against the fund's own SEBI registration.

// ── THE READ ITSELF, AND THE TWO PLACES A CATEGORY IS PRINTED ──────────────
//
//   "when you're drilling down in the AIF ना नवल, make it cat one, cat two, cat
//    three … क्योंकि there are only three categories."
//
// SEBI has three categories and the family are right that every AIF is in one
// of them. **THIS BOOK DOES NOT KNOW WHICH FOR EVERY FUND**, and those are
// different facts: the first is about the regulation, the second is about the
// paperwork in `source/`. Filing a fund under a category no document states
// would be a fabricated classification — `VAL_METHODS[i % 5]` assigning "DCF"
// by row order, arriving through a section heading, and a heading looks exactly
// as authoritative whichever rows sit under it.
//
// Both sources are the statement's own words, with the standing
// `providerSector` and `providerEngagement` already have in this model:
//
//   • THE SECURITY NAME, which names the FUND —
//       `Sanshi Fund-I (Open Ended AIF CAT-III) — Class E`
//       `BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A4`
//       `360 ONE SPECIAL OPPORTUNITIES FUND … (AIF CATEGORY II)`
//   • `Account.providerEngagement`, which describes the ACCOUNT —
//       `Category II AIF - drawdown, with a commitment and called capital`
//       `Category I Alternative Investment Fund – Angel Fund`
//
// ── A PHRASE NAMING TWO CATEGORIES RESOLVES TO NEITHER ──────────────────────
//
// Transition Venture Capital's account reads **`Category I/II AIF — drawdown`**.
// That is the issuer declining to commit, and picking one of the two would be
// this book inventing the answer the document withheld. It yields both, the
// caller sees a set of size two, and the holding is filed as not stated — with
// its own wording, because "the statement names two categories" and "the
// statement names none" send a reader to different documents.

export const CATEGORY_I = "Category I";
export const CATEGORY_II = "Category II";
export const CATEGORY_III = "Category III";

/** Reading order: the SEBI categories in order, then what is not stated. */
export const AIF_CATEGORIES = [CATEGORY_I, CATEGORY_II, CATEGORY_III];

/**
 * EVERY CATEGORY A PIECE OF TEXT NAMES, not the first one.
 *
 * `Category I/II` has to come back as BOTH or the ambiguity is lost at the
 * first step and can never be recovered. The pattern is anchored on the word so
 * a `Class A2` or a `Series II` cannot be read as a category: `\bcat` requires
 * the word, and the numeral must follow it.
 *
 * ── TWO THINGS STOP `III` BEING READ AS `I`, AND ONLY ONE IS LOAD-BEARING ──
 *
 * Reading `CAT-III` as Category I would file ₹297.78 Cr — 84% of this book's
 * AIF row — under the wrong heading, silently. Two things prevent it and the
 * first draft of this comment credited the wrong one, which is the
 * comment-asserting-an-enforcement-that-never-happens failure this repo names:
 *
 *   • THE TRAILING `\b` — the real guard. Matching `I` out of `III` leaves
 *     `II` after it, and a word boundary between two word characters fails, so
 *     the engine backtracks to `III`. **Measured: with it, BOTH alternation
 *     orders read `CAT-III` correctly; without it, `I|II|III` reads it as `I`.**
 *   • the alternation ordered longest-first, which is the backup and is what
 *     would carry it if the boundary were ever loosened.
 *
 * Either alone is sufficient here, so the suite asserts BOTH variants rather
 * than only the one this file happens to use.
 */
export function categoriesNamedIn(text) {
  if (!text) return [];
  const out = new Set();
  // `cat`/`category`, any dash or space, then one or more numerals separated by
  // slashes — `Category I/II`, `CAT-III`, `Category 2`.
  for (const m of String(text).matchAll(/\b(?:categor(?:y|ies)|cat)[\s‐-―-]*((?:III|II|I|[123])(?:\s*\/\s*(?:III|II|I|[123]))*)\b/gi)) {
    for (const part of m[1].split("/")) {
      const t = part.trim().toUpperCase();
      const c = t === "I" || t === "1" ? CATEGORY_I
        : t === "II" || t === "2" ? CATEGORY_II
        : t === "III" || t === "3" ? CATEGORY_III : null;
      if (c) out.add(c);
    }
  }
  return AIF_CATEGORIES.filter((c) => out.has(c));
}

/**
 * ── WHAT THE FAMILY HAVE SAID, WHERE NO STATEMENT SPEAKS ────────────────────
 *
 *   "Motilal Oswal Wealth Delphi Equity Fund and Neo Infra Income Opportunities
 *    Fund I — Class A5: classify both of these AIFs as Category 2 funds."
 *
 * Neither fund's name nor its account's wording prints a SEBI category, so the
 * read above leaves both UNSTATED and the book placed them on neither side of
 * the listed/private split. The family have now said which category each is,
 * and a category is a fact about their own investments that is theirs to
 * supply — the standing `familyTaxonomy.ts` already has for a basket.
 *
 * THREE RULES, and each is a wrong answer this map could otherwise give:
 *
 *   • IT ONLY EVER FILLS AN EMPTY. A declaration is consulted where BOTH printed
 *     fields are silent and never where a statement names a category — the rule
 *     `shared/sectors.mjs` applies to its own lower tiers. A declaration that
 *     disagreed with a printed category would be a conflict to show a human,
 *     not a value to take; the suite asserts every entry here is load-bearing,
 *     i.e. that its statement really is silent.
 *   • IT IS KEYED ON THE `securityKey`, because a category is a property of the
 *     FUND and not of one folio: a second family member subscribing to Delphi
 *     is the same fund in the same category. Never on the security NAME — the
 *     browser renders a DISPLAY label (`displaySecurity`, the AMFI scheme name)
 *     in that field, and a name matcher here would be a fuzzy tier.
 *   • IT SAYS WHERE IT CAME FROM. `source` travels with the read, so a page can
 *     say "declared by the family" beside a category no statement printed — a
 *     section heading looks exactly as authoritative whichever put a row under
 *     it, and the reader is owed the difference.
 *
 * WHAT THE ARCHIVE CORROBORATES, MEASURED RATHER THAN ASSUMED. Neo Infra's own
 * statement prints its manager's SEBI registration on its disclaimer page —
 * `AIF -Category-II No : IN/AIF2/22-23/1042` — and the family's Motilal demat
 * files the same units as `NEO INFRA INCOME OPPORTUNITIES FUND-CAT II AIF`, so
 * the family's answer agrees with two documents already in hand. Nothing in the
 * archive states Delphi's category at all: its statement prints no category and
 * no registration number, so that entry rests on the family's word alone and
 * says so.
 *
 * Written as plain literals, one entry per line of `"key": {`, because
 * `check-pages.mjs` reads this block as committed DATA and re-derives the side
 * from it rather than importing this module — a check that imports the helper
 * it is checking agrees with it by construction.
 */
export const DECLARED_AIF_CATEGORY = {
  "motilal-oswal-wealth-delphi-equity-fund": { category: "Category II", source: "family", declaredOn: "2026-09-23", corroboration: null },
  "neo-infra-income-opportunities-fund-i-class-a5": { category: "Category II", source: "family", declaredOn: "2026-09-23", corroboration: "the statement prints its SEBI registration, AIF -Category-II No : IN/AIF2/22-23/1042, and the family's demat files the units as CAT II AIF" },
};

/** The family's declared category for a fund, where there is one. */
export function declaredAifCategory(securityKey) {
  if (!securityKey) return null;
  return Object.prototype.hasOwnProperty.call(DECLARED_AIF_CATEGORY, securityKey)
    ? DECLARED_AIF_CATEGORY[securityKey] : null;
}

/**
 * The phrases that make a fund a private-equity or venture vehicle, matched
 * against the FUND'S OWN NAME and its account's engagement wording.
 *
 * DELIBERATELY NARROW, and every entry is a phrase an issuer prints about
 * ITSELF. `\bventure capital\b` and not `venture`, because "Venture" appears in
 * ordinary company names; `private equity` as the whole phrase. There is no
 * fuzzy tier here for the reason `shared/nameMatch.mjs` records at length — a
 * token-overlap rule on this corpus matched `KIRANAKART TECHNOLOGIES` to `TATA
 * TECHNOLOGIES` — and a near miss is listed for a human rather than committed.
 */
const PE_PHRASES = [
  /\bprivate equity\b/i,
  /\bventure capital\b/i,
  /\bgrowth equity\b/i,
  /\bbuyout\b/i,
];

/** Whether the paperwork calls this fund a private-equity or venture vehicle. */
export function readsAsPrivateEquity(security, account) {
  const hay = [security, account?.providerEngagement, account?.strategy, account?.provider]
    .filter(Boolean).join(" · ");
  return PE_PHRASES.some((re) => re.test(hay));
}

/**
 * THE CATEGORY OF ONE HOLDING, from the security name and the account's own
 * engagement wording.
 *
 * Neither field is preferred over the other. WHERE BOTH SPEAK THEY MUST AGREE,
 * and a disagreement leaves the holding UNSTATED rather than letting either
 * side win silently. Measured over this book that check fires ZERO times, and
 * it is reported at zero for the reason this repo keeps naming: a guard that
 * only speaks when it fires is indistinguishable, on a clean run, from one that
 * was deleted.
 */
export function readAifCategory(security, account, securityKey) {
  const fromSecurity = categoriesNamedIn(security);
  const fromEngagement = categoriesNamedIn(account?.providerEngagement);
  const union = AIF_CATEGORIES.filter((c) => fromSecurity.includes(c) || fromEngagement.includes(c));

  if (union.length === 0) {
    // THE FAMILY'S DECLARATION FILLS THIS GAP AND NO OTHER — see
    // `DECLARED_AIF_CATEGORY`. Consulted only where both printed fields are
    // silent, so a statement that names a category always wins.
    const declared = declaredAifCategory(securityKey);
    if (declared) return { category: declared.category, fromSecurity, fromEngagement, why: null, source: "family" };
    return { category: null, fromSecurity, fromEngagement, why: "unstated", source: null };
  }
  if (union.length > 1) {
    // TWO SOURCES NAMING DIFFERENT SINGLE CATEGORIES IS NOT THE SAME FAULT as
    // one source naming two. The first says the paperwork disagrees with itself
    // and someone must decide; the second says the issuer never committed.
    const conflict = fromSecurity.length === 1 && fromEngagement.length === 1 && fromSecurity[0] !== fromEngagement[0];
    return { category: null, fromSecurity, fromEngagement, why: conflict ? "conflict" : "ambiguous", source: null };
  }
  return { category: union[0], fromSecurity, fromEngagement, why: null, source: "statement" };
}

// ── THE LISTED / PRIVATE SIDE ───────────────────────────────────────────────

/**
 * Asset classes that are private capital WHATEVER any statement says about
 * them. An unlisted company's shares and a structured note have no exchange
 * behind them and no SEBI category to read; `AIF` is deliberately NOT here,
 * because for an AIF the category is what decides.
 */
const ALWAYS_PRIVATE = new Set(["Unlisted", "Structured Product"]);

/**
 * WHICH SIDE OF THE BOOK ONE HOLDING SITS ON — `"listed"`, `"private"`, or
 * `null` where no statement places it.
 *
 * `null` IS A THIRD ANSWER AND NEVER A DEFAULT TO EITHER SIDE. Three holdings
 * in this book reached it (₹16.69 Cr) until the family declared two of them —
 * Motilal Oswal Wealth Delphi Equity Fund and Neo Infra Income Opportunities —
 * Category II (`DECLARED_AIF_CATEGORY`). Blue Ashva Varenya still reaches it:
 * no statement prints its category and nobody has declared one. Filing it
 * private would claim it is private capital; filing it listed would claim the
 * opposite. Both are claims no document makes, so the split is three-way and
 * the third is NAMED with its value wherever the other two are printed.
 *
 * Private equity outranks the category for the same reason it does in the AIF
 * drill-down: a fund whose own name says `Private Equity` is private capital
 * whether its statement calls it Category I or II, and Transition Venture's
 * `Category I/II` — the issuer declining to commit — would otherwise be
 * unplaced despite naming its own discipline.
 */
export function marketSideOf(position, account) {
  const cls = position?.assetClass;
  if (ALWAYS_PRIVATE.has(cls)) return "private";
  if (cls !== "AIF") return "listed";
  if (readsAsPrivateEquity(position.security, account)) return "private";
  const { category } = readAifCategory(position.security, account, position.securityKey);
  if (category === CATEGORY_III) return "listed";
  if (category === CATEGORY_I || category === CATEGORY_II) return "private";
  return null;
}

/**
 * What `marketSide === null` means, in words, for the surface that prints it.
 *
 * PLURAL AND SENTENCE-CASED, because every caller states it over a SET — a
 * facet's rows, a list of funds — and never over one holding. The singular
 * version read "…for this fund…" under a list of three, and lowercase after a
 * full stop.
 */
export const MARKET_SIDE_UNPLACED =
  "No statement for these funds prints a SEBI category, so this book places them on neither"
  + " the listed nor the private side";
