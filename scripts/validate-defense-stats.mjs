import { TEAMS } from "../web/feed.mjs";
import { DEFENSE_STATS_TERMS } from "../web/defense-stats.mjs";
export const defenseStatSources = (season) => ["team", "player"].map((kind) => ({
  id: `nflverse-defense-${kind}`, label: `nflverse weekly ${kind} statistics`,
  url: `https://github.com/nflverse/nflverse-data/releases/download/stats_${kind}/stats_${kind}_week_${season}.csv`,
}));
export const MAX_DEFENSE_STATS_BYTES = 4_000_000;
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
  assert(new TextEncoder().encode(JSON.stringify(data)).byteLength <= MAX_DEFENSE_STATS_BYTES, "size");
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
