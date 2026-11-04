import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { App, Editor, MarkdownFileInfo } from "obsidian";
import { Component, editorInfoField, editorLivePreviewField } from "./obsidian";

// The private Obsidian constructor is a runtime boundary. Keep actual CodeMirror transactions
// and lifecycle here, without pretending to reproduce Obsidian's Live Preview decorations.
export class NativeScrollableEditor extends Component {
  static instances: NativeScrollableEditor[] = [];
  readonly cm: EditorView;
  readonly editorEl: HTMLElement;
  readonly editor: Editor;
  sourceMode = true;

  constructor(private app: App, container: HTMLElement, readonly owner: MarkdownFileInfo) {
    super();
    NativeScrollableEditor.instances.push(this);
    this.editorEl = container.appendChild(document.createElement("div"));
    this.editorEl.className = "markdown-source-view mod-cm6";
    this.cm = new EditorView({ parent: this.editorEl });
    this.editor = { getValue: () => this.cm.state.doc.toString(), focus: () => this.cm.focus() } as Editor;
  }

  getScroll(): number { return 0; }
  buildLocalExtensions(): Extension[] {
    return [editorInfoField.init(() => this.owner as never), EditorView.domEventHandlers({
      focus: () => { (this.app.workspace as unknown as { activeEditor: MarkdownFileInfo }).activeEditor = this.owner; }
    })];
  }
  getDynamicExtensions(): Extension[] {
    this.editorEl.classList.toggle("is-live-preview", !this.sourceMode);
    return [editorLivePreviewField.init(() => !this.sourceMode)];
  }
  set(text: string): void {
    this.cm.setState(EditorState.create({ doc: text, extensions: [this.buildLocalExtensions(), this.getDynamicExtensions()] }));
  }
  destroy(): void { this.cm.destroy(); }
  onResize(): void { this.cm.requestMeasure(); }
}

class NativeNoteEditor extends NativeScrollableEditor {}
export function nativeEditMode(): NativeScrollableEditor { return Object.create(NativeNoteEditor.prototype) as NativeScrollableEditor; }
