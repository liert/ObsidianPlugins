import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

import {
  normalizeExtension,
  normalizeLanguage,
  buildSafeCodeFenceMarkdown
} from "../src/utils.ts";

import {
  DEFAULT_SETTINGS,
  DEFAULT_CODE_EXTENSIONS,
  CODE_FILE_VIEW_TYPE
} from "../src/types.ts";

function sha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

const TEST_DIR = fs.existsSync("G:/Workspace/Obsidian-Company/test-code-files")
  ? "G:/Workspace/Obsidian-Company/test-code-files"
  : path.resolve(import.meta.dirname, "../test-code-files");

test("Integration: All sample test files exist and have valid initial hashes", () => {
  const files = [
    "TestApp.java",
    "demo.c",
    "demo.h",
    "demo.cpp",
    "demo.hpp",
    "special_chars.py",
    "app.log",
    "empty.java"
  ];

  for (const file of files) {
    const fullPath = path.join(TEST_DIR, file);
    assert.ok(fs.existsSync(fullPath), `File ${file} should exist`);
  }
});

test("Scenario 1: Java file rendering simulation", () => {
  const filePath = path.join(TEST_DIR, "TestApp.java");
  const beforeHash = sha256(filePath);
  const content = fs.readFileSync(filePath, "utf8");

  const ext = normalizeExtension(path.extname(filePath));
  assert.equal(ext, "java");

  const lang = DEFAULT_CODE_EXTENSIONS[ext];
  assert.equal(lang, "java");

  const markdown = buildSafeCodeFenceMarkdown(content, lang);
  assert.ok(markdown.startsWith("```java\n"));
  assert.ok(markdown.endsWith("```\n"));
  assert.ok(markdown.includes("public class TestApp"));
  assert.ok(markdown.includes("包含中文注释"));

  // Check file hash did not change
  const afterHash = sha256(filePath);
  assert.equal(beforeHash, afterHash, "Java file must remain completely unmodified");
});

test("Scenario 2: C/C++ files rendering simulation", () => {
  const cFiles = [
    { name: "demo.c", expectedLang: "c" },
    { name: "demo.h", expectedLang: "c" },
    { name: "demo.cpp", expectedLang: "cpp" },
    { name: "demo.hpp", expectedLang: "cpp" }
  ];

  for (const item of cFiles) {
    const filePath = path.join(TEST_DIR, item.name);
    const beforeHash = sha256(filePath);
    const content = fs.readFileSync(filePath, "utf8");

    const ext = normalizeExtension(path.extname(filePath));
    const lang = DEFAULT_CODE_EXTENSIONS[ext];
    assert.equal(lang, item.expectedLang);

    const markdown = buildSafeCodeFenceMarkdown(content, lang);
    assert.ok(markdown.startsWith(`\`\`\`${item.expectedLang}\n`));
    assert.ok(markdown.includes(content.trim()));

    const afterHash = sha256(filePath);
    assert.equal(beforeHash, afterHash, `${item.name} must remain completely unmodified`);
  }
});

test("Scenario 3: Special characters simulation (backticks, markdown tokens, html, unicode)", () => {
  const filePath = path.join(TEST_DIR, "special_chars.py");
  const beforeHash = sha256(filePath);
  const content = fs.readFileSync(filePath, "utf8");

  const ext = normalizeExtension(path.extname(filePath));
  assert.equal(ext, "py");

  const lang = DEFAULT_CODE_EXTENSIONS[ext];
  assert.equal(lang, "python");

  const markdown = buildSafeCodeFenceMarkdown(content, lang);

  // Since special_chars.py contains 4 consecutive backticks (````),
  // the outer fence MUST have at least 5 backticks (`````)!
  assert.ok(
    markdown.startsWith("`````python\n"),
    "Fence must have at least 5 backticks to safely enclose 4 backticks"
  );
  assert.ok(markdown.endsWith("`````\n"));

  // Verify all special elements are present intact
  assert.ok(markdown.includes("```markdown"));
  assert.ok(markdown.includes("````"));
  assert.ok(markdown.includes("# Heading 1"));
  assert.ok(markdown.includes("[[Obsidian内部链接测试]]"));
  assert.ok(markdown.includes("<script>alert('xss test');</script>"));
  assert.ok(markdown.includes("Unicode: 🌟 🚀 💻 🀄 © ® ™"));
  assert.ok(markdown.includes("\t# 使用了制表符缩进"));

  const afterHash = sha256(filePath);
  assert.equal(beforeHash, afterHash, "special_chars.py must remain completely unmodified");
});

test("Scenario 4: Plain text code styling simulation (.log -> text)", () => {
  const filePath = path.join(TEST_DIR, "app.log");
  const beforeHash = sha256(filePath);
  const content = fs.readFileSync(filePath, "utf8");

  const ext = normalizeExtension(path.extname(filePath));
  assert.equal(ext, "log");

  const lang = DEFAULT_CODE_EXTENSIONS[ext];
  assert.equal(lang, "text");

  const markdown = buildSafeCodeFenceMarkdown(content, lang);
  assert.ok(markdown.startsWith("```text\n"));
  assert.ok(markdown.includes("[INFO] Application started successfully"));

  const afterHash = sha256(filePath);
  assert.equal(beforeHash, afterHash, "app.log must remain completely unmodified");
});

test("Scenario 5: Empty file rendering simulation (empty.java)", () => {
  const filePath = path.join(TEST_DIR, "empty.java");
  const beforeHash = sha256(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  assert.equal(content.length, 0);

  const ext = normalizeExtension(path.extname(filePath));
  const lang = DEFAULT_CODE_EXTENSIONS[ext];
  assert.equal(lang, "java");

  const markdown = buildSafeCodeFenceMarkdown(content, lang);
  assert.equal(markdown, "```java\n```\n");

  const afterHash = sha256(filePath);
  assert.equal(beforeHash, afterHash, "empty.java must remain completely unmodified");
});

test("Scenario 6: Unconfigured extensions are not intercepted", () => {
  const unconfigured = ["pdf", "png", "docx", "mp4", "customext"];
  for (const ext of unconfigured) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(DEFAULT_CODE_EXTENSIONS, ext),
      false,
      `Extension ${ext} must not be in code extensions`
    );
  }
});

test("Scenario 7: Settings manipulation and persistence logic", () => {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  // Add new extension
  const newExt = normalizeExtension(".rs");
  const newLang = normalizeLanguage("rust");
  settings.codeRendering.extensions[newExt] = newLang;
  assert.equal(settings.codeRendering.extensions["rs"], "rust");

  // Modify existing extension
  settings.codeRendering.extensions["log"] = normalizeLanguage("shell");
  assert.equal(settings.codeRendering.extensions["log"], "shell");

  // Delete extension
  delete settings.codeRendering.extensions["lua"];
  assert.equal(settings.codeRendering.extensions["lua"], undefined);

  // Toggle master switch
  settings.codeRendering.enabled = false;
  assert.equal(settings.codeRendering.enabled, false);

  // Serialization and restoration
  const serialized = JSON.stringify(settings);
  const restored = JSON.parse(serialized);

  assert.equal(restored.codeRendering.enabled, false);
  assert.equal(restored.codeRendering.extensions["rs"], "rust");
  assert.equal(restored.codeRendering.extensions["log"], "shell");
  assert.equal(restored.codeRendering.extensions["lua"], undefined);
  assert.ok(restored.types.markdown.length > 0);
});
