# Qingyi · Free for personal use, source-available AI webpage translator

[简体中文](README.zh-CN.md) · English

Read foreign-language webpages in place. Qingyi is a Chrome extension that translates selected text and webpage content while preserving links, typography and layout. Personal noncommercial use is free; commercial use requires a separate license; API usage is billed by your provider.

## Two ways to translate

| Mode | How it works | Current support | Cost |
|---|---|---|---|
| Browser session | Connect an already open, signed-in LLM tab; no API key required | DeepSeek | No API charges from Qingyi; provider limits and terms apply |
| Bring your own key | Save your own key and send translation requests directly to the provider | DeepSeek API (`deepseek-flash`) | Provider token charges |

Doubao, other browser LLMs and configurable OpenAI-compatible endpoints are planned, **not supported in this release**. Browser mode needs a dedicated connected conversation; avoid typing in it during translation. It depends on the provider's website UI and may break when that UI changes.

## Install and use

Requires Chrome 120 or newer. Download the [v2.9.0 extension ZIP](https://github.com/leomeo360/qingyi-translator/releases/tag/v2.9.0), extract it and load that folder; alternatively, download this repository, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/`. No build step is required.

1. Open the extension and connect a signed-in DeepSeek tab, or save your DeepSeek API key.
2. Select text and press `Alt+Shift+T`, or use the context menu.
3. Choose webpage body translation for reading, or all readable content (`Alt+W`) for navigation and interface text.
4. Scroll to translate more content. Cancel or restore the original through the progress control; refreshing also restores the source.

Translation streams into the original page. Code, paths, URLs, input fields and sensitive regions are protected by best-effort filtering. Cross-origin frames require permission. Scroll prefetch defaults to roughly two screens and can use tokens for content you never read; disable it to reduce speculative usage. This is in-place replacement, not a side-by-side bilingual view.

## Reading experience: first viewport, then prefetch

Qingyi prioritizes visible text and streams translations in place. After the first viewport finishes, it prepares roughly two screens ahead. When scrolling reaches completed prefetched content, translations display from memory without another model wait. Background prefetch time is excluded from first-viewport latency, but its tokens and cost remain billable.

**Real-browser first-viewport timing has not been measured yet.** Measure click-to-first-painted-translation and click-to-complete-translation of the initial viewport separately. Existing 4–5 second API excerpt completion figures are not either metric and have moved to a [technical report](docs/API_SAMPLE_TIMINGS.md). The historical 82 ms mocked cache-paint result excludes model/network time.

Fast scrolling beyond the prepared range, slow requests, failed prefetch or changed page content can still require waiting. This is a rolling prefetch window, not a guarantee that all remaining page content is ready. [Benchmark protocol](docs/BENCHMARKS.md).

## Reconciled actual cost

The maintainer reports **CNY 0.38** in the DeepSeek console for the 22:00–23:00 billing period. All token counts match the 100 attempts / 140 returned API usages exactly: **220,199 total**, comprising **97,408 cache-hit input**, **35,272 cache-miss input**, and **87,519 output**. Input total is 132,680, not 220,199.

At the same workload and cache mix, this is **CNY 0.0038 per attempt, CNY 0.38 per 100 attempts/day, or CNY 11.40 per 30 days**. It includes failed attempts and is not a quote for 100 successful full webpages or just their first viewport. Prefetch, length, retries, cache mix and time of day affect cost.

[Official CNY pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/), checked 2026-09-12: off-peak cache-hit input / cache-miss input / output cost CNY 0.02 / 1 / 4 per million tokens. Peak rates are twice those amounts, Monday–Friday 09:00–12:00 and 14:00–18:00 China time.

The public tariff gives CNY 0.38729616 for these tokens, versus the reported CNY 0.38 bill. The CNY 0.00729616 difference is unresolved; do not assume rounding. Use the reported console amount for observed expenditure, and label site-level figures as tariff estimates. The extension's existing export still reports USD estimates; these documentation changes do not change that UI. Browser-session token usage is unavailable, not zero.

## Privacy and development

Keys remain in local extension storage and are used by the background worker, not exposed to webpage content scripts. Translation text is sent to DeepSeek in either mode, and browser-mode conversations may remain in your provider account. There is no project translation server. Filtering is not a guarantee that every sensitive string will be detected; review what you translate.

```sh
npm test
npm run check
npm run package
```

Node.js 20+ and Python 3 are recommended for local development. See [test plan](docs/BENCHMARKS.md), [historical reports](TEST_REPORT.md), and [contributing](CONTRIBUTING.md). Project code is under the [Qingyi Personal Noncommercial License](LICENSE); commercial use requires separate written authorization; third-party fixtures retain their own licenses, see [notices](THIRD_PARTY_NOTICES.md). Not affiliated with DeepSeek or Doubao.

<!-- LIVE_BENCHMARK -->

## Ten sites × ten attempts: reconciled usage

100 fixed text-excerpt attempts, 83 structurally validated successes. Each excerpt contains up to 5,000 characters of prose/UI text. This is not a browser first-viewport benchmark. Usage includes failed attempts. Per-site prices below use the official off-peak CNY tariff; they are estimates, not per-site invoices or first-viewport-only costs.

| Site | Validated/attempts | Mean cache-hit input tokens | Mean cache-miss input tokens | Mean output tokens | Estimated CNY/attempt |
|---|---:|---:|---:|---:|---:|
| [en.wikipedia.org](https://en.wikipedia.org/wiki/Machine_translation) | 4/10 | 1049.6 | 285.4 | 991.2 | 0.00427 |
| [github.com](https://github.com/microsoft/vscode) | 10/10 | 1062.4 | 519.6 | 965.1 | 0.00440 |
| [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/JavaScript) | 0/10 | 1049.6 | 301.4 | 1260.8 | 0.00537 |
| [www.bbc.com](https://www.bbc.com/news) | 9/10 | 1408.0 | 532.0 | 1251.0 | 0.00556 |
| [docs.python.org](https://docs.python.org/3/tutorial/appetite.html) | 10/10 | 934.4 | 287.6 | 830.3 | 0.00363 |
| [nodejs.org](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs) | 10/10 | 588.8 | 245.2 | 490.2 | 0.00222 |
| [www.w3schools.com](https://www.w3schools.com/js/js_intro.asp) | 10/10 | 1062.4 | 502.6 | 884.8 | 0.00406 |
| [ubuntu.com](https://ubuntu.com/desktop) | 10/10 | 1292.8 | 399.2 | 1053.9 | 0.00464 |
| [rust-lang.org](https://rust-lang.org/learn/) | 10/10 | 588.8 | 189.2 | 434.1 | 0.00194 |
| [www.mozilla.org](https://www.mozilla.org/en-US/firefox/new/) | 10/10 | 704.0 | 265.0 | 590.5 | 0.00264 |

[API excerpt completion times](docs/API_SAMPLE_TIMINGS.md) are retained separately. The roughly 4–5 second sample completion time is not first-viewport or per-scroll waiting time. The 83/100 validation rate belongs to this custom harness, not a measured whole-page extension success rate; failures need further diagnosis.

[Raw records / 原始数据](reports/benchmark-100-results.json) · [Billing reconciliation / 账单核对](reports/benchmark-100-billing.json) · [Summary / 汇总](reports/benchmark-100-summary.json) · [Sources / 来源](reports/benchmark-100-sources.json)
