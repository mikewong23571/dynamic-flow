from pathlib import Path
import json,shutil,urllib.request,re,hashlib
source=Path('/tmp/flowcraft-fresh-design-path').read_text().strip();source=Path(source);dest=Path(Path('/tmp/flowcraft-workitem-preview-path').read_text().strip());item='852367c9-7ff7-4aba-8da8-ae0550d7d823';url=f'/api/items/{item}/workspace'
with urllib.request.urlopen('http://127.0.0.1:4332'+url) as r:before=json.load(r)
assert before['work']['work']['messages'][-1]['status']=='completed'
assert all(r['status'] in ['failed','completed','cancelled'] for r in before['work']['work']['runs'])
paths=[p for p in source.iterdir() if p.is_dir() and re.fullmatch(r'[0-9a-f-]{36}',p.name)]
assert len(paths)==5 and all(not(dest/p.name).exists() for p in paths)
assert not(dest/'work-items'/f'{item}.json').exists()
def no_links(folder,names):return [n for n in names if(Path(folder)/n).is_symlink()]
for p in paths:shutil.copytree(p,dest/p.name,ignore=no_links)
p=dest/'work-items'/f'{item}.json';tmp=p.with_suffix('.importing');shutil.copy2(source/'work-items'/f'{item}.json',tmp);tmp.replace(p)
with urllib.request.urlopen('http://127.0.0.1:4331'+url) as r:after=json.load(r)
for key in ['uiPlan','criteria','compositionInputs','status']:assert before['item'].get(key)==after['item'].get(key)
assert before['work']['work']==after['work']['work']
assert len(after['uiPlan']['views'])==5 and all(not c['met'] for c in after['item']['criteria'])
report={'itemId':item,'sourceRoot':str(source),'previewRoot':str(dest),'works':len(paths),'rootRuns':len(after['work']['work']['runs']),'status':after['item']['status'],'views':[v['title'] for v in after['uiPlan']['views']],'url':f'http://10.134.94.200:4330/items/{item}?tab=results','scope':'仅复制本次独立合成新建工作项及其5个Work，ID均新建且目标不存在；不复制配置/密钥/链接，不改已有演示'}
Path('conductor/tracks/workitem-composition_20261028/evidence/fresh-design/installed.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
