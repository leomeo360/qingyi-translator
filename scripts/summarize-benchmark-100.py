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
# README prose is editorial content; regenerate only the bounded cost table.
labels={'en.wikipedia.org':'维基百科','github.com':'GitHub','developer.mozilla.org':'MDN','www.bbc.com':'BBC','docs.python.org':'Python 文档','nodejs.org':'Node.js 文档','www.w3schools.com':'W3Schools','ubuntu.com':'Ubuntu','rust-lang.org':'Rust','www.mozilla.org':'Firefox'}
table='| 网站 | 测试次数 | 平均输入词元 | 平均输出词元 | 每次费用估算（元） |\n|---|---:|---:|---:|---:|\n'
for r in rows:
 host=r['url'].split('/')[2]
 table+=f"| [{labels.get(host,host)}]({r['url']}) | {r['attempts']} | {r['meanCacheHitInputTokens']+r['meanCacheMissInputTokens']:.1f} | {r['meanOutputTokens']:.1f} | {r['estimatedCnyPerAttempt']:.5f} |\n"
p=root/'README.zh-CN.md';s=p.read_text();start='<!-- COST_TABLE_START -->';end='<!-- COST_TABLE_END -->'
if start in s and end in s:p.write_text(s.split(start)[0]+start+'\n\n'+table+'\n'+end+s.split(end,1)[1])
print(f"Reconciled {len(records)} attempts, {tokens(records,'total_tokens')} tokens; bill CNY {bill['reportedAmountCny']}; tariff CNY {cny(records):.8f}")
