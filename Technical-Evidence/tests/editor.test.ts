// @vitest-environment jsdom
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorInfoField, editorLivePreviewField } from "obsidian";
import { evidenceEditorExtension } from "../src/editor";

const views: EditorView[] = [];
afterEach(() => { views.splice(0).forEach(view => view.destroy()); document.body.replaceChildren(); });

function editor(doc: string, live = true) {
  const open = vi.fn();
  const container = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({ parent: container, state: EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown(), editorInfoField, editorLivePreviewField.init(() => live), evidenceEditorExtension(open)]
  }) });
  views.push(view);
  return { view, open, container };
}

describe("live preview interaction", () => {
  it("keeps a linked identifier in code form and opens its call chain without editing the note", () => {
    const doc = "设备助手的升级流程以 [`G12_RCService`](callchain:Evidence/upgrade.json#G12_RCService) 为条目名。\n\nMore.";
    const { container, open, view } = editor(doc);
    const link = container.querySelector<HTMLAnchorElement>("a.te-trigger.te-inline-code");
    expect(link?.querySelector("code")?.textContent).toBe("G12_RCService");
    expect(link?.textContent).toBe("G12_RCService");
    link!.querySelector("code")!.click();
    expect(open).toHaveBeenCalledWith("callchain:Evidence/upgrade.json#G12_RCService", "Notes/Report.md");
    expect(view.state.doc.toString()).toBe(doc);
    view.dispatch({ selection: EditorSelection.cursor(doc.indexOf("RCService")) });
    expect(container.querySelector(".te-trigger")).toBeNull();
    view.dispatch({ selection: EditorSelection.cursor(doc.length) });
    expect(container.querySelector(".te-inline-code code")?.textContent).toBe("G12_RCService");
  });
  it("renders code label contents as text, including HTML-like strings", () => {
    const { container } = editor("[`` <img src=x> `name` ``](evidence:#literal)\n\nMore.");
    expect(container.querySelector(".te-inline-code code")?.textContent).toBe("<img src=x> `name`");
    expect(container.querySelector(".te-trigger img")).toBeNull();
  });
  it("opens the intended record from a text link without changing document text", () => {
    const doc = "[查看证据](evidence:#limit)\n\nContinue here.";
    const { container, open, view } = editor(doc);
    const link = container.querySelector<HTMLAnchorElement>("a.te-trigger");
    expect(link?.textContent).toBe("查看证据");
    expect(link?.getAttribute("href")).toBe("evidence:#limit");
    expect(container.querySelector("button.te-trigger")).toBeNull();
    link!.click();
    expect(open).toHaveBeenCalledWith("evidence:#limit", "Notes/Report.md");
    expect(view.state.doc.toString()).toBe(doc);
  });
  it("shows source while the link is being edited and restores the text link afterward", () => {
    const { container, view } = editor("[查看证据](evidence:#limit)\n\nMore.");
    expect(container.querySelector(".te-trigger")).not.toBeNull();
    view.dispatch({ selection: EditorSelection.cursor(5) });
    expect(container.querySelector(".te-trigger")).toBeNull();
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    expect(container.querySelector(".te-trigger")).not.toBeNull();
  });
  it("leaves source mode, inline code, fenced code and comments untouched", () => {
    expect(editor("[查看证据](evidence:#limit)\n\nMore.", false).container.querySelector(".te-trigger")).toBeNull();
    const { container } = editor("`[查看证据](evidence:#inline)`\n\n```md\n[查看证据](evidence:#fenced)\n```\n\n<!-- [查看证据](evidence:#comment) -->\n\nMore.");
    expect(container.querySelectorAll(".te-trigger")).toHaveLength(0);
  });
});
