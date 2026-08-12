import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ProfileViewer } from "./ProfileViewer";

vi.mock("../lib/api", () => ({
  api: {
    getClipboard: vi.fn(),
    setClipboard: vi.fn(),
    toggleKeePassXCWindow: vi.fn(),
  },
}));

vi.mock("@novnc/novnc/core/rfb.js", () => ({
  default: class MockRFB {
    scaleViewport = false;
    resizeSession = false;
    showDotCursor = false;

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
  setClipboard: ReturnType<typeof vi.fn>;
  toggleKeePassXCWindow: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockedApi.getClipboard.mockResolvedValue({ text: "" });
  mockedApi.setClipboard.mockResolvedValue({ ok: true });
  mockedApi.toggleKeePassXCWindow.mockResolvedValue({ state: "shown" });
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

    expect(screen.queryByLabelText("Toggle KeePassXC window")).toBeNull();
  });

  it("toggles the KeePassXC window for an enabled profile", async () => {
    renderViewer(true);
    const button = screen.getByLabelText("Toggle KeePassXC window") as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));

    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedApi.toggleKeePassXCWindow).toHaveBeenCalledWith("profile-1");
      expect(button.title).toBe("Minimize KeePassXC and maximize Chromium");
    });
  });
});
