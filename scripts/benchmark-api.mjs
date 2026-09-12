// Credentials arrive on stdin and remain in process memory. Never included in reports.
import { readFileSync, writeFileSync } from 'node:fs';
import { translateApi } from '../extension/lib/api.js';
import { promptFor } from '../extension/lib/core.js';
import { randomUUID } from 'node:crypto';
const key = readFileSync(0, 'utf8').trim();
const samples = [...readFileSync('tests/speed.js','utf8').matchAll(/^'([^']*)'[,\n]/gm)].map(m=>m[1]);
if (samples.length !== 10) throw new Error('Expected ten benchmark samples');
const records=[];
for (const [i,text] of samples.entries()) {
  const startedAt=Date.now();
  try {
    const result=await translateApi({key,prompt:promptFor(text,'简体中文',randomUUID()),signal:AbortSignal.timeout(120000)});
    records.push({index:i+1,provider:'api',startedAt,characters:[...text].length,status:'success',...result});
    console.log(JSON.stringify({index:i+1,durationMs:result.durationMs,firstTokenMs:result.firstTokenMs,estimatedUsd:result.estimatedUsd}));
  } catch(error) {records.push({index:i+1,provider:'api',startedAt,status:'error',message:error.message});console.log(JSON.stringify({index:i+1,error:error.message}));}
  writeFileSync('reports/api-speed.json',JSON.stringify({method:'Production API transport; no local cache; same ten inputs as tests/speed.html',records},null,2));
}
