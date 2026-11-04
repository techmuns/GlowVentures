// ── THE PRIVATE COMPANIES WHOSE FUNDING HISTORY THE DASHBOARD KEEPS (Stage 10ko)
//
// One entry per private company the family holds, keyed on an id of its own and
// naming the book's line keys (`BookFolio.fundKey`, the line's `securityKey`)
// that are holdings in it — the same keys `src/lib/brandNames.ts` maps to a
// legal name, so four sellers of DrinkPrime are one company here as there.
//
// NOT HERE, ON PURPOSE: a fund (an AIF's NAV is its valuation, on its own
// statement — it raises no rounds), a bond, and a listed company's warrants
// (Borosil Renewables is priced by the exchange). `privateRounds.test.ts` fails
// on any private company line in the book that no entry names, so the next
// drop's new company is added here, never left without a page.
export const PRIVATE_COMPANIES = [
  ["zepto", "Zepto Limited (formerly Kiranakart Technologies Private Limited)", "Zepto", ["zepto"]],
  ["waterwala-labs", "Waterwala Labs Private Limited", "DrinkPrime", ["waterwala-labs-private-limited-drink-prime", "vineet-sethia-drink-prime", "ajay-jain-drink-prime", "hanok-reuben-medhari-drink-prime"]],
  ["assetgro-fintech", "Assetgro Fintech Private Limited", "StockGro", ["assetgro-fintech-private-limited-1-series-b-pref-25nv44"]],
  ["everest-fleet", "Everest Fleet Private Limited", "Everest Fleet", ["everest-fleet"]],
  ["swapeco-solutions", "Swapeco Solutions Private Limited", "ScrapUncle", ["swapeco-solutions", "swapeco-solutions-private-limited-scrap-uncle-mukul-chabra"]],
  ["hyprkytchen-foodtech", "Hyprkytchen Foodtech Private Limited", "Kytchens", ["hyprkytchen-foodtech-private-limited-mr-bansi"]],
  ["head-infotech", "Head Infotech India Private Limited (now Head Digital Works)", "A23", ["head-infotech"]],
  ["edugorilla-community", "EduGorilla Community Private Limited", "EduGorilla", ["edugorilla-community"]],
  ["stay-vista", "Stay Vista Private Limited", "StayVista", ["stay-vista-private-limited-artha-energy-projects", "stay-vista-private-limited-anandkumar-radhakrishna-ladsariya"]],
  ["innoviti", "Innoviti Technologies Private Limited (formerly Innoviti Payment Solutions)", "Innoviti", ["innoviti-payment-solutions-private-ltd-pranav-koranne"]],
  ["incred-holdings", "InCred Holdings Limited", "InCred", ["incred-holdings"]],
  ["wevois-labs", "WeVOIS Labs Private Limited", "WeVOIS", ["we-voise"]],
  ["since99-apparel", "Since99 Apparel Private Limited", "Freakins", ["since-99-apparel-pvt-limited-punit-sehgal-dexter-capital"]],
  ["perplexity-ai", "Perplexity AI, Inc.", "Perplexity", ["perplexity-investment"]],
  ["third-eye-distillery", "Third Eye Distillery Holdings Private Limited", "Stranger & Sons", ["third-eye-distillery-holdings-pvt-ltd-skyventures-lv-angel-fund-aakash-sachdev"]],
  ["collabmates", "Collabmates Private Limited", "LikeMinds", ["al-trust-collabmates-pvt-ltd-angellist-likeminds"]],
  ["karban-envirotech", "Karban Envirotech Private Limited", "Karban", ["al-trust-karban-envirotech-ruv-nilesh-angelist"]],
  ["gsharp-media", "GSharp Media Private Limited", "Hoopr", ["lv-angel-fund-lets-venture-hoopr-vaibhav-karnavat"]],
  ["reliance-retail-ventures", "Reliance Retail Ventures Limited", "Reliance Retail", ["rurash-financials-private-ltd-reliance-retail"]],
  ["integris-medtech", "Integris Medtech Limited", "Integris", ["integris-medtech"]],
  ["mother-india-forming", "Mother India Forming Private Limited", "Mother India Forming", ["mother-india-forming"]],
  ["electromech-infraprojects", "Electromech Infraprojects Limited", "Electromech Infraprojects", ["electromech-infraprojects"]],
  ["onix-renewable", "Onix Renewable Limited", "Onix Renewable", ["onix-renewable"]],
  ["spray-engineering-devices", "Spray Engineering Devices Limited", "SED", ["spray-engineering-devices"]],
  ["matrix-gas-and-renewables", "Matrix Gas and Renewables Limited", "Matrix Gas and Renewables", ["matrix-gas-and-renewables"]],
  ["big-bang-boom-solutions", "Big Bang Boom Solutions Private Limited", "Big Bang Boom Solutions", ["big-bang-boom-solutions-private-limited-0-001-pref-12sp44"]],
  ["telawne-power", "Telawne Power Equipments Private Limited", "Telawne Power Equipments", ["telawne-power"]],
  ["oilmax-energy", "Oilmax Energy Private Limited", "Oilmax", ["oilmax-energy"]],
  ["landcraft-retail", "Landcraft Retail Private Limited", "Food Square", ["landcraft-retail-pvt-ltd-food-square"]],
  ["sks-fasteners", "SKS Fasteners Limited", "SKS Fasteners", ["sks-fasteners"]],
  ["urb-ventures", "URB Ventures Private Limited", "URB Ventures", ["urb-ventures"]],
  ["rays-power-experts", "Rays Power Experts Private Limited", "Rays Experts", ["rays-power-experts"]],
  ["sotefin-bharat", "Sotefin Bharat Limited", "Sotefin Bharat", ["sotefin-bharat"]],
  ["autocracy-machinery", "Autocracy Machinery Private Limited", "Autocracy Machinery", ["autocracy-machinery"]],
  ["zenith-leisure-holidays", "Zenith Leisure Holidays Limited", "Zenith Leisure Holidays", ["zenith-leisure-holidays"]],
  ["radiant-innovative-manufacturing", "Radiant Innovative Manufacturing Limited", "Radiant Innovative Manufacturing", ["radiant-innovative-manufacturing"]],
  ["ema-partners", "EMA Partners India Limited", "EMA Partners", ["ema-preferred-shares"]],
  ["nopo-nanotechnologies", "NoPo Nanotechnologies India Private Limited", "NoPo Nanotechnologies", ["nopo-nanotechnologies-india-pvt-ltd-gadhadar-reddy"]],
  ["homepecked", "Homepecked e-Marketplace Services Private Limited", "Homepecked", ["home-pecked-e-marketplace-services"]],
  ["aksum-trademart", "Aksum Trademart Private Limited", "Aksum", ["aksum-trademart-pvt-ltd-ankit-jain"]],
  ["zippmat", "Zippmat Private Limited", "Zippmat", ["zippmat-private-ltd-abhijeet-kudva"]],
  ["runable", "Runable", "Runable", ["runable-investment"]],
  ["nzuri-pune-knowledge-park", "Nzuri Pune Knowledge Park Private Limited", "Nzuri Pune Knowledge Park", ["nzuri-pune-knowledge-park", "nzuri-pune-knowledge-park-private-limited-pref-24sp46"]],
  ["transigo-fleet", "Transigo Fleet LLP", "Transigo Fleet", ["transigo-fleet"]],
  ["inflexor-technologies", "Inflexor Technologies", "Inflexor Technologies", ["inflexor-technologies"]],
  ["sky-vision-cure", "Sky Vision Cure LLP", "Sky Vision Cure", ["sky-vision-cure"]],
  ["procyon-enterprise", "Procyon Enterprise LLP", "Procyon Enterprise", ["procyon-enterprise-llp-abhishek-murarka"]],
  ["sky-enable-tech", "Sky Enable Tech LLP", "Sky Enable Tech", ["sky-enable-tech"]],
  ["fh-enable", "FH Enable LLP", "FH Enable", ["fh-enable-llp-aakash-sachdev"]],
  ["fh-edutech", "FH Edutech LLP", "FH Edutech", ["fh-edutech"]],
  ["variance-pt-ventures", "Variance PT Ventures LLP", "Variance PT Ventures", ["variance-pt-ventures-llp-romil-kapadia"]],
  ["a-k-enterprises", "A K Enterprises", "A K Enterprises", ["a-k-enterprises"]],
].map(([id, legalName, brand, fundKeys]) => ({ id, legalName, brand, fundKeys }));

/** Private-side lines that are not a company with funding rounds, each with why. */
export const NOT_A_PRIVATE_COMPANY = {
  "borosil-renewables-limited-warrants-13ag26": "warrants of a listed company — the exchange prices it",
  "borosil-renewables-limited-eq-new-fv-re-1-listing-trdg-aprvl-awaited": "new shares of a listed company awaiting trading approval — the exchange prices it",
  "k-m-global-credit": "a credit instrument, not equity",
};

// ── WHAT COUNTS AS A SOURCE ─────────────────────────────────────────────────
// Unlisted-share dealers publish grey-market quotes, not valuations; forums
// and social posts are not a record. A round whose only source is one of these
// is dropped, whoever wrote it.
export const BLOCKED_SOURCE_HOSTS = [
  "unlistedzone.com", "precize.in", "planify.in", "altiusinvestech.com", "wwipl.com", "sharescart.com",
  "incredmoney.com", "stockify.net.in", "unlistedkart.com", "inshares.in",
  "reddit.com", "quora.com", "linkedin.com", "facebook.com", "x.com", "twitter.com", "medium.com",
];

// ── WHO A FILING MAY BE SAID TO NAME ────────────────────────────────────────
// An offer document lists every allottee of a placement. Only the book's own
// members (and the family office) are kept as a "named in the filing" line; a
// relative or another investor the book does not carry is not this book's to
// publish.
export const FAMILY_NAME = /\b(Ajay|Bharat|Ankita|Aarti)\b[^,;.]{0,24}\bJaisinghani\b|Glow Ventures/i;
