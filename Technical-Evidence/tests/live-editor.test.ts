// @vitest-environment jsdom
import type { App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveEvidenceEditor } from "../src/live-editor";
import { editorLivePreviewField, TFile } from "./support/obsidian";
import { nativeEditMode, NativeScrollableEditor } from "./support/native-editor";

const editors: LiveEvidenceEditor[] = [];
afterEach(() => {
  editors.splice(0).forEach(editor => editor.unload());
  NativeScrollableEditor.instances.length = 0;
  document.body.replaceChildren();
});

function setup(code = false) {
  const parent = document.body.appendChild(document.createElement("div"));
  const mainEditor = { file: new TFile("Notes/Main.md") };
  const getActiveViewOfType = vi.fn(() => ({ editMode: nativeEditMode() }));
  const workspace = { getActiveViewOfType, activeEditor: mainEditor };
  const keymap = { pushScope: vi.fn(), popScope: vi.fn() };
  const getAbstractFileByPath = vi.fn((path: string) => new TFile(path));
  const app = { workspace, keymap, vault: { getAbstractFileByPath } } as unknown as App;
  const onChange = vi.fn();
  const onBlur = vi.fn();
  const text = "# Heading\n\n**Bold** and [[Relative note]]\n\n```c\nreturn 0;\n```";
  const editor = new LiveEvidenceEditor(app, parent, { path: "Evidence/Proof.md", text, label: "Evidence", code, onChange, onBlur });
  editors.push(editor);
  return { app, editor, parent, workspace, keymap, onChange, onBlur, getAbstractFileByPath, mainEditor, text };
}

describe("native Live Preview editor integration", () => {
  it("uses Obsidian's scrollable editor in Live Preview with the evidence file context", () => {
    const { editor, parent, onChange, text, getAbstractFileByPath } = setup();
    editor.load();
    const native = NativeScrollableEditor.instances.at(-1)!;
    expect(native.sourceMode).toBe(false);
    expect(native.cm.state.field(editorLivePreviewField)).toBe(true);
    expect(parent.querySelector(".markdown-source-view.is-live-preview")).not.toBeNull();
    expect(native.cm.state.doc.toString()).toBe(text);
    expect(getAbstractFileByPath).toHaveBeenCalledWith("Evidence/Proof.md");
    expect(native.owner.file?.path).toBe("Evidence/Proof.md");
    expect(native.owner.editor).toBe(native.editor);
    expect(onChange).not.toHaveBeenCalled();
    expect(parent.querySelector("textarea")).toBeNull();
    native.cm.dispatch({ changes: { from: 0, to: 0, insert: "Intro\n" } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(`Intro\n${text}`);
    // A vault option update must not silently change the popup back to Markdown source mode.
    native.sourceMode = true;
    native.getDynamicExtensions();
    expect(native.sourceMode).toBe(false);
  });

  it("gives code and data fields a direct code editor without JSON escaping or Markdown fences", () => {
    const { editor, onChange } = setup(true);
    editor.load();
    const native = NativeScrollableEditor.instances.at(-1)!;
    expect(native.sourceMode).toBe(true);
    expect(native.cm.state.field(editorLivePreviewField)).toBe(false);
    const code = 'printf("hello\\n");\n// ```';
    native.cm.dispatch({ changes: { from: 0, to: native.cm.state.doc.length, insert: code } });
    expect(onChange).toHaveBeenLastCalledWith(code);
  });

  it("restores keyboard scope and active editor on blur, and destroys the native view on unload", () => {
    const { editor, parent, workspace, keymap, onBlur, onChange, mainEditor } = setup();
    editor.load();
    const native = NativeScrollableEditor.instances.at(-1)!;
    const destroy = vi.spyOn(native, "destroy");
    native.cm.contentDOM.dispatchEvent(new FocusEvent("focus"));
    expect(workspace.activeEditor).toBe(native.owner);
    expect(keymap.pushScope).toHaveBeenCalledTimes(1);
    native.cm.contentDOM.dispatchEvent(new FocusEvent("blur"));
    expect(workspace.activeEditor).toBe(mainEditor);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(keymap.popScope).toHaveBeenCalledWith(keymap.pushScope.mock.calls[0]![0]);
    native.cm.contentDOM.dispatchEvent(new FocusEvent("focus"));
    editor.unload();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(workspace.activeEditor).toBe(mainEditor);
    expect(parent.childElementCount).toBe(0);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(EditorView.findFromDOM(parent)).toBeNull();
  });

  it("keeps the native constructor available while a non-Markdown pane is active", () => {
    const { editor, app, parent, workspace } = setup();
    editor.load();
    workspace.getActiveViewOfType.mockReturnValueOnce(null as never);
    const second = new LiveEvidenceEditor(app, parent, { path: "Evidence/Proof.md", text: "Second section", label: "Second", onChange: () => {}, onBlur: () => {} });
    editors.push(second);
    second.load();
    expect(parent.querySelectorAll(".cm-content")).toHaveLength(2);
  });

  it("reports unsupported native internals without creating a source-input fallback", () => {
    const { editor, workspace, parent } = setup();
    workspace.getActiveViewOfType.mockReturnValueOnce({} as never);
    expect(() => editor.load()).toThrow("无法加载 Obsidian 实时预览编辑器");
    expect(parent.childElementCount).toBe(0);
    expect(NativeScrollableEditor.instances).toHaveLength(0);
  });
});
