"""Real IME/system-clipboard verification on an isolated test instance (default port 18081).

Requires Playwright and Chromium. The test creates/reuses a profile named
直接输入验收 and modifies only that profile. Do not point this at personal data.
Override DIRECT_INPUT_BASE and CHROMIUM_PATH as needed.
"""
import asyncio,json,os
from pathlib import Path
from urllib.parse import quote
import httpx
from playwright.async_api import async_playwright,expect
BASE=os.environ.get('DIRECT_INPUT_BASE','http://127.0.0.1:18081').rstrip('/')
PORT=BASE.rsplit(':',1)[-1]
async def main():
 async with httpx.AsyncClient(base_url=BASE,timeout=60) as c:
  for _ in range(60):
   try:
    if (await c.get('/api/status')).status_code==200:break
   except httpx.HTTPError:pass
   await asyncio.sleep(.3)
  profiles=(await c.get('/api/profiles')).json()
  p=next((item for item in profiles if item['name']=='直接输入验收'),None) or (await c.post('/api/profiles',json={'name':'直接输入验收','locale':'zh-CN','screen_width':1280,'screen_height':720})).json()
  pid=p['id'];Path('/tmp/cloak-input-profile').write_text(pid)
  if p['status']!='running':
   r=await c.post(f'/api/profiles/{pid}/launch');assert r.status_code==200,r.text
  async with async_playwright() as pw:
   host=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--host-resolver-rules=MAP remote-input.test 127.0.0.1','--no-proxy-server'])
   ui=await host.new_page(viewport={'width':1440,'height':1080});errors=[];ui.on('pageerror',lambda e:errors.append(str(e)))
   await ui.goto(f'http://remote-input.test:{PORT}');assert not await ui.evaluate('isSecureContext');assert await ui.evaluate('typeof navigator.clipboard')=='undefined'
   await ui.get_by_role('button').filter(has_text='直接输入验收').first.click();await expect(ui.get_by_text('已连接',exact=True)).to_be_visible()
   rb=await pw.chromium.connect_over_cdp(f'{BASE}/api/profiles/{pid}/cdp')
   page=await rb.contexts[0].new_page();await page.goto('data:text/html;charset=utf-8,'+quote('<meta charset="utf-8"><style>textarea{font-size:30px;width:90%;height:200px;margin:20px}</style><textarea id="t"></textarea><p id="s">网页中可选择复制的中文文本</p>'));await page.bring_to_front();await page.locator('#t').focus()
   # Click the visible VNC canvas, then focus the remote field through CDP for precise test coordinates.
   await ui.locator('canvas').click(position={'x':300,'y':220});await page.locator('#t').focus()
   ime=ui.get_by_label('远程浏览器直接输入');await expect(ime).to_be_focused()
   print('PASS: canvas click focuses native input on insecure HTTP',flush=True)
   cdp=await ui.context.new_cdp_session(ui)
   await cdp.send('Input.imeSetComposition',{'text':'zhongwen','selectionStart':8,'selectionEnd':8})
   await cdp.send('Input.imeSetComposition',{'text':'中文','selectionStart':2,'selectionEnd':2})
   await cdp.send('Input.insertText',{'text':'中文'})
   await expect(page.locator('#t')).to_have_value('中文',timeout=10000)
   await ime.press('End');await ime.type('abc');await expect(page.locator('#t')).to_have_value('中文abc')
   print('PASS: real Blink IME composition commits once; Latin input follows in order',flush=True)
   # Local native system clipboard, no mocks or clipboard permissions.
   await ui.evaluate('()=>{const t=document.createElement("textarea");t.id="host-clipboard";t.style.cssText="position:fixed;right:10px;top:100px;z-index:1000";document.body.append(t)}')
   local=ui.locator('#host-clipboard');text='从本机粘贴中文與繁體 🌏\n第二行 + & ='
   await local.fill(text);await local.select_text();await local.press('Control+C')
   await page.locator('#t').fill('');await page.locator('#t').focus();await ime.focus();await ime.press('Control+V')
   await expect(page.locator('#t')).to_have_value(text,timeout=10000)
   print('PASS: local-to-remote native Ctrl+V on HTTP',flush=True)
   remote_text='从远程复制回本机：你好🌏'
   await page.locator('#t').fill(remote_text);await page.locator('#t').select_text();await ime.focus();await ime.press('Control+C')
   await expect(ui.get_by_text('已复制到本机剪贴板',exact=True)).to_be_visible(timeout=10000)
   await local.fill('');await local.press('Control+V');await expect(local).to_have_value(remote_text)
   print('PASS: remote-to-local native Ctrl+C/Ctrl+V on HTTP',flush=True)
   await page.locator('#t').fill('剪切这段中文');await page.locator('#t').select_text();await ime.focus();await ime.press('Control+X')
   await expect(page.locator('#t')).to_have_value('',timeout=10000)
   await expect(ui.get_by_text('已剪切到本机剪贴板',exact=True)).to_be_visible()
   await local.fill('');await local.press('Control+V');await expect(local).to_have_value('剪切这段中文')
   print('PASS: native Ctrl+X preserves clipboard and removes remote selection',flush=True)
   # A remote app/context-menu copy must also reach the host without the host shortcut.
   await ime.focus()
   await page.locator('#t').fill('网页按钮复制的新内容')
   await page.locator('#t').select_text()
   await page.keyboard.press('Control+C')
   await expect(ui.get_by_text('已复制到本机剪贴板',exact=True)).to_be_visible(timeout=10000)
   await local.fill('');await local.press('Control+V');await expect(local).to_have_value('网页按钮复制的新内容')
   print('PASS: remote native copy outside the frontend shortcut is synchronized',flush=True)
   # Browser chrome has no DOM input target: this must work through native X input.
   await ime.focus();await ime.press('Control+L')
   await cdp.send('Input.imeSetComposition',{'text':'dizhi','selectionStart':5,'selectionEnd':5})
   await cdp.send('Input.insertText',{'text':'中文地址栏'})
   await ui.wait_for_timeout(400)
   await ime.press('Control+A');await ime.press('Control+C')
   await ui.wait_for_timeout(400)
   await local.fill('');await local.press('Control+V');await expect(local).to_have_value('中文地址栏')
   print('PASS: Chinese IME and native copy in the browser address bar',flush=True)
   await ime.focus();await ime.press('Escape')
   await ui.screenshot(path='/tmp/cloak-direct-input.png',full_page=True)
   assert not errors,errors
   await host.close()
asyncio.run(main())
