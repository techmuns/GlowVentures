// Prepared on the build server from the complete archive. Each view downloads
// only its own result; no statement fan-out or reconciliation runs in the browser.
import { readModel } from "./readModel";
import type { TxnData, LotData, IncomeData, SalesData, StockLedger } from "./ledgerModel";
export type { ManifestEntry, Txn, TxnData, Lot, LotData, IncomeRow, IncomeData, SaleRow, SalesData, StockTxn, StockLedger } from "./ledgerModel";

export const loadTransactions = () => readModel<TxnData>("ledger/transactions.json");
export const loadRealisedLots = () => readModel<LotData>("ledger/lots.json");
export const loadIncome = () => readModel<IncomeData>("ledger/income.json");
export const loadSales = () => readModel<SalesData>("ledger/sales.json");
export async function loadStockLedger(securityKey: string): Promise<StockLedger | null> {
  if (!/^[a-z0-9-]+$/.test(securityKey)) return null;
  return readModel<StockLedger>(`ledger/stocks/${securityKey}.json`);
}
