import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { EditorState, EditorSelection } from "@codemirror/state";
import { undo, redo, history, indentMore, indentLess, insertNewlineAndIndent } from "@codemirror/commands";
import { indentUnit, indentOnInput } from "@codemirror/language";
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

function createEditorMock(doc, pos, { lang = "python", tabSize = 4, useTabChar = false } = {}) {
  const unitStr = useTabChar ? "\t" : " ".repeat(tabSize);
  const mock = {
    state: EditorState.create({
      doc,
      selection: typeof pos === "number" ? { anchor: pos } : pos,
      extensions: [
        getLanguageExtension(lang),
        EditorState.tabSize.of(tabSize),
        indentUnit.of(unitStr),
        indentOnInput(),
        EditorState.allowMultipleSelections.of(true)
      ]
    }),
    dispatch: (tr) => {
      mock.state = tr.state || mock.state.update(tr).state;
    },
    pressEnter: () => {
      insertNewlineAndIndent(mock);
    },
    pressTab: () => {
      const s = mock.state;
      const hasSelection = s.selection.ranges.some((r) => !r.empty);
      if (hasSelection) {
        return indentMore(mock);
      }
      const allInLeading = s.selection.ranges.every((range) => {
        const line = s.doc.lineAt(range.from);
        const leading = /^\s*/.exec(line.text)?.[0].length || 0;
        return range.from <= line.from + leading;
      });
      if (allInLeading) {
        return indentMore(mock);
      }
      const isTab = s.facet(indentUnit) === "\t";
      if (isTab) {
        mock.dispatch(s.update(s.replaceSelection("\t"), { userEvent: "input" }));
        return true;
      } else {
        const size = s.tabSize || 4;
        const changes = s.changeByRange((range) => {
          const line = s.doc.lineAt(range.from);
          const col = range.from - line.from;
          const count = size - (col % size);
          const insert = " ".repeat(count);
          return {
            changes: { from: range.from, to: range.to, insert },
            range: EditorSelection.cursor(range.from + count)
          };
        });
        mock.dispatch(s.update(changes, { userEvent: "input" }));
        return true;
      }
    },
    pressShiftTab: () => {
      indentLess(mock);
    }
  };
  return mock;
}

test("Acceptance 1: Enter on 'def test():' automatically indents 4 spaces", () => {
  const editor = createEditorMock("def test():", 11);
  editor.pressEnter();
  assert.equal(editor.state.doc.toString(), "def test():\n    ");
  assert.equal(editor.state.selection.main.anchor, 16);
});

test("Acceptance 2: Inside a function, Enter inherits current indentation", () => {
  const editor = createEditorMock("def test():\n    x = 1", 21);
  editor.pressEnter();
  assert.equal(editor.state.doc.toString(), "def test():\n    x = 1\n    ");
  assert.equal(editor.state.selection.main.anchor, 26);
});

test("Acceptance 3: Tab increases indentation, Shift+Tab decreases indentation", () => {
  const editor = createEditorMock("x = 1", 0);
  editor.pressTab();
  assert.equal(editor.state.doc.toString(), "    x = 1");
  assert.equal(editor.state.selection.main.anchor, 4);

  editor.pressTab();
  assert.equal(editor.state.doc.toString(), "        x = 1");
  assert.equal(editor.state.selection.main.anchor, 8);

  editor.pressShiftTab();
  assert.equal(editor.state.doc.toString(), "    x = 1");
  assert.equal(editor.state.selection.main.anchor, 4);

  editor.pressShiftTab();
  assert.equal(editor.state.doc.toString(), "x = 1");
  assert.equal(editor.state.selection.main.anchor, 0);
});

test("Acceptance 4: Multi-line selection supports batch indent and dedent", () => {
  const initial = "def foo():\nx = 1\ny = 2\nreturn x + y";
  const editor = createEditorMock(initial, { anchor: 11, head: 23 }); // select x=1 and y=2 lines
  editor.pressTab();
  assert.equal(
    editor.state.doc.toString(),
    "def foo():\n    x = 1\n    y = 2\nreturn x + y"
  );

  editor.pressShiftTab();
  assert.equal(
    editor.state.doc.toString(),
    "def foo():\nx = 1\ny = 2\nreturn x + y"
  );
});

test("Acceptance 5: Nested class, def, if, for, while, and colon dedent (else:)", () => {
  const lines = [
    "class Animal:",
    "    def speak(self):",
    "        if True:",
    "            for i in range(1):",
    "                while True:",
    "                    pass"
  ];
  const doc = lines.join("\n");
  const editor = createEditorMock(doc, doc.length);
  editor.pressEnter();
  // Line 7 should have 20 spaces (inherited from while True -> pass level)
  assert.equal(editor.state.doc.line(7).text, " ".repeat(20));

  // Test colon dedent with else:
  const ifElseDoc = "if True:\n    pass\n    else";
  const editorElse = createEditorMock(ifElseDoc, ifElseDoc.length);
  editorElse.dispatch(
    editorElse.state.update({
      changes: { from: ifElseDoc.length, insert: ":" },
      selection: { anchor: ifElseDoc.length + 1 },
      userEvent: "input.type"
    })
  );
  assert.equal(editorElse.state.doc.toString(), "if True:\n    pass\nelse:");
});

test("Acceptance 6: Tab width settings (2, 4, 8 spaces) and Tab character mode", () => {
  // 2 spaces
  const ed2 = createEditorMock("def test():", 11, { tabSize: 2 });
  ed2.pressEnter();
  assert.equal(ed2.state.doc.toString(), "def test():\n  ");

  // 8 spaces
  const ed8 = createEditorMock("def test():", 11, { tabSize: 8 });
  ed8.pressEnter();
  assert.equal(ed8.state.doc.toString(), "def test():\n        ");

  // Real tab character
  const edTab = createEditorMock("def test():", 11, { useTabChar: true });
  edTab.pressEnter();
  assert.equal(edTab.state.doc.toString(), "def test():\n\t");

  edTab.pressTab();
  assert.equal(edTab.state.doc.toString(), "def test():\n\t\t");

  edTab.pressShiftTab();
  assert.equal(edTab.state.doc.toString(), "def test():\n\t");
});

test("Acceptance 7: Python file save simulation: content, indentation, and encoding persist", () => {
  const tmpPy = path.resolve("test-sample-script.py");
  const original = 'def calculate(a, b):\n    """Sample docstring."""\n    if a > 0:\n        return a + b\n    return b\n';
  fs.writeFileSync(tmpPy, original, "utf8");

  try {
    const content = fs.readFileSync(tmpPy, "utf8");
    const editor = createEditorMock(content, content.length, { lang: "python", tabSize: 4 });

    // Insert new method at the end
    const additional = "\n\ndef main():\n    result = calculate(2, 3)\n    print(result)\n";
    editor.dispatch(
      editor.state.update({
        changes: { from: content.length, insert: additional }
      })
    );

    // Save back to file
    fs.writeFileSync(tmpPy, editor.state.doc.toString(), "utf8");

    // Re-read and verify exact match
    const reRead = fs.readFileSync(tmpPy, "utf8");
    assert.equal(reRead, original + additional);
  } finally {
    if (fs.existsSync(tmpPy)) {
      fs.unlinkSync(tmpPy);
    }
  }
});
