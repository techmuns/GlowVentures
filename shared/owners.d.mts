// Types for shared/owners.mjs — the canonical owner registry.
//
// The implementation is plain JS in shared/ because the Node ingest scripts and
// the browser app must resolve owner names with the SAME code. Two copies would
// drift, and drift here means one person quietly becoming two owners.

export type CanonicalOwner = {
  /** Stable slug — the join key stored on every Account. */
  ownerId: string;
  /** How the cockpit displays this person. */
  displayName: string;
  /** Every spelling seen on a statement. */
  aliases: string[];
};

export type OwnerMatch = {
  owner: CanonicalOwner | null;
  /** How the match was made, or null when nothing matched. */
  matchedBy: "alias" | "initials" | null;
};

export declare const OWNERS: CanonicalOwner[];

/** Lower-cased, unaccented, punctuation- and honorific-free form of a name. */
export declare function normalizeOwnerName(raw: string | null | undefined): string;

/** Rebuild the alias index (tests, or after extending the registry). */
export declare function reindexOwners(owners?: CanonicalOwner[]): void;

/** Resolve a printed name. Never invents an owner — an unknown name returns null. */
export declare function resolveOwner(raw: string | null | undefined): OwnerMatch;

/** Convenience: the resolved ownerId, or null. */
export declare function ownerIdFor(raw: string | null | undefined): string | null;

export declare function ownerById(id: string): CanonicalOwner | null;
