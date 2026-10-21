export type PublicationPointer = { schemaVersion: number; revision: string };
export declare function refreshForPublication(options: {
  revision: string; published: unknown;
  browser: Pick<Window, "sessionStorage" | "location" | "navigator">;
  blocked?: boolean; now?: number;
}): boolean;
export declare function startPublicationRefresh(options: {
  revision: string; path?: string; browser?: Window; intervalMs?: number;
}): { check(): Promise<void>; stop(): void };
