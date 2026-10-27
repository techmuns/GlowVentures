// THE DEMAT A HOLDING'S UNITS SIT IN, under the account that holds them
// (Stage 10ic).
//
// "via own account" said whose decision a fund purchase was and not where the
// units are. `Account.demat` is the depository, DP ID and Client ID the
// account's own statements print — a depository's header, or the demat an
// AIF's statement says its units are credited to — and this draws it on the
// row, with the holder: the owner of the book's own account for that demat
// where the book reads one, else the row's own owner. Where no statement read
// for the account prints a demat, the cell says so with the reason, never a
// guessed one.
import type { Account } from "@/lib/types";
import type { AccountIndex } from "@/lib/accounts";
import { AbsentCell } from "@/components/Absent";
import { ownerDisplayName } from "@/lib/owners";
import { fmtDate } from "@/lib/format";

const ownerName = (a: Account | undefined) => (a ? (a.ownerId ? ownerDisplayName(a.ownerId) : a.owner) : null);

export function DematLine({ account, accIdx, showAbsent }: {
  account: Account | undefined;
  accIdx: AccountIndex;
  /** Draw the dash where no statement names a demat — off for a manager's mandate, whose reports never print one. */
  showAbsent: boolean;
}) {
  const record = account?.demat;
  if (!account || !record) return null;
  // `w-0 min-w-full`: the line takes the column's width rather than setting it,
  // so a long DP and Client ID wraps instead of pushing the figures sideways.
  if (!record.printed) {
    if (!showAbsent) return null;
    return (
      <div className="w-0 min-w-full text-[10px] text-slate-600" data-demat="none">
        A/c <span className="mono">{account.accountNo}</span>{" · "}Demat{" "}
        <AbsentCell reason={`No demat is named for these units: ${record.reason}, and records them under ${account.provider} ${account.accountNo} itself.`} />
      </div>
    );
  }
  const d = record.printed;
  const book = d.accountId ? accIdx.get(d.accountId) : undefined;
  const holder = ownerName(book) ?? ownerName(account) ?? "holder not named";
  const ownStatement = d.accountId === account.accountId;
  const printedBy = ownStatement
    ? `the depository statement of ${d.asOf ? fmtDate(d.asOf) : "an undated issue"}`
    : `${account.provider}'s statement of ${d.asOf ? fmtDate(d.asOf) : "an undated issue"}, which credits these units to it`;
  const sameAs = book && !ownStatement ? ` — the same demat as ${book.provider} ${book.accountNo}, whose own statement this book reads` : "";
  const bo = d.depository === "CDSL" ? ` (BO ID ${d.dpId}${d.clientId})` : "";
  return (
    <div className="w-0 min-w-full text-[10px] text-slate-500" data-demat={`${d.depository} ${d.dpId} ${d.clientId}`} data-demat-holder={holder}
      title={`${holder}'s ${d.depository} demat${d.participant ? ` at ${d.participant}` : ""}: DP ID ${d.dpId}, Client ID ${d.clientId}${bo}, as ${printedBy}${sameAs}.`}>
      <div>
        <span className="whitespace-nowrap">{d.depository} demat</span>{" · "}
        <span className="whitespace-nowrap">DP ID <span className="mono">{d.dpId}</span></span>{" · "}
        <span className="whitespace-nowrap">Client ID <span className="mono">{d.clientId}</span></span>
      </div>
      <div className="text-slate-600">{d.participant ? `${d.participant} · ` : ""}{holder}</div>
    </div>
  );
}
