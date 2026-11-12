export type PublicationPointer = { schemaVersion: number; revision: string };
export declare function publicationRefreshBlocked(browser?: Window): boolean;
export declare function startPublicationRefresh(options: {
  revision: string; path?: string; browser?: Window; intervalMs?: number;
  readerRevision?: string; onAvailable?: (published: PublicationPointer) => void; onBlocked?: (blocked: boolean) => void;
}): { check(): Promise<void>; stop(): void };
