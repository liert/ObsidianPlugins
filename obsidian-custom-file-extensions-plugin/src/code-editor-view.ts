import {
  TextFileView,
  WorkspaceLeaf,
  TFile,
  Notice
} from "obsidian";
import {
  EditorState,
  Compartment,
  EditorSelection,
  Prec,
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
  indentMore,
  indentLess,
  insertNewlineAndIndent
} from "@codemirror/commands";
import { bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";

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
  private indentCompartment = new Compartment();

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

  reconfigureIndent(): void {
    if (!this.editorView) return;
    this.editorView.dispatch({
      effects: this.indentCompartment.reconfigure(this.getIndentExtensions())
    });
  }

  private getIndentExtensions(): Extension[] {
    const tabSize = this.plugin.settings.codeRendering?.tabSize ?? 4;
    const useTabChar = this.plugin.settings.codeRendering?.useTabChar ?? false;
    const unitStr = useTabChar ? "\t" : " ".repeat(tabSize);

    return [
      EditorState.tabSize.of(tabSize),
      indentUnit.of(unitStr),
      EditorView.theme({
        ".cm-scroller, .cm-content": {
          tabSize: String(tabSize)
        }
      })
    ];
  }

  private handleTab(view: EditorView): boolean {
    const { state } = view;
    if (state.readOnly) return false;

    // If there is any non-empty selection range, indent the selected line(s)
    const hasSelection = state.selection.ranges.some((r) => !r.empty);
    if (hasSelection) {
      return indentMore(view);
    }

    // Check if all cursors are on empty lines or within leading whitespace
    const allInLeadingWhitespace = state.selection.ranges.every((range) => {
      const line = state.doc.lineAt(range.from);
      const leadingMatch = /^\s*/.exec(line.text);
      const leadingLen = leadingMatch ? leadingMatch[0].length : 0;
      return range.from <= line.from + leadingLen;
    });

    if (allInLeadingWhitespace) {
      return indentMore(view);
    }

    // Cursor is after text on line: insert tab or spaces up to next tab stop
    const useTabChar = state.facet(indentUnit) === "\t";
    if (useTabChar) {
      view.dispatch(
        state.update(state.replaceSelection("\t"), {
          scrollIntoView: true,
          userEvent: "input"
        })
      );
      return true;
    } else {
      const tabSize = state.tabSize || 4;
      const changes = state.changeByRange((range) => {
        const line = state.doc.lineAt(range.from);
        const col = range.from - line.from;
        const count = tabSize - (col % tabSize);
        const insert = " ".repeat(count);
        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.cursor(range.from + count)
        };
      });
      view.dispatch(
        state.update(changes, {
          scrollIntoView: true,
          userEvent: "input"
        })
      );
      return true;
    }
  }

  private buildExtensions(lang: string): Extension[] {
    return [
      this.languageCompartment.of(getLanguageExtension(lang)),
      this.indentCompartment.of(this.getIndentExtensions()),
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
      Prec.highest(
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              this.save();
              return true;
            }
          },
          {
            key: "Tab",
            run: (view) => this.handleTab(view),
            shift: (view) => indentLess(view)
          },
          {
            key: "Enter",
            run: insertNewlineAndIndent
          }
        ])
      ),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.requestSave();
        }
      })
    ];
  }
}
