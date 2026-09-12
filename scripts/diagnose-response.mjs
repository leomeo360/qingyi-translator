import {readFileSync,writeFileSync} from 'node:fs';
import {translateApi} from '../extension/lib/api.js';
import {blocksPrompt,parseBlocks} from '../extension/lib/core.js';
const key=readFileSync('/private/tmp/qingyi-benchmark-key','utf8').trim();
const pages=JSON.parse(readFileSync('reports/benchmark-100-inputs.json','utf8'));
const records=[];
for(const host of ['developer.mozilla.org','en.wikipedia.org','www.bbc.com']) {
 const page=pages.find(p=>new URL(p.url).hostname===host),blocks=page.blocks.slice(0,32);
 const r=await translateApi({key,prompt:blocksPrompt(blocks,'简体中文'),json:true,signal:AbortSignal.timeout(60000)});
 let error=null;try{parseBlocks(r.text,blocks)}catch(e){error=e.message}
 let parsed;try{parsed=JSON.parse(r.text)}catch{}
 const record={host,error,usage:r.usage,durationMs:r.durationMs,expected:blocks.map(b=>b.id),returnedKeys:parsed&&Object.keys(parsed),missing:blocks.filter(b=>!parsed||typeof parsed[b.id]!=='string'||!parsed[b.id].trim()).map(b=>b.id),extra:parsed&&Object.keys(parsed).filter(id=>!blocks.some(b=>b.id===id))};
 records.push(record);console.log(JSON.stringify(record));
 writeFileSync('/private/tmp/qingyi-response-'+host+'.json',JSON.stringify({blocks,text:r.text}));
}
writeFileSync('reports/response-diagnosis.json',JSON.stringify(records,null,2));
