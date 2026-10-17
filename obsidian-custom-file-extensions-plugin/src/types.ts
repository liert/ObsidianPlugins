export interface CodeRenderingSettings {
  enabled: boolean;
  extensions: Record<string, string>;
  tabSize: number;
  useTabChar: boolean;
}

export interface CustomFileExtensionsSettings {
  types: Record<string, string[]>;
  configIsValid: boolean;
  errors: Record<string, string>;
  allowMdOverride: boolean;
  mobileSettings: {
    enabled: boolean;
    configIsValid: boolean;
    types?: Record<string, string[]>;
  };
  codeRendering: CodeRenderingSettings;
}

export const CODE_FILE_VIEW_TYPE = "code-file-view";

export const DEFAULT_TYPES: Record<string, string[]> = {
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

export const DEFAULT_CODE_EXTENSIONS: Record<string, string> = {
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

export const DEFAULT_SETTINGS: CustomFileExtensionsSettings = {
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
    extensions: DEFAULT_CODE_EXTENSIONS,
    tabSize: 4,
    useTabChar: false
  }
};
