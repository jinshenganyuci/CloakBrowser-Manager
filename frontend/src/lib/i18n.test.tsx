import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageSelector } from "../components/LanguageSelector";
import { ProfileList } from "../components/ProfileList";
import { getLanguage, setLanguage, translate } from "./i18n";

describe("interface language", () => {
  it("switches an existing view immediately and persists the choice", () => {
    render(<><LanguageSelector /><ProfileList profiles={[]} selectedId={null} onSelect={vi.fn()} onNew={vi.fn()} onReorder={vi.fn()} /></>);
    expect(screen.getByText("New Profile")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Interface language"), { target: { value: "zh-CN" } });
    expect(screen.getByText("新建环境")).toBeTruthy();
    expect(screen.getByPlaceholderText("搜索环境…")).toBeTruthy();
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toBe("CloakBrowser 管理器");
    expect(localStorage.getItem("cloakbrowser-manager-language")).toBe("zh-CN");

    fireEvent.change(screen.getByLabelText("界面语言"), { target: { value: "en" } });
    expect(screen.getByText("New Profile")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("interpolates dynamic values without changing user content or protocol details", () => {
    setLanguage("zh-CN");
    expect(translate("{count} running", { count: 3 })).toBe("3 个环境运行中");
    expect(translate("Remove {name}", { name: "客户 {count}.csv" })).toBe("删除 客户 {count}.csv");
    expect(translate("http://localhost:8080/api/profiles/123/cdp")).toBe("http://localhost:8080/api/profiles/123/cdp");
    expect(translate("Unknown server diagnostic")).toBe("Unknown server diagnostic");
  });

  it("honors another tab's preference and uses Chinese for an invalid saved value", () => {
    localStorage.setItem("cloakbrowser-manager-language", "zh-CN");
    window.dispatchEvent(new StorageEvent("storage", { key: "cloakbrowser-manager-language", newValue: "zh-CN" }));
    expect(getLanguage()).toBe("zh-CN");
    localStorage.setItem("cloakbrowser-manager-language", "unsupported");
    window.dispatchEvent(new StorageEvent("storage", { key: "cloakbrowser-manager-language", newValue: "unsupported" }));
    expect(getLanguage()).toBe("zh-CN");
  });
});
