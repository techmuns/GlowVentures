export const ISIN_SUCCESSORS: Readonly<Record<string, string>>;
export function currentIsin<T extends string | null | undefined>(isin: T): T | string;
