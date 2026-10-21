/**
 * OPENING, PLUS, MINUS, CLOSING — the one definition, read by every surface.
 *
 * *"beginning of the year, this was my quantity, sold so much in the year, this
 * is the quantity remaining… more like an opening balance, plus minus, closing
 * balance. In a simple table format."*
 *
 * The demat statements print exactly that per ISIN — an `Opening Balance`, a
 * run of dated rows each carrying a RUNNING balance, and a `Closing Balance` —
 * and `providers/motilalDemat.mjs` publishes the split only where the rows it
 * read walk the first printed figure to the second. That gate is the whole
 * licence for showing the table (`hdfcNsdl.mjs`'s rule, one document type over),
 * so these helpers re-express the identity it enforces rather than restating it:
 * the page that PRINTS the columns and the suite that CHECKS them read the same
 * two functions, and cannot disagree about what the columns add to.
 *
 * Nothing here computes a term. Every figure is read off the statement; these
 * only add them up.
 */
import { BOOK_SHARE_MOVEMENTS } from "@/data/glowData";
import type { Position, ShareMovement } from "./types";

/**
 * Half of the third decimal these statements print units at.
 *
 * Not a tolerance widened until the figures fit: the reader itself walks the
 * running balance at exactly this bound, so a split that reached the book has
 * already been held to it against the statement's own printed closing.
 */
export const UNIT_EPS = 5e-4;

/** True where the entry carries every term the identity needs. */
export function hasSplit(m: ShareMovement): boolean {
  return m.opening != null && m.closing != null
    && m.unitsIn != null && m.unitsOut != null && m.corporateAction != null;
}

/**
 * WHAT THE COLUMNS ADD TO — units in, less units out, plus the corporate
 * action, and DELIBERATELY NOT the encumbrance count.
 *
 * A pledge moves units between the free and pledged balances of one account:
 * nothing enters and nothing leaves, so counting it here would report the
 * holding at twice its size. `encumbranceMoves` is a COUNT and is in no total,
 * which the suite asserts by showing that folding it in BREAKS the identity
 * below on this book's own windows.
 *
 * `null` where any term is absent, never 0 — a zero here reads as "nothing
 * moved in that window", which is a measurement, and a refused block has made
 * no measurement at all.
 */
export function movementNet(m: ShareMovement): number | null {
  if (!hasSplit(m)) return null;
  return (m.unitsIn ?? 0) - (m.unitsOut ?? 0) + (m.corporateAction ?? 0);
}

/**
 * opening + in − out + corporate action = closing.
 *
 * The check a reader performs by adding the printed columns, struck here so a
 * cell that stopped tying to its own row cannot render.
 */
export function movementIdentityHolds(m: ShareMovement): boolean {
  const net = movementNet(m);
  if (net == null) return false;
  return Math.abs((m.opening ?? 0) + net - (m.closing ?? 0)) <= UNIT_EPS;
}

/**
 * EVERY WINDOW FOR ONE SECURITY, newest opening first.
 *
 * The store is keyed `accountId|securityKey` — composed in `build-book.mjs` and
 * read here, so the page that renders these rows never re-derives the key. A
 * name held in three demat accounts has three windows and they are NOT summed:
 * each is one statement's own opening and closing, and adding two accounts'
 * balances would state a figure neither document prints.
 */
export function movementsFor(securityKey: string): ShareMovement[] {
  return Object.values(BOOK_SHARE_MOVEMENTS)
    .filter((m) => m.securityKey === securityKey)
    .sort((a, b) => (b.closing ?? 0) - (a.closing ?? 0) || a.accountId.localeCompare(b.accountId));
}

/**
 * THE ACCOUNTS WHOSE CUSTODIAN ISSUES A TRANSACTION STATEMENT AT ALL.
 *
 * Derived from the store rather than listed: a drop that brings another
 * custodian's tape widens this on its own, and a typed list would go stale
 * silently and make the note below claim an absence that is no longer true.
 */
export function movementAccounts(): Set<string> {
  return new Set(Object.values(BOOK_SHARE_MOVEMENTS).map((m) => m.accountId));
}

/**
 * ACCOUNTS THAT HOLD THIS NAME, ISSUE A TRANSACTION STATEMENT, AND PRINT NO
 * BLOCK FOR IT.
 *
 * A CDSL transaction statement prints an `ISIN:` block only for a security
 * whose balance carried at least one dated row in the window — measured on this
 * corpus rather than assumed: every one of the 89 blocks carries between 1 and
 * 28 rows and NONE carries zero, and the securities with no block do not appear
 * anywhere in the document. So an absent block is the statement saying this
 * holding did not move, and the reader is told that rather than shown nothing.
 *
 * It is worded as a fact about the DOCUMENT and not as an opening balance: this
 * book does not have one for these, and inventing `opening = closing` would put
 * a figure no statement printed into a column of figures every one of which was.
 */
export function unmovedAccountsFor(positions: Position[]): string[] {
  const issues = movementAccounts();
  const win = new Set(Object.values(BOOK_SHARE_MOVEMENTS).map((m) => `${m.accountId}|${m.securityKey}`));
  return [...new Set(positions
    .filter((p) => issues.has(p.accountId) && !win.has(`${p.accountId}|${p.securityKey}`))
    .map((p) => p.accountId))];
}
