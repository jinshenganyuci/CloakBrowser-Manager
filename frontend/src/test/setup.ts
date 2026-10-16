import { beforeEach } from "vitest";
import { setLanguage } from "../lib/i18n";

// Keep the upstream behavior tests in English; localization tests explicitly
// choose Chinese when checking the new interface.
beforeEach(() => setLanguage("en"));
