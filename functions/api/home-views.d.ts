// Types for the home-views store, so `homeViews.test.ts` can import it.
//
// Same reason as `tile-sets.d.ts`: a plain-JS Function imported BY A TEST fails
// `tsc -b` on TS7016 without a declaration, and `test:family` would not notice
// because it bundles with esbuild and does not typecheck. The declaration lands
// in the same commit as the test.
import type { KvLike } from "./capital-calls";

export type HomeViewsContext = {
  env: { DASHBOARD_STORE?: KvLike; GLOW_GITHUB_TOKEN?: string } & Record<string, unknown>;
  request: Request;
};

export type StoredView = { id: string; name: string; layout: { id: string; size: string }[] };

export function onRequest(context: HomeViewsContext): Promise<Response>;
export function validateViews(body: unknown):
  { views: StoredView[]; error?: undefined } | { error: string; views?: undefined };
