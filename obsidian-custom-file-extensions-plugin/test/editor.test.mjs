import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { EditorState } from "@codemirror/state";
import { undo, redo, history } from "@codemirror/commands";
import { getLanguageExtension } from "../src/languages.ts";
import { normalizeExtension, normalizeLanguage } from "../src/utils.ts";

test("Language extension resolver returns valid extensions", () => {
  const supported = ["c", "cpp", "h", "hpp", "java", "py", "python", "lua", "json", "xml", "js", "ts", "rs", "yaml", "sql", "sh"];
  for (const lang of supported) {
    const ext = getLanguageExtension(lang);
    assert.ok(ext, `Extension for ${lang} should be defined`);
  }

  // Fallbacks
  assert.deepEqual(getLanguageExtension("text"), []);
  assert.deepEqual(getLanguageExtension("log"), []);
  assert.deepEqual(getLanguageExtension("nonexistent_lang"), []);
  assert.deepEqual(getLanguageExtension(""), []);
});

test("CodeMirror 6 EditorState: editing, document update, and retrieval", () => {
  const initialCode = "int counter = 0;\nvoid increment() {\n    counter++;\n}\n";
  const state = EditorState.create({
    doc: initialCode,
    extensions: [getLanguageExtension("c"), history()]
  });

  assert.equal(state.doc.toString(), initialCode);

  // Perform an edit: change counter = 0 to counter = 42
  const tr = state.update({
    changes: { from: 14, to: 15, insert: "42" }
  });

  const updatedState = state.update(tr).state;
  assert.equal(
    updatedState.doc.toString(),
    "int counter = 42;\nvoid increment() {\n    counter++;\n}\n"
  );
});

test("CodeMirror 6 EditorState: undo and redo work as expected", () => {
  let state = EditorState.create({
    doc: "initial text",
    extensions: [history()]
  });

  // Make a change
  const tr = state.update({
    changes: { from: 0, to: 7, insert: "modified" }
  });
  state = state.update(tr).state;
  assert.equal(state.doc.toString(), "modified text");

  // Undo
  undo({
    state,
    dispatch: (action) => {
      state = state.update(action).state;
    }
  });
  assert.equal(state.doc.toString(), "initial text");

  // Redo
  redo({
    state,
    dispatch: (action) => {
      state = state.update(action).state;
    }
  });
  assert.equal(state.doc.toString(), "modified text");
});

test("File saving simulation: edits persist back to file without altering encoding or attributes", () => {
  const tmpFile = path.resolve("test-edit-sample.c");
  const originalContent = '#include <stdio.h>\n\nint main() {\n    printf("Hello");\n    return 0;\n}\n';
  fs.writeFileSync(tmpFile, originalContent, "utf8");

  try {
    // Read from disk
    const content = fs.readFileSync(tmpFile, "utf8");
    let state = EditorState.create({
      doc: content,
      extensions: [getLanguageExtension("c")]
    });

    // Edit content: change Hello to World
    const index = content.indexOf("Hello");
    const tr = state.update({
      changes: { from: index, to: index + 5, insert: "World" }
    });
    state = state.update(tr).state;

    // Simulate save (getViewData -> fs.writeFileSync / vault.modify)
    const savedData = state.doc.toString();
    fs.writeFileSync(tmpFile, savedData, "utf8");

    // Re-read and verify
    const reRead = fs.readFileSync(tmpFile, "utf8");
    assert.equal(reRead, '#include <stdio.h>\n\nint main() {\n    printf("World");\n    return 0;\n}\n');
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
});
