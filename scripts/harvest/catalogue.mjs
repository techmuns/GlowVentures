// THE SERIES CATALOGUE — every macro series this dashboard carries, and where
// it comes from.
//
// This file is the FOOS spec's Layer-2A shopping list turned into declarations.
// A series appears on screen ONLY if it is declared here AND its adapter returned
// points; anything the catalogue lists with `source: null` is a series the spec
// asks for that no source we have can serve, and the page says so rather than
// drawing an illustrative number.
//
// UNITS ARE DECLARED, NEVER INFERRED. Yahoo quotes the grains, cotton, sugar and
// coffee in US CENTS (`USX`), not dollars. Reading 586 as $586/bushel instead of
// ¢586 is a 100x error that looks entirely plausible on a chart, so the unit
// travels with the series from here to the screen.
//
// `band` is the validation gate's plausible range, in the series' own unit. It is
// deliberately wide — it exists to catch a decimal shift or a unit change at the
// source, not to second-guess the market.

/** @typedef {"commodities"|"indices"|"currencies"|"rates"} Category */

export const CATEGORIES = [
  { key: "commodities", label: "Commodities" },
  { key: "indices", label: "Global Indices" },
  { key: "currencies", label: "Currencies" },
  { key: "rates", label: "Rates & Bonds" },
];

const yahoo = (symbol) => ({
  adapter: "yahoo",
  symbol,
  name: "Yahoo Finance",
  url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
  provenance: "official-api",
});

/**
 * Every series. `id` is the stable key used on disk, in the URL and in exports —
 * it never changes once published, because a chart someone bookmarked resolves
 * through it.
 */
export const SERIES = [
  // ── Energy ────────────────────────────────────────────────────────────────
  { id: "brent-crude", label: "Brent Crude", category: "commodities", group: "Energy", unit: "USD/bbl", band: [1, 400], source: yahoo("BZ=F") },
  { id: "wti-crude", label: "WTI Crude", category: "commodities", group: "Energy", unit: "USD/bbl", band: [-50, 400], source: yahoo("CL=F"),
    note: "WTI settled NEGATIVE on 20 April 2020 (−$37.63). The band allows it because it happened; a floor at zero would reject a real print." },
  { id: "natural-gas", label: "Natural Gas", category: "commodities", group: "Energy", unit: "USD/MMBtu", band: [0.1, 100], source: yahoo("NG=F") },
  { id: "lng", label: "LNG", category: "commodities", group: "Energy", unit: "USD/MMBtu", band: null, source: null,
    absent: "No free daily LNG benchmark. The World Bank Pink Sheet carries a monthly Japan/Europe LNG price — wired in Phase 1." },
  { id: "coking-coal", label: "Coking Coal", category: "commodities", group: "Energy", unit: "USD/t", band: null, source: null,
    absent: "No free daily series. World Bank Pink Sheet publishes it monthly — wired in Phase 1." },
  { id: "thermal-coal", label: "Thermal Coal", category: "commodities", group: "Energy", unit: "USD/t", band: null, source: null,
    absent: "No free daily series. World Bank Pink Sheet publishes Australian thermal coal monthly — wired in Phase 1." },
  { id: "electricity-india", label: "Electricity (IEX spot)", category: "commodities", group: "Energy", unit: "INR/kWh", band: null, source: null,
    absent: "Indian Energy Exchange publishes a daily market snapshot with no API. Scheduled for the Phase 2 India harvest." },

  // ── Precious metals ───────────────────────────────────────────────────────
  { id: "gold", label: "Gold", category: "commodities", group: "Precious Metals", unit: "USD/oz", band: [50, 20000], source: yahoo("GC=F") },
  { id: "silver", label: "Silver", category: "commodities", group: "Precious Metals", unit: "USD/oz", band: [1, 500], source: yahoo("SI=F") },
  { id: "platinum", label: "Platinum", category: "commodities", group: "Precious Metals", unit: "USD/oz", band: [50, 20000], source: yahoo("PL=F") },
  { id: "palladium", label: "Palladium", category: "commodities", group: "Precious Metals", unit: "USD/oz", band: [50, 20000], source: yahoo("PA=F") },

  // ── Industrial metals ─────────────────────────────────────────────────────
  { id: "copper", label: "Copper", category: "commodities", group: "Industrial Metals", unit: "USD/lb", band: [0.1, 50], source: yahoo("HG=F") },
  { id: "aluminium", label: "Aluminium", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: [200, 10000], source: yahoo("ALI=F") },
  { id: "steel-hrc", label: "Steel (HRC)", category: "commodities", group: "Industrial Metals", unit: "USD/short ton", band: [100, 5000], source: yahoo("HRC=F") },
  { id: "zinc", label: "Zinc", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: null, source: null,
    absent: "LME pricing is licensed. World Bank Pink Sheet carries it monthly — wired in Phase 1." },
  { id: "nickel", label: "Nickel", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: null, source: null,
    absent: "LME pricing is licensed. World Bank Pink Sheet carries it monthly — wired in Phase 1." },
  { id: "lead", label: "Lead", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: null, source: null,
    absent: "LME pricing is licensed. World Bank Pink Sheet carries it monthly — wired in Phase 1." },
  { id: "tin", label: "Tin", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: null, source: null,
    absent: "LME pricing is licensed. World Bank Pink Sheet carries it monthly — wired in Phase 1." },
  { id: "iron-ore", label: "Iron Ore", category: "commodities", group: "Industrial Metals", unit: "USD/dmt", band: null, source: null,
    absent: "No free daily series. World Bank Pink Sheet publishes it monthly — wired in Phase 1." },

  // ── Agriculture ───────────────────────────────────────────────────────────
  // Yahoo quotes these in US CENTS (currency `USX`). Declared as cents here.
  { id: "wheat", label: "Wheat", category: "commodities", group: "Agriculture", unit: "USc/bu", band: [100, 3000], source: yahoo("ZW=F") },
  { id: "rice", label: "Rice", category: "commodities", group: "Agriculture", unit: "USD/cwt", band: [1, 100], source: yahoo("ZR=F") },
  { id: "corn", label: "Corn", category: "commodities", group: "Agriculture", unit: "USc/bu", band: [100, 2000], source: yahoo("ZC=F") },
  { id: "soybean", label: "Soybean", category: "commodities", group: "Agriculture", unit: "USc/bu", band: [300, 4000], source: yahoo("ZS=F") },
  { id: "cotton", label: "Cotton", category: "commodities", group: "Agriculture", unit: "USc/lb", band: [10, 400], source: yahoo("CT=F") },
  { id: "sugar", label: "Sugar", category: "commodities", group: "Agriculture", unit: "USc/lb", band: [1, 100], source: yahoo("SB=F") },
  { id: "coffee", label: "Coffee", category: "commodities", group: "Agriculture", unit: "USc/lb", band: [20, 1000], source: yahoo("KC=F") },
  { id: "palm-oil", label: "Palm Oil", category: "commodities", group: "Agriculture", unit: "USD/t", band: null, source: null,
    absent: "Traded on Bursa Malaysia (FCPO), not carried by any free daily feed. World Bank Pink Sheet has it monthly — Phase 1." },
  { id: "rubber", label: "Rubber", category: "commodities", group: "Agriculture", unit: "USD/t", band: null, source: null,
    absent: "Traded on OSE/TOCOM, not carried by any free daily feed. World Bank Pink Sheet has it monthly — Phase 1." },

  // ── Other commodity aggregates ────────────────────────────────────────────
  {
    id: "bcom-index", label: "Bloomberg Commodity Index", category: "commodities", group: "Others",
    unit: "index", band: [10, 1000], source: yahoo("^BCOM"),
    note: "Shown IN PLACE OF the CRB index the spec names. CRB is Refinitiv's proprietary index with no free feed; BCOM is a different index tracking a similar basket, and is labelled as itself rather than presented as CRB.",
  },
  { id: "crb-index", label: "CRB Commodity Index", category: "commodities", group: "Others", unit: "index", band: null, source: null,
    absent: "Refinitiv/CoreCommodity proprietary — no free feed at any frequency. The Bloomberg Commodity Index is carried alongside as a comparable basket, under its own name." },
  { id: "baltic-dry", label: "Baltic Dry Index", category: "commodities", group: "Others", unit: "index", band: null, source: null,
    absent: "Baltic Exchange licenses the BDI; no free API publishes it. Queued for the Phase 1 aggregator harvest." },
  { id: "container-freight", label: "Container Freight Index", category: "commodities", group: "Others", unit: "USD/FEU", band: null, source: null,
    absent: "Freightos FBX and Drewry WCI publish weekly on their own pages with no API. Queued for the Phase 1 aggregator harvest." },
  { id: "rail-freight", label: "Rail Freight", category: "commodities", group: "Others", unit: "index", band: null, source: null,
    absent: "Indian Railways freight volumes come from the Ministry of Railways monthly release — Phase 2 India harvest." },

  // ── Global equity indices ─────────────────────────────────────────────────
  { id: "sp500", label: "S&P 500", category: "indices", group: "United States", unit: "index", band: [10, 100000], source: yahoo("^GSPC") },
  { id: "nasdaq", label: "Nasdaq Composite", category: "indices", group: "United States", unit: "index", band: [10, 100000], source: yahoo("^IXIC") },
  { id: "dow-jones", label: "Dow Jones Industrial", category: "indices", group: "United States", unit: "index", band: [10, 200000], source: yahoo("^DJI") },
  { id: "russell-2000", label: "Russell 2000", category: "indices", group: "United States", unit: "index", band: [10, 50000], source: yahoo("^RUT") },
  { id: "ftse-100", label: "FTSE 100", category: "indices", group: "Europe", unit: "index", band: [10, 50000], source: yahoo("^FTSE") },
  { id: "dax", label: "DAX", category: "indices", group: "Europe", unit: "index", band: [10, 100000], source: yahoo("^GDAXI") },
  { id: "cac-40", label: "CAC 40", category: "indices", group: "Europe", unit: "index", band: [10, 50000], source: yahoo("^FCHI") },
  { id: "nikkei-225", label: "Nikkei 225", category: "indices", group: "Asia", unit: "index", band: [10, 200000], source: yahoo("^N225") },
  { id: "hang-seng", label: "Hang Seng", category: "indices", group: "Asia", unit: "index", band: [10, 100000], source: yahoo("^HSI") },
  { id: "shanghai-composite", label: "Shanghai Composite", category: "indices", group: "Asia", unit: "index", band: [10, 20000], source: yahoo("000001.SS") },
  { id: "nifty-50", label: "Nifty 50", category: "indices", group: "India", unit: "index", band: [10, 200000], source: yahoo("^NSEI") },
  { id: "sensex", label: "Sensex", category: "indices", group: "India", unit: "index", band: [10, 500000], source: yahoo("^BSESN") },

  // ── Currencies ────────────────────────────────────────────────────────────
  { id: "usd-inr", label: "USD / INR", category: "currencies", group: "India", unit: "INR per USD", band: [1, 500], source: yahoo("INR=X") },
  { id: "eur-usd", label: "EUR / USD", category: "currencies", group: "Majors", unit: "USD per EUR", band: [0.1, 10], source: yahoo("EURUSD=X") },
  { id: "gbp-usd", label: "GBP / USD", category: "currencies", group: "Majors", unit: "USD per GBP", band: [0.1, 10], source: yahoo("GBPUSD=X") },
  { id: "usd-jpy", label: "USD / JPY", category: "currencies", group: "Majors", unit: "JPY per USD", band: [10, 1000], source: yahoo("JPY=X") },
  { id: "usd-cny", label: "USD / CNY", category: "currencies", group: "Majors", unit: "CNY per USD", band: [1, 50], source: yahoo("CNY=X") },
  { id: "dxy", label: "Dollar Index (DXY)", category: "currencies", group: "Majors", unit: "index", band: [10, 500], source: yahoo("DX-Y.NYB") },

  // ── Rates & bonds (the spec's Layer 2C, as far as a free daily feed reaches) ─
  {
    id: "us-10y", label: "US 10 Year Treasury", category: "rates", group: "Government Bonds", unit: "%", band: [-2, 25], source: yahoo("^TNX"),
    note: "CBOE's 10-year Treasury yield index — the yield itself, in percent, not a price.",
  },
  { id: "india-10y", label: "India 10 Year G-Sec", category: "rates", group: "Government Bonds", unit: "%", band: null, source: null,
    absent: "No free daily feed carries the Indian benchmark G-Sec yield. RBI publishes it daily and FRED monthly — both wired in Phase 2." },
];

export const BY_ID = new Map(SERIES.map((s) => [s.id, s]));

/** Series this run should actually fetch — the ones with a source. */
export const harvestable = () => SERIES.filter((s) => s.source);

/** Series the spec asks for that nothing can serve yet, with the reason. */
export const declaredAbsent = () => SERIES.filter((s) => !s.source);
