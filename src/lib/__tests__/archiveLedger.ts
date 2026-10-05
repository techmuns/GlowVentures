// Exercise canonical reconciliation directly against the source archive. Browser
// transport is tested separately against the prepared views in readModels.test.ts.
import { readFileSync } from 'node:fs';
import * as model from '../ledgerModel';
export { lotGroups, daySales, settleSales } from '../ledgerModel';
const manifest = JSON.parse(readFileSync('public/audit/manifest.json', 'utf8'));
const docs: model.ArchiveDoc[] = manifest.map((d: { docKey: string }) => JSON.parse(readFileSync(`public/audit/${d.docKey}/document.json`, 'utf8')));
export const loadArchive = async () => docs;
export const loadTransactions = async () => model.deriveTransactions(docs);
export const loadSales = async () => model.deriveSales(docs);
export const loadRealisedLots = async () => model.deriveRealisedLots(docs);
export const loadIncome = async () => model.deriveIncome(docs);
export const loadStockLedger = async (key: string) => model.deriveStockLedger(docs, key);
