import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCsv } from "./source-adapter.mjs";
import { fetchSource } from "./refresh-data.mjs";
import { parseFeed, TEAMS } from "../web/feed.mjs";
import { DEFENSIVE_POSITIONS } from "../web/model.mjs";
import { PLAYER_HISTORY_SOURCES, PLAYER_HISTORY_WINDOW, PLAYER_HISTORY_TERMS, validatePlayerHistory } from "../web/player-history.mjs";

export const PLAYER_HISTORY_POLICY = Object.freeze({
  verified: true, checked_on: "2026-10-08",
  reason: "nflverse-data releases player-reference and weekly roster data under CC BY 4.0. sideline joins explicit rookie seasons and 2025/2026 roster observations by GSIS ID, excluding cut/free-agent/retired observations. Observed weeks do not establish uninterrupted tenure or games played. Only these fields are selected; photos, third-party ratings and reference draft fields are excluded. See docs/DATA_SOURCES.md.",
});
const OUTPUT = new URL("../web/player-history.json", import.meta.url);
const clean = (value) => String(value ?? "").trim();
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function columns(rows, fields, label) {
  requireValue(rows.length > 0 && fields.every((field) => Object.hasOwn(rows[0], field)), `${label} missing required columns/rows.`);
}

export function normalizePlayerHistory(referenceCsv, rosterCsvs, currentPlayers, sources, generatedAt) {
  const ids = new Set(currentPlayers.filter((player) => DEFENSIVE_POSITIONS.has(player.position) && player.id.startsWith("gsis:")).map((player) => player.id));
  const players = new Map();
  const ensure = (id) => {
    if (!players.has(id)) players.set(id, { id, rookie_season: null, rosters: new Map() });
    return players.get(id);
  };
  const reference = parseCsv(referenceCsv, { maxBytes: 20 * 1024 * 1024, maxRows: 40000 });
  columns(reference, ["gsis_id", "rookie_season"], "Player reference");
  const seen = new Set();
  for (const row of reference) {
    const rawId = clean(row.gsis_id);
    if (!rawId || rawId === "NA") continue;
    requireValue(!seen.has(rawId), "Duplicate player-reference GSIS identity.");
    seen.add(rawId);
    const id = "gsis:" + rawId;
    if (!ids.has(id)) continue;
    const value = clean(row.rookie_season);
    if (!value || value === "NA") continue;
    requireValue(/^\d{4}$/.test(value) && Number(value) >= 1920 && Number(value) <= 2026, "Invalid explicit rookie season.");
    ensure(id).rookie_season = Number(value);
  }
  for (const season of PLAYER_HISTORY_WINDOW) {
    const rows = parseCsv(rosterCsvs[season], { maxBytes: 20 * 1024 * 1024, maxRows: 100000 });
    columns(rows, ["season", "team", "week", "game_type", "gsis_id", "status"], "Weekly roster");
    for (const row of rows) {
      requireValue(clean(row.season) === String(season), "Unexpected weekly roster season.");
      const id = "gsis:" + clean(row.gsis_id);
      if (!ids.has(id) || ["CUT", "RET", "UFA", "FA"].includes(clean(row.status).toUpperCase())) continue;
      const gameType = clean(row.game_type);
      if (!["REG", "POST"].includes(gameType)) continue;
      const team = clean(row.team) === "LA" ? "LAR" : clean(row.team);
      requireValue(TEAMS.includes(team), "Invalid observed roster team.");
      requireValue(/^(?:[1-9]|1\d|2[0-2])$/.test(clean(row.week)), "Invalid observed roster week.");
      const player = ensure(id), key = `${season}:${gameType}:${team}`;
      if (!player.rosters.has(key)) player.rosters.set(key, { season, game_type: gameType, team, weeks: new Set() });
      player.rosters.get(key).weeks.add(Number(row.week));
    }
  }
  return validatePlayerHistory({
    schema_version: 1, generated_at: generatedAt, window: [...PLAYER_HISTORY_WINDOW], sources,
    players: [...players.values()].map((player) => ({
      ...player, rosters: [...player.rosters.values()].map((record) => ({ ...record, weeks: [...record.weeks].sort((a, b) => a - b) }))
        .sort((a, b) => b.season - a.season || a.weeks[0] - b.weeks[0] || a.team.localeCompare(b.team) || a.game_type.localeCompare(b.game_type)),
    })).sort((a, b) => a.id.localeCompare(b.id)),
  }, Date.parse(generatedAt));
}

export async function collectPlayerHistory({ feed, fetchImpl = fetch, now = () => new Date() } = {}) {
  requireValue(PLAYER_HISTORY_POLICY.verified && feed.mode === "live", "Player history requires reviewed live data.");
  const outcomes = await Promise.allSettled(PLAYER_HISTORY_SOURCES.map((source) => fetchSource({ ...source, key: source.id }, { fetchImpl, now, maxBytes: 4 * 1024 * 1024 })));
  const failures = outcomes.flatMap((result, index) => result.status === "rejected" ? [`${PLAYER_HISTORY_SOURCES[index].id}: ${result.reason.message}`] : []);
  if (failures.length) throw new Error(failures.join("\n"));
  const inputs = outcomes.map((result) => result.value);
  return normalizePlayerHistory(inputs[0].csv, { 2025: inputs[1].csv, 2026: inputs[2].csv }, feed.players,
    PLAYER_HISTORY_SOURCES.map((source, index) => ({ ...source, terms_url: PLAYER_HISTORY_TERMS, permission: "verified", permission_note: PLAYER_HISTORY_POLICY.reason,
      source_updated_at: inputs[index].metadata.source_updated_at, retrieved_at: inputs[index].metadata.retrieved_at })), now().toISOString());
}

export async function refreshPlayerHistory({ output = OUTPUT, collect } = {}) {
  const temporary = new URL("./player-history.json.pending", output);
  try {
    const artifact = validatePlayerHistory(await collect());
    await writeFile(temporary, JSON.stringify(artifact) + "\n", { flag: "wx" });
    await rename(temporary, output);
    return { status: "updated", artifact };
  } catch (error) {
    await rm(temporary, { force: true });
    try {
      const artifact = validatePlayerHistory(JSON.parse(await readFile(output, "utf8")));
      return { status: "retained", artifact, error: error.message };
    } catch {
      await rm(output, { force: true });
      return { status: "unavailable", error: error.message };
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  requireValue(args.length <= 1 && args.every((arg) => arg === "--optional"), "Usage: node scripts/player-history-data.mjs [--optional]");
  const result = await refreshPlayerHistory({ collect: async () => collectPlayerHistory({ feed: parseFeed(await readFile(new URL("../web/current.json", import.meta.url), "utf8")) }) });
  if (result.error) {
    console.warn(`Player history ${result.status}: ${result.error}`);
    if (!args.includes("--optional")) process.exitCode = 1;
  }
  console.log(JSON.stringify({ status: result.status, generated_at: result.artifact?.generated_at,
    players: result.artifact?.players.length, rookie_seasons: result.artifact?.players.filter((player) => player.rookie_season !== null).length,
    sources: result.artifact?.sources }, null, 2));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  main().catch((error) => { console.error(`Player history failed: ${error.message}`); process.exitCode = 1; });
