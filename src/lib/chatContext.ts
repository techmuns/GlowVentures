// WHAT THE ASSISTANT IS TOLD ABOUT THIS BOOK.
//
// The chat box answers questions about the family's money, and a language model
// asked about money it cannot see will fill the gap. So this file's job is not
// "send some context" — it is to hand over a snapshot that is COMPLETE ENOUGH
// THAT GUESSING IS UNNECESSARY, and to name every absence explicitly, because an
// omission is exactly what invites an invention.
//
// ── IT IS THE BOOK THE SCREEN SHOWS, NOT A SECOND ONE ───────────────────────
//
// This module used to read `BOOK_SUMMARY`, `BOOK_POSITIONS` and
// `BOOK_COMMITMENTS` straight out of `glowData.ts` — the statement marks, every
// raw row, no ₹1,000 floor, no closed-position rule and every capital account —
// while the dialog it briefs sits in front of a dashboard that shows the
// published NAVs, live quotes where the feed priced a holding, current holdings
// only and the private-market capital accounts only. So nearly every figure the
// model was handed disagreed with the screen behind it (SC-B1…B5): ₹710.39 Cr
// against a ₹713.3 Cr tile, 371 positions against 358, ₹97.73 Cr committed
// against ₹42.7 Cr, a "largest holding" that was one statement row.
//
// So the caller hands in the book the PAGES read — `usePortfolio()`'s
// `portfolio` and `consolidated` — and every figure below is struck through the
// same shared helper the page that shows it uses: `currentHoldings` for what is
// still held (Morning CIO's counts), `groupKeyFor` for the category (the
// Portfolio Monitor and the search), `byEntity` for a member (Family &
// Entities), `capitalScope` / `callTotals` / `distributionOf` for the capital
// accounts (Private Market and Morning CIO's Capital deployment). Nothing here
// is a second computation of a figure the screen already makes.
//
// ── AND THE CAVEATS TRAVEL WITH THE FIGURES ─────────────────────────────────
//
// A total on this book is a BLEND of report dates and of price bases; some
// positions carry no cost; Polycab is ring-fenced out of every total; ₹3.17 Cr
// is reported twice and counted once. A model told the totals and not those
// things will answer confidently and wrongly, so every figure-bearing block
// says its basis and its date, and `what_this_book_does_not_carry` is derived
// too.
import { BOOK_POLYCAB, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import {
  byEntity, currentHoldings, doubleCountedValue, droppedHoldings, isCashEquivalent, NEGLIGIBLE_VALUE_FLOOR, sum, sumOrNull,
} from "@/lib/analytics";
import { accountIndex, type AccountIndex } from "@/lib/accounts";
import { groupKeyFor, groupLabelFor } from "@/lib/groupAxis";
import { capitalScope, distributionOf } from "@/lib/privateMarket";
import { callTotals, schemeCalls } from "@/lib/capitalCalls";
import { MARKET_SIDE_UNPLACED } from "@/lib/aifCategory";
import { accountEmptiness, categoryWordsOf } from "@/lib/searchIndex";
import type { Account, Commitment, Portfolio, Position } from "@/lib/types";

/** How many holdings to itemise. Enough to answer, small enough to fit. */
const TOP_HOLDINGS = 25;

/**
 * Crore, to two decimals — and to three significant figures BELOW one crore
 * (SC-D3). Two decimals of a crore is a lakh, so ₹98,742 left the builder as
 * `0.01`: a small figure rounded UP to a lakh and sent as a measurement. The
 * unit line on `book_summary` says which rounding applies.
 */
const cr = (n: number | null | undefined): number | null => {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const v = n / 1e7;
  if (v === 0) return 0;
  return Math.abs(v) >= 1 ? Math.round(v * 100) / 100 : Number(v.toPrecision(3));
};
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : null);

const UNIT = "all *Cr fields are crore rupees (1 Cr = 10,000,000), rounded to 2 decimals — or to 3 significant"
  + " figures below 1 Cr, so a small figure is never rounded up to a lakh";

/** One `DASHBOARD_INPUTS` entry — a named block of derived facts. */
export type ContextBlock = { kind: string; [k: string]: unknown };

/**
 * THE BOOK THE PAGES READ — pass `usePortfolio()`'s own values, never a book
 * assembled here. `portfolio` is what the top bar and Morning CIO print from
 * (published NAVs applied, live quotes where the feed answered); `consolidated`
 * is the same positions with each `dedupeGroup` counted once.
 */
export type ChatBook = {
  portfolio: Pick<Portfolio,
    "asOf" | "totalValue" | "listedValue" | "privateValue" | "unplacedValue" | "accounts" | "positions" | "commitments">;
  consolidated: Position[];
  /** `usePortfolio().basis` — LIVE the moment any holding carries an intraday quote. */
  basis: "STATEMENT" | "LIVE";
  /** `usePortfolio().quotesAsOf` — when the quotes were pulled, where any were. */
  quotesAsOf?: string | null;
};

/**
 * WHAT PRICED A SET OF HOLDINGS, in words and in counts. A holding is at its
 * statement's mark unless AMFI published a NAV for its scheme (`navPriced`,
 * dated) or the quote feed priced it intraday (`live`). The date that matters
 * differs by case, so the three are counted apart and each carries its own.
 */
function priceBasisOf(rows: readonly Position[], accts: AccountIndex, quotesAsOf: string | null) {
  const nav = rows.filter((p) => p.navPriced && !p.live);
  const live = rows.filter((p) => p.live);
  const marks = rows.filter((p) => !p.live && !p.navPriced);
  const navDates = [...new Set(nav.map((p) => p.navDate).filter((d): d is string => !!d))].sort();
  const markDates = [...new Set(marks.map((p) => accts.get(p.accountId)?.asOf).filter((d): d is string => !!d))].sort();
  const parts: string[] = [];
  if (marks.length) {
    parts.push(`${marks.length} at the statement's own mark (${markDates.length === 1 ? `dated ${markDates[0]}`
      : markDates.length ? `statements dated ${markDates[0]} to ${markDates[markDates.length - 1]}` : "undated"})`);
  }
  if (nav.length) {
    parts.push(`${nav.length} at AMFI's published NAV (${navDates.length === 1 ? `dated ${navDates[0]}`
      : `dated ${navDates[0]} to ${navDates[navDates.length - 1]}`})`);
  }
  if (live.length) parts.push(`${live.length} at a live intraday quote${quotesAsOf ? ` (pulled ${quotesAsOf})` : ""}`);
  return {
    statementMarks: marks.length,
    publishedNav: nav.length ? { holdings: nav.length, dated: navDates } : null,
    liveQuote: live.length ? { holdings: live.length, pulledAt: quotesAsOf ?? null } : null,
    summary: parts.join("; "),
  };
}

/**
 * The book, as blocks.
 *
 * Deliberately NOT every row: 371 rows of JSON crowd out the question. The shape
 * is a summary plus the rows a reader actually asks about, and every list says
 * how many rows it covers out of how many exist, so a truncation can never read
 * as the whole book.
 */
export function buildDashboardContext(book: ChatBook): ContextBlock[] {
  const { portfolio, consolidated } = book;
  const accounts = portfolio.accounts;
  const accts = accountIndex(accounts);
  const quotesAsOf = book.quotesAsOf ?? null;

  /**
   * CURRENT HOLDINGS, SO THE COUNTS ARE MORNING CIO'S (SC-B2). Closed positions
   * and the specks under the family's ₹1,000 floor are named in `countsExclude`
   * rather than counted: 371 statement rows is not the book the screen lists.
   */
  const current = currentHoldings(consolidated);
  const dropped = droppedHoldings(consolidated);
  const bookMV = sum(current.map((p) => p.marketValue));
  // Every RAW row that is a current holding — the per-account and per-owner
  // counts below are not deduped, so they are struck on the raw rows through
  // the same verdict `currentHoldings` reached on the consolidated ones.
  const currentRaw = currentHoldings(portfolio.positions);
  // The rows the dashboard values from a statement's QUANTITY alone — on the
  // live book only, so read off the book this context is built from. Four sets,
  // each told apart by what the row is and by what its statement printed, and
  // each its own block below, because each is valued a different way:
  //
  //   • cash: the arbitrage and liquid funds a depository reports on an account
  //     that sent a transaction statement and no holding statement (Stage 10ce);
  //   • the same account's other funds, which are not cash (Stage 10cy);
  //   • fund units a HOLDING statement records and values nowhere — printed
  //     with no rate (A-17), or with the rate of the holding's last depository
  //     movement, which is a transaction price and never a valuation (Stage
  //     10cz) — at AMFI's NAV; a liquid or arbitrage fund among them is cash,
  //     and each row says so;
  //   • listed shares any of those statements records, at the live quote, and
  //     only while the feed prices them.
  const fromUnits = currentRaw.filter((p) => !!p.depositoryUnits);
  // A depository row that names no kind is a closing balance: the kind was
  // added for the rows that are NOT (`partialValuationNotes` reads it the same way).
  const closingBalance = (p: Position) => (p.depositoryUnits?.kind ?? "closing-balance") === "closing-balance";
  const depositoryCash = fromUnits.filter((p) => closingBalance(p) && p.assetClass !== "Equity" && isCashEquivalent(p));
  const depositoryFunds = fromUnits.filter((p) => closingBalance(p) && p.assetClass !== "Equity" && !isCashEquivalent(p));
  const unpricedUnits = fromUnits.filter((p) => !closingBalance(p) && p.assetClass !== "Equity");
  const quotedShares = fromUnits.filter((p) => p.assetClass === "Equity");

  // ── the report dates, which a consolidated figure blends ───────────────────
  const valuedAsOf = [...new Set(current.filter((p) => p.marketValue !== 0)
    .map((p) => accts.get(p.accountId)?.asOf).filter((d): d is string => !!d))].sort();
  const behind = accounts.filter((a) => a.asOf && a.asOf < portfolio.asOf).length;
  const basisOfBook = priceBasisOf(current, accts, quotesAsOf);

  // ── allocation, on the same axis — and through the same key — the Portfolio
  //    Monitor sections on and the search's category rows total.
  const byCategory = new Map<string, { value: number; count: number }>();
  for (const p of current) {
    const key = groupKeyFor("category", accts, p);
    const e = byCategory.get(key) ?? { value: 0, count: 0 };
    e.value += p.marketValue; e.count += 1;
    byCategory.set(key, e);
  }
  const categoryLabel = groupLabelFor("category");

  // ── per-owner, which does NOT dedupe — `byEntity`, the Family page's own
  //    roll-up (§"consolidated counts once, per-account does not").
  const owners = [...new Set(accounts.map((a) => a.owner))];
  const entityValue = new Map(byEntity(portfolio.positions, accounts).map((b) => [b.key, b.mv]));

  // ── the capital accounts Private Market and Morning CIO count ─────────────
  const scope = capitalScope(portfolio.commitments ?? [], accounts);
  const ownerOfCommitment = (c: Commitment) => accts.get(c.accountId)?.owner ?? null;
  const pmTotals = callTotals(schemeCalls(scope.onPage, (c) => c.name, ownerOfCommitment));
  const pmDistributed = sumOrNull(scope.onPage.map(distributionOf));
  const pmDistributedOf = scope.onPage.filter((c) => distributionOf(c) != null).length;
  const capitalRow = (c: Commitment) => ({
    fund: c.name, owner: ownerOfCommitment(c), provider: c.provider, asOf: c.asOf,
    committedCr: cr(c.committed),
    calledCr: cr(c.called), paidCr: cr(c.paid), stillToCallCr: cr(c.undrawn),
    distributedCr: cr(distributionOf(c)),
  });

  // ── cost coverage, over the holdings the screen lists ─────────────────────
  const costless = current.filter((p) => p.costBasis == null);
  const selfRun = (p: Position) => {
    const e = accts.get(p.accountId)?.engagement;
    return e === "Direct" || e === "Execution";
  };

  // ── top holdings: ONE ROW PER SECURITY, clubbed across every account that
  //    reports it (SC-B5) — the unit Morning CIO's "Largest name" and every
  //    `/stock/` page are struck on, never one statement's row.
  const bySecurity = new Map<string, Position[]>();
  for (const p of current) bySecurity.set(p.securityKey, [...(bySecurity.get(p.securityKey) ?? []), p]);
  const holdingRows = [...bySecurity.entries()]
    .map(([key, rows]) => ({ key, rows, value: sum(rows.map((p) => p.marketValue)) }))
    .sort((a, b) => b.value - a.value);

  // ── the ring-fenced holding, by documented decision (Stage 10s) ───────────
  const fencedAccounts = [...new Set(BOOK_POLYCAB.map((p) => p.accountId))]
    .map((id) => accts.get(id)).filter((a): a is Account => !!a);
  const fencedAsOf = [...new Set(fencedAccounts.map((a) => a.asOf).filter(Boolean))].sort();

  return [
    {
      kind: "book_summary",
      label: "Current Value of Holdings — the figure the dashboard's top bar and Morning CIO show",
      currency: "INR",
      unit: UNIT,
      basis: {
        kind: book.basis,
        note: "These are the dashboard's own figures, on the same prices it shows: "
          + `${basisOfBook.summary}. A price moves market value, unrealised P&L and return only — never a`
          + " quantity, a cost or a dated cash flow, which are always the statements'.",
        ...basisOfBook,
      },
      reportDates: {
        newestStatement: portfolio.asOf,
        valuedStatements: valuedAsOf.length ? { from: valuedAsOf[0], to: valuedAsOf[valuedAsOf.length - 1] } : null,
        note: "Each account is valued on its own statement's date, so a consolidated figure is a BLEND of dates, not a"
          + " snapshot on one day. The newest statement date may belong to an account that values nothing.",
      },
      currentValueOfHoldingsCr: cr(portfolio.totalValue),
      /**
       * THE THIRD SIDE, and it travels with the other two or the model is
       * handed a total its own two components fall short of — which is exactly
       * the arithmetic a family office asks a chat about. `listed + private +
       * unplaced === currentValueOfHoldingsCr`, asserted in `chatContext.test.ts`.
       */
      listedCr: cr(portfolio.listedValue),
      privateCr: cr(portfolio.privateValue),
      notPlacedCr: cr(portfolio.unplacedValue),
      notPlacedNote: `${MARKET_SIDE_UNPLACED}. They ARE inside the Current Value of Holdings above.`,
      sideRule: "A fund's side is where its money is invested: the family's own placing of that fund first, then a"
        + " fund whose own paperwork names private equity or venture (private), then the SEBI category its statement"
        + " prints (Category III trades listed securities; Categories I and II are private capital). A drawdown"
        + " structure says how a fund is funded, not what it invests in.",
      positions: current.length,
      distinctSecurities: bySecurity.size,
      countsExclude: {
        closedPositions: dropped.closed.length,
        belowFloor: { positions: dropped.negligible.length, valueRupees: Math.round(sum(dropped.negligible.map((p) => p.marketValue)) * 100) / 100, floorRupees: NEGLIGIBLE_VALUE_FLOOR },
        note: "The counts are the holdings the dashboard lists: a position redeemed to nil units and a holding worth"
          + ` under ₹${NEGLIGIBLE_VALUE_FLOOR.toLocaleString("en-IN")} in total are left out, at the family's instruction.`,
      },
      accounts: accounts.length,
      owners,
    },
    {
      kind: "allocation_by_category",
      axis: "Category — the Portfolio Monitor's default sections and Morning CIO's allocation table",
      note: "Shares chosen by a discretionary manager roll up into that mandate (with its cash sleeve); a liquid fund or"
        + " liquid ETF is Cash; everything else groups by what it IS. The categories sum to the Current Value of"
        + " Holdings less the holdings under the ₹1,000 floor.",
      asOf: "each holding on its own statement's date and price basis — see book_summary.basis",
      categories: [...byCategory.entries()]
        .map(([key, v]) => ({ category: categoryLabel(key), valueCr: cr(v.value), holdings: v.count, pctOfBook: pct(v.value, bookMV) }))
        .sort((a, b) => (b.valueCr ?? 0) - (a.valueCr ?? 0)),
    },
    {
      kind: "by_family_member",
      note: "Each member's own accounts, as the Family & Entities page shows them. NOT deduplicated — a holding two"
        + " members' statements both report is counted under both, so these sum to more than the Current Value of"
        + " Holdings by the double count named below.",
      owners: owners.map((owner) => {
        const ids = new Set(accounts.filter((a) => a.owner === owner).map((a) => a.accountId));
        const v = entityValue.get(owner);
        return {
          owner,
          valueCr: v == null ? null : cr(v),
          valueNote: v == null ? "no statement in this book values any of this member's accounts" : null,
          accounts: ids.size,
          holdings: currentRaw.filter((p) => ids.has(p.accountId)).length,
        };
      }).sort((a, b) => (b.valueCr ?? -1) - (a.valueCr ?? -1)),
    },
    {
      kind: "accounts",
      shown: accounts.length,
      total: accounts.length,
      note: "Every account, each on its own statement's date. `holdings` counts the holdings the dashboard lists (a"
        + " redeemed position and a sub-₹1,000 speck are left out). Per account, NOT deduplicated.",
      rows: accounts.map((a) => {
        const held = portfolio.positions.filter((p) => p.accountId === a.accountId);
        const live = currentRaw.filter((p) => p.accountId === a.accountId);
        /**
         * ── AN ACCOUNT WITH NO VALUED HOLDING IS ONE OF TWO FACTS ───────────
         *
         * NULL where no statement values it, never 0 (SC-A1): India SME, Sky
         * Capital, the income-only 360 ONE folios and the face-value custody
         * accounts are ABSENCES, and a model handed `0` reports them as worth
         * nothing. But 0 where every holding is REDEEMED TO NIL: 3P, the HDFC
         * folio, Motilal demat 37436848 and the Hedged Equity strategy print a
         * nil balance, and that is a MEASUREMENT. Both carry `valueNote`, so
         * null and 0 cannot be read as one thing.
         */
        const empty = accountEmptiness(a, held);
        // Every row under the ₹1,000 floor: none on this book, and a bare 0
        // there would read as a measured nil. The rows' own value is sent with
        // the reason the dashboard lists none of them.
        const allSpecks = !empty && live.length === 0;
        return {
          owner: a.owner, provider: a.provider, accountNo: a.accountNo,
          strategy: a.strategy, engagement: a.engagement, statementAsOf: a.asOf,
          holdings: live.length,
          valueCr: empty?.kind === "unvalued" ? null : empty?.kind === "redeemed" ? 0
            : cr(sum((allSpecks ? held : live).map((p) => p.marketValue))),
          valueBasis: empty ? null : priceBasisOf(allSpecks ? held : live, accts, quotesAsOf).summary,
          valueNote: empty
            ? `${empty.kind === "redeemed" ? "A measured nil" : "Not valued — no figure"}: ${empty.reason}`
            : allSpecks ? `every holding here is worth under ₹${NEGLIGIBLE_VALUE_FLOOR.toLocaleString("en-IN")}, so the dashboard lists none of them`
            // A FIGURE FOR SOME OF AN ACCOUNT'S HOLDINGS NAMES THE REST (Stage
            // 10ce): the live registry's own note, never re-worded here.
            : a.partialValuation ? `Partly valued — ${a.partialValuation}` : null,
        };
      }).sort((x, y) => (y.valueCr ?? -1) - (x.valueCr ?? -1)),
    },
    {
      kind: "top_holdings",
      shown: Math.min(TOP_HOLDINGS, holdingRows.length),
      total: holdingRows.length,
      basis: "ONE ROW PER SECURITY, clubbed across every account that reports it, each dually-reported holding counted"
        + " once — the unit Morning CIO's largest name and each holding's own page use. `pctOfBook` is of the"
        + " holdings the dashboard lists.",
      rows: holdingRows.slice(0, TOP_HOLDINGS).map(({ key, rows, value }) => {
        const head = rows[0];
        const costs = rows.map((p) => p.costBasis);
        const allCosted = costs.every((c) => typeof c === "number");
        return {
          security: head.security,
          securityKey: key,
          isin: head.isin ?? null,
          symbol: head.symbol ?? null,
          assetClass: head.assetClass,
          // Every category the rows span, largest first — the search reads the same (SC-C4).
          category: categoryWordsOf(rows, accts).join(" + "),
          sector: head.sector ?? null,
          quantity: sum(rows.map((p) => p.quantity)),
          valueCr: cr(value),
          pctOfBook: pct(value, bookMV),
          costBasisCr: allCosted ? cr(sum(costs as number[])) : null,
          costNote: allCosted ? null
            : `${costs.filter((c) => typeof c === "number").length} of the ${rows.length} statement rows behind this holding report a cost, so no total cost is stated`,
          priceBasis: priceBasisOf(rows, accts, quotesAsOf).summary,
          heldIn: rows.map((p) => {
            const a = accts.get(p.accountId);
            return { owner: a?.owner ?? null, provider: a?.provider ?? null, accountNo: a?.accountNo ?? null, statementAsOf: a?.asOf ?? null };
          }),
        };
      }),
    },
    {
      kind: "capital_accounts",
      note: "Drawdown capital accounts — what the family committed to a fund, what the fund has called, what was paid and"
        + " what it can still call. NOT a holding, and never summed into the Current Value of Holdings. Called and"
        + " paid are separate lines on the statements; each total says how many accounts print it.",
      privateMarket: {
        note: "The capital accounts of private-market funds — the ones the Private Market page and Morning CIO's"
          + " Capital deployment card count.",
        accounts: scope.onPage.length,
        committedCr: cr(pmTotals.committed),
        calledCr: cr(pmTotals.called), calledOn: `${pmTotals.calledOf} of ${pmTotals.count} accounts`,
        paidCr: cr(pmTotals.paid), paidOn: `${pmTotals.paidOf} of ${pmTotals.count} accounts`,
        stillToCallCr: cr(pmTotals.uncalled), stillToCallOn: `${pmTotals.uncalledOf} of ${pmTotals.count} accounts`,
        dueNowCr: cr(pmTotals.dueNow), dueNowOn: `${pmTotals.dueNowOf} of ${pmTotals.count} accounts`,
        distributedCr: cr(pmDistributed), distributedOn: `${pmDistributedOf} of ${pmTotals.count} accounts`,
        rows: scope.onPage.map(capitalRow),
      },
      publicMarketFunds: {
        // Each clause is CONDITIONED on being true of the rows it describes —
        // Stage 10bw's rule for the same sentence on the Private Market page.
        note: [
          scope.elsewhere.every((e) => e.basis === "family" && e.side === "listed")
            ? "Capital accounts of funds the family class as investing in listed markets."
            : "Capital accounts of funds this book does not place on the private side — each row says how it is placed.",
          "They call capital against a commitment, and are counted on no private-market figure.",
          scope.elsewhere.every((e) => currentRaw.some((p) => p.accountId === e.commitment.accountId && p.marketValue > 0))
            ? "Their holdings are in the Portfolio Monitor's AIF section."
            : null,
        ].filter(Boolean).join(" "),
        accounts: scope.elsewhere.length,
        committedCr: cr(sumOrNull(scope.elsewhere.map((e) => e.commitment.committed))),
        rows: scope.elsewhere.map((e) => ({ ...capitalRow(e.commitment), invests: e.invests, placedBy: e.basis })),
      },
    },
    /**
     * THE FAMILY'S CASH THAT NO HOLDING STATEMENT REPORTS (Stage 10ce).
     *
     * The arbitrage and liquid funds a depository reports on an account that
     * sent a transaction statement and no holding statement are valued by the
     * dashboard at the depository's closing units × AMFI's published NAV and
     * filed under Cash. This context is built from the SCREEN's book (SC-B1),
     * so they are INSIDE every total above — what a model must be told is
     * that no statement values them, so "as the statements print it" is not
     * true of these rows. Read off the book handed in, never off the helper
     * that makes them: a statement-basis book carries none, and says so.
     */
    {
      kind: "cash_valued_from_depository_units",
      note: depositoryCash.length
        ? "Arbitrage and liquid funds count as CASH — the family's own instruction, on every axis, never any other"
          + " category. These are held on an account that sent a transaction statement and no holding statement, so"
          + " no statement values them: the dashboard values them at the depository's closing units × AMFI's"
          + " published NAV, and they are INCLUDED in the Cash line and the Current Value of Holdings above. Their"
          + " units date from the statement's close, their NAV from its own publication date."
        : "No holding in this book is valued from a depository's units alone.",
      totalCr: depositoryCash.length ? cr(sum(depositoryCash.map((p) => p.marketValue))) : null,
      rows: depositoryCash.map((p) => ({
        fund: p.security, accountId: p.accountId, units: p.quantity, nav: p.currentPrice, navDate: p.navDate ?? null,
        unitsAsOf: p.depositoryUnits?.asOf ?? null, valueCr: cr(p.marketValue),
      })),
    },
    /**
     * THE OTHER FUNDS ON THE SAME DEPOSITORY STATEMENT (Stage 10cy).
     *
     * NOT CASH — the equity and hybrid schemes on the demat that sent a
     * transaction statement and no holding statement, valued the same way as
     * the block above. Told only the cash, a model asked "how much Bandhan Large
     * & Mid Cap do I hold" would miss the units on this demat and contradict the
     * screen.
     */
    {
      kind: "funds_valued_from_depository_units",
      note: depositoryFunds.length
        ? "These mutual funds are held on an account that sent a transaction statement and no holding statement,"
          + " so no statement values them: the dashboard values them at the depository's closing units × AMFI's"
          + " published NAV, and they are INCLUDED in the Current Value of Holdings above. They are not cash. No cost"
          + " is reported for them. Their units date from the statement's close, their NAV from its own publication date."
        : "No holding in this book is valued from a depository's closing units, other than the cash above.",
      totalCr: depositoryFunds.length ? cr(sum(depositoryFunds.map((p) => p.marketValue))) : null,
      rows: depositoryFunds.map((p) => ({
        fund: p.security, accountId: p.accountId, units: p.quantity, nav: p.currentPrice, navDate: p.navDate ?? null,
        unitsAsOf: p.depositoryUnits?.asOf ?? null, valueCr: cr(p.marketValue),
      })),
    },
    /**
     * FUND UNITS A HOLDING STATEMENT RECORDS AND VALUES NOWHERE (A-17, Stage 10cz).
     *
     * The three Motilal Oswal holding statements print a `Rate` and a `Value` on
     * every line — and the rate is the price of the holding's LAST DEPOSITORY
     * MOVEMENT, the value that price times that movement's own units: a
     * transaction, never a valuation of the balance. A line printing no rate at
     * all (A-17's ABSL Balanced Advantage) is the same case with no witness of
     * its own. The dashboard values such units at AMFI's NAV where a witness
     * puts them on the NAV's basis — the line's own last-movement rate, or a
     * sibling statement's price for the scheme — and each row names which.
     * A liquid or arbitrage fund among them counts as cash, as the page files
     * it; the rest do not, and each row says which it is.
     */
    {
      kind: "fund_units_a_holding_statement_records_and_values_nowhere",
      note: unpricedUnits.length
        ? "These fund units are on a holding statement that records them and does not value them: its Rate is the"
          + " price of the holding's last depository movement (a transaction price, lastMovementRate) or it prints"
          + " no rate at all. The dashboard values them at AMFI's published NAV — where the line's own last-movement"
          + " rate, or another account's statement at the same depository on the same date (pricedLikeAccountId),"
          + " shows the units and the NAV are on the same basis — and they are INCLUDED in the Current Value of"
          + " Holdings above. countsAsCash says whether the row counts as cash (a liquid or arbitrage fund) or not."
          + " No cost is reported for them."
        : "No holding in this book is valued from fund units a holding statement records without a valuation.",
      totalCr: unpricedUnits.length ? cr(sum(unpricedUnits.map((p) => p.marketValue))) : null,
      rows: unpricedUnits.map((p) => ({
        fund: p.security, accountId: p.accountId, units: p.quantity, nav: p.currentPrice, navDate: p.navDate ?? null,
        unitsAsOf: p.depositoryUnits?.asOf ?? null,
        lastMovementRate: p.depositoryUnits?.kind === "last-movement" ? p.depositoryUnits.lastMovementRate ?? null : null,
        lastMovementDate: p.depositoryUnits?.kind === "last-movement" ? p.depositoryUnits.lastMovementDate ?? null : null,
        pricedLikeAccountId: p.depositoryUnits?.kind === "no-rate" ? p.depositoryUnits.witnessAccountId ?? null : null,
        countsAsCash: isCashEquivalent(p),
        valueCr: cr(p.marketValue),
      })),
    },
    /**
     * LISTED SHARES A STATEMENT RECORDS AND ONLY THE LIVE QUOTE VALUES (Stage 10cy, 10cz).
     *
     * A transaction-only demat's closing balances, a holding statement's shares
     * printed at no rate or at face value, and the Motilal shares whose printed
     * rate is a last-movement price: each is a row only while the quote feed
     * prices it, so this block is empty on a day the feed does not answer — and
     * says so, because an empty list must not read as a family holding none.
     */
    {
      kind: "shares_valued_at_the_live_quote_from_a_statement_quantity",
      note: quotedShares.length
        ? "These listed shares are recorded by a statement as a quantity it does not value, so the dashboard values"
          + " them at the live quote only while the feed prices them, and they are INCLUDED in the Current Value of"
          + " Holdings above. recordedBy says what the statement printed: a transaction-only account's closing balance,"
          + " a holding statement with no usable price, or a holding statement whose rate is the last depository"
          + " movement's. No cost is reported for them."
        : "No share is valued at a live quote from a statement's quantity right now: the quote feed has priced none of"
          + " them in this book, so they are listed as quantities in the next block and in no total.",
      totalCr: quotedShares.length ? cr(sum(quotedShares.map((p) => p.marketValue))) : null,
      rows: quotedShares.map((p) => ({
        security: p.security, accountId: p.accountId, units: p.quantity, price: p.currentPrice,
        unitsAsOf: p.depositoryUnits?.asOf ?? null,
        recordedBy: closingBalance(p) ? "transaction-only-closing-balance"
          : p.depositoryUnits?.kind === "no-price" ? "holding-statement-no-price"
          : "holding-statement-last-movement-price",
        valueCr: cr(p.marketValue),
      })),
    },
    /**
     * EVERY LINE A HOLDING STATEMENT RECORDS AND VALUES NOWHERE (Stage 10cz).
     *
     * Named, so a question about one of them is answered with what the
     * statement actually says — a quantity and a date — and never with its
     * printed value, which is a transaction's or a face value and not a
     * valuation. `shownLiveNow` says whether the dashboard values the line
     * right now (one of the blocks above); the rest are quantities in no total.
     */
    {
      kind: "holdings_a_statement_records_and_values_nowhere",
      note: "These lines are on a holding statement as a quantity with no valuation this book can use: 'last-movement-price'"
        + " means the statement's Rate is the price of the holding's last depository movement; 'face-value' means"
        + " it prints the face value the shares or units were issued at; 'no-rate' means it prints units and no price."
        + " reportedBy names an account whose own statement already counts the same units, so the line is that holding"
        + " seen twice, never a second holding. shownLiveNow says whether the dashboard values the line right now"
        + " (a fund at AMFI's NAV, a share at the live quote while the feed prices it); a line it does not value is in"
        + " no total. Never value, estimate or sum these lines yourself.",
      count: BOOK_UNVALUED_HOLDINGS.length,
      rows: BOOK_UNVALUED_HOLDINGS.map((u) => ({
        security: u.security, accountId: u.accountId, assetClass: u.assetClass, units: u.quantity, asOf: u.asOf,
        why: typeof u.lastMovementRate === "number" && u.lastMovementRate > 0 ? "last-movement-price"
          : typeof u.faceValue === "number" ? "face-value" : "no-rate",
        reportedBy: u.sameUnitsReportedBy ?? null,
        shownLiveNow: fromUnits.some((p) => p.accountId === u.accountId && (
          u.isin && p.isin ? String(p.isin).toUpperCase() === String(u.isin).toUpperCase() : p.securityKey === u.securityKey)),
      })),
    },
    /**
     * THE BLOCK THAT KEEPS THE ANSWERS HONEST.
     *
     * Every one of these is a real limit of this book, derived rather than
     * asserted, and each is a question the assistant would otherwise answer
     * confidently and wrongly.
     */
    {
      kind: "what_this_book_does_not_carry",
      instruction:
        "These are limits of the source statements. If a question needs one of them, say the book does not carry it "
        + "and name what would supply it. Never estimate, interpolate or infer a figure that is not in this context.",
      blendedAsOf: {
        newest: portfolio.asOf,
        accountsBehind: behind,
        note: "A consolidated total is a blend of report dates, not a snapshot on one day.",
      },
      costBasis: {
        positionsWithNoCost: costless.length,
        of: current.length,
        valueCr: cr(sum(costless.map((p) => p.marketValue))),
        inAccountsTheFamilyRuns: costless.filter(selfRun).length,
        note: "A depository or broking account reports what is held, never what it cost —"
          + ` ${costless.filter(selfRun).length} of these ${costless.length} are in such accounts. Return on cost covers`
          + ` only the ${current.length - costless.length} holdings that report one.`,
      },
      doubleCount: {
        amountCr: cr(doubleCountedValue(portfolio.positions)),
        note: "Two holdings are reported under two members each. Both rows are carried; the consolidated total "
          + "counts each once. A per-account figure shows both. NOTHING ELSE IN THIS BOOK IS COUNTED TWICE: a "
          + "fund appearing on several screens is one holding seen from several angles, never two holdings.",
      },
      /**
       * THE SIDE NOTHING PLACES. A model told a total and a listed/private split
       * will reconstruct the second half by subtraction, and that subtraction
       * misses whatever neither side holds — ₹98,742 on this book (Blue Ashva).
       * The reason is the dashboard's own sentence (SC-C8): since Stage 10bw the
       * family's placing decides first, so "no statement prints a category" on
       * its own would have the model calling Delphi and Neo Infra unplaced.
       */
      marketSideUnplaced: {
        valueCr: cr(portfolio.unplacedValue),
        funds: [...new Set(current.filter((p) => (p.marketSide ?? null) === null).map((p) => p.security))].sort(),
        note: `${MARKET_SIDE_UNPLACED}. Listed + private + this === the Current Value of Holdings; do not derive either`
          + " side from the other two.",
      },
      /**
       * THE RING-FENCED HOLDING — named, dated, scoped and fenced (PC-04).
       *
       * By a documented decision (Stage 10s) it travels with an instruction
       * never to add it, so a model can recognise a question about it rather
       * than answering from nothing. What it lacked was what makes a figure a
       * figure: the statement's date, the share count, the account it covers
       * and the basis — the Polycab page shows the same holding at the
       * exchange's last close too, and a model given one undated number would
       * pass the statement value off as today's.
       */
      ringFenced: {
        security: BOOK_POLYCAB[0]?.security ?? null,
        isin: BOOK_POLYCAB[0]?.isin ?? null,
        shares: BOOK_POLYCAB.length ? sum(BOOK_POLYCAB.map((p) => p.quantity)) : null,
        valueCr: BOOK_POLYCAB.length ? cr(sum(BOOK_POLYCAB.map((p) => p.marketValue))) : null,
        valueBasis: "the depository statement's own value column (an NSDL statement prints no rate, so its mark is value ÷"
          + ` units) — the statement's mark${fencedAsOf.length === 1 ? ` as of ${fencedAsOf[0]}` : ""}, not today's price`,
        statementAsOf: fencedAsOf.length === 1 ? fencedAsOf[0] : fencedAsOf.length ? fencedAsOf : null,
        heldIn: fencedAccounts.map((a) => ({ owner: a.owner, provider: a.provider, accountNo: a.accountNo, statementAsOf: a.asOf })),
        scope: "What the statement(s) above report, for those account(s) only.",
        // ONE DEMAT'S HOLDING, never "the family's promoter stock" (PC-04): it is
        // what the account(s) in `heldIn` report, and no statement in this book
        // is a figure for the family's whole promoter holding.
        note: `${fencedAccounts.length === 1 ? "One demat's holding" : `${fencedAccounts.length} demats' holdings`} of`
          + " promoter stock — what the account(s) in heldIn report, not a figure for the family's whole promoter"
          + " holding — excluded by the family's request from every consolidated total, allocation, sector and"
          + " holdings figure above. It is shown only on the Polycab page, which also shows it at the exchange's last"
          + " close — a different figure. Do not add it to any total, and do not present this statement value as"
          + " today's value.",
      },
      notCarried: [
        "An XIRR for a single listed share or scheme — the transaction statements cover the current period only. (The"
          + " Private Market page does show a money-weighted XIRR for each private FUND, struck from its capital"
          + " account's dated calls and payouts; this context does not carry those rates, so point the reader there.)",
        "Realised gains for accounts whose manager issues no capital gain statement.",
        "A holding's own YTD or calendar-year return — no statement in this book values a holding on 1 January of any"
          + ` year; the oldest statement date among the accounts is ${[...accounts.map((a) => a.asOf)].filter(Boolean).sort()[0] ?? "unknown"}.`
          + " A dated contribution is not a valuation.",
        "Any figure about a private fund's underlying companies, except for the mutual funds and ETFs whose AMC "
          + "publishes a monthly portfolio disclosure.",
      ],
    },
  ];
}

/**
 * The tickers the book can actually reach a market feed with.
 *
 * `TICKER_SYMBOL` is the upstream's own hook for company research, and only a
 * resolved NSE symbol reaches it — a fund unit has none, by nature rather than
 * by omission. Capped, because a list of 139 symbols on every question is noise
 * rather than context. Ranked by the whole holding — a security clubbed across
 * every account that reports it — on the same book the screen shows.
 *
 * THE SYMBOL IS THE WHOLE FILTER. Measured over this book: **290 positions
 * carry a symbol and NOT ONE of them is private or unplaced**.
 */
export function contextTickers(book: ChatBook, limit = 15): string[] {
  const by = new Map<string, { symbol: string; value: number }>();
  for (const p of currentHoldings(book.consolidated)) {
    if (!p.symbol) continue;
    const e = by.get(p.securityKey) ?? { symbol: p.symbol, value: 0 };
    e.value += p.marketValue;
    by.set(p.securityKey, e);
  }
  return [...by.values()].sort((a, b) => b.value - a.value).slice(0, limit).map((e) => e.symbol);
}

/**
 * ── WHAT THE PANEL SAYS IT WAS GIVEN, READ OFF WHAT IT WAS GIVEN ─────────────
 *
 * The panel's own introduction used to be a sentence typed into the JSX, and it
 * was untrue in three places (SC-C1): it called a statement-book snapshot "this
 * dashboard" while the top bar showed a different figure; it said "every account"
 * over a payload capped at 50 of 51; and it promised the assistant could not see a
 * figure the dashboard does not show, over a payload that carried several. A
 * description of a payload that is typed rather than derived goes stale the day
 * the payload moves — so this reads the counts off the blocks themselves, and the
 * suite holds each one to the block it describes.
 *
 * It no longer claims the assistant sees NOTHING the dashboard does not show:
 * that is a promise about every field of every block, which no check here can
 * keep. What it does claim — the same code and the same prices as the pages,
 * each figure with its own date or basis — is what the suite asserts.
 */
export function describeContext(blocks: ContextBlock[]): { lead: string; missing: string; limits: string } {
  const get = (kind: string) => blocks.find((b) => b.kind === kind) as Record<string, unknown> | undefined;
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const members = (get("by_family_member")?.owners as unknown[] | undefined)?.length ?? null;
  // Counted off the ROWS actually sent, never off a `total`: a payload cut by a
  // cap still knows the total, and "all 51 accounts" over 50 rows is the claim
  // this function exists to stop.
  const acct = get("accounts") as { total?: number; rows?: unknown[] } | undefined;
  const accountRows = acct?.rows?.length ?? null;
  const accountTotal = count(acct?.total);
  const top = (get("top_holdings")?.rows as unknown[] | undefined)?.length ?? null;
  const cap = get("capital_accounts") as { privateMarket?: { accounts?: number }; publicMarketFunds?: { accounts?: number } } | undefined;
  const pm = count(cap?.privateMarket?.accounts);
  const pub = count(cap?.publicMarketFunds?.accounts);
  const parts = [
    "the current value of holdings the top bar shows and its listed / private / not-placed split",
    "the allocation by category",
    members != null ? `what each of the ${members} family members and trusts holds` : null,
    accountRows != null
      ? `${accountRows === accountTotal ? `all ${accountRows}` : `${accountRows} of the ${accountTotal ?? "?"}`} accounts`
        + " with their owner, statement date and value"
      : null,
    top != null ? `the ${top} largest holdings` : null,
    pm != null
      ? `the ${pm} private-market capital accounts${pub ? ` (the ${pub} public-market funds' capital accounts named apart)` : ""}`
      : null,
  ].filter(Boolean);
  return {
    lead: `The assistant is given a snapshot of the book this dashboard shows — ${parts.join(", ")} — `,
    missing: "and the list of things this book does not carry",
    limits: "Every figure in the snapshot is struck by the same code the dashboard's pages use, on the same prices, "
      + "and carries its own date or basis. The assistant cannot reach an account or place a trade. Answers are "
      + "generated text — check any figure against the page it came from.",
  };
}

/**
 * The same snapshot as text, prepended to the question.
 *
 * `DASHBOARD_INPUTS` is the documented slot and it is what the structured
 * blocks go in — but its handling is UNVERIFIED (the endpoint needs a token
 * this repo only has in Cloudflare, so nothing here could be exercised end to
 * end). A context the model never sees is worse than no context: it would
 * answer from nothing while looking fully briefed. So the same facts also ride
 * in the task text, where they are certain to arrive.
 */
export function contextPreamble(blocks: ContextBlock[]): string {
  return [
    "You are answering questions about a family office portfolio dashboard.",
    "The JSON below is the ONLY data you have about this book. Every figure in it is the dashboard's own, derived from",
    "the family's statements and valued as the dashboard values them (book_summary.basis says how). Answer only from it.",
    "",
    "Rules you must follow:",
    "1. Never state a figure that is not in this context, and never estimate, interpolate or round-trip one.",
    "2. If the answer needs something the context does not carry, say so plainly and name what would supply it.",
    "3. All *Cr fields are crore rupees. Do not convert or rescale them.",
    "4. Consolidated totals are a BLEND of report dates and price bases; say so when a date matters, and give a",
    "   figure's own date or basis when you quote it.",
    "5. The ring-fenced promoter holding is NOT part of any total here. Never add it in.",
    "6. A null figure is ABSENT, never zero: say it is not valued and give its reason.",
    "",
    "DASHBOARD DATA:",
    JSON.stringify(blocks),
    "",
    "QUESTION:",
  ].join("\n");
}
