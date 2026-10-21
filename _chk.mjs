import { readFileSync } from "node:fs";
function grab(src, n) {
  const i = src.indexOf(`export const ${n}`); if (i < 0) return null;
  const eq = src.indexOf("=", i); const st = src.slice(eq + 1).search(/\S/) + eq + 1;
  let d = 0, q = false, e = false;
  for (let k = st; k < src.length; k++) {
    const c = src[k];
    if (q) { if (e) e = false; else if (c === "\\") e = true; else if (c === '"') q = false; continue; }
    if (c === '"') { q = true; continue; }
    if (c === "[" || c === "{") d++;
    else if (c === "]" || c === "}") { d--; if (d === 0) return JSON.parse(src.slice(st, k + 1)); }
  }
}
const N = readFileSync("src/data/glowData.ts", "utf8");
const O = readFileSync("/tmp/claude-0/-home-user-GlowVentures/61e4cce9-4c93-535b-9c43-39ede1b42d03/scratchpad/prev.ts", "utf8");
const key = (a) => `${a.provider}|${a.accountNo}`;
for (const [lbl, s] of [["was", O], ["now", N]]) {
  const sum = grab(s, "BOOK_SUMMARY"), acc = grab(s, "BOOK_ACCOUNTS"), pos = grab(s, "BOOK_POSITIONS");
  console.log(lbl, "| accounts", acc.length, "| positions", pos.length, "| total", (sum.totalValue / 1e7).toFixed(4), "| listed", (sum.listedValue / 1e7).toFixed(4), "| private", (sum.privateValue / 1e7).toFixed(4));
}
const oa = grab(O, "BOOK_ACCOUNTS"), na = grab(N, "BOOK_ACCOUNTS");
const op = grab(O, "BOOK_POSITIONS"), np = grab(N, "BOOK_POSITIONS");
const mv = (pos, id) => pos.filter((p) => p.accountId === id).reduce((s, p) => s + p.marketValue, 0);
console.log("\nEXISTING accounts that moved (must be none):");
let moved = 0;
for (const o of oa) {
  const a = na.find((x) => key(x) === key(o));
  if (!a) { console.log("  REMOVED:", key(o)); moved++; continue; }
  const nv = mv(np, a.accountId), ov = mv(op, o.accountId);
  if (o.asOf !== a.asOf || Math.abs(nv - ov) > 1) { console.log(`  ${key(o)}  ${o.asOf} -> ${a.asOf}  ${(ov/1e7).toFixed(4)} -> ${(nv/1e7).toFixed(4)} Cr`); moved++; }
}
if (!moved) console.log("  none");
console.log("\nNEW accounts:");
for (const a of na) if (!oa.some((x) => key(x) === key(a))) console.log(`  ${key(a)}  ${a.asOf}  ${(mv(np, a.accountId)/1e7).toFixed(4)} Cr  ${a.owner}`);
