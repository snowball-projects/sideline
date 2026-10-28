import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../web/", import.meta.url);
const app = new URL("https://snowball-projects.github.io/sideline/");

test("home-screen metadata and PNG icons stay inside the sideline Pages path", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
  const tags = [...head.matchAll(/<(?:link|meta)\s+([^>]+)>/g)].map((match) =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => attribute.slice(1))),
  );
  const touch = tags.find((tag) => tag.rel === "apple-touch-icon");
  const link = tags.find((tag) => tag.rel === "manifest");
  assert.equal(touch.sizes, "180x180");
  assert.equal(tags.find((tag) => tag.name === "apple-mobile-web-app-title").content, "sideline");
  assert.equal(tags.find((tag) => tag.name === "apple-mobile-web-app-capable").content, "yes");

  const manifestUrl = new URL(link.href, app);
  assert.equal(manifestUrl.pathname, "/sideline/manifest.json");
  const manifest = JSON.parse(await readFile(new URL(link.href, root), "utf8"));
  assert.equal(manifest.name, "sideline");
  assert.equal(manifest.short_name, "sideline");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(new URL(manifest.start_url, manifestUrl).href, app.href);
  assert.equal(new URL(manifest.scope, manifestUrl).href, app.href);
  assert.equal(manifest.theme_color, tags.find((tag) => tag.name === "theme-color").content);
  const css = await readFile(new URL("styles.css", root), "utf8");
  assert.ok(css.includes(`background: ${manifest.background_color};`));
  assert.deepEqual(manifest.icons.map((icon) => [icon.sizes, icon.type]), [
    ["192x192", "image/png"], ["512x512", "image/png"],
  ]);

  for (const [path, size, base] of [
    [touch.href, 180, app],
    ...manifest.icons.map((icon) => [icon.src, Number(icon.sizes.split("x")[0]), manifestUrl]),
  ]) {
    assert.ok(!path.startsWith("/") && !path.includes(":"), `${path} must be relative`);
    const url = new URL(path, base);
    assert.equal(url.origin, app.origin);
    assert.ok(url.pathname.startsWith("/sideline/"), url.href);
    const png = await readFile(new URL(path, root));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }

  const policy = new Map(tags.find((tag) => tag["http-equiv"] === "Content-Security-Policy")
    .content.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }));
  for (const directive of ["manifest-src", "img-src"]) {
    assert.deepEqual(policy.get(directive) ?? policy.get("default-src"), ["'self'"]);
  }
});
