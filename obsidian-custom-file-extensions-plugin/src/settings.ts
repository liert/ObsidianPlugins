import {
  App,
  PluginSettingTab,
  Setting,
  TextAreaComponent
} from "obsidian";
import type CustomFileExtensions from "./main";
import {
  DEFAULT_SETTINGS,
  DEFAULT_CODE_EXTENSIONS
} from "./types";
import { normalizeExtension, normalizeLanguage } from "./utils";

export class CustomFileExtensionsSettingTab extends PluginSettingTab {
  plugin: CustomFileExtensions;
  private _defaults: { color: string; borderColor: string; borderWidth: string } | null = null;
  private _config!: Setting;
  private _mobileConfig!: Setting;
  private _errors!: HTMLElement;
  private _views!: HTMLElement;
  private _codeListContainer!: HTMLElement;

  constructor(app: App, plugin: CustomFileExtensions) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const example = JSON.stringify(DEFAULT_SETTINGS.types, null, 2);

    containerEl.empty();
    containerEl.createEl("h2", { text: "Custom File Extensions Settings" });

    // --- Section: General View Types Configuration ---
    this._config = new Setting(containerEl)
      .setName("Config")
      .setDesc(
        "Valid entry is a JSON object whose property keys are view types and values are arrays of the file types to assign to that view."
      );

    const exampleText = document.createElement("div");
    exampleText.style.fontSize = "80%";
    exampleText.style.margin = "10px";
    exampleText.innerHTML = `<b>Ex</b>: <code>${example}</code>`;
    if (this._config.nameEl.parentElement) {
      this._config.nameEl.parentElement.appendChild(exampleText);
    }

    const configTextArea = new TextAreaComponent(containerEl)
      .setPlaceholder(example)
      .setValue(JSON.stringify(this.plugin.settings.types, null, 2))
      .onChange(async (value) => {
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

    // --- Section: Mobile Specific Config ---
    this._mobileConfig = new Setting(containerEl)
      .setName("Mobile Specific Config")
      .setDesc(
        "If enabled: the config settings below will be used on mobile devices, instead of the above settings."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.mobileSettings.enabled)
          .onChange(async (value) => {
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

    const mobileConfigField = new TextAreaComponent(containerEl)
      .setPlaceholder(example)
      .setValue(
        this.plugin.settings.mobileSettings.types
          ? JSON.stringify(this.plugin.settings.mobileSettings.types, null, 2)
          : ""
      )
      .onChange(async (value) => {
        const next = {
          ...this.plugin.settings,
          mobileSettings: {
            ...this.plugin.settings.mobileSettings,
            types: undefined as Record<string, string[]> | undefined
          }
        };
        if (value !== "" && value !== null && value !== undefined) {
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

    // --- Section: Allow Override Of .md Extension ---
    new Setting(containerEl)
      .setName("Allow Override Of .md Extension")
      .setDesc(
        "If enabled: the .md extension will be allowed to override the default markdown view type. This is disabled by default to prevent unexpected behavior."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.allowMdOverride)
          .onChange(async (value) => {
            const next = {
              ...this.plugin.settings,
              allowMdOverride: value
            };
            await this.plugin.updateSettings(next);
          });
        return toggle;
      });

    // --- Section: Code Editor File Extensions ---
    containerEl.createEl("h3", {
      text: "Code Editor File Extensions",
      cls: "cfe-code-section-title"
    });

    const codeDesc = containerEl.createEl("p", {
      text: "Allow specifying file extensions to open directly in a clean CodeMirror 6 code editor with syntax highlighting. Changes are saved back to the original files."
    });
    codeDesc.style.color = "var(--text-muted)";
    codeDesc.style.fontSize = "var(--font-ui-smaller)";

    // Master Toggle
    new Setting(containerEl)
      .setName("Enable Code Editor")
      .setDesc(
        "When enabled, files with extensions configured below will open in the code editor instead of plain Markdown documents."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.codeRendering.enabled)
          .onChange(async (value) => {
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

    // Add New Extension Mapping
    let newExtInput = "";
    let newLangInput = "";
    const addSetting = new Setting(containerEl)
      .setName("Add Extension Mapping")
      .setDesc("Map a file extension to a programming language identifier (e.g. .java -> java, .log -> text).");

    const addContainer = addSetting.controlEl.createDiv({ cls: "cfe-add-container" });

    const extTextComp = addSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "Extension (e.g. .java or java)"
    });
    extTextComp.addClass("cfe-ext-input");
    extTextComp.addEventListener("input", (e) => {
      newExtInput = (e.target as HTMLInputElement).value;
    });

    const langTextComp = addSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "Language (e.g. java, python, c, text)"
    });
    langTextComp.addClass("cfe-lang-input");
    langTextComp.addEventListener("input", (e) => {
      newLangInput = (e.target as HTMLInputElement).value;
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

    // Configured Extensions List
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
        const row = new Setting(this._codeListContainer)
          .setName(`.${ext}`)
          .setDesc(`Maps to language '${lang}'`);

        row.addText((text) => {
          text
            .setValue(lang)
            .setPlaceholder("Language identifier")
            .onChange(async (newLang) => {
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
          btn
            .setIcon("trash")
            .setTooltip(`Delete .${ext} mapping`)
            .setWarning()
            .onClick(async () => {
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

    // Reset Defaults Button
    new Setting(containerEl)
      .setName("Reset Code Extensions to Defaults")
      .setDesc("Restore the standard recommended mappings (.java, .c, .cpp, .py, .lua, .json, .xml, .log).")
      .addButton((btn) => {
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

    // --- Section: Errors & Active Views ---
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

  private _updateMobileConfigVisible(
    mobileConfigField: TextAreaComponent,
    mobileSettingsEnabled: boolean
  ): void {
    mobileConfigField.inputEl.style.display = mobileSettingsEnabled
      ? "block"
      : "none";
  }

  private _updateConfigValidity(
    text: TextAreaComponent,
    prevWasValid: boolean,
    nextIsValid: boolean
  ): void {
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

  private _updateErrors(): void {
    if (Object.keys(this.plugin.settings.errors).length === 0) {
      this._errors.innerHTML = `None`;
      this._errors.style.color = "green";
    } else {
      this._errors.innerHTML = `Errors: <ul>${Object.keys(
        this.plugin.settings.errors
      )
        .map((k) => `<li><b>${k}</b>: ${this.plugin.settings.errors[k]}</li>`)
        .join("")}</ul>`;
      this._errors.style.color = "var(--text-error)";
    }
  }

  private _updateProfile(): void {
    if (this.plugin.useMobile) {
      this._mobileConfig.nameEl.innerHTML = `Mobile Specific Config&nbsp;<sup style="color: green">(active)</sup>`;
      this._config.nameEl.innerHTML = `Config&nbsp;<sup style="color: gray">(inactive)</sup>`;
    } else {
      this._config.nameEl.innerHTML = `Config&nbsp;<sup style="color: green">(active)</sup>`;
      this._mobileConfig.nameEl.innerHTML = `Mobile Specific Config&nbsp;<sup style="color: gray">(inactive)</sup>`;
    }
  }

  private _updateList(): void {
    const viewRegistry = (this.app as any).viewRegistry;
    if (!viewRegistry || !viewRegistry.viewByType) return;

    this._views.innerHTML = `<ul>${Object.keys(viewRegistry.viewByType)
      .sort((a, b) => {
        const extCountForViewKeyA = this._getExtensionsForView(a).length;
        const extCountForViewKeyB = this._getExtensionsForView(b).length;
        return extCountForViewKeyB - extCountForViewKeyA;
      })
      .map((viewType) => {
        const extensions = this._getExtensionsForView(viewType);
        return `<li>${
          extensions.length > 0
            ? `<b ${_copy()}>${viewType}</b>`
            : `<span ${_copy()} style="color: gray">${viewType}</span>`
        }${
          extensions.length
            ? `: ${extensions
                .sort((a, b) => b.length - a.length)
                .map((ext) =>
                  ext
                    ? `<code ${_copy()}>${ext}</code>`
                    : `<code>""</code> <span style="color: gray"><i>(extensionless)</i></span>`
                )
                .join(", ")}`
            : ``
        }</li>`;
      })
      .join("")}</ul>`;

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

  private _getExtensionsForView(view: string): string[] {
    const viewRegistry = (this.app as any).viewRegistry;
    if (!viewRegistry || !viewRegistry.typeByExtension) return [];
    return Object.entries(viewRegistry.typeByExtension)
      .filter(([, v]) => v === view)
      .map(([ext]) => ext);
  }
}
