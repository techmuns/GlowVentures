import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Landmark, HandCoins, FileWarning, Users, Layers } from "lucide-react";
import { Card } from "@/components/Card";
import { Kpi } from "@/components/Kpi";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { AbsentCell } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  REGISTER_SOURCE, REGISTER_SUMMARY, REGISTER_SHEETS, REGISTER_OWNERS,
  REGISTER_NOT_IN_BOOK, REGISTER_IN_BOOK_ACCOUNT, REGISTER_IN_BOOK_POSITION,
  REGISTER_EXITED, REGISTER_COST_CANDIDATES,
} from "@/data/registerData";
import type { RegisterLine } from "@/lib/types";

/**
 * THE FAMILY'S OWN INVESTMENT REGISTER, ON ITS OWN PAGE.
 *
 * `source/august-2026-f/NEW INVESTMENT SHEET.xlsx` is the family's record of what
 * they PAID for every direct and private investment. It reads perfectly and it is
 * NOT a source for the book: no institution struck it, so folding it in would end
 * the guarantee that every figure traces to the statement of the institution that
 * did. `lib/classify.mjs` labels it `Family investment register (not a statement)`
 * and no extractor can reach it.
 *
 * This page is the same construction as `/polycab`: it reads `registerData.ts`
 * DIRECTLY rather than through `PortfolioContext`, so nothing on it can leak into
 * a portfolio total, an allocation, a sector split or a NAV. `usePortfolio` is
 * used for ONE thing — the display-currency formatter — and never for a figure.
 *
 * ── THE ONE DISTINCTION THE WHOLE PAGE TURNS ON ─────────────────────────────
 *
 * The register is a CASH-OUTFLOW record. `INVESTMENT AMOUNT` is money that left a
 * bank account on a date; `CURRENT VALUATION` is empty on every row. So it can
 * speak to INVESTED CAPITAL, which is a cost, and it cannot move NAV by a rupee —
 * a NAV gap closes with a holding statement, never with a payment record.
 *
 * ── AND THE GROSS IS NOT ADDITIVE TO THE BOOK ───────────────────────────────
 *
 * Roughly half of it is mandates and positions the book already carries in full.
 * That is why the page leads with the PARTITION rather than the total, and why
 * the two halves are never shown as one sum. `partitionAgainstBook` in
 * `scripts/lib/registerRead.mjs` does the split and
 * `docs/REGISTER-RECONCILIATION.md` reports the same one — one definition, two
 * consumers, so this page and that report cannot state different figures about
 * one workbook.
 */
export function Register() {
  const { fmtFromBase } = usePortfolio();
  const s = REGISTER_SUMMARY;
  const [q, setQ] = useState("");

  const money = (n: number | null | undefined) => fmtFromBase(n, { compact: true });

  const filter = (rows: RegisterLine[]) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(needle)
      || r.owners.some((o) => o.toLowerCase().includes(needle))
      || (r.heldAs ?? "").toLowerCase().includes(needle));
  };

  const notInBook = useMemo(() => filter(REGISTER_NOT_IN_BOOK), [q]);
  const inAccount = useMemo(() => filter(REGISTER_IN_BOOK_ACCOUNT), [q]);
  const inPosition = useMemo(() => filter(REGISTER_IN_BOOK_POSITION), [q]);
  const exited = useMemo(() => filter(REGISTER_EXITED), [q]);

  const inBookPaid = s.inBookAsAccount + s.inBookAsPosition;
  const inBookNames = s.namesInBookAsAccount + s.namesInBookAsPosition;

  return (
    <div className="space-y-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="label-xs text-champagne-500">Family record</span>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">Investment Register</h1>
          <Pill tone="warn">Cost record · not a valuation</Pill>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Filter by investment, entity or where it is held…" />
      </div>

      {/* THE BANNER IS THE POINT OF THE PAGE, so it is not a tooltip. */}
      <Card>
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            <span className="font-semibold text-slate-100">Every figure on this page is money the family PAID</span>{" "}
            — a cash outflow on a date, taken from their own workbook. It is not a statement, no
            institution struck it, and it is deliberately no part of the book: the current value of holdings,
            allocations, sectors and returns are all computed without it and none of them moves by a
            rupee because of anything here.
          </p>
          <p>
            The workbook's own <span className="font-mono text-xs">CURRENT VALUATION</span> column is
            empty on <span className="font-semibold text-slate-100">{s.tranches - s.rowsWithCurrentValuation} of its {s.tranches} rows</span>,
            so it can say what was paid and cannot say what anything is worth today.
          </p>
        </div>
      </Card>

      {/* ── the partition, which is what stops this being double counted ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Paid in, gross"
          value={money(s.grossPaid)}
          sub={`${s.tranches} tranches · ${s.names} investments · ${s.sheets} sheets`}
          icon={<Wallet size={15} />}
        />
        <Kpi
          label="Already in the book"
          value={money(inBookPaid)}
          sub={`${inBookNames} names · counted once, in the book's own totals`}
          icon={<Landmark size={15} />}
        />
        <Kpi
          label="Not in the book"
          value={money(s.notInBook)}
          sub={`${s.namesNotInBook} names no statement reports · a COST, not a value`}
          icon={<FileWarning size={15} />}
        />
        <Kpi
          label="Returned or written off"
          value={money(s.loansRepaid + s.writtenOff)}
          sub={`${money(s.loansRepaid)} loans repaid · ${money(s.writtenOff)} written off`}
          icon={<HandCoins size={15} />}
        />
      </div>

      <Card
        title="Why the gross is not added to anything"
        subtitle="The four figures above partition the register. They are shown apart because adding them to the book would count the first bucket twice."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left label-xs text-slate-400">
                <th className="py-2 pr-4">Bucket</th>
                <th className="py-2 pr-4 text-right">Names</th>
                <th className="py-2 pr-4 text-right">Paid in</th>
                <th className="py-2">What it means for the dashboard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              <tr>
                <td className="py-2 pr-4 text-slate-200">Held as a managed account</td>
                <td className="py-2 pr-4 text-right tabular-nums">{s.namesInBookAsAccount}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(s.inBookAsAccount)}</td>
                <td className="py-2 text-slate-400">Already in NAV at the manager's own mark. Adding this would double count.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-slate-200">Held as a position</td>
                <td className="py-2 pr-4 text-right tabular-nums">{s.namesInBookAsPosition}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(s.inBookAsPosition)}</td>
                <td className="py-2 text-slate-400">Already in NAV at a statement mark. Adding this would double count.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-slate-200">No counterpart in the book</td>
                <td className="py-2 pr-4 text-right tabular-nums">{s.namesNotInBook}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(s.notInBook)}</td>
                <td className="py-2 text-slate-400">Real money, invisible to the book. What it is worth today needs a statement.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-slate-200">Written off or exited</td>
                <td className="py-2 pr-4 text-right tabular-nums">{s.namesExited}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(s.writtenOff)}</td>
                <td className="py-2 text-slate-400">Gone. Never part of live invested capital.</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700 font-semibold">
                <td className="py-2 pr-4">Total paid, since 2017</td>
                <td className="py-2 pr-4 text-right tabular-nums">{s.names}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(s.grossPaid)}</td>
                <td className="py-2 text-xs font-normal text-slate-400">
                  Summing the workbook's amount column blind reads {money(s.blindSum)} — it repeats each
                  multi-tranche investment as its own subtotal row, and one of those does not say “TOTAL”.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── the money the book cannot see ── */}
      <Card
        title={`Not in the book — ${notInBook.length === s.namesNotInBook ? notInBook.length : `${notInBook.length} of ${s.namesNotInBook}`} investments`}
        subtitle="The family paid for these and no statement in the corpus reports them. The figure is what was paid; what they are worth today is on a document nobody has sent."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-table="register-not-in-book">
            <thead>
              <tr className="border-b border-slate-800 text-left label-xs text-slate-400">
                <th className="py-2 pr-4">Investment</th>
                <th className="py-2 pr-4">Entity, as the register types it</th>
                <th className="py-2 pr-4">Sheet</th>
                <th className="py-2 pr-4 text-right">Tranches</th>
                <th className="py-2 text-right">Paid in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {notInBook.map((r) => (
                <tr key={r.name} data-row="register-line">
                  <td className="py-2 pr-4 text-slate-200">{r.name}</td>
                  <td className="py-2 pr-4 text-slate-400">{r.owners.join(", ") || "—"}</td>
                  <td className="py-2 pr-4 text-xs text-slate-500">{r.sheets.join(", ")}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-400">{r.tranches}</td>
                  <td className="py-2 text-right tabular-nums text-slate-200">{money(r.paid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700 font-semibold">
                <td className="py-2 pr-4" colSpan={4}>
                  Total · {notInBook.length} {notInBook.length === 1 ? "investment" : "investments"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {money(notInBook.reduce((t, r) => t + r.paid, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── the one place the register could fill a real hole in the book ── */}
      <Card
        title={`Could supply a cost — ${s.costlessCovered} of the book's ${s.costlessPositions} costless positions`}
        subtitle="A depository holds the shares and did not buy them, so it reports no cost. These are the holdings where the family's own record states what was paid."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-table="register-cost-candidates">
            <thead>
              <tr className="border-b border-slate-800 text-left label-xs text-slate-400">
                <th className="py-2 pr-4">Holding</th>
                <th className="py-2 pr-4">Custodian</th>
                <th className="py-2 pr-4 text-right">Book market value</th>
                <th className="py-2 pr-4 text-right">Register says paid</th>
                <th className="py-2 text-right">Posted as cost?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {REGISTER_COST_CANDIDATES.map((c) => (
                <tr key={c.securityKey} data-row="cost-candidate">
                  <td className="py-2 pr-4 text-slate-200">
                    <Link className="hover:text-champagne-400" to={`/stock/${c.securityKey}`}>{c.security}</Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-400">{c.custodian ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-200">{money(c.marketValue)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-200">{money(c.paid)}</td>
                  <td className="py-2 text-right">
                    {/* Not a value the book carries, and the reason is required. */}
                    <AbsentCell reason="Not posted. A paid figure becomes a cost basis only once the quantities tie, the entity resolves to an account, and it is shown not to double-count a cost a mandate already reports — the rule costFor applies to LKP's opening ledger." />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          The other <span className="font-semibold text-slate-300">{s.costlessPositions - s.costlessCovered}</span> costless
          positions — {money(s.costlessMarketValue)} of market value in total — are in no document in this
          corpus at all. Their cost needs a contract note or transaction statement from the custodian,
          not another register.
        </p>
      </Card>

      {/* ── the blocker nobody would otherwise see ── */}
      <Card
        title="Whose money is it?"
        subtitle="Before any of the above can post a cost, the entity has to resolve to an account in the book. On this register it mostly does not."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-table="register-owners">
            <thead>
              <tr className="border-b border-slate-800 text-left label-xs text-slate-400">
                <th className="py-2 pr-4">
                  <span className="font-mono">INVESTMENT DONE UNDER</span>, verbatim
                </th>
                <th className="py-2 pr-4">Resolves to</th>
                <th className="py-2 text-right">Paid in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {REGISTER_OWNERS.map((o) => {
                const resolved = /trust\s*[23]$/i.test(o.owner);
                return (
                  <tr key={o.owner}>
                    <td className="py-2 pr-4 text-slate-200">{o.owner}</td>
                    <td className="py-2 pr-4">
                      {resolved
                        ? <span className="text-slate-400">a family entity in the book</span>
                        : <Pill tone="warn">nothing</Pill>}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-200">{money(o.paid)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-slate-400">
          <Users size={14} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold text-slate-300">{money(s.paidUnderAnUnresolvedOwner)}</span> of the
            register is booked to a bare first name. Every alias in the owner registry carries a
            surname, so these match nothing — and a cost posted against the wrong member moves two
            per-entity totals at once. Four aliases would close it, and that is a decision for the
            family rather than a parsing rule: a bare “AJAY” is unambiguous only because this family
            happens to have one.
          </span>
        </p>
      </Card>

      {/* ── what is already counted, shown so it is never counted again ── */}
      <Card
        title={`Already in the book — ${inAccount.length + inPosition.length} of ${inBookNames} names`}
        subtitle="Listed so the overlap is visible rather than implied. Every one of these is already inside the current value of holdings at a statement mark; the paid figure beside it is history, not an addition."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-table="register-in-book">
            <thead>
              <tr className="border-b border-slate-800 text-left label-xs text-slate-400">
                <th className="py-2 pr-4">Investment</th>
                <th className="py-2 pr-4">The book carries it as</th>
                <th className="py-2 pr-4 text-right">Tranches</th>
                <th className="py-2 text-right">Paid in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {[...inAccount, ...inPosition].map((r) => (
                <tr key={`${r.name}-${r.heldAs}`} data-row="register-in-book">
                  <td className="py-2 pr-4 text-slate-200">{r.name}</td>
                  <td className="py-2 pr-4 text-slate-400">{r.heldAs}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-400">{r.tranches}</td>
                  <td className="py-2 text-right tabular-nums text-slate-200">{money(r.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {exited.length > 0 && (
        <Card
          title={`Written off and exited — ${exited.length} names`}
          subtitle="On the workbook's own WRITE OFF - EXIT sheet. Never part of live invested capital."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left label-xs text-slate-400">
                  <th className="py-2 pr-4">Investment</th>
                  <th className="py-2 pr-4">Entity</th>
                  <th className="py-2 text-right">Paid in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {exited.map((r) => (
                  <tr key={r.name}>
                    <td className="py-2 pr-4 text-slate-200">{r.name}</td>
                    <td className="py-2 pr-4 text-slate-400">{r.owners.join(", ") || "—"}</td>
                    <td className="py-2 text-right tabular-nums text-slate-200">{money(r.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Where this comes from" subtitle="Generated, never typed.">
        <div className="space-y-2 text-xs text-slate-400">
          <p className="flex items-start gap-2">
            <Layers size={14} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-mono text-slate-300">{REGISTER_SOURCE}</span> — {s.sheets} sheets,{" "}
              {s.tranches} tranche rows. Rebuilt with <span className="font-mono">npm run build-register</span>;
              the same partition is reported in <span className="font-mono">docs/REGISTER-RECONCILIATION.md</span>.
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {REGISTER_SHEETS.map((sh) => (
              <span key={sh.name}>
                <span className="text-slate-300">{sh.name}</span> {sh.tranches} rows · {money(sh.paid)}
                {sh.subtotalRowsSkipped > 0 && (
                  <span className="text-slate-500"> ({sh.subtotalRowsSkipped} subtotal rows skipped)</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
