/** A fence longer than any run in the content prevents code from escaping its block. */
export function fencedCode(content: string, language = "text"): string {
  const longest = Math.max(2, ...Array.from(content.matchAll(/`+/g), match => match[0].length));
  const fence = "`".repeat(longest + 1);
  const safeLanguage = /^[a-z0-9_+-]+$/i.test(language) ? language : "text";
  return `${fence}${safeLanguage}\n${content}\n${fence}`;
}
