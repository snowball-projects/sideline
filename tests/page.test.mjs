import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { rows, starters, playerStatus, recordText, sortTeams } from "../web/field.mjs";
import { fixture } from "./fixture.mjs";
test("field places every supported starter once, with scrimmage-adjacent players last", () => {
  const team = fixture().weeks[0].teams.ARI;
  for (const side of ["offense", "defense"])
    assert.deepEqual(rows(team[side], side).flat().map((group) => group.slot).sort((a,b) => a-b), starters(team[side], side).map((group) => group.slot).sort((a,b) => a-b));
  assert.deepEqual(rows(team.offense, "offense")[0].map((group) => group.position), ["QB", "RB"]);
  assert.deepEqual(rows(team.defense, "defense").map((row) => row[0]?.position), [undefined, "MLB", "LCB"]);
  assert.equal(starters([...team.offense, {position: "FB"}], "offense").length, 11);
});
test("depth slots place TE at scrimmage, safeties deep, nickel inside corners, and source holes stay unavailable", () => {
  const slot = (position, index) => ({ position, slot: index + 1, players: [{ name: position }] });
  const offense = ["WR", "WR", "LT", "LG", "C", "RG", "RT", "WR", "QB", "TE", "RB"].map(slot);
  const attacking = rows(offense, "offense");
  assert.deepEqual(attacking[1].map((group) => group.slot), [1, 2, 8]);
  assert.deepEqual(attacking[2].map((group) => group.position), ["LT", "LG", "C", "RG", "RT", "TE"]);
  const defense = ["LDE", "NT", "RDE", "WLB", "LILB", "RILB", "SLB", "LCB", "SS", "FS", "RCB", "NB"].map(slot);
  const defending = rows(defense, "defense");
  assert.deepEqual(defending[0].map((group) => group.position), ["SS", "FS"]);
  assert.deepEqual(defending[1].map((group) => group.position), ["WLB", "LILB", "RILB", "SLB", "NB"]);
  assert.deepEqual(defending[2].map((group) => group.position), ["LCB", "LDE", "NT", "RDE", "RCB"]);
  const missing = rows(defense.filter((group) => group.slot !== 2), "defense").flat().find((group) => group.slot === 2);
  assert.equal(missing.position, "Slot 2");
  assert.equal(missing.unavailable, true);
  assert.equal(missing.players, undefined);
  assert.deepEqual(rows([], "defense"), [[], [], []]);
});
test("severity respects game statuses before practice; missing reports remain unknown", () => {
  assert.deepEqual(playerStatus({injury: {badges: ["LP", "OUT"]}}, true), {status: "out", label: "Out"});
  assert.equal(playerStatus({injury: {badges: ["DNP", "Q"]}}, true).status, "questionable");
  assert.equal(playerStatus({}, false).status, "unknown");
  assert.equal(playerStatus({}, true).label, "No injury listed");
  assert.equal(playerStatus({injury:{injury:"Ankle",game:"Not listed",practice:"Full Participation in Practice",badges:[]}},true).label,"Full participation · No game designation");
});
test("record, selected-unit rank and Out sorts honor ties and unavailable data", () => {
  const metric = (rank) => Array.from({length:4}, () => ({rank}));
  const team = (wins, losses, ties, rank, out = false) => ({record: {wins,losses,ties}, stats: {offense:metric(rank), defense:metric(4-rank)}, offense:[{position:"QB", players:[{injury: out ? {badges:["OUT"]} : null}]}], defense:[], report:true});
  const week = {teams: {ARI:team(2,1,1,3), ATL:team(3,1,0,2), BAL:team(1,1,0,1,true)}};
  assert.deepEqual(sortTeams(Object.keys(week.teams),week,"offense","record"),["ATL","ARI","BAL"]);
  assert.deepEqual(sortTeams(Object.keys(week.teams),week,"offense","stat-0"),["BAL","ATL","ARI"]);
  assert.deepEqual(sortTeams(Object.keys(week.teams),week,"defense","stat-0"),["ARI","ATL","BAL"]);
  assert.equal(sortTeams(Object.keys(week.teams),week,"offense","out")[0],"BAL");
  assert.equal(recordText({wins:2,losses:1,ties:1}),"2-1-1");
  assert.equal(recordText(null),"Record unavailable");
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
