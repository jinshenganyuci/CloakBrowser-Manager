/** Chinese messages for the API contract; protocol values remain unchanged. */
const messages: Record<string, string> = {
  "Clipboard update timed out": "剪贴板更新超时，未执行粘贴，请重试",
  "Invalid token": "访问令牌不正确，请重新输入",
  "Unauthorized": "登录已过期，请重新登录",
  "Profile not found": "配置不存在，可能已被删除",
  "Profile is already running": "此配置已在运行",
  "Profile is not running": "此配置尚未启动",
  "Profile not running": "此配置尚未启动",
  "Failed to launch browser": "浏览器启动失败，请检查配置和服务日志",
  "CDP endpoint unreachable": "无法连接浏览器的 CDP 接口",
  "Not found": "请求的资源不存在",
  "Network error": "网络连接失败，请检查网络和服务器状态",
  "Failed to fetch": "网络连接失败，请检查网络和服务器状态",
  "KeePassXC is no longer running.": "KeePassXC 已停止运行",
  "Could not find the KeePassXC window.": "未找到 KeePassXC 窗口",
  "Could not find the Chromium window.": "未找到浏览器窗口",
  "Timed out while controlling the KeePassXC window.": "控制 KeePassXC 窗口超时",
};

const fields: Record<string, string> = {
  name: "配置名称", token: "访问令牌", text: "文本", timezone: "时区",
  locale: "浏览器语言", platform: "操作系统", fingerprint_seed: "指纹种子",
  screen_width: "屏幕宽度", screen_height: "屏幕高度", proxy: "代理",
  hardware_concurrency: "逻辑处理器数量", human_preset: "模拟行为预设",
  color_scheme: "配色方案", tags: "标签", tag: "标签", notes: "备注",
  launch_args: "启动参数", body: "请求内容",
};

export function apiErrorMessage(status: number, detail: unknown): string {
  if (typeof detail === "string" && messages[detail]) return messages[detail];
  if (Array.isArray(detail)) {
    const labels = detail.map((item) => {
      const path = Array.isArray(item?.loc) ? item.loc : [];
      return path.map((part: unknown) => fields[String(part)]).filter(Boolean).at(-1) || "请求参数";
    });
    return `请检查${[...new Set(labels)].join("、")}：格式或取值不正确`;
  }
  if (typeof detail === "string") {
    if (detail.startsWith("Proxy URL")) return "代理地址不正确，请检查协议、主机名和端口";
    if (detail.includes("KeePassXC")) return "KeePassXC 操作失败，请检查数据库密码、扩展设置和服务日志";
    if (/CDP ports/.test(detail)) return "没有可用的 CDP 端口，请停止部分浏览器后重试";
  }
  const statuses: Record<number, string> = {
    400: "请求参数不正确，请检查配置", 401: "请先登录或检查访问令牌",
    403: "没有执行此操作的权限", 404: "请求的资源不存在",
    409: "当前状态无法执行此操作，请刷新后重试",
    413: "发送的内容过长，请缩短后重试", 422: "请求参数格式或取值不正确",
    429: "请求过于频繁，请稍后重试", 500: "服务器内部错误，请查看服务日志",
    502: "无法连接上游服务，请稍后重试", 503: "服务暂时不可用，请稍后重试",
    504: "服务器响应超时，请稍后重试",
  };
  return statuses[status] || `请求失败（HTTP ${status}），请稍后重试`;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return messages[error.message] || (/[\u3400-\u9fff]/.test(error.message) ? error.message : fallback);
}
