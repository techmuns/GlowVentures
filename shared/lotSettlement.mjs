// WHICH CAPITAL-GAIN LOTS SETTLE WHICH DAY'S SALE — one definition, read by the
// runtime ledger (`src/lib/ledger.ts`) and the book builder
// (`scripts/build-book.mjs`), so a sale's realised gain and a holding's FIFO
// realised cannot be joined two different ways.
//
// ── THE DEFECT THIS EXISTS TO STOP (A-08 and DL-1 in docs/FIGURE-AUDIT.md) ────
//
// A capital gain statement and a transaction statement are two documents about
// one sale, and they do not always spell the security the same way. Green
// Lantern's lots print `Axis Liquid Fund - Direct Plan - Growth` where the same
// account's transaction statement and appraisal print `… - Growth Option`, and a
// DSP ETF's lot carries a clipped name. Joined on the security key alone, 19
// lots and ₹8,65,685.59 of realised gain reached no sale — the Transactions
// footer read +₹1.24 Cr against the statements' own +₹1.32 Cr — and the book
// wrote a MEASURED ₹0 realised on both Axis Liquid holdings whose own statements
// carry ₹8.62 L of it.
//
// ── THE RULE ───────────────────────────────────────────────────────────────
//
// A day's sale is settled by IDENTITY first — account, security, date. What
// identity leaves over is settled by the figures that would have to coincide by
// chance: the SAME account, the SAME date, and the lots' summed sale amount
// equal to the sale's settled amount within the precision both statements print
// it to. A candidate that is not unique joins nothing. Nothing is inferred from
// a name, and the archive keeps both spellings exactly as printed.
//
// ── AND A THIRD BASIS, BECAUSE A CAPITAL GAIN IS NOT STRUCK ON THE SETTLEMENT ──
//
// ASK's and Marathon's capital gain statements (the September 2026 delivery)
// strike each sale at the CONSIDERATION LESS THE BROKERAGE — what s.48 of the
// Income-tax Act lets a gain be computed on, before STT, which it does not.
// Their transaction statements print the settlement, which is after STT as well.
// So on ASK's Adani Ports sale of 27 May 2024 (account 10032723) the two lots
// print ₹6,91,329.71 — exactly the tape's gross ₹6,92,420.09 less its brokerage
// ₹1,090.38 — and the tape settles ₹6,90,637.29: the ₹692.42 between them is
// that day's STT of ₹692.41 and a paisa of the statement's own rounding, and
// pass 2 rightly refuses it. Those same statements also CLIP a name the tape
// spells out (`CHOLAMANDALAM INVESTMENT AND` against the tape's `… AND
// FINANCE`), so identity cannot join them either: 36 lot groups, every one a
// real sale, reached no sale at all.
//
// Pass 3 therefore sets what passes 1 and 2 leave against the tape's gross less
// its brokerage, where the row prints both. The bound is the printing precision
// again — half a paisa on each figure printed to the paisa — PLUS `quantity ×
// 1e-4`, half the last decimal on each of the two four-decimal per-unit figures
// (price and brokerage rate) the consideration is derived from: the same bound
// section (a3) of the reconciliation holds a derived settlement to. Measured on
// the delivery, pass 3 joins all 36, every one to a single candidate from both
// ends; the closest call sits 4 paise from its sale against a bound of 9.03, and
// the largest gap is 5 paise against 19.60. A join must be unique BOTH WAYS —
// one group for the sale and one sale for the group — because a later sale must
// not take a group an earlier one could also have had.
//
// What none of the three passes can settle is a lot that is not a SALE: ASK
// prints five lots with sale proceeds of ₹0 — the fractions a demerger or a
// bonus left (Aarti Pharmalabs' 0.75 share in both accounts, each a ₹279.47
// loss; three Astral Poly Technik fractions at nil cost and nil proceeds).
// There is no tape row for them to meet, so they stay unsettled and the caller
// names them; they are never folded into a sale.
//
// Where a lot's key settles a sale under a DIFFERENT key, that is recorded as an
// ALIAS for the account — `accountNo|lotKey → saleKey` — so a holding keyed the
// way the sale is keyed can find its lots. An alias is kept only where every
// day pass 2 or pass 3 matched for that lot key agrees on one sale key; two
// answers leave it unaliased and are reported as a conflict.

/** One (account, security, date) — a day's sale, or the lots that settle it. */
export const daySaleKey = (accountNo, securityKey, date) => `${accountNo}|${securityKey}@${date}`;

const paise = (x) => Math.round(x * 100);

/**
 * THE BOUND IS THE PRINTING PRECISION, REPRODUCED — never a tolerance widened
 * until the figures fit. Each statement prints an amount to the paisa, so a sum
 * of `lots` printed lot amounts set against a sale printed across `rows` rows can
 * differ by at most (lots + rows) half-paise. Struck in whole paise: the
 * floating-point difference of two two-decimal figures is not itself a
 * two-decimal figure — Green Lantern 510861's five 16-Apr lots sum to
 * ₹45,09,098.17 against a sale of ₹45,09,098.19, and `0.0200000005 <= 0.02` is
 * false.
 */
export const withinPrintedPrecision = (lotSum, lots, sale, rows) =>
  2 * Math.abs(paise(lotSum) - paise(sale)) <= lots + rows;

/**
 * The bound for a sale amount DERIVED from two four-decimal per-unit figures:
 * each lot prints its own amount (a half-paisa each), each tape row carries two
 * rounded figures (gross and brokerage, a half-paisa each), and the two rates
 * the consideration rests on are printed to four decimals — half the last
 * decimal on each is `quantity × 1e-4` rupees, `quantity × 0.02` half-paise.
 */
export const withinDerivedPrecision = (lotSum, lots, sale, rows, quantity) =>
  2 * Math.abs(paise(lotSum) - paise(sale)) <= lots + 2 * rows + quantity * 0.02;

/**
 * Lots → one group per (account, security, sale date). `lots` must already be
 * deduped by the caller (a lot printed on two issues of one statement is one
 * lot); each is `{ accountNo, securityKey, saleDate, saleAmount, realised }`.
 * A group whose lots do not all print a sale amount has `saleAmount: null` and
 * can only be settled by identity.
 */
export function lotGroupsOf(lots) {
  const m = new Map();
  for (const l of lots) {
    if (!l.saleDate) continue;
    const key = daySaleKey(l.accountNo, l.securityKey, l.saleDate);
    const g = m.get(key) ?? {
      key, accountNo: l.accountNo, securityKey: l.securityKey, date: l.saleDate,
      realised: 0, saleAmount: 0, lots: 0,
    };
    g.realised += l.realised ?? 0;
    g.saleAmount = g.saleAmount === null || typeof l.saleAmount !== "number" ? null : g.saleAmount + l.saleAmount;
    g.lots += 1;
    m.set(key, g);
  }
  return m;
}

/**
 * Sell rows → one day-sale per (account, security, date), its amounts summed —
 * a day's sale printed across two rows is still one sale. Each row is
 * `{ accountNo, securityKey, date, amount, consideration?, quantity? }`; an
 * amount the statement does not report makes the day's sum `null` (it can then
 * only be settled by identity). `consideration` is the row's gross less its
 * brokerage, where it prints both — what pass 3 sets a capital gain against —
 * and `quantity` the units sold; either missing on one row makes it `null` for
 * the day, so pass 3 never strikes a bound over part of a sale.
 */
export function daySalesOf(sells) {
  const m = new Map();
  const add = (sum, v) => (sum === null || typeof v !== "number" || !Number.isFinite(v) ? null : sum + v);
  for (const t of sells) {
    if (!t.date) continue;
    const key = daySaleKey(t.accountNo, t.securityKey, t.date);
    const e = m.get(key) ?? {
      accountNo: t.accountNo, securityKey: t.securityKey, date: t.date,
      amount: 0, consideration: 0, quantity: 0, rows: 0,
    };
    e.amount = add(e.amount, t.amount);
    e.consideration = add(e.consideration, t.consideration);
    e.quantity = add(e.quantity, t.quantity);
    e.rows += 1;
    m.set(key, e);
  }
  return [...m.values()];
}

/**
 * Settle every day-sale against the lot groups.
 *
 *   bySale     daySaleKey of the SALE → { realised, lots, by: "key" | "amount" | "consideration", lotKey, lotSecurityKey }
 *   aliases    `${accountNo}|${lotSecurityKey}` → the sale's securityKey, where the
 *              two differ and every amount-matched day for that lot key agrees
 *   conflicts  lot keys whose amount-matched days name more than one sale key
 *   unsettled  lot groups no sale settles
 */
export function settleSales(groups, sales) {
  const used = new Set();
  const bySale = new Map();
  // Pass 1 — identity.
  for (const s of sales) {
    const k = daySaleKey(s.accountNo, s.securityKey, s.date);
    const g = groups.get(k);
    if (g && !used.has(g.key)) {
      used.add(g.key);
      bySale.set(k, { realised: g.realised, lots: g.lots, by: "key", lotKey: g.key, lotSecurityKey: g.securityKey });
    }
  }
  // Pass 2 — account, date and the printed amount, for what identity left over.
  const all = [...groups.values()];
  for (const s of sales) {
    const k = daySaleKey(s.accountNo, s.securityKey, s.date);
    if (bySale.has(k) || typeof s.amount !== "number") continue;
    const cands = all.filter((g) => !used.has(g.key) && g.accountNo === s.accountNo && g.date === s.date
      && g.saleAmount !== null && withinPrintedPrecision(g.saleAmount, g.lots, s.amount, s.rows));
    if (cands.length !== 1) continue;
    const g = cands[0];
    used.add(g.key);
    bySale.set(k, { realised: g.realised, lots: g.lots, by: "amount", lotKey: g.key, lotSecurityKey: g.securityKey });
  }
  // Pass 3 — account, date and the consideration less brokerage, for what the
  // first two passes left. Every candidate pair is found first and only a pair
  // unique from BOTH ends joins, so the order the sales arrive in decides nothing.
  const pairs = [];
  for (const s of sales) {
    const k = daySaleKey(s.accountNo, s.securityKey, s.date);
    if (bySale.has(k) || typeof s.consideration !== "number" || typeof s.quantity !== "number") continue;
    for (const g of all) {
      if (used.has(g.key) || g.accountNo !== s.accountNo || g.date !== s.date || g.saleAmount === null) continue;
      if (withinDerivedPrecision(g.saleAmount, g.lots, s.consideration, s.rows, s.quantity)) pairs.push({ k, g });
    }
  }
  const perSale = new Map(), perGroup = new Map();
  for (const p of pairs) {
    perSale.set(p.k, (perSale.get(p.k) ?? 0) + 1);
    perGroup.set(p.g.key, (perGroup.get(p.g.key) ?? 0) + 1);
  }
  for (const { k, g } of pairs) {
    if (perSale.get(k) !== 1 || perGroup.get(g.key) !== 1) continue;
    used.add(g.key);
    bySale.set(k, { realised: g.realised, lots: g.lots, by: "consideration", lotKey: g.key, lotSecurityKey: g.securityKey });
  }
  // The aliases the amount passes established, kept only where they agree.
  const seen = new Map();
  for (const [saleKey, r] of bySale) {
    if (r.by === "key") continue;
    const accountNo = saleKey.slice(0, saleKey.indexOf("|"));
    const saleSecurity = saleKey.slice(saleKey.indexOf("|") + 1, saleKey.lastIndexOf("@"));
    if (saleSecurity === r.lotSecurityKey) continue;
    const a = `${accountNo}|${r.lotSecurityKey}`;
    const set = seen.get(a) ?? new Set();
    set.add(saleSecurity);
    seen.set(a, set);
  }
  const aliases = new Map();
  const conflicts = [];
  for (const [a, set] of seen) {
    if (set.size === 1) aliases.set(a, [...set][0]);
    else conflicts.push({ lot: a, sales: [...set].sort() });
  }
  return { bySale, aliases, conflicts, unsettled: all.filter((g) => !used.has(g.key)) };
}

/** The security a lot belongs to in its account, after the aliases a settlement established. */
export const settledSecurityOf = (aliases, accountNo, lotSecurityKey) =>
  aliases.get(`${accountNo}|${lotSecurityKey}`) ?? lotSecurityKey;
