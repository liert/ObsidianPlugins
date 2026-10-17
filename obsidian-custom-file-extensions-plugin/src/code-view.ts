import {
  FileView,
  WorkspaceLeaf,
  TFile,
  MarkdownRenderer,
  Component
} from "obsidian";
import type CustomFileExtensions from "./main";
import { CODE_FILE_VIEW_TYPE } from "./types";
import {
  normalizeExtension,
  normalizeLanguage,
  buildSafeCodeFenceMarkdown,
  formatFileSize
} from "./utils";

export class CodeFileView extends FileView {
  plugin: CustomFileExtensions;
  navigation = true;
  allowNoFile = false;

  private wrapperEl: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private codeContainerEl: HTMLElement | null = null;
  private renderChild: Component | null = null;
  private renderVersion = 0;
  private lastRenderedContent: string | null = null;
  private lastRenderedPath: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CustomFileExtensions) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CODE_FILE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file ? this.file.name : "Code View";
  }

  getIcon(): string {
    return "file-code";
  }

  canAcceptExtension(extension: string): boolean {
    return this.plugin.isCodeExtension(extension);
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.empty();
    this.contentEl.addClass("custom-code-file-view");

    this.wrapperEl = this.contentEl.createDiv({ cls: "code-view-wrapper" });
    this.headerEl = this.wrapperEl.createDiv({ cls: "code-view-header" });
    this.codeContainerEl = this.wrapperEl.createDiv({
      cls: "code-view-container markdown-rendered"
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.file && file === this.file) {
          this.renderCode();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        if (this.file && file === this.file) {
          this.renderCode();
        }
      })
    );
  }

  async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    await this.renderCode();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.cleanupRender();
    this.lastRenderedContent = null;
    this.lastRenderedPath = null;
    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    this.cleanupRender();
    await super.onClose();
  }

  private cleanupRender(): void {
    if (this.renderChild) {
      this.removeChild(this.renderChild);
      this.renderChild.unload();
      this.renderChild = null;
    }
  }

  async renderCode(): Promise<void> {
    if (!this.file || !this.codeContainerEl || !this.headerEl) {
      return;
    }

    const currentVersion = ++this.renderVersion;
    const currentFile = this.file;
    const filePath = currentFile.path;
    const ext = normalizeExtension(currentFile.extension);
    const lang = this.plugin.getLanguageForExtension(ext);

    let content = "";
    try {
      content = await this.app.vault.read(currentFile);
    } catch (err) {
      console.error("Failed to read file content:", err);
      if (this.renderVersion === currentVersion) {
        this.renderError(`Failed to read file: ${err}`);
      }
      return;
    }

    if (this.renderVersion !== currentVersion) {
      return;
    }

    // Update the view header
    this.updateHeader(currentFile, lang, content);

    // If content and path haven't changed, skip re-rendering DOM
    if (
      this.lastRenderedContent === content &&
      this.lastRenderedPath === filePath
    ) {
      return;
    }

    // Clean up previous child components
    this.cleanupRender();
    this.codeContainerEl.empty();

    const markdown = buildSafeCodeFenceMarkdown(content, lang);

    this.renderChild = new Component();
    this.addChild(this.renderChild);

    try {
      await MarkdownRenderer.render(
        this.app,
        markdown,
        this.codeContainerEl,
        filePath,
        this.renderChild
      );
    } catch (renderErr) {
      console.error(
        "MarkdownRenderer.render failed, falling back to direct code element:",
        renderErr
      );
      if (this.renderVersion === currentVersion) {
        this.renderFallback(content, lang);
      }
    }

    this.lastRenderedContent = content;
    this.lastRenderedPath = filePath;
  }

  private updateHeader(file: TFile, lang: string, content: string): void {
    if (!this.headerEl) return;
    this.headerEl.empty();

    const infoEl = this.headerEl.createDiv({ cls: "code-view-info" });
    infoEl.createSpan({ text: file.name, cls: "code-view-filename" });
    infoEl.createSpan({
      text: lang || "text",
      cls: "code-view-lang-tag"
    });

    const lineCount = content.length === 0 ? 0 : content.split("\n").length;
    const byteSize = new Blob([content]).size;
    const sizeStr = formatFileSize(byteSize);
    infoEl.createSpan({
      text: `${lineCount} line${lineCount === 1 ? "" : "s"} • ${sizeStr}`,
      cls: "code-view-meta"
    });

    const actionsEl = this.headerEl.createDiv({ cls: "code-view-actions" });
    const copyBtn = actionsEl.createEl("button", {
      text: "Copy Code",
      cls: "code-view-copy-btn"
    });

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(content);
        copyBtn.setText("Copied!");
        copyBtn.addClass("copied");
        setTimeout(() => {
          copyBtn.setText("Copy Code");
          copyBtn.removeClass("copied");
        }, 2000);
      } catch (e) {
        console.error("Failed to copy code to clipboard:", e);
      }
    });
  }

  private renderFallback(content: string, lang: string): void {
    if (!this.codeContainerEl) return;
    this.codeContainerEl.empty();
    const cleanLang = normalizeLanguage(lang);
    const pre = this.codeContainerEl.createEl("pre", {
      cls: `language-${cleanLang}`
    });
    const code = pre.createEl("code", { cls: `language-${cleanLang}` });
    code.textContent = content;
  }

  private renderError(message: string): void {
    if (!this.codeContainerEl) return;
    this.codeContainerEl.empty();
    const errorBox = this.codeContainerEl.createDiv({ cls: "code-view-error" });
    errorBox.createEl("p", { text: message, cls: "cfe-error-msg" });
  }
}
