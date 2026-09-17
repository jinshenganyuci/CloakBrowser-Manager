import { Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Profile, ProfileCreateData } from "../lib/api";
import {
  KEEPASSXC_EXTENSION_ALLOW_ARG,
  KEEPASSXC_EXTENSION_ARG,
} from "../lib/keepassxc";

export { KEEPASSXC_EXTENSION_ALLOW_ARG, KEEPASSXC_EXTENSION_ARG } from "../lib/keepassxc";

export const DEFAULT_FINGERPRINT_STORAGE_QUOTA_ARG =
  "--fingerprint-storage-quota=10000";

interface ProfileFormProps {
  profile: Profile | null; // null = create mode
  onSave: (data: ProfileCreateData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

const RESOLUTION_PRESETS: Record<string, { width: number; height: number }> = {
  "1920 × 1080 (Full HD)": { width: 1920, height: 1080 },
  "2560 × 1440 (QHD)": { width: 2560, height: 1440 },
  "1366 × 768 (HD)": { width: 1366, height: 768 },
  "1440 × 900": { width: 1440, height: 900 },
  "1536 × 864": { width: 1536, height: 864 },
  "1280 × 720 (720p)": { width: 1280, height: 720 },
};

const TAG_COLORS = [
  "#6366f1", // indigo
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#f97316", // orange
  "#ec4899", // pink
];

const GPU_PRESETS: Record<string, { vendor: string; renderer: string }> = {
  "NVIDIA RTX 3070": {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  "NVIDIA RTX 4070": {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  "AMD RX 6800 XT": {
    vendor: "Google Inc. (AMD)",
    renderer: "ANGLE (AMD, AMD Radeon RX 6800 XT (0x000073BF) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  "Intel UHD 770": {
    vendor: "Google Inc. (Intel)",
    renderer: "ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004680) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  "Apple M3 (macOS)": {
    vendor: "Google Inc. (Apple)",
    renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
  },
};

const DEFAULT_FORM: ProfileCreateData = {
  name: "",
  locale: "zh-CN",
  timezone: "Asia/Shanghai",
  platform: "windows",
  screen_width: 1280,
  screen_height: 720,
  humanize: true,
  human_preset: "careful",
  headless: false,
  geoip: false,
  clipboard_sync: false,
  auto_launch: false,
  launch_args: [
    KEEPASSXC_EXTENSION_ALLOW_ARG,
    KEEPASSXC_EXTENSION_ARG,
    DEFAULT_FINGERPRINT_STORAGE_QUOTA_ARG,
  ],
  tags: [],
};

export function ProfileForm({ profile, onSave, onDelete, onCancel }: ProfileFormProps) {
  const isEdit = profile !== null;

  const [form, setForm] = useState<ProfileCreateData>(DEFAULT_FORM);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagColor, setTagColor] = useState<string | null>("#6366f1");
  const [launchArgInput, setLaunchArgInput] = useState("");
  const composing = useRef(false);

  useEffect(() => {
    setForm(profile ? {
      name: profile.name,
      fingerprint_seed: profile.fingerprint_seed,
      proxy: profile.proxy,
      timezone: profile.timezone,
      locale: profile.locale,
      platform: profile.platform,
      user_agent: profile.user_agent,
      screen_width: profile.screen_width,
      screen_height: profile.screen_height,
      gpu_vendor: profile.gpu_vendor,
      gpu_renderer: profile.gpu_renderer,
      hardware_concurrency: profile.hardware_concurrency,
      humanize: profile.humanize,
      human_preset: profile.human_preset,
      headless: profile.headless,
      geoip: profile.geoip,
      clipboard_sync: profile.clipboard_sync,
      auto_launch: profile.auto_launch,
      color_scheme: profile.color_scheme,
      launch_args: profile.launch_args ?? [],
      notes: profile.notes,
      tags: profile.tags ?? [],
    } : DEFAULT_FORM);
  }, [profile?.id]);

  const set = <K extends keyof ProfileCreateData>(key: K, value: ProfileCreateData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || composing.current) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("确定删除此配置吗？该配置的浏览器数据将被永久删除。")) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const applyGpuPreset = (name: string) => {
    const preset = GPU_PRESETS[name];
    if (preset) {
      set("gpu_vendor", preset.vendor);
      set("gpu_renderer", preset.renderer);
    }
  };

  const randomizeSeed = () => {
    set("fingerprint_seed", Math.floor(Math.random() * 90000) + 10000);
  };

  const currentResolution = Object.entries(RESOLUTION_PRESETS).find(
    ([, v]) => v.width === form.screen_width && v.height === form.screen_height,
  )?.[0] ?? "custom";

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (form.tags?.some((t) => t.tag === tag)) return;
    set("tags", [...(form.tags ?? []), { tag, color: tagColor }]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    set("tags", (form.tags ?? []).filter((t) => t.tag !== tag));
  };

  const addLaunchArg = () => {
    const arg = launchArgInput.trim();
    if (!arg) return;
    if ((form.launch_args ?? []).includes(arg)) return;
    set("launch_args", [...(form.launch_args ?? []), arg]);
    setLaunchArgInput("");
  };

  const removeLaunchArg = (idx: number) => {
    set("launch_args", (form.launch_args ?? []).filter((_, i) => i !== idx));
  };

  return (
    <form onSubmit={handleSubmit}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; }}
      className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            {isEdit ? "编辑配置" : "新建配置"}
          </h2>
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="btn-danger flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{deleting ? "正在删除…" : "删除"}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            取消
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "正在保存…" : isEdit ? "保存" : "创建"}</span>
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Basic */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">基本设置</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label" htmlFor="profile-field-1">配置名称</label>
              <input
                  id="profile-field-1"
                className="input"
                value={form.name}
                onChange={(e) => { e.target.setCustomValidity(""); set("name", e.target.value); }}
                onInvalid={(e) => e.currentTarget.setCustomValidity("请填写配置名称")}
                placeholder="例如：中文工作账号"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="profile-field-2">操作系统</label>
              <select
                  id="profile-field-2"
                className="input"
                value={form.platform}
                onChange={(e) => set("platform", e.target.value)}
              >
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="profile-field-3">指纹种子</label>
              <div className="flex gap-2">
                <input
                  id="profile-field-3"
                  className="input flex-1 no-spin"
                  type="number"
                  value={form.fingerprint_seed ?? ""}
                  onChange={(e) => set("fingerprint_seed", e.target.value ? Number(e.target.value) : null)}
                  placeholder="自动生成随机值"
                />
                <button
                  type="button"
                  onClick={randomizeSeed}
                  className="btn-secondary px-2.5"
                  title="随机生成指纹种子"
                >
                  <svg className="h-5 w-5" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
                    {/* Right face - lightest */}
                    <polygon points="28,10 16,16 16,28 28,22" fill="currentColor" opacity="0.06" />
                    <polygon points="28,10 16,16 16,28 28,22" />
                    {/* Left face - medium shade */}
                    <polygon points="4,10 16,16 16,28 4,22" fill="currentColor" opacity="0.2" />
                    <polygon points="4,10 16,16 16,28 4,22" />
                    {/* Top face - brightest */}
                    <polygon points="16,3 28,10 16,16 4,10" fill="currentColor" opacity="0.1" />
                    <polygon points="16,3 28,10 16,16 4,10" />
                    {/* Dots on top face (3 - diagonal) */}
                    <circle cx="11.5" cy="8.5" r="1" fill="currentColor" opacity="0.7" />
                    <circle cx="16" cy="9.5" r="1" fill="currentColor" opacity="0.7" />
                    <circle cx="20.5" cy="10.5" r="1" fill="currentColor" opacity="0.7" />
                    {/* Dots on left face (5 - dice pattern) */}
                    <circle cx="7.5" cy="14" r="0.9" fill="currentColor" opacity="0.6" />
                    <circle cx="12.5" cy="16.5" r="0.9" fill="currentColor" opacity="0.6" />
                    <circle cx="10" cy="19" r="0.9" fill="currentColor" opacity="0.6" />
                    <circle cx="7.5" cy="22" r="0.9" fill="currentColor" opacity="0.6" />
                    <circle cx="12.5" cy="24.5" r="0.9" fill="currentColor" opacity="0.6" />
                    {/* Dots on right face (2 - diagonal) */}
                    <circle cx="20" cy="15" r="0.9" fill="currentColor" opacity="0.5" />
                    <circle cx="24" cy="20" r="0.9" fill="currentColor" opacity="0.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Network */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">网络设置</h3>
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="profile-field-4">代理</label>
              <input
                  id="profile-field-4"
                className="input"
                value={form.proxy ?? ""}
                onChange={(e) => set("proxy", e.target.value || null)}
                placeholder="http://user:pass@host:port"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="profile-field-5">时区</label>
                <input
                  id="profile-field-5"
                  className="input"
                  value={form.timezone ?? ""}
                  onChange={(e) => set("timezone", e.target.value || null)}
                  placeholder="例如：Asia/Shanghai"
                  list="timezone-options"
                />
                <datalist id="timezone-options">
                  <option value="Asia/Shanghai">中国标准时间</option>
                  <option value="Asia/Taipei">台北时间</option>
                  <option value="Asia/Hong_Kong">香港时间</option>
                  <option value="Asia/Singapore">新加坡时间</option>
                  <option value="America/New_York">纽约时间</option>
                  <option value="Europe/London">伦敦时间</option>
                  <option value="UTC">协调世界时</option>
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="profile-field-6">浏览器语言</label>
                <input
                  id="profile-field-6"
                  className="input"
                  value={form.locale ?? ""}
                  onChange={(e) => set("locale", e.target.value || null)}
                  placeholder="例如：zh-CN"
                  list="locale-options"
                />
                <datalist id="locale-options">
                  <option value="zh-CN">简体中文（中国大陆）</option>
                  <option value="zh-TW">繁體中文（台灣）</option>
                  <option value="zh-HK">繁體中文（香港）</option>
                  <option value="en-US">英语（美国）</option>
                  <option value="ja-JP">日语（日本）</option>
                </datalist>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.geoip ?? false}
                onChange={(e) => set("geoip", e.target.checked)}
                className="rounded border-border bg-surface-2"
              />
              根据代理 IP 自动检测时区和语言（GeoIP）
            </label>
            <p className="text-xs text-gray-500">新配置默认使用简体中文和中国标准时间。语言与时区可单独修改或清空；GeoIP 自动检测时请清空手动设置。此处控制远程浏览器，管理界面始终使用简体中文。</p>
          </div>
        </section>

        {/* Hardware */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">硬件设置</h3>
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="profile-field-7">屏幕分辨率</label>
              <select
                  id="profile-field-7"
                className="input"
                value={currentResolution}
                onChange={(e) => {
                  const preset = RESOLUTION_PRESETS[e.target.value];
                  if (preset) {
                    set("screen_width", preset.width);
                    set("screen_height", preset.height);
                  }
                }}
              >
                {Object.keys(RESOLUTION_PRESETS).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value="custom">自定义</option>
              </select>
            </div>
            {currentResolution === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="profile-field-8">宽度</label>
                  <input
                  id="profile-field-8"
                    className="input"
                    type="number"
                    value={form.screen_width ?? 1920}
                    onChange={(e) => set("screen_width", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="profile-field-9">高度</label>
                  <input
                  id="profile-field-9"
                    className="input"
                    type="number"
                    value={form.screen_height ?? 1080}
                    onChange={(e) => set("screen_height", Number(e.target.value))}
                  />
                </div>
              </div>
            )}
            <div>
              <label className="label" htmlFor="profile-field-10">逻辑处理器数量</label>
              <input
                  id="profile-field-10"
                className="input"
                type="number"
                value={form.hardware_concurrency ?? ""}
                onChange={(e) => set("hardware_concurrency", e.target.value ? Number(e.target.value) : null)}
                placeholder="根据指纹种子自动生成"
              />
            </div>
            <div>
              <label className="label" htmlFor="profile-field-11">显卡预设</label>
              <select
                  id="profile-field-11"
                className="input"
                value=""
                onChange={(e) => {
                  if (e.target.value) applyGpuPreset(e.target.value);
                }}
              >
                <option value="">请选择预设…</option>
                {Object.keys(GPU_PRESETS).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="profile-field-12">显卡厂商</label>
              <input
                  id="profile-field-12"
                className="input"
                value={form.gpu_vendor ?? ""}
                onChange={(e) => set("gpu_vendor", e.target.value || null)}
                placeholder="根据指纹种子自动生成"
              />
            </div>
            <div>
              <label className="label" htmlFor="profile-field-13">显卡渲染器</label>
              <input
                  id="profile-field-13"
                className="input"
                value={form.gpu_renderer ?? ""}
                onChange={(e) => set("gpu_renderer", e.target.value || null)}
                placeholder="根据指纹种子自动生成"
              />
            </div>
          </div>
        </section>

        {/* Behavior */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">行为设置</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.humanize ?? false}
                onChange={(e) => set("humanize", e.target.checked)}
                className="rounded border-border bg-surface-2"
              />
              模拟真人鼠标、键盘和滚动行为
            </label>
            {form.humanize && (
              <div>
                <label className="label" htmlFor="profile-field-14">模拟行为预设</label>
                <select
                  id="profile-field-14"
                  className="input"
                  value={form.human_preset}
                  onChange={(e) => set("human_preset", e.target.value)}
                >
                  <option value="default">默认（正常速度）</option>
                  <option value="careful">谨慎（较慢、更细致）</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.auto_launch ?? false}
                onChange={(e) => set("auto_launch", e.target.checked)}
                className="rounded border-border bg-surface-2"
              />
              容器启动时自动启动此配置
            </label>
            <div>
              <label className="label" htmlFor="profile-field-15">配色方案</label>
              <select
                  id="profile-field-15"
                className="input"
                value={form.color_scheme ?? ""}
                onChange={(e) => set("color_scheme", e.target.value || null)}
              >
                <option value="">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="no-preference">无偏好</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="profile-field-16">用户代理（User Agent）</label>
              <input
                  id="profile-field-16"
                className="input"
                value={form.user_agent ?? ""}
                onChange={(e) => set("user_agent", e.target.value || null)}
                placeholder="使用浏览器默认值"
              />
            </div>
          </div>
        </section>

        {/* Tags */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">标签</h3>
          {(form.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(form.tags ?? []).map((t) => (
                <span
                  key={t.tag}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-surface-3 text-gray-300"
                  style={t.color ? { backgroundColor: `${t.color}20`, color: t.color } : undefined}
                >
                  {t.tag}
                  <button
                    type="button"
                    onClick={() => removeTag(t.tag)}
                    className="hover:opacity-70"
                    aria-label={`移除标签：${t.tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTagColor(c)}
                  aria-label={`标签颜色 ${c}`}
                  aria-pressed={tagColor === c}
                  className="w-4 h-4 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c,
                    borderColor: tagColor === c ? "#fff" : "transparent",
                    transform: tagColor === c ? "scale(1.2)" : undefined,
                  }}
                />
              ))}
            </div>
            <input
              className="input flex-1"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); addTag(); } }}
              aria-label="添加标签"
              placeholder="输入标签…"
            />
            <button type="button" onClick={addTag} className="btn-secondary text-xs">
              添加
            </button>
          </div>
        </section>

        {/* Launch Args */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">启动参数</h3>
          <p className="text-xs text-gray-500 mb-2">启动时传给 Chromium 的自定义参数（例如 --load-extension、--disable-features）</p>
          {(form.launch_args ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(form.launch_args ?? []).map((arg, idx) => (
                <span
                  key={idx}
                  className="inline-flex max-w-full break-all items-center gap-1 text-xs px-2 py-1 rounded-full bg-surface-3 text-gray-300 font-mono"
                >
                  {arg}
                  <button
                    type="button"
                    onClick={() => removeLaunchArg(idx)}
                    className="hover:opacity-70"
                    aria-label={`移除启动参数：${arg}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono"
              value={launchArgInput}
              onChange={(e) => setLaunchArgInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); addLaunchArg(); } }}
              aria-label="添加启动参数"
              placeholder="--load-extension=/data/extensions/ublock"
            />
            <button type="button" onClick={addLaunchArg} className="btn-secondary text-xs">
              添加
            </button>
          </div>
        </section>

        {/* Notes */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">备注</h3>
          <textarea
            aria-label="备注"
            className="input min-h-[80px] resize-y"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            placeholder="填写此配置的备注（选填）…"
          />
        </section>
      </div>

    </form>
  );
}
