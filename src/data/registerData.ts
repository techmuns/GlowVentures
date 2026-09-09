// GENERATED — do not edit by hand. Rebuild with `npm run build-register`.
//
// Source: `source/august-2026-f/NEW INVESTMENT SHEET.xlsx` — the family's OWN record of what they paid.
// It is NOT a statement and is NOT a source for the book: no institution struck
// it, and `CURRENT VALUATION` is empty on every one of its rows. Every figure
// below is a CASH OUTFLOW, never a market value, and none may be added to NAV.
//
// `src/pages/Register.tsx` is the only reader. It reads this module DIRECTLY
// rather than through PortfolioContext, so nothing here can reach a portfolio
// total — the same construction that keeps BOOK_POLYCAB off every other page.
import type { RegisterLine, RegisterSummary, RegisterCostCandidate } from "@/lib/types";

/** The workbook this file is generated from. */
export const REGISTER_SOURCE = "source/august-2026-f/NEW INVESTMENT SHEET.xlsx";

export const REGISTER_SUMMARY: RegisterSummary = {
  "grossPaid": 8429159078.84,
  "blindSum": 12747947378.34,
  "tranches": 427,
  "names": 151,
  "sheets": 8,
  "loansRepaid": 32990000,
  "writtenOff": 16918846,
  "rowsWithCurrentValuation": 0,
  "rowsStatingAQuantity": 74,
  "paidUnderAnUnresolvedOwner": 8272157328.84,
  "inBookAsAccount": 3477250000,
  "inBookAsPosition": 434192878,
  "notInBook": 4500797354.84,
  "namesInBookAsAccount": 24,
  "namesInBookAsPosition": 7,
  "namesNotInBook": 113,
  "namesExited": 7,
  "costlessPositions": 60,
  "costlessMarketValue": 1659435971.83,
  "costlessCovered": 7
};

/** Per sheet, with the subtotal rows the reader excluded. */
export const REGISTER_SHEETS = [
  {
    "name": "PVT INV",
    "tranches": 84,
    "subtotalRowsSkipped": 14,
    "paid": 778055678.96,
    "isExit": false
  },
  {
    "name": "TRUST INVESTMENT",
    "tranches": 10,
    "subtotalRowsSkipped": 0,
    "paid": 282201750,
    "isExit": false
  },
  {
    "name": "COMPANY",
    "tranches": 72,
    "subtotalRowsSkipped": 6,
    "paid": 279916090,
    "isExit": false
  },
  {
    "name": "FUND HOUSE",
    "tranches": 82,
    "subtotalRowsSkipped": 15,
    "paid": 1867710000,
    "isExit": false
  },
  {
    "name": "CRYPTO",
    "tranches": 52,
    "subtotalRowsSkipped": 5,
    "paid": 13005250,
    "isExit": false
  },
  {
    "name": "WRITE OFF - EXIT",
    "tranches": 12,
    "subtotalRowsSkipped": 4,
    "paid": 16918846,
    "isExit": true
  },
  {
    "name": "AJAY SIR - AARTI",
    "tranches": 55,
    "subtotalRowsSkipped": 9,
    "paid": 1855751463.88,
    "isExit": false
  },
  {
    "name": "ATJ-AAJ FUND HOUSE",
    "tranches": 60,
    "subtotalRowsSkipped": 11,
    "paid": 3335600000,
    "isExit": false
  }
];

/** Owner strings as the family typed them, and whether they resolve. */
export const REGISTER_OWNERS = [
  {
    "owner": "AJAY",
    "paid": 5156351463.88
  },
  {
    "owner": "ANKITA",
    "paid": 1749775494
  },
  {
    "owner": "BHARAT",
    "paid": 1205830370.96
  },
  {
    "owner": "Bharat Jaisinghani Family Trust",
    "paid": 125200000
  },
  {
    "owner": "Bharat Jaisinghani Family Trust 2",
    "paid": 57500000
  },
  {
    "owner": "Bharat Jaisinghani Family Trust 3",
    "paid": 57500000
  },
  {
    "owner": "AARTI",
    "paid": 35000000
  },
  {
    "owner": "BHARAT JAISINGHANI FAMILY TRUST 2",
    "paid": 21000875
  },
  {
    "owner": "BHARAT JAISINGHANI FAMILY TRUST 3",
    "paid": 21000875
  }
];

/** Names with NO counterpart anywhere in the book — the ask, and a COST. */
export const REGISTER_NOT_IN_BOOK: RegisterLine[] = [
  {
    "name": "AVENDUS ABSOLUTE RETURN FUND C",
    "paid": 705000000,
    "tranches": 8,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AARTI",
      "AJAY",
      "ANKITA",
      "BHARAT"
    ]
  },
  {
    "name": "DSP MUTUAL FUND COLLECTION ACCOUNT",
    "paid": 272500000,
    "tranches": 1,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "ONESOURCE SPECIALITY PHARMA LTD",
    "paid": 200251461,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ]
  },
  {
    "name": "ASK ASSOLUTE RETURN",
    "paid": 200000000,
    "tranches": 1,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "MARATHON TRENDS ADVISORY PRIVATE",
    "paid": 185000000,
    "tranches": 5,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AJAY",
      "ANKITA"
    ]
  },
  {
    "name": "CHANAKYA CORPORATE SERVICES (FRACTUAL ANALYTICS)",
    "paid": 176878881,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "KIRANAKART TECHNOLOGIES PRIVATE - ZEPTO",
    "paid": 150015960,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "MAN INDUSTRIES INDIA LTD",
    "paid": 149999976,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "SNS INFRAREALITY LLP - SMARTWORKS COWORKING SPACES",
    "paid": 130000050,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "INTEGRIS HEALTH PRIVATE LIMITED",
    "paid": 129998044,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ]
  },
  {
    "name": "INDIAN CLEARING",
    "paid": 125200000,
    "tranches": 2,
    "sheets": [
      "TRUST INVESTMENT"
    ],
    "owners": [
      "Bharat Jaisinghani Family Trust"
    ]
  },
  {
    "name": "SWIGGY LIMITED",
    "paid": 100131432,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ]
  },
  {
    "name": "MOTILAL OSWAL GROWTH ANCHORS FUND",
    "paid": 100000000,
    "tranches": 1,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "MOTILALOSWAL",
    "paid": 90000000,
    "tranches": 3,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "MOTHER INDIA FORMING PRIVATE LIMITED",
    "paid": 79999960,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "PROCYON ENTERPRISE LLP",
    "paid": 77998000,
    "tranches": 24,
    "sheets": [
      "COMPANY"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "TRANSIGO FLEET LLP",
    "paid": 77218522,
    "tranches": 22,
    "sheets": [
      "COMPANY"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "PROCYON STAR PVT. LTD.",
    "paid": 75902000,
    "tranches": 11,
    "sheets": [
      "COMPANY"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "SANJAY NAMDEO SALUNKHE - JARO EDUCTAION",
    "paid": 75000350,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "WATERWALA LABS PRIVATE LIMITED -DRINKPRIME",
    "paid": 72500920,
    "tranches": 4,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "MOTILAL OSWAL GROWTH",
    "paid": 60000000,
    "tranches": 2,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "MOTILAL OSWAL FINANCIAL SER L CLIENT A/C",
    "paid": 60000000,
    "tranches": 2,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "ASSETGRO FINTECH PRIVATE LIMITED",
    "paid": 50032848,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "ELECTROMECH INFRAPROJECTS PVT LTD",
    "paid": 50000016,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "ONIX RENEWABLE LIMITED",
    "paid": 50000000,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "SPRAY ENGINEERING DEVICES LIMITED",
    "paid": 47517442,
    "tranches": 4,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "MATRIX GAS AND RENEWABLES LIMITED",
    "paid": 45000000,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ]
  },
  {
    "name": "CHRYSEUM ADVISORS LLP",
    "paid": 42763713,
    "tranches": 2,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "BIG BANG BOOM SOLUTIONS PVT LTD",
    "paid": 40320000,
    "tranches": 3,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ]
  },
  {
    "name": "WHITESPACE ALPHA",
    "paid": 40000000,
    "tranches": 2,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ]
  },
  {
    "name": "ESDS PARTNERS LLC",
    "paid": 39999960,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "TELAWNE POWER EQUIPMENTS PRIVATE LIMITED",
    "paid": 39999168,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "BOROSIL RENEWABLE LTD",
    "paid": 37499885,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "SWAPECO SOLUTIONS PRIVATE LIMITED",
    "paid": 32022050,
    "tranches": 3,
    "sheets": [
      "PVT INV",
      "TRUST INVESTMENT"
    ],
    "owners": [
      "BHARAT",
      "BHARAT JAISINGHANI FAMILY TRUST 2",
      "BHARAT JAISINGHANI FAMILY TRUST 3"
    ]
  },
  {
    "name": "ASK ABSOLUTE RETURN FUND",
    "paid": 31000000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "INCRED WEALTH AND INVESTMENT",
    "paid": 30045012,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "LANDCRAFT RETAIL PVT LTD. - FOOD SQUARE",
    "paid": 30015000,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "SKS FASTENERS LIMITED",
    "paid": 29958400,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "HYPRKYTCHEN FOODTECH PVT LTD",
    "paid": 25608347.68,
    "tranches": 4,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "E2E NETWORKS LIMITED",
    "paid": 24998958.5,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "URB VENTURES PRIVATE LIMITED",
    "paid": 22500000,
    "tranches": 4,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "ANKITA"
    ]
  },
  {
    "name": "THE OASK CONSUMER FUND I",
    "paid": 20500000,
    "tranches": 7,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "BLUE ASHVA INDIA  POOL ACCOUNT",
    "paid": 20359640,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "ANKITA"
    ]
  },
  {
    "name": "IIFL SPECIAL OPPORTUNITIES FUN",
    "paid": 20100000,
    "tranches": 2,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ]
  },
  {
    "name": "RAYS POWER EXPERTS PVT LTD",
    "paid": 20060000,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "SYNCROAIR ENERGY SOLUTIONS PVT LTD",
    "paid": 20000000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "INNOVITI PAYMENT SOLUTIONS PRIVATE LIMITED",
    "paid": 19999973.84,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ]
  },
  {
    "name": "BOON SUSTAINABILITY TECHNOLOGIES",
    "paid": 19997568,
    "tranches": 1,
    "sheets": [
      "COMPANY"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "EMKAY GLOBAL FINANCIALS SERVICES LIMITED",
    "paid": 18000000,
    "tranches": 2,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "BLUE ASHVA INDIA  POOL ACCOUNT -  EDUGORILLA COMMUNITY PRIVATE LIMITED",
    "paid": 17810640,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "SHAIVAL M. DESAI",
    "paid": 17000000,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "M/S GRAND CONTINENT HOTELS",
    "paid": 16277250,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "PIVOT VENTURE CAPITAL II",
    "paid": 16000000,
    "tranches": 3,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "INCRED WEALTH AND INVESTMENT / INCRED HOLDINGS LTD",
    "paid": 15029264,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "AUTOCRACY MACHINERY PRIVATE",
    "paid": 15000018,
    "tranches": 2,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "AVENDUS ABSOLUTE RETURN FUND",
    "paid": 15000000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "EMKAY GLOBAL FINANCIAL SERVICES LIMITED",
    "paid": 14900000,
    "tranches": 5,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "SOTEFIN PARKING PVT LTD",
    "paid": 12500400,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "ESDS SOFTWARE SOLUTION LIMITED",
    "paid": 12291014,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "SKY VISION CURE",
    "paid": 11000000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "WEVOIS LABS PRIVATE LIMITED",
    "paid": 10106085,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "ZENITH LEISURE HOLIDAYS LIMITED",
    "paid": 10001255,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "RADIANT POLYMERS PVT LTD - RADIANT INNOVATIVE MANUFACTURING LIMITED",
    "paid": 9996000,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "WATERWALA LABS PRIVATE LIMITED",
    "paid": 8500232,
    "tranches": 4,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "INFLEXOR TECHNOLOGY",
    "paid": 7950000,
    "tranches": 11,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "VINEET SETHIA",
    "paid": 7908030,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "SOTEFIN BHARAT LTD",
    "paid": 7500000,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "GRAYQUEST EDUCATION FINANCE PRIVATE LIMITED",
    "paid": 7007138,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "KEYUR GIRISHCHANDRA SHAH- YASH HIGH VOLTAGE",
    "paid": 7000084,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "K M GLOBAL CREDIT PRIVATE LIMITED",
    "paid": 6000205.8,
    "tranches": 3,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "CRYPTO",
    "paid": 5900000,
    "tranches": 21,
    "sheets": [
      "CRYPTO"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "HIGHER ORBIT AGRITECH PRIVATE LIMITED",
    "paid": 5006100,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "FH ENABLE LLP",
    "paid": 5000000,
    "tranches": 6,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "A K ENTERPRISES",
    "paid": 5000000,
    "tranches": 5,
    "sheets": [
      "COMPANY"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "SKY ENABLE TECH LLP",
    "paid": 5000000,
    "tranches": 1,
    "sheets": [
      "COMPANY"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "SINCE99 APPAREL PRIVATE LIMITED",
    "paid": 4999071,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "STAY VISTA PRIVATE LIMITED - FROM ANANDKUMAR LADSARIYA",
    "paid": 4773404,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "STAY VISTA PRIVATE LIMITED - FROM ARTHA ENERGY PROJECTS PVT LTD",
    "paid": 4212804,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "AJAY JAIN",
    "paid": 4098207,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "KEYUR GIRISHCHANDRA SHAH - YASH HIGH VOLTAGE",
    "paid": 3000036,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "HANOK REUBEN MEDHARI",
    "paid": 2500024,
    "tranches": 9,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "IDEAFORGE TECHNOLOGY PRIVATE LIMITED / RICHA GARG (SHARE CERTIFICATE NOT RECEIVED)",
    "paid": 2500000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "NOPO NANOTECHNOLOGIES INDIA PRIVATE LIMITED",
    "paid": 2500000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "THIRD EYE DISTILLERY HOLDINGS PRIVATE LIMITED (TED)",
    "paid": 2500000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "VECINO FITNESS PRIVATE LIMITED",
    "paid": 2497619,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "BITCIPHER LLP",
    "paid": 2390000,
    "tranches": 15,
    "sheets": [
      "CRYPTO"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "FH EDUTECH LLP",
    "paid": 2000000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "ZAAMO E COMMERCE PVT LTD",
    "paid": 2000000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "NEGEN TECH OPPORTUNITIES ANGEL FUND",
    "paid": 2000000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "CHEELIZZA  PIZZA INDIA PVT LTD",
    "paid": 1982176,
    "tranches": 2,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "TRANSIGO OPC PVT LTD",
    "paid": 1800000,
    "tranches": 4,
    "sheets": [
      "COMPANY"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "ZIPPMAT PRIVATE LIMITED",
    "paid": 1690241,
    "tranches": 2,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "INFINITE INDIA INVESTMENT MANAGEMENT LTD",
    "paid": 1550000,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ]
  },
  {
    "name": "HOMEPECKED EMARKET PLACE SERVICES PTE LTD",
    "paid": 1540769.02,
    "tranches": 2,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "AL TRUST - COLLABMATES PRIVATE LIMITED",
    "paid": 1530000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "AKSUM TRADEMART PRIVATE LIMITED",
    "paid": 1500150,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "NEBLIO TECHNOLOGIES PVT LTD",
    "paid": 1500000,
    "tranches": 6,
    "sheets": [
      "CRYPTO"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "DCX DEPOSITS",
    "paid": 1400000,
    "tranches": 5,
    "sheets": [
      "CRYPTO"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "AL TRUST - KARBAN ENVIROTECH (RUV).",
    "paid": 1020000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "REFLEXICAL",
    "paid": 1015250,
    "tranches": 1,
    "sheets": [
      "CRYPTO"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "LV ANGEL FUND - LETS VENTURE (HOOPR)",
    "paid": 1010000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "RURASH FINANCIALS PRIVATE LIMITED -  RELIANCE RETAIL",
    "paid": 1001220,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "FALCONBRICK TECHNOLOGIES PRIVATE LIMITED",
    "paid": 1000000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "MONEYCLUB TECHNOLOGIES PRIVATE LIMITED",
    "paid": 1000000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "ONE EIGHT TECHNOLOGIES PRIVATE LIMITED--INVESTMENT IN NURO",
    "paid": 1000000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "VARIANCE PT VENTURES LLP",
    "paid": 1000000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "UE LIFESCIENCES",
    "paid": 946250,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "TAMASHA",
    "paid": 765000,
    "tranches": 1,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "CRYPTO MATIC",
    "paid": 600000,
    "tranches": 3,
    "sheets": [
      "CRYPTO"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "THRIVE TRIBE",
    "paid": 500000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "BETR TECH PRIVATE LIMITED---INVESTMENT IN 7 CLASSES",
    "paid": 497880,
    "tranches": 2,
    "sheets": [
      "PVT INV"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "BLUE ASHVA VARENYA FUND (GIBBON)",
    "paid": 200000,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "ANKITA"
    ]
  },
  {
    "name": "WAZIR",
    "paid": 200000,
    "tranches": 1,
    "sheets": [
      "CRYPTO"
    ],
    "owners": [
      "BHARAT"
    ]
  }
];

/** Names the book already carries as a managed account. NOT additive. */
export const REGISTER_IN_BOOK_ACCOUNT: RegisterLine[] = [
  {
    "name": "SANSHI FUND",
    "paid": 815000000,
    "tranches": 8,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AJAY",
      "ANKITA",
      "BHARAT"
    ],
    "heldAs": "Sanshi Fund"
  },
  {
    "name": "3P INDIA EQUITY FUND 1",
    "paid": 575000000,
    "tranches": 11,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AJAY",
      "ANKITA"
    ],
    "heldAs": "3P Investment Managers"
  },
  {
    "name": "BUOYANT OPPORTUNITIES",
    "paid": 248500000,
    "tranches": 5,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ],
    "heldAs": "Buoyant Capital"
  },
  {
    "name": "CARNELIAN BESPOKE",
    "paid": 230000000,
    "tranches": 2,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "Carnelian Asset Management and Advisors Pvt Ltd"
  },
  {
    "name": "BUOYANT OPPORTUNITIES STRATEGY",
    "paid": 210000000,
    "tranches": 4,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "Buoyant Capital"
  },
  {
    "name": "MOTILAL OSWAL HEDGED",
    "paid": 200000000,
    "tranches": 2,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AJAY",
      "ANKITA"
    ],
    "heldAs": "Motilal Oswal Hedged Equity Multi Factor Strategy"
  },
  {
    "name": "ARISTOS EQUITY PORTFOLIO",
    "paid": 175000000,
    "tranches": 1,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "Goldstandard Wealth Private Limited"
  },
  {
    "name": "GREEN LANTERN CAPITAL LLP",
    "paid": 150000000,
    "tranches": 2,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AJAY",
      "ANKITA"
    ],
    "heldAs": "Green Lantern Capital LLP"
  },
  {
    "name": "CARNELIAN",
    "paid": 150000000,
    "tranches": 2,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ],
    "heldAs": "Carnelian Asset Management and Advisors Pvt Ltd"
  },
  {
    "name": "INDIA SME FUND",
    "paid": 114000000,
    "tranches": 21,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "FUND HOUSE"
    ],
    "owners": [
      "AJAY",
      "ANKITA",
      "BHARAT"
    ],
    "heldAs": "India SME Investments"
  },
  {
    "name": "SVAN INVESTMENT MANAGERS LLP",
    "paid": 110000000,
    "tranches": 3,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "SVAN Investment Managers LLP"
  },
  {
    "name": "Helios Flexi Cap Fund Direct G",
    "paid": 100000000,
    "tranches": 2,
    "sheets": [
      "TRUST INVESTMENT"
    ],
    "owners": [
      "Bharat Jaisinghani Family Trust 2",
      "Bharat Jaisinghani Family Trust 3"
    ],
    "heldAs": "Helios Mutual Fund"
  },
  {
    "name": "Aristos Equity Portfolio - GoldStandard",
    "paid": 75000000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ],
    "heldAs": "Goldstandard Wealth Private Limited"
  },
  {
    "name": "VEC ASSAGO PMS",
    "paid": 75000000,
    "tranches": 1,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "V.E.C Assago Capital Management LLP"
  },
  {
    "name": "SVAN INVESTMENT MANAGERS",
    "paid": 65000000,
    "tranches": 2,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "BHARAT"
    ],
    "heldAs": "SVAN Investment Managers LLP"
  },
  {
    "name": "VEC ASSAGO",
    "paid": 50000000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ],
    "heldAs": "V.E.C Assago Capital Management LLP"
  },
  {
    "name": "NEO INFRA INCOME OP",
    "paid": 35000000,
    "tranches": 5,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "Neo Infra Income Opportunities Fund"
  },
  {
    "name": "SKY CAPITAL RISING TITANS FUND I",
    "paid": 32000000,
    "tranches": 5,
    "sheets": [
      "ATJ-AAJ FUND HOUSE",
      "COMPANY"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ],
    "heldAs": "Sky Capital Rising Titans Fund"
  },
  {
    "name": "BARING PRIVATE EQUITY INDIA FUND 6",
    "paid": 20250000,
    "tranches": 4,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ],
    "heldAs": "Baring Private Equity India Fund"
  },
  {
    "name": "TRANSITION VENTURE CAPITAL FUND I",
    "paid": 15000000,
    "tranches": 2,
    "sheets": [
      "TRUST INVESTMENT"
    ],
    "owners": [
      "BHARAT JAISINGHANI FAMILY TRUST 2",
      "BHARAT JAISINGHANI FAMILY TRUST 3"
    ],
    "heldAs": "Transition Venture Capital"
  },
  {
    "name": "SKY CAPITAL RISING TITANS FUND",
    "paid": 15000000,
    "tranches": 2,
    "sheets": [
      "TRUST INVESTMENT"
    ],
    "owners": [
      "Bharat Jaisinghani Family Trust 2",
      "Bharat Jaisinghani Family Trust 3"
    ],
    "heldAs": "Sky Capital Rising Titans Fund"
  },
  {
    "name": "MOLECULE VENTURES LIMITED",
    "paid": 10000000,
    "tranches": 1,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "Molecule Ventures LLP"
  },
  {
    "name": "LKP SECURITIES LIMITED",
    "paid": 5000000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "BHARAT"
    ],
    "heldAs": "LKP Securities"
  },
  {
    "name": "TRANSITION VENTURE CAPITAL FUND - I",
    "paid": 2500000,
    "tranches": 1,
    "sheets": [
      "FUND HOUSE"
    ],
    "owners": [
      "ANKITA"
    ],
    "heldAs": "Transition Venture Capital"
  }
];

/** Names the book already carries as a position. NOT additive. */
export const REGISTER_IN_BOOK_POSITION: RegisterLine[] = [
  {
    "name": "CLEAN MAX ENVIRO ENERGY SOLUTIONS LIMITED",
    "paid": 187715982,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "ANKITA"
    ],
    "heldAs": "clean-max-enviro-energy-solutions"
  },
  {
    "name": "INSOLATION ENERGY LIMITED",
    "paid": 99596100,
    "tranches": 2,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "BHARAT"
    ],
    "heldAs": "insolation-energy"
  },
  {
    "name": "SMARTWORKS COWORKING SPACES",
    "paid": 84500100,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "smartworks-coworking-spaces"
  },
  {
    "name": "EVEREST FLEET PRIVATE LIMITED",
    "paid": 47607824,
    "tranches": 7,
    "sheets": [
      "AJAY SIR - AARTI",
      "PVT INV"
    ],
    "owners": [
      "AJAY",
      "ANKITA",
      "BHARAT"
    ],
    "heldAs": "everest-fleet"
  },
  {
    "name": "PARTH ELECTRICALS & ENGINEERING LIMITED",
    "paid": 10030000,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "parth-electricals-and-engineering"
  },
  {
    "name": "EMA PARTNERS INDIA PVT LTD",
    "paid": 4642872,
    "tranches": 1,
    "sheets": [
      "AJAY SIR - AARTI"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "ema-partners-india"
  },
  {
    "name": "BLUE ASHVA VARENYA FUND-",
    "paid": 100000,
    "tranches": 1,
    "sheets": [
      "ATJ-AAJ FUND HOUSE"
    ],
    "owners": [
      "AJAY"
    ],
    "heldAs": "blue-ashva-varenya-fund-bavf-ser20-c6-restricted-transferability"
  }
];

/** Written off or exited — money the family no longer holds. */
export const REGISTER_EXITED: RegisterLine[] = [
  {
    "name": "WYRIDIAN ADVISORS LLP",
    "paid": 5000000,
    "tranches": 1,
    "sheets": [
      "WRITE OFF - EXIT"
    ],
    "owners": [
      "ANKITA"
    ]
  },
  {
    "name": "FARAWAY FOODS PRIVATE LIMITED",
    "paid": 3496320,
    "tranches": 2,
    "sheets": [
      "WRITE OFF - EXIT"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "ARTHA VENTURE FUND",
    "paid": 3210000,
    "tranches": 2,
    "sheets": [
      "WRITE OFF - EXIT"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "SYNERGISTIC FINANCIAL NETWORKS PVT LTD",
    "paid": 2762526,
    "tranches": 3,
    "sheets": [
      "WRITE OFF - EXIT"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "KYLO EDUTECH PRIVATE LIMITED",
    "paid": 1500000,
    "tranches": 2,
    "sheets": [
      "WRITE OFF - EXIT"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "AL TRUST - FORBIDDEN FOODS",
    "paid": 500000,
    "tranches": 1,
    "sheets": [
      "WRITE OFF - EXIT"
    ],
    "owners": [
      "BHARAT"
    ]
  },
  {
    "name": "RANGTECHNOVATIONS LLP",
    "paid": 450000,
    "tranches": 1,
    "sheets": [
      "WRITE OFF - EXIT"
    ],
    "owners": [
      "BHARAT"
    ]
  }
];

/** Costless book positions the register states a paid figure for. */
export const REGISTER_COST_CANDIDATES: RegisterCostCandidate[] = [
  {
    "security": "CLEAN MAX ENVIRO ENERGY SOLUTIONS LIMITED - EQ NEW FV RE.1/",
    "securityKey": "clean-max-enviro-energy-solutions",
    "custodian": "ICICI Bank (NSDL demat)",
    "marketValue": 126923395.5,
    "paid": 187715982
  },
  {
    "security": "SMARTWORKS COWORKING SPACES LIMITED - EQ",
    "securityKey": "smartworks-coworking-spaces",
    "custodian": "ICICI Bank (NSDL demat)",
    "marketValue": 91269496.9,
    "paid": 84500100
  },
  {
    "security": "PARTH ELECTRICALS & ENGINEERING LIMITED - EQ",
    "securityKey": "parth-electricals-and-engineering",
    "custodian": "ICICI Bank (NSDL demat)",
    "marketValue": 26252050,
    "paid": 10030000
  },
  {
    "security": "INSOLATION ENERGY LIMITED - EQ NEW FV RE.1/",
    "securityKey": "insolation-energy",
    "custodian": "ICICI Bank (NSDL demat)",
    "marketValue": 25251320,
    "paid": 99596100
  },
  {
    "security": "EMA PARTNERS INDIA LIMITED - EQ NEW FV RS 5/",
    "securityKey": "ema-partners-india",
    "custodian": "ICICI Bank (NSDL demat)",
    "marketValue": 3660726,
    "paid": 4642872
  },
  {
    "security": "BLUE ASHVA VARENYA FUND - BAVF-SER20-C6 - Restricted Transferability",
    "securityKey": "blue-ashva-varenya-fund-bavf-ser20-c6-restricted-transferability",
    "custodian": "ICICI Bank (NSDL demat)",
    "marketValue": 98742,
    "paid": 100000
  },
  {
    "security": "EVEREST FLEET-EQ1/",
    "securityKey": "everest-fleet",
    "custodian": "Motilal Oswal Financial Services (demat)",
    "marketValue": 580,
    "paid": 47607824
  }
];
