// ONE DEFINITION OF "THIS NAME AND THAT NAME ARE THE SAME SECURITY".
//
// Two reconcilers now join a family-supplied document against the generated
// book: `scripts/review-reconcile.mjs` (the adviser's consolidated review) and
// `scripts/register-reconcile.mjs` (the family's own investment register). They
// ask the same question of different documents, and two copies of these tiers
// would be two chances for the two reports to disagree about whether the book
// carries a name — which is the failure `drilldown.ts` was created to stop for
// figures, arriving here for identity.
//
// THERE IS NO FUZZY TIER, and that is deliberate. `build-symbols` refuses one
// because a wrong symbol prices another company; here a wrong join states a
// reconciliation nobody can reproduce, and a MISSED join costs only a line in
// the "could not match" list, which a human reads. The asymmetry is the whole
// design: every tier below is a fact about the two strings, never a judgement
// about whether two names mean the same company.
import { securityKeyOf } from "./securityKey.mjs";

/**
 * @param {Map<string, any>} index         securityKey -> whatever the caller wants back
 * @param {Map<string, string>} [aliases]  reviewKey -> indexKey, each established by
 *                                         reading BOTH documents and each one line so
 *                                         it can be challenged on its own
 * @returns {(product: string) => { key: string|null, how: string }}
 */
export function makeSecurityMatcher(index, aliases = new Map()) {
  return function matchSecurity(product) {
    const k = securityKeyOf(product);
    if (!k) return { key: null, how: "empty name" };
    if (index.has(k)) return { key: k, how: "exact" };

    const alias = aliases.get(k);
    if (alias && index.has(alias)) return { key: alias, how: "committed alias" };

    /**
     * THE PREFIX RUNS ONE WAY ONLY, AND GETTING THAT WRONG JOINED FOUR COMPANIES
     * TO ONE ROW.
     *
     * The book's names come from a depository, which appends what the scrip is
     * ("FRACTAL ANALYTICS LIMITED - EQ", "- EQ NEW FV RS. 5/-"), so a book key
     * legitimately EXTENDS a supplied key. The reverse never holds: a supplied
     * name longer than a book name is a DIFFERENT, more specific security.
     * Accepting `k.startsWith(bk)` too matched `Vedanta Aluminium Metal Ltd`,
     * `Vedanta Power Ltd`, `Vedanta Iron & Steel Ltd` and `Vedanta Oil & Gas Ltd`
     * all onto the one book row named `Vedanta` — four demerged companies
     * reported against 12,909 shares of their former parent, each looking like a
     * holding this book had partly read. It had read none of them.
     */
    const pre = [...index.keys()].filter((bk) => bk.startsWith(k));
    if (pre.length === 1) return { key: pre[0], how: "prefix" };
    if (pre.length > 1) return { key: null, how: `ambiguous (${pre.length} book names start with this)` };

    /**
     * SAME LETTERS, DIFFERENT SPACING — and this is not a fuzzy tier.
     *
     * The review writes "Smart Works" and "Yash High Voltage"; the depository
     * writes "SMARTWORKS COWORKING SPACES" and "YASH HIGHVOLTAGE". Compared with
     * the separators removed these are the same characters in the same order,
     * which is a fact about where each source put a space and not a judgement
     * about whether two names mean the same company. It is still required to be
     * UNAMBIGUOUS — the moment two book keys match, the evidence no longer
     * identifies one company and the line is reported instead.
     */
    const flat = (x) => x.replace(/-/g, "");
    const fk = flat(k);
    const loose = [...index.keys()].filter((bk) => flat(bk).startsWith(fk));
    if (loose.length === 1) return { key: loose[0], how: "same letters, different spacing" };
    if (loose.length > 1) return { key: null, how: `ambiguous on spacing (${loose.length} book names)` };

    return { key: null, how: "no book position carries this name" };
  };
}
