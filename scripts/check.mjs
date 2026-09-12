import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert(!manifest.permissions.some(p => ['tabs', 'cookies', 'webRequest', 'debugger'].includes(p)));
assert(!manifest.host_permissions && !manifest.externally_connectable);
for (const path of [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons)]) assert(existsSync(join('extension', path)), `Missing ${path}`);
function check(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) check(path);
    else if (entry.name.endsWith('.js')) {
      execFileSync(process.execPath, ['--check', path]);
      const source = readFileSync(path, 'utf8');
      if (/\bfetch\s*\(/.test(source)) assert(path === 'extension/lib/api.js', `Unexpected network use in ${path}`);
      assert(!/\b(innerHTML|outerHTML)\s*=|\beval\s*\(|\bnew Function\s*\(|XMLHttpRequest|document\.cookie/.test(source), `Unexpected unsafe sink/network use in ${path}`);
    }
  }
}
check('extension');
const html = readFileSync('extension/popup.html', 'utf8');
const js = readFileSync('extension/popup.js', 'utf8');
for (const match of js.matchAll(/\$\('([^']+)'\)/g)) assert(html.includes(`id="${match[1]}"`), `Missing popup element ${match[1]}`);
console.log('快速检查通过：Manifest、文件引用、JavaScript 语法、面板元素、安全输出与权限范围。');
