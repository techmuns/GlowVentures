/**
 * ── EVERY COMPANY A SECTOR TABLE CAN DRAW, FROM THE APP'S OWN CODE (Stage 10md) ─
 *
 * `npm run build-sectors` has to ask screener.in about every company the
 * Sector Composition page can put in a row: the shares the statements report,
 * the shares a depository records and only the live layer values, and every
 * EQUITY line the family's funds disclose. Re-deriving that set in the build
 * script would be a second definition of it, and the first version of this
 * build did exactly that — it asked about the book's own shares only, so 327
 * fund-held companies took the fund's filing and 59 shares the store never
 * asked about stood Unclassified.
 *
 * So the set is struck by `companyExposure` itself, over the same layers
 * `PortfolioContext` adds (depository funds and unpriced units at AMFI's NAV,
 * the depository's share balances). A share balance has no value without a live
 * quote; it is given a nominal one here because only its KEY is wanted.
 *
 * Bundled by the build script with esbuild and never shipped.
 */
import { BOOK_POSITIONS, BOOK_POLYCAB } from "../../src/data/glowData";
import { dedupedPositions, isCompanyShare } from "../../src/lib/analytics";
import { lookthroughCompanies } from "../../src/lib/recordedHoldings";
import { applyFundNavs, depositoryFundHoldings, unpricedStatementUnits } from "../../src/lib/fundNavs";
import { shareCandidates } from "../../src/lib/depositoryShares";
import {
  bookIsinBridge, heldFundVehicles, loadStockExposure, companyExposure, companySymbol,
  type FundPortfolio, type Index,
} from "../../src/lib/lookthrough";
import type { Position } from "../../src/lib/types";

export type UniverseEntry = {
  key: string;
  name: string;
  /** The symbol the app already resolves (statement, then `nseSymbols.json`). */
  symbol: string | null;
  /** Every ISIN the company is reached through — its statements' and its funds' equity lines. */
  isins: string[];
  /** Σ what the statements report, and the funds' equity lines — for ordering the report only. */
  value: number;
  /** The family's own statement prints a share of it. */
  held: boolean;
};

export async function sectorUniverse(source: { index: Index; portfolios: Record<string, FundPortfolio> }): Promise<UniverseEntry[]> {
  const fence = {
    keys: new Set(BOOK_POLYCAB.map((p) => p.securityKey)),
    isins: new Set(BOOK_POLYCAB.flatMap((p) => (p.isin ? [p.isin.trim().toUpperCase()] : []))),
  };
  const balances = shareCandidates().map((p) => ({ ...p, marketValue: 1 }));
  const all = dedupedPositions(applyFundNavs([...BOOK_POSITIONS, ...depositoryFundHoldings(), ...unpricedStatementUnits(), ...balances]));
  const companies = lookthroughCompanies(all);
  const shares = companies.filter(isCompanyShare) as Position[];
  const exposure = await loadStockExposure(heldFundVehicles(all), bookIsinBridge(companies).index, fence,
    new Set(shares.map((p) => p.securityKey)), source);
  if (exposure.status !== "ok") throw new Error(`the fund look-through did not load: ${exposure.status}`);
  return companyExposure(shares, exposure)
    .filter((e) => e.positions.length > 0 || e.derivedEquity + e.derivedGross > 0)
    .map((e) => {
      const lines = exposure.byKey.get(e.key)?.rows.flatMap((r) => r.instruments.filter((i) => i.assetClass === "Equity")) ?? [];
      return {
        // A recorded line no statement values carries neither a value nor always a name.
        key: e.key, name: e.name || e.key, symbol: companySymbol(e),
        isins: [...new Set([...e.positions.map((p) => p.isin), ...lines.map((i) => i.isin)]
          .filter((i): i is string => !!i).map((i) => i.trim().toUpperCase()))],
        value: [e.measured, e.derivedEquity, e.derivedGross].reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0),
        held: e.positions.length > 0,
      };
    });
}
