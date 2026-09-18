"""Unicode round trips through the real API / SQLite and X11 clipboard boundary."""
from unittest.mock import AsyncMock, MagicMock, patch

from backend import main
from backend.browser_manager import RunningProfile, _init_profile_defaults


def test_chinese_profile_round_trip(app_client):
    payload = {
        "name": "中文配置／繁體中文 🌏", "notes": "第一行\n第二行：你好世界",
        "locale": "zh-CN", "timezone": "Asia/Shanghai",
        "tags": [{"tag": "中文标签", "color": "#6366f1"}],
        "launch_args": ["--example=中文路径"],
    }
    response = app_client.post("/api/profiles", json=payload)
    assert response.status_code == 201
    profile_id = response.json()["id"]
    for profile in [response.json(), app_client.get(f"/api/profiles/{profile_id}").json(),
                    app_client.get("/api/profiles").json()[0]]:
        for key, value in payload.items():
            assert profile[key] == value
    updated = app_client.put(f"/api/profiles/{profile_id}", json={"name": "已修改的中文名称", "locale": "zh-TW"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "已修改的中文名称"
    assert updated.json()["locale"] == "zh-TW"
    assert updated.json()["notes"] == payload["notes"]
    assert app_client.delete(f"/api/profiles/{profile_id}").status_code == 200


def test_clipboard_writes_utf8_without_latin1_loss(app_client):
    profile_id = app_client.post("/api/profiles", json={"name": "中文剪贴板"}).json()["id"]
    running = MagicMock(spec=RunningProfile)
    running.display = 155
    process = AsyncMock()
    process.returncode = None
    process.stdin = MagicMock()
    process.stdin.drain = AsyncMock()
    text = "简体中文 / 繁體中文 / 😀\n多行文字"
    main.browser_mgr.running[profile_id] = running
    try:
        with patch("backend.main.asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=process) as spawn:
            response = app_client.post(f"/api/profiles/{profile_id}/clipboard", json={"text": text})
        assert response.status_code == 200
        process.stdin.write.assert_called_once_with(text.encode("utf-8"))
        assert "UTF8_STRING" in spawn.call_args.args
    finally:
        main.browser_mgr.running.pop(profile_id, None)
        main._xclip_procs.pop(running.display, None)


def test_default_bookmarks_are_not_translated_and_preserve_user_data(tmp_path):
    _init_profile_defaults(tmp_path)
    bookmarks = tmp_path / "Default" / "Bookmarks"
    assert "Detection Tests" in bookmarks.read_text(encoding="utf-8")
    bookmarks.write_text('{"custom": "我的书签"}', encoding="utf-8")
    _init_profile_defaults(tmp_path)
    assert bookmarks.read_text(encoding="utf-8") == '{"custom": "我的书签"}'
