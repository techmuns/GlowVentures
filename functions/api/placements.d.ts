// Types for the moved-holdings store, so `familyPlacements.test.ts` can import it.
//
// Same reason as `capital-calls.d.ts`: a plain-JS Function imported BY A TEST
// fails `tsc -b` on TS7016 without a declaration, and `test:family` would not
// notice because it bundles with esbuild and does not typecheck.
import type { KvLike } from "./capital-calls";

export type PlacementsContext = {
  env: { DASHBOARD_STORE?: KvLike; GLOW_GITHUB_TOKEN?: string } & Record<string, unknown>;
  request: Request;
};

export type StoredPlacement = { axis: "category" | "assetClass" | "basket"; product: string; section: string; updatedAt: string };
export type PlacementChange = { axis: StoredPlacement["axis"]; products: string[]; section: string | null; updatedAt: string };

export const PLACEMENT_AXES: readonly StoredPlacement["axis"][];
export function onRequest(context: PlacementsContext): Promise<Response>;
export function isPlacement(p: unknown): p is StoredPlacement;
export function validatePlacementChange(body: unknown, now?: Date):
  { change: PlacementChange; error?: undefined } | { error: string; change?: undefined };
