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
  { key: "economy", label: "Economy" },
];

const yahoo = (symbol) => ({
  adapter: "yahoo",
  symbol,
  name: "Yahoo Finance",
  url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
  provenance: "official-api",
});

/** World Bank Pink Sheet — monthly commodity prices, matched by HEADER TEXT. */
const pink = (column) => ({
  adapter: "worldbankPink",
  column,
  symbol: column,
  name: "World Bank Pink Sheet",
  url: "https://www.worldbank.org/en/research/commodity-markets",
  provenance: "official-file",
});

/** World Bank Open Data — annual indicators, keyless REST. */
const wb = (country, indicator) => ({
  adapter: "worldbankApi",
  country,
  indicator,
  symbol: indicator,
  name: "World Bank Open Data",
  url: `https://data.worldbank.org/indicator/${indicator}?locations=${country}`,
  provenance: "official-api",
});

/**
 * RBI current policy rates. ACCUMULATING: the RBI publishes the rate in effect
 * today and no history, so the store builds the series one run at a time.
 */
const rbi = (label) => ({
  adapter: "rbi",
  label,
  symbol: label,
  name: "Reserve Bank of India",
  url: "https://www.rbi.org.in/",
  provenance: "scraped-official",
  accumulating: true,
});

/**
 * FRED — the St. Louis Fed's keyless `fredgraph.csv`, full history per series.
 *
 * Reachable from the GitHub Actions runner the harvest actually uses; the two
 * series wired to it were previously declared absent on a measurement taken in
 * a development container, which is a different network. See the note atop
 * `adapters/fred.mjs` and `scripts/harvest/probe-reach.mjs`.
 */
const fred = (seriesId) => ({
  adapter: "fred",
  seriesId,
  symbol: seriesId,
  name: "FRED (Federal Reserve Bank of St. Louis)",
  url: `https://fred.stlouisfed.org/series/${encodeURIComponent(seriesId)}`,
  provenance: "official-api",
});

/**
 * data.gov.in — a resource that is a CROSSTAB (one row per commodity or
 * industry, one column per month), read down the named headline row.
 *
 * `rowValue` names the ministry's OWN aggregate row. It is never re-derived
 * from the other rows: both these tables carry an official weighted aggregate,
 * and averaging 869 commodity rows here would produce an index nobody
 * published. Needs `DATA_GOV_IN_KEY` in the environment.
 */
const dataGov = (resource, rowField, rowValue) => ({
  adapter: "dataGovIn",
  resource, rowField, rowValue,
  symbol: rowValue,
  name: "data.gov.in (Open Government Data, India)",
  url: `https://www.data.gov.in/resource/${encodeURIComponent(resource)}`,
  provenance: "official-api",
});

/**
 * CEA monthly installed capacity, in MW, matched by the sheet's own fuel label.
 *
 * ACCUMULATING: each monthly workbook is a snapshot of capacity at that month,
 * not a history, so the store builds the series one run at a time. Same pattern
 * as the RBI rates and IEX spot power.
 */
const cea = (row) => ({
  adapter: "cea",
  row,
  symbol: row,
  name: "Central Electricity Authority",
  url: "https://cea.nic.in/installed-capacity-report/?lang=en",
  provenance: "official-file",
  accumulating: true,
});

/** IEX day-ahead spot power. ACCUMULATING, same reason. */
const iex = () => ({
  adapter: "iex",
  symbol: "DAM MCP",
  name: "Indian Energy Exchange",
  url: "https://www.iexindia.com/market-data/day-ahead-market/market-snapshot",
  provenance: "scraped-official",
  accumulating: true,
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
  { id: "lng", label: "LNG (Japan)", category: "commodities", group: "Energy", unit: "USD/MMBtu", band: [0.5, 100], frequency: "monthly", source: pink("Liquefied natural gas, Japan") },
  { id: "natural-gas-europe", label: "Natural Gas (Europe)", category: "commodities", group: "Energy", unit: "USD/MMBtu", band: [0.1, 200], frequency: "monthly", source: pink("Natural gas, Europe") },
  { id: "thermal-coal", label: "Thermal Coal (Australian)", category: "commodities", group: "Energy", unit: "USD/t", band: [5, 1500], frequency: "monthly", source: pink("Coal, Australian") },
  { id: "coal-south-africa", label: "Thermal Coal (South African)", category: "commodities", group: "Energy", unit: "USD/t", band: [5, 1500], frequency: "monthly", source: pink("Coal, South African") },
  { id: "coking-coal", label: "Coking Coal", category: "commodities", group: "Energy", unit: "USD/t", band: null, source: null,
    absent: "Neither a free daily feed nor the World Bank Pink Sheet carries coking (metallurgical) coal — the Pink Sheet publishes thermal coal only. It needs a commercial source such as Platts or Argus." },
  { id: "electricity-india", label: "Electricity (IEX day-ahead)", category: "commodities", group: "Energy", unit: "INR/MWh", band: [100, 25000], source: iex(),
    note: "The day's AVERAGE market clearing price across all 96 fifteen-minute blocks. Indian spot power swings from roughly ₹1,100 to the ₹10,000 ceiling within a single day, so no one block is 'the price'." },

  // ── Precious metals ───────────────────────────────────────────────────────
  { id: "gold", label: "Gold", category: "commodities", group: "Precious Metals", unit: "USD/oz", band: [50, 20000], source: yahoo("GC=F") },
  { id: "silver", label: "Silver", category: "commodities", group: "Precious Metals", unit: "USD/oz", band: [1, 500], source: yahoo("SI=F") },
  { id: "platinum", label: "Platinum", category: "commodities", group: "Precious Metals", unit: "USD/oz", band: [50, 20000], source: yahoo("PL=F") },
  { id: "palladium", label: "Palladium", category: "commodities", group: "Precious Metals", unit: "USD/oz", band: [50, 20000], source: yahoo("PA=F") },

  // ── Industrial metals ─────────────────────────────────────────────────────
  { id: "copper", label: "Copper", category: "commodities", group: "Industrial Metals", unit: "USD/lb", band: [0.1, 50], source: yahoo("HG=F") },
  { id: "aluminium", label: "Aluminium", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: [200, 10000], source: yahoo("ALI=F") },
  { id: "steel-hrc", label: "Steel (HRC)", category: "commodities", group: "Industrial Metals", unit: "USD/short ton", band: [100, 5000], source: yahoo("HRC=F") },
  { id: "zinc", label: "Zinc", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: [50, 20000], frequency: "monthly", source: pink("Zinc"),
    note: "The band starts at 50 because zinc genuinely traded near $180/t through the 1960s. An earlier 200 floor blocked eighteen real observations — the gate working correctly against a band that was wrong." },
  { id: "nickel", label: "Nickel", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: [1000, 100000], frequency: "monthly", source: pink("Nickel") },
  { id: "lead", label: "Lead", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: [100, 20000], frequency: "monthly", source: pink("Lead") },
  { id: "tin", label: "Tin", category: "commodities", group: "Industrial Metals", unit: "USD/t", band: [1000, 100000], frequency: "monthly", source: pink("Tin") },
  { id: "iron-ore", label: "Iron Ore (cfr spot)", category: "commodities", group: "Industrial Metals", unit: "USD/dmtu", band: [1, 500], frequency: "monthly", source: pink("Iron ore, cfr spot"),
    note: "Quoted per DRY METRIC TONNE UNIT (dmtu), the World Bank's own basis — one percent of iron content per tonne. It is not the $/tonne headline the trade press quotes, and the two differ by roughly the ore grade." },

  // ── Agriculture ───────────────────────────────────────────────────────────
  // Yahoo quotes these in US CENTS (currency `USX`). Declared as cents here.
  { id: "wheat", label: "Wheat", category: "commodities", group: "Agriculture", unit: "USc/bu", band: [100, 3000], source: yahoo("ZW=F") },
  { id: "rice", label: "Rice", category: "commodities", group: "Agriculture", unit: "USD/cwt", band: [1, 100], source: yahoo("ZR=F") },
  { id: "corn", label: "Corn", category: "commodities", group: "Agriculture", unit: "USc/bu", band: [100, 2000], source: yahoo("ZC=F") },
  { id: "soybean", label: "Soybean", category: "commodities", group: "Agriculture", unit: "USc/bu", band: [300, 4000], source: yahoo("ZS=F") },
  { id: "cotton", label: "Cotton", category: "commodities", group: "Agriculture", unit: "USc/lb", band: [10, 400], source: yahoo("CT=F") },
  { id: "sugar", label: "Sugar", category: "commodities", group: "Agriculture", unit: "USc/lb", band: [1, 100], source: yahoo("SB=F") },
  { id: "coffee", label: "Coffee", category: "commodities", group: "Agriculture", unit: "USc/lb", band: [20, 1000], source: yahoo("KC=F") },
  { id: "palm-oil", label: "Palm Oil", category: "commodities", group: "Agriculture", unit: "USD/t", band: [50, 10000], frequency: "monthly", source: pink("Palm oil") },
  { id: "rubber", label: "Rubber (TSR20)", category: "commodities", group: "Agriculture", unit: "USD/kg", band: [0.1, 50], frequency: "monthly", source: pink("Rubber, TSR20") },

  // ── Fertilisers — the spec asks for these under Industry Research ─────────
  { id: "urea", label: "Urea", category: "commodities", group: "Fertilisers", unit: "USD/t", band: [10, 2000], frequency: "monthly", source: pink("Urea") },
  { id: "dap", label: "DAP", category: "commodities", group: "Fertilisers", unit: "USD/t", band: [10, 2000], frequency: "monthly", source: pink("DAP") },
  { id: "phosphate-rock", label: "Phosphate Rock", category: "commodities", group: "Fertilisers", unit: "USD/t", band: [5, 1000], frequency: "monthly", source: pink("Phosphate rock") },
  { id: "potassium-chloride", label: "Potash (KCl)", category: "commodities", group: "Fertilisers", unit: "USD/t", band: [10, 2000], frequency: "monthly", source: pink("Potassium chloride") },

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
  { id: "us-3m", label: "US 13 Week T-Bill", category: "rates", group: "Government Bonds", unit: "%", band: [-2, 25], source: yahoo("^IRX") },
  { id: "us-5y", label: "US 5 Year Treasury", category: "rates", group: "Government Bonds", unit: "%", band: [-2, 25], source: yahoo("^FVX") },
  { id: "us-30y", label: "US 30 Year Treasury", category: "rates", group: "Government Bonds", unit: "%", band: [-2, 25], source: yahoo("^TYX") },
  {
    id: "india-10y", label: "India 10 Year G-Sec", category: "rates", group: "Government Bonds",
    unit: "%", band: [0.5, 25], frequency: "monthly", source: fred("INDIRLTLT01STM"),
    note: "MONTHLY, not daily — the OECD long-term government bond yield for India (10-year benchmark) as republished by FRED. The daily benchmark yield is on the RBI's own site and still needs a reader; this is the monthly figure, and the frequency travels with the series so no 1-day or 1-week return is ever computed from it.",
  },
  {
    id: "credit-spreads", label: "US Corporate Credit Spread (ICE BofA OAS)", category: "rates", group: "Credit Markets",
    unit: "%", band: [0.1, 30], source: fred("BAMLC0A0CM"),
    note: "ICE BofA US Corporate Index option-adjusted spread — a US spread, and the label says so. India has no free equivalent, and carrying this one under an unqualified 'Corporate Credit Spreads' would let a reader take a US number for their own market, which is the same substitution the industry page refuses when a global benchmark stands in for a domestic price. HISTORY IS SHORT AND THAT IS THE SOURCE'S DOING: the ICE BofA family is licensed, so FRED redistributes only a rolling ~3-year window (DGS10 from the same endpoint returns 1962 onwards, so this is not a request the harvester is getting wrong). The store accumulates from here, and any horizon longer than what is held stays absent rather than being answered from a shorter window.",
  },

  // ── Policy rates — RBI, the spec's Layer 2D "Policy Rates" block ─────────
  // Accumulating: one observation per run. Every horizon is absent until the
  // store has held them long enough to answer one, which is the honest state.
  { id: "india-repo-rate", label: "RBI Repo Rate", category: "rates", group: "Policy Rates", unit: "%", band: [0, 25], source: rbi("Policy Repo Rate") },
  { id: "india-sdf-rate", label: "Standing Deposit Facility", category: "rates", group: "Policy Rates", unit: "%", band: [0, 25], source: rbi("Standing Deposit Facility Rate") },
  { id: "india-msf-rate", label: "Marginal Standing Facility", category: "rates", group: "Policy Rates", unit: "%", band: [0, 25], source: rbi("Marginal Standing Facility Rate") },
  { id: "india-bank-rate", label: "RBI Bank Rate", category: "rates", group: "Policy Rates", unit: "%", band: [0, 25], source: rbi("Bank Rate") },
  { id: "india-reverse-repo", label: "Fixed Reverse Repo Rate", category: "rates", group: "Policy Rates", unit: "%", band: [0, 25], source: rbi("Fixed Reverse Repo Rate") },
  { id: "india-crr", label: "Cash Reserve Ratio (CRR)", category: "rates", group: "Policy Rates", unit: "%", band: [0, 25], source: rbi("CRR") },
  { id: "india-slr", label: "Statutory Liquidity Ratio (SLR)", category: "rates", group: "Policy Rates", unit: "%", band: [0, 60], source: rbi("SLR") },

  // ── Capital markets — declared, and why it is not yet wired ──────────────
  { id: "india-mf-aum", label: "Mutual Fund AAUM", category: "economy", group: "Capital markets", unit: "INR Cr", band: null, source: null,
    absent: "AMFI publishes ~100 monthly reports back to 2018 — real history, not just a latest value — but they are legacy BIFF .xls workbooks, which neither ExcelJS nor this repo's own sheet reader (built for OOXML and HTML-tables-named-.xls) can open. It needs a BIFF reader added as a dependency." },
  { id: "india-sip-flows", label: "SIP Contributions", category: "economy", group: "Capital markets", unit: "INR Cr", band: null, source: null,
    absent: "Same AMFI monthly workbooks, same BIFF blocker." },

  // ── Economy — annual, and lagged by a year or more. Charted as history ────
  // ── The two data.gov.in resources that carry a real monthly SERIES ────────
  //
  // THEY ARE DISCONTINUED, AND THAT WAS NOT VISIBLE FROM THE CATALOGUE.
  // Both are titled "till last month" and both have their catalogue record
  // touched daily — WPI's read `updated 2026-08-11` on the day this was wired.
  // Neither has gained a month since 2023: WPI's last column is INDX102023 and
  // IIP's is _2023_feb, and `probe-datagov.mjs --extent` confirmed the returned
  // record carries every field the resource DECLARES, so the source stops there
  // rather than the reader being truncated.
  //
  // That is the precise failure this probe exists to catch — "the ministry
  // stopped publishing but the endpoint still answers 200" — and ranking by
  // record date walked straight into it. RECORD FRESHNESS IS NOT DATA
  // FRESHNESS, and on this platform the two are years apart.
  //
  // They are still carried, because 2012–2023 of official WPI and IIP is real
  // published history and useful as such. What they must never do is answer a
  // "current reading" question: the Economy page's WPI and IIP rows stay
  // unwired and named as absent, because a value from October 2023 presented as
  // the WPI is a wrong figure no badge repairs. `staleSince` is set from the
  // last observation, so every surface that shows these says how old they are.
  //
  // These are INDEX LEVELS, not rates. A WPI of 154.3 is a level on a
  // 2011-12 = 100 base, so a percentage change between two levels is the right
  // measurement and `kind: "price"` (the default for a non-% unit) is correct.
  // The YoY inflation rate a reader usually quotes is a DERIVED figure and the
  // page computes it from these levels rather than ingesting a second series
  // that could disagree with them.
  {
    id: "india-wpi", label: "India Wholesale Price Index", category: "economy", group: "Inflation",
    unit: "index", band: [20, 500], frequency: "monthly",
    source: dataGov("239ac3d0-f08d-40d0-b03c-9b7a426a62d5", "COMM_NAME", "All Commodities"),
    note: "Base 2011-12 = 100, Office of the Economic Adviser. DISCONTINUED: the resource is titled 'till last month' and its catalogue record is touched daily, but the last month it carries is October 2023 — verified against the resource's own declared schema, so the source stops there rather than the read being truncated. Carried as history, never as a current reading. The headline 'All Commodities' row is read as published; the other 868 rows are individual commodities and averaging them would produce an index nobody published.",
  },
  {
    id: "india-iip", label: "India Index of Industrial Production", category: "economy", group: "Economic growth",
    unit: "index", band: [20, 500], frequency: "monthly",
    source: dataGov("31d53713-46c6-48bd-951a-4d986272fd96", "description", "General"),
    note: "Base 2011-12 = 100, MoSPI all-India IIP. DISCONTINUED: last month carried is February 2023, verified against the resource's declared schema. Carried as history, never as a current reading. The 'General' row is the ministry's own aggregate computed with the official weights; the other rows are NIC industry divisions and are not summed here. The +67% move at 2020-05 is the COVID collapse and rebound — a real move, which the gate warns on rather than blocks.",
  },

  // ── India's power CAPACITY — the spec's industry-structure data ────────────
  // CEA's monthly Installed Capacity report, the one structure source of the
  // three the spec asks for that is both free and machine-readable: PPAC
  // publishes petroleum consumption as PDF only, and SIAM puts vehicle sales
  // behind a member subscription. Both are declared absent below with that
  // reason rather than left to look merely unbuilt.
  //
  // ACCUMULATING — one observation per monthly report, so every horizon stays
  // absent until the store has held the series long enough to answer one.
  { id: "india-power-capacity", label: "India installed power capacity", category: "economy", group: "Power", unit: "MW", band: [100000, 2000000], frequency: "monthly", source: cea("Total Installed Capacity") },
  { id: "india-power-coal", label: "India coal capacity", category: "economy", group: "Power", unit: "MW", band: [50000, 1000000], frequency: "monthly", source: cea("Coal") },
  { id: "india-power-solar", label: "India solar capacity", category: "economy", group: "Power", unit: "MW", band: [100, 1000000], frequency: "monthly", source: cea("Solar") },
  { id: "india-power-wind", label: "India wind capacity", category: "economy", group: "Power", unit: "MW", band: [100, 1000000], frequency: "monthly", source: cea("Wind") },
  { id: "india-power-hydro", label: "India hydro capacity", category: "economy", group: "Power", unit: "MW", band: [1000, 500000], frequency: "monthly", source: cea("Hydro (including PSPs)") },
  { id: "india-power-nuclear", label: "India nuclear capacity", category: "economy", group: "Power", unit: "MW", band: [100, 200000], frequency: "monthly", source: cea("Nuclear") },
  { id: "india-power-nonfossil", label: "India non-fossil capacity", category: "economy", group: "Power", unit: "MW", band: [10000, 2000000], frequency: "monthly", source: cea("Total Non-Fossil Fuel") },

  { id: "india-petroleum-consumption", label: "India petroleum products consumption", category: "economy", group: "Consumption", unit: "'000 MT", band: null, source: null,
    absent: "PPAC publishes consumption monthly and CURRENT — its July 2026 flash report was on the site when this was checked — but as PDF only, with no spreadsheet or API alongside. It needs a reader for that report's layout, not a URL." },
  { id: "india-vehicle-sales", label: "India vehicle sales", category: "economy", group: "Consumption", unit: "units", band: null, source: null,
    absent: "SIAM puts its production and sales statistics behind a member subscription — the public pages carry login and subscription prompts and no data. This one is a commercial licence, not a reader." },

  { id: "india-gdp-growth", label: "India GDP growth", category: "economy", group: "Economic growth", unit: "%", band: [-30, 30], frequency: "annual", source: wb("IN", "NY.GDP.MKTP.KD.ZG") },
  { id: "india-cpi", label: "India CPI inflation", category: "economy", group: "Inflation", unit: "%", band: [-10, 60], frequency: "annual", source: wb("IN", "FP.CPI.TOTL.ZG") },
  { id: "india-unemployment", label: "India unemployment rate", category: "economy", group: "Labour market", unit: "%", band: [0, 60], frequency: "annual", source: wb("IN", "SL.UEM.TOTL.ZS") },
  { id: "india-govt-debt-gdp", label: "India government debt / GDP", category: "economy", group: "Government", unit: "%", band: [0, 300], frequency: "annual", source: wb("IN", "GC.DOD.TOTL.GD.ZS") },
  { id: "india-gross-savings", label: "India gross savings / GDP", category: "economy", group: "Household", unit: "%", band: [0, 100], frequency: "annual", source: wb("IN", "NY.GNS.ICTR.ZS") },
  { id: "india-exports-gdp", label: "India exports / GDP", category: "economy", group: "Trade", unit: "%", band: [0, 300], frequency: "annual", source: wb("IN", "NE.EXP.GNFS.ZS") },
  { id: "us-gdp-growth", label: "US GDP growth", category: "economy", group: "Economic growth", unit: "%", band: [-30, 30], frequency: "annual", source: wb("US", "NY.GDP.MKTP.KD.ZG") },
  { id: "us-cpi", label: "US CPI inflation", category: "economy", group: "Inflation", unit: "%", band: [-10, 60], frequency: "annual", source: wb("US", "FP.CPI.TOTL.ZG") },
  { id: "us-unemployment", label: "US unemployment rate", category: "economy", group: "Labour market", unit: "%", band: [0, 60], frequency: "annual", source: wb("US", "SL.UEM.TOTL.ZS") },
];

export const BY_ID = new Map(SERIES.map((s) => [s.id, s]));

/** Series this run should actually fetch — the ones with a source. */
export const harvestable = () => SERIES.filter((s) => s.source);

/** Series the spec asks for that nothing can serve yet, with the reason. */
export const declaredAbsent = () => SERIES.filter((s) => !s.source);
