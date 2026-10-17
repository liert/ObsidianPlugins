/**
 * Normalizes an extension string:
 * - strips leading dots
 * - trims whitespace
 * - converts to lowercase
 */
export function normalizeExtension(ext: string): string {
  if (!ext) return "";
  let clean = ext.trim().toLowerCase();
  while (clean.startsWith(".")) {
    clean = clean.slice(1);
  }
  return clean;
}

/**
 * Normalizes a language identifier:
 * - trims whitespace
 * - converts to lowercase
 * - defaults to 'text' if empty
 */
export function normalizeLanguage(lang: string): string {
  if (!lang) return "text";
  const clean = lang.trim().toLowerCase();
  return clean || "text";
}

/**
 * Builds a markdown string with a dynamically sized code fence to guarantee that
 * any run of backticks inside the content will NEVER close the fence prematurely.
 *
 * Per CommonMark spec (Section 4.5):
 * A backtick code fence is opened by at least 3 backticks and can only be closed
 * by a fence of at least the same number of backticks on a line by itself.
 * By finding the maximum consecutive backticks in content and using max(3, maxBackticks + 1),
 * no run of backticks in the content can ever match or exceed the fence length.
 */
export function buildSafeCodeFenceMarkdown(content: string, language: string): string {
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
  const body = normalized.length === 0 ? "" : (normalized.endsWith("\n") ? normalized : normalized + "\n");
  return `${fence}${cleanLang}\n${body}${fence}\n`;
}

/**
 * Formats a byte size into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
