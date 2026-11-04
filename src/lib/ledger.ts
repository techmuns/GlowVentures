// Prepared on the build server from the complete archive. Each view downloads
// only its own result; no statement fan-out or reconciliation runs in the browser.
import { readModel } from "./readModel";
import { selectedReadModels as manifest } from "./runtimeBook";
import type { TxnData, LotData, IncomeData, SalesData, StockLedger, HoldingRecord, StatementSecurityData } from "./ledgerModel";
export type { ManifestEntry, Txn, TxnData, Lot, LotData, IncomeRow, IncomeData, SaleRow, SalesData, StockTxn, StockLedger, HoldingRecord, StatementSecurity, StatementSecurityData } from "./ledgerModel";

export const loadTransactions = () => readModel<TxnData>("ledger/transactions.json");
export const loadRealisedLots = () => readModel<LotData>("ledger/lots.json");
export const loadIncome = () => readModel<IncomeData>("ledger/income.json");
export const loadSales = () => readModel<SalesData>("ledger/sales.json");
/** Every statement that names each security — the Portfolio Library's folders. */
export const loadStatementSecurities = () => readModel<StatementSecurityData>("statement-securities.json");
const recordedKeys = new Set(manifest.stockKeys);
export async function loadStockLedger(securityKey: string): Promise<StockLedger | null> {
  if (!/^[a-z0-9-]+$/.test(securityKey)) return null;
  if (!recordedKeys.has(securityKey)) return { ...manifest.emptyLedger, securityKey, name: securityKey };
  return readModel<StockLedger>(`ledger/stocks/${securityKey}.json`);
}
/**
 * A HOLDING'S DATED RECORD — every buy, sell, switch and income row Data Audit
 * lists for it (Stage 10la). A ledger an older reader built carries only the
 * trade tape, which is then what is drawn, each trade its own Buy or Sell.
 */
export const holdingRecordsOf = (l: StockLedger): HoldingRecord[] => l.records ?? l.txns.map((t) => ({
  date: t.date, txntype: t.side, record: "Trade", type: "Trade", accountId: null, entity: t.account, provider: null,
  qty: t.qty, rate: t.rate, amount: t.amount, notes: null, source: null,
}));
