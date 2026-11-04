import { App, resolveSubpath, TFile } from "obsidian";
import { candidatePaths, EvidenceReference } from "./reference";
import { EvidenceRecord, readEditableRecord, readRecord } from "./schema";

export type EvidenceContent =
  | { type: "record"; record: EvidenceRecord; path: string }
  | { type: "markdown"; markdown: string; title: string; path: string };

interface EvidenceSnapshot {
  source: string;
  fragment: string;
  start: number;
  end: number;
  record?: string;
}

export class EvidenceRepository {
  private snapshots = new WeakMap<EvidenceContent, EvidenceSnapshot>();

  constructor(private app: App, private defaultDatabase: () => string) {}

  async load(reference: EvidenceReference, sourcePath: string): Promise<EvidenceContent> {
    const paths = candidatePaths(reference.path, sourcePath, this.defaultDatabase());
    const file = paths.map(path => this.app.vault.getAbstractFileByPath(path)).find((value): value is TFile => value instanceof TFile);
    if (!file) throw new Error(`找不到证据文件：${paths.join(" 或 ")}。`);
    if (!["json", "md"].includes(file.extension.toLowerCase())) throw new Error("证据文件仅支持 .json 和 .md。");
    const content = await this.app.vault.cachedRead(file);
    if (file.extension.toLowerCase() === "json") {
      const result: EvidenceContent = { type: "record", record: readRecord(content, reference.fragment), path: file.path };
      this.snapshots.set(result, { source: content, fragment: reference.fragment, start: 0, end: content.length, record: JSON.stringify(result.record) });
      return result;
    }
    let markdown = content;
    let start = 0;
    let end = content.length;
    if (reference.fragment) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) throw new Error("Obsidian 尚未索引这个 Markdown 文件，请稍后重试。");
      const subpath = resolveSubpath(cache, `#${reference.fragment}`);
      if (!subpath) throw new Error(`找不到标题或块：${reference.fragment}。`);
      // Metadata positions count UTF-16 offsets, just like String.slice.
      start = subpath.start.offset;
      end = subpath.end?.offset ?? content.length;
      markdown = content.slice(start, end);
    }
    const result: EvidenceContent = { type: "markdown", markdown, title: reference.fragment || file.basename, path: file.path };
    this.snapshots.set(result, { source: content, fragment: reference.fragment, start, end });
    return result;
  }

  async save(content: EvidenceContent, text: string): Promise<EvidenceContent> {
    const snapshot = this.snapshots.get(content);
    if (!snapshot) throw new Error("请重新打开证据后再编辑。");
    const file = this.app.vault.getAbstractFileByPath(content.path);
    if (!(file instanceof TFile)) throw new Error("证据文件已移动或删除，请重新打开后再编辑。");
    let record: EvidenceRecord | undefined;
    if (content.type === "record") record = readEditableRecord(text);
    if (content.type === "markdown" && snapshot.source.includes("\r\n")) text = text.replace(/\r?\n/g, "\r\n");
    const conflict = (): never => { throw new Error("证据文件已在其他位置修改，未覆盖原文件。请先复制草稿，再点击刷新并放弃未保存的修改，重新合并。"); };
    const source = await this.app.vault.process(file, current => {
      if (content.type === "markdown") {
        // Fragment offsets belong to this exact source, not a possibly stale metadata cache.
        if (current !== snapshot.source) return conflict();
        return current.slice(0, snapshot.start) + text + current.slice(snapshot.end);
      }
      if (JSON.stringify(readRecord(current, snapshot.fragment)) !== snapshot.record) return conflict();
      const database = JSON.parse(current);
      database.records[snapshot.fragment] = record;
      const indent = current.match(/(?:^|\n)([\t ]+)"/)?.[1] ?? (current.includes("\n") ? "  " : undefined);
      const newline = current.includes("\r\n") ? "\r\n" : "\n";
      return JSON.stringify(database, null, indent).replace(/\n/g, newline) + (current.endsWith("\n") ? newline : "");
    });
    const result: EvidenceContent = content.type === "markdown"
      ? { ...content, markdown: text }
      : { ...content, record: record! };
    this.snapshots.set(result, {
      ...snapshot, source,
      end: content.type === "markdown" ? snapshot.start + text.length : source.length,
      record: record ? JSON.stringify(record) : undefined
    });
    return result;
  }
}
