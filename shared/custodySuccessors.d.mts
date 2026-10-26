type Account = { accountId: string; ownerId?: string | null; asOf?: string | null };
type Holding = { accountId: string; isin?: string | null; asOf?: string | null; periodTo?: string | null };
type Position = Holding & { quantity: number | null; custodyPredecessors?: string[]; custodyEvidence?: { document: string; pointer: string; effectiveOn: string }; statementRecord?: { document: string; pointer: string } };
export function custodySuccessor<T extends Position>(holding: Holding, accounts: readonly Account[], positions: readonly T[]): T | null;
