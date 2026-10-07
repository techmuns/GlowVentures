/**
 * ── THE SAME HOLDINGS, SLICED SEVERAL WAYS — IN ONE PLACE ───────────────────
 *
 *   "We should also be able to see this information: category wise (MF, direct
 *    equity, Bonds, PMS, AIF etc), asset class wise (Equity, debt etc), my
 *    basket definition wise (core, tactical etc)."
 *
 *   …and then, on Morning CIO: *"I have given you my baskets… how is the core
 *    doing, how is the satellite portfolio doing, how is the liquidity
 *    portfolio doing. This should be the Morning CIO page. Add a selector in
 *    the allocation section to select asset class wise / category wise / basket
 *    wise allocation and performance overview."*
 *
 * The second request is the first one arriving on a SECOND SCREEN, and that is
 * the whole reason this file exists. The Portfolio Monitor grew these three axes
 * first and owned them privately; Morning CIO's allocation table now groups on
 * the same three. Two copies of "which section does this holding sit in" would
 * be two chances for one screen to file a holding under a basket the other puts
 * somewhere else — the failure `holdingBucket`, `costCoversSet` and
 * `accountHasOpeningValue` were each extracted for, arriving a fourth time.
 *
 * So the axis is decided ONCE, here, and both pages import it:
 *
 *   CATEGORY     — `holdingBucket`. What KIND of thing this is and who chose
 *                  it: Direct Equity, PMS mandates, AIF, Mutual Fund, ETF,
 *                  Cash. The DEFAULT on Morning CIO and on the Monitor's
 *                  Transactions table, and unchanged — this is where three
 *                  rounds of the "Direct Equity" argument were settled and it
 *                  must not be relitigated through a new axis. (The Monitor's
 *                  HOLDINGS table opens on All Securities instead, at the
 *                  family's request — see `MONITOR_GROUP_VIEWS`.)
 *   ASSET CLASS  — the family's Equity / Debt / Alternate / Cash. NOT our
 *                  `AssetClass`: theirs says what EXPOSURE a holding carries,
 *                  ours says what the instrument IS, and three of our five
 *                  classes are genuinely ambiguous on this book. See
 *                  `familyTaxonomy.ts`, which measures why.
 *   BASKET       — Stable Growth / Entrepreneurial Growth / Thematic & Tactical
 *                  / Liquidity, as the family's own review states them.
 *
 * NOTHING ABOUT WHAT A HOLDING IS CHANGES WHEN THE AXIS DOES. The same
 * positions, the same figures, regrouped — so an axis touches only the section
 * key, its reading order and its heading. Every other branch on either page
 * (the footer, the dedupe gap, the cost-coverage refusal, the weight base) is
 * untouched and stays correct by construction. Measured on this book, all three
 * axes sum to `BOOK_SUMMARY.totalValue` to the rupee.
 *
 * A FOURTH AXIS — SECURITY — is the Portfolio Monitor's alone and is NOT an
 * allocation axis. See `SECURITY_AXIS` below for what it is and why widening
 * `GroupAxis` to include it would have been the wrong move.
 */
import type { AccountIndex } from "./accounts";
import {
  holdingBucket, bucketLabel, isMandateHeld,
  MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, UNROUTED_EQUITY_BUCKET, AT_COST_BUCKET,
} from "./analytics";
import {
  basketKeyOf, familyClassKeyOf, basketOrd, familyClassOrd,
  familyBasket, familyAssetClass, type TaxonomySource, type Classifiable,
} from "./familyTaxonomy";

/**
 * WHICH SECTION A HOLDING BELONGS IN on the category axis. `holdingBucket`
 * decides; this only supplies the engagement, which is a fact about the ACCOUNT
 * and never about the position — reading it off the position is what would put
 * two rows of one mandate in two sections.
 *
 * ── AND WHAT IT IS DECIDED FROM: three fields plus that engagement ──────────
 *
 * `Classifiable` (see `familyTaxonomy.ts`) names them, and a `Position`
 * satisfies it, so every holdings caller is unchanged. It is widened from
 * `Position` because the Transactions table sections on these same three axes,
 * and a dated trade is not a holding — the alternative was a `Position`-shaped
 * object with zeros in the money fields, which is a fabricated figure one
 * refactor away from being rendered.
 *
 * The engagement is read off the REGISTRY here rather than through
 * `engagementOf`, which takes a `Position`. It is the same lookup on the same
 * key and it is the only line that had to change.
 */
export const engagementFor = (idx: AccountIndex, p: Classifiable) => idx.get(p.accountId)?.engagement || "";
export const bucketFor = (idx: AccountIndex, p: Classifiable) => holdingBucket(p, engagementFor(idx, p) || null);
export const heldUnderMandate = (idx: AccountIndex, p: Classifiable) => isMandateHeld(engagementFor(idx, p) || null);

/**
 * Category sections in reading order: what the family chose itself, then what
 * it handed to a manager, then the wrappers, then cash.
 *
 * `UNROUTED_EQUITY_BUCKET` is in the list because that — and NOT the raw
 * `"Equity"` — is what `holdingBucket` returns for a share whose account states
 * no route. No such account is in this book, and if one arrives it gets its own
 * section between the two routed ones rather than being folded into either,
 * neither of which would be true of it. Spelling it `"Equity"` here made the
 * entry dead: the key that actually arrives fell through the `i < 0` branch and
 * sorted the section BELOW Cash, which is the opposite of what it claimed.
 */
export const BUCKET_ORDER = [DIRECT_EQUITY_BUCKET, MANDATE_BUCKET, UNROUTED_EQUITY_BUCKET, "ETF", "Mutual Fund", "AIF", "Bond", "Structured Product", "Unlisted", AT_COST_BUCKET, "Cash"];
export const bucketOrd = (b: string) => { const i = BUCKET_ORDER.indexOf(b); return i < 0 ? BUCKET_ORDER.length : i; };

export const GROUP_AXES = ["category", "assetClass", "basket"] as const;
export type GroupAxis = (typeof GROUP_AXES)[number];

/**
 * The three segments, in the order both screens draw them. Shaped as
 * `ViewDef<GroupAxis>` without importing it: a lib that reaches into
 * `components/` for a type inverts the dependency for nothing, and the shape is
 * structurally assignable either way.
 */
export const GROUP_VIEWS: readonly { key: GroupAxis; label: string; title: string }[] = [
  { key: "category", label: "Category", title: "What kind of thing this is and who chose it: direct equity, a PMS mandate, an AIF, a mutual fund, an ETF, cash." },
  { key: "assetClass", label: "Asset class", title: "The family's own asset classes — Equity, Debt, Alternate, Cash — as their consolidated review states them. Not the instrument type: a gold ETF is Alternate and a liquid fund is Cash." },
  { key: "basket", label: "Basket", title: "The family's four baskets: Stable Growth, Entrepreneurial Growth, Thematic & Tactical, Liquidity." },
];

/**
 * ── THE FOURTH AXIS, AND WHY IT IS THE PORTFOLIO MONITOR'S ALONE ────────────
 *
 *   "Portfolio monitor is right now based on category wise, asset class wise,
 *    and then the basket… Not stock wise. So just incorporate this into THIS
 *    PAGE ONLY. Then you give a simple view where whatever stock, like HDFC
 *    Bank, if Yamini wants to click on, she can click on and then drill down.
 *    So based on every single investment direct/PMS/ETF/AIF etc etc. we will
 *    club and show which stock has the highest exposure and thru what means."
 *
 * THE THREE AXES ABOVE ARE ALLOCATION AXES: they file every holding under a
 * section and both screens sum those sections. THE SECURITY AXIS IS NOT ONE. It
 * files nothing — it collapses the book to one row per NAME, ranked by exposure
 * — so an allocation table built on it would draw 214 single-holding "sections"
 * and mean nothing. That is why `GroupAxis`, `GROUP_AXES` and `GROUP_VIEWS` are
 * untouched above and Morning CIO still offers exactly three: widening them
 * would have put this axis on that page's allocation card by construction, and
 * the family scoped it to the Monitor in the same sentence that asked for it.
 *
 * `MonitorAxis` is therefore a SUPERSET used by one screen. The shared helpers
 * below take it, so `drilldown.ts` and Morning CIO keep passing a `GroupAxis`
 * unchanged (every `GroupAxis` is a `MonitorAxis`), and there is still exactly
 * one definition of "which section is this holding in".
 *
 * WHAT THE AXIS ACTUALLY CHANGES lives in `PortfolioMonitor` and not here,
 * because it is a change to the ROW BUILD rather than to a section key: the
 * mandates are NOT lifted out into one row each, so a share a discretionary
 * manager chose is clubbed with the same share bought in the family's own
 * demat. On every other axis those shares are inside a mandate row and a reader
 * cannot see the name's total exposure at all — which is the gap reported here.
 */
export const SECURITY_AXIS = "security" as const;
export type MonitorAxis = GroupAxis | typeof SECURITY_AXIS;

/**
 * The single section every holding lands in on the security axis. It exists so
 * `groupKeyFor` keeps its contract (an axis always answers with a section) while
 * the table, seeing one key, draws no headings at all.
 */
export const SECURITY_SECTION = "All securities";

/**
 * The Portfolio Monitor's four segments. Morning CIO draws `GROUP_VIEWS` — three.
 *
 * ── ALL SECURITIES IS FIRST, AND THEREFORE THE DEFAULT ──────────────────────
 *
 *   *"Make this view as All Securities and make it first in portfolio monitor
 *    and default open."*
 *
 * `useViewParam` makes the FIRST view the param-free default, so the order of
 * this array IS the default: `/monitor` opens on one row per security, and the
 * category view the Monitor used to open on is `/monitor?group=category`. That
 * is the same mechanism every other view in this app uses rather than a second
 * convention, and it is why the label and the position are one change.
 *
 * WHAT DOES NOT MOVE: `GROUP_VIEWS` keeps Category first, so Morning CIO's
 * allocation card still opens on Category, and the Monitor's own Transactions
 * table — which cannot section on securities (`txnAxis`) — still lands on
 * Category too. Only the Holdings table's opening view changed.
 */
export const MONITOR_GROUP_VIEWS: readonly { key: MonitorAxis; label: string; title: string }[] = [
  { key: SECURITY_AXIS, label: "All Securities", title: "One row per security, ranked by exposure — every holding of a name clubbed across every vehicle that holds it, whether the family bought it directly or a discretionary manager chose it. Open a row to see through what means it is held." },
  ...GROUP_VIEWS,
];

/**
 * The section a holding sits in on the chosen axis. One place, three answers —
 * and a fourth that is deliberately not a section at all: the SECURITY axis puts
 * every holding in one section, because its whole point is that a name is ranked
 * against every other name rather than filed under anything. With one key the
 * table draws no headings (`showBucketSections` needs two), which is the flat,
 * ranked list the family asked for.
 */
export const groupKeyFor = (axis: MonitorAxis, idx: AccountIndex, p: Classifiable): string => {
  if (axis === SECURITY_AXIS) return SECURITY_SECTION;
  if (axis === "category") return bucketFor(idx, p);
  const isMandate = heldUnderMandate(idx, p);
  return axis === "basket" ? basketKeyOf(p, isMandate) : familyClassKeyOf(p, isMandate);
};

/**
 * HOW A ROW'S SECTION KEY WAS AUTHORISED on the active axis. Null on the
 * category axis is not "unknown": that axis is derived from the book and asks
 * nothing of the family, so the heading has nothing to disclose.
 */
export const groupSourceFor = (axis: MonitorAxis, idx: AccountIndex, p: Classifiable): TaxonomySource | null => {
  // Both the category and the security axes are derived from the book itself and
  // ask nothing of the family, so neither heading has anything to disclose.
  if (axis === SECURITY_AXIS || axis === "category") return "review";
  const isMandate = heldUnderMandate(idx, p);
  const r = axis === "basket" ? familyBasket(p, isMandate) : familyAssetClass(p, isMandate);
  return r?.source ?? null;
};

/** Reading order per axis, with the unclassified section last on the two new ones. */
export const groupOrdFor = (axis: MonitorAxis) =>
  axis === SECURITY_AXIS ? () => 0
  : axis === "category" ? bucketOrd : axis === "basket" ? basketOrd : familyClassOrd;

/**
 * The heading. The two family axes are already the family's own words, so they
 * render verbatim; only the category axis has a label function, because that is
 * the axis where the wording was itself the fix (§"Company Shares").
 */
export const groupLabelFor = (axis: MonitorAxis) => (key: string) =>
  axis === "category" ? bucketLabel(key) : key;

/** What the "all" option on a section filter says, per axis. */
export const ALL_LABEL: Record<MonitorAxis, string> = {
  category: "All categories", assetClass: "All asset classes", basket: "All baskets",
  security: "All securities",
};

/**
 * THE NOUN FOR ONE SECTION ON EACH AXIS, singular and plural.
 *
 * A count inside a caption is not chrome — two of `check:pages`'s invariants
 * read Morning CIO's allocation count out of its own pill — so the noun has to
 * come from the axis rather than be typed per screen, or a table of BASKETS
 * ends up captioned "6 buckets held". "Bucket" stays the category word because
 * that is what `holdingBucket` returns and what every existing caption says.
 */
export const GROUP_NOUN: Record<MonitorAxis, { one: string; many: string }> = {
  category: { one: "bucket", many: "buckets" },
  assetClass: { one: "asset class", many: "asset classes" },
  basket: { one: "basket", many: "baskets" },
  security: { one: "security", many: "securities" },
};

/** `3 baskets` / `1 bucket` — a count and its noun, agreeing, per axis. */
export const groupCount = (axis: MonitorAxis, n: number) =>
  `${n} ${n === 1 ? GROUP_NOUN[axis].one : GROUP_NOUN[axis].many}`;

/**
 * WHAT A COLUMN OF SECTION NAMES IS HEADED, per axis.
 *
 * The category heading keeps the words it has always had. It is not a perfect
 * description of that axis — "asset class & mandate" predates the regroup — but
 * it is the one a reader has learnt, and renaming it is a change the family has
 * not asked for.
 */
export const GROUP_COLUMN_HEAD: Record<MonitorAxis, string> = {
  category: "Asset class / mandate",
  assetClass: "Asset class — the family's own",
  basket: "Basket",
  security: "Security",
};
