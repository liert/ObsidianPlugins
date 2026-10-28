import { App, resolveSubpath, TFile } from "obsidian";
import { candidatePaths, EvidenceReference } from "./reference";
import { EvidenceRecord, readRecord } from "./schema";

export type EvidenceContent =
  | { type: "record"; record: EvidenceRecord; path: string }
  | { type: "markdown"; markdown: string; title: string; path: string };

export class EvidenceRepository {
  constructor(private app: App, private defaultDatabase: () => string) {}

  async load(reference: EvidenceReference, sourcePath: string): Promise<EvidenceContent> {
    const paths = candidatePaths(reference.path, sourcePath, this.defaultDatabase());
    const file = paths.map(path => this.app.vault.getAbstractFileByPath(path)).find((value): value is TFile => value instanceof TFile);
    if (!file) throw new Error(`找不到证据文件：${paths.join(" 或 ")}。`);
    if (!["json", "md"].includes(file.extension.toLowerCase())) throw new Error("证据文件仅支持 .json 和 .md。");
    const content = await this.app.vault.cachedRead(file);
    if (file.extension.toLowerCase() === "json") return { type: "record", record: readRecord(content, reference.fragment), path: file.path };
    let markdown = content;
    if (reference.fragment) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) throw new Error("Obsidian 尚未索引这个 Markdown 文件，请稍后重试。");
      const subpath = resolveSubpath(cache, `#${reference.fragment}`);
      if (!subpath) throw new Error(`找不到标题或块：${reference.fragment}。`);
      // Metadata positions count UTF-16 offsets, just like String.slice.
      markdown = content.slice(subpath.start.offset, subpath.end?.offset ?? content.length);
    }
    return { type: "markdown", markdown, title: reference.fragment || file.basename, path: file.path };
  }
}
