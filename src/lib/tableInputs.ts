import type { Account, Commitment, Position } from "./types";

export const MAX_TABLE_WORKBOOK_BYTES = 64_000_000;

export type InputField = { key: string; label: string; signed?: boolean; unit?: string };
export const HOLDING_INPUTS: InputField[] = [
  { key: "quantity", label: "Units", unit: "units" }, { key: "costBasis", label: "Cost of units held" },
  { key: "marketValue", label: "Value" }, { key: "realizedPnL", label: "Realised gain / loss", signed: true },
  { key: "costOfUnitsSold", label: "Cost of units sold" }, { key: "dividendReceived", label: "Dividends / income" },
];
export const CAPITAL_INPUTS: InputField[] = [
  { key: "committed", label: "Committed" }, { key: "called", label: "Called" },
  { key: "paid", label: "Paid in" }, { key: "undrawn", label: "Still to call" },
  { key: "pending", label: "Called but unpaid" },
];
export const PROPERTY_INPUTS: InputField[] = [
  { key: "cost", label: "Cost / value when received" }, { key: "value", label: "Value" },
  { key: "monthlyRent", label: "Monthly rent" }, { key: "monthlyCosts", label: "Monthly costs" },
  { key: "debt", label: "Debt" }, { key: "area", label: "Area", unit: "area" },
];
export type InputRecord = {
  id: string; kind: "holding" | "capital" | "private-capital" | "property" | "owner" | "call";
  parentId?: string;
  label: string; account: string; asOf: string; source: string;
  fields: InputField[]; values: Record<string, number | null>; versions: Record<string, string>;
};
export type InputChange = { id: string; field: string; value: number | null; version: string; source: string; reset?: boolean };
export type SavedInput = InputChange & { updatedAt: string };
export const positionInputId = (p: Pick<Position, "accountId" | "securityKey" | "memberId">) =>
  `holding:${p.accountId}|${p.securityKey}|${p.memberId ?? ""}`;
export const capitalInputId = (accountId: string) => `capital:${accountId}`;
export const privateCapitalId = (p: Pick<Position, "accountId" | "securityKey" | "memberId">) => positionInputId(p).replace(/^holding:/, "private-capital:");

function inputRecord(id: string, kind: InputRecord["kind"], label: string, account: string, asOf: string, fields: InputField[], raw: object, source: unknown): InputRecord {
  const values = Object.fromEntries(fields.map(f => [f.key, (raw as Record<string, number | null>)[f.key] ?? null]));
  return { id, kind, label, account, asOf, fields, values, versions: {}, source: JSON.stringify([asOf, source, values]) };
}
export function buildInputCatalog(positions: readonly Position[], commitments: readonly Commitment[], accounts: readonly Account[]): InputRecord[] {
  const acc = new Map(accounts.map(a => [a.accountId, a]));
  const accountLabel = (id: string) => { const a = acc.get(id); return a ? `${a.owner} · ${a.provider} · ${a.accountNo}` : id; };
  const caps = new Set(commitments.map(c => c.accountId));
  const records = positions.flatMap(p => {
    const date = p.priceAsOf ?? acc.get(p.accountId)?.asOf ?? "";
    const source = p.statementRecord ?? p.reviewSource ?? p.securityKey;
    // A carrying amount held at cost is not a measured valuation. Leave the
    // valuation input blank/yellow while the dashboard retains its cost mark.
    const holding = inputRecord(positionInputId(p), "holding", p.security, accountLabel(p.accountId), date, HOLDING_INPUTS,
      p.valuedAtCost ? { ...p, marketValue: null } : p, source);
    return p.marketSide === "private" && !caps.has(p.accountId)
      ? [holding, inputRecord(privateCapitalId(p), "private-capital", p.security, accountLabel(p.accountId), date, CAPITAL_INPUTS, {}, source)] : [holding];
  });
  for (const c of commitments) records.push(inputRecord(capitalInputId(c.accountId), "capital", c.name, accountLabel(c.accountId), c.asOf ?? "", CAPITAL_INPUTS, c, c.accountId));
  // A combined account can report several member sub-accounts. Refuse ambiguous
  // identity rather than letting one edit silently change two source rows.
  const counts = new Map<string, number>();
  records.forEach(r => counts.set(r.id, (counts.get(r.id) ?? 0) + 1));
  return records.filter(r => counts.get(r.id) === 1);
}
export function propertyInputRecord(p: { id: string; name?: string; address?: string; valuationDate?: string | null; updatedAt?: string; areaUnit?: string; acquisition?: string; purchasedOn?: string | null }): InputRecord {
  return inputRecord(`property:${p.id}`, "property", p.name || p.address || "Untitled property", `Whole property${p.acquisition ? ` · ${p.acquisition}${p.purchasedOn ? ` on ${p.purchasedOn}` : ""}` : ""} · INR · Area: ${p.areaUnit || "unit not recorded"}`, p.valuationDate ?? "", PROPERTY_INPUTS, p, p.updatedAt ?? p);
}
export function callInputRecord(c: { id: string; fund: string; fundName: string; date: string; amount: number; updatedAt: string }): InputRecord {
  return inputRecord(`capital-call:${c.id}`, "call", c.fundName || c.fund, "Upcoming capital call", c.date, [{ key: "amount", label: "Call amount" }], c, c.updatedAt);
}
export function ownershipInputRecords(p: { id: string; name?: string; address?: string; valuationDate?: string | null; updatedAt?: string; owners: { name: string; ownerId: string | null; share: number | null }[] }): InputRecord[] {
  return p.owners.map((owner, i) => ({ ...inputRecord(`property-owner:${p.id}|${i}`, "owner", p.name || p.address || "Untitled property", owner.name || "Unnamed owner", p.valuationDate ?? "", [{ key: "share", label: "Owner share", unit: "%" }],
    { share: owner.share === null ? null : owner.share / 100 }, { owner, index: i, updatedAt: p.updatedAt ?? "" }), parentId: `property:${p.id}` }));
}
export function applySavedInputs(catalog: InputRecord[], saved: readonly SavedInput[]): InputRecord[] {
  const by = new Map(saved.map(s => [`${s.id}\n${s.field}`, s]));
  return catalog.map(r => {
    const values = { ...r.values }, versions: Record<string, string> = {};
    for (const f of r.fields) {
      const s = by.get(`${r.id}\n${f.key}`);
      if (s?.source === r.source) { values[f.key] = s.value; versions[f.key] = s.updatedAt; }
    }
    return { ...r, values, versions };
  });
}
export function validateInputChanges(changes: unknown, catalog: InputRecord[]): string | null {
  if (!Array.isArray(changes) || !changes.length || changes.length > 10000) return "Choose between 1 and 10,000 number changes.";
  const records = new Map(catalog.map(r => [r.id, r])), seen = new Set<string>();
  for (const change of changes as InputChange[]) {
    if (!change || typeof change !== "object") return "The changes could not be read.";
    const r = records.get(change.id), f = r?.fields.find(f => f.key === change.field);
    if (!r || !f) return "An investment or column has changed. Download a fresh Excel file.";
    const key = `${change.id}\n${change.field}`;
    if (change.reset !== undefined && typeof change.reset !== "boolean") return "The changes could not be read.";
    if (seen.has(key)) return "The file contains duplicate changes for the same number.";
    seen.add(key);
    if (change.source !== r.source || change.version !== (r.versions[change.field] ?? "")) return "These numbers have changed since your download. Download a fresh file before editing.";
    if (change.value !== null && (typeof change.value !== "number" || !Number.isFinite(change.value) || Math.abs(change.value) > 1e15 || (!f.signed && change.value < 0) || (f.key === "area" && change.value === 0))) return `Enter a valid number for ${r.label}: ${f.label}.`;
    if (r.kind === "holding" && f.key === "marketValue" && change.value === null && !change.reset) return "Value cannot be cleared. Use Restore original to remove a correction.";
    if (r.kind === "capital" && f.key === "committed" && change.value === null && !change.reset) return "Committed cannot be cleared. Use Restore original to remove a correction.";
    if (change.reset && (r.kind === "property" || r.kind === "owner" || r.kind === "call")) return "Edit this entered value directly.";
    if (r.kind === "owner" && change.value !== null && (change.value < 0 || change.value > 1)) return "Use an owner share from 0% to 100%.";
    if (r.kind === "call" && (change.value === null || change.value <= 0)) return "Enter a capital call amount greater than zero.";
    if (r.kind === "call" && change.value! > 1e12) return "That capital call amount is too large. Check the zeros.";
  }
  return null;
}

/** Only source input columns can edit. Ratios, weights, totals and dated ledgers
 * remain calculated; their underlying investment inputs travel in the workbook. */
export function fieldForColumn(record: InputRecord, column: string): string | undefined {
  const fields: Record<string, string> = record.kind === "holding"
    ? { units: "quantity", qty: "quantity", quantity: "quantity", cost: "costBasis", costBasis: "costBasis", mv: "marketValue", value: "marketValue", marketValue: "marketValue", realised: "realizedPnL", realized: "realizedPnL", income: "dividendReceived" }
    : record.kind === "property" ? { cost: "cost", value: "value", rent: "monthlyRent", debt: "debt", area: "area" }
    : record.kind === "call" ? { amount: "amount" } : record.kind === "owner" ? { share: "share" }
    : { committed: "committed", called: "called", paid: "paid", uncalled: "undrawn", pending: "pending" };
  return fields[column];
}
