import { useI18n } from "../lib/i18n";
import { AlertTriangle } from "lucide-react";
import type { SystemStatus } from "../lib/api";

const TIER_LABEL: Record<string, string> = {
  pro: "Pro",
  free: "Free key",
  keyless: "Free (keyless)",
};

const TIER_COLOR: Record<string, string> = {
  pro: "text-emerald-400",
  free: "text-sky-400",
  keyless: "text-amber-400",
};

/** Small always-visible badge showing which binary/tier the Manager is running. */
export function SystemStatusBadge({ status }: { status: SystemStatus | null }) {
  const { t } = useI18n();
  if (!status) return null;

  const tier = status.license_tier || "keyless";
  const tierLabel = t(TIER_LABEL[tier] ?? tier);
  const title =
    tier === "keyless"
      ? t("No license key set. Running the free keyless build. Open Settings to add a key for the latest Pro build.")
      : t("{tier} license — running {version}", { tier: tierLabel, version: status.binary_version });

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-gray-500"
      title={title}
    >
      <span className={TIER_COLOR[tier] ?? "text-gray-400"}>
        {tierLabel}
      </span>
      <span className="text-gray-600">·</span>
      <span className="font-mono">{status.binary_version}</span>
      {status.windows_fonts_complete === false && (
        <span className="flex items-center gap-1 text-amber-400" title={t("Windows persona fonts incomplete: {present}/{required} found", { present: status.windows_fonts_present ?? 0, required: status.windows_fonts_required ?? 0 })}>
          <AlertTriangle className="h-3.5 w-3.5" /> {t("Fonts incomplete")}
        </span>
      )}
    </span>
  );
}
