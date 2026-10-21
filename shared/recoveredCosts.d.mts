import type { Position, RecoveredHoldingCost } from '../src/lib/types';
export function applyRecoveredCost(position: Position, records: readonly RecoveredHoldingCost[]): Position;

export function recoveredCostFor(position: Pick<Position, 'accountId' | 'isin' | 'quantity'>, records: readonly RecoveredHoldingCost[]): RecoveredHoldingCost | undefined;
