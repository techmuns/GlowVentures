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

/**
 * Display name for an ownerId.
 *
 * Falls back to the id itself rather than to a guess: an account whose owner
 * never resolved is shown by its raw id so the gap is visible in the UI, not
 * papered over with a plausible-looking name.
 */
export function ownerDisplayName(ownerId: string | null | undefined): string {
  if (!ownerId) return "Unattributed";
  return ownerById(ownerId)?.displayName ?? ownerId;
}

/** Every canonical owner, alphabetical — for filters and pick-lists. */
export function allOwners() {
  return [...OWNERS].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
