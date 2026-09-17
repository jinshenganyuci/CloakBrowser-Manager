import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDirectInput, writeLocalClipboard } from "./directInput";

const driver = vi.hoisted(() => ({ onkeyevent: null as null | ((symbol: number, code: string, down: boolean) => void) }));
vi.mock("@novnc/novnc/core/input/keyboard.js", () => ({
  default: class {
    set onkeyevent(value: typeof driver.onkeyevent) { driver.onkeyevent = value; }
    grab() {}
    ungrab() {}
  },
}));

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); document.body.innerHTML = ""; vi.restoreAllMocks(); vi.useRealTimers(); Reflect.deleteProperty(document, "execCommand"); });

function setup(readClipboard?: () => Promise<{ text: string }>) {
  const container = document.createElement("div");
  document.body.append(container);
  const remote = { focusOnClick: true, sendKey: vi.fn() };
  const insertText = vi.fn().mockResolvedValue({ ok: true });
  const copySelection = vi.fn().mockResolvedValue({ text: "远程中文" });
  const onStatus = vi.fn();
  const controller = attachDirectInput({ container, remote, prepareClipboard: insertText, copySelection, readClipboard, onStatus });
  cleanups.push(controller.destroy);
  return { input: container.querySelector("textarea")!, remote, insertText, copySelection, controller, onStatus };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("direct remote input", () => {
  it("commits Chinese once and never sends IME pre-edit text", async () => {
    const { input, insertText } = setup();
    input.dispatchEvent(new CompositionEvent("compositionstart"));
    input.value = "zhongwen";
    input.dispatchEvent(new InputEvent("input", { data: "zhongwen", isComposing: true, inputType: "insertCompositionText" }));
    expect(insertText).not.toHaveBeenCalled();
    input.value = "中文";
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "中文" }));
    input.dispatchEvent(new InputEvent("input", { data: "中文", inputType: "insertFromComposition" }));
    await flush();
    expect(insertText).toHaveBeenCalledExactlyOnceWith("中文");
  });

  it("does not send cancelled composition", async () => {
    const { input, insertText } = setup();
    input.dispatchEvent(new CompositionEvent("compositionstart"));
    input.value = "pinyin";
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "" }));
    await flush();
    expect(insertText).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("uses native paste data without navigator.clipboard", async () => {
    const { input, insertText } = setup();
    const event = new Event("paste", { cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "繁體中文 🌏\n第二行", files: [] } });
    input.dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(insertText).toHaveBeenCalledExactlyOnceWith("繁體中文 🌏\n第二行");
  });

  it("serializes keys after an asynchronous IME insertion", async () => {
    const { input, insertText, remote } = setup();
    let finish!: () => void;
    insertText.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "中文" }));
    driver.onkeyevent!(97, "KeyA", true);
    driver.onkeyevent!(97, "KeyA", false);
    await flush();
    expect(remote.sendKey).not.toHaveBeenCalled();
    finish();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(remote.sendKey.mock.calls.slice(-2)).toEqual([[97, "KeyA", true], [97, "KeyA", false]]);
  });

  it("drops pending keys when the connection is destroyed", async () => {
    const { input, insertText, remote, controller } = setup();
    let finish!: () => void;
    insertText.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "中文" }));
    driver.onkeyevent!(97, "KeyA", true);
    await flush();
    controller.destroy();
    remote.sendKey.mockClear();
    finish();
    await flush();
    expect(remote.sendKey).not.toHaveBeenCalled();
    expect(input.isConnected).toBe(false);
  });

  it("maps macOS Command to the remote Linux Control key", async () => {
    const { remote } = setup();
    driver.onkeyevent!(0xffeb, "MetaLeft", true);
    await flush();
    expect(remote.sendKey).toHaveBeenCalledWith(0xffe3, "ControlLeft", true);
  });

  it("copies the current remote selection on Ctrl+C without leaking the shortcut", async () => {
    const { input, copySelection, onStatus } = setup();
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn().mockReturnValue(true) });
    const event = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, cancelable: true });
    input.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(event.defaultPrevented).toBe(true);
    expect(copySelection).toHaveBeenCalledExactlyOnceWith(false);
    expect(onStatus).toHaveBeenCalledWith("已复制到本机剪贴板");
  });

  it("synchronizes remote changes but never echoes local typing into the host clipboard", async () => {
    vi.useFakeTimers();
    let clipboard = "initial";
    const readClipboard = vi.fn(async () => ({ text: clipboard }));
    const { input, insertText } = setup(readClipboard);
    input.focus();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const copy = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: copy });
    await vi.advanceTimersByTimeAsync(0);
    insertText.mockImplementation(async (text: string) => { clipboard = text; return { ok: true }; });
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "本机输入" }));
    await vi.advanceTimersByTimeAsync(600);
    expect(copy).not.toHaveBeenCalled();
    clipboard = "网页复制按钮产生的文字";
    await vi.advanceTimersByTimeAsync(600);
    expect(copy).toHaveBeenCalledOnce();
  });

  it("does not overwrite the local clipboard after focus leaves the remote viewer", async () => {
    vi.useFakeTimers();
    let finish!: (value: { text: string }) => void;
    const readClipboard = vi.fn().mockResolvedValueOnce({ text: "initial" }).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { input } = setup(readClipboard);
    input.focus();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const copy = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: copy });
    await vi.advanceTimersByTimeAsync(500);
    input.blur();
    finish({ text: "late response" });
    await vi.advanceTimersByTimeAsync(0);
    expect(copy).not.toHaveBeenCalled();
  });

  it("keeps Ctrl+V default behavior so the trusted paste event can fire", () => {
    const { input } = setup();
    const event = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("HTTP clipboard writing", () => {
  it("uses a selected native field and restores focus", async () => {
    const previous = document.createElement("input"); document.body.append(previous); previous.focus();
    const copy = vi.fn(() => { expect((document.activeElement as HTMLTextAreaElement).value).toBe("中文"); return true; });
    Object.defineProperty(document, "execCommand", { configurable: true, value: copy });
    await writeLocalClipboard("中文");
    expect(copy).toHaveBeenCalledWith("copy");
    expect(document.activeElement).toBe(previous);
  });
});
