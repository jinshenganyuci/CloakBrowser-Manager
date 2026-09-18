"""Verify real headed Chromium languages/timezones, including existing profiles.

Run against an isolated manager (e.g. Docker on localhost:18082):
REGION_CHECK_BASE_URL=http://127.0.0.1:18082 .venv/bin/python scripts/check_browser_regions.py
Only the temporary profile created here is modified and deleted. No external sites.
"""
import asyncio
import json
import os
import re
from pathlib import Path

import httpx
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("REGION_CHECK_BASE_URL", "http://127.0.0.1:18082").rstrip("/")
CASES = [
    ("zh-CN", "Asia/Shanghai", "zh", "设置", [-480, -480]),
    ("ja-JP", "Asia/Tokyo", "ja", "設定", [-540, -540]),
    ("de-DE", "Europe/Berlin", "de", "Einstellungen", [-60, -120]),
    ("en-US", "America/New_York", "en", "Settings", [300, 240]),
]

async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=90) as api:
        response = await api.post("/api/profiles", json={
            "name": "临时浏览器语言回归检查", "headless": False,
            "humanize": False, "launch_args": [],
        })
        response.raise_for_status()
        profile_id = response.json()["id"]
        try:
            async with async_playwright() as p:
                for locale, timezone, ui_lang, ui_title, offsets in CASES:
                    response = await api.put(f"/api/profiles/{profile_id}", json={
                        "locale": locale, "timezone": timezone,
                    })
                    response.raise_for_status()
                    response = await api.post(f"/api/profiles/{profile_id}/launch")
                    response.raise_for_status()
                    browser = await p.chromium.connect_over_cdp(f"{BASE}/api/profiles/{profile_id}/cdp")
                    page = await browser.contexts[0].new_page()
                    # Request the manager from INSIDE the remote container/browser.
                    response = await page.goto("http://127.0.0.1:8080/api/status")
                    headers = await response.request.all_headers()
                    runtime = await page.evaluate("""() => ({
                        language: navigator.language,
                        languages: navigator.languages,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        offsets: ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z']
                            .map(value => new Date(value).getTimezoneOffset()),
                    })""")
                    assert runtime["language"] == locale, runtime
                    assert runtime["languages"][0] == locale, runtime
                    assert runtime["timezone"] == timezone, runtime
                    assert runtime["offsets"] == offsets, runtime
                    accept_language = headers.get("accept-language", "")
                    assert accept_language.split(",")[0].split(";")[0] == locale, accept_language
                    await page.goto("chrome://settings/languages")
                    await expect(page.locator("html")).to_have_attribute("lang", ui_lang)
                    await expect(page).to_have_title(re.compile(ui_title))
                    if os.environ.get("REGION_CHECK_SCREENSHOTS"):
                        dest = Path(os.environ["REGION_CHECK_SCREENSHOTS"])
                        dest.mkdir(parents=True, exist_ok=True)
                        await page.screenshot(path=str(dest / f"{locale}.png"))
                    print(json.dumps({"result": "PASS", **runtime, "ui_language": ui_lang,
                                      "ui_title": await page.title(), "accept_language": accept_language},
                                     ensure_ascii=False), flush=True)
                    response = await api.post(f"/api/profiles/{profile_id}/stop")
                    response.raise_for_status()
                    # Reuse the same data directory next time to catch stale preferences.
        finally:
            response = await api.delete(f"/api/profiles/{profile_id}")
            response.raise_for_status()
            print("Temporary test profile removed.", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
