import { describe, expect, it } from "vitest";
import { apiErrorMessage, errorMessage } from "./errors";

describe("Chinese error messages", () => {
  it("translates authentication and profile errors", () => {
    expect(apiErrorMessage(401, "Invalid token")).toBe("访问令牌不正确，请重新输入");
    expect(apiErrorMessage(409, "Profile is already running")).toBe("此配置已在运行");
  });

  it("renders nested FastAPI validation errors without object coercion", () => {
    expect(apiErrorMessage(422, [
      { loc: ["body", "tags", 0, "tag"], msg: "Field required" },
      { loc: ["body", "screen_width"], msg: "Input should be a valid integer" },
    ])).toBe("请检查标签、屏幕宽度：格式或取值不正确");
  });

  it("keeps unknown server text and proxy credentials out of the UI", () => {
    expect(apiErrorMessage(400, "Proxy URL missing port: http://secret@example.com")).toBe("代理地址不正确，请检查协议、主机名和端口");
    expect(apiErrorMessage(500, { unexpected: "value" })).toBe("服务器内部错误，请查看服务日志");
    expect(apiErrorMessage(418, null)).toContain("HTTP 418");
  });

  it("keeps localized errors and uses a Chinese fallback for unknown exceptions", () => {
    expect(errorMessage(new Error("Failed to fetch"), "失败")).toContain("网络连接失败");
    expect(errorMessage(new Error("中文错误"), "失败")).toBe("中文错误");
    expect(errorMessage(new Error("Unexpected error"), "操作失败")).toBe("操作失败");
  });
});
