import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { validatePlayerHistory, playerHistoryFor, observedWeeksLabel, PLAYER_HISTORY_SOURCES } from "../web/player-history.mjs";
import { normalizePlayerHistory, collectPlayerHistory, refreshPlayerHistory } from "../scripts/player-history-data.mjs";
import { fetchSource, injuryCoverageAudit } from "../scripts/refresh-data.mjs";
import { HISTORY_NOW, referenceCsv, rosterCsvs, historyPlayers, historySources, historyFixture } from "./fixtures/player-history.mjs";
import { fieldFixture } from "./browser/field-fixture.mjs";

test("rookie seasons come only from explicit exact-ID reference rows, never name, draft or eligibility", () => {
  const data = historyFixture();
  assert.equal(playerHistoryFor(data, "gsis:fixture-a").rookie_season, 2024);
  assert.equal(playerHistoryFor(data, "gsis:fixture-b").rookie_season, null);
  assert.equal(playerHistoryFor(data, "gsis:fixture-d"), null);
  assert.equal(playerHistoryFor(data, "gsis:fixture-qb"), null);
  assert.equal(playerHistoryFor(null, "gsis:fixture-a"), null);
});

test("observed teams preserve transfers, gaps, phases and reserve observations without games-played or tenure claims", () => {
  const data = historyFixture();
  assert.deepEqual(playerHistoryFor(data, "gsis:fixture-a").rosters, [
    { season: 2026, game_type: "REG", team: "NYJ", weeks: [1, 3] },
    { season: 2025, game_type: "REG", team: "TEN", weeks: [1, 2, 4] },
    { season: 2025, game_type: "REG", team: "NYJ", weeks: [5] },
  ]);
  assert.deepEqual(playerHistoryFor(data, "gsis:fixture-c").rosters, [
    { season: 2025, game_type: "POST", team: "PHI", weeks: [19] },
  ]);
  assert.equal(observedWeeksLabel([1, 2, 4, 7, 8]), "W1–2, W4, W7–8");
  assert.equal(observedWeeksLabel([1]), "W1");
  assert.ok(playerHistoryFor(data, "gsis:fixture-b").rosters.every((record) => !["PHI", "CAR"].includes(record.team)));
});

test("duplicate reference IDs, malformed matched values and unexpected roster seasons fail optional normalization", () => {
  const normalize = (ref = referenceCsv, rosters = rosterCsvs) => normalizePlayerHistory(ref, rosters, historyPlayers, historySources(), HISTORY_NOW);
  assert.throws(() => normalize(referenceCsv + "fixture-a,Other,2026,2026\n"), /Duplicate/);
  for (const value of ["2027", "0", "unknown"])
    assert.throws(() => normalize(referenceCsv.replace("Same Name,2024", "Same Name," + value)), /rookie season/);
  assert.throws(() => normalize(referenceCsv, { ...rosterCsvs, 2025: rosterCsvs[2025].replace("2025,TEN,1", "2024,TEN,1") }), /Unexpected/);
  assert.throws(() => normalize(referenceCsv, { ...rosterCsvs, 2026: rosterCsvs[2026].replace("NYJ,1", "NYJ,") }), /roster week/);
  assert.throws(() => normalize("gsis_id,name\nfixture-a,A", rosterCsvs), /columns/);
});

test("artifact validator rejects unsupported claims, unsafe provenance, invalid dates, duplicate/unsorted observations and excessive windows", () => {
  for (const mutate of [
    (data) => { data.players[0].team_tenure = 2; },
    (data) => { data.players[0].rookie_season = 0; },
    (data) => { data.players.push(data.players[0]); },
    (data) => { data.players[0].rosters[0].weeks = [1, 1]; },
    (data) => { data.players[0].rosters[0].weeks = [3, 1]; },
    (data) => { data.players[0].rosters[0].season = 2024; },
    (data) => { data.sources[0].url = "https://example.com/data"; },
    (data) => { data.sources[0].permission = "unverified"; },
    (data) => { data.sources[0].retrieved_at = "2026-02-30T00:00:00Z"; },
    (data) => { data.sources[0].source_updated_at = "2026-09-14T12:00:00Z"; },
    (data) => { data.window = [2024, 2025, 2026]; },
  ]) {
    const data = historyFixture(); mutate(data);
    assert.throws(() => validatePlayerHistory(data, Date.parse(HISTORY_NOW)), /Invalid player history/);
  }
  const missing = historyFixture(); missing.sources[0].source_updated_at = null;
  assert.doesNotThrow(() => validatePlayerHistory(missing, Date.parse(HISTORY_NOW)));
});

test("collector downloads exactly three fixed compressed sources and retains no raw provider content", async () => {
  const requests = [];
  const feed = { mode: "live", players: historyPlayers };
  const csvs = [referenceCsv, rosterCsvs[2025], rosterCsvs[2026]];
  const data = await collectPlayerHistory({ feed, now: () => new Date(HISTORY_NOW), fetchImpl: async (url) => {
    requests.push(String(url));
    const index = PLAYER_HISTORY_SOURCES.findIndex((source) => source.url === String(url));
    return new Response(gzipSync(csvs[index]), { headers: { "content-type": "application/octet-stream", "last-modified": "Sun, 13 Sep 2026 11:00:00 GMT" } });
  } });
  assert.deepEqual(requests.sort(), PLAYER_HISTORY_SOURCES.map((source) => source.url).sort());
  assert.equal(data.players.length, 3);
  assert.ok(!JSON.stringify(data).includes("Same Name"));
  await assert.rejects(() => fetchSource({ ...PLAYER_HISTORY_SOURCES[1], url: PLAYER_HISTORY_SOURCES[1].url.replace("2025", "2024") }), /allowlist/);
  await assert.rejects(() => fetchSource(PLAYER_HISTORY_SOURCES[0], { fetchImpl: async () => new Response("not gzip") }), /gzip|header/i);
  await assert.rejects(() => collectPlayerHistory({ feed, now: () => new Date(HISTORY_NOW),
    fetchImpl: async () => new Response("", { headers: { "content-length": String(4 * 1024 * 1024 + 1) } }),
  }), /large|limit/i);
  await assert.rejects(() => fetchSource(PLAYER_HISTORY_SOURCES[0], {
    fetchImpl: async () => new Response(gzipSync(Buffer.alloc(20 * 1024 * 1024 + 1))),
  }), /large|limit|length|buffer/i);
});

test("optional collection retains only a validated previous artifact and rejects unsafe leftovers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sideline-history-"));
  const output = pathToFileURL(join(directory, "player-history.json"));
  try {
    const artifact = historyFixture();
    assert.equal((await refreshPlayerHistory({ output, collect: async () => artifact })).status, "updated");
    const retained = await refreshPlayerHistory({ output, collect: async () => { throw new Error("Source unavailable"); } });
    assert.equal(retained.status, "retained"); assert.equal(retained.artifact.generated_at, HISTORY_NOW);
    await writeFile(output, '{"schema_version":1}');
    assert.equal((await refreshPlayerHistory({ output, collect: async () => { throw new Error("Source unavailable"); } })).status, "unavailable");
    await assert.rejects(readFile(output), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("coverage audit separates scheduled missing teams, confirmed byes and wrong-game reports without classifying health", () => {
  const feed = fieldFixture();
  feed.weeks[0].byes = ["KC"];
  let audit = injuryCoverageAudit(feed, Date.parse(HISTORY_NOW));
  assert.deepEqual(audit.scheduled_teams, ["BUF", "CAR"]);
  assert.deepEqual(audit.reported_teams, ["CAR"]);
  assert.deepEqual(audit.missing_teams, ["BUF"]);
  assert.deepEqual(audit.confirmed_byes, ["KC"]);
  feed.reports.push({ ...feed.reports[0], game_id: "wrong-game", team: "BUF" });
  assert.deepEqual(injuryCoverageAudit(feed, Date.parse(HISTORY_NOW)).missing_teams, ["BUF"]);
  feed.reports.push({ ...feed.reports[0], team: "BUF", entries: [], coverage: "complete" });
  audit = injuryCoverageAudit(feed, Date.parse(HISTORY_NOW));
  assert.deepEqual(audit.missing_teams, []);
  assert.ok(!JSON.stringify(audit).match(/healthy|available|full participation/i));
  assert.deepEqual(injuryCoverageAudit(feed, Date.parse("2027-01-01T00:00:00Z")), { week_key: null, state: "outside-schedule" });
});
