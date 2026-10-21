// Types for shared/sectors.mjs — the committed provider-sector → GICS map.
// Implementation is plain JS in shared/ so the Node ingest (`build-book`) and
// the browser app resolve a sector with identical code: the book's own sectors
// and a fund disclosure's are read through the one map, and a second copy would
// be a second taxonomy. See the long note there.

/** The eleven GICS sectors, plus Cash. */
export declare const GICS_SECTORS: readonly string[];

/** What a sector that resolved to nothing is called. */
export declare const UNCLASSIFIED: string;

/** Provider sector string (as printed) → GICS sector. */
export declare const SECTOR_MAP: Readonly<Record<string, string>>;

/** Strings a provider prints when IT declined to classify a holding. */
export declare const PROVIDER_UNCLASSIFIED: ReadonlySet<string>;

/**
 * Resolve one provider sector. `sector` is UNCLASSIFIED when nothing matched
 * and `matchedBy` is null, so a caller can tell "we could not place this" from
 * "the provider could not".
 */
export declare function resolveSector(providerSector: string | null | undefined): {
  sector: string;
  matchedBy: "exact" | "prefix" | "provider-unclassified" | null;
};

/** Every provider string that resolved to nothing, for the report. */
export declare function unmappedSectors(
  providerSectors: Iterable<string | null | undefined>,
): { providerSector: string; count: number }[];
