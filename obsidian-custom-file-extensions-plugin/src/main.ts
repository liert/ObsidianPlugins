import {
  Plugin,
  Platform,
  EventRef,
  WorkspaceLeaf
} from "obsidian";
import {
  CustomFileExtensionsSettings,
  CODE_FILE_VIEW_TYPE,
  DEFAULT_SETTINGS,
  DEFAULT_CODE_EXTENSIONS
} from "./types";
import { normalizeExtension, normalizeLanguage } from "./utils";
import { CodeEditorView } from "./code-editor-view";
import { CustomFileExtensionsSettingTab } from "./settings";
import EditExtensionModal from "./edit-modal";
import { PLUGIN_STYLES } from "./styles";

export class CustomFileExtensions extends Plugin {
  settings!: CustomFileExtensionsSettings;

  get useMobile(): boolean {
    return Platform.isMobile && this.settings.mobileSettings.enabled;
  }

  async onload(): Promise<void> {
    await super.onload();
    this.injectStyles();
    await this.loadSettings();

    // Register our custom code editor view
    this.registerView(
      CODE_FILE_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new CodeEditorView(leaf, this)
    );

    const viewRegistry = (this.app as any).viewRegistry;
    if (this.settings.allowMdOverride && viewRegistry) {
      try {
        viewRegistry.unregisterExtensions(["md"]);
      } catch (e) {
        console.error("Failed to unregister md extension:", e);
      }
    }

    this.registerEvent(this._buildFileContextMenuEditExtensionItem());
    this.addSettingTab(new CustomFileExtensionsSettingTab(this.app, this));
    this._apply();
  }

  private _buildFileContextMenuEditExtensionItem(): EventRef {
    return this.app.workspace.on("file-menu", (menu, file) => {
      menu.addItem((item) => {
        item
          .setTitle("Edit Extension")
          .setIcon("pencil")
          .onClick(() => new EditExtensionModal(this, file).open());
      });
    });
  }

  onunload(): void {
    this.removeStyles();
    this._unapply(this.settings);
    this.app.workspace.detachLeavesOfType(CODE_FILE_VIEW_TYPE);
    try {
      this.registerExtensions([".md"], "markdown");
    } catch (e) {
      // Ignore if .md is already registered
    }
  }

  async loadSettings(): Promise<void> {
    const loadedData = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

    // Ensure codeRendering is properly configured with backward-compatible defaults
    if (!this.settings.codeRendering) {
      this.settings.codeRendering = {
        enabled: true,
        extensions: { ...DEFAULT_CODE_EXTENSIONS },
        tabSize: 4,
        useTabChar: false
      };
    } else {
      if (typeof this.settings.codeRendering.enabled !== "boolean") {
        this.settings.codeRendering.enabled = true;
      }
      if (
        !this.settings.codeRendering.extensions ||
        typeof this.settings.codeRendering.extensions !== "object"
      ) {
        this.settings.codeRendering.extensions = { ...DEFAULT_CODE_EXTENSIONS };
      }
      if (
        typeof this.settings.codeRendering.tabSize !== "number" ||
        ![2, 4, 8].includes(this.settings.codeRendering.tabSize)
      ) {
        this.settings.codeRendering.tabSize = 4;
      }
      if (typeof this.settings.codeRendering.useTabChar !== "boolean") {
        this.settings.codeRendering.useTabChar = false;
      }
    }

    if (!this.settings.errors) {
      this.settings.errors = {};
    }
  }

  async resetSettings(): Promise<void> {
    this._unapply(this.settings);
    await this.updateSettings(DEFAULT_SETTINGS);
    this._apply();
  }

  async updateSettings(newSettings: CustomFileExtensionsSettings): Promise<void> {
    this._unapply(newSettings);
    this.settings = newSettings;
    await this.saveData(this.settings);
    this._apply();
    this.refreshOpenLeaves();
  }

  isCodeExtension(rawExt: string): boolean {
    if (!this.settings.codeRendering || !this.settings.codeRendering.enabled) {
      return false;
    }
    const ext = normalizeExtension(rawExt);
    return Object.prototype.hasOwnProperty.call(
      this.settings.codeRendering.extensions,
      ext
    );
  }

  getLanguageForExtension(rawExt: string): string {
    const ext = normalizeExtension(rawExt);
    if (
      this.settings.codeRendering &&
      this.settings.codeRendering.extensions[ext]
    ) {
      return normalizeLanguage(this.settings.codeRendering.extensions[ext]);
    }
    return "text";
  }

  private _apply(): void {
    const appliedCodeExts: string[] = [];

    // 1. Apply code rendering extensions if enabled
    if (this.settings.codeRendering && this.settings.codeRendering.enabled) {
      for (const rawExt of Object.keys(this.settings.codeRendering.extensions)) {
        const ext = normalizeExtension(rawExt);
        if (ext) {
          appliedCodeExts.push(ext);
          this._tryToApply(ext, CODE_FILE_VIEW_TYPE);
        }
      }
    }

    // 2. Apply general view types
    const typesToApply = this.useMobile
      ? this.settings.mobileSettings.types ?? this.settings.types
      : this.settings.types;

    if (typesToApply) {
      for (const view in typesToApply) {
        for (const fileType of typesToApply[view]) {
          const ext = normalizeExtension(fileType);
          // If already mapped to code view, skip mapping to general view to avoid conflict
          if (
            this.settings.codeRendering &&
            this.settings.codeRendering.enabled &&
            appliedCodeExts.includes(ext)
          ) {
            continue;
          }
          this._tryToApply(ext, view);
        }
      }
    }
  }

  private _tryToApply(fileType: string, view: string): void {
    if (!this.settings.allowMdOverride && fileType === "md") {
      return;
    }
    try {
      this.registerExtensions([fileType], view);
    } catch (e) {
      const viewRegistry = (this.app as any).viewRegistry;
      const current = viewRegistry ? viewRegistry.getTypeByExtension(fileType) : null;
      let message: string;
      if (current) {
        message = `${fileType} is already registered to ${current}.`;
      } else {
        message = `${e}`;
      }
      message = `Could not register extension: '${fileType}' to view type: ${view}. ${message}`;
      console.warn(message);
      this.settings.errors[fileType] = message;
    }
  }

  private _unapply(newSettings: CustomFileExtensionsSettings): void {
    const viewRegistry = (this.app as any).viewRegistry;
    if (!viewRegistry) return;

    // Unregister code view extensions
    if (this.settings.codeRendering && this.settings.codeRendering.extensions) {
      for (const rawExt of Object.keys(this.settings.codeRendering.extensions)) {
        const ext = normalizeExtension(rawExt);
        if (ext && !this.settings.errors[ext]) {
          try {
            viewRegistry.unregisterExtensions([ext]);
          } catch (e) {
            console.warn(`Could not unregister code extension: '${ext}'`, e);
          }
        }
      }
    }

    // Unregister general types
    const typesToUnapply = this.useMobile
      ? this.settings.mobileSettings.types ?? this.settings.types
      : this.settings.types;

    if (typesToUnapply) {
      this._unapplyConfig(typesToUnapply, newSettings.allowMdOverride);
    }
  }

  private _unapplyConfig(
    extensionsByViewType: Record<string, string[]>,
    allowMdOverride: boolean
  ): void {
    const viewRegistry = (this.app as any).viewRegistry;
    if (!viewRegistry) return;

    for (const extension of Object.values(extensionsByViewType).flat()) {
      const cleanExt = normalizeExtension(extension);
      if (allowMdOverride || cleanExt !== "md") {
        if (!this.settings.errors[cleanExt]) {
          try {
            viewRegistry.unregisterExtensions([cleanExt]);
          } catch (e) {
            console.warn(`Could not unregister extension: '${cleanExt}'`, e);
          }
        }
      }
    }
  }

  refreshOpenLeaves(): void {
    // 1. Update open CodeEditorView leaves
    const codeLeaves = this.app.workspace.getLeavesOfType(CODE_FILE_VIEW_TYPE);
    for (const leaf of codeLeaves) {
      const file = (leaf.view as any)?.file;
      if (file) {
        const ext = normalizeExtension(file.extension);
        if (this.isCodeExtension(ext)) {
          if (leaf.view instanceof CodeEditorView) {
            leaf.view.reconfigureLanguage();
            leaf.view.reconfigureIndent();
          }
        } else {
          // No longer configured as code, switch back to markdown if needed
          leaf.setViewState({
            type: "markdown",
            state: leaf.view.getState()
          });
        }
      }
    }

    // 2. Switch markdown leaves to CodeFileView if their extension is now a code extension
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of markdownLeaves) {
      const file = (leaf.view as any)?.file;
      if (file) {
        const ext = normalizeExtension(file.extension);
        if (this.isCodeExtension(ext)) {
          leaf.setViewState({
            type: CODE_FILE_VIEW_TYPE,
            state: leaf.view.getState()
          });
        }
      }
    }
  }

  private injectStyles(): void {
    this.removeStyles();
    const styleEl = document.createElement("style");
    styleEl.id = "cfe-inlined-styles";
    styleEl.textContent = PLUGIN_STYLES;
    document.head.appendChild(styleEl);
  }

  private removeStyles(): void {
    const existing = document.getElementById("cfe-inlined-styles");
    if (existing) {
      existing.remove();
    }
  }
}

export default CustomFileExtensions;
