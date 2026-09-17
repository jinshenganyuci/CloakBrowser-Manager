interface StatusIndicatorProps {
  status: "running" | "stopped";
  size?: "sm" | "md";
}

export function StatusIndicator({ status, size = "sm" }: StatusIndicatorProps) {
  const sizeClass = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  const isRunning = status === "running";

  return (
    <span className="relative inline-flex" role="img" aria-label={isRunning ? "运行中" : "已停止"} title={isRunning ? "运行中" : "已停止"}>
      {isRunning && (
        <span
          className={`absolute inline-flex ${sizeClass} rounded-full bg-emerald-400 opacity-75 animate-ping`}
        />
      )}
      <span
        className={`relative inline-flex ${sizeClass} rounded-full ${
          isRunning ? "bg-emerald-400" : "bg-gray-500"
        }`}
      />
    </span>
  );
}
