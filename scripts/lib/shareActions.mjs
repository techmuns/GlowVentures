// A HOLDING'S PURCHASE DATES CARRIED THROUGH ITS SPLITS, BONUSES AND DEMERGERS (Stage 10ly).
//
// `holdingTradeRecord` dates a holding only where its window's buys hold every
// unit. A share that split ten for one, or took a 1:1 bonus, or arrived by a
// demerger holds units no buy printed, so SVAN's V2 Retail (31,600 held, 3,160
// bought), Sharda Motor and Time Technoplast (twice what was bought), Shankara
// Buildpro and HEG Graphite stayed undated while every rupee in them was paid
// on a dated trade.
//
// Each action is evidence with its own source, never a fit to the count:
//   - splits and bonuses are rows of the saved NSE corporate-action capture
//     (`public/data/corporate-actions.json`), read only where the capture's own
//     window covers the replay — an action it was not asked about could sit
//     outside it — and only where its rows name one ISIN for the symbol;
//   - a demerger's entitlement is the company's, cited in `shared/demergers.mjs`;
//   - any OTHER non-dividend action in the window (a buyback, a rights issue, a
//     demerger not on that list) refuses the replay, since it may move units.
// And the replay must land on the statement: the units it ends with are exactly
// the units the holding statement holds, and a demerger's parent closes on
// exactly what the statements hold of it — nil where the account no longer
// holds it — so its trades are known to have started from nothing.
//
// The result is `Position.actionRecord`, a source for the Invested on column
// only. `tradeRecord` keeps its meaning (the trades ALONE hold every unit),
// because the readers of `unaccounted === 0` replay the trades' money, and a
// demerged unit's money was paid for the parent.
import fs from "node:fs";
import path from "node:path";
import { actionReplay } from "./holdingTrades.mjs";
import { DEMERGERS, demergerInto } from "../../shared/demergers.mjs";
import { currentIsin } from "../../shared/isinSuccessors.mjs";

const EPS = 1e-6;

/** The saved capture, indexed by symbol. Null where the file is absent. */
export function loadSavedActions(root) {
  let feed;
  try { feed = JSON.parse(fs.readFileSync(path.join(root, "public/data/corporate-actions.json"), "utf8")); }
  catch { return null; }
  const bySymbol = new Map();
  for (const r of feed.rows ?? []) {
    if (!r.ticker) continue;
    (bySymbol.get(r.ticker) ?? bySymbol.set(r.ticker, []).get(r.ticker)).push(r);
  }
  return { from: feed.requestedFrom, through: feed.verifiedThrough, bySymbol };
}

/**
 * The split and bonus factors a security took between `from` and `to`, or a
 * reason it cannot be said. A registered demerger the security was the PARENT
 * of passes: it allots another company's shares and leaves this one's count
 * alone.
 */
export function countActions(saved, symbol, isin, from, to) {
  if (!symbol) return { actions: [] };
  const rows = saved.bySymbol.get(symbol) ?? [];
  const isins = new Set(rows.map((r) => currentIsin(r.isin)).filter(Boolean));
  if (isins.size > 1) return { reason: `the saved corporate actions name ${isins.size} ISINs for ${symbol}` };
  if (isin && isins.size && !isins.has(currentIsin(isin))) return { reason: `the saved corporate actions for ${symbol} name another ISIN` };
  const actions = [];
  for (const r of rows) {
    if (r.type === "dividend" || !r.exDate || r.exDate < from || r.exDate > to) continue;
    if ((r.type === "split" || r.type === "bonus") && !r.issue && Number.isFinite(r.factor) && r.factor > 1) {
      actions.push({ kind: r.type, date: r.exDate, factor: r.factor, label: r.purpose, source: `${r.source}; saved action ${r.id}` });
      continue;
    }
    if (r.type === "demerger" && DEMERGERS.some((d) => d.parentSymbol === symbol && d.recordDate === r.exDate)) continue;
    return { reason: `${symbol}'s ${r.type} of ${r.exDate} (${r.purpose}) is not one this replay can carry units through` };
  }
  return { actions };
}

/**
 * WHEN A HOLDING'S UNITS WERE BOUGHT, through the actions that made them — or
 * `{ reason }`, or null where there is nothing to replay.
 *
 * `rowsOf(key)` is the account's dated trades of a security (`holdingTradeRows`
 * shape), `heldOf(key)` the units the account's statement holds of it at
 * `asOf` (0 where it holds none), `symbolOf(key)` its NSE symbol.
 */
export function actionRecordFor({ saved, key, isin, quantity, window, asOf, rowsOf, heldOf, symbolOf }) {
  if (!saved || !window || !asOf || window.to < asOf || !Number.isFinite(quantity) || quantity <= 0) return null;
  const from = window.from;
  if (from < saved.from || asOf > saved.through) {
    return { reason: `the saved corporate actions cover ${saved.from} to ${saved.through}, not this holding's ${from} to ${asOf}` };
  }
  const own = countActions(saved, symbolOf(key), isin, from, asOf);
  if (own.reason) return { reason: own.reason };
  const demerger = demergerInto(key);
  let inherited = null;
  const applied = [];
  if (demerger && demerger.recordDate >= from && demerger.recordDate <= asOf) {
    const parent = countActions(saved, demerger.parentSymbol, demerger.parentIsin, from, asOf);
    if (parent.reason) return { reason: parent.reason };
    const p = actionReplay({ rows: rowsOf(demerger.parentKey), from, to: asOf, actions: parent.actions, at: demerger.recordDate });
    if (p.reason) return { reason: `its parent ${demerger.parentKey}: ${p.reason}` };
    const held = heldOf(demerger.parentKey);
    if (Math.abs(p.units - held) > EPS) {
      return { reason: `its parent ${demerger.parentKey}'s trades from ${from}, through its own actions, end on ${p.units} units where the statement holds ${held}, so the units it held on the ${demerger.recordDate} record date are not known` };
    }
    if (!p.at?.length) return { reason: `the account held no ${demerger.parentKey} on the ${demerger.recordDate} record date` };
    inherited = { date: demerger.recordDate, lots: p.at.map((l) => ({ date: l.date, qty: l.qty * demerger.ratio })) };
    applied.push(...parent.actions.filter((a) => a.date < demerger.recordDate).map((a) => ({ ...a, of: demerger.parentKey })));
    applied.push({ kind: "demerger", date: demerger.recordDate, ratio: demerger.ratio, of: demerger.parentKey, label: `Demerger: ${demerger.ratio} for 1`, source: demerger.source });
  }
  if (!own.actions.length && !inherited) return null;
  const r = actionReplay({ rows: rowsOf(key), from, to: asOf, actions: own.actions, inherited });
  if (r.reason) return { reason: r.reason };
  if (Math.abs(r.units - quantity) > EPS) {
    return { reason: `its trades from ${from}, carried through ${[...applied, ...own.actions].map((a) => `${a.kind} of ${a.date}`).join(", ")}, end on ${r.units} units where the statement holds ${quantity}` };
  }
  applied.push(...own.actions);
  return {
    // The units and the date the replay was struck for: a line holding any
    // other count (rolled forward since, say) is not dated by it.
    units: quantity, to: asOf,
    held: { first: r.lots[0].date, last: r.lots.at(-1).date, lots: r.lots.length },
    actions: applied.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
