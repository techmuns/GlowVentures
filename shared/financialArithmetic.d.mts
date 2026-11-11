export function decimalMinor(value: number | string, decimals?: number): bigint;
export function moneyFromMinor(value: bigint | string): number;
export function roundMoney(value: number | string): number;
export function sumMoney(values: readonly (number | string)[]): number;
export function moneyEqual(left: number | string, right: number | string, toleranceMinor?: bigint | number): boolean;
