// Provider sector -> GICS sector. One committed map, no inference.
//
// WHY A MAP AND NOT A HEURISTIC. Each platform prints its own taxonomy, and the
// three in this book disagree with each other on nearly every name: Goldstandard
// says "Non Banking Financial Company (NBFC)", Green Lantern "Finance (including
// NBFCs)", Carnelian "Banks". Pattern-matching those to a sector would be
// guessing, and a guess here is invisible — a wrongly-sectored holding looks
// exactly like a correctly-sectored one on an allocation chart.
//
// So every provider string is listed here explicitly. Anything absent maps to
// UNCLASSIFIED and is reported loudly by `unmappedSectors()`; it is never
// approximated to the nearest plausible bucket.
//
// TRUNCATION IS DELIBERATE HERE, AND ONLY HERE. These fact sheets clip the
// sector column to its width, so the same sector arrives as "Heavy Electrical
// Equip", "Heavy Electrical Equipmen" and (elsewhere) in full. A PREFIX match
// against the full names below resolves those — the clipped string is the same
// string, shorter. The prefix must be at least MIN_PREFIX characters and must
// match exactly one entry; an ambiguous prefix stays unclassified rather than
// picking one.

/** The eleven GICS sectors, plus the two buckets a book needs beyond them. */
export const GICS_SECTORS = [
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Information Technology",
  "Materials",
  "Real Estate",
  "Utilities",
  "Cash",
];

export const UNCLASSIFIED = "Unclassified";

/**
 * provider sector (as printed) -> GICS sector.
 *
 * Seeded from the Aristos taxonomy and extended with every string Green Lantern
 * and Carnelian actually print in this drop. Keys are matched case- and
 * punctuation-insensitively (see `normalize`), so "Auto Components & Equipments"
 * and "auto components and equipments" are one entry.
 */
export const SECTOR_MAP = {
  // ── Financials ──
  "Non Banking Financial Company (NBFC)": "Financials",
  "Finance (including NBFCs)": "Financials",
  "Public Sector Bank": "Financials",
  "Private Sector Bank": "Financials",
  "Banks": "Financials",
  "Housing Finance Company": "Financials",
  "Life Insurance": "Financials",
  "General Insurance": "Financials",
  "Asset Management Company": "Financials",
  "Stockbroking & Allied": "Financials",
  "Exchange and Data Platform": "Financials",
  "Holding Companies": "Financials",

  // ── Health Care ──
  "Pharmaceuticals": "Health Care",
  "Hospital": "Health Care",
  "Biotechnology": "Health Care",

  // ── Consumer Discretionary ──
  "Auto Components & Equipments": "Consumer Discretionary",
  "Auto Parts & Equipment": "Consumer Discretionary",
  "Passenger Cars & Utility Vehicles": "Consumer Discretionary",
  "2/3 Wheelers": "Consumer Discretionary",
  "Hotels & Resorts": "Consumer Discretionary",
  "Tour Travel Related Services": "Consumer Discretionary",
  "Tour & Travel Related Services": "Consumer Discretionary",
  "Internet&Catalogue Retail": "Consumer Discretionary",
  "Film Production, Distribution & Exhibition": "Consumer Discretionary",

  // ── Information Technology ──
  "Computers - Software & Consulting": "Information Technology",
  "IT Consulting & Software": "Information Technology",
  "IT Software Products": "Information Technology",
  "IT Enabled Services": "Information Technology",
  "Business Process Outsourcing (BPO)/ Knowledge Process Outsourcing (KPO)": "Information Technology",
  "E-Learning": "Information Technology",
  "Consulting Services": "Information Technology",

  // ── Industrials ──
  "Logistics Solution Provider": "Industrials",
  "Other Electrical Equipment": "Industrials",
  "Heavy Electrical Equipment": "Industrials",
  "Industrial Machinery": "Industrials",
  "Construction & Engineering": "Industrials",
  "Engineering": "Industrials",
  "Airlines": "Industrials",
  "Other Industrial Goods": "Industrials",

  // ── Materials ──
  "Iron & Steel": "Materials",
  "Aluminium": "Materials",
  "Diversified Metals": "Materials",

  // ── Consumer Staples ──
  "Other Agricultural Products": "Consumer Staples",

  // ── Real Estate ──
  "Residential Commercial Projects": "Real Estate",

  // ── Cash and near-cash ──
  "Cash": "Cash",
  "Cash and Equivalent": "Cash",
  "Mutual Fund": "Cash",
  "Dividend / Interest receivable": "Cash",

  // ── V.E.C Assago: the NSE MACRO-SECTOR taxonomy ──
  //
  // A fourth vocabulary, and a coarser one. The other three managers print an
  // INDUSTRY ("Housing Finance Company", "Pharmaceuticals"); V.E.C prints the
  // exchange's eleven macro-sectors, so one string covers what the others split
  // several ways. That is not a reason to leave them unclassified — each maps to
  // exactly one GICS sector — but it is why they are listed apart: the same word
  // means something narrower under the headings above.
  //
  // Two need a decision rather than a lookup, and it is recorded here:
  //   • "Services" is NSE's catch-all for transport, logistics and commercial
  //     services. The holding under it in this drop is Gateway Distriparks, a
  //     container-freight operator — Industrials under GICS, which is where the
  //     other three managers' logistics names already sit.
  //   • "Power" is generation and transmission, which GICS calls Utilities.
  "Financial Services": "Financials",
  "Healthcare": "Health Care",
  "Automobile and Auto Components": "Consumer Discretionary",
  "Consumer Durables": "Consumer Discretionary",
  "Consumer Services": "Consumer Discretionary",
  "Fast Moving Consumer Goods": "Consumer Staples",
  "Capital Goods": "Industrials",
  "Services": "Industrials",
  "Construction Materials": "Materials",
  "Telecommunication": "Communication Services",
  "Power": "Utilities",
};

/**
 * `Miscellaneous` is what Green Lantern prints when IT cannot place a holding.
 * Carrying it through as Unclassified is honest — mapping it to a sector would
 * be inventing a classification the provider itself declined to make.
 */
export const PROVIDER_UNCLASSIFIED = new Set(["Miscellaneous"]);

const MIN_PREFIX = 8;

const normalize = (s) => String(s ?? "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const INDEX = new Map(Object.entries(SECTOR_MAP).map(([k, v]) => [normalize(k), v]));
const KEYS = [...INDEX.keys()];

/**
 * Resolve one provider sector.
 *
 * @returns {{ sector: string, matchedBy: "exact"|"prefix"|"provider-unclassified"|null }}
 *   `sector` is UNCLASSIFIED when nothing matched, and `matchedBy` is null so the
 *   caller can tell "we could not place this" from "the provider could not".
 */
export function resolveSector(providerSector) {
  const n = normalize(providerSector);
  if (!n) return { sector: UNCLASSIFIED, matchedBy: null };
  if (INDEX.has(n)) return { sector: INDEX.get(n), matchedBy: "exact" };
  if (PROVIDER_UNCLASSIFIED.has(String(providerSector).trim())) {
    return { sector: UNCLASSIFIED, matchedBy: "provider-unclassified" };
  }
  // A clipped label is a PREFIX of the full one. Only accept it when it is long
  // enough to be distinctive and matches exactly one entry — two candidates mean
  // the clip lost the distinguishing word, and guessing between them is exactly
  // what this module exists to avoid.
  if (n.length >= MIN_PREFIX) {
    const hits = KEYS.filter((k) => k.startsWith(n));
    const sectors = new Set(hits.map((k) => INDEX.get(k)));
    if (sectors.size === 1) return { sector: [...sectors][0], matchedBy: "prefix" };
  }
  return { sector: UNCLASSIFIED, matchedBy: null };
}

/** Every provider string that resolved to nothing, for the report. */
export function unmappedSectors(providerSectors) {
  const out = new Map();
  for (const p of providerSectors) {
    if (!p) continue;
    const r = resolveSector(p);
    if (r.matchedBy === null) out.set(p, (out.get(p) ?? 0) + 1);
  }
  return [...out.entries()].map(([providerSector, count]) => ({ providerSector, count }));
}
