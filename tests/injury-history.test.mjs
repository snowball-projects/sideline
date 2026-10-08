import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeInjuryHistory, collectInjuryHistory, refreshInjuryHistory } from "../scripts/injury-history-data.mjs";
import { archivedInjuryRecords, validateInjuryHistory, INJURY_HISTORY_SOURCE } from "../web/injury-history.mjs";
import { ARCHIVE_NOW, archiveCsv, archivePlayers, archiveSource, archiveFixture } from "./fixtures/injury-history.mjs";

test("2025 archive exact-ID joins preserve reported teams, source weeks/body parts/statuses and postseason phase", () => {
  const data = archiveFixture(), records = archivedInjuryRecords(data, "gsis:fixture-out");
  assert.equal(data.players.length, 2);
  assert.deepEqual(records.map((r) => [r.week.label, r.report.team]), [["WC · Week 19", "NYJ"], ["Week 5", "NYJ"], ["Week 1", "TEN"]]);
  assert.equal(records.at(-1).entry.injury, "Ankle; Wrist");
  assert.equal(records.at(-1).entry.practice_status, "Limited Participation in Practice");
  assert.equal(records[1].entry.game_status, "Out");
  assert.equal(data.players.find(p => p.id === "gsis:fixture-out").records.at(-1).report_secondary_injury, "Wrist");
  assert.equal(data.players.find(p => p.id === "gsis:fixture-out").records.at(-1).practice_primary_injury, "Ankle");
  assert.deepEqual(archivedInjuryRecords(data, "gsis:wrong-id"), []);
  assert.deepEqual(archivedInjuryRecords(data, "gsis:fixture-qb"), []);
  assert.deepEqual(archivedInjuryRecords(null, "gsis:fixture-out"), []);
  assert.ok(!JSON.stringify(data).includes("Same Name"));
});

test("missing archive rows or status values stay unknown and never imply health, full participation or daily dates", () => {
  const data = archiveFixture(), records = archivedInjuryRecords(data, "gsis:fixture-limited");
  assert.equal(records.length, 1);
  assert.equal(records[0].report.team, "LA");
  assert.equal(records[0].entry.practice_status, "Not listed");
  assert.equal(records[0].entry.game_status, "Not listed");
  assert.deepEqual(archivedInjuryRecords(data, "gsis:unmatched"), []);
  assert.ok(!JSON.stringify(data.players).match(/healthy|practice_date|reported_at|date_modified/i));
  const empty = normalizeInjuryHistory(archiveCsv, [], archiveSource(), ARCHIVE_NOW);
  assert.deepEqual(empty.players, []);
});

test("archive rejects conflicting duplicate observations, malformed phase/week, unexpected seasons and unsupported provenance/claims", () => {
  const normalize = (csv) => normalizeInjuryHistory(csv, archivePlayers, archiveSource(), ARCHIVE_NOW);
  assert.throws(() => normalize(archiveCsv + "\n" + archiveCsv.split("\n")[1]), /duplicate/);
  assert.throws(() => normalize(archiveCsv.replace("2025,REG,1", "2024,REG,1")), /season/);
  assert.throws(() => normalize(archiveCsv.replace("2025,REG,1", "2025,REG,19")), /phase\/week/);
  assert.throws(() => normalize(archiveCsv.replace("2025,WC,19", "2025,WC,20")), /phase\/week/);
  assert.throws(() => normalize("season,gsis_id\n2025,fixture-out"), /columns/);
  for (const mutate of [
    d => { d.season = 2024; }, d => { d.players.push(d.players[0]); },
    d => { d.players[0].records[0].practice_date = "2025-09-03"; },
    d => { d.source.permission = "unverified"; }, d => { d.source.url = "https://example.com/archive"; },
    d => { d.source.source_updated_at = "2026-09-14T00:00:00Z"; },
    d => { d.players[0].records[0].report_primary_injury = "x".repeat(501); },
  ]) { const data = archiveFixture(); mutate(data); assert.throws(() => validateInjuryHistory(data, Date.parse(ARCHIVE_NOW)), /Invalid injury history/); }
});

test("collector makes one fixed bounded 2025 archive request and stores original report evidence only", async () => {
  const requests = [];
  const feed = { mode: "live", players: archivePlayers };
  const data = await collectInjuryHistory({ feed, now: () => new Date(ARCHIVE_NOW), fetchImpl: async url => {
    requests.push(String(url)); return new Response(archiveCsv, { headers: { "last-modified": "Mon, 07 Sep 2026 11:00:00 GMT" } });
  } });
  assert.deepEqual(requests, [INJURY_HISTORY_SOURCE.url]);
  assert.equal(data.players.length, 2);
  assert.equal(data.source.source_updated_at, "2026-09-07T11:00:00.000Z");
  await assert.rejects(() => collectInjuryHistory({ feed, fetchImpl: async () => new Response("", { headers: { "content-length": String(4 * 1024 * 1024 + 1) } }) }), /large|limit/i);
  await assert.rejects(() => collectInjuryHistory({ feed, fetchImpl: async () => new Response("Unavailable", { status: 503 }) }), /503/);
});

test("failed optional archive collection retains only validated facts or omits unsafe leftovers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sideline-injury-archive-"));
  const output = pathToFileURL(join(directory, "injury-history.json"));
  try {
    assert.equal((await refreshInjuryHistory({ output, collect: async () => archiveFixture() })).status, "updated");
    const retained = await refreshInjuryHistory({ output, collect: async () => { throw new Error("Archive source unavailable"); } });
    assert.equal(retained.status, "retained"); assert.equal(retained.artifact.players.length, 2);
    await writeFile(output, '{"season":2025}');
    assert.equal((await refreshInjuryHistory({ output, collect: async () => { throw new Error("Archive source unavailable"); } })).status, "unavailable");
    await assert.rejects(readFile(output), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
