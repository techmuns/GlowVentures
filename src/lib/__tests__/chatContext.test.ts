// WHAT THE ASSISTANT IS TOLD, CHECKED AGAINST THE BOOK IT IS TOLD ABOUT.
//   npm run test:family
//
// ── WHY THIS IS THE MOST IMPORTANT SUITE OF THE THREE ───────────────────────
//
// Every other screen in this app renders figures a reader can trace to a
// statement. The chat renders SENTENCES, and a language model briefed with a
// wrong number will repeat it fluently and without a dash anywhere. There is no
// `AbsentCell` in a paragraph. So the context is the last place a wrong figure
// can be caught, and the checks below are anchored on GENERATED totals —
// `BOOK_SUMMARY`, `dedupedPositions`, `BOOK_POLYCAB` — reached by a different
// path from the builder's, so agreement is a real cross-check rather than a
// figure compared with its own copy.
//
// The second half asserts the CAVEATS, because those are what stop the model
// answering a question this book cannot answer. A context that carries the
// totals and not the limits produces confident nonsense about cost basis,
// report dates and the ring-fenced holding — and each of those is a question a
// family office actually asks.
import { BOOK_SUMMARY, BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_POLYCAB, BOOK_COMMITMENTS } from "@/data/glowData";
import { dedupedPositions, doubleCountedValue, publicPrivateSplit, sum } from "@/lib/analytics";
import { buildDashboardContext, contextPreamble, contextTickers } from "@/lib/chatContext";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const CR = 1e7;
/** Crore, to two decimals — so a tie-out is to the paise the context rounds to. */
const near = (name: string, a: unknown, b: number, tol = 0.02) =>
  ok(name, typeof a === "number" && Math.abs(a - b) <= tol, `${a} vs ${b}`);

const blocks = buildDashboardContext();
const block = <T = Record<string, unknown>>(kind: string) =>
  blocks.find((b) => b.kind === kind) as unknown as T;

ok("the context is a non-empty set of named blocks",
  blocks.length > 0 && blocks.every((b) => typeof b.kind === "string" && b.kind.length > 0),
  blocks.map((b) => b.kind).join(", "));

// ── the totals tie to the generated book ────────────────────────────────────
{
  const s = block<{ consolidatedNavCr: number; listedCr: number; privateCr: number;
    notPlacedCr: number; positions: number; accounts: number; asOf: string; distinctSecurities: number }>("book_summary");
  near("consolidated NAV ties to BOOK_SUMMARY.totalValue", s.consolidatedNavCr, BOOK_SUMMARY.totalValue / CR);
  const split = publicPrivateSplit(dedupedPositions(BOOK_POSITIONS));
  near("...and its listed half ties to publicPrivateSplit", s.listedCr, split.listed / CR);
  near("...and its private half too", s.privateCr, split.private / CR);
  near("...and the side no statement places", s.notPlacedCr, split.unplaced / CR);
  /**
   * ── ALL THREE SIDES RECONSTRUCT THE NAV, AND THE THIRD IS WHY ─────────────
   *
   * This was a TWO-term identity and it was exactly right while the split was
   * `isPrivateClass` against its own negation. The split reads the SEBI
   * category the statements print now, three funds print none, and a model
   * handed a NAV and two of three components will reconstruct the third by
   * subtraction — on this book that subtraction is ₹16.69 Cr wrong, and it is
   * precisely the arithmetic a family office asks a chat about.
   */
  near("...and the three sides reconstruct the whole",
    s.listedCr + s.privateCr + s.notPlacedCr, s.consolidatedNavCr, 0.03);
  ok("the position and account counts are the book's own",
    s.positions === BOOK_POSITIONS.length && s.accounts === BOOK_ACCOUNTS.length,
    `${s.positions} positions, ${s.accounts} accounts`);
  ok("the as-of is the book's own", s.asOf === BOOK_SUMMARY.asOf, s.asOf);
  ok("the distinct-security count is derived, not the row count",
    s.distinctSecurities === new Set(BOOK_POSITIONS.map((p) => p.securityKey)).size
      && s.distinctSecurities < s.positions,
    `${s.distinctSecurities} names in ${s.positions} rows`);
  // THE UNIT IS DECLARED. A model handed 710.4 with no unit may render it as
  // rupees, and this book's NAV would read as seven hundred rupees.
  ok("the unit is stated on the summary block", /crore/i.test(String((s as Record<string, unknown>).unit)));
}

// ── the allocation covers the whole deduped book ────────────────────────────
{
  const a = block<{ buckets: { bucket: string; valueCr: number; holdings: number }[] }>("allocation_by_bucket");
  const deduped = dedupedPositions(BOOK_POSITIONS);
  near("the buckets sum to the consolidated NAV",
    a.buckets.reduce((t, b) => t + b.valueCr, 0), sum(deduped.map((p) => p.marketValue)) / CR, 0.05);
  ok("...over every deduped holding, none dropped",
    a.buckets.reduce((t, b) => t + b.holdings, 0) === deduped.length,
    `${a.buckets.reduce((t, b) => t + b.holdings, 0)} of ${deduped.length}`);
  ok("...and each bucket is named", a.buckets.every((b) => !!b.bucket));
}

// ── per-owner is NOT deduped, and the difference is the double count ────────
{
  const o = block<{ owners: { owner: string; valueCr: number; accounts: number }[] }>("by_family_member");
  near("the per-owner rollup sums to the RAW book, not the deduped one",
    o.owners.reduce((t, x) => t + x.valueCr, 0), sum(BOOK_POSITIONS.map((p) => p.marketValue)) / CR, 0.05);
  const gap = o.owners.reduce((t, x) => t + x.valueCr, 0) - BOOK_SUMMARY.totalValue / CR;
  near("...and it exceeds the consolidated total by exactly the double count",
    gap, doubleCountedValue(BOOK_POSITIONS) / CR, 0.05);
  ok("...which is a real amount on this book, so the check is not vacuous",
    doubleCountedValue(BOOK_POSITIONS) > 0, `${(doubleCountedValue(BOOK_POSITIONS) / CR).toFixed(2)} Cr`);
}

// ── the ring-fence is stated, and stated as EXCLUDED ────────────────────────
{
  const w = block<{ ringFenced: { valueCr: number; security: string | null; note: string } }>(
    "what_this_book_does_not_carry");
  near("the ring-fenced holding's value is the book's own",
    w.ringFenced.valueCr, sum(BOOK_POLYCAB.map((p) => p.marketValue)) / CR, 0.05);
  ok("...named, so the model can recognise a question about it", !!w.ringFenced.security, String(w.ringFenced.security));
  ok("...and told that it is NOT in any total above",
    /excluded/i.test(w.ringFenced.note) && /not add/i.test(w.ringFenced.note));
  // THE ONE THAT WOULD ACTUALLY MISLEAD: the ring-fenced value must not be
  // inside the NAV the same context reports.
  const s = block<{ consolidatedNavCr: number }>("book_summary");
  ok("...and the NAV it reports genuinely excludes it",
    Math.abs(s.consolidatedNavCr - BOOK_SUMMARY.totalValue / CR) < 0.02
      && w.ringFenced.valueCr > s.consolidatedNavCr,
    `fenced ${w.ringFenced.valueCr} Cr vs NAV ${s.consolidatedNavCr} Cr`);
}

// ── the cost-basis and staleness caveats are measured, not asserted ─────────
{
  const w = block<{
    costBasis: { positionsWithNoCost: number; of: number; valueCr: number };
    blendedAsOf: { newest: string; accountsBehind: number };
    notCarried: string[];
    instruction: string;
  }>("what_this_book_does_not_carry");
  const costless = BOOK_POSITIONS.filter((p) => p.costBasis == null);
  ok("the cost-less count is the book's own",
    w.costBasis.positionsWithNoCost === costless.length && w.costBasis.of === BOOK_POSITIONS.length,
    `${w.costBasis.positionsWithNoCost} of ${w.costBasis.of}`);
  near("...and so is their value", w.costBasis.valueCr, sum(costless.map((p) => p.marketValue)) / CR, 0.05);
  ok("...and there ARE such positions, so the caveat is load-bearing", costless.length > 0);
  ok("the blended as-of names how many accounts are behind",
    w.blendedAsOf.newest === BOOK_SUMMARY.asOf && w.blendedAsOf.accountsBehind > 0,
    `${w.blendedAsOf.accountsBehind} behind ${w.blendedAsOf.newest}`);
  ok("the instruction forbids estimating a figure that is not in the context",
    /never estimate/i.test(w.instruction) && /name what would supply it/i.test(w.instruction));
  ok("...and the permanent absences are listed", w.notCarried.length >= 3);
}

// ── commitments are carried, and flagged as not-a-holding ──────────────────
{
  const c = block<{ count: number; note: string; rows: { undrawnCr: number | null }[] }>("undrawn_commitments");
  ok("every commitment in the book reaches the context", c.count === BOOK_COMMITMENTS.length, String(c.count));
  ok("...and is flagged as NOT a holding", /never summed into NAV/i.test(c.note));
}

// ── AN ACCOUNT NO STATEMENT VALUES IS NULL; A REDEEMED ONE IS A MEASURED 0 ─
//
// SC-A1: the payload used to say `valueCr: 0` for every account with no
// position row — India SME's three folios, Sky Capital's four, the income-only
// 360 ONE pair, the face-value custody accounts — so "what is my India SME
// investment worth?" was answered with a zero. The finiteness walk below cannot
// see that: 0 is finite. So the two facts are re-derived HERE, from the book's
// own rows and reasons by a different expression from the builder's, and held
// to the payload account by account.
{
  const acc = block<{ rows: { accountNo: string; provider: string; valueCr: number | null; valueNote: string | null }[] }>("accounts");
  const byNo = new Map(acc.rows.map((r) => [`${r.provider}|${r.accountNo}`, r]));
  const absent: string[] = [], nil: string[] = [], wrong: string[] = [];
  for (const a of BOOK_ACCOUNTS) {
    const r = byNo.get(`${a.provider}|${a.accountNo}`);
    if (!r) continue;
    const rows = BOOK_POSITIONS.filter((p) => p.accountId === a.accountId);
    // A measured nil: every row at nil units against a published price, or no
    // row at all because the statement's balance is nil (its own words).
    const measuredNil = rows.length
      ? rows.every((p) => p.quantity === 0 && p.currentPrice != null)
      : /balance is nil/i.test(a.noPositionsReason ?? "");
    if (rows.length === 0 && !measuredNil) {
      absent.push(a.accountNo);
      if (r.valueCr !== null || !r.valueNote) wrong.push(`${a.accountNo} should be null with a reason, got ${r.valueCr}`);
    } else if (measuredNil) {
      nil.push(a.accountNo);
      if (r.valueCr !== 0 || !/measured nil/i.test(r.valueNote ?? "")) wrong.push(`${a.accountNo} should be a measured 0, got ${r.valueCr} / ${r.valueNote}`);
    } else if (typeof r.valueCr !== "number" || r.valueNote !== null) {
      wrong.push(`${a.accountNo} holds a valued position, got ${r.valueCr} / ${r.valueNote}`);
    }
  }
  ok("an account no statement values is null with its reason, a redeemed one a measured 0 with its reason",
    wrong.length === 0, wrong.slice(0, 4).join("; "));
  // LOAD-BEARING: both kinds exist on this book, or the check passes over nothing.
  ok("...and this book has both kinds, so the check is not vacuous",
    absent.length > 0 && nil.length > 0, `${absent.length} not valued, ${nil.length} measured nil`);
}

// ── NO FABRICATED ZEROS ANYWHERE IN THE CONTEXT ────────────────────────────
//
// A `?? 0` in the builder would hand the model a measured-looking zero for
// something the book never reported — the absent-vs-zero rule, arriving through
// a JSON payload instead of a table cell. Every *Cr field must be a finite
// number or null, and never NaN, which JSON.stringify silently turns into
// `null` in an array and drops from an object.
{
  const walk = (v: unknown, path: string, out: string[]) => {
    if (v === null || v === undefined) return;
    if (typeof v === "number") { if (!Number.isFinite(v)) out.push(path); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, out)); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, out);
  };
  const bad: string[] = [];
  walk(blocks, "ctx", bad);
  ok("no non-finite number anywhere in the context", bad.length === 0, bad.slice(0, 3).join(", "));
  ok("...and it survives a JSON round trip unchanged",
    JSON.stringify(JSON.parse(JSON.stringify(blocks))) === JSON.stringify(blocks));
}

// ── the preamble actually carries the data ─────────────────────────────────
{
  const pre = contextPreamble(blocks);
  ok("the preamble embeds the context as JSON", pre.includes(JSON.stringify(blocks)));
  ok("...and states the rules the answer must follow",
    /Never state a figure that is not in this context/i.test(pre)
    && /crore/i.test(pre)
    && /BLEND of report dates/i.test(pre)
    && /ring-fenced/i.test(pre));
  // A CONTEXT TOO BIG TO SEND IS A CONTEXT THAT IS NOT SENT. The edge function
  // refuses a body over 256 KB, so this is the bound that matters.
  const bytes = new TextEncoder().encode(pre).length;
  ok("...and the whole preamble fits well inside the function's body limit",
    bytes < 200_000, `${(bytes / 1024).toFixed(1)} KB`);
}

// ── tickers are real, resolved symbols ─────────────────────────────────────
{
  const t = contextTickers();
  const known = new Set(BOOK_POSITIONS.map((p) => p.symbol).filter(Boolean) as string[]);
  ok("every ticker sent is a symbol the book actually resolved",
    t.length > 0 && t.every((x) => known.has(x)), `${t.length}: ${t.slice(0, 4).join(", ")}`);
  ok("...and the list is capped rather than the whole book", t.length <= 15, String(t.length));
}

process.exit(fails ? 1 : 0);
