import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// User-authorized local test vault. Only generated plugin files are replaced.
const target = String.raw`G:\Workspace\Obsidian-Company\.obsidian\plugins\technical-evidence`;
await mkdir(target, { recursive: true });
for (const name of ["main.js", "manifest.json", "styles.css"]) {
  const source = new URL(`../release/technical-evidence/${name}`, import.meta.url);
  const destination = join(target, name);
  await copyFile(source, destination);
  if (!(await readFile(source)).equals(await readFile(destination))) throw new Error(`Deployment verification failed: ${name}`);
}
console.log(`Deployed and verified main.js, manifest.json, styles.css in ${target}`);
