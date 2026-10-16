import { Languages } from "lucide-react";
import { useI18n, type Language } from "../lib/i18n";

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="inline-flex items-center gap-1.5 text-gray-400">
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
      <select
        aria-label={t("Interface language")}
        title={t("Interface language")}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        className="h-8 rounded-md border border-border bg-surface-2 px-2 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        <option value="zh-CN">简体中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
