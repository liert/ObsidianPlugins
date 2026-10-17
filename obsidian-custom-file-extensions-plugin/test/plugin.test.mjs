import test from "node:test";
import assert from "node:assert/strict";

// We can import utils directly or compile them
import {
  normalizeExtension,
  normalizeLanguage,
  buildSafeCodeFenceMarkdown,
  formatFileSize
} from "../src/utils.ts";

import {
  DEFAULT_SETTINGS,
  DEFAULT_CODE_EXTENSIONS,
  CODE_FILE_VIEW_TYPE
} from "../src/types.ts";

test("normalizeExtension handles various formats", () => {
  assert.equal(normalizeExtension(".java"), "java");
  assert.equal(normalizeExtension("java"), "java");
  assert.equal(normalizeExtension("..JAVA"), "java");
  assert.equal(normalizeExtension("  .CPP  "), "cpp");
  assert.equal(normalizeExtension(".Hpp"), "hpp");
  assert.equal(normalizeExtension(""), "");
  assert.equal(normalizeExtension(null), "");
  assert.equal(normalizeExtension(undefined), "");
});

test("normalizeLanguage handles various formats", () => {
  assert.equal(normalizeLanguage("java"), "java");
  assert.equal(normalizeLanguage("  Python  "), "python");
  assert.equal(normalizeLanguage(""), "text");
  assert.equal(normalizeLanguage(null), "text");
  assert.equal(normalizeLanguage(undefined), "text");
  assert.equal(normalizeLanguage("TEXT"), "text");
});

test("buildSafeCodeFenceMarkdown generates standard fence for normal code", () => {
  const code = 'System.out.println("Hello, World!");';
  const md = buildSafeCodeFenceMarkdown(code, "java");
  assert.equal(md, "```java\nSystem.out.println(\"Hello, World!\");\n```\n");
});

test("buildSafeCodeFenceMarkdown prevents truncation when code contains 3 backticks", () => {
  const code = 'String md = "```markdown\n# Hello\n```";';
  const md = buildSafeCodeFenceMarkdown(code, "java");
  // Must use at least 4 backticks for fence
  assert.match(md, /^````java\n/);
  assert.match(md, /\n````\n$/);
  assert.ok(md.includes(code));
});

test("buildSafeCodeFenceMarkdown handles code with 5 consecutive backticks", () => {
  const code = 'Here are five backticks: ````` in a comment.';
  const md = buildSafeCodeFenceMarkdown(code, "text");
  // Longest run is 5, so fence must be at least 6 backticks
  assert.match(md, /^``````text\n/);
  assert.match(md, /\n``````\n$/);
  assert.ok(md.includes(code));
});

test("buildSafeCodeFenceMarkdown handles empty file without error", () => {
  const md = buildSafeCodeFenceMarkdown("", "java");
  assert.equal(md, "```java\n```\n");
});

test("buildSafeCodeFenceMarkdown normalizes CRLF without altering content", () => {
  const code = "int a = 1;\r\nint b = 2;\r\n";
  const md = buildSafeCodeFenceMarkdown(code, "c");
  assert.ok(!md.includes("\r\n"));
  assert.ok(md.includes("int a = 1;\nint b = 2;\n"));
});

test("buildSafeCodeFenceMarkdown preserves Chinese and Unicode characters", () => {
  const code = "// 中文注释测试：你好，世界！\nconst emoji = '🚀';";
  const md = buildSafeCodeFenceMarkdown(code, "javascript");
  assert.ok(md.includes("// 中文注释测试：你好，世界！"));
  assert.ok(md.includes("🚀"));
});

test("buildSafeCodeFenceMarkdown preserves HTML tags as literal text", () => {
  const code = "#include <iostream>\n#include <vector>\nusing namespace std;";
  const md = buildSafeCodeFenceMarkdown(code, "cpp");
  assert.ok(md.includes("#include <iostream>"));
  assert.ok(md.includes("#include <vector>"));
});

test("formatFileSize formats bytes correctly", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(1024), "1.0 KB");
  assert.equal(formatFileSize(2048), "2.0 KB");
  assert.equal(formatFileSize(1048576), "1.0 MB");
});

test("Backward compatibility: default settings are complete and valid", () => {
  assert.equal(CODE_FILE_VIEW_TYPE, "code-file-view");
  assert.ok(DEFAULT_SETTINGS.codeRendering);
  assert.equal(DEFAULT_SETTINGS.codeRendering.enabled, true);
  assert.equal(DEFAULT_SETTINGS.codeRendering.extensions["java"], "java");
  assert.equal(DEFAULT_SETTINGS.codeRendering.extensions["c"], "c");
  assert.equal(DEFAULT_SETTINGS.codeRendering.extensions["cpp"], "cpp");
  assert.equal(DEFAULT_SETTINGS.codeRendering.extensions["log"], "text");

  // Old fields must be preserved
  assert.ok(DEFAULT_SETTINGS.types);
  assert.equal(DEFAULT_SETTINGS.configIsValid, true);
  assert.equal(DEFAULT_SETTINGS.allowMdOverride, false);
  assert.ok(DEFAULT_SETTINGS.mobileSettings);
});

test("Backward compatibility: legacy data without codeRendering merges cleanly", () => {
  const legacyData = {
    types: {
      markdown: ["py", "txt"]
    },
    configIsValid: true,
    errors: {},
    allowMdOverride: false,
    mobileSettings: {
      enabled: false,
      configIsValid: true,
      types: { markdown: ["md"] }
    }
  };

  const merged = Object.assign({}, DEFAULT_SETTINGS, legacyData);
  assert.ok(merged.types.markdown.includes("py"));
  assert.ok(merged.codeRendering);
  assert.equal(merged.codeRendering.enabled, true);
  assert.equal(merged.codeRendering.extensions["java"], "java");
});
