import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../extension/source.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function* textNodes('),source.indexOf('  function seedViewport('));
class NodeStub {
  constructor(type,children=[],root=false){this.nodeType=type;this.children=[...children];this.root=root;for(const child of children)child.parent=this;}
  get isConnected(){return this.root || !!this.parent?.isConnected;}
  get childNodes(){return this.children;}
  get lastChild(){return this.children.at(-1)||null;}
  get previousSibling(){const list=this.parent?.children||[];return list[list.indexOf(this)-1]||null;}
  closest(){return null;} matches(){return false;}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}
}
function harness(size=500){
  const texts=Array.from({length:size},()=>new NodeStub(3));
  const body=new NodeStub(1,texts,true), timers=[], indexed=[], sends=[];let clock=0;
  const run={scanQueue:[],scanJob:null,scanSlices:0,maxScanMs:0,fullScans:0,busy:false};
  const context={Node:{TEXT_NODE:3,ELEMENT_NODE:1},document:{body},excluded:'code',pageRun:run,performance:{now:()=>clock},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},indexText:(_run,node)=>{indexed.push(node);clock+=1;},unindexText:()=>{},schedulePage:()=>sends.push(indexed.length)};
  const api=vm.runInNewContext(code+';({textNodes,queueIndex,scanSlice});',context);
  return{...api,body,texts,run,timers,indexed,sends};
}
test('替换当前原文后遍历仍继续，不丢失后续节点',()=>{
  const h=harness(8),walk=h.textNodes(h.body);
  let first; do { first=walk.next().value; } while(first?.nodeType!==3);
  assert.equal(first,h.texts[0]);first.remove();
  assert.deepEqual([...walk].filter(node=>node?.nodeType===3),h.texts.slice(1));
});
test('首批可见任务在全文索引完成前进入短收集窗口，取消后停止剩余扫描',()=>{
  const h=harness();h.queueIndex(h.run,h.body);h.timers.shift().fn();
  assert(h.indexed.length>0 && h.indexed.length<h.texts.length);
  assert.equal(h.sends.length,1);assert.equal(h.sends[0],h.indexed.length);
  assert(h.run.maxScanMs<=8);assert.equal(h.timers[0].ms,16);
  const before=h.indexed.length;h.run.cancelled=true;h.timers.shift().fn();assert.equal(h.indexed.length,before);
});
test('完整遍历分多段执行并保持每个节点只处理一次',()=>{
  const h=harness(200);h.queueIndex(h.run,h.body);
  while(h.timers.length)h.timers.shift().fn();
  assert.equal(h.indexed.length,200);assert.equal(new Set(h.indexed).size,200);
  assert(h.run.scanSlices>1);assert.equal(h.run.fullScans,1);assert.equal(h.run.indexing,false);
});
