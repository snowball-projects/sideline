import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  normalize,
  parseCsv,
  sourceDefinitions,
  fetchSource,
  publish,
  rank,
  easternTimestamp,
} from "../scripts/collect.mjs";
import { fixtureInputs, fixture } from "./fixture.mjs";
const now = new Date("2026-09-26T12:00:00Z");
test("CSV quoting, streaming and malformed data", () => {
  assert.deepEqual(parseCsv('a,b\r\n"one,two","three""four"\n'), [
    { a: "one,two", b: 'three"four' },
  ]);
  for (const csv of ["a,a\nx,y", "a,b\nx", 'a,b\n"x,y', 'a,b\n"x"z,y'])
    assert.throws(() => parseCsv(csv));
  const rows = [];
  parseCsv("a,b\nx,y", { onRow: (row) => rows.push(row) });
  assert.equal(rows.length, 1);
});
test("six fixed sources; failed or unexpected downloads fail closed", async () => {
  assert.equal(sourceDefinitions(2026).length, 6);
  await assert.rejects(
    fetchSource({ url: "https://example.com/a" }),
    /Unexpected source/,
  );
  await assert.rejects(
    fetchSource(sourceDefinitions(2026)[0], {
      fetchImpl: async () => new Response("", { status: 404 }),
    }),
    /HTTP 404/,
  );
  await assert.rejects(
    fetchSource(sourceDefinitions(2026)[0], {
      fetchImpl: async () =>
        new Response("", {
          status: 302,
          headers: { location: "https://example.com/a" },
        }),
    }),
    /Unexpected redirect/,
  );
});
test("per-week formation slots retain three receivers and ordered backups, without future charts", () => {
  const feed = fixture(),
    first = feed.weeks[0].teams.ARI;
  assert.equal(
    first.offense.filter((group) => group.position === "WR").length,
    3,
  );
  assert.deepEqual(
    first.offense
      .find((group) => group.position === "QB")
      .players.map((player) => player.order),
    [1, 2],
  );
  assert.equal(
    feed.weeks.find((week) => week.week === 4).teams.ARI.offense.length,
    0,
  );
  assert.equal(feed.weeks.find((week) => week.week === 2).teams.ARI.bye, true);
  assert.equal(
    first.offense.find((group) => group.position === "QB").players[0].injury
      .game,
    "Questionable",
  );
  assert.deepEqual(
    first.offense.find((group) => group.position === "QB").players[0].injury
      .badges,
    ["Q", "LP"],
  );
  assert.equal(
    feed.weeks.find((week) => week.week === 3).teams.ARI.report,
    false,
  );
  assert.equal(
    feed.weeks.find((week) => week.week === 3).teams.ARI.offense[0].players[0]
      .injury,
    null,
  );
});
test("stats use schedule scores, net yards, correct sides, totals and competition rank directions", () => {
  const feed = fixture(),
    first = feed.weeks[0],
    second = feed.weeks.find((week) => week.week === 2),
    stats = second.teams.ARI.stats;
  assert.equal(first.teams.ARI.stats, null);
  assert.equal(first.stats_through, 0);
  assert.equal(second.stats_through, 1);
  assert.deepEqual(
    stats.offense.map((metric) => metric.value),
    [10, 290, 1, 2],
  );
  assert.deepEqual(
    stats.defense.map((metric) => metric.value),
    [20, 292, 0, 1],
  );
  assert.equal(stats.offense[0].rank, 32);
  assert.equal(stats.defense[1].rank, 2);
  assert.equal(stats.offense[2].rank, 1);
  assert.equal(stats.offense[2].tied, true);
  assert.equal(second.teams.ATL.stats.defense[2].rank, 11);
  assert.equal(second.teams.BAL.stats.defense[2].rank, 1);
  assert.deepEqual(rank([9, 9, 8], 8), { rank: 3, tied: false });
  assert.deepEqual(rank([9, 9, 8], 9), { rank: 1, tied: true });
});
test("selected-week records never leak, and incomplete or unsettled prior weeks do not replace completed totals", () => {
  const inputs = fixtureInputs(),
    feed = fixture(),
    second = feed.weeks.find((week) => week.week === 2);
  // Removing a prior game record makes league ranks unavailable, not made up.
  const original = inputs.teamStats.csv;
  inputs.teamStats.csv = original
    .split("\n")
    .filter((_, index) => index !== 1)
    .join("\n");
  assert.equal(
    normalize(inputs, { season: 2026, now }).weeks[1].teams.ARI.stats,
    null,
  );
  inputs.teamStats.csv = original;
  inputs.depth.csv = inputs.depth.csv
    .split("\n")
    .filter((line, index) => index === 0 || line.startsWith('"2026-09-09'))
    .join("\n");
  assert.equal(
    normalize(inputs, { season: 2026, now: new Date("2026-09-11T12:00:00Z") })
      .weeks[1].stats_through,
    0,
  );
  assert.equal(
    feed.weeks.find((week) => week.week === 3).stats_through,
    second.stats_through,
  );
});
test("stars use prior-week tackles, sacks or interceptions, including ties; incomplete player coverage yields none", () => {
  const feed = fixture();
  assert.equal(feed.weeks[0].teams.BAL.defense[0].players[0].star, undefined);
  assert.equal(feed.weeks[1].teams.BAL.defense[0].players[0].star, true);
  const inputs = fixtureInputs();
  inputs.playerStats.csv = inputs.playerStats.csv
    .split("\n")
    .filter((_, i) => i !== 1)
    .join("\n");
  const partial = normalize(inputs, { season: 2026, now });
  assert.ok(
    Object.values(partial.weeks[1].teams).every((team) =>
      team.defense.every((group) =>
        group.players.every((player) => !player.star),
      ),
    ),
  );
});
test("invalid joins and duplicate undated injury or depth records stop publication", () => {
  for (const key of ["teamStats", "injuries", "depth"]) {
    const inputs = fixtureInputs();
    inputs[key].csv += "\n" + inputs[key].csv.split("\n")[1];
    assert.throws(
      () => normalize(inputs, { season: 2026, now }),
      /Duplicate|Conflicting/,
    );
  }
});
test("a failed collection leaves the previous file intact; successful publication is atomic", async () => {
  const dir = await mkdtemp("/tmp/sideline-publish-"),
    output = pathToFileURL(dir + "/current.json");
  await writeFile(output, "previous");
  await assert.rejects(
    publish({
      output,
      collectImpl: async () => {
        throw new Error("unavailable");
      },
    }),
  );
  assert.equal(await readFile(output, "utf8"), "previous");
  await publish({ output, collectImpl: async () => ({ ok: true }) });
  assert.equal(await readFile(output, "utf8"), '{"ok":true}\n');
});
test("Eastern timestamps survive DST and reject invalid dates", () => {
  assert.equal(
    easternTimestamp("2026-09-10", "20:00"),
    "2026-09-11T00:00:00.000Z",
  );
  assert.equal(
    easternTimestamp("2026-12-10", "20:00"),
    "2026-12-11T01:00:00.000Z",
  );
  assert.throws(() => easternTimestamp("2026-02-30", "20:00"));
});
test("before the first report or result, header-only injuries and statistics remain unavailable", () => {
  const inputs = fixtureInputs();
  for (const key of ["injuries", "teamStats", "playerStats"])
    inputs[key].csv = inputs[key].csv.split("\n")[0] + "\n";
  const feed = normalize(inputs, { season: 2026, now });
  assert.ok(
    feed.weeks.every((week) =>
      Object.values(week.teams).every(
        (team) => !team.report && team.stats === null,
      ),
    ),
  );
});
test("a fully scored selected-week game with statistics cannot change that week’s ranks", () => {
  const inputs = fixtureInputs(),
    before = normalize(inputs, { season: 2026, now }).weeks[1].teams.BAL.stats;
  for (const key of ["teamStats", "playerStats"]) {
    const row = inputs[key].csv
      .split("\n")[3]
      .replace('"1",', '"2",')
      .replace("2026_01_BAL_BUF", "2026_02_BAL_BUF");
    inputs[key].csv += "\n" + row;
  }
  inputs.schedule.csv = inputs.schedule.csv.replace(
    /("2026_02_BAL_BUF"[^\n]+),"",""/,
    '$1,"99","98"',
  );
  const after = normalize(inputs, { season: 2026, now }).weeks[1].teams.BAL
    .stats;
  assert.deepEqual(after, before);
});
test("scheduled postseason rounds retain labels and do not create byes for eliminated teams", () => {
  const inputs = fixtureInputs();
  inputs.schedule.csv +=
    '\n"2026_19_ARI_ATL","2026","WC","19","2027-01-14","20:00","ARI","ATL","",""';
  const postseason = normalize(inputs, { season: 2026, now }).weeks.at(-1);
  assert.equal(postseason.label, "Wild card");
  assert.equal(postseason.teams.ARI.opponent, "ATL");
  assert.equal(postseason.teams.BAL.bye, false);
  assert.equal(postseason.teams.BAL.opponent, null);
});
test("an unknown kickoff cannot establish a historical pre-kickoff chart", () => {
  const inputs = fixtureInputs();
  inputs.schedule.csv = inputs.schedule.csv.replace(
    '"20:00","ARI","ATL"',
    '"","ARI","ATL"',
  );
  const first = normalize(inputs, { season: 2026, now }).weeks[0];
  assert.equal(first.teams.ARI.offense.length, 0);
  assert.equal(first.teams.ATL.defense.length, 0);
});
