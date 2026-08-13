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
      "Human-like mouse, keyboard, and scroll behavior",
    ) as HTMLInputElement;
    const humanPreset = screen.getByText("Human Preset")
      .parentElement?.querySelector("select") as HTMLSelectElement;
    const screenResolution = screen.getByText("Screen Resolution")
      .parentElement?.querySelector("select") as HTMLSelectElement;

    expect(humanize.checked).toBe(true);
    expect(humanPreset.value).toBe("careful");
    expect(screenResolution.value).toBe("1280 × 720 (720p)");

    fireEvent.change(container.querySelector('input[placeholder="e.g. Amazon Seller #1"]')!, {
      target: { value: "Default profile" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
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
