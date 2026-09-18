import { useState } from "react";

type RegionOption = readonly [value: string, label: string];

export const TIMEZONE_OPTIONS: readonly RegionOption[] = [
  ["Asia/Shanghai", "中国大陆（CN）· 上海"],
  ["Asia/Taipei", "中国台湾（TW）· 台北"],
  ["Asia/Hong_Kong", "中国香港（HK）· 香港"],
  ["America/New_York", "美国（US）· 东部 / 纽约"],
  ["America/Chicago", "美国（US）· 中部 / 芝加哥"],
  ["America/Denver", "美国（US）· 山地 / 丹佛"],
  ["America/Los_Angeles", "美国（US）· 西部 / 洛杉矶"],
  ["Asia/Tokyo", "日本（JP）· 东京"],
  ["Europe/Berlin", "德国（DE）· 柏林"],
  ["Europe/London", "英国（GB）· 伦敦"],
  ["Europe/Paris", "法国（FR）· 巴黎"],
  ["Asia/Seoul", "韩国（KR）· 首尔"],
  ["Asia/Singapore", "新加坡（SG）"],
  ["America/Toronto", "加拿大（CA）· 多伦多"],
  ["America/Vancouver", "加拿大（CA）· 温哥华"],
  ["Australia/Sydney", "澳大利亚（AU）· 悉尼"],
  ["Asia/Kolkata", "印度（IN）· 加尔各答"],
  ["UTC", "协调世界时（UTC）"],
];

export const LOCALE_OPTIONS: readonly RegionOption[] = [
  ["zh-CN", "简体中文 · 中国大陆（CN）"],
  ["zh-TW", "繁体中文 · 中国台湾（TW）"],
  ["zh-HK", "繁体中文 · 中国香港（HK）"],
  ["en-US", "英语 · 美国（US）"],
  ["ja-JP", "日语 · 日本（JP）"],
  ["de-DE", "德语 · 德国（DE）"],
  ["en-GB", "英语 · 英国（GB）"],
  ["fr-FR", "法语 · 法国（FR）"],
  ["ko-KR", "韩语 · 韩国（KR）"],
  ["en-SG", "英语 · 新加坡（SG）"],
  ["en-CA", "英语 · 加拿大（CA）"],
  ["en-AU", "英语 · 澳大利亚（AU）"],
  ["en-IN", "英语 · 印度（IN）"],
  ["es-ES", "西班牙语 · 西班牙（ES）"],
  ["pt-BR", "葡萄牙语 · 巴西（BR）"],
  ["ru-RU", "俄语 · 俄罗斯（RU）"],
];

interface RegionSelectProps {
  id: string;
  label: string;
  value: string | null | undefined;
  options: readonly RegionOption[];
  placeholder: string;
  onChange: (value: string | null) => void;
}

export function RegionSelect({ id, label, value, options, placeholder, onChange }: RegionSelectProps) {
  const [customSelected, setCustomSelected] = useState(false);
  const custom = customSelected || (!!value && !options.some(([preset]) => preset === value));

  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="input"
        value={custom ? "custom" : (value ?? "")}
        onChange={(e) => {
          const next = e.target.value;
          setCustomSelected(next === "custom");
          if (next !== "custom") onChange(next || null);
        }}
      >
        <option value="">留空（使用 GeoIP 或浏览器默认值）</option>
        {options.map(([preset, name]) => (
          <option key={preset} value={preset}>{name} · {preset}</option>
        ))}
        <option value="custom">自定义…</option>
      </select>
      {custom && (
        <div className="mt-2">
          <label className="label" htmlFor={`${id}-custom`}>自定义{label}</label>
          <input
            id={`${id}-custom`}
            className="input"
            value={value ?? ""}
            placeholder={placeholder}
            onChange={(e) => {
              setCustomSelected(true);
              onChange(e.target.value || null);
            }}
          />
        </div>
      )}
    </div>
  );
}
