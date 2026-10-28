import { App, Component, parseLinktext, TFile } from "obsidian";
import { EvidenceReference, parseReference } from "./reference";

/** Resolve note links relative to the evidence file, not the main document. */
export function resolvePanelLink(app: App, anchor: HTMLAnchorElement, sourcePath: string): EvidenceReference | null {
  const href = anchor.getAttribute("href") ?? "";
  const evidence = parseReference(href);
  if (evidence) return evidence;
  if (!anchor.classList.contains("internal-link")) return null;
  const linktext = anchor.getAttribute("data-href") ?? href;
  const { path, subpath } = parseLinktext(linktext);
  const file = path ? app.metadataCache.getFirstLinkpathDest(path, sourcePath) : app.vault.getAbstractFileByPath(sourcePath);
  if (!file && (!/\.[^/.]+$/.test(path) || /\.md$/i.test(path))) throw new Error(`找不到关联笔记：${path || sourcePath}。`);
  // Attachments and external URLs keep their normal Obsidian behavior.
  if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") return null;
  return { kind: "evidence", path: `/${file.path}`, fragment: subpath.replace(/^#/, "") };
}

export function bindPanelNavigation(app: App, target: HTMLElement, sourcePath: string, component: Component, navigate: (reference: EvidenceReference) => void, error: (error: unknown) => void): void {
  component.registerDomEvent(target, "click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const element = event.target as Element | null;
    const anchor = element?.closest?.("a") as HTMLAnchorElement | null;
    if (!anchor || !target.contains(anchor)) return;
    try {
      const reference = resolvePanelLink(app, anchor, sourcePath);
      if (!reference) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(reference);
    } catch (cause) {
      event.preventDefault();
      event.stopImmediatePropagation();
      error(cause);
    }
  }, { capture: true });
}
