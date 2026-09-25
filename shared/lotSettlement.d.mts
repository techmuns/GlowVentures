// Types for shared/lotSettlement.mjs — which capital-gain lots settle which
// day's sale. Plain JS in shared/ so the runtime ledger and `build-book` join a
// lot to its sale with identical code. See the long note there.

export type SettlementLot = {
  accountNo: string; securityKey: string; saleDate: string | null;
  saleAmount: number | null | undefined; realised: number | null | undefined;
};
export type LotGroup = {
  key: string; accountNo: string; securityKey: string; date: string;
  realised: number; saleAmount: number | null; lots: number;
};
export type SettlementSell = { accountNo: string; securityKey: string; date: string | null; amount: number | null };
export type DaySale = { accountNo: string; securityKey: string; date: string; amount: number | null; rows: number };
export type Settled = { realised: number; lots: number; by: "key" | "amount"; lotKey: string; lotSecurityKey: string };

export declare const daySaleKey: (accountNo: string, securityKey: string, date: string) => string;
export declare const withinPrintedPrecision: (lotSum: number, lots: number, sale: number, rows: number) => boolean;
export declare function lotGroupsOf(lots: readonly SettlementLot[]): Map<string, LotGroup>;
export declare function daySalesOf(sells: readonly SettlementSell[]): DaySale[];
export declare function settleSales(groups: Map<string, LotGroup>, sales: readonly DaySale[]): {
  bySale: Map<string, Settled>;
  aliases: Map<string, string>;
  conflicts: { lot: string; sales: string[] }[];
  unsettled: LotGroup[];
};
export declare const settledSecurityOf: (aliases: Map<string, string>, accountNo: string, lotSecurityKey: string) => string;
