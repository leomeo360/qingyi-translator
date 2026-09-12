# Benchmarks / 性能测试

## Evidence boundaries / 数据边界

Historical tables were calculated from `reports/api-pages.json`: ten Python documentation
pages, one run per page, historical API-only measurements. No claim of 100 completed
runs or independent website coverage is made. Tokens include prompt overhead and
output structure. The historical runner predates current production batching; its
results do not certify version 2.9 end-to-end speed.

现有数据是同一网站十篇文章、各一次 API 调用的历史记录，不能替代跨网站实测。
历史脚本不完全等同于当前扩展调度，不能作为 2.9 浏览器端到端速度的保证。

## Ten websites × ten runs / 十站各十次

Status: see the current results in README and reports/benchmark-100-results.json. Run each fixed public page ten times
in rotating site order. Preserve exact URL, extraction hash, character count,
model, timestamp, success/failure, request count, first token, completion time,
input/output/cache-hit tokens and cost assumptions. Do not discard errors or slow
runs. Report successful sample count, mean, median, nearest-rank p95 and range;
report failure rate over all ten attempts. Never replace a failed target silently.

| Website | Fixed candidate URL | Coverage |
|---|---|---|
| Wikipedia | https://en.wikipedia.org/wiki/Machine_translation | Encyclopedia |
| GitHub | https://github.com/microsoft/vscode | Repository UI |
| MDN | https://developer.mozilla.org/en-US/docs/Web/JavaScript | Technical documentation |
| Stack Overflow | https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array | Q&A |
| BBC | https://www.bbc.com/news | News |
| Reddit | https://www.reddit.com/r/programming/ | Discussion feed |
| npm | https://www.npmjs.com/package/react | Package page |
| Python | https://docs.python.org/3/tutorial/appetite.html | Tutorial |
| Node.js | https://nodejs.org/en/learn/getting-started/introduction-to-nodejs | Developer article |
| W3Schools | https://www.w3schools.com/js/js_intro.asp | Learning page |

API tests translate an explicitly extracted text snapshot, not a live interactive
page. Record extraction scope and never label truncated excerpts “whole-page”.
This run takes the first up to 5,000 extracted characters, including interface/navigation text. It is a text-sample workload, not full-page performance. Keep full text local to avoid redistributing third-party articles. Sites that
block extraction must be reported as blocked; browser validation is separate.

Use `python3 scripts/prepare-benchmark-100.py` to collect current excerpts (full text stays gitignored), inspect the extraction, then `node scripts/benchmark-100.mjs` after preparing local
`reports/benchmark-100-inputs.json`: an array of exactly ten objects with unique
`url`, `title`, and `blocks: [{id: "b1", text: "..."}]`. Obtain snapshots from the
selected public pages and inspect extraction for completeness. Set DEEPSEEK_API_KEY
or use /private/tmp/qingyi-benchmark-key. Output contains metrics and hashes only.
The runner performs ten rounds, no automatic retry, and validates structured
translation. Errors count as attempts; partial usage is retained where returned.
Unknown usage is not counted as zero cost. Provider billing is authoritative.

真正的浏览器验收还应固定 Chrome/系统版本、设备、网络、视口 1440×900、目标简体中文，
记录从点击到首段实际绘制、点击时首屏全部可译正文完成两个时间点。每次冷启动页面，
保持默认两屏预翻译，固定首屏范围；后台预取不延长首屏完成时间。另记录滚动时预取命中率、
命中后的绘制时间、未命中等待时间；可关闭预取作为对照。费用包含首屏和后台实际消耗，
不能因为后台时间不计入首屏等待就删除后台费用。禁止将 API 首 token 或样本完成时间写成真实首屏耗时。

## Other scheduled tests / 其他可安排的测试

| Test / 项目 | Method / 方法 | Report / 记录 |
|---|---|---|
| Translation quality / 质量 | Blind review 50 sentences across news, technical and discussion text; two bilingual reviewers | Accuracy, omissions, terminology, disagreement; not yet run |
| Coverage / 覆盖率 | Compare eligible source text units with displayed translations on ten sites | Translated/eligible units, missed regions; not yet run |
| Layout / 排版 | Check links, buttons, code, icons and iframes before/after | Broken controls and protected-text changes; local regression coverage exists, live-site matrix pending |
| Cache / 缓存 | Repeat same page and scroll back under cold/warm conditions | Requests and tokens saved; mocks must be labeled |
| Prefetch / 预取 | Compare off vs two screens over identical scroll trace | Visible latency, wasted tokens, cancellations; live run pending |
| Reliability / 稳定性 | 401/429, network cutoff, cancellation, dynamic DOM | Recovery, duplicate billing, partial results; unit coverage exists |
| Resource use / 资源 | 1,800-paragraph fixture, idle vs translating | CPU, memory, long tasks; browser measurements pending |
| Privacy / 隐私 | Synthetic credential strings and input fields, inspect outbound payload | Leaks detected, false exclusions; never use real secrets |

Run quick local checks with `npm test` and `npm run check`. Historical reports are
not independent audits. No competitor ranking is published without equivalent
page snapshots, settings and same-session measurements.

Actual source substitutions and extraction scope are recorded in [source metadata](../reports/benchmark-100-sources.json). Stack Overflow, Reddit and npm extraction failed; Ubuntu, Rust and Firefox replaced them. The Mozilla support candidate also had insufficient text. No claim of successful access to excluded sites is made.

Summarize completed records with `python3 scripts/summarize-benchmark-100.py`. This updates both README tables. Different collection dates can yield different text hashes.

The custom API harness uses b-prefixed sample IDs and direct `translateApi`/`parseBlocks` calls, not the extension background worker, DOM protection preprocessing or two-lane scheduler. Failures describe this harness workload; diagnose them before attributing them to the installed extension. Returned translations are not retained, so this run does not support a translation-quality score or a precise root-cause classification for errors.
