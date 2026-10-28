// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderAssessment } from "../src/assessment";

describe("evidence certainty and scope", () => {
  it("distinguishes confirmed static evidence from runtime validation", () => {
    const target = document.createElement("div");
    renderAssessment(target, { status: "confirmed", basis: "static", scope: "单一固件版本", review: "沿用历史记录，未重新复核", limitations: ["未验证监听外部可达", "未验证飞控接线"] });
    expect(target.textContent).toContain("已确认 · confirmed");
    expect(target.textContent).toContain("不代表实机已经执行");
    expect(target.textContent).toContain("未重新复核");
    expect(target.querySelectorAll("li")).toHaveLength(2);
  });
  it("does not invent statuses for older records or interpret source text as HTML", () => {
    const target = document.createElement("div");
    renderAssessment(target);
    expect(target.childNodes).toHaveLength(0);
    renderAssessment(target, { status: "unknown", scope: "<img src=x onerror=alert(1)>" });
    expect(target.querySelector("img")).toBeNull();
    expect(target.textContent).toContain("<img");
    expect(target.textContent).not.toContain("不代表实机已经执行");
  });
});
