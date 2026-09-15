import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import '../extension/lib/text-rules.js';

const source = readFileSync(new URL('../extension/source.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const code = section('  function proseFragments(', '  function sensitiveArea(')
  + section('  function splitFragments(', '  const terminal =')
  + section('  function originalUnchanged(', '  function updatePageStats(')
  + section('  async function translateVisible(', '  async function wholePage(');

// Only DOM split/replace primitives are mocked; grouping, guards and page dispatch use source.js.
class TextNode {
  constructor(text, parent = null) { this.textContent = text; this.parentElement = parent; this.nodeType = 3; this.dataset = {}; }
  get length() { return this.textContent.length; }
  get isConnected() { return !!this.parentElement?.isConnected; }
  splitText(offset) {
    assert(offset >= 0 && offset <= this.length);
    const next = new TextNode(this.textContent.slice(offset), this.parentElement);
    this.textContent = this.textContent.slice(0, offset);
    if (this.parentElement) this.parentElement.childNodes.splice(this.parentElement.childNodes.indexOf(this) + 1, 0, next);
    return next;
  }
  replaceWith(next) {
    const parent = this.parentElement;
    parent.childNodes.splice(parent.childNodes.indexOf(this), 1, next);
    next.parentElement = parent; this.parentElement = null;
  }
}
function harness(text) {
  const parent = { isConnected: true, childNodes: [], get textContent() { return this.childNodes.map(node => node.textContent).join(''); } };
  const node = new TextNode(text, parent); parent.childNodes.push(node);
  const requests = [], run = { cancelled: false, done: false, busy: false, groups: new Map(), total: 0, count: 0, characters: 0,
    provider: 'api', language: '简体中文', startedAt: 0, activeMs: 0, inputTokens: 0, outputTokens: 0, usd: 0, usageKnown: true };
  const restoreCard = card => { if (card.node.isConnected) card.node.replaceWith(card.original); };
  let api;
  const context = { QYTextRules: globalThis.QYTextRules, settings: { enabled: true, provider: 'api', language: '简体中文', customTerms: [], prefetchScreens: 0 },
    pageRun: run, presentationEpoch: 0, performance, host: { dataset: {} }, bar: {},
    makeReplacement: original => {
      const output = new TextNode(''); original.replaceWith(output);
      return { node: output, output, original };
    },
    restoreCard, skipNode:()=>false, pageExcluded:()=>false, getComputedStyle:()=>({}), showBar() {}, showPageState() {}, updatePageStats() {}, disconnectPage() {}, queueIndex() {}, visibleNodes: () => true,
    collectVisible: () => node.isConnected ? api.groupsFor(node, '') : [],
    request: ({ blocks }) => {
      requests.push(blocks);
      const result = Object.fromEntries(blocks.map(block => [block.id, `使用 ${block.text.match(/⟪QY_KEEP_\d+⟫/g).join(' 和 ')}。`]));
      return { id: 'test-request', promise: Promise.resolve({ status: 'success', text: JSON.stringify(result), estimatedUsd: 0 }) };
    }
  };
  api = vm.runInNewContext(code + ';({groupsFor,addBlocks,displayBlocks,translateVisible});', context);
  return { ...api, node, parent, run, requests, restoreCard };
}
function blocksFor(h, groups) {
  let id = 0; groups.forEach(group => h.addBlocks(group, () => id++));
  return groups.flatMap(group => group.blocks);
}

test('从路径中间选到 JSON 后的正文，不把路径后缀送入翻译或改写路径', () => {
  const original = 'Use /api/v1/account with JSON output.', h = harness(original);
  const groups = h.groupsFor(h.node, '', original.indexOf('account'), original.length);
  assert.deepEqual(Array.from(groups, group => group.text), ['with', 'output.']);
  assert.equal(h.parent.textContent, original);
  const batch = blocksFor(h, groups);
  h.displayBlocks({ selection: true, epoch: 0 }, batch, { 0: '与', 1: '输出。' }, 'success');
  assert.equal(h.parent.textContent, 'Use /api/v1/account 与 JSON 输出。');
  groups.forEach(group => h.restoreCard(group.card));
  assert.equal(h.parent.textContent, original);
});

test('完整技术混排选区保持一个单元，翻译和恢复都保留选区前后的原文', () => {
  const sentence = 'Use GET /api/v1/me and inspect JSON output.';
  const before = 'Before: ', after = ' After.', original = before + sentence + after, h = harness(original);
  const groups = h.groupsFor(h.node, '', before.length, before.length + sentence.length);
  assert.equal(groups.length, 1);
  const group = groups[0];
  assert.equal(group.originals[0], sentence);
  assert.deepEqual(Array.from(group.protectedTokens, token => token.value), ['GET /api/v1/me', 'JSON']);
  assert(!group.text.includes('/api/v1/me'));
  const batch = blocksFor(h, groups);
  h.displayBlocks({ selection: true, epoch: 0 }, batch, { 0: '使用 ⟪QY_KEEP_0⟫ 并查看 ⟪QY_KEEP_1⟫ 输出。' }, 'success');
  assert.equal(h.parent.textContent, before + '使用 GET /api/v1/me 并查看 JSON 输出。' + after);
  h.restoreCard(group.card);
  assert.equal(h.parent.textContent, original);
});

test('已发现但待发送的段落原始路径变化后，实际页面流程重建 token 而不恢复旧路径', async () => {
  const h = harness('Use /old/path with JSON.'), previous = h.groupsFor(h.node, '')[0];
  previous.blocks = [{ id: '0', text: previous.text, context: '', group: previous, status: 'pending', output: '' }];
  h.run.groups.set(h.node, previous); h.run.total = 1; h.run.characters = previous.text.length;
  h.node.textContent = 'Use /new/path with JSON.';
  await h.translateVisible(h.run);
  assert.equal(h.requests.length, 1);
  assert.equal(h.run.count, 1);
  assert.notEqual(h.run.groups.get(h.node), previous);
  assert.equal(h.parent.textContent, '使用 /new/path 和 JSON。');
  assert.equal(h.run.paused, undefined);
});
