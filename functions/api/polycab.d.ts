// Types for the Polycab Pages Function, so `polycabFunction.test.ts` can import
// it. Same reason `indices.d.ts` and `chat.d.ts` exist: the functions in this
// folder are plain JS that Cloudflare runs directly, and without a declaration
// `tsc -b` fails the whole build on TS7016 — which `test:family` would NOT
// catch, because it bundles with esbuild and does not typecheck.
//
// That trap bit this change TWICE in one session, once here and once on
// `shared/polycabSources.mjs`, and both times the suites were green while
// `npm run build` was broken. It is the reason the bug-reintroduction harness
// runs a no-patch CONTROL first: without one, a tree that cannot build reports
// every reintroduced bug as "fired" and the pass measures nothing.
export type PolycabContext = {
  request: Request;
};

export function onRequest(context: PolycabContext): Promise<Response>;
