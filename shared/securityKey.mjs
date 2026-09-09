// The book's join key — one implementation, used by both the app and the ingest.
//
// Several of the providers in this book print a security NAME and nothing else —
// no ISIN, no ticker. So the identity of a security cannot be an identifier the
// source may not carry; it has to be derived from the one field that is always
// there. `securityKeyOf` turns a printed name into a stable slug, and that slug
// is what every grouping, look-through, dedupe and /stock/:securityKey link uses.
//
// It lives in shared/ for the same reason the owner registry does: the extractor
// keys the rows it pulls out of a PDF, and the app joins on those keys. Two
// implementations would drift, and drift here means a holding silently splitting
// into two positions that never add up.
//
// The normalisation is deliberately conservative. It folds the differences that
// are pure typography — case, punctuation, spacing, and the legal-form suffix a
// statement may or may not print ("HFCL LIMITED" vs "HFCL Ltd.") — and nothing
// else. Tokens that distinguish real securities (series, class, tranche, roman
// numerals, years) are preserved, because collapsing two different instruments
// into one key silently merges two positions, which is worse than showing them
// apart. That matters directly here: "360 ONE Special Opportunities Fund -
// Series 8 - Class A3" must not collapse onto Class A1.

// ─────────────────────────────────────────────────────────────────────────────
// An ISIN glued onto the end of a name.
//
// Carnelian's capital gain statement prints the two identifiers in ONE column:
// `CRIZAC LIMITED-INE0S4R01014`. That is a name AND an ISIN, and treating the
// whole string as a name does two kinds of damage at once. It keys the row
// `crizac-limited-ine0s4r01014` while the same manager's transaction statement
// keys the same company `crizac`, so the two never join — and it throws away a
// real ISIN in a book whose providers otherwise print none.
//
// THE PATTERN IS ANCHORED AND NARROW, ON PURPOSE. An Indian ISIN is `INE` (or
// `INF` for mutual-fund units) followed by nine alphanumerics, and it is matched
// only as a TRAILING token after a separator. An unanchored search finds
// "INDraprastha Medical Corp. Ltd." — `IND` plus nine more characters is the
// same shape — and would amputate a real company name. Three statements in this
// drop carry that name, which is how the anchor earned its place.
const ISIN_TAIL = /[\s-]+(IN[EF][0-9A-Z]{9})\s*$/i;
// A separator printed with nothing after it: the column was empty, but the glue
// character still made it into the name ("Vedanta Iron and Steel Limited-").
const EMPTY_TAIL = /[\s-]+$/;

/**
 * Split a printed security name into `{ security, isin }`.
 *
 * Returns the name unchanged and `isin: null` when nothing is glued on, so it is
 * safe to run over every name from every provider — which is the point. The glue
 * is one provider's habit today; the next drop's provider will have its own, and
 * a split that only ran on capital gains would miss it.
 */
export function splitSecurityName(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(ISIN_TAIL);
  if (m) {
    const name = s.slice(0, s.length - m[0].length).replace(EMPTY_TAIL, "").trim();
    // Never let the split empty the name: a row printed as the bare ISIN keeps
    // it as its name rather than becoming nameless.
    if (name) return { security: name, isin: m[1].toUpperCase() };
    return { security: s, isin: null };
  }
  return { security: s.replace(EMPTY_TAIL, "").trim() || s, isin: null };
}

// Legal-form words, stripped only from the END of a name.
const LEGAL_SUFFIX = new Set([
  "limited", "ltd", "pvt", "private", "plc", "inc", "incorporated",
  "corp", "corporation", "co", "company", "llp", "lp",
]);

/**
 * Normalised form of a security name: lower-cased, punctuation collapsed to
 * single spaces, trailing legal-form words removed.
 */
export function normalizeSecurityName(name) {
  const cleaned = String(name ?? "")
    .normalize("NFKD")
    .toLowerCase()
    // "&" carries meaning in Indian company names (L&T, M&M) — keep it as a word
    // so "l&t" and "l and t" land on the same key.
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned.split(" ");
  // Peel legal-form words off the tail, but never empty the name: a fund called
  // "Company" keeps its only token.
  while (tokens.length > 1 && LEGAL_SUFFIX.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

/**
 * DEPOSITORY FURNITURE — REMOVED BEFORE THE NAME IS READ AS AN IDENTITY.
 *
 * A demat statement prints the SERIES and the FACE VALUE after the company name,
 * because that is what identifies a line in a depository's own books:
 * `CLEAN MAX ENVIRO ENERGY SOLUTIONS LIMITED - EQ NEW FV RE.1/`, `SBI - EQ`,
 * `FEDERAL BANK EQ 2/`, `RBL BNK-EQ RE 10`. None of it tells a reader anything
 * about the holding — every one of these is ordinary equity — and it pushes the
 * actual name out of the column.
 *
 * ANCHORED AT THE END, AND ONLY THERE. Three funds in this book are named
 * "…Equity Fund" (3P India Equity Fund, Baring Private Equity India Fund,
 * Motilal Oswal Wealth Delphi Equity Fund) and a rule matching "EQUITY" anywhere
 * would amputate all three. Measured over every name in the book: 28 change, and
 * those five fund names are untouched.
 *
 * WHAT IT DELIBERATELY KEEPS is anything naming a DIFFERENT INSTRUMENT — the
 * `WARRANTS 13AG26` on Borosil Renewables, the `PREF 18042043` on EFPL. A
 * warrant and a preference share are not the equity, and folding them into the
 * company name would merge two holdings on screen. Same reasoning as
 * `normalizeSecurityName` above, which preserves series, class and tranche.
 *
 * AND IT ONLY EVER REMOVES. Nothing here supplies a name the statement did not
 * print, so a row still reads as its document does — which is why the clipped
 * `THE KARUR VYS-EQ` becomes `The Karur Vys` and not "Karur Vysya Bank".
 *
 * IT IS ROUTED INTO `securityKeyOf`, and that is the whole of the ICICI fix.
 * This paragraph used to say the opposite — "DISPLAY ONLY … nothing here can
 * move a position between groups" — and the price of that was one company
 * standing in the book as two: Goldstandard's appraisal prints `ICICI Bank
 * Ltd.` and the Motilal demat prints `ICICI BANK-EQ`, so ₹3.00 Cr of one
 * company was two identities that never added up. The furniture is not part of
 * the security's identity; it is the depository's own bookkeeping, exactly as a
 * glued-on ISIN is another provider's, and `splitSecurityName` above already
 * strips THAT before the key is taken so "the key comes from the CLEAN name".
 * This is the same rule, one column over.
 *
 * WHAT THAT COSTS WAS MEASURED, NOT ASSUMED, over every security name in the
 * archive with the ISIN as the witness. 49 keys change and exactly THREE
 * merges follow, each corroborated by evidence outside the name:
 *
 *   icici-bank      `ICICI Bank Ltd.` + `ICICI BANK-EQ` — and NSE's own name
 *                   for the depository row's INE090A01021 is "ICICI Bank
 *                   Limited", which normalises to that same key. An identifier
 *                   nobody in this join controls agrees.
 *   everest-fleet   two spellings carrying the SAME ISIN, INE0LTR01029.
 *   buoyant-…-a4    three spellings of one class, the third carrying the
 *                   broker's own `[BOUYA388]` code.
 *
 * and ZERO pairs whose ISINs disagree — which is the test that says a merge is
 * a merge of two NAMES and not of two SECURITIES. `build-book.mjs` runs that
 * test on every build and prints it even when it is zero, because a guard that
 * only speaks when it fires is indistinguishable from one that was deleted.
 *
 * It lives beside the key so the two rules are read together, and it is shared
 * with the Node side so the symbol report, the archive and the screen agree.
 */
const DEPOSITORY_TAIL = new RegExp(
  String.raw`[\s,]*(?:[-\u2013\u2014]\s*)?(?:`
  + String.raw`(?:NEW\s+)?(?:FV\s+)?R[SE]\.?\s*\d+(?:\.\d+)?\s*\/?\s*-?`
  + String.raw`|EQ(?:UITY|S)?\s*\d*\s*\/?\s*-?`
  + String.raw`|\[[A-Z0-9]+\]`
  + String.raw`)\s*$`,
  "i",
);

/**
 * ── A FUND'S UNIT CLASS, SPLIT OFF THE FUND ITSELF — DISPLAY ONLY ───────────
 *
 * *"3P Class A B1 B2, all of that should be shown as a single line item as just
 * 3P funds like in the excel sheet … and then when we click on it we should see
 * a drop down list of all the other categories."*
 *
 * A Category-III AIF issues one PORTFOLIO under several UNIT CLASSES, which
 * differ by management fee and by nothing else a holder experiences: 3P's own
 * statement prints B1 1.20%, B2 1.00%, B3 0.70% and a Reclassification table
 * that moved every unit from B1 and B2 into B3 on one day. The family's own
 * review carries one line per FUND for exactly that reason, and the dashboard
 * drew one per class.
 *
 * THE BASE MUST MATCH EXACTLY, WHICH IS WHY THIS IS NOT A NAME MATCHER. Only a
 * recognised class token is removed, from the END, and two holdings group only
 * where what REMAINS is character-for-character identical. `Motilal Oswal
 * Founders Fund Series II` and `Motilal Oswal Active Momentum Fund` share a
 * house and never a base — which is the pair a similarity measure got wrong when
 * `familyTaxonomy.ts` was first attempted with one (see CLAUDE.md, Stage 10z).
 *
 * ANCHORED AT THE END, AND IT ONLY EVER REMOVES — `stripDepositoryTail`'s two
 * rules, for the same reason. `securityKeyOf` is derived from the RAW name and
 * is NOT routed through this, so a class keeps its own identity, its own row in
 * every drill-down and its own join; only the row a reader first sees is
 * clubbed.
 *
 * Returns `null` where the name carries no class, so a caller can tell "this
 * fund has one class" from "this is not a class name at all" without guessing.
 */
const FUND_CLASS_TAIL = new RegExp(
  // A separator the statements actually print — hyphen, en/em dash, or none —
  // then the word CLASS (or SERIES/SUB-CLASS), then the class's own label.
  String.raw`[\s]*[-\u2013\u2014]?\s*`
  + String.raw`(?:SUB[-\s]?)?CLASS\s+`
  + String.raw`([A-Z]{1,2}\d{0,2}|\d{1,2})`
  + String.raw`\s*$`,
  "i",
);

export function splitFundClass(name) {
  const raw = String(name ?? "");
  const m = FUND_CLASS_TAIL.exec(raw);
  if (!m || m.index === 0) return null;
  const fund = raw.slice(0, m.index).replace(/[\s,\-\u2013\u2014]+$/, "");
  // Never strip a name to nothing, and never call a bare label a fund: the same
  // floor `stripDepositoryTail` keeps, so a malformed row degrades to ungrouped
  // rather than to a row named after a class.
  if (!/[A-Za-z]{3}/.test(fund)) return null;
  return { fund, cls: m[1].toUpperCase() };
}

export function stripDepositoryTail(name) {
  let out = String(name ?? "");
  // Repeated because tails stack — `CITY UNION -EQ RE1/` is two of them. Bounded
  // rather than `while (true)`: a pattern that ever matched the empty string
  // would spin, and a loop that cannot hang is cheaper than proving one never will.
  for (let i = 0; i < 6; i++) {
    const m = DEPOSITORY_TAIL.exec(out);
    if (!m || m.index === 0) break;
    const cut = out.slice(0, m.index).replace(/[\s,\-\u2013\u2014]+$/, "");
    if (!/[A-Za-z]{2}/.test(cut)) break;   // never strip a name to nothing
    out = cut;
  }
  return out;
}

/**
 * Stable slug for a security name — `Position.securityKey`.
 *
 * URL-safe (it is a route segment) and idempotent: feeding a key back through
 * returns the same key. Returns "unknown" for a name that normalises to nothing,
 * so a nameless row still groups somewhere visible rather than crashing a lookup.
 *
 * DERIVED FROM THE NAME WITH THE DEPOSITORY FURNITURE REMOVED — see
 * `stripDepositoryTail` above for what that is, what it measurably merges and
 * what proves each merge. A `-EQ` or a face value is the depository's own
 * bookkeeping about a line in its books; it is not what the security IS, and
 * keying on it split one company into two identities.
 *
 * `normalizeSecurityName` is NOT routed through the strip, deliberately: it is
 * the name normaliser the reconcilers compare a review line against, and both
 * sides of that comparison already reach it through this function.
 */
export function securityKeyOf(name) {
  const norm = normalizeSecurityName(stripDepositoryTail(name));
  return norm ? norm.replace(/ /g, "-") : "unknown";
}
