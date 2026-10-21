// Types for the strategy/description store, so `enteredProfiles.test.ts` can
// import it — without a declaration `tsc -b` fails on TS7016 (see `capital-calls.d.ts`).
import type { KvLike } from "./capital-calls.js";

export type ProfilesContext = {
  env: { DASHBOARD_STORE?: KvLike; GLOW_GITHUB_TOKEN?: string } & Record<string, unknown>;
  request: Request;
};

export type StoredProfile = {
  fund: string;
  field: "strategy" | "description";
  fundName: string;
  text: string;
  updatedAt: string;
};

export function onRequest(context: ProfilesContext): Promise<Response>;
export function cleanText(s: unknown, max?: number): string;
export function isProfile(p: unknown): p is StoredProfile;
export function validateSave(body: unknown, now?: Date): { records: StoredProfile[]; error?: undefined } | { error: string; records?: undefined };
