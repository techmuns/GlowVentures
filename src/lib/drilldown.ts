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
  | "invested"    // holdings whose statement reports a cost
  | "no-cost"     // holdings whose statement reports none
  | "measured"    // holdings in the accounts the money-weighted return covers
  | "listed"
  | "private"
  | "top-names"
  | "cross-held"
  | "winners"
  | "losers";

const IDS = new Set<DrilldownId>([
  "book", "bucket", "invested", "no-cost", "measured",
  "listed", "private", "top-names", "cross-held", "winners", "losers",
]);

/** URL params. `view` is left to `useViewParam`, so the scope takes its own. */
export const SCOPE_PARAM = "of";
export const KEY_PARAM = "key";

export function drilldownHref(id: DrilldownId, key?: string): string {
  const q = new URLSearchParams({ [SCOPE_PARAM]: id });
  if (key) q.set(KEY_PARAM, key);
  return `${DRILLDOWN_PATH}?${q.toString()}`;
}

/** Parse an address back. An unrecognised id is `null`, never a silent default. */
export function parseDrilldown(params: URLSearchParams): { id: DrilldownId; key: string } | null {
  const raw = params.get(SCOPE_PARAM) ?? "";
  if (!IDS.has(raw as DrilldownId)) return null;
  return { id: raw as DrilldownId, key: params.get(KEY_PARAM) ?? "" };
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
  /** Which unit the figure counts, so the page opens on the view that shows it. */
  defaultView: "security" | "row";
  /**
   * The set this figure explicitly does NOT cover, where naming it is the other
   * half of the rule. Capital invested skips the positions reporting no cost;
   * saying so on the tile and then hiding them behind the drill-down would be
   * the same omission one click deeper.
   */
  companion: { title: string; note: string; rows: Position[] } | null;
  /** Accounts outside the set, by number — the money-weighted figure names them. */
  excludedAccounts: string[];
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
export function resolveDrilldown(scope: { id: DrilldownId; key: string }, ctx: Ctx): Drilldown {
  const { portfolio, consolidated } = ctx;
  const accIdx = accountIndex(portfolio.accounts);
  const base: Omit<Drilldown, "id" | "key" | "title" | "backs" | "lead" | "rows"> = {
    deduped: true,
    defaultView: "row",
    companion: null,
    excludedAccounts: [],
    absent: null,
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
      const rows = consolidated.filter((p) => p.costBasis != null);
      const without = consolidated.filter((p) => p.costBasis == null);
      return {
        ...base, id: scope.id, key: "",
        title: "Holdings that report a cost",
        backs: ["Capital invested", "Consolidated return"],
        lead: "The holdings whose statement prints what they cost. Both figures on Morning CIO that divide by capital — Capital invested and the Consolidated return struck on it — are summed over exactly these rows: `sumOrNull` skips a missing cost rather than entering it as zero, which would understate the basis and overstate the return on everything else.",
        rows,
        companion: without.length ? {
          title: "…and the holdings that report none",
          note: "These are in the NAV and in neither figure above. A depository reports what is held, never what it was bought for, so their cost is absent rather than zero — and a zero would report the whole of their market value as profit at an infinite return.",
          rows: without,
        } : null,
        absent: rows.length ? null : {
          what: "No holding in this book reports a cost",
          needs: "Every statement in the drop prints a holding without a basis. Capital invested and the Consolidated return are absent rather than zero until one carries a cost column.",
        },
      };
    }

    case "no-cost": {
      const rows = consolidated.filter((p) => p.costBasis == null);
      return {
        ...base, id: scope.id, key: "",
        title: "Holdings whose statement reports no cost",
        backs: ["the coverage line under Capital invested"],
        lead: "Each of these is in the consolidated NAV and in no invested figure anywhere on the site. A depository holds shares; it did not buy them, so it knows the quantity and the mark and not the price paid. The absence is at source — measured across the whole audit archive, not one of these (account, security) pairs carries a cost on any record type.",
        rows,
        absent: rows.length ? null : {
          what: "Every holding in this book reports a cost",
          needs: "Nothing is missing a basis, so this set is empty by measurement. Capital invested therefore covers the whole book and its coverage line does not render.",
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
      const ids = portfolio.accounts
        .filter((a) => accountHasOpeningValue(portfolio, a.accountId))
        .map((a) => a.accountId);
      const keep = new Set(ids);
      const rows = portfolio.positions.filter((p) => keep.has(p.accountId));
      const excluded = portfolio.accounts
        .filter((a) => !keep.has(a.accountId))
        .map((a) => a.accountNo);
      return {
        ...base, id: scope.id, key: "",
        deduped: false,
        title: "Holdings the money-weighted return covers",
        backs: ["the coverage the Money-weighted return states"],
        lead: `An XIRR needs a stake to measure against, so it can only be struck on an account whose statements carry an opening portfolio value. These are the holdings of the ${ids.length} account${ids.length === 1 ? "" : "s"} that do — their market value is the coverage figure the tile prints beside the rate. Every other account is named below and sits outside the rate on BOTH sides: closing a market value against a stake nobody stated would overstate the return rather than approximate it.`,
        rows,
        excludedAccounts: excluded,
        absent: rows.length ? null : {
          what: "No account in this book carries an opening portfolio value",
          needs: "A money-weighted return needs the window's opening valuation as its first flow. No statement in the drop publishes one, so the rate is absent rather than struck on a stake nobody stated.",
        },
      };
    }

    case "listed":
    case "private": {
      const wantPrivate = scope.id === "private";
      const rows = consolidated.filter((p) => isPrivateClass(p) === wantPrivate);
      const word = wantPrivate ? "private" : "listed";
      return {
        ...base, id: scope.id, key: "",
        title: wantPrivate ? "The private half of the book" : "The listed half of the book",
        backs: ["the Listed / Private split", "the NAV caption"],
        lead: `The split is on ASSET CLASS — what a holding IS — and not on how its account is run: an AIF folio is marked by its manager rather than by an exchange whether the family reached it through a wealth platform or bought it directly. ${wantPrivate ? "AIF, Unlisted and Structured Product are the private classes" : "Everything the private classes do not name is here"}, which is the same rule \`BOOK_SUMMARY\` splits on.`,
        rows,
        absent: rows.length ? null : {
          what: `No ${word} holding in this book`,
          needs: `Every position in the drop falls on the other side of the class split, so the ${word} share is absent rather than 0%.`,
        },
      };
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
        ...base, id: scope.id, key: "", defaultView: "security",
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
        ...base, id: scope.id, key: "", defaultView: "security",
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
      return {
        ...base, id: scope.id, key: "",
        title: wantWin ? "Holdings showing a gain" : "Holdings showing a loss",
        backs: ["Winners / losers"],
        lead: `Every holding whose return against its own cost is ${wantWin ? "above" : "below"} zero on the basis the page is showing — live where a quote resolved, the statement mark where it did not. The two counts do not add to the book: a holding exactly at cost is in neither, and one whose cost the statements do not report has no return to sort on at all.`,
        rows,
        companion: other.length ? {
          title: "…and the holdings in neither count",
          note: "A return of exactly zero is a measurement and belongs under neither heading; a holding whose cost is unavailable has no return to measure. Both are here so the two counts on Morning CIO can be reconciled against the book rather than assumed to cover it.",
          rows: other,
        } : null,
        absent: rows.length ? null : {
          what: wantWin ? "No holding is showing a gain" : "No holding is showing a loss",
          needs: "This is a measured zero rather than a missing figure: every priced holding in the book falls on the other side or exactly at cost.",
        },
      };
    }

    case "book":
    default: {
      const rows = consolidated;
      return {
        ...base, id: "book", key: "",
        title: "Every holding in the book",
        backs: ["Consolidated NAV", "Positions", "Distinct names"],
        lead: `The whole book across ${portfolio.accounts.length} accounts, consolidated — each holding two statements both report counted once. Both concentration counts are read off this one set: the row count is Positions, the name count is Distinct names.`,
        rows,
        absent: rows.length ? null : {
          what: "The book carries no holding",
          needs: "No statement has been ingested, so there is nothing to list. Ingest a statement and every figure on this site populates itself.",
        },
      };
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
