import { expect, it } from "vitest";
import { fencedCode } from "../src/code";

it("keeps embedded fences and arbitrary code inside a single code block", () => {
  const code = "```\n<script>alert(1)</script>\n````";
  expect(fencedCode(code, "c")).toBe(`\`\`\`\`\`c\n${code}\n\`\`\`\`\``);
});

it("does not allow the language field to inject Markdown", () => {
  expect(fencedCode("content", "c\n```\n# injected")).toBe("```text\ncontent\n```");
});
