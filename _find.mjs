import xlsx from "xlsx";
const wb = xlsx.readFile("source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx");
const re = new RegExp(process.argv[2], "i");
for (const name of wb.SheetNames) {
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
  rows.forEach((r, i) => {
    const line = r.map((c) => (c == null ? "" : typeof c === "number" ? String(Math.round(c * 10000) / 10000) : String(c).trim())).join(" | ").replace(/(\s*\|\s*)+$/, "");
    if (re.test(line)) console.log(`[${name}:${i + 1}] ${line.slice(0, 210)}`);
  });
}
