import { readFileSync, writeFileSync } from 'node:fs';
import { translateApi } from '../extension/lib/api.js';
import { blocksPrompt, parseBlocks } from '../extension/lib/core.js';
const key=readFileSync(0,'utf8').trim();
const pages=JSON.parse(readFileSync('reports/benchmark-inputs.json','utf8'));
const records=[];
for (const page of pages) {
  const startedAt=Date.now(), record={index:page.index,title:page.title,url:page.url,characters:page.blocks.reduce((n,b)=>n+b.text.length,0),blocks:page.blocks.length,startedAt,batches:[],status:'success'};
  for(let i=0;i<page.blocks.length;) {
    const batch=[];let size=0;
    while(i<page.blocks.length&&batch.length<80&&(!batch.length||size+page.blocks[i].text.length+40<10000)){const b=page.blocks[i++];batch.push(b);size+=b.text.length+40;}
    try {
      const r=await translateApi({key,prompt:blocksPrompt(batch,'简体中文'),json:true,signal:AbortSignal.timeout(120000)});
      parseBlocks(r.text,batch);
      record.batches.push({blocks:batch.length,durationMs:r.durationMs,firstTokenMs:r.firstTokenMs,usage:r.usage,model:r.model,estimatedUsd:r.estimatedUsd,completed:true});
    } catch(e) {record.status='error';record.message=e.message;break;}
  }
  record.durationMs=Date.now()-startedAt;record.estimatedUsd=record.batches.reduce((n,b)=>n+b.estimatedUsd,0);record.inputTokens=record.batches.reduce((n,b)=>n+b.usage.prompt_tokens,0);record.outputTokens=record.batches.reduce((n,b)=>n+b.usage.completion_tokens,0);
  records.push(record);writeFileSync('reports/api-pages.json',JSON.stringify({method:'Ten complete local prose snapshots; production API transport, batching and paragraph validation; no local cache',records},null,2));
  console.log(JSON.stringify({index:record.index,status:record.status,blocks:record.blocks,durationMs:record.durationMs,inputTokens:record.inputTokens,outputTokens:record.outputTokens,estimatedUsd:record.estimatedUsd}));
}
