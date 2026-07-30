// Canonical owner registry — the single source of truth for "who is this?".
//
// THE PROBLEM THIS SOLVES. The same person is printed differently by every
// provider, and by the same provider in different places:
//
//     "Mr. AJAY T JAISINGHANI"        360 ONE, CRN37702
//     "Ajay Thakurdas Jaisinghani"    GoldStandard, account 100023
//     "Ajay Jaisinghani"              360 ONE family-name field
//
// Treated as strings those are three people, and the family book silently
// splits three ways — every per-entity total, allocation and XIRR is then wrong
// in a way that nothing on screen reveals. So every account resolves to an
// `ownerId` here, and a name that matches nothing is reported loudly rather
// than quietly becoming a fourth owner.
//
// Lives in shared/ because both the browser app (src/lib/owners.ts) and the
// Node ingest scripts must resolve names IDENTICALLY. Two implementations
// would drift, and the drift would look exactly like the bug above.

/**
 * @typedef {Object} CanonicalOwner
 * @property {string} ownerId      stable slug — the join key
 * @property {string} displayName  how the cockpit shows this person
 * @property {string[]} aliases    every spelling seen in a statement
 */

/** @type {CanonicalOwner[]} */
export const OWNERS = [
  {
    ownerId: "ajay-jaisinghani",
    displayName: "Ajay Jaisinghani",
    aliases: [
      "Mr. AJAY T JAISINGHANI",
      "Ajay Thakurdas Jaisinghani",
      "Ajay T Jaisinghani",
      "Ajay Jaisinghani",
    ],
  },
  {
    ownerId: "bharat-jaisinghani",
    displayName: "Bharat Jaisinghani",
    aliases: [
      "Bharat Jaisinghani",
      "Mr. BHARAT T JAISINGHANI",
      "Bharat Thakurdas Jaisinghani",
      "Bharat T Jaisinghani",
    ],
  },
];

// Honorifics and suffixes that carry no identity. Stripped from both ends.
const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sri", "m/s", "messrs",
  "huf", "jr", "sr",
]);

/**
 * Reduce a printed name to a comparable form: lower-cased, unaccented,
 * punctuation dropped, honorifics removed.
 *
 * Note what this deliberately does NOT do — it does not drop middle names or
 * initials. "Ajay Thakurdas" and "Ajay T" are matched through the alias list
 * and the initials rule below, not by throwing information away, because
 * discarding a middle name would happily merge two different siblings.
 */
export function normalizeOwnerName(raw) {
  if (!raw) return "";
  const words = String(raw)
    // NFKD splits an accented letter into base + combining mark; deleting all
    // non-ASCII then leaves the plain letter. Done as a delete rather than a
    // substitution so "Jose" survives intact instead of becoming "Jos e".
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !HONORIFICS.has(w));
  return words.join(" ");
}

/**
 * Initials form: first name in full, every following name reduced to its
 * initial — "ajay thakurdas jaisinghani" and "ajay t jaisinghani" both become
 * "ajay t jaisinghani". This is what bridges the two spellings of one person
 * without merging "ajay" and "bharat", whose first names differ.
 */
function initialsForm(normalized) {
  const w = normalized.split(" ").filter(Boolean);
  if (w.length < 2) return normalized;
  return [w[0], ...w.slice(1, -1).map((x) => x[0]), w[w.length - 1]].join(" ");
}

/** Built once: every alias in both comparable forms → its canonical owner. */
function buildIndex(owners) {
  const exact = new Map();
  const initials = new Map();
  for (const o of owners) {
    for (const alias of [o.displayName, ...o.aliases]) {
      const n = normalizeOwnerName(alias);
      if (!n) continue;
      exact.set(n, o);
      const i = initialsForm(n);
      // Only index the initials form when it is unambiguous. If two owners
      // collapse to the same initials, that form is useless for both and is
      // dropped rather than allowed to pick one arbitrarily.
      if (initials.has(i) && initials.get(i).ownerId !== o.ownerId) initials.set(i, null);
      else if (!initials.has(i)) initials.set(i, o);
    }
  }
  return { exact, initials };
}

let INDEX = buildIndex(OWNERS);

/** Rebuild the index — for tests, or after extending the registry at runtime. */
export function reindexOwners(owners = OWNERS) {
  INDEX = buildIndex(owners);
}

/**
 * Resolve a printed name to its canonical owner.
 *
 * Returns `{ owner, matchedBy }` on a hit, or `{ owner: null, matchedBy: null }`
 * when nothing matches. It NEVER invents an owner — an unmatched name is
 * surfaced by the caller (see `unresolvedOwners` in the extraction report) so a
 * new spelling gets added to the registry deliberately.
 */
export function resolveOwner(raw) {
  const n = normalizeOwnerName(raw);
  if (!n) return { owner: null, matchedBy: null };
  const direct = INDEX.exact.get(n);
  if (direct) return { owner: direct, matchedBy: "alias" };
  const viaInitials = INDEX.initials.get(initialsForm(n));
  if (viaInitials) return { owner: viaInitials, matchedBy: "initials" };
  return { owner: null, matchedBy: null };
}

/** Convenience: the ownerId, or null. */
export function ownerIdFor(raw) {
  return resolveOwner(raw).owner?.ownerId ?? null;
}

export const ownerById = (id) => OWNERS.find((o) => o.ownerId === id) ?? null;
