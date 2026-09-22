import { Database, FileText, ShieldCheck, RefreshCw, Download, RotateCcw, Layers } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, dedupedPositions, isCompanyShare, isPrivateClass, marketSides, excludedClasses, assetClassLabel, unpriced } from "@/lib/analytics";
import { accountIndex, ownerOf, staleAccounts } from "@/lib/accounts";
import { fmtDate } from "@/lib/format";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

/** The account table's columns, in the order its rows write their cells. */
const ACCOUNT_COLS = ["provider", "account", "owner", "strategy", "engagement", "asOf"] as const;
import { DASH, absentTile } from "@/components/Absent";

// Provenance and status of the ingested book. Unlike the analytics pages this
// one is NOT gated on a non-empty book — when nothing has been ingested yet,
// "nothing has been ingested yet" is exactly what this page exists to say.
export function DataRefresh() {
  const view = useTableView("data-refresh-accounts", ACCOUNT_COLS);
  const { portfolio, bookIsEmpty, fmtFromBase, clearPortfolio } = usePortfolio();
  if (!portfolio) return null;
  const p = portfolio.positions;
  const accIdx = accountIndex(portfolio.accounts);
  const asOf = portfolio.asOf;
  // BOTH SIDES OF A RATIO ON ONE MEASUREMENT. The denominator already deduped
  // (`dedupedPositions` counts each `dedupeGroup` once) while the numerator
  // summed the raw set, so a duplicated holding that HAD a sector would have
  // pushed coverage over 100%. Neither of this drop's two duplicated holdings
  // carries one, which is the only reason the figure read correctly then.
  const deduped = dedupedPositions(p);
  // SECTOR COVERAGE IS A COMPANY-SHARE RATIO, NOT A LISTED-BOOK ONE.
  //
  // This narrowed on the PRIVATE axis (`!isPrivateClass`), which drops the AIF
  // folios and stops there — so a mutual-fund scheme and an ETF, both marked
  // daily at a published NAV and therefore not private, stayed in the
  // denominator carrying no GICS sector and dragged coverage DOWN, while every
  // Cash row went in with the sector string "Cash" and was counted as
  // CLASSIFIED, pushing it back up. Two errors in opposite directions inside
  // one ratio, which is the worst shape available: neither is visible in the
  // answer.
  //
  // A GICS sector is a property of a COMPANY. A fund unit is one line standing
  // for a portfolio somebody else assembled and there is no look-through behind
  // it in this book; cash is not classified, it is cash. So both sides run over
  // `isCompanyShare` — Stage 10h/10i's axis — and every class that leaves is
  // NAMED with its value below rather than quietly dropped.
  const shareRows = deduped.filter(isCompanyShare);
  const shareMV = sum(shareRows.map((x) => x.marketValue));
  const sectored = shareRows.filter((x) => x.sector !== "Unclassified");
  const classified = sum(sectored.map((x) => x.marketValue));
  const coverage = shareMV > 0 ? (classified / shareMV) * 100 : null;
  const notCompany = excludedClasses(deduped, isCompanyShare);

  // A RATIO ONE ROW OWNS IS A STATEMENT ABOUT THAT ROW, AND MUST SAY SO.
  //
  // A single unsectored holding — the family's promoter stock, reported by a
  // depository that prints no sector — is the overwhelming majority of this
  // ratio's denominator. So the percentage and the row count beside it point
  // opposite ways: the count says a good share of the names are classified and
  // the percentage says almost none of the value is, and both are true of
  // different things. A reader cannot reconcile them from what is on the tile.
  // So the dominant row is NAMED with its share of the denominator, and the same
  // ratio is struck again over everything else, which is the figure a reader can
  // actually act on. Every number here is derived; the 50% trigger is a declared
  // convention (one row owning more than half a denominator), stated so nobody
  // reads it as a measured threshold.
  const dominant = shareRows.length ? shareRows.reduce((a, b) => (b.marketValue > a.marketValue ? b : a)) : null;
  const dominantPct = dominant && shareMV > 0 ? (dominant.marketValue / shareMV) * 100 : null;
  const restRows = dominant ? shareRows.filter((x) => x !== dominant) : [];
  const restMV = sum(restRows.map((x) => x.marketValue));
  const restCoverage = restMV > 0
    ? (sum(restRows.filter((x) => x.sector !== "Unclassified").map((x) => x.marketValue)) / restMV) * 100
    : null;
  const dominated = dominant !== null && dominantPct !== null && dominantPct >= 50;
  const dominationNote = dominated && dominant && dominantPct !== null
    ? `${dominant.security} alone is ${fmtFromBase(dominant.marketValue, { compact: true })} — ${dominantPct.toFixed(1)}% of that denominator${dominant.sector === "Unclassified" ? ", and it carries no sector" : ""} — so this percentage is very largely a statement about that one holding.`
      + (restCoverage !== null ? ` Struck over the other ${restRows.length} rows it is ${restCoverage.toFixed(1)}% of ${fmtFromBase(restMV, { compact: true })}.` : "")
    : "";

  // COUNT WHAT THE BOOK CARRIES, NOT A FLAG NOTHING WRITES.
  //
  // This counted `x.costUnavailable` — a field that is optional on `Position`
  // and which the generated book has NEVER set (`grep -c costUnavailable
  // src/data/glowData.ts` returns 0). So it was 0, and this page — whose whole
  // job is provenance and coverage — told a reader that nothing in the book is
  // missing a cost, on a book where a cost-based figure cannot reach most of the
  // market value. Morning CIO and the Portfolio Monitor read the composite test
  // and report dozens from the same book.
  //
  // `isPriced` in analytics.ts IS that composite — the flag AND a positive cost
  // AND a finite P&L and return — and `unpriced()` is its complement. It is
  // struck on the CONSOLIDATED set because this is a book-wide coverage claim
  // and a consolidated figure counts each dedupeGroup once.
  //
  // And the shortfall is stated in MONEY as well as in a count. One promoter row
  // is most of it, so a bare name count reads as a rounding error against a book
  // it in fact covers nearly all of — the same reason the money-weighted tile
  // says which fraction of the book it covers rather than how many accounts.
  const noCost = unpriced(deduped);
  const noCostNames = new Set(noCost.map((x) => x.security)).size;
  const noCostMV = sum(noCost.map((x) => x.marketValue));
  const noCostNote = bookIsEmpty ? ""
    : noCost.length
      ? `${noCostNames} name${noCostNames === 1 ? "" : "s"} — ${noCost.length} of ${deduped.length} consolidated positions, ${fmtFromBase(noCostMV, { compact: true })} of ${fmtFromBase(portfolio.totalValue, { compact: true })} — report no usable cost basis, so no P&L or return figure covers them.`
      : "Every position in this book carries a cost basis, so no P&L figure leaves anything out.";

  const withIsin = p.filter((x) => !!x.isin).length;

  // THE PRIVATE VALUE IS MEASURED; THE PRIVATE-INSTRUMENT REGISTER IS EMPTY FOR
  // A COMPLETELY DIFFERENT REASON, AND ONE MUST NOT GATE THE OTHER.
  //
  // `hasPrivate` asks whether `portfolio.privateMarkets` carries a fund-of-funds
  // structure with its own TVPI and DPI. No statement in this drop reports one,
  // so all six arrays are empty — and gating the MONEY on that printed "Private
  // —" and "Private book —" over the book's measured private value, under a
  // comment naming the cause as "this book has no private holding at all". Every
  // AIF folio in the book contradicts it. That is an em dash over a measured
  // non-zero figure with the wrong reason attached: the exact inversion of the
  // standing rule, and a reader acts on it by concluding the family holds
  // nothing private.
  //
  // The money comes off the positions. `null` here means the private COLLECTION
  // is empty — no holding in a private class at all — which is the one case that
  // must not render as a zero.
  /**
   * EVERY SIDE THE BOOK HAS, in order, each with its own reason — see
   * `marketSides`. A side with no rows is not in the list, so a `₹0 private`
   * can never claim a private book worth nothing, which is what the two
   * hard-coded rows this replaced had to guard against one at a time.
   */
  const sides = marketSides(deduped);
  const pm = portfolio.privateMarkets;
  const fundCount = pm.peFunds.length + pm.preIpoFunds.length + pm.unlistedCompanies.length + pm.debtFunds.length;
  const hasPrivate = fundCount + pm.closedFunds.length + pm.startups.length > 0;
  const stale = staleAccounts(portfolio);
  const accountRows = sortRows(portfolio.accounts, view.sort, {
    provider: (a) => a.provider,
    account: (a) => a.accountNo,
    owner: (a) => a.owner,
    strategy: (a) => a.strategy ?? null,
    engagement: (a) => a.engagement ?? null,
    asOf: (a) => a.asOf ?? null,
  });
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
        {/* EVERY SIDE THE BOOK HAS, from `marketSides` — never a fixed
            `Listed X · Private Y`. That caption stopped adding to the total
            printed above it the moment a third side existed, and a reader who
            adds two figures and gets less than the one they are under has found
            a contradiction no hover repairs. */}
        <StatTile label="Current Value of Holdings" value={bookIsEmpty ? "—" : fmtFromBase(portfolio.totalValue, { compact: true })}
          sub={bookIsEmpty ? "no statements ingested"
            : sides.length
              ? sides.map((x) => `${x.label} ${fmtFromBase(x.value, { compact: true })}`).join(" · ")
              : "no holding in this book carries a value"}
          icon={<Database className="h-4 w-4" />} />
        <StatTile label="Positions" value={p.length}
          sub={`${new Set(p.map((x) => x.securityKey)).size} names · ${new Set(p.map((x) => ownerOf(accIdx, x))).size} entities`}
          icon={<FileText className="h-4 w-4" />} />
        <StatTile label="Accounts" value={portfolio.accounts.length}
          sub={providers.length ? `${providers.length} provider${providers.length === 1 ? "" : "s"} · ${stale.length} behind latest` : "no accounts yet"}
          icon={<Layers className="h-4 w-4" />} />
        {/* The dash carries its OWN reason, and the two absences are different
            findings: a book with no company shares in it, and a book whose
            company shares carry no market value to weight the ratio by. */}
        {coverage === null ? (
          <StatTile label="Sector coverage" icon={<ShieldCheck className="h-4 w-4" />}
            {...absentTile(
              shareRows.length === 0
                ? "no company shares in this book to classify"
                : "company shares are held but none carries a market value to weight by",
              noCostNote || undefined,
            )} />
        ) : (
          <StatTile label="Sector coverage" value={`${coverage.toFixed(1)}%`}
            sub={`of company-share value · ${sectored.length} of ${shareRows.length} rows carry one`
              + (dominated && dominantPct !== null ? ` · one holding is ${dominantPct.toFixed(0)}% of that value` : "")}
            hint={[
              "Company shares only — a GICS sector is a property of a company, and a fund unit, an ETF or a cash row has none.",
              dominationNote,
              noCostNote,
            ].filter(Boolean).join(" ")}
            icon={<ShieldCheck className="h-4 w-4" />} />
        )}
      </div>

      <Card className="mt-5" title="Accounts & report dates"
        subtitle="One row per account. Statements arrive per platform on their own schedule, so consolidated totals blend these dates.">
        {portfolio.accounts.length === 0 ? (
          <p className="text-sm text-slate-500">No accounts registered yet — the registry is built from the statement headers during ingest.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700">
                <Tr view={view}>
                  <SortHeader col="provider" view={view} align="left" pad="px-3 py-2">Provider</SortHeader>
                  <SortHeader col="account" view={view} align="left" pad="px-3 py-2">Account</SortHeader>
                  <SortHeader col="owner" view={view} align="left" pad="px-3 py-2">Owner</SortHeader>
                  <SortHeader col="strategy" view={view} align="left" pad="px-3 py-2">Strategy</SortHeader>
                  <SortHeader col="engagement" view={view} align="left" pad="px-3 py-2">Engagement</SortHeader>
                  <SortHeader col="asOf" view={view} pad="px-3 py-2">As of</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {accountRows.map((a) => {
                  const behind = stale.find((s) => s.account.accountId === a.accountId);
                  return (
                    <Tr view={view} key={a.accountId} className="hover:bg-ink-700/40">
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
                    </Tr>
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
            {/* ONE ROW PER SIDE THE BOOK ACTUALLY HAS. The two hard-coded
                rows below it were a two-way partition; `marketSides` is the
                one list, and each row carries its side's own reason. */}
            {bookIsEmpty
              ? <Row label="Listed book" value={DASH} />
              : sides.map((x) => (
                  <Row key={x.key} label={`${x.label} book`} title={x.why}
                    value={fmtFromBase(x.value, { compact: true })} />
                ))}
            <Row label="Sector classification" value={coverage === null ? "no company shares to classify yet" : `${coverage.toFixed(1)}% of company-share value`} />
            <Row label="Positions carrying an ISIN" value={p.length ? `${withIsin} of ${p.length}` : "no positions ingested yet"} muted={withIsin < p.length} />
            {/* Stated in MONEY as well as in a count. One promoter row is most
                of the shortfall, so a bare name count reads as a rounding error
                against a book it in fact covers nearly all of. */}
            <Row label="No cost basis (excluded from P&L)"
              value={bookIsEmpty ? DASH
                : noCost.length
                  ? `${noCostNames} names · ${noCost.length} of ${deduped.length} positions · ${fmtFromBase(noCostMV, { compact: true })}`
                  : "none — every position carries a cost"}
              muted={!noCost.length} />
            <Row label="Private instruments"
              value={hasPrivate ? `${pm.startups.length} startups · ${fundCount} funds/cos` : "None registered"}
              muted={!hasPrivate} />
            <Row label="NAV snapshots" value={portfolio.navHistory.length ? `${portfolio.navHistory.length}` : "None ingested"} muted={!portfolio.navHistory.length} />
          </ul>
          {/* WHAT A NARROWED RATIO LEFT OUT IS NAMED, NEVER DROPPED. The
              classes below are excluded from BOTH sides of the coverage figure:
              counting them in the denominator alone understates it, and cash —
              whose sector string is literally "Cash" — would otherwise count as
              classified and overstate it. */}
          {notCompany.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Sector coverage is measured over company shares alone — {shareRows.length} of {deduped.length} consolidated
              positions. A GICS sector is a property of a company, and this book carries no look-through behind a fund,
              so {notCompany.map((c) => `${assetClassLabel(c.key)} ${fmtFromBase(c.mv, { compact: true })}`).join(" · ")} sit
              outside both sides of the ratio rather than being counted as unclassified.
            </p>
          )}
          {!hasPrivate && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              The private-instrument register — a fund-of-funds structure carrying its own TVPI and DPI — is empty
              because no statement in this drop reports one, not because the family holds nothing private. What they
              do hold in private classes is carried as ordinary positions and is the Private book figure above.
            </p>
          )}
          {!bookIsEmpty && noCost.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {noCostNote} A depository reports what an account holds and not what it paid, and a fund's own account
              statement values the folio without pricing the units, so those rows are left out of every P&amp;L rather
              than counted at a cost of zero — which would report their whole market value as profit.
            </p>
          )}
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

function Row({ label, value, muted, title }: { label: string; value: string; muted?: boolean; title?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      {/* `value` stays a STRING. A row that could take a node is a row any
          caller can put a second line inside, and `innerText` breaks a line at
          a flex item — the trap Stage 10ah records on the Entities pill. The
          reason rides in a `title`, which is where this book puts a cause. */}
      <span className={`mono ${muted ? "text-slate-500" : "text-slate-200"}`} title={title}>{value}</span>
    </li>
  );
}
