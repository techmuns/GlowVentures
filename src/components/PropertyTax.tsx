import type { ReactNode } from "react";
import { DASH, AbsentValue } from "@/components/Absent";
import { Card } from "@/components/Card";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { ExportableTable } from "@/components/ExportableTable";
import { EditColumns } from "@/components/EditColumns";
import { useTableView, sortRows, type Accessor } from "@/lib/tableView";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate, fmtPct } from "@/lib/format";
import { propertyLabel, indexYear, LONG_TERM_RATE, INDEXED_RATE, CESS, type Property, type PropertyGainsTax } from "@/lib/realEstate";

const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;
// What every tax figure on the page is, and what it leaves out — the hover on each.
export const TAX_RULES = `If sold today at the current value. Held more than 2 years: ${pct(LONG_TERM_RATE)} of the gain. Bought before 23 Jul 2024 by a resident individual or HUF: ${pct(INDEXED_RATE)} of the gain after indexation, where that is lower. Plus ${pct(CESS)} cess. Held 2 years or less: the owner's slab rate, not shown. An inherited or gifted property takes the previous owner's cost and dates. Not included: surcharge, selling costs, renovation or extension costs, and reinvestment exemptions.`;
const COLS = ["name", "holding", "costForTax", "value", "taxableGain", "rate", "tax", "afterTax"];
const LABELS: Record<string, string> = { name: "Property", holding: "Holding", costForTax: "Cost for tax", value: "Current value", taxableGain: "Taxable gain", rate: "Rate", tax: "Tax on sale", afterTax: "Value after tax" };
const MONEY = ["costForTax", "value", "taxableGain", "tax", "afterTax"] as const;
type Money = typeof MONEY[number];
const sub = (text: string) => <span data-export-ignore className="mt-1 block whitespace-normal font-sans text-[10px] text-slate-500">{text}</span>;
const date = (iso: string | null) => iso ? fmtDate(iso) : DASH;

/** The working behind the 20% route: the cost scaled by the Cost Inflation Index. */
export function indexWorking(t: PropertyGainsTax, money: (n: number | null) => string) {
  if (!t.indexable) return "Bought on or after 23 Jul 2024, so there is no indexation.";
  if (t.indexedCost === null || t.acquiredOn === null) return t.indexGap;
  return `${t.costLabel} ${money(t.cost)} × CII ${t.saleIndex} (FY ${t.fy}) ÷ CII ${t.acquisitionIndex} (FY ${indexYear(t.acquiredOn)}) = ${money(t.indexedCost)} for the whole property.`;
}
/** Rate as the tax table shows it: the settled rate, "Slab rate" for a short-term gain, or nothing. */
const rateOf = (t: PropertyGainsTax) => t.route ?? (t.longTerm === false && (t.gain ?? 0) > 0 ? "Slab rate" : null);

/** Every property's tax if sold today, worked out in one table: cost, gain, rate, tax and what is left. */
export function PropertyTaxCard({ properties, taxOf, asOf, fy, empty, onOpen, onEdit }: {
  properties: Property[]; taxOf: (p: Property) => PropertyGainsTax; asOf: string; fy: string; empty: string;
  onOpen: (p: Property) => void; onEdit: (p: Property) => void;
}) {
  const { fmtFromBase: money } = usePortfolio();
  const table = useTableView("real-estate-tax", COLS, { manualEditor: true });
  const accessors: Record<string, Accessor<Property>> = {
    name: propertyLabel, holding: p => taxOf(p).longTermFrom, rate: p => rateOf(taxOf(p)),
    ...Object.fromEntries(MONEY.map(key => [key, (p: Property) => taxOf(p)[key]])),
  };
  const rows = sortRows(properties, table.sort, accessors);
  const total = (key: Money) => {
    const known = properties.map(p => taxOf(p)[key]).filter((n): n is number => n !== null);
    return { value: known.length ? known.reduce((s, n) => s + n, 0) : null, known: known.length, count: properties.length };
  };
  const cell = (p: Property, key: string): ReactNode => {
    const t = taxOf(p);
    switch (key) {
      case "name": return <button type="button" aria-label={`Tax working for ${propertyLabel(p)}`} onClick={() => onOpen(p)} className="text-left font-medium text-slate-100 underline decoration-ink-600 underline-offset-4 hover:text-champagne-400">{propertyLabel(p)}</button>;
      case "holding": return t.longTerm === null ? <span title={t.notCapitalAsset ? "Rural agricultural land is not a capital asset." : t.gap?.reason}><AbsentValue /></span>
        : <span title={`Counted from ${t.received ? "the previous owner's acquisition" : "the purchase"} on ${date(t.acquiredOn)}. Long-term after more than 2 years.`}>{t.longTerm ? "Long-term" : "Short-term"}{sub(`${t.longTerm ? "Since" : "Long-term from"} ${date(t.longTermFrom)}`)}</span>;
      case "rate": { const rate = rateOf(t); return rate ? <span title={t.owners.map(o => `${o.name || "Owner not entered"} (${o.status}): ${o.note || o.gap?.reason || ""}`).join(" ") || TAX_RULES}>{rate}</span> : <AbsentValue />; }
    }
    const n = t[key as Money];
    if (n === null) {
      if (key !== "tax") return <AbsentValue />;
      // The one cell that says why, and opens the form where the missing input goes.
      return t.needs.length ? <span title={t.gap?.reason}><AbsentValue /><button type="button" data-export-ignore onClick={() => onEdit(p)} className="mt-1 block whitespace-normal text-right font-sans text-[10px] text-champagne-400 underline">{t.gap?.short}</button></span>
        : <span title={t.gap?.reason ?? "Not known"}><AbsentValue />{sub(t.gap?.short ?? "Not known")}</span>;
    }
    if (key === "costForTax") return <span title={t.route === "20% indexed" || t.route === "Mixed" ? indexWorking(t, money) : undefined}>{money(n)}{sub(t.route === "20% indexed" ? "Indexed" : t.route === "Mixed" ? "Indexed for some owners" : t.costLabel)}</span>;
    if (key === "taxableGain") return <span className={n > 0 ? "text-gain" : n < 0 ? "text-loss" : ""}>{money(n, { sign: true })}</span>;
    if (key === "tax") return <span title={`${t.owners.map(o => `${o.name || "Owner not entered"}: ${money(o.tax)}`).join(" · ")}. ${TAX_RULES}`}>{money(n)}</span>;
    return money(n);
  };
  return <Card className="mt-5" pad={false} title={`Tax if sold today${properties.length ? ` · ${properties.length}` : ""}`} subtitle={TAX_RULES}
    right={<div className="flex flex-wrap items-center justify-end gap-3"><span className="text-xs text-slate-400" title="The sale date this assumes and its financial year">{fmtDate(asOf)} · FY {fy}</span><EditColumns view={table} /></div>}>
    <div data-prose-ok="the rates every tax figure below applies; the family asked to see the taxation clearly (28 Oct 2026)" data-tax-rates className="flex flex-wrap gap-x-6 gap-y-1 border-b border-ink-700 px-5 pb-3 pt-3 text-xs text-slate-400">
      <span><b className="mono text-slate-200">{pct(LONG_TERM_RATE)}</b> of the gain · held over 2 years</span>
      <span><b className="mono text-slate-200">{pct(INDEXED_RATE)}</b> of the gain after indexation, if lower · bought before 23 Jul 2024</span>
      <span><b className="mono text-slate-200">+{pct(CESS)}</b> cess</span>
      <span><b className="text-slate-200">Slab rate</b> · held 2 years or less</span>
    </div>
    <div className="overflow-x-auto" data-navigation-scroll="realestate-tax"><ExportableTable viewOnly exportName="Real Estate — Tax if sold today" className="min-w-full text-[13px]" data-property-tax-table>
      <thead className="border-b border-ink-700"><Tr view={table}>{COLS.map(key => <SortHeader key={key} col={key} view={table} align={key === "name" ? "left" : "right"} pad="px-3 py-2"
        note={key === "tax" ? `incl. ${pct(CESS)} cess` : undefined} className={key === "name" ? "min-w-[12rem]" : ""}>{LABELS[key]}</SortHeader>)}</Tr></thead>
      <tbody>{rows.map(p => <Tr key={p.id} view={table} className="border-b border-ink-700/50" data-property-tax-row={p.id}>{COLS.map(key => <td key={key} className={`px-3 py-3 ${key === "name" ? "text-slate-300" : "text-right mono tabular whitespace-nowrap"}`}>{cell(p, key)}</td>)}</Tr>)}
        {!rows.length && <tr><td colSpan={table.order.length} className="px-5 py-10 text-center text-sm text-slate-500">{empty}</td></tr>}
      </tbody>
      {!!rows.length && <tfoot><TrFoot view={table} label="Total" className="border-t border-ink-600 bg-ink-800/50 font-semibold" cells={Object.fromEntries(MONEY.map(key => {
        const t = total(key);
        return [key, <td key={key} className="px-3 py-3 text-right mono tabular whitespace-nowrap">{key === "taxableGain" ? money(t.value, { sign: true }) : money(t.value)}{t.known < t.count && sub(`${t.known} of ${t.count} properties`)}</td>];
      }))} /></tfoot>}
    </ExportableTable></div>
  </Card>;
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
      {t.owners.length > 0 && <div className="mt-4 overflow-x-auto" data-navigation-scroll="realestate-4"><ExportableTable viewOnly exportName="Real Estate — Tax by owner" className="min-w-full text-[13px]" data-property-tax-owners data-table-static="one row per owner, each the working of the same sale's tax">
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
