/**
 * ── ONE REALISED FIGURE FOR A COMPANY PAGE, ON ONE BASIS (DL-6) ─────────────
 *
 * The stock page's Realised tile read the RUNTIME LEDGER — every capital-gain
 * lot the archive carries for the name — while the FIFO return beside it read
 * the BOOK, whose `build-book` strikes each holding's realised gain from its own
 * account's capital gain statement up to that statement's date. The two follow
 * different inclusion rules, so one page printed two realised figures for one
 * holding. LKP's Belrise read +₹6.6 L "booked on exits" on 6,000 units the same
 * page still showed as held: they were sold on 25 June, after the 31 March
 * statement that still carries them at its mark, and counting that gain beside
 * their value counts the same units twice.
 *
 * So a page where the book carries the holding reads the book's own field — the
 * figure its FIFO return is struck on — and says what it leaves out:
 *
 *   • sales dated after the holding's statement (`realizedLotsAfter`), which are
 *     named and not added, because those units are still shown as held;
 *   • and a lot total from the capital gain statements that differs from the
 *     book's where no such sale explains the gap. That is a lot that did not
 *     join the holding it was sold from (a statement spelling the security
 *     differently — Axis Liquid's `…-growth` lots against its `…-growth-option`
 *     position), or one sold in an account that no longer holds the name. The
 *     page cannot tell which, so it names the statements' figure as NOT IN THIS
 *     ONE rather than printing a second realised or hiding the difference.
 *
 * A page where the book carries NO holding — a fully exited name — has only the
 * statements' lots, and no held units they could double count, so it reads
 * those.
 *
 * AND THE TILE SAYS WHICH RECORD STRUCK IT. A fund that sells units back to its
 * holder issues no capital gain statement: 3P's +₹2.56 Cr is FIFO over the
 * fund's own dated unit record (`costBasisSource: "fifo"`, Stage 10ca). The
 * ledger reads capital-gain lots only, so its silence there is not a gap and is
 * never flagged as one.
 */
import type { Position } from "./types";
import { sumOrNull } from "./analytics";

export type RealisedRow = Pick<Position, "realizedPnL" | "realizedLotsAfter" | "costBasisSource">
  & Partial<Pick<Position, "accountId" | "costOfUnitsSold">>;

export type RealisedTile = {
  /** The one figure the tile prints. Null is not zero. */
  value: number | null;
  /** `book` — the holdings' own FIFO realised; `statements` — the capital gain lots, used only where the book carries no holding. */
  basis: "book" | "statements";
  /**
   * Which record struck the book's figure: an account's capital gain statement,
   * a fund's own dated unit record (a redemption, FIFO over its allotments), or
   * both across the rows. Null where no row carries a realised figure.
   */
  source: "capital-gains" | "unit-record" | "mixed" | null;
  /** Sales dated after the holding's statement, not counted in `value`. */
  lotsAfter: number;
  /**
   * The capital gain statements' own lot total for this name, where it differs
   * from `value` by more than a rupee and no after-statement sale explains the
   * difference. Null otherwise — including while the ledger is still loading.
   */
  unreconciled: number | null;
  /**
   * HOW MUCH OF THE HOLDING THE FIGURE COVERS: the distinct accounts among the
   * rows, and among the rows that carry a realised figure. A realised summed
   * over two of five accounts is a figure for those two, and the tile must say
   * so rather than read as the holding's — the other three issue no capital
   * gain statement, and blending them in as zero is §5's failure.
   */
  accounts: number;
  covered: number;
  /**
   * A MEASURED ₹0 BECAUSE NOTHING WAS SOLD: every row carrying a figure sold no
   * units (`costOfUnitsSold` is 0). A computed zero's reason goes on the tile's
   * face, and "booked on units sold" over a zero where nothing was sold is a
   * claim about sales that did not happen.
   */
  nothingSold: boolean;
};

/**
 * @param rows            the holding's rows, each dedupeGroup counted once.
 * @param ledgerRealised  the capital gain statements' lot total for the name:
 *                        `undefined` while loading, `null` where no statement
 *                        covers it.
 */
export function realisedTile(rows: readonly RealisedRow[], ledgerRealised: number | null | undefined): RealisedTile {
  if (rows.length === 0) {
    return { value: ledgerRealised ?? null, basis: "statements", source: ledgerRealised == null ? null : "capital-gains", lotsAfter: 0, unreconciled: null, accounts: 0, covered: 0, nothingSold: false };
  }
  const value = sumOrNull(rows.map((r) => r.realizedPnL));
  const lotsAfter = rows.reduce((s, r) => s + (r.realizedLotsAfter ?? 0), 0);
  const carrying = rows.filter((r) => typeof r.realizedPnL === "number" && Number.isFinite(r.realizedPnL));
  const byRecord = carrying.filter((r) => r.costBasisSource === "fifo").length;
  const source = !carrying.length ? null : byRecord === carrying.length ? "unit-record" : byRecord === 0 ? "capital-gains" : "mixed";
  // A figure struck from a fund's unit record has no capital-gain lots to
  // compare against, so the ledger's figure is only held to the rows a capital
  // gain statement struck.
  const fromStatements = sumOrNull(carrying.filter((r) => r.costBasisSource !== "fifo").map((r) => r.realizedPnL));
  const unreconciled = lotsAfter === 0 && ledgerRealised != null
    && (fromStatements == null || Math.abs(fromStatements - ledgerRealised) > 1)
    ? ledgerRealised : null;
  const accountsOf = (rs: readonly RealisedRow[]) => new Set(rs.map((r, i) => r.accountId ?? `row-${i}`)).size;
  const nothingSold = value === 0 && carrying.length > 0 && carrying.every((r) => r.costOfUnitsSold === 0);
  return { value, basis: "book", source, lotsAfter, unreconciled, accounts: accountsOf(rows), covered: accountsOf(carrying), nothingSold };
}
