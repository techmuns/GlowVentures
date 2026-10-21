// Types for shared/statementBytes.mjs — what a statement file's bytes say it is.

/** True for a mail server's short notice left in place of an attachment it removed. */
export declare function isRemovalNotice(bytes: Uint8Array): boolean;

/** Whether a file's head carries what its extension claims, with the reason when it does not. */
export declare function checkStatementBytes(bytes: Uint8Array, name: string):
  { ok: true; why?: undefined; removalNotice?: undefined } | { ok: false; why: string; removalNotice?: boolean };
