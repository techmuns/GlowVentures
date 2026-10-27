export type GitHubStatementEnv = { GLOW_GITHUB_TOKEN?: string; GLOW_GITHUB_REPO?: string };
export declare const githubStatementsEnabled: (env: GitHubStatementEnv) => boolean;
export declare function githubStatementReader(env: GitHubStatementEnv, fetchImpl?: typeof fetch): {
  state(): Promise<{ revision: string; readerRevision: string; receipts: Record<string, unknown> } | null>;
  request(pathname: string): Promise<Response | null>;
  receiptLog<T>(log: T): Promise<T>;
};
