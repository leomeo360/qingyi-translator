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

## Performance: what we have actually measured

The repository contains **10 Python documentation snapshots, one API run each**, recorded on 2026-09-10. They are ten pages of one website, not ten different websites and not a 100-run benchmark. The numbers below are historical repository records, not rerun measurements from this publication task. They measure API processing of extracted text, excluding live page loading, DOM extraction, scrolling and screen painting. Local translation cache was bypassed.

| Page | Runs | Seconds | Input tokens | Output tokens | USD estimate |
|---|---:|---:|---:|---:|---:|
| [1. Whetting Your Appetite](https://docs.python.org/3/tutorial/appetite.html) | 1 | 4.494 | 1109 | 830 | 0.00066435 |
| [2. Using the Python Interpreter](https://docs.python.org/3/tutorial/interpreter.html) | 1 | 4.827 | 1416 | 1119 | 0.00088380 |
| [10. Brief tour of the standard library](https://docs.python.org/3/tutorial/stdlib.html) | 1 | 5.544 | 1578 | 1213 | 0.00096450 |
| [11. Brief tour of the standard library — part II](https://docs.python.org/3/tutorial/stdlib2.html) | 1 | 6.435 | 1811 | 1438 | 0.00113445 |
| [12. Virtual Environments and Packages](https://docs.python.org/3/tutorial/venv.html) | 1 | 4.584 | 1301 | 1008 | 0.00079995 |
| [13. What Now?](https://docs.python.org/3/tutorial/whatnow.html) | 1 | 3.052 | 850 | 635 | 0.00050850 |
| [14. Interactive Input Editing and History Substitution](https://docs.python.org/3/tutorial/interactive.html) | 1 | 2.089 | 511 | 374 | 0.00030105 |
| [15. Floating-Point Arithmetic: Issues and Limitations](https://docs.python.org/3/tutorial/floatingpoint.html) | 1 | 9.180 | 2629 | 2065 | 0.00163335 |
| [16. Appendix](https://docs.python.org/3/tutorial/appendix.html) | 1 | 4.266 | 1267 | 1008 | 0.00079485 |
| [8. Errors and Exceptions](https://docs.python.org/3/tutorial/errors.html) | 1 | 10.745 | 3161 | 2358 | 0.00188895 |

Mean completion: **5.522 s/page**; range **2.089–10.745 s**. Mean input/output: **1,563.3 / 1,204.8 tokens** (2,768.1 total). All 10 records succeeded. This suggests low cost for these short documentation samples, but several seconds of waiting remain. The sample cannot establish typical website performance, translation quality, tail latency, or superiority over another extension.

Raw evidence: [API records](reports/api-pages.json). [Reproduction scripts and limitations](docs/BENCHMARKS.md). A historical mocked browser check showed cached text displayed in 82 ms; that excludes LLM/network time and is not a live translation claim.

## Tokens and daily cost

The table preserves historical estimates, not invoices. Historical assumptions in the code are USD per million tokens: cache-hit input $0.006, uncached input $0.30, output $1.20; off-peak multiplier 0.5. These rates were verified against [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) on 2026-09-12. Peak hours are Monday–Friday 01:00–04:00 and 06:00–10:00 UTC (09:00–12:00 and 14:00–18:00 in China); all other times are off-peak. Prices may change.

`USD = (cached_input × hit_rate + uncached_input × input_rate + output × output_rate) / 1,000,000 × time_multiplier`

Using the measured sample mix: **$0.000957/page, $0.09574 per 100 pages/day, $2.87213 per 30 days** at the historical off-peak rate. With the same token mix at the historical peak rate: **$0.19148/day, $5.74425/month**. This extrapolates ten samples; it is not a measured daily bill. Long pages, retries, target language, prompts and prefetch change usage. Website-session mode exposes no authoritative token bill: token usage is **unavailable**, not zero. Export recent task usage from advanced settings; estimates do not replace provider billing.

## Privacy and development

Keys remain in local extension storage and are used by the background worker, not exposed to webpage content scripts. Translation text is sent to DeepSeek in either mode, and browser-mode conversations may remain in your provider account. There is no project translation server. Filtering is not a guarantee that every sensitive string will be detected; review what you translate.

```sh
npm test
npm run check
npm run package
```

Node.js 20+ and Python 3 are recommended for local development. See [test plan](docs/BENCHMARKS.md), [historical reports](TEST_REPORT.md), and [contributing](CONTRIBUTING.md). Project code is under the [Qingyi Personal Noncommercial License](LICENSE); commercial use requires separate written authorization; third-party fixtures retain their own licenses, see [notices](THIRD_PARTY_NOTICES.md). Not affiliated with DeepSeek or Doubao.

<!-- LIVE_BENCHMARK -->

## New ten-site × ten-attempt benchmark

2026-09-12: fixed excerpts of up to 5,000 characters per site, including prose and UI text, not whole pages. API-only sequential batching, not extension parallel scheduling or click-to-paint timing. Ten attempts per site, no automatic retries. Mean/median/p95 include successes only; failures remain in the denominator. Nearest-rank p95 is usually the maximum with this sample size.

Overall mean successful completion time: 4.519 seconds.

| Website / 网站 | Success / 次数 | Mean s | Median s | P95 s | Input tokens | Output tokens | USD/success |
|---|---:|---:|---:|---:|---:|---:|---:|
| [en.wikipedia.org](https://en.wikipedia.org/wiki/Machine_translation) | 4/10 | 5.256 | 5.259 | 5.366 | 1335.0 | 986.2 | 0.000623 |
| [github.com](https://github.com/microsoft/vscode) | 10/10 | 5.290 | 5.308 | 5.874 | 1582.0 | 965.1 | 0.000660 |
| [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/JavaScript) | 0/10 | N/A | N/A | N/A | N/A | N/A | N/A |
| [www.bbc.com](https://www.bbc.com/news) | 9/10 | 8.284 | 8.104 | 10.454 | 1940.0 | 1251.6 | 0.000837 |
| [docs.python.org](https://docs.python.org/3/tutorial/appetite.html) | 10/10 | 4.357 | 4.322 | 4.635 | 1222.0 | 830.3 | 0.000544 |
| [nodejs.org](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs) | 10/10 | 2.542 | 2.518 | 2.990 | 834.0 | 490.2 | 0.000333 |
| [www.w3schools.com](https://www.w3schools.com/js/js_intro.asp) | 10/10 | 4.421 | 4.381 | 5.074 | 1565.0 | 884.8 | 0.000609 |
| [ubuntu.com](https://ubuntu.com/desktop) | 10/10 | 5.883 | 5.796 | 6.389 | 1692.0 | 1053.9 | 0.000696 |
| [rust-lang.org](https://rust-lang.org/learn/) | 10/10 | 2.408 | 2.396 | 2.684 | 778.0 | 434.1 | 0.000291 |
| [www.mozilla.org](https://www.mozilla.org/en-US/firefox/new/) | 10/10 | 3.054 | 3.120 | 3.300 | 969.0 | 590.5 | 0.000396 |

Known returned usage per attempt, including failures (unreported usage excluded):

| Site | Input tokens/attempt | Output tokens/attempt | Known USD/attempt |
|---|---:|---:|---:|
| en.wikipedia.org | 1335.0 | 991.2 | 0.000641 |
| github.com | 1582.0 | 965.1 | 0.000660 |
| developer.mozilla.org | 1351.0 | 1260.8 | 0.000805 |
| www.bbc.com | 1940.0 | 1251.0 | 0.000835 |
| docs.python.org | 1222.0 | 830.3 | 0.000544 |
| nodejs.org | 834.0 | 490.2 | 0.000333 |
| www.w3schools.com | 1565.0 | 884.8 | 0.000609 |
| ubuntu.com | 1692.0 | 1053.9 | 0.000696 |
| rust-lang.org | 778.0 | 434.1 | 0.000291 |
| www.mozilla.org | 969.0 | 590.5 | 0.000396 |

Repeating these 100 excerpt attempts per day, including failures, gives a known-usage estimate of US$0.05809/day or US$1.74283/30 days. This does not buy 100 successfully translated whole pages.

83 successes out of 100 attempts. Known returned usage costs US$0.058094 under the historical tariff assumptions. Failed calls may have unreported billable usage. These fixed text samples reveal remaining reliability/latency limitations and do not demonstrate general speed or superiority over competitors.

[Raw records / 原始数据](reports/benchmark-100-results.json) · [Summary / 汇总](reports/benchmark-100-summary.json) · [Sources and exclusions / 来源与排除项](reports/benchmark-100-sources.json)
