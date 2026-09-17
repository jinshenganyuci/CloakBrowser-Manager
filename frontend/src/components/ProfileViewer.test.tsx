import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ProfileViewer } from "./ProfileViewer";

const remote = vi.hoisted(() => ({ focus: vi.fn(), sendKey: vi.fn() }));

vi.mock("../lib/api", () => ({
  api: {
    getClipboard: vi.fn(),
    prepareClipboard: vi.fn(),
    toggleKeePassXCWindow: vi.fn(),
  },
}));

vi.mock("@novnc/novnc/core/rfb.js", () => ({
  default: class MockRFB {
    scaleViewport = false;
    resizeSession = false;
    showDotCursor = false;
    focus = remote.focus;
    sendKey = remote.sendKey;

    addEventListener(type: string, listener: () => void) {
      if (type === "connect") {
        queueMicrotask(listener);
      }
    }

    removeEventListener() {}
    disconnect() {}
  },
}));

const mockedApi = api as {
  getClipboard: ReturnType<typeof vi.fn>;
  prepareClipboard: ReturnType<typeof vi.fn>;
  toggleKeePassXCWindow: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getClipboard.mockResolvedValue({ text: "" });
  mockedApi.prepareClipboard.mockResolvedValue({ ok: true });
  mockedApi.toggleKeePassXCWindow.mockResolvedValue({ state: "shown" });
});

describe("ProfileViewer Unicode paste", () => {
  it("waits for the UTF-8 clipboard request before sending the full paste shortcut", async () => {
    let resolveClipboard!: (value: { ok: boolean }) => void;
    mockedApi.prepareClipboard.mockReturnValueOnce(new Promise((resolve) => { resolveClipboard = resolve; }));
    renderViewer(false);
    await screen.findByText("已连接");
    fireEvent.click(screen.getByRole("button", { name: "中文 / 文本输入" }));
    fireEvent.change(screen.getByLabelText("发送到远程窗口的文字"), { target: { value: "中文 🌏\n第二行" } });
    fireEvent.click(screen.getByRole("button", { name: "发送文字" }));
    expect(mockedApi.prepareClipboard).toHaveBeenCalledWith("profile-1", "中文 🌏\n第二行");
    expect(remote.sendKey).not.toHaveBeenCalled();
    resolveClipboard({ ok: true });
    await waitFor(() => expect(remote.sendKey).toHaveBeenCalledTimes(4));
    expect(remote.focus).toHaveBeenCalledOnce();
    expect(remote.sendKey.mock.calls).toEqual([
      [0xffe3, "ControlLeft", true], [0x76, "KeyV", true],
      [0x76, "KeyV", false], [0xffe3, "ControlLeft", false],
    ]);
  });

  it("never pastes the stale clipboard when the request fails", async () => {
    mockedApi.prepareClipboard.mockRejectedValueOnce(new Error("请求失败"));
    renderViewer(false);
    await screen.findByText("已连接");
    fireEvent.click(screen.getByRole("button", { name: "中文 / 文本输入" }));
    fireEvent.change(screen.getByLabelText("发送到远程窗口的文字"), { target: { value: "待发送的中文" } });
    fireEvent.click(screen.getByRole("button", { name: "发送文字" }));
    await waitFor(() => expect(screen.getByText("请求失败")).not.toBeNull());
    expect(remote.sendKey).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderViewer(keepassxcEnabled: boolean) {
  return render(
    <ProfileViewer
      profileId="profile-1"
      cdpUrl={null}
      clipboardSync={false}
      keepassxcEnabled={keepassxcEnabled}
      onDisconnect={vi.fn()}
    />,
  );
}

describe("ProfileViewer KeePassXC window action", () => {
  it("hides the button when KeePassXC is not enabled", () => {
    renderViewer(false);

    expect(screen.queryByLabelText("切换 KeePassXC 窗口")).toBeNull();
  });

  it("toggles the KeePassXC window for an enabled profile", async () => {
    renderViewer(true);
    const button = screen.getByLabelText("切换 KeePassXC 窗口") as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));

    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedApi.toggleKeePassXCWindow).toHaveBeenCalledWith("profile-1");
      expect(button.title).toBe("最小化 KeePassXC 并显示浏览器");
    });
  });
});
