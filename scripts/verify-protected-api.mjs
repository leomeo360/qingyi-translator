import {createInterface} from 'node:readline';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {translateApiBlocks} from '../extension/lib/api-batch.js';
import {parseBlocks} from '../extension/lib/core.js';
const rules=globalThis.QYTextRules;
if(process.stdin.isTTY)execFileSync('stty',['-echo'],{stdio:'inherit'});
let key;const input=createInterface({input:process.stdin});
for await(const line of input){key=line.trim();break;}
input.close();process.stdin.pause();process.stdin.unref?.();
if(process.stdin.isTTY)execFileSync('stty',['echo'],{stdio:'inherit'});
if(!key)throw new Error('Key required through stdin');
const samples=[
  'Use GET /api/v1/me to view your account.',
  'Install React and Docker, then call `show()` to display the result.',
  'Read the API guide before changing the HTTP headers.'
];
const packed=samples.map(text=>rules.maskProtectedSentence(text));
const blocks=packed.map((value,i)=>({id:String(i),text:value.text}));
const result=await translateApiBlocks({key,blocks,language:'简体中文',signal:AbortSignal.timeout(60000)});
key=null;
const output=parseBlocks(result.text,blocks);
const restored=packed.map((item,i)=>rules.restoreProtectedSentence(output[String(i)],item.tokens,true));
if(restored.some(text=>text===null))throw new Error('Protected content did not round-trip');
const report={date:new Date().toISOString(),method:'One real API request with three synthetic public technical sentences. Production sentence masking, prompt, parser and local restoration; no browser or competitor timing.',
  oldFragments:samples.reduce((sum,text)=>sum+rules.proseFragments(text).length,0),newUnits:blocks.length,
  input:samples,restored,model:result.model,requestCount:result.requestCount,firstTokenMs:result.firstTokenMs,durationMs:result.durationMs,usage:result.usage,estimatedUsd:result.estimatedUsd};
writeFileSync('reports/api-protected-sentences.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:'passed',oldFragments:report.oldFragments,newUnits:report.newUnits,requestCount:result.requestCount,firstTokenMs:result.firstTokenMs,durationMs:result.durationMs,estimatedUsd:result.estimatedUsd}));
