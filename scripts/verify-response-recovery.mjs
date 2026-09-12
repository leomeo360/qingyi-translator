import {readFileSync,writeFileSync} from 'node:fs';
import {translateApiBlocks} from '../extension/lib/api-batch.js';
import {pageBlocks,parseBlocks} from '../extension/lib/core.js';
const key=process.env.DEEPSEEK_API_KEY||readFileSync('/private/tmp/qingyi-benchmark-key','utf8').trim();
const pages=JSON.parse(readFileSync('reports/benchmark-100-inputs.json','utf8'));
const records=[];
for(const host of (process.env.QY_DIAG_HOST ? [process.env.QY_DIAG_HOST] : ['developer.mozilla.org','en.wikipedia.org','www.bbc.com'])) {
 const page=pages.find(p=>new URL(p.url).hostname===host),batches=[];let status='success',errorCode;
 for(let i=0;i<page.blocks.length;i+=32){
  const blocks=pageBlocks(page.blocks.slice(i,i+32).map((b,j)=>({...b,id:String(i+j+1)})));
  try{
   const r=await translateApiBlocks({key,blocks,language:'简体中文',signal:AbortSignal.timeout(60000)});
   parseBlocks(r.text,blocks);batches.push({blocks:blocks.length,requestCount:r.requestCount,usage:r.usage,durationMs:r.durationMs});
  }catch(e){status='error';errorCode=e.code||e.name;break;}
 }
 const record={host,status,errorCode,batches};records.push(record);console.log(JSON.stringify(record));
}
writeFileSync('reports/response-recovery-verification.json',JSON.stringify({method:'One full fixed excerpt per previously failing site; production numeric IDs and parallel API scheduler; not browser UI or first-viewport measurement',records},null,2));
