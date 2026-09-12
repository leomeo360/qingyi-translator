import test from 'node:test';
import assert from 'node:assert/strict';
import { translateApiBlocks } from '../extension/lib/api-batch.js';
import { estimateCost } from '../extension/lib/api.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const longBlocks = () => Array.from({ length: 8 }, (_, id) => ({ id: String(id * 3 + 1), text: `Paragraph ${id}: ` + 'Detailed translation example. '.repeat(12) }));
const translations = call => Object.fromEntries(call.blocks.map(b => [b.id, `译文 ${b.id}`]));
const options = blocks => ({ blocks, language: '简体中文', key: 'fake-test-key' });
async function within(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('等待显示回调导致取消停滞')), 1000); })]); }
  finally { clearTimeout(timer); }
}
function mockApi(t) {
  const original = globalThis.fetch, calls = [];
  let active = 0, maxActive = 0;
  globalThis.fetch = async (_url, request) => {
    request.signal.throwIfAborted();
    const body = JSON.parse(request.body);
    const payload = JSON.parse(body.messages[0].content.split('数据：\n').at(-1));
    const call = { blocks: Array.isArray(payload) ? payload : payload.segments, signal: request.signal };
    calls.push(call); active++; maxActive = Math.max(maxActive, active);
    let controller, closed = false;
    const close = () => { if (!closed) { closed = true; active--; request.signal.removeEventListener('abort', abort); } };
    const abort = () => { if (!closed) { controller.error(request.signal.reason); close(); } };
    const event = value => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n`));
    const response = new Response(new ReadableStream({
      start(value) { controller = value; request.signal.addEventListener('abort', abort, { once: true }); },
      cancel() { close(); }
    }));
    call.token = content => event({ model: 'fake-model', choices: [{ delta: { content } }] });
    call.finish = usage => {
      event({ model: 'fake-model', choices: [{ delta: {}, finish_reason: 'stop' }], usage });
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n')); controller.close(); close();
    };
    call.fail = error => { controller.error(error); close(); };
    return response;
  };
  t.after(() => { globalThis.fetch = original; });
  return { calls, get active() { return active; }, get maxActive() { return maxActive; } };
}

test('短批保持一个请求及原段落编号', async t => {
  const api = mockApi(t), blocks = [{ id: '7', text: 'Read this article.' }, { id: '92', text: 'Find useful examples.' }];
  const request = translateApiBlocks(options(blocks));
  assert.equal(api.calls.length, 1);
  const call = api.calls[0], expected = translations(call);
  call.token(JSON.stringify(expected)); call.finish({ prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 });
  const result = await request;
  assert.equal(api.maxActive, 1);
  assert.equal(result.requestCount, 1);
  assert.deepEqual(JSON.parse(result.text), expected);
  assert.equal(api.active, 0);
});

test('长批最多两路，乱序流按原编号合并并汇总 token 与费用', async t => {
  const now = Date.parse('2026-09-10T02:00:00Z'); t.mock.method(Date, 'now', () => now);
  const api = mockApi(t), blocks = longBlocks(), rightSeen = deferred(), progress = [];
  const request = translateApiBlocks({ ...options(blocks), onProgress: text => {
    const values = JSON.parse(text); progress.push(values);
    if (api.calls[1] && values[api.calls[1].blocks[0].id]) rightSeen.resolve();
  } });
  assert.equal(api.calls.length, 2);
  assert.equal(api.maxActive, 2);
  assert.deepEqual(api.calls.flatMap(c => c.blocks.map(b => b.id)), blocks.map(b => b.id));
  const [left, right] = api.calls, rightText = JSON.stringify(translations(right));
  const cut = rightText.indexOf('译文') + 1;
  right.token(rightText.slice(0, cut));
  await within(rightSeen.promise);
  assert.equal(progress[0][right.blocks[0].id], '译');
  assert.equal(progress[0][left.blocks[0].id], undefined);
  left.token(JSON.stringify(translations(left)));
  left.finish({ prompt_tokens: 20, completion_tokens: 5, total_tokens: 25, prompt_cache_hit_tokens: 3, prompt_cache_miss_tokens: 17 });
  right.token(rightText.slice(cut));
  right.finish({ prompt_tokens: 30, completion_tokens: 7, total_tokens: 37, prompt_tokens_details: { cached_tokens: 4 } });
  const result = await request;
  assert.deepEqual(JSON.parse(result.text), { ...translations(left), ...translations(right) });
  assert.deepEqual(result.usage, { prompt_tokens: 50, completion_tokens: 12, total_tokens: 62, prompt_cache_hit_tokens: 7, prompt_cache_miss_tokens: 43 });
  assert.equal(result.requestCount, 2);
  assert.equal(result.model, 'fake-model');
  assert(result.firstTokenMs >= 0);
  assert(Math.abs(result.estimatedUsd - estimateCost(result.usage, now)) < 1e-15);
  assert.deepEqual(progress.at(-1), JSON.parse(result.text));
  assert.equal(api.active, 0);
});

const waitCalls = async (api, count) => within((async () => {
  while (api.calls.length < count) await new Promise(resolve => setTimeout(resolve, 1));
})());

test('一段缺失只补译该段，保留其他段及并行请求，汇总两次费用', async t => {
  const api = mockApi(t), blocks = [{ id:'1', text:'First sentence.' }, { id:'2', text:'Second sentence.' }];
  const request = translateApiBlocks(options(blocks));
  api.calls[0].token('{"1":"第一句。"}'); api.calls[0].finish({prompt_tokens:10,completion_tokens:5,total_tokens:15});
  await waitCalls(api,2);
  assert.deepEqual(api.calls[1].blocks, [blocks[1]]);
  api.calls[1].token('{"2":"第二句。"}'); api.calls[1].finish({prompt_tokens:6,completion_tokens:3,total_tokens:9});
  const result=await request;
  assert.deepEqual(JSON.parse(result.text), {'1':'第一句。','2':'第二句。'});
  assert.equal(result.requestCount,2); assert.equal(result.usage.total_tokens,24);
});

test('多余字段按编号过滤，不误判整批失败或增加请求', async t => {
  const api=mockApi(t), request=translateApiBlocks(options([{id:'7',text:'Example.'}]));
  api.calls[0].token('{"7":"示例。","note":"说明","999":"无关段落"}');api.calls[0].finish();
  const result=await request;
  assert.deepEqual(JSON.parse(result.text),{'7':'示例。'});assert.equal(api.calls.length,1);
});

test('无效段落只恢复一次，仍失败则中止另一路并保留已知用量', async t => {
  const api = mockApi(t), request = translateApiBlocks(options(longBlocks()));
  const rejected=assert.rejects(within(request), error => /补译后仍不完整/.test(error.message) && error.usage.total_tokens===30);
  api.calls[0].token('{"wrong":"错误编号"}'); api.calls[0].finish({prompt_tokens:10,completion_tokens:5,total_tokens:15});
  await waitCalls(api,3);
  assert(!api.calls[1].signal.aborted);
  api.calls[2].token('{}');api.calls[2].finish({prompt_tokens:10,completion_tokens:5,total_tokens:15});
  await rejected;
  assert.equal(api.calls.length, 3);assert(api.calls[1].signal.aborted);assert.equal(api.active,0);
});

test('保护标记损坏的段落必须补译，不能把不安全结果当作成功', async t => {
  const api=mockApi(t),block={id:'1',text:'Use ⟪QY_KEEP_0⟫ now.'},request=translateApiBlocks(options([block]));
  api.calls[0].token('{"1":"立即使用。"}');api.calls[0].finish();
  await waitCalls(api,2);
  api.calls[1].token('{"1":"立即使用 ⟪QY_KEEP_0⟫。"}');api.calls[1].finish();
  assert.equal(JSON.parse((await request).text)['1'],'立即使用 ⟪QY_KEEP_0⟫。');
});

test('补译期间用户取消会停止请求，不继续恢复', async t => {
  const api=mockApi(t),controller=new AbortController();
  const request=translateApiBlocks({...options([{id:'1',text:'Example.'}]),signal:controller.signal});
  const rejected=assert.rejects(within(request), /用户取消/);
  api.calls[0].token('{}');api.calls[0].finish();await waitCalls(api,2);
  controller.abort(new DOMException('用户取消','AbortError'));await rejected;
  assert.equal(api.calls.length,2);assert.equal(api.active,0);
});

test('外部取消中止两路；预先取消不发起请求', async t => {
  const api = mockApi(t), controller = new AbortController();
  const request = translateApiBlocks({ ...options(longBlocks()), signal: controller.signal });
  const reason = new DOMException('用户取消', 'AbortError'); controller.abort(reason);
  await assert.rejects(within(request), error => error === reason);
  assert.equal(api.calls.length, 2);
  assert(api.calls.every(call => call.signal.aborted));
  assert.equal(api.active, 0);
  await assert.rejects(translateApiBlocks({ ...options(longBlocks()), signal: controller.signal }), error => error === reason);
  assert.equal(api.calls.length, 2);
});

test('另一条流失败时不等待已读完流的受阻显示回调', async t => {
  const api = mockApi(t), paintStarted = deferred(), releasePaint = deferred();
  const request = translateApiBlocks({ ...options(longBlocks()), onProgress: () => { paintStarted.resolve(); return releasePaint.promise; } });
  const [left, right] = api.calls;
  left.token(JSON.stringify(translations(left))); left.finish();
  try {
    await within(paintStarted.promise);
    const failure = new Error('right lane failed'); right.fail(failure);
    await assert.rejects(within(request), error => error === failure);
    assert.equal(api.calls.length, 2);
    assert.equal(api.active, 0);
  } finally { releasePaint.resolve(); await request.catch(() => {}); }
});

test('外部取消不等待已读完流的最终显示回调', async t => {
  const api = mockApi(t), paintStarted = deferred(), releasePaint = deferred(), controller = new AbortController();
  const request = translateApiBlocks({ ...options([{ id: '8', text: 'A short sentence.' }]), signal: controller.signal,
    onProgress: () => { paintStarted.resolve(); return releasePaint.promise; } });
  api.calls[0].token(JSON.stringify(translations(api.calls[0]))); api.calls[0].finish();
  try {
    await within(paintStarted.promise);
    const reason = new DOMException('用户取消', 'AbortError'); controller.abort(reason);
    await assert.rejects(within(request), error => error === reason);
    assert.equal(api.calls.length, 1);
    assert.equal(api.active, 0);
  } finally { releasePaint.resolve(); await request.catch(() => {}); }
});

test('末尾字符串未闭合时保留完整段落，只补译残缺的末段', async t => {
  const api=mockApi(t),blocks=[{id:'1',text:'First.'},{id:'2',text:'By 1998, a program could translate betwe'}];
  const request=translateApiBlocks(options(blocks));
  api.calls[0].token('{"1":"第一段。","2":"未闭合译文}');api.calls[0].finish();
  await waitCalls(api,2);assert.deepEqual(api.calls[1].blocks,[blocks[1]]);
  api.calls[1].token('{"2":"第二段。"}');api.calls[1].finish();
  assert.deepEqual(JSON.parse((await request).text),{'1':'第一段。','2':'第二段。'});
});
