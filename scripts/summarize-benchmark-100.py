"""Reconcile token evidence and publish distinct UX, API and billing metrics."""
import json, math, statistics
from pathlib import Path
root=Path(__file__).resolve().parent.parent
records=json.loads((root/'reports/benchmark-100-results.json').read_text())['records']
bill=json.loads((root/'reports/benchmark-100-billing.json').read_text())
def tokens(rs,field):
 return sum((b.get('usage') or {}).get(field,0) for r in rs for b in r['batches'])
def cny(rs):
 return (tokens(rs,'prompt_cache_hit_tokens')*.02+tokens(rs,'prompt_cache_miss_tokens')+tokens(rs,'completion_tokens')*4)/1e6
for field,key in [('total_tokens','totalTokens'),('prompt_cache_hit_tokens','cacheHitInputTokens'),('prompt_cache_miss_tokens','cacheMissInputTokens'),('completion_tokens','outputTokens')]:
 assert tokens(records,field)==bill[key],f'Billing snapshot does not match records: {field}'
rows=[]
for url in dict.fromkeys(r['url'] for r in records):
 rs=[r for r in records if r['url']==url];ts=sorted(r['durationMs']/1000 for r in rs if r['status']=='success')
 rows.append(dict(url=url,attempts=len(rs),successes=len(ts),meanSeconds=statistics.mean(ts) if ts else None,medianSeconds=statistics.median(ts) if ts else None,p95Seconds=ts[math.ceil(len(ts)*.95)-1] if ts else None,meanCacheHitInputTokens=tokens(rs,'prompt_cache_hit_tokens')/len(rs),meanCacheMissInputTokens=tokens(rs,'prompt_cache_miss_tokens')/len(rs),meanOutputTokens=tokens(rs,'completion_tokens')/len(rs),estimatedCnyPerAttempt=cny(rs)/len(rs)))
summary=dict(attempts=len(records),successes=sum(r['status']=='success' for r in records),firstViewportPaintMs=None,firstViewportCompleteMs=None,firstViewportStatus='Not measured in real browser',reportedBillCny=bill['reportedAmountCny'],tariffEstimateCny=cny(records),tokenCountsReconciled=True,amountDifferenceCny=cny(records)-bill['reportedAmountCny'],sites=rows)
(root/'reports/benchmark-100-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
# Keep API completion timings available without presenting them as reader wait times.
detail='# API 文本样本完成耗时 / API excerpt completion times\n\n这些是固定文本样本的 API 完成耗时，不是首屏开始显示、首屏翻译完成或滚动等待时间。均值/中位数/P95 仅统计成功样本；P95 使用最近秩。原始失败记录保留。\n\nThese are API excerpt completion times, not first-viewport or scroll latency. Statistics include successful attempts only; failures remain in the denominator.\n\n| 网站 / Site | 成功 / Attempts | Mean s | Median s | P95 s |\n|---|---:|---:|---:|---:|\n'
def fmt(x):return 'N/A' if x is None else f'{x:.3f}'
for r in rows:detail+=f"| {r['url'].split('/')[2]} | {r['successes']}/{r['attempts']} | {fmt(r['meanSeconds'])} | {fmt(r['medianSeconds'])} | {fmt(r['p95Seconds'])} |\n"
detail+='\n[原始记录 / Raw records](../reports/benchmark-100-results.json) · [测试方法 / Method](BENCHMARKS.md)\n'
(root/'docs/API_SAMPLE_TIMINGS.md').write_text(detail)
for name,zh in [('README.zh-CN.md',True),('README.md',False)]:
 p=root/name;s=p.read_text().split('\n<!-- LIVE_BENCHMARK -->')[0]
 if zh:
  text='''## 十站各十次：Token 与人民币费用

本轮共 100 次文本样本尝试，83 次通过结构校验。每站最多 5,000 字符，包含正文和界面文字；不是整页浏览器测试。Token 包含失败尝试，不删掉失败调用产生的费用。每站费用按官方空闲时段人民币单价估算，**不是每站独立账单，也不是首屏单独费用**。

| 网站 | 通过校验/尝试 | 平均缓存命中输入 Token | 平均未命中输入 Token | 平均输出 Token | 每次估算（元） |
|---|---:|---:|---:|---:|---:|
'''
 else:
  text='''## Ten sites × ten attempts: reconciled usage

100 fixed text-excerpt attempts, 83 structurally validated successes. Each excerpt contains up to 5,000 characters of prose/UI text. This is not a browser first-viewport benchmark. Usage includes failed attempts. Per-site prices below use the official off-peak CNY tariff; they are estimates, not per-site invoices or first-viewport-only costs.

| Site | Validated/attempts | Mean cache-hit input tokens | Mean cache-miss input tokens | Mean output tokens | Estimated CNY/attempt |
|---|---:|---:|---:|---:|---:|
'''
 for r in rows:text+=f"| [{r['url'].split('/')[2]}]({r['url']}) | {r['successes']}/{r['attempts']} | {r['meanCacheHitInputTokens']:.1f} | {r['meanCacheMissInputTokens']:.1f} | {r['meanOutputTokens']:.1f} | {r['estimatedCnyPerAttempt']:.5f} |\n"
 if zh:
  text+='''
你实际需要关注的是首屏等待时间，见上方说明。[API 样本完成耗时](docs/API_SAMPLE_TIMINGS.md) 单独保留，不能把其中的 4–5 秒当成首屏或每次滚动的等待时间。83/100 是此测试脚本的结构校验通过率，不能等同于浏览器扩展的整页成功率；失败原因仍需进一步诊断。
'''
 else:
  text+='''
[API excerpt completion times](docs/API_SAMPLE_TIMINGS.md) are retained separately. The roughly 4–5 second sample completion time is not first-viewport or per-scroll waiting time. The 83/100 validation rate belongs to this custom harness, not a measured whole-page extension success rate; failures need further diagnosis.
'''
 text+='\n[Raw records / 原始数据](reports/benchmark-100-results.json) · [Billing reconciliation / 账单核对](reports/benchmark-100-billing.json) · [Summary / 汇总](reports/benchmark-100-summary.json) · [Sources / 来源](reports/benchmark-100-sources.json)\n'
 p.write_text(s+'\n<!-- LIVE_BENCHMARK -->\n\n'+text)
print(f"Reconciled {len(records)} attempts, {tokens(records,'total_tokens')} tokens; bill CNY {bill['reportedAmountCny']}; tariff CNY {cny(records):.8f}")
