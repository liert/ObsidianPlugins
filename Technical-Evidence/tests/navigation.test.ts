// @vitest-environment jsdom
import { App, Component } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindPanelNavigation, resolvePanelLink } from "../src/navigation";
import { TFile } from "./support/obsidian";

afterEach(() => { document.body.replaceChildren(); });
const source = "IoT/无人机/G20/详细证据.md";

function setup(linktext: string, destination = "IoT/无人机/G20/参考笔记.md") {
  const getFirstLinkpathDest = vi.fn(() => new TFile(destination));
  const app = { metadataCache: { getFirstLinkpathDest }, vault: { getAbstractFileByPath: (path: string) => new TFile(path) } } as unknown as App;
  const anchor = document.createElement("a");
  anchor.className = "internal-link";
  anchor.setAttribute("href", "#test-link");
  anchor.setAttribute("data-href", linktext);
  return { app, anchor, getFirstLinkpathDest };
}

describe("evidence panel navigation", () => {
  it("resolves sibling notes, headings and blocks from the evidence file's directory", () => {
    const { app, anchor, getFirstLinkpathDest } = setup("参考笔记#^port");
    expect(resolvePanelLink(app, anchor, source)).toEqual({ kind: "evidence", path: "/IoT/无人机/G20/参考笔记.md", fragment: "^port" });
    expect(getFirstLinkpathDest).toHaveBeenCalledWith("参考笔记", source);
    anchor.dataset.href = "#调用链";
    expect(resolvePanelLink(app, anchor, source)).toEqual({ kind: "evidence", path: `/${source}`, fragment: "调用链" });
  });
  it("keeps custom evidence references and leaves attachments or external links alone", () => {
    const { app, anchor } = setup("firmware.bin", "IoT/无人机/G20/firmware.bin");
    expect(resolvePanelLink(app, anchor, source)).toBeNull();
    anchor.className = "external-link";
    anchor.href = "https://example.com";
    expect(resolvePanelLink(app, anchor, source)).toBeNull();
    anchor.setAttribute("href", "callchain:evidence.json#rpc");
    expect(resolvePanelLink(app, anchor, source)).toEqual({ kind: "callchain", path: "evidence.json", fragment: "rpc" });
  });
  it("intercepts a normal click while keeping modifier clicks and unload behavior", () => {
    const { app, anchor } = setup("参考笔记#监听");
    const host = document.body.appendChild(document.createElement("div"));
    host.appendChild(anchor);
    const component = new Component();
    component.load();
    const navigate = vi.fn();
    const error = vi.fn();
    bindPanelNavigation(app, host, source, component, navigate, error);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    anchor.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    component.unload();
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  });
  it("reports malformed custom links without navigating or propagating them", () => {
    const { app, anchor } = setup("unused");
    anchor.setAttribute("href", "evidence:bad%ZZ.md");
    const host = document.body.appendChild(document.createElement("div"));
    host.appendChild(anchor);
    const component = new Component();
    component.load();
    const navigate = vi.fn();
    const error = vi.fn();
    bindPanelNavigation(app, host, source, component, navigate, error);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    component.unload();
  });
  it("reports missing notes instead of requesting that Obsidian create them", () => {
    const { app, anchor } = setup("尚未取得的样本分析");
    vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
    expect(() => resolvePanelLink(app, anchor, source)).toThrow("找不到关联笔记");
  });
});
