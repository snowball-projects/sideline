import { TEAMS } from "./feed.mjs?v=0.9.12";

export const MAX_DEFENSE_STATS_BYTES = 4_000_000;
export const DEFENSE_STATS_TERMS = "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
export const defenseStatSources = (season) => ["team", "player"].map((kind) => ({
  id: `nflverse-defense-${kind}`, label: `nflverse weekly ${kind} statistics`,
  url: `https://github.com/nflverse/nflverse-data/releases/download/stats_${kind}/stats_${kind}_week_${season}.csv`,
}));
const assert = (ok, message) => { if (!ok) throw new Error("Invalid defensive statistics: " + message); };
const fields = (value, keys) => assert(value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), "fields");
const count = (n, max, half = false) => Number.isFinite(n) && n >= 0 && n <= max && Number.isInteger(n * (half ? 2 : 1));
function timestamp(value, now) {
  assert(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 300000 &&
    new Date(value).toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z"), "timestamp");
}
export function validateDefenseStats(data, now = Date.now()) {
  fields(data, ["schema_version", "season", "generated_at", "sources", "teams", "players"]);
  assert(data.schema_version === 1 && Number.isInteger(data.season) && data.season >= 2026 && data.season <= 2100, "season/version");
  assert(JSON.stringify(data).length <= MAX_DEFENSE_STATS_BYTES, "size");
  timestamp(data.generated_at, now);
  assert(Array.isArray(data.sources) && data.sources.length === 2, "sources");
  for (const [index, source] of data.sources.entries()) {
    fields(source, ["id", "label", "url", "terms_url", "retrieved_at", "source_updated_at"]);
    const expected = defenseStatSources(data.season)[index];
    assert(source.id === expected.id && source.label === expected.label && source.url === expected.url && source.terms_url === DEFENSE_STATS_TERMS, "source provenance");
    timestamp(source.retrieved_at, now);
    assert(Date.parse(source.retrieved_at) <= Date.parse(data.generated_at), "generation before collection");
    if (source.source_updated_at !== null) {
      timestamp(source.source_updated_at, now);
      assert(Date.parse(source.source_updated_at) <= Date.parse(source.retrieved_at) + 300000, "update after collection");
    }
  }
  assert(Array.isArray(data.teams) && data.teams.length > 0 && data.teams.length <= 544 &&
    Array.isArray(data.players) && data.players.length <= 30000, "record bounds");
  const teams = new Map(), players = new Set(), teamWeeks = new Set();
  for (const row of data.teams) {
    fields(row, ["game_id", "week", "team", "opponent", "net_yards", "tackles", "sacks", "interceptions", "takeaways"]);
    assert(Number.isInteger(row.week) && row.week >= 1 && row.week <= 18 && TEAMS.includes(row.team) && TEAMS.includes(row.opponent) && row.team !== row.opponent, "team/week");
    const parts = row.game_id.split("_").map((part) => part === "LA" ? "LAR" : part);
    assert(parts.length === 4 && parts[0] === String(data.season) && parts[1] === String(row.week).padStart(2, "0") &&
      [parts[2], parts[3]].includes(row.team) && [parts[2], parts[3]].includes(row.opponent), "game identity");
    assert(Number.isInteger(row.net_yards) && row.net_yards >= -200 && row.net_yards <= 1500 && count(row.tackles, 300) &&
      count(row.sacks, 30, true) && count(row.interceptions, 20) && count(row.takeaways, 30) && row.takeaways >= row.interceptions, "team totals");
    const key = `${row.game_id}:${row.team}`, weekKey = `${row.week}:${row.team}`;
    assert(!teams.has(key) && !teamWeeks.has(weekKey), "duplicate team game/week");
    teams.set(key, row); teamWeeks.add(weekKey);
  }
  for (const row of data.teams) {
    const other = teams.get(`${row.game_id}:${row.opponent}`);
    assert(other && other.opponent === row.team, "unpaired team game");
  }
  for (const row of data.players) {
    fields(row, ["id", "game_id", "team", "tackles", "sacks", "interceptions"]);
    assert(/^gsis:00-\d{7}$/.test(row.id) && teams.has(`${row.game_id}:${row.team}`), "player identity/game");
    assert(count(row.tackles, 60) && count(row.sacks, 15, true) && count(row.interceptions, 10), "player totals");
    const key = `${row.id}:${row.game_id}`;
    assert(!players.has(key), "duplicate player game"); players.add(key);
  }
  return data;
}
export function competitionRank(records, key, value, lower = false) {
  return 1 + records.filter((row) => lower ? row[key] < value : row[key] > value).length;
}

// Reconstruct the pre-week window, never the selected week's later results.
// A 24h settlement guard avoids using a newly started game's partial totals.
export function defenseRankings(data, feed, weekKey, now = Date.now()) {
  const unavailable = (reason) => ({ available: false, reason, teams: new Map(), leaders: new Map() });
  const week = feed?.weeks.find((entry) => entry.key === weekKey);
  if (!data || feed.mode !== "live" || !week || !week.key.includes("-REG-") || week.season !== data.season)
    return unavailable("Defensive statistics unavailable");
  if (week.week === 1) return unavailable("No prior regular-season games");
  const selectedGames = feed.games.filter((game) => game.week_key === weekKey);
  if (!selectedGames.length || selectedGames.some((game) => !game.kickoff)) return unavailable("Selected-week kickoff unknown");
  const cutoff = Math.min(now, ...selectedGames.map((game) => Date.parse(game.kickoff)));
  if (feed.schedule.coverage !== "complete") return unavailable("League schedule incomplete");
  const previous = feed.weeks.filter((entry) => entry.season === week.season && entry.key.includes("-REG-") && entry.week < week.week);
  if (previous.length !== week.week - 1) return unavailable("Prior-week schedule incomplete");
  const keys = new Set(previous.map((entry) => entry.key));
  const games = feed.games.filter((game) => keys.has(game.week_key));
  if (!games.length || games.some((game) => !game.kickoff || Date.parse(game.kickoff) + 86400000 > cutoff))
    return unavailable("Prior-week games unsettled or kickoff unknown");
  const source = new Map(data.teams.map((row) => [`${row.game_id}:${row.team}`, row]));
  const totals = new Map(TEAMS.map((team) => [team, { team, games: 0, yards: 0, sacks: 0, takeaways: 0 }]));
  const accepted = new Set();
  for (const game of games) {
    const gameWeek = feed.weeks.find((entry) => entry.key === game.week_key).week;
    for (const team of [game.home, game.away]) {
      const row = source.get(`${game.id}:${team}`), opponent = team === game.home ? game.away : game.home;
      const other = source.get(`${game.id}:${opponent}`);
      if (!row || !other || row.week !== gameWeek || row.opponent !== opponent)
        return unavailable("Prior-week league statistics incomplete");
      const total = totals.get(team);
      total.games++; total.yards += other.net_yards; total.sacks += row.sacks; total.takeaways += row.takeaways;
      accepted.add(`${game.id}:${team}`);
    }
  }
  if ([...totals.values()].some((row) => !row.games)) return unavailable("Prior-week league statistics incomplete");
  const rows = [...totals.values()].map((row) => ({ ...row, ypg: row.yards / row.games }));
  for (const row of rows) {
    row.ranks = Object.fromEntries(["ypg", "sacks", "takeaways"].map((key) => [key, competitionRank(rows, key, row[key], key === "ypg")]));
    row.ties = Object.fromEntries(["ypg", "sacks", "takeaways"].map((key) => [key, rows.filter((other) => other[key] === row[key]).length > 1]));
  }
  const playerTotals = new Map(), reconciliation = new Map();
  for (const row of data.players.filter((record) => accepted.has(`${record.game_id}:${record.team}`))) {
    if (!playerTotals.has(row.id)) playerTotals.set(row.id, { id: row.id, tackles: 0, sacks: 0, interceptions: 0, teams: new Set() });
    const player = playerTotals.get(row.id), key = `${row.game_id}:${row.team}`;
    if (!reconciliation.has(key)) reconciliation.set(key, { tackles: 0, sacks: 0, interceptions: 0 });
    for (const metric of ["tackles", "sacks", "interceptions"]) {
      player[metric] += row[metric]; reconciliation.get(key)[metric] += row[metric];
    }
    player.teams.add(row.team);
  }
  // A partial player file must not create league-wide stars. Reconcile every
  // accepted team-game/category before deriving any individual ranking.
  const playerCoverage = [...accepted].every((key) => ["tackles", "sacks", "interceptions"].every((metric) =>
    (reconciliation.get(key)?.[metric] ?? 0) === source.get(key)[metric]));
  const leaders = new Map(), players = [...playerTotals.values()];
  if (playerCoverage) for (const player of players) {
    const categories = ["tackles", "sacks", "interceptions"].flatMap((key) => {
      const rank = competitionRank(players, key, player[key]);
      return player[key] > 0 && rank <= 10 ? [{ key, value: player[key], rank,
        tied: players.filter((other) => other[key] === player[key]).length > 1 }] : [];
    });
    if (categories.length) leaders.set(player.id, { categories, teams: [...player.teams].sort() });
  }
  return { available: true, throughWeek: week.week - 1, season: week.season, teams: new Map(rows.map((row) => [row.team, row])), leaders, playerCoverage };
}
export const rankLabel = (rank, tied) => (tied ? "T" : "") + "#" + rank;
