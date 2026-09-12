"""Collect current public text excerpts; page changes will change hashes. Run at repository root."""
import urllib.request,json,re,concurrent.futures
from html.parser import HTMLParser
from pathlib import Path
class Extract(HTMLParser):
 def __init__(self):super().__init__();self.skip=0;self.tag=None;self.parts=[];self.blocks=[]
 def handle_starttag(self,t,a):
  if t in ('script','style','pre','noscript','svg'):self.skip+=1
  if not self.skip and t in ('p','h1','h2','h3','li'):self.tag=t;self.parts=[]
 def handle_data(self,d):
  if not self.skip and self.tag:self.parts.append(d)
 def handle_endtag(self,t):
  if t in ('script','style','pre','noscript','svg') and self.skip:self.skip-=1
  if t==self.tag:
   s=re.sub(r'\s+',' ',''.join(self.parts)).strip()
   if len(s)>30:self.blocks.append(s)
   self.tag=None
urls=[p['url'] for p in json.loads(Path('reports/benchmark-100-sources.json').read_text())['sources']]
def get(url):
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=25) as r:html=r.read(3000000).decode('utf-8',errors='replace')
  p=Extract();p.feed(html);blocks=list(dict.fromkeys(p.blocks));total=sum(map(len,blocks));selected=[];n=0
  for b in blocks:
   if n>=5000:break
   if n+len(b)>5000:break
   selected.append(b);n+=len(b)
  if n<400:raise ValueError('Insufficient text')
  return dict(url=url,title=url.split('/')[2],blocks=[dict(id=f'b{i+1}',text=b) for i,b in enumerate(selected)],scope='First 5000 extracted characters, not whole page',extractedCharacters=total)
 except Exception as e:return dict(url=url,error=type(e).__name__)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:r=list(pool.map(get,urls))
Path('reports/benchmark-100-inputs.json').write_text(json.dumps([p for p in r if 'blocks'in p]))
# Full text remains in the gitignored local input file only.
for p in r:print(p['url'],p.get('error','OK '+str(sum(len(b['text']) for b in p['blocks'])) if 'blocks'in p else 'error'))
