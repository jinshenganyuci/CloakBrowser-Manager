"""Browser UI checks with an in-memory API; no real browser profiles are launched.

Run after npm run build and npm run preview -- --host 127.0.0.1 --port 18080.
Requires playwright (included by backend requirements) and an installed Chromium.
"""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get('UI_BASE_URL', 'http://127.0.0.1:18080')
ROOT = Path(__file__).resolve().parents[1]

async def main():
    profiles = []
    errors = []
    async with async_playwright() as p:
        options = {'headless': True}
        if os.environ.get('CHROMIUM_PATH'):
            options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = await p.chromium.launch(**options)
        context = await browser.new_context(viewport={'width': 1440, 'height': 1080}, locale='zh-CN')
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        authenticated = False

        async def route_api(route):
            nonlocal authenticated
            path = route.request.url.split('/api')[-1]
            method = route.request.method
            body = route.request.post_data_json or {}
            status = 200
            result = {}
            if path == '/auth/status':
                result = {'auth_required': True, 'authenticated': authenticated}
            elif path == '/auth/login':
                if body['token'] != 'local-test-token':
                    status, result = 401, {'detail': 'Invalid token'}
                else:
                    authenticated = True
                    result = {'ok': True}
            elif path == '/auth/logout':
                authenticated = False
                result = {'ok': True}
            elif path == '/profiles' and method == 'GET':
                result = profiles
            elif path == '/profiles' and method == 'POST':
                result = {
                    'id': 'chinese-profile', 'fingerprint_seed': 12345,
                    'proxy': None, 'gpu_vendor': None, 'gpu_renderer': None,
                    'hardware_concurrency': None, 'color_scheme': None,
                    'user_agent': None, 'user_data_dir': '/data/profiles/chinese-profile',
                    'status': 'stopped', 'vnc_ws_port': None, 'cdp_url': None,
                    'created_at': '2026-09-17T00:00:00Z', 'updated_at': '2026-09-17T00:00:00Z',
                    **body,
                }
                profiles.append(result)
                status = 201
            elif path.startswith('/profiles/') and method == 'PUT':
                profiles[0].update(body)
                result = profiles[0]
            elif path.startswith('/profiles/') and method == 'DELETE':
                profiles.clear()
                result = {'ok': True}
            await route.fulfill(status=status, content_type='application/json', body=json.dumps(result, ensure_ascii=False))

        await page.route('**/api/**', route_api)
        await page.goto(BASE_URL)
        assert await page.locator('html').get_attribute('lang') == 'zh-CN'
        await page.get_by_label('访问令牌').fill('wrong')
        await page.get_by_role('button', name='登录', exact=True).click()
        await expect(page.get_by_text('访问令牌不正确，请重新输入')).to_be_visible()
        await page.get_by_label('访问令牌').fill('local-test-token')
        await page.get_by_role('button', name='登录', exact=True).click()
        await page.get_by_role('button', name='新建配置', exact=True).first.click()
        await page.get_by_label('配置名称', exact=True).fill('中文工作账号 · 繁體中文 🌏')
        await expect(page.get_by_label('浏览器语言', exact=True)).to_have_value('zh-CN')
        await expect(page.get_by_label('时区', exact=True)).to_have_value('Asia/Shanghai')
        await page.get_by_label('备注', exact=True).fill('第一行：简体中文\n第二行：繁體中文與 Emoji 🌏')
        await page.get_by_label('添加标签').fill('中文测试')
        await page.get_by_label('添加标签').press('Enter')
        await expect(page.get_by_label('移除标签：中文测试')).to_be_visible()
        await page.locator('form').evaluate('(el) => el.parentElement.scrollTop = 0')
        await page.screenshot(path=str(ROOT / 'docs/screenshots/chinese-profile.png'), full_page=True)
        await page.get_by_role('button', name='创建', exact=True).click()
        await expect(page.get_by_role('heading', name='编辑配置')).to_be_visible()
        assert profiles[0]['notes'].endswith('Emoji 🌏')
        assert profiles[0]['tags'][0]['tag'] == '中文测试'
        await page.get_by_label('搜索配置').fill('繁體中文')
        await expect(page.get_by_role('button', name='运行中')).to_have_count(0)
        await expect(page.get_by_role('button').filter(has_text='中文工作账号').first).to_be_visible()
        # Verify actual submitted values, persistence, and independent custom fields.
        for timezone, locale in [
            ('America/Los_Angeles', 'en-US'),
            ('Asia/Tokyo', 'ja-JP'),
            ('Europe/Berlin', 'de-DE'),
        ]:
            await page.get_by_label('时区', exact=True).select_option(timezone)
            await page.get_by_label('浏览器语言', exact=True).select_option(locale)
            await page.get_by_role('button', name='保存', exact=True).click()
            await expect(page.get_by_role('button', name='保存', exact=True)).to_be_enabled()
            assert profiles[0]['timezone'] == timezone
            assert profiles[0]['locale'] == locale
        await page.get_by_label('时区', exact=True).select_option('custom')
        await page.get_by_label('自定义时区', exact=True).fill('Asia/Bangkok')
        await expect(page.get_by_label('浏览器语言', exact=True)).to_have_value('de-DE')
        await page.get_by_label('浏览器语言', exact=True).select_option('custom')
        await page.get_by_label('自定义浏览器语言', exact=True).fill('th-TH')
        await page.get_by_role('button', name='保存', exact=True).click()
        await expect(page.get_by_role('button', name='保存', exact=True)).to_be_enabled()
        await page.reload()
        await page.get_by_role('button').filter(has_text='中文工作账号').first.click()
        await expect(page.get_by_label('自定义时区', exact=True)).to_have_value('Asia/Bangkok')
        await expect(page.get_by_label('自定义浏览器语言', exact=True)).to_have_value('th-TH')
        # Entering a preset manually must not remove the input or lose focus mid-edit.
        await page.get_by_label('自定义浏览器语言', exact=True).fill('en-US')
        await expect(page.get_by_label('自定义浏览器语言', exact=True)).to_be_focused()
        await page.get_by_label('时区', exact=True).select_option('')
        await page.get_by_label('浏览器语言', exact=True).select_option('')
        await page.get_by_role('button', name='保存', exact=True).click()
        await expect(page.get_by_role('button', name='保存', exact=True)).to_be_enabled()
        assert profiles[0]['timezone'] is None
        assert profiles[0]['locale'] is None
        await page.get_by_label('浏览器语言', exact=True).select_option('zh-TW')
        await page.get_by_label('时区', exact=True).select_option('Asia/Taipei')
        await page.get_by_role('button', name='保存', exact=True).click()
        await page.reload()
        await page.get_by_role('button').filter(has_text='中文工作账号').first.click()
        await expect(page.get_by_label('浏览器语言', exact=True)).to_have_value('zh-TW')
        await expect(page.get_by_label('时区', exact=True)).to_have_value('Asia/Taipei')
        await page.set_viewport_size({'width': 390, 'height': 844})
        await page.reload()
        await page.get_by_title('展开侧栏').click()
        await page.get_by_role('button').filter(has_text='中文工作账号').first.click()
        await expect(page.get_by_role('heading', name='编辑配置')).to_be_visible()
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow'
        await page.screenshot(path=str(ROOT / 'docs/screenshots/chinese-mobile.png'), full_page=True)
        async def confirm(dialog):
            assert '确定删除此配置吗' in dialog.message
            await dialog.accept()
        page.once('dialog', confirm)
        await page.get_by_role('button', name='删除', exact=True).click()
        await expect(page.get_by_text('选择一个浏览器配置，或新建配置开始使用')).to_be_visible()
        assert not profiles
        assert not errors, errors
        print('PASS: Chinese login/errors, create/edit/search/delete, Unicode payload, US/JP/DE presets, custom locale preservation, clearing, desktop/mobile layout; no browser errors.')
        await browser.close()

asyncio.run(main())
