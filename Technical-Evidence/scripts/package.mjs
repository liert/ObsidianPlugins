import { mkdir, readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const folder = new URL(`../release/${manifest.id}/`, import.meta.url);
await mkdir(folder, { recursive: true });
const files = {};
for (const name of ["main.js", "manifest.json", "styles.css"]) {
  const data = await readFile(new URL(`../${name}`, import.meta.url));
  await writeFile(new URL(name, folder), data);
  files[`${manifest.id}/${name}`] = data;
}
await writeFile(new URL(`../release/${manifest.id}-${manifest.version}.zip`, import.meta.url), zipSync(files));
console.log(`Created release/${manifest.id}-${manifest.version}.zip`);
