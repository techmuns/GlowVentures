// Refresh the dated fallback from a read-only Research capture. Runtime reads
// use the same normalizer via /api/corporate-actions; no new scraper or secrets.
import fs from "node:fs/promises";
import { normalizeActionFeed, RESEARCH_ACTIONS_URL } from "../shared/corporateActions.mjs";
const symbols = [...new Set(Object.values(JSON.parse(await fs.readFile(new URL("../src/data/nseSymbols.json", import.meta.url), "utf8"))))];
// The generated book uses literal ISIN fields; no TypeScript execution is needed.
const book = await fs.readFile(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
const isins = [...new Set([...book.matchAll(/"isin":\s*"([A-Z]{2}[A-Z0-9]{9}\d)"/g)].map((m) => m[1]))];
const file = process.argv[2];
const raw = file ? JSON.parse(await fs.readFile(file, "utf8")) : await (async () => {
  const r = await fetch(RESEARCH_ACTIONS_URL, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Research HTTP ${r.status}`);
  return r.json();
})();
const feed = normalizeActionFeed(raw, symbols, isins);
const target = new URL("../public/data/corporate-actions.json", import.meta.url);
await fs.mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await fs.writeFile(target, JSON.stringify(feed) + "\n");
console.log(`${feed.rows.length} events for ${symbols.length} symbols; Research captured ${feed.capturedAt}`);
