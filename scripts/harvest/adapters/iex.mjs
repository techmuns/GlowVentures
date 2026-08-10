// ADAPTER — Indian Energy Exchange day-ahead market, spot electricity price.
//
// Closes the spec's "Electricity Prices" under Layer 2A and gives the industry
// pages a real input cost. IEX publishes the day-ahead market snapshot as a
// server-rendered table of 96 fifteen-minute blocks, each with its own Market
// Clearing Price in ₹/MWh.
//
// THE STORED FIGURE IS THE DAY'S AVERAGE MCP ACROSS ALL 96 BLOCKS, and it is
// labelled as that rather than as "the price". Indian spot power swings enormously
// within a day — this snapshot ranges from about ₹1,100 to the ₹10,000 ceiling —
// so a single block would be an arbitrary pick and the daily mean is the only
// figure that answers "what did power cost that day". The block count is checked:
// a partial day is refused rather than averaged into a figure that looks like a
// full day's price.
//
// ACCUMULATING SOURCE. The page shows one day. Each run contributes that day's
// average and the store keeps every earlier one, so the series is built here over
// time — see the note in adapters/rbi.mjs and `merge` in lib/store.mjs.
//
// THE UNIT IS THE EXCHANGE'S OWN, ₹/MWh. Dividing by 1,000 to reach the ₹/kWh a
// consumer bill quotes would be one more place for a factor-of-1000 slip, and
// the spec asks for the market price, which is quoted per MWh.

const SNAPSHOT = "https://www.iexindia.com/market-data/day-ahead-market/market-snapshot";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** A full day is 96 fifteen-minute blocks. Fewer means the page was mid-update. */
const BLOCKS_PER_DAY = 96;
const MIN_BLOCKS = 90;

let cached = null;
const load = () => (cached ??= loadOnce().catch((e) => { cached = null; throw e; }));

async function loadOnce() {
  const r = await fetch(SNAPSHOT, { headers: { "User-Agent": UA, accept: "text/html" } });
  if (!r.ok) throw new Error(`IEX snapshot: HTTP ${r.status}`);
  const html = await r.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  // The table prints the trade date as DD-MM-YYYY once, above the blocks.
  const d = text.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
  if (!d) throw new Error("IEX snapshot: no trade date on the page");
  const t = `${d[3]}-${d[2]}-${d[1]}`;

  // Each block row is: HH:MM - HH:MM, purchase bid, sell bid, MCV, scheduled
  // volume, MCP. Matching the time range first anchors the row, so a layout that
  // adds a column ahead of these fails to match instead of silently shifting
  // which number is read as the price.
  const rows = [...text.matchAll(/\d{2}:\d{2} - \d{2}:\d{2}\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)];
  const mcp = rows.map((m) => Number(m[5])).filter((v) => Number.isFinite(v));
  if (mcp.length < MIN_BLOCKS) {
    throw new Error(`IEX snapshot: only ${mcp.length} of ${BLOCKS_PER_DAY} blocks parsed — refusing to average a partial day`);
  }
  const avg = mcp.reduce((a, b) => a + b, 0) / mcp.length;
  return { t, avg, blocks: mcp.length, url: SNAPSHOT };
}

export async function fetchSeries() {
  const { t, avg, url } = await load();
  return { points: [{ t, v: avg }], upstreamCurrency: null, exchange: "IEX", sourceUrl: url };
}

export const unitPrefixFor = () => null;
