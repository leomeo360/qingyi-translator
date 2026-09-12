import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, queueDeadline } from '../extension/lib/core.js';

test('前任务尚余 60 秒时，新任务有 90 秒排队期限', () => {
  const now = 100000, task = { id: 'next', timeout: 120 };
  assert.equal(queueDeadline([task], task, { deadline: now + 60000 }, now), now + 90000);
});

test('只累计前置队列超时，缺省超时按 60 秒计算', () => {
  const now = 100000, task = { id: 'target', timeout: 120 };
  const queue = [{ id: 'first', timeout: 30 }, { id: 'default' }, task, { id: 'later', timeout: 120 }];
  assert.equal(queueDeadline(queue, task, { deadline: now + 20000 }, now), now + 140000);
});

test('空闲或前任务已过期时，首个排队任务仍有 30 秒', () => {
  const now = 100000, task = { id: 'first' };
  assert.equal(queueDeadline([task], task, null, now), now + 30000);
  assert.equal(queueDeadline([task], task, { deadline: now - 10000 }, now), now + 30000);
});

test('划选优先且同级稳定，同页替换仍受三个待发送任务限制', () => {
  const first = { id: 'page-1', tabId: 1, kind: 'page' };
  const second = { id: 'page-2', tabId: 2, kind: 'page' };
  const selected = { id: 'selection-1', tabId: 3, kind: 'selection' };
  const prioritized = enqueue([first, second], selected);
  assert.deepEqual(prioritized.queue.map(t => t.id), ['selection-1', 'page-1', 'page-2']);
  const replacement = { id: 'selection-2', tabId: 1, kind: 'selection' };
  const replaced = enqueue(prioritized.queue, replacement);
  assert.deepEqual(replaced.queue.map(t => t.id), ['selection-1', 'selection-2', 'page-2']);
  assert.deepEqual(replaced.replaced, [first]);
  assert.throws(() => enqueue(replaced.queue, { id: 'fourth', tabId: 4, kind: 'selection' }), /稍后重试/);
});
