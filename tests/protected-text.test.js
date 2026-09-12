import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/lib/text-rules.js';
const fragments = globalThis.QYTextRules.proseFragments;
const remaining=text=>fragments(text).map(r=>text.slice(r.start,r.end)).join('');
test('API 路径、HTTP 方法和代码不进入翻译输入',()=>{
  const paths=['/api/v1/me','/api/v1/me/blocked','/api/v1/me/friends','/api/v1/me/karma','/api/v1/me/prefs','/api/v1/me/trophies','/prefs/blocked','/prefs/friends','/prefs/messaging','/prefs/trusted','/prefs/','/prefs/{where}'];
  for(const path of paths){assert.equal(remaining(path),'',path);assert.equal(remaining('GET '+path),'',path);}
  for(const value of ['HTTP GET方法','GET方法','<code>show</code>','HTTP GET method','GET','POST /api/v1/me','show()','const value = 1;','{"show": true}','https://www.reddit.com/dev/api/#GET_api_v1_me','C:\\Users\\sample\\app.js','../src/index.js'])assert.equal(remaining(value),'',value);
});
test('正文仍翻译，混排路径与方法保留，普通 get 不当作 HTTP 方法',()=>{
  assert.equal(remaining('Use GET /api/v1/me to view your account.'),'Use  to view your account.');
  assert.equal(remaining('Call `show()` to display the result.'),'Call  to display the result.');
  assert.equal(remaining('You can get a response.'),'You can get a response.');
  assert.equal(remaining('使用 HTTP GET方法 请求用户信息。'),'使用  请求用户信息。');
});

test('敏感信息和乱码过滤，普通正文不误杀', () => {
  const { isSensitive, isGarbage } = globalThis.QYTextRules;
  for (const text of ['password: demo-only', 'API key = demo-only', '密码：示例内容', 'Bearer exampleToken1234', 'sk-' + 'example'.repeat(5), 'eyJhbGciOi.testPayload.testSignature', '-----BEGIN PRIVATE KEY-----', 'DemoOnly123!Abc']) assert(isSensitive(text), text);
  for (const text of ['The password can be changed in settings.', 'Use the API to get a response.', 'This example explains authentication.', '请修改密码。']) assert(!isSensitive(text), text);
  for (const text of ['��� broken', 'Ã¤Ã¶Ã¼', 'a9'.repeat(20), '550e8400-e29b-41d4-a716-446655440000', 'xY7qP2zK9mN4tR8vB6dF3cH1']) assert(isGarbage(text), text);
  for (const text of ['Accessibility and internationalization', 'Version 2.3.0 supports streaming.', '可以正常翻译中文和 English.']) assert(!isGarbage(text), text);
});
test('内置与自定义术语原样保留，只提取周围正文', () => {
  assert.equal(remaining('Use React and GraphQL with an API.'), 'Use  and  with an ');
  const text = 'Install Acme+ and read the guide.';
  assert.equal(fragments(text, 0, text.length, ['Acme+']).map(r => text.slice(r.start, r.end)).join(''), 'Install  and read the guide.');
  assert.equal(remaining('The rest of the model can change.'), 'The rest of the model can change.');
});

test('常见代码、命令和标识符保留，中文紧邻术语不影响匹配', () => {
  for (const text of ['npm install package', 'git clone https://example.com/repo', 'def show(value):', 'result = show(value)', 'import example', 'getUserById', 'access_token']) assert.equal(remaining(text), '', text);
  assert.equal(remaining('使用React构建应用'), '使用构建应用');
});
test('目标语言识别保守处理简繁差异和混合正文', () => {
  const match=globalThis.QYTextRules.alreadyTarget;
  assert(match('这是已经翻译的网页内容。','简体中文','en'));
  assert(!match('這是已經翻譯的網頁內容。','简体中文','zh-TW'));
  assert(match('這是已經翻譯的網頁內容。','繁體中文','en'));
  assert(!match('这是 Read more 的说明','简体中文','zh-CN'));
  assert(match('Read more','English',''));
  assert(!match('Bonjour tout le monde','English','en'));
  assert(match('This is the content of your page.','English','en'));
  assert(match('これは日本語の文章です。','日本語',''));
  assert(!match('これは English の文章です。','日本語','ja'));
  assert(match('이것은 한국어입니다.','한국어',''));
  assert(!match('中文内容','繁體中文',''));
});
