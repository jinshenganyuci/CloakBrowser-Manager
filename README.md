# CloakBrowser 管理器 · 中文版

基于 [CwithW/CloakBrowser-Manager](https://github.com/CwithW/CloakBrowser-Manager) 二次开发的简体中文浏览器配置管理器，保留原项目的配置隔离、指纹设置、代理、远程查看、自动启动、CDP 自动化和 KeePassXC 通行密钥功能。

[英文上游文档](README.en.md) · [更新记录](CHANGELOG.zh-CN.md) · [反馈问题](https://github.com/jinshenganyuci/CloakBrowser-Manager/issues)

![中文配置界面](docs/screenshots/chinese-profile.png)

## 中文支持

- 管理界面、登录页、表单、操作状态、工具提示、删除确认、错误提示与输入校验均使用简体中文。
- 配置名称、备注、标签支持简繁中文和 Emoji；备注支持多行，配置名称支持中文搜索，保存和编辑保留原文。
- 新建配置默认使用 `zh-CN` 和 `Asia/Shanghai`，可选择 `zh-TW`、`zh-HK` 等语言，也可输入任意有效语言/时区或清空。已有配置不会被改成中文语言或中国时区。
- Docker 内提供 Noto CJK 中文字体、Emoji 字体和 `zh_CN.UTF-8` 环境；KeePassXC 界面设置为简体中文，并补齐 Qt 标准按钮和对话框的中文语言包。
- 点击远程画面后可直接使用本机中文输入法；支持 Ctrl/Cmd+C、X、V 双向文字复制、剪切和粘贴，普通 HTTP 下也可使用。备用文字面板仍保留。
- 标签和启动参数输入框识别输入法组合状态，确认候选词时不会提前添加。
- API 路径、字段名、状态枚举和 Chromium 参数保持原协议，自动化脚本继续使用 `running`、`stopped` 等原始值。

## 快速开始

当前 Docker 构建面向 **Linux amd64 / x86_64**，需要 Docker Engine 与 Compose 插件。浏览器、KeePassXC 和依赖下载需要可用网络；每个运行中的配置通常需要数百 MB 内存。

```bash
git clone https://github.com/jinshenganyuci/CloakBrowser-Manager.git
cd CloakBrowser-Manager
cp .env.example .env
chmod 600 .env
# 编辑 .env，设置自己的 KeePassXC 数据库密码；需要登录保护时同时设置 AUTH_TOKEN。
docker compose up -d --build
```

在浏览器中打开 <http://localhost:8080>。点击「新建配置」，填写名称并创建，再点击「启动」。中文代码必须从本仓库构建；上游 `cloakhq/cloakbrowser-manager` 镜像不包含本分支的修改。

Compose 默认只监听 `127.0.0.1:8080`。在远程服务器上运行时，可以通过 SSH 转发访问：

```bash
ssh -L 8080:127.0.0.1:8080 your-server
```

配置和浏览器数据默认保存在宿主机 `~/.cloakbrowser-manager`，映射为容器 `/data`。需要改端口或数据目录时编辑 `docker-compose.yml`。

## 配置说明

| 设置 | 用途 |
| --- | --- |
| 配置名称、标签、备注 | 管理和区分浏览器环境，支持中文 |
| 操作系统、指纹种子 | 设置模拟平台与指纹种子；留空种子会自动生成 |
| 代理 | 支持 HTTP / SOCKS 代理，例如 `http://user:pass@host:port` |
| 时区、浏览器语言 | 控制远程浏览器环境；管理器界面固定使用简体中文 |
| GeoIP | 根据代理出口检测语言和时区；需要自动检测的字段应清空，手动值优先 |
| 屏幕、显卡、逻辑处理器 | 设置对应指纹参数，显卡原始标识保留英文协议值 |
| 模拟真人行为 | 默认启用谨慎模式；延续 CwithW 分支的设置 |
| 直接输入与剪贴板 | 在查看器工具栏开启/关闭；支持本机输入法与文字双向传输 |
| 自动启动 | 容器启动后自动启动此配置 |
| 启动参数 | 逐条填写 Chromium 参数，支持扩展等配置 |

新建配置延续 CwithW 的 `1280 × 720` 分辨率、谨慎模式、KeePassXC 扩展和 `--fingerprint-storage-quota=10000` 默认值。通过 API 创建配置仍遵循原有 API 默认值；需要中文浏览器环境时显式传入 `locale` 与 `timezone`。

### 直接输入中文与复制粘贴

1. 点击远程浏览器中的输入框、网页编辑区或地址栏。
2. 切换本机输入法，直接输入中文；无需打开额外面板或点击发送。
3. 使用 `Ctrl+C / Ctrl+X / Ctrl+V` 复制、剪切、粘贴文字和链接，macOS 使用对应的 `Cmd` 快捷键。

输入法候选词只在本机组合，确认后按顺序发送到远程窗口，不会将拼音或确认回车重复传入。网页、地址栏和远程原生窗口使用同一条键盘通道，避免快捷键的修饰键乱序。

远程画面处于焦点时，右键菜单或应用「复制」按钮产生的新文字也会同步到本机。切换离开画面后停止后台同步；输入中文或向远程粘贴时，不会反向覆盖本机剪贴板。工具栏剪贴板图标可关闭或开启直接输入功能，默认开启，旧配置无需修改。

这些功能支持当前普通 HTTP 测试地址，快捷键粘贴直接使用浏览器原生事件。如果本机浏览器拦截了自动复制，可点击工具栏「复制远程剪贴板到本机」重试。点击粘贴按钮但当前环境无法主动读取剪贴板时，界面会提示使用 `Ctrl/Cmd+V`。

当前跨端剪贴板传输的是**文字和链接**；图片、文件请使用网页的上传功能。网站或应用禁止粘贴时仍受其输入规则限制。「中文 / 文本输入」面板保留为备用方式。

### KeePassXC 与通行密钥

每个启用内置扩展的配置拥有独立的 KeePassXC 数据库，存放在 `/data/profiles/<配置 ID>/KeePassXC`。工具栏钥匙按钮用于切换 KeePassXC 与浏览器窗口。

- `KEEPASSXC_DATABASE_PASSWORD` 必须非空，且不能含换行。Compose 中保留了上游的开发默认密码，实际使用请在 `.env` 中设置自己的密码。
- 密码只在管理器启动时读取，并通过标准输入传给 KeePassXC；不会传给浏览器子进程。
- 修改环境变量不会重新加密已有数据库。迁移或更新时须使用原密码，或先自行重新加密数据库。
- 扩展的 `--load-extension=/opt/cloakbrowser/extensions/keepassxc-browser` 参数也是 KeePassXC 启动开关；删除该参数可关闭当前配置的集成。
- 此分支保留 CwithW 的自动解锁和关闭自动锁定行为，可在 KeePassXC 中手动锁定。

## 登录保护

在 `.env` 中设置 `AUTH_TOKEN` 后重建或重新创建容器：

```bash
docker compose up -d
```

管理界面会显示中文登录页。API 使用 `Authorization: Bearer <令牌>`，VNC WebSocket 使用登录 Cookie；`/api/status` 保留为免认证健康检查接口。通过公网访问时，应配置 HTTPS 反向代理。

## 更新与数据保留

```bash
git pull --ff-only
docker compose up -d --build
```

重建容器不会清除挂载目录中的配置、Cookie、会话和 KeePassXC 数据库。升级前可备份 `~/.cloakbrowser-manager`，保持数据库密码不变。删除单个配置会永久移除该配置的浏览器数据。

## 自动化 API

运行中的配置可以通过管理器代理的 CDP 地址连接 Playwright / Puppeteer。查看器工具栏的代码图标可复制地址。

```python
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(
            "http://localhost:8080/api/profiles/<配置 ID>/cdp",
            # 启用登录保护时，通过环境变量读取令牌并传入 headers。
        )
        page = browser.contexts[0].pages[0]
        await page.goto("https://example.com")

asyncio.run(main())
```

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET / POST | `/api/profiles` | 列出 / 创建配置 |
| GET / PUT / DELETE | `/api/profiles/{id}` | 读取 / 修改 / 删除配置 |
| POST | `/api/profiles/{id}/launch` | 启动浏览器 |
| POST | `/api/profiles/{id}/stop` | 停止浏览器 |
| GET / POST | `/api/profiles/{id}/clipboard` | 读取 / 写入当前 X11 文本剪贴板 |
| POST | `/api/profiles/{id}/clipboard/prepare` | 写入并确认剪贴板就绪后再发送粘贴快捷键 |
| POST | `/api/profiles/{id}/keepassxc/toggle-window` | 切换 KeePassXC 窗口 |
| GET | `/api/status` | 系统健康状态 |

## 开发与验证

推荐使用 Docker 运行完整浏览器环境。仅进行前后端开发时：

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt pytest pytest-asyncio
cd frontend
npm ci
npm run dev
```

后端还需要 KasmVNC、xclip、xdotool、浏览器运行依赖、可写的 `/data`，以及 KeePassXC 运行时和扩展；这些均在 Dockerfile 中配置。前端开发服务器默认代理 `/api` 到 `127.0.0.1:8080`。

```bash
.venv/bin/python -m pytest backend/tests -q
(cd frontend && npm test -- --run --maxWorkers=1)
(cd frontend && npm run build)
bash -n entrypoint.sh
docker compose config
git diff --check
```

GitHub Actions 自动运行后端测试、前端测试、生产构建和配置检查。单元测试使用模拟浏览器；真实浏览器验收另见 [验收记录](docs/verification.zh-CN.md)。

## 来源与许可

本分支从 CwithW 的 `2d6ab81` 提交开始开发，原始管理器来自 [CloakHQ/CloakBrowser-Manager](https://github.com/CloakHQ/CloakBrowser-Manager)，浏览器由 [CloakBrowser](https://github.com/CloakHQ/CloakBrowser) 提供。

管理器源代码使用 [MIT 许可证](LICENSE)。浏览器二进制使用独立的 [CloakBrowser Binary License](BINARY-LICENSE.md)；本仓库保留原始许可文件。Docker 构建由使用者从官方渠道下载浏览器，二进制的使用和分发须遵守其许可。
