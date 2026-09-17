import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FINGERPRINT_STORAGE_QUOTA_ARG,
  KEEPASSXC_EXTENSION_ALLOW_ARG,
  KEEPASSXC_EXTENSION_ARG,
  ProfileForm,
} from "./ProfileForm";

describe("ProfileForm launch arguments", () => {
  it("enables the bundled KeePassXC-Browser extension for new profiles", () => {
    render(
      <ProfileForm
        profile={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(KEEPASSXC_EXTENSION_ALLOW_ARG)).not.toBeNull();
    expect(screen.getByText(KEEPASSXC_EXTENSION_ARG)).not.toBeNull();
    expect(screen.getByText(DEFAULT_FINGERPRINT_STORAGE_QUOTA_ARG)).not.toBeNull();
  });

  it("uses the requested behavior and screen defaults for new profiles", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ProfileForm
        profile={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const humanize = screen.getByLabelText(
      "模拟真人鼠标、键盘和滚动行为",
    ) as HTMLInputElement;
    const humanPreset = screen.getByText("模拟行为预设")
      .parentElement?.querySelector("select") as HTMLSelectElement;
    const screenResolution = screen.getByText("屏幕分辨率")
      .parentElement?.querySelector("select") as HTMLSelectElement;

    expect(humanize.checked).toBe(true);
    expect(humanPreset.value).toBe("careful");
    expect(screenResolution.value).toBe("1280 × 720 (720p)");

    fireEvent.change(container.querySelector('input[placeholder="例如：中文工作账号"]')!, {
      target: { value: "Default profile" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      screen_width: 1280,
      screen_height: 720,
      humanize: true,
      human_preset: "careful",
      launch_args: expect.arrayContaining([
        DEFAULT_FINGERPRINT_STORAGE_QUOTA_ARG,
      ]),
    }));
  });

  it("allows the default KeePassXC-Browser argument to be removed", () => {
    render(
      <ProfileForm
        profile={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const launchArg = screen.getByText(KEEPASSXC_EXTENSION_ARG);
    fireEvent.click(launchArg.querySelector("button")!);

    expect(screen.queryByText(KEEPASSXC_EXTENSION_ARG)).toBeNull();
  });
});

describe("Chinese IME in profile fields", () => {
  it("waits for composition to finish before adding a tag", () => {
    render(<ProfileForm profile={null} onSave={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText("添加标签");
    fireEvent.change(input, { target: { value: "中文标签" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    expect(screen.queryByLabelText("移除标签：中文标签")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter", isComposing: false });
    expect(screen.getByLabelText("移除标签：中文标签")).not.toBeNull();
  });

  it("does not add a partial launch argument when confirming IME candidates", () => {
    render(<ProfileForm profile={null} onSave={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText("添加启动参数");
    fireEvent.change(input, { target: { value: "--test=中文" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(screen.queryByLabelText("移除启动参数：--test=中文")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByLabelText("移除启动参数：--test=中文")).not.toBeNull();
  });
});
