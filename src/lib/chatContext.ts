// WHAT THE ASSISTANT IS TOLD ABOUT THIS BOOK.
//
// The chat box answers questions about the family's money, and a language model
// asked about money it cannot see will fill the gap. So this file's job is not
// "send some context" — it is to hand over a snapshot that is COMPLETE ENOUGH
// THAT GUESSING IS UNNECESSARY, and to name every absence explicitly, because an
// omission is exactly what invites an invention.
//
// ── EVERY FIGURE IS DERIVED, NONE IS TYPED ──────────────────────────────────
//
// Same rule as the screens: nothing here is a literal. The totals come from
// `BOOK_SUMMARY`, the rows from `BOOK_POSITIONS` and `BOOK_ACCOUNTS`, the
// buckets from `holdingBucket`, the dedupe from `dedupedPositions`. A drop that
// moves the book moves this with it, and a figure copied into prose here would
// go stale the way `docs/EXTRACTION-REPORT.md`'s counts once did.
//
// ── AND THE CAVEATS TRAVEL WITH THE FIGURES ─────────────────────────────────
//
// A consolidated total on this book is a BLEND of report dates; a return is
// struck over the accounts that publish an opening value; 60 of 371 positions
// carry no cost at all; Polycab is ring-fenced out of every total; ₹3.17 Cr is
// reported twice and counted once. A model told the totals and not those five
// things will answer confidently and wrongly, so `caveats` is not decoration —
// it is the part that keeps the answers honest, and it is derived too.
import {
  BOOK_SUMMARY, BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_POLYCAB, BOOK_COMMITMENTS,
} from "@/data/glowData";
import { depositoryCashHoldings } from "./fundNavs";
import {
  dedupedPositions, doubleCountedValue, holdingBucket, bucketLabel, publicPrivateSplit,
  topByValue, sum,
} from "@/lib/analytics";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { accountEmptiness } from "@/lib/searchIndex";
import type { Position } from "@/lib/types";

/** How many rows of each list to send. Enough to answer, small enough to fit. */
const TOP_HOLDINGS = 25;
const TOP_ACCOUNTS = 50;

const cr = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round((n / 1e7) * 100) / 100 : null;

/** One `DASHBOARD_INPUTS` entry — a named block of derived facts. */
export type ContextBlock = { kind: string; [k: string]: unknown };

/**
 * The book, as blocks.
 *
 * Deliberately NOT the whole of `BOOK_POSITIONS`: 371 rows of JSON crowds out
 * the question. The shape is a summary plus the rows a reader actually asks
 * about, and every list says how many rows it covers out of how many exist, so
 * a truncation can never read as the whole book.
 */
export function buildDashboardContext(): ContextBlock[] {
  const accts = accountIndex(BOOK_ACCOUNTS);
  const deduped = dedupedPositions(BOOK_POSITIONS);
  const split = publicPrivateSplit(deduped);
  // `staleAccounts` takes a Portfolio, and the count is the only thing needed
  // here — derived rather than re-implemented, so "N accounts behind" means the
  // same thing in the chat context as it does on the BasisPill.
  const behind = BOOK_ACCOUNTS.filter((a) => a.asOf && a.asOf < BOOK_SUMMARY.asOf).length;

  // ── allocation, on the same axis the Portfolio Monitor sections on ────────
  const byBucket = new Map<string, { value: number; count: number }>();
  for (const p of deduped) {
    const key = holdingBucket(p, engagementOf(accts, p) || null);
    const e = byBucket.get(key) ?? { value: 0, count: 0 };
    e.value += p.marketValue; e.count += 1;
    byBucket.set(key, e);
  }

  // ── per-owner, which does NOT dedupe: a per-entity figure shows each
  //    statement's row as printed (§"consolidated counts once, per-account
  //    does not").
  const byOwner = new Map<string, { value: number; accounts: Set<string> }>();
  for (const p of BOOK_POSITIONS) {
    const owner = accts.get(p.accountId)?.owner ?? "unattributed";
    const e = byOwner.get(owner) ?? { value: 0, accounts: new Set<string>() };
    e.value += p.marketValue; e.accounts.add(p.accountId);
    byOwner.set(owner, e);
  }

  const costless = BOOK_POSITIONS.filter((p) => p.costBasis == null);
  const costed = BOOK_POSITIONS.filter((p) => p.costBasis != null);
  const row = (p: Position) => ({
    security: p.security,
    securityKey: p.securityKey,
    symbol: p.symbol,
    assetClass: p.assetClass,
    sector: p.sector,
    quantity: p.quantity,
    marketValueCr: cr(p.marketValue),
    costBasisCr: cr(p.costBasis),
    owner: accts.get(p.accountId)?.owner ?? null,
    account: accts.get(p.accountId)?.provider ?? null,
  });

  return [
    {
      kind: "book_summary",
      asOf: BOOK_SUMMARY.asOf,
      currency: "INR",
      unit: "all *Cr fields are crore rupees (1 Cr = 10,000,000)",
      consolidatedNavCr: cr(BOOK_SUMMARY.totalValue),
      listedCr: cr(split.listed),
      privateCr: cr(split.private),
      /**
       * THE THIRD SIDE, and it travels with the other two or the model is
       * handed a NAV its own two components fall short of — which is exactly
       * the arithmetic a family office asks a chat about. `listed + private +
       * unplaced === consolidatedNavCr`, asserted in `chatContext.test.ts`.
       */
      notPlacedCr: cr(split.unplaced),
      notPlacedNote: "Funds whose statements print no SEBI category, so this book places them on"
        + " neither the listed nor the private side. They ARE inside the consolidated NAV above.",
      positions: BOOK_POSITIONS.length,
      distinctSecurities: new Set(BOOK_POSITIONS.map((p) => p.securityKey)).size,
      accounts: BOOK_ACCOUNTS.length,
      owners: [...byOwner.keys()],
    },
    {
      kind: "allocation_by_bucket",
      note: "Shares chosen by a discretionary manager roll up into that mandate; everything else groups by what it IS.",
      buckets: [...byBucket.entries()]
        .map(([key, v]) => ({ bucket: bucketLabel(key), valueCr: cr(v.value), holdings: v.count }))
        .sort((a, b) => (b.valueCr ?? 0) - (a.valueCr ?? 0)),
    },
    {
      kind: "by_family_member",
      note: "Per-owner figures are NOT deduplicated — each statement's row is shown as printed.",
      owners: [...byOwner.entries()]
        .map(([owner, v]) => ({ owner, valueCr: cr(v.value), accounts: v.accounts.size }))
        .sort((a, b) => (b.valueCr ?? 0) - (a.valueCr ?? 0)),
    },
    {
      kind: "accounts",
      shown: Math.min(TOP_ACCOUNTS, BOOK_ACCOUNTS.length),
      total: BOOK_ACCOUNTS.length,
      rows: BOOK_ACCOUNTS.map((a) => {
        const held = BOOK_POSITIONS.filter((p) => p.accountId === a.accountId);
        /**
         * ── AN ACCOUNT WITH NO VALUED HOLDING IS ONE OF TWO FACTS ───────────
         *
         * NULL where no statement values it, never 0 (SC-A1): India SME, Sky
         * Capital, the income-only 360 ONE folios and the face-value custody
         * accounts are ABSENCES, and a model handed `0` reports them as worth
         * nothing — "what is my India SME investment worth?" answered with a
         * zero. But 0 where every holding is REDEEMED TO NIL: 3P, the HDFC
         * folio, Motilal demat 37436848 and the Hedged Equity strategy print a
         * nil balance, and that is a MEASUREMENT. Both carry `valueNote` —
         * the reason travels WITH the figure, so null and 0 cannot be read
         * as one thing, which is the whole of this book's founding rule.
         */
        const empty = accountEmptiness(a, held);
        return {
          owner: a.owner, provider: a.provider, accountNo: a.accountNo,
          strategy: a.strategy, engagement: a.engagement, asOf: a.asOf,
          holdings: held.length,
          valueCr: empty?.kind === "unvalued" ? null : empty?.kind === "redeemed" ? 0 : cr(sum(held.map((p) => p.marketValue))),
          valueNote: empty
            ? `${empty.kind === "redeemed" ? "A measured nil" : "Not valued — no figure"}: ${empty.reason}`
            : null,
        };
      }).sort((x, y) => (y.valueCr ?? 0) - (x.valueCr ?? 0)).slice(0, TOP_ACCOUNTS),
    },
    {
      kind: "top_holdings",
      shown: Math.min(TOP_HOLDINGS, deduped.length),
      total: deduped.length,
      basis: "consolidated — each dually-reported holding counted once",
      rows: topByValue(deduped, TOP_HOLDINGS).map(row),
    },
    {
      kind: "undrawn_commitments",
      note: "Capital committed to a drawdown fund and not yet called. NOT a holding and never summed into NAV.",
      count: BOOK_COMMITMENTS.length,
      rows: BOOK_COMMITMENTS.map((c) => ({
        fund: c.name, provider: c.provider, ownerId: c.ownerId, asOf: c.asOf,
        committedCr: cr(c.committed), drawnCr: cr(c.drawn), undrawnCr: cr(c.undrawn),
        distributedCr: cr(c.distributed),
      })),
    },
    /**
     * THE FAMILY'S CASH THAT NO HOLDING STATEMENT REPORTS.
     *
     * Everything above is on the STATEMENT basis, and the arbitrage funds the
     * family asked to see inside Cash are on no statement's holdings: they sit
     * on a demat that sent a transaction statement and no holding statement.
     * The dashboard values them at the depository's closing units × AMFI's NAV
     * and files them under Cash. Told only the blocks above, a model asked "how
     * much cash do I hold" would answer without them and contradict the screen.
     */
    {
      kind: "cash_valued_from_depository_units",
      note: "Arbitrage and liquid funds count as CASH — the family's own instruction, on every axis, never any "
        + "other category. These are held on an account that sent a transaction statement and no holding "
        + "statement, so no statement values them and they are NOT in the statement-basis totals above. The "
        + "dashboard values them at the depository's closing units × AMFI's published NAV and includes them in "
        + "its Cash line and in its current value of holdings. Their units date from the statement's close.",
      totalCr: cr(sum(depositoryCashHoldings().map((p) => p.marketValue))),
      rows: depositoryCashHoldings().map((p) => ({
        fund: p.security, accountId: p.accountId, units: p.quantity, nav: p.currentPrice, navDate: p.navDate ?? null,
        unitsAsOf: p.depositoryUnits?.asOf ?? null, valueCr: cr(p.marketValue),
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
        newest: BOOK_SUMMARY.asOf,
        accountsBehind: behind,
        note: "A consolidated total is a blend of report dates, not a snapshot on one day.",
      },
      costBasis: {
        positionsWithNoCost: costless.length,
        of: BOOK_POSITIONS.length,
        valueCr: cr(sum(costless.map((p) => p.marketValue))),
        note: "Depository accounts report what is held, never what it cost. Return on cost covers only the "
          + `${costed.length} positions that report one.`,
      },
      doubleCount: {
        amountCr: cr(doubleCountedValue(BOOK_POSITIONS)),
        note: "Two holdings are reported under two members each. Both rows are carried; the consolidated total "
          + "counts each once. A per-account figure shows both. NOTHING ELSE IN THIS BOOK IS COUNTED TWICE: a "
          + "fund appearing on several screens is one holding seen from several angles, never two holdings.",
      },
      /**
       * THE SIDE THE STATEMENTS DO NOT NAME. A model told a NAV and a
       * listed/private split will reconstruct the second half by subtraction,
       * and on this book that subtraction is ₹16.69 Cr wrong.
       */
      marketSideUnplaced: {
        valueCr: cr(split.unplaced),
        funds: [...new Set(deduped.filter((p) => (p.marketSide ?? null) === null).map((p) => p.security))].sort(),
        note: "No statement for these prints a SEBI category, so the book places them on neither side. "
          + "Listed + private + this === the consolidated NAV; do not derive either side from the other two.",
      },
      ringFenced: {
        security: BOOK_POLYCAB[0]?.security ?? null,
        valueCr: cr(sum(BOOK_POLYCAB.map((p) => p.marketValue))),
        note: "The family's promoter stock, excluded by request from every consolidated total, allocation, sector "
          + "and holdings figure above. It is shown only on the Polycab page. Do not add it to the NAV.",
      },
      notCarried: [
        "Per-security XIRR — the transaction statements cover the current period only.",
        "Realised gains for accounts whose manager issues no capital gain statement.",
        "A holding's own YTD or calendar-year return — the archive begins in April, so no 1 January value exists.",
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
 * rather than context.
 *
 * THE SYMBOL IS THE WHOLE FILTER. This also carried `!isPrivateClass`, which
 * was redundant when it was written and became misleading when that predicate
 * started meaning "private capital" rather than "not an exchange-marked class"
 * — a Category III AIF now passes it and still has no symbol. Measured over
 * this book: **290 positions carry a symbol and NOT ONE of them is private or
 * unplaced**, so dropping the term changes no output and makes the code say
 * what the paragraph above already says.
 */
export function contextTickers(limit = 15): string[] {
  const deduped = dedupedPositions(BOOK_POSITIONS);
  return topByValue(deduped.filter((p) => p.symbol), limit)
    .map((p) => p.symbol as string);
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
    "The JSON below is the ONLY data you have about this book. Every figure in it is derived from the family's own",
    "statements. Answer only from it.",
    "",
    "Rules you must follow:",
    "1. Never state a figure that is not in this context, and never estimate, interpolate or round-trip one.",
    "2. If the answer needs something the context does not carry, say so plainly and name what would supply it.",
    "3. All *Cr fields are crore rupees. Do not convert or rescale them.",
    "4. Consolidated totals are a BLEND of report dates; say so when a date matters.",
    "5. The ring-fenced promoter holding is NOT part of any total here. Never add it in.",
    "",
    "DASHBOARD DATA:",
    JSON.stringify(blocks),
    "",
    "QUESTION:",
  ].join("\n");
}
