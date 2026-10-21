// Re-run the real reader on archived source text, including sealed PDFs.
// Only absent cost/lot fields may be added; quantities, NAVs and values must tie.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract } from './ingest/providers/mutualFundFolio.mjs';
import { deriveDocument } from './ingest/lib/document.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const audit=path.join(root,'public/audit'),check=process.argv.includes('--check');
const manifest=JSON.parse(fs.readFileSync(path.join(audit,'manifest.json')));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,1)+'\n');
let changed=0;
for(const entry of manifest) {
  if(!['HDFC Mutual Fund','Kotak Mahindra Mutual Fund'].includes(entry.provider)) continue;
  const dir=path.join(audit,entry.docKey),doc=JSON.parse(fs.readFileSync(path.join(dir,'document.json')));
  const pages=JSON.parse(fs.readFileSync(path.join(dir,'pages.json'))).pages;
  const out=extract({grid:{pages},meta:{...entry,docKey:entry.docKey}});
  if(!out.sections?.schemeLots) continue;
  if(out.warnings.length) throw new Error(`${entry.docKey}: ${JSON.stringify(out.warnings)}`);
  if(out.holdings.length!==doc.holdings.length||out.holdings.some((h,i)=>
    h.securityKey!==doc.holdings[i].securityKey||h.quantity!==doc.holdings[i].quantity
    ||h.marketPrice!==doc.holdings[i].marketPrice||h.printed.marketValue!==doc.holdings[i].printed.marketValue
    ||(doc.holdings[i].totalCost!=null&&h.totalCost!==doc.holdings[i].totalCost)))
    throw new Error(`${entry.docKey}: existing financial primitives changed`);
  if(JSON.stringify(out.cashFlows??[])!==JSON.stringify(doc.cashFlows??[])) throw new Error(`${entry.docKey}: external account record changed`);
  const next=deriveDocument({...doc,holdings:out.holdings,totals:out.totals});
  const sections=Object.entries(out.sections).map(([key,s])=>({key,name:s.name??key,rows:s.rows?.length??0,cols:s.rows?.reduce((m,r)=>Math.max(m,r.length),0)??0}));
  sections.push(...entry.sheets.filter((s)=>s.key==='pages'));
  const diff=JSON.stringify(next)!==JSON.stringify(doc)||Object.entries(out.sections).some(([key,s])=>
    !fs.existsSync(path.join(dir,`${key}.json`))||JSON.stringify(s)!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir,`${key}.json`)))));
  if(!diff) continue;
  changed++;
  if(check) continue;
  write(path.join(dir,'document.json'),next);
  for(const [key,s] of Object.entries(out.sections)) write(path.join(dir,`${key}.json`),s);
  entry.sheets=sections;entry.sections=sections.map((s)=>s.key);
  console.log(`Recovered ${entry.docKey}: cost summary and ${out.sections.schemeLots.rows.length-1} unit movements`);
}
if(!check&&changed) write(path.join(audit,'manifest.json'),manifest);
console.log(`${changed} document(s) ${check?'would change':'updated'}`);
if(check&&changed) process.exit(1);
