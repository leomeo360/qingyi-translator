import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { translateApiBlocks } from '../extension/lib/api-batch.js';
import { pageBlocks, parseBlocks } from '../extension/lib/core.js';
const key = process.env.DEEPSEEK_API_KEY || readFileSync('/private/tmp/qingyi-benchmark-key', 'utf8').trim();
if (!key) throw new Error('API credential required');
const pages = JSON.parse(readFileSync('reports/benchmark-100-inputs.json', 'utf8'));
if (pages.length !== 10 || new Set(pages.map(p => new URL(p.url).hostname)).size !== 10) throw new Error('Exactly ten distinct websites required');
for (const p of pages) if (!p.blocks?.length || p.blocks.some(b => !b.id || !b.text)) throw new Error('Invalid blocks');
const records = [];
for (let round = 1; round <= 10; round++) for (const page of pages) {
  const record = { round, url: page.url, title: page.title, sha256: createHash('sha256').update(JSON.stringify(page.blocks)).digest('hex'), characters: page.blocks.reduce((n,b)=>n+b.text.length,0), startedAt: new Date().toISOString(), batches: [], status: 'success' };
  const start = performance.now();
  try {
    for (let i=0;i<page.blocks.length;) {
      const batch=[]; let size=0;
      while(i<page.blocks.length && batch.length<32 && (!batch.length || size+page.blocks[i].text.length<6000)) {const b=page.blocks[i++]; batch.push({...b,id:String(i)});size+=b.text.length;}
      const result=await translateApiBlocks({key,blocks:pageBlocks(batch),language:'简体中文',signal:AbortSignal.timeout(120000)});
      record.batches.push({durationMs:result.durationMs,firstTokenMs:result.firstTokenMs,usage:result.usage,model:result.model,estimatedUsd:result.estimatedUsd,requestCount:result.requestCount});
      parseBlocks(result.text,batch);
    }
  } catch(error) {record.status='error';record.errorCode=error.code||error.name;record.usageMayBeIncomplete=true;record.failedRequestUsage=error.usage??null;record.failedRequestCount=error.requestCount??null;}
  record.durationMs=Math.round(performance.now()-start);
  records.push(record);
  writeFileSync('reports/benchmark-100-results.json',JSON.stringify({method:'Ten rounds of fixed extracted text snapshots; API only; no local cache; production parallel API scheduler with one bounded format repair; historical code tariff estimates',records},null,2));
  console.log(`${records.length}/100 round=${round} host=${new URL(page.url).hostname} status=${record.status} ms=${record.durationMs}`);
}
