import { readFileSync } from "node:fs";
import { extractLayout } from "./scripts/ingest/lib/layout.mjs";
import { parseNum } from "./scripts/ingest/lib/parseNum.mjs";
const flat = async (f) => {
  const r = await extractLayout(new Uint8Array(readFileSync(f)));
  return r.pages.map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
};
const SP = "/tmp/claude-0/-home-user-GlowVentures/61e4cce9-4c93-535b-9c43-39ede1b42d03/scratchpad/mot";
const g = (t, re, i = 1) => { const m = re.exec(t); return m ? parseNum(m[i]) : null; };
const gs = (t, re, i = 1) => { const m = re.exec(t); return m ? m[i].trim() : null; };

let t = await flat(`${SP}/ANKITA_JAISINGHANI_Class_A1_STATEMENT_2026-03-31_AIFM_BPEPF6_0584.pdf`);
console.log("== BARING");
console.log("  asOf     ", gs(t, /Statement of Account as on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i));
console.log("  folio    ", gs(t, /Folio\s*#\s*([A-Za-z0-9_]+)\s*:/i));
console.log("  holder   ", gs(t, /Folio\s*#\s*[A-Za-z0-9_]+\s*:\s*([^\n]+)/i));
console.log("  pan      ", gs(t, /\bPAN\s+([A-Z]{5}\d{4}[A-Z])/));
console.log("  isin     ", gs(t, /Class\s+[A-Z]\d?\s*\/\s*(INF[A-Z0-9]{9})/i));
console.log("  class    ", gs(t, /Class of Units\s*\/[\s\S]{0,40}?(Class\s+[A-Z]\d?)\s*\//i));
console.log("  commit   ", g(t, /Capital Commitment A\s+([\d,]+)/i));
console.log("  contrib  ", g(t, /Capital Contribution C\s+([\d,]+)/i));
console.log("  undrawn  ", g(t, /Undrawn Capital G[^\n]*?\s([\d,]+)\s/i));
console.log("  units    ", g(t, /Balance Units I = H \/ Face Value\s*-\s*([\d,]+\.?\d*)/i));
console.log("  nav      ", g(t, /NAV per unit\s*-\s*([\d,]+\.\d+)/i));

t = await flat(`${SP}/Carnelian _4551_06082026162230819762.pdf`);
console.log("== AMRITKAAL");
console.log("  asOf     ", gs(t, /Summary as on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i));
console.log("  folio    ", gs(t, /Folio No\s*:\s*(\d+)/i));
console.log("  holder   ", gs(t, /Personal Information Folio No[^\n]*\n\s*([A-Z][A-Z .]+)\s/));
console.log("  pan      ", gs(t, /First Holder\s*:\s*([A-Z]{5}\d{4}[A-Z])/i));
console.log("  commit   ", g(t, /Capital Commitment \(INR\)[\s\S]{0,140}?\n\s*([\d,]+\.\d{2})/i));
console.log("  contrib  ", g(t, /Capital Commitment \(INR\)[\s\S]{0,140}?\n\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})/i));
console.log("  uncalled ", g(t, /Balance Uncalled Capital \(INR\)[\s\S]{0,120}?\n\s*([\d,]+\.\d{2})/i));
console.log("  units    ", g(t, /Closing Unit Balance\s*:[\s\S]{0,200}?\n\s*([\d,]+\.\d+)/i));
console.log("  nav      ", g(t, /Pre tax NAV\s*:\s*([\d,]+\.\d+)/i));
console.log("  closing  ", g(t, /Closing Value\s*:\s*([\d,]+\.\d+)/i));
