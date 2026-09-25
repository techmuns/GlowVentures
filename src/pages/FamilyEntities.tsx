import { Fragment, useMemo, useState } from "react";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { SearchInput } from "@/components/SearchInput";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import type { Position } from "@/lib/types";
import {
  byEntity, byCustodian, bucketBy, sum, sumOrNull, consolidatedMarketValue, dedupedPositions,
  isCompanyShare, isFundVehicle, isDirectEquity, isMandateHeld, excludedClasses, assetClassLabel,
  holdingBucket, bucketLabel, holdingRoute, mandateLabel, ROUTE_LABEL, ROUTE_NOTE,
  DIRECT_EQUITY_BUCKET, MANDATE_BUCKET, UNROUTED_EQUITY_BUCKET,
} from "@/lib/analytics";
import { DIRECT, accountIndex, custodyLabelOf, engagementOf, isDirect, ownerOf, unvaluedHoldingsOf, unvaluedStatementLinesOf } from "@/lib/accounts";
import { BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { fifoTotals } from "@/lib/fifo";
import { companySectorIndex } from "@/lib/lookthrough";
import { useStockExposure } from "@/lib/useStockExposure";
import { UNCLASSIFIED } from "@/lib/sectors";
import { ownerDisplayName } from "@/lib/owners";
import { BasisPill } from "@/components/BasisPill";
import { AbsentCell, AbsentFromBook, AbsentSection, DASH } from "@/components/Absent";
import { ownerMeasuredReturn, entityYtdPct } from "@/lib/returns";
import { fmtNum, fmtPct, changeColor, fmtCurrency } from "@/lib/format";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

/** The entity table's columns, in the order its rows write their cells. */
const ENTITY_COLS = ["entity", "nav", "weight", "positions", "pnl", "return", "toDate", "ytd"] as const;
/** ...and the holdings table beneath it. */
const FE_HOLDING_COLS = ["security", "heldVia", "sector", "value", "return"] as const;
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { Auditable } from "@/components/Auditable";
import { pnlFormula, returnFormula, weightFormula } from "@/lib/auditFormulas";

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
 * ── WHAT THE ENTITY WEIGHTS DIVIDE BY: ONE BASIS, AND IT IS STATED ──────────
 *
 * The weights used to be struck by `bucketBy` over the entity rows' OWN total —
 * every statement as printed, ₹716.46 Cr — while the popover named the
 * CONSOLIDATED book, ₹713.29 Cr, as the denominator. So the popover a reader
 * opens to check a weight printed "this does not reproduce" on three of the six
 * rows. Neither total is wrong; the page used one and said the other.
 *
 * THE PER-STATEMENT TOTAL IS THE ONE, because it is the only one the column can
 * add to. Each entity's row is its own statements as printed (§ "consolidated
 * counts once, per-account does not"), and two holdings are reported by two
 * entities each — 360 ONE Special Opportunities under Ajay's and Bharat's CRNs,
 * Transition Venture Fund I under both trusts — so over the consolidated book
 * the six weights would add to 100.4%. Over the rows' own total they add to
 * 100%, and the gap to the book is NAMED under the table, with the holdings it
 * is made of, rather than left for a reader to find by adding six NAVs.
 *
 * `weightFormula` takes the set as a PARAMETER because a helper that guesses one
 * is how the wrong denominator got into the popover in the first place; the
 * sentence here is built from the same figures the division uses.
 */
const weightOfEntities = (money: (n: number) => string, perStatement: number, consolidated: number, overlap: Overlap) =>
  `every entity's own statements added up as printed — ${money(perStatement)}, the total in the division below`
  + (overlap.names.length
    ? `. It counts ${overlap.names.length === 1 ? "one holding" : `${overlap.names.length} holdings`} ${overlap.times}, because ${overlap.names.length === 1 ? "it is" : "they are"} ${overlap.how} (${overlap.names.join("; ")}); the consolidated book, counting each once, is ${money(consolidated)}`
    : "; no holding is reported by two entities, so it is also the consolidated book");

/**
 * HOW THE OVERLAP IS WORDED IS READ OFF THE GROUPS, never assumed. "Reported by
 * two entities each" and "counted twice" are true of this book — both of its
 * duplicated holdings sit under exactly two entities — and would be false of a
 * group spanning three statements, or two accounts of ONE entity. The sentence
 * says only what the groups it names actually are.
 */
type Overlap = { names: string[]; times: string; how: string };
const overlapWording = (groups: { owners: string[]; rows: number }[], names: string[]): Overlap => ({
  names,
  times: groups.every((g) => g.rows === 2) ? "twice" : "more than once",
  how: groups.every((g) => g.owners.length === 2 && g.rows === 2) ? "reported by two entities each"
    : groups.every((g) => g.owners.length > 1) ? "each reported by more than one entity"
    : "each reported on more than one statement",
});

export function FamilyEntities() {
  const { portfolio, statementPortfolio, consolidated, fmtFromBase, displayCurrency, convertFromBase } = usePortfolio();
  const [searchParams, setSearchParams] = useSearchParams();
  const [holdingsQ, setHoldingsQ] = useState("");
  const entityView = useTableView("family-entities", ENTITY_COLS);
  const holdView = useTableView("family-holdings", FE_HOLDING_COLS);
  /**
   * ── THE SECTORS ARE SECTOR COMPOSITION'S, NOT THIS PAGE'S OWN ─────────────
   *
   *   *"we have already classified every stock in the sector composition page,
   *    use the same classification in the families and entities classifications,
   *    unclassified should not be the top classification."*
   *
   * This page read `Position.sector` — the family's own statement and nothing
   * else — while Sector Composition resolves a company through THREE tiers, and
   * a depository statement prints an ISIN, a quantity and a rate and NO industry
   * at all. So the two screens answered the same question differently, and on
   * this one "Unclassified" was the LARGEST BAR for every member who holds
   * through a demat. Measured on this book, before and after:
   *
   *   Ajay     54.4% Unclassified, 11 sectors  →   8.6%, 12 sectors
   *   Bharat  100.0% Unclassified,  1 sector   →   4.5%, 10 sectors
   *   Ankita   40.8% Unclassified, 11 sectors  →   0.0%, 12 sectors
   *   Aarti   100.0% Unclassified,  1 sector   →   0.0%,  1 sector
   *
   * and Unclassified is the top bar for none of the four, which is the ask.
   *
   * ONE DEFINITION, SHARED — `companySectorIndex` is a projection of
   * `companyExposure`, the function Sector Composition and the Monitor's stock
   * axis are both built on. Nothing about the tiers is re-derived here, and the
   * lower two can only ever FILL an empty sector: a holding whose own statement
   * printed one keeps it, on this page exactly as on that one.
   *
   * NO VALUE CROSSES OVER. Only `sector` is read; `derived` and `total` are not
   * touched, so every figure on this page is still the entity's own measured
   * market value and the card's total is unchanged to the rupee. This is a
   * re-CLASSIFICATION, not a re-measurement, and that is what makes it safe.
   *
   * ENABLED ONLY WHERE A SECTOR IS DRAWN. Everything keyed on this renders for a
   * SELECTED entity, so the All-entities default pays for no fetch at all. It is
   * read off the raw param rather than off the resolved `scope`, which is not
   * available this early and which every hook here has to run before: a param
   * naming an entity this book does not carry falls back to All and fetches once
   * for nothing, which is the cheaper of the two mistakes.
   */
  const sectorsWanted = (searchParams.get(ENTITY_PARAM) ?? "") !== "";
  const exposure = useStockExposure(consolidated, sectorsWanted);
  /**
   * OVER EVERY COMPANY SHARE, AND DELIBERATELY NOT `currentHoldings(...)`.
   *
   * `currentHoldings` keeps a closed position and a sub-₹1,000 speck out of an
   * ALLOCATION FIGURE, which is right for a total and wrong for a lookup table:
   * a company's sector does not depend on how much of it the family holds. This
   * page's own chart DRAWS those rows — Ankita's book carries two, a ₹60
   * preference line and a ₹580 demat row — so narrowing the index would have
   * sent exactly those two to Unclassified while placing everything around
   * them, which is this change running backwards on the rows least able to
   * defend themselves.
   *
   * It costs nothing: the index is a classification, it enters no total, and
   * `useStockExposure` still narrows the DENOMINATOR it is right to narrow —
   * which fund holdings the family currently has.
   */
  const companySectors = useMemo(
    () => companySectorIndex(consolidated.filter(isCompanyShare), exposure),
    [consolidated, exposure],
  );
  /** This page's one answer to "what sector is this row in", for chart and table alike. */
  const sectorOf = (x: Position) => companySectors.get(x.securityKey)?.sector || UNCLASSIFIED;
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
  /**
   * EACH ENTITY'S RETURN IS FIFO, AND A WHOLE MANDATE IS STRUCK ON ITS CAPITAL.
   * `byEntity` rolls up every holding with no account registry, so it cannot
   * see that an entity holds the whole of a PMS mandate — and an entity's
   * mandates carry most of its realised gains. Over the holdings that report a
   * cost, which is the set this column has always been struck on.
   */
  const entities = byEntity(p, portfolio.accounts).map((e) => {
    const fifo = fifoTotals(
      p.filter((x) => ownerOf(accIdx, x) === e.key && x.costBasis != null && !x.costUnavailable),
      { accounts: accIdx, universe: p },
    );
    return { ...e, returnPct: fifo.returnPct, fifo };
  });
  /**
   * THE ENTITY ROWS' OWN TOTAL, AND WHAT SEPARATES IT FROM THE BOOK.
   *
   * `perStatementMV` is what the NAV column adds to and what the weights divide
   * by (`weightOfEntities`). `totalMV` is the consolidated book. The difference
   * is exactly the extra rows of each `dedupeGroup` that spans two entities —
   * derived from the groups themselves, never by subtracting the two totals, so
   * the sentence under the table names the holdings the gap is made of and the
   * two figures are shown to tie rather than assumed to.
   */
  const perStatementMV = sum(entities.map((e) => e.mv));
  const overlap = (() => {
    const g = new Map<string, Position[]>();
    for (const x of p) {
      if (!x.dedupeGroup) continue;
      const a = g.get(x.dedupeGroup);
      if (a) a.push(x); else g.set(x.dedupeGroup, [x]);
    }
    return [...g.values()].filter((rows) => rows.length > 1).map((rows) => ({
      name: rows[0].security,
      owners: [...new Set(rows.map((x) => ownerOf(accIdx, x)))],
      rows: rows.length,
      // `dedupedPositions` keeps the FIRST row of a group; the rest are the
      // amount a per-statement sum carries twice.
      extra: sum(rows.slice(1).map((x) => x.marketValue)),
    }));
  })();
  const overlapMV = sum(overlap.map((o) => o.extra));
  const overlapNames = overlap.map((o) => `${o.name}, under ${o.owners.join(" and ")}`);
  const overlapSaid = overlapWording(overlap, overlapNames);
  const entityWeightOf = weightOfEntities((n) => money(n), perStatementMV, totalMV, overlapSaid);
  // The table's own order; the default is `byEntity`'s (largest first).
  const entityRows = sortRows(entities, entityView.sort, {
    entity: (e) => e.key,
    nav: (e) => e.mv,
    // Weight is this entity's value over the book's, so it orders as NAV does.
    weight: (e) => e.mv,
    positions: (e) => e.count,
    pnl: (e) => e.pnl,
    return: (e) => e.returnPct,
    toDate: (e) => ownerMeasuredReturn(statementPortfolio ?? portfolio, p, e.key).toDatePct,
    ytd: (e) => entityYtdPct(portfolio, e.key, e.mv),
  });
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
  /**
   * Which platforms hold each owner's assets — the honest answer to "custody"
   * at entity granularity, where a single label would be a guess.
   *
   * IT WAS A COLUMN AND IS NOW THE ENTITY CELL'S OWN HOVER, at the family's
   * request: one member here holds through fourteen platforms, so it was the
   * widest cell in the table and the reason the table could not sit beside the
   * pie. A hover is weaker than a column and is said so rather than glossed —
   * what makes the trade affordable is that the fact is not merely preserved
   * here but ANSWERED BETTER one click in: clicking the row scopes the page to
   * that entity, where the holdings table names the platform PER ROW and says
   * which of them CHOSE it, which a set of names per owner cannot.
   */
  const custodiansByOwner = new Map<string, Set<string>>();
  for (const x of p) {
    const who = ownerOf(accIdx, x);
    const set = custodiansByOwner.get(who) ?? new Set<string>();
    set.add(custodyLabelOf(accIdx, x));
    custodiansByOwner.set(who, set);
  }
  const custodyNote = (who: string) => {
    const list = [...(custodiansByOwner.get(who) ?? [])].sort();
    if (!list.length) return undefined;
    return `Held through ${list.length} platform${list.length === 1 ? "" : "s"}: ${list.join(", ")}.`
      + ` Which of them CHOSE each holding is a different question — click this row for ${who}'s own table,`
      + ` where the platform and the route are on each holding rather than gathered per owner.`;
  };
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
  /**
   * ── THE TWO FIGURES THE REMOVED TILES CARRIED AND NOTHING ELSE STATES ─────
   *
   * The pie's legend prints every custodian's VALUE and no share of anything;
   * the two percentages were the tiles' own, and they are what a reader takes
   * off this card. Rendered in the subtitle rather than left to be divided:
   * the legend's own rows do not add to the book on screen, because the book's
   * total is not on this card.
   *
   * The arithmetic rides in one `title` on the line, which is what an
   * `Auditable` popover would say — the underline itself is what the family
   * have been removing from figures, and a subtitle is not a figure.
   */
  const pctOfBook = (n: number) => `${((n / totalMV) * 100).toFixed(0)}%`;
  const splitWorking = `In-house = ${money(directMV)} ÷ ${money(totalMV)} × 100 = ${pctOfBook(directMV)}.`
    + ` External = ${money(externalMV)} ÷ ${money(totalMV)} × 100 = ${pctOfBook(externalMV)}.`
    + ` The denominator is the whole consolidated book — every account and every asset class, each dedupeGroup counted once.`;
  /**
   * WHAT THIS FIGURE IS NOT, which is the one claim from the removed tile that
   * will not fit a caption. Custody answers WHERE an asset sits; the holdings
   * tables' Direct Equity answers WHO CHOSE IT, and the two sets differ in BOTH
   * directions on this book — the in-house accounts hold funds and ETFs that are
   * not shares in a company at all, and the family's own broker-executed shares
   * are filed under the broker. Every figure in it is derived, so it follows the
   * book rather than this comment.
   */
  const inHouseNote = [
    `Custody, not choice — every asset class at those accounts`
      + (inHouseNotShares.length > 0 ? `, of which ${money(inHouseNotSharesMV)} is not a share in a company at all (${classList(inHouseNotShares)})` : "")
      + `.`,
    `The holdings tables' Direct Equity is a different set: company shares only, ${money(directEquityMV)}`
      + (ownElsewhere.length > 0 ? `, and it includes ${money(ownElsewhereMV)} bought through ${ownElsewhereWhere.join(", ")}, which custody files under that name rather than here` : "")
      + `.`,
    inHouseAccountsUnreported > 0
      ? `The other ${inHouseAccountsUnreported} in-house account${inHouseAccountsUnreported === 1 ? "" : "s"} in the registry`
        + ` ${inHouseAccountsUnreported === 1 ? "carries" : "carry"} no position in this book, so`
        + ` ${inHouseAccountsUnreported === 1 ? "it is" : "they are"} outside this figure rather than counted at zero.`
      : "",
  ].filter(Boolean).join(" ");
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
   * THE ACCOUNTS THIS ENTITY HOLDS THAT YIELD NO VALUED POSITION — see the card
   * at the foot of the page, and `unvaluedHoldingsOf`'s own note.
   *
   * Scoped to a SELECTED entity. Across all entities it would be a list of 15
   * accounts belonging to five different people, which answers nobody's
   * question; the per-entity list is the one a reader looking at a trust needs.
   */
  const unvalued = selected
    ? unvaluedHoldingsOf(scope, portfolio.accounts, portfolio.positions, portfolio.commitments ?? [])
    : [];
  /**
   * AND THE ACCOUNTS THAT ARE ONLY PARTLY VALUED. An account that sent a
   * transaction statement and no holding statement has its cash-equivalent
   * funds valued at AMFI's NAV on the live basis, so it now carries positions
   * and `unvaluedHoldingsOf` no longer lists it — while the rest of what it
   * holds is still valued nowhere. Dropping it from this card would say the
   * family's whole demat is in the table above; its own note says what is not.
   */
  const partlyValued = selected
    ? portfolio.accounts.filter((a) => a.owner === scope && a.partialValuation)
    : [];
  /**
   * AND THE LINES A STATEMENT RECORDS THAT NOTHING VALUES, inside an account
   * the table above DOES value (A-17). The ICICI NSDL demat's par-value rows,
   * the Motilal demats' fund units printed with no rate: each is a holding the
   * statement says the family has, with a quantity and no value, and no page
   * named them. Listed per account; a line the live book values at AMFI's NAV
   * (the ABSL Balanced Advantage units) is marked as valued, because it IS in
   * the figure above. A depository's copy of units a fund reports itself is
   * counted, not listed — the fund's own row is in the table.
   */
  const unvaluedLines = (selected
    ? unvaluedStatementLinesOf(scope, portfolio.accounts, portfolio.positions, BOOK_UNVALUED_HOLDINGS)
    : [])
    // THIS CARD IS "IN NO TOTAL", so a line the live book values at AMFI's NAV
    // is not LISTED here — it IS in the figure above. It is counted in its
    // account's hover, and an account whose every recorded line is valued that
    // way (Aarti's ABSL units) has nothing to list and draws no line at all.
    .map((g) => ({ ...g, live: g.lines.filter((l) => l.valuedLive).length, lines: g.lines.filter((l) => !l.valuedLive) }))
    .filter((g) => g.lines.length > 0);
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
  // Grouped on `sectorOf` — the shared three-tier answer — rather than on
  // `Position.sector`, so this chart and Sector Composition place a company the
  // same way. `bucketBy` is the same roll-up `bySector` is, with the key chosen
  // by the caller; the VALUES are untouched, so the bars still add to
  // `selSharesMV` exactly as they did.
  const selSectors = bucketBy(selShares, sectorOf);
  /**
   * WHICH OF THE THREE PLACED EACH COMPANY, counted — so a reader is never left
   * to assume, and so the two lower tiers are visible as the borrowed evidence
   * they are. Counted over COMPANIES rather than positions, which is the unit a
   * sector is a property of; `selShares` holds one row per statement and a name
   * in three accounts would otherwise be counted three times.
   */
  const selPlaced = (() => {
    const seen = new Map<string, string | null>();
    for (const x of selShares) if (!seen.has(x.securityKey)) seen.set(x.securityKey, companySectors.get(x.securityKey)?.from ?? null);
    let book = 0, disclosure = 0, vendor = 0;
    const unplaced: string[] = [];
    for (const [k, f] of seen) {
      if (f === "book") book += 1;
      else if (f === "disclosure") disclosure += 1;
      else if (f === "vendor") vendor += 1;
      else unplaced.push(selShares.find((x) => x.securityKey === k)?.security ?? k);
    }
    return { book, disclosure, vendor, unplaced, companies: seen.size };
  })();
  const selUnclassifiedMV = selSectors.find((sc) => sc.key === UNCLASSIFIED)?.mv ?? 0;
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
  /**
   * WHAT THE SECTOR MIX LEAVES OUT, AND WHY — the paragraph that stood under
   * the chart, as the subtitle's hover. *"remove the highlighted texts from the
   * dashboard UI"* pointed at that paragraph, and every claim in it was audited
   * before it went:
   *
   *   · the mandate-chosen share of these companies, and that the Held via
   *     column says which route chose each name — the figure had no second home;
   *   · what is excluded from the chart, per class with its value — the
   *     subtitle states the company-share count and value, so the complement is
   *     implied, but the per-class split had no second home;
   *   · why a fund has no sector, and where a mandate's cash sleeve went — no
   *     second home.
   *
   * So they are the hover on the subtitle whose count they qualify. A hover is
   * weaker than a caption and that is recorded rather than glossed; what is
   * unchanged is that each is derived from this entity's own positions and that
   * `check:pages` still reads the excluded value, at its new address.
   */
  const excludedCount = selExcluded.reduce((n, c) => n + c.count, 0);
  const sectorMixWhy = [
    selMandateShares.length > 0
      ? `Both routes count here: ${money(selMandateSharesMV)} of these shares were chosen by a discretionary manager and have a sector exactly like the ones ${scope} bought directly. Which of the two chose a name is in the Held via column below.`
      : "",
    selExcluded.length > 0
      ? `${money(selExcludedMV)} across ${excludedCount} position${excludedCount === 1 ? "" : "s"} is excluded rather than folded in — ${classList(selExcluded)}. A GICS sector is a property of a COMPANY; a fund holds many and no statement in this book prints a sector for a folio, so every wrapper would land in one false "Unclassified" slice and bury the sectors this chart exists to show. All of them are in the holdings table below.${sleeveNoteText}`
      : "Every one of this entity's positions is a share in a company, so nothing is excluded from the chart.",
  ].filter(Boolean).join("\n\n");
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
  const visRet = visCost !== null && visPnL !== null && visCost > 0
    ? fifoTotals(holdings.filter((h) => h.costBasis != null && !h.costUnavailable), { accounts: accIdx, universe: p }).returnPct
    : null;
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
      <Tr view={holdView} key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
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
            directly-held share gets when no tier could place it.

            A COMPANY SHARE READS `sectorOf`, THE SAME ANSWER THE CHART ABOVE
            USES. Left on `h.sector` this column would have gone on printing
            "Unclassified" against a row the chart two cards up had just placed —
            one screen contradicting itself on the reader's own click, which is
            the one thing a shared classification is for. */}
        {/* THE HANDLE IS SCOPED TO A COMPANY SHARE, and the RENDER is not.
            The chart above is company shares only, so a claim that this column
            reads the same answer can only be struck on the rows the chart
            covers — a cash sleeve or a TDS line has no sector under any
            taxonomy and has never had one here, and letting it into the
            comparison would fail a correct page on an entity whose company
            shares happen to be fully placed. */}
        <td className="px-4 py-2.5 text-slate-400" data-fe-sector-cell={isCompanyShare(h) ? sectorOf(h) : ""}>
          {isFundVehicle(h)
            ? <AbsentCell reason="a fund holds many sectors and its statement prints none; the look-through would need the scheme's own portfolio disclosure, which this book does not carry for this folio" />
            : sectorOf(h)}
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-200">{fmtFromBase(h.marketValue, { compact: true })}</td>
        <td className={`px-4 py-2.5 text-right mono ${noCost ? "text-slate-500" : changeColor(h.returnPct)}`}>{noCost ? <AbsentCell reason="this statement reports a value and no cost, so there is no basis to strike a return on — the row is left out of the total below rather than counted as zero" /> : <Auditable formula={returnFormula(h.marketValue, h.costBasis, h.returnPct, money, { realised: h.realizedPnL, costSold: h.costOfUnitsSold })}>{fmtPct(h.returnPct, { sign: true })}</Auditable>}</td>
      </Tr>
    );
  };
  return (
    <div>
      <PageHeader eyebrow="Allocation" title="Family & Entities"
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Entity NAVs are rebuilt from live prices where a quote exists; cost basis comes from the statements." />
          <Pill tone="info">{entities.length} entities</Pill>
        </div>} />
      {/*
        ── THE FOUR KPI TILES ARE GONE, AND THE TWO CLAIMS THAT HAD NO SECOND
           HOME ARE ON THE CARD THAT DRAWS THE SPLIT ──────────────────────────

        *"remove the 4 KPI tiles at the top of Families and Entities Page."*
        Audited claim by claim before anything went, which is the whole of the
        work — two of the four were already stated elsewhere on this page and
        two were not:

          · ENTITIES — the count is in the header pill, on every view. Gone.
          · LARGEST ENTITY — `bucketBy` sorts by market value descending, so the
            Entity breakdown's FIRST ROW is that entity, with its NAV and its
            weight at one more decimal than the tile printed. Gone.
          · IN-HOUSE CUSTODY — its VALUE is a legend row on the pie beside it,
            and its PERCENTAGE, its account coverage and the whole
            custody-is-not-Direct-Equity disclosure were nowhere else. MOVED to
            that card: the split into the subtitle, the disclosure onto the
            legend row it is about.
          · EXTERNAL CUSTODIANS — every custodian and its value is a legend row;
            the percentage, the count and the total were not. MOVED to the same
            subtitle.

        A hover is weaker than a caption, and that is recorded rather than
        glossed: the two SPLIT FIGURES are rendered, and only the long
        two-sets paragraph is a `title`, on the row it describes.
      */}
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
      {/*
        ── ONE ROW: THE TABLE LEFT, THE CUSTODY SPLIT RIGHT ────────────────────

        *"The final view should be the table on the left side and on the right
        side 'in house vs external' pie chart and section. Without any
        scrollable page."* The bar chart that held the left two thirds is gone
        and the Entity breakdown takes its place, so the two cards that survive
        sit side by side instead of stacked.

        NOTHING THE BAR CHART MEASURED IS LOST WITH IT: it plotted `e.mv` per
        entity, which is the NAV column of the very table now beside it — the
        same six figures, to the rupee rather than to a pixel, with the weight,
        the position count and the returns the chart could not carry. That is
        why this removal needed no fact moved and the KPI tiles above it did.

        `items-start` keeps each card its own height: stretched, the table would
        grow a dead band to match the 17-row legend beside it.
      */}
      {!selected && (
        <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
          <Card className="lg:col-span-2" title="Entity breakdown" pad={false}>
            {/* A STRUCTURAL HANDLE, because every claim this change has to keep
                is about STRUCTURE OR GEOMETRY — which columns the table draws,
                and that it sits BESIDE the custody card rather than above it.
                Struck on a card title instead, both would rest on prose a
                redesign is free to reword — and on a page whose right-hand card
                RENAMES ITSELF to "Custody" when this book has no in-house
                bucket, so even the title is not a constant. That card is found
                by the pie inside it, for the same reason. */}
            <div className="overflow-x-auto" data-family-table>
              <table className="min-w-full text-sm">
                <thead className="border-b border-ink-700">
                  <Tr view={entityView}>
                    <SortHeader col="entity" view={entityView} align="left">Entity</SortHeader>
                    <SortHeader col="nav" view={entityView}>NAV</SortHeader>
                    <SortHeader col="weight" view={entityView} title="This entity's NAV over the entity rows' own total — each entity's statements as printed — so the column adds to 100%. The gap from that total to the consolidated book is named under the table.">Weight</SortHeader>
                    <SortHeader col="positions" view={entityView}>Positions</SortHeader>
                    <SortHeader col="pnl" view={entityView}>Unreal. P&L</SortHeader>
                    <SortHeader col="return" view={entityView} title="FIFO over the holdings whose statement reports a cost: (unrealised + realised) ÷ the capital behind them — cumulative, not annualised. Its coverage is in each cell's popover.">Return</SortHeader>
                    <SortHeader col="toDate" view={entityView} title="Money-weighted return earned to date (Excel XIRR, de-annualised to the window) over dated cash flows">Return (to date)</SortHeader>
                    <SortHeader col="ytd" view={entityView} title="Financial-year-to-date return (since 1 Apr), flow-adjusted">YTD</SortHeader>
                    {/* THE CUSTODY COLUMN IS GONE — it was the widest cell in the
                        table (one entity holds through fourteen platforms) and it
                        is what made this table too wide to sit beside the pie.
                        The LIST is not lost: it is the Entity cell's own hover,
                        which is weaker than a column and is recorded as such. The
                        per-holding answer — which platform, and which of them
                        CHOSE the row — is one click in, on this entity's own
                        table, where it is per row rather than a set per owner.

                        IT LEAVES `ENTITY_COLS` AND THE ACCESSOR MAP WITH IT. A
                        declared column with no cell puts every later cell under
                        the wrong header once a reader reorders, and an accessor
                        for an id nothing declares is the dead-code-that-looks-
                        alive failure — both are the cost of removing a column
                        from the MARKUP alone under Stage 10bh's model. */}
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {entityRows.map((e) => {
                    // Money-weighted return over this owner's MEASURABLE accounts
                    // only — closing the whole entity MV against partial openings
                    // returned +147%/+353% here for real family members.
                    const mwr = ownerMeasuredReturn(statementPortfolio ?? portfolio, p, e.key);
                    const xirrPct = mwr.toDatePct;
                    // Stated on the STATEMENT basis the rate is struck on: the
                    // flows are complete only to each account's statement date,
                    // so its value there is what the rate closes against. Set
                    // beside this row's live value it would be two measurements
                    // in one sentence.
                    const coverNote = mwr.annPct == null ? undefined
                      : `Money-weighted, over ${mwr.windowDays} days — not annualised; ${fmtPct(mwr.annPct, { sign: true })} p.a. if it were. Covers ${mwr.covered} ${mwr.covered === 1 ? "account" : "accounts"} worth ${money(mwr.measuredMV)} on their own statements, each closed on its statement date${mwr.excluded.length ? `; ${mwr.excluded.length === 1 ? "account" : "accounts"} ${mwr.excluded.join(", ")} carry no opening portfolio value and are excluded on both sides` : ""}.`;
                    const ytdPct = entityYtdPct(portfolio, e.key, e.mv);
                    // The popovers' own worked lines ride on their cells, so
                    // `check:pages` reads the arithmetic a reader is shown rather
                    // than a second computation of it.
                    const wf = weightFormula(e.mv, perStatementMV, e.weight * 100, money, entityWeightOf);
                    const pf = e.pnl == null ? null : {
                      ...pnlFormula(e.fifo.marketValue, e.cost, e.pnl, money),
                      ...(e.withoutCost > 0 ? { plain: `What the ${e.count - e.withoutCost} of ${e.count} holdings whose statement reports a cost are worth today (${money(e.fifo.marketValue)} of the entity's ${money(e.mv)}), minus what they cost. The other ${e.withoutCost} report no cost and are in NAV only — never counted at zero.` } : {}),
                    };
                    const rfBase = returnFormula(e.fifo.marketValue, e.cost, e.returnPct, money, { realised: e.fifo.realised, deployed: e.fifo.deployed });
                    // THE RETURN SAYS WHICH HOLDINGS IT IS STRUCK OVER, as the P&L
                    // beside it already does: over the costed holdings alone,
                    // which on four of these rows are a fifth to a half short of
                    // the NAV printed two cells to the left.
                    const rf = e.returnPct == null ? null : {
                      ...rfBase,
                      ...(e.withoutCost > 0 ? { plain: `${rfBase.plain} Struck over the ${e.count - e.withoutCost} of ${e.count} holdings whose statement reports a cost — ${money(e.fifo.marketValue)} of the entity's ${money(e.mv)}; the other ${e.withoutCost} report no cost and are in NAV only, never counted at zero.` } : {}),
                    };
                    return (
                      <Tr view={entityView} key={e.key} className="cursor-pointer hover:bg-ink-700/40" onClick={() => setScope(e.key)}
                        data-entity-mv={e.mv} data-entity-count={e.count}>
                        {/* The platform list the Custody column used to carry.
                            A hover is weaker than a column; what makes the trade
                            affordable is that this row is ALREADY a click target
                            into the per-holding answer. */}
                        <td className="px-4 py-2.5 font-medium text-slate-100" title={custodyNote(e.key)}>{e.key}</td>
                        {/* A money figure is ONE TOKEN however narrow its column
                            gets: at two thirds of the width `₹349.5 Cr` broke
                            across two lines. The Entity name legitimately wraps
                            and absorbs it. */}
                        <td className="px-4 py-2.5 text-right mono text-slate-200 whitespace-nowrap">{fmtFromBase(e.mv, { compact: true })}</td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400" data-weight-worked={wf.worked} data-weight-plain={wf.plain}><Auditable formula={wf}>{`${(e.weight * 100).toFixed(1)}%`}</Auditable></td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400">{e.count}</td>
                        {/* THE POPOVER IS STRUCK ON THE SET ITS FIGURE IS (A-02). The
                            P&L and the return are over the holdings that report a
                            cost; the popover set the entity's WHOLE value against
                            that cost — "(₹349.4 − ₹254.3) ÷ ₹254.3 = +12.34%",
                            arithmetic that gives 37.4%. `e.fifo` is struck over
                            the costed holdings alone, so its value is the one the
                            figure divides. */}
                        <td className={`px-4 py-2.5 text-right mono whitespace-nowrap ${e.pnl == null ? "text-slate-500" : changeColor(e.pnl)}`} data-entity-pnl-costed-value={e.fifo.marketValue}
                          data-pnl-worked={pf?.worked}>
                          {pf == null
                            ? <AbsentCell reason="no statement behind this entity's holdings reports a cost, so there is no gain to strike — a depository records what is held and never what it was bought for" />
                            : <Auditable formula={pf}>{fmtFromBase(e.pnl, { compact: true, sign: true })}</Auditable>}
                        </td>
                        <td className={`px-4 py-2.5 text-right mono ${e.returnPct == null ? "text-slate-500" : changeColor(e.returnPct)}`}
                          data-return-worked={rf?.worked} data-return-plain={rf?.plain}>
                          {rf == null
                            ? <AbsentCell reason={e.cost == null
                                ? "no statement behind this entity's holdings reports a cost, so there is no return to strike"
                                : "the capital behind this entity's costed holdings is not positive, so a return on it has nothing to divide"} />
                            : <Auditable formula={rf}>{fmtPct(e.returnPct, { sign: true })}</Auditable>}
                        </td>
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
                      </Tr>
                    );
                  })}
                </tbody>
                {/* ── THE TOTAL THE WEIGHTS DIVIDE BY, AND THE GAP TO THE BOOK ──
                    The six NAVs add to more than the book on this page's own
                    custody card, and nothing used to say why. The total row is
                    on the rows' basis — a plain sum of what is printed above it —
                    and the line under it names the holdings two entities both
                    report, which is the whole of the difference. The four
                    columns a cross-entity total would double-count carry the
                    reason, never a blank. */}
                <tfoot className="border-t border-ink-700 bg-ink-900/40" data-family-foot
                  data-per-statement-mv={perStatementMV} data-consolidated-mv={totalMV}
                  data-overlap-mv={overlapMV} data-overlap-count={overlap.length}>
                  <TrFoot view={entityView}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300"
                    label={<>Total</>}
                    labelTitle={`${entities.length} entities, each on its own statements as printed.`}
                    cells={{
                      nav: <td key="nav" className="px-4 py-2.5 text-right mono text-slate-100 whitespace-nowrap">{money(perStatementMV)}</td>,
                      weight: <td key="weight" className="px-4 py-2.5 text-right mono text-slate-300">{`${(sum(entities.map((e) => e.weight)) * 100).toFixed(1)}%`}</td>,
                      positions: <td key="positions" className="px-4 py-2.5 text-right mono text-slate-300">{sum(entities.map((e) => e.count))}</td>,
                      pnl: <td key="pnl" className="px-4 py-2.5 text-right mono text-slate-500"><AbsentCell reason={overlap.length
                        ? `not totalled across entities: summed, it would count the ${overlap.length === 1 ? "holding" : `${overlap.length} holdings`} two entities both report twice — the book's gain, counting each once, is Morning CIO's`
                        : "not totalled here — the book's gain is Morning CIO's"} /></td>,
                      return: <td key="return" className="px-4 py-2.5 text-right mono text-slate-500"><AbsentCell reason="each row is FIFO over that entity's own costed holdings; one return across the entities is the book's, struck once over the consolidated set as Morning CIO's Consolidated return" /></td>,
                      toDate: <td key="toDate" className="px-4 py-2.5 text-right mono text-slate-500"><AbsentCell reason="each row pools only that entity's measurable accounts over its own window; the pooled rate across every such account is Morning CIO's money-weighted return" /></td>,
                      ytd: <td key="ytd" className="px-4 py-2.5 text-right mono text-slate-500"><AbsentCell reason="not totalled across entities: each row's year-to-date return is struck over that entity's own opening value, and a sum or average of per-entity rates is not the book's" /></td>,
                    }} />
                  <tr>
                    {/* THE FIGURES ON ITS FACE, THE SENTENCE IN ITS HOVER (Stage 10cp).
                        The two totals and the overlap are what a reader adds up —
                        a line of figures, not prose — and the holdings it is made
                        of, and why the weights divide by the rows' own total, are
                        its hover. */}
                    <td colSpan={ENTITY_COLS.length} className="px-4 pb-2.5 pt-0 text-[11.5px] leading-snug text-slate-500" data-family-overlap
                      title={overlap.length > 0
                        ? `The entities add to ${money(perStatementMV)}; the book is ${money(totalMV)}, ${money(overlapMV)} less — ${overlap.length === 1 ? "one holding is" : `${overlap.length} holdings are`} ${overlapSaid.how} and counted once there: ${overlapNames.join("; ")}. Each entity's row is its own statements as printed, so the weights divide by ${money(perStatementMV)}, the total the rows add to.`
                        : `No holding is reported by two entities, so the entities add to the book, ${money(totalMV)}, and the weights divide by it.`}>
                      {overlap.length > 0
                        ? <>Entities {money(perStatementMV)} · book {money(totalMV)} · {overlap.length === 1 ? "one holding" : `${overlap.length} holdings`} counted once, {money(overlapMV)}</>
                        : <>Entities {money(perStatementMV)} = book · no holding reported twice</>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
          {/*
            ── AND THE CARD THE IN-HOUSE TILE'S CLAIMS MOVED ONTO ──────────────

            The pie has always drawn the split and its legend has always printed
            every custodian's value. What it never printed is the SPLIT ITSELF —
            the two percentages, the account coverage behind the in-house one and
            the custodian count behind the external one — which is what the two
            removed tiles carried and nothing else on this page states. All of it
            is derived here, so it follows the book rather than this comment.
          */}
          {/* THE CARD CARRIES NO SUBTITLE (Stage 10cp). What it shows is its
              title's hover; the split is DATA and is the first line of its body,
              so the two percentages and their coverage stay on screen. */}
          <Card title={direct
            ? <span data-card-title-hint title="Where the capital sits — the platform, not the decision.">In-house vs external</span>
            : <span data-card-title-hint title={`Who custodies the capital — all of it external, across ${externalCustodians.length} manager${externalCustodians.length === 1 ? "" : "s"}.`}>Custody</span>}>
            {direct ? (
              <div className="-mt-2 mb-2 text-xs text-slate-400" data-custody-split title={splitWorking}>
                In-house <span className="mono text-slate-200">{pctOfBook(directMV)}</span> · {money(directMV)} ·{" "}
                {inHouseAccountsUnreported > 0
                  ? <>{directAccounts} of {inHouseAccountsInRegistry} accounts</>
                  : <>{directAccounts} account{directAccounts === 1 ? "" : "s"}</>}
                <span className="mx-1.5 text-slate-600">|</span>
                External <span className="mono text-slate-200">{pctOfBook(externalMV)}</span> · {money(externalMV)} ·{" "}
                {externalCustodians.length} custodian{externalCustodians.length === 1 ? "" : "s"}
              </div>
            ) : (
              /* WHY THERE IS NO IN-HOUSE SHARE, and the two reasons are not the
                 same finding: an account nobody runs in-house and an in-house
                 account reporting nothing are different asks. A 0% would say the
                 family runs an in-house book that holds nothing, which is a third
                 claim again. One line, the reason in its hover. */
              <div className="-mt-2 mb-2 text-xs text-slate-400"
                title={inHouseAccountsInRegistry > 0
                  ? `The ${inHouseAccountsInRegistry} in-house account${inHouseAccountsInRegistry === 1 ? "" : "s"} in this book report no holdings, so there is nothing to measure rather than a measured nil.`
                  : "Every account here reaches its assets through a manager, a distributor or a broker."}>
                No in-house share to draw
              </div>
            )}
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
                // THE TWO-SETS DISCLOSURE RIDES ON THE ROW IT IS ABOUT. It is the
                // one claim the removed tile carried that will not fit a caption:
                // that this figure is CUSTODY and not the holdings tables' Direct
                // Equity, and that the two differ in BOTH directions on this book.
                <li key={c.key} className="flex items-center justify-between text-xs" title={c.key === DIRECT ? inHouseNote : undefined}>
                  <span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{c.key}</span>
                  <span className="mono text-slate-200">{fmtFromBase(c.mv, { compact: true })}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {selected && (
        <>
          {/* THE SCOPE IS THE TITLE, THE COUNTS ARE ITS HOVER (Stage 10cp). The
              line under it said "Company shares only — N of M positions · ₹X
              of ₹Y NAV"; the narrowing a reader must not miss — that the bars
              are company shares, not the entity's whole NAV — is in the title
              itself now, and the counts and the reason are one hover. */}
          <Card className="mt-5" title={`${scope} — sector mix of company shares`}
            subtitle={selShares.length === 0
              ? `No company shares — this entity holds fund vehicles and cash only · ${selRows.length} position${selRows.length === 1 ? "" : "s"} · ${fmtFromBase(selMV, { compact: true })} NAV.`
              : `Company shares only — ${selShares.length} of ${selRows.length} positions · ${money(selSharesMV)} of ${fmtFromBase(selMV, { compact: true })} NAV. ${sectorMixWhy}`}>
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
            {/* ── WHERE THIS CHART'S SECTORS CAME FROM ──────────────────────
                The same three tiers Sector Composition reports, counted over
                the companies THIS entity holds. A reader cannot infer any of
                them from the bars, and the two lower tiers are borrowed
                evidence rather than the family's own statement — so they are
                named, with their counts, on the card that uses them.

                IT NAMES WHAT IS STILL UNPLACED. A residual a reader cannot see
                is a residual they assume is zero, and it is the bar this whole
                change is about. */}
            {/* `data-status` CARRIES THE FETCH'S OWN STATE, so a settled walk
                can tell a tier that is still landing from one that was never
                asked for. Disabled, `useStockExposure` stays `loading` for ever
                and the disclosure tier simply never arrives — a defect that
                moves no caption and leaves every count well formed. */}
            {selShares.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-700/70 pt-2.5 text-xs text-slate-400"
                data-fe-sector-source
                data-status={exposure.status}
                data-from-book={selPlaced.book}
                data-from-disclosure={selPlaced.disclosure}
                data-from-vendor={selPlaced.vendor}
                data-unplaced={selPlaced.unplaced.length}
                data-companies={selPlaced.companies}>
                <span className="text-slate-500">Sector source</span>
                {/* "FROM A STATEMENT IN THIS BOOK", not "from their statements".
                    The index is built over the whole book, so a company this
                    entity holds through a demat that prints no industry can be
                    placed by ANOTHER member's statement for the same company —
                    which is correct, because a sector is a property of the
                    company. Bharat's four come from exactly that, and "their"
                    would have claimed his own statements printed them. */}
                <span><span className="mono text-slate-200">{selPlaced.book}</span> from a statement in this book</span>
                {selPlaced.disclosure > 0 && <span><span className="mono text-slate-200">{selPlaced.disclosure}</span> from a fund&rsquo;s filing</span>}
                {selPlaced.vendor > 0 && <span><span className="mono text-slate-200">{selPlaced.vendor}</span> from screener.in</span>}
                {selPlaced.unplaced.length > 0 && (
                  <span className="text-slate-500"
                    title={`No tier places these — a statement that printed no industry, no fund filing naming the ISIN and no NSE symbol to look one up on. ${selPlaced.unplaced.length} companies: ${selPlaced.unplaced.join(", ")}`}>
                    <span className="mono">{selPlaced.unplaced.length}</span> unplaced ·{" "}
                    <span className="mono">{money(selUnclassifiedMV)}</span>
                  </span>
                )}
                {/* STILL READING. The disclosure tier is a fetch, so until it
                    lands the chart is placed by the book and screener.in alone
                    and a bar may still move. Said rather than left to be seen. */}
                {exposure.status === "loading" && <span className="text-slate-500">still reading the funds&rsquo; filings</span>}
                {exposure.status === "unreachable" && (
                  <span className="text-amber-400/80" title="The look-through store did not answer, so no company is placed by a fund's own filing on this paint. Nothing is misplaced by it — that tier only ever fills an empty sector.">
                    a fund&rsquo;s filings could not be read
                  </span>
                )}
              </div>
            )}
          </Card>
          <Card className="mt-5" title={`${scope} — holdings`} pad={false}
            subtitle={`Grouped by how each holding came to be held — what ${scope} chose directly, what a discretionary manager chose under a mandate, and the fund vehicles and cash beside them.`}
            right={<SearchInput value={holdingsQ} onChange={setHoldingsQ} placeholder="Search this entity…" className="w-56" suggestions={Array.from(new Set(selRows.map((x) => x.security))).sort()} />}>
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                  <Tr view={holdView}>
                    <SortHeader col="security" view={holdView} align="left">Security</SortHeader>
                    {/* WHO CHOSE IT. The complaint this page existed to answer and
                        did not: a Carnelian-managed share sat beside a self-bought
                        one with nothing on the row telling them apart. */}
                    <SortHeader col="heldVia" view={holdView} align="left">Held via</SortHeader>
                    <SortHeader col="sector" view={holdView} align="left">Sector</SortHeader>
                    <SortHeader col="value" view={holdView}>Market value</SortHeader>
                    <SortHeader col="return" view={holdView}>Return</SortHeader>
                  </Tr>
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
                  {/* …and where the search names a holding the family's own review
                      carries that no statement reports, say so rather than leaving
                      the reader to read an empty table as a lost position. */}
                  {holdings.length === 0 && (
                    <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                      No holdings match “{holdingsQ}”.
                      <AbsentFromBook query={holdingsQ} className="mx-auto mt-3 max-w-xl" />
                    </td></tr>
                  )}
                </tbody>
                {holdings.length > 0 && (
                  <tfoot className="border-t border-ink-700 bg-ink-900/40">
                    <TrFoot view={holdView}
                      className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300"
                      label={<>
                        Total
                        {/* THE COUNT ON SCREEN, AND WHAT THE RETURN COVERS IN ITS
                            HOVER — the sentence that ran across the footer was
                            the widest note on this page. */}
                        <span className="ml-2 font-normal normal-case tracking-normal text-slate-500"
                          title={[
                            showSections ? "The section subtotals above add to this figure." : "",
                            visNoCost > 0
                              ? visCost === null
                                ? `Every one of these ${visNoCost} ${visNoCost === 1 ? "row reports" : "rows report"} a value and no cost basis, carrying ${money(visNoCostMV)} with nothing to measure a return against.`
                                : `The return covers ${money(visMV - visNoCostMV)} of the ${money(visMV)} beside it, struck on ${money(visCost)} of cost — the other ${visNoCost} ${visNoCost === 1 ? "row" : "rows"}, carrying ${money(visNoCostMV)}, ${visNoCost === 1 ? "reports" : "report"} no cost basis and ${visNoCost === 1 ? "is" : "are"} skipped rather than counted as zero.`
                              : "",
                          ].filter(Boolean).join(" ") || undefined}>
                          {filtered
                            ? <>{holdings.length} of {selRows.length} positions match the search — {scope} holds {money(selMV)} in all</>
                            : <>{holdings.length} {holdings.length === 1 ? "position" : "positions"}</>}
                        </span>
                      </>}
                      cells={{
                        value: <td key="value" className="px-4 py-2.5 text-right mono text-slate-100">{money(visMV)}</td>,
                        return: (
                          <td key="return" className={`px-4 py-2.5 text-right mono ${visRet == null ? "text-slate-500" : changeColor(visRet)}`}>
                            {visRet == null
                              ? <AbsentCell reason={visCost === null
                                  ? "no row on screen reports a cost basis, so there is nothing to strike a return on — a 0.00% here would read as a book that broke even"
                                  : "the rows on screen that do report a cost basis leave no positive cost to divide by, so no return can be struck — a 0.00% here would read as a book that broke even"} />
                              : fmtPct(visRet, { sign: true })}
                          </td>
                        ),
                      }} />
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* ── THE ACCOUNTS THIS ENTITY HOLDS THAT THE BOOK CANNOT VALUE ──
              *
              *   "Bharat Jaisinghani Trust looks empty on holdings, so check
              *    that as well since the client has provided half of the
              *    statements already."
              *
              * The trusts hold three accounts each and ONE of them yields a
              * valued position, so the table above listed one row and the page
              * said nothing about the other two — a Sky Capital angel folio
              * whose fund publishes no NAV, and an HDFC Bank custody account
              * holding 347 unlisted preference shares the depository records at
              * FACE VALUE, which is not a mark.
              *
              * Both statements are IN HAND. Drawing nothing for them is right;
              * saying nothing about them is not, and that is the difference
              * between a measured absence and a missing one. 15 accounts across
              * 5 entities are in this state, so every entity page gains it.
              *
              * THE DRAWN CAPITAL IS IN NO TOTAL ON THIS PAGE, and the footnote
              * says so: it is what was PAID, never what the stake is worth. */}
          {(unvalued.length > 0 || partlyValued.length > 0 || unvaluedLines.length > 0) && (
            // "IN NO TOTAL" IS THE FENCE, SO IT IS IN THE TITLE (Stage 10cp): the
            // line that said "None of these figures is in the ₹X above" went
            // with every other line under a card title, and this card sits
            // directly under one that sums. The sentence is the title's hover.
            <Card className="mt-5" title={`${scope} — held, not valued, in no total`}
              subtitle={`None of these figures is in the ${money(selMV)} above — no statement values these holdings. ${unvalued.length + partlyValued.length === 1 ? "One account" : `${unvalued.length + partlyValued.length} accounts`} ${scope} holds ${unvalued.length + partlyValued.length === 1 ? "reports" : "report"} holdings that no statement in this book puts a value on, so they stand in no table above${partlyValued.length > 0 ? " — all of an account, or the part of one its own note names" : ""}. A contribution is what was paid into a fund, not what the holding is worth, and adding the two would report a valuation nobody struck.${partlyValued.length > 0 ? " The cash-equivalent funds a partly valued account's note names ARE in that figure, valued at AMFI's NAV; the rest of the account is not." : ""}${unvaluedLines.length > 0 ? ` ${unvaluedLines.length === 1 ? "One account" : `${unvaluedLines.length} accounts`} the table above values ${unvaluedLines.length === 1 ? "records" : "record"} further holdings with a quantity and no value; open ${unvaluedLines.length === 1 ? "it" : "one"} for the lines.` : ""} Hover an account for why it carries no figure.`}>
              <ul className="space-y-1.5 text-sm" data-entity-unvalued={unvalued.length} data-entity-partial={partlyValued.length}
                data-entity-unvalued-lines={unvaluedLines.reduce((n, g) => n + g.lines.length, 0)}>
                {/* A PARTLY VALUED ACCOUNT says so on its line, and its own note —
                    what is valued, from what, and what is not — is the hover on
                    its name, where every other account on this card keeps its
                    reason. */}
                {partlyValued.map((a) => (
                  <li key={a.accountId} data-unvalued-account={a.accountId} data-partial-account={a.accountId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-slate-300" title={a.partialValuation ?? undefined} data-unvalued-reason={a.partialValuation ? "" : undefined}>
                        {a.provider}
                        <span className="text-slate-500"> · {a.accountNo}</span>
                      </span>
                      <span className="text-[11px] text-amber-400/80 whitespace-nowrap">partly valued — only its cash-equivalent funds</span>
                    </div>
                  </li>
                ))}
                {/* A VALUED ACCOUNT WHOSE STATEMENT RECORDS MORE THAN IS VALUED —
                    one line per account, opening onto every holding it records
                    with a quantity and no value, each line's reason its hover. */}
                {unvaluedLines.map((g) => {
                  const live = g.live;
                  const notValued = g.lines.length;
                  return (
                    <li key={`lines-${g.account.accountId}`} data-unvalued-lines-account={g.account.accountId}
                      data-unvalued-lines={notValued} data-unvalued-lines-live={live} data-unvalued-lines-elsewhere={g.reportedElsewhere}>
                      <details>
                        <summary className="flex cursor-pointer items-baseline justify-between gap-3"
                          title={`The ${g.account.provider} statement for ${g.account.accountNo} records ${notValued} holding${notValued === 1 ? "" : "s"} with a quantity and no value, which nothing in this book values.${live ? ` ${live} more ${live === 1 ? "is" : "are"} recorded the same way and valued here at AMFI's published NAV — a sibling statement from the same depository proves the units are on its basis — so ${live === 1 ? "it is" : "they are"} in the figure above and not listed.` : ""}${g.reportedElsewhere ? ` ${g.reportedElsewhere} more ${g.reportedElsewhere === 1 ? "is" : "are"} the depository's copy of units a fund's own statement reports, and ${g.reportedElsewhere === 1 ? "is" : "are"} in the table above through that fund.` : ""}`}>
                          <span className="text-slate-300">
                            {g.account.provider}
                            <span className="text-slate-500"> · {g.account.accountNo}</span>
                          </span>
                          <span className="text-[11px] text-amber-400/80 whitespace-nowrap">
                            {`${notValued} held, not valued`}
                          </span>
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-3 text-[12px]">
                          {g.lines.map((l) => (
                            <li key={`${l.row.securityKey}-${l.row.isin ?? ""}`} data-unvalued-line={l.row.securityKey}
                              className="flex items-baseline justify-between gap-3" title={l.row.reason ?? undefined}>
                              <span className="text-slate-400">{l.row.security}</span>
                              <span className="mono whitespace-nowrap text-slate-500">
                                {l.row.quantity == null ? DASH : `${fmtNum(l.row.quantity, Number.isInteger(l.row.quantity) ? 0 : 3)} units`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  );
                })}
                {unvalued.map((u) => (
                  <li key={u.account.accountId} data-unvalued-account={u.account.accountId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-slate-300" title={u.reason ?? undefined} data-unvalued-reason={u.reason ? "" : undefined}>
                        {u.account.provider}
                        <span className="text-slate-500"> · {u.account.accountNo}</span>
                      </span>
                      {/* PAID IN, never a value — and absent where no statement
                          prints one, because a fund that publishes no capital
                          account has not told us it called nothing. */}
                      <span className="mono text-slate-400 whitespace-nowrap">
                        {u.drawn == null
                          ? <span title="No statement for this account prints a capital account, so what has been paid into it is not reported here.">{DASH}</span>
                          : <span title="Capital called to date, as this fund's own statement prints it. What was PAID, not what the stake is worth — it is in no total on this page.">{money(u.drawn)} paid in</span>}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
