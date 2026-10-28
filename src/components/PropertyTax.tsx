import type { ReactNode } from "react";
import { DASH, AbsentValue } from "@/components/Absent";
import { ExportableTable } from "@/components/ExportableTable";
import { ReturnCalculationInfo } from "@/components/ReturnCalculation";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate, fmtPct } from "@/lib/format";
import { indexYear, LONG_TERM_RATE, INDEXED_RATE, CESS, type PropertyGainsTax } from "@/lib/realEstate";

type Money = ReturnType<typeof usePortfolio>["fmtFromBase"];
const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;
const sharePct = (share: number) => `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(share * 100)}%`;
// What every tax figure on the page is, and what it leaves out — the hover on each.
export const TAX_RULES = `If sold today at the current value. Held more than 2 years: ${pct(LONG_TERM_RATE)} of the gain. Bought before 23 Jul 2024 by a resident individual or HUF: ${pct(INDEXED_RATE)} of the gain after indexation, where that is lower. Plus ${pct(CESS)} cess. Held 2 years or less: the owner's slab rate, not shown. An inherited or gifted property takes the previous owner's cost and dates. Not included: surcharge, selling costs, renovation or extension costs, and reinvestment exemptions.`;
const date = (iso: string | null) => iso ? fmtDate(iso) : DASH;

/** The working behind the 20% route: the cost scaled by the Cost Inflation Index, for the whole property or a share of it. */
export function indexWorking(t: PropertyGainsTax, money: Money, share?: number) {
  if (!t.indexable) return "Bought on or after 23 Jul 2024, so there is no indexation.";
  if (t.indexedCost === null || t.acquiredOn === null || t.cost === null) return t.indexGap;
  return `${t.costLabel} ${money(t.cost * (share ?? 1))} × CII ${t.saleIndex} (FY ${t.fy}) ÷ CII ${t.acquisitionIndex} (FY ${indexYear(t.acquiredOn)}) = ${money(t.indexedCost * (share ?? 1))}${share === undefined ? " for the whole property" : ""}`;
}

/** The tax on one property's sale as a short sum, for the share the table shows. Each rupee figure adds up to the one in the cell. */
function TaxSteps({ t, money, onEdit }: { t: PropertyGainsTax; money: Money; onEdit: () => void }) {
  const whose = t.owners.length > 1 || (t.owners.length === 1 && t.share !== 1) ? ` — ${t.owners.map(o => `${o.name || "Owner not entered"} ${sharePct(o.share)}`).join(", ")}` : "";
  const when = <p className="text-slate-400">If sold on {fmtDate(t.asOf)} at today's value (FY {t.fy}){whose}.</p>;
  const steps = (items: ReactNode[]) => <ol data-return-steps className="list-decimal space-y-3 pl-5">{items.map((s, i) => <li key={i}>{s}</li>)}</ol>;
  const rules = <details data-return-more>
    <summary className="ring-focus cursor-pointer rounded text-slate-300">The rules</summary>
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-300">
      <li>Gain = current value − cost. An inherited or gifted property takes the previous owner's cost and dates; one held since before 1 Apr 2001 may use its value on that date, where higher.</li>
      <li>Held 2 years or less: taxed at the owner's slab rate on their total income, which this page does not hold.</li>
      <li>Held more than 2 years: {pct(LONG_TERM_RATE)} of the gain.</li>
      <li>Bought before 23 Jul 2024 by a resident individual or HUF: {pct(INDEXED_RATE)} of the gain after indexation (cost × this year's Cost Inflation Index ÷ the purchase year's), where that is lower.</li>
      <li>Plus {pct(CESS)} cess. Rural agricultural land is not a capital asset, so it carries no tax.</li>
      <li>Not included: surcharge, selling costs, renovation or extension costs, and reinvestment exemptions.</li>
    </ul>
  </details>;
  if (t.notCapitalAsset) return <>{when}{steps([<>Rural agricultural land is not a capital asset, so its sale carries no capital gains tax: <strong>{money(0)}</strong>.</>])}{rules}</>;
  if (t.needs.length) return <>{when}{steps([<>The tax cannot be worked out yet. Still to enter: <strong>{t.needs.join(", ")}</strong>.</>,
    ...(t.received ? [<>An inherited or gifted property is taxed on what the previous owner paid and when they acquired it, not on its value when it was received.</>] : [])])}
    <button type="button" className="btn-primary" onClick={onEdit}>Enter details</button>{rules}</>;
  if (t.cost === null || t.gain === null || t.value === null || t.share === null) return <>{when}{steps([t.gap?.reason ?? "The tax cannot be worked out from this record."])}{rules}</>;
  const value = t.value, share = t.share, whole = t.cost + t.gain;
  const cost = t.costForTax ?? t.cost * share, gain = value - cost;
  const label = t.costLabel[0].toLowerCase() + t.costLabel.slice(1);
  const items: ReactNode[] = [
    <>Held since <strong>{date(t.acquiredOn)}</strong>{t.received ? ", when the previous owner acquired it" : ""}: {t.longTerm ? "more than 2 years, so the gain is long-term." : `2 years or less, so the gain is short-term. It becomes long-term on ${date(t.longTermFrom)}.`}</>,
    <>Current value <strong>{money(value)}</strong> − {t.route === "20% indexed" ? <>the indexed cost <strong>{money(cost)}</strong> ({indexWorking(t, money, share)})</>
      : t.route === "Mixed" ? <>the cost for tax <strong>{money(cost)}</strong>, indexed for the owners who pay {pct(INDEXED_RATE)}</> : <>the {label} <strong>{money(cost)}</strong></>} = taxable gain <strong>{money(gain, { sign: true })}</strong>.</>,
  ];
  // A gain taxed at one rate, as gain × rate, plus cess: whole rupees that add up to the tax shown.
  const sum = (g: number, rate: number, tax: number) => { const base = Math.round(Math.max(0, g) * rate); return <>{money(g)} × {pct(rate)} = {money(base)}, plus {pct(CESS)} cess {money(tax - base)} = <strong>{money(tax)}</strong></>; };
  if (t.route === "No gain") items.push(<>There is no gain, so there is no tax: <strong>{money(0)}</strong>.</>);
  else if (!t.longTerm) items.push(<>A short-term gain is taxed at the owner's slab rate on their total income, which this page does not hold, so the tax is not shown.</>);
  else {
    const flat = t.owners.reduce((s, o) => s + o.flatTax, 0);
    const indexed = t.owners.length && t.owners.every(o => o.indexedTax !== null) ? t.owners.reduce((s, o) => s + o.indexedTax!, 0) : null;
    const noIndex = [...new Set(t.owners.filter(o => o.eligible === false).map(o => o.holderNote))].join(" ") || t.indexGap;
    items.push(!t.indexable ? <>Bought on or after 23 Jul 2024, so the only rate is {pct(LONG_TERM_RATE)}.</>
      : <>Bought before 23 Jul 2024, so two rates are worked out and the lower is paid. {pct(LONG_TERM_RATE)} of the gain comes to <strong>{money(flat)}</strong>;
        {" "}{pct(INDEXED_RATE)} of the gain over the indexed cost{t.indexedCost === null ? "" : ` ${money(t.indexedCost * share)}`} comes to {indexed === null ? <>{DASH} ({noIndex})</> : <strong>{money(indexed)}</strong>}.</>);
    if (t.tax === null) items.push(<>{t.gap?.reason ?? "The tax cannot be worked out from this record."}</>);
    else if (t.route === "Mixed") items.push(<>Each owner is taxed on their own share, then the two are added:
      <ul className="mt-2 list-disc space-y-1 pl-5 tabular">{t.owners.map((o, i) => <li key={i}>{o.name || "Owner not entered"} ({sharePct(o.share)}): {sum(whole * o.share - o.costForTax!, o.route === "indexed" ? INDEXED_RATE : LONG_TERM_RATE, o.tax!)}</li>)}</ul>
      <span className="mt-2 block">Tax on sale: <strong>{money(t.tax)}</strong>.</span></>);
    else items.push(<span className="tabular">Tax: {sum(gain, t.route === "20% indexed" ? INDEXED_RATE : LONG_TERM_RATE, t.tax)}.</span>);
  }
  if (t.tax !== null && t.afterTax !== null) items.push(<span className="tabular">Value after tax: {money(value)} − {money(t.tax)} = <strong>{money(t.afterTax)}</strong>.</span>);
  return <>{when}{steps(items)}{rules}</>;
}

/** A tax figure in the table that opens its own working: the sum behind the tax on a sale, for the share shown. */
export function PropertyTaxInfo({ label, t, figure, trigger, onEdit }: { label: string; t: PropertyGainsTax; figure: "tax" | "afterTax"; trigger: ReactNode; onEdit: () => void }) {
  const { fmtFromBase: money } = usePortfolio();
  const n = t[figure], what = figure === "tax" ? "tax on a sale" : "value after tax";
  return <ReturnCalculationInfo label={label} intro={`How the ${what} is worked out`} value={n === null ? DASH : money(n)} trigger={trigger} triggerLabel={`How is the ${what} of ${label} worked out?`} wide>
    {close => <TaxSteps t={t} money={money} onEdit={() => { close(); onEdit(); }} />}
  </ReturnCalculationInfo>;
}

/** One property's tax if sold today, step by step, for every recorded owner. */
export function PropertyTaxDetails({ t, onEdit }: { t: PropertyGainsTax; onEdit: () => void }) {
  const { fmtFromBase: money } = usePortfolio();
  const gap = (reason: string, short: string) => <span title={reason}><AbsentValue /> <span className="text-xs text-slate-500">{short}</span></span>;
  const steps: [string, ReactNode, string?][] = t.cost === null ? [] : [
    ["Holding", t.longTerm ? `Long-term since ${date(t.longTermFrom)}` : `Short-term · long-term from ${date(t.longTermFrom)}`, `Counted from ${t.received ? "the previous owner's acquisition" : "the purchase"} on ${date(t.acquiredOn)}.`],
    [t.costLabel, money(t.cost), t.received ? "An inherited or gifted property carries the previous owner's cost." : undefined],
    ["Current value", money(t.cost + (t.gain ?? 0))],
    ["Gain", money(t.gain, { sign: true })],
    ...(t.indexable ? [
      ["Indexed cost", t.indexedCost === null ? gap(t.indexGap, "Not indexed") : money(t.indexedCost), indexWorking(t, money)],
      ["Gain after indexation", t.indexedGain === null ? gap(t.indexGap, "Not indexed") : money(t.indexedGain, { sign: true })],
    ] as [string, ReactNode, string?][] : []),
    ["Tax payable", t.tax === null ? gap(t.gap?.reason ?? "Not known", t.gap?.short ?? "Not known") : <>{money(t.tax)}{t.route && <span className="text-xs text-slate-500"> · {t.route}</span>}</>, t.tax === null ? undefined : TAX_RULES],
    ["Value after tax", t.afterTax === null ? gap(t.gap?.reason ?? "Not known", "Needs the tax") : money(t.afterTax), "Recorded owners' share of the current value, less the tax."],
  ];
  return <section className="mt-5 border-t border-ink-700 pt-4" data-property-tax>
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="h-section" title={TAX_RULES}>Tax if sold today</h3><span className="text-xs text-slate-400" title="The sale date this assumes, its financial year and that year's Cost Inflation Index">{fmtDate(t.asOf)} · FY {t.fy} · CII {t.saleIndex ?? "not notified"}</span></div>
    {t.notCapitalAsset ? <p className="text-sm text-slate-200" title="Rural agricultural land is not a capital asset, so selling it carries no capital gains tax.">{money(0)} · not a capital asset</p>
      : t.cost === null ? <p className="text-sm">{gap(t.gap?.reason ?? "Not known", t.gap?.short ?? "Not known")}{t.needs.length > 0 && <button type="button" className="ml-3 text-xs text-champagne-400 underline" onClick={onEdit}>Enter details</button>}</p> : <>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{steps.map(([label, value, hover]) => <div key={label}><dt className="label-xs">{label}</dt><dd className="mt-1 text-sm text-slate-200" title={hover}>{value}</dd></div>)}</dl>
      {t.owners.length > 0 && <div className="mt-4 overflow-x-auto" data-navigation-scroll="realestate-4"><ExportableTable exportName="Real Estate — Tax by owner" className="min-w-full text-[13px]" data-property-tax-owners data-table-static="one row per owner, each the working of the same sale's tax">
        <thead className="border-b border-ink-700 text-left"><tr className="label-xs">
          <th className="px-3 py-2">Owner</th><th className="px-3 py-2 text-right">Share</th><th className="px-3 py-2" title="Resident individuals and HUFs may take the 20%-with-indexation option, recorded from their own statements">Status</th>
          <th className="px-3 py-2 text-right">At {pct(LONG_TERM_RATE)}</th><th className="px-3 py-2 text-right">At {pct(INDEXED_RATE)} after indexation</th><th className="px-3 py-2 text-right">Tax payable</th>
        </tr></thead>
        <tbody>{t.owners.map((o, i) => {
          const shortTerm = !t.longTerm && o.route !== "none";
          const option = (n: number | null, indexed: boolean) => shortTerm ? gap("Short-term: taxed at the owner's slab rate.", "Short-term")
            : indexed && !t.indexable ? gap("Bought on or after 23 Jul 2024: 12.5% is the only rate.", "Not available")
            : indexed && o.eligible === false ? gap(o.holderNote, "Not available")
            : n === null ? gap(t.indexGap, "Not indexed") : money(n);
          return <tr key={i} className="border-b border-ink-700/50">
            <td className="px-3 py-2 text-slate-200">{o.name || "Owner not entered"}</td><td className="px-3 py-2 text-right mono">{fmtPct(o.share * 100)}</td>
            <td className="px-3 py-2 text-slate-300" title={o.holderNote}>{o.status}</td>
            <td className="px-3 py-2 text-right mono">{option(o.flatTax, false)}</td><td className="px-3 py-2 text-right mono">{option(o.indexedTax, true)}</td>
            <td className="px-3 py-2 text-right mono">{o.tax === null ? gap(o.gap?.reason ?? "Not known", o.gap?.short ?? "Not known") : <span title={o.note}>{money(o.tax)}</span>}</td>
          </tr>;
        })}</tbody>
      </ExportableTable></div>}
    </>}
  </section>;
}
