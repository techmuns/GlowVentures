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
export function readAifCategory(security, account) {
  const fromSecurity = categoriesNamedIn(security);
  const fromEngagement = categoriesNamedIn(account?.providerEngagement);
  const union = AIF_CATEGORIES.filter((c) => fromSecurity.includes(c) || fromEngagement.includes(c));

  if (union.length === 0) return { category: null, fromSecurity, fromEngagement, why: "unstated" };
  if (union.length > 1) {
    // TWO SOURCES NAMING DIFFERENT SINGLE CATEGORIES IS NOT THE SAME FAULT as
    // one source naming two. The first says the paperwork disagrees with itself
    // and someone must decide; the second says the issuer never committed.
    const conflict = fromSecurity.length === 1 && fromEngagement.length === 1 && fromSecurity[0] !== fromEngagement[0];
    return { category: null, fromSecurity, fromEngagement, why: conflict ? "conflict" : "ambiguous" };
  }
  return { category: union[0], fromSecurity, fromEngagement, why: null };
}

// ── THE LISTED / PRIVATE SIDE ───────────────────────────────────────────────

/**
 * Asset classes that are private capital WHATEVER any statement says about
 * them. An unlisted company's shares and a structured note have no exchange
 * behind them and no SEBI category to read; `AIF` is deliberately NOT here,
 * because for an AIF the category is what decides.
 */
const ALWAYS_PRIVATE = new Set(["Unlisted", "Structured Product"]);

// ── WHAT A FUND INVESTS IN, AS THE FAMILY HAVE STATED IT ────────────────────
//
//   "private market fund needs to be here in private market only" — sent with
//    the family's own classification of every capital account in the book:
//    India SME, Baring, Transition, Neo Infra and Sky Capital are PRIVATE
//    MARKET; Carnelian Bharat Amritkaal, Motilal Oswal Delphi Equity and
//    Motilal Oswal Founders Fund are PUBLIC MARKET. "A capital-call/drawdown
//    structure tells you how the investor funds the vehicle; it does not tell
//    you whether the fund invests in private or public assets."
//
// THE SEBI CATEGORY WAS A PROXY FOR THAT, AND THIS BOOK HOLDS ITS COUNTEREXAMPLE.
// Motilal Oswal's Founders Fund prints Category II — the category this file
// treats as private capital — and invests in LISTED Indian equities. The
// family's consolidated review had already filed it as `Equity`, and this file
// used to say THE STATEMENT WINS. The statement still says Category II and
// nothing here overwrites that; what changed is that the SIDE is no longer
// inferred from it for a fund the family have placed themselves. A rule with a
// known counterexample is not a rule this book applies to money — that was this
// file's own argument against the review, and it cuts against the category too.
//
// Two funds the statements never placed at all are placed here by the same
// statement: Delphi (an equity fund of Category III managers — listed) and Neo
// Infra (operating road and renewable assets — private).
//
// ── A DECISION ABOUT THE FAMILY'S AFFAIRS, NOT A PARSING RULE ───────────────
//
// It is the ring-fence's standing (`RINGFENCED_SECURITY_KEYS` in build-book):
// one committed table, applied where the side is GENERATED, reversible by
// deleting a line. Each entry says what the fund invests in, in the family's
// words, and when they said it. Matched on the FUND'S OWN NAME — the name its
// statement prints, or its capital account's — never on a similarity: every
// pattern is the fund's whole name anchored on the word, so `Delphi Equity
// Fund` cannot reach a different Motilal Oswal scheme. A fund the family have
// not named falls through to the SEBI category exactly as before.
//
// Sanshi and Buoyant are here on the family's EARLIER instruction ("Sanshi,
// Buoyant and Carnelian. These are not private market investments"), which the
// category happened to agree with; recording it means a future statement that
// stops printing CAT-III cannot quietly move them.
export const FAMILY_MARKET_SIDE = [
  { fund: "India SME Investments", match: /\bindia sme investments?\b/i, side: "private",
    invests: "private equity in early-growth SMEs", said: "2026-09-23" },
  { fund: "Baring Private Equity India Fund", match: /\bbaring private equity india\b/i, side: "private",
    invests: "private equity", said: "2026-09-23" },
  { fund: "Transition Venture Capital Fund", match: /\btransition venture capital\b/i, side: "private",
    invests: "early-stage energy-transition companies — venture capital", said: "2026-09-23" },
  { fund: "Neo Infra Income Opportunities Fund", match: /\bneo infra income opportunities\b/i, side: "private",
    invests: "operating road and renewable infrastructure assets", said: "2026-09-23" },
  { fund: "Sky Capital Rising Titans Fund", match: /\bsky capital rising titans\b/i, side: "private",
    invests: "venture investments in private companies", said: "2026-09-23" },
  { fund: "Carnelian Bharat Amritkaal Fund", match: /\bcarnelian bharat amritkaal\b/i, side: "listed",
    invests: "a flexi-cap portfolio of listed Indian equities", said: "2026-09-23" },
  { fund: "Motilal Oswal Delphi Equity Fund", match: /\bdelphi equity fund\b/i, side: "listed",
    invests: "Category III equity managers, as a fund of funds", said: "2026-09-23" },
  { fund: "Motilal Oswal Founders Fund", match: /\bmotilal oswal founders fund\b/i, side: "listed",
    invests: "listed Indian equities", said: "2026-09-23" },
  { fund: "Sanshi Fund", match: /\bsanshi fund\b/i, side: "listed",
    invests: "listed securities", said: "Stage 10bp" },
  { fund: "Buoyant Opportunities Strategy", match: /\bbuoyant opportunities strategy\b/i, side: "listed",
    invests: "listed securities", said: "Stage 10bp" },
];

/**
 * THE FAMILY'S OWN PLACING OF A FUND, or null where they have not named it.
 *
 * Matched on the fund's name and on the account's own strategy and provider —
 * the same haystack `readsAsPrivateEquity` reads — because a capital account
 * and its holding print the fund's name in different fields. First match wins,
 * and no two entries can match one fund: every pattern is a different fund's
 * whole name, which `marketSide.test.ts` asserts against the book.
 */
export function familyMarketDecision(name, account) {
  const hay = [name, account?.strategy, account?.provider].filter(Boolean).join(" · ");
  return FAMILY_MARKET_SIDE.find((d) => d.match.test(hay)) ?? null;
}

/**
 * WHICH SIDE ONE AIF IS ON, from its name — the fund-level half of
 * `marketSideOf`, for a caller holding a fund rather than a position.
 *
 * A CAPITAL ACCOUNT is the case that needs it: India SME and Sky Capital
 * publish no NAV, so they carry no position to read a side off, and the Private
 * Market page still has to know which side their capital account belongs on.
 * ONE rule for both, so a fund's holding and its capital account cannot land
 * on different sides of the page.
 */
export function fundMarketSideOf(name, account) {
  return fundMarketSideBasis(name, account).side;
}

/**
 * THE SIDE AND THE REASON FOR IT — which a page needs in order to say why a
 * fund is where it is. Four reasons, in the order they are tried:
 *
 *   family          the family have said what the fund invests in
 *   private-equity  the paperwork names its own discipline
 *   category        the SEBI category the statements print
 *   unstated        none of the three places it
 */
export function fundMarketSideBasis(name, account) {
  const decision = familyMarketDecision(name, account);
  const read = readAifCategory(name, account);
  if (decision) return { side: decision.side, basis: "family", decision, category: read.category };
  if (readsAsPrivateEquity(name, account)) return { side: "private", basis: "private-equity", decision: null, category: read.category };
  if (read.category === CATEGORY_III) return { side: "listed", basis: "category", decision: null, category: read.category };
  if (read.category === CATEGORY_I || read.category === CATEGORY_II) {
    return { side: "private", basis: "category", decision: null, category: read.category };
  }
  return { side: null, basis: "unstated", decision: null, category: null };
}

/**
 * WHICH SIDE OF THE BOOK ONE HOLDING SITS ON — `"listed"`, `"private"`, or
 * `null` where no statement places it.
 *
 * `null` IS A THIRD ANSWER AND NEVER A DEFAULT TO EITHER SIDE. When this was
 * written three holdings reached it (₹16.69 Cr) — Motilal Oswal Wealth Delphi
 * Equity Fund, Neo Infra Income Opportunities and Blue Ashva Varenya, none of
 * whose statements print a SEBI category. The family have since placed the
 * first two (below), so ONE reaches it today: Blue Ashva, ₹98,742. Filing it
 * private would claim it is private capital; filing it listed would claim the
 * opposite. Both are claims no document makes, so the split is three-way and
 * the third is NAMED with its value wherever the other two are printed — the
 * count here is history, `BOOK_SUMMARY.unplacedValue` is the measurement.
 *
 * Private equity outranks the category for the same reason it does in the AIF
 * drill-down: a fund whose own name says `Private Equity` is private capital
 * whether its statement calls it Category I or II, and Transition Venture's
 * `Category I/II` — the issuer declining to commit — would otherwise be
 * unplaced despite naming its own discipline.
 *
 * AND THE FAMILY'S OWN PLACING OUTRANKS BOTH (see `FAMILY_MARKET_SIDE`). Two of
 * the three funds above are placed by it now — Delphi on the listed side, Neo
 * Infra on the private one — and one fund the category DID place, Motilal
 * Oswal's Founders Fund, moves from private to listed: its statement prints
 * Category II and it invests in listed Indian equities.
 */
export function marketSideOf(position, account) {
  const cls = position?.assetClass;
  if (ALWAYS_PRIVATE.has(cls)) return "private";
  if (cls !== "AIF") return "listed";
  return fundMarketSideOf(position.security, account);
}

/**
 * What `marketSide === null` means, in words, for the surface that prints it.
 *
 * PLURAL AND SENTENCE-CASED, because every caller states it over a SET — a
 * facet's rows, a list of funds — and never over one holding. The singular
 * version read "…for this fund…" under a list of three, and lowercase after a
 * full stop.
 *
 * TWO SOURCES NOW, AND THE SENTENCE NAMES BOTH: a fund is placed by the SEBI
 * category its statement prints or by the family's own classification, so a
 * fund on neither side is one where BOTH are silent. Saying only "no statement
 * prints a category" would send a reader to chase a registration when the
 * quicker answer is one line from the family.
 */
export const MARKET_SIDE_UNPLACED =
  "No statement for these funds prints a SEBI category and the family have not classified them,"
  + " so this book places them on neither the listed nor the private side";
