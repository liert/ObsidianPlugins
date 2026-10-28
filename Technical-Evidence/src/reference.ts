export type EvidenceKind = "evidence" | "callchain";

export interface EvidenceReference {
  kind: EvidenceKind;
  path: string;
  fragment: string;
}

/** These are local vault references, never network URLs. */
export function parseReference(href: string): EvidenceReference | null {
  const match = /^(evidence|callchain):([^#]*)(?:#(.*))?$/i.exec(href.trim());
  if (!match) return null;
  try {
    const path = decodeURIComponent(match[2] ?? "");
    const fragment = decodeURIComponent(match[3] ?? "");
    if (/[\u0000-\u001f\\?]/.test(path) || path.includes(":") || path.startsWith("//")) {
      throw new Error("证据路径必须是仓库内的相对路径。");
    }
    if (/[\u0000-\u001f]/.test(fragment)) throw new Error("证据 ID 或标题含有无效字符。");
    return { kind: match[1]!.toLowerCase() as EvidenceKind, path, fragment };
  } catch (error) {
    if (error instanceof URIError) throw new Error("证据链接中的百分号编码无效。");
    throw error;
  }
}

/** Resolve .. without ever allowing a reference to leave the vault. */
export function vaultPath(path: string): string {
  const segments: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (!segments.length) throw new Error("证据路径不能超出当前仓库。");
      segments.pop();
    } else segments.push(part);
  }
  return segments.join("/");
}

export function candidatePaths(path: string, sourcePath: string, defaultDatabase: string): string[] {
  if (!path) return [vaultPath(defaultDatabase)];
  if (path.startsWith("/")) return [vaultPath(path)];
  const folder = sourcePath.slice(0, Math.max(0, sourcePath.lastIndexOf("/")));
  const local = vaultPath(folder ? `${folder}/${path}` : path);
  if (/^\.{1,2}\//.test(path)) return [local];
  return [...new Set([local, vaultPath(path)])];
}

export interface InlineReference {
  from: number;
  to: number;
  label: string;
  href: string;
}

/** A whole-label Markdown code span; never interpret its contents as HTML. */
export function inlineCodeText(label: string): string | null {
  const fence = /^`+/.exec(label)?.[0];
  if (!fence || /`+$/.exec(label)?.[0] !== fence || label.length <= fence.length * 2) return null;
  let content = label.slice(fence.length, -fence.length);
  if ([...content.matchAll(/`+/g)].some(match => match[0].length === fence.length)) return null;
  content = content.replace(/\r\n?|\n/g, " ");
  if (content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)) content = content.slice(1, -1);
  return content;
}

export function inlineReferences(text: string, offset = 0): InlineReference[] {
  const pattern = /(?<!!)(\[([^\]\r\n]+)\])\(\s*(<(?:evidence|callchain):[^>\r\n]*>|(?:evidence|callchain):[^\s)]+)\s*\)/gi;
  const matches: InlineReference[] = [];
  for (const match of text.matchAll(pattern)) {
    let slashes = 0;
    for (let i = match.index! - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
    if (slashes % 2) continue;
    const rawHref = match[3]!;
    matches.push({
      from: offset + match.index!,
      to: offset + match.index! + match[0].length,
      label: match[2]!,
      href: rawHref.startsWith("<") ? rawHref.slice(1, -1) : rawHref
    });
  }
  return matches;
}
