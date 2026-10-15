import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCsv } from "./source-adapter.mjs";
import { fetchSource } from "./refresh-data.mjs";
import { defenseStatSources, DEFENSE_STATS_TERMS, validateDefenseStats } from "../web/defense-stats.mjs";

export const DEFENSE_STATS_POLICY = Object.freeze({ verified: true, checked_on: "2026-10-15",
  reason: "nflverse-data weekly team and player statistics are published under its CC BY 4.0 grant. sideline selects regular-season game records, computes net yards and combined tackles, joins exact game/team/GSIS identities, and derives pre-week competition ranks. No direct ESPN/NFL scraping or endorsement. See docs/DEFENSE_STATS_REVIEW.md." });
const OUTPUT = new URL("../web/defense-stats.json", import.meta.url);
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const team = (value) => value === "LA" ? "LAR" : value;
function numeric(row, key, min = 0, max = 300, half = false) {
  requireValue(typeof row[key] === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row[key]), `Missing/invalid ${key}`);
  const n = Number(row[key]);
  requireValue(n >= min && n <= max && Number.isInteger(n * (half ? 2 : 1)), `Invalid ${key}`);
  return n;
}
function defensiveCounts(row) {
  return { tackles: numeric(row, "def_tackles_solo") + numeric(row, "def_tackles_with_assist") + numeric(row, "def_tackle_assists"),
    sacks: numeric(row, "def_sacks", 0, 30, true), interceptions: numeric(row, "def_interceptions", 0, 20) };
}
export function normalizeDefenseStats(teamCsv, playerCsv, season, sources, generatedAt) {
  const parse = (csv) => parseCsv(csv, { maxBytes: 12 * 1024 * 1024, maxRows: 40000 }).filter((row) => {
    requireValue(row.season === String(season) && ["REG", "POST"].includes(row.season_type), "Unexpected statistics season/type");
    return row.season_type === "REG";
  });
  const teams = parse(teamCsv).map((row) => ({ game_id: row.game_id, week: numeric(row, "week", 1, 18), team: team(row.team), opponent: team(row.opponent_team),
    net_yards: numeric(row, "passing_yards", -200, 1000) + numeric(row, "rushing_yards", -200, 1000) + numeric(row, "sack_yards_lost", -200, 0),
    ...defensiveCounts(row), takeaways: numeric(row, "def_interceptions", 0, 20) + numeric(row, "fumble_recovery_opp", 0, 20) }));
  const players = parse(playerCsv).map((row) => {
    requireValue(/^(?:[1-9]|1[0-8])$/.test(row.week) && row.game_id?.split("_")[1] === row.week.padStart(2, "0"), "Player statistics week mismatch");
    return { id: "gsis:" + row.player_id, game_id: row.game_id, team: team(row.team), ...defensiveCounts(row) };
  }).filter((row) => row.tackles || row.sacks || row.interceptions);
  return validateDefenseStats({ schema_version: 1, season, generated_at: generatedAt, sources, teams, players }, Date.parse(generatedAt));
}
export async function collectDefenseStats({ season, fetchImpl = fetch, now = () => new Date() } = {}) {
  requireValue(DEFENSE_STATS_POLICY.verified, "Defensive statistics source unreviewed");
  const definitions = defenseStatSources(season);
  const outcomes = await Promise.allSettled(definitions.map((source) => fetchSource(source, { fetchImpl, now, maxBytes: 12 * 1024 * 1024 })));
  const failures = outcomes.flatMap((outcome, index) => outcome.status === "rejected" ? [`${definitions[index].id}: ${outcome.reason.message}`] : []);
  requireValue(!failures.length, failures.join("\n"));
  const inputs = outcomes.map((outcome) => outcome.value);
  return normalizeDefenseStats(inputs[0].csv, inputs[1].csv, season, definitions.map((source, i) => ({ ...source, terms_url: DEFENSE_STATS_TERMS,
    retrieved_at: inputs[i].metadata.retrieved_at, source_updated_at: inputs[i].metadata.source_updated_at })), now().toISOString());
}
export async function refreshDefenseStats({ output = OUTPUT, collect = collectDefenseStats, season } = {}) {
  const pending = new URL("./defense-stats.json.pending", output);
  try {
    const artifact = validateDefenseStats(await collect({ season }));
    requireValue(artifact.season === season, "Unexpected collected season");
    await writeFile(pending, JSON.stringify(artifact) + "\n", { flag: "wx" }); await rename(pending, output);
    return { status: "updated", artifact };
  } catch (error) {
    await rm(pending, { force: true });
    try {
      const artifact = validateDefenseStats(JSON.parse(await readFile(output, "utf8")));
      requireValue(artifact.season === season, "Previous season statistics");
      return { status: "retained", artifact, error: error.message };
    } catch { await rm(output, { force: true }); return { status: "unavailable", error: error.message }; }
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const now = new Date(), season = now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  if (process.argv.slice(2).some((arg) => arg !== "--optional")) throw new Error("Usage: node scripts/defense-stats-data.mjs [--optional]");
  const result = await refreshDefenseStats({ season });
  if (result.error) { console.warn(`Defensive statistics ${result.status}: ${result.error}`); if (!process.argv.includes("--optional")) process.exitCode = 1; }
  console.log(JSON.stringify({ status: result.status, season, team_games: result.artifact?.teams.length, player_games: result.artifact?.players.length }));
}
