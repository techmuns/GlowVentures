// Types for the tile-layout store, so `tileSets.test.ts` can import it.
//
// Same reason as `capital-calls.d.ts`: a plain-JS Function imported BY A TEST
// fails `tsc -b` on TS7016 without a declaration, and `test:family` would not
// notice because it bundles with esbuild and does not typecheck. The
// declaration lands in the same commit as the test.
import type { KvLike } from "./capital-calls";

export type TileSetsContext = {
  env: { GLOW_STORE?: KvLike } & Record<string, unknown>;
  request: Request;
};

export type StoredTileSet = { page: string; ids: string[]; updatedAt: string };

export function onRequest(context: TileSetsContext): Promise<Response>;
export function isTileSet(s: unknown): s is StoredTileSet;
export function validateTileSet(body: unknown, now?: Date):
  { set: StoredTileSet; error?: undefined } | { error: string; set?: undefined };
