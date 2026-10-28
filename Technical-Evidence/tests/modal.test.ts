// @vitest-environment jsdom
import type { App } from "obsidian";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EvidenceModal } from "../src/modal";
import type { EvidenceRepository } from "../src/repository";
import { MarkdownRenderer, TFile } from "./support/obsidian";

// Minimal Obsidian DOM helpers; all evidence rendering still crosses the mocked public renderer.
const helpers = ["createEl", "createDiv", "empty", "addClass"] as const;
const descriptors = new Map(helpers.map(key => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)]));
beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    createEl: { configurable: true, value(this: HTMLElement, tag: string, options: { text?: string; cls?: string; attr?: Record<string, string> } = {}) {
      const element = this.ownerDocument.createElement(tag);
      if (options.text) element.textContent = options.text;
      if (options.cls) element.className = options.cls;
      for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
      this.appendChild(element);
      return element;
    } },
    createDiv: { configurable: true, value(this: HTMLElement, options: string | object = {}) { return this.createEl("div", typeof options === "string" ? { cls: options } : options); } },
    empty: { configurable: true, value(this: HTMLElement) { this.replaceChildren(); } },
    addClass: { configurable: true, value(this: HTMLElement, ...names: string[]) { this.classList.add(...names); } }
  });
});
afterAll(() => {
  for (const key of helpers) {
    const descriptor = descriptors.get(key);
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
});
const panels: EvidenceModal[] = [];
afterEach(() => { panels.splice(0).forEach(panel => panel.close()); document.body.replaceChildren(); MarkdownRenderer.render.mockReset(); });

function setup() {
  const app = {
    metadataCache: { getFirstLinkpathDest: () => new TFile("Evidence/Related.md") },
    vault: { getAbstractFileByPath: (path: string) => new TFile(path) }
  } as unknown as App;
  const load = vi.fn(async (reference: { path: string }) => ({ type: "markdown" as const, path: reference.path.replace(/^\//, ""), title: reference.path, markdown: reference.path }));
  MarkdownRenderer.render.mockImplementation(async (_app, text, target) => {
    target.textContent = text;
    if (text.includes("Start")) {
      const anchor = target.ownerDocument.createElement("a");
      anchor.className = "internal-link";
      anchor.dataset.href = "Related#Listener";
      anchor.href = "#test";
      anchor.textContent = "相关证据";
      target.appendChild(anchor);
    }
  });
  const panel = new EvidenceModal(app, { load } as unknown as EvidenceRepository, { kind: "evidence", path: "Evidence/Start.md", fragment: "" }, "Main.md");
  panels.push(panel);
  return { panel, load };
}

describe("evidence panel browsing", () => {
  it("navigates and goes back in the same floating panel with the correct source context", async () => {
    const { panel, load } = setup();
    panel.open();
    await vi.waitFor(() => expect(panel.contentEl.querySelector("a")).not.toBeNull());
    panel.contentEl.scrollTop = 123;
    panel.contentEl.querySelector("a")!.click();
    await vi.waitFor(() => expect(panel.contentEl.querySelector('[aria-label="返回上一条证据"]')).not.toBeNull());
    expect(document.querySelectorAll(".te-floating-panel")).toHaveLength(1);
    expect(load).toHaveBeenLastCalledWith({ kind: "evidence", path: "/Evidence/Related.md", fragment: "Listener" }, "Evidence/Start.md");
    expect(MarkdownRenderer.render.mock.calls.at(-1)?.[3]).toBe("Evidence/Related.md");
    panel.contentEl.querySelector<HTMLButtonElement>('[aria-label="返回上一条证据"]')!.click();
    await vi.waitFor(() => expect(panel.contentEl.querySelector("a")).not.toBeNull());
    expect(load).toHaveBeenLastCalledWith({ kind: "evidence", path: "Evidence/Start.md", fragment: "" }, "Main.md");
    expect(panel.contentEl.scrollTop).toBe(123);
  });
  it("retains the back button when the referenced evidence cannot be loaded", async () => {
    const { panel, load } = setup();
    panel.open();
    await vi.waitFor(() => expect(panel.contentEl.querySelector("a")).not.toBeNull());
    load.mockRejectedValueOnce(new Error("文件已移动"));
    panel.contentEl.querySelector("a")!.click();
    await vi.waitFor(() => expect(panel.contentEl.textContent).toContain("文件已移动"));
    panel.contentEl.querySelector<HTMLButtonElement>('[aria-label="返回上一条证据"]')!.click();
    await vi.waitFor(() => expect(panel.contentEl.querySelector("a")).not.toBeNull());
    expect(panel.contentEl.textContent).not.toContain("文件已移动");
  });
  it("highlights connected edges and jumps to callees from the function detail card", async () => {
    const app = {} as unknown as App;
    const load = vi.fn(async () => ({
      type: "record" as const,
      path: "Evidence/evidence.json",
      record: {
        title: "Call Chain",
        callChain: {
          nodes: [
            { id: "a", label: "entry_fn", code: "call_b();" },
            { id: "b", label: "middle_fn", code: "call_c();" },
            { id: "c", label: "leaf_fn", code: "return 0;" }
          ],
          edges: [
            { from: "a", to: "b", label: "step 1" },
            { from: "b", to: "c", label: "step 2" }
          ]
        }
      }
    }));
    MarkdownRenderer.render.mockImplementation(async (_app, text, target) => { target.textContent = text; });
    const panel = new EvidenceModal(app, { load } as unknown as EvidenceRepository, { kind: "callchain", path: "Evidence/evidence.json", fragment: "demo" }, "Main.md");
    panels.push(panel);
    panel.open();
    await vi.waitFor(() => expect(panel.contentEl.querySelectorAll(".te-edge")).toHaveLength(2));
    const edges = Array.from(panel.contentEl.querySelectorAll(".te-edge"));
    expect(edges[0]?.hasAttribute("data-active")).toBe(true);
    expect(edges[1]?.hasAttribute("data-active")).toBe(false);
    const calleeBtn = panel.contentEl.querySelector<HTMLButtonElement>(".te-relation-link")!;
    expect(calleeBtn.textContent).toBe("middle_fn");
    calleeBtn.click();
    await vi.waitFor(() => expect(panel.contentEl.querySelector(".te-function-detail h3")?.textContent).toBe("middle_fn"));
    expect(edges[0]?.hasAttribute("data-active")).toBe(true);
    expect(edges[1]?.hasAttribute("data-active")).toBe(true);
  });
});
