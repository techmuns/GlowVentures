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
import { accountIndex } from "./accounts";
import { costCoversSet, currentHoldings, droppedHoldings, isPrivateClass, isUnplacedSide, SIDE_NOTE, sum } from "./analytics";
import { fifoTotals, type FifoOptions, type FifoTotals } from "./fifo";
/**
 * THE SECTION AXES, AND THE ONE PLACE THAT DECIDES THEM. Morning CIO's
 * allocation table can be grouped three ways, and a drill-down that re-derived
 * a holding's section would be a second answer to the question the row it
 * opened from already answered. Same reason the predicates below are delegated
 * rather than paraphrased.
 */
import { type GroupAxis, groupKeyFor, groupLabelFor, GROUP_NOUN } from "./groupAxis";
import { measuredAccountsReturn } from "./returns";
import { xirrPct, moneyWeightedReturn, type MoneyWeighted } from "./bucketXirr";

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
  | "book"        // every holding — Current Value of Holdings (and the capital invested in it), Positions, Distinct names
  | "bucket"      // one allocation row, on the CATEGORY axis
  /**
   * ONE ALLOCATION ROW ON EACH OF THE FAMILY'S OWN TWO AXES.
   *
   * Morning CIO's allocation table can now be sliced three ways, and each slice
   * has to open the holdings behind it exactly as the category rows already do
   * — an axis a reader can select but not open would be a table of totals with
   * no way in, which is the state this whole page was built to end.
   *
   * They are SCOPES OF THEIR OWN rather than a `bucket` address carrying an
   * extra `axis=` param, because the three axes answer different questions and
   * the address should say which: `?of=basket&key=Stable Growth` names the
   * family's judgement, `?of=bucket&key=AIF` names what the instrument is. It
   * also leaves every existing `?of=bucket` bookmark meaning precisely what it
   * meant before.
   */
  | "basket"        // …on the family's BASKET axis
  | "family-class"  // …on the family's own ASSET-CLASS axis
  | "measured"    // the accounts the money-weighted return covers
  | "top-names"
  | "cross-held"
  | "winners"
  | "losers";

const IDS = new Set<DrilldownId>([
  "book", "bucket", "basket", "family-class",
  "measured", "top-names", "cross-held", "winners", "losers",
]);

/**
 * WHICH SCOPE OPENS A ROW OF THE ALLOCATION TABLE, per axis — the one place the
 * mapping lives, so Morning CIO builds the link and this file resolves it from
 * the same table rather than from two agreeing literals.
 */
export const AXIS_SCOPE: Record<GroupAxis, DrilldownId> = {
  category: "bucket", basket: "basket", assetClass: "family-class",
};
/** …and back, for the three branches that share one implementation. */
const SCOPE_AXIS: Partial<Record<DrilldownId, GroupAxis>> = {
  bucket: "category", basket: "basket", "family-class": "assetClass",
};

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
  /**
   * WHICH QUESTION THIS FACET ANSWERS, where a figure is made of sets along two.
   *
   * The Current Value of Holdings page carries the SIDES of the book (listed,
   * private, not placed) and, since Capital invested was folded into it, the
   * COST split too (reports a cost, reports none). Each group partitions the
   * page's rows on its own; the two together do not, so the toggle draws a
   * divider between them and a check reconciles each group separately.
   * Absent on a scope with one group.
   */
  group?: "side" | "cost";
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
  /**
   * CAPITAL INVESTED WAS ITS OWN PAGE, AND IS NOW PART OF THIS ONE.
   *
   * *"Capital invested and current value of holdings can be a single KPI tile
   * rather than two separate KPI tiles opening two separate pages … they can be
   * a single one, with a consolidated view."* The two pages drew the same
   * table over the same holdings; what the Capital invested page added was the
   * split between the holdings that report a cost and the ones that do not.
   * That split is two facets of the Current Value of Holdings page now, and the
   * old addresses land on them rather than on a not-found page.
   */
  invested: { id: "book", facet: "costed" },
  "no-cost": { id: "book", facet: "no-cost" },
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
  /**
   * THE FIGURE THIS PAGE OPENED FROM, AS THE TILE LABELS IT.
   *
   * *"The first line 'Morning CIO › What is Behind this Figure' should rather
   * label the page/KPI tile that we have opened — 'Morning CIO › Current Value
   * of Holding'."* This route serves eleven different sets and the crumb read
   * the same sentence for every one of them, which is a description of the
   * ROUTE: a reader who clicked a tile and wants to know which tile they are
   * inside learnt nothing from it.
   *
   * IT IS THE TILE'S OWN LABEL AND NOT THE HEADING BESIDE IT. Those differ on
   * purpose — the heading names the SET ("Every holding in the book") and this
   * names the FIGURE ("Current Value of Holdings") — and where a figure and
   * its set share a name, as an allocation row does, the two agree by
   * construction rather than by coincidence.
   */
  crumb: string;
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
  /**
   * HOW MANY CLOSED POSITIONS THIS PAGE LEFT OUT.
   *
   * *"we only need to show current holdings in the consolidated drill down
   * pages, anything that has been sold or redeemed shouldn't be shown here."*
   * So every set below is drawn from holdings the family still owns, and this
   * counts what that filter removed.
   *
   * IT MOVES NO FIGURE, WHICH IS WHY THE FILTER IS SAFE HERE. Measured over this
   * book, all five redeemed rows carry `marketValue: 0` and `costBasis: null` —
   * the fund still prices what the family no longer holds — so they add nothing
   * to the value total and are already skipped by `sumOrNull` in the cost total.
   * Only the COUNTS move, and the page says so rather than letting a reader who
   * arrived from a tile reading 369 wonder where five rows went.
   */
  closedExcluded: number;
  /**
   * HOW MANY ROWS THE ₹1,000 FLOOR LEFT OUT, AND WHAT THEY WERE WORTH.
   *
   * A SECOND COUNT RATHER THAN A WIDER ONE, because the two carry DIFFERENT
   * REASONS and this page prints the reason. Folded into `closedExcluded` the
   * six specks would have been described to the reader as redemptions — "the
   * fund still publishes a NAV, the family no longer holds them" — about four
   * mutual funds and two shares the family holds perfectly well and simply
   * holds ₹848.24 of. A confidently wrong reason is worse than a vague one; it
   * sends the next reader to ask a fund manager about a redemption that never
   * happened.
   *
   * AND THIS ONE CARRIES A VALUE, WHERE THE CLOSED COUNT DOES NOT NEED TO. A
   * closed row is ₹0 by construction, so its count is the whole story. These
   * rows moved the page's own total, and a reader reconciling it against
   * Morning CIO is owed the figure rather than the count alone.
   */
  negligibleExcluded: { count: number; value: number };
  /**
   * Set only where the scope is legitimately EMPTY, with what would fill it. An
   * empty table renders through `AbsentSection`, never as a frame around nothing.
   */
  absent: { what: string; needs: string } | null;
  /**
   * THE MONEY-WEIGHTED TILE'S OWN RATE, on the page that tile opens (B-06).
   * Set on the `measured` scope only, and struck by `bookMoneyWeighted` — the
   * function the Morning CIO tile calls — so the page a reader clicks through
   * to states the figure they clicked rather than a return on cost alone.
   */
  moneyWeighted?: BookMoneyWeighted;
};

/**
 * What each side of the book is: ONE definition, in `analytics.ts` beside the
 * `marketSides` that Upload History and Data Refresh read, re-exported here for
 * the facets below and Morning CIO's side tiles (CK-C5). A second copy here is
 * how the two came to describe one side two ways.
 */
export { SIDE_NOTE };

type Ctx = {
  portfolio: Portfolio;
  /** The consolidated set Morning CIO's figures are struck on. */
  consolidated: Position[];
  /**
   * THE STATEMENT BOOK — what the money-weighted rate closes each account on.
   * Its flows are complete only to each statement's date, so a live value does
   * not belong at that date. Absent, the live portfolio stands in (as it does
   * on Morning CIO before the statement book has loaded).
   */
  statement?: Portfolio | null;
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
  const { portfolio } = ctx;
  const accIdx = accountIndex(portfolio.accounts);
  /**
   * CURRENT HOLDINGS ONLY, AND IT IS FILTERED IN ONE PLACE.
   *
   * A position a fund still prices but the family no longer holds is CLOSED, and
   * every set on this page is drawn from what is held now. Done here rather than
   * per branch because there are nine branches and each would be a chance for one
   * page to list a redeemed row the others drop — the same reason `holdingBucket`
   * and `costCoversSet` are single functions.
   *
   * THROUGH `currentHoldings`, NOT A LOCAL PREDICATE. This read
   * `!isRedeemedToNil(p)` — a second answer to "what does the family hold",
   * written before there was a second rule to get wrong. The ₹1,000 floor is
   * that second rule, and an inline test would have applied it on the Portfolio
   * Monitor and not here: a tile reading 364 opening a table of 370, which is
   * the one disagreement this module exists to prevent.
   *
   * It is called on each set rather than used as a predicate because the floor
   * is struck on the SECURITY's whole value, which no per-row predicate can see.
   */
  const consolidated = currentHoldings(ctx.consolidated);
  const livePositions = currentHoldings(portfolio.positions);
  // Struck on the DEDUPED set, like the counts it sits beside: the per-account
  // scope below overrides `closedExcluded` with its own for exactly that reason.
  const dropped = droppedHoldings(ctx.consolidated);
  // `backs` and `lead` were removed from this type at Stage 10ao with the header
  // pill row and the lead paragraph; `crumb` replaced neither — it names the
  // FIGURE where `backs` named the tiles that link here.
  const base: Omit<Drilldown, "id" | "key" | "title" | "crumb" | "rows"> = {
    deduped: true,
    facets: [],
    activeFacet: "",
    closedExcluded: dropped.closed.length,
    negligibleExcluded: { count: dropped.negligible.length, value: sum(dropped.negligible.map((p) => p.marketValue)) },
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
    /**
     * ── ONE ALLOCATION ROW, ON WHICHEVER AXIS THE TABLE WAS GROUPED BY ──────
     *
     * Three ids, one implementation. The rows differ only in which function
     * decides the section, and that function is `groupKeyFor` — THE SAME ONE
     * Morning CIO's table groups on and the Portfolio Monitor sections on. A
     * branch per axis would be three chances for a drill-down to list a set the
     * row it opened from does not sum.
     *
     * WHAT DIFFERS IS THE SENTENCE, and it has to. A category is derived from
     * the book and asks nothing of the family; a basket and the family's asset
     * class are the FAMILY'S OWN JUDGEMENT, stated in their consolidated review
     * and derivable from no statement in the archive. A reader is entitled to
     * know which of those they are looking at, so the lead says so per axis
     * rather than describing all three as "the row's own arithmetic".
     */
    case "bucket":
    case "basket":
    case "family-class": {
      const axis = SCOPE_AXIS[scope.id] as GroupAxis;
      const rows = consolidated.filter((p) => groupKeyFor(axis, accIdx, p) === scope.key);
      const label = groupLabelFor(axis)(scope.key);
      const noun = GROUP_NOUN[axis].one;
      const decidedBy = axis === "category"
        ? "The bucket is decided by `holdingBucket` — the one function every holdings table on this site groups by — so this list is the row's own arithmetic rather than a second reading of it."
        : `The ${noun} is the FAMILY'S OWN, taken from their consolidated review product by product: no statement in the archive states one, and nothing here is inferred from what the instrument is. A direct stock the review does not name individually is placed by their own stated rule instead, and the allocation row says how much of it was.`;
      return {
        ...base, id: scope.id, key: scope.key,
        title: label,
        // The row a reader clicked is labelled with the section's own name, so
        // the crumb and the heading agree here by construction.
        crumb: label,
        rows,
        absent: rows.length ? null : {
          what: `Nothing is filed under ${label}`,
          needs: `This address names a ${noun} the current book puts no holding in. A ${noun} the book HAS always has rows behind it: the allocation table only draws a row where its count is above zero, so a link from that table can never land here. Reaching this page means the address was typed or bookmarked from a book that has since been rebuilt.`,
        },
      };
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
      // The rate's own account set — `measuredAccountsReturn`, the function the
      // tile's figure comes from — so this page cannot list an account the rate
      // left out, nor leave out one it covered.
      const mwb = bookMoneyWeighted(portfolio, ctx.statement ?? null, new Date());
      const ids = mwb.accountIds;
      const keep = new Set(ids);
      const rows = livePositions.filter((p) => keep.has(p.accountId));
      const outside = livePositions.filter((p) => !keep.has(p.accountId));
      /* THE RATE AND ITS WINDOW RIDE ON THE DRILL-DOWN AGAIN (B-06). The
         arithmetic card that carried them went at Stage 10ao, which left this
         page printing only a return on cost under a tile that printed a
         money-weighted rate — two figures for one click. `moneyWeighted` is
         the same object the tile reads, and its window is `moneyWeightedReturn`'s
         own: Stage 10g(ii)'s guard, because this figure once read +99.0% when a
         132-day return was compounded onto a year. */
      return withFacets({
        ...base, id: scope.id, key: "",
        deduped: false,
        // This scope reads the PER-ACCOUNT set, so its closed count is that
        // set's — not the deduped one `base` carries.
        closedExcluded: droppedHoldings(portfolio.positions).closed.length,
        negligibleExcluded: (() => {
          const n = droppedHoldings(portfolio.positions).negligible;
          return { count: n.length, value: sum(n.map((p) => p.marketValue)) };
        })(),
        title: "Money-weighted return",
        crumb: "Money-weighted return",
        moneyWeighted: mwb,
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
          note: "These accounts publish no opening portfolio value, so no money-weighted rate can be struck on them. Their market value IS in the current value of holdings — they are outside this rate, not outside the book.",
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
        crumb: `Top-${top.size} concentration`,
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
        crumb: "Cross-held names",
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
        crumb: wantWin ? "Winners" : "Losers",
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
       * THE SIDES OF THE BOOK ARE FACETS OF THE NAV, NOT PAGES OF THEIR OWN —
       * the change the family asked for by name. The NAV tile's caption states
       * them, so they are the sets this figure is described in terms of; giving
       * each its own address is what put three links inside one tile.
       *
       * ── AND THERE ARE THREE OF THEM, NOT TWO ────────────────────────────
       *
       * This was `!isPrivateClass` against `isPrivateClass`, which is a
       * PARTITION IN TWO and therefore silently swept every holding no
       * statement places onto the listed side. The split is on `marketSide`
       * now — read from the SEBI category the statements print — and the third
       * value is `null`, so the facets have to offer it or ₹16.69 Cr would be
       * in a facet whose note claims something about it that no document says.
       *
       * Each facet is offered ONLY where the book has rows for it. A toggle
       * with an empty side invites a reader to click into a table that can only
       * be empty, and an absence belongs on the tile that states the split.
       */
      const listed = consolidated.filter((p) => p.marketSide === "listed");
      const priv = consolidated.filter(isPrivateClass);
      const unplaced = consolidated.filter(isUnplacedSide);
      const split = [listed, priv, unplaced].filter((r) => r.length > 0).length > 1;
      const sideFacets: Facet[] = [
        ...(listed.length ? [{
          key: "listed", label: "Listed", group: "side" as const,
          note: SIDE_NOTE.listed,
          rows: listed,
        }] : []),
        ...(priv.length ? [{
          key: "private", label: "Private", group: "side" as const,
          note: SIDE_NOTE.private,
          rows: priv,
        }] : []),
        ...(unplaced.length ? [{
          key: "unplaced", label: "Not placed", group: "side" as const,
          note: SIDE_NOTE.unplaced,
          rows: unplaced,
        }] : []),
      ];
      /**
       * ── AND THE CAPITAL INVESTED IN IT, WHICH WAS A PAGE OF ITS OWN ────────
       *
       * *"Capital invested and current value of holdings can be a single KPI
       * tile … inside that page keep the current value of holdings view and add
       * the columns and data regarding the invested capital that we were showing
       * as a separate page."* That page listed the same holdings split one other
       * way — by whether a statement reports what they cost — so the split is two
       * facets here and the page's own figures now carry both halves.
       *
       * THE SAME `sumOrNull` SPLIT THE CAPITAL FIGURE MAKES. A statement that
       * reports no cost is skipped by the sum rather than entered as zero, so
       * Capital invested covers a narrower set than the value beside it; the
       * first facet is that narrower set and the second is what it leaves out.
       * Offered only where both exist — a toggle to an empty half invites a
       * click into a table that can only be empty.
       */
      // `costedBookSet`'s own predicate (B-07), so the facet the Consolidated
      // return tile opens is the set that tile's figure is struck over.
      const costed = costedBookSet(consolidated).costed;
      const costedIn = new Set(costed);
      const without = consolidated.filter((p) => !costedIn.has(p));
      const costFacets: Facet[] = costed.length && without.length ? [
        {
          key: "costed", label: "Cost reported", group: "cost",
          note: "The holdings whose statement reports what they cost — the rows Capital invested and the"
            + " Consolidated return are summed over.",
          rows: costed,
        },
        {
          key: "no-cost", label: "No cost reported", group: "cost",
          note: "In the current value and in neither capital figure. A depository reports what is held, never"
            + " what it was bought for, so their cost is absent rather than zero — and a zero would report the"
            + " whole of their market value as profit at an infinite return. Measured across the whole audit"
            + " archive, not one of these (account, security) pairs carries a cost on any record type.",
          rows: without,
        },
      ] : [];
      return withFacets({
        ...base, id: "book", key: "",
        title: "Every holding in the book",
        // THE TILE'S OWN LABEL, which the family renamed from "Consolidated
        // NAV" at Stage 10aq — and the crumb has to follow it, or the line a
        // reader lands on names a tile the dashboard no longer has.
        crumb: "Current Value of Holdings",
        absent: consolidated.length ? null : {
          what: "The book carries no holding",
          needs: "No statement has been ingested, so there is nothing to list. Ingest a statement and every figure on this site populates itself.",
        },
      }, [
        { key: "all", label: "All holdings", note: "Every position in the book.", rows: consolidated },
        ...(split ? sideFacets : []),
        ...costFacets,
      ]);
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
export function coveredReturn(set: readonly Position[], opts: FifoOptions = {}) {
  const mv = set.reduce((a, p) => a + p.marketValue, 0);
  const withoutCostMV = set.filter((p) => p.costBasis == null || p.costUnavailable).reduce((a, p) => a + p.marketValue, 0);
  const covers = costCoversSet(mv, withoutCostMV);
  // FIFO, through the one aggregator every other return on the dashboard uses:
  // the realised gain on units already sold stays in the return, and a whole
  // mandate is struck on its capital since inception.
  const fifo = fifoTotals(set, opts);
  return { covers, pct: covers ? fifo.returnPct : null, fifo };
}

/**
 * ── THE WHOLE-BOOK RETURN'S SET, NAMED ON ITS FACE (B-07) ───────────────────
 *
 * The whole-book return on cost is struck over the holdings that report a
 * cost — Stage 10ca's decision, and main records the refusal version (a bare
 * "—" wherever ₹168 Cr of depository holdings report no cost) as a regression.
 * WHEREVER IT APPEARS IT NAMES THAT SET ON ITS FACE, not only in a hover:
 * "on the ₹X of ₹Y that reports a cost · N of M holdings". Morning CIO's
 * Consolidated return tile, its allocation table's Total row and the Portfolio
 * Monitor's footer all print this ONE figure over this ONE set, so the set and
 * its words are built here once.
 */
export type CostedBookSet = {
  /** The current holdings whose statement reports what they cost. */
  costed: Position[];
  /** What those are worth — the X in the label. */
  costedValue: number;
  /** What every current holding is worth — the Y, the book the top bar shows. */
  bookValue: number;
  costedCount: number;
  holdings: number;
};
export function costedBookSet(current: readonly Position[]): CostedBookSet {
  const costed = current.filter((p) => p.costBasis != null && !p.costUnavailable);
  return {
    costed,
    costedValue: sum(costed.map((p) => p.marketValue)),
    bookValue: sum(current.map((p) => p.marketValue)),
    costedCount: costed.length,
    holdings: current.length,
  };
}
/** The words, in the reader's currency: "on the ₹X of ₹Y that reports a cost · N of M holdings". */
export function costedSetLabel(
  s: Pick<CostedBookSet, "costedValue" | "bookValue" | "costedCount" | "holdings">,
  money: (n: number) => string,
): string {
  return `on the ${money(s.costedValue)} of ${money(s.bookValue)} that reports a cost · ${s.costedCount} of ${s.holdings} holdings`;
}

/**
 * ...AND THE RETURN ITSELF, STRUCK ONCE: FIFO over that set (`fifoTotals`),
 * which is Stage 10ca's one aggregate. Morning CIO's tile and allocation Total
 * row and the page they open all call this, so the figure a reader clicked is
 * the figure they land on, and a change to the set moves all of them together.
 */
export type BookReturnOnCost = { set: CostedBookSet; fifo: FifoTotals; pct: number | null };
export function bookReturnOnCost(current: readonly Position[], opts: FifoOptions): BookReturnOnCost {
  const set = costedBookSet(current);
  const fifo = fifoTotals(set.costed, opts);
  return { set, fifo, pct: fifo.returnPct };
}

/**
 * ── THE MONEY-WEIGHTED RATE, STRUCK ONCE FOR THE TILE AND THE PAGE (B-06) ───
 *
 * Morning CIO's tile and the `?of=measured` page it opens used to be two
 * computations — the tile over the statement book, the page's account set over
 * the live one — and the page printed only a return on cost, so a reader who
 * clicked +26.5% landed on +14.2% and nothing tying the two. Both read this
 * now: the accounts whose statements carry an opening portfolio value, each
 * closed on its own statement's value at its own date (`measuredAccountsReturn`
 * — the flows are complete only to that date), pooled with the fund-of-funds
 * model's calls and marks where it carries any, and de-annualised by
 * `moneyWeightedReturn` over the flows' own window, never compounded onto a
 * year it has not seen (Stage 10g(ii)).
 */
export type BookMoneyWeighted = {
  result: MoneyWeighted;
  /** The accounts the rate covers, and what their statements value them at. */
  accountIds: string[];
  accountNos: string[];
  measuredValue: number;
  /** Where the pool closes — the latest statement date among them. */
  lastClose: string | null;
  /** Accounts in the book, for "N of M accounts". */
  bookAccounts: number;
};
export function bookMoneyWeighted(portfolio: Portfolio, statement: Portfolio | null, today: Date): BookMoneyWeighted {
  const mw = measuredAccountsReturn(statement ?? portfolio, portfolio.accounts);
  const pm = portfolio.privateMarkets;
  const privateFlows = [
    ...pm.startups.filter((s) => s.investDate && s.invested > 0)
      .flatMap((s) => [{ date: new Date(s.investDate!), amount: -s.invested }, { date: today, amount: s.fairValue }]),
    ...[...pm.peFunds, ...pm.preIpoFunds, ...pm.unlistedCompanies, ...pm.debtFunds, ...pm.closedFunds]
      .filter((f) => f.firstInvest && f.drawn > 0)
      .flatMap((f) => [{ date: new Date(f.firstInvest!), amount: -f.drawn }, { date: today, amount: f.distributed + f.currentValue }]),
  ];
  // The private flows join the SAME per-account parts, each still closing on
  // its own statement date. The window is the rate's own: its first flow to its
  // last — with no private flows (this book carries none), exactly the pool's.
  const flows = [
    ...mw.parts.flatMap((x) => [...x.flows, { date: x.asOf, amount: x.terminalValue }]),
    ...privateFlows,
  ];
  const annual = mw.parts.length ? xirrPct(flows) : null;
  const times = flows.map((f) => f.date.getTime());
  const windowDays = mw.parts.length ? Math.round((Math.max(...times) - Math.min(...times)) / 864e5) : null;
  return {
    result: moneyWeightedReturn(annual, windowDays),
    accountIds: mw.parts.map((x) => x.accountId),
    accountNos: mw.parts.map((x) => x.accountNo),
    measuredValue: mw.measuredMV,
    lastClose: mw.lastClose,
    bookAccounts: portfolio.accounts.length,
  };
}

/**
 * ── THERE IS NO `drilldownFormula` ANY MORE ─────────────────────────────────
 *
 * *"Remove all the highlighted text and the sections from the dashboard UI."*
 * It built the "How this figure is worked out" card — an expression, a worked
 * line and a paragraph, per scope — which Stage 10y moved off the KPI tiles and
 * Stage 10ac off the allocation table. The family have now asked for the card,
 * so the builder is DELETED rather than left exported with one dead caller,
 * which is the shape `exportDeck.ts`, `entityParts` and `holdingHref` were each
 * removed in.
 *
 * `Drilldown.lead`, `Drilldown.backs` and `Drilldown.windowDays` went with it
 * and with the header prose that read them, for the same reason.
 *
 * TWO OF THE FACTS IT CARRIED HAD NO SECOND HOME and were moved BEFORE it went,
 * both onto the hover of the Morning CIO tile that opens the page they were on:
 * the accrued income the NAV excludes, and the XIRR's window with its refusal
 * to annualise a sub-year one. `check:pages` asserts both at their new address
 * and asserts this card is absent, so neither can be lost by a later edit.
 */
