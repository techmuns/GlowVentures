/**
 * ── THE BRAND EACH PRIVATE-MARKET LINE IS KNOWN BY (Stage 10eh) ──────────────
 *
 *   *"make the first column the brand name, because right now the column
 *    labeled brand name is actually the legal name of the entity. The brand
 *    name needs to be mapped to the legal entity, so search for every entity
 *    and check what the brand name is. If it's the same, then write the same.
 *    Example Assetgro Fintech Limited operates … under the brand name StockGro.
 *    Make sure you dont miss out on any"* — the family, 15 Oct 2026.
 *
 * One entry per private-market line, keyed on the line's own fundKey — the key
 * the book already joins on, never a similarity match. Each names:
 *
 *   brand  — the name a reader knows the investment by: the first column of
 *            Private Market's By brand view.
 *   legal  — the company (or fund) the line is a holding in, written out in
 *            full, drawn under the brand where the two differ.
 *   basis  — how the pair is known:
 *              cited      the brand is not the entity's own name, and a source
 *                         states the two are one;
 *              own-name   the entity trades under its own name — the source
 *                         shows the entity;
 *              as-printed no source ties the review's words to one company, so
 *                         the brand and the entity are the review's own words.
 *   source — a web page, or `statement:<docKey>` for one of the family's own
 *            statements in `public/audit/` that names the issuer in full.
 *
 * DISPLAY ONLY. No figure, key, join or side of the book reads it: a brand row
 * is a grouping of lines that each keep their own key, figures and page
 * (`privateBook.ts`). Lines that are one brand carry the same `brand` and land
 * on one row — Drink Prime's four sellers, ScrapUncle's two lots, StayVista's
 * two sellers, Blue Ashva's two vehicles.
 *
 * A line no entry names falls back to its own printed name, and
 * `privateBook.test.ts` and `check-pages` (route `private-market-brands`) both
 * fail on it — the next drop's new line is mapped here, never left as read.
 *
 * Two review lines carry words this dashboard keeps off every page
 * (`DISPLAY_NAME` in `shared/reviewPrivateJoin.mjs`); they stay as printed,
 * under the neutral name the book already gives them.
 */
export type BrandBasis = "cited" | "own-name" | "as-printed";

export type BrandName = {
  brand: string;
  legal: string;
  basis: BrandBasis;
  source: readonly string[];
};

/** The family's ICICI NSDL demat statement, which names each unlisted issuer in full. */
const ICICI_NSDL = "statement:icici-bank-nsdl-demat-49794950-2026-03-31-holdings";
const MOTILAL_CDSL = "statement:motilal-oswal-financial-services-demat-1201090012838316-2026-07-31-holdings";

const DRINKPRIME: BrandName = {
  brand: "DrinkPrime", legal: "Waterwala Labs Private Limited", basis: "cited",
  source: ["https://www.barandbench.com/law-firms/dealstreet/novojuris-legal-acts-on-drinkprime-series-a-fundraise", "https://inc42.com/company/drinkprime/"],
};
const SCRAPUNCLE: BrandName = {
  brand: "ScrapUncle", legal: "Swapeco Solutions Private Limited", basis: "cited",
  source: ["https://inc42.com/company/scrapuncle/funding/", "statement:hdfc-bank-nsdl-demat-67786137-2026-08-29-holdings"],
};
const STAYVISTA: BrandName = {
  brand: "StayVista", legal: "Stay Vista Private Limited", basis: "cited",
  source: ["https://www.stayvista.com/terms-and-conditions", "https://inc42.com/buzz/stayvista-nets-inr-40-cr-from-jsw-ventures-others/"],
};

export const BRAND_NAMES: Readonly<Record<string, BrandName>> = {
  // ── Private funds and companies with a value ──
  "india-sme-investments-fund-ii-class-a2": {
    brand: "India SME Investments Fund II", legal: "India SME Investments Fund II", basis: "own-name",
    source: ["statement:india-sme-investments-175962-2026-06-30-holdings"],
  },
  "neo-infra-income-opportunities-fund-i-class-a5": {
    brand: "Neo Infra Income Opportunities Fund I", legal: "Neo Infra Income Opportunities Fund I", basis: "own-name",
    source: ["statement:neo-infra-income-opportunities-fund-9039920536-2026-06-30-holdings"],
  },
  "360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii": {
    brand: "360 ONE Special Opportunities Fund", legal: "360 ONE Special Opportunities Fund", basis: "own-name",
    source: ["statement:360-one-private-wealth-37702-2026-07-31-holdings"],
  },
  "transition-venture-capital-fund-i-class-a1": {
    brand: "Transition Venture Capital Fund I", legal: "Transition Venture Capital Fund I", basis: "own-name",
    source: ["statement:transition-venture-capital-tvc262-2026-03-31-unknown"],
  },
  "baring-private-equity-india-fund-6-class-a1": {
    brand: "Baring Private Equity India Fund 6", legal: "Baring Private Equity India Fund 6", basis: "own-name",
    source: ["statement:baring-private-equity-india-fund-aifm-bpepf6-0584-2026-03-31-holdings"],
  },

  "zepto": {
    brand: "Zepto", legal: "Zepto Limited (formerly Kiranakart Technologies Private Limited)", basis: "own-name",
    source: ["https://www.storyboard18.com/brand-marketing/zepto-drops-kiranakart-tag-ahead-of-ipo-renames-to-zepto-private-limited-62476.htm", "https://inc42.com/buzz/zepto-turns-into-a-public-entity-eyes-june-2026-ipo"],
  },
  "k-m-global-credit": {
    brand: "Credit Fair", legal: "K M Global Credit Private Limited", basis: "cited",
    source: ["https://yourstory.com/companies/credit-fair", "https://gocredit.money/nbfc/k-m-global-credit-private-ltd"],
  },

  // ── Private companies, held at cost ──
  "waterwala-labs-private-limited-drink-prime": DRINKPRIME,
  "vineet-sethia-drink-prime": DRINKPRIME,
  "ajay-jain-drink-prime": DRINKPRIME,
  "hanok-reuben-medhari-drink-prime": DRINKPRIME,
  "assetgro-fintech-private-limited-1-series-b-pref-25nv44": {
    brand: "StockGro", legal: "Assetgro Fintech Private Limited", basis: "cited",
    source: ["https://inc42.com/company/stockgro/captable/", ICICI_NSDL],
  },
  "electromech-infraprojects": {
    brand: "Electromech Infraprojects", legal: "Electromech Infraprojects Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://www.tofler.in/electromech-infraprojects-limited/company/U29253MH2013PLC249760"],
  },
  "onix-renewable": {
    brand: "Onix Renewable", legal: "Onix Renewable Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://onixrenewable.com/investors/faqs.php"],
  },
  "everest-fleet": {
    brand: "Everest Fleet", legal: "Everest Fleet Private Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://www.bii.co.uk/en/our-impact/direct-header/everest-fleet-private-limited/"],
  },
  "spray-engineering-devices": {
    brand: "SED", legal: "Spray Engineering Devices Limited", basis: "cited",
    source: [ICICI_NSDL, "https://chemxplore.com/companies/sed", "https://www.unlistedzone.com/sedl-powering-sustainable-solutions-for-sugar-ethanol-water-recycling"],
  },
  "matrix-gas-and-renewables": {
    brand: "Matrix Gas and Renewables", legal: "Matrix Gas and Renewables Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://www.outlookbusiness.com/news/matrix-gas-files-ipo-papers-to-list-on-nse-emerge-news-303590"],
  },
  "borosil-renewables-limited-warrants-13ag26": {
    brand: "Borosil Renewables", legal: "Borosil Renewables Limited", basis: "own-name",
    source: [ICICI_NSDL],
  },
  "swapeco-solutions": SCRAPUNCLE,
  "swapeco-solutions-private-limited-scrap-uncle-mukul-chabra": SCRAPUNCLE,
  "landcraft-retail-pvt-ltd-food-square": {
    brand: "Food Square", legal: "Landcraft Retail Private Limited", basis: "cited",
    source: ["https://www.indianretailer.com/news/retail-india-news-landcraft-retail-debuts-gourmet-store-bandra-west"],
  },
  "hyprkytchen-foodtech-private-limited-mr-bansi": {
    brand: "Kytchens", legal: "Hyprkytchen Foodtech Private Limited", basis: "cited",
    source: ["https://www.thecompanycheck.com/company/b/kytchens/31p7tutafef0jd39m"],
  },
  "edugorilla-community": {
    brand: "EduGorilla", legal: "EduGorilla Community Private Limited", basis: "own-name",
    source: ["https://inc42.com/company/edugorilla/"],
  },
  "incred-holdings": {
    brand: "InCred", legal: "InCred Holdings Limited", basis: "own-name",
    source: ["https://inc42.com/company/incred-holdings-limited/"],
  },
  "autocracy-machinery": {
    brand: "Autocracy Machinery", legal: "Autocracy Machinery Private Limited", basis: "own-name",
    source: ["https://autocracymachinery.com/about-us"],
  },
  "stay-vista-private-limited-artha-energy-projects": STAYVISTA,
  "stay-vista-private-limited-anandkumar-radhakrishna-ladsariya": STAYVISTA,
  "since-99-apparel-pvt-limited-punit-sehgal-dexter-capital": {
    brand: "Freakins", legal: "Since99 Apparel Private Limited", basis: "cited",
    source: ["https://inc42.com/company/freakins/"],
  },
  "third-eye-distillery-holdings-pvt-ltd-skyventures-lv-angel-fund-aakash-sachdev": {
    brand: "Stranger & Sons", legal: "Third Eye Distillery Holdings Private Limited", basis: "cited",
    source: ["https://inc42.com/company/stranger-sons/", "https://www.theginguild.com/ginopedia/gin-distillery/third-eye-distillery/"],
  },
  // The review prints the AngelList trust first and the company after it; the
  // trust is a channel, and two different companies share it.
  "al-trust-collabmates-pvt-ltd-angellist-likeminds": {
    brand: "LikeMinds", legal: "Collabmates Private Limited (through AL Trust)", basis: "cited",
    source: ["https://apps.apple.com/in/developer/collabmates-private-limited/id1481298194"],
  },
  "al-trust-karban-envirotech-ruv-nilesh-angelist": {
    brand: "Karban", legal: "Karban Envirotech Private Limited (through AL Trust)", basis: "cited",
    source: ["https://karban.in/policies/terms-of-service"],
  },
  // LetsVenture's angel fund is the channel; Hoopr is the company.
  "lv-angel-fund-lets-venture-hoopr-vaibhav-karnavat": {
    brand: "Hoopr", legal: "GSharp Media Private Limited (through LV Angel Fund)", basis: "cited",
    source: ["https://inc42.com/company/hoopr/"],
  },
  "zippmat-private-ltd-abhijeet-kudva": {
    brand: "Zippmat", legal: "Zippmat Private Limited", basis: "own-name",
    source: ["https://inc42.com/company/zippmat/"],
  },
  "integris-medtech": {
    brand: "Integris", legal: "Integris Medtech Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://everstonecapital.com/integris-health-raises-primary-capital-ahead-of-planned-ipo/"],
  },
  "mother-india-forming": {
    brand: "Mother India Forming", legal: "Mother India Forming Private Limited", basis: "own-name",
    source: ["https://www.nbmcw.com/interviews/mother-india-forming.html"],
  },
  "sky-capital-rising-titans-fund-i": {
    brand: "Sky Capital Rising Titans Fund I", legal: "Sky Capital Rising Titans Fund I", basis: "own-name",
    source: ["statement:sky-capital-rising-titans-fund-sky003-2026-07-31-holdings"],
  },
  "big-bang-boom-solutions-private-limited-0-001-pref-12sp44": {
    brand: "Big Bang Boom Solutions", legal: "Big Bang Boom Solutions Private Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://inc42.com/company/big-bang-boom-solutions/"],
  },
  "telawne-power": {
    brand: "Telawne Power Equipments", legal: "Telawne Power Equipments Private Limited", basis: "own-name",
    source: ["https://constructionreviewonline.com/telawne-power-equipments-private-limited/"],
  },
  "oilmax-energy": {
    brand: "Oilmax", legal: "Oilmax Energy Private Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://oilmax.in/"],
  },
  // Two Blue Ashva vehicles, one manager: the review names them as two accounts.
  "blue-ashva-india-pool-account": {
    brand: "Blue Ashva", legal: "Blue Ashva India Pool Account", basis: "own-name",
    source: ["https://inc42.com/buzz/sme-startup-focused-investor-blue-ashva-capital-raises-60-mn-for-maiden-fund/"],
  },
  "blue-ashva-varenya-fund-bavf-ser20-c6-restricted-transferability": {
    brand: "Blue Ashva", legal: "Blue Ashva Varenya Fund", basis: "own-name",
    source: [ICICI_NSDL, "https://esi.in/finance/investments/sebi/alternative-investment-funds/blue-ashva-varenya-fund/"],
  },
  "sks-fasteners": {
    brand: "SKS Fasteners", legal: "SKS Fasteners Limited", basis: "own-name",
    source: [ICICI_NSDL],
  },
  // Head Infotech ran Ace2Three; renamed Head Digital Works, it trades as A23.
  "head-infotech": {
    brand: "A23", legal: "Head Infotech India Private Limited (now Head Digital Works)", basis: "cited",
    source: ["https://www.legallyindia.com/corporate-maa/khaitan-luthra-on-74m-clairvest-buy-in-rummy-website-ace2three-20170503-8486", "https://www.medianews4u.com/page/4564/?id=1304"],
  },
  // UrbanWrk's own pages name a different operator, so no brand is claimed.
  "urb-ventures": {
    brand: "URB Ventures", legal: "URB Ventures Private Limited", basis: "own-name",
    source: [ICICI_NSDL],
  },
  "rays-power-experts": {
    brand: "Rays Experts", legal: "Rays Power Experts Private Limited", basis: "cited",
    source: [ICICI_NSDL, "https://india.entrepreneur.com/news-and-trends/rays-power-experts-secures-inr-200-m-via-equity-funding/477553"],
  },
  "sotefin-bharat": {
    brand: "Sotefin Bharat", legal: "Sotefin Bharat Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://www.indiainfoline.com/company/sotefin-bharat-ltd/summary"],
  },
  "innoviti-payment-solutions-private-ltd-pranav-koranne": {
    brand: "Innoviti", legal: "Innoviti Technologies Private Limited (formerly Innoviti Payment Solutions)", basis: "cited",
    source: ["https://innoviti.com/blogs/innoviti-appoints-former-visa-leader-himanshu-sharma-as-svp-issuing-bank-relationship/", "https://inc42.com/company/innoviti/"],
  },
  "pvc-ii-class-a1": {
    brand: "Pivot Ventures", legal: "Pivot Ventures", basis: "own-name",
    source: ["https://inc42.com/company/pivot-ventures/"],
  },
  "tocf-i-class-a2": {
    brand: "The OAKS Consumer Fund I", legal: "The OAKS Consumer Fund I", basis: "own-name",
    source: [MOTILAL_CDSL, "https://inc42.com/buzz/oaks-asset-management-launches-fund-with-inr-500-cr-corpus"],
  },
  // No company is named "We Voise"; the family's own statement holds WeVOIS Labs.
  "we-voise": {
    brand: "WeVOIS", legal: "WeVOIS Labs Private Limited", basis: "cited",
    source: [ICICI_NSDL, "https://www.instafinancials.com/company/WEVOIS-LABS-PRIVATE-LIMITED/U74999RJ2018PTC063218"],
  },
  "zenith-leisure-holidays": {
    brand: "Zenith Leisure Holidays", legal: "Zenith Leisure Holidays Limited", basis: "own-name",
    source: [ICICI_NSDL],
  },
  "radiant-innovative-manufacturing": {
    brand: "Radiant Innovative Manufacturing", legal: "Radiant Innovative Manufacturing Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://www.instafinancials.com/company/radiant-innovative-manufacturing-limited-U74899DL1988PLC032685"],
  },
  // The family's statement holds EMA Partners India's shares; the review's line is its preference shares.
  "ema-preferred-shares": {
    brand: "EMA Partners", legal: "EMA Partners India Limited", basis: "own-name",
    source: [ICICI_NSDL, "https://huntscanlon.com/ema-partners-india-debuts-on-nse-emerge-with-strong-investor-demand/"],
  },
  "perplexity-investment": {
    brand: "Perplexity", legal: "Perplexity AI, Inc.", basis: "own-name",
    source: ["https://en.wikipedia.org/wiki/Perplexity_AI"],
  },
  "runable-investment": {
    brand: "Runable", legal: "Runable", basis: "own-name",
    source: ["https://inc42.com/buzz/ai-agent-platform-runable-raises-21-mn-to-help-small-businesses-grow/"],
  },
  "nopo-nanotechnologies-india-pvt-ltd-gadhadar-reddy": {
    brand: "NoPo Nanotechnologies", legal: "NoPo Nanotechnologies India Private Limited", basis: "own-name",
    source: ["https://www.barandbench.com/dealstreet/jsa-advises-inflexor-tech-on-its-investment-in-nopo-nanotechnologies"],
  },
  "home-pecked-e-marketplace-services": {
    brand: "Homepecked", legal: "Homepecked e-Marketplace Services Private Limited", basis: "own-name",
    source: ["https://yourstory.com/companies/homepecked"],
  },
  "aksum-trademart-pvt-ltd-ankit-jain": {
    brand: "Aksum", legal: "Aksum Trademart Private Limited", basis: "cited",
    source: ["https://yourstory.com/companies/aksum"],
  },
  // Rurash Financials deals in unlisted shares: the line is Reliance Retail's,
  // bought through it, and the register says the shares are in demat.
  "rurash-financials-private-ltd-reliance-retail": {
    brand: "Reliance Retail", legal: "Reliance Retail Ventures Limited (bought through Rurash Financials)", basis: "cited",
    source: ["https://www.leadstal.com/sb/rurash-financials-private-limited-las-aif-unlisted-equity-and-dematerialisation", "https://sbnri.com/blog/nri-investment/reliance-retail-unlisted-share-price-ipo"],
  },
  // Investment vehicles and lines no public source ties to one company: as printed.
  "transigo-fleet": { brand: "Transigo Fleet", legal: "Transigo Fleet LLP", basis: "as-printed", source: [] },
  "sky-vision-cure": { brand: "Sky Vision Cure", legal: "Sky Vision Cure LLP", basis: "as-printed", source: [] },
  "procyon-enterprise-llp-abhishek-murarka": { brand: "Procyon Enterprise", legal: "Procyon Enterprise LLP", basis: "as-printed", source: [] },
  "sky-enable-tech": { brand: "Sky Enable Tech", legal: "Sky Enable Tech LLP", basis: "as-printed", source: [] },
  "fh-enable-llp-aakash-sachdev": { brand: "FH Enable", legal: "FH Enable LLP", basis: "as-printed", source: [] },
  "fh-edutech": { brand: "FH Edutech", legal: "FH Edutech LLP", basis: "as-printed", source: [] },
  "variance-pt-ventures-llp-romil-kapadia": { brand: "Variance PT Ventures", legal: "Variance PT Ventures LLP", basis: "as-printed", source: [] },
  // The two review lines this dashboard shows under a neutral name — as printed.
  "a-k-enterprises": { brand: "A K Enterprises", legal: "A K Enterprises", basis: "as-printed", source: [] },
  "inflexor-technologies": { brand: "Inflexor Technologies", legal: "Inflexor Technologies", basis: "as-printed", source: [] },
};

/** The entry for a line, by its fundKey (an unvalued account's `account:` prefix
 *  stripped, as the book writes it). */
export function brandNameOf(fundKey: string): BrandName | null {
  return BRAND_NAMES[fundKey.replace(/^account:/, "")] ?? BRAND_NAMES[fundKey] ?? null;
}
