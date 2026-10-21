// WHAT A FUND ITSELF HOLDS — the read side.
//
// Prepared on the build server from the complete archive, by
// `deriveFundDisclosures` in `ledgerModel.ts` (see the long note there), so no
// statement fan-out runs in the browser.
//
// DELIBERATELY ITS OWN MODEL AND NOT PART OF `lookthrough.json`. That one is the
// AMCs' monthly portfolio filings for mutual funds and ETFs — an ISIN and a
// value per line — and it is what `companyExposure`, and therefore every
// stock-axis figure, is built on. This is the one AIF disclosure the archive
// carries: a name and a weight per line, read by one card. One model over two
// sources would make an AIF's weights reach that partition (Stage 10df).
import { readModel } from "./readModel";
import type { FundDisclosureData } from "./ledgerModel";
export type { FundDisclosureLine, FundDisclosure, FundDisclosureData } from "./ledgerModel";

export const loadFundDisclosures = () => readModel<FundDisclosureData>("fund-disclosures.json");
