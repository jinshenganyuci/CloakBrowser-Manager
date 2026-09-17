import { useEffect, useRef, useState } from "react";
import { ClipboardCopy, Code2, Download, KeyRound, Maximize2, Minimize2, Upload } from "lucide-react";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { RemoteTextInput } from "./RemoteTextInput";

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

function isClipboardPermissionError(err: unknown) {
  const name = err instanceof DOMException ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  return (
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    /clipboard read operation is not allowed|permission|denied/i.test(message)
  );
}

export function ProfileViewer({
  profileId,
  cdpUrl,
  clipboardSync: initialClipboardSync,
  keepassxcEnabled,
  onDisconnect,
}: ProfileViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [clipboardSync, setClipboardSync] = useState(initialClipboardSync);
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

  // Host→VNC: intercept Ctrl+V/Cmd+V at keydown (capture phase)
  // Must fire BEFORE noVNC's canvas listener to prevent the race condition
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !clipboardSync || !connected) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      console.log("[clipboard] keydown:", e.key, "ctrl:", e.ctrlKey, "meta:", e.metaKey, "clipboardSync:", true);

      const isPaste =
        e.key === "v" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      if (!isPaste) return;

      console.log("[clipboard] intercepted Ctrl+V");

      // Block noVNC from sending the keystroke before clipboard is updated
      e.stopPropagation();
      e.preventDefault();

      const rfb = rfbRef.current;
      if (!rfb) {
        console.log("[clipboard] no rfb ref, aborting");
        return;
      }

      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          console.log("[clipboard] calling setClipboard API...");
          await api.setClipboard(profileId, text);
          console.log("[clipboard] setClipboard API success");
        }
      } catch (err) {
        console.warn("[clipboard] error:", err);
        setClipboardSync(false);
        return;
      }

      // Send full Ctrl+V sequence to VNC. We can't rely on Ctrl still being
      // held because the user may have released it during the async API call.
      console.log("[clipboard] sending Ctrl+V to VNC");
      rfb.sendKey(0xffe3, "ControlLeft", true);   // Ctrl press
      rfb.sendKey(XK_v, "KeyV", true);             // V press
      rfb.sendKey(XK_v, "KeyV", false);            // V release
      rfb.sendKey(0xffe3, "ControlLeft", false);   // Ctrl release
    };

    // capture: true ensures we fire before noVNC's canvas listener
    container.addEventListener("keydown", handleKeyDown, true);
    return () => container.removeEventListener("keydown", handleKeyDown, true);
  }, [profileId, clipboardSync, connected]);

  // VNC→Host: keep a best-effort listener for standard noVNC clipboard
  // events. KasmVNC CutText transport is disabled server-side to prevent
  // private BinaryClipboard type 180 messages from reaching noVNC.
  useEffect(() => {
    const rfb = rfbRef.current;
    console.log("[clipboard] VNC→Host effect: rfb=", !!rfb, "sync=", clipboardSync, "connected=", connected);
    if (!rfb || !clipboardSync || !connected) return;

    const handleClipboard = (e: any) => {
      const text = e.detail?.text;
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          console.log("[clipboard] writeText success");
        }).catch((err) => {
          console.warn("[clipboard] writeText failed:", err);
        });
      }
    };

    console.log("[clipboard] registering clipboard event listener on rfb");
    rfb.addEventListener("clipboard", handleClipboard);
    return () => {
      console.log("[clipboard] removing clipboard event listener");
      rfb.removeEventListener("clipboard", handleClipboard);
    };
  }, [clipboardSync, connected]);

  // VNC→Host polling: Chrome doesn't write to X11 clipboard under KasmVNC.
  // Poll via Playwright CDP instead of relying on KasmVNC clipboard messages.
  useEffect(() => {
    if (!clipboardSync || !connected) return;

    let cancelled = false;
    let lastText = "";

    const poll = async () => {
      if (cancelled) return;
      try {
        const { text } = await api.getClipboard(profileId);
        if (text && text !== lastText) {
          lastText = text;
          await navigator.clipboard.writeText(text).catch((err) =>
            console.warn("[clipboard] poll writeText failed:", err)
          );
        }
      } catch (err) {
        console.warn("[clipboard] poll error, stopping:", err);
        cancelled = true;
        return;
      }
      if (!cancelled) {
        setTimeout(poll, 2000);
      }
    };

    // Start polling after a short delay
    const timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profileId, clipboardSync, connected]);

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
    await api.setClipboard(profileId, text);
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
    settleActionState(setSetClipboardState, "busy");
    try {
      let text = "";
      try {
        if (!navigator.clipboard?.readText) {
          throw new Error("当前环境不支持剪贴板接口");
        }
        text = await navigator.clipboard.readText();
      } catch (err) {
        if (isClipboardPermissionError(err)) {
          console.debug("[clipboard] manual set cancelled or denied:", err);
          settleActionState(setSetClipboardState, "idle");
          return;
        }
        console.warn("[clipboard] manual set readText unavailable:", err);
        const fallback = window.prompt("粘贴要发送到远程浏览器剪贴板的文字", "");
        if (fallback === null) {
          settleActionState(setSetClipboardState, "idle");
          return;
        }
        text = fallback;
      }

      await api.setClipboard(profileId, text);
      try {
        rfbRef.current?.clipboardPasteFrom?.(text);
      } catch (err) {
        console.warn("[clipboard] noVNC clipboardPasteFrom failed:", err);
      }
      settleActionState(setSetClipboardState, "success");
    } catch (err) {
      console.warn("[clipboard] manual set failed:", err);
      settleActionState(setSetClipboardState, "error");
    }
  };

  const handleReadClipboard = async () => {
    settleActionState(setReadClipboardState, "busy");
    try {
      const { text } = await api.getClipboard(profileId);
      try {
        await navigator.clipboard.writeText(text);
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
            title="发送剪贴板到远程浏览器"
            disabled={!connected || setClipboardState === "busy"}
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleReadClipboard}
            className={actionClass(readClipboardState)}
            title="读取远程浏览器剪贴板"
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
            onClick={() => { console.log("[clipboard] toggle:", !clipboardSync); setClipboardSync(!clipboardSync); }}
            className={`p-1 ${clipboardSync ? "text-accent" : "text-gray-500 hover:text-gray-300"}`}
            title={clipboardSync ? "关闭剪贴板同步" : "开启剪贴板同步"}
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

      <RemoteTextInput connected={connected} onSend={sendText} />

      {/* VNC canvas container */}
      <div
        ref={containerRef}
        className="flex-1 bg-black overflow-hidden"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
