import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extract } from '../providers/mutualFundFolio.mjs';
import { fifoFromCashFlows } from '../../../shared/fifo.mjs';
const read=(key,mutate=(s)=>s)=>{
  const pages=JSON.parse(fs.readFileSync(new URL(`../../../public/audit/${key}/pages.json`,import.meta.url))).pages;
  return extract({grid:{pages:pages.map(p=>({...p,text:mutate(p.text)}))},meta:{docKey:key}});
};
const specs=[['hdfc-mutual-fund-15644806-2026-10-01-holdings',25000000,1],['hdfc-mutual-fund-16002141-2026-10-01-holdings',15000000,1],['hdfc-mutual-fund-15725046-2026-10-01-holdings',142847.57,3],['kotak-mahindra-mutual-fund-7125255-2026-10-05-holdings',3360937,19]];
for(const [key,cost,count] of specs){
 const d=read(key);assert.equal(d.warnings.length,0);assert.equal(d.holdings.find(h=>h.quantity>0).totalCost,cost);
 assert.equal(d.sections.schemeLots.rows.length-1,count);
 const original=JSON.parse(fs.readFileSync(new URL(`../../../public/audit/${key}/document.json`,import.meta.url)));
 assert.deepEqual(d.cashFlows,original.cashFlows,'scheme trades must not become external account capital');
}
const d=read(specs[2][0]),rows=d.sections.schemeLots.rows;
const flows=rows.slice(1).map(r=>Object.fromEntries(rows[0].map((k,i)=>[k,r[i]])));
const f=fifoFromCashFlows(flows).ledger;
assert.ok(Math.abs(f.unitsHeld-48.183)<.0005);assert.ok(Math.abs(f.costHeld-142843.065377)<.001);
assert.ok(Math.abs(f.realisedGain-869249.945377)<.001);assert.ok(f.costSold>59000000);
const broken=read(specs[0][0],s=>s.replace('83,001.863 83,001.863','83,001.863 83,002.863'));
assert.ok(broken.warnings.some(w=>w.code==='block-ledger-not-reconciled'));
assert.equal(broken.sections.schemeLots,undefined);
console.log('blockCosts: all four real summaries, full unit ledgers, FIFO and failed running-balance gate passed');
