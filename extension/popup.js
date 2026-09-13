import { CHAT_ORIGIN, CHAT_PATTERN, LANGUAGES } from './lib/core.js';

const $ = id => document.getElementById(id);
const API_PATTERN = 'https://api.deepseek.com/*';
let view;
let selectedChat;
let polling;
let loadSequence = 0;
const notify = (message, error = false) => { $('toast').textContent = message; $('toast').className = `toast${error ? ' error' : ''}`; $('toast').hidden = false; };
const api = async (type, extra = {}) => {
  const result = await chrome.runtime.sendMessage({ channel: 'qy-panel', type, ...extra });
  if (!result?.ok) throw new Error(result?.message || '插件后台暂不可用，请重新加载扩展');
  return result.data;
};
const action = (id, fn) => $(id).addEventListener('click', async () => {
  $(id).disabled = true;
  try { await fn(); } catch (error) { notify(error.message, true); }
  finally { $(id).disabled = false; }
});
for (const language of LANGUAGES) { const option = document.createElement('option'); option.value = language; option.textContent = language; $('language').append(option); }

function listRow(text, label, handler) {
  const row = document.createElement('div'); row.className = 'list-row';
  const span = document.createElement('span'); span.textContent = text;
  const button = document.createElement('button'); button.className = 'text-button'; button.textContent = label;
  button.addEventListener('click', async () => { try { button.disabled = true; await handler(); } catch (e) { notify(e.message, true); } finally { button.disabled = false; } });
  row.append(span, button); return row;
}
function renderLists() {
  $('permissions-list').replaceChildren();
  for (const origin of view.permissions.origins || []) $('permissions-list').append(listRow(origin, '撤销', async () => {
    await chrome.permissions.remove({ origins: [origin] });
    await api('SYNC_PERMISSIONS'); await load(); notify('已撤销该授权。其他覆盖此网站的授权可能仍然有效。');
  }));
  $('disabled-list').replaceChildren();
  for (const origin of view.settings.disabledSites) $('disabled-list').append(listRow(origin, '恢复', async () => {
    await save({ disabledSites: view.settings.disabledSites.filter(x => x !== origin) });
  }));
}
function render(nextView) {
  view = nextView;
  for (const key of ['enabled', 'selectionButton', 'cache']) $(key).checked = view.settings[key];
  $('provider').value = view.settings.provider || 'web';
  $('api-settings').hidden = view.settings.provider !== 'api';
  $('web-settings').hidden = view.settings.provider === 'api';
  $('key-state').textContent = view.apiConfigured ? 'Key 已保存在本机（不回显）' : '尚未保存 Key';
  $('delete-key').disabled = !view.apiConfigured;
  $('translate-page').disabled = !view.current.supported || !view.settings.enabled;
  $('translate-page-all').disabled = !view.current.supported || !view.settings.enabled;
  if (document.activeElement !== $('custom-terms')) $('custom-terms').value = (view.settings.customTerms || []).join('\n');
  $('language').value = view.settings.language; $('timeout').value = String(view.settings.timeout);
  $('prefetchScreens').value = String(view.settings.prefetchScreens ?? 2);
  $('shortcut-value').textContent = view.shortcut || '未设置';
  $('site-origin').textContent = view.current.origin ? new URL(view.current.origin).host : '此页面暂不支持';
  $('site-mode').value = view.settings.siteModes?.[view.current.origin] || 'smart';
  $('site-mode').disabled = !view.current.supported;
  $('site-origin').title = view.current.origin || '';
  $('disable-site').disabled = !view.current.supported;
  $('disable-site').checked = view.settings.disabledSites.includes(view.current.origin);
  $('grant-site').disabled = !view.current.supported;
  $('grant-site').children[1].textContent = '在此网站启用划选按钮';
  const renderedView = view;
  const permission = view.current.origin ? chrome.permissions.contains({ origins: [`${view.current.origin}/*`] }) : Promise.resolve(false);
  void permission.catch(() => false).then(permitted => {
    if (view !== renderedView) return;
    $('grant-site').disabled = !view.current.supported || permitted;
    $('grant-site').children[1].textContent = permitted ? '此网站已获得划选按钮授权' : '在此网站启用划选按钮';
  });
  $('site-hint').textContent = !view.current.supported ? '请在普通网页上打开面板。内部页和 PDF 暂不支持。' : '跨网站嵌入内容首次翻译时，Chrome 可能请求该嵌入网站的权限。';
  const busy = !!view.status?.job && ['waiting', 'streaming'].includes(view.status.job.status);
  const state = !view.binding ? '未连接' : view.status?.checking ? '检查中' : view.status?.ready ? '已就绪' : busy ? '忙碌' : '需要处理';
  $('connection-status').textContent = state;
  $('status-dot').className = `status-dot ${state === '已就绪' ? 'ready' : ['检查中', '忙碌'].includes(state) ? 'busy' : state === '需要处理' ? 'error' : ''}`;
  const selectedModes = view.status?.mode?.split('|').filter(x => x.endsWith(':true')).map(x => x.slice(0, -5));
  $('connection-detail').textContent = !view.binding ? '连接已登录的专用标签页，即可开始翻译。' : view.status?.checking ? '面板已打开，正在后台检查连接…' : view.status?.ready ? (selectedModes?.length ? `已连接。建议在专用页关闭${selectedModes.join('、')}，减少翻译等待。` : '已连接专用页。返回网页，选中一段文字试试。') : view.status?.message || '正在翻译，请稍候…';
  $('connect').textContent = view.binding ? '更换 ↗' : '连接 ↗';
  $('connected-actions').hidden = !view.binding;
  renderLists();
  if (view.testResult) {
    $('test-result').hidden = false;
    $('test-result').textContent = [view.testResult.message, view.testResult.text].filter(Boolean).join('\n');
    if (['success', 'error', 'cancelled'].includes(view.testResult.status)) { clearInterval(polling); polling = null; }
  }
}
async function load() {
  const sequence = ++loadSequence, nextView = await api('GET_PANEL');
  if (sequence === loadSequence) render(nextView);
}
async function openImmediately() {
  const sequence = ++loadSequence, nextView = await api('GET_PANEL_FAST');
  if (sequence !== loadSequence) return;
  render(nextView);
  document.body.removeAttribute('aria-busy');
  void load().catch(error => notify(`状态刷新失败：${error.message}`, true));
}
async function save(patch) {
  await api('SET_SETTINGS', { patch });
  await load(); notify('设置已保存');
}
for (const key of ['enabled', 'selectionButton', 'cache', 'language', 'provider', 'timeout', 'prefetchScreens']) $(key).addEventListener('change', async () => {
  const value = ['language', 'provider'].includes(key) ? $(key).value : ['timeout', 'prefetchScreens'].includes(key) ? Number($(key).value) : $(key).checked;
  try { await save({ [key]: value }); } catch (e) { notify(`保存失败：${e.message}`, true); await load().catch(() => {}); }
});
$('disable-site').addEventListener('change', async () => {
  if (!view.current.origin) return;
  const disabledSites = new Set(view.settings.disabledSites);
  if ($('disable-site').checked) disabledSites.add(view.current.origin); else disabledSites.delete(view.current.origin);
  try { await save({ disabledSites: [...disabledSites] }); } catch (e) { notify(`保存失败：${e.message}`, true); await load().catch(() => {}); }
});
async function scan() {
  const tabs = await api('LIST_CHAT');
  $('chat-tabs').replaceChildren();
  selectedChat = undefined;
  $('confirm-dedicated').checked = false;
  if (!tabs.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = '还没有打开 DeepSeek，请先新建专用会话并登录。'; $('chat-tabs').append(p); return; }
  const select = document.createElement('select'); select.setAttribute('aria-label', '选择 DeepSeek 标签页');
  for (const tab of tabs) { const option = document.createElement('option'); option.value = String(tab.id); option.textContent = `${tab.title}${tab.unavailable ? '（需恢复）' : ''}`; select.append(option); }
  selectedChat = tabs[0].id;
  select.addEventListener('change', () => { selectedChat = Number(select.value); $('confirm-dedicated').checked = false; });
  $('chat-tabs').append(select);
}
action('connect', async () => {
  // Permission requests are invoked directly from a user gesture, before any await.
  const granted = await chrome.permissions.request({ origins: [CHAT_PATTERN] });
  if (!granted) throw new Error('未授权 DeepSeek。可稍后点击连接重新授权。');
  $('connect-flow').hidden = false; await scan();
});
action('rescan', scan);
action('bind', async () => {
  if (!selectedChat) throw new Error('请先打开并选择一个 DeepSeek 标签页');
  if (!$('confirm-dedicated').checked) throw new Error('请确认将所选会话用于翻译');
  await api('BIND', { tabId: selectedChat }); $('connect-flow').hidden = true; await load(); notify('连接成功，返回原网页即可翻译');
});
action('new-chat', () => api('OPEN_CHAT', { fresh: true }));
action('visit', () => api('OPEN_CHAT'));
action('refresh', async () => { await load(); notify(view.status?.ready ? '连接已就绪' : view.status?.message || '请先连接 DeepSeek', !view.status?.ready); });
action('unbind', async () => { await api('UNBIND'); await load(); notify('已断开连接并清除临时译文'); });
action('grant-site', async () => {
  const origin = view?.current.origin;
  if (!origin) throw new Error('此页面暂不支持划选翻译');
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) throw new Error('未授予长期权限，仍可使用右键菜单或快捷键');
  await api('SYNC_PERMISSIONS');
  await chrome.scripting.executeScript({ target: { tabId: view.current.id }, files: ['lib/text-rules.js', 'source.js'] });
  await load(); notify('此网站已授权；选中文字后即可看到「译」按钮');
});
action('grant-all', async () => {
  const granted = await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
  if (!granted) throw new Error('未授予所有网站权限，现有站点授权仍保留');
  await api('SYNC_PERMISSIONS'); await load(); notify('已授权普通网站；已打开的其他网页刷新后生效');
});
action('shortcuts', () => api('SHORTCUTS'));
action('clear', async () => { await api('CLEAR'); $('test-result').hidden = true; clearInterval(polling); await load(); notify('临时数据已清除；不会删除 DeepSeek 聊天记录'); });
action('reset', () => $('reset-dialog').showModal());
action('reset-cancel', () => $('reset-dialog').close());
action('reset-confirm', async () => { await api('RESET'); $('reset-dialog').close(); await load(); notify('已恢复默认设置，浏览器权限保持不变'); });
action('test', async () => {
  await api('TEST'); $('test-result').hidden = false; $('test-result').textContent = '正在发送固定测试文本…';
  clearInterval(polling); polling = setInterval(() => load().catch(e => { clearInterval(polling); notify(e.message, true); }), 1000);
});
window.addEventListener('pagehide', () => clearInterval(polling));
openImmediately().catch(error => {
  document.body.removeAttribute('aria-busy');
  notify(`请从已加载的 Chrome 扩展打开此面板。${error.message}`, true);
});

action('save-key', async () => {
  const granted = await chrome.permissions.request({ origins: [API_PATTERN] });
  if (!granted) throw new Error('需要授权 DeepSeek API 域名才能使用 Key 翻译');
  try { await api('SET_KEY', { key: $('api-key').value }); }
  finally { $('api-key').value = ''; }
  await load(); notify('Key 已保存，可返回网页翻译');
});
action('delete-key', async () => { await api('DELETE_KEY'); $('api-key').value = ''; await load(); notify('本机保存的 Key 已删除'); });
async function translatePage(scope) {
  const origins = (view.current.frameOrigins || []).map(origin => `${origin}/*`);
  const framesGranted = !origins.length || await chrome.permissions.request({ origins });
  await api('PAGE', { scope });
  if (framesGranted) window.close();
  else notify('已翻译主页面；嵌入页面未授权，因此其中内容保持原样。', true);
}
action('translate-page', () => translatePage('smart'));
action('translate-page-all', () => translatePage('all'));
action('export-metrics', async () => {
  const data = await api('METRICS');
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), currency: 'USD', tariffCheckedAt: '2026-09-10', pricingSource: 'https://api-docs.deepseek.com/quick_start/pricing/', records: data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'qingyi-usage.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});

action('save-terms', async () => {
  const customTerms = [...new Set($('custom-terms').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
  if (customTerms.length > 200 || customTerms.some(x => x.length > 80)) throw new Error('最多 200 个术语，每个不超过 80 字符');
  await save({ customTerms }); notify('保留术语已保存，重新开启页面翻译后生效');
});

$('site-mode').addEventListener('change', async () => {
  try { await save({ siteModes: { ...view.settings.siteModes, [view.current.origin]: $('site-mode').value } }); notify('本网站翻译范围已保存，重新开启页面翻译后生效'); } catch (error) { notify(error.message, true); }
});
