"""Clipboard preparation is profile-scoped, authenticated and never reads stale DOM caches."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from backend import main
from backend.browser_manager import RunningProfile


@pytest.fixture
def running_profile(app_client):
    pid = app_client.post("/api/profiles", json={"name": "直接输入"}).json()["id"]
    running = MagicMock(spec=RunningProfile)
    running.display = 171
    main.browser_mgr.running[pid] = running
    yield pid
    main.browser_mgr.running.pop(pid, None)
    main._input_locks.pop(171, None)


def test_prepare_waits_until_the_exact_text_can_be_pasted(app_client, running_profile):
    with patch.object(main, "set_clipboard", new_callable=AsyncMock) as write, patch.object(main, "_read_x_clipboard", new_callable=AsyncMock, side_effect=["stale", "中文🌏"]) as read:
        response = app_client.post(f"/api/profiles/{running_profile}/clipboard/prepare", json={"text": "中文🌏"})
    assert response.status_code == 200
    write.assert_awaited_once()
    assert read.await_count == 2


def test_failed_update_does_not_claim_the_clipboard_is_ready(app_client, running_profile):
    with patch.object(main, "set_clipboard", new_callable=AsyncMock), patch.object(main, "_read_x_clipboard", new_callable=AsyncMock, return_value="old"):
        response = app_client.post(f"/api/profiles/{running_profile}/clipboard/prepare", json={"text": "new"})
    assert response.status_code == 504


def test_profile_stopping_during_prepare_is_rejected(app_client, running_profile):
    async def read(_display):
        main.browser_mgr.running.pop(running_profile)
        return "中文"
    with patch.object(main, "set_clipboard", new_callable=AsyncMock), patch.object(main, "_read_x_clipboard", side_effect=read):
        response = app_client.post(f"/api/profiles/{running_profile}/clipboard/prepare", json={"text": "中文"})
    assert response.status_code == 409


def test_prepare_requires_authentication(app_client, monkeypatch):
    monkeypatch.setattr(main, "AUTH_TOKEN", "test-only-token")
    response = app_client.post("/api/profiles/not-running/clipboard/prepare", json={"text": "中文"})
    assert response.status_code == 401


def test_prepare_for_stopped_profile_has_no_side_effects(app_client):
    with patch.object(main, "set_clipboard", new_callable=AsyncMock) as write:
        response = app_client.post("/api/profiles/not-running/clipboard/prepare", json={"text": "中文"})
    assert response.status_code == 404
    write.assert_not_awaited()


@pytest.mark.asyncio
async def test_native_clipboard_preserves_unicode():
    process = MagicMock()
    process.stdout = asyncio.StreamReader()
    process.stdout.feed_data("中文🌏\n第二行".encode())
    process.stdout.feed_eof()
    process.wait = AsyncMock(return_value=0)
    process.returncode = 0
    with patch("backend.main.asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=process):
        assert await main._read_x_clipboard(171) == "中文🌏\n第二行"


@pytest.mark.asyncio
async def test_native_clipboard_caps_bytes_without_splitting_unicode(monkeypatch):
    monkeypatch.setattr(main, "_CLIPBOARD_MAX_READ", 2)
    process = MagicMock()
    process.stdout = asyncio.StreamReader()
    process.stdout.feed_data("中文🌏超长文本".encode())
    process.stdout.feed_eof()
    process.wait = AsyncMock(return_value=-9)
    process.returncode = -9
    with patch("backend.main.asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=process):
        assert await main._read_x_clipboard(171) == "中文"
    process.kill.assert_called_once()
