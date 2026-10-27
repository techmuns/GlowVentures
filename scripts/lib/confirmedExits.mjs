// THE FAMILY'S CONFIRMED EXITS, RETIRED AT ONE SEAM (Stage 10ib).
//
// `shared/confirmedExits.mjs` names the statement lines the family say they
// have exited. A line is retired from `BOOK_UNVALUED_HOLDINGS` only where MOPWM's
// transaction report witnesses the exit: its rows reconcile the statement's
// own units on the statement's own date, and its later exchange trades leave
// exactly nil (`exitAfterStatement`). Retired there, it is out of every page at
// once — the live depository candidates, the stock page's "held in", the
// family page, search — because each of them reads that list.
//
// Refuses the build rather than guessing: an entry whose account is not in the
// book, whose line is valued (a Position, which this table does not cover),
// whose line is carried twice, or whose sale the report does not witness. An
// entry that reaches no line is NAMED in the notes — the end state once a newer
// statement stops printing the holding — and retires nothing.
import { CONFIRMED_EXITS } from "../../shared/confirmedExits.mjs";
import { MOPWM_TRANSACTIONS, exitAfterStatement, mopwmRowsFor } from "./mopwmTransactions.mjs";

const isinOf = (x) => x.isin?.trim().toUpperCase() || null;
const fmt = (n) => n.toLocaleString("en-IN");

/** Splices every witnessed exit out of `unvalued` and returns the retired lines. */
export function retireConfirmedExits({ accounts, positions, unvalued, report, notes, exits = CONFIRMED_EXITS }) {
  const retired = [];
  for (const d of exits) {
    const where = `confirmed exit ${d.isin} on ${d.provider} ${d.accountNo}`;
    const account = accounts.filter((a) => a.provider === d.provider && String(a.accountNo) === String(d.accountNo));
    if (account.length !== 1) throw new Error(`build-book: ${where} names an account the book carries ${account.length} times, not once`);
    const a = account[0];
    if (a.ownerId !== d.ownerId) throw new Error(`build-book: ${where} is ${d.ownerId}'s; the book's account is ${a.ownerId}'s`);
    if (positions.some((p) => p.accountId === a.accountId && isinOf(p) === d.isin))
      throw new Error(`build-book: ${where} is a valued holding; the confirmed-exit table covers quantity-only lines`);
    const at = unvalued.flatMap((u, i) => (u.accountId === a.accountId && isinOf(u) === d.isin ? [i] : []));
    if (at.length > 1) throw new Error(`build-book: ${where} reaches ${at.length} lines, not one`);
    if (!at.length) {
      notes.push(`${where} reaches no line: the account's statements no longer record it, so the entry retires nothing and can be deleted from shared/confirmedExits.mjs`);
      continue;
    }
    const u = unvalued[at[0]];
    const rows = mopwmRowsFor(report, { isin: d.isin, account: a });
    const exit = rows ? exitAfterStatement(rows, { isin: d.isin, asOf: u.asOf, quantity: u.quantity })
      : { reason: "the transaction report records no trade of it for this owner and depository" };
    if (exit.reason) throw new Error(`build-book: ${where} is not witnessed — ${exit.reason}`);
    const reason = `the ${d.provider} statement of ${u.asOf} records ${fmt(u.quantity)} units; MOPWM's transaction report of `
      + `${report.asOf} records them sold in full on the exchange on ${exit.exitedOn} (row${exit.rows.length > 1 ? "s" : ""} `
      + `${exit.rows.join(", ")}), and the family confirmed the exit on ${d.confirmed} ("${d.words}")`;
    retired.push({
      ...(u.statementRecord ? { statementRecord: u.statementRecord } : {}),
      accountId: u.accountId, ownerId: u.ownerId, securityKey: u.securityKey, security: u.security, isin: u.isin,
      assetClass: u.assetClass, quantity: u.quantity, asOf: u.asOf, exitedOn: exit.exitedOn,
      sale: { source: report.path ?? MOPWM_TRANSACTIONS, reportAsOf: report.asOf, sheet: "Direct Equity", rows: exit.rows, units: exit.unitsSold },
      confirmed: d.confirmed, words: d.words, reason,
    });
    unvalued.splice(at[0], 1);
    notes.push(`confirmed exit: ${u.security} (${u.accountId}) — ${reason}. The line leaves the held book; the statement keeps it in the archive.`);
  }
  return retired.sort((x, y) => x.accountId.localeCompare(y.accountId) || x.securityKey.localeCompare(y.securityKey));
}
