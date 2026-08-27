// THE MONTHLY REVIEW DECK — the spec's "Export Functionality", in the format a
// family office actually hands around.
//
// The book already exports to Excel, which is the right shape for someone who
// wants to work the numbers. A deck is the other half: the thing that goes into
// a review meeting, and the one artefact that leaves this dashboard and is read
// by people who will never open it.
//
// THAT IS EXACTLY WHY THE RULES MATTER MORE HERE, NOT LESS. Once a figure is on
// a slide it has lost its tooltip, its basis pill and its link back to the
// statement. A reader cannot hover a PowerPoint. So:
//
//   - EVERY SLIDE CARRIES THE BASIS AND THE AS-OF, in the footer, on every
//     slide rather than once on the title. A slide gets separated from its deck
//     the moment someone screenshots it, and "₹335.43 Cr" with no date is a
//     figure nobody can check.
//
//   - AN ABSENT FIGURE IS STILL AN EM DASH WITH A REASON. The temptation in a
//     deck is to drop the row instead — a blank line looks tidier than "—, no
//     capital gain statement covers 16 of 23 accounts". Dropping it is worse:
//     the reader then believes the deck is complete. Nothing is omitted for
//     looking untidy.
//
//   - THE LAST SLIDE IS WHAT THE DECK DOES NOT CARRY. Every deliverable this
//     book produces states its own gaps, because a reader plans around a figure
//     they think is missing-but-obtainable differently from one that is
//     structurally unavailable.
//
//   - CONSOLIDATED FIGURES COUNT EACH `dedupeGroup` ONCE. The caller passes the
//     deduped set; a raw sum would put ₹3.17 Cr of doubly-reported holdings into
//     the headline NAV.
//
// `pptxgenjs` is imported by the CALLER dynamically, the same way `exceljs` is,
// so a megabyte of deck-writer never reaches the main bundle.

import PptxGenJS from "pptxgenjs";
import type { Portfolio, Position } from "./types";
import { accountIndex, engagementOf, staleAccounts, stalenessNote } from "./accounts";
import {
  byEntity, bySecurity, bucketBy, consolidatedMarketValue, doubleCountedValue, publicPrivateSplit, sumOrNull, unpriced,
  bucketLabel, holdingBucket, isCompanyShare, isMandateHeld, assetClassLabel, DIRECT_EQUITY_BUCKET, MANDATE_BUCKET, ROUTE_NOTE, sum,
} from "./analytics";
import { displaySecurity } from "./format";

// The dashboard's palette, so the deck reads as the same product.
const C = {
  ink: "151233",
  inkDeep: "0E0C24",
  champagne: "D9C48F",
  champagneText: "ECDCAE",
  paper: "FFFFFF",
  text: "1A1830",
  muted: "6B6880",
  rule: "E4DDCD",
  gain: "059669",
  loss: "DC2626",
};

/** The em dash, matching `src/components/Absent.tsx`. Never a bare 0. */
const DASH = "—";

export type DeckInput = {
  /** The book to report on — the caller decides STATEMENT or LIVE and says which. */
  portfolio: Portfolio;
  /** Deduped positions: `usePortfolio().consolidated`. */
  consolidated: Position[];
  basis: "STATEMENT" | "LIVE";
  /** `fmtFromBase` from PortfolioContext — respects the selected display currency. */
  fmt: (inr: number) => string;
  currency: string;
};

const pct = (x: number | null): string => (x == null ? DASH : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`);

export async function exportReviewDeck(input: DeckInput): Promise<void> {
  const { portfolio, consolidated, basis, fmt, currency } = input;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Glow Ventures Family Office";
  pptx.company = "Glow Ventures Family Office";
  pptx.title = `Portfolio Review — ${portfolio.asOf}`;

  const stale = staleAccounts(portfolio);
  // THE FOOTER IS THE WHOLE HONESTY MECHANISM ON A SLIDE. Basis, as-of, display
  // currency and how many accounts lag the headline date — the same four facts
  // <BasisPill> puts on screen, on every slide because slides travel alone.
  const footer = [
    `${basis} basis`,
    `as of ${portfolio.asOf}`,
    currency,
    stale.length ? `${stale.length} account${stale.length === 1 ? "" : "s"} behind this date` : null,
  ].filter(Boolean).join("  ·  ");

  pptx.defineSlideMaster({
    title: "GLOW",
    background: { color: C.paper },
    objects: [
      { rect: { x: 0, y: 5.16, w: "100%", h: 0.02, fill: { color: C.rule } } },
      { text: { text: footer, options: { x: 0.4, y: 5.2, w: 9.2, h: 0.3, fontSize: 9, color: C.muted, fontFace: "Arial" } } },
    ],
  });

  const slide = (heading: string, sub?: string) => {
    const s = pptx.addSlide({ masterName: "GLOW" });
    s.addText(heading, { x: 0.4, y: 0.28, w: 9.2, h: 0.42, fontSize: 22, bold: true, color: C.text, fontFace: "Arial" });
    if (sub) s.addText(sub, { x: 0.4, y: 0.74, w: 9.2, h: 0.3, fontSize: 11, color: C.muted, fontFace: "Arial" });
    return s;
  };

  const table = (s: PptxGenJS.Slide, rows: PptxGenJS.TableRow[], y: number, colW: number[]) =>
    s.addTable(rows, {
      x: 0.4, y, w: colW.reduce((a, b) => a + b, 0), colW,
      fontSize: 11, fontFace: "Arial", color: C.text,
      border: { type: "solid", color: C.rule, pt: 0.5 },
      valign: "middle",
    });

  const head = (cells: string[]): PptxGenJS.TableRow =>
    cells.map((t, i) => ({
      text: t,
      options: { bold: true, color: C.champagneText, fill: { color: C.ink }, align: i === 0 ? "left" : "right" as const },
    }));

  // ── 1 · Title ─────────────────────────────────────────────────────────────
  const title = pptx.addSlide();
  title.background = { color: C.ink };
  title.addText("Glow Ventures Family Office", { x: 0.6, y: 1.7, w: 8.8, h: 0.6, fontSize: 30, bold: true, color: C.champagneText, fontFace: "Arial" });
  title.addText("Portfolio Review", { x: 0.6, y: 2.35, w: 8.8, h: 0.5, fontSize: 20, color: C.paper, fontFace: "Arial" });
  title.addText(footer, { x: 0.6, y: 3.0, w: 8.8, h: 0.4, fontSize: 12, color: C.champagne, fontFace: "Arial" });
  title.addText(
    "Every figure in this deck traces to a statement in the audit archive. Where a figure is absent it is shown as an em dash with the reason, never as zero.",
    { x: 0.6, y: 4.3, w: 8.8, h: 0.6, fontSize: 10, color: C.muted, fontFace: "Arial" },
  );

  // ── 2 · Consolidated position ─────────────────────────────────────────────
  const nav = consolidatedMarketValue(consolidated);
  const split = publicPrivateSplit(consolidated);
  const dbl = doubleCountedValue(portfolio.positions);
  const owners = new Set(portfolio.accounts.map((a) => a.owner).filter(Boolean));

  const s2 = slide("Consolidated position", "Each dually-reported holding counted once");
  table(s2, [
    head(["", "Value"]),
    ["Consolidated NAV", fmt(nav)],
    ["Listed", fmt(split.listed)],
    ["Private", fmt(split.private)],
    ["Accounts", String(portfolio.accounts.length)],
    ["Owners", String(owners.size)],
    ["Holdings (deduped)", String(consolidated.length)],
    [
      "Double-count removed",
      // A COMPUTED ZERO IS LEGITIMATE AND KEEPS ITS ZERO, with the reason beside
      // it — "no holding is reported under two members" is a finding, not a gap.
      dbl > 0 ? fmt(dbl) : `${fmt(0)} · no holding reported twice`,
    ],
  ].map((r) => Array.isArray(r) && typeof r[0] === "string"
    ? r.map((t, i) => ({ text: String(t), options: { align: i === 0 ? "left" : "right" as const } }))
    : r) as PptxGenJS.TableRow[], 1.2, [4.6, 4.6]);

  if (stale.length) {
    s2.addText(stalenessNote(portfolio) ?? "", { x: 0.4, y: 4.5, w: 9.2, h: 0.5, fontSize: 9.5, color: C.muted, fontFace: "Arial" });
  }

  // ── 3 · Allocation by asset class & mandate ───────────────────────────────
  //
  // THE SAME BUCKETS THE SCREEN SHOWS, FROM THE SAME FUNCTION. `holdingBucket`
  // rolls a share chosen under a discretionary mandate up into that mandate and
  // leaves Direct Equity meaning shares the family bought itself — which is what
  // the family asked for three times, and what the Morning CIO allocation now
  // renders. A deck built on `byAssetClass` would put those two back in one
  // "Equity" row, and a slide travels without the screen that would contradict
  // it. §5 is untouched: a PMS is an ENGAGEMENT, never an `assetClass`; only the
  // grouping reads it.
  //
  // The engagement comes from the ACCOUNT, so the registry is indexed once here
  // rather than a manager being inferred from anything printed on a position.
  const accIdx = accountIndex(portfolio.accounts);
  const buckets = bucketBy(consolidated, (x) => holdingBucket(x, engagementOf(accIdx, x)));
  const s3 = slide(
    "Allocation by asset class & mandate",
    "Shares chosen under a discretionary mandate roll up into that mandate; everything else groups by what it IS",
  );
  table(s3, [
    head(["Asset class / mandate", "Value", "Weight", "Holdings"]),
    ...buckets.map((b) => [
      // The screen label, from the one place that chooses it — a deck slide that
      // says "Equity" beside a monitor that says "Direct Equity" is two names for
      // one row, and a slide travels without the screen that explains it.
      { text: bucketLabel(b.key), options: { align: "left" as const } },
      { text: fmt(b.mv), options: { align: "right" as const } },
      { text: `${b.weight.toFixed(1)}%`, options: { align: "right" as const } },
      { text: String(b.count), options: { align: "right" as const } },
    ]),
  ], 1.2, [3.4, 2.4, 1.7, 1.7]);

  // WHAT THE MANDATE ROW SPANS, DERIVED — a slide has no tooltip to put it in.
  // Counts come from the registry and the positions; no manager is named, and a
  // mandate's cash sleeve is counted with it so the bucket ties to the totals
  // its own statements print. Said here because that is the one thing a reader
  // cannot work out from the four columns above.
  const mandateRows = consolidated.filter((x) => isMandateHeld(engagementOf(accIdx, x)));
  const mandateAccounts = new Set(mandateRows.map((x) => x.accountId));
  const mandateManagers = new Set([...mandateAccounts].map((id) => accIdx.get(id)?.provider).filter(Boolean));
  const sleeveRows = mandateRows.filter((x) => !isCompanyShare(x));
  const sleeveMV = sum(sleeveRows.map((x) => x.marketValue));
  const sleeveClasses = [...new Set(sleeveRows.map((x) => assetClassLabel(x.assetClass)))];
  if (mandateAccounts.size) {
    s3.addText(
      [
        `The ${MANDATE_BUCKET} row covers ${mandateAccounts.size} mandate${mandateAccounts.size === 1 ? "" : "s"}`,
        ` run by ${mandateManagers.size} manager${mandateManagers.size === 1 ? "" : "s"} — ${ROUTE_NOTE.mandate}.`,
        sleeveMV > 0
          ? ` It includes ${fmt(sleeveMV)} of ${sleeveClasses.join(", ")} the mandates hold, so the row ties to the statements it came from.`
          : "",
        // The two bucket names come from the one place that chooses them, so a
        // slide cannot end up naming a row the screen does not have.
        buckets.some((b) => b.key === DIRECT_EQUITY_BUCKET)
          ? ` ${bucketLabel(DIRECT_EQUITY_BUCKET)} is shares ${ROUTE_NOTE.own}.`
          : "",
      ].join(""),
      { x: 0.4, y: 4.35, w: 9.2, h: 0.7, fontSize: 9.5, color: C.muted, fontFace: "Arial" },
    );
  }

  // ── 4 · Allocation by family entity ───────────────────────────────────────
  // PER-OWNER, so the RAW set is correct here: a holding reported on two
  // members' statements belongs to both of them. Deduping this view emptied a
  // real ₹1.46 Cr row to zero the last time it was got backwards.
  const entities = byEntity(portfolio.positions, portfolio.accounts);
  const s4 = slide("By family entity", "Per-owner, so a holding reported under two members appears under each — the consolidated NAV still counts it once");
  table(s4, [
    head(["Entity", "Value", "Weight", "Holdings"]),
    ...entities.map((b) => [
      { text: b.key, options: { align: "left" as const } },
      { text: fmt(b.mv), options: { align: "right" as const } },
      { text: `${b.weight.toFixed(1)}%`, options: { align: "right" as const } },
      { text: String(b.count), options: { align: "right" as const } },
    ]),
  ], 1.2, [3.4, 2.4, 1.7, 1.7]);

  // ── 5 · Top holdings ──────────────────────────────────────────────────────
  const bySec = bySecurity(consolidated).slice(0, 12);
  const nameOf = new Map(consolidated.map((p) => [p.securityKey, p.security]));
  const s5 = slide("Largest holdings", "Consolidated across every account and mandate");
  table(s5, [
    head(["Security", "Value", "Weight"]),
    ...bySec.map((b) => [
      { text: displaySecurity(nameOf.get(b.key) ?? b.key), options: { align: "left" as const } },
      { text: fmt(b.mv), options: { align: "right" as const } },
      { text: `${b.weight.toFixed(1)}%`, options: { align: "right" as const } },
    ]),
  ], 1.15, [5.0, 2.4, 1.8]);

  // ── 6 · Cost, gain and what is not measurable ─────────────────────────────
  // `sumOrNull` rather than a plain sum: a cost the depository never knew must
  // not enter the total as zero, which would report the whole market value as
  // profit.
  const costs = consolidated.map((p) => p.costBasis ?? null);
  const totalCost = sumOrNull(costs);
  const missingCost = costs.filter((c) => c == null).length;
  const gain = totalCost == null ? null : nav - totalCost;
  const gainPct = totalCost == null || totalCost === 0 ? null : ((nav - totalCost) / totalCost) * 100;
  const notLive = unpriced(consolidated).length;

  const s6 = slide("Cost and unrealised gain", "Positions with no cost basis are excluded from the total and counted, never entered as zero");
  table(s6, [
    head(["", "Value"]),
    [
      { text: "Cost basis", options: { align: "left" as const } },
      { text: totalCost == null ? `${DASH} · no position carries a cost` : fmt(totalCost), options: { align: "right" as const } },
    ],
    [
      { text: "Market value", options: { align: "left" as const } },
      { text: fmt(nav), options: { align: "right" as const } },
    ],
    [
      { text: "Unrealised gain", options: { align: "left" as const } },
      { text: gain == null ? DASH : fmt(gain), options: { align: "right" as const, color: gain != null && gain < 0 ? C.loss : C.gain } },
    ],
    [
      { text: "Return on cost", options: { align: "left" as const } },
      { text: pct(gainPct), options: { align: "right" as const, color: gainPct != null && gainPct < 0 ? C.loss : C.gain } },
    ],
    [
      { text: "Positions with no cost basis", options: { align: "left" as const } },
      { text: missingCost ? `${missingCost} — excluded from the total above` : "none", options: { align: "right" as const } },
    ],
    [
      { text: "Positions not priced live", options: { align: "left" as const } },
      { text: notLive ? `${notLive} — carried at their statement mark` : "none", options: { align: "right" as const } },
    ],
  ] as PptxGenJS.TableRow[], 1.2, [5.4, 3.8]);

  // ── 7 · What this deck does not carry ─────────────────────────────────────
  // Read the registry directly: `providerOf` takes a Position, and faking one
  // just to reach a field the Account already carries is the kind of indirection
  // that later reads as a real lookup.
  const providers = [...new Set(portfolio.accounts.map((a) => a.provider))].filter(Boolean);
  const s7 = slide("What this deck does not carry", "Named rather than omitted — a reader plans around a gap differently once they know it is structural");
  s7.addText(
    [
      { text: "Per-security money-weighted return (XIRR). ", options: { bold: true } },
      { text: "The transaction statements cover the current period only; a rate over a partial history is a real number for the wrong window. Money-weighted returns in this book are per ACCOUNT.\n" },
      { text: "Realised gains on every account. ", options: { bold: true } },
      { text: "Only some accounts are issued a capital gain statement. The rest have real sells whose realised figure was never reported, so those cells are an em dash and the total says how many accounts it covers.\n" },
      { text: "Net worth beyond the securities book. ", options: { bold: true } },
      { text: "Property, bank balances, insurance and liabilities are the family's own disclosure, not a data source. Nothing here is a complete net-worth statement.\n" },
      { text: "A NAV time series. ", options: { bold: true } },
      { text: "Two dated portfolio values per account is not a series; a monthly or quarterly valuation statement would supply one.\n" },
      { text: `Sources in this book: ${providers.length} providers across ${portfolio.accounts.length} accounts.`, options: { color: C.muted, fontSize: 10 } },
    ],
    { x: 0.4, y: 1.15, w: 9.2, h: 3.6, fontSize: 11, color: C.text, fontFace: "Arial", lineSpacingMultiple: 1.15 },
  );

  const name = `Glow_Ventures_Review_${portfolio.asOf}.pptx`;
  await pptx.writeFile({ fileName: name });
}
