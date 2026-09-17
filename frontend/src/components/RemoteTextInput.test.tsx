import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RemoteTextInput } from "./RemoteTextInput";

function setup(onSend = vi.fn().mockResolvedValue(undefined), connected = true) {
  render(<RemoteTextInput onSend={onSend} connected={connected} />);
  fireEvent.click(screen.getByRole("button", { name: "中文 / 文本输入" }));
  return { onSend, input: screen.getByLabelText("发送到远程窗口的文字") };
}

describe("remote Chinese text input", () => {
  it("sends simplified/traditional Chinese, emoji and newlines intact", async () => {
    const { onSend, input } = setup();
    const text = "简体中文，繁體中文 🌏\n第二行 / + & =";
    fireEvent.change(input, { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "发送文字" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(text));
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));
    expect(screen.getByRole("status").textContent).toContain("已发送");
  });

  it("does not submit while the host IME is composing or on Enter", () => {
    const { onSend, input } = setup();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "中文" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.click(screen.getByRole("button", { name: "发送文字" }));
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("retains composed text when the request fails", async () => {
    const { input } = setup(vi.fn().mockRejectedValue(new Error("Network down")));
    fireEvent.change(input, { target: { value: "待发送文字" } });
    fireEvent.click(screen.getByRole("button", { name: "发送文字" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("发送失败"));
    expect((input as HTMLTextAreaElement).value).toBe("待发送文字");
  });

  it("disables sending while disconnected", () => {
    const { input } = setup(undefined, false);
    fireEvent.change(input, { target: { value: "中文" } });
    expect((screen.getByRole("button", { name: "发送文字" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
