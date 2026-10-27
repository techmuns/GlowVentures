export type RapidEnv = { GLOW_RAPID_STATEMENTS?: { fetch(request: Request): Promise<Response> }; GLOW_RAPID_STATEMENTS_URL?: string; GLOW_RAPID_STATEMENTS_TOKEN?: string };
export declare const rapidStatementsEnabled: (env: RapidEnv) => boolean;
export declare function rapidStatementRequest(env: RapidEnv, pathname: string, init?: RequestInit): Promise<Response | null>;
