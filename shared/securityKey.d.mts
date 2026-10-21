// Types for shared/securityKey.mjs — the book's join key.
// Implementation is plain JS in shared/ so the Node ingest and the browser app
// derive keys with identical code; see the note there.

/** Lower-cased, punctuation-collapsed, legal-suffix-stripped form of a name. */
export declare function normalizeSecurityName(name: string): string;

/** Stable, URL-safe slug of a security name — `Position.securityKey`. */
export declare function securityKeyOf(name: string): string;

/** A security name with trailing depository series/face-value furniture removed.
 *  `securityKeyOf` IS routed through this — the furniture is the depository's own
 *  bookkeeping about a line in ITS books and is not what the security is, which
 *  is what merged `ICICI Bank Ltd.` and `ICICI BANK-EQ` into one key. Also used
 *  on its own for display. See Stage 10ak. */
export declare function stripDepositoryTail(name: string): string;

/** A fund's base name and the unit class split off the end of it, or `null`
 *  where the name carries no class. DISPLAY ONLY, on the same terms as
 *  `stripDepositoryTail`: `securityKeyOf` never routes through it, so a class
 *  keeps its own key, its own join and its own row in every drill-down. */
export declare function splitFundClass(
  name: string,
): { fund: string; cls: string } | null;
