import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  HighlightStyle,
  syntaxHighlighting,
  StreamLanguage
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";

// Legacy stream languages
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { shell } from "@codemirror/legacy-modes/mode/shell";

import { normalizeLanguage } from "./utils.ts";

/**
 * Obsidian Native Code Block Theme for CodeMirror 6.
 * Completely driven by Obsidian CSS variables, seamlessly adapting to
 * light mode, dark mode, custom themes, and font configurations.
 */
export const obsidianCodeTheme = EditorView.theme({
  "&": {
    height: "100%",
    width: "100%",
    backgroundColor: "var(--code-background, var(--background-primary))",
    color: "var(--code-normal, var(--text-normal))",
    fontFamily: "var(--font-monospace)",
    fontSize: "var(--code-size, 14px)"
  },
  ".cm-scroller": {
    height: "100%",
    overflow: "auto",
    fontFamily: "var(--font-monospace)",
    lineHeight: "var(--line-height-tight, 1.5)",
    padding: "8px 0"
  },
  ".cm-content": {
    caretColor: "var(--text-accent, var(--interactive-accent))",
    fontFamily: "inherit",
    fontSize: "inherit",
    whiteSpace: "pre",
    wordBreak: "normal"
  },
  "&.cm-focused": {
    outline: "none"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--text-accent, var(--interactive-accent))",
    borderLeftWidth: "2px"
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-faint)",
    borderRight: "1px solid var(--divider-color)",
    paddingRight: "8px",
    userSelect: "none"
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 16px",
    color: "var(--text-faint)"
  },
  ".cm-activeLine": {
    backgroundColor: "var(--background-modifier-hover)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    fontWeight: "bold"
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--text-selection, rgba(0, 120, 215, 0.3)) !important"
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--background-modifier-hover)"
  }
});

/**
 * Syntax highlighting rules mapped to Obsidian theme CSS variables.
 */
export const obsidianHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--code-keyword, #cf222e)" },
  { tag: [tags.name, tags.deleted, tags.character], color: "var(--code-normal, var(--text-normal))" },
  { tag: [tags.propertyName, tags.macroName], color: "var(--code-property, #0550ae)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--code-function, #8250df)" },
  { tag: [tags.typeName, tags.className], color: "var(--code-property, #953800)" },
  { tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "var(--code-number, #0550ae)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--code-string, #0a3069)" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link], color: "var(--code-operator, #cf222e)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: "var(--code-comment, var(--text-muted))", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--code-comment, var(--text-muted))" },
  { tag: tags.punctuation, color: "var(--code-punctuation, var(--text-muted))" }
]);

export const obsidianHighlighting = syntaxHighlighting(obsidianHighlightStyle, { fallback: true });

/**
 * Resolves a CodeMirror 6 Language Extension for the given language name.
 * If the language is unknown or 'text', returns an empty extension (plain text editing).
 */
export function getLanguageExtension(languageName: string): Extension {
  const norm = normalizeLanguage(languageName);
  switch (norm) {
    case "c":
    case "h":
    case "cpp":
    case "hpp":
    case "cc":
    case "cxx":
    case "cuda":
      return cpp();
    case "java":
      return java();
    case "py":
    case "python":
      return python();
    case "lua":
      return StreamLanguage.define(lua);
    case "json":
      return json();
    case "xml":
      return xml();
    case "js":
    case "javascript":
      return javascript();
    case "ts":
    case "typescript":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "rs":
    case "rust":
      return rust();
    case "yaml":
    case "yml":
      return StreamLanguage.define(yaml);
    case "sql":
      return StreamLanguage.define(standardSQL);
    case "sh":
    case "bash":
    case "shell":
    case "zsh":
      return StreamLanguage.define(shell);
    case "text":
    case "txt":
    case "log":
    default:
      return [];
  }
}
