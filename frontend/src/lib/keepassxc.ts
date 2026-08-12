export const KEEPASSXC_EXTENSION_PATH =
  "/opt/cloakbrowser/extensions/keepassxc-browser";
export const KEEPASSXC_EXTENSION_ARG =
  `--load-extension=${KEEPASSXC_EXTENSION_PATH}`;
export const KEEPASSXC_EXTENSION_ALLOW_ARG =
  `--disable-extensions-except=${KEEPASSXC_EXTENSION_PATH}`;

export function hasKeepassxcExtension(launchArgs: string[] | null | undefined) {
  const args = launchArgs ?? [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    const rawPaths = arg === "--load-extension"
      ? args[index + 1]
      : arg.startsWith("--load-extension=")
        ? arg.slice("--load-extension=".length)
        : undefined;

    if (rawPaths?.split(",").some((path) => path.trim() === KEEPASSXC_EXTENSION_PATH)) {
      return true;
    }
  }
  return false;
}
