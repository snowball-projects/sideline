import test from "node:test";
import assert from "node:assert/strict";
import { normalize, parseCsv, TEAMS } from "../scripts/collect.mjs";
import { fixtureInputs } from "./fixture.mjs";

const now = new Date("2026-09-26T12:00:00Z");
const defensive = ["def_tackles_solo", "def_tackles_with_assist", "def_tackle_assists", "def_sacks", "def_interceptions"];
const offensive = ["passing_yards", "passing_tds", "rushing_yards", "rushing_tds", "receiving_yards", "receiving_tds"];
function writeRows(inputs, key, rows) {
  const fields = Object.keys(rows[0]);
  const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
  inputs[key].csv = fields.join(",") + "\n" + rows.map(row => fields.map(field => quote(row[field])).join(",")).join("\n");
}
function production(inputs, id, position, values = {}, team = "ARI") {
  const row = parseCsv(inputs.playerStats.csv).find(row => row.team === team && +row.week === 1);
  return {...row, player_id:id, position, ...Object.fromEntries([...defensive, ...offensive].map(key => [key, 0])), ...values};
}
function group(inputs, {position, slot, players, side = "offense", team = "ARI"}) {
  const rows = parseCsv(inputs.depth.csv), template = rows[0], dt = "2026-09-16T12:00:00Z";
  const pos_grp = side === "offense" ? "3WR 1TE" : "Base 4-3 D";
  const kept = rows.filter(row => !(row.team === team && row.dt === dt && row.pos_grp === pos_grp && +row.pos_slot === slot));
  for (const [id, order] of players) kept.push({...template, dt, team, pos_grp, pos_abb:position, pos_slot:slot, pos_rank:order, gsis_id:id, player_name:id});
  writeRows(inputs, "depth", kept);
}
function feed(inputs, at = now) { return normalize(inputs, {season:2026, now:at}); }
function depth(feed, {week = 2, team = "ARI", side = "offense", slot = 1} = {}) {
  return feed.weeks.find(entry => entry.week === week).teams[team][side].find(entry => entry.slot === slot);
}
function metric(player, key, value, rank, {star = false, tied = false} = {}) {
  assert.ok(player.stats, player.id + " has tracked stats");
  assert.equal(player.stats[key]?.value, value, key + " value");
  assert.equal(player.stats[key]?.rank, rank, key + " rank");
  assert.equal(Boolean(player.stats[key]?.star), star, key + " star");
  assert.equal(Boolean(player.stats[key]?.tied), tied, key + " tied");
}

test("starter offensive stats use independent position pools and include all ranked competitors", () => {
  const inputs = fixtureInputs(), rows = parseCsv(inputs.playerStats.csv);
  const kinds = {QB:"passing", RB:"rushing", WR:"receiving", TE:"receiving"};
  for (const [position, kind] of Object.entries(kinds)) {
    for (let index = 0; index < 13; index++) {
      let yards = position === "TE" ? 13 - index : 500 - index;
      if (index === 10) yards = position === "TE" ? 4 : 491;
      rows.push(production(inputs, position + index, position, {[kind + "_yards"]:yards, [kind + "_tds"]:index === 12 ? 1 : 0}));
    }
  }
  writeRows(inputs, "playerStats", rows);
  // Depth order need not start at one, and the input rows need not be sorted.
  group(inputs, {position:"QB", slot:12, players:[["QB12", 7], ["QB10", 2]]});
  group(inputs, {position:"RB", slot:13, players:[["RB11", 1]]});
  group(inputs, {position:"WR", slot:14, players:[["WR12", 1]]});
  group(inputs, {position:"TE", slot:15, players:[["TE10", 1]]});
  const result = feed(inputs), qb = depth(result, {slot:12}).players;
  assert.equal(qb[0].id, "gsis:QB10");
  metric(qb[0], "passing_yards", 491, 10, {star:true, tied:true});
  metric(qb[0], "passing_tds", 0, 2, {tied:true});
  assert.equal(qb[0].star, true);
  assert.equal(qb[1].stats, undefined, "backup production affects league rank but is not published");
  const rb = depth(result, {slot:13}).players[0];
  metric(rb, "rushing_yards", 489, 12);
  metric(rb, "rushing_tds", 0, 2, {tied:true});
  assert.equal(rb.star, undefined);
  const wr = depth(result, {slot:14}).players[0];
  metric(wr, "receiving_yards", 488, 13);
  metric(wr, "receiving_tds", 1, 1, {star:true});
  const te = depth(result, {slot:15}).players[0];
  metric(te, "receiving_yards", 4, 10, {star:true, tied:true});
  assert.deepEqual(Object.keys(te.stats).sort(), ["receiving_tds", "receiving_yards"]);
  for (const team of Object.values(result.weeks[0].teams)) for (const side of ["offense", "defense"])
    for (const entry of team[side]) for (const player of entry.players) assert.equal(player.stats, undefined, "first week has no prior stats");
});

test("signed yards remain stats; zero-only, unsupported positions and backups stay compact", () => {
  const inputs = fixtureInputs(), rows = parseCsv(inputs.playerStats.csv);
  rows.push(production(inputs, "negative", "QB", {passing_yards:-5}));
  rows.push(production(inputs, "positive", "QB", {passing_yards:100, passing_tds:2}));
  rows.push(production(inputs, "zero-rb", "RB", {receiving_yards:40}));
  for (const position of ["LT", "FB", "K", "P"])
    rows.push(production(inputs, position, position, {passing_yards:500, rushing_yards:500, receiving_yards:500}));
  for (const row of rows) if (row.player_id === "def-ARI") for (const key of defensive) row[key] = 0;
  writeRows(inputs, "playerStats", rows);
  const teamRows = parseCsv(inputs.teamStats.csv);
  for (const row of teamRows) if (row.team === "ARI") for (const key of defensive) row[key] = 0;
  writeRows(inputs, "teamStats", teamRows);
  group(inputs, {position:"QB", slot:1, players:[["negative", 2], ["positive", 5]]});
  group(inputs, {position:"RB", slot:12, players:[["zero-rb", 1]]});
  for (const [index, position] of ["LT", "FB", "K", "P"].entries())
    group(inputs, {position, slot:13 + index, players:[[position, 1]]});
  const result = feed(inputs), players = depth(result).players;
  metric(players[0], "passing_yards", -5, 2);
  metric(players[0], "passing_tds", 0, 2);
  assert.equal(players[0].star, undefined);
  assert.equal(players[1].stats, undefined);
  for (const slot of [12, 13, 14, 15, 16]) assert.equal(depth(result, {slot}).players[0].stats, undefined);
  assert.equal(depth(result, {side:"defense"}).players[0].stats, undefined, "all defensive tracked counts zero");
});

function replaceDefensiveCounts(inputs, countForIndex) {
  for (const key of ["teamStats", "playerStats"]) {
    const rows = parseCsv(inputs[key].csv);
    for (const row of rows) {
      if (key === "playerStats" && !row.player_id.startsWith("def-")) continue;
      const [tackles, sacks, interceptions] = countForIndex(TEAMS.indexOf(row.team));
      Object.assign(row, {def_tackles_solo:tackles, def_tackles_with_assist:0, def_tackle_assists:0, def_sacks:sacks, def_interceptions:interceptions});
    }
    writeRows(inputs, key, rows);
  }
}

test("defensive values and fractional sacks retain the original all-row ranking pool", () => {
  const inputs = fixtureInputs();
  replaceDefensiveCounts(inputs, index => index === 0 ? [15, .5, 0] : [1, 1, 1]);
  const rows = parseCsv(inputs.playerStats.csv);
  rows.push(production(inputs, "quarterback", "QB", {passing_yards:300}));
  rows.push(production(inputs, "quarterback-events", "QB", {
    passing_yards:100, def_tackles_solo:20, def_sacks:10, def_interceptions:2,
  }));
  writeRows(inputs, "playerStats", rows);
  const teamRows = parseCsv(inputs.teamStats.csv);
  Object.assign(teamRows.find(row => row.team === "ARI"), {
    def_tackles_solo:35, def_sacks:10.5, def_interceptions:2,
  });
  writeRows(inputs, "teamStats", teamRows);
  const player = depth(feed(inputs), {side:"defense"}).players[0];
  metric(player, "tackles", 15, 2, {star:true});
  metric(player, "sacks", .5, 33);
  metric(player, "interceptions", 0, 33, {tied:true});
  assert.deepEqual(Object.keys(player.stats).sort(), ["interceptions", "sacks", "tackles"]);
  assert.equal(player.star, true);
});

test("defensive starters retain stats and stars with alternate source position codes", () => {
  for (const position of ["WR", "LS", "RB", "NEW_DEF"]) {
    const inputs = fixtureInputs();
    replaceDefensiveCounts(inputs, index => index === 0 ? [15, .5, 1] : [1, 1, 0]);
    const rows = parseCsv(inputs.playerStats.csv);
    rows.find(row => row.player_id === "def-ARI").position = position;
    writeRows(inputs, "playerStats", rows);
    const player = depth(feed(inputs), {side:"defense"}).players[0];
    metric(player, "tackles", 15, 1, {star:true});
    metric(player, "sacks", .5, 32);
    metric(player, "interceptions", 1, 1, {star:true});
    assert.equal(player.star, true, position + " cannot exclude a defensive depth-chart starter");
  }
});

test("every defender tied at tenth retains its earning stat, and zero metrics never earn a star", () => {
  const inputs = fixtureInputs();
  replaceDefensiveCounts(inputs, index => [index === 0 || index === 10 ? 91 : index < 10 ? 101 - index : 100 - index, index === 11 ? .5 : 0, index === 0 ? 0 : 1]);
  const result = feed(inputs), ari = depth(result, {side:"defense"}).players[0];
  metric(ari, "tackles", 91, 10, {star:true, tied:true});
  metric(ari, "sacks", 0, 2, {tied:true});
  metric(ari, "interceptions", 0, 32);
  assert.equal(ari.star, true);
  const tied = depth(result, {side:"defense", team:TEAMS[10]}).players[0];
  metric(tied, "tackles", 91, 10, {star:true, tied:true});
  const sackLeader = depth(result, {side:"defense", team:TEAMS[11]}).players[0];
  metric(sackLeader, "sacks", .5, 1, {star:true});
});

test("unreconciled defensive coverage omits defensive stats without hiding independent offensive stats", () => {
  const inputs = fixtureInputs(), rows = parseCsv(inputs.playerStats.csv);
  rows.shift();
  rows.push(production(inputs, "qb-ARI", "QB", {passing_yards:200, passing_tds:1}));
  writeRows(inputs, "playerStats", rows);
  const result = feed(inputs);
  for (const team of Object.values(result.weeks[1].teams)) for (const entry of team.defense)
    for (const player of entry.players) assert.equal(player.stats, undefined);
  metric(depth(result).players[0], "passing_yards", 200, 1, {star:true});
});

function completeWeekTwo(inputs) {
  const schedule = parseCsv(inputs.schedule.csv), games = schedule.filter(row => +row.week === 2);
  for (const game of games) Object.assign(game, {away_score:20, home_score:10});
  writeRows(inputs, "schedule", schedule);
  for (const key of ["teamStats", "playerStats"]) {
    const rows = parseCsv(inputs[key].csv), additions = [];
    for (const game of games) for (const row of rows.filter(row => [game.away_team, game.home_team].includes(row.team))) {
      const copy = {...row, week:2, game_id:game.game_id};
      if (key === "playerStats" && row.player_id === "qb-BAL") Object.assign(copy, {passing_yards:50, passing_tds:2});
      additions.push(copy);
    }
    writeRows(inputs, key, [...rows, ...additions]);
  }
}

test("published sums stop at complete prior weeks, excluding selected-week and unsettled production", () => {
  const inputs = fixtureInputs(), rows = parseCsv(inputs.playerStats.csv);
  rows.push(production(inputs, "qb-BAL", "QB", {passing_yards:100, passing_tds:1}, "BAL"));
  writeRows(inputs, "playerStats", rows);
  completeWeekTwo(inputs);
  const result = feed(inputs);
  metric(depth(result, {team:"BAL"}).players[0], "passing_yards", 100, 1, {star:true});
  metric(depth(result, {week:3, team:"BAL"}).players[0], "passing_yards", 150, 1, {star:true});
  metric(depth(result, {week:3, team:"BAL"}).players[0], "passing_tds", 3, 1, {star:true});
  const unsettledInputs = structuredClone(inputs), schedule = parseCsv(unsettledInputs.schedule.csv);
  schedule.find(row => +row.week === 2).gameday = "2026-09-21";
  writeRows(unsettledInputs, "schedule", schedule);
  const charts = parseCsv(unsettledInputs.depth.csv);
  for (const row of charts) if (row.dt === "2026-09-23T12:00:00Z") row.dt = "2026-09-22T06:00:00Z";
  writeRows(unsettledInputs, "depth", charts);
  const unsettled = feed(unsettledInputs, new Date("2026-09-22T12:00:00Z"));
  metric(depth(unsettled, {week:3, team:"BAL"}).players[0], "passing_yards", 100, 1, {star:true});
  const teamRows = parseCsv(inputs.teamStats.csv), missing = teamRows.findIndex(row => +row.week === 2);
  teamRows.splice(missing, 1); writeRows(inputs, "teamStats", teamRows);
  const partial = feed(inputs);
  metric(depth(partial, {week:3, team:"BAL"}).players[0], "passing_yards", 100, 1, {star:true});
});
