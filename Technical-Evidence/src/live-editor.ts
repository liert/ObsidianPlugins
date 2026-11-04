import type { Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { App, Component, MarkdownView, Scope, TFile, type Editor, type MarkdownFileInfo } from "obsidian";

interface EditorOwner extends MarkdownFileInfo {
  editMode?: NativeEditor;
  getMode(): "source";
  syncScroll(): void;
}

interface NativeEditor extends Component {
  cm: EditorView;
  editor: Editor;
  editorEl: HTMLElement;
  sourceMode: boolean;
  buildLocalExtensions(): Extension[];
  getDynamicExtensions(): Extension[];
  set(text: string, clear: boolean): void;
  destroy(): void;
  onResize(): void;
}

type NativeEditorConstructor = new (app: App, container: HTMLElement, owner: EditorOwner) => NativeEditor;
type EditorWorkspace = App["workspace"] & { activeEditor: MarkdownFileInfo | null };
const constructors = new WeakMap<App, NativeEditorConstructor>();

export interface LiveEditorOptions {
  path: string;
  text: string;
  label: string;
  code?: boolean;
  onChange(text: string): void;
  onBlur(): void;
}

/** The scrollable editor behind MarkdownView, without the file view's saving or pane lifecycle. */
function nativeConstructor(app: App): NativeEditorConstructor {
  const cached = constructors.get(app);
  if (cached) return cached;
  const view = app.workspace.getActiveViewOfType(MarkdownView) as (MarkdownView & { editMode?: NativeEditor }) | null;
  // This internal class is not exported by Obsidian. Walk the inheritance chain rather than
  // creating a workspace leaf or temporarily loading a file into the user's current view.
  let prototype: object | null = view?.editMode ? Object.getPrototypeOf(view.editMode) : null;
  while (prototype) {
    if (Object.prototype.hasOwnProperty.call(prototype, "getScroll") && Object.prototype.hasOwnProperty.call(prototype, "buildLocalExtensions")) {
      const constructor = (prototype as { constructor: NativeEditorConstructor }).constructor;
      constructors.set(app, constructor);
      return constructor;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  throw new Error("无法加载 Obsidian 实时预览编辑器。请在 Markdown 文档中重新打开证据；草稿仍保留在面板中。");
}

/** Owns a genuine Obsidian Live Preview editor; the document remains lossless Markdown. */
export class LiveEvidenceEditor extends Component {
  constructor(private app: App, private container: HTMLElement, private options: LiveEditorOptions) { super(); }

  onload(): void {
    const Base = nativeConstructor(this.app);
    const { app, container, options } = this;
    const workspace = app.workspace as EditorWorkspace;
    const scope = new Scope(app.scope);
    const file = app.vault.getAbstractFileByPath(options.path);
    const owner: EditorOwner = {
      app, file: file instanceof TFile ? file : null, hoverPopover: null,
      getMode: () => "source", syncScroll: () => {}
    };
    let ready = false;
    let previousEditor: MarkdownFileInfo | null = null;
    let focused = false;
    const blur = (): void => {
      if (!focused) return;
      focused = false;
      app.keymap.popScope(scope);
      if (workspace.activeEditor === owner) workspace.activeEditor = previousEditor;
      if (ready) options.onBlur();
    };
    const native = new (class extends Base {
      buildLocalExtensions(): Extension[] {
        return [...super.buildLocalExtensions(), EditorView.updateListener.of((update: ViewUpdate) => {
          if (ready && update.docChanged) options.onChange(update.state.doc.toString());
        })];
      }
      getDynamicExtensions(): Extension[] {
        // The popup's edit mode is always Live Preview, including when the main note
        // uses source mode or the vault's default for new editors is source mode.
        this.sourceMode = options.code === true;
        return super.getDynamicExtensions();
      }
    })(app, container, owner);
    owner.editMode = native;
    owner.editor = native.editor;
    this.addChild(native);
    this.register(() => {
      ready = false;
      blur();
      native.destroy();
      native.editorEl.remove();
    });
    native.editorEl.classList.add("te-native-editor");
    if (options.code) native.editorEl.classList.add("te-code-editor");
    native.sourceMode = options.code === true;
    native.set(options.text, true);
    native.cm.contentDOM.setAttribute("aria-label", options.label);
    this.registerDomEvent(container, "focus", () => {
      if (focused) return;
      previousEditor = workspace.activeEditor;
      focused = true;
      app.keymap.pushScope(scope);
    }, { capture: true });
    this.registerDomEvent(container, "blur", blur, { capture: true });
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => native.onResize());
      observer.observe(container);
      this.register(() => observer.disconnect());
    }
    ready = true;
  }
}
