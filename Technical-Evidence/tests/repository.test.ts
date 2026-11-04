import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { EvidenceRepository } from "../src/repository";
import { parseReference } from "../src/reference";
import { resolveSubpath, TFile } from "./support/obsidian";

const example = readFileSync(new URL("../examples/Evidence/evidence.json", import.meta.url), "utf8");
beforeEach(() => { resolveSubpath.mockReset(); });

function vault(contents: Record<string, string>) {
  const files = new Map(Object.keys(contents).map(path => [path, new TFile(path)]));
  const cachedRead = vi.fn(async (file: TFile) => contents[file.path]);
  const process = vi.fn(async (file: TFile, update: (text: string) => string) => {
    const updated = update(contents[file.path]!);
    contents[file.path] = updated;
    return updated;
  });
  const metadata = {};
  const app = {
    vault: { getAbstractFileByPath: (path: string) => files.get(path), cachedRead, process },
    metadataCache: { getFileCache: () => metadata }
  };
  return { repository: new EvidenceRepository(app as unknown as App, () => "Evidence/evidence.json"), cachedRead, metadata, process, files };
}

describe("on-demand file loading", () => {
  it("does not read files until requested and re-reads changed evidence", async () => {
    const contents = { "Evidence/evidence.json": example };
    const { repository, cachedRead } = vault(contents);
    expect(cachedRead).not.toHaveBeenCalled();
    const reference = parseReference("evidence:#buffer-limit")!;
    const first = await repository.load(reference, "Notes/Report.md");
    expect(first.type).toBe("record");
    contents["Evidence/evidence.json"] = example.replace("请求长度限制：4096 字节", "更新后的结论");
    const updated = await repository.load(reference, "Notes/Report.md");
    expect(updated.type === "record" && updated.record.title).toContain("更新后的结论");
    expect(cachedRead).toHaveBeenCalledTimes(2);
  });
  it("resolves local evidence before root evidence", async () => {
    const { repository } = vault({ "Notes/proof.md": "local", "proof.md": "root" });
    expect(await repository.load(parseReference("evidence:proof.md")!, "Notes/Report.md")).toMatchObject({ type: "markdown", markdown: "local", path: "Notes/proof.md" });
  });
  it("uses Obsidian metadata to read only the requested heading or block", async () => {
    const { repository, metadata } = vault({ "proof.md": "before\n证据内容\nafter" });
    resolveSubpath.mockReturnValue({ start: { offset: 7 }, end: { offset: 11 } });
    const result = await repository.load(parseReference("evidence:proof.md#^proof")!, "Report.md");
    expect(resolveSubpath).toHaveBeenCalledWith(metadata, "#^proof");
    expect(result).toMatchObject({ type: "markdown", markdown: "证据内容", title: "^proof" });
  });
  it("explains missing files, unsupported file types and missing headings", async () => {
    const { repository, cachedRead } = vault({ "proof.exe": "", "proof.md": "# Other" });
    await expect(repository.load(parseReference("evidence:missing.json#id")!, "Report.md")).rejects.toThrow("找不到证据文件");
    await expect(repository.load(parseReference("evidence:proof.exe")!, "Report.md")).rejects.toThrow("仅支持");
    expect(cachedRead).not.toHaveBeenCalled();
    resolveSubpath.mockReturnValue(null);
    await expect(repository.load(parseReference("evidence:proof.md#missing")!, "Report.md")).rejects.toThrow("找不到标题或块");
  });
});

describe("saving evidence to its source", () => {
  it("saves a whole Markdown file and supports another edit without reloading", async () => {
    const contents = { "Notes/proof.md": "# Before\nOld" };
    const { repository } = vault(contents);
    const original = await repository.load(parseReference("evidence:proof.md")!, "Notes/Main.md");
    const saved = await repository.save(original, "# After\nNew");
    expect(saved).toMatchObject({ type: "markdown", markdown: "# After\nNew" });
    expect(contents["Notes/proof.md"]).toBe("# After\nNew");
    await repository.save(saved, "");
    expect(contents["Notes/proof.md"]).toBe("");
  });

  it.each(["Section", "^proof"])("replaces only the %s fragment, retaining surrounding content and UTF-16 offsets", async fragment => {
    const before = "😀 Intro\r\n";
    const excerpt = fragment === "Section" ? "## Section\r\nOld\r\n" : "Old ^proof\r\n";
    const after = "## Next\r\nKeep\r\n";
    const contents = { "proof.md": before + excerpt + after };
    const { repository } = vault(contents);
    resolveSubpath.mockReturnValue({ start: { offset: before.length }, end: { offset: before.length + excerpt.length } });
    const original = await repository.load(parseReference(`evidence:proof.md#${fragment}`)!, "Main.md");
    const replacement = excerpt.replace("Old", "Longer replacement");
    const saved = await repository.save(original, replacement);
    expect(contents["proof.md"]).toBe(before + replacement + after);
    await repository.save(saved, replacement.replace("Longer replacement", "Again"));
    expect(contents["proof.md"]).toBe(before + excerpt.replace("Old", "Again") + after);
  });

  it("refuses to apply stale fragment offsets after any external Markdown change", async () => {
    const contents = { "proof.md": "Before\nOld\nAfter" };
    const { repository } = vault(contents);
    resolveSubpath.mockReturnValue({ start: { offset: 7 }, end: { offset: 11 } });
    const original = await repository.load(parseReference("evidence:proof.md#^proof")!, "Main.md");
    contents["proof.md"] = "Inserted\n" + contents["proof.md"];
    await expect(repository.save(original, "Replacement\n")).rejects.toThrow("已在其他位置修改");
    expect(contents["proof.md"]).toBe("Inserted\nBefore\nOld\nAfter");
  });

  it("preserves CRLF line endings when a textarea normalizes edited Markdown to LF", async () => {
    const contents = { "proof.md": "# Heading\r\nOld\r\n" };
    const { repository } = vault(contents);
    const original = await repository.load(parseReference("evidence:proof.md")!, "Main.md");
    await repository.save(original, "# Heading\nNew\n");
    expect(contents["proof.md"]).toBe("# Heading\r\nNew\r\n");
  });

  it("updates only the selected JSON record, retaining external changes to other records and extension fields", async () => {
    const database = { version: 1, extra: "keep", records: { a: { title: "A", evidence: [], custom: 42 }, b: { title: "B", evidence: [] } } };
    const contents = { "Evidence/evidence.json": JSON.stringify(database, null, "\t").replace(/\n/g, "\r\n") + "\r\n" };
    const { repository } = vault(contents);
    const original = await repository.load(parseReference("evidence:#a")!, "Main.md");
    contents["Evidence/evidence.json"] = contents["Evidence/evidence.json"].replace('"B"', '"Externally updated B"');
    const saved = await repository.save(original, JSON.stringify({ ...database.records.a, title: "Updated A" }));
    const updated = JSON.parse(contents["Evidence/evidence.json"]);
    expect(updated).toEqual({ ...database, records: { a: { ...database.records.a, title: "Updated A" }, b: { title: "Externally updated B", evidence: [] } } });
    expect(saved).toMatchObject({ type: "record", record: { title: "Updated A", custom: 42 } });
    expect(contents["Evidence/evidence.json"]).toContain('\r\n\t"version"');
    expect(contents["Evidence/evidence.json"].endsWith("\r\n")).toBe(true);
    await repository.save(saved, JSON.stringify(database.records.a));
    expect(JSON.parse(contents["Evidence/evidence.json"]).records.a.title).toBe("A");
  });

  it.each(["{", '{"title":4,"evidence":[]}', '{"title":"A","callChain":{"nodes":[],"edges":[{"from":"missing","to":"missing"}]}}'])("validates edited JSON before writing: %s", async text => {
    const contents = { "Evidence/evidence.json": example };
    const { repository, process } = vault(contents);
    const original = await repository.load(parseReference("evidence:#buffer-limit")!, "Main.md");
    await expect(repository.save(original, text)).rejects.toThrow();
    expect(process).not.toHaveBeenCalled();
    expect(contents["Evidence/evidence.json"]).toBe(example);
  });

  it("rejects concurrent edits to the same JSON record", async () => {
    const contents = { "Evidence/evidence.json": example };
    const { repository } = vault(contents);
    const reference = parseReference("evidence:#buffer-limit")!;
    const first = await repository.load(reference, "Main.md");
    const second = await repository.load(reference, "Main.md");
    if (first.type !== "record") throw new Error("Expected a record");
    await repository.save(first, JSON.stringify({ ...first.record, title: "First edit" }));
    await expect(repository.save(second, JSON.stringify(first.record))).rejects.toThrow("已在其他位置修改");
    expect(JSON.parse(contents["Evidence/evidence.json"]).records["buffer-limit"].title).toBe("First edit");
  });

  it("reports removed files and write failures without invalidating the draft snapshot", async () => {
    const contents = { "proof.md": "Old" };
    const { repository, process, files } = vault(contents);
    const original = await repository.load(parseReference("evidence:proof.md")!, "Main.md");
    process.mockRejectedValueOnce(new Error("Disk full"));
    await expect(repository.save(original, "New")).rejects.toThrow("Disk full");
    expect(contents["proof.md"]).toBe("Old");
    await repository.save(original, "Retry");
    expect(contents["proof.md"]).toBe("Retry");
    files.delete("proof.md");
    await expect(repository.save(original, "New")).rejects.toThrow("已移动或删除");
  });
});
