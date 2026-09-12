import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../extension/lib/text-rules.js';
const source=readFileSync(new URL('../extension/source.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  async function selection('),source.indexOf('  function visibleNodes('));
function harness(cached=false) {
  let finish,paint,restored=0;const statuses=[],sent=[],timers=new Map(),tasks=new Map();
  const node={isConnected:true,nodeType:3,length:5,textContent:'Hello'}, group={text:'Hello',blocks:[]};
  const bar={hidden:true};let timerId=0;
  const context={boot:Promise.resolve(),bootError:null,selectionRun:null,pageRun:null,settings:{provider:'api',language:'简体中文'},presentationEpoch:0,timer:null,launch:{},bar,tasks,
    Node:{TEXT_NODE:3},QYTextRules:globalThis.QYTextRules,
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    skipNode:()=>false,contextFor:()=>'',groupsFor:()=>[group],addBlocks:g=>g.blocks.push({id:'0',text:'Hello',group:g}),
    terminal:s=>['success','error','cancelled'].includes(s),showBar:text=>{bar.hidden=false;statuses.push(text);},
    partialTranslations:text=>JSON.parse(text),originalUnchanged:()=>true,displayBlocks:()=>{group.card={node:{dataset:{}}};},restoreCard:()=>{restored++;},
    send:async(type,data)=>{sent.push({type,...data});},
    receive:(task,value)=>{paint(value);tasks.delete('test');finish(value);},
    request:(_,callback)=>{paint=callback;paint({status:'queued'});const promise=cached?Promise.resolve({status:'success',text:'{"0":"你好"}'}):new Promise(r=>{finish=r;});tasks.set('test',{});return{id:'test',promise};}
  };
  const api=vm.runInNewContext(code+';({selection,cancelSelection});',context);
  return {...api,context,bar,timers,statuses,sent,group,get restored(){return restored;},start:()=>api.selection({range:{startContainer:node,commonAncestorContainer:node,endContainer:node,startOffset:0,endOffset:5}}),progress:value=>paint(value)};
}
test('慢选区显示状态且可取消，取消恢复局部原文并忽略后续进度',async()=>{
  const h=harness(),done=h.start();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.statuses.length,0);const timer=[...h.timers.values()][0];assert.equal(timer.ms,200);timer.fn();
  assert.match(h.statuses.at(-1),/已排队/);
  h.progress({status:'streaming',text:'{"0":"你好"}'});assert.match(h.statuses.at(-1),/正在显示/);
  await h.cancelSelection();await done;
  assert.equal(h.restored,1);assert.equal(h.sent[0].type,'CANCEL');assert.equal(h.bar.hidden,true);
  const before=h.statuses.length;h.progress({status:'streaming',text:'{"0":"迟到"}'});assert.equal(h.statuses.length,before);
});
test('立即命中缓存时不闪出等待条，并清理反馈计时器',async()=>{
  const h=harness(true);await h.start();
  assert.equal(h.statuses.length,0);assert.equal(h.timers.size,0);assert.equal(h.bar.hidden,true);assert.equal(h.context.selectionRun,null);
});
