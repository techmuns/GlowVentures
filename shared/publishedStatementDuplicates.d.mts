import type { InboxLog } from './statementInbox.mjs';

export type PublishedOriginal = {
  bytes: number;
  sourcePaths: string[];
  docKeys: string[];
  providers: string[];
};
export declare function publishedStatementDuplicates(manifest: unknown, index: unknown): Map<string, PublishedOriginal>;
export declare function recognisePublishedDuplicates(log: Pick<InboxLog, 'batches'>, matches: ReadonlyMap<string, PublishedOriginal>): Pick<InboxLog, 'batches'>;
