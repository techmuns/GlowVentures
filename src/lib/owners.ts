// Canonical owner registry, for the browser app.
//
// The registry data and the matching logic live in `shared/owners.mjs` so the
// Node ingest pipeline and this app resolve names with the SAME code — see the
// long note there for why that matters. This module is the typed front door and
// adds the cockpit-facing helpers.
export type { CanonicalOwner, OwnerMatch, PanHolderType } from "../../shared/owners.mjs";
export {
  OWNERS,
  normalizeOwnerName,
  reindexOwners,
  resolveOwner,
  ownerIdFor,
  ownerById,
  panHolderType,
} from "../../shared/owners.mjs";

import { OWNERS, ownerById } from "../../shared/owners.mjs";
import { BOOK_OWNERS } from "@/data/glowData";

/**
 * The names the BOOK gives its holders. The registry above names every member
 * and trust; the book adds exactly one holder the registry does not carry —
 * the part of a review line no document names a holder for (Stage 10dh,
 * `shared/reviewHolders.mjs`). Read from the generated list rather than typed
 * here, so the page and the generator cannot spell it two ways.
 */
const BOOK_OWNER_NAMES = new Map(BOOK_OWNERS.map((o) => [o.ownerId, o.displayName]));

/**
 * Display name for an ownerId.
 *
 * Falls back to the id itself rather than to a guess: an account whose owner
 * never resolved is shown by its raw id so the gap is visible in the UI, not
 * papered over with a plausible-looking name.
 */
export function ownerDisplayName(ownerId: string | null | undefined): string {
  if (!ownerId) return "Unattributed";
  return ownerById(ownerId)?.displayName ?? BOOK_OWNER_NAMES.get(ownerId) ?? ownerId;
}

/** Every canonical owner, alphabetical — for filters and pick-lists. */
export function allOwners() {
  return [...OWNERS].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
