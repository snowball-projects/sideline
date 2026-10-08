import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comparePlayer, opponentRoster, missingReportLabel } from "../web/model.mjs";
const fixture = () => JSON.parse(readFileSync(new URL("../web/example.json", import.meta.url)));
const now = Date.parse("2026-09-13T12:00:00Z");
const weekKey = "example-2026-2";

test("coverage requires exact game, season/phase/week key and opponent, not fresh file time", () => {
  for (const mismatch of ["game_id", "week_key", "team"]) {
    const feed = fixture();
    const player = feed.players.find((p) => p.id === "demo-kai");
    const original = comparePlayer(feed, player, weekKey, now);
    feed.reports = [{ ...original.report, [mismatch]: mismatch === "team" ? "BUF" : "different-season-phase-week-game", retrieved_at: new Date(now).toISOString() }];
    const result = comparePlayer(feed, player, weekKey, now);
    assert.equal(result.state, "missing-report");
    assert.equal(result.report, undefined);
    assert.equal(result.entries.length, 0);
    assert.ok(opponentRoster(feed, result, weekKey, now).every((m) => m.injury === null));
    assert.match(result.message, /availability are unknown/);
  }
});

test("week rollover never carries an earlier Out designation into a missing report", () => {
  const feed = fixture();
  const player = feed.players.find((p) => p.id === "demo-kai");
  const earlier = comparePlayer(feed, player, weekKey, now);
  feed.players.push({ ...earlier.entries.find((e) => e.game_status === "Out"), team: earlier.opponent, roster_status: "active" });
  const nextKey = "2026-REG-5";
  feed.weeks.push({ key: nextKey, label: "Week 5", season: 2026, week: 5, starts_at: "2026-10-06T04:00:00Z", ends_at: "2026-10-13T04:00:00Z", byes: [] });
  feed.games.push({ ...earlier.game, id: "week-5-game", week_key: nextKey, kickoff: "2026-10-11T17:00:00Z" });
  const result = comparePlayer(feed, player, nextKey, Date.parse("2026-10-06T15:00:00Z"));
  assert.equal(result.reportNotice, "Week 5 injury report missing from this feed");
  assert.equal(result.state, "missing-report");
  const members = opponentRoster(feed, result, nextKey, now);
  assert.ok(members.length > 0);
  assert.ok(members.every((member) => member.injury === null));
});

test("missing-report wording does not promise Wednesday or pending publication after kickoff", () => {
  const week = { label: "Week 5" };
  const game = { status: "scheduled", kickoff: "2026-10-11T17:00:00Z" };
  for (const time of ["2026-10-06T15:00:00Z", "2026-10-08T15:00:00Z"])
    assert.equal(missingReportLabel(week, game, Date.parse(time)), "Week 5 injury report missing from this feed");
  assert.equal(missingReportLabel(week, game, Date.parse(game.kickoff)), "Week 5 injury report missing from this feed");
  for (const status of ["tbd", "final", "in-progress", "canceled"])
    assert.equal(missingReportLabel(week, { ...game, status }, now), "Week 5 injury report missing from this feed");
  assert.equal(missingReportLabel(week, { ...game, kickoff: null }, now), "Week 5 injury report missing from this feed");
});

test("a partial available report leaves an unmatched roster identity without an inferred healthy entry", () => {
  const feed = fixture();
  const player = feed.players.find((p) => p.id === "demo-kai");
  const result = comparePlayer(feed, player, weekKey, now);
  result.report.coverage = "partial";
  feed.players.push({ id: "unlisted-defender", name: "Unlisted Defender", position: "LB", team: result.opponent, roster_status: "active" });
  const member = opponentRoster(feed, result, weekKey, now).find((m) => m.id === "unlisted-defender");
  assert.equal(member.injury, null);
  assert.equal(member.status.key, "unknown");
  assert.equal(result.report.coverage, "partial");
  assert.equal(result.reportNotice, undefined);
});

test("same-name conflicting report IDs remain separate and never become complete-report omissions", () => {
  const feed = fixture();
  const player = feed.players.find((p) => p.id === "demo-kai");
  const result = comparePlayer(feed, player, weekKey, now);
  result.report.coverage = "complete";
  const entry = result.entries.find((entry) => entry.game_status === "Out");
  feed.players.push({ id: "different-roster-id", name: entry.name, position: entry.position,
    team: result.opponent, roster_status: "active" });
  const members = opponentRoster(feed, result, weekKey, now);
  const roster = members.find((member) => member.id === "different-roster-id");
  assert.equal(roster.injury, null);
  assert.equal(roster.reportIdentityConflict, true);
  assert.equal(roster.status.key, "unknown");
  assert.equal(members.find((member) => member.id === entry.id).injury.game_status, "Out");
  assert.equal(members.filter((member) => member.name === entry.name).length, 2);
});
