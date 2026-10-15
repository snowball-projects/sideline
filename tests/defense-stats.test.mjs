import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defenseRankings, validateDefenseStats, competitionRank, defenseStatSources } from "../web/defense-stats.mjs";
import { normalizeDefenseStats, refreshDefenseStats, collectDefenseStats } from "../scripts/defense-stats-data.mjs";
import { defenseFixture, STATS_NOW, leaderId } from "./fixtures/defense-stats.mjs";
const now = Date.parse(STATS_NOW);
const rank = (data, feed, week = "2026-REG-2") => defenseRankings(data, feed, week, now);

test("prior weeks rank all 32 defenses, lower net YPG and higher sacks/takeaways, with competition ties", () => {
  const { data, feed } = defenseFixture(), result = rank(data, feed);
  assert.equal(result.available, true); assert.equal(result.teams.size, 32);
  const car = result.teams.get("CAR"), other = data.teams.find((r) => r.game_id === data.teams.find((r) => r.team === "CAR").game_id && r.team !== "CAR");
  assert.equal(car.ypg, other.net_yards); assert.equal(car.games, 1);
  assert.equal(result.teams.get("ARI").ranks.sacks, 1);
  assert.equal(result.teams.get("ATL").ranks.sacks, 1);
  assert.equal(result.teams.get("BAL").ranks.sacks, 3);
  assert.equal(result.teams.get("ATL").ranks.ypg, 1);
  assert.equal(result.teams.get("ARI").ranks.ypg, 2);
  assert.equal(result.throughWeek, 1);
});

test("stars include multiple positive categories and every tied rank 10, never zero or current roster-only ranks", () => {
  const { data, feed } = defenseFixture(), result = rank(data, feed);
  assert.equal(result.playerCoverage, true);
  assert.equal(result.leaders.get(leaderId).categories.length, 3);
  const rows = Array.from({ length: 9 }, (_, i) => ({ value: 20 - i })).concat([{ value: 5 }, { value: 5 }, { value: 4 }]);
  assert.equal(competitionRank(rows, "value", 5), 10);
  assert.equal(competitionRank(rows, "value", 4), 12);
  // All players tie at rank 1 on zero, but no positive event means no star.
  for (const row of data.players) row.interceptions = 0;
  for (const row of data.teams) row.interceptions = 0;
  assert.ok([...rank(data, feed).leaders.values()].every((r) => r.categories.every((c) => c.key !== "interceptions")));
});

test("week 1, postseason, wrong season, fictional data, missing/partial league schedule and unknown kickoffs stay unavailable", () => {
  const { data, feed } = defenseFixture();
  assert.equal(rank(data, feed, "2026-REG-1").available, false);
  for (const mutate of [f => {f.mode = "example";}, f => {f.schedule.coverage = "partial";}, f => {f.weeks.shift();}, f => {f.games[0].kickoff = null;}, f => {f.weeks[1].season = 2027;}]) {
    const next = structuredClone(feed); mutate(next); assert.equal(rank(data, next).available, false);
  }
});

test("selected-week and future results never affect header or stars; incomplete prior games fail closed", () => {
  const { data, feed } = defenseFixture(), before = rank(data, feed);
  const future = structuredClone(data);
  for (const row of data.teams) future.teams.push({ ...row, week: 2, game_id: row.game_id.replace("_01_", "_02_"), sacks: 29 });
  for (const row of data.players) future.players.push({ ...row, game_id: row.game_id.replace("_01_", "_02_") });
  assert.deepEqual(rank(future, feed), before);
  data.teams.pop(); assert.equal(rank(data, feed).available, false);
});

test("24h settlement guard and unknown current kickoff do not rank partial games", () => {
  const { data, feed } = defenseFixture();
  feed.games[0].kickoff = "2026-09-13T01:00:00Z";
  assert.equal(rank(data, feed).available, false);
  feed.games[0].kickoff = "2026-09-06T17:00:00Z";
  feed.games.at(-1).kickoff = null; assert.equal(rank(data, feed).available, false);
});

test("missing individual events suppress all stars while complete team ranks remain usable", () => {
  const { data, feed } = defenseFixture(); data.players.shift();
  const result = rank(data, feed);
  assert.equal(result.available, true); assert.equal(result.playerCoverage, false); assert.equal(result.leaders.size, 0);
});

test("GSIS identity sums across recorded teams after trades without name/team matching", () => {
  const { data, feed } = defenseFixture();
  // Same player had a different team in a second prior week.
  feed.weeks.push({ key: "2026-REG-3", season: 2026, week: 3 });
  feed.games.at(-1).week_key = "2026-REG-3";
  const old = data.players.find(r => r.id === leaderId);
  const additional = data.teams.slice(0, 2).map(r => ({ ...r, week: 2, game_id: r.game_id.replace("_01_", "_02_") }));
  data.teams.push(...additional);
  const second = data.players.slice(0, 4).map(r => ({ ...r, game_id: r.game_id.replace("_01_", "_02_") }));
  second[0].id = leaderId; data.players.push(...second);
  feed.games.splice(-1, 0, { ...feed.games[0], id: additional[0].game_id, week_key: "2026-REG-2" });
  const result = rank(data, feed, "2026-REG-3");
  assert.deepEqual(result.leaders.get(leaderId).teams, ["ARI", "CAR"]);
  assert.equal(result.leaders.get(leaderId).categories.find(r => r.key === "tackles").value, old.tackles + second[0].tackles);
  assert.equal(result.teams.get("ARI").games, 2);
  assert.equal(result.teams.get("CAR").games, 1);
  assert.equal(result.teams.get("ARI").ypg, data.teams.find(r => r.team === "ATL").net_yards);
});

test("strict artifact validation rejects duplicate identities, source drift, unpaired games, malformed totals and future vintage", () => {
  const { data } = defenseFixture();
  for (const mutate of [d => d.players.push(d.players[0]), d => {d.sources[0].url += '?x';}, d => d.teams.pop(), d => {d.teams[0].sacks = 1.1;}, d => {d.sources[0].retrieved_at = '2027-01-01T00:00:00Z';}, d => {d.players[0].id = 'name:somebody';}]) {
    const next = structuredClone(data); mutate(next); assert.throws(() => validateDefenseStats(next, now));
  }
});

test("source normalizer uses signed sack yards, opponent recoveries and all tackle credits, with no blank-to-zero", () => {
  const { data } = defenseFixture();
  const base = "season,season_type,week,game_id,team,opponent_team,passing_yards,rushing_yards,sack_yards_lost,def_tackles_solo,def_tackles_with_assist,def_tackle_assists,def_sacks,def_interceptions,fumble_recovery_opp";
  const rows = ["2026,REG,1,2026_01_ATL_ARI,ARI,ATL,250,100,-20,30,2,20,2,1,2", "2026,REG,1,2026_01_ATL_ARI,ATL,ARI,200,100,-15,25,1,20,1,0,1"];
  const players = "season,season_type,week,game_id,team,player_id,def_tackles_solo,def_tackles_with_assist,def_tackle_assists,def_sacks,def_interceptions\n2026,REG,1,2026_01_ATL_ARI,ARI,00-0099000,3,1,4,0.5,1";
  const artifact = normalizeDefenseStats([base, ...rows].join('\n'), players, 2026, data.sources, STATS_NOW);
  assert.equal(artifact.teams[0].net_yards, 330); assert.equal(artifact.teams[0].takeaways, 3);
  assert.equal(artifact.players[0].tackles, 8); assert.equal(artifact.players[0].sacks, 0.5);
  assert.throws(() => normalizeDefenseStats([base, ...rows].join('\n').replace(',-20,', ',,').replace(',2,1,2', ',2,1,2'), players, 2026, data.sources, STATS_NOW));
});

test("optional collection is bounded, fails without immediate retries, retains only valid same-season data", async (t) => {
  let calls = 0;
  await assert.rejects(collectDefenseStats({ season: 2026, fetchImpl: async () => { calls++; return new Response('', { status: 503 }); } }));
  assert.equal(calls, 2);
  const directory = await mkdtemp(join(tmpdir(), 'sideline-defense-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const output = new URL(`file://${directory}/defense-stats.json`), { data } = defenseFixture();
  const collect = async () => {throw new Error('offline');};
  await writeFile(output, JSON.stringify(data));
  assert.equal((await refreshDefenseStats({ output, collect, season: 2026 })).status, 'retained');
  assert.equal((await refreshDefenseStats({ output, collect, season: 2027 })).status, 'unavailable');
  await assert.rejects(access(output));
  assert.equal((await refreshDefenseStats({ output, collect: async () => data, season: 2026 })).status, 'updated');
  assert.deepEqual(JSON.parse(await readFile(output,'utf8')), data);
  assert.equal(defenseStatSources(2026).length, 2);
});

test("all players tied at tenth are starred, including more than ten qualifying identities", () => {
  const {data, feed} = defenseFixture();
  data.players.forEach((row, index) => { row.tackles = index < 9 ? 50 - index : 5; });
  data.teams.forEach(row => { row.tackles = data.players.filter(p => p.game_id === row.game_id && p.team === row.team).reduce((sum,p) => sum+p.tackles, 0); });
  const result = rank(data, feed);
  const tenth = [...result.leaders.values()].flatMap(row => row.categories.filter(c => c.key === 'tackles' && c.rank === 10));
  assert.equal(tenth.length, data.players.length - 9);
  assert.ok(tenth.every(category => category.tied && category.value === 5));
});
