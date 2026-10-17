import {
  TextFileView,
  WorkspaceLeaf,
  TFile,
  Notice
} from "obsidian";
import {
  EditorState,
  Compartment,
  type Extension
} from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";

import type CustomFileExtensions from "./main";
import { CODE_FILE_VIEW_TYPE } from "./types";
import {
  obsidianCodeTheme,
  obsidianHighlighting,
  getLanguageExtension
} from "./languages";
import { normalizeExtension } from "./utils";

export class CodeEditorView extends TextFileView {
  plugin: CustomFileExtensions;
  navigation = true;
  allowNoFile = false;

  private editorView: EditorView | null = null;
  private languageCompartment = new Compartment();

  constructor(leaf: WorkspaceLeaf, plugin: CustomFileExtensions) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CODE_FILE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file ? this.file.name : "Code Editor";
  }

  getIcon(): string {
    return "file-code";
  }

  canAcceptExtension(extension: string): boolean {
    return this.plugin.isCodeExtension(extension);
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.empty();
    this.contentEl.addClass("custom-code-editor-view");

    // Listen for external file modifications (e.g. via git or external editors)
    this.registerEvent(
      this.app.vault.on("modify", async (file: TFile) => {
        if (this.file && file === this.file && this.editorView) {
          try {
            const diskContent = await this.app.vault.read(this.file);
            const currentContent = this.getViewData();
            if (diskContent !== currentContent) {
              this.setViewData(diskContent, false);
            }
          } catch (e) {
            console.error("Failed to reload externally modified file:", e);
          }
        }
      })
    );
  }

  getViewData(): string {
    return this.editorView ? this.editorView.state.doc.toString() : this.data || "";
  }

  setViewData(data: string, clear: boolean): void {
    const ext = normalizeExtension(this.file?.extension || "");
    const lang = this.plugin.getLanguageForExtension(ext);

    if (!this.editorView) {
      const state = EditorState.create({
        doc: data,
        extensions: this.buildExtensions(lang)
      });

      this.editorView = new EditorView({
        state,
        parent: this.contentEl
      });
    } else if (clear) {
      const state = EditorState.create({
        doc: data,
        extensions: this.buildExtensions(lang)
      });
      this.editorView.setState(state);
    } else {
      const currentDoc = this.editorView.state.doc.toString();
      if (currentDoc !== data) {
        this.editorView.dispatch({
          changes: { from: 0, to: this.editorView.state.doc.length, insert: data }
        });
      }
    }

    this.data = data;
  }

  clear(): void {
    if (this.editorView) {
      this.editorView.dispatch({
        changes: { from: 0, to: this.editorView.state.doc.length, insert: "" }
      });
    }
    this.data = "";
  }

  async save(clear?: boolean): Promise<void> {
    try {
      await super.save(clear);
    } catch (err) {
      console.error("Failed to save code file:", err);
      new Notice(`Failed to save ${this.file?.name || "file"}: ${err}`);
      throw err;
    }
  }

  async onClose(): Promise<void> {
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
    await super.onClose();
  }

  reconfigureLanguage(): void {
    if (!this.editorView || !this.file) return;
    const ext = normalizeExtension(this.file.extension);
    const lang = this.plugin.getLanguageForExtension(ext);
    this.editorView.dispatch({
      effects: this.languageCompartment.reconfigure(getLanguageExtension(lang))
    });
  }

  private buildExtensions(lang: string): Extension[] {
    return [
      this.languageCompartment.of(getLanguageExtension(lang)),
      obsidianCodeTheme,
      obsidianHighlighting,
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            this.save();
            return true;
          }
        },
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.requestSave();
        }
      })
    ];
  }
}
