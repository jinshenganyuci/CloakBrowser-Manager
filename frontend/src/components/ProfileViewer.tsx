import { useEffect, useRef, useState } from "react";
import { ClipboardCopy, Code2, Download, KeyRound, Maximize2, Minimize2, Upload } from "lucide-react";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { RemoteTextInput } from "./RemoteTextInput";
import { attachDirectInput, writeLocalClipboard } from "../lib/directInput";

interface ProfileViewerProps {
  profileId: string;
  cdpUrl: string | null;
  clipboardSync: boolean;
  keepassxcEnabled: boolean;
  onDisconnect: () => void;
}

// X11 keysym for V key (Ctrl is already held in VNC by the time we intercept)
const XK_v = 0x0076;
type ClipboardActionState = "idle" | "busy" | "success" | "error";
type KeePassXCWindowState = "unknown" | "shown" | "minimized";

export function ProfileViewer({
  profileId,
  cdpUrl,
  keepassxcEnabled,
  onDisconnect,
}: ProfileViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [directInput, setDirectInput] = useState(true);
  const [inputStatus, setInputStatus] = useState("可直接输入中文 · Ctrl/Cmd+C、V 复制粘贴");
  const [cdpCopied, setCdpCopied] = useState(false);
  const [setClipboardState, setSetClipboardState] = useState<ClipboardActionState>("idle");
  const [readClipboardState, setReadClipboardState] = useState<ClipboardActionState>("idle");
  const [keepassxcActionState, setKeepassxcActionState] = useState<ClipboardActionState>("idle");
  const [keepassxcWindowState, setKeepassxcWindowState] = useState<KeePassXCWindowState>("unknown");

  useEffect(() => {
    let rfb: any = null;
    let cancelled = false;

    async function connect() {
      try {
        // Import noVNC dynamically
        const { default: RFB } = await import("@novnc/novnc/core/rfb.js");

        if (cancelled) return;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/profiles/${profileId}/vnc`;

        rfb = new RFB(containerRef.current!, wsUrl, {
          wsProtocols: ["binary"],
        });
        rfbRef.current = rfb;

        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfb.showDotCursor = true;

        rfb.addEventListener("connect", () => {
          if (!cancelled) setConnected(true);
        });

        rfb.addEventListener("disconnect", () => {
          if (!cancelled) {
            setConnected(false);
            onDisconnect();
          }
        });

        rfb.addEventListener("securityfailure", (e: any) => {
          console.warn("[vnc] security failure:", e.detail.reason);
          setError("安全验证失败，请检查访问令牌和服务器连接配置");
        });
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "无法连接远程浏览器，请检查网络后重试"));
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (rfb) {
        try {
          rfb.disconnect();
        } catch (err) {
          console.debug("[vnc] disconnect cleanup failed:", err);
        }
      }
      rfbRef.current = null;
    };
  }, [profileId, onDisconnect]);

  useEffect(() => {
    if (!connected || !directInput || !containerRef.current || !rfbRef.current) return;
    const controller = attachDirectInput({
      container: containerRef.current,
      remote: rfbRef.current,
      prepareClipboard: (text) => api.prepareClipboard(profileId, text),
      copySelection: () => api.getClipboard(profileId),
      readClipboard: () => api.getClipboard(profileId),
      onStatus: setInputStatus,
    });
    return () => controller.destroy();
  }, [connected, directInput, profileId]);

  const toggleFullscreen = async () => {
    if (!viewerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await viewerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("[vnc] fullscreen unavailable:", err);
    }
  };

  const sendText = async (text: string) => {
    const rfb = rfbRef.current;
    if (!rfb || !connected) throw new Error("远程浏览器尚未连接");
    await api.prepareClipboard(profileId, text);
    // The request may outlive the connection. Never paste into a replacement session.
    if (rfbRef.current !== rfb) throw new Error("连接已断开，请重新连接后发送");
    rfb.focus();
    rfb.sendKey(0xffe3, "ControlLeft", true);
    rfb.sendKey(XK_v, "KeyV", true);
    rfb.sendKey(XK_v, "KeyV", false);
    rfb.sendKey(0xffe3, "ControlLeft", false);
  };

  const settleActionState = (
    setter: (state: ClipboardActionState) => void,
    state: ClipboardActionState,
  ) => {
    setter(state);
    if (state !== "busy") {
      window.setTimeout(() => setter("idle"), 2000);
    }
  };

  const actionClass = (state: ClipboardActionState) => {
    const tone = state === "success"
      ? "text-emerald-400"
      : state === "error"
        ? "text-red-400"
        : "text-gray-500 hover:text-gray-300";
    return `p-1 disabled:cursor-not-allowed disabled:opacity-40 ${state === "busy" ? "animate-pulse" : ""} ${tone}`;
  };

  const handleSetClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setDirectInput(true);
      containerRef.current?.querySelector<HTMLTextAreaElement>(".remote-ime-input")?.focus({ preventScroll: true });
      setInputStatus("请按 Ctrl/Cmd+V，将本机文字粘贴到远程窗口");
      return;
    }
    settleActionState(setSetClipboardState, "busy");
    try {
      await sendText(await navigator.clipboard.readText());
      settleActionState(setSetClipboardState, "success");
    } catch (err) {
      setInputStatus(errorMessage(err, "请点击远程输入框，然后按 Ctrl/Cmd+V 粘贴"));
      settleActionState(setSetClipboardState, "error");
    }
  };

  const handleReadClipboard = async () => {
    settleActionState(setReadClipboardState, "busy");
    try {
      const { text } = await api.getClipboard(profileId);
      try {
        await writeLocalClipboard(text);
      } catch (err) {
        console.warn("[clipboard] manual read writeText failed:", err);
        window.prompt("复制远程浏览器的剪贴板文字", text);
      }
      settleActionState(setReadClipboardState, "success");
    } catch (err) {
      console.warn("[clipboard] manual read failed:", err);
      settleActionState(setReadClipboardState, "error");
    }
  };

  const handleToggleKeePassXC = async () => {
    settleActionState(setKeepassxcActionState, "busy");
    try {
      const { state } = await api.toggleKeePassXCWindow(profileId);
      setKeepassxcWindowState(state);
      settleActionState(setKeepassxcActionState, "success");
    } catch (err) {
      console.warn("[keepassxc] window toggle failed:", err);
      settleActionState(setKeepassxcActionState, "error");
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-2">连接失败</p>
          <p className="text-gray-500 text-xs">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={viewerRef} className="relative h-full flex flex-col bg-surface-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-yellow-400 animate-pulse"}`} />
          <span className="text-xs text-gray-400">
            {connected ? "已连接" : "正在连接…"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {keepassxcEnabled && (
            <button
              onClick={handleToggleKeePassXC}
              className={actionClass(keepassxcActionState)}
              title={
                keepassxcActionState === "error"
                  ? "切换 KeePassXC 窗口失败"
                  : keepassxcWindowState === "shown"
                    ? "最小化 KeePassXC 并显示浏览器"
                    : "显示并最大化 KeePassXC"
              }
              aria-label="切换 KeePassXC 窗口"
              disabled={!connected || keepassxcActionState === "busy"}
            >
              <KeyRound className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleSetClipboard}
            className={actionClass(setClipboardState)}
            title="粘贴本机文字（Ctrl/Cmd+V）"
            disabled={!connected || setClipboardState === "busy"}
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleReadClipboard}
            className={actionClass(readClipboardState)}
            title="复制远程剪贴板到本机"
            disabled={!connected || readClipboardState === "busy"}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {cdpUrl && (
            <button
              onClick={() => {
                const base = `${window.location.protocol}//${window.location.host}${cdpUrl}`;
                navigator.clipboard?.writeText(base).then(() => {
                  setCdpCopied(true);
                  setTimeout(() => setCdpCopied(false), 2000);
                }).catch((err) => console.warn("[cdp] copy failed:", err));
              }}
              className={`p-1 ${cdpCopied ? "text-emerald-400" : "text-gray-500 hover:text-gray-300"}`}
              title={cdpCopied ? "已复制" : "复制 CDP 连接地址"}
            >
              <Code2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setDirectInput(!directInput)}
            className={`p-1 ${directInput ? "text-accent" : "text-gray-500 hover:text-gray-300"}`}
            title={directInput ? "关闭直接输入和复制粘贴" : "开启直接输入和复制粘贴"}
            disabled={!connected}
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="text-gray-500 hover:text-gray-300 p-1"
            title={fullscreen ? "退出全屏" : "全屏"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div role="status" className="px-3 py-1 text-xs text-gray-400 border-b border-border" aria-live="polite">
        {directInput ? inputStatus : "直接输入已关闭，可使用备用文字面板"}
      </div>
      <RemoteTextInput connected={connected} onSend={sendText} />

      {/* VNC canvas container */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-black overflow-hidden"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
