// Types for shared/fifo.mjs — the one FIFO lot engine, shared by `build-book`
// and the browser. See the long note there.

export declare const UNIT_TIE: number;

export type FifoEvent =
  | { date: string; kind: "buy"; units: number; amount: number; cls?: string | null }
  | { date: string; kind: "sell"; units: number; amount: number; cls?: string | null }
  | { date: string; kind: "switch"; units: number; unitsIn: number; from?: string | null; to?: string | null };

export type FifoLot = { cls: string | null; date: string; units: number; cost: number; origin: string };
export type FifoMatch = {
  cls: string | null; buyDate: string; sellDate: string;
  units: number; cost: number; proceeds: number; gain: number;
};

export type FifoLedger = {
  lots: FifoLot[];
  realised: FifoMatch[];
  shortfalls: { date: string; cls: string | null; units: number }[];
  unitsHeld: number;
  costHeld: number;
  costSold: number;
  proceeds: number;
  realisedGain: number;
};

export declare function fifoLedger(events: FifoEvent[], opts?: { tie?: number }): FifoLedger;
export declare function fifoForClass(ledger: FifoLedger, cls: string | null): Omit<FifoLedger, "shortfalls">;

/**
 * (unrealised + realised) ÷ (cost of units held + cost of units sold), in
 * percent. Null wherever the cost is unknown or not positive — never 0.
 */
export declare function fifoReturnPct(
  marketValue: number,
  costHeld: number | null | undefined,
  realised: number | null | undefined,
  costSold: number | null | undefined,
): number | null;
