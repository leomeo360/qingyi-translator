import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../extension/lib/text-rules.js';
const source=readFileSync(new URL('../extension/source.js',import.meta.url),'utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const code=section('  function proseFragments(','  function sensitiveArea(')
  +section('  function splitFragments(','  const terminal =')
  +section('  function partialTranslations(','  function updatePageStats(')
  +section('  function schedulePage(','  function disconnectPage(')
  +section('  async function translateVisible(','  async function wholePage(');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({screens=2}={}) {
  let y=0, serial=0;const jobs=[],timers=[],tasks=new Map();
  const paragraphs=Array.from({length:12},(_,i)=>{
    const parent={isConnected:true,top:80+i*500,blocked:false};
    const node={textContent:`Paragraph ${i} explains how readers can use this example.`,parentElement:parent};
    Object.defineProperties(node,{length:{get:()=>node.textContent.length},isConnected:{get:()=>!!node.parentElement}});
    node.splitText=()=>{throw new Error('This fixture has short unprotected sentences');};
    return{parent,node,original:node.textContent};
  });
  const run={groups:new Map(),total:0,count:0,characters:0,provider:'api',language:'简体中文',startedAt:0,activeMs:0,inputTokens:0,outputTokens:0,usd:0,usageKnown:true};
  const visible=(nodes,ahead=0)=>nodes.some(node=>{const p=node.parentElement;return p && p.top+80>y && p.top<y+500+ahead;});
  let api;
  const context={QYTextRules:globalThis.QYTextRules,settings:{enabled:true,provider:'api',language:'简体中文',prefetchScreens:screens},pageRun:run,presentationEpoch:0,
    document:{hidden:false,documentElement:{scrollHeight:6000},body:{scrollHeight:6000}},innerHeight:500,performance,host:{dataset:{}},bar:{},tasks,
    visibleNodes:visible,skipNode:n=>n.parentElement?.blocked,pageExcluded:()=>false,getComputedStyle:()=>({}),
    collectVisible:(_,ahead=0)=>paragraphs.filter(p=>p.node.isConnected&&!p.parent.blocked&&visible([p.node],ahead)).flatMap(p=>api.groupsFor(p.node,'')),
    makeReplacement:original=>{const parent=original.parentElement,output={textContent:'',parentElement:parent,isConnected:true,dataset:{}};original.parentElement=null;parent.card=output;return{node:output,output,original};},
    restoreCard:card=>{card.original.parentElement=card.node.parentElement;delete card.node.parentElement.card;card.node.isConnected=false;},
    showBar(){},showPageState(){},updatePageStats(){},disconnectPage(){},queueIndex(){},
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
    send:async(type,{id})=>{const job=jobs.find(j=>j.id===id);job.cancelled=true;job.finish({status:'cancelled'});return{};},
    receive:(_task,value)=>jobs.at(-1).finish(value),
    request:(options,paint)=>{
      const job={id:String(++serial),...options,paint};
      const promise=new Promise(resolve=>{job.finish=value=>{tasks.delete(job.id);resolve({id:job.id,...value});};});
      tasks.set(job.id,{});jobs.push(job);return{id:job.id,promise};
    }
  };
  api=vm.runInNewContext(code+';({groupsFor,translateVisible,paintReadyVisible,schedulePage,interruptPrefetch});',context);
  return {...api,run,jobs,paragraphs,timers,context,scroll:to=>{y=to;run.prefetchChars=0;},
    complete:job=>job.finish({status:'success',text:JSON.stringify(Object.fromEntries(job.blocks.map(b=>[b.id,`第${b.id}段中文译文。`]))),estimatedUsd:0}),
    stream:job=>job.paint({id:job.id,status:'streaming',text:JSON.stringify(Object.fromEntries(job.blocks.map(b=>[b.id,'未完成的译文'])))}),
    start:()=>api.translateVisible(run)};
}

test('当前屏幕先发，向下两屏预译但不改DOM；不滚动不会继续发送更远正文',async()=>{
  const h=harness(),done=h.start();assert.equal(h.jobs[0].kind,'page');assert.equal(h.jobs[0].blocks.length,1);
  h.complete(h.jobs[0]);await tick();assert.equal(h.jobs[1].kind,'prefetch');assert.equal(h.jobs[1].blocks.length,2);
  h.stream(h.jobs[1]);assert.equal(h.paragraphs[1].parent.card,undefined);
  h.complete(h.jobs[1]);await done;
  assert.equal(h.jobs.length,2);assert.equal(h.paragraphs[1].node.textContent,h.paragraphs[1].original);
  assert.equal(h.paragraphs[2].parent.card,undefined);assert.equal(h.paragraphs[3].parent.card,undefined);
});

test('全部内容模式在首屏后预翻译页面剩余内容',async()=>{
  const h=harness({screens:-1}),done=h.start();
  assert.equal(h.jobs[0].kind,'page');assert.equal(h.jobs[0].blocks.length,1);
  h.complete(h.jobs[0]);await tick();
  assert.equal(h.jobs[1].kind,'prefetch');assert.equal(h.jobs[1].blocks.length,11);
  h.complete(h.jobs[1]);await done;
  assert.equal(h.jobs.length,2);assert.equal(h.paragraphs[11].parent.card,undefined);
});

test('滚到已预译内容时即使另一批仍忙碌也立即本地显示，无需新请求',async()=>{
  const h=harness(),done=h.start();h.complete(h.jobs[0]);await tick();h.complete(h.jobs[1]);await done;
  h.scroll(500);h.run.busy=true;h.schedulePage(h.run);h.timers.shift()();
  assert.match(h.paragraphs[1].parent.card.textContent,/中文译文/);assert.equal(h.jobs.length,2);
  h.paintReadyVisible(h.run);assert.equal(h.jobs.length,2);
});

test('快速跳页取消不相关API预取，新视口先发，迟到预取进度不回写',async()=>{
  const h=harness(),done=h.start();h.complete(h.jobs[0]);await tick();const old=h.jobs[1];
  h.scroll(3000);h.interruptPrefetch(h.run);await tick();
  assert.equal(old.cancelled,true);assert.equal(h.jobs[2].kind,'page');assert.match(h.jobs[2].blocks[0].text,/Paragraph 6/);
  // Production receive() discards terminal task IDs; no callback survives cancellation.
  assert.equal(h.context.tasks.has(old.id),false);
  h.complete(h.jobs[2]);await tick();h.complete(h.jobs[3]);await done;
  assert.equal(h.run.paused,undefined);assert.equal(h.paragraphs[1].parent.card,undefined);
});

test('预取失败不暂停整页、不立即重试；真正可见时才作为前台任务处理',async()=>{
  const h=harness(),done=h.start();h.complete(h.jobs[0]);await tick();h.jobs[1].finish({status:'error',message:'network error'});await done;
  assert.equal(h.run.done,undefined);assert.equal(h.jobs.length,2);
  h.scroll(500);const next=h.start();assert.equal(h.jobs[2].kind,'page');h.complete(h.jobs[2]);await tick();
  if(h.jobs[3])h.complete(h.jobs[3]);await next;assert.equal(h.run.paused,undefined);
});

test('预译后区域变成代码，滚入时保持原文；取消曾经显示的部分预译也恢复原文',async()=>{
  const h=harness(),done=h.start();h.complete(h.jobs[0]);await tick();h.complete(h.jobs[1]);await done;
  h.paragraphs[1].parent.blocked=true;h.scroll(500);h.paintReadyVisible(h.run);
  assert.equal(h.paragraphs[1].parent.card,undefined);assert.equal(h.run.groups.has(h.paragraphs[1].node),false);
  const c=harness(),work=c.start();c.complete(c.jobs[0]);await tick();const prefetch=c.jobs[1];
  c.scroll(500);c.stream(prefetch);assert(c.paragraphs[1].parent.card);
  c.scroll(3000);c.interruptPrefetch(c.run);await tick();assert.equal(c.paragraphs[1].parent.card,undefined);
  c.complete(c.jobs[2]);await tick();c.complete(c.jobs[3]);await work;
});

test('关闭预翻译只处理当前屏幕',async()=>{
  const h=harness({screens:0}),done=h.start();h.complete(h.jobs[0]);await done;
  assert.equal(h.jobs.length,1);assert.equal(h.paragraphs[1].parent.card,undefined);
});
