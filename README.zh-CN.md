# 轻译 · 个人免费 · 源码公开 AI 网页翻译工具

简体中文 · [English](README.md)

直接在网页里阅读译文。轻译是一款 Chrome 扩展，支持划选翻译和随滚动翻译网页，保留链接、字体与原有排版。个人非商业使用免费，商业使用需另行授权；API 调用费用由模型服务商收取。

## 两种翻译方式

| 模式 | 使用方式 | 当前支持 | 费用 |
|---|---|---|---|
| 网页会话 | 连接浏览器里已经打开并登录的 LLM 标签页，无需 API Key | DeepSeek 网页 | 轻译不收取 API 费用；受网站额度和使用规则限制 |
| 自带 API Key | 保存自己的 Key，直接调用模型服务商 | DeepSeek API，默认 `deepseek-flash` | 按服务商 Token 价格计费 |

豆包、更多 LLM 网页和可配置的 OpenAI 兼容接口属于后续规划，**当前版本尚不支持**。网页模式需要连接专用会话，翻译期间不要同时手动输入；网站改版可能影响适配。

## 安装与使用

需要 Chrome 120 或更新版本。可下载 [v2.9.0 扩展压缩包](https://github.com/leomeo360/qingyi-translator/releases/tag/v2.9.0)，解压后加载该目录；也可下载仓库，打开 `chrome://extensions`，启用开发者模式，点击“加载已解压的扩展程序”，选择 `extension/`，无需构建。

1. 打开扩展面板，连接已登录的 DeepSeek 标签页，或保存自己的 DeepSeek API Key。
2. 选中文字，按 `Alt+Shift+T` 或通过右键菜单翻译。
3. 阅读文章使用“翻译网页正文”；需要翻译导航和界面文字时使用“翻译全部可读内容”（`Alt+W`）。
4. 滚动时继续翻译；可通过进度控件取消或恢复原文，刷新也可恢复。

译文流式原位替换，不是上下对照双语显示。代码、路径、URL、输入框和敏感区域会尽力过滤；跨域嵌入页面需要授权。默认预翻译下方约两屏，可能消耗尚未阅读内容的 Token，可在高级设置关闭。

## 性能：已有真实记录

仓库保留了 **2026-09-10 对 10 篇 Python 文档快照各调用一次 API** 的记录。这是同一网站的十篇文章，不是十个不同网站，也不是一百次测试。本次发布未重新运行这些历史样本。计时包含抽取文本的 API 处理，不包含真实网页加载、DOM 抽取、滚动及屏幕绘制；没有使用本地翻译缓存。

表头依次为页面、次数、秒数、输入 Token、输出 Token、美元估算。

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

平均完成耗时 **5.522 秒/篇**，范围 **2.089–10.745 秒**；平均输入 **1,563.3 Token**、输出 **1,204.8 Token**，合计 **2,768.1 Token**，十条记录均成功。对这些较短的文档样本而言成本较低，但仍需数秒等待；不能据此宣称常用网站都很快、翻译质量优秀或领先竞品。

[原始 API 记录](reports/api-pages.json) · [测试方案与复现说明](docs/BENCHMARKS.md)。历史浏览器模拟测试中缓存译文 82 ms 显示，这不包含模型或网络时间，不能当作真实翻译速度。

## 每页 Token 与每天 100 页的费用

表中费用保留历史估算，不是账单。代码采用的历史费率为每百万 Token：缓存命中输入 US$0.006、未命中输入 US$0.30、输出 US$1.20；非高峰乘以 0.5。2026-09-12 已与 [DeepSeek 官方价格](https://api-docs.deepseek.com/quick_start/pricing/) 核对一致。高峰为周一至周五北京时间 09:00–12:00、14:00–18:00，其余为非高峰。价格可能调整。

`美元费用 =（缓存输入 × 命中单价 + 未缓存输入 × 输入单价 + 输出 × 输出单价）÷ 1,000,000 × 时段系数`

按上述样本结构和历史非高峰费率：**每页约 US$0.000957，每天 100 页约 US$0.09574，30 天约 US$2.87213**。相同 Token 结构按历史高峰费率：**每天约 US$0.19148，30 天约 US$5.74425**。这是十个样本的外推，不是实测日账单。长文章、重试、目标语言、提示词和预翻译都会影响费用。网页会话模式无法取得权威 Token 账单，应标记为“不可获取”，不能写成零 Token。高级设置可导出最近任务的用量、费用估算和耗时，最终以服务商账单为准。

## 隐私与开发

Key 保存在本机扩展存储，由后台使用，网页内容脚本不能读取。两种模式都会将待译文字发送给 DeepSeek，网页模式会话还可能保留在服务商账号中。项目没有翻译中转服务器；敏感信息过滤无法保证识别所有情况，请留意待译内容。

```sh
npm test
npm run check
npm run package
```

开发建议使用 Node.js 20+ 和 Python 3。参见 [测试计划](docs/BENCHMARKS.md)、[历史测试报告](TEST_REPORT.md)、[版本说明](docs/HISTORY.zh-CN.md) 和 [贡献指南](CONTRIBUTING.md)。项目代码采用 [轻译个人非商业许可证](LICENSE)，不授予免费商用权，不属于 OSI 定义的开源软件；第三方测试素材保留原许可证，见 [第三方声明](THIRD_PARTY_NOTICES.md)。本项目与 DeepSeek、豆包无隶属关系。

<!-- LIVE_BENCHMARK -->

## 本次十站 × 十次实测

2026-09-12，每站固定取最多 5,000 个字符，包含正文和界面文字，不是整页翻译；API 串行合批计时，不代表扩展并行调度或点击到屏幕显示。各站十次尝试，无自动重试。均值、中位数和 P95 只统计成功样本，失败包含在成功率分母中。P95 用最近秩，小样本通常等于最大值。

成功样本整体平均耗时：4.519 秒。

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

所有尝试的已返回用量（包含失败，每次平均；未返回用量不在其中）：

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

按本轮每天重复 100 次同等样本尝试（包含失败），已知用量估算约 US$0.05809/天，30 天约 US$1.74283；这不等于每天成功翻译 100 页的费用。

共 100 次尝试，成功 83 次；已返回用量对应的历史费率估算费用合计 US$0.058094。失败请求可能有未返回的用量，费用可能不完整。结果只能说明这些固定文本样本；失败和等待时间表明仍需改进，不能宣称普遍快速或优于竞品。

[Raw records / 原始数据](reports/benchmark-100-results.json) · [Summary / 汇总](reports/benchmark-100-summary.json) · [Sources and exclusions / 来源与排除项](reports/benchmark-100-sources.json)
