import { App, MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { evidenceEditorExtension } from "./editor";
import { EvidenceModal } from "./modal";
import { parseReference, vaultPath } from "./reference";
import { EvidenceRepository } from "./repository";

interface EvidenceSettings { defaultDatabase: string }
const DEFAULT_SETTINGS: EvidenceSettings = { defaultDatabase: "Evidence/evidence.json" };

class EvidenceLinks extends MarkdownRenderChild {
  constructor(container: HTMLElement, private sourcePath: string, private open: (href: string, source: string) => void) { super(container); }
  onload(): void {
    this.registerDomEvent(this.containerEl, "click", event => {
      const target = event.target as Element | null;
      if (!target || typeof target.closest !== "function") return;
      const anchor = target.closest("a[href]");
      if (!anchor || !this.containerEl.contains(anchor)) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!/^(evidence|callchain):/i.test(href)) return;
      event.preventDefault();
      event.stopPropagation();
      this.open(href, this.sourcePath);
    }, { capture: true });
  }
}

export default class TechnicalEvidencePlugin extends Plugin {
  settings: EvidenceSettings = DEFAULT_SETTINGS;
  private repository!: EvidenceRepository;
  private modals = new Set<EvidenceModal>();

  async onload(): Promise<void> {
    const saved = await this.loadData();
    this.settings = { defaultDatabase: typeof saved?.defaultDatabase === "string" ? saved.defaultDatabase : DEFAULT_SETTINGS.defaultDatabase };
    this.repository = new EvidenceRepository(this.app, () => this.settings.defaultDatabase);
    const open = (href: string, source: string): void => this.openEvidence(href, source);
    this.registerMarkdownPostProcessor((element, context) => {
      const anchors = Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(anchor => /^(evidence|callchain):/i.test(anchor.getAttribute("href") ?? ""));
      if (!anchors.length) return;
      for (const anchor of anchors) {
        anchor.addClass("te-trigger");
        if (anchor.childNodes.length === 1 && anchor.firstElementChild?.tagName === "CODE") anchor.addClass("te-inline-code");
        anchor.setAttribute("aria-haspopup", "dialog");
        anchor.setAttribute("title", anchor.getAttribute("href") ?? "");
      }
      context.addChild(new EvidenceLinks(element, context.sourcePath, open));
    });
    this.registerEditorExtension(evidenceEditorExtension(open));
    this.addSettingTab(new EvidenceSettingsTab(this.app, this));
    for (const kind of ["evidence", "callchain"] as const) {
      this.addCommand({
        id: `insert-${kind}-link`,
        name: kind === "evidence" ? "插入证据链接" : "插入调用链链接",
        editorCallback: editor => {
          const label = kind === "evidence" ? "查看证据" : "查看调用链";
          const id = editor.getSelection().trim() || "条目ID";
          editor.replaceSelection(`[${label}](${kind}:#${encodeURIComponent(id)})`);
        }
      });
    }
  }

  onunload(): void {
    for (const modal of this.modals) modal.close();
    this.modals.clear();
  }

  private openEvidence(href: string, sourcePath: string): void {
    try {
      const reference = parseReference(href);
      if (!reference) return;
      const modal = new EvidenceModal(this.app, this.repository, reference, sourcePath);
      this.modals.add(modal);
      const onClose = modal.onClose.bind(modal);
      modal.onClose = () => { onClose(); this.modals.delete(modal); };
      modal.open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "无法打开证据链接。");
    }
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
}

class EvidenceSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: TechnicalEvidencePlugin) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("默认 JSON 数据库")
      .setDesc("相对于仓库根目录。省略文件名的链接（如 evidence:#buffer-limit）会读取此文件。")
      .addText(text => text.setPlaceholder(DEFAULT_SETTINGS.defaultDatabase).setValue(this.plugin.settings.defaultDatabase).onChange(async value => {
        try {
          const path = vaultPath(value.trim() || DEFAULT_SETTINGS.defaultDatabase);
          if (!path.toLowerCase().endsWith(".json") || /[:\\\u0000-\u001f]/.test(path)) return;
          this.plugin.settings.defaultDatabase = path;
          await this.plugin.saveSettings();
        } catch { /* Keep the previous valid path while the user edits. */ }
      }));
    this.containerEl.createEl("p", {
      text: "详细数据仅在点击时从当前仓库读取。关闭弹窗即可继续原位置阅读；修改证据文件后可在弹窗中点击刷新。",
      cls: "setting-item-description te-settings-note"
    });
  }
}
