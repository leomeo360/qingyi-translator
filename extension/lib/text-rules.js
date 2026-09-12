(() => {
  'use strict';
  if (globalThis.QYTextRules) return;

  const DEFAULT_TERMS = Object.freeze(['API','SDK','URL','URI','HTTP','HTTPS','REST','GraphQL','OAuth','OAuth2','JWT','JSON','XML','HTML','CSS','JavaScript','TypeScript','SQL','NoSQL','Node.js','React','Vue','Git','GitHub','Docker','Kubernetes','Chrome','DeepSeek','OpenAI','UTF-8','UTF-16','ASCII','Unicode','CPU','GPU','RAM','SSD','CDN','DNS','TCP','UDP','IP','SSH','SSL','TLS','WebSocket','WebRTC','npm','pnpm','yarn']);
  const termCache = new Map();
  function termPatterns(terms) {
    const key = JSON.stringify(terms);
    if (!termCache.has(key)) {
      if (termCache.size >= 8) termCache.delete(termCache.keys().next().value);
      termCache.set(key, [...new Set([...DEFAULT_TERMS, ...terms])].filter(Boolean).map(term => new RegExp('(?<![A-Za-z0-9_])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])', 'gu')));
    }
    return termCache.get(key);
  }
  function isSensitive(text) {
    return /\b(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/i.test(text)
      || /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/.test(text)
      || /\b(?:Bearer|Basic)\s+[\w+/.=-]{8,}/i.test(text)
      || /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(text)
      || /(?:\b(?:password|passwd|pwd|api[_ -]?key|access[_ -]?token|client[_ -]?secret|private[_ -]?key|recovery[_ -]?code|verification[_ -]?code)\b|密码|密钥|验证码|恢复码)\s*["']?\s*[:=：]\s*["']?\S+/i.test(text)
      || /^(?=\S{12,}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).*$/.test(text.trim());
  }
  function isGarbage(text) {
    const t = text.trim();
    if (!t) return false;
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t) || (t.match(/\uFFFD/g) || []).length >= 2) return true;
    if ((t.match(/(?:Ã.|Â.|â€|ðŸ)/g) || []).length >= 2) return true;
    if (/^[a-f\d]{24,}$/i.test(t) || /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(t)) return true;
    if (/^[A-Za-z\d+/_=-]{24,}$/.test(t) && /\d/.test(t) && /[a-z]/.test(t) && /[A-Z]/.test(t)) return true;
    return /^[A-Za-z\d]{18,}$/.test(t) && /\d/.test(t) && (t.match(/[aeiou]/gi) || []).length / t.length < .12;
  }
  // Return protected spans rather than asking the model to reproduce code faithfully.
  function protectedRanges(text, terms = []) {
    if (isSensitive(text) || isGarbage(text)) return [{ start: 0, end: text.length }];
    const ranges = [];
    const patterns = [
      /\b[a-f\d]{24,}\b/gi,
      /\b[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\b/gi,
      /\b[A-Za-z][A-Za-z\d]*_[A-Za-z\d_]+\b/g,
      /\b[a-z]+(?:[A-Z][a-z\d]+){1,}[A-Za-z\d]*\b/g,
      /<(code|pre|kbd|samp|var)\b[^>]*>[\s\S]*?<\/\1>/gi,
      /`+[^`]+`+/g,
      /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi,
      /(?:[A-Za-z]:\\|\\\\)[^\s<>"'`]+/g,
      /(?:^|(?<=[\s([=:]))(?:~\/|\.\.?\/|\/)[A-Za-z0-9_~.%!$&'()*+,;=:@{}\[\]\/?#-]*/g,
      /\b(?:[A-Za-z_][\w.-]*\/)+[\w.{}:@?-]+/g,
      /\b(?:HTTP\s+)?(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)(?:[ \t]*(?:方法|method\b))?\b/g,
      /\b(?:HTTP[ \t]+)?(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)方法/g,
      /\b(?:HTTP|HTTPS|HTTP\/[123](?:\.\d)?|JSON|XML|SQL)\b/g,
      /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\([^()\n]*\)/g,
      /\{[A-Za-z_][\w-]*\}/g
    ];
    if (/^\s*(?:(?:const|let|var|function|class|import|export|return|SELECT|INSERT|UPDATE|DELETE FROM)\b[^\n]*[;{}=]|[\[{][\s\S]*[\]}]\s*;?\s*$)/.test(text)) return [{ start: 0, end: text.length }];
    if (/^\s*(?:(?:npm|pnpm|yarn|pip|pip3|git|docker|kubectl)\s+(?:install|add|run|build|clone|pull|push|commit|checkout|exec|apply|get|delete)\b|(?:def|class)\s+\w+[^\n]*:\s*$|(?:from\s+[\w.]+\s+)?import\s+[\w.*]+(?:\s+as\s+\w+)?(?:,\s*[\w.*]+(?:\s+as\s+\w+)?)*$|[A-Za-z_$][\w.$]*\s*=(?!=)\s*[\w.'"[({][^\n]*$|#!\/)/.test(text)) return [{ start: 0, end: text.length }];
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) ranges.push({ start: match.index, end: match.index + match[0].length });
    for (const term of termPatterns(terms)) for (const match of text.matchAll(term)) ranges.push({ start: match.index, end: match.index + match[0].length });
    ranges.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
    }
    return merged;
  }
  function proseFragments(text, start = 0, end = text.length, terms = []) {
    const result = []; let cursor = 0;
    const add = (a, b) => {
      a = Math.max(a, start); b = Math.min(b, end);
      if (b > a && /[\p{L}]/u.test(text.slice(a, b))) result.push({ start: a, end: b });
    };
    for (const range of protectedRanges(text, terms)) { add(cursor, range.start); cursor = range.end; }
    add(cursor, text.length); return result;
  }
  // Conservative detection: ambiguous scripts/languages still go through translation.
  function alreadyTarget(text, target, lang = '') {
    const t = text.trim(), letters = t.match(/\p{L}/gu) || [];
    if (!letters.length) return false;
    if (target === 'English') {
      if (!/^[\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\s]+$/u.test(t)) return false;
      if (/^(?:read more|learn more|show more|view more|continue reading|hello|thank you)[.!…]?$/i.test(t)) return true;
      const words = t.toLowerCase().match(/[a-z]+/g) || [];
      const common = new Set('the this that these those is are was were your you our we with from for and of to in a an can should must will not'.split(' '));
      return /^en(?:-|$)/i.test(lang) && words.length >= 4 && words.filter(w => common.has(w)).length >= 2;
    }
    if (target === '日本語') return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t) && !/[\p{Script=Latin}\p{Script=Hangul}]/u.test(t);
    if (target === '한국어') return /\p{Script=Hangul}/u.test(t) && !/[\p{Script=Latin}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t);
    if (target === '简体中文' || target === '繁體中文') {
      if (!letters.every(c => /\p{Script=Han}/u.test(c))) return false;
      const simplified = /[这为来时个们说语译页读与体后发开关过里国学书车门见长无从将还实应会]/.test(t);
      const traditional = /[這為來時個們說語譯頁讀與體後發開關過裡國學書車門見長無從將還實應會]/.test(t);
      return target === '简体中文' ? !traditional && (simplified || /^zh-(?:Hans|CN|SG)(?:-|$)/i.test(lang)) : !simplified && (traditional || /^zh-(?:Hant|TW|HK|MO)(?:-|$)/i.test(lang));
    }
    const code = { Français: 'fr', Deutsch: 'de', Español: 'es' }[target];
    return !!code && new RegExp('^' + code + '(?:-|$)', 'i').test(lang) && letters.every(c => /\p{Script=Latin}/u.test(c));
  }
  function compactBlocks(blocks) {
    const contexts = [], known = new Map();
    const segments = blocks.map(({ id, text, context }) => {
      if (!context) return { id, text };
      if (!known.has(context)) { known.set(context, contexts.length); contexts.push(context); }
      return { id, text, contextId: known.get(context) };
    });
    return contexts.length ? { contexts, segments } : segments;
  }
  function viewportBatch(candidates, provider) {
    const result = [], limit = provider === 'api' ? 6500 : 4800;
    for (const block of candidates) {
      if (result.length >= 32) break;
      const next = [...result, block];
      const plain = next.map(({ id, text, context }) => ({ id, text, ...(context ? { context } : {}) }));
      // Bound both the actual model payload and the local IPC representation.
      if (result.length && (JSON.stringify(compactBlocks(plain)).length > limit || JSON.stringify(plain).length > 48000)) break;
      result.push(block);
    }
    return result;
  }
  function maskProtectedSentence(text, terms = []) {
    if (/[⟪⟫]/u.test(text) || !proseFragments(text, 0, text.length, terms).length) return null;
    const ranges = [];
    for (const span of protectedRanges(text, terms)) {
      const previous = ranges.at(-1);
      // Keep combinations such as GET /api/v1/me together, including their spacing.
      if (previous && !text.slice(previous.end, span.start).trim()) previous.end = span.end;
      else ranges.push({ ...span });
    }
    if (!ranges.length || ranges.length > 16) return null;
    const tokens = []; let cursor = 0, masked = '';
    for (const range of ranges) {
      const marker = `⟪QY_KEEP_${tokens.length}⟫`;
      tokens.push({ marker, value: text.slice(range.start, range.end) });
      masked += text.slice(cursor, range.start) + marker; cursor = range.end;
    }
    masked += text.slice(cursor);
    // A protected sentence stays in one block; longer/complex text uses the existing fragment path.
    return [...masked].length <= 2500 ? { text: masked, tokens } : null;
  }
  function validProtectedMarkers(source, output) {
    const markers = value => value.match(/⟪QY_KEEP_[^⟫]*(?:⟫|$)/gu) || [];
    const expected = markers(source).sort(), actual = markers(output).sort();
    return expected.length === actual.length && expected.every((value, i) => value === actual[i]);
  }
  function restoreProtectedSentence(text, tokens, complete = false) {
    if (!tokens?.length) return text;
    if (complete && !validProtectedMarkers(tokens.map(t => t.marker).join(''), text)) return null;
    const known = new Map(tokens.map(t => [t.marker, t.value])), seen = new Set();
    let invalid = false;
    const result = text.replace(/⟪[^⟫]*(?:⟫|$)/gu, marker => {
      if (!marker.endsWith('⟫') && !complete) return '';
      if (!known.has(marker) || seen.has(marker)) { invalid = true; return ''; }
      seen.add(marker); return known.get(marker);
    });
    return invalid ? null : result;
  }
  globalThis.QYTextRules = Object.freeze({ DEFAULT_TERMS, compactBlocks, viewportBatch, alreadyTarget, isSensitive, isGarbage, protectedRanges, proseFragments, maskProtectedSentence, validProtectedMarkers, restoreProtectedSentence });
})();
