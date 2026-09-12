(() => {
  'use strict';
  if (location.origin !== 'https://chat.deepseek.com' || window.top !== window || globalThis.__qyAdapter) return;
  globalThis.__qyAdapter = true;

  // DOM profile observed on 2026-09-10. Unknown markup fails closed.
  const PROFILE = {
    input: 'textarea[placeholder*="DeepSeek"]',
    answer: '.ds-assistant-message-main-content',
    row: '[data-virtual-list-item-key]',
    message: '.ds-message',
    sendPath: 'M8.3125 0.981587',
    regeneratePath: 'M7.92136 0.349152'
  };
  const pageId = crypto.randomUUID();
  let guard = 0;
  let job = null;
  let lastJob = null;
  let unsettled = null;
  let timer = null;
  let observer = null;
  let queuedTick = null;
  let observedSession = location.pathname;
  const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const input = () => [...document.querySelectorAll(PROFILE.input)].find(visible);
  const disabled = e => !e || e.disabled || e.getAttribute('aria-disabled') === 'true' || e.classList.contains('ds-button--disabled');
  const mode = () => [...document.querySelectorAll('.ds-toggle-button[aria-pressed]')].map(e => `${e.textContent.trim()}:${e.getAttribute('aria-pressed')}`).sort().join('|');
  const normal = text => text.replace(/\s+/g, ' ').trim();
  const controls = () => {
    const area = input();
    return area?.parentElement?.parentElement?.parentElement;
  };
  function sendButton() {
    return [...(controls()?.querySelectorAll('[role="button"],button') || [])].find(e =>
      visible(e) && ([...e.querySelectorAll('svg path')].some(p => p.getAttribute('d')?.startsWith(PROFILE.sendPath)) || /^(发送|Send)(消息| message)?$/i.test(e.getAttribute('aria-label') || '')));
  }
  function stopButton() {
    return [...(controls()?.querySelectorAll('[role="button"],button') || [])].find(e => visible(e) && /^(停止生成|停止响应|Stop generating|Stop response)$/i.test(e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent.trim()));
  }
  function blocker() {
    const nodes = [...document.querySelectorAll('[role="alert"],[role="dialog"],.ds-toast')].filter(visible);
    if (nodes.some(e => /验证码|人机验证|captcha|verify you are human/i.test(e.textContent))) return '请前往 DeepSeek 完成页面验证后重试';
    if (nodes.some(e => /频繁|服务繁忙|服务器繁忙|rate limit|try again later/i.test(e.textContent))) return 'DeepSeek 暂时无法处理，请稍后重试';
    if (/sign_in|login/.test(location.pathname)) return '请在 DeepSeek 页面登录';
    return '';
  }
  function readiness() {
    const error = blocker();
    if (error) return { ready: false, message: error };
    const area = input();
    if (!area) return { ready: false, message: '请确认已登录 DeepSeek；当前页面没有可识别的聊天输入框' };
    if (area.value.trim()) return { ready: false, message: '翻译页有用户草稿，请处理后重试' };
    if (area.disabled || area.readOnly || stopButton()) return { ready: false, message: '翻译页正在生成，请等待结束后重试' };
    // An idle composer has a recognizable send arrow, even when disabled for empty input.
    if (!sendButton()) return { ready: false, message: '当前 DeepSeek 页面暂不兼容，或仍在生成；请前往检查' };
    if (job?.clicked && !completed(ownRow(job))) return { ready: false, message: '翻译页正在处理本轮请求，请等待结束后重试' };
    if (unsettled) {
      if (completed(ownRow(unsettled))) unsettled = null;
      else return { ready: false, message: '上一轮是否结束尚未确认，请前往 DeepSeek 检查；必要时刷新后重新绑定' };
    }
    return { ready: true, message: '' };
  }
  function snapshot() {
    return { ...readiness(), pageId, guard, session: location.pathname, mode: mode(), job: job ? publicJob(job) : lastJob };
  }
  function publicJob(value) { return { id: value.id, text: value.text || '', status: value.status, message: value.message, owned: !!value.owned }; }
  function emit(type = 'PROGRESS') {
    const event = { channel: 'qy-adapter-event', type, ...snapshot() };
    chrome.runtime.sendMessage(event).catch(() => {});
  }
  function stopWatching() {
    clearInterval(timer); timer = null;
    clearTimeout(queuedTick); queuedTick = null;
    observer?.disconnect(); observer = null;
  }
  function finish(status, message) {
    if (!job) return;
    if (job.clicked && status !== 'success' && !completed(ownRow(job))) unsettled = { ...job };
    job.status = status; job.message = message;
    lastJob = publicJob(job);
    job = null;
    stopWatching();
    emit();
    // A completed witness is retained briefly for worker recovery, never indefinitely.
    const id = lastJob.id;
    setTimeout(() => { if (lastJob?.id === id) lastJob = null; }, 1800000);
  }
  function rows() { return [...document.querySelectorAll(PROFILE.row)]; }
  const rowKey = e => Number(e.getAttribute('data-virtual-list-item-key'));
  function ownRow(value = job) {
    if (!value) return null;
    const user = rows().find(e => rowKey(e) < 0 && Math.abs(rowKey(e)) > value.baseline && normal(e.querySelector(PROFILE.message)?.innerText || '') === normal(value.prompt));
    if (!user) return null;
    value.owned = true;
    const key = Math.abs(rowKey(user));
    if (value.userKey && value.userKey !== key) return null;
    value.userKey = key;
    return rows().find(e => rowKey(e) === key);
  }
  function completed(row) {
    if (!row || !sendButton() || stopButton()) return false;
    // Only this answer's explicit regenerate control is a completion witness.
    return [...row.querySelectorAll('[role="button"],button')].some(e => !disabled(e) && (
      /^(重新生成|Regenerate|Regenerate response)$/i.test(e.getAttribute('aria-label') || '') ||
      [...e.querySelectorAll('svg path')].some(p => p.getAttribute('d')?.startsWith(PROFILE.regeneratePath))));
  }
  function tick() {
    queuedTick = null;
    if (!job) return;
    if (job.guard !== guard || job.mode !== mode()) { finish('error', '翻译页被手动操作或模式已改变，请重新确认绑定'); return; }
    const error = blocker();
    if (error) { finish('error', error); return; }
    const row = ownRow();
    if (location.pathname !== job.session) {
      const expected = (job.session === '/' || job.session === '/a/chat') && /^\/a\/chat\/s\/[\w-]+$/.test(location.pathname);
      if (!expected) { finish('error', 'DeepSeek 会话已切换，请重新绑定'); return; }
      if (!job.owned) {
        if (Date.now() - job.startedAt > 5000) finish('error', '无法确认新会话归属，请前往 DeepSeek 检查');
        return;
      }
      job.session = location.pathname;
      observedSession = job.session;
    }
    if (row) {
      const answer = row.querySelector(PROFILE.answer);
      const text = answer?.innerText?.trim() || '';
      if (text.length > 60000) { finish('error', '回复异常过长，请前往 DeepSeek 检查'); return; }
      if (text && text !== job.text) { job.text = text; job.status = 'streaming'; emit(); }
      if (text && completed(row) && !input()?.value.trim()) { finish('success'); return; }
      if (!answer && /服务器繁忙|请求过于频繁|rate limit|server is busy/i.test(row.innerText)) { finish('error', 'DeepSeek 暂时无法处理，请稍后重试'); return; }
    }
    if (Date.now() >= job.deadline) { finish('error', '等待超时，DeepSeek 可能仍在生成；部分译文未完成'); return; }
    if (Date.now() - job.lastHeartbeat >= 5000) { job.lastHeartbeat = Date.now(); emit(); }
  }
  async function run(value) {
    if (!value || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id) || typeof value.prompt !== 'string' || value.prompt.length > 14000 || !Number.isFinite(value.deadline) || value.deadline > Date.now() + 121000 || value.deadline < Date.now()) throw new Error('无效的翻译任务');
    if (job?.id === value.id || lastJob?.id === value.id) return { ok: true };
    if (job) throw new Error('前一个翻译尚未结束');
    const status = snapshot();
    if (value.pageId !== pageId || value.guard !== guard || value.session !== location.pathname || value.mode !== mode()) throw new Error('会话或页面状态已改变，请重新确认绑定');
    if (!status.ready) throw new Error(status.message);
    const area = input();
    const baseline = Math.max(0, ...rows().map(e => Math.abs(rowKey(e))).filter(Number.isFinite));
    job = { ...value, baseline, status: 'waiting', text: '', startedAt: Date.now(), lastHeartbeat: Date.now(), owned: false };
    // Native setter + input event supports the controlled textarea without React internals.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, value.prompt);
    area.dispatchEvent(new Event('input', { bubbles: true }));
    let send = sendButton();
    for (let attempt = 0; attempt < 20 && disabled(send); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      send = sendButton();
    }
    if (!job || guard !== value.guard || area.value !== value.prompt || location.pathname !== value.session || mode() !== value.mode || disabled(send)) {
      // Clear only our exact, unsent draft; never clear a changed user draft.
      if (guard === value.guard && area.value === value.prompt) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, '');
        area.dispatchEvent(new Event('input', { bubbles: true }));
      }
      finish('error', '无法安全提交，请检查 DeepSeek 页面后重试');
      throw new Error('无法安全提交，请检查 DeepSeek 页面后重试');
    }
    observer = new MutationObserver(() => { if (!queuedTick) queuedTick = setTimeout(tick, 100); });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-disabled', 'class'] });
    timer = setInterval(tick, 1000);
    // Exactly one click; a lost acknowledgement must never cause a retry.
    job.clicked = true;
    send.click();
    emit();
    return { ok: true };
  }
  function cancel(id) {
    if (!job || job.id !== id) return snapshot();
    const row = ownRow();
    const own = job.owned && job.guard === guard && job.mode === mode() && (job.session === location.pathname || ((job.session === '/' || job.session === '/a/chat') && /^\/a\/chat\/s\//.test(location.pathname)));
    const stop = own && stopButton();
    if (stop && !disabled(stop)) stop.click();
    finish('cancelled', '已取消；部分译文未完成，远端状态需确认');
    return snapshot();
  }
  function invalidate(event) {
    if (!event.isTrusted) return;
    const control = event.target instanceof Element && event.target.closest('button,[role="button"],a,[tabindex],textarea,input,[contenteditable="true"]');
    if (!control || (event.type === 'pointerdown' && control.matches('textarea,input'))) return;
    guard++;
    if (job) finish('error', '翻译页被手动操作，请重新确认绑定');
    emit('INVALIDATED');
  }
  document.addEventListener('input', invalidate, true);
  document.addEventListener('pointerdown', invalidate, true);
  document.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) invalidate(event); }, true);
  window.addEventListener('popstate', () => { if (location.pathname !== observedSession) { guard++; if (job) finish('error', '会话已切换，请重新绑定'); emit('INVALIDATED'); } });
  window.addEventListener('pagehide', stopWatching);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || sender.tab || message?.channel !== 'qy-adapter') return;
    const operation = message.type === 'STATUS' ? Promise.resolve(snapshot()) : message.type === 'RUN' ? run(message.job) : message.type === 'CANCEL' ? Promise.resolve(cancel(message.id)) : Promise.reject(new Error('无效的适配操作'));
    operation.then(respond, error => respond({ ok: false, message: error.message }));
    return true;
  });
})();
