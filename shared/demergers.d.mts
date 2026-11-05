export type Demerger = {
  parentKey: string;
  parentSymbol: string | null;
  parentIsin: string | null;
  childKey: string;
  childSymbol: string | null;
  recordDate: string;
  ratio: number;
  source: string;
  sources: string[];
};
export const DEMERGERS: readonly Demerger[];
export function demergerInto(childKey: string): Demerger | null;
