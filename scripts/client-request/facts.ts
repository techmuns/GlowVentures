/**
 * THE FACTS THE CLIENT RECORDS REQUEST IS PRINTED FROM (Stage 10mq).
 *
 * Bundled and run by `build.mjs`. It reads the generated book and asks the
 * dashboard's OWN rules — `investedOnOf` for a purchase date, `holdingBucket`
 * for the section a holding sits in — so the request names exactly the gaps
 * the Portfolio Monitor shows as blank, never a second derivation of them.
 */
import {
  BOOK_ACCOUNTS, BOOK_ACCOUNT_NAV_HISTORY, BOOK_ACCOUNT_RETURN_RECORDS, BOOK_TRADE_OPENINGS, BOOK_ADVISED_BALANCES, BOOK_AS_OF, BOOK_HOLDING_TRADES, BOOK_POSITIONS, BOOK_RECOVERED_COSTS,
  BOOK_SHARE_MOVEMENTS, BOOK_SHARE_ROLLS, BOOK_TAPE_ROWS, BOOK_UNVALUED_HOLDINGS,
} from "@/data/glowData";
import { investedOnOf } from "@/lib/investedOn";
import { holdingBucket } from "@/lib/analytics";
import { writeFileSync } from "node:fs";

const accounts = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));

const positions = [...BOOK_POSITIONS, ...BOOK_TAPE_ROWS].map((p) => {
  const a = accounts.get(p.accountId);
  return {
    accountId: p.accountId,
    securityKey: p.securityKey,
    security: p.security,
    isin: p.isin ?? null,
    quantity: p.quantity,
    costBasis: p.costBasis,
    valuedAtCost: p.valuedAtCost ?? false,
    bucket: holdingBucket(p, a?.engagement),
    engagement: a?.engagement ?? null,
    dated: investedOnOf([p]) !== null,
    dateSources: investedOnOf([p])?.sources ?? [],
    undatedReason: p.tradeRecord?.reason ?? null,
  };
});

writeFileSync(process.argv[2], JSON.stringify({
  bookAsOf: BOOK_AS_OF,
  accounts: BOOK_ACCOUNTS.map((a) => ({ accountId: a.accountId, accountNo: a.accountNo, owner: a.owner, provider: a.provider, engagement: a.engagement, asOf: a.asOf })),
  positions,
  unvalued: BOOK_UNVALUED_HOLDINGS.map((u) => ({ accountId: u.accountId, securityKey: u.securityKey, isin: u.isin, quantity: u.quantity })),
  recovered: BOOK_RECOVERED_COSTS.map((r) => ({ accountId: r.accountId, isin: r.isin, quantity: r.quantity })),
  movements: Object.values(BOOK_SHARE_MOVEMENTS).map((m) => ({ accountId: m.accountId, securityKey: m.securityKey, isin: m.isin, closing: m.closing, periodTo: m.periodTo })),
  advised: BOOK_ADVISED_BALANCES.map((b) => ({ accountId: b.accountId, isin: b.isin, recordQuantity: b.recordQuantity, quantity: b.quantity, on: b.on })),
  // Each account's dated valuations and the opening of its verified return
  // record: the section asking for start-of-year valuations is held to these.
  tradeOpenings: BOOK_TRADE_OPENINGS,
  navDates: Object.fromEntries(Object.entries(BOOK_ACCOUNT_NAV_HISTORY).map(([id, h]) => [id, h.map((x) => x.date).sort()])),
  returnOpen: Object.fromEntries(Object.entries(BOOK_ACCOUNT_RETURN_RECORDS ?? {}).map(([id, r]) => [id, r?.record?.flows?.[0]?.date ?? null])),
  rolls: BOOK_SHARE_ROLLS.map((r) => ({ accountId: r.accountId, isin: r.isin, security: r.security, statementQuantity: r.statementQuantity, quantity: r.quantity, through: r.through })),
  trades: Object.fromEntries(Object.entries(BOOK_HOLDING_TRADES).map(([k, ts]) => [k, ts.map((t) => ({ date: t.date, side: t.side, quantity: t.quantity }))])),
}));
