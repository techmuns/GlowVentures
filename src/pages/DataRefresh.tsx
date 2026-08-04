import { Database, FileText, ShieldCheck, RefreshCw, Download, RotateCcw, Layers } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, consolidatedMarketValue } from "@/lib/analytics";
import { accountIndex, ownerOf, staleAccounts } from "@/lib/accounts";
import { fmtDate } from "@/lib/format";
import { DASH } from "@/components/Absent";

// Provenance and status of the ingested book. Unlike the analytics pages this
// one is NOT gated on a non-empty book — when nothing has been ingested yet,
// "nothing has been ingested yet" is exactly what this page exists to say.
export function DataRefresh() {
  const { portfolio, bookIsEmpty, fmtFromBase, clearPortfolio } = usePortfolio();
  if (!portfolio) return null;
  const p = portfolio.positions;
  const accIdx = accountIndex(portfolio.accounts);
  const asOf = portfolio.asOf;
  const listedMV = consolidatedMarketValue(p);
  const classified = sum(p.filter((x) => x.sector !== "Unclassified").map((x) => x.marketValue));
  const coverage = listedMV > 0 ? (classified / listedMV) * 100 : 0;
  const costNA = new Set(p.filter((x) => x.costUnavailable).map((x) => x.security)).size;
  const withIsin = p.filter((x) => !!x.isin).length;
  const pm = portfolio.privateMarkets;
  const fundCount = pm.peFunds.length + pm.preIpoFunds.length + pm.unlistedCompanies.length + pm.debtFunds.length;
  const hasPrivate = fundCount + pm.closedFunds.length + pm.startups.length > 0;
  const stale = staleAccounts(portfolio);
  const providers = [...new Set(portfolio.accounts.map((a) => a.provider))].sort();

  function exportCSV() {
    const header = [
      "securityKey", "security", "isin", "symbol", "accountId", "provider", "accountNo",
      "owner", "engagement", "accountAsOf", "sector", "providerSector", "assetClass",
      "quantity", "avgCost", "currentPrice", "marketValue", "unrealizedPnL", "returnPct",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.join(","), ...p.map((x) => {
      const a = accIdx.get(x.accountId);
      return [
        x.securityKey, x.security, x.isin ?? "", x.symbol ?? "", x.accountId,
        a?.provider ?? "", a?.accountNo ?? "", a?.owner ?? "", a?.engagement ?? "", a?.asOf ?? "",
        x.sector, x.providerSector ?? "", x.assetClass,
        x.quantity, x.avgCost, x.currentPrice, x.marketValue, x.unrealizedPnL, x.returnPct,
      ].map(esc).join(",");
    })];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `glow_holdings_${asOf || "empty"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Setup" title="Data & Refresh"
        subtitle="Provenance and status of the ingested book. Every figure traces to a statement PDF under source/ — nothing here is estimated or filled in."
        right={<Pill tone={bookIsEmpty ? "warn" : "info"}>{bookIsEmpty ? "no statements yet" : `as of ${asOf}`}</Pill>} />

      {bookIsEmpty && (
        <Card className="mb-5" title="No statements ingested yet"
          subtitle="The data model is in place; the book is empty until the pipeline runs.">
          <ol className="ml-4 list-decimal space-y-2 text-sm text-slate-400 marker:text-slate-600">
            <li>Drop the wealth-platform ZIPs and PDFs into <span className="mono text-slate-300">source/</span> at the repo root. They stay out of the browser bundle — <span className="mono text-slate-300">source/</span> is never served.</li>
            <li>Run <span className="mono text-slate-300">npm run inventory</span>. It expands the ZIPs, walks every PDF, and writes <span className="mono text-slate-300">docs/INGEST-INVENTORY.md</span> grouped by provider → account → as-of date → report type.</li>
            <li>Review the inventory, especially its "could not classify" section — one account at one date often produces several overlapping reports, and which of them is authoritative is a decision, not a default.</li>
            <li>The extraction pass then writes <span className="mono text-slate-300">public/audit/</span> and regenerates <span className="mono text-slate-300">src/data/glowData.ts</span>.</li>
          </ol>
          <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
            Until then every page shows an empty state rather than zeros. A zero that means "no statement" and a
            zero that means "measured at nil" look identical on screen, and only one of them is true here.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Consolidated NAV" value={bookIsEmpty ? "—" : fmtFromBase(portfolio.totalValue, { compact: true })}
          sub={bookIsEmpty ? "no statements ingested"
            : `Listed ${fmtFromBase(portfolio.listedValue, { compact: true })} · Private ${hasPrivate ? fmtFromBase(portfolio.privateValue, { compact: true }) : DASH}`}
          icon={<Database className="h-4 w-4" />} />
        <StatTile label="Positions" value={p.length}
          sub={`${new Set(p.map((x) => x.securityKey)).size} names · ${new Set(p.map((x) => ownerOf(accIdx, x))).size} entities`}
          icon={<FileText className="h-4 w-4" />} />
        <StatTile label="Accounts" value={portfolio.accounts.length}
          sub={providers.length ? `${providers.length} provider${providers.length === 1 ? "" : "s"} · ${stale.length} behind latest` : "no accounts yet"}
          icon={<Layers className="h-4 w-4" />} />
        <StatTile label="Sector coverage" value={listedMV > 0 ? `${coverage.toFixed(1)}%` : "—"}
          sub={`${costNA} names cost-unavailable`} icon={<ShieldCheck className="h-4 w-4" />} />
      </div>

      <Card className="mt-5" title="Accounts & report dates"
        subtitle="One row per account. Statements arrive per platform on their own schedule, so consolidated totals blend these dates.">
        {portfolio.accounts.length === 0 ? (
          <p className="text-sm text-slate-500">No accounts registered yet — the registry is built from the statement headers during ingest.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-3 py-2 text-left font-medium">Provider</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Account</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Owner</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Strategy</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Engagement</th>
                  <th className="label-xs px-3 py-2 text-right font-medium">As of</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {portfolio.accounts.map((a) => {
                  const behind = stale.find((s) => s.account.accountId === a.accountId);
                  return (
                    <tr key={a.accountId} className="hover:bg-ink-700/40">
                      <td className="px-3 py-2 text-slate-100">{a.provider}</td>
                      <td className="px-3 py-2 mono text-[12px] text-slate-400">{a.accountNo}</td>
                      <td className="px-3 py-2 text-slate-300">{a.owner}</td>
                      <td className="px-3 py-2 text-[12px] text-slate-400">{a.strategy || "—"}</td>
                      <td className="px-3 py-2 text-[12px] text-slate-400">{a.engagement || "—"}</td>
                      <td className="px-3 py-2 text-right mono text-[12px]">
                        <span className={behind ? "text-amber-400" : "text-slate-300"}
                          title={behind ? `${behind.daysBehind} days behind the book's newest statement (${asOf})` : "Current — matches the book's newest statement"}>
                          {a.asOf || "—"}{behind ? ` · −${behind.daysBehind}d` : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Coverage & quality">
          <ul className="space-y-2 text-sm">
            <Row label="Listed book" value={bookIsEmpty ? "—" : fmtFromBase(portfolio.listedValue, { compact: true })} />
            {/* A private book of ₹0 claims private holdings worth nothing. This
                book has no private holding at all, so the figure is absent. */}
            <Row label="Private book" value={hasPrivate ? fmtFromBase(portfolio.privateValue, { compact: true }) : DASH}
              muted={!hasPrivate} />
            <Row label="Sector classification" value={listedMV > 0 ? `${coverage.toFixed(1)}% of listed NAV` : "—"} />
            <Row label="Positions carrying an ISIN" value={p.length ? `${withIsin} of ${p.length}` : "—"} muted={withIsin < p.length} />
            <Row label="Cost-unavailable names" value={`${costNA} (excluded from P&L)`} />
            <Row label="Private instruments"
              value={hasPrivate ? `${pm.startups.length} startups · ${fundCount} funds/cos` : "None in this book"}
              muted={!hasPrivate} />
            <Row label="NAV snapshots" value={portfolio.navHistory.length ? `${portfolio.navHistory.length}` : "None ingested"} muted={!portfolio.navHistory.length} />
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            ISIN and ticker are enrichment here, not identity — several providers print neither. Positions are
            joined on a slug of the normalised security name, so a holding is never dropped for lacking an ISIN.
          </p>
        </Card>
        <Card title="How refresh works">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-champagne-400" />
            <p className="text-sm text-slate-400">
              New statements go into <span className="mono text-slate-300">source/</span>; re-running the ingest
              regenerates <span className="mono text-slate-300">src/data/glowData.ts</span> and the audit archive,
              and the cockpit picks up the new report dates automatically. Accounts are updated independently — an
              account with no new statement keeps its own older as-of date rather than inheriting the newest.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={exportCSV} disabled={bookIsEmpty} className="btn-primary text-sm disabled:opacity-50">
              <Download className="h-4 w-4" /> Download holdings CSV
            </button>
            <button onClick={clearPortfolio} className="btn-ghost text-sm"><RotateCcw className="h-4 w-4" /> Reload book</button>
          </div>
        </Card>
      </div>
      {!bookIsEmpty && (
        <p className="mt-4 text-[11px] text-slate-500">Book as of {fmtDate(asOf)}.</p>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`mono ${muted ? "text-slate-500" : "text-slate-200"}`}>{value}</span>
    </li>
  );
}
