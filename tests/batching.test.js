import test from 'node:test';
import assert from 'node:assert/strict';
import { compactBlocks, viewportBatch, pageBlocks, blocksPrompt } from '../extension/lib/core.js';
const samples = Array.from({length:24}, (_,i)=>({id:String(i),text:`Read the explanation for item ${i}.`,context:`Sentence group ${Math.floor(i/6)}: `+'This paragraph explains how to use the available settings. '.repeat(8)}));
test('24 个短片段合为一批，上下文每组仅发一次，编号保持不变',()=>{
  const batch=viewportBatch(samples,'api');
  assert.equal(batch.length,24);
  const packed=compactBlocks(pageBlocks(batch));
  assert.equal(packed.contexts.length,4);
  assert.deepEqual(packed.segments.map(x=>x.id),samples.map(x=>x.id));
  assert(packed.segments.every(x=>packed.contexts[x.contextId]===samples[Number(x.id)].context.trim()));
  assert(JSON.stringify(packed).length<JSON.stringify(samples).length/2);
  assert.equal(blocksPrompt(batch,'简体中文').match(/Sentence group 0:/g).length,1);
});
test('长正文按输入预算拆批，仍保留单块和条数上限',()=>{
  const long=Array.from({length:80},(_,i)=>({id:String(i),text:'a'.repeat(2200)}));
  for(const mode of ['api','web']){
    const batch=viewportBatch(long,mode); assert(batch.length>0); assert(batch.length<long.length);
    assert(JSON.stringify(compactBlocks(batch)).length<=(mode==='api'?6500:4800));
    assert.doesNotThrow(()=>pageBlocks(batch));
  }
  assert.equal(viewportBatch(Array.from({length:80},(_,i)=>({id:String(i),text:'Read more'})),'api').length,32);
});
test('大量相同上下文不再触发旧的重复上下文长度限制',()=>{
  const blocks=Array.from({length:32},(_,i)=>({id:String(i),text:`Example ${i}`,context:'a'.repeat(1100)}));
  assert.doesNotThrow(()=>pageBlocks(blocks));
  assert.equal(viewportBatch(blocks,'api').length,32);
});
