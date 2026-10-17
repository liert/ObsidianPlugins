var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  CustomFileExtensions: () => CustomFileExtensions,
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/types.ts
var CODE_FILE_VIEW_TYPE = "code-file-view";
var DEFAULT_TYPES = {
  markdown: [
    "",
    "md",
    "txt",
    "js",
    "css",
    "ts",
    "jsx",
    "tsx",
    "yaml",
    "yml",
    "sass",
    "scss",
    "tex",
    "json",
    "html"
  ]
};
var DEFAULT_CODE_EXTENSIONS = {
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  py: "python",
  lua: "lua",
  json: "json",
  xml: "xml",
  log: "text"
};
var DEFAULT_SETTINGS = {
  types: DEFAULT_TYPES,
  configIsValid: true,
  errors: {},
  allowMdOverride: false,
  mobileSettings: {
    enabled: false,
    configIsValid: true,
    types: DEFAULT_TYPES
  },
  codeRendering: {
    enabled: true,
    extensions: DEFAULT_CODE_EXTENSIONS
  }
};

// src/utils.ts
function normalizeExtension(ext) {
  if (!ext) return "";
  let clean = ext.trim().toLowerCase();
  while (clean.startsWith(".")) {
    clean = clean.slice(1);
  }
  return clean;
}
function normalizeLanguage(lang) {
  if (!lang) return "text";
  const clean = lang.trim().toLowerCase();
  return clean || "text";
}
function buildSafeCodeFenceMarkdown(content, language) {
  const matches = content.match(/`+/g);
  let maxBackticks = 0;
  if (matches) {
    for (const m of matches) {
      if (m.length > maxBackticks) {
        maxBackticks = m.length;
      }
    }
  }
  const fence = "`".repeat(Math.max(3, maxBackticks + 1));
  const cleanLang = normalizeLanguage(language);
  const normalized = content.replace(/\r\n/g, "\n");
  const body = normalized.length === 0 ? "" : normalized.endsWith("\n") ? normalized : normalized + "\n";
  return `${fence}${cleanLang}
${body}${fence}
`;
}
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// src/code-view.ts
var import_obsidian = require("obsidian");
var CodeFileView = class extends import_obsidian.FileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.navigation = true;
    this.allowNoFile = false;
    this.wrapperEl = null;
    this.headerEl = null;
    this.codeContainerEl = null;
    this.renderChild = null;
    this.renderVersion = 0;
    this.lastRenderedContent = null;
    this.lastRenderedPath = null;
    this.plugin = plugin;
  }
  getViewType() {
    return CODE_FILE_VIEW_TYPE;
  }
  getDisplayText() {
    return this.file ? this.file.name : "Code View";
  }
  getIcon() {
    return "file-code";
  }
  canAcceptExtension(extension) {
    return this.plugin.isCodeExtension(extension);
  }
  async onOpen() {
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
  async onLoadFile(file) {
    await super.onLoadFile(file);
    await this.renderCode();
  }
  async onUnloadFile(file) {
    this.cleanupRender();
    this.lastRenderedContent = null;
    this.lastRenderedPath = null;
    await super.onUnloadFile(file);
  }
  async onClose() {
    this.cleanupRender();
    await super.onClose();
  }
  cleanupRender() {
    if (this.renderChild) {
      this.removeChild(this.renderChild);
      this.renderChild.unload();
      this.renderChild = null;
    }
  }
  async renderCode() {
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
    this.updateHeader(currentFile, lang, content);
    if (this.lastRenderedContent === content && this.lastRenderedPath === filePath) {
      return;
    }
    this.cleanupRender();
    this.codeContainerEl.empty();
    const markdown = buildSafeCodeFenceMarkdown(content, lang);
    this.renderChild = new import_obsidian.Component();
    this.addChild(this.renderChild);
    try {
      await import_obsidian.MarkdownRenderer.render(
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
  updateHeader(file, lang, content) {
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
      text: `${lineCount} line${lineCount === 1 ? "" : "s"} \u2022 ${sizeStr}`,
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
        }, 2e3);
      } catch (e) {
        console.error("Failed to copy code to clipboard:", e);
      }
    });
  }
  renderFallback(content, lang) {
    if (!this.codeContainerEl) return;
    this.codeContainerEl.empty();
    const cleanLang = normalizeLanguage(lang);
    const pre = this.codeContainerEl.createEl("pre", {
      cls: `language-${cleanLang}`
    });
    const code = pre.createEl("code", { cls: `language-${cleanLang}` });
    code.textContent = content;
  }
  renderError(message) {
    if (!this.codeContainerEl) return;
    this.codeContainerEl.empty();
    const errorBox = this.codeContainerEl.createDiv({ cls: "code-view-error" });
    errorBox.createEl("p", { text: message, cls: "cfe-error-msg" });
  }
};

// src/settings.ts
var import_obsidian2 = require("obsidian");
var CustomFileExtensionsSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this._defaults = null;
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    const example = JSON.stringify(DEFAULT_SETTINGS.types, null, 2);
    containerEl.empty();
    containerEl.createEl("h2", { text: "Custom File Extensions Settings" });
    this._config = new import_obsidian2.Setting(containerEl).setName("Config").setDesc(
      "Valid entry is a JSON object whose property keys are view types and values are arrays of the file types to assign to that view."
    );
    const exampleText = document.createElement("div");
    exampleText.style.fontSize = "80%";
    exampleText.style.margin = "10px";
    exampleText.innerHTML = `<b>Ex</b>: <code>${example}</code>`;
    if (this._config.nameEl.parentElement) {
      this._config.nameEl.parentElement.appendChild(exampleText);
    }
    const configTextArea = new import_obsidian2.TextAreaComponent(containerEl).setPlaceholder(example).setValue(JSON.stringify(this.plugin.settings.types, null, 2)).onChange(async (value) => {
      let parsed = null;
      const next = { ...this.plugin.settings };
      try {
        parsed = JSON.parse(value);
        next.configIsValid = true;
        next.types = parsed;
      } catch (e) {
        next.configIsValid = false;
      }
      this._updateConfigValidity(
        configTextArea,
        this.plugin.settings.configIsValid,
        next.configIsValid
      );
      await this.plugin.updateSettings(next);
      this._updateErrors();
      this._updateList();
      this._updateProfile();
    });
    configTextArea.inputEl.style.width = "100%";
    configTextArea.inputEl.style.height = "150px";
    configTextArea.inputEl.style.minHeight = "100px";
    this._mobileConfig = new import_obsidian2.Setting(containerEl).setName("Mobile Specific Config").setDesc(
      "If enabled: the config settings below will be used on mobile devices, instead of the above settings."
    ).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.mobileSettings.enabled).onChange(async (value) => {
        const next = {
          ...this.plugin.settings,
          mobileSettings: {
            ...this.plugin.settings.mobileSettings,
            enabled: value
          }
        };
        await this.plugin.updateSettings(next);
        this._updateMobileConfigVisible(mobileConfigField, value);
        this._updateErrors();
        this._updateList();
        this._updateProfile();
      });
      return toggle;
    });
    const mobileConfigField = new import_obsidian2.TextAreaComponent(containerEl).setPlaceholder(example).setValue(
      this.plugin.settings.mobileSettings.types ? JSON.stringify(this.plugin.settings.mobileSettings.types, null, 2) : ""
    ).onChange(async (value) => {
      const next = {
        ...this.plugin.settings,
        mobileSettings: {
          ...this.plugin.settings.mobileSettings,
          types: void 0
        }
      };
      if (value !== "" && value !== null && value !== void 0) {
        try {
          const parsed = JSON.parse(value);
          next.mobileSettings.configIsValid = true;
          next.mobileSettings.types = parsed;
        } catch (e) {
          next.mobileSettings.configIsValid = false;
        }
      }
      this._updateConfigValidity(
        mobileConfigField,
        this.plugin.settings.mobileSettings.configIsValid,
        next.mobileSettings.configIsValid
      );
      await this.plugin.updateSettings(next);
      this._updateErrors();
      this._updateList();
      this._updateProfile();
    });
    mobileConfigField.inputEl.style.width = "100%";
    mobileConfigField.inputEl.style.height = "150px";
    mobileConfigField.inputEl.style.minHeight = "100px";
    this._updateMobileConfigVisible(
      mobileConfigField,
      this.plugin.settings.mobileSettings.enabled
    );
    new import_obsidian2.Setting(containerEl).setName("Allow Override Of .md Extension").setDesc(
      "If enabled: the .md extension will be allowed to override the default markdown view type. This is disabled by default to prevent unexpected behavior."
    ).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.allowMdOverride).onChange(async (value) => {
        const next = {
          ...this.plugin.settings,
          allowMdOverride: value
        };
        await this.plugin.updateSettings(next);
      });
      return toggle;
    });
    containerEl.createEl("h3", {
      text: "Code Block Style File Rendering",
      cls: "cfe-code-section-title"
    });
    const codeDesc = containerEl.createEl("p", {
      text: "Allow specifying file extensions to render as syntax-highlighted code blocks instead of plain Markdown documents. Original files remain completely unmodified."
    });
    codeDesc.style.color = "var(--text-muted)";
    codeDesc.style.fontSize = "var(--font-ui-smaller)";
    new import_obsidian2.Setting(containerEl).setName("Enable Code Block Rendering").setDesc(
      "When enabled, files with extensions configured below will be displayed as syntax-highlighted code blocks."
    ).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.codeRendering.enabled).onChange(async (value) => {
        const next = {
          ...this.plugin.settings,
          codeRendering: {
            ...this.plugin.settings.codeRendering,
            enabled: value
          }
        };
        await this.plugin.updateSettings(next);
        this._updateList();
        this.display();
      });
    });
    let newExtInput = "";
    let newLangInput = "";
    const addSetting = new import_obsidian2.Setting(containerEl).setName("Add Extension Mapping").setDesc("Map a file extension to a programming language identifier (e.g. .java -> java, .log -> text).");
    const addContainer = addSetting.controlEl.createDiv({ cls: "cfe-add-container" });
    const extTextComp = addSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "Extension (e.g. .java or java)"
    });
    extTextComp.addClass("cfe-ext-input");
    extTextComp.addEventListener("input", (e) => {
      newExtInput = e.target.value;
    });
    const langTextComp = addSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "Language (e.g. java, python, c, text)"
    });
    langTextComp.addClass("cfe-lang-input");
    langTextComp.addEventListener("input", (e) => {
      newLangInput = e.target.value;
    });
    const addBtn = addSetting.controlEl.createEl("button", {
      text: "Add Mapping",
      cls: "mod-cta cfe-add-btn"
    });
    const errorContainer = containerEl.createDiv({ cls: "cfe-error-msg" });
    errorContainer.style.display = "none";
    const triggerAdd = async () => {
      const cleanExt = normalizeExtension(newExtInput);
      const cleanLang = normalizeLanguage(newLangInput);
      if (!cleanExt) {
        errorContainer.setText("Error: File extension cannot be empty.");
        errorContainer.style.display = "block";
        return;
      }
      if (!/^[a-zA-Z0-9_\-]+$/.test(cleanExt)) {
        errorContainer.setText(
          `Error: Invalid extension '${cleanExt}'. Only alphanumeric characters, hyphens, and underscores are allowed.`
        );
        errorContainer.style.display = "block";
        return;
      }
      if (this.plugin.settings.codeRendering.extensions[cleanExt]) {
        errorContainer.setText(
          `Error: Extension '.${cleanExt}' is already configured (mapped to '${this.plugin.settings.codeRendering.extensions[cleanExt]}'). Modify it below or delete it first.`
        );
        errorContainer.style.display = "block";
        return;
      }
      errorContainer.empty();
      errorContainer.style.display = "none";
      const nextExts = {
        ...this.plugin.settings.codeRendering.extensions,
        [cleanExt]: cleanLang
      };
      const next = {
        ...this.plugin.settings,
        codeRendering: {
          ...this.plugin.settings.codeRendering,
          extensions: nextExts
        }
      };
      await this.plugin.updateSettings(next);
      this._updateList();
      this.display();
    };
    addBtn.addEventListener("click", triggerAdd);
    extTextComp.addEventListener("keypress", (e) => {
      if (e.key === "Enter") triggerAdd();
    });
    langTextComp.addEventListener("keypress", (e) => {
      if (e.key === "Enter") triggerAdd();
    });
    const listHeader = containerEl.createDiv({ cls: "cfe-ext-list-header" });
    const configuredExts = Object.entries(
      this.plugin.settings.codeRendering.extensions || {}
    );
    listHeader.createEl("h4", {
      text: `Configured Code Extensions (${configuredExts.length})`
    });
    this._codeListContainer = containerEl.createDiv({ cls: "cfe-ext-list" });
    if (configuredExts.length === 0) {
      this._codeListContainer.createEl("p", {
        text: "No extensions currently configured for code block rendering.",
        cls: "cfe-empty-notice"
      });
    } else {
      configuredExts.sort(([a], [b]) => a.localeCompare(b));
      for (const [ext, lang] of configuredExts) {
        const row = new import_obsidian2.Setting(this._codeListContainer).setName(`.${ext}`).setDesc(`Maps to language '${lang}'`);
        row.addText((text) => {
          text.setValue(lang).setPlaceholder("Language identifier").onChange(async (newLang) => {
            const cleanNewLang = normalizeLanguage(newLang);
            const nextExts = {
              ...this.plugin.settings.codeRendering.extensions,
              [ext]: cleanNewLang
            };
            const next = {
              ...this.plugin.settings,
              codeRendering: {
                ...this.plugin.settings.codeRendering,
                extensions: nextExts
              }
            };
            row.setDesc(`Maps to language '${cleanNewLang}'`);
            await this.plugin.updateSettings(next);
          });
        });
        row.addButton((btn) => {
          btn.setIcon("trash").setTooltip(`Delete .${ext} mapping`).setWarning().onClick(async () => {
            const nextExts = {
              ...this.plugin.settings.codeRendering.extensions
            };
            delete nextExts[ext];
            const next = {
              ...this.plugin.settings,
              codeRendering: {
                ...this.plugin.settings.codeRendering,
                extensions: nextExts
              }
            };
            await this.plugin.updateSettings(next);
            this._updateList();
            this.display();
          });
        });
      }
    }
    new import_obsidian2.Setting(containerEl).setName("Reset Code Extensions to Defaults").setDesc("Restore the standard recommended mappings (.java, .c, .cpp, .py, .lua, .json, .xml, .log).").addButton((btn) => {
      btn.setButtonText("Reset to Defaults").onClick(async () => {
        const next = {
          ...this.plugin.settings,
          codeRendering: {
            ...this.plugin.settings.codeRendering,
            extensions: { ...DEFAULT_CODE_EXTENSIONS }
          }
        };
        await this.plugin.updateSettings(next);
        this._updateList();
        this.display();
      });
    });
    containerEl.createEl("h3", { text: "Errors" });
    this._errors = containerEl.createEl("p", { text: "None" });
    this._errors.style.whiteSpace = "pre-line";
    containerEl.createEl("h3", { text: "Active View Types and Extensions" });
    this._views = containerEl.createEl("p");
    this._views.style.whiteSpace = "pre-line";
    this._updateErrors();
    this._updateList();
    this._updateProfile();
  }
  _updateMobileConfigVisible(mobileConfigField, mobileSettingsEnabled) {
    mobileConfigField.inputEl.style.display = mobileSettingsEnabled ? "block" : "none";
  }
  _updateConfigValidity(text, prevWasValid, nextIsValid) {
    if (prevWasValid !== nextIsValid) {
      if (prevWasValid) {
        if (!this._defaults) {
          this._defaults = {
            color: text.inputEl.style.color,
            borderColor: text.inputEl.style.borderColor,
            borderWidth: text.inputEl.style.borderWidth
          };
        }
        text.inputEl.style.color = "var(--text-error)";
        text.inputEl.style.borderColor = "var(--background-modifier-error-rgb)";
        text.inputEl.style.borderWidth = "3px";
      } else if (this._defaults) {
        text.inputEl.style.color = this._defaults.color;
        text.inputEl.style.borderColor = this._defaults.borderColor;
        text.inputEl.style.borderWidth = this._defaults.borderWidth;
      }
    }
  }
  _updateErrors() {
    if (Object.keys(this.plugin.settings.errors).length === 0) {
      this._errors.innerHTML = `None`;
      this._errors.style.color = "green";
    } else {
      this._errors.innerHTML = `Errors: <ul>${Object.keys(
        this.plugin.settings.errors
      ).map((k) => `<li><b>${k}</b>: ${this.plugin.settings.errors[k]}</li>`).join("")}</ul>`;
      this._errors.style.color = "var(--text-error)";
    }
  }
  _updateProfile() {
    if (this.plugin.useMobile) {
      this._mobileConfig.nameEl.innerHTML = `Mobile Specific Config&nbsp;<sup style="color: green">(active)</sup>`;
      this._config.nameEl.innerHTML = `Config&nbsp;<sup style="color: gray">(inactive)</sup>`;
    } else {
      this._config.nameEl.innerHTML = `Config&nbsp;<sup style="color: green">(active)</sup>`;
      this._mobileConfig.nameEl.innerHTML = `Mobile Specific Config&nbsp;<sup style="color: gray">(inactive)</sup>`;
    }
  }
  _updateList() {
    const viewRegistry = this.app.viewRegistry;
    if (!viewRegistry || !viewRegistry.viewByType) return;
    this._views.innerHTML = `<ul>${Object.keys(viewRegistry.viewByType).sort((a, b) => {
      const extCountForViewKeyA = this._getExtensionsForView(a).length;
      const extCountForViewKeyB = this._getExtensionsForView(b).length;
      return extCountForViewKeyB - extCountForViewKeyA;
    }).map((viewType) => {
      const extensions = this._getExtensionsForView(viewType);
      return `<li>${extensions.length > 0 ? `<b ${_copy()}>${viewType}</b>` : `<span ${_copy()} style="color: gray">${viewType}</span>`}${extensions.length ? `: ${extensions.sort((a, b) => b.length - a.length).map(
        (ext) => ext ? `<code ${_copy()}>${ext}</code>` : `<code>""</code> <span style="color: gray"><i>(extensionless)</i></span>`
      ).join(", ")}` : ``}</li>`;
    }).join("")}</ul>`;
    function _copy() {
      return `
      onmouseover="this.style.textDecoration='underline';" 
      onmouseout="this.style.textDecoration='none';"
      title="Click to copy"
      onclick="
        navigator.clipboard.writeText(this.innerText);
        new Notification('Custom File Extensions Plugin', {body:'Copied: \\'' + this.innerText + '\\', to clipboard.'});
      "`;
    }
  }
  _getExtensionsForView(view) {
    const viewRegistry = this.app.viewRegistry;
    if (!viewRegistry || !viewRegistry.typeByExtension) return [];
    return Object.entries(viewRegistry.typeByExtension).filter(([, v]) => v === view).map(([ext]) => ext);
  }
};

// src/edit-modal.ts
var import_obsidian3 = require("obsidian");
var EditExtensionModal = class extends import_obsidian3.Modal {
  constructor(plugin, target) {
    super(plugin.app);
    this.plugin = plugin;
    this.target = target ?? this.plugin.app.vault.getRoot();
    this._path = this.target.path.split("/").slice(0, -1).join("/");
    const lastPart = this.target.path.split("/").last() ?? "";
    this._name = lastPart.split(".")[0];
    const lastParts = lastPart.split(".");
    this._originalExtension = this._newExtension = lastParts.length === 1 ? "" : lastParts.last() ?? "";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.style.display = "flex";
    contentEl.style.flexDirection = "column";
    contentEl.style.alignItems = "center";
    const fileNameDisplay = contentEl.createEl("span");
    fileNameDisplay.style.flexGrow = "1";
    fileNameDisplay.style.marginRight = "10px";
    fileNameDisplay.style.fontWeight = "bold";
    fileNameDisplay.style.textAlign = "center";
    fileNameDisplay.innerHTML = this._buildFullPath();
    const formDiv = contentEl.createEl("div");
    formDiv.style.display = "flex";
    formDiv.style.alignItems = "center";
    const fileNameInput = new import_obsidian3.TextComponent(formDiv);
    fileNameInput.inputEl.style.flexGrow = "1";
    fileNameInput.inputEl.style.marginRight = "10px";
    fileNameInput.setValue(this._originalExtension);
    fileNameInput.inputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this._submit();
      } else if (e.key === "Escape") {
        this.close();
      }
    });
    fileNameInput.onChange((value) => {
      this._newExtension = value.startsWith(".") ? value.slice(1) : value;
      fileNameDisplay.innerHTML = this._buildFullPath();
    });
    const submitButton = new import_obsidian3.ButtonComponent(formDiv);
    submitButton.setCta();
    submitButton.setButtonText("Rename");
    submitButton.onClick(() => this._submit());
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
  async _submit() {
    this.close();
    const newPath = this._buildFullPath();
    await this.app.vault.rename(this.target, newPath);
  }
  _buildFullPath() {
    return (this._path ? this._path + "/" : "") + this._name + (this._newExtension ? "." : "") + this._newExtension;
  }
};
var edit_modal_default = EditExtensionModal;

// src/styles.ts
var PLUGIN_STYLES = `
/* ==========================================================================
   Custom File Extensions Plugin - Code Block View & Settings Styles
   ========================================================================== */

/* Main Container for Code View */
.custom-code-file-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--background-primary);
}

.custom-code-file-view .code-view-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Header bar displaying file name, language tag, metadata, and copy button */
.custom-code-file-view .code-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: var(--background-secondary);
  border-bottom: 1px solid var(--divider-color);
  font-size: var(--font-ui-smaller);
  user-select: none;
  flex-shrink: 0;
}

.custom-code-file-view .code-view-info {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-code-file-view .code-view-filename {
  font-weight: var(--font-semibold);
  color: var(--text-normal);
}

.custom-code-file-view .code-view-lang-tag {
  background-color: var(--background-modifier-border);
  color: var(--text-muted);
  padding: 2px 7px;
  border-radius: var(--radius-s);
  font-size: 11px;
  font-family: var(--font-monospace);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.custom-code-file-view .code-view-meta {
  color: var(--text-faint);
  font-size: 12px;
}

.custom-code-file-view .code-view-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-code-file-view .code-view-copy-btn {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-s);
  cursor: pointer;
  background-color: var(--interactive-normal);
  color: var(--text-normal);
  border: 1px solid var(--interactive-border);
  transition: all 0.15s ease-in-out;
}

.custom-code-file-view .code-view-copy-btn:hover {
  background-color: var(--interactive-hover);
}

.custom-code-file-view .code-view-copy-btn.copied {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}

/* Code Container */
.custom-code-file-view .code-view-container {
  flex: 1 1 auto;
  overflow: auto;
  padding: 16px;
  background-color: var(--background-primary);
}

.custom-code-file-view .code-view-container pre {
  margin: 0;
  padding: 16px;
  background-color: var(--code-background);
  border-radius: var(--radius-m);
  border: 1px solid var(--code-border-color, var(--divider-color));
  font-family: var(--font-monospace);
  font-size: var(--code-size);
  line-height: var(--line-height-tight, 1.5);
  overflow-x: auto;
  white-space: pre;
  word-break: normal;
  tab-size: 4;
}

.custom-code-file-view .code-view-container pre code {
  font-family: inherit;
  font-size: inherit;
  background: transparent;
  padding: 0;
  white-space: inherit;
}

/* Error message styling */
.custom-code-file-view .code-view-error {
  padding: 24px;
}

/* ==========================================================================
   Settings Tab Styling
   ========================================================================== */

.cfe-code-section-title {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--divider-color);
}

.cfe-add-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cfe-ext-input {
  width: 160px;
}

.cfe-lang-input {
  width: 160px;
}

.cfe-add-btn {
  white-space: nowrap;
}

.cfe-ext-list-header {
  margin-top: 16px;
  margin-bottom: 8px;
}

.cfe-ext-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.cfe-empty-notice {
  color: var(--text-muted);
  font-style: italic;
  font-size: var(--font-ui-smaller);
  margin: 12px 0;
}

.cfe-error-msg {
  color: var(--text-error);
  font-size: var(--font-ui-smaller);
  margin: 6px 0 12px 0;
  padding: 6px 10px;
  background-color: var(--background-modifier-error);
  border-radius: var(--radius-s);
}
`;

// src/main.ts
var CustomFileExtensions = class extends import_obsidian4.Plugin {
  get useMobile() {
    return import_obsidian4.Platform.isMobile && this.settings.mobileSettings.enabled;
  }
  async onload() {
    await super.onload();
    this.injectStyles();
    await this.loadSettings();
    this.registerView(
      CODE_FILE_VIEW_TYPE,
      (leaf) => new CodeFileView(leaf, this)
    );
    const viewRegistry = this.app.viewRegistry;
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
  _buildFileContextMenuEditExtensionItem() {
    return this.app.workspace.on("file-menu", (menu, file) => {
      menu.addItem((item) => {
        item.setTitle("Edit Extension").setIcon("pencil").onClick(() => new edit_modal_default(this, file).open());
      });
    });
  }
  onunload() {
    this.removeStyles();
    this._unapply(this.settings);
    this.app.workspace.detachLeavesOfType(CODE_FILE_VIEW_TYPE);
    try {
      this.registerExtensions([".md"], "markdown");
    } catch (e) {
    }
  }
  async loadSettings() {
    const loadedData = await this.loadData() || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    if (!this.settings.codeRendering) {
      this.settings.codeRendering = {
        enabled: true,
        extensions: { ...DEFAULT_CODE_EXTENSIONS }
      };
    } else {
      if (typeof this.settings.codeRendering.enabled !== "boolean") {
        this.settings.codeRendering.enabled = true;
      }
      if (!this.settings.codeRendering.extensions || typeof this.settings.codeRendering.extensions !== "object") {
        this.settings.codeRendering.extensions = { ...DEFAULT_CODE_EXTENSIONS };
      }
    }
    if (!this.settings.errors) {
      this.settings.errors = {};
    }
  }
  async resetSettings() {
    this._unapply(this.settings);
    await this.updateSettings(DEFAULT_SETTINGS);
    this._apply();
  }
  async updateSettings(newSettings) {
    this._unapply(newSettings);
    this.settings = newSettings;
    await this.saveData(this.settings);
    this._apply();
    this.refreshOpenLeaves();
  }
  isCodeExtension(rawExt) {
    if (!this.settings.codeRendering || !this.settings.codeRendering.enabled) {
      return false;
    }
    const ext = normalizeExtension(rawExt);
    return Object.prototype.hasOwnProperty.call(
      this.settings.codeRendering.extensions,
      ext
    );
  }
  getLanguageForExtension(rawExt) {
    const ext = normalizeExtension(rawExt);
    if (this.settings.codeRendering && this.settings.codeRendering.extensions[ext]) {
      return normalizeLanguage(this.settings.codeRendering.extensions[ext]);
    }
    return "text";
  }
  _apply() {
    const appliedCodeExts = [];
    if (this.settings.codeRendering && this.settings.codeRendering.enabled) {
      for (const rawExt of Object.keys(this.settings.codeRendering.extensions)) {
        const ext = normalizeExtension(rawExt);
        if (ext) {
          appliedCodeExts.push(ext);
          this._tryToApply(ext, CODE_FILE_VIEW_TYPE);
        }
      }
    }
    const typesToApply = this.useMobile ? this.settings.mobileSettings.types ?? this.settings.types : this.settings.types;
    if (typesToApply) {
      for (const view in typesToApply) {
        for (const fileType of typesToApply[view]) {
          const ext = normalizeExtension(fileType);
          if (this.settings.codeRendering && this.settings.codeRendering.enabled && appliedCodeExts.includes(ext)) {
            continue;
          }
          this._tryToApply(ext, view);
        }
      }
    }
  }
  _tryToApply(fileType, view) {
    if (!this.settings.allowMdOverride && fileType === "md") {
      return;
    }
    try {
      this.registerExtensions([fileType], view);
    } catch (e) {
      const viewRegistry = this.app.viewRegistry;
      const current = viewRegistry ? viewRegistry.getTypeByExtension(fileType) : null;
      let message;
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
  _unapply(newSettings) {
    const viewRegistry = this.app.viewRegistry;
    if (!viewRegistry) return;
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
    const typesToUnapply = this.useMobile ? this.settings.mobileSettings.types ?? this.settings.types : this.settings.types;
    if (typesToUnapply) {
      this._unapplyConfig(typesToUnapply, newSettings.allowMdOverride);
    }
  }
  _unapplyConfig(extensionsByViewType, allowMdOverride) {
    const viewRegistry = this.app.viewRegistry;
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
  refreshOpenLeaves() {
    const codeLeaves = this.app.workspace.getLeavesOfType(CODE_FILE_VIEW_TYPE);
    for (const leaf of codeLeaves) {
      const file = leaf.view?.file;
      if (file) {
        const ext = normalizeExtension(file.extension);
        if (this.isCodeExtension(ext)) {
          leaf.view.renderCode();
        } else {
          leaf.setViewState({
            type: "markdown",
            state: leaf.view.getState()
          });
        }
      }
    }
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of markdownLeaves) {
      const file = leaf.view?.file;
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
  injectStyles() {
    this.removeStyles();
    const styleEl = document.createElement("style");
    styleEl.id = "cfe-inlined-styles";
    styleEl.textContent = PLUGIN_STYLES;
    document.head.appendChild(styleEl);
  }
  removeStyles() {
    const existing = document.getElementById("cfe-inlined-styles");
    if (existing) {
      existing.remove();
    }
  }
};
var main_default = CustomFileExtensions;
