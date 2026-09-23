/**
 * OPENING, PLUS, MINUS, CLOSING — the family's own table.
 *
 * *"if I'm holding a certain stock, then if I click on it, I should be able to
 * see that beginning of the year, this was my quantity, sold so much in the
 * year, this is the quantity remaining… more like an opening balance, plus
 * minus, closing balance. In a simple table format."*
 *
 * Every figure here is READ, not derived. The depository statements print, per
 * ISIN, an `Opening Balance`, a run of dated rows each carrying a running
 * balance, and a `Closing Balance` — and `providers/motilalDemat.mjs` publishes
 * the split only where the rows it read walk the first printed figure to the
 * second. A block that does not walk carries `null` and its own reason, and
 * renders as an absence rather than as a year in which nothing moved.
 *
 * ALL SIX COLUMNS RENDER ON EVERY NAME, INCLUDING WHERE THEY ARE ZERO. Drawing
 * the corporate-action column only where one fired would make the four printed
 * figures stop adding across on the names that have one, and a zero in it is a
 * measurement — no bonus, split, merger or scheme redemption touched this
 * holding. The same for a pledge, which on a family book is the figure a reader
 * acts on: these CDSL statements DO print the encumbrance rows, so a zero here
 * is measured and not the absence of a column (contrast the NSDL statement on
 * `/polycab`, which has no encumbrance column at all and renders a dash).
 *
 * WHAT THIS TABLE IS NOT: a trade history. A depository movement carries units
 * and no price, no counterparty and no consideration (`precedence.mjs`), so
 * nothing here is a buy or a sell and no amount is shown. The Transaction
 * history card below is the tape; this is the quantity account.
 */
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell } from "@/components/Absent";
import { fmtNum, fmtDate, DASH } from "@/lib/format";
import { movementIdentityHolds } from "@/lib/shareMovements";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { ownerDisplayName } from "@/lib/owners";
import type { Account, ShareMovement } from "@/lib/types";

/** The three decimals these statements print units at, reproduced. */
const qty = (n: number | null | undefined) => (n == null ? DASH : fmtNum(n, 3));
/**
 * The same figure in a SENTENCE. Shares print as whole numbers and a fund's
 * units keep the three decimals their statement prints — `16,300.000` in prose
 * is a table's precision leaking into a sentence.
 */
const units = (n: number | null | undefined) => (n == null ? DASH : Number.isInteger(n) ? fmtNum(n) : fmtNum(n, 3));

const NO_SPLIT = "this holding's dated rows do not walk its own printed opening balance to its own printed closing balance, so no in/out split is published for it — the two balances above are still the statement's own";

/** A movement column. A zero is MEASURED: the window really carried no such row. */
function Move({ v, sign, zero, why }: { v: number | null; sign?: "+" | "−"; zero: string; why?: string | null }) {
  // THE READER'S OWN REASON WHERE IT HAS ONE. `movementsReason` names the
  // balance these rows walked to and the closing the statement printed, which
  // sends the next person to the line of the document that disagrees. The
  // constant is the fallback, not the answer.
  if (v == null) return <AbsentCell reason={why || NO_SPLIT} />;
  if (v === 0) return <span className="text-slate-500" title={zero}>0</span>;
  return <span className="mono text-slate-100">{sign}{qty(v)}</span>;
}

const Z_IN = "A measured zero: no credit reached this holding in this window.";
const Z_OUT = "A measured zero: nothing left this holding in this window.";
const Z_CA = "A measured zero: no bonus, split, merger or scheme redemption touched this holding in this window.";
const Z_PLEDGE = "A measured zero: this statement prints the encumbrance rows — a pledge, an unpledge, an early pay-in earmark — and none of them touched this holding in this window.";
const T_CA = "The security itself changing — a bonus, a split, a merger, a scheme redeeming its units. Not a decision anybody made, which is why it is its own column rather than a purchase or a sale.";
const T_PLEDGE = "A pledge, an unpledge or an early pay-in earmark moves units between this account's free and encumbered balances. Nothing enters or leaves the account, so these are COUNTED and are in no column to the left — folding them in would report the holding at twice its size.";

/** The columns, in the order this table's rows write their cells. */
const QTY_COLS = ["account", "opening", "in", "out", "ca", "closing", "pledge"] as const;

/**
 * ── AN ACCOUNT THAT HOLDS NONE OF IT STILL HAS A WINDOW, AND IT SAYS SO ─────
 *
 *   "According to the client, Kaynes … is also a holding of the family entity
 *    Ajay's account."
 *
 * Ajay's main demat printed a Kaynes block — 16,300 shares on 1 April, nil on
 * 31 July — and that block reached no page, because it was filed under a key
 * nothing else carried (see `shareMovementsFrom` in `build-book.mjs`). It lands
 * on this page now, beside the accounts that DO hold the name, and a row whose
 * account carries no position here must not read like one of them: a nil
 * closing is a sale, and a closing with no position is a holding this book
 * cannot value because that account's only statement prints units and no rate.
 * Both are stated on the row rather than left for the reader to infer from the
 * Position table above not listing the account.
 */
export function notHeldNote(m: ShareMovement, account: Account | undefined): { label: string; why: string } {
  if ((m.closing ?? 0) === 0) {
    return {
      label: "Sold out in this window",
      why: `This account held ${units(m.opening)} at the window's opening and none at its close, so it is not a holding on this page. The dated rows are on its own depository statement.`,
    };
  }
  return {
    label: "Held, and not valued here",
    why: account?.noPositionsReason
      ?? "This account's statement prints the units and no rate, so the book carries no value for them and they are not in the holdings above.",
  };
}

export function QuantityMovement(
  { movements: raw, unmoved, accounts, held }: {
    movements: ShareMovement[]; unmoved: string[]; accounts: Account[];
    /** The accounts holding a POSITION of this security — a window in any other is marked. */
    held?: ReadonlySet<string>;
  },
) {
  const view = useTableView("quantity-movement", QTY_COLS);
  const accIdx = new Map(accounts.map((a) => [a.accountId, a]));
  const movements = sortRows(raw, view.sort, {
    account: (m) => {
      const a = accIdx.get(m.accountId);
      return a ? (a.ownerId ? ownerDisplayName(a.ownerId) : a.owner) : m.accountId;
    },
    opening: (m) => m.opening,
    in: (m) => m.unitsIn,
    out: (m) => m.unitsOut,
    ca: (m) => m.corporateAction,
    closing: (m) => m.closing,
    pledge: (m) => m.encumbranceMoves,
  });
  if (!movements.length && !unmoved.length) return null;
  const acctLabel = (id: string) => {
    const a = accIdx.get(id);
    return a ? `${a.ownerId ? ownerDisplayName(a.ownerId) : a.owner} · ${a.provider} ${a.accountNo}` : id;
  };
  // The period is a fact about the STATEMENT, so it is read off the rows rather
  // than asserted, and named only where every row agrees on one.
  const froms = [...new Set(movements.map((m) => m.periodFrom).filter(Boolean))];
  const tos = [...new Set(movements.map((m) => m.periodTo).filter(Boolean))];
  const window = froms.length === 1 && tos.length === 1
    ? <>{fmtDate(froms[0]!)} → {fmtDate(tos[0]!)}</> : null;

  // A TOTAL ACROSS ACCOUNTS IS THE FAMILY'S OWN QUESTION — units of one
  // security add, whichever demat holds them — and it is published only where
  // EVERY row carries a split. One refused block makes the in/out columns cover
  // a narrower set than the balances, and a total struck over the two would
  // then be a figure no statement supports (`sumOrNull`'s rule, one table over).
  const allTie = movements.every(movementIdentityHolds);
  const rowCount = movements.reduce((t, m) => t + (m.rows ?? 0), 0);
  const unclassifiedRows = movements.reduce((t, m) => t + (m.unclassified ?? 0), 0);
  const tot = (f: (m: ShareMovement) => number | null) => movements.reduce((t, m) => t + (f(m) ?? 0), 0);

  return (
    <Card className="mt-5" pad={false}
      title="Quantity through the year"
      subtitle={movements.length
        ? "Opening, in, out and closing — as the depository statement prints them"
        : "What this holding's depository statement says about its quantity"}
      right={window ? <Pill>{window}</Pill> : undefined}>
      {movements.length > 0 && (
      <div className="overflow-x-auto">
        <table className="min-w-full whitespace-nowrap text-sm" data-qty-movement>
          <thead className="border-b border-ink-700">
            <Tr view={view}>
              <SortHeader col="account" view={view} align="left">Account</SortHeader>
              <SortHeader col="opening" view={view}>Opening</SortHeader>
              <SortHeader col="in" view={view}>Units in</SortHeader>
              <SortHeader col="out" view={view}>Units out</SortHeader>
              <SortHeader col="ca" view={view} title={T_CA}>Corporate action</SortHeader>
              <SortHeader col="closing" view={view}>Closing</SortHeader>
              <SortHeader col="pledge" view={view} title={T_PLEDGE}>Pledge &amp; lock-in</SortHeader>
            </Tr>
          </thead>
          <tbody className="divide-y divide-ink-700/60">
            {movements.map((m) => {
              const acc = accIdx.get(m.accountId);
              /* The identity the reader already enforced, re-struck on what is
                 about to be printed: a row whose own columns stop adding across
                 must not render as though they do. */
              const ties = movementIdentityHolds(m);
              return (
                <Tr view={view} key={`${m.accountId}|${m.securityKey}`} data-qty-row data-qty-account={m.accountId}
                    data-qty-ties={ties ? "1" : "0"}
                    /* THE STATEMENT'S OWN NAME AND ITS ISIN — the evidence for
                       the join, and routinely a different spelling from this
                       page's title, because a depository clips a name to its
                       column width. */
                    title={[m.security, m.isin].filter(Boolean).join(" · ") || undefined}>
                  <td className="px-4 py-2">
                    <div className="text-slate-200">{acc ? (acc.ownerId ? ownerDisplayName(acc.ownerId) : acc.owner) : m.accountId}</div>
                    <div className="text-[11px] text-slate-500">{acc ? `${acc.provider} · ${acc.accountNo}` : DASH}</div>
                    {held && !held.has(m.accountId) && (() => {
                      const n = notHeldNote(m, acc);
                      return (
                        <div className="text-[11px] text-amber-400/90" data-qty-not-held={(m.closing ?? 0) === 0 ? "sold-out" : "unvalued"} title={n.why}>
                          {n.label}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 text-right mono text-slate-100" data-qty-opening={m.opening ?? ""}>{qty(m.opening)}</td>
                  <td className="px-4 py-2 text-right"><Move v={ties ? m.unitsIn : null} sign="+" zero={Z_IN} why={m.reason} /></td>
                  <td className="px-4 py-2 text-right"><Move v={ties ? m.unitsOut : null} sign="−" zero={Z_OUT} why={m.reason} /></td>
                  <td className="px-4 py-2 text-right">
                    {!ties ? <Move v={null} zero={Z_CA} why={m.reason} />
                      : m.corporateAction === 0 ? <span className="text-slate-500" title={Z_CA}>0</span>
                      : <span className="mono text-slate-100" title={T_CA}>{m.corporateAction! > 0 ? "+" : "−"}{qty(Math.abs(m.corporateAction!))}</span>}
                  </td>
                  <td className="px-4 py-2 text-right mono text-slate-100" data-qty-closing={m.closing ?? ""}>{qty(m.closing)}</td>
                  <td className="px-4 py-2 text-right">
                    {(m.encumbranceMoves ?? 0) === 0
                      ? <span className="text-slate-500" title={Z_PLEDGE}>0</span>
                      : <span className="mono text-amber-300/90" title={T_PLEDGE}>{m.encumbranceMoves}</span>}
                  </td>
                </Tr>
              );
            })}
          </tbody>
          {movements.length > 1 && (
            <tfoot className="border-t border-ink-700 bg-ink-800/40">
              <tr data-qty-total>
                <td className="px-4 py-2 text-slate-300">Total · {movements.length} accounts</td>
                <td className="px-4 py-2 text-right mono text-slate-100">{qty(tot((m) => m.opening))}</td>
                <td className="px-4 py-2 text-right">{allTie ? <Move v={tot((m) => m.unitsIn)} sign="+" zero={Z_IN} /> : <AbsentCell reason={`a holding in ${movements.filter((m) => !movementIdentityHolds(m)).length} of these accounts publishes no in/out split, so a total over the rest would cover fewer accounts than the balances beside it`} />}</td>
                <td className="px-4 py-2 text-right">{allTie ? <Move v={tot((m) => m.unitsOut)} sign="−" zero={Z_OUT} /> : <AbsentCell reason={`a holding in ${movements.filter((m) => !movementIdentityHolds(m)).length} of these accounts publishes no in/out split, so a total over the rest would cover fewer accounts than the balances beside it`} />}</td>
                <td className="px-4 py-2 text-right">
                  {!allTie ? <AbsentCell reason="see the in/out columns" />
                    : tot((m) => m.corporateAction) === 0 ? <span className="text-slate-500" title={Z_CA}>0</span>
                    : <span className="mono text-slate-100" title={T_CA}>{tot((m) => m.corporateAction) > 0 ? "+" : "−"}{qty(Math.abs(tot((m) => m.corporateAction)))}</span>}
                </td>
                <td className="px-4 py-2 text-right mono text-slate-100">{qty(tot((m) => m.closing))}</td>
                <td className="px-4 py-2 text-right mono text-slate-400">{tot((m) => m.encumbranceMoves) || <span className="text-slate-500" title={Z_PLEDGE}>0</span>}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
      {/* ONE SHORT LINE UNDER THE TABLE, and the sentences that stood here are
          its hovers. *"no one is reading these kind of … notes that you have put
          in across tables."* Three paragraphs said: the identity the rows obey
          and that a pledge is in none of its columns; that a holding with no
          dated block was untouched; and that these are depository movements
          rather than trades. Each is still on the page, on the words it
          explains — weaker than a caption, and recorded as such. */}
      <div className="border-t border-ink-700/60 px-4 py-2 text-[11px] text-slate-500">
        {movements.length > 0 && (
          <span data-qty-identity title={[
            "These are the statement's own printed balances with its own dated rows between them, and a holding whose rows do not reproduce its printed closing carries no split at all.",
            "A pledge, unpledge or early pay-in earmark is counted and is in none of these columns — it shifts units between this account's free and encumbered balances without any leaving it.",
            `The figures come from ${rowCount} dated ${rowCount === 1 ? "row" : "rows"} the statement prints between the two balances.`,
            // A ROW MATCHING NO KNOWN PARTICULAR still counts, by its own balance
            // change — which is a weaker basis than a named event and must say
            // so. Zero on this corpus, and the sentence is what would speak up
            // on the drop that brings a particular this reader has never seen.
            unclassifiedRows > 0
              ? `${unclassifiedRows} of ${rowCount === 1 ? "it" : "them"} match no particular this reader knows, so ${unclassifiedRows === 1 ? "its" : "their"} direction came from the balance's own change rather than from a named event — the units are the statement's, the classification is not.`
              : "",
          ].filter(Boolean).join(" ")}>
            Opening + units in − units out + corporate action = closing
          </span>
        )}
        {movements.length > 0 && " · "}
        {/* WHAT THIS IS NOT. Without it a reader takes "units in" for a
            purchase, and a depository movement names no price, no
            counterparty and no consideration. */}
        <span data-qty-not-trades
          title="A demat credit or debit carries units and nothing else, so no price, amount or gain is shown here. Only the accounts whose custodian issues a transaction statement appear.">
          depository movements, not trades
        </span>
        {/* A HOLDING WITH NO BLOCK IS THE STATEMENT SAYING IT DID NOT MOVE, and
            a reader who is shown nothing cannot tell that from a gap. No
            opening balance is invented for it: every figure in the table above
            is one the document printed, and `opening = closing` is not. */}
        {unmoved.length > 0 && (
          <div className="mt-1" data-qty-unmoved
            title={`These statements carry a block only for a security whose balance changed in the window, so this holding was untouched through it.${movements.length > 0 ? " No opening balance is shown for those: every figure above is one the document printed, and one it did not would not be." : " No opening balance is shown for it, because this book does not have one — the statement printed none."}`}>
            {unmoved.map(acctLabel).join("; ")} · its transaction statement prints no dated block for it — untouched
          </div>
        )}
      </div>
    </Card>
  );
}

