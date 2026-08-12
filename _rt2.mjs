import fs from "node:fs";
const C = "glow_auth=d781847d0a4acc3f154c53b732b7debb91b9dd6d59b611082a52d37fda0b6129";
const map = JSON.parse(fs.readFileSync("src/data/nseSymbols.json", "utf8"));
const { securityKeyOf } = await import("./shared/securityKey.mjs");
const book = JSON.parse(fs.readFileSync("/tmp/claude-0/-home-user-GlowVentures/91fdfac8-7357-5f0b-8fce-ed94a4b762c3/scratchpad/names.json", "utf8"));
const keys = Object.keys(map).slice(0, 16);
let ok = 0, bad = 0, noname = 0, dead = 0;
for (const key of keys) {
  const t = map[key];
  let got = null;
  for (let i = 1; i <= 3 && !got; i++) {
    const r = await fetch("https://glowventures-1xw.pages.dev/api/ratios", {
      method: "POST", headers: { Cookie: C, "Content-Type": "application/json" },
      body: JSON.stringify({ table: true, ticker: t }),
    });
    const j = await r.json().catch(() => null);
    if (j?.ok) got = j; else await new Promise(s => setTimeout(s, 4000));
  }
  if (!got) { dead++; console.log(`${key.padEnd(26)} ${t.padEnd(12)} no answer`); continue; }
  const theirs = got.sourceCompany;
  if (!theirs) { noname++; console.log(`${key.padEnd(26)} ${t.padEnd(12)} NO H1 (${got.text.length}B)`); continue; }
  const a = securityKeyOf(theirs), b = securityKeyOf(book[key] ?? key.replace(/-/g, " "));
  const m = a === b || a.startsWith(b) || b.startsWith(a);
  if (m) ok++; else bad++;
  console.log(`${key.padEnd(26)} ${t.padEnd(12)} ${m ? "match  " : "MISMATCH"} page="${theirs}"`);
}
console.log(`\nmatched ${ok} · mismatched ${bad} · no name on page ${noname} · no answer ${dead}`);
