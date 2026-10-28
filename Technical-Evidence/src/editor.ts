import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { editorInfoField, editorLivePreviewField } from "obsidian";
import { inlineCodeText, inlineReferences } from "./reference";

export type OpenEvidence = (href: string, sourcePath: string) => void;

class EvidenceWidget extends WidgetType {
  constructor(private label: string, private href: string, private source: string, private open: OpenEvidence) { super(); }
  eq(other: EvidenceWidget): boolean { return this.label === other.label && this.href === other.href && this.source === other.source; }
  toDOM(view: EditorView): HTMLElement {
    const link = view.dom.ownerDocument.createElement("a");
    link.className = "te-trigger";
    link.setAttribute("href", this.href);
    const code = inlineCodeText(this.label);
    if (code !== null) {
      link.classList.add("te-inline-code");
      const element = link.appendChild(view.dom.ownerDocument.createElement("code"));
      element.textContent = code;
    } else link.textContent = this.label;
    link.title = this.href;
    link.setAttribute("aria-haspopup", "dialog");
    link.addEventListener("mousedown", event => event.preventDefault());
    link.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.open(this.href, this.source);
    });
    return link;
  }
  ignoreEvent(): boolean { return true; }
}

export function evidenceEditorExtension(open: OpenEvidence) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(update: ViewUpdate): void {
      // Parsing can finish asynchronously even when the document has not changed.
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.length || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = this.build(update.view);
      }
    }
    private build(view: EditorView): DecorationSet {
      if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;
      const source = view.state.field(editorInfoField, false)?.file?.path ?? "";
      const builder = new RangeSetBuilder<Decoration>();
      for (const range of view.visibleRanges) {
        for (const match of inlineReferences(view.state.doc.sliceString(range.from, range.to), range.from)) {
          // Let the user edit the original Markdown whenever the cursor enters a link.
          if (view.state.selection.ranges.some(selection => selection.from <= match.to && selection.to >= match.from)) continue;
          // Inspect the opening bracket, not a code span inside the link label.
          let syntax = syntaxTree(view.state).resolveInner(match.from, 1);
          let excluded = false;
          for (;;) {
            if (/code|comment|frontmatter|html|hmd-table/i.test(syntax.name)) { excluded = true; break; }
            if (!syntax.parent) break;
            syntax = syntax.parent;
          }
          if (!excluded) builder.add(match.from, match.to, Decoration.replace({ widget: new EvidenceWidget(match.label, match.href, source, open) }));
        }
      }
      return builder.finish();
    }
  }, { decorations: value => value.decorations });
}
