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

// ── PAN: the identifier a name argument cannot outvote ──────────────────────
//
// A name is a spelling. A PAN is issued once per taxpayer by the Income Tax
// Department and printed on the statement, so where two documents carry the same
// PAN they are one person — no rule about middle names required, and none should
// be allowed to override it.
//
// That mattered here. `BHARAT AJAY JAISINGHANI` (Sanshi Fund) and `BHARAT
// JAISINGHANI` (SVAN) print THE SAME PAN. They are the same man, and this book
// previously carried a note reasoning the opposite way — that `Bharat Ajay` must
// be a different person from `Bharat Thakurdas` because the initials rule says
// so. The initials rule is still right about what it can see; it simply had no
// access to the fact that settles it. So did the drop, on page one of a
// statement nobody had a reader for.
//
// THAT PARTICULAR PAN IS NOT LISTED BELOW, and its absence is deliberate. It is
// also the password on his two 360 ONE Alternates statements — one of the three
// entries in GLOW_PDF_PASSWORDS — and a password does not go in a tracked file;
// see the `GLOW_PDF_PASSWORDS` note in CLAUDE.md. The
// alias it justified is listed instead, so the resolution is identical and the
// evidence for it is recorded here in words rather than as a value someone could
// lift out of the repository and try against the PDFs.
//
// The rule for anyone extending this registry: a PAN goes in `pans` ONLY if it is
// not also a document password. When it is, add the alias the PAN proves and say
// so, exactly as the Bharat entry does.
//
// Two aliases have been REMOVED for the same reason. `Bharat Thakurdas
// Jaisinghani` and `Mr. BHARAT T JAISINGHANI` appear on no statement in this
// drop — they were seeded by analogy with Ajay's, and the paperwork says Bharat's
// middle name is Ajay, not Thakurdas. An alias nobody has observed is not
// harmless: it is a standing instruction to merge a person who may exist.
//
// THE FOURTH CHARACTER OF A PAN IS THE HOLDER TYPE, and it is what keeps two
// trusts from being folded into the man they are named after:
//
//     …P…   P → Individual   Bharat Ajay Jaisinghani   (PAN withheld, see above)
//     AAETB4523D   T → Trust  Bharat Jaisinghani Family Trust 2
//     AAETB4534G   T → Trust  Bharat Jaisinghani Family Trust 3
//
// Three PANs, three taxpayers. `kind` records which, so a per-person total and a
// per-entity total are different questions with different answers.

/** The fourth character of a PAN, as the Income Tax Department assigns it. */
const PAN_HOLDER_TYPE = {
  P: "individual", H: "huf", C: "company", F: "firm", A: "aop",
  T: "trust", B: "bop", L: "local-authority", J: "artificial-juridical", G: "government",
};

/** `AAETB4523D` → "trust". Null for anything that is not PAN-shaped. */
export function panHolderType(pan) {
  const m = /^[A-Z]{3}([A-Z])[A-Z]\d{4}[A-Z]$/.exec(String(pan ?? "").trim().toUpperCase());
  return m ? PAN_HOLDER_TYPE[m[1]] ?? null : null;
}

/**
 * @typedef {Object} CanonicalOwner
 * @property {string} ownerId      stable slug — the join key
 * @property {string} displayName  how the cockpit shows this person
 * @property {string[]} aliases    every spelling seen in a statement
 * @property {string[]} [pans]     every PAN observed for this holder, verbatim
 * @property {string} [kind]       "individual" | "trust" — from the PAN, not assumed
 */

/** @type {CanonicalOwner[]} */
export const OWNERS = [
  {
    ownerId: "ajay-jaisinghani",
    displayName: "Ajay Jaisinghani",
    kind: "individual",
    pans: ["AACPJ2099J"],
    aliases: [
      "Mr. AJAY T JAISINGHANI",
      "Ajay Thakurdas Jaisinghani",
      "Ajay T Jaisinghani",
      "Ajay Jaisinghani",
    ],
  },
  {
    ownerId: "ankita-jaisinghani",
    displayName: "Ankita Jaisinghani",
    kind: "individual",
    pans: ["AKQPK9422Q"],
    aliases: [
      // As printed: Goldstandard/Aristos gives the full name, Green Lantern the short one.
      "Ankita Bharat Jaisinghani",
      "ANKITA JAISINGHANI",
      "Ankita B Jaisinghani",
    ],
  },
  {
    ownerId: "bharat-jaisinghani",
    displayName: "Bharat Jaisinghani",
    kind: "individual",
    /**
     * NO PAN HERE ON PURPOSE. His is also the password on six encrypted
     * statements in this drop, and a password does not go in a tracked file. The
     * alias below is what that PAN proves; the reasoning is in the header note.
     */
    pans: [],
    aliases: [
      "Bharat Jaisinghani",
      // Confirmed by PAN, not by a naming convention — see the note above.
      "Bharat Ajay Jaisinghani",
    ],
  },
  {
    /**
     * A FOURTH FAMILY MEMBER, added on her own PAN and her own folio.
     *
     * `AARTI AJAY JAISINGHANI` (AFIPJ4151N) holds a Sanshi Fund folio and appears
     * on no other statement in this drop. Leaving her unresolved was not the
     * neutral choice it looked like: her holding still counts in the consolidated
     * total, so the book showed money belonging to nobody, and every per-entity
     * breakdown silently omitted it.
     *
     * She is added as a HOLDER, not as a claim about her relationship to anyone —
     * the statements say she is a taxpayer with a folio, and that is all this
     * records.
     */
    ownerId: "aarti-jaisinghani",
    displayName: "Aarti Jaisinghani",
    kind: "individual",
    pans: ["AFIPJ4151N"],
    aliases: [
      "Aarti Ajay Jaisinghani",
      "Aarti Jaisinghani",
    ],
  },
  {
    /**
     * TWO TRUSTS, and they are not Bharat.
     *
     * Both are named after him and both hold Transition Venture Capital
     * commitments, but their PANs carry `T` in the fourth position — a separate
     * taxpayer, not a nickname for an individual. Folding them into
     * `bharat-jaisinghani` would put a trust's assets into a person's net worth,
     * which is wrong as tax, wrong as estate planning and wrong on screen.
     *
     * They are also NOT each other: Trust 2 and Trust 3 have different PANs, and
     * each committed ₹1.5 Cr on the same day at the same NAV. A person-name
     * trimmer would drop the distinguishing numeral and make one entity holding
     * twice as much — which is why the Transition Venture reader takes its holder
     * name verbatim.
     */
    ownerId: "bharat-jaisinghani-family-trust-2",
    displayName: "Bharat Jaisinghani Family Trust 2",
    kind: "trust",
    pans: ["AAETB4523D"],
    aliases: ["Bharat Jaisinghani Family Trust 2"],
  },
  {
    ownerId: "bharat-jaisinghani-family-trust-3",
    displayName: "Bharat Jaisinghani Family Trust 3",
    kind: "trust",
    pans: ["AAETB4534G"],
    aliases: ["Bharat Jaisinghani Family Trust 3"],
  },
  {
    /**
     * A THIRD TRUST, UNNUMBERED — and the holder of Motilal Oswal demat
     * 1201090032387399 (Stage 10db).
     *
     * The family's own two documents name it, apart from Trust 2 and Trust 3:
     * their investment register files ₹6.77 Cr of liquid and arbitrage funds
     * under "Bharat Jaisinghani Family Trust" on 1 Jul 2025, and their 30 June
     * review carries the same two funds under that name, rows of their own
     * beside the "Trust II" and "Trust III" rows. The depository statement
     * prints the TRUSTEES on its holder lines, so the account is attributed by
     * a join on its client ID — `BENEFICIAL_OWNER_BY_CLIENT_ID` in
     * `scripts/ingest/providers/motilalDemat.mjs`, where the evidence is set out
     * and checked against the page on every read.
     *
     * NO PAN, because no statement prints this trust's PAN unmasked; the
     * depository prints three characters of it, which can refuse an owner and
     * never confirm one. `kind` therefore does NOT come from a PAN here, unlike
     * the two numbered trusts: it rests on the name the family's own register
     * and review give the holder, and on the depository's own account type,
     * which is not the `Individual-Resident` every family member's own demat
     * prints.
     */
    ownerId: "bharat-jaisinghani-family-trust",
    displayName: "Bharat Jaisinghani Family Trust",
    kind: "trust",
    pans: [],
    aliases: ["Bharat Jaisinghani Family Trust"],
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
  const byPan = new Map();
  for (const o of owners) {
    for (const pan of o.pans ?? []) {
      const p = String(pan).trim().toUpperCase();
      // A PAN belongs to exactly one taxpayer. Two owners claiming one is a
      // registry error and must not resolve to whichever was listed first.
      if (byPan.has(p) && byPan.get(p)?.ownerId !== o.ownerId) byPan.set(p, null);
      else byPan.set(p, o);
    }
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
  return { exact, initials, byPan };
}

let INDEX = buildIndex(OWNERS);

/** Rebuild the index — for tests, or after extending the registry at runtime. */
export function reindexOwners(owners = OWNERS) {
  INDEX = buildIndex(owners);
}

/**
 * Resolve a printed name — and, where the statement prints one, a PAN — to its
 * canonical owner.
 *
 * PAN IS TRIED FIRST AND WINS. It is a government-issued identifier for one
 * taxpayer, printed on the page; a name is a spelling, and every rule here that
 * reasons about spellings is a heuristic standing in for exactly this fact. When
 * the fact is present the heuristics do not get a vote.
 *
 * Returns `{ owner, matchedBy }` on a hit, or `{ owner: null, matchedBy: null }`
 * when nothing matches. It NEVER invents an owner — an unmatched name is
 * surfaced by the caller (see `unresolvedOwners` in the extraction report) so a
 * new spelling gets added to the registry deliberately.
 *
 * @param {string} raw   the name as printed
 * @param {string} [pan] the PAN as printed, where the statement carries one
 */
export function resolveOwner(raw, pan = null) {
  if (pan) {
    const viaPan = INDEX.byPan.get(String(pan).trim().toUpperCase());
    if (viaPan) return { owner: viaPan, matchedBy: "pan" };
  }
  const n = normalizeOwnerName(raw);
  if (!n) return { owner: null, matchedBy: null };
  const direct = INDEX.exact.get(n);
  if (direct) return { owner: direct, matchedBy: "alias" };
  const viaInitials = INDEX.initials.get(initialsForm(n));
  if (viaInitials) return { owner: viaInitials, matchedBy: "initials" };
  return { owner: null, matchedBy: null };
}

/** Convenience: the ownerId, or null. */
export function ownerIdFor(raw, pan = null) {
  return resolveOwner(raw, pan).owner?.ownerId ?? null;
}

export const ownerById = (id) => OWNERS.find((o) => o.ownerId === id) ?? null;
