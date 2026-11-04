export type PrivateCompanyEntry = { id: string; legalName: string; brand: string; fundKeys: string[] };
export const PRIVATE_COMPANIES: PrivateCompanyEntry[];
export const NOT_A_PRIVATE_COMPANY: Record<string, string>;
export const BLOCKED_SOURCE_HOSTS: string[];
export const FAMILY_NAME: RegExp;
