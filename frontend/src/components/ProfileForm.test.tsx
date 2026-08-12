import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
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
