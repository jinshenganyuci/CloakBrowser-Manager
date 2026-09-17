import Keyboard from "@novnc/novnc/core/input/keyboard.js";

export interface RemoteKeyboard {
  focusOnClick: boolean;
  sendKey(keysym: number, code: string, down?: boolean): void;
}

/** Uses the native copy event on HTTP; Clipboard.writeText is only an enhancement. */
export async function writeLocalClipboard(text: string): Promise<void> {
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("aria-label", "复制到本机剪贴板");
  Object.assign(field.style, { position: "fixed", top: "0", left: "0", opacity: "0", pointerEvents: "none" });
  document.body.append(field);
  field.focus({ preventScroll: true });
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch { /* Use the modern API when it is available. */ }
  finally {
    field.remove();
    previous?.focus({ preventScroll: true });
  }
  if (!copied) {
    if (!navigator.clipboard?.writeText) throw new Error("浏览器未允许复制，请点击工具栏的复制按钮重试");
    await navigator.clipboard.writeText(text);
  }
}

interface Options {
  container: HTMLElement;
  remote: RemoteKeyboard;
  prepareClipboard: (text: string) => Promise<unknown>;
  copySelection: (cut: boolean) => Promise<{ text: string }>;
  readClipboard?: () => Promise<{ text: string }>;
  onStatus: (message: string) => void;
}

/** A real focused input receives host IME and clipboard events above the VNC canvas. */
export function attachDirectInput({ container, remote, prepareClipboard, copySelection, readClipboard, onStatus }: Options) {
  const input = document.createElement("textarea");
  input.className = "remote-ime-input";
  input.setAttribute("aria-label", "远程浏览器直接输入");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
  input.spellcheck = false;
  input.wrap = "off";
  container.append(input);
  remote.focusOnClick = false;
  let alive = true;
  let composing = false;
  let committed = "";
  let tail = Promise.resolve();
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  let lastCopied = "";
  let clipboardKnown = false;
  let lastRemoteClipboard = "";
  let pending = 0;
  let sequence = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const keyboard = new Keyboard(input);
  const modifiers = new Map<string, number>();
  const modifierCodes = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight"]);

  // Send every keystroke on one RFB connection. Mixing xdotool with RFB can
  // interleave modifier releases and turn Ctrl+V into a literal v.
  const shortcut = (key: "c" | "x" | "v") => {
    for (const [code, symbol] of modifiers) remote.sendKey(symbol, code, false);
    remote.sendKey(0xffe3, "ControlLeft", true);
    remote.sendKey(key.charCodeAt(0), `Key${key.toUpperCase()}`, true);
    remote.sendKey(key.charCodeAt(0), `Key${key.toUpperCase()}`, false);
    remote.sendKey(0xffe3, "ControlLeft", false);
    for (const [code, symbol] of modifiers) remote.sendKey(symbol, code, true);
  };

  const enqueue = (action: () => void | Promise<unknown>) => {
    pending++;
    sequence++;
    tail = tail.then(async () => { if (alive) await action(); }).catch((error: unknown) => {
      if (alive) onStatus(error instanceof Error ? error.message : "输入失败，请重试");
    }).finally(() => { pending--; });
    return tail;
  };
  const sendText = (text: string) => {
    if (!text) return;
    void enqueue(async () => {
      await prepareClipboard(text);
      if (!alive) return;
      shortcut("v");
      // Let the remote application consume the selection before the next insert.
      await new Promise((resolve) => setTimeout(resolve, 80));
      lastRemoteClipboard = text;
      clipboardKnown = true;
      if (alive) onStatus("可直接输入中文 · Ctrl/Cmd+C、V 复制粘贴");
    });
  };
  const copy = (cut: boolean) => {
    void enqueue(async () => {
      shortcut(cut ? "x" : "c");
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (!alive) return;
      const { text } = await copySelection(cut);
      if (!alive) return;
      lastCopied = text;
      lastRemoteClipboard = text;
      clipboardKnown = true;
      await writeLocalClipboard(text);
      if (alive) onStatus(cut ? "已剪切到本机剪贴板" : "已复制到本机剪贴板");
    });
  };

  // Detect copies made with the remote context menu or an application's Copy button.
  // Never echo incoming paste/IME data back over the user's local clipboard.
  const pollClipboard = async () => {
    if (!alive || !readClipboard) return;
    const epoch = sequence;
    try {
      const focused = document.hasFocus() && document.activeElement === input;
      if (pending === 0 && !composing && (focused || !clipboardKnown)) {
        const { text } = await readClipboard();
        if (alive && epoch === sequence && pending === 0) {
          const changed = clipboardKnown && text !== lastRemoteClipboard;
          lastRemoteClipboard = text;
          clipboardKnown = true;
          if (changed && text && focused && document.hasFocus() && document.activeElement === input) {
            lastCopied = text;
            try {
              await writeLocalClipboard(text);
              if (alive) onStatus("已复制到本机剪贴板");
            } catch { /* Ctrl+C or the toolbar provides a fresh user gesture. */ }
          }
        }
      }
    } catch { /* Transient polling errors must not disable direct keyboard input. */ }
    if (alive) pollTimer = setTimeout(pollClipboard, 500);
  };
  void pollClipboard();

  keyboard.onkeyevent = (keysym, code, down) => {
    // The remote OS is Linux even for profiles that spoof macOS.
    if (code === "MetaLeft" || code === "MetaRight") {
      keysym = 0xffe3;
      code = "ControlLeft";
    }
    void enqueue(() => {
      if (modifierCodes.has(code)) {
        if (down) modifiers.set(code, keysym);
        else modifiers.delete(code);
      }
      remote.sendKey(keysym, code, down);
    });
  };

  const keydown = (event: KeyboardEvent) => {
    if (composing || event.isComposing || event.keyCode === 229 || event.key === "Process") {
      event.stopImmediatePropagation();
      return; // Let the native IME edit the local input; never send pre-edit keystrokes.
    }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && ["c", "x", "v"].includes(key)) {
      event.stopImmediatePropagation();
      if (key === "v") return; // Native paste event works on HTTP, without clipboard permissions.
      event.preventDefault();
      if (!event.repeat) copy(key === "x");
    }
  };
  const keyup = (event: KeyboardEvent) => {
    if (composing || event.isComposing || event.keyCode === 229) event.stopImmediatePropagation();
  };
  const paste = (event: ClipboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text) sendText(text);
    else if (event.clipboardData?.files.length) onStatus("当前支持文字粘贴；图片或文件请使用网页的上传功能");
  };
  const nativeCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    copy(event.type === "cut");
  };
  const compositionStart = () => { composing = true; committed = ""; };
  const compositionEnd = (event: CompositionEvent) => {
    composing = false;
    committed = event.data;
    input.value = "";
    sendText(event.data);
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => { committed = ""; }, 300);
  };
  const inputEvent = (event: Event) => {
    const detail = event as InputEvent;
    if (composing || detail.isComposing) return;
    if (committed && detail.data === committed && /Composition/.test(detail.inputType)) {
      committed = "";
      input.value = "";
      return;
    }
    // Virtual keyboards and accessibility input can insert text without keydown.
    if (input.value) sendText(input.value);
    input.value = "";
  };
  const beforeInput = (event: InputEvent) => {
    if (event.isComposing || composing) return;
    const key = { deleteContentBackward: [0xff08, "Backspace"], deleteContentForward: [0xffff, "Delete"], insertLineBreak: [0xff0d, "Enter"], insertParagraph: [0xff0d, "Enter"] }[event.inputType];
    if (key) {
      event.preventDefault();
      void enqueue(() => remote.sendKey(key[0] as number, key[1] as string));
    }
  };
  const focus = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLCanvasElement)) return;
    const bounds = container.getBoundingClientRect();
    input.style.left = `${Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - 20))}px`;
    input.style.top = `${Math.max(0, Math.min(event.clientY - bounds.top, bounds.height - 20))}px`;
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => { if (alive) input.focus({ preventScroll: true }); }, 0);
  };
  const canvasFocus = (event: FocusEvent) => {
    if (event.target instanceof HTMLCanvasElement) input.focus({ preventScroll: true });
  };

  // Capture before noVNC's Keyboard prevents the default input/clipboard events.
  input.addEventListener("keydown", keydown, true);
  input.addEventListener("keyup", keyup, true);
  input.addEventListener("paste", paste);
  input.addEventListener("copy", nativeCopy);
  input.addEventListener("cut", nativeCopy);
  input.addEventListener("compositionstart", compositionStart);
  input.addEventListener("compositionend", compositionEnd);
  input.addEventListener("beforeinput", beforeInput);
  input.addEventListener("input", inputEvent);
  container.addEventListener("pointerdown", focus, true);
  container.addEventListener("mouseup", focus, true);
  container.addEventListener("focusin", canvasFocus);
  keyboard.grab();

  return {
    copyLast: () => writeLocalClipboard(lastCopied),
    focus: () => input.focus({ preventScroll: true }),
    destroy: () => {
      if (!alive) return;
      // Release held modifiers before invalidating queued operations.
      keyboard.ungrab();
      for (const [keysym, code] of [[0xffe3, "ControlLeft"], [0xffe4, "ControlRight"], [0xffe1, "ShiftLeft"], [0xffe2, "ShiftRight"], [0xffe9, "AltLeft"], [0xffea, "AltRight"]] as const) remote.sendKey(keysym, code, false);
      alive = false;
      clearTimeout(focusTimer);
      clearTimeout(commitTimer);
      clearTimeout(pollTimer);
      container.removeEventListener("pointerdown", focus, true);
      container.removeEventListener("mouseup", focus, true);
      container.removeEventListener("focusin", canvasFocus);
      input.remove();
      remote.focusOnClick = true;
    },
  };
}
