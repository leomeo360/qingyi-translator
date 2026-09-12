import { CHAT_ORIGIN, CHAT_PATTERN, DEFAULTS, LANGUAGES, MESSAGES, TERMINAL, originOf, supported, selectionText, settingsFrom, promptFor, cacheKey, pruneCache, enqueue, matchesSource, pageBlocks, blocksPrompt, parseBlocks, isSensitive, isGarbage, planBlocks, expandedOutput, blockIdentity, queueDeadline } from './lib/core.js';
import { API_ORIGIN, API_MODEL, translateApi } from './lib/api.js';
import { translateApiBlocks } from './lib/api-batch.js';

let apiController;
const emptyState = () => ({ binding: null, active: null, queue: [], cache: [], sources: {}, epoch: 0, notice: '', metrics: [] });
let state;
let settings;
let chain = Promise.resolve();
let deadlineTimer;
const serial = fn => { const result = chain.then(fn); chain = result.catch(() => {}); return result; };
const save = () => chrome.storage.session.set({ runtime: state });
const tabMessage = (tabId, message, documentId) => chrome.tabs.sendMessage(tabId, message, documentId ? { documentId } : { frameId: 0 });
const sourceKey = (tabId, documentId) => `${tabId}:${documentId}`;
const sourceForTask = task => state.sources[task.sourceKey] || state.sources[task.tabId];
const sameTaskSource = (task, value) => (task.sourceKey || `tab:${task.tabId}`) === (value.sourceKey || `tab:${value.tabId}`);
const popupSender = sender => sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('popup.html');
const safe = promise => promise.catch(() => undefined);

async function init() {
  if (state) return;
  await chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  const [local, session] = await Promise.all([chrome.storage.local.get('settings'), chrome.storage.session.get('runtime')]);
  settings = settingsFrom(local.settings);
  state = { ...emptyState(), ...session.runtime };
  for (const [key, source] of Object.entries(state.sources || {})) {
    if (source.tabId == null && /^\d+$/.test(key)) Object.assign(source, { tabId: Number(key), frameId: 0 });
  }
  state.cache = pruneCache(state.cache);
  // Persisted sending lock is never replayed. The adapter is the submission witness.
  if (state.active?.provider === 'api') await failActive('API 连接已中断；不会自动重发，请手动重试');
  if (state.active) {
    try {
      const status = await adapter('STATUS');
      if (status.pageId !== state.binding?.pageId) throw new Error('page replaced');
      if (status.job?.id === state.active.id) await applyAdapter(status.job, status);
      else await failActive(MESSAGES.uncertain, true);
    } catch { await failActive(MESSAGES.uncertain, true); }
  }
  await maintain();
}

async function adapter(type, extra = {}, binding = state.binding) {
  if (!binding) throw new Error(MESSAGES.disconnected);
  const tab = await chrome.tabs.get(binding.tabId);
  if (tab.incognito || originOf(tab.url) !== CHAT_ORIGIN) throw new Error('翻译连接已断开，请重新绑定 DeepSeek');
  if (tab.discarded || tab.frozen) throw new Error('请前往 DeepSeek 恢复页面，加载完成后重试');
  return tabMessage(tab.id, { channel: 'qy-adapter', type, ...extra });
}

async function sourceSettings(sender) {
  const origin = originOf(sender.url);
  const permitted = origin && await chrome.permissions.contains({ origins: [`${origin}/*`] });
  return { ...settings, buttonAllowed: !!permitted && settings.enabled && settings.selectionButton && !settings.disabledSites.includes(origin) };
}

async function update(task, patch) {
  Object.assign(task, patch);
  if (patch.output && task.firstTokenMs == null && task.startedAt) task.firstTokenMs = Date.now() - task.startedAt;
  if (TERMINAL.has(task.status) && !task.recorded) {
    task.recorded = true;
    task.durationMs ??= Date.now() - (task.startedAt || task.createdAt);
    state.metrics = [...(state.metrics || []), {
      id: task.id, provider: task.provider || 'web', kind: task.kind || (task.blocks ? 'page' : 'selection'), status: task.status,
      characters: [...task.text].length, cached: !!task.cached, createdAt: task.createdAt, startedAt: task.startedAt || task.createdAt,
      queueMs: task.cached ? 0 : task.startedAt ? Math.max(0, task.startedAt - task.createdAt) : null,
      elapsedMs: Date.now() - task.createdAt, durationMs: task.durationMs, firstTokenMs: task.firstTokenMs ?? null,
      requestCount: task.cached ? 0 : task.requestCount ?? null,
      usage: task.usage || null, estimatedUsd: task.estimatedUsd ?? null, model: task.model || (task.provider === 'api' ? API_MODEL : 'DeepSeek 网页')
    }].slice(-200);
  }
  if (task.test) { state.testResult = { id: task.id, status: task.status, text: expandedOutput(task), message: task.message || MESSAGES[task.status] }; return; }
  const source = sourceForTask(task);
  if (!source || source.instance !== task.instance || source.documentId !== task.documentId) return;
  await safe(tabMessage(task.tabId, { channel: 'qy-source', type: 'RESULT', instance: task.instance, id: task.id, status: task.status, language: task.language, text: expandedOutput(task), message: task.message || MESSAGES[task.status], cached: !!task.cached, durationMs: task.durationMs, firstTokenMs: task.firstTokenMs, usage: task.usage, estimatedUsd: task.estimatedUsd }, task.documentId));
}

function remember(task) {
  if (!settings.cache || task.noCache || task.cancelled || task.epoch !== state.epoch) return;
  const at = Date.now(), text = expandedOutput(task, true);
  const parsed = task.blocks ? parseBlocks(text, task.blocks) : null;
  const entries = task.blocks ? task.blocks.map(b => ({ key: cacheKey(blockIdentity(b), task.language, 'fragment:' + task.mode), text: parsed[b.id], at })) : [{ key: task.key, text, at }];
  const additions = new Map(entries.map(entry => [entry.key, entry]));
  state.cache = pruneCache([...state.cache.filter(c => !additions.has(c.key)), ...additions.values()]);
}
async function cancelQueued(predicate, reason = '已取消') {
  const removed = state.queue.filter(predicate);
  state.queue = state.queue.filter(t => !predicate(t));
  for (const task of removed) await update(task, { status: 'cancelled', message: reason });
}

async function failActive(message, block = false) {
  if (state.active && (!block || state.active.provider !== 'api')) { await update(state.active, { status: 'error', message }); state.active = null; }
  if (block && state.binding) state.binding.blocked = message;
  state.notice = message;
  if (block) await cancelQueued(t => t.provider !== 'api', '连接需要处理，请处理后重新翻译');
  await save();
}

async function cancelActive(message = '已取消；DeepSeek 是否停止仍需确认') {
  const task = state.active;
  if (!task) return;
  if (task.provider === 'api') { apiController?.abort(); await update(task, { status: 'cancelled', message: '已取消 · 部分请求仍可能计费' }); state.active = null; await save(); return; }
  await update(task, { status: 'cancelled', message });
  // Keep a durable lock until a matching terminal reply or a confirmed idle probe.
  task.cancelled = true;
  task.noCache = true;
  task.deadline = Date.now() + 10000;
  await save();
  const result = await safe(adapter('CANCEL', { id: task.id }));
  if (result?.job?.id === task.id) await applyAdapter(result.job, result);
}

async function applyAdapter(job, status) {
  const task = state.active;
  if (!task || task.provider === 'api' || job.id !== task.id || status.pageId !== state.binding?.pageId) return;
  if (status.guard !== state.binding.guard || status.mode !== state.binding.mode) {
    await failActive('翻译页被手动操作或模式已改变，请重新确认绑定', true); return;
  }
  if (status.session !== task.session) {
    if (!task.session.endsWith('/a/chat') && !task.session.endsWith('/')) { await failActive('DeepSeek 会话已被更换，请重新绑定', true); return; }
    if (!/^\/a\/chat\/s\/[\w-]+$/.test(status.session)) { await failActive('无法确认新会话归属，请重新绑定', true); return; }
    // The new URL can arrive before the DOM renders our submitted message.
    // Keep the sending lock until ownership appears; do not adopt or reject early.
    if (!job.owned) {
      if (TERMINAL.has(job.status)) await failActive(job.message || '无法确认新会话归属，请重新绑定', true);
      return;
    }
    task.session = status.session;
    state.binding.session = status.session;
  }
  if (!['waiting', 'streaming', 'success', 'error', 'cancelled'].includes(job.status)) return;
  const output = typeof job.text === 'string' ? job.text.slice(0, 60000) : '';
  if (job.status === 'success' && task.blocks && !task.cancelled) {
    try { parseBlocks(output, task.plan?.remote || task.blocks); }
    catch { await failActive('段落译文格式不完整，请重试'); return; }
  }
  if (!task.cancelled) await update(task, { status: job.status, output, message: typeof job.message === 'string' ? job.message.slice(0, 500) : undefined });
  if (TERMINAL.has(job.status)) {
    if (job.status === 'success' && !task.cancelled && !task.noCache && task.epoch === state.epoch && settings.cache && output) {
      remember(task);
    }
    state.active = null;
    if (!status.ready) {
      state.binding.blocked = status.message || '远端状态未确认，请检查 DeepSeek 后重新绑定';
      await cancelQueued(() => true, '连接需要处理，请处理后重试');
    }
  }
  await save();
}

async function checkBinding() {
  if (!state.binding) throw new Error(MESSAGES.disconnected);
  if (state.binding.blocked) throw new Error(state.binding.blocked);
  const status = await adapter('STATUS');
  const b = state.binding;
  if (status.pageId !== b.pageId || status.session !== b.session || status.guard !== b.guard || status.mode !== b.mode) {
    state.cache = []; state.epoch++;
    b.blocked = '翻译页、会话或模式已改变，请重新确认绑定';
    throw new Error(b.blocked);
  }
  if (!status.ready) throw new Error(status.message || '翻译页正在使用，请处理后重试');
  return status;
}

async function apiReady() {
  if (!await chrome.permissions.contains({ origins: [`${API_ORIGIN}/*`] })) throw new Error('请在设置中授权 DeepSeek API');
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) throw new Error('请先保存 DeepSeek API Key');
  return apiKey;
}
function runApi(task, key) {
  const controller = new AbortController(); apiController = controller;
  const options = { key, signal: controller.signal,
    onProgress: (output, firstTokenMs) => serial(async () => {
      if (state.active?.id !== task.id) return;
      // The sending lock is already durable; streaming paints need no storage round trip.
      await update(task, { status: 'streaming', output, firstTokenMs });
    }) };
  const request = task.blocks
    ? translateApiBlocks({ ...options, blocks: task.plan?.remote || task.blocks, language: task.language })
    : translateApi({ ...options, prompt: promptFor(task.text, task.language, task.id) });
  void request.then(result => serial(async () => {
    if (state.active?.id !== task.id) return;
    Object.assign(task, { usage: result.usage, estimatedUsd: result.estimatedUsd, durationMs: result.durationMs, firstTokenMs: result.firstTokenMs, model: result.model, requestCount: result.requestCount ?? 1 });
    if (task.blocks) parseBlocks(result.text, task.plan?.remote || task.blocks);
    await update(task, { ...result, output: result.text, status: 'success' });
    remember(task);
    state.active = null; await maintain();
  })).catch(error => serial(async () => {
    if (state.active?.id !== task.id) return;
    if (error.requestCount) Object.assign(task, { requestCount: error.requestCount, usage: error.usage, estimatedUsd: error.estimatedUsd });
    await failActive(error.name === 'AbortError' ? 'API 请求已取消或超时' : error.message);
    await maintain();
  }));
}
async function dispatch() {
  if (state.active || !state.queue.length || !settings.enabled) return;
  let apiKey;
  try { if (state.queue[0].provider === 'api') apiKey = await apiReady(); else await checkBinding(); }
  catch (error) {
    state.notice = error.message;
    for (const task of state.queue) await update(task, { status: 'error', message: error.message });
    state.queue = []; await save(); return;
  }
  const task = state.queue.shift();
  if (settings.disabledSites.includes(task.origin)) { await update(task, { status: 'cancelled', message: '此网站已停用翻译' }); await save(); return dispatch(); }
  if (task.kind === 'prefetch' && settings.prefetchScreens === 0) { await update(task, { status: 'cancelled', message: '向下预翻译已关闭' }); await save(); return dispatch(); }
  if (!task.test) {
    const source = sourceForTask(task);
    const alive = source?.instance === task.instance && await safe(tabMessage(task.tabId, { channel: 'qy-source', type: 'PING', instance: task.instance }, task.documentId));
    if (!alive?.ok) { await save(); return dispatch(); }
  }
  if (task.blocks && settings.cache && !task.retry && !task.noCache && task.epoch === state.epoch) {
    task.plan = planBlocks(task.blocks, state.cache, task.language, task.mode);
    if (!task.plan.remote.length) {
      await update(task, { status: 'success', output: '{}', cached: true, estimatedUsd: 0 });
      await save(); return dispatch();
    }
  }
  task.session = task.provider === 'api' ? '' : state.binding.session;
  task.deadline = Date.now() + task.timeout * 1000;
  task.startedAt = Date.now();
  task.status = 'sending';
  state.active = task;
  await save(); // Commit before doing anything with the remote composer.
  await update(task, { status: 'sending' });
  if (task.provider === 'api') { runApi(task, apiKey); return; }
  try {
    const result = await adapter('RUN', { job: { id: task.id, prompt: task.blocks ? blocksPrompt(task.plan?.remote || task.blocks, task.language) : promptFor(task.text, task.language, task.id), session: task.session, pageId: state.binding.pageId, guard: state.binding.guard, mode: state.binding.mode, deadline: task.deadline } });
    if (!result?.ok) throw new Error(result?.message || MESSAGES.uncertain);
  } catch (error) { await failActive(error.message, true); }
  await save();
}

async function maintain() {
  const now = Date.now();
  await cancelQueued(t => now >= (t.expiresAt || t.createdAt + 30000), '排队超时，请重新翻译');
  if (state.active?.provider === 'api' && now >= state.active.deadline) { apiController?.abort(); await failActive('API 等待超时，部分请求可能已计费；请手动重试'); }
  if (state.active && now >= state.active.deadline) {
    const task = state.active;
    if (!task.cancelled) await update(task, { status: 'error', message: '等待超时，DeepSeek 可能仍在生成；部分译文未完成' });
    task.cancelled = true; task.noCache = true;
    const status = await safe(adapter('CANCEL', { id: task.id }));
    if (status?.ready && status.pageId === state.binding?.pageId && status.session === task.session) state.active = null;
    else await failActive('等待超时，DeepSeek 可能仍在生成；请前往检查并重新确认绑定', true);
  }
  await dispatch();
  clearTimeout(deadlineTimer);
  const deadlines = [...state.queue.map(t => t.expiresAt || t.createdAt + 30000), ...(state.active ? [state.active.deadline] : [])];
  if (deadlines.length) {
    const when = Math.max(Date.now() + 100, Math.min(...deadlines));
    chrome.alarms.create('qy-deadline', { when });
    deadlineTimer = setTimeout(() => serial(async () => { await init(); await maintain(); }), when - Date.now());
  } else await chrome.alarms.clear('qy-deadline');
  await save();
}

async function translate(message, sender, test = false) {
  if (!settings.enabled) throw new Error('插件已暂停，请在面板中启用');
  const blocks = message.blocks ? pageBlocks(message.blocks) : null;
  const text = blocks ? JSON.stringify(blocks) : selectionText(message.text);
  if ((blocks || [{ text }]).some(b => isSensitive(b.text) || isGarbage(b.text) || (b.context && (isSensitive(b.context) || isGarbage(b.context))))) throw new Error('检测到敏感信息或乱码，已跳过翻译');
  const origin = test ? null : originOf(sender.tab?.url || sender.url);
  if (!test && (!supported(sender.url) || sender.tab?.incognito)) throw new Error('此页面暂不支持划选翻译');
  if (settings.disabledSites.includes(origin)) throw new Error('此网站已停用翻译');
  if (!test && state.binding?.tabId === sender.tab.id) throw new Error('请在其他网页使用翻译，保留此页作为专用翻译页');
  const currentSourceKey = test ? '' : sourceKey(sender.tab?.id, sender.documentId);
  const source = test ? null : state.sources[currentSourceKey] || (sender.frameId === 0 ? state.sources[sender.tab?.id] : null);
  if (!test && (!source || source.instance !== message.instance || source.documentId !== sender.documentId)) throw new Error('页面已更新，请重新选择文字');
  if (typeof message.id !== 'string' || !/^[a-f0-9-]{36}$/.test(message.id)) throw new Error('无效的任务编号');
  const tabId = test ? -1 : sender.tab.id;
  const kind = message.kind === 'prefetch' ? 'prefetch' : message.kind === 'selection' ? 'selection' : blocks ? 'page' : 'selection';
  if (kind === 'prefetch' && settings.prefetchScreens === 0) throw new Error('向下预翻译已关闭');
  const mode = settings.provider === 'api' ? API_MODEL : 'web:' + (state.binding?.mode || '');
  const key = cacheKey(text, settings.language, mode);
  const existing = [state.active, ...state.queue].find(t => t && t.tabId === tabId && t.instance === message.instance && (t.id === message.id || (!message.retry && t.key === key && !TERMINAL.has(t.status) && !(t.kind === 'prefetch' && kind !== 'prefetch'))));
  if (existing) return { id: existing.id, status: existing.status, text: expandedOutput(existing), language: existing.language };
  const task = { id: message.id, text, blocks, kind, provider: settings.provider, tabId, frameId: test ? 0 : sender.frameId, documentId: sender.documentId, sourceKey: currentSourceKey, instance: message.instance, origin, test, language: settings.language, timeout: settings.timeout, key, mode, retry: !!message.retry, epoch: state.epoch, createdAt: Date.now(), status: 'queued', output: '' };
  const cached = settings.cache && !message.retry && state.cache.find(c => c.key === key && Date.now() - c.at < 1800000);
  if (cached && (settings.provider === 'api' || (state.binding && !state.binding.blocked))) {
    await cancelQueued(t => sameTaskSource(t, task), '已被本页的新翻译替换');
    await update(task, { status: 'success', output: cached.text, cached: true });
    await save();
    return { id: task.id, status: 'success', text: cached.text, language: task.language, cached: true };
  }
  if (blocks) {
    const available = settings.cache && !message.retry && (settings.provider === 'api' || (state.binding && !state.binding.blocked));
    task.plan = planBlocks(blocks, available ? state.cache : [], task.language, mode);
    if (!task.plan.remote.length) {
      await cancelQueued(t => sameTaskSource(t, task), '已被本页的新翻译替换');
      await update(task, { status: 'success', output: '{}', cached: true, estimatedUsd: 0 });
      await save();
      return { id: task.id, status: 'success', text: expandedOutput(task, true), language: task.language, cached: true, estimatedUsd: 0 };
    }
  }
  if (settings.provider === 'api') await apiReady();
  else {
    if (!state.binding) throw new Error(MESSAGES.disconnected);
    if (state.binding.blocked) throw new Error(state.binding.blocked);
  }
  const next = enqueue(state.queue, task);
  state.queue = next.queue;
  if (task.provider === 'api' && task.kind !== 'prefetch' && state.active?.provider === 'api' && state.active.kind === 'prefetch') await cancelActive();
  for (const queued of state.queue) queued.expiresAt = Math.max(queued.expiresAt || 0, queueDeadline(state.queue, queued, state.active));
  for (const old of next.replaced) await update(old, { status: 'cancelled', message: sameTaskSource(old, task) ? '已被本页的新翻译替换' : '优先翻译当前可见内容，预翻译已让出队列' });
  await update(task, { status: 'queued' });
  await save();
  // Return acceptance before dispatch; result events retain the caller's request id.
  setTimeout(() => serial(maintain), 0);
  return { id: task.id, status: task.status, text: '', language: task.language };
}

async function syncScripts() {
  const { origins = [] } = await chrome.permissions.getAll();
  const matches = origins.filter(x => !x.startsWith(API_ORIGIN) && ( /^https?:\/\//.test(x) || x === '<all_urls>'));
  await chrome.scripting.unregisterContentScripts({ ids: ['qy-selection'] }).catch(() => {});
  if (matches.length) await chrome.scripting.registerContentScripts([{ id: 'qy-selection', matches, js: ['lib/text-rules.js', 'source.js'], runAt: 'document_idle', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true }]);
  for (const source of Object.values(state.sources)) {
    const sender = { url: source.origin };
    await safe(tabMessage(source.tabId, { channel: 'qy-source', type: 'SETTINGS', settings: await sourceSettings(sender) }, source.documentId));
  }
}

async function updateMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'qy-page', title: '翻译整个网页（替换正文，保留代码）', contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'], enabled: settings.enabled });
  chrome.contextMenus.create({ id: 'qy-page-all', title: '翻译全部可读内容', contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'], enabled: settings.enabled });
  chrome.contextMenus.create({ id: 'qy-translate', title: `翻译为${settings.language}`, contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'], enabled: settings.enabled });
}

async function setSettings(patch) {
  const next = settingsFrom({ ...settings, ...patch });
  await chrome.storage.local.set({ settings: next });
  if (next.provider !== settings.provider) { await cancelQueued(() => true, '翻译方式已更换'); await cancelActive(); }
  settings = next;
  await cancelQueued(t => !settings.enabled || settings.disabledSites.includes(t.origin), '插件或此网站已停用');
  if (settings.prefetchScreens === 0) {
    await cancelQueued(t => t.kind === 'prefetch', '向下预翻译已关闭');
    if (state.active?.provider === 'api' && state.active.kind === 'prefetch') await cancelActive();
  }
  if (!settings.cache) { state.cache = []; state.epoch++; if (state.active) state.active.noCache = true; }
  await Promise.all([updateMenu(), syncScripts()]);
  await save();
  return settings;
}

async function embeddedOrigins(tab) {
  if (!tab?.id || !supported(tab.url)) return [];
  const result = await safe(chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => [...document.querySelectorAll('iframe[src]')].flatMap(frame => {
      const rect = frame.getBoundingClientRect(), style = getComputedStyle(frame);
      if (rect.width < 160 || rect.height < 80 || style.display === 'none' || style.visibility === 'hidden') return [];
      try { const url = new URL(frame.src, location.href); return /^https?:$/.test(url.protocol) ? [url.origin] : []; }
      catch { return []; }
    }).slice(0, 8)
  }));
  const own = originOf(tab.url);
  return [...new Set(result?.[0]?.result || [])].filter(origin => origin !== own && origin !== CHAT_ORIGIN && origin !== API_ORIGIN);
}

async function panel(message) {
  switch (message.type) {
    case 'GET_PANEL': {
      let status = null;
      if (state.binding && settings.provider === 'web') {
        status = await safe(adapter('STATUS'));
        if (!status) status = { ready: false, message: '翻译连接已断开，请前往 DeepSeek 恢复页面' };
        if (state.binding.blocked) status = { ...status, ready: false, message: state.binding.blocked };
        else if (status.pageId !== state.binding.pageId || (!state.active && (status.session !== state.binding.session || status.guard !== state.binding.guard || status.mode !== state.binding.mode))) {
          state.binding.blocked = '会话或页面状态已改变，请重新确认绑定';
          state.cache = []; state.epoch++;
          status = { ...status, ready: false, message: state.binding.blocked };
          await save();
        }
      }
      const [tabs, keyState, commands, permissions] = await Promise.all([chrome.tabs.query({ active: true, currentWindow: true }), chrome.storage.local.get('apiKey'), chrome.commands.getAll(), chrome.permissions.getAll()]);
      const current = tabs[0];
      const origin = originOf(current?.url);
      const frameOrigins = await embeddedOrigins(current);
      return { apiConfigured: !!keyState.apiKey, metrics: state.metrics, settings, binding: state.binding, status, current: { id: current?.id, origin, frameOrigins, supported: supported(current?.url) && !current?.incognito }, shortcut: commands.find(c => c.name === 'translate-selection')?.shortcut || '', permissions, testResult: state.testResult, queueCount: state.queue.length };
    }
    case 'SET_KEY': {
      if (typeof message.key !== 'string' || !/^sk-[a-zA-Z0-9_-]{16,200}$/.test(message.key.trim())) throw new Error('请输入有效的 DeepSeek API Key');
      await chrome.storage.local.set({ apiKey: message.key.trim() }); return {};
    }
    case 'DELETE_KEY':
      if (state.active?.provider === 'api') await cancelActive();
      await cancelQueued(t => t.provider === 'api'); await chrome.storage.local.remove('apiKey'); await save(); return {};
    case 'PAGE': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!supported(tab?.url)) throw new Error('请在普通网页打开扩展面板');
      await trigger(tab, { page: true, scope: message.scope === 'all' ? 'all' : 'smart' }); return {};
    }
    case 'METRICS': return state.metrics;
    case 'SET_SETTINGS': return setSettings(message.patch);
    case 'LIST_CHAT': {
      if (!await chrome.permissions.contains({ origins: [CHAT_PATTERN] })) throw new Error('请先授权 DeepSeek 聊天站点');
      return (await chrome.tabs.query({ url: CHAT_PATTERN })).filter(t => !t.incognito).map(t => ({ id: t.id, title: t.title || 'DeepSeek', url: t.url, unavailable: t.discarded || t.frozen }));
    }
    case 'BIND': {
      if (state.active) throw new Error('当前翻译尚未结束，请取消并确认远端空闲后再更换');
      const tab = await chrome.tabs.get(message.tabId);
      if (originOf(tab.url) !== CHAT_ORIGIN || tab.incognito || tab.discarded || tab.frozen) throw new Error('请先前往 DeepSeek 恢复页面');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['adapter.js'] });
      const status = await adapter('STATUS', {}, { tabId: tab.id });
      if (!status.ready) throw new Error(status.message);
      await cancelQueued(() => true, '翻译连接已更换，请重新翻译');
      state.binding = { tabId: tab.id, pageId: status.pageId, session: status.session, guard: status.guard, mode: status.mode, blocked: '' };
      state.cache = []; state.epoch++; state.notice = '';
      await save();
      return { ...status, message: '已连接，可以返回原网页翻译' };
    }
    case 'OPEN_CHAT': {
      if (message.fresh) {
        const tab = await chrome.tabs.create({ url: CHAT_ORIGIN, active: true });
        return { tabId: tab.id };
      }
      if (state.binding) {
        const tab = await safe(chrome.tabs.get(state.binding.tabId));
        if (tab && originOf(tab.url) === CHAT_ORIGIN) { await chrome.windows.update(tab.windowId, { focused: true }); await chrome.tabs.update(tab.id, { active: true }); return {}; }
      }
      await chrome.tabs.create({ url: CHAT_ORIGIN }); return {};
    }
    case 'UNBIND':
      await cancelQueued(() => true); await cancelActive();
      state.binding = null; state.active = null; state.cache = []; state.epoch++;
      await save(); return {};
    case 'CLEAR':
      state.epoch++; state.cache = []; state.testResult = null; state.metrics = [];
      await cancelQueued(() => true); await cancelActive();
      for (const s of Object.values(state.sources)) await safe(tabMessage(s.tabId, { channel: 'qy-source', type: 'CLEAR' }, s.documentId));
      await save(); return {};
    case 'RESET': await panel({ type: 'CLEAR' }); return setSettings(DEFAULTS);
    case 'SYNC_PERMISSIONS': await syncScripts(); return {};
    case 'TEST': return translate({ id: crypto.randomUUID(), instance: 'test', text: 'Hello, world!', retry: true }, {}, true);
    case 'SHORTCUTS': await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); return {};
    default: throw new Error('不支持的面板操作');
  }
}

async function handle(message, sender) {
  if (!message || typeof message !== 'object' || sender.id !== chrome.runtime.id) throw new Error('无效的消息来源');
  await init();
  if (message.channel === 'qy-panel' && popupSender(sender)) return panel(message);
  if (message.channel === 'qy-adapter-event') {
    if (sender.frameId !== 0 || sender.tab?.id !== state.binding?.tabId || originOf(sender.url) !== CHAT_ORIGIN || message.pageId !== state.binding.pageId) throw new Error('无效的适配消息');
    if (message.type === 'INVALIDATED') {
      await failActive('翻译页被手动操作，请重新确认专用会话', true);
      state.cache = []; state.epoch++; await save();
    } else if (message.type === 'PROGRESS') { await applyAdapter(message.job, message); await maintain(); }
    return {};
  }
  if (message.channel !== 'qy-source' || !sender.documentId || !supported(sender.url) || sender.tab?.incognito) throw new Error('此页面暂不支持划选翻译');
  if (message.type === 'HELLO') {
    if (typeof message.instance !== 'string' || !/^[a-f0-9-]{36}$/.test(message.instance)) throw new Error('无效的页面实例');
    const key = sourceKey(sender.tab.id, sender.documentId);
    const previousEntries = Object.entries(state.sources).filter(([, source]) => source.tabId === sender.tab.id && (source.frameId ?? 0) === sender.frameId && source.documentId !== sender.documentId);
    if (previousEntries.length) {
      const staleKeys = new Set(previousEntries.map(([entry]) => entry));
      await cancelQueued(t => staleKeys.has(t.sourceKey));
      if (state.active?.sourceKey && staleKeys.has(state.active.sourceKey)) await cancelActive();
      for (const [entry] of previousEntries) delete state.sources[entry];
    }
    state.sources[key] = { tabId: sender.tab.id, frameId: sender.frameId, instance: message.instance, documentId: sender.documentId, origin: originOf(sender.url) };
    await save(); return sourceSettings(sender);
  }
  if (message.type === 'TRANSLATE') return translate(message, sender);
  if (message.type === 'CANCEL') {
    await cancelQueued(t => t.id === message.id && matchesSource(t, sender, message.instance));
    if (state.active?.id === message.id && matchesSource(state.active, sender, message.instance)) await cancelActive();
    await maintain(); return {};
  }
  if (message.type === 'OPEN_SETTINGS') { await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }); return {}; }
  if (message.type === 'OPEN_CHAT') return panel({ type: 'OPEN_CHAT' });
  throw new Error('不支持的页面操作');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  serial(() => handle(message, sender)).then(data => respond({ ok: true, data }), error => respond({ ok: false, message: error.message || '插件暂不可用，请重新加载扩展' }));
  return true;
});

async function trigger(tab, context) {
  await init();
  if (!tab?.id || !supported(tab.url) || tab.incognito) { await chrome.action.setBadgeText({ tabId: tab?.id, text: '!' }); await chrome.action.setTitle({ tabId: tab?.id, title: '此页面暂不支持划选翻译' }); return; }
  try {
    const target = context?.page ? { tabId: tab.id, allFrames: true } : context?.frameId ? { tabId: tab.id, frameIds: [context.frameId] } : { tabId: tab.id };
    let injected;
    try { injected = await chrome.scripting.executeScript({ target, files: ['lib/text-rules.js', 'source.js'] }); }
    catch (error) {
      if (!context?.page) throw error;
      injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/text-rules.js', 'source.js'] });
    }
    // Do not await content-script translation from within the serialized background queue.
    for (const frame of injected?.length ? injected : [{ frameId: context?.frameId || 0 }]) void safe(chrome.tabs.sendMessage(tab.id, { channel: 'qy-source', type: context?.page ? 'PAGE' : 'TRIGGER', scope: context?.scope, editable: context?.editable, iframe: (frame.frameId || 0) !== 0, text: context?.selectionText }, frame.documentId ? { documentId: frame.documentId } : { frameId: frame.frameId || 0 }));
  } catch { await chrome.action.setBadgeText({ tabId: tab.id, text: '!' }); await chrome.action.setTitle({ tabId: tab.id, title: '此页面暂不支持划选翻译，或页面权限不可用' }); }
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (['qy-translate', 'qy-page', 'qy-page-all'].includes(info.menuItemId)) serial(() => trigger(tab, { ...info, page: info.menuItemId !== 'qy-translate', scope: info.menuItemId === 'qy-page-all' ? 'all' : 'smart' }));
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'translate-selection') serial(() => trigger(tab));
  else if (command === 'translate-all-page') serial(() => trigger(tab, { page: true, scope: 'all' }));
});
chrome.runtime.onInstalled.addListener(() => serial(async () => { await init(); await updateMenu(); await syncScripts(); }));
chrome.runtime.onStartup.addListener(() => serial(async () => { await init(); await updateMenu(); await syncScripts(); }));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'qy-deadline') serial(async () => { await init(); await maintain(); }); });
chrome.permissions.onAdded.addListener(() => serial(async () => { await init(); await syncScripts(); }));
chrome.permissions.onRemoved.addListener(() => serial(async () => {
  await init();
  await cancelQueued(() => true, '网站授权已变化，请重新翻译');
  if (!await chrome.permissions.contains({ origins: [CHAT_PATTERN] })) { if (state.active?.provider !== 'api') { await cancelActive(); state.active = null; } state.binding = null; state.cache = []; state.epoch++; }
  if (state.active?.provider === 'api' && !await chrome.permissions.contains({ origins: [`${API_ORIGIN}/*`] })) await cancelActive();
  await syncScripts(); await save();
}));
async function invalidateTab(tabId, closed) {
  await init();
  for (const [key, source] of Object.entries(state.sources)) if (source.tabId === tabId || Number(key) === tabId) delete state.sources[key];
  await cancelQueued(t => t.tabId === tabId);
  if (state.active?.tabId === tabId) await cancelActive();
  if (state.binding?.tabId === tabId) {
    await failActive('翻译连接已断开，请在加载完成后重新绑定', true);
    state.cache = []; state.epoch++;
    if (closed) state.binding = null;
  }
  await save();
}
chrome.tabs.onRemoved.addListener(id => serial(() => invalidateTab(id, true)));
chrome.tabs.onUpdated.addListener((id, change) => {
  if (!change.status && !change.url && !change.discarded) return;
  serial(async () => {
    await init();
    if (change.discarded || (state.binding?.tabId === id && change.url && originOf(change.url) !== CHAT_ORIGIN)) {
      await invalidateTab(id, false); return;
    }
    if (state.binding?.tabId !== id) {
      if (change.status === 'loading') await invalidateTab(id, false);
      return;
    }
    // Chrome can report loading/complete for the SPA's first conversation URL.
    // A document witness, not that generic loading event, determines replacement.
    if (change.status !== 'complete') return;
    const status = await safe(adapter('STATUS'));
    if (!status || status.pageId !== state.binding.pageId) {
      await invalidateTab(id, false); return;
    }
    if (state.active && status.job?.id === state.active.id) {
      await applyAdapter(status.job, status);
      await maintain();
    } else if (status.session !== state.binding.session || status.guard !== state.binding.guard || status.mode !== state.binding.mode) {
      await failActive('翻译页、会话或模式已改变，请重新确认绑定', true);
      state.cache = []; state.epoch++; await save();
    }
  });
});
