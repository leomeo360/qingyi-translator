# API 文本样本完成耗时 / API excerpt completion times

这些是固定文本样本的 API 完成耗时，不是首屏开始显示、首屏翻译完成或滚动等待时间。均值/中位数/P95 仅统计成功样本；P95 使用最近秩。原始失败记录保留。

These are API excerpt completion times, not first-viewport or scroll latency. Statistics include successful attempts only; failures remain in the denominator.

| 网站 / Site | 成功 / Attempts | Mean s | Median s | P95 s |
|---|---:|---:|---:|---:|
| en.wikipedia.org | 4/10 | 5.256 | 5.259 | 5.366 |
| github.com | 10/10 | 5.290 | 5.308 | 5.874 |
| developer.mozilla.org | 0/10 | N/A | N/A | N/A |
| www.bbc.com | 9/10 | 8.284 | 8.104 | 10.454 |
| docs.python.org | 10/10 | 4.357 | 4.322 | 4.635 |
| nodejs.org | 10/10 | 2.542 | 2.518 | 2.990 |
| www.w3schools.com | 10/10 | 4.421 | 4.381 | 5.074 |
| ubuntu.com | 10/10 | 5.883 | 5.796 | 6.389 |
| rust-lang.org | 10/10 | 2.408 | 2.396 | 2.684 |
| www.mozilla.org | 10/10 | 3.054 | 3.120 | 3.300 |

[原始记录 / Raw records](../reports/benchmark-100-results.json) · [测试方法 / Method](BENCHMARKS.md)
