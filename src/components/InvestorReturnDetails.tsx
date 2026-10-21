import { useMemo } from "react";
import { Card } from "./Card";
import { AbsentValue } from "./Absent";
import { fmtDate, fmtPct, changeColor } from "@/lib/format";
import { investorAnnualReturn, investorPeriodReturn } from "@/lib/investorSummary";
import type { Portfolio } from "@/lib/types";

/** Addressable counterpart of the dashboard tile, on the identical inputs. */
export function InvestorReturnDetails({ statement, kind, money }: {
  statement: Portfolio;
  kind: "annualised" | "fytd" | "ytd";
  money: (n: number | null | undefined, sign?: boolean) => string;
}) {
  const today = useMemo(() => new Date(), []);
  const annual = kind === "annualised" ? investorAnnualReturn(statement) : null;
  const period = kind !== "annualised" ? investorPeriodReturn(statement, today, kind) : null;
  const r = annual ?? period!;
  const title = kind === "annualised" ? "Annualised return"
    : kind === "fytd" ? "Return this financial year" : "Return this calendar year";
  const methodology = annual
    ? "XIRR over the recorded cash-flow window, which may start after inception. Only statement accounts with an opening value and dated cash flows are included; separately modelled private investments are excluded. At least one year of history is required."
    : "Money-weighted return for the whole portfolio, adjusted for dated deposits and withdrawals and not annualised. Every account needs an opening value at the period start and a complete cash-flow record through a matching closing valuation. Fully redeemed accounts include their recorded proceeds. Live prices cannot fill gaps in this history.";
  return (
    <section id="investor-return" data-investor-return={kind} className="mb-5 scroll-mt-5">
      <Card title={title} subtitle={methodology} right={<span className="text-xs text-slate-400">Statement history</span>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div data-investor-return-value className={`text-2xl font-bold tabular ${r.pct == null ? "text-slate-400" : changeColor(r.pct)}`}>
              {r.pct == null ? <AbsentValue /> : <>{fmtPct(r.pct, { sign: true, decimals: 1 })}{annual ? " p.a." : ""}</>}
            </div>
            {r.reason && <p className="mt-2 text-sm text-slate-300">
              <strong>{annual?.issueLabel ?? "Insufficient history"}</strong> · {r.reason}
            </p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-300">
            <dt>Period starts</dt><dd>{r.start ? fmtDate(r.start) : "Not available"}</dd>
            <dt>Latest eligible valuation</dt><dd>{r.end ? fmtDate(r.end) : "Not available"}</dd>
            <dt>Accounts with usable history</dt><dd>{r.covered} of {r.total}</dd>
            {annual && <><dt>Covered statement value</dt><dd>{money(annual.measuredValue)}</dd></>}
            {period?.gain != null && <><dt>Gain / loss for the period</dt><dd>{money(period.gain, true)}</dd></>}
          </dl>
        </div>
      </Card>
    </section>
  );
}
