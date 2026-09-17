import { useRef, useState } from "react";
import { Keyboard, Send, X } from "lucide-react";
import { errorMessage } from "../lib/errors";

interface Props {
  connected: boolean;
  onSend: (text: string) => Promise<void>;
}

/** Compose with the host IME instead of sending unfinished key events to VNC. */
export function RemoteTextInput({ connected, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const composing = useRef(false);

  async function send() {
    if (!connected || sending || !text || composing.current) return;
    setSending(true);
    setMessage("");
    try {
      await onSend(text);
      setText("");
      setMessage("已发送到远程窗口，请确认输入结果");
    } catch (err) {
      setMessage(errorMessage(err, "发送失败，请重新连接后重试。文字已保留。"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b border-border bg-surface-1 px-3 py-2">
      <button type="button" className="text-xs text-gray-300 flex items-center gap-1.5"
        onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="remote-text-panel">
        <Keyboard className="h-3.5 w-3.5" />中文 / 文本输入
      </button>
      {open && (
        <div id="remote-text-panel" className="mt-2 space-y-2">
          <label htmlFor="remote-text" className="label">发送到远程窗口的文字</label>
          <p className="text-xs text-gray-500">先点击远程窗口的目标输入框，再在这里使用本机输入法输入中文或粘贴多行文字。点击发送后会粘贴到远程窗口，无需授予本机剪贴板权限。</p>
          <textarea id="remote-text" className="input min-h-20 resize-y" value={text}
            placeholder="在这里输入中文、繁體中文或其他文字…" maxLength={1_048_576}
            onChange={(e) => { setText(e.target.value); setMessage(""); }}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => { composing.current = false; }}
            disabled={sending} />
          <div className="flex items-center gap-2">
            <button type="button" className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
              onClick={send} disabled={!connected || sending || !text}>
              <Send className="h-3.5 w-3.5" />{sending ? "正在发送…" : "发送文字"}
            </button>
            <button type="button" className="btn-secondary flex items-center gap-1.5" onClick={() => setOpen(false)} disabled={sending}>
              <X className="h-3.5 w-3.5" />收起
            </button>
            <span role="status" className="text-xs text-gray-400">{message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
