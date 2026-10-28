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
  const metadata = {};
  const app = {
    vault: { getAbstractFileByPath: (path: string) => files.get(path), cachedRead },
    metadataCache: { getFileCache: () => metadata }
  };
  return { repository: new EvidenceRepository(app as unknown as App, () => "Evidence/evidence.json"), cachedRead, metadata };
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
