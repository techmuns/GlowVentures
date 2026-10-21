// Types for shared/owners.mjs — the canonical owner registry.
//
// The implementation is plain JS in shared/ because the Node ingest scripts and
// the browser app must resolve owner names with the SAME code. Two copies would
// drift, and drift here means one person quietly becoming two owners.

/** What the fourth character of a PAN says the holder is. */
export type PanHolderType =
  | "individual" | "huf" | "company" | "firm" | "aop"
  | "trust" | "bop" | "local-authority" | "artificial-juridical" | "government";

export type CanonicalOwner = {
  /** Stable slug — the join key stored on every Account. */
  ownerId: string;
  /** How the cockpit displays this person. */
  displayName: string;
  /** Every spelling seen on a statement. */
  aliases: string[];
  /**
   * Every PAN observed for this holder. A government-issued identifier for ONE
   * taxpayer, so it outranks every name rule when a statement prints it.
   */
  pans?: string[];
  /** From the PAN's fourth character — a trust is not the person it is named after. */
  kind?: PanHolderType;
};

export type OwnerMatch = {
  owner: CanonicalOwner | null;
  /** How the match was made, or null when nothing matched. */
  matchedBy: "pan" | "alias" | "initials" | null;
};

/** `AAETB4523D` → "trust". Null for anything that is not PAN-shaped. */
export declare function panHolderType(pan: string | null | undefined): PanHolderType | null;

export declare const OWNERS: CanonicalOwner[];

/** Lower-cased, unaccented, punctuation- and honorific-free form of a name. */
export declare function normalizeOwnerName(raw: string | null | undefined): string;

/** Rebuild the alias index (tests, or after extending the registry). */
export declare function reindexOwners(owners?: CanonicalOwner[]): void;

/**
 * Resolve a printed name, and a PAN where the statement prints one. Never
 * invents an owner — an unknown name returns null. PAN is tried first and wins.
 */
export declare function resolveOwner(raw: string | null | undefined, pan?: string | null): OwnerMatch;

/** Convenience: the resolved ownerId, or null. */
export declare function ownerIdFor(raw: string | null | undefined, pan?: string | null): string | null;

export declare function ownerById(id: string): CanonicalOwner | null;
