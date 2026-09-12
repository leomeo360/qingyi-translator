"""Summarize every recorded attempt, keeping failures and unknown usage explicit."""
import json, math, statistics
from pathlib import Path
root=Path(__file__).resolve().parent.parent
records=json.loads((root/'reports/benchmark-100-results.json').read_text())['records']
groups={}
for r in records:groups.setdefault(r['url'],[]).append(r)
rows=[]
for url,rs in groups.items():
 ok=[r for r in rs if r['status']=='success'];times=sorted(r['durationMs']/1000 for r in ok)
 usages=[b.get('usage') for r in rs for b in r['batches']]
 known_cost=sum(b.get('estimatedUsd') or 0 for r in rs for b in r['batches'])
 def avg_token(field):return sum((b.get('usage') or {}).get(field,0) for r in ok for b in r['batches'])/len(ok) if ok and all(b.get('usage') for r in ok for b in r['batches']) else None
 rows.append(dict(url=url,attempts=len(rs),successes=len(ok),meanSeconds=statistics.mean(times) if times else None,medianSeconds=statistics.median(times) if times else None,p95Seconds=times[math.ceil(len(times)*.95)-1] if times else None,meanInputTokens=avg_token('prompt_tokens'),meanOutputTokens=avg_token('completion_tokens'),knownAttemptCostUsd=known_cost,knownMeanAttemptInputTokens=sum((u or {}).get('prompt_tokens',0) for u in usages)/len(rs),knownMeanAttemptOutputTokens=sum((u or {}).get('completion_tokens',0) for u in usages)/len(rs),meanSuccessfulCostUsd=sum(b.get('estimatedUsd') or 0 for r in ok for b in r['batches'])/len(ok) if ok and all(b.get('estimatedUsd') is not None for r in ok for b in r['batches']) else None))
summary=dict(attempts=len(records),successes=sum(r['status']=='success' for r in records),meanSuccessfulSeconds=statistics.mean(r['durationMs']/1000 for r in records if r['status']=='success') if any(r['status']=='success' for r in records) else None,knownCostUsd=sum(x['knownAttemptCostUsd'] for x in rows),usageMayBeIncomplete=any(r.get('usageMayBeIncomplete') or any(not b.get('usage') for b in r['batches']) for r in records),sites=rows)
(root/'reports/benchmark-100-summary.json').write_text(json.dumps(summary,indent=2))
def fmt(v,n=3):return 'N/A' if v is None else f'{v:.{n}f}'
table='| Website / 网站 | Success / 次数 | Mean s | Median s | P95 s | Input tokens | Output tokens | USD/success |\n|---|---:|---:|---:|---:|---:|---:|---:|\n'
for x in rows:table+=f"| [{x['url'].split('/')[2]}]({x['url']}) | {x['successes']}/{x['attempts']} | {fmt(x['meanSeconds'])} | {fmt(x['medianSeconds'])} | {fmt(x['p95Seconds'])} | {fmt(x['meanInputTokens'],1)} | {fmt(x['meanOutputTokens'],1)} | {fmt(x['meanSuccessfulCostUsd'],6)} |\n"
for name,zh in [('README.md',False),('README.zh-CN.md',True)]:
 p=root/name;s=p.read_text().split('\n<!-- LIVE_BENCHMARK -->')[0]
 text=('\n## 本次十站 × 十次实测\n\n' if zh else '\n## New ten-site × ten-attempt benchmark\n\n')
 text+=('2026-09-12，每站固定取最多 5,000 个字符，包含正文和界面文字，不是整页翻译；API 串行合批计时，不代表扩展并行调度或点击到屏幕显示。各站十次尝试，无自动重试。均值、中位数和 P95 只统计成功样本，失败包含在成功率分母中。P95 用最近秩，小样本通常等于最大值。\n\n' if zh else '2026-09-12: fixed excerpts of up to 5,000 characters per site, including prose and UI text, not whole pages. API-only sequential batching, not extension parallel scheduling or click-to-paint timing. Ten attempts per site, no automatic retries. Mean/median/p95 include successes only; failures remain in the denominator. Nearest-rank p95 is usually the maximum with this sample size.\n\n')
 text+=(f"成功样本整体平均耗时：{summary['meanSuccessfulSeconds']:.3f} 秒。\n\n" if zh else f"Overall mean successful completion time: {summary['meanSuccessfulSeconds']:.3f} seconds.\n\n") if summary['meanSuccessfulSeconds'] is not None else ''
 text+=table
 text+=('\n所有尝试的已返回用量（包含失败，每次平均；未返回用量不在其中）：\n\n' if zh else '\nKnown returned usage per attempt, including failures (unreported usage excluded):\n\n')
 text+='| Site | Input tokens/attempt | Output tokens/attempt | Known USD/attempt |\n|---|---:|---:|---:|\n'
 for x in rows:text+=f"| {x['url'].split('/')[2]} | {x['knownMeanAttemptInputTokens']:.1f} | {x['knownMeanAttemptOutputTokens']:.1f} | {x['knownAttemptCostUsd']/x['attempts']:.6f} |\n"
 if len(records)==100:
  text+=(f"\n按本轮每天重复 100 次同等样本尝试（包含失败），已知用量估算约 US${summary['knownCostUsd']:.5f}/天，30 天约 US${summary['knownCostUsd']*30:.5f}；这不等于每天成功翻译 100 页的费用。\n" if zh else f"\nRepeating these 100 excerpt attempts per day, including failures, gives a known-usage estimate of US${summary['knownCostUsd']:.5f}/day or US${summary['knownCostUsd']*30:.5f}/30 days. This does not buy 100 successfully translated whole pages.\n")
 text+=(f"\n共 {summary['attempts']} 次尝试，成功 {summary['successes']} 次；已返回用量对应的历史费率估算费用合计 US${summary['knownCostUsd']:.6f}。失败请求可能有未返回的用量，费用可能不完整。结果只能说明这些固定文本样本；失败和等待时间表明仍需改进，不能宣称普遍快速或优于竞品。\n" if zh else f"\n{summary['successes']} successes out of {summary['attempts']} attempts. Known returned usage costs US${summary['knownCostUsd']:.6f} under the historical tariff assumptions. Failed calls may have unreported billable usage. These fixed text samples reveal remaining reliability/latency limitations and do not demonstrate general speed or superiority over competitors.\n")
 # Equal-weight sites, successful workload cost. No silent zero for failed sites.
 costs=[r['meanSuccessfulCostUsd'] for r in rows]
 if len(costs)==10 and all(c is not None for c in costs):
  daily=sum(costs)*10
  text+=(f'\n按每站成功样本平均费用、每天各站 10 页的相同文本量外推：每天约 US${daily:.5f}，30 天约 US${daily*30:.5f}；不含额外失败重试，不适用于完整长网页。\n' if zh else f'\nEqual site weighting, ten equivalent successful excerpts per site per day: approximately US${daily:.5f}/day or US${daily*30:.5f}/30 days, excluding additional failed attempts/retries. This is not a full-length webpage budget.\n')
 text+='\n[Raw records / 原始数据](reports/benchmark-100-results.json) · [Summary / 汇总](reports/benchmark-100-summary.json) · [Sources and exclusions / 来源与排除项](reports/benchmark-100-sources.json)\n'
 p.write_text(s+'\n<!-- LIVE_BENCHMARK -->\n'+text)
print(json.dumps({k:v for k,v in summary.items() if k!='sites'}))
