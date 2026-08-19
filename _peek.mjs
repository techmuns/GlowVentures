import { readFileSync } from "node:fs";
import { extractLayout, rowText } from "./scripts/ingest/lib/layout.mjs";
const r = await extractLayout(new Uint8Array(readFileSync(process.argv[2])));
if (r.error) { console.log("ERROR", r.error); process.exit(1); }
for (const pg of r.pages) console.log("\n--- page " + pg.pageNumber + " ---\n" + pg.rows.map((x) => rowText(x).join("  ")).join("\n").slice(0, Number(process.argv[3] ?? 2000)));
