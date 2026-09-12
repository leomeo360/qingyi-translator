import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { parseBlocks, blocksPrompt, planBlocks } from '../extension/lib/core.js';
const { maskProtectedSentence: mask, restoreProtectedSentence: restore, validProtectedMarkers: valid, proseFragments } = globalThis.QYTextRules;

test('技术混排整句只产生一个翻译单元，本地还原技术文本且允许调整语序', () => {
  const original = 'Use React and GET /api/v1/me to display the result of `show()`.';
  const packed = mask(original);
  assert(packed); assert(proseFragments(original).length > 1);
  for (const token of packed.tokens) assert(!packed.text.includes(token.value));
  const output = `${packed.tokens[2].marker} 的结果可通过 ${packed.tokens[0].marker} 和 ${packed.tokens[1].marker} 显示。`;
  assert(valid(packed.text, output));
  assert.equal(restore(output, packed.tokens, true), '`show()` 的结果可通过 React 和 GET /api/v1/me 显示。');
  assert.deepEqual(parseBlocks(JSON.stringify({ 0: output }), [{id:'0',text:packed.text}]), {0:output});
  assert.match(blocksPrompt([{id:'0',text:packed.text}],'简体中文'), /每个必须原样保留恰好一次/);
});

test('流式占位符不裸露，最终缺失、重复、伪造标记均拒绝', () => {
  const packed = mask('Use the API to read the guide.');
  assert.equal(restore('使用 ⟪QY_KE', packed.tokens), '使用 ');
  assert.equal(restore('使用 ⟪QY_KEEP_0⟫ 阅读', packed.tokens), '使用 API 阅读');
  for (const output of ['缺少标记', '⟪QY_KEEP_0⟫ ⟪QY_KEEP_0⟫', '⟪QY_KEEP_1⟫', '⟪QY_KEEP_0']) {
    assert.equal(restore(output, packed.tokens, true), null);
    assert.throws(()=>parseBlocks(JSON.stringify({0:output}),[{id:'0',text:packed.text}]), /保留/);
  }
  assert.equal(restore('⟪QY_KEEP_8⟫', packed.tokens), null);
});

test('纯代码、凭据不包装，自定义术语与不同本地路径可安全共用模板', () => {
  for (const text of ['GET /api/v1/me', '`show()`', 'password: example-only', '普通内容 ⟪QY_KEEP_0⟫', 'Use API '+ 'content '.repeat(400)]) assert.equal(mask(text), null);
  const custom = mask('Install Acme+ to continue.', ['Acme+']);
  assert.equal(custom.tokens[0].value, 'Acme+');
  const a=mask('Open /docs/first to continue.'), b=mask('Open /docs/second to continue.');
  assert.equal(a.text,b.text);
  const blocks=[{id:'0',text:a.text},{id:'1',text:b.text}];
  assert.equal(planBlocks(blocks,[],'简体中文','api').remote.length,1);
  const output='打开 ⟪QY_KEEP_0⟫ 继续。';
  assert.equal(restore(output,a.tokens,true),'打开 /docs/first 继续。');
  assert.equal(restore(output,b.tokens,true),'打开 /docs/second 继续。');
});

const source=readFileSync(new URL('../extension/source.js',import.meta.url),'utf8');
const scheduler=source.slice(source.indexOf('  function schedulePage('),source.indexOf('  function disconnectPage('));
test('连续索引、滚动事件在固定 80ms 窗口合并，不持续重置发送时间', () => {
  const run={}, timers=[], batches=[]; let nodes=0;
  const schedule=vm.runInNewContext(scheduler+';schedulePage;', {pageRun:run,paintReadyVisible:()=>{},interruptPrefetch:()=>{},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},translateVisible:()=>batches.push(nodes)});
  for(let i=0;i<4;i++){nodes+=6;schedule(run);}
  assert.equal(timers.length,1); assert.equal(timers[0].ms,80);
  timers.shift().fn(); assert.deepEqual(batches,[24]); assert.equal(run.timer,null);
  schedule(run);run.cancelled=true;timers.shift().fn();assert.deepEqual(batches,[24]);
});

test('忙碌时不重发，收集窗口结束后可在下一次事件重新调度', () => {
  const run={busy:true}, timers=[];let sends=0;
  const schedule=vm.runInNewContext(scheduler+';schedulePage;',{pageRun:run,paintReadyVisible:()=>{},interruptPrefetch:()=>{},setTimeout:fn=>{timers.push(fn);return timers.length;},translateVisible:()=>sends++});
  schedule(run);timers.shift()();assert.equal(sends,0);
  run.busy=false;schedule(run);timers.shift()();assert.equal(sends,1);
});
