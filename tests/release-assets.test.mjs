import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("browser imports share the release version and belong to the public build allowlist", async () => {
  const root = new URL("../", import.meta.url);
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const build = await readFile(new URL("scripts/build-web.mjs", root), "utf8");
  for (const name of await readdir(new URL("web/", root))) {
    if (!name.endsWith(".mjs") && name !== "index.html") continue;
    const content = await readFile(new URL(`web/${name}`, root), "utf8");
    for (const match of content.matchAll(/(?:\.\/)?([\w-]+\.(?:mjs|css))\?v=([^"']+)/g)) {
      assert.equal(match[2], pkg.version, `${name}: stale ${match[1]} version`);
      assert.ok(build.includes(`"${match[1]}"`), `${match[1]} missing from public allowlist`);
    }
  }
  assert.ok(build.includes('"field.mjs"'));
});
