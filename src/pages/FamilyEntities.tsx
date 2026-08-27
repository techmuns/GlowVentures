import { Fragment, useState } from "react";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { Link, useSearchParams } from "react-router-dom";
import { Users, Building2, UserCheck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { SearchInput } from "@/components/SearchInput";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import type { Position } from "@/lib/types";
import {
  byEntity, byCustodian, bySector, sum, sumOrNull, consolidatedMarketValue, dedupedPositions,
  isCompanyShare, isFundVehicle, isDirectEquity, isMandateHeld, excludedClasses, assetClassLabel,
  holdingBucket, bucketLabel, holdingRoute, mandateLabel, ROUTE_LABEL, ROUTE_NOTE,
  DIRECT_EQUITY_BUCKET, MANDATE_BUCKET, UNROUTED_EQUITY_BUCKET,
} from "@/lib/analytics";
import { DIRECT, accountIndex, custodyLabelOf, engagementOf, isDirect, ownerOf } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { BasisPill } from "@/components/BasisPill";
import { AbsentCell, AbsentSection, absentTile } from "@/components/Absent";
import { ownerMeasuredReturn, entityYtdPct } from "@/lib/returns";
import { fmtPct, changeColor, fmtCurrency } from "@/lib/format";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { Auditable } from "@/components/Auditable";
import { holdingHref, auditHref, LEDGER, pnlFormula, returnFormula, weightFormula } from "@/lib/auditFormulas";

/**
 * Sections in reading order, mirroring Portfolio Monitor's: what the entity
 * chose itself, then what it handed to a manager, then the wrappers, then cash.
 * The KEYS come from `holdingBucket` — only the order is decided here, and it is
 * the same order so the two pages read alike.
 *
 * `UNROUTED_EQUITY_BUCKET`, not the raw `"Equity"`, is what `holdingBucket`
 * returns for a share whose account states no route. No account in this book is
 * in that state; spelling it `"Equity"` here would make the entry dead and sort
 * the section below Cash the first time one arrived.
 */
const BUCKET_ORDER = [DIRECT_EQUITY_BUCKET, MANDATE_BUCKET, UNROUTED_EQUITY_BUCKET, "ETF", "Mutual Fund", "AIF", "Bond", "Structured Product", "Unlisted", "Cash"];
const bucketOrd = (b: string) => { const i = BUCKET_ORDER.indexOf(b); return i < 0 ? BUCKET_ORDER.length : i; };

/**
 * THE SELECTED ENTITY LIVES IN THE URL — `/family?entity=<ownerId or name>`.
 *
 * Everything this page says about how a holding came to be held — the sectioned
 * table, the Held via column, the per-mandate sub-headings and their links into
 * `/mandate/<accountId>`, the footer's coverage note and the sector mix narrowed
 * to company shares — renders only for a SELECTED entity. Held in component
 * state alone, all of it sat behind a click: no headless check could reach it,
 * so reverting any of it would have left `check:pages` reporting clean. That is
 * this repo's own "a helper that returns the right number into no caller looks
 * exactly like a working feature", one layer up — an entire screen with no
 * caller but a mouse.
 *
 * The param takes EITHER identifier a reader might have: the canonical
 * `ownerId` slug (`ajay-jaisinghani`) or the display name the chips print
 * (`Ajay Jaisinghani`). `ownerDisplayName` is the registry's own resolution and
 * returns the id unchanged when it is not one, so both forms land in one call
 * and no second name-matching rule is invented here.
 *
 * An unrecognised value falls back to ALL rather than rendering an empty
 * entity: a stale bookmark degrades to the page's default, the same contract
 * `useViewParam` gives every other URL-held view. The default stays param-free
 * so `/family` and `/family?entity=All` never become two URLs for one screen.
 */
const ENTITY_PARAM = "entity";
const ALL_ENTITIES = "All";

/**
 * What this page's weights divide by, in the caller's own words.
 *
 * `weightFormula` takes the scope as a PARAMETER and its default names no set at
 * all, because a helper that guesses one for a caller that has not said is how a
 * wrong denominator got into the popover a reader opens precisely to check the
 * arithmetic. Both weights here are struck against `consolidatedMarketValue(p)`.
 */
const WEIGHT_OF = "the whole consolidated book — every account and every asset class, each dedupeGroup counted once";

export function FamilyEntities() {
  const { portfolio, fmtFromBase, displayCurrency, convertFromBase } = usePortfolio();
  const [searchParams, setSearchParams] = useSearchParams();
  const [holdingsQ, setHoldingsQ] = useState("");
  if (!portfolio) return null;
  const p = portfolio.positions;
  const accIdx = accountIndex(portfolio.accounts);
  // Declared here because the captions below build their sentences from them —
  // money through `fmtFromBase`, never a hard-coded symbol, and a class list
  // through `assetClassLabel` so "Equity" reads as Company Shares everywhere.
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const classList = (cs: { key: string; mv: number }[]) =>
    cs.map((c) => `${assetClassLabel(c.key)} ${money(c.mv)}`).join(", ");
  // The FAMILY total counts each dedupeGroup once; the per-owner rows below do
  // not dedupe, because each owner's row must show their own statement as
  // printed. That is the whole of "carry both, count once".
  const totalMV = consolidatedMarketValue(p);
  // Owner and custodian are separate reads of the account registry: one entity
  // can hold through several platforms, and one platform can serve several
  // entities, so neither is derivable from the other.
  const entities = byEntity(p, portfolio.accounts);
  // See ENTITY_PARAM above. Resolved against the entities THIS BOOK carries, so
  // a name that resolves in the registry but owns nothing here still falls back
  // to All rather than drawing an entity with no rows.
  // An EMPTY param is not an unresolved owner: `ownerDisplayName("")` answers
  // "Unattributed", which is the very name `ownerOf` gives a position whose
  // account is missing from the registry — so calling it unguarded would make
  // bare `/family` select an Unattributed entity the moment a drop carries one.
  const rawEntity = searchParams.get(ENTITY_PARAM) ?? "";
  const wantedEntity = rawEntity ? ownerDisplayName(rawEntity).toLowerCase() : "";
  const scope = (wantedEntity && entities.find((e) => e.key.toLowerCase() === wantedEntity)?.key) || ALL_ENTITIES;
  const setScope = (next: string) => {
    const q = new URLSearchParams(searchParams);
    if (next === ALL_ENTITIES) q.delete(ENTITY_PARAM); else q.set(ENTITY_PARAM, next);
    // Push, not replace, so Back returns to the entity the reader came from.
    setSearchParams(q);
  };
  // Custody is a FAMILY-level allocation ("how much sits at each platform"), so it
  // counts each dedupeGroup once. Run over the raw set it summed both rows of the
  // 360 ONE AIF (both CRNs → 360 ONE) and Transition Fund I (both trusts →
  // Transition), so custodian totals came to ₹338.61 Cr, ₹3.17 Cr over family NAV.
  const consolidatedRows = dedupedPositions(p);
  const cust = byCustodian(consolidatedRows, portfolio.accounts);
  // Which platforms hold each owner's assets — the honest answer to "custody"
  // at entity granularity, where a single label would be a guess.
  const custodiansByOwner = new Map<string, Set<string>>();
  for (const x of p) {
    const who = ownerOf(accIdx, x);
    const set = custodiansByOwner.get(who) ?? new Set<string>();
    set.add(custodyLabelOf(accIdx, x));
    custodiansByOwner.set(who, set);
  }
  const routeOf = (x: Position) => holdingRoute(engagementOf(accIdx, x) || null);
  const bucketOf = (x: Position) => holdingBucket(x, engagementOf(accIdx, x) || null);
  /**
   * ── TWO SETS THAT SHARE THE WORD "DIRECT", AND DO NOT MATCH ──
   *
   * This tile is a CUSTODY figure: `custodyLabelOf` files an account under
   * `DIRECT` when its engagement is `Direct` — the family holds it straight with
   * the AMC or the depository, with no manager and no distributor in between —
   * and under its provider otherwise. It is every ASSET CLASS at those accounts.
   *
   * The holdings tables' `DIRECT_EQUITY_BUCKET` answers a different question:
   * which COMPANY SHARES did the family choose. The two sets differ in BOTH
   * directions on this book, which is why the difference is rendered rather than
   * left for a reader to discover by finding the two figures on two pages.
   * Measured on this drop — every figure below is DERIVED on screen, so it
   * follows the book rather than this comment:
   *
   *   · in custody and not in Direct Equity — the mutual funds and ETFs held
   *     direct, ₹124.47 Cr, which are not shares in a company at all;
   *   · in Direct Equity and not in custody — LKP Securities, ₹0.99 Cr, an
   *     Execution account: the family chose the shares and a broker stands
   *     between them and the depository, so custody files it under LKP.
   *
   * The earlier note here said every account in this book was an external
   * mandate and there were no direct-held positions at all. That stopped being
   * true when the demat and NSDL statements got readers: TEN accounts are run
   * in-house today. The absent branch below is kept for a drop that carries
   * none — it is a real state, just not this one — with a reason that states
   * what is absent rather than asserting what all the accounts are.
   */
  const direct = cust.find((c) => c.key === DIRECT);
  const directMV = direct?.mv ?? 0;
  // `cust` is built from POSITIONS, so the bucket is absent both when no account
  // is run in-house and when the in-house accounts report no holdings. Those are
  // different findings and the absent tile below names whichever one it is.
  const inHouseAccountsInRegistry = portfolio.accounts.filter(isDirect).length;
  const directRows = consolidatedRows.filter((x) => custodyLabelOf(accIdx, x) === DIRECT);
  const directAccounts = new Set(directRows.map((x) => x.accountId)).size;
  // …and the ones the figure does NOT cover. The absent branch below goes to
  // some length to tell "no in-house account" apart from "in-house accounts
  // that report nothing", and the branch that renders on this book made neither
  // distinction: it printed the count of accounts BEHIND the figure and said
  // nothing about the in-house accounts in the registry that contribute no
  // position to it. A figure that exists for SOME accounts is shown for those
  // and the rest are NAMED, in the total's own caption.
  const inHouseAccountsUnreported = inHouseAccountsInRegistry - directAccounts;
  const directEquityRows = consolidatedRows.filter((x) => isDirectEquity(x, engagementOf(accIdx, x) || null));
  const directEquityMV = sum(directEquityRows.map((x) => x.marketValue));
  // What sits in the custody bucket and is not a company share — named with its
  // value, never rolled silently into a figure a reader will take for equity.
  const inHouseNotShares = excludedClasses(directRows, isCompanyShare);
  const inHouseNotSharesMV = sum(inHouseNotShares.map((c) => c.mv));
  // …and the other direction: shares the family chose that custody files
  // elsewhere, because a broker executes them.
  const ownElsewhere = directEquityRows.filter((x) => custodyLabelOf(accIdx, x) !== DIRECT);
  const ownElsewhereMV = sum(ownElsewhere.map((x) => x.marketValue));
  const ownElsewhereWhere = [...new Set(ownElsewhere.map((x) => custodyLabelOf(accIdx, x)))].sort();
  const externalMV = totalMV - directMV;
  const externalCustodians = cust.filter((c) => c.key !== DIRECT);
  const largest = entities[0];
  const entityChart = entities.slice(0, 12).map((e) => ({ name: e.key, value: convertFromBase(e.mv) }));
  const custPie = cust.map((c) => ({ name: c.key, value: c.mv }));
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  const selected = scope === ALL_ENTITIES ? null : p.filter((x) => ownerOf(accIdx, x) === scope);
  // Per-owner figures do NOT dedupe: each entity's rows are its own statements
  // as printed. Every dedupeGroup in this book pairs two DIFFERENT owners (both
  // 360 ONE CRNs, both Transition trusts, Sky's Oncare under both trusts), so no
  // group falls inside one entity and these plain sums tie to the entity NAV in
  // the breakdown table above, which is struck the same way.
  const selRows = selected ?? [];
  const selMV = sum(selRows.map((x) => x.marketValue));
  /**
   * THE SECTOR MIX IS COMPANY SHARES, BECAUSE NOTHING ELSE HAS A SECTOR.
   *
   * A GICS sector is a property of a COMPANY. An AIF folio, a mutual-fund scheme
   * and an ETF are each one line standing for a portfolio somebody else
   * assembled, and no statement in this book prints a sector for one — they all
   * carry "Unclassified". Charted over every position, Aarti's ₹97.68 Cr AIF
   * folio and ₹17.65 Cr of ETFs would have made "Unclassified" the largest bar
   * on her sector chart while describing nothing.
   *
   * `isCompanyShare` — not `isPrivateClass` — is the axis, and every class it
   * leaves out is NAMED with its value below the chart. This is the same
   * narrowing Sector Composition, Exposure & IPS and Return Analysis make, from
   * the same helpers, so the four cannot drift apart.
   *
   * BOTH ROUTES COUNT. A share a discretionary manager picked has a sector
   * exactly like one the family bought; narrowing this to the own-held half
   * would throw away most of the entity's real sector exposure. Which of the two
   * chose a name is the holdings table's question, and it is answered there.
   */
  const selShares = selRows.filter(isCompanyShare);
  const selSharesMV = sum(selShares.map((x) => x.marketValue));
  const selSectors = bySector(selShares);
  const selExcluded = excludedClasses(selRows, isCompanyShare);
  const selExcludedMV = sum(selExcluded.map((c) => c.mv));
  const selMandateShares = selShares.filter((x) => isMandateHeld(engagementOf(accIdx, x) || null));
  const selMandateSharesMV = sum(selMandateShares.map((x) => x.marketValue));
  /**
   * ── THE CAPTION AND THE TABLE ARE KEYED ON DIFFERENT AXES ──
   *
   * `excludedClasses` groups by `assetClass` — what a holding IS. The holdings
   * table below groups by `holdingBucket` — who chose it — and a MANDATE takes
   * its whole account, cash sleeve included, because that is what the manager
   * runs and what the statement totals. The two therefore disagree, and on this
   * book they disagree on exactly one class: CASH. The caption named an entity's
   * whole cash figure and then sent the reader to a Cash section holding only
   * the one row outside a mandate — a measured nil — and, for a member whose
   * only cash row IS a mandate's sleeve, to a table with no Cash section at all.
   *
   * So the caption keeps `excludedClasses` (the chart's own axis: a sector is a
   * property of a company, and a class is what makes a holding not one) and
   * NAMES where the rest of it went, rather than pointing at a grouping it is
   * not keyed on. Derived per class, so a drop where a mandate holds a fund says
   * so without an edit here.
   */
  const selSleeve = selRows.filter((x) => !isCompanyShare(x) && isMandateHeld(engagementOf(accIdx, x) || null));
  const selSleeveMV = sum(selSleeve.map((x) => x.marketValue));
  const selSleeveClasses = excludedClasses(selSleeve, () => false);
  // One class reads better named than repeated — "<value> of Cash", not
  // "<value> (Cash <value>)". Several keep the per-class breakdown.
  const sleeveWhat = selSleeveClasses.length === 1
    ? `${money(selSleeveMV)} of ${assetClassLabel(selSleeveClasses[0].key)}`
    : `${money(selSleeveMV)} (${classList(selSleeveClasses)})`;
  const sleeveNoteText = selSleeve.length === 0 ? ""
    : ` Of that, ${sleeveWhat} sits INSIDE a mandate rather than under a class heading of its own: a mandate is grouped`
      + ` as its own statement totals it, cash sleeve included, so that value is counted in the ${MANDATE_BUCKET} section.`;
  const sleeveNote = selSleeve.length === 0 ? null : (
    <>
      {" "}Of that, {sleeveWhat} sits INSIDE a mandate rather than under a class heading of its own: a mandate is
      grouped as its own statement totals it, cash sleeve included, so that value is counted in the{" "}
      <span className="text-slate-400">{MANDATE_BUCKET}</span> section.
    </>
  );
  const holdings = (() => {
    if (!selected) return [];
    const rows = [...selRows].sort((a, b) => b.marketValue - a.marketValue);
    const s = holdingsQ.trim().toLowerCase();
    return s ? rows.filter((h) => h.security.toLowerCase().includes(s) || (h.isin ?? "").toLowerCase().includes(s)) : rows;
  })();
  /**
   * EACH MANDATE'S OWN TOTALS, struck over every position the account holds
   * BEFORE the search filter. A filtered mandate then prints both figures, so a
   * partial roll-up can never pass for the mandate the statement reports.
   */
  const mandateWhole = new Map<string, { mv: number; count: number }>();
  for (const x of selRows) {
    if (!isMandateHeld(engagementOf(accIdx, x) || null)) continue;
    const e = mandateWhole.get(x.accountId) ?? { mv: 0, count: 0 };
    e.mv += x.marketValue; e.count += 1;
    mandateWhole.set(x.accountId, e);
  }
  /**
   * THE HOLDINGS TABLE, SECTIONED BY `holdingBucket` — the literal complaint.
   *
   * The family clicked a holding and reported that a Carnelian-managed share was
   * presented as theirs to choose: Jammu & Kashmir Bank sat in a flat list beside
   * the shares they had bought in their own demat — Polycab among them at the time,
   * since ring-fenced onto its own page — with nothing on the row saying who chose
   * which. Sectioning answers it at
   * the group level and the "Held via" column answers it per row, which a section
   * heading cannot do once the search box has narrowed the table.
   *
   * Inside the mandate section the rows are grouped by ACCOUNT, because a mandate
   * is an account: its subtotal ties to the statement its manager issued, which
   * is the check that keeps the roll-up honest.
   */
  const groups = (() => {
    const g = new Map<string, Position[]>();
    for (const h of holdings) {
      const k = bucketOf(h);
      const a = g.get(k);
      if (a) a.push(h); else g.set(k, [h]);
    }
    return [...g.entries()].map(([key, rows]) => {
      let mandates: { accountId: string; rows: Position[]; mv: number }[] | null = null;
      if (key === MANDATE_BUCKET) {
        const m = new Map<string, Position[]>();
        for (const h of rows) {
          const a = m.get(h.accountId);
          if (a) a.push(h); else m.set(h.accountId, [h]);
        }
        mandates = [...m.entries()]
          .map(([accountId, rs]) => ({ accountId, rows: rs, mv: sum(rs.map((x) => x.marketValue)) }))
          .sort((a, b) => b.mv - a.mv);
      }
      return { key, rows, mandates, mv: sum(rows.map((x) => x.marketValue)) };
    }).sort((a, b) => bucketOrd(a.key) - bucketOrd(b.key));
  })();
  const showSections = groups.length > 1;
  /**
   * The footer is on the rows' own basis — a plain sum of what is on screen — so
   * the section subtotals add to it exactly. Cost and P&L go through `sumOrNull`:
   * a depository row reports a value and no cost, and folding it in at zero
   * would report the whole value as profit.
   *
   * WHAT THE RETURN COVERS IS STATED IN MONEY, NOT IN A ROW COUNT. The note here
   * read "N rows report no cost basis", which a reader scans as a small share of
   * the table — while on the member holding the promoter stock those few rows
   * are nearly all of the market value printed one cell to the left, and the
   * percentage beside it is struck on the sliver that remains. A count cannot
   * convey coverage in a book where ONE row is most of the NAV; the house
   * convention is the money ("Covers ₹99.4 Cr of ₹461 Cr" on the money-weighted
   * tile), and it is what the footer prints now. Every figure in that sentence
   * is derived here, so it follows the book rather than this note.
   */
  const visMV = sum(holdings.map((h) => h.marketValue));
  const visCost = sumOrNull(holdings.map((h) => h.costBasis));
  const visPnL = sumOrNull(holdings.map((h) => h.unrealizedPnL));
  const visRet = visCost !== null && visPnL !== null && visCost > 0 ? (visPnL / visCost) * 100 : null;
  const visNoCostRows = holdings.filter((h) => h.costBasis === null || h.costBasis === undefined);
  const visNoCost = visNoCostRows.length;
  const visNoCostMV = sum(visNoCostRows.map((h) => h.marketValue));
  const filtered = holdings.length !== selRows.length;
  const holdingRow = (h: Position) => {
    const acc = accIdx.get(h.accountId);
    const route = routeOf(h);
    /**
     * THE FLAG ALONE IS NOT THE TEST. `costUnavailable` is optional on
     * `Position` and the GENERATED BOOK NEVER SETS IT — `grep -c costUnavailable
     * src/data/glowData.ts` is 0 — so this cell read the flag, found it
     * undefined on all 61 positions that carry `costBasis: null`, and fell
     * through to `fmtPct(null)`: a BARE em dash, styled as a return, beside the
     * footer note that says those rows are skipped for having no cost. The
     * composite test is what every other surface uses (`PortfolioMonitor` at the
     * three places it groups, `analytics.isPriced`), and it is what the footer's
     * own `visNoCost` counts, so the row and the total now name the same set.
     */
    const noCost = !!h.costUnavailable || h.costBasis === null || h.costBasis === undefined;
    return (
      <tr key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
        <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={h.securityKey} name={h.security} /></td>
        {/* WHO CHOSE THIS ROW. A section heading answers it for a group and stops
            answering it the moment the search box narrows the table, so the route
            is on the row as well — and for a mandate-held share it is the mandate
            itself, linking to the drill-down where the manager's own figures are. */}
        <td className="px-4 py-2.5 text-[11.5px] text-slate-500">
          {route === "mandate" && acc
            ? <Link to={`/mandate/${encodeURIComponent(h.accountId)}`}
                title={`${mandateLabel(acc)} — ${acc.provider}, account ${acc.accountNo}. ${ROUTE_NOTE.mandate}. Open the mandate drill-down.`}
                className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                {mandateLabel(acc)}
              </Link>
            : <span title={ROUTE_NOTE[route]}>{ROUTE_LABEL[route]}</span>}
        </td>
        {/* A FUND HAS NO SECTOR, AND "Unclassified" IS THE WRONG WAY TO SAY SO:
            it reads as a sector the pipeline failed to map, which is the cell a
            directly-held share gets when its statement printed none. */}
        <td className="px-4 py-2.5 text-slate-400">
          {isFundVehicle(h)
            ? <AbsentCell reason="a fund holds many sectors and its statement prints none; the look-through would need the scheme's own portfolio disclosure, which this book does not carry for this folio" />
            : h.sector}
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-200"><Auditable to={holdingHref(accIdx.get(h.accountId), h.security)} title="Market value — trace to this account's appraisal">{fmtFromBase(h.marketValue, { compact: true })}</Auditable></td>
        <td className={`px-4 py-2.5 text-right mono ${noCost ? "text-slate-500" : changeColor(h.returnPct)}`}>{noCost ? <AbsentCell reason="this statement reports a value and no cost, so there is no basis to strike a return on — the row is left out of the total below rather than counted as zero" /> : <Auditable formula={returnFormula(h.marketValue, h.costBasis, h.returnPct, money, holdingHref(accIdx.get(h.accountId), h.security))}>{fmtPct(h.returnPct, { sign: true })}</Auditable>}</td>
      </tr>
    );
  };
  return (
    <div>
      <PageHeader eyebrow="Allocation" title="Family & Entities"
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Entity NAVs are rebuilt from live prices where a quote exists; cost basis comes from the statements." />
          <Pill tone="info">{entities.length} entities</Pill>
        </div>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Entities" value={entities.length} sub="distinct owners in the book" icon={<Users className="h-4 w-4" />} />
        <StatTile label="Largest entity" value={largest?.key ?? "—"} sub={largest ? <><Auditable to={auditHref({ ...LEDGER, find: largest.key })} title="Largest entity NAV — trace to the ledger">{fmtFromBase(largest.mv, { compact: true })}</Auditable>{" · "}<Auditable formula={weightFormula(largest.mv, totalMV, largest.weight * 100, money, WEIGHT_OF)}>{`${(largest.weight * 100).toFixed(0)}%`}</Auditable></> : "—"} icon={<Building2 className="h-4 w-4" />} />
        {direct
          ? <StatTile label="In-house custody"
              value={<Auditable formula={{ title: "In-house custody share", excel: "= In-house market value ÷ Total market value × 100", plain: "The share of the whole book — every asset class — sitting at accounts the family runs itself, with no manager and no distributor between it and the issuer. This is a CUSTODY figure. It is NOT the holdings tables' Direct Equity, which counts company shares only and includes shares bought through a broker.", worked: `= ${money(directMV)} ÷ ${money(totalMV)} × 100 = ${((directMV / totalMV) * 100).toFixed(0)}%`, auditHref: auditHref(LEDGER) }}>{`${((directMV / totalMV) * 100).toFixed(0)}%`}</Auditable>}
              sub={<><Auditable to={auditHref(LEDGER)} title="In-house NAV — trace to the ledger">{fmtFromBase(directMV, { compact: true })}</Auditable>{inHouseAccountsUnreported > 0
                ? ` · ${directAccounts} of ${inHouseAccountsInRegistry} accounts`
                : ` · ${directAccounts} account${directAccounts === 1 ? "" : "s"}`}</>}
              hint={<>Custody, not choice — every asset class at those accounts{inHouseNotShares.length > 0 && <>, of which {money(inHouseNotSharesMV)} is not a share in a company at all ({classList(inHouseNotShares)})</>}. The holdings tables&rsquo; <span className="text-slate-400">Direct Equity</span> is a different set: company shares only, {money(directEquityMV)}{ownElsewhere.length > 0 && <>, and it includes {money(ownElsewhereMV)} bought through {ownElsewhereWhere.join(", ")}, which custody files under that name rather than here</>}.{inHouseAccountsUnreported > 0 && <> The other {inHouseAccountsUnreported} in-house account{inHouseAccountsUnreported === 1 ? "" : "s"} in the registry {inHouseAccountsUnreported === 1 ? "carries" : "carry"} no position in this book, so {inHouseAccountsUnreported === 1 ? "it is" : "they are"} outside this figure rather than counted at zero.</>}</>}
              icon={<Wallet className="h-4 w-4" />} />
          : <StatTile label="In-house custody"
              {...absentTile(
                inHouseAccountsInRegistry > 0
                  ? `the ${inHouseAccountsInRegistry} in-house account${inHouseAccountsInRegistry === 1 ? "" : "s"} in this book report no holdings`
                  : "no account in this book is held in the family's own name at the issuer",
                inHouseAccountsInRegistry > 0
                  ? "The accounts exist in the registry and no statement in this drop values a holding in one, so there is nothing to measure. A 0% would say they are empty, which is a different claim from not having been reported."
                  : "Every account here reaches its assets through a manager, a distributor or a broker, so there is no in-house bucket to measure. A 0% would say the family runs an in-house book that holds nothing, which is a different claim.")}
              icon={<Wallet className="h-4 w-4" />} />}
        <StatTile label="External custodians" value={<Auditable formula={{ title: "External-custody share", excel: "= External market value ÷ Total market value × 100", plain: "The share of the whole book held through external custodians, managers, distributors and brokers, rather than in the family's own name at the issuer.", worked: `= ${money(externalMV)} ÷ ${money(totalMV)} × 100 = ${((externalMV / totalMV) * 100).toFixed(0)}%`, auditHref: auditHref(LEDGER) }}>{`${((externalMV / totalMV) * 100).toFixed(0)}%`}</Auditable>} sub={<>{externalCustodians.length} custodian{externalCustodians.length === 1 ? "" : "s"}{" · "}<Auditable to={auditHref(LEDGER)} title="External-custody NAV — trace to the ledger">{fmtFromBase(externalMV, { compact: true })}</Auditable></>} icon={<UserCheck className="h-4 w-4" />} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {[ALL_ENTITIES, ...entities.map((e) => e.key)].map((m) => {
          const active = scope === m;
          return (
            <button key={m} onClick={() => setScope(m)}
              className={["rounded-md border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]",
                active ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {m === ALL_ENTITIES ? "All entities" : m}
            </button>
          );
        })}
      </div>
      {!selected && (
        <>
          <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
            <Card className="lg:col-span-2" title="Market value by entity">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entityChart} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                    <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="name" stroke="#6b6880" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis stroke="#6b6880" fontSize={11} tickFormatter={axisFmt} width={84} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                      formatter={(v: number) => [fmtCurrency(v, displayCurrency, { compact: true }), "NAV"]} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {entityChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title={direct ? "In-house vs external" : "Custody"}
              subtitle={direct ? "Where the capital sits — the platform, not the decision" : `Who custodies the capital — all of it external, across ${externalCustodians.length} manager${externalCustodians.length === 1 ? "" : "s"}`}>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={custPie} dataKey="value" innerRadius={46} outerRadius={70} paddingAngle={2} stroke="none">
                      {custPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                      formatter={(v: number) => fmtFromBase(v, { compact: true })} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5">
                {cust.map((c, i) => (
                  <li key={c.key} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{c.key}</span>
                    <span className="mono text-slate-200"><Auditable to={auditHref(LEDGER)} title={`${c.key} NAV — trace to the ledger`}>{fmtFromBase(c.mv, { compact: true })}</Auditable></span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card className="mt-5" title="Entity breakdown" pad={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">NAV</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Positions</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&L</th>
                    <th className="label-xs px-4 py-2 text-right font-medium" title="Cumulative unrealized return on cost (holding-period, not annualized)">Return</th>
                    <th className="label-xs px-4 py-2 text-right font-medium" title="Money-weighted return earned to date (Excel XIRR, de-annualised to the window) over dated cash flows">Return (to date)</th>
                    <th className="label-xs px-4 py-2 text-right font-medium" title="Financial-year-to-date return (since 1 Apr), flow-adjusted">YTD</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Custody</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {entities.map((e) => {
                    // Money-weighted return over this owner's MEASURABLE accounts
                    // only — closing the whole entity MV against partial openings
                    // returned +147%/+353% here for real family members.
                    const mwr = ownerMeasuredReturn(portfolio, p, e.key);
                    const xirrPct = mwr.toDatePct;
                    const coverNote = mwr.annPct == null ? undefined
                      : `${fmtPct(mwr.annPct, { sign: true })} p.a. annualised. Covers ${money(mwr.measuredMV)} of ${money(e.mv)}${mwr.excluded.length ? ` — ${mwr.excluded.length === 1 ? "account" : "accounts"} ${mwr.excluded.join(", ")} carry no opening portfolio value and are excluded on both sides` : ""}.`;
                    const ytdPct = entityYtdPct(portfolio, e.key, e.mv);
                    return (
                      <tr key={e.key} className="cursor-pointer hover:bg-ink-700/40" onClick={() => setScope(e.key)}>
                        <td className="px-4 py-2.5 font-medium text-slate-100">{e.key}</td>
                        <td className="px-4 py-2.5 text-right mono text-slate-200"><Auditable to={auditHref({ ...LEDGER, find: e.key })} title="Entity NAV — trace to the ledger">{fmtFromBase(e.mv, { compact: true })}</Auditable></td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400"><Auditable formula={weightFormula(e.mv, totalMV, e.weight * 100, money, WEIGHT_OF)}>{`${(e.weight * 100).toFixed(1)}%`}</Auditable></td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400">{e.count}</td>
                        <td className={`px-4 py-2.5 text-right mono ${changeColor(e.pnl)}`}><Auditable formula={pnlFormula(e.mv, e.cost, e.pnl, money, auditHref({ ...LEDGER, find: e.key }))}>{fmtFromBase(e.pnl, { compact: true, sign: true })}</Auditable></td>
                        <td className={`px-4 py-2.5 text-right mono ${changeColor(e.returnPct)}`}><Auditable formula={returnFormula(e.mv, e.cost, e.returnPct, money, auditHref({ ...LEDGER, find: e.key }))}>{fmtPct(e.returnPct, { sign: true })}</Auditable></td>
                        <td className={`px-4 py-2.5 text-right mono ${xirrPct == null ? "text-slate-500" : changeColor(xirrPct)}`}>
                          {xirrPct == null
                            ? <AbsentCell reason="no account for this entity carries an opening portfolio value — a money-weighted return needs one on both sides, and closing the whole entity value against a subset would overstate it" />
                            : <span title={coverNote}>{fmtPct(xirrPct, { sign: true })}</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right mono ${ytdPct == null ? "text-slate-500" : changeColor(ytdPct)}`}>
                          {ytdPct == null
                            ? <AbsentCell reason="needs a per-entity NAV on 1 April; no statement in this book carries one" />
                            : fmtPct(ytdPct, { sign: true })}
                        </td>
                        <td className="px-4 py-2.5 text-left text-[12px] text-slate-400">
                          {[...(custodiansByOwner.get(e.key) ?? [])].sort().join(", ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      {selected && (
        <>
          <Card className="mt-5" title={`${scope} — sector mix`}
            subtitle={selShares.length === 0
              ? <>No company shares — this entity holds fund vehicles and cash only{" · "}{selRows.length} position{selRows.length === 1 ? "" : "s"}{" · "}
                <Auditable to={auditHref({ ...LEDGER, find: scope })} title="Entity NAV — trace to the ledger">{fmtFromBase(selMV, { compact: true })}</Auditable> NAV</>
              : <>Company shares only — {selShares.length} of {selRows.length} positions{" · "}{money(selSharesMV)} of{" "}
                <Auditable to={auditHref({ ...LEDGER, find: scope })} title="Entity NAV — trace to the ledger">{fmtFromBase(selMV, { compact: true })}</Auditable> NAV</>}>
            {selShares.length === 0
              ? <AbsentSection what={`${scope} holds no shares in a company`}
                  needs={`Every one of this entity's ${selRows.length} position${selRows.length === 1 ? "" : "s"} is a fund vehicle or cash — ${classList(selExcluded)}. A GICS sector is a property of a company; a fund holds many and no statement in this book prints one for a folio, so there is no sector mix to draw rather than an empty frame with axes around nothing. The holdings table below lists every one of them.${sleeveNoteText}`} />
              : <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selSectors.map((s) => ({ name: s.key, value: convertFromBase(s.mv) }))} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                      <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="name" stroke="#6b6880" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
                      <YAxis stroke="#6b6880" fontSize={11} tickFormatter={axisFmt} width={84} />
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                        formatter={(v: number) => [fmtCurrency(v, displayCurrency, { compact: true }), "NAV"]} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {selSectors.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>}
            {/* When there are no company shares at all the AbsentSection above has
                already named every class, so this would only say it twice. */}
            {selShares.length > 0 && <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {selMandateShares.length > 0 && <>Both routes count here: {money(selMandateSharesMV)} of these shares were chosen by a
                discretionary manager and have a sector exactly like the ones {scope} bought directly. Which of the two chose a
                name is in the <span className="text-slate-400">Held via</span> column below.{" "}</>}
              {selExcluded.length > 0
                ? <>{money(selExcludedMV)} across {selExcluded.reduce((n, c) => n + c.count, 0)} position
                  {selExcluded.reduce((n, c) => n + c.count, 0) === 1 ? "" : "s"} is excluded rather than folded in — {classList(selExcluded)}.
                  A GICS sector is a property of a COMPANY; a fund holds many and no statement in this book prints a sector for a
                  folio, so every wrapper would land in one false “Unclassified” slice and bury the sectors this chart exists to show.
                  All of them are in the holdings table below.{sleeveNote}</>
                : <>Every one of this entity&rsquo;s positions is a share in a company, so nothing is excluded from the chart above.</>}
            </p>}
          </Card>
          <Card className="mt-5" title={`${scope} — holdings`} pad={false}
            subtitle={<>Grouped by how each holding came to be held — what {scope} chose directly, what a discretionary manager chose
              under a mandate, and the fund vehicles and cash beside them.</>}
            right={<SearchInput value={holdingsQ} onChange={setHoldingsQ} placeholder="Search this entity…" className="w-56" suggestions={Array.from(new Set(selRows.map((x) => x.security))).sort()} />}>
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                    {/* WHO CHOSE IT. The complaint this page existed to answer and
                        did not: a Carnelian-managed share sat beside a self-bought
                        one with nothing on the row telling them apart. */}
                    <th className="label-xs px-4 py-2 text-left font-medium">Held via</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Sector</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Market value</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {groups.map((grp) => (
                    <Fragment key={grp.key}>
                      {showSections && (
                        <tr className="bg-ink-900/50">
                          <td colSpan={5} className="px-4 py-1.5">
                            <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-champagne-500">
                              {bucketLabel(grp.key)}
                              <span className="font-normal normal-case tracking-normal text-slate-500">
                                {grp.mandates ? `· ${grp.mandates.length} ${grp.mandates.length === 1 ? "mandate" : "mandates"} ` : ""}· {grp.rows.length} {grp.rows.length === 1 ? "holding" : "holdings"} · {money(grp.mv)}
                              </span>
                              {/* A MEASURED ZERO KEEPS ITS ZERO and says why it is
                                  one: the section is not empty, every statement in
                                  it reports a nil balance. */}
                              {grp.rows.length > 0 && grp.rows.every((r) => r.marketValue === 0) && (
                                <span className="font-normal normal-case tracking-normal text-slate-500"
                                  title="Not an absent figure: every statement in this section reports a nil balance, so the subtotal is a measurement. It is a fact about THIS section, not about the class: a mandate's own cash sleeve is totalled inside its mandate.">
                                  · a measured nil — every row in this section is reported at zero
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>
                      )}
                      {grp.mandates
                        ? grp.mandates.map((mg) => {
                            const acc = accIdx.get(mg.accountId);
                            const whole = mandateWhole.get(mg.accountId);
                            return (
                              <Fragment key={mg.accountId}>
                                {/* Indented, not merely shaded: the nesting has to
                                    read in both themes, and a translucent tint over
                                    a white card in light mode does not. */}
                                <tr className="bg-ink-900/40">
                                  <td colSpan={5} className="py-1.5 pl-9 pr-4">
                                    <span className="flex flex-wrap items-center gap-2 text-[11.5px]">
                                      <Link to={`/mandate/${encodeURIComponent(mg.accountId)}`}
                                        title={`${mandateLabel(acc)} — ${acc?.provider ?? "manager not in the account registry"}, account ${acc?.accountNo ?? "—"}. Open the mandate drill-down.`}
                                        className="font-medium text-slate-200 underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                                        {mandateLabel(acc)}
                                      </Link>
                                      {/* The manager and the account number are printed
                                          beside the name because two of this book's
                                          mandates can share a strategy name — they are
                                          run for two different members, so they never
                                          collide inside one entity, and the account
                                          number settles it if that ever changes. */}
                                      <span className="text-slate-500">
                                        {acc?.provider ?? "manager not in the account registry"} · account {acc?.accountNo ?? "—"} ·{" "}
                                        {whole && mg.rows.length < whole.count
                                          ? <>{mg.rows.length} of {whole.count} holdings match the search — the mandate itself holds {money(whole.mv)}</>
                                          : <>{mg.rows.length} {mg.rows.length === 1 ? "holding" : "holdings"} · {money(mg.mv)}</>}
                                      </span>
                                    </span>
                                  </td>
                                </tr>
                                {mg.rows.map(holdingRow)}
                              </Fragment>
                            );
                          })
                        : grp.rows.map(holdingRow)}
                    </Fragment>
                  ))}
                  {holdings.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-500">No holdings match “{holdingsQ}”.</td></tr>}
                </tbody>
                {holdings.length > 0 && (
                  <tfoot className="border-t border-ink-700 bg-ink-900/40">
                    <tr>
                      <td colSpan={3} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                        Total
                        <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
                          {filtered
                            ? <>{holdings.length} of {selRows.length} positions match the search — {scope} holds {money(selMV)} in all</>
                            : <>{holdings.length} {holdings.length === 1 ? "position" : "positions"}</>}
                          {showSections && <> · the section subtotals above add to this figure</>}
                          {visNoCost > 0 && (visCost === null
                            ? <> · every one of these {visNoCost} {visNoCost === 1 ? "row reports" : "rows report"} a value and no cost basis, carrying {money(visNoCostMV)} with nothing to measure a return against</>
                            : <> · the return covers {money(visMV - visNoCostMV)} of the {money(visMV)} beside it, struck on {money(visCost)} of cost — the other {visNoCost} {visNoCost === 1 ? "row" : "rows"}, carrying {money(visNoCostMV)}, {visNoCost === 1 ? "reports" : "report"} no cost basis and {visNoCost === 1 ? "is" : "are"} skipped rather than counted as zero</>)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-100">{money(visMV)}</td>
                      <td className={`px-4 py-2.5 text-right mono ${visRet == null ? "text-slate-500" : changeColor(visRet)}`}>
                        {visRet == null
                          ? <AbsentCell reason={visCost === null
                              ? "no row on screen reports a cost basis, so there is nothing to strike a return on — a 0.00% here would read as a book that broke even"
                              : "the rows on screen that do report a cost basis leave no positive cost to divide by, so no return can be struck — a 0.00% here would read as a book that broke even"} />
                          : fmtPct(visRet, { sign: true })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
