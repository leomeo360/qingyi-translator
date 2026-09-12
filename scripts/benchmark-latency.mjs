import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const load = path => import(pathToFileURL(resolve(path)));
const { translateApi } = await load('extension/lib/api.js');
const { blocksPrompt, parseBlocks, partialTranslations, viewportBatch } = await load('extension/lib/core.js');
if (process.stdin.isTTY) execFileSync('stty', ['-echo'], {stdio:'inherit'});
let key;
const input = createInterface({ input: process.stdin });
for await (const line of input) { key = line.trim(); break; }
input.close(); process.stdin.pause(); process.stdin.unref?.();
if (process.stdin.isTTY) execFileSync('stty', ['echo'], {stdio:'inherit'});
if (!key) process.exit(1);
const page = JSON.parse(readFileSync('reports/benchmark-inputs.json', 'utf8'))[0];
const blocks = viewportBatch(page.blocks, 'api');
const cut = Math.max(1, blocks.findIndex((_, i) => blocks.slice(0, i).reduce((n,b)=>n+b.text.length,0) >= blocks.reduce((n,b)=>n+b.text.length,0)/2));
if (process.argv.includes('--production')) {
  const { translateApiBlocks } = await load('extension/lib/api-batch.js');
  const start = Date.now(); let firstReadableMs = null;
  const topParagraph = blocks.find(b=>b.text.length>=80).id;
  const r = await translateApiBlocks({key,blocks,language:'简体中文',signal:AbortSignal.timeout(60000),onProgress(text){
    if ((partialTranslations(text,[topParagraph])[topParagraph]?.length || 0) >= 20) firstReadableMs ??= Date.now()-start;
  }});
  parseBlocks(r.text,blocks);
  const file='reports/api-latency-diagnosis.json', report=JSON.parse(readFileSync(file,'utf8'));
  const { text, ...metrics } = r;
  report.productionCheck={date:new Date().toISOString(),firstReadableMs,...metrics};
  writeFileSync(file,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.productionCheck));
  key=null;
  process.exit(0);
}
const records = [];
for (const mode of ['single', 'parallel2', 'parallel2', 'single']) {
  const batches = mode === 'single' ? [blocks] : [blocks.slice(0,cut), blocks.slice(cut)];
  const start = Date.now(); let firstReadableMs = null;
  const topParagraph = blocks.find(b=>b.text.length>=80).id;
  try {
    const result = await Promise.all(batches.map(batch => translateApi({ key, prompt: blocksPrompt(batch, '简体中文'), json: true, signal: AbortSignal.timeout(60000), onProgress(text) {
      const values = partialTranslations(text, [topParagraph]);
      if ((values[topParagraph]?.length || 0) >= 20) firstReadableMs ??= Date.now()-start;
    }}).then(r=>{parseBlocks(r.text,batch); return { blocks:batch.length, durationMs:r.durationMs, firstTokenMs:r.firstTokenMs, usage:r.usage, estimatedUsd:r.estimatedUsd, model:r.model };})));
    records.push({mode,firstReadableMs,durationMs:Date.now()-start,requests:result});
    console.log(JSON.stringify({mode,firstReadableMs,durationMs:records.at(-1).durationMs,requests:result.length}));
  } catch(e) { console.log(JSON.stringify({mode,error:e.message})); records.push({mode,error:e.message}); break; }
  writeFileSync('reports/api-latency-diagnosis.json', JSON.stringify({date:new Date().toISOString(),method:'Production API transport; one public Python documentation viewport; no local cache; A/B/B/A single request versus two balanced concurrent requests. Two observations per mode; no browser or competitor timing. Provider cache and network may affect results.',url:page.url,blocks:blocks.length,characters:blocks.reduce((n,b)=>n+b.text.length,0),records},null,2));
}
key = null;
