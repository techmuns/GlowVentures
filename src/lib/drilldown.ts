// WHAT IS BEHIND A FIGURE — one definition, read by the page that prints the
// figure and by the page that opens it.
//
// Morning CIO is a screen of totals: a NAV, a capital-invested sum, six
// allocation rows, seven concentration figures. Every one of them is struck over
// a SET of holdings, and until now only two of those sets had an address — a
// mandate (`/mandate/:accountId`) and a family entity (`/family?entity=`). A
// reader who wanted to know which holdings make up ₹352.35 Cr of AIF, or which
// 60 positions the Capital invested tile leaves out, had nowhere to click.
//
// THE ONE THING THIS FILE EXISTS TO PREVENT is the drill-down disagreeing with
// the tile it opened from. Two independent derivations of one set is how a page
// ends up contradicting the page it was reached from, and this repo has paid for
// that shape of bug repeatedly — the allocation footer on a different basis from
// its own column, the AIF section heading summing ₹3.17 Cr its own footer did
// not, the ledger reading both issues of a report the book supersedes. So the
// SET is defined here, once, and both sides call the same function:
//
//   • Morning CIO calls `drilldownHref` to link a figure it has just computed.
//   • The drill-down page calls `resolveDrilldown` to list the rows behind it.
//
// The predicates are deliberately delegated rather than re-written — buckets
// come from `holdingBucket`, the listed/private split from `isPrivateClass`, the
// opening-portfolio-value test from `returns.ts`. A predicate copied here would
// be a second source for a decision made elsewhere, which is the same failure
// one level down.
import type { Portfolio, Position } from "./types";
import type { FormulaDef } from "./auditFormulas";
import { accountIndex, engagementOf } from "./accounts";
import { holdingBucket, bucketLabel, isPrivateClass } from "./analytics";
import { accountHasOpeningValue } from "./returns";

/** The route the drill-down lives at. Imported, never typed at a call site. */
export const DRILLDOWN_PATH = "/holdings";

/** How many names the Top-N concentration figure covers. Mirrors Morning CIO. */
export const TOP_NAMES = 10;

/**
 * The sets a Morning CIO figure can be struck over.
 *
 * `bucket` is the only one that takes an argument, because the allocation table
 * has one row per bucket and the bucket keys are generated (`holdingBucket` can
 * return a class this drop does not carry). Every other id names a fixed set.
 */
export type DrilldownId =
  | "book"        // every holding — Consolidated NAV, Positions, Distinct names
  | "bucket"      // one allocation row
  | "invested"    // Capital invested and the Consolidated return struck on it
  | "measured"    // the accounts the money-weighted return covers
  | "top-names"
  | "cross-held"
  | "winners"
  | "losers";

const IDS = new Set<DrilldownId>([
  "book", "bucket", "invested", "measured", "top-names", "cross-held", "winners", "losers",
]);

/**
 * ── ONE ADDRESS PER TILE, AND THE SUB-SETS ARE FACETS OF IT ─────────────────
 *
 * *"there are multiple links on these KPI tiles… suppose for consolidated NAV,
 * the listed/private book links and pages should not exist separately — just
 * give the toggle option inside the Consolidated NAV link page."*
 *
 * Three scopes used to be their own addresses, reached from a SECOND link
 * inside a tile whose headline already linked somewhere else: `listed` and
 * `private` off the NAV tile's caption, `no-cost` off Capital invested's. A
 * reader had to know which of two links in one tile answered their question,
 * and landed on a page with no way back to the other half of the same figure.
 *
 * They are FACETS now — one page per tile, with a toggle across the sets that
 * figure is made of. The old ids still RESOLVE (`LEGACY` below) rather than
 * 404ing a bookmark: they were live addresses, and an address that silently
 * stops working is worse than one that redirects to the same rows.
 *
 * A facet is not a filter the reader invents. Each one is a set the TILE itself
 * already names — the listed and private halves are in the NAV's own caption,
 * the cost-less positions in Capital invested's — so the toggle shows exactly
 * the sets the figure was described in terms of, and nothing else.
 */
export type Facet = {
  key: string;
  /** The toggle's label. */
  label: string;
  /** What this set IS, rendered when it is the active one. */
  note: string;
  rows: Position[];
};

/** URL params. `view` is left to `useViewParam`, so the scope takes its own. */
export const SCOPE_PARAM = "of";
export const KEY_PARAM = "key";
export const FACET_PARAM = "facet";

/**
 * Addresses that were their own scope before the tiles were consolidated. Kept
 * so a bookmark or a stale screenshot still lands on the same rows — now as a
 * facet of the tile they belonged to.
 */
const LEGACY: Record<string, { id: DrilldownId; facet: string }> = {
  listed: { id: "book", facet: "listed" },
  private: { id: "book", facet: "private" },
  "no-cost": { id: "invested", facet: "no-cost" },
};

export function drilldownHref(id: DrilldownId, key?: string, facet?: string): string {
  const q = new URLSearchParams({ [SCOPE_PARAM]: id });
  if (key) q.set(KEY_PARAM, key);
  if (facet) q.set(FACET_PARAM, facet);
  return `${DRILLDOWN_PATH}?${q.toString()}`;
}

/** Parse an address back. An unrecognised id is `null`, never a silent default. */
export function parseDrilldown(params: URLSearchParams): { id: DrilldownId; key: string; facet: string } | null {
  const raw = params.get(SCOPE_PARAM) ?? "";
  const legacy = LEGACY[raw];
  if (legacy) return { id: legacy.id, key: "", facet: legacy.facet };
  if (!IDS.has(raw as DrilldownId)) return null;
  return {
    id: raw as DrilldownId,
    key: params.get(KEY_PARAM) ?? "",
    facet: params.get(FACET_PARAM) ?? "",
  };
}

export type Drilldown = {
  id: DrilldownId;
  key: string;
  /** The page's heading. */
  title: string;
  /** Which Morning CIO figures this exact set stands behind, named on the page. */
  backs: string[];
  /** One paragraph: what the set IS, in the terms the figure was struck in. */
  lead: string;
  /** The rows, on the same basis the figure was struck on. */
  rows: Position[];
  /**
   * TRUE where each `dedupeGroup` is counted once (a consolidated figure), FALSE
   * where every statement's row stands as printed (a per-account figure).
   *
   * It is on the object rather than assumed because this book gets it wrong in
   * both directions when it is assumed: a raw sum put ₹1.46 Cr into the
   * consolidated NAV twice, and deduping a per-account breakdown emptied an
   * account of a holding it prints. The page states which basis it is on.
   */
  deduped: boolean;
  /**
   * THE SETS THIS FIGURE IS MADE OF, as a toggle across one page.
   *
   * Empty where the figure has only one set. Where it has more, the first entry
   * is what the tile's headline figure is struck on and the rest are the sets
   * the tile's own caption names — the listed and private halves, the positions
   * reporting no cost, the accounts a rate cannot cover. Naming them on the tile
   * and then hiding them would be the same omission one click deeper, and giving
   * each its own page was what put two competing links inside one tile.
   */
  facets: Facet[];
  /** Which facet `rows` currently holds. Empty where the scope has none. */
  activeFacet: string;
  /** Accounts outside the set, by number — the money-weighted figure names them. */
  excludedAccounts: string[];
  /**
   * The dated window a rate is struck over, in days, where the scope has one.
   * NULL everywhere else — and null on `measured` too if no account publishes a
   * dated flow, because a window nobody can date is not a zero-day window.
   */
  windowDays?: number | null;
  /**
   * Set only where the scope is legitimately EMPTY, with what would fill it. An
   * empty table renders through `AbsentSection`, never as a frame around nothing.
   */
  absent: { what: string; needs: string } | null;
};

type Ctx = {
  portfolio: Portfolio;
  /** The consolidated set Morning CIO's figures are struck on. */
  consolidated: Position[];
};

/**
 * THE SET BEHIND ONE FIGURE.
 *
 * Every branch below either delegates its predicate to the helper that already
 * owns it, or is the same three lines Morning CIO runs — never a paraphrase of
 * one. Where a branch had to be written out (winners, cross-held), it is written
 * to mirror the page character for character, and `check:pages` asserts the two
 * agree on the RENDERED figures rather than on the source.
 */
export function resolveDrilldown(scope: { id: DrilldownId; key: string; facet?: string }, ctx: Ctx): Drilldown {
  const { portfolio, consolidated } = ctx;
  const accIdx = accountIndex(portfolio.accounts);
  const base: Omit<Drilldown, "id" | "key" | "title" | "backs" | "lead" | "rows"> = {
    deduped: true,
    facets: [],
    activeFacet: "",
    excludedAccounts: [],
    absent: null,
  };

  /**
   * PICK THE FACET THE ADDRESS ASKED FOR, and fall back to the first.
   *
   * An unrecognised facet resolves to the headline set rather than to an empty
   * table: the id is what names the figure, and a stale `facet=` in a bookmark
   * should still show the reader the figure they clicked. A wrong SCOPE is a
   * different matter and still refuses (`parseDrilldown` returns null), because
   * there the page could not say which figure it was answering for.
   */
  const withFacets = (
    d: Omit<Drilldown, "rows" | "facets" | "activeFacet">,
    facets: Facet[],
  ): Drilldown => {
    const active = facets.find((f) => f.key === scope.facet) ?? facets[0];
    return { ...d, facets, activeFacet: active?.key ?? "", rows: active?.rows ?? [] };
  };

  switch (scope.id) {
    case "bucket": {
      const rows = consolidated.filter((p) => holdingBucket(p, engagementOf(accIdx, p)) === scope.key);
      const label = bucketLabel(scope.key);
      return {
        ...base, id: scope.id, key: scope.key,
        title: label,
        backs: [`the ${label} row of Morning CIO's allocation table`],
        lead: `Every holding Morning CIO files under ${label}. The bucket is decided by \`holdingBucket\` — the one function every holdings table on this site groups by — so this list is the row's own arithmetic rather than a second reading of it.`,
        rows,
        absent: rows.length ? null : {
          what: `Nothing is filed under ${label}`,
          needs: `This address names a bucket the current book puts no holding in. A bucket the book HAS always has rows behind it: the allocation table only draws a row where its count is above zero, so a link from that table can never land here. Reaching this page means the address was typed or bookmarked from a book that has since been rebuilt.`,
        },
      };
    }

    case "invested": {
      // THE SAME `sumOrNull` SPLIT THE TILE MAKES. A statement that reports no
      // cost is skipped by the sum rather than entered as zero, so the tile's
      // figure covers a narrower set than the NAV beside it — and this is that
      // narrower set, with the remainder carried as a companion rather than
      // dropped.
      const costed = consolidated.filter((p) => p.costBasis != null);
      const without = consolidated.filter((p) => p.costBasis == null);
      return withFacets({
        ...base, id: scope.id, key: "",
        title: "Capital invested",
        backs: ["Capital invested", "Consolidated return"],
        lead: "Both figures on Morning CIO that divide by capital — Capital invested and the Consolidated return struck on it — are summed over the holdings whose statement prints what they cost. `sumOrNull` skips a missing cost rather than entering it as zero, which would understate the basis and overstate the return on everything else, so the tile's own caption names the remainder. Both sets are here.",
        absent: costed.length ? null : {
          what: "No holding in this book reports a cost",
          needs: "Every statement in the drop prints a holding without a basis. Capital invested and the Consolidated return are absent rather than zero until one carries a cost column.",
        },
      }, [
        {
          key: "costed", label: "Reports a cost",
          note: "The rows both capital figures are summed over.",
          rows: costed,
        },
        ...(without.length ? [{
          key: "no-cost", label: "Reports none",
          note: "In the NAV and in neither capital figure. A depository reports what is held, never what it was bought for, so their cost is absent rather than zero — and a zero would report the whole of their market value as profit at an infinite return. Measured across the whole audit archive, not one of these (account, security) pairs carries a cost on any record type.",
          rows: without,
        }] : []),
      ]);
    }

    case "measured": {
      /**
       * A PER-ACCOUNT FIGURE READS `portfolio.positions`, NOT THE DEDUPED SET —
       * and this is the one scope on this page where that matters.
       *
       * Morning CIO's `measuredMV` closes each measurable account against the
       * market value ITS OWN STATEMENT prints. Deduping here would take a
       * holding off whichever of two accounts lost the collapse and leave this
       * page's total below the coverage the tile states. No account carrying a
       * duplicate publishes an opening portfolio value in this drop, so the two
       * happen to agree today — which is exactly the condition under which the
       * mistake is invisible, and why it is written down rather than tested for.
       */
      const ids = portfolio.accounts
        .filter((a) => accountHasOpeningValue(portfolio, a.accountId))
        .map((a) => a.accountId);
      const keep = new Set(ids);
      const rows = portfolio.positions.filter((p) => keep.has(p.accountId));
      const excluded = portfolio.accounts
        .filter((a) => !keep.has(a.accountId))
        .map((a) => a.accountNo);
      const outside = portfolio.positions.filter((p) => !keep.has(p.accountId));
      /**
       * THE WINDOW THE RATE IS STRUCK OVER, and it is load-bearing rather than
       * decorative. Morning CIO's tile used to print "134-day window · not
       * annualised" beside the figure, and that caption is the whole of Stage
       * 10g(ii): the same tile once read +99.0% because a four-month return was
       * compounded onto a year, and nothing was miscalculated — an annualised
       * figure is a claim about a YEAR and this book has four months of flows.
       * The family asked for the tile's captions to go, so the window comes
       * here, to the page that lists the very accounts it is measured across.
       *
       * DERIVED FROM THE SAME INPUTS AS THE RATE, not paraphrased: the earliest
       * dated flow among the accounts that qualify, against the book's own
       * report date — the accounts being exactly the set this scope has just
       * resolved, so the two cannot describe different windows.
       */
      const flowDates = ids
        .flatMap((id) => (portfolio.accountCashFlows?.[id] ?? []).map((f) => f.date))
        .filter(Boolean)
        .sort();
      const windowDays = flowDates.length && portfolio.asOf
        ? Math.round((new Date(portfolio.asOf).getTime() - new Date(flowDates[0]).getTime()) / 864e5)
        : null;
      return withFacets({
        ...base, id: scope.id, key: "",
        deduped: false,
        title: "Money-weighted return",
        windowDays,
        backs: ["the coverage the Money-weighted return states"],
        lead: `An XIRR needs a stake to measure against, so it can only be struck on an account whose statements carry an opening portfolio value. ${ids.length} account${ids.length === 1 ? " does" : "s do"}, and their market value is the coverage figure the tile prints beside the rate. The rest sit outside it on BOTH sides — closing a market value against a stake nobody stated would overstate the return rather than approximate it — and are the second set here rather than a number the tile mentions and hides.`,
        excludedAccounts: excluded,
        absent: rows.length ? null : {
          what: "No account in this book carries an opening portfolio value",
          needs: "A money-weighted return needs the window's opening valuation as its first flow. No statement in the drop publishes one, so the rate is absent rather than struck on a stake nobody stated.",
        },
      }, [
        {
          key: "covered", label: "Covered by the rate",
          note: `The holdings of the ${ids.length} account${ids.length === 1 ? "" : "s"} whose statements carry an opening portfolio value.`,
          rows,
        },
        ...(outside.length ? [{
          key: "not-covered", label: "Not covered",
          note: "These accounts publish no opening portfolio value, so no money-weighted rate can be struck on them. Their market value IS in the consolidated NAV — they are outside this rate, not outside the book.",
          rows: outside,
        }] : []),
      ]);
    }

    case "top-names": {
      // GROUPED ON `securityKey`, LIKE THE FIGURE. The same company arrives from
      // two platforms under two spellings and, more often than not, with no ISIN
      // on either side, so the key is the only identity that joins them.
      const byKey = new Map<string, number>();
      for (const p of consolidated) byKey.set(p.securityKey, (byKey.get(p.securityKey) ?? 0) + p.marketValue);
      const top = new Set([...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_NAMES).map(([k]) => k));
      const rows = consolidated.filter((p) => top.has(p.securityKey));
      return {
        ...base, id: scope.id, key: "",
        title: `The ${top.size} largest names`,
        backs: ["Top-10 concentration"],
        lead: `Ranked by consolidated market value across every account, so a name two members both hold is one entry at its combined size rather than two smaller ones. The percentage on Morning CIO is these names' value over the whole book.`,
        rows,
        absent: rows.length ? null : {
          what: "No holding to rank",
          needs: "The book carries no position, so there is no concentration to measure.",
        },
      };
    }

    case "cross-held": {
      const owners = new Map<string, Set<string>>();
      for (const p of consolidated) {
        const s = owners.get(p.securityKey) ?? new Set<string>();
        s.add(ownerLabel(accIdx, p));
        owners.set(p.securityKey, s);
      }
      const shared = new Set([...owners.entries()].filter(([, s]) => s.size >= 2).map(([k]) => k));
      const rows = consolidated.filter((p) => shared.has(p.securityKey));
      return {
        ...base, id: scope.id, key: "",
        title: `Names held by two or more entities`,
        backs: ["Cross-held"],
        lead: "A security that appears on more than one family member's statements. This is not the duplicate policy — a cross-held name is two members each genuinely owning some of it, counted once per member; a DUPLICATE is one holding two statements both report, and the consolidated set above has already collapsed those.",
        rows,
        absent: rows.length ? null : {
          what: "No name is held by more than one entity",
          needs: "Every security in this book appears on exactly one member's statements, so the cross-held count is a measured zero rather than an absence.",
        },
      };
    }

    case "winners":
    case "losers": {
      /**
       * THE SAME `costUnavailable` GUARD THE TILE USES. A position whose cost
       * the book does not carry has no meaningful return, and counting it as
       * flat would file it under neither heading while inflating the set both
       * are read against. Those rows are named on the page instead.
       */
      const wantWin = scope.id === "winners";
      const priced = consolidated.filter((p) => !p.costUnavailable);
      const rows = priced.filter((p) => (wantWin ? (p.returnPct ?? 0) > 0 : (p.returnPct ?? 0) < 0));
      const flat = priced.filter((p) => (p.returnPct ?? 0) === 0);
      const unmeasured = consolidated.filter((p) => p.costUnavailable);
      const other = [...flat, ...unmeasured];
      return withFacets({
        ...base, id: scope.id, key: "",
        title: wantWin ? "Holdings showing a gain" : "Holdings showing a loss",
        backs: ["Winners / losers"],
        lead: `Every holding whose return against its own cost is ${wantWin ? "above" : "below"} zero on the basis the page is showing — live where a quote resolved, the statement mark where it did not. The two counts do not add to the book: a holding exactly at cost is in neither, and one whose cost the statements do not report has no return to sort on at all.`,
        absent: rows.length ? null : {
          what: wantWin ? "No holding is showing a gain" : "No holding is showing a loss",
          needs: "This is a measured zero rather than a missing figure: every priced holding in the book falls on the other side or exactly at cost.",
        },
      }, [
        { key: wantWin ? "winners" : "losers", label: wantWin ? "Showing a gain" : "Showing a loss", note: "", rows },
        ...(other.length ? [{
          key: "neither", label: "In neither count",
          note: "A return of exactly zero is a measurement and belongs under neither heading; a holding whose cost is unavailable has no return to measure. Both are here so the two counts on Morning CIO can be reconciled against the book rather than assumed to cover it.",
          rows: other,
        }] : []),
      ]);
    }

    case "book":
    default: {
      /**
       * THE LISTED AND PRIVATE HALVES ARE FACETS OF THE NAV, NOT PAGES OF THEIR
       * OWN — the change the family asked for by name. The NAV tile's caption
       * states both halves, so they are the sets this figure is described in
       * terms of; giving each its own address is what put three links inside
       * one tile.
       *
       * The split is on ASSET CLASS — what a holding IS — and not on how its
       * account is run: an AIF folio is marked by its manager rather than by an
       * exchange whether the family reached it through a wealth platform or
       * bought it directly. That is the same rule `BOOK_SUMMARY` splits on.
       *
       * Offered ONLY where the book has both halves. A toggle with an empty side
       * invites a reader to click into a table that can only be empty, and the
       * absence belongs on the tile that states the split rather than here.
       */
      const listed = consolidated.filter((p) => !isPrivateClass(p));
      const priv = consolidated.filter((p) => isPrivateClass(p));
      const split = listed.length > 0 && priv.length > 0;
      return withFacets({
        ...base, id: "book", key: "",
        title: "Every holding in the book",
        backs: ["Consolidated NAV", "Positions", "Distinct names"],
        lead: `The whole book across ${portfolio.accounts.length} accounts, consolidated — each holding two statements both report counted once. Both concentration counts are read off this one set: the row count is Positions, the name count is Distinct names.`,
        absent: consolidated.length ? null : {
          what: "The book carries no holding",
          needs: "No statement has been ingested, so there is nothing to list. Ingest a statement and every figure on this site populates itself.",
        },
      }, split ? [
        { key: "all", label: "All holdings", note: "Every position in the book.", rows: consolidated },
        {
          key: "listed", label: "Listed",
          note: "Everything the private classes do not name — marked by an exchange rather than by a manager.",
          rows: listed,
        },
        {
          key: "private", label: "Private",
          note: "AIF, Unlisted and Structured Product: the classes a manager marks rather than an exchange.",
          rows: priv,
        },
      ] : [{ key: "all", label: "All holdings", note: "Every position in the book.", rows: consolidated }]);
    }
  }
}

/**
 * The owner a position resolves to, matching `ownerOf` — imported rather than
 * re-implemented so the cross-held count here and the one on Morning CIO cannot
 * key on two different notions of "entity".
 *
 * AND IT MUST BE THE OWNER, NOT THE ACCOUNT — which no check on this book can
 * prove. Cross-held asks how many names more than one FAMILY MEMBER holds; keyed
 * on `accountId` it would answer how many names sit in more than one ACCOUNT,
 * and one member holding a name in two of their own mandates would be reported
 * as cross-held between entities. Measured on this drop both give 128, so
 * reintroducing the bug leaves the sweep green — the same shape as the
 * per-account dedupe above, and recorded here for the same reason: written down
 * rather than tested for, because the data cannot tell the two apart today.
 */
function ownerLabel(accIdx: ReturnType<typeof accountIndex>, p: Position): string {
  return accIdx.get(p.accountId)?.owner || "Unattributed";
}


/**
 * ── HOW THE FIGURE IS WORKED OUT, ON THE PAGE THE FIGURE OPENS ──────────────
 *
 * *"even the calculation that we're showing that appears when click the
 * underlined no. — we can show that inside the clickable KPI pages."*
 *
 * The arithmetic used to be a POPOVER on the tile, opened by a dashed underline
 * under the number. That underline was the second affordance on a card whose
 * whole surface is now the click target, and the popover was a 328px box that
 * had to be dismissed before the reader could do anything else. It reads better
 * where the reader lands: the set is already on screen there, so the worked
 * example sits above the very rows it is summed over.
 *
 * IT IS STRUCK ON `d.rows`, WHICH IS THE ACTIVE FACET — never on the whole
 * scope. A reader who has toggled to the private half must not be shown the
 * whole book's arithmetic under a heading reading "Private": that is the
 * caption-does-not-describe-its-figure failure this repo has already paid for
 * on the Capital invested tile, and it would arrive here the moment the worked
 * line was computed from anything but the rows below it.
 *
 * The money formatter is passed IN rather than imported. Every figure in this
 * app renders in the reader's selected display currency through `fmtFromBase`,
 * which lives on the portfolio context; a formatter hard-coded here would print
 * rupees on a page showing dollars. Same seam `auditFormulas.ts` already uses.
 */
/**
 * ── A REFUSED RETURN STAYS REFUSED, WHEREVER IT IS PRINTED ──────────────────
 *
 * Morning CIO's allocation row prints an em dash for Return where its Invested
 * column covers a minority of its holdings: Value spans all of them and
 * Invested spans some, so a percentage across the two would divide one set of
 * holdings by another. The drill-down page runs the same test on its own tile,
 * and so must the worked example beside it.
 *
 * IT LIVES HERE BECAUSE THREE SURFACES NEED THE SAME ANSWER. It was a private
 * helper in `HoldingsBehind` while only that page ran it; the moment the formula
 * card started stating a return too, a second copy would have been a second
 * definition of "covered enough" — and the first draft, which simply divided,
 * printed `−0.0% over 2 of 24` for Mutual Fund on a page whose own tile
 * correctly showed a dash. Two figures for one set, one click apart.
 */
export function coveredReturn(mv: number, cost: number | null, pnl: number | null, withoutCostMV: number) {
  const covers = mv > 0 && withoutCostMV <= mv * 0.005;
  return {
    covers,
    pct: covers && cost !== null && pnl !== null && cost > 0 ? (pnl / cost) * 100 : null,
  };
}

export function drilldownFormula(d: Drilldown, money: (n: number) => string): FormulaDef | null {
  const rows = d.rows;
  if (!rows.length) return null;

  const mv = rows.reduce((a, p) => a + p.marketValue, 0);
  const costed = rows.filter((p) => p.costBasis != null);
  // `sumOrNull`'s rule, inline: null when NOTHING reports a cost, and the sum
  // over those that do otherwise. A zero here would report the whole market
  // value as profit at an infinite return.
  const cost = costed.length ? costed.reduce((a, p) => a + (p.costBasis ?? 0), 0) : null;
  const accounts = new Set(rows.map((p) => p.accountId)).size;
  const names = new Set(rows.map((p) => p.securityKey)).size;
  const n = (k: number, one: string, many = one + "s") => `${k} ${k === 1 ? one : many}`;

  /** The active facet's own label, so a narrowed page never reads as the whole. */
  const facet = d.facets.length > 1
    ? d.facets.find((f) => f.key === d.activeFacet)?.label ?? ""
    : "";
  const of = facet ? ` · ${facet}` : "";

  const spread = `across ${n(rows.length, "position")} in ${n(accounts, "account")}`;
  const basis = d.deduped
    ? "Each holding that two members' statements both report is counted once."
    : "Every statement's row stands as printed — this is a per-account figure and is not deduped.";

  switch (d.id) {
    case "book": {
      /**
       * WHAT THIS FIGURE LEAVES OUT, stated where the figure is. The managers'
       * printed totals fold accrued income into market value on some rows and
       * not others, so the book carries it as its own field and the NAV excludes
       * it throughout — which makes our total differ from a statement's by
       * exactly this, and a reader reconciling the two needs to be told.
       *
       * Morning CIO's tile used to say so, and the family asked for the tile's
       * captions to go. It is the ONE line among them that no other surface
       * carried, so it moved here rather than went.
       */
      const accrued = rows.reduce((a, p) => a + (typeof p.accruedIncome === "number" ? p.accruedIncome : 0), 0);
      const accruedRows = rows.filter((p) => typeof p.accruedIncome === "number" && p.accruedIncome !== 0).length;
      return {
        title: `Consolidated NAV${of}`,
        excel: "= Σ market value of every holding",
        plain: `The market value of every holding in this set, at each account's latest mark. ${basis} The two counts beside it are read off the same set: ${n(rows.length, "position")} is what Morning CIO calls Positions, and ${n(names, "distinct name")} is Distinct names — a name two members both hold is one name and two positions.${
          accruedRows
            ? `\n\nNOT IN THIS FIGURE: ${money(accrued)} of accrued income — dividends and interest declared on ${n(accruedRows, "holding")} here and not yet received. The managers' printed totals include it on some rows and not others, so the book carries it as its own field and every market value on this site excludes it. A statement whose total runs above ours by about this much is agreeing with us, not disagreeing.`
            : ""
        }`,
        worked: `= ${money(mv)} ${spread} · ${n(names, "name")}`,
      };
    }

    case "invested": {
      // BOTH FIGURES THAT DIVIDE BY CAPITAL OPEN THIS PAGE, so the worked
      // example carries both: printing only the sum would leave the reader who
      // clicked Consolidated return with the denominator and no division.
      const gain = cost == null ? null : mv - cost;
      const pct = cost != null && cost > 0 && gain != null ? (gain / cost) * 100 : null;
      return {
        title: `Capital invested${of}`,
        excel: "= Σ cost basis of every holding    ·    Return = (Value − Invested) ÷ Invested",
        plain: `What the statements say these holdings cost. \`sumOrNull\` SKIPS a holding whose statement prints no cost rather than entering it as zero — a zero would drag the basis down and report that holding's whole market value as profit — so the figure covers ${n(costed.length, "holding")} of ${rows.length} here. The Consolidated return is struck over exactly the same set, which is why both tiles open this one page.`,
        worked: cost == null
          ? `= — · no statement in this set reports a cost, so there is nothing to sum`
          : `= ${money(cost)} over ${n(costed.length, "holding")} of ${rows.length}${
              pct == null ? "" : ` · return = (${money(mv)} − ${money(cost)}) ÷ ${money(cost)} = ${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`
            }`,
      };
    }

    case "measured":
      // THE RATE ITSELF IS NOT RESTATED HERE, DELIBERATELY. It is a pooled XIRR
      // over every account's dated flows, each closing on its own report date,
      // and re-deriving it on this page would be a SECOND source for one figure
      // — the exact failure this whole file exists to prevent. What this page
      // owns is the SET the rate is struck over, so that is what it works out.
      return {
        title: `What the money-weighted return covers${of}`,
        excel: "= XIRR(each account's dated flows + its own market value on its own report date)",
        plain: `Excel's XIRR() over every dated capital movement the statements carry — the window's opening portfolio value first, then each contribution, withdrawal and TDS transfer on the day it happened. Trades are not flows: a sale moves cash inside an account rather than out of it, and its proceeds are already inside the closing value. ${basis} The rate needs an opening stake to measure against, so it can only be struck where a statement publishes one; this page is the set that qualifies, and the rate itself stays on the tile it was clicked from.${
          d.windowDays == null
            ? ""
            : d.windowDays >= 365
              ? `\n\nTHE WINDOW IS ${d.windowDays} DAYS, so the rate is a genuine annual one.`
              : `\n\nTHE WINDOW IS ${d.windowDays} DAYS, AND THE RATE IS NOT ANNUALISED. It is what these accounts have actually earned over that window. Compounding it onto a full year would be a projection of ${d.windowDays} days rather than a year the book has lived — this tile once read +99.0% for exactly that reason, with nothing miscalculated, and it contradicted the managers' own annualised since-inception figures for these very accounts, which run from about 7% to 31%. When the flows eventually span a year the same calculation starts returning an annual rate and says so.`
        }${
          /**
           * ── THE TWO BASES, ON ONE SET ────────────────────────────────────
           *
           * Morning CIO's allocation footer used to carry this comparison in a
           * popover, because the money-weighted rate and the footer's own
           * return-on-cost are two different measurements and a reader seeing
           * both needs them told apart. That popover is gone with the table's
           * underlines, and this is a SHARPER place for it: the footer set a
           * whole-book figure against a seven-account one, where here both
           * bases describe the SAME accounts — the Return on cost tile above is
           * the cost basis, and the rate on the tile you clicked is the dated
           * one. The difference between them is WHEN the money arrived, which
           * is the whole reason the second measurement exists.
           */
          cost == null || cost <= 0
            ? ""
            : `\n\nTWO MEASUREMENTS OF THIS SAME SET. Return on cost above divides ${money(mv)} by the ${money(cost)} these holdings cost and asks what the capital has produced; the money-weighted rate asks what it produced GIVEN WHEN IT ARRIVED, so a rupee that landed a month before the close is credited with a month rather than the whole window. They answer different questions and neither is a correction of the other — the gap between them is the timing of the flows.`
        }`,
        worked: `= ${money(mv)} ${spread}${d.excludedAccounts.length ? ` · ${n(d.excludedAccounts.length, "account")} outside it` : ""}${
          d.windowDays == null ? "" : ` · ${d.windowDays}-day window${d.windowDays >= 365 ? "" : " · not annualised"}`
        }`,
      };

    case "bucket": {
      /**
       * THE RETURN THE ALLOCATION ROW'S CHIP USED TO EXPLAIN. That chip carried
       * a popover, and the dashed underline that opened it was the last
       * underline in the table — *"remove the underlines from the allocation
       * table too."* So the arithmetic lands here, on the page the row already
       * opens, beside the very holdings it is struck over.
       *
       * AND IT REFUSES ITSELF ON EXACTLY THE ROWS THE CHIP DOES. A bucket whose
       * Invested column covers a minority of its holdings has no return that
       * divides one column by the other — the two would span different sets —
       * so the em dash is the answer here too, with the count that causes it.
       */
      const costedMV = costed.reduce((a, p) => a + p.marketValue, 0);
      // THE SAME TEST THE ROW AND THE TILE RUN, not a re-derivation of it.
      const { pct } = coveredReturn(mv, cost, cost == null ? null : costedMV - cost, mv - costedMV);
      const full = costed.length === rows.length;
      return {
        title: `${d.title}${of}`,
        excel: "= Σ market value of the holdings in this bucket    ·    Return = (Value of the costed holdings − Invested) ÷ Invested",
        plain: `The bucket is decided by \`holdingBucket\`, the one function every holdings table on this site groups by — so this is the allocation row's own arithmetic rather than a second reading of it. ${basis}${
          pct == null
            ? cost == null
              ? "\n\nNo holding here reports a cost, so there is nothing to strike a return against — the market value stands on its own."
              : `\n\nNO RETURN IS STRUCK HERE, and the allocation row this page opens from prints an em dash for the same reason: Invested covers ${n(costed.length, "holding")} of ${rows.length} and Value covers all of them, so the ${money(mv - costedMV)} that reports no cost stands in one column and not the other. A percentage across the two would divide one set of holdings by another.`
            : full
              ? "\n\nThe return is CUMULATIVE, not annualised: it is the gain this bucket has produced to date on the capital in it, not a yearly pace."
              : `\n\nThe return is CUMULATIVE, not annualised, and it covers ${n(costed.length, "holding")} of ${rows.length}: the other ${rows.length - costed.length} report no cost, and their ${money(mv - costedMV)} stands in the value column and on neither side of the ratio.`
        }`,
        worked: `= ${money(mv)} ${spread}${
          pct == null
            ? cost == null
              ? " · no cost reported, so no return"
              : ` · cost ${money(cost)} over ${n(costed.length, "holding")} of ${rows.length} · return —`
            : ` · ${money(cost ?? 0)} invested → ${money(costedMV)} today = ${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`
        }`,
      };
    }

    case "top-names":
      return {
        title: `Top-${TOP_NAMES} concentration${of}`,
        excel: `= Σ market value of the ${TOP_NAMES} largest names ÷ Consolidated NAV`,
        plain: `Ranked on \`securityKey\` and on consolidated market value, so a name two members both hold is ONE entry at its combined size rather than two smaller ones. ${basis} The percentage on Morning CIO is this sum over the whole book, so it moves when a name grows and when the book around it does.`,
        worked: `= ${money(mv)} across ${n(names, "name")} · ${n(rows.length, "position")} in ${n(accounts, "account")}`,
      };

    case "cross-held":
      return {
        title: `Cross-held names${of}`,
        excel: "= count of securityKeys appearing under two or more owners",
        plain: `Grouped by OWNER rather than by account: the question is how many names more than one family member holds, and keyed on the account it would instead count a name one member holds in two of their own mandates. ${basis} This is not the duplicate policy — a cross-held name is two members each genuinely owning some of it; a duplicate is ONE holding that two statements both report, and the set above has already collapsed those.`,
        worked: `= ${n(names, "name")} · ${n(rows.length, "position")} across ${n(accounts, "account")} · ${money(mv)}`,
      };

    case "winners":
    case "losers":
      return {
        title: `${d.title}${of}`,
        excel: `= count of holdings whose (Value − Cost) ÷ Cost is ${d.id === "winners" ? "above" : "below"} zero`,
        plain: `Struck on the basis the page is showing — live where a quote resolved, the statement mark where it did not. A holding whose cost the statements do not report has NO return to sort on and is in neither count; one sitting exactly at cost is a measured zero and is also in neither. Both are the second set on this page rather than a remainder a reader has to find by subtracting.`,
        worked: `= ${n(rows.length, "holding")} · ${money(mv)}${cost == null ? "" : ` · cost ${money(cost)}`}`,
      };
  }
}
