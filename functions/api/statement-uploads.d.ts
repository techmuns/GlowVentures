// Types for the statement-upload Function, so `statementUploads.test.ts` can
// import it. The function is plain JS Cloudflare runs directly; this
// declaration exists because a test imports the module and `tsc -b` would
// otherwise fail the whole build on TS7016 (see `indices.d.ts` /
// `capital-calls.d.ts`).

export type StatementUploadsContext = {
  /** `GLOW_GITHUB_TOKEN` writes the inbox; absent until it is set. */
  env: { GLOW_GITHUB_TOKEN?: string; GLOW_GITHUB_REPO?: string; GLOW_INBOX_BRANCH?: string } & Record<string, unknown>;
  request: Request;
};

/** `fetchImpl` is a test's fake GitHub; the site passes none. */
export function onRequest(
  context: StatementUploadsContext,
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<Response>;
