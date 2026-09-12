"""Download ten PSF-licensed tutorial articles as reproducible prose-only pages."""
import html, json, re, urllib.request
from html.parser import HTMLParser
from pathlib import Path
class Article(HTMLParser):
    def __init__(self): super().__init__(); self.depth=0; self.main=False; self.skip=0; self.current=None; self.parts=[]; self.blocks=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='div' and attrs.get('role')=='main': self.main=True; self.depth=1; return
        if not self.main:return
        if tag=='div':self.depth+=1
        if tag in ('pre','script','style'):self.skip+=1
        if not self.skip and tag in ('p','h1','h2','h3','h4'):
            self.current=tag;self.parts=[]
    def handle_endtag(self, tag):
        if not self.main:return
        if tag in ('pre','script','style') and self.skip:self.skip-=1
        if tag==self.current:
            text=re.sub(r'\s+',' ',''.join(self.parts)).replace('¶','').strip()
            if text:self.blocks.append((tag,text))
            self.current=None
        if tag=='div':
            self.depth-=1
            if self.depth==0:self.main=False
    def handle_data(self,data):
        if self.main and self.current and not self.skip:self.parts.append(data)
names=['appetite','interpreter','stdlib','stdlib2','venv','whatnow','interactive','floatingpoint','appendix','errors']
root=Path(__file__).resolve().parent.parent
pages=[]
for i,name in enumerate(names,1):
    url=f'https://docs.python.org/3/tutorial/{name}.html'
    parser=Article();parser.feed(urllib.request.urlopen(url,timeout=30).read().decode())
    if not parser.blocks:raise RuntimeError('No article: '+url)
    title=parser.blocks[0][1]
    content='\n'.join(f'<{tag}>{html.escape(text)}</{tag}>' for tag,text in parser.blocks)
    page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>轻译整页测试 {i:02d} · {html.escape(title)}</title><style>body{{max-width:850px;margin:48px auto;padding:0 25px;font:17px/1.8 system-ui;color:#28314a}}h1{{font-size:30px}}h2{{margin-top:36px}}a{{color:#5268e9}}</style><main>{content}</main><footer><a href="{url}">Python documentation · PSF License v2 · prose snapshot</a></footer></html>'''
    (root/f'tests/pages/{i:02d}.html').write_text(page)
    pages.append(dict(index=i,title=title,url=url,file=f'tests/pages/{i:02d}.html',characters=sum(len(t) for _,t in parser.blocks),paragraphs=len(parser.blocks)))
(root/'reports/benchmark-pages.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2))
print(json.dumps([{'page':p['index'],'characters':p['characters'],'paragraphs':p['paragraphs']} for p in pages]))
