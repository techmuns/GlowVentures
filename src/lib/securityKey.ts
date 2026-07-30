// The book's join key.
//
// Several of the providers in this book print a security NAME and nothing else —
// no ISIN, no ticker. So the identity of a security cannot be an identifier the
// source may not carry; it has to be derived from the one field that is always
// there. `securityKeyOf` turns a printed name into a stable slug, and that slug
// is what every grouping, look-through, dedupe and /stock/:securityKey link uses.
//
// The normalisation is deliberately conservative. It folds the differences that
// are pure typography — case, punctuation, spacing, and the legal-form suffix a
// statement may or may not print ("HFCL LIMITED" vs "HFCL Ltd.") — and nothing
// else. Tokens that distinguish real securities (series, class, tranche, roman
// numerals, years) are preserved, because collapsing two different instruments
// into one key silently merges two positions, which is worse than showing them
// apart.

// Legal-form words, stripped only from the END of a name.
const LEGAL_SUFFIX = new Set([
  "limited", "ltd", "pvt", "private", "plc", "inc", "incorporated",
  "corp", "corporation", "co", "company", "llp", "lp",
]);

/**
 * Normalised form of a security name: lower-cased, punctuation collapsed to
 * single spaces, trailing legal-form words removed. Exported because the ingest
 * pipeline needs the identical rule to key what it extracts.
 */
export function normalizeSecurityName(name: string): string {
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
 * Stable slug for a security name — `Position.securityKey`.
 *
 * URL-safe (it is a route segment) and idempotent: feeding a key back through
 * returns the same key. Returns "unknown" for a name that normalises to nothing,
 * so a nameless row still groups somewhere visible rather than crashing a lookup.
 */
export function securityKeyOf(name: string): string {
  const norm = normalizeSecurityName(name);
  return norm ? norm.replace(/ /g, "-") : "unknown";
}
