import test from 'node:test';
import assert from 'node:assert/strict';
import { translateApi, estimateCost } from '../extension/lib/api.js';
import { pageBlocks, parseBlocks, blocksPrompt, settingsFrom } from '../extension/lib/core.js';
test('API 分片、UTF-8、token 用量和完整结束标记', async () => {
  const original = globalThis.fetch; let request;
  const events = [ { choices: [{ delta: { content: '你好' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 2, prompt_cache_hit_tokens: 10 } } ];
  const bytes = new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join('') + 'data: [DONE]\n');
  globalThis.fetch = async (url, options) => { request = { url, ...options }; return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } })); };
  try {
    const result = await translateApi({ key: 'test-key-only', prompt: 'translate', json: true });
    assert.equal(result.text, '你好'); assert.equal(result.usage.prompt_tokens, 20);
    assert.equal(request.redirect, 'error'); assert.equal(request.credentials, 'omit');
    assert.equal(JSON.parse(request.body).thinking.type, 'disabled');
    assert.equal(JSON.parse(request.body).tool_choice, 'none');
    assert.equal(JSON.parse(request.body).tools, undefined);
    assert.equal(JSON.parse(request.body).response_format.type, 'json_object');
    assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  } finally { globalThis.fetch = original; }
});
test('API 拒绝截断响应，HTTP 错误不会泄露响应正文', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n');
    await assert.rejects(translateApi({ key: 'test', prompt: 'test' }), /上限/);
    globalThis.fetch = async () => new Response('secret raw body', { status: 401 });
    await assert.rejects(translateApi({ key: 'test', prompt: 'test' }), /^Error: API Key 无效/);
  } finally { globalThis.fetch = original; }
});
test('显示回调受阻时仍读完 SSE，只保留一个进行中回调和最新快照，完成前刷新末次译文', async () => {
  const original = globalThis.fetch;
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  const firstPaint = deferred(), finalPaint = deferred(), finalStarted = deferred(), drained = deferred();
  const snapshots = [], chunks = Array.from({ length: 80 }, (_, i) => `字${i}`);
  const events = chunks.map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`);
  events.push('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\ndata: [DONE]\n');
  let reads = 0, active = 0, maxActive = 0, settled = false, deadline;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode(events[reads++]));
      if (reads === events.length) { controller.close(); drained.resolve(); }
    }
  }, { highWaterMark: 0 }));
  const request = translateApi({ key: 'test', prompt: 'test', onProgress: async text => {
    snapshots.push(text); active++; maxActive = Math.max(maxActive, active);
    if (snapshots.length === 1) await firstPaint.promise;
    else { finalStarted.resolve(); await finalPaint.promise; }
    active--;
  } }).then(result => { settled = true; return result; });
  try {
    await Promise.race([drained.promise, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('SSE 读取仍被显示回调阻塞')), 1000); })]);
    clearTimeout(deadline);
    assert.equal(reads, events.length);
    assert.equal(snapshots.length, 1);
    assert.equal(settled, false);
    firstPaint.resolve();
    await finalStarted.promise;
    assert.equal(settled, false);
    assert.equal(snapshots.length, 2);
    finalPaint.resolve();
    const result = await request;
    assert.equal(maxActive, 1);
    assert.equal(active, 0);
    assert.deepEqual(snapshots, [chunks[0], chunks.join('')]);
    assert.equal(result.text, chunks.join(''));
  } finally {
    clearTimeout(deadline); firstPaint.resolve(); finalPaint.resolve();
    await request.catch(() => {}); globalThis.fetch = original;
  }
});
test('同步或异步显示回调失败都会取消读取并传播错误，不留下拒绝的后台 Promise', async () => {
  const original = globalThis.fetch;
  try {
    for (const asynchronous of [false, true]) {
      let cancelled = false, started = false;
      globalThis.fetch = async () => new Response(new ReadableStream({
        pull(controller) {
          if (!started) { started = true; controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n')); }
        },
        cancel() { cancelled = true; }
      }, { highWaterMark: 0 }));
      const failure = new Error(asynchronous ? 'async paint failed' : 'sync paint failed');
      await assert.rejects(translateApi({ key: 'test', prompt: 'test', onProgress: () => {
        if (asynchronous) return Promise.reject(failure);
        throw failure;
      } }), error => error === failure);
      assert.equal(cancelled, true);
    }
  } finally { globalThis.fetch = original; }
});
test('按官方峰谷价格计费，JSON 段落必须一一匹配', () => {
  const usage = { prompt_tokens: 2000000, prompt_cache_hit_tokens: 1000000, completion_tokens: 1000000 };
  assert.equal(estimateCost(usage, Date.parse('2026-09-10T02:00:00Z')), 1.506);
  assert.equal(estimateCost(usage, Date.parse('2026-09-10T15:00:00Z')), .753);
  const blocks = pageBlocks([{ id: '0', text: 'hello' }, { id: '1', text: 'world' }]);
  assert.match(blocksPrompt(blocks, '简体中文'), /JSON/);
  assert.deepEqual(parseBlocks('```json\n{"0":"你好","1":"世界"}\n```', blocks), {0:'你好',1:'世界'});
  assert.throws(() => parseBlocks('{"0":"你好"}', blocks));
  assert.throws(() => pageBlocks([{ id:'0',text:'one' }, { id:'0',text:'two' }]));
  assert.equal(settingsFrom({ provider:'api', apiKey:'secret' }).apiKey, undefined);
});
