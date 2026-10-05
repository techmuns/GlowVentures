// Where each private-market line of the family's consolidated review sits in THIS
// book's statements — a hand-checked table, never a name matcher.
//
// Each entry names the review line by a pattern the builder requires to match
// EXACTLY ONE line, and the book's own securityKeys. A join is licensed by an
// arithmetic WITNESS (the review's cost ÷ the statement's units is a clean price)
// or by the company's own name on both documents; `why` says which. A line with
// no entry is NAMED as on no statement in this drop — never guessed. A near miss
// is refused and listed in REFUSED, with the reason.
//
// Nothing here moves a figure: the review's numbers stay the review's, the
// book's stay the book's. It decides only what the "In the statements" column says.

export const REVIEW_PRIVATE_JOIN = [
  // ── Private investments, held at cost ──
  { line: /^Everest Fleet Private Ltd/, keys: ["everest-fleet", "everest-fleet-private-limited-0-001-series-b-new-pref-18ap43"], why: "the company's name on both" },
  { line: /^URB Ventures/, keys: ["urb-ventures", "urb-ventures-private-limited-0-001-pref-07jl42"], why: "the company's name on both" },
  { line: /^Integris$/, keys: ["integris-medtech"], why: "the company's name on both; Pre-IPO on the review" },
  { line: /^SKS Fastener$/, keys: ["sks-fasteners"], why: "₹2.996 Cr ÷ 24,800 shares = ₹1,208 a share" },
  { line: /^Spray Engineering Devices/, keys: ["spray-engineering-devices"], why: "₹4.752 Cr ÷ 1,65,566 shares = ₹287 a share" },
  { line: /^Matrix Gas And Renewables/, keys: ["matrix-gas-and-renewables"], why: "₹4.5 Cr ÷ 75,000 shares = ₹600 a share" },
  { line: /^ESDS$/, keys: ["esds-software-solution-limited-eq-new-fv-rs-1"], why: "the company's name on both; Pre-IPO on the review" },
  { line: /^Oil Max$/, keys: ["oilmax-energy"], why: "₹3.876 Cr ÷ 17,000 shares = ₹2,280 a share" },
  { line: /^Borosil Renewables$/, keys: ["borosil-renewables-limited-warrants-13ag26"], why: "₹3.75 Cr ÷ 2,83,018 warrants = ₹132.50, the 25% subscribed on a ₹530 warrant" },
  { line: /^BIG BANG BOOM$/, keys: ["big-bang-boom-solutions-private-limited-0-001-pref-12sp44"], why: "₹4.032 Cr ÷ 48 preference shares = ₹8,40,000 a share" },
  { line: /^RAY's$/, keys: ["rays-power-experts"], why: "₹2.006 Cr ÷ 59,000 shares = ₹340 a share" },
  { line: /^The OAKS Consumer Fund I/, keys: ["tocf-i-class-a2"], why: "The OAKS Consumer Fund I — TOCF-I on the depository" },
  { line: /^SOTEFIN$/, keys: ["sotefin-bharat"], why: "the company's name on both" },
  { line: /^Zenith$/, keys: ["zenith-leisure-holidays"], why: "₹1 Cr ÷ 32,791 shares = ₹305 a share" },
  { line: /^Radiant$/, keys: ["radiant-innovative-manufacturing"], why: "₹1 Cr ÷ 71,400 shares = ₹140 a share" },
  { line: /^Electromech Infraprojects/, keys: ["electromech-infraprojects"], why: "₹5 Cr ÷ 3,78,788 shares = ₹132 a share" },
  { line: /^Swapeco Solutions Private Limited$/, keys: ["swapeco-solutions"], why: "347 Pre-Series-A CCPS per family trust, ₹1.35 Cr each on the review's member summary" },
  { line: /^Blue Ashva Varenya Account$/, keys: ["blue-ashva-varenya-fund-bavf-ser20-c6-restricted-transferability"], why: "the fund's own name, VARENYA, on both" },
  { line: /^Onix Renewable$/, keys: ["onix-renewable"], why: "the company's name on both" },
  // ── now listed: carried on the review's Equity tab, and in this book as a listed holding ──
  { line: /^M\/S Grand Continent Hotels$/, keys: ["grand-continent-hotels"], why: "now listed — the review carries it on its Equity tab", listed: "M/S Grand Continent Hotels" },
  { line: /^Parth Electrical & Engineering$/, keys: ["parth-electricals-and-engineering"], why: "listed in Aug'25 — the review carries it on its Equity tab", listed: "Parth Electrical & Engineering" },
  { line: /^Fractual Analytics$/, keys: ["fractal-analytics"], why: "now listed — the review carries it on its Equity tab as Fractal Analytics", listed: "Fractal Analytics Limited" },
  { line: /^Clean Max Solar$/, keys: ["clean-max-enviro-energy-solutions"], why: "now listed — the review carries it on its Equity tab as Clean Max", listed: "Clean Max Enviro Energy Solutions Ltd" },
  // ── written off on the review, still a line on a statement ──
  { line: /^Cheelizza - /, keys: ["cheelizza-ind"], why: "the company's name on both; the review writes it off" },
  // ── PE funds, unlisted shares ──
  { line: /^India SME$/, keys: ["india-sme-investments-fund-ii-class-a2", "india-sme-investments-aif-trust-ii-cl-a2-restricted-transferability"], why: "the fund's own name on both" },
  { line: /^Baring PE India Fund 6$/, keys: ["baring-private-equity-india-fund-6-class-a1"], why: "202.5 units on both" },
  { line: /^360 One Special Opportunities Fund/, keys: ["360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii"], why: "9,90,429.684 units under each CRN" },
  { line: /^Sky Capital Titan Rising Funds 1$/, keys: ["sky-capital-rising-titans-fund-hudle-class-a1", "sky-capital-rising-titans-fund-ted-class-a2", "sky-capital-rising-titans-fund-oncare-class-a3", "sky-capital-rising-titans-fund-i-skycrtf-oncarea3-restricted-transferability"], why: "the fund's own name on both" },
  { line: /^Assetgro Fintech Private Limited$/, keys: ["assetgro-fintech-private-limited-1-series-b-pref-25nv44"], why: "₹5.0033 Cr ÷ 636 preference shares = ₹78,668 a share, the review's own rate" },
  { line: /^Transition Venture Capital fund I$/, keys: ["transition-venture-capital-fund-i-class-a1"], why: "7,500 units per family trust on both" },
  { line: /^National Stock Exchange$/, keys: ["national-stock-exchange-of-india", "national-stock-ex"], why: "1,25,000 + 75,000 = the review's 2,00,000 shares" },
  { line: /^Zepto$/, keys: [], why: "no statement in this drop holds Zepto's shares or preference shares" },
];

/** Near misses, refused on the evidence — listed so nobody joins them by eye. */
export const REFUSED = [
  { line: /^Innoviti Payment Solutions/, key: "innoviti-technologies", why: "a different company: Innoviti Payment Solutions against Innoviti Technologies" },
  { line: /^WE VOISE$/, key: "wevois-labs", why: "WE VOISE against Wevois Labs; nothing ties the 55 shares to the review's ₹1.01 Cr" },
  { line: /^Waterwala Labs/, key: "wevois-labs", why: "Waterwala Labs (Drink Prime) is not Wevois Labs" },
  { line: /^EMA Preferred Shares$/, key: "ema-partners-india", why: "preference shares against the listed equity — a different instrument" },
  { line: /^SWAPECO SOLUTIONS PRIVATE LIMITED - /, key: "swapeco-solutions", why: "Bharat's own 244 equity shares; the statements carry the trusts' CCPS, a different instrument" },
];

/**
 * The review's own words for two lines carry names this dashboard keeps off every
 * page (the ring-fenced holding, and the register's sentinel) — shown under a
 * neutral name, the review's own text in the archive and the report.
 */
export const DISPLAY_NAME = [
  { line: /^A K Enterprises - /, name: "A K Enterprises" },
  { line: /^Inflexor Technologies - /, name: "Inflexor Technologies" },
];
