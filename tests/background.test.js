import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import * as apiModule from '../extension/lib/api.js';
import * as apiBatchModule from '../extension/lib/api-batch.js';
import * as core from '../extension/lib/core.js';

const code = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8').replace(/^import .*?;\n/gm, '').replace(/^/,  `const { ${Object.keys(core).join(',')} } = core; const { API_ORIGIN, API_MODEL, translateApi } = apiModule; const { translateApiBlocks } = apiBatchModule;\n`);
const uid = () => webcrypto.randomUUID();
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
function harness(shared, apiOverride = apiModule, batchOverride = apiBatchModule) {
  const data = shared || { local: {}, session: {}, sent: [], output: [], status: { ready: true, pageId: 'adapter-page', guard: 0, session: '/a/chat/s/dedicated', mode: '深度思考:false', job: null }, statusCalls: 0 };
  const timers = new Map(); let timerId = 0;
  const storage = key => ({ get: async field => ({ [field]: structuredClone(data[key][field]) }), set: async value => { Object.assign(data[key], structuredClone(value)); }, remove: async field => { delete data[key][field]; } });
  const chrome = {
    runtime: { id: 'extension-id', getURL: path => `chrome-extension://extension-id/${path}`, onMessage: event(), onInstalled: event(), onStartup: event() },
    storage: { local: storage('local'), session: storage('session') },
    tabs: {
      get: async id => ({ id, url: id === 90 ? 'https://chat.deepseek.com/a/chat/s/dedicated' : 'https://example.com/article', status: 'complete' }),
      query: async () => [{ id: 1, url: 'https://example.com/article' }], onRemoved: event(), onUpdated: event(),
      sendMessage: async (tabId, message, options) => {
        if (message.channel === 'qy-adapter') {
          if (message.type === 'STATUS') { data.statusCalls++; if (data.statusGate) await data.statusGate.promise; return structuredClone(data.status); }
          if (message.type === 'RUN') { data.sent.push(structuredClone(message.job)); data.status = { ...data.status, ready: false, job: { id: message.job.id, status: 'waiting', text: '', owned: true } }; return { ok: true }; }
          if (message.type === 'CANCEL') return structuredClone(data.status);
        }
        data.output.push({ tabId, options: structuredClone(options), ...structuredClone(message) }); return { ok: true };
      }
    },
    scripting: { executeScript: async () => [], unregisterContentScripts: async () => {}, registerContentScripts: async () => {} },
    permissions: { contains: async () => true, getAll: async () => ({ origins: [] }), onAdded: event(), onRemoved: event() },
    contextMenus: { removeAll: async () => {}, create: () => {}, onClicked: event() },
    commands: { getAll: async () => [], onCommand: event() },
    alarms: { create: () => {}, clear: async () => {}, onAlarm: event() },
    action: { setBadgeText: async () => {}, setTitle: async () => {} }
  };
  vm.runInNewContext(code, { core, apiModule: apiOverride, apiBatchModule: batchOverride, AbortController, chrome, URL, Date, crypto: webcrypto, console, setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, {fn,delay}); return id; }, clearTimeout: id => timers.delete(id) });
  const sender = (tabId = 1, documentId = 'doc-1', frameId = 0, url = 'https://example.com/article') => ({ id: chrome.runtime.id, url, tab: { id: tabId, url: 'https://example.com/article' }, documentId, frameId });
  const popup = { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') };
  const request = (message, from = popup) => new Promise(resolve => chrome.runtime.onMessage.listeners[0](message, from, resolve));
  const panel = (type, extra = {}) => request({channel: 'qy-panel', type, ...extra});
  const drain = async () => {
    for (const [id, t] of [...timers]) if (t.delay === 0) { timers.delete(id); await t.fn(); }
    await panel('GET_PANEL');
  };
  const hello = async (tabId = 1, documentId = `doc-${tabId}`, instance = uid(), frameId = 0, url = 'https://example.com/article') => { await request({channel:'qy-source',type:'HELLO',instance},sender(tabId,documentId,frameId,url)); return {tabId,documentId,instance,frameId,url}; };
  const translate = (source, text = 'hello', extra = {}) => request({channel:'qy-source',type:'TRANSLATE', id:uid(), instance:source.instance, text, ...extra},sender(source.tabId,source.documentId,source.frameId,source.url));
  const complete = async (text = '你好') => {
    const id = data.sent.at(-1).id;
    data.status = {...data.status, ready:true, job:{id,status:'success',text,owned:true}};
    return request({channel:'qy-adapter-event',type:'PROGRESS',...structuredClone(data.status)}, {id:chrome.runtime.id,tab:{id:90},frameId:0,url:core.CHAT_ORIGIN});
  };
  return { data, panel, request, drain, hello, translate, complete, sender, chrome };
}

test('面板的全部可读内容范围会传给页面内容脚本', async () => {
  const h = harness();
  const result = await h.panel('PAGE', { scope: 'all' });
  assert.equal(result.ok, true);
  await new Promise(resolve => setImmediate(resolve));
  const message = h.data.output.find(item => item.type === 'PAGE');
  assert.equal(message.scope, 'all');
  assert.equal(message.options.frameId, 0);
});

test('快速面板不等待远端连接检查或后台串行队列', async () => {
  const h = harness(); await h.panel('BIND', { tabId: 90 });
  let release;
  h.data.statusGate = { promise: new Promise(resolve => { release = resolve; }) };
  const full = h.panel('GET_PANEL');
  await new Promise(resolve => setImmediate(resolve));
  const fast = await Promise.race([
    h.panel('GET_PANEL_FAST'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('快速面板被远端检查阻塞')), 50))
  ]);
  assert.equal(fast.ok, true);
  assert.equal(fast.data.status.checking, true);
  assert.equal(h.data.statusCalls, 2);
  release(); await full;
});

test('后台集成：三入口共用任务，重复点击去重，成功缓存不访问 DeepSeek，重试绕过缓存', async () => {
  const h = harness(); await h.panel('BIND',{tabId:90});
  const source = await h.hello();
  const first = await h.translate(source); assert(first.ok); await h.drain();
  assert.equal(h.data.sent.length,1);
  const duplicate = await h.translate(source); assert.equal(duplicate.data.id,first.data.id); await h.drain();
  assert.equal(h.data.sent.length,1);
  await h.complete();
  const reads = h.data.statusCalls;
  const cached = await h.translate(source); assert.equal(cached.data.cached,true); assert.equal(h.data.statusCalls,reads);
  await h.translate(source,'hello',{retry:true}); await h.drain(); assert.equal(h.data.sent.length,2);
});
test('后台集成：全局串行、同页排队替换、上限与独立页面结果', async () => {
  const h=harness(); await h.panel('BIND',{tabId:90});
  const sources=await Promise.all([1,2,3,4,5].map(id=>h.hello(id)));
  await h.translate(sources[0],'A'); await h.drain();
  await h.translate(sources[0],'B'); await h.translate(sources[0],'C');
  await h.translate(sources[1],'D'); await h.translate(sources[2],'E');
  const full=await h.translate(sources[3],'F'); assert.equal(full.ok,false); assert.match(full.message,/稍后重试/);
  assert.equal(h.data.session.runtime.queue.length,3);
  assert.deepEqual(h.data.session.runtime.queue.map(t=>t.text),['C','D','E']);
  await h.complete(); assert.equal(h.data.sent.length,2); assert(h.data.sent.at(-1).prompt.includes('\nC\n'));
});
test('同一标签页的主文档与跨域 iframe 分别登记、排队和回传', async () => {
  const h=harness(); await h.panel('BIND',{tabId:90});
  const active=await h.hello(2), top=await h.hello(1,'doc-top'), frame=await h.hello(1,'doc-frame',uid(),4,'https://docs.google.com/forms/d/e/example/viewform');
  await h.translate(active,'Active'); await h.drain();
  const topTask=await h.translate(top,'Top page');
  const frameTask=await h.translate(frame,'Embedded form');
  assert(topTask.ok && frameTask.ok);
  assert.deepEqual(h.data.session.runtime.queue.map(task=>task.text),['Top page','Embedded form']);
  assert.notEqual(h.data.session.runtime.queue[0].sourceKey,h.data.session.runtime.queue[1].sourceKey);
  await h.complete();
  assert.equal(h.data.session.runtime.active.id,topTask.data.id);
  await h.complete('主页面');
  assert.equal(h.data.output.filter(item=>item.id===topTask.data.id).at(-1).options.documentId,'doc-top');
  assert.equal(h.data.session.runtime.active.id,frameTask.data.id);
  await h.complete('嵌入表单');
  assert.equal(h.data.output.filter(item=>item.id===frameTask.data.id).at(-1).options.documentId,'doc-frame');
});
test('API 可见正文或划选抢占旧预翻译，同内容升级使用新 ID，迟到回复不回写', async () => {
  for (const kind of ['page', 'selection']) {
    const calls = [];
    const batchOverride = { translateApiBlocks: options => new Promise(resolve => calls.push({ options, resolve })) };
    const h = harness(undefined, apiModule, batchOverride);
    await h.panel('SET_SETTINGS', { patch: { provider: 'api' } });
    await h.panel('SET_KEY', { key: 'sk-' + 'f'.repeat(32) });
    const source = await h.hello(), blocks = [{ id: '1', text: 'Read the next paragraph.' }];
    const background = await h.translate(source, '', { kind: 'prefetch', blocks }); await h.drain();
    assert.equal(h.data.session.runtime.active.kind, 'prefetch');
    const foreground = await h.translate(source, '', { kind, blocks }); await h.drain();
    assert(foreground.ok);
    assert.notEqual(foreground.data.id, background.data.id);
    assert.equal(calls[0].options.signal.aborted, true);
    assert.equal(calls.length, 2);
    assert.equal(h.data.session.runtime.active.id, foreground.data.id);
    assert.equal(h.data.session.runtime.active.kind, kind);
    const oldOutputs = h.data.output.filter(result => result.id === background.data.id);
    assert.equal(oldOutputs.at(-1).status, 'cancelled');
    await calls[0].options.onProgress('{"1":"迟到的旧译文"}', 2);
    calls[0].resolve({ text: '{"1":"迟到的旧译文"}' });
    await new Promise(resolve => setImmediate(resolve)); await h.panel('GET_PANEL');
    assert.equal(h.data.output.filter(result => result.id === background.data.id).length, oldOutputs.length);
    assert.equal(h.data.session.runtime.cache.length, 0);
    assert.equal(h.data.session.runtime.active.id, foreground.data.id);
    calls[1].resolve({ text: '{"1":"当前译文"}', requestCount: 1, estimatedUsd: 0 });
    await new Promise(resolve => setImmediate(resolve)); await h.panel('GET_PANEL');
    assert.equal(h.data.session.runtime.active, null);
    assert.equal(h.data.output.filter(result => result.id === foreground.data.id).at(-1).status, 'success');
  }
});
test('网页模式前台请求不抢占正在执行的预翻译会话锁', async () => {
  const h = harness(); await h.panel('BIND', { tabId: 90 });
  const oldSource = await h.hello(1), newSource = await h.hello(2);
  const background = await h.translate(oldSource, '', { kind: 'prefetch', blocks: [{ id: '1', text: 'Upcoming paragraph.' }] }); await h.drain();
  const foreground = await h.translate(newSource, '', { kind: 'page', blocks: [{ id: '2', text: 'Current paragraph.' }] }); await h.drain();
  assert.equal(h.data.sent.length, 1);
  assert.equal(h.data.session.runtime.active.id, background.data.id);
  assert.equal(h.data.session.runtime.active.cancelled, undefined);
  assert.equal(h.data.session.runtime.queue[0].id, foreground.data.id);
  await h.complete('{"1":"下一段"}');
  assert.equal(h.data.sent.length, 2);
  assert.equal(h.data.session.runtime.active.id, foreground.data.id);
});
test('队列已满时前台淘汰一个待发送预翻译，并向其原页面发送取消结果', async () => {
  const h = harness(); await h.panel('BIND', { tabId: 90 });
  const sources = await Promise.all([1, 2, 3, 4, 5].map(id => h.hello(id)));
  await h.translate(sources[0], 'Active foreground'); await h.drain();
  const firstPrefetch = await h.translate(sources[1], 'Prefetch one', { kind: 'prefetch' });
  const evicted = await h.translate(sources[2], 'Prefetch two', { kind: 'prefetch' });
  const waitingPage = await h.translate(sources[3], '', { blocks: [{ id: '1', text: 'Waiting page' }] });
  const currentPage = await h.translate(sources[4], '', { blocks: [{ id: '1', text: 'Current page' }] });
  assert(currentPage.ok);
  assert.deepEqual(h.data.session.runtime.queue.map(task => task.id), [waitingPage.data.id, currentPage.data.id, firstPrefetch.data.id]);
  const cancelled = h.data.output.filter(result => result.id === evicted.data.id).at(-1);
  assert.equal(cancelled.tabId, sources[2].tabId);
  assert.equal(cancelled.status, 'cancelled');
  assert.match(cancelled.message, /让出队列/);
  assert.equal(h.data.sent.length, 1);
});
test('关闭向下预翻译后取消 API 预取、清除排队预取，并拒绝新预取', async () => {
  const calls = [];
  const batchOverride = { translateApiBlocks: options => new Promise(resolve => calls.push({ options, resolve })) };
  const h = harness(undefined, apiModule, batchOverride);
  await h.panel('SET_SETTINGS', { patch: { provider: 'api' } });
  await h.panel('SET_KEY', { key: 'sk-' + 'f'.repeat(32) });
  const first = await h.hello(1), second = await h.hello(2);
  await h.translate(first, '', { kind: 'prefetch', blocks: [{ id: '1', text: 'Upcoming paragraph.' }] }); await h.drain();
  const queued = await h.translate(second, '', { kind: 'prefetch', blocks: [{ id: '1', text: 'Another upcoming paragraph.' }] });
  await h.panel('SET_SETTINGS', { patch: { prefetchScreens: 0 } });
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(h.data.session.runtime.active, null);
  assert.equal(h.data.session.runtime.queue.length, 0);
  assert.equal(h.data.output.filter(result => result.id === queued.data.id).at(-1).status, 'cancelled');
  const rejected = await h.translate(first, '', { kind: 'prefetch', blocks: [{ id: '1', text: 'Upcoming paragraph.' }] });
  assert.equal(rejected.ok, false); assert.match(rejected.message, /已关闭/);
  assert.equal((await h.panel('GET_PANEL')).data.settings.prefetchScreens, 0);
  calls[0].resolve({ text: '{"1":"迟到译文"}' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.data.session.runtime.cache.length, 0);
});
test('后台集成：worker 重建只核对锁，不重发；旧 document 无权取消', async () => {
  let h=harness(); await h.panel('BIND',{tabId:90}); const source=await h.hello();
  const accepted=await h.translate(source); await h.drain();
  h=harness(h.data); await h.panel('GET_PANEL'); assert.equal(h.data.sent.length,1);
  await h.request({channel:'qy-source',type:'CANCEL',id:accepted.data.id,instance:source.instance},h.sender(1,'new-doc'));
  assert.equal(h.data.session.runtime.active.cancelled,undefined);
  await h.hello(1,'new-doc'); assert.equal(h.data.session.runtime.active.cancelled,true);
});
test('后台集成：未知提交状态锁住连接，不静默恢复或重发', async () => {
  let h=harness(); await h.panel('BIND',{tabId:90}); const source=await h.hello();
  await h.translate(source); await h.drain();
  h.data.status.job=null; h.data.status.ready=true;
  h=harness(h.data); await h.panel('GET_PANEL');
  assert.equal(h.data.sent.length,1); assert(h.data.session.runtime.binding.blocked);
  const result=await h.translate(source); assert.equal(result.ok,false); assert.match(result.message,/不会自动重发/);
});
test('后台集成：停用站点阻止全部入口，清缓存防止迟到结果重新写入', async () => {
  const h=harness(); await h.panel('BIND',{tabId:90}); const source=await h.hello();
  await h.panel('SET_SETTINGS',{patch:{disabledSites:['https://example.com']}});
  assert.equal((await h.translate(source)).ok,false);
  await h.panel('SET_SETTINGS',{patch:{disabledSites:[]}}); await h.translate(source); await h.drain();
  await h.panel('CLEAR'); await h.complete();
  assert.equal(h.data.session.runtime.cache.length,0);
});
test('真实回归：DeepSeek 首轮 SPA loading 不断开连接，document 更换仍断开', async () => {
  const h=harness(); h.data.status.session='/';
  await h.panel('BIND',{tabId:90}); const source=await h.hello();
  await h.translate(source); await h.drain();
  h.chrome.tabs.onUpdated.listeners[0](90,{status:'loading',url:'https://chat.deepseek.com/a/chat/s/new'});
  await h.panel('GET_PANEL');
  assert(h.data.session.runtime.active);
  assert.equal(h.data.session.runtime.binding.blocked,'');
  h.data.status.session='/a/chat/s/new';
  h.data.status.job.owned=false;
  await h.request({channel:'qy-adapter-event',type:'PROGRESS',...structuredClone(h.data.status)}, {id:h.chrome.runtime.id,tab:{id:90},frameId:0,url:core.CHAT_ORIGIN});
  assert(h.data.session.runtime.active);
  assert.equal(h.data.session.runtime.binding.session,'/');
  assert.equal(h.data.session.runtime.binding.blocked,'');
  await h.complete();
  assert.equal(h.data.session.runtime.binding.session,'/a/chat/s/new');
  assert.equal(h.data.session.runtime.cache.length,1);
  h.data.status.pageId='reloaded-document';
  h.chrome.tabs.onUpdated.listeners[0](90,{status:'complete'});
  await h.panel('GET_PANEL');
  assert(h.data.session.runtime.binding.blocked);
});

test('API 后台不依赖网页绑定；Key 不回传；用量记录、取消与重启不重发', async () => {
  let resolveApi, received, callCount = 0;
  const apiOverride = { ...apiModule, translateApi: options => { callCount++; received = options; return new Promise(r => { resolveApi = r; }); } };
  const h = harness(undefined, apiOverride);
  await h.panel('SET_SETTINGS', { patch: { provider:'api' } });
  await h.panel('SET_KEY', { key:'sk-' + 'a'.repeat(32) });
  const panel = (await h.panel('GET_PANEL')).data;
  assert.equal(panel.apiConfigured, true); assert.equal(panel.settings.provider, 'api');
  assert(!JSON.stringify(panel).includes('a'.repeat(32)));
  const source = await h.hello();
  await h.translate(source); await h.drain();
  assert.equal(callCount, 1); assert.equal(h.data.sent.length, 0);
  resolveApi({ text:'你好',usage:{prompt_tokens:20,completion_tokens:2},durationMs:500,firstTokenMs:300,estimatedUsd:.00001,model:'deepseek-flash' });
  await new Promise(r=>setImmediate(r)); await h.panel('GET_PANEL');
  assert.equal(h.data.session.runtime.active, null);
  assert.equal(h.data.session.runtime.metrics.at(-1).usage.prompt_tokens, 20);
  assert.equal(h.data.output.filter(x=>x.type==='RESULT').at(-1).text, '你好');
  await h.translate(source, 'another input'); await h.drain();
  const id=h.data.session.runtime.active.id;
  await h.request({channel:'qy-source',type:'CANCEL',id,instance:source.instance},h.sender(source.tabId,source.documentId));
  assert.equal(received.signal.aborted, true); assert.equal(h.data.session.runtime.active, null);
  resolveApi({text:'late response'}); await new Promise(r=>setImmediate(r));
  assert.equal(h.data.session.runtime.metrics.at(-1).status, 'cancelled');
  await h.translate(source, 'restart input'); await h.drain();
  const restarted=harness(h.data,apiOverride); await restarted.panel('GET_PANEL');
  assert.equal(callCount, 3); assert.equal(h.data.session.runtime.active, null);
  assert.equal(h.data.session.runtime.metrics.at(-1).status,'error');
  await restarted.panel('DELETE_KEY'); assert.equal(h.data.local.apiKey, undefined);
});

test('片段缓存跨编号复用，同批重复只提交一次，部分缓存与流式结果合并', async () => {
  const h = harness(); await h.panel('BIND', { tabId: 90 }); const source = await h.hello();
  await h.translate(source, '', { blocks: [{ id: '1', text: 'Hello world' }, { id: '2', text: 'Hello world' }] }); await h.drain();
  const first = h.data.sent.at(-1);
  assert.equal(first.prompt.match(/Hello world/g).length, 1);
  await h.complete('{"1":"你好世界"}');
  assert.deepEqual(JSON.parse(h.data.output.filter(x => x.type === 'RESULT').at(-1).text), {1:'你好世界',2:'你好世界'});
  const cached = await h.translate(source, '', { blocks: [{ id: '97', text: 'Hello world' }] });
  assert.equal(cached.data.cached, true); assert.equal(JSON.parse(cached.data.text)['97'], '你好世界');
  assert.equal(h.data.sent.length, 1);
  await h.translate(source, '', { blocks: [{ id: '3', text: 'Hello world' }, { id: '4', text: 'Read the guide' }, { id: '5', text: 'Read the guide' }] }); await h.drain();
  assert(!h.data.sent.at(-1).prompt.includes('Hello world'));
  assert.equal(h.data.sent.at(-1).prompt.match(/Read the guide/g).length, 1);
  h.data.status.job = { id: h.data.sent.at(-1).id, status: 'streaming', text: '{"4":"阅读', owned: true };
  await h.request({ channel: 'qy-adapter-event', type: 'PROGRESS', ...structuredClone(h.data.status) }, {id:h.chrome.runtime.id,tab:{id:90},frameId:0,url:core.CHAT_ORIGIN});
  assert.deepEqual(JSON.parse(h.data.output.filter(x => x.type === 'RESULT').at(-1).text), {3:'你好世界',4:'阅读',5:'阅读'});
  await h.complete('{"4":"阅读指南"}');
  assert.deepEqual(JSON.parse(h.data.output.filter(x => x.type === 'RESULT').at(-1).text), {3:'你好世界',4:'阅读指南',5:'阅读指南'});
  await h.panel('CLEAR');
  await h.translate(source, '', { blocks: [{ id: '99', text: 'Hello world' }] }); await h.drain();
  assert.equal(h.data.sent.length, 3);
});
test('后台独立阻止敏感内容与乱码，不写入任务或发送远端', async () => {
  const h = harness(); await h.panel('BIND', { tabId: 90 }); const source = await h.hello();
  for (const text of ['password: demo-only', 'sk-' + 'example'.repeat(5), '��� corrupted']) {
    const result = await h.translate(source, '', { blocks: [{ id: '1', text }] });
    assert.equal(result.ok, false); assert.match(result.message, /敏感信息或乱码/);
  }
  await h.drain(); assert.equal(h.data.sent.length, 0); assert.equal(h.data.session.runtime.queue.length, 0);
});
test('片段缓存按语言及模式隔离，畸形回复不缓存', async () => {
  const h = harness(); await h.panel('BIND', { tabId: 90 }); const source = await h.hello();
  const blocks = [{ id: '1', text: 'Read the guide' }];
  await h.translate(source, '', { blocks }); await h.drain(); await h.complete('{"1":"阅读指南"}');
  await h.panel('SET_SETTINGS', { patch: { language: '日本語' } });
  const result = await h.translate(source, '', { blocks }); assert(!result.data.cached); await h.drain();
  await h.complete('{"wrong":"incorrect"}');
  assert.equal(h.data.output.filter(x => x.type === 'RESULT').at(-1).status, 'error');
  assert.equal(h.data.session.runtime.cache.length, 1);
  const plan = core.planBlocks(blocks, h.data.session.runtime.cache, '简体中文', 'different-mode');
  assert.equal(plan.remote.length, 1);
});
test('排队的 Read more 在前页完成后复用缓存，不再发送第二次', async () => {
  const h = harness(); await h.panel('BIND',{tabId:90});
  const first = await h.hello(1), second = await h.hello(2);
  await h.translate(first,'',{blocks:[{id:'1',text:'Read more'}]}); await h.drain();
  await h.translate(second,'',{blocks:[{id:'8',text:'Read more'}]});
  await h.complete('{"1":"阅读更多"}');
  assert.equal(h.data.sent.length,1);
  const result=h.data.output.filter(x=>x.tabId===2 && x.type==='RESULT').at(-1);
  assert.equal(result.cached,true); assert.equal(JSON.parse(result.text)['8'],'阅读更多');
});
test('上下文参与缓存键，敏感上下文拒绝发送', async () => {
  const a={id:'1',text:'bank',context:'The bank holds money.'}, b={id:'2',text:'bank',context:'The river bank is green.'};
  assert.equal(core.planBlocks([a,b],[],'简体中文','web').remote.length,2);
  assert.equal(core.pageBlocks([a])[0].context,a.context);
  assert.match(core.blocksPrompt([a],'简体中文'),/只用于理解/);
  const h=harness(); await h.panel('BIND',{tabId:90}); const source=await h.hello();
  const result=await h.translate(source,'',{blocks:[{id:'1',text:'hello',context:'password: demo-only'}]});
  assert.equal(result.ok,false); assert.equal(h.data.sent.length,0);
});

test('API 页面走批处理，先去重、后合并别名，并记录请求数及排队时间', async () => {
  let resolveBatch, received, calls = 0;
  const batchOverride = { translateApiBlocks: options => {
    received = options; calls++;
    return new Promise(resolve => { resolveBatch = resolve; });
  } };
  const h = harness(undefined, apiModule, batchOverride);
  await h.panel('SET_SETTINGS', { patch: { provider: 'api' } });
  await h.panel('SET_KEY', { key: 'sk-' + 'b'.repeat(32) });
  const source = await h.hello();
  const blocks = [{ id: '1', text: 'Read more' }, { id: '2', text: 'Read more' }, { id: '3', text: 'Open the guide' }];
  await h.translate(source, '', { blocks }); await h.drain();
  assert.equal(calls, 1);
  assert.deepEqual(Array.from(received.blocks, b => b.id), ['1', '3']);
  await received.onProgress('{"1":"阅读更多"}', 25);
  const partial = h.data.output.filter(x => x.type === 'RESULT').at(-1);
  assert.equal(JSON.parse(partial.text)['2'], '阅读更多');
  resolveBatch({ text: '{"1":"阅读更多","3":"打开指南"}', requestCount: 2, durationMs: 100, firstTokenMs: 25, usage: { prompt_tokens: 30, completion_tokens: 10 }, estimatedUsd: .001, model: apiModule.API_MODEL });
  await new Promise(resolve => setImmediate(resolve)); await h.panel('GET_PANEL');
  const metric = h.data.session.runtime.metrics.at(-1);
  assert.equal(metric.status, 'success'); assert.equal(metric.requestCount, 2);
  assert(metric.queueMs >= 0); assert(metric.elapsedMs >= metric.queueMs);
  const cached = await h.translate(source, '', { blocks });
  assert.equal(cached.data.cached, true); assert.equal(calls, 1);
  assert.equal(h.data.session.runtime.metrics.at(-1).requestCount, 0);
});
