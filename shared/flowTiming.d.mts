export function weightedCapital(flows: readonly { date: string; amount: number }[], from: string, to: string): number | null;
export function reconciledWeightedCapital(flows: readonly { date: string; amount: number }[], from: string, to: string, net: number): number | null;
