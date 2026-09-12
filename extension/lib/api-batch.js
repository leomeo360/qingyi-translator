import { translateApi } from './api.js';
import { blocksPrompt, parseBlocks, partialTranslations } from './core.js';

// Two bounded lanes within the current viewport; short selections stay in one request.
export function splitApiBlocks(blocks) {
  const total = blocks.reduce((sum, b) => sum + b.text.length, 0);
  if (blocks.length < 4 || total < 1800) return [blocks];
  let size = 0, cut = 0, best = Infinity;
  for (let i = 1; i < blocks.length; i++) {
    size += blocks[i - 1].text.length;
    if (Math.min(size, total - size) < 400) continue;
    // Prefer a sentence/context boundary to avoid duplicating context between lanes.
    const sharedContext = blocks[i].context && blocks[i].context === blocks[i - 1].context;
    const score = Math.abs(total / 2 - size) + (sharedContext ? 300 : 0);
    if (score < best) { best = score; cut = i; }
  }
  return cut ? [blocks.slice(0, cut), blocks.slice(cut)] : [blocks];
}

export async function translateApiBlocks({ blocks, language, key, signal, onProgress = () => {} }) {
  signal?.throwIfAborted();
  const startedAt = Date.now(), controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const values = Object.create(null), batches = splitApiBlocks(blocks);
  let firstTokenMs = null, failure;
  let rejectOnAbort;
  const aborted = new Promise((_, reject) => { rejectOnAbort = () => reject(controller.signal.reason); });
  controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
  try {
    const settled = await Promise.allSettled(batches.map(async batch => {
      const offset = Date.now() - startedAt;
      try {
        // Cancellation must not wait for a stalled display callback after SSE has ended.
        const result = await Promise.race([translateApi({ key, prompt: blocksPrompt(batch, language), json: true, signal: controller.signal,
          onProgress: (text, first) => {
            if (controller.signal.aborted) return;
            if (first != null) firstTokenMs = Math.min(firstTokenMs ?? Infinity, offset + first);
            Object.assign(values, partialTranslations(text, batch.map(b => b.id)));
            return onProgress(JSON.stringify(values), firstTokenMs);
          }
        }), aborted]);
        Object.assign(values, parseBlocks(result.text, batch));
        if (result.firstTokenMs != null) firstTokenMs = Math.min(firstTokenMs ?? Infinity, offset + result.firstTokenMs);
        return result;
      } catch (error) {
        failure ??= error;
        controller.abort(error);
        throw error;
      }
    }));
    if (failure) throw failure;
    signal?.throwIfAborted();
    const results = settled.map(r => r.value);
    const text = JSON.stringify(values);
    parseBlocks(text, blocks);
    const usage = results.every(r => r.usage) ? results.reduce((sum, r) => {
      for (const field of ['prompt_tokens', 'completion_tokens', 'total_tokens']) sum[field] = (sum[field] || 0) + (r.usage[field] || 0);
      const hit = r.usage.prompt_cache_hit_tokens ?? r.usage.prompt_tokens_details?.cached_tokens ?? 0;
      sum.prompt_cache_hit_tokens += hit;
      sum.prompt_cache_miss_tokens += r.usage.prompt_cache_miss_tokens ?? Math.max(0, r.usage.prompt_tokens - hit);
      return sum;
    }, { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 }) : null;
    return { text, usage, model: results[0].model, firstTokenMs, durationMs: Date.now() - startedAt,
      requestCount: results.length, estimatedUsd: results.every(r => r.estimatedUsd != null) ? results.reduce((n, r) => n + r.estimatedUsd, 0) : null };
  } finally { signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', rejectOnAbort); }
}
