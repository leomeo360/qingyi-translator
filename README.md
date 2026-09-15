<p align="center">
  <img src="extension/icons/128.png" alt="Qingyi icon" width="96" height="96">
</p>

# Qingyi · A free webpage translation extension for Chrome

English · [简体中文](README.zh-CN.md)

Qingyi is a free Chrome extension for one-click webpage and selected-text translation with AI. Click the floating **Translate** button on the right side of a webpage to translate all readable content. Translations appear in place, preserving links, typography and layout. It prioritizes the first viewport and prepares upcoming content as you read.

**Free to use, with source available. Commercial use requires a separate license.**

## Two ways to translate

| Mode | Setup | Available provider | Cost |
|---|---|---|---|
| Browser session | Use web versions such as DeepSeek and Doubao at no charge | DeepSeek website | Uses website free allowances; no API charges |
| Your own API key | Save your provider key; no conversation tab needed | DeepSeek API | Provider usage charges |

DeepSeek web is available now. Doubao and other web providers are planned below.

## Built for reading

- Start full-page translation from the floating button on the right side of the page.
- Use the single **Translate** context-menu item to translate all readable page content.
- Translate selected text with the nearby button or keyboard shortcut.
- Stream translations in place while preserving links and page styles.
- Translate the visible content first, without waiting for the entire article.
- Prefetch roughly two screens after the first viewport completes. Prepared translations appear as you scroll without another model wait.
- Protect code, URLs, file paths and icon fonts; skip input fields.
- Restore the original with the progress control or by refreshing.

Adjust or disable prefetch in advanced settings. If you scroll beyond prepared content, Qingyi prioritizes the newly visible text.

## Install

Requires Chrome 120 or newer.

1. Download and extract the [latest release](https://github.com/leomeo360/qingyi-translator/releases/latest).
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder.
3. Connect a signed-in DeepSeek conversation or save your API key. Keep the connected conversation dedicated to translation while it runs.
4. Click the floating **Translate** button on the right side of the page, or right-click and choose **Translate**. Both translate all readable content while preserving code, special symbols, URLs and protected terms. Use `Alt+Shift+T` for selected text or `Alt+W` for the page.

You can also download this repository and load `extension/` directly, without building. Cross-origin embedded content requires permission for its website.

## Cost example

A benchmark of ten websites, ten text-excerpt attempts per site, cost **CNY 0.38** in the DeepSeek console: **CNY 0.0038 per attempt**, or about **CNY 0.38 per day / CNY 11.40 per 30 days** at 100 equivalent attempts a day.

Each excerpt contained up to 5,000 characters, and the bill includes all benchmark calls. Cost varies with article length, prefetch, cache hits and billing hours. Total usage was **220,199 tokens**: 97,408 cache-hit input, 35,272 cache-miss input and 87,519 output.

[Per-site costs](README.zh-CN.md#翻译费用参考) · [Method and full results](docs/BENCHMARKS.md) · [Billing record](reports/benchmark-100-billing.json) · [Provider pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

## Privacy

API keys stay in local extension storage and cannot be read by webpage content scripts. Translation text goes directly to DeepSeek without a project relay server. Website-mode conversation history is managed by the provider account.

## Web provider roadmap

- [x] DeepSeek
- [ ] Doubao
- [ ] GLM (Zhipu Qingyan)
- [ ] ChatGPT
- [ ] Gemini
- [ ] Qwen
- [ ] Claude

Unchecked providers are planned integrations. The support list will be updated as they become available.

## Development

Use Node.js 20+ and Python 3.

```sh
npm test
npm run check
npm run package
```

Issues, improvements and new provider adapters are welcome. [Contributing](CONTRIBUTING.md) · [Version history](docs/HISTORY.zh-CN.md) · [Test reports](TEST_REPORT.md).

Project code uses the [Qingyi Personal Noncommercial License](LICENSE). Third-party materials retain their own licenses; see [notices](THIRD_PARTY_NOTICES.md). Not affiliated with DeepSeek or Doubao.
