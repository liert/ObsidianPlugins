// @vitest-environment jsdom
import type { App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EvidenceModal } from "../src/modal";
import type { EvidenceContent, EvidenceRepository } from "../src/repository";
import { MarkdownRenderer, TFile } from "./support/obsidian";
import { nativeEditMode } from "./support/native-editor";

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
afterEach(() => { panels.splice(0).forEach(panel => panel.close(true)); vi.useRealTimers(); document.body.replaceChildren(); MarkdownRenderer.render.mockReset(); });

function workspace(initialMode: "source" | "preview" = "preview") {
  let mode: "source" | "preview" = initialMode;
  const listeners = new Map<string, Set<() => void>>();
  const activeView = { getMode: () => mode, editMode: nativeEditMode() };
  const getActiveViewOfType = vi.fn(() => activeView as typeof activeView | null);
  return {
    getActiveViewOfType,
    on: (event: string, callback: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
      return { remove: () => { listeners.get(event)!.delete(callback); } };
    },
    setMode: (value: typeof mode, event = "layout-change") => {
      mode = value;
      listeners.get(event)?.forEach(callback => callback());
    },
    listenerCount: () => [...listeners.values()].reduce((total, callbacks) => total + callbacks.size, 0)
  };
}

function setup(mode: "source" | "preview" = "preview") {
  const work = workspace(mode);
  const app = {
    workspace: work,
    keymap: { pushScope: vi.fn(), popScope: vi.fn() },
    metadataCache: { getFirstLinkpathDest: () => new TFile("Evidence/Related.md") },
    vault: { getAbstractFileByPath: (path: string) => new TFile(path) }
  } as unknown as App;
  const load = vi.fn(async (reference: { path: string }): Promise<EvidenceContent> => ({ type: "markdown", path: reference.path.replace(/^\//, ""), title: reference.path, markdown: reference.path }));
  const save = vi.fn(async (content: EvidenceContent, text: string): Promise<EvidenceContent> => content.type === "markdown" ? { ...content, markdown: text } : { ...content, record: JSON.parse(text) });
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
  const panel = new EvidenceModal(app, { load, save } as unknown as EvidenceRepository, { kind: "evidence", path: "Evidence/Start.md", fragment: "" }, "Main.md");
  panels.push(panel);
  return { panel, load, save, workspace: work };
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
    const app = { workspace: workspace() } as unknown as App;
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

function editorText(panel: EvidenceModal): string | undefined {
  const input = panel.contentEl.querySelector<HTMLElement>(".cm-content");
  return input ? EditorView.findFromDOM(input)?.state.doc.toString() : undefined;
}

function type(panel: EvidenceModal, text: string): HTMLElement {
  const input = panel.contentEl.querySelector<HTMLElement>(".cm-content")!;
  input.dispatchEvent(new FocusEvent("focus"));
  const view = EditorView.findFromDOM(input)!;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  return input;
}

async function editingPanel() {
  const result = setup("source");
  result.panel.open();
  await vi.waitFor(() => expect(result.panel.contentEl.querySelector(".cm-content")).not.toBeNull());
  vi.useFakeTimers();
  return result;
}

describe("evidence mode synchronization and autosave", () => {
  it("opens in edit mode with the current document and coalesces input until 500ms idle", async () => {
    const { panel, save } = await editingPanel();
    const input = type(panel, "First draft");
    await vi.advanceTimersByTimeAsync(300);
    type(panel, "Latest draft");
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    expect(panel.contentEl.textContent).toContain("等待自动保存");
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ path: "Evidence/Start.md" }), "Latest draft");
    expect(panel.contentEl.querySelector(".cm-content")).toBe(input);
    expect(EditorView.findFromDOM(input)?.state.doc.toString()).toBe("Latest draft");
    expect(panel.contentEl.textContent).toContain("已保存");
    expect(panel.contentEl.querySelector(".te-save-btn")).toBeNull();
  });

  it("switches between preview and editing with the document, saving and retaining the draft", async () => {
    const { panel, save, workspace } = setup();
    panel.open();
    await vi.waitFor(() => expect(panel.contentEl.querySelector(".te-markdown")).not.toBeNull());
    expect(panel.contentEl.querySelector(".cm-content")).toBeNull();
    workspace.setMode("source");
    const input = type(panel, "# Unsaved heading\nDraft content");
    workspace.setMode("source");
    expect(panel.contentEl.querySelector(".cm-content")).toBe(input);
    workspace.setMode("preview");
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(panel.contentEl.querySelector(".cm-content")).toBeNull();
    expect(panel.contentEl.querySelector(".te-markdown")?.textContent).toContain("Draft content");
    workspace.setMode("source");
    expect(editorText(panel)).toBe("# Unsaved heading\nDraft content");
  });

  it.each(["active-leaf-change", "file-open"])("follows a different document through %s and removes listeners on close", async event => {
    const { panel, workspace } = setup();
    panel.open();
    await vi.waitFor(() => expect(panel.contentEl.querySelector(".te-markdown")).not.toBeNull());
    workspace.setMode("source", event);
    expect(panel.contentEl.querySelector(".cm-content")).not.toBeNull();
    workspace.getActiveViewOfType.mockReturnValueOnce(null);
    workspace.setMode("preview", event);
    expect(panel.contentEl.querySelector(".cm-content")).not.toBeNull();
    workspace.setMode("preview", event);
    expect(panel.contentEl.querySelector(".cm-content")).toBeNull();
    expect(workspace.listenerCount()).toBe(3);
    panel.close();
    expect(workspace.listenerCount()).toBe(0);
    workspace.setMode("source");
    expect(panel.containerEl.isConnected).toBe(false);
  });

  it("uses the latest document mode if the mode changes while evidence is loading", async () => {
    const { panel, load, workspace } = setup();
    let finish!: (content: EvidenceContent) => void;
    load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    panel.open();
    workspace.setMode("source");
    finish({ type: "markdown", path: "Evidence/Start.md", title: "Loaded", markdown: "Evidence" });
    await vi.waitFor(() => expect(editorText(panel)).toBe("Evidence"));
  });

  it("accepts input during an in-flight save and writes it against the updated snapshot", async () => {
    const { panel, save } = await editingPanel();
    let finish!: (content: EvidenceContent) => void;
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const input = type(panel, "First version");
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(input.getAttribute("contenteditable")).toBe("true");
    type(panel, "Second version");
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    const updated: EvidenceContent = { type: "markdown", path: "Evidence/Start.md", title: "Saved", markdown: "First version" };
    finish(updated);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(updated, "Second version");
    expect(EditorView.findFromDOM(input)?.state.doc.toString()).toBe("Second version");
    expect(panel.contentEl.textContent).toContain("已保存");
  });

  it("flushes unsaved input before closing and cancels the pending timer", async () => {
    const { panel, save, workspace } = await editingPanel();
    type(panel, "Last keystrokes");
    panel.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(expect.anything(), "Last keystrokes");
    expect(panel.containerEl.isConnected).toBe(false);
    expect(workspace.listenerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it.each(["blur", "keyboard"])("flushes input immediately on %s", async trigger => {
    const { panel, save } = await editingPanel();
    const input = type(panel, "Immediate save");
    if (trigger === "blur") input.dispatchEvent(new Event("blur"));
    else {
      const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).toBe("Immediate save");
  });

  it("executes only the latest navigation request while a save is pending", async () => {
    const { panel, load, save } = await editingPanel();
    let finish!: (content: EvidenceContent) => void;
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    type(panel, "Changed");
    const refresh = panel.contentEl.querySelector<HTMLButtonElement>(".te-refresh-btn")!;
    refresh.click();
    refresh.click();
    finish({ type: "markdown", path: "Evidence/Start.md", title: "Saved", markdown: "Changed" });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("flushes the latest input if the plugin is unloaded during a write", async () => {
    const { panel, save } = await editingPanel();
    let finish!: (content: EvidenceContent) => void;
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    type(panel, "First version");
    await vi.advanceTimersByTimeAsync(500);
    type(panel, "Latest version");
    panel.close(true);
    finish({ type: "markdown", path: "Evidence/Start.md", title: "Saved", markdown: "First version" });
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.containerEl.isConnected).toBe(false);
    expect(save.mock.calls[1]?.[1]).toBe("Latest version");
  });

  it("saves a reversion to the original text when closing during a write", async () => {
    const { panel, save } = await editingPanel();
    let finish!: (content: EvidenceContent) => void;
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    type(panel, "Changed");
    await vi.advanceTimersByTimeAsync(500);
    type(panel, "Evidence/Start.md");
    panel.close();
    finish({ type: "markdown", path: "Evidence/Start.md", title: "Saved", markdown: "Changed" });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[1]).toBe("Evidence/Start.md");
    expect(panel.containerEl.isConnected).toBe(false);
  });

  it("retains failed writes and blocks closing until retry succeeds or the user discards", async () => {
    const { panel, save } = await editingPanel();
    save.mockRejectedValue(new Error("Disk full"));
    type(panel, "Keep this draft");
    await vi.advanceTimersByTimeAsync(500);
    expect(panel.contentEl.textContent).toContain("自动保存失败：Disk full");
    expect(editorText(panel)).toBe("Keep this draft");
    panel.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.containerEl.isConnected).toBe(true);
    expect(panel.contentEl.querySelector<HTMLButtonElement>(".te-discard-btn")?.hidden).toBe(false);
    save.mockResolvedValueOnce({ type: "markdown", path: "Evidence/Start.md", title: "Saved", markdown: "Keep this draft" });
    panel.contentEl.querySelector<HTMLButtonElement>(".te-retry-save-btn")!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.contentEl.textContent).toContain("已保存");
    expect(panel.contentEl.textContent).not.toContain("Disk full");
    panel.close();
    expect(panel.containerEl.isConnected).toBe(false);
  });

  it("edits JSON evidence in its rendered layout and saves fields without exposing database source", async () => {
    const { panel, load, save, workspace } = setup("source");
    const content: EvidenceContent = { type: "record", path: "Evidence/evidence.json", record: {
      title: "Record", parameters: { limit: 42 },
      evidence: [{ title: "Reason", kind: "markdown", content: "**Original**", source: "Source" }, { title: "Code", kind: "code", language: "c", content: "return 0;" }]
    } };
    load.mockResolvedValue(content);
    panel.open();
    await vi.waitFor(() => expect(panel.contentEl.querySelectorAll(".cm-content")).toHaveLength(2));
    vi.useFakeTimers();
    expect(panel.contentEl.querySelector("textarea")).toBeNull();
    expect(panel.contentEl.querySelectorAll(".te-evidence-section")).toHaveLength(2);
    type(panel, "**Updated reason**");
    const title = panel.contentEl.querySelector<HTMLInputElement>('[aria-label="证据标题"]')!;
    title.value = "Updated";
    title.dispatchEvent(new Event("input"));
    const code = panel.contentEl.querySelectorAll<HTMLElement>(".cm-content")[1]!;
    const codeView = EditorView.findFromDOM(code)!;
    codeView.dispatch({ changes: { from: 0, to: codeView.state.doc.length, insert: "return 1;\n// ``` stays literal" } });
    await vi.advanceTimersByTimeAsync(500);
    const saved = JSON.parse(save.mock.calls.at(-1)![1]);
    expect(saved.title).toBe("Updated");
    expect(saved.parameters).toEqual({ limit: 42 });
    expect(saved.evidence[0]).toEqual({ title: "Reason", kind: "markdown", content: "**Updated reason**", source: "Source" });
    expect(saved.evidence[1]).toEqual({ title: "Code", kind: "code", language: "c", content: "return 1;\n// ``` stays literal" });
    workspace.setMode("preview");
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.contentEl.querySelector(".cm-content")).toBeNull();
    expect(panel.containerEl.querySelector("h2")?.textContent).toBe("Updated");
    workspace.setMode("source");
    expect(editorText(panel)).toBe("**Updated reason**");
  });

  it("edits function code in the selected detail card while retaining the call graph", async () => {
    const { panel, load, save } = setup("source");
    load.mockResolvedValue({ type: "record", path: "Evidence/evidence.json", record: {
      title: "Calls", callChain: {
        nodes: [{ id: "a", label: "entry", code: "call();" }, { id: "b", label: "leaf", code: "return;" }],
        edges: [{ from: "a", to: "b", label: "condition" }]
      }
    } });
    panel.open();
    await vi.waitFor(() => expect(panel.contentEl.querySelector('[role="tab"]')).not.toBeNull());
    Array.from(panel.contentEl.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent === "函数调用链")!.click();
    expect(panel.contentEl.querySelectorAll(".te-graph-node")).toHaveLength(2);
    vi.useFakeTimers();
    type(panel, "changed_call();");
    panel.contentEl.querySelector<HTMLButtonElement>(".te-relation-link")!.click();
    type(panel, "return 1;");
    await vi.advanceTimersByTimeAsync(500);
    const saved = JSON.parse(save.mock.calls.at(-1)![1]);
    expect(saved.callChain.nodes.map((node: { code: string }) => node.code)).toEqual(["changed_call();", "return 1;"]);
    expect(saved.callChain.edges).toEqual([{ from: "a", to: "b", label: "condition" }]);
  });

  it("requires explicit discard to refresh after an autosave conflict", async () => {
    const { panel, load, save } = await editingPanel();
    save.mockRejectedValue(new Error("证据文件已在其他位置修改"));
    type(panel, "Unsaved edit");
    panel.contentEl.querySelector<HTMLButtonElement>(".te-refresh-btn")!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(editorText(panel)).toBe("Unsaved edit");
    panel.contentEl.querySelector<HTMLButtonElement>(".te-discard-btn")!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(editorText(panel)).toBe("Evidence/Start.md");
  });

  it("saves and browses rendered evidence links inside a native editor in the same panel", async () => {
    const { panel, save, load } = await editingPanel();
    type(panel, "Changed evidence");
    const anchor = document.createElement("a");
    anchor.href = "evidence:Related.md#Detail";
    anchor.textContent = "Related";
    panel.contentEl.querySelector(".te-live-editor-host")!.appendChild(anchor);
    anchor.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls[0]?.[1]).toBe("Changed evidence");
    expect(load).toHaveBeenLastCalledWith({ kind: "evidence", path: "Related.md", fragment: "Detail" }, "Evidence/Start.md");
    expect(document.querySelectorAll(".te-floating-panel")).toHaveLength(1);
  });
});
