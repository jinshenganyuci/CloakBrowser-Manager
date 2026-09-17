"""Build the image first, then verify real CloakBrowser/VNC Chinese input.

Creates and removes a temporary localhost-only Docker container with tmpfs data.
Run: CHROMIUM_PATH=/path/to/chrome .venv/bin/python scripts/check_chinese_container.py
Optional: SMOKE_IMAGE, SMOKE_PORT. No real accounts or external websites are used.
"""
import asyncio
import json
import os
import secrets
import subprocess
from urllib.parse import quote
from pathlib import Path

import httpx
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
IMAGE = os.environ.get('SMOKE_IMAGE', 'cloakbrowser-manager:zh-local')
PORT = int(os.environ.get('SMOKE_PORT', '18081'))
BASE = f'http://127.0.0.1:{PORT}'
NAME = f'cloakbrowser-zh-check-{secrets.token_hex(3)}'

async def main():
    env = {**os.environ, 'KEEPASSXC_DATABASE_PASSWORD': secrets.token_urlsafe(32)}
    subprocess.run([
        'docker', 'run', '--rm', '-d', '--init', '--name', NAME,
        '--shm-size=1g', '--tmpfs', '/data:rw,size=512m',
        '-e', 'KEEPASSXC_DATABASE_PASSWORD', '-p', f'127.0.0.1:{PORT}:8080', IMAGE,
    ], check=True, env=env, stdout=subprocess.DEVNULL)
    errors = []
    try:
        async with httpx.AsyncClient(base_url=BASE, timeout=60) as api:
            for _ in range(120):
                try:
                    if (await api.get('/api/status')).status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(0.5)
            else:
                raise AssertionError('container did not become ready')
            print('PASS: container health', flush=True)
            async with async_playwright() as p:
                options = {'headless': True}
                if os.environ.get('CHROMIUM_PATH'):
                    options['executable_path'] = os.environ['CHROMIUM_PATH']
                host = await p.chromium.launch(**options)
                ui = await host.new_page(viewport={'width': 1440, 'height': 1080}, locale='zh-CN')
                ui.on('pageerror', lambda err: errors.append(str(err)))
                await ui.goto(BASE)
                await ui.get_by_role('button', name='新建配置', exact=True).first.click()
                await ui.get_by_label('配置名称', exact=True).fill('中文远程浏览器验收 🌏')
                await ui.get_by_role('button', name='创建', exact=True).click()
                await expect(ui.get_by_role('heading', name='编辑配置')).to_be_visible()
                await ui.get_by_role('button', name='启动', exact=True).click()
                await expect(ui.get_by_text('已连接', exact=True)).to_be_visible(timeout=90000)
                profiles = (await api.get('/api/profiles')).json()
                profile_id = profiles[0]['id']
                assert profiles[0]['status'] == 'running'
                print('PASS: real browser + KeePassXC launch + VNC connection', flush=True)
                browser = await p.chromium.connect_over_cdp(f'{BASE}/api/profiles/{profile_id}/cdp')
                remote = await browser.contexts[0].new_page()
                html = '''<!DOCTYPE html><html lang="zh-CN"><meta charset="UTF-8">
                  <style>body{font-family:"Noto Sans CJK SC",sans-serif;padding:28px;background:#f8fafc;color:#172554}textarea{width:90%;height:230px;font-size:24px;padding:16px}h1{font-size:30px}</style>
                  <h1>远程中文输入验收</h1><p>简体中文 · 繁體中文 · Emoji 🌏 · 多行文本</p>
                  <label for="target">接收文字</label><br><textarea id="target"></textarea></html>'''
                await remote.goto("data:text/html;charset=utf-8," + quote(html), wait_until="domcontentloaded", timeout=15000)
                await remote.bring_to_front()
                locale = await remote.evaluate('({language:navigator.language,languages:navigator.languages,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})')
                assert locale['language'] == 'zh-CN', locale
                assert locale['timezone'] == 'Asia/Shanghai', locale
                print('PASS: runtime locale ' + json.dumps(locale, ensure_ascii=False), flush=True)
                await ui.get_by_role('button', name='中文 / 文本输入').click()
                samples = [
                    '简体中文测试，繁體中文測試 🌏\n第二行：你好，世界！',
                    '第二次输入：标点 / + & = % “引号” 😀',
                    '第三次：连续发送不丢字\nEnglish & 中文混合',
                ]
                for text in samples:
                    await remote.locator('#target').fill('')
                    await remote.locator('#target').focus()
                    await ui.get_by_label('发送到远程窗口的文字').fill(text)
                    await ui.get_by_role('button', name='发送文字', exact=True).click()
                    await expect(remote.locator('#target')).to_have_value(text, timeout=15000)
                    response = await api.get(f'/api/profiles/{profile_id}/clipboard')
                    assert response.json()['text'] == text, response.text
                print('PASS: 3 real VNC Unicode pastes and UTF-8 clipboard round trips', flush=True)
                # Wait for the next VNC framebuffer update after DOM assertions.
                await ui.wait_for_timeout(1000)
                await ui.screenshot(path=str(ROOT / 'docs/screenshots/chinese-browser.png'), full_page=True)
                await ui.get_by_label('切换 KeePassXC 窗口').click()
                await expect(ui.get_by_label('切换 KeePassXC 窗口')).to_have_attribute('title', '最小化 KeePassXC 并显示浏览器', timeout=15000)
                await ui.wait_for_timeout(1000)
                await ui.screenshot(path=str(ROOT / 'docs/screenshots/chinese-keepassxc.png'), full_page=True)
                await ui.get_by_label('切换 KeePassXC 窗口').click()
                await expect(ui.get_by_label('切换 KeePassXC 窗口')).to_have_attribute('title', '显示并最大化 KeePassXC', timeout=15000)
                print('PASS: KeePassXC window toggle in both directions', flush=True)
                await ui.get_by_role('button', name='停止', exact=True).click()
                await expect(ui.get_by_role('heading', name='编辑配置')).to_be_visible(timeout=15000)
                assert (await api.get('/api/profiles')).json()[0]['status'] == 'stopped'
                assert not errors, errors
                print('PASS: browser stop; no page script errors', flush=True)
                await host.close()
        for cmd in [['locale', 'charmap'], ['fc-match', ':lang=zh-cn'], ['fc-match', ':lang=zh-tw']]:
            result = subprocess.check_output(['docker', 'exec', NAME, *cmd], text=True).strip()
            print('PASS: ' + ' '.join(cmd) + ': ' + result, flush=True)
    except Exception:
        if 'ui' in locals() and not ui.is_closed():
            await ui.screenshot(path='/tmp/cloak-container-failure.png')
        log = subprocess.check_output(['docker', 'logs', NAME], stderr=subprocess.STDOUT, text=True)
        Path('/tmp/cloak-container-failure.log').write_text(log)
        raise
    finally:
        subprocess.run(['docker', 'stop', '-t', '15', NAME], check=False, stdout=subprocess.DEVNULL)
        print('Temporary test container removed.', flush=True)

asyncio.run(main())
