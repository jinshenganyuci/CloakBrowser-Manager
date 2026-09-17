"""Check fresh KeePassXC/browser launches under neutral and Chinese container locales.

Creates and removes two temporary Docker containers, with four profiles each.
Set SMOKE_IMAGE or LIFECYCLE_PORT to override defaults. Uses no real accounts.
"""
import asyncio, os, secrets, subprocess, json
from pathlib import Path
import httpx
IMAGE = os.environ.get('SMOKE_IMAGE', 'cloakbrowser-manager:zh-local')
PORT = int(os.environ.get('LIFECYCLE_PORT', '18082'))

async def main():
  summary={}
  for lang in ['C.UTF-8','zh_CN.UTF-8']:
    name='cloak-compare-'+secrets.token_hex(3)
    env={**os.environ,'KEEPASSXC_DATABASE_PASSWORD':secrets.token_urlsafe(32)}
    subprocess.run(['docker','run','--rm','-d','--init','--name',name,'--shm-size=1g','--tmpfs','/data:rw,size=512m','-e','KEEPASSXC_DATABASE_PASSWORD','-e','LANG='+lang,'-e','LC_ALL='+lang,'-e','LANGUAGE='+('en' if lang=='C.UTF-8' else 'zh_CN:zh'),'-p',f'127.0.0.1:{PORT}:8080',IMAGE],env=env,check=True,stdout=subprocess.DEVNULL)
    results=[]
    try:
      async with httpx.AsyncClient(base_url=f'http://127.0.0.1:{PORT}',timeout=50) as c:
        for _ in range(50):
          try:
            if (await c.get('/api/status')).status_code==200:break
          except httpx.HTTPError:pass
          await asyncio.sleep(.3)
        for i in range(4):
          p=(await c.post('/api/profiles',json={'name':'中文测试'+str(i),'locale':'zh-CN','timezone':'Asia/Shanghai','screen_width':1280,'screen_height':720,'launch_args':['--disable-extensions-except=/opt/cloakbrowser/extensions/keepassxc-browser','--load-extension=/opt/cloakbrowser/extensions/keepassxc-browser']})).json()
          start=await c.post('/api/profiles/'+p['id']+'/launch')
          await asyncio.sleep(3)
          status=(await c.get('/api/profiles/'+p['id'])).json()['status']
          result={'launch':start.status_code,'status':status}
          if status=='running':
            result['toggle1']=(await c.post('/api/profiles/'+p['id']+'/keepassxc/toggle-window')).status_code
            result['toggle2']=(await c.post('/api/profiles/'+p['id']+'/keepassxc/toggle-window')).status_code
          await c.post('/api/profiles/'+p['id']+'/stop')
          results.append(result)
          print(lang,i,result,flush=True)
      Path('/tmp/cloak-compare-'+lang+'.log').write_text(subprocess.check_output(['docker','logs',name],stderr=subprocess.STDOUT,text=True))
    finally:subprocess.run(['docker','stop','-t','10',name],stdout=subprocess.DEVNULL)
    summary[lang]=results
  Path('/tmp/cloak-compare-results.json').write_text(json.dumps(summary,indent=2))
  assert all(result == {'launch': 200, 'status': 'running', 'toggle1': 200, 'toggle2': 200}
             for results in summary.values() for result in results), summary
asyncio.run(main())
