import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../extension/source.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  function skipNode('), source.indexOf('  function contextFor('));

function functions(closest, siteModes = {}) {
  const parent = { closest };
  const context = {
    excluded: 'code,pre,kbd,input,textarea,[contenteditable="true"]',
    settings: { language: '简体中文', customTerms: [], siteModes },
    location: { origin: 'https://example.com', hostname: 'example.com' },
    sensitiveArea: () => false,
    isSensitive: () => false,
    isGarbage: () => false,
    getComputedStyle: () => ({ fontFamily: 'Arial' }),
    QYTextRules: { alreadyTarget: () => false }
  };
  const api = vm.runInNewContext(code + ';({skipNode,pageExcluded});', context);
  return { ...api, node: { parentElement: parent, textContent: 'Ordinary English copy' } };
}

test('全部可读内容仅覆盖网页误标，代码保护仍不可绕过', () => {
  const marked = functions(selector => selector === '[translate="no"],.notranslate');
  assert.equal(marked.skipNode(marked.node), true);
  assert.equal(marked.skipNode(marked.node, true), false);

  const code = functions(selector => selector === 'code,pre,kbd,input,textarea,[contenteditable="true"]');
  assert.equal(code.skipNode(code.node, true), true);
});

test('全部可读内容为默认范围，明确选择正文优先时才跳过导航', () => {
  const nav = functions(selector => selector.startsWith('nav,aside,footer'), { 'https://example.com': 'smart' });
  assert.equal(nav.pageExcluded(nav.node, { scope: 'smart' }), true);
  assert.equal(nav.pageExcluded(nav.node, { scope: 'all' }), false);
  const defaultAll = functions(selector => selector.startsWith('nav,aside,footer'));
  assert.equal(defaultAll.pageExcluded(defaultAll.node, { scope: 'smart' }), false);
});

test('整页翻译只使用右侧贴边操作条，不再显示底部进度框', () => {
  assert.match(source, /\.page-launch\{[^}]*position:fixed;[^}]*right:0;/);
  const pageFlow = source.slice(source.indexOf('  async function translateVisible('), source.indexOf('  resume.onclick'));
  assert.doesNotMatch(pageFlow, /showBar\(/);
  assert.match(pageFlow, /showPageState\(/);
});
