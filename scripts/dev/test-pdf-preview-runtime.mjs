// Small scheduling/cache contracts; no browser, PDF worker or document data.
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { build } from 'esbuild';
const compiled = await build({entryPoints:['src/lib/pdfPreviewRuntime.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{
  name:'stub-pdf-worker',setup(build){
    build.onResolve({filter:/^pdfjs-dist$/},()=>({path:'worker',namespace:'stub'}));
    build.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class PDFWorker { destroyed=false; promise=Promise.resolve(); destroy(){this.destroyed=true;} }',loader:'js'}));
  },
}]});
const runtime = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const idle = new Map();let nextIdle=0;
globalThis.window={requestIdleCallback:callback=>{idle.set(++nextIdle,callback);return nextIdle;},cancelIdleCallback:id=>idle.delete(id),setTimeout,clearTimeout};

const queue = new runtime.PdfRenderQueue();
const order=[];let active=0,maximum=0,release;
const gate = new Promise(resolve=>{release=resolve;});
const job = (name,wait=false)=>async()=>{
  order.push(name);maximum=Math.max(maximum,++active);
  if(wait)await gate;
  await tick();active--;
};
const signal=new AbortController().signal;
const neighbor=queue.run(job('neighbor'),()=>1,signal);
const visible1=queue.run(job('visible-1',true),()=>0,signal);
const visible2=queue.run(job('visible-2'),()=>0,signal);
await tick();assert.deepEqual(order,['visible-1'],'foreground work preempts idle prefetch without starting concurrent paints');
release();await Promise.all([visible1,visible2]);
for(const callback of idle.values())callback();idle.clear();await neighbor;
assert.equal(maximum,1);assert.deepEqual(order,['visible-1','visible-2','neighbor']);
const abort=new AbortController();abort.abort();
const canceled=queue.run(job('canceled'),()=>0,abort.signal);
await tick();
for(const callback of idle.values())callback();idle.clear();await canceled;
assert.ok(!order.includes('canceled'),'a canceled page never allocates a rendering task');

const cache=new runtime.PdfCanvasCache(),canvases=[];
for(let page=1;page<=5;page++){
  const canvas={width:2000,height:2000,parentElement:{querySelector:()=>null},remove(){this.parentElement=null;}};
  canvases.push(canvas);cache.keep(page,canvas,3);
}
assert.ok(canvases.filter(canvas=>canvas.parentElement).length<=4);
assert.ok(canvases.reduce((pixels,canvas)=>pixels+canvas.width*canvas.height,0)<=16_000_000);
assert.ok(canvases[2].parentElement,'the visible page survives cache eviction');
cache.trim(12);assert.ok(canvases.every(canvas=>!canvas.parentElement),'a distant jump releases old backing canvases');

const worker=runtime.preparePdfPreview();assert.equal(runtime.preparePdfPreview(),worker);
worker.destroy();assert.notEqual(runtime.preparePdfPreview(),worker);
const doc=data=>({getData:async()=>data,loadingTask:{destroyed:false}});
await runtime.rememberPdfBytes('fixture',doc(Uint8Array.from([1,2,3])),3);
const copy=runtime.cachedPdfBytes('fixture');copy[0]=99;
assert.equal(runtime.cachedPdfBytes('fixture')[0],1,'worker buffer transfers cannot detach or mutate the cached source');
let requested=false;
await runtime.rememberPdfBytes('large',{getData(){requested=true;}},9*1024*1024);
assert.equal(requested,false,'large files retain PDF.js streaming instead of forcing a whole-file cache read');
for(let i=0;i<3;i++)await runtime.rememberPdfBytes('bounded-'+i,doc(new Uint8Array(8*1024*1024)),8*1024*1024);
assert.equal(runtime.cachedPdfBytes('bounded-0'),undefined,'the document byte cache is bounded to 16 MiB');
const now=Date.now;Date.now=()=>now()+61_000;
try{assert.equal(runtime.cachedPdfBytes('bounded-2'),undefined,'expired PDF bytes are never reused');}finally{Date.now=now;}
console.log('PASS PDF runtime: priority, single paint, cancellation, canvas/byte budgets, worker reuse, input copies, large-file streaming and expiry');
