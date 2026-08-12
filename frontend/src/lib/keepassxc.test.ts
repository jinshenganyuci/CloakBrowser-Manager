import { describe, expect, it } from "vitest";
import {
  hasKeepassxcExtension,
  KEEPASSXC_EXTENSION_ALLOW_ARG,
  KEEPASSXC_EXTENSION_ARG,
  KEEPASSXC_EXTENSION_PATH,
} from "./keepassxc";

describe("hasKeepassxcExtension", () => {
  it("detects the default load-extension argument", () => {
    expect(hasKeepassxcExtension([KEEPASSXC_EXTENSION_ARG])).toBe(true);
  });

  it("detects comma-separated and separate-value forms", () => {
    expect(hasKeepassxcExtension([
      `--load-extension=/tmp/other,${KEEPASSXC_EXTENSION_PATH}`,
    ])).toBe(true);
    expect(hasKeepassxcExtension([
      "--load-extension",
      KEEPASSXC_EXTENSION_PATH,
    ])).toBe(true);
  });

  it("does not treat the allow argument as enabling KeePassXC", () => {
    expect(hasKeepassxcExtension([KEEPASSXC_EXTENSION_ALLOW_ARG])).toBe(false);
  });
});
