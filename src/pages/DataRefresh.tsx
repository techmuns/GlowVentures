import { useMemo } from "react";
import { Database, FileText, ShieldCheck, RefreshCw, Download, RotateCcw, Layers } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  sum, isCompanyShare, marketSides, excludedClasses, assetClassLabel,
  currentHoldings, droppedHoldings, NEGLIGIBLE_VALUE_FLOOR,
} from "@/lib/analytics";
import { companySectorIndex } from "@/lib/lookthrough";
import { useStockExposure } from "@/lib/useStockExposure";
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
  const { portfolio, consolidated, bookIsEmpty, fmtFromBase, clearPortfolio } = usePortfolio();
  /**
   * ── ONE CLASSIFICATION, THE ONE SECTOR COMPOSITION DRAWS ─────────────────
   *
   * Sector coverage read `x.sector !== "Unclassified"` — the family's own
   * statement and nothing else — so it reported 41.6% of company-share value
   * placed on a book where Sector Composition places all but a sliver of the
   * same shares. A depository statement prints an ISIN, a quantity and a rate
   * and NO industry, so every share the family bought in its own demat arrived
   * here unplaced for a reason that is a fact about the document, not about the
   * company. Stage 10bq's rule is that a company has ONE sector on every page:
   * `companySectorIndex` is the projection of `companyExposure`'s three tiers
   * (the statement, a fund's SEBI filing on the ISIN, screener.in on the NSE
   * symbol — a lower tier only ever FILLS an empty sector), and this page reads
   * it rather than a second resolver of its own.
   *
   * Built over EVERY consolidated company share, not over the current set,
   * exactly as Family & Entities builds it: a sector is a property of the
   * company, and narrowing the input can only ever place fewer.
   */
  const exposure = useStockExposure(consolidated, !bookIsEmpty);
  const companySectors = useMemo(
    () => companySectorIndex(consolidated.filter(isCompanyShare), exposure),
    [consolidated, exposure],
  );
  if (!portfolio) return null;
  const p = portfolio.positions;
  const accIdx = accountIndex(portfolio.accounts);
  const asOf = portfolio.asOf;
  // BOTH SIDES OF A RATIO ON ONE MEASUREMENT. The denominator already deduped
  // (`dedupedPositions` counts each `dedupeGroup` once) while the numerator
  // summed the raw set, so a duplicated holding that HAD a sector would have
  // pushed coverage over 100%. Neither of this drop's two duplicated holdings
  // carries one, which is the only reason the figure read correctly then.
  const deduped = consolidated;
  /**
   * ── THE HOLDINGS THIS PAGE COUNTS ARE THE ONES MORNING CIO COUNTS ─────────
   *
   * The Positions tile printed `portfolio.positions.length` — 371 — beside
   * Morning CIO's 358 for the same book, with nothing on either page saying the
   * two were different sets. The 371 is every statement ROW: the holding two
   * members' statements both report, counted twice; the funds redeemed to nil,
   * which still publish a NAV; and the holdings worth under the ₹1,000 floor the
   * family asked to be dropped. `currentHoldings` is the ONE definition every
   * allocation surface reads, so this page reads it too, over the consolidated
   * set, and names what it leaves out in the tile's own hover.
   *
   * The ENTITY count is struck over the RAW current rows — a per-owner figure
   * counts each member's own statement (§"consolidated counts once, per-account
   * does not"). On this book both give six.
   */
  const held = currentHoldings(deduped);
  const heldRaw = currentHoldings(p);
  const dropped = droppedHoldings(deduped);
  const heldNames = new Set(held.map((x) => x.securityKey)).size;
  const heldEntities = new Set(heldRaw.map((x) => ownerOf(accIdx, x))).size;
  const twiceReported = p.length - deduped.length;
  const positionsWhy = [
    `${p.length} statement row${p.length === 1 ? "" : "s"} in the book.`,
    twiceReported > 0 ? `${twiceReported} ${twiceReported === 1 ? "is" : "are"} reported under two members and counted once.` : "",
    dropped.closed.length > 0 ? `${dropped.closed.length} ${dropped.closed.length === 1 ? "is a fund" : "are funds"} redeemed to nil — the fund still publishes a NAV, the family no longer holds the units.` : "",
    dropped.negligible.length > 0 ? `${dropped.negligible.length} ${dropped.negligible.length === 1 ? "is a holding" : "are holdings"} worth under ${fmtFromBase(NEGLIGIBLE_VALUE_FLOOR)}, ${fmtFromBase(sum(dropped.negligible.map((x) => x.marketValue)))} in total, dropped at the family's request.` : "",
    `The ${held.length} left are the current holdings Morning CIO's Positions counts.`,
  ].filter(Boolean).join(" ");
  /** A company share's sector, by whichever tier placed it — the page's one answer. */
  const sectorOf = (x: { securityKey: string }) => companySectors.get(x.securityKey)?.sector || "Unclassified";
  const tierOf = (x: { securityKey: string }) => companySectors.get(x.securityKey)?.from ?? null;
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
  // for a portfolio somebody else assembled and has no sector of its own — what
  // the fund holds is DERIVED on Sector Composition from the fund's own filing,
  // and is not a holding of this book; cash is not classified, it is cash. So
  // both sides run over
  // `isCompanyShare` — Stage 10h/10i's axis — and every class that leaves is
  // NAMED with its value below rather than quietly dropped.
  const shareRows = held.filter(isCompanyShare);
  const shareMV = sum(shareRows.map((x) => x.marketValue));
  const sectored = shareRows.filter((x) => sectorOf(x) !== "Unclassified");
  const classified = sum(sectored.map((x) => x.marketValue));
  // STILL READING. The disclosure tier is a fetch, so until it lands a company
  // only a fund's filing places is unplaced and this ratio WILL move. A figure
  // that is going to change under the reader is not stated — the tile says it
  // is still measuring, the rule the market-cap bands and the movers card
  // already follow (Stage 10c, Stage 10an).
  const sectorsSettled = exposure.status !== "loading";
  const coverage = shareMV > 0 && sectorsSettled ? (classified / shareMV) * 100 : null;
  const notCompany = excludedClasses(held, isCompanyShare);
  // WHICH TIER PLACED EACH COMPANY, counted over COMPANIES — the unit a sector
  // is a property of — so a reader can see how much of the ratio is borrowed
  // evidence (a fund's filing, screener.in) rather than the family's statement.
  const shareKeys = [...new Set(shareRows.map((x) => x.securityKey))];
  const placedBy = { book: 0, disclosure: 0, vendor: 0 };
  const unplacedKeys: string[] = [];
  for (const k of shareKeys) {
    const t = companySectors.get(k)?.from ?? null;
    if (t) placedBy[t]++; else unplacedKeys.push(k);
  }
  const unplacedMV = sum(shareRows.filter((x) => !tierOf(x)).map((x) => x.marketValue));
  const unplacedNames = [...new Set(shareRows.filter((x) => !tierOf(x)).map((x) => x.security))].sort();

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
    ? (sum(restRows.filter((x) => sectorOf(x) !== "Unclassified").map((x) => x.marketValue)) / restMV) * 100
    : null;
  const dominated = dominant !== null && dominantPct !== null && dominantPct >= 50;
  const dominationNote = dominated && dominant && dominantPct !== null
    ? `${dominant.security} alone is ${fmtFromBase(dominant.marketValue, { compact: true })} — ${dominantPct.toFixed(1)}% of that denominator${sectorOf(dominant) === "Unclassified" ? ", and no tier places it in a sector" : ""} — so this percentage is very largely a statement about that one holding.`
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
  //
  // AND ON THE SET, AND THE TEST, MORNING CIO'S DRILL-DOWN USES. This read
  // `unpriced` over every consolidated row — 65 of 369 — while the page the
  // Current Value tile opens printed "Reports none: 49 holdings · 41 names" for
  // the same book. Neither was wrong about its own set; they were two sets.
  // `unpriced` also counted five CASH rows (a nil sleeve, a TDS line, two
  // settlement payables) as "no cost basis", which is not true of cash: it has
  // no P&L to be missing. So this is the drill-down's own facet — a current
  // holding whose statement reports no cost — keyed on the security for names.
  const noCost = held.filter((x) => x.costBasis == null);
  const noCostNames = new Set(noCost.map((x) => x.securityKey)).size;
  const noCostMV = sum(noCost.map((x) => x.marketValue));
  const noCostNote = bookIsEmpty ? ""
    : noCost.length
      ? `${noCostNames} name${noCostNames === 1 ? "" : "s"} — ${noCost.length} of ${held.length} current holdings, ${fmtFromBase(noCostMV, { compact: true })} of ${fmtFromBase(portfolio.totalValue, { compact: true })} — report no cost basis, so no P&L or return figure covers them.`
      : "Every current holding in this book carries a cost basis, so no P&L figure leaves anything out.";

  // Over the same current holdings the Positions tile counts, so the two
  // figures a reader sets side by side are fractions of one set.
  const withIsin = held.filter((x) => !!x.isin).length;

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
          subtitle={'The data model is in place; the book is empty until the pipeline runs. Until then every page shows an empty state rather than zeros: a zero that means "no statement" and a zero that means "measured at nil" look identical on screen, and only one of them is true here.'}>
          <ol className="ml-4 list-decimal space-y-2 text-sm text-slate-400 marker:text-slate-600">
            <li>Drop the wealth-platform ZIPs and PDFs into <span className="mono text-slate-300">source/</span> at the repo root. They stay out of the browser bundle — <span className="mono text-slate-300">source/</span> is never served.</li>
            <li>Run <span className="mono text-slate-300">npm run inventory</span>. It expands the ZIPs, walks every PDF, and writes <span className="mono text-slate-300">docs/INGEST-INVENTORY.md</span> grouped by provider → account → as-of date → report type.</li>
            <li>Review the inventory, especially its "could not classify" section — one account at one date often produces several overlapping reports, and which of them is authoritative is a decision, not a default.</li>
            <li>The extraction pass then writes <span className="mono text-slate-300">public/audit/</span> and regenerates <span className="mono text-slate-300">src/data/glowData.ts</span>.</li>
          </ol>
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
        {/* THE CURRENT HOLDINGS, the set Morning CIO's Positions counts — not
            every statement row. What the two differ by is the tile's own hover,
            because a count that silently means a different set from the page
            one click away is the disagreement this page exists to rule out. */}
        <StatTile label="Positions"
          value={<span data-xa="upload-positions" data-value={held.length} data-names={heldNames}
            data-entities={heldEntities} data-rows={p.length}>{held.length}</span>}
          sub={`${heldNames} names · ${heldEntities} entities · current holdings`}
          title={positionsWhy}
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
                : shareMV > 0 && !sectorsSettled
                  ? "still reading the funds' filings — the ratio would move when they land"
                  : "company shares are held but none carries a market value to weight by",
              noCostNote || undefined,
            )} />
        ) : (
          <StatTile label="Sector coverage"
            value={<span data-xa="upload-coverage" data-value={coverage} data-status={exposure.status}>{`${coverage.toFixed(1)}%`}</span>}
            sub={`of company-share value · ${shareKeys.length - unplacedKeys.length} of ${shareKeys.length} companies placed`
              + (dominated && dominantPct !== null ? ` · one holding is ${dominantPct.toFixed(0)}% of that value` : "")}
            hint={[
              "Company shares only — a GICS sector is a property of a company, and a fund unit, an ETF or a cash row has none of its own.",
              "Placed by the same three tiers Sector Composition reads: the family's own statement, then a fund's SEBI filing joined on the ISIN, then screener.in on the NSE symbol — a lower tier only ever fills a sector the statements left empty.",
              exposure.status === "unreachable" ? "The funds' filings could not be read on this visit, so this is a floor: no company is placed by a fund's filing." : "",
              notCompany.length > 0
                ? `Measured over ${shareRows.length} of ${held.length} current holdings; what a fund holds is derived on Sector Composition from the fund's own filing and is not a holding of this book, so ${notCompany.map((c) => `${assetClassLabel(c.key)} ${fmtFromBase(c.mv, { compact: true })}`).join(" · ")} sit outside both sides of the ratio rather than being counted as unclassified.`
                : "",
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
            <Row label="Sector classification"
              value={shareRows.length === 0 ? "no company shares to classify yet"
                : coverage === null ? (sectorsSettled ? "no company-share value to weight by" : "still reading the funds' filings")
                : `${coverage.toFixed(1)}% of company-share value`} />
            <Row label="Current holdings carrying an ISIN" xa="upload-isin" value={held.length ? `${withIsin} of ${held.length}` : "no positions ingested yet"} muted={withIsin < held.length}
              title="ISIN and ticker are enrichment here, not identity — several providers print neither. Positions are joined on a slug of the normalised security name, so a holding is never dropped for lacking an ISIN." />
            {/* Stated in MONEY as well as in a count. One promoter row is most
                of the shortfall, so a bare name count reads as a rounding error
                against a book it in fact covers nearly all of. */}
            <Row label="No cost basis (excluded from P&L)" xa="upload-nocost"
              value={bookIsEmpty ? DASH
                : noCost.length
                  ? `${noCostNames} names · ${noCost.length} of ${held.length} holdings · ${fmtFromBase(noCostMV, { compact: true })}`
                  : "none — every current holding carries a cost"}
              muted={!noCost.length}
              title={!bookIsEmpty && noCost.length > 0
                ? `${noCostNote} A depository reports what an account holds and not what it paid, and a fund's own account statement values the folio without pricing the units, so those rows are left out of every P&L rather than counted at a cost of zero — which would report their whole market value as profit.`
                : undefined} />
            <Row label="Private instruments"
              value={hasPrivate ? `${pm.startups.length} startups · ${fundCount} funds/cos` : "None registered"}
              muted={!hasPrivate}
              title={hasPrivate ? undefined
                : "The private-instrument register — a fund-of-funds structure carrying its own TVPI and DPI — is empty because no statement in this drop reports one, not because the family holds nothing private. What they do hold in private classes is carried as ordinary positions."} />
            <Row label="NAV snapshots" value={portfolio.navHistory.length ? `${portfolio.navHistory.length}` : "None ingested"} muted={!portfolio.navHistory.length} />
          </ul>
          {/* WHICH TIER PLACED EACH COMPANY, and what none of them could. The
              two lower tiers are BORROWED EVIDENCE rather than the family's own
              statement, so they are counted on the page that uses them — Family
              & Entities' strip, on the same terms. `data-status` carries the
              fetch's own state, so a settled walk can tell a tier still landing
              from one that was never asked for. */}
          {!bookIsEmpty && shareKeys.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-700/70 pt-2.5 text-xs text-slate-400"
              data-upload-sector-source data-xa="upload-sector-source"
              data-status={exposure.status}
              data-from-book={placedBy.book}
              data-from-disclosure={placedBy.disclosure}
              data-from-vendor={placedBy.vendor}
              data-unplaced={unplacedKeys.length}
              data-companies={shareKeys.length}>
              <span className="text-slate-500">Sector source</span>
              <span><span className="mono text-slate-200">{placedBy.book}</span> from a statement in this book</span>
              {placedBy.disclosure > 0 && <span><span className="mono text-slate-200">{placedBy.disclosure}</span> from a fund&rsquo;s filing</span>}
              {placedBy.vendor > 0 && <span><span className="mono text-slate-200">{placedBy.vendor}</span> from screener.in</span>}
              {unplacedKeys.length > 0 && (
                <span className="text-slate-500"
                  title={`No tier places these — a statement that printed no industry, no fund filing naming the ISIN and no NSE symbol to look one up on: ${unplacedNames.join(", ")}.`}>
                  <span className="mono">{unplacedKeys.length}</span> unplaced ·{" "}
                  <span className="mono">{fmtFromBase(unplacedMV, { compact: true })}</span>
                </span>
              )}
              {exposure.status === "loading" && <span className="text-slate-500">still reading the funds&rsquo; filings</span>}
              {exposure.status === "unreachable" && (
                <span className="text-amber-400/80" title="The look-through store did not answer, so no company is placed by a fund's own filing on this visit. Nothing is misplaced by it — that tier only ever fills a sector the statements left empty — so the coverage above is a floor.">
                  a fund&rsquo;s filings could not be read
                </span>
              )}
            </div>
          )}
          {/* NO FOOTNOTES UNDER THE LIST (Stage 10cp). Each of the four that sat
              here is the hover on the row or tile it explains: the ISIN note on
              "Current holdings carrying an ISIN", why a costless row is out of P&L on
              "No cost basis", why the private register is empty on "Private
              instruments", and which classes the sector ratio leaves out — each
              with its value — on the Sector coverage tile. */}
        </Card>
        <Card title="How refresh works">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-champagne-400" />
            {/* ONE LINE, THE REST ITS HOVER (Stage 10cp). */}
            <p className="text-sm text-slate-400"
              title="Re-running the ingest regenerates src/data/glowData.ts and the audit archive, and the cockpit picks up the new report dates automatically. Accounts are updated independently — an account with no new statement keeps its own older as-of date rather than inheriting the newest.">
              New statements go into <span className="mono text-slate-300">source/</span>, then re-run the ingest
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

function Row({ label, value, muted, title, xa }: { label: string; value: string; muted?: boolean; title?: string; xa?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      {/* `value` stays a STRING. A row that could take a node is a row any
          caller can put a second line inside, and `innerText` breaks a line at
          a flex item — the trap Stage 10ah records on the Entities pill. The
          reason rides in a `title`, which is where this book puts a cause. */}
      <span className={`mono ${muted ? "text-slate-500" : "text-slate-200"}`} title={title} data-xa={xa}>{value}</span>
    </li>
  );
}
