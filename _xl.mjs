import xlsx from "xlsx";
const wb = xlsx.readFile("source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx");
const want = process.argv.slice(2);
for (const name of (want.length ? want : wb.SheetNames)) {
  const ws = wb.Sheets[name];
  if (!ws) { console.log("!! no sheet", name); continue; }
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  console.log(`\n======== ${name}  (${rows.length} rows) ========`);
  let blank = 0;
  for (const r of rows) {
    const cells = r.map((c) => (c == null ? "" : typeof c === "number" ? (Math.abs(c) > 1000 ? Math.round(c).toLocaleString("en-IN") : String(Math.round(c * 10000) / 10000)) : String(c).trim()));
    const line = cells.join(" | ").replace(/(\s*\|\s*)+$/, "");
    if (!line.trim()) { blank++; if (blank > 1) continue; }
    else blank = 0;
    console.log("  " + line.slice(0, 230));
  }
}
