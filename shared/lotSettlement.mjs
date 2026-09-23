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
// Where a lot's key settles a sale under a DIFFERENT key, that is recorded as an
// ALIAS for the account — `accountNo|lotKey → saleKey` — so a holding keyed the
// way the sale is keyed can find its lots. An alias is kept only where every
// amount-matched day for that lot key agrees on one sale key; two answers leave
// it unaliased and are reported as a conflict.

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
 * `{ accountNo, securityKey, date, amount }`; an amount the statement does not
 * report makes the day's sum `null` (it can then only be settled by identity).
 */
export function daySalesOf(sells) {
  const m = new Map();
  for (const t of sells) {
    if (!t.date) continue;
    const key = daySaleKey(t.accountNo, t.securityKey, t.date);
    const e = m.get(key) ?? { accountNo: t.accountNo, securityKey: t.securityKey, date: t.date, amount: 0, rows: 0 };
    e.amount = e.amount === null || typeof t.amount !== "number" ? null : e.amount + t.amount;
    e.rows += 1;
    m.set(key, e);
  }
  return [...m.values()];
}

/**
 * Settle every day-sale against the lot groups.
 *
 *   bySale     daySaleKey of the SALE → { realised, lots, by: "key" | "amount", lotKey, lotSecurityKey }
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
  // The aliases the amount pass established, kept only where they agree.
  const seen = new Map();
  for (const [saleKey, r] of bySale) {
    if (r.by !== "amount") continue;
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
