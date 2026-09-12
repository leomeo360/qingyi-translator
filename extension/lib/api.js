export const API_ORIGIN = 'https://api.deepseek.com';
export const API_MODEL = 'deepseek-flash';
// USD / million tokens. Official tariff checked 2026-09-10; estimates, not invoices.
export function estimateCost(usage, at = Date.now()) {
  if (!usage) return null;
  const d = new Date(at), h = d.getUTCHours(), day = d.getUTCDay();
  const peak = day > 0 && day < 6 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
  const hit = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
  const miss = usage.prompt_cache_miss_tokens ?? Math.max(0, usage.prompt_tokens - hit);
  return (hit * .006 + miss * .3 + usage.completion_tokens * 1.2) * (peak ? 1 : .5) / 1e6;
}
export async function translateApi({ key, prompt, signal, onProgress = () => {}, json = false }) {
  const startedAt = Date.now();
  // Translation uses no reasoning or tools (including web search).
  const response = await fetch(`${API_ORIGIN}/chat/completions`, {
    method: 'POST', redirect: 'error', credentials: 'omit', signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: API_MODEL, messages: [{ role: 'user', content: prompt }], thinking: { type: 'disabled' }, tool_choice: 'none', temperature: .2, max_tokens: 16384, stream: true, stream_options: { include_usage: true }, ...(json ? { response_format: { type: 'json_object' } } : {}) })
  });
  if (!response.ok) {
    const messages = { 401: 'API Key 无效，请检查或更换', 402: 'DeepSeek API 余额不足', 429: 'API 请求过于频繁，请稍后重试' };
    throw new Error(messages[response.status] || `DeepSeek API 请求失败（${response.status}）`);
  }
  if (!response.body) throw new Error('API 未返回数据流');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', usage = null, finish = null, firstTokenMs = null, done = false, lastPaint = 0, model = API_MODEL;
  let progress = null, latest = null, paintTimer = null, progressError = null, flushing = false, stopped = false;
  const clearPaintTimer = () => { if (paintTimer !== null) clearTimeout(paintTimer); paintTimer = null; };
  function paintLatest() {
    if (stopped || progressError || progress || latest === null) return;
    const delay = flushing ? 0 : Math.max(0, 100 - (Date.now() - lastPaint));
    if (delay) {
      paintTimer ??= setTimeout(() => { paintTimer = null; paintLatest(); }, delay);
      return;
    }
    clearPaintTimer();
    const snapshot = latest; latest = null; lastPaint = Date.now();
    // Keep one callback and one replaceable snapshot; painting must not stall SSE reads.
    progress = Promise.resolve().then(() => onProgress(snapshot, firstTokenMs)).catch(error => {
      progressError = error instanceof Error ? error : new Error('译文显示更新失败');
      latest = null; clearPaintTimer();
      void reader.cancel().catch(() => {});
    }).then(() => { progress = null; if (!flushing) paintLatest(); });
  }
  async function flushProgress() {
    flushing = true; clearPaintTimer();
    while (progress || latest !== null) {
      if (!progress) paintLatest();
      if (progress) await progress;
      if (progressError) throw progressError;
    }
    if (progressError) throw progressError;
  }
  const line = value => {
    if (!value.startsWith('data:')) return;
    const data = value.slice(5).trim();
    if (data === '[DONE]') { done = true; return; }
    if (!data) return;
    const part = JSON.parse(data);
    if (part.error) throw new Error('API 返回错误，译文未完成');
    if (part.model) model = part.model;
    if (part.usage) usage = part.usage;
    const choice = part.choices?.[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (choice?.delta?.content) {
      firstTokenMs ??= Date.now() - startedAt;
      text += choice.delta.content;
      if (text.length > 120000) throw new Error('译文超过大小限制');
      latest = text; paintLatest();
    }
  };
  try {
    while (!done) {
      const chunk = await reader.read();
      if (progressError) throw progressError;
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const value of lines) line(value.trimEnd());
      if (chunk.done) { if (buffer) line(buffer); break; }
    }
    if (progressError) throw progressError;
    if (finish !== 'stop' || !text.trim()) throw new Error(finish === 'length' ? '译文达到输出上限，请缩短内容后重试' : 'API 响应未完整结束，请重试');
    await flushProgress();
    return { text: text.trim(), usage, model, firstTokenMs, durationMs: Date.now() - startedAt, estimatedUsd: estimateCost(usage, startedAt) };
  } finally { stopped = true; latest = null; clearPaintTimer(); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
