import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../extension/source.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('  function partialTranslations('), source.indexOf('  function originalUnchanged('));
const parse=vm.runInNewContext(fn+'; partialTranslations;');
test('页面 JSON 流仅显示对应译文，支持部分字符串、转义与 Unicode',()=>{
  const result=text=>JSON.parse(JSON.stringify(parse(text,['0','1'])));
  assert.deepEqual(result('{"0":"绿色译'),{'0':'绿色译'});
  assert.deepEqual(result('{"0":"第一段","1":"第二'),{'0':'第一段','1':'第二'});
  assert.deepEqual(result('```json\n{"0":"a\\nb\\"c\\u4f60\\u597'),{'0':'a\nb"c你'});
  assert.deepEqual(result('{"0":"x\\uD83D'),{'0':'x'});
  assert.deepEqual(result('{"0":"x\\uD83D\\uDE00"}'),{'0':'x😀'});
  assert.deepEqual(result('{"unrequested":"ignore","0":"ok"}'),{'0':'ok'});
  assert.deepEqual(result('some prose {"0":"wrong"}'),{});
});
