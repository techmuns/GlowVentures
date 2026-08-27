// Types for shared/securityKey.mjs — the book's join key.
// Implementation is plain JS in shared/ so the Node ingest and the browser app
// derive keys with identical code; see the note there.

/** Lower-cased, punctuation-collapsed, legal-suffix-stripped form of a name. */
export declare function normalizeSecurityName(name: string): string;

/** Stable, URL-safe slug of a security name — `Position.securityKey`. */
export declare function securityKeyOf(name: string): string;

/** A security name with trailing depository series/face-value furniture removed.
 *  DISPLAY ONLY — `securityKeyOf` is derived from the raw name, never from this. */
export declare function stripDepositoryTail(name: string): string;
