import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { rows, searchTeam, restoreSelections } from "../web/field.mjs";
import { fixture } from "./fixture.mjs";
test("offensive and defensive search destinations follow the selected week and never invent a bye opponent", () => {
  const feed = fixture();
  assert.equal(
    searchTeam({ team: "ARI", position: "QB" }, feed.weeks[0]),
    "ARI",
  );
  assert.equal(
    searchTeam({ team: "ARI", position: "LCB" }, feed.weeks[0]),
    "ATL",
  );
  assert.equal(
    searchTeam({ team: "ARI", position: "LCB" }, feed.weeks[1]),
    null,
  );
  assert.deepEqual(
    restoreSelections(
      [
        { team: "ARI", side: "opponent", unit: "defense" },
        "ARI",
        "ATL",
        "invalid",
      ],
      feed.teams,
    ),
    ["ARI", "ATL"],
  );
  assert.equal(
    restoreSelections(Object.keys(feed.teams), feed.teams).length,
    6,
  );
});
test("every current fixture starter has one field row, in the required field order", () => {
  const team = fixture().weeks[0].teams.ARI;
  for (const side of ["offense", "defense"])
    assert.deepEqual(
      rows(team[side], side)
        .flat()
        .map((group) => group.slot)
        .sort((a, b) => a - b),
      team[side].map((group) => group.slot).sort((a, b) => a - b),
    );
  assert.deepEqual(
    rows(team.offense, "offense")[0].map((group) => group.position),
    ["QB", "RB"],
  );
  assert.deepEqual(
    rows(team.defense, "defense").map((row) => row[0].position),
    ["LDE", "MLB", "LCB"],
  );
});
test("strict CSP, iPhone manifest and existing logo provenance remain intact", async () => {
  const html = await readFile(
    new URL("../web/index.html", import.meta.url),
    "utf8",
  );
  assert.match(
    html,
    /default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'/,
  );
  assert.match(html, /apple-touch-icon[\s\S]*?180x180/);
  assert.match(html, /rel="manifest"/);
  const assets = JSON.parse(
    await readFile(new URL("../web/team-assets.json", import.meta.url), "utf8"),
  );
  assert.equal(Object.keys(assets).length, 32);
  for (const asset of Object.values(assets))
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL("../web/" + asset.url, import.meta.url)))
        .digest("hex"),
      asset.sha256,
    );
  const manifest = JSON.parse(
    await readFile(new URL("../web/manifest.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
});
test("one browser data request, one collector and no removed runtime or validation paths", async () => {
  const app = await readFile(
      new URL("../web/app.mjs", import.meta.url),
      "utf8",
    ),
    build = await readFile(
      new URL("../scripts/build-web.mjs", import.meta.url),
      "utf8",
    );
  assert.equal((app.match(/\bfetch\(/g) || []).length, 1);
  assert.doesNotMatch(
    app,
    /setInterval|ResizeObserver|validate|contributions|coordinator|player-history|injury-history/,
  );
  assert.doesNotMatch(build, /JSON\.parse|validate|example/);
  assert.deepEqual(
    (await readdir(new URL("../scripts/", import.meta.url))).sort(),
    ["build-web.mjs", "collect.mjs", "serve-web.mjs"],
  );
});
