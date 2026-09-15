(() => {
  'use strict';
  if (globalThis.__qySource || document.contentType !== 'text/html') return;
  globalThis.__qySource = true;
  let instance = crypto.randomUUID(), settings = {}, snapshot, pageRun, selectionRun, pageUrl = location.href, timer;
  const tasks = new Map(), cards = new Set();
  let presentationEpoch = 0;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const css = `:host{color-scheme:light dark}*{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;cursor:pointer;border:0;border-radius:6px;padding:4px 8px;color:#5268d4;background:#edf0ff}button:disabled{opacity:.4;cursor:default}button:focus-visible{outline:2px solid #5268e9;outline-offset:2px}.bar{font:13px/1.7 -apple-system,sans-serif;background:#fff;color:#273044;border:1px solid #dfe4f4;border-radius:12px;padding:10px 13px;box-shadow:0 4px 20px #22334b22;display:flex;align-items:center;gap:9px;flex-wrap:wrap}.launch{pointer-events:auto;position:fixed;width:32px;height:32px;padding:0;background:#5268e9;color:#fff;box-shadow:0 3px 14px #26357d38}.page-launch{pointer-events:auto;position:fixed;top:50%;right:14px;transform:translateY(-50%);height:42px;min-width:72px;padding:0 17px;border:1px solid #ffffff55;border-radius:22px;background:#5268e9;color:#fff;font:600 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.08em;box-shadow:0 5px 20px #26357d45;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}.page-launch:hover{transform:translateY(-50%) scale(1.04);background:#4058df;box-shadow:0 7px 24px #26357d55}.page-launch:active{transform:translateY(-50%) scale(.98)}.bar{pointer-events:auto;position:fixed;bottom:18px;right:18px;max-width:calc(100vw - 36px)}@media(max-width:600px){.page-launch{right:8px;min-width:64px;height:38px;padding:0 13px}}@media(prefers-color-scheme:dark){.bar{background:#252a38;color:#e3e7f3;border-color:#485069}button{background:#38426a;color:#c7d0ff}.page-launch{background:#6076f0;color:#fff}}`;
  function shadow(host) { const root = host.attachShadow({ mode: 'open' }); root.append(el('style', css)); return root; }
  const host = el('div'); host.dataset.qyRoot = '';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0 auto auto 0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important';
  const root = shadow(host), launch = el('button', '译', 'launch'), pageLaunch = el('button', '翻译', 'page-launch'), bar = el('div', null, 'bar'), summary = el('span');
  launch.type = 'button'; launch.setAttribute('aria-label', '翻译选中文字'); launch.hidden = true;
  pageLaunch.type = 'button'; pageLaunch.setAttribute('aria-label', '翻译网页全部可读内容'); pageLaunch.title = '翻译网页'; pageLaunch.hidden = true;
  const resume = el('button', '继续翻译'); resume.hidden = true;
  const stopPage = el('button', '取消翻译'), restore = el('button', '恢复原文'), hide = el('button', '收起');
  bar.append(summary, stopPage, resume, restore, hide); bar.hidden = true; root.append(launch, pageLaunch, bar); document.documentElement.append(host);
  const send = async (type, extra = {}) => {
    const result = await chrome.runtime.sendMessage({ channel: 'qy-source', type, instance, ...extra });
    if (!result?.ok) throw new Error(result?.message || '扩展已更新，请刷新页面后重试');
    return result.data;
  };
  let bootError;
  function syncLaunches() {
    pageLaunch.hidden = window.top !== window || !settings.buttonAllowed;
    if (!settings.buttonAllowed) launch.hidden = true;
  }
  const hello = () => send('HELLO').then(s => { settings = s; bootError = null; syncLaunches(); }).catch(e => { bootError = e; });
  let boot = hello();
  const excluded = '.monaco-editor,.CodeMirror,.cm-editor,.ace_editor,.terminal,.blob-code,[role="textbox"],[role="log"],[data-sensitive],[data-private],[data-secret],script,style,noscript,template,svg,canvas,iframe,pre,code,kbd,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-qy-root],[data-qy-inline],[hidden],[aria-hidden="true"]';
  const blockSelector = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,caption,dt,dd,div,section,article,main,header,footer,nav';
  function anchorFor(node) {
    const e = node?.nodeType === 1 ? node : node?.parentElement;
    return e?.closest(blockSelector) || e || document.body;
  }
  function readSelection(context = {}) {
    if (context.editable || context.iframe) throw new Error('请在网页正文中选择文字');
    const s = getSelection();
    if (!s?.rangeCount || s.isCollapsed) throw new Error('请先选择文字');
    if (s.anchorNode?.parentElement?.closest(excluded) || s.focusNode?.parentElement?.closest(excluded)) throw new Error('此区域暂不支持翻译');
    const range = s.getRangeAt(0), text = s.toString().trim();
    if (!text || [...text].length > 3000) throw new Error('请选择 1–3,000 字符');
    if (range.cloneContents().querySelector('input,textarea,[contenteditable="true"],[data-qy-inline]')) throw new Error('请只选择正文，不包含编辑区域或已有译文');
    return { text, range: range.cloneRange(), anchor: anchorFor(range.endContainer) };
  }
  function position() {
    const r = snapshot?.range?.getBoundingClientRect();
    if (!r || r.bottom < 0 || r.top > innerHeight) { launch.hidden = true; return; }
    launch.style.left = `${Math.max(8, Math.min(r.right, innerWidth - 40))}px`;
    launch.style.top = `${Math.max(8, Math.min(r.bottom + 6, innerHeight - 40))}px`;
  }
  function selected() {
    clearTimeout(timer); timer = setTimeout(() => {
      try { snapshot = readSelection(); launch.hidden = !settings.buttonAllowed; position(); }
      catch { launch.hidden = true; }
    }, 100);
  }
  function showBar(text, busy = false) { summary.textContent = text; stopPage.hidden = !busy; resume.hidden = !pageRun?.paused || !!selectionRun; bar.hidden = false; }
  function makeReplacement(original) {
    const node = el('qy-translation'); node.dataset.qyInline = '';
    node.style.cssText = 'all:initial!important;display:inline!important;position:static!important;margin:0!important;padding:0!important;border:0!important;background:none!important;box-shadow:none!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;color:inherit!important;-webkit-text-fill-color:inherit!important;transform:none!important;rotate:none!important;scale:none!important;translate:none!important;writing-mode:inherit!important;text-orientation:inherit!important;direction:inherit!important;unicode-bidi:normal!important;animation:none!important;transition:none!important;';
    for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch', 'line-height', 'text-align', 'letter-spacing', 'word-spacing', 'text-transform', 'text-shadow', 'text-indent', 'white-space']) node.style.setProperty(property, 'inherit', 'important');
    const r = node.attachShadow({ mode: 'open' }), output = document.createTextNode(''); r.append(output);
    original.replaceWith(node);
    const card = { node, output, original }; cards.add(card); return card;
  }
  function restoreCard(card) {
    if (card.node.isConnected) card.node.replaceWith(card.original);
    cards.delete(card);
  }
  function restoreAll() { presentationEpoch++; for (const card of cards) restoreCard(card); }
  const { isSensitive, isGarbage } = globalThis.QYTextRules;
  function proseFragments(text, start = 0, end = text.length) {
    return globalThis.QYTextRules.proseFragments(text, start, end, settings.customTerms || []);
  }
  function sensitiveArea(parent) {
    if (parent.closest('form')?.querySelector('input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"]')) return true;
    const label = /(?:password|passwd|api[-_ ]?key|access[-_ ]?token|client[-_ ]?secret|private[-_ ]?key|credential|密码|密钥|验证码)/i;
    for (let current = parent, depth = 0; current && depth < 3; current = current.parentElement, depth++) {
      if (label.test([current.id, current.className, current.getAttribute('aria-label')].join(' '))) return true;
    }
    const previous = parent.previousElementSibling;
    if (previous && previous.textContent.length < 60 && label.test(previous.textContent)) return true;
    // Detect credentials split across inline markup before individual text is extracted.
    return parent.textContent.length < 1000 && isSensitive(parent.textContent);
  }
  function skipNode(node, force = false) {
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded) || parent.closest('samp,var')) return true;
    if (!force && parent.closest('[translate="no"],.notranslate')) return true;
    // Material icon fonts expose names such as "refresh" and "help_outline" as
    // text nodes. They are controls, not user-facing copy; replacing them breaks icons.
    const icon = parent.closest('[role="img"],.material-icons,.material-icons-outlined,.material-symbols-outlined,.material-symbols-rounded,.google-symbols,[data-icon]');
    if (icon || (/^(?:Material Icons|Material Symbols|Google Symbols)/i.test(getComputedStyle(parent).fontFamily || '') && /^[a-z][a-z\d_]*$/i.test(node.textContent.trim()))) return true;
    if (sensitiveArea(parent) || isSensitive(node.textContent) || isGarbage(node.textContent)) return true;
    if (globalThis.QYTextRules.alreadyTarget(node.textContent, settings.language, parent.closest('[lang]')?.lang || '')) return true;
    const link = parent.closest('a');
    // API navigation sometimes splits /prefs/{where} into several linked labels.
    return !!link && /^#[A-Z]+_/.test(link.hash || '') && /^[\w/{}.:?%-]+$/.test(link.textContent.trim());
  }
  function pageExcluded(node, run) {
    if (run?.scope === 'all') return false;
    if (settings.siteModes?.[location.origin] === 'all') return false;
    // Google Ads is an application whose primary content lives in navigation,
    // toolbars and buttons. Google Business marketing pages also put meaningful
    // calls to action and support copy in those regions.
    if (location.hostname === 'ads.google.com' || location.hostname === 'business.google.com') return false;
    const parent = node.parentElement;
    if (parent.closest('nav,aside,footer,[role="navigation"],[role="complementary"],[role="banner"],.toc,.table-of-contents,.wy-nav-side,.sidebar,[data-testid="left-sidebar"],[data-testid="right-sidebar"]')) return true;
    if (/(^|\.)reddit\.com$/.test(location.hostname) && parent.closest('#left-sidebar-container,#right-sidebar-container,shreddit-left-nav')) return true;
    if (location.hostname === 'github.com' && parent.closest('[data-testid="file-tree"],.AppHeader,.file-navigation')) return true;
    return false;
  }
  function contextFor(node, cache, ahead = 0, force = false) {
    if (/^(?:read more|learn more|show more|view more|continue reading)[.!…]?$/i.test(node.textContent.trim())) return '';
    const block = node.parentElement.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption') || node.parentElement;
    if (cache?.has(block)) return cache.get(block);
    if (block.textContent.length > 1600 || isSensitive(block.textContent)) return '';
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), parts = [];
    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (skipNode(current, force) || !visibleNodes([current], ahead)) { parts.push(' [保留内容] '); continue; }
      const text = current.textContent, ranges = globalThis.QYTextRules.protectedRanges(text, settings.customTerms || []);
      let end = 0;
      for (const range of ranges) {
        const term = text.slice(range.start, range.end);
        const named = ['React', 'Vue', 'GraphQL', 'Docker', 'Chrome', 'DeepSeek', 'OpenAI', ...(settings.customTerms || [])].includes(term);
        parts.push(text.slice(end, range.start), named ? term : '[保留内容]'); end = range.end;
      }
      parts.push(text.slice(end));
    }
    const context = parts.join('').replace(/\s+/g, ' ').trim();
    const result = context.length <= 1200 ? context : ''; cache?.set(block, result); return result;
  }
  function splitFragments(node, ranges) {
    const pieces = [];
    for (const range of [...ranges].reverse()) {
      if (range.end < node.length) node.splitText(range.end);
      const piece = range.start ? node.splitText(range.start) : node;
      pieces.unshift(piece);
    }
    return pieces;
  }
  function groupFor(node, context = '') {
    const raw = node.textContent;
    return { node, anchor: node.parentElement, nodes: [node], originals: [raw], text: raw.trim(), context: context === raw.trim() ? '' : context, prefix: /^\s*/.exec(raw)[0], suffix: /\s*$/.exec(raw)[0], blocks: [] };
  }
  function groupsFor(node, context, start = 0, end = node.length) {
    const terms = settings.customTerms || [], raw = node.textContent;
    const cutsProtected = (start > 0 || end < raw.length) && globalThis.QYTextRules.protectedRanges(raw, terms).some(r => (r.start < start && start < r.end) || (r.start < end && end < r.end));
    const masked = !cutsProtected && globalThis.QYTextRules.maskProtectedSentence(raw.slice(start, end), terms);
    if (masked) {
      const piece = splitFragments(node, [{ start, end }])[0], group = groupFor(piece, context);
      group.text = masked.text.trim(); group.protectedTokens = masked.tokens;
      return [group];
    }
    const ranges = [];
    for (const range of proseFragments(node.textContent, start, end)) {
      let cursor = range.start;
      while (range.end - cursor > 2500) {
        let split = cursor + 2500;
        if (/[\uD800-\uDBFF]/.test(raw[split - 1])) split--;
        const space = raw.lastIndexOf(' ', split);
        if (space > cursor + 1800) split = space + 1;
        ranges.push({ start: cursor, end: split }); cursor = split;
      }
      ranges.push({ start: cursor, end: range.end });
    }
    return splitFragments(node, ranges).map(piece => groupFor(piece, context));
  }
  function addBlocks(group, nextId) {
    const chars = [...group.text];
    for (let i = 0; i < chars.length; i += 2500) group.blocks.push({ id: String(nextId()), text: chars.slice(i, i + 2500).join(''), context: group.context, group, status: 'pending', output: '' });
  }
  const terminal = value => ['success', 'error', 'cancelled'].includes(value);
  function receive(task, value) {
    if (task.finished) return;
    Object.assign(task.value, value);
    task.paint?.(task.value);
    if (terminal(task.value.status)) { task.finished = true; tasks.delete(task.id); task.resolve(task.value); }
  }
  function request(extra, paint) {
    const id = crypto.randomUUID(); let resolve;
    const promise = new Promise(r => { resolve = r; });
    const task = { id, value: { id, status: 'queued' }, resolve, paint, finished: false };
    host.dataset.pageTaskId = id;
    tasks.set(id, task); paint?.(task.value);
    void send('TRANSLATE', { id, ...extra }).then(value => {
      if (value.id !== id) throw new Error('已有相同翻译正在处理，请稍后重试');
      if (!task.finished && !task.event) receive(task, value);
    }).catch(e => receive(task, { status: 'error', message: e.message }));
    return { id, promise };
  }
  async function selection(value) {
    await boot;
    if (bootError) { showBar(bootError.message); return; }
    if (selectionRun) await cancelSelection();
    if (pageRun && !pageRun.done) await cancelPage();
    launch.hidden = true; clearTimeout(timer);
    const range = value.range;
    if (!range?.startContainer.isConnected) { showBar('原文位置已改变，请重新选择'); return; }
    const container = range.commonAncestorContainer, nodes = [];
    if (container.nodeType === Node.TEXT_NODE) nodes.push(container);
    else { const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT); while (walker.nextNode()) if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode); }
    const selected = nodes.filter(node => !skipNode(node)).map(node => ({ node, context: contextFor(node), start: node === range.startContainer ? range.startOffset : 0, end: node === range.endContainer ? range.endOffset : node.length }));
    const groups = selected.flatMap(({ node, start, end, context }) => groupsFor(node, context, start, end));
    if (!groups.length) { showBar('选中内容为代码、术语或受保护内容，无需翻译'); return; }
    let id = 0; groups.forEach(group => addBlocks(group, () => id++));
    const batch = groups.flatMap(group => group.blocks);
    if (batch.length > 100) { showBar('选区结构较复杂，请缩小选区'); return; }
    const run = { selection: true, cancelled: false, epoch: presentationEpoch, groups, provider: settings.provider, language: settings.language };
    selectionRun = run;
    bar.hidden = true;
    const feedback = () => {
      if (selectionRun !== run || run.cancelled || run.hidden || !run.feedbackReady || terminal(run.value?.status)) return;
      const label = { queued: '已排队，等待前一项完成', sending: '正在发送选中内容', waiting: '等待 DeepSeek 返回译文', streaming: '正在显示译文' }[run.value?.status] || '正在翻译选中内容…';
      showBar(label, true);
    };
    // Avoid flashing a status bar for cache hits, but make a slow request visible and cancellable.
    run.feedbackTimer = setTimeout(() => { run.feedbackReady = true; feedback(); }, 200);
    const task = request({ kind: 'selection', blocks: batch.map(({ id, text, context }) => ({ id, text, ...(context ? { context } : {}) })) }, value => {
      if (run.cancelled || selectionRun !== run) return;
      run.value = value; feedback();
      if (value.text) displayBlocks(run, batch, partialTranslations(value.text, batch.map(b => b.id)), value.status);
    });
    run.taskId = task.id;
    const valueResult = await task.promise;
    clearTimeout(run.feedbackTimer);
    if (selectionRun === run) selectionRun = null;
    if (run.cancelled || run.epoch !== presentationEpoch) return;
    try {
      if (valueResult.status !== 'success') throw new Error(valueResult.message || '翻译未完成');
      const parsed = JSON.parse(valueResult.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
      if (!parsed || Object.keys(parsed).length !== batch.length || batch.some(b => typeof parsed[b.id] !== 'string' || !parsed[b.id].trim())) throw new Error('返回的译文不完整，请重试');
      if (batch.some(b => !globalThis.QYTextRules.validProtectedMarkers(b.text, parsed[b.id]))) throw new Error('术语或代码保留不完整，原文已恢复');
      if (groups.some(group => !originalUnchanged(group))) throw new Error('原文已变化，请重新选择');
      displayBlocks(run, batch, parsed, 'success');
      for (const group of groups) if (group.card) {
        const data = group.card.node.dataset;
        data.durationMs = valueResult.durationMs ?? ''; data.firstTokenMs = valueResult.firstTokenMs ?? ''; data.estimatedUsd = valueResult.estimatedUsd ?? ''; data.usage = JSON.stringify(valueResult.usage || null);
      }
      bar.hidden = true;
    } catch (error) { for (const group of groups) if (group.card) restoreCard(group.card); showBar(error.message); }
  }
  async function cancelSelection() {
    const run = selectionRun; if (!run) return;
    run.cancelled = true; selectionRun = null; clearTimeout(run.feedbackTimer); bar.hidden = true;
    for (const group of run.groups) if (group.card) restoreCard(group.card);
    const task = tasks.get(run.taskId);
    if (task) receive(task, { status: 'cancelled' });
    if (run.taskId) await send('CANCEL', { id: run.taskId }).catch(() => {});
  }
  function visibleNodes(nodes, ahead = 0) {
    return nodes.some(node => {
      if (!node.isConnected) return false;
      const range = document.createRange(); range.selectNodeContents(node);
      return [...range.getClientRects()].some(r => {
        let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight + ahead, r.bottom);
        if (left >= right || top >= bottom) return false;
        // Respect nested scrolling containers, not just the browser viewport.
        for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
          if (/hidden|clip|auto|scroll/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
          if (/hidden|clip|auto|scroll/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom + (/auto|scroll/.test(style.overflowY) ? ahead : 0)); }
          if (left >= right || top >= bottom) return false;
        }
        return true;
      });
    });
  }
  function indexText(run, node) {
    if (run.index.has(node) || !node.isConnected || !node.parentElement || node.parentElement.closest(excluded) || !/[\p{L}]/u.test(node.textContent)) return;
    const parent = node.parentElement;
    run.index.set(node, parent);
    if (!run.targets.has(parent)) {
      run.targets.set(parent, new Set()); run.visibility.observe(parent);
      const rect = parent.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight + prefetchDistance(run) && rect.right > 0 && rect.left < innerWidth) run.visibleParents.add(parent);
    }
    run.targets.get(parent).add(node);
  }
  function unindexText(run, node) {
    const parent = run.index.get(node); if (!parent) return;
    run.index.delete(node); run.targets.get(parent)?.delete(node);
    if (!run.targets.get(parent)?.size) { run.targets.delete(parent); run.visibleParents.delete(parent); run.visibility.unobserve(parent); }
  }
  function* textNodes(tree, remove = false) {
    if (tree.nodeType === Node.ELEMENT_NODE && !remove && tree.closest(excluded)) return;
    const stack = [tree];
    // Keep sibling references stable when the page or translated text changes.
    while (stack.length) {
      const node = stack.pop();
      yield node; // Empty elements also consume the cooperative scan budget.
      if ((!remove && !node.isConnected) || node.nodeType !== Node.ELEMENT_NODE || (!remove && node.matches(excluded))) continue;
      const children = Array.from(node.childNodes);
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
        if (i % 32 === 0) yield null; // Split even a very wide child list across turns.
      }
    }
  }
  function queueIndex(run, tree, remove = false) {
    if (!tree || run.done || run.cancelled) return;
    if (run.scanQueue.some(job => job.remove === remove && (job.root === tree || job.root.contains(tree)))) return;
    run.scanQueue = run.scanQueue.filter(job => job.remove !== remove || !tree.contains(job.root));
    run.scanQueue.push({ root: tree, remove }); run.indexing = true;
    if (!run.scanTimer) run.scanTimer = setTimeout(() => scanSlice(run), 0);
  }
  function scanSlice(run) {
    run.scanTimer = null;
    if (run.done || run.cancelled || pageRun !== run) return;
    const start = performance.now(); let count = 0;
    while (count < 160 && performance.now() - start < 8) {
      if (!run.scanJob) {
        const job = run.scanQueue.shift(); if (!job) break;
        if (!job.remove && !job.root.isConnected) continue;
        if (!job.remove && job.root === document.body) run.fullScans++;
        run.scanJob = { ...job, iterator: textNodes(job.root, job.remove) };
      }
      const step = run.scanJob.iterator.next();
      if (step.done) { run.scanJob = null; continue; }
      if (step.value?.nodeType === Node.TEXT_NODE) { if (run.scanJob.remove) unindexText(run, step.value); else indexText(run, step.value); }
      count++;
    }
    run.scanSlices++; run.maxScanMs = Math.max(run.maxScanMs, performance.now() - start);
    run.indexing = !!run.scanJob || !!run.scanQueue.length;
    if (run.indexing) run.scanTimer = setTimeout(() => scanSlice(run), 16);
    // Collect a short burst of scan results without waiting for the whole document.
    if (!run.busy) schedulePage(run);
  }
  function seedViewport(run) {
    const seeds = new Set();
    for (const x of [innerWidth * .2, innerWidth * .5, innerWidth * .8]) for (let y = 40; y < innerHeight; y += 160) {
      const hit = document.elementFromPoint(x, y);
      const block = hit?.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,dd,dt,figcaption') || hit;
      if (!block || block === document.body || block === document.documentElement || block.closest(excluded)) continue;
      const rect = block.getBoundingClientRect();
      if (rect.height <= innerHeight && block.childElementCount <= 40) seeds.add(block);
    }
    for (const seed of seeds) {
      // Seed work obeys the same slice budget as the full walk.
      queueIndex(run, seed);
    }
  }
  function collectVisible(run, ahead = 0) {
    const nodes = [];
    // Only observed visible parents need layout checks; the document is indexed once.
    // The index also covers nested scrollers, whose clipping cannot be expanded by rootMargin.
    for (const parent of ahead ? run.targets.keys() : run.visibleParents) {
      const rect = parent.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight + ahead || rect.right <= 0 || rect.left >= innerWidth) continue;
      for (const node of run.targets.get(parent) || []) {
      if (!node.isConnected) { unindexText(run, node); continue; }
      if (skipNode(node, run.scope === 'all') || pageExcluded(node, run) || !visibleNodes([node], ahead)) continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== 'hidden' && style.display !== 'none') nodes.push(node);
      }
    }
    const contextCache = new WeakMap();
    const contexts = new Map(nodes.map(node => [node, contextFor(node, contextCache, ahead, run.scope === 'all')]));
    const groups = nodes.flatMap(node => groupsFor(node, contexts.get(node))).filter(group => visibleNodes([group.node], ahead));
    return groups.sort((a, b) => a.anchor.getBoundingClientRect().top - b.anchor.getBoundingClientRect().top);
  }
  // Read only string values in a flat JSON object. Incomplete escapes are withheld.
  // This never inserts JSON syntax, keys, HTML, or an incomplete Unicode escape.
  function partialTranslations(text, ids) {
    const values = Object.create(null), allowed = new Set(ids);
    const start = /^\s*(?:```(?:json)?\s*)?\{/.exec(text || '');
    if (!start) return values;
    let i = start[0].length;
    const space = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
    function string() {
      if (text[i++] !== '"') return null;
      let value = '';
      while (i < text.length) {
        const c = text[i++];
        if (c === '"') return { value, complete: true };
        if (c === '\\') {
          if (i >= text.length) break;
          const escape = text[i++];
          if (escape === 'u') {
            const hex = text.slice(i, i + 4);
            if (!/^[0-9a-f]{4}$/i.test(hex)) break;
            value += String.fromCharCode(parseInt(hex, 16)); i += 4;
          } else {
            const escapes = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
            if (!(escape in escapes)) break;
            value += escapes[escape];
          }
        } else if (c.charCodeAt(0) >= 32) value += c;
        else break;
      }
      return { value: value.replace(/[\uD800-\uDBFF]$/, ''), complete: false };
    }
    while (i < text.length) {
      space(); if (text[i] === '}') break;
      const key = string(); if (!key?.complete) break;
      space(); if (text[i++] !== ':') break;
      space(); const result = string(); if (!result) break;
      if (allowed.has(key.value)) values[key.value] = result.value;
      if (!result.complete) break;
      space(); if (text[i++] !== ',') break;
    }
    return values;
  }
  function originalUnchanged(group) {
    return group.anchor.isConnected && group.node.textContent === group.originals[0] && (group.card ? group.card.node.isConnected : group.node.isConnected);
  }
  function eligibleGroup(run, group) {
    const parentElement = group.card?.node.parentElement || group.node.parentElement;
    const current = { parentElement, textContent: group.originals[0] };
    if (!parentElement || skipNode(current, run.scope === 'all') || (!run.selection && pageExcluded(current, run))) return false;
    const style = getComputedStyle(parentElement);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }
  function discardPrepared(run, group) {
    if (group.card) { restoreCard(group.card); group.card = null; }
    for (const b of group.blocks) { b.output = ''; b.status = 'skipped'; }
    run.groups?.delete(group.node);
  }
  function displayBlocks(run, batch, parsed, status) {
    if (run.cancelled || (run.selection ? run.epoch !== presentationEpoch : pageRun !== run)) return;
    let painted = false;
    for (const b of batch) {
      const value = parsed[b.id];
      if (typeof value !== 'string' || !originalUnchanged(b.group)) continue;
      if (!eligibleGroup(run, b.group)) { discardPrepared(run, b.group); continue; }
      b.output = value;
      const group = b.group;
      // Preparing a translation must not alter layout before the reader reaches it.
      if (!run.selection && !visibleNodes([group.card?.output || group.node])) continue;
      const combined = group.blocks.map(part => part.output || '').filter(Boolean).join('\n');
      const text = globalThis.QYTextRules.restoreProtectedSentence(combined, group.protectedTokens, status === 'success');
      if (!text) continue;
      group.card ||= makeReplacement(group.node);
      group.card.output.textContent = group.prefix + text + group.suffix; group.card.node.dataset.status = status; painted = true;
    }
    return painted;
  }
  function prefetchDistance() {
    const screens = settings.prefetchScreens ?? 2;
    return screens && !document.hidden ? Math.min(4000, innerHeight * screens) : 0;
  }
  function paintReadyVisible(run) {
    if (!run || run.done || run.cancelled || pageRun !== run) return;
    for (const group of run.groups.values()) {
      if (!originalUnchanged(group) || !group.blocks.some(b => b.output) || !visibleNodes([group.card?.output || group.node])) continue;
      const status = group.blocks.every(b => b.status === 'success') ? 'success' : 'streaming';
      displayBlocks(run, group.blocks, Object.fromEntries(group.blocks.map(b => [b.id, b.output])), status);
    }
  }
  function pageCandidates(run, ahead = 0) {
    const candidates = [];
    for (const discovered of collectVisible(run, ahead)) {
      let group = run.groups.get(discovered.node);
      if (!group || group.text !== discovered.text || group.originals[0] !== discovered.originals[0]) {
        if (group?.card) restoreCard(group.card);
        group = { ...discovered, blocks: [] }; run.groups.set(group.node, group);
        const chars = [...group.text];
        if (run.characters + chars.length > 200000) throw new Error('本页累计翻译内容较长，请刷新或选择部分内容翻译');
        run.characters += chars.length;
        for (let i = 0; i < chars.length; i += 2500) {
          if (run.total >= 1500) throw new Error('本页段落过多，请刷新或选择部分内容翻译');
          group.blocks.push({ id: String(run.total++), text: chars.slice(i, i + 2500).join(''), context: group.context, group, status: 'pending', output: '' });
        }
      }
      candidates.push(...group.blocks.filter(b => b.status === 'pending' || (!ahead && b.status === 'deferred')));
    }
    for (const group of run.groups.values()) if (group.card && originalUnchanged(group) && visibleNodes([group.card.output], ahead)) candidates.push(...group.blocks.filter(b => b.status === 'pending' || (!ahead && b.status === 'deferred')));
    return [...new Set(candidates)];
  }
  function interruptPrefetch(run, force = false) {
    if (!run || run.provider !== 'api' || run.batchKind !== 'prefetch' || !run.taskId || run.interruptId || run.done || run.cancelled) return;
    if (!force) {
      if (run.currentBatch.some(b => visibleNodes([b.group.card?.output || b.group.node]))) return;
      const current = new Set(run.currentBatch.map(b => b.group.node));
      const demand = collectVisible(run).some(group => {
        const known = run.groups.get(group.node);
        return !current.has(group.node) && (!known || known.originals[0] !== group.originals[0] || known.blocks.some(b => b.status !== 'success'));
      });
      if (!demand) return;
    }
    const id = run.taskId; run.interruptId = id;
    void send('CANCEL', { id }).then(() => {
      const task = tasks.get(id);
      if (task) receive(task, { status: 'cancelled', message: '优先翻译当前屏幕' });
    }).catch(() => { if (run.interruptId === id) run.interruptId = null; });
  }
  function updatePageStats(run) {
    host.dataset.pageScanSlices = String(run.scanSlices || 0); host.dataset.pageMaxScanMs = String(run.maxScanMs || 0);
    host.dataset.pageFirstRequestMs = run.firstRequestMs == null ? '' : String(run.firstRequestMs);
    host.dataset.pageFirstPaintMs = run.firstPaintMs == null ? '' : String(run.firstPaintMs);
    host.dataset.pageFullScans = String(run.fullScans || 0); host.dataset.pageIndexedNodes = String(run.index?.size || 0);
    host.dataset.pageBlocks = String(run.total); host.dataset.pageCompleted = String(run.count);
    host.dataset.pageDurationMs = String(run.activeMs); host.dataset.pageEstimatedUsd = run.usageKnown ? String(run.usd) : '';
    host.dataset.pageInputTokens = String(run.inputTokens); host.dataset.pageOutputTokens = String(run.outputTokens);
    host.dataset.pagePrepared = String([...run.groups.values()].filter(g => !g.card && g.blocks.every(b => b.status === 'success')).length);
  }
  function schedulePage(run) {
    if (!run || run.cancelled || run.done || pageRun !== run || run.timer != null) return;
    // An absolute collection window: ongoing DOM/scroll events must not keep postponing it.
    run.timer = setTimeout(() => {
      run.timer = null;
      if (!run.cancelled && !run.done && pageRun === run) {
        paintReadyVisible(run);
        if (run.busy) interruptPrefetch(run);
        else void translateVisible(run);
      }
    }, 80);
  }
  function disconnectPage(run) {
    clearTimeout(run.timer); run.timer = null; clearTimeout(run.scanTimer); run.scanTimer = null; run.scanQueue = []; run.scanJob = null; run.indexing = false; run.observer?.disconnect(); run.visibility?.disconnect();
    window.removeEventListener('scroll', run.onScroll, true); window.removeEventListener('resize', run.onScroll);
    document.removeEventListener('visibilitychange', run.onVisibility);
  }
  async function cancelPage() {
    const run = pageRun;
    if (!run || run.done) return;
    run.cancelled = true; run.done = true; run.paused = false; resume.hidden = true; disconnectPage(run);
    if (run.currentBatch) for (const group of new Set(run.currentBatch.map(b => b.group))) if (group.card) { restoreCard(group.card); group.card = null; }
    host.dataset.pageStatus = 'cancelled'; bar.hidden = true;
    if (run.taskId) await send('CANCEL', { id: run.taskId }).catch(() => {});
  }
  async function translateVisible(run) {
    if (run.busy || run.done || run.cancelled || pageRun !== run) return;
    run.busy = true;
    try {
      while (!run.cancelled && pageRun === run) {
        if (!settings.enabled || settings.provider !== run.provider || settings.language !== run.language) throw new Error('翻译设置已改变，请重新开始页面翻译');
        paintReadyVisible(run);
        let candidates = pageCandidates(run), kind = 'page';
        const ahead = prefetchDistance(run), budget = (settings.prefetchScreens ?? 2) * 5000 - (run.prefetchChars || 0);
        if (!candidates.length && ahead && budget > 0) {
          kind = 'prefetch'; let chars = 0;
          candidates = pageCandidates(run, ahead).filter(b => {
            if (chars + b.text.length > budget) return false;
            chars += b.text.length; return true;
          });
        }
        if (!candidates.length) {
          host.dataset.pageStatus = run.indexing ? 'indexing' : 'waiting-scroll';
          if (run.indexing && !run.count) showBar('正在查找当前可见内容…', true);
          else { bar.hidden = !run.showControls; if (run.showControls) showBar(`后续内容已准备 · 已完成 ${run.count} 段`, true); }
          break;
        }
        // Pack visible fragments by actual payload size, sharing repeated context.
        const batch = globalThis.QYTextRules.viewportBatch(candidates, run.provider);
        batch.forEach(b => { b.status = 'working'; });
        run.batchKind = kind;
        if (kind === 'prefetch') run.prefetchChars = (run.prefetchChars || 0) + batch.reduce((sum, b) => sum + b.text.length, 0);
        host.dataset.pageStatus = 'running'; updatePageStats(run);
        if (kind === 'page' || run.showControls) showBar(`${kind === 'prefetch' ? '正在准备下方内容' : '正在翻译当前屏幕'} · 已完成 ${run.count} 段`, true);
        else bar.hidden = true;
        const startedAt = Date.now();
        run.firstRequestMs ??= performance.now() - run.startedAt; updatePageStats(run);
        const task = request({ kind, blocks: batch.map(({ id, text, context }) => ({ id, text, ...(context ? { context } : {}) })) }, value => {
          if (run.cancelled || pageRun !== run || (run.interruptId && run.interruptId === value.id)) return;
          if (value.text) {
            const parsed = partialTranslations(value.text, batch.map(b => b.id));
            if (displayBlocks(run, batch, parsed, value.status)) run.firstPaintMs ??= performance.now() - run.startedAt;
          }
          const label = { queued: '已排队，等待前一项完成', sending: '正在发送当前屏幕', waiting: '等待 DeepSeek 返回译文', streaming: '正在显示译文' }[value.status];
          if (label && (kind === 'page' || run.showControls || batch.some(b => visibleNodes([b.group.card?.output || b.group.node])))) showBar(`${kind === 'prefetch' ? '正在准备后续译文' : label} · 已完成 ${run.count} 段`, true);
        });
        run.currentBatch = batch; run.taskId = task.id;
        const value = await task.promise; run.taskId = null; run.activeMs += Date.now() - startedAt;
        if (run.cancelled || pageRun !== run) break;
        run.inputTokens += value.usage?.prompt_tokens || 0; run.outputTokens += value.usage?.completion_tokens || 0; run.usd += value.estimatedUsd || 0;
        if (!value.cached && value.estimatedUsd == null) run.usageKnown = false;
        let parsed;
        try {
          if (value.status !== 'success') throw new Error(value.message || '页面翻译中断');
          parsed = JSON.parse(value.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
          if (!parsed || Object.keys(parsed).length !== batch.length || batch.some(b => typeof parsed[b.id] !== 'string' || !parsed[b.id].trim())) throw new Error('返回的段落不完整，请重新开启页面翻译');
          if (batch.some(b => !globalThis.QYTextRules.validProtectedMarkers(b.text, parsed[b.id]))) throw new Error('术语或代码保留不完整，请继续翻译');
        } catch (error) {
          if (kind !== 'prefetch') throw error;
          host.dataset.pageLastPrefetchError = error.message || '预翻译未完成';
          // Failed/obsolete prefetch waits until it is actually visible; no background retry loop.
          for (const b of batch) { b.status = 'deferred'; b.output = ''; }
          for (const group of new Set(batch.map(b => b.group))) if (group.card) { restoreCard(group.card); group.card = null; }
          run.currentBatch = null; run.batchKind = null; run.interruptId = null;
          continue;
        }
        run.interruptId = null;
        const valid = batch.filter(b => originalUnchanged(b.group) && eligibleGroup(run, b.group));
        host.dataset.pageLastBatchKind = kind;
        host.dataset.pageLastBatchSize = String(batch.length);
        host.dataset.pageLastBatchValid = String(valid.length);
        for (const group of new Set(batch.filter(b => !valid.includes(b)).map(b => b.group))) {
          if (group.card) { restoreCard(group.card); group.card = null; }
          run.groups.delete(group.node); if (group.anchor.isConnected) queueIndex(run, group.anchor);
        }
        displayBlocks(run, valid, parsed, 'success'); valid.forEach(b => { b.status = 'success'; });
        run.count += valid.length; run.currentBatch = null; run.batchKind = null; updatePageStats(run);
        // Re-read the viewport: rendering can push unread paragraphs below the fold.
      }
    } catch (error) {
      if (run.currentBatch) for (const group of new Set(run.currentBatch.map(b => b.group))) if (group.card) { restoreCard(group.card); group.card = null; }
      if (run.currentBatch) for (const b of run.currentBatch) { if (b.status === 'working') { b.status = 'pending'; b.output = ''; } }
      run.currentBatch = null; run.done = true; run.paused = true; disconnectPage(run); host.dataset.pageStatus = 'error';
      showBar(`已保留 ${run.count} 段译文 · ${error.message}`);
    } finally { run.busy = false; updatePageStats(run); }
  }
  async function wholePage(scope = 'smart') {
    showBar('正在准备页面翻译…');
    await boot;
    if (bootError) { showBar(bootError.message); return; }
    if (pageRun && !pageRun.done) {
      if (scope === 'all' && pageRun.scope !== 'all') {
        pageRun.scope = 'all'; queueIndex(pageRun, document.body);
        showBar(`已切换为全部可读内容 · 已完成 ${pageRun.count} 段`, true);
      } else showBar(`滚动翻译已开启 · 已完成 ${pageRun.count} 段`, true);
      pageRun.showControls = true; schedulePage(pageRun); return;
    }
    if (tasks.size) { showBar('本页仍有翻译在处理，请等待完成后开启页面翻译'); return; }
    const previous = pageRun?.paused ? pageRun : null;
    if (!previous) restoreAll();
    const run = previous || { startedAt: performance.now(), cancelled: false, done: false, busy: false, groups: new Map(), total: 0, count: 0, characters: 0, usd: 0, usageKnown: true, inputTokens: 0, outputTokens: 0, activeMs: 0, provider: settings.provider, language: settings.language };
    run.scope = scope === 'all' ? 'all' : (run.scope || 'smart');
    run.done = false; run.cancelled = false; run.paused = false; resume.hidden = true;
    pageRun = run; showBar(`正在查找当前可见内容 · 已完成 ${run.count} 段`, true);
    run.scanQueue = []; run.scanJob = null; run.scanTimer = null; run.scanSlices = 0; run.maxScanMs = 0;
    run.index = new Map(); run.targets = new Map(); run.visibleParents = new Set(); run.fullScans = 0;
    run.visibility = new IntersectionObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        if (!run.targets.has(entry.target)) continue;
        const visible = entry.isIntersecting;
        if (visible !== run.visibleParents.has(entry.target)) changed = true;
        if (visible) run.visibleParents.add(entry.target); else run.visibleParents.delete(entry.target);
      }
      if (changed) schedulePage(run);
    }, { rootMargin: `0px 0px ${prefetchDistance(run)}px 0px`, threshold: 0 });
    seedViewport(run);
    // Preserve viewport seeds ahead of the full document walk.
    run.scanQueue.push({ root: document.body, remove: false }); run.indexing = true;
    if (!run.scanTimer) run.scanTimer = setTimeout(() => scanSlice(run), 0);
    run.prefetchChars = 0;
    const scrollRoot = document.scrollingElement || document.documentElement;
    const offset = element => `${element.scrollTop || 0}:${element.scrollLeft || 0}:${innerHeight}`;
    run.scrollOffsets = new Map([[scrollRoot, offset(scrollRoot)]]);
    run.onScroll = event => {
      const element = event?.target?.nodeType === 1 ? event.target : scrollRoot;
      const value = offset(element);
      if (run.scrollOffsets.get(element) !== value) { run.scrollOffsets.set(element, value); run.prefetchChars = 0; }
      schedulePage(run);
    };
    run.onVisibility = () => { if (document.hidden) interruptPrefetch(run, true); else schedulePage(run); };
    document.addEventListener('visibilitychange', run.onVisibility);
    window.addEventListener('scroll', run.onScroll, { passive: true, capture: true }); window.addEventListener('resize', run.onScroll);
    run.observer = new MutationObserver(records => {
      const owned = node => { const e = node.nodeType === 1 ? node : node.parentElement; return !!e?.closest('[data-qy-inline],[data-qy-root]'); };
      let changed = false;
      for (const record of records) {
        if (owned(record.target)) continue;
        if (record.type === 'characterData') { unindexText(run, record.target); queueIndex(run, record.target); changed = true; }
        else if (record.type === 'attributes') {
          // Style/theme changes only invalidate visibility; observers already track the nodes.
          if (!['class', 'style'].includes(record.attributeName) || /monaco-editor|CodeMirror|cm-editor|ace_editor|terminal|blob-code/.test(record.oldValue || '')) queueIndex(run, record.target);
          changed = true;
        }
        else {
          for (const node of record.removedNodes) { queueIndex(run, node, true); changed = true; }
          for (const node of record.addedNodes) if (!owned(node)) { queueIndex(run, node); changed = true; }
        }
      }
      if (changed) schedulePage(run);
    });
    run.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'aria-hidden', 'translate', 'class', 'style', 'type', 'autocomplete'] });
  }
  resume.onclick = () => { void wholePage(); };
  stopPage.onclick = () => { if (selectionRun) void cancelSelection(); else void cancelPage(); };
  function clear() { void cancelSelection(); void cancelPage(); if (pageRun) pageRun.paused = false; resume.hidden = true; restoreAll(); bar.hidden = true; launch.hidden = true; }
  restore.onclick = clear; hide.onclick = () => { if (selectionRun) selectionRun.hidden = true; if (pageRun) pageRun.showControls = false; bar.hidden = true; };
  launch.onpointerdown = e => e.preventDefault(); launch.onclick = () => { if (snapshot) void selection(snapshot); };
  pageLaunch.onpointerdown = e => e.preventDefault(); pageLaunch.onclick = () => { showBar('正在准备页面翻译…'); void send('PAGE_REQUEST', { scope: 'all' }).catch(e => showBar(e.message)); };
  document.addEventListener('selectionchange', selected);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') launch.hidden = true; });
  document.addEventListener('pointerdown', e => { if (!e.composedPath().includes(host)) launch.hidden = true; });
  window.addEventListener('scroll', () => { if (!launch.hidden) position(); }, { passive: true, capture: true });
  window.addEventListener('resize', () => { launch.hidden = true; });
  function navigationChanged() {
    if (pageUrl === location.href) return;
    pageUrl = location.href; clear();
    for (const task of tasks.values()) receive(task, { status: 'cancelled', message: '页面已更换' });
    instance = crypto.randomUUID(); boot = hello();
  }
  window.addEventListener('pageshow', event => { if (event.persisted) { clear(); for (const task of tasks.values()) receive(task, { status: 'cancelled', message: '页面已恢复' }); instance = crypto.randomUUID(); boot = hello(); } });
  window.navigation?.addEventListener('currententrychange', navigationChanged); window.addEventListener('popstate', navigationChanged);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'RESULT') {
      host.dataset.pageLastResult = message.status || '';
      host.dataset.pageLastResultId = message.id || '';
      host.dataset.pageLastResultMatch = String(message.instance === instance && tasks.has(message.id));
    }
    if (sender.id !== chrome.runtime.id || sender.tab || message?.channel !== 'qy-source') return;
    if (message.type === 'TRIGGER') { navigationChanged(); try { snapshot = readSelection(message); void selection(snapshot); } catch (e) { showBar(e.message); } }
    else if (message.type === 'PAGE') { navigationChanged(); void wholePage(message.scope); }
    else if (message.type === 'RESULT' && message.instance === instance) { const task = tasks.get(message.id); if (task) { task.event = true; receive(task, message); } }
    else if (message.type === 'PING') { navigationChanged(); respond({ ok: message.instance === instance }); return; }
    else if (message.type === 'SETTINGS') { const termsChanged = JSON.stringify([settings.customTerms || [], settings.siteModes || {}]) !== JSON.stringify([message.settings.customTerms || [], message.settings.siteModes || {}]); settings = message.settings; syncLaunches(); if (selectionRun && (termsChanged || !settings.enabled || settings.provider !== selectionRun.provider || settings.language !== selectionRun.language)) void cancelSelection(); if (pageRun && (termsChanged || !settings.enabled || settings.provider !== pageRun.provider || settings.language !== pageRun.language)) { if (pageRun.paused) { pageRun.paused = false; resume.hidden = true; } void cancelPage(); } }
    else if (message.type === 'CLEAR') clear();
    respond({ ok: true });
  });
})();
