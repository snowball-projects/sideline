import { cp, mkdir, rm, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url),
  dist = new URL("dist/", root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
// Publication data were checked by the collector. Build only copies files.
for (const file of [
  "index.html",
  "styles.css",
  "app.mjs",
  "field.mjs",
  "icon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "manifest.json",
  "team-logos",
])
  await cp(new URL("web/" + file, root), new URL(file, dist), {
    recursive: true,
  });
try {
  await cp(new URL("web/current.json", root), new URL("current.json", dist));
} catch (error) {
  if (error.code !== "ENOENT" || process.argv.includes("--require-live"))
    throw error;
}
for (const file of ["LICENSE", "THIRD-PARTY-NOTICES.md"])
  await cp(new URL(file, root), new URL(file, dist));
await writeFile(new URL(".nojekyll", dist), "");
console.log("Built static sideline files");
