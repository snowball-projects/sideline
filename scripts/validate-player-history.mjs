import { TEAMS } from "../web/feed.mjs";
import { PLAYER_HISTORY_WINDOW, PLAYER_HISTORY_TERMS, PLAYER_HISTORY_SOURCES } from "../web/player-history.mjs";
export const MAX_PLAYER_HISTORY_BYTES = 1_000_000;
function requireValue(ok, message) {
  if (!ok) throw new Error("Invalid player history: " + message);
}
function object(value, fields, label) {
  requireValue(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field)), label);
}
function timestamp(value, label, now) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 300000 &&
    new Date(value).toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z"), label);
}

export function validatePlayerHistory(data, now = Date.now()) {
  object(data, ["schema_version", "generated_at", "window", "sources", "players"], "artifact fields");
  requireValue(new TextEncoder().encode(JSON.stringify(data)).byteLength <= MAX_PLAYER_HISTORY_BYTES, "size limit");
  requireValue(data.schema_version === 1 && JSON.stringify(data.window) === JSON.stringify(PLAYER_HISTORY_WINDOW), "version/window");
  timestamp(data.generated_at, "generation time", now);
  requireValue(Array.isArray(data.sources) && data.sources.length === 3, "sources");
  const sourceIds = new Set();
  for (const source of data.sources) {
    object(source, ["id", "label", "url", "terms_url", "permission", "permission_note", "source_updated_at", "retrieved_at"], "source fields");
    const approved = PLAYER_HISTORY_SOURCES.find((entry) => entry.id === source.id);
    requireValue(approved && source.url === approved.url && source.label === approved.label &&
      source.terms_url === PLAYER_HISTORY_TERMS && source.permission === "verified" &&
      typeof source.permission_note === "string" && source.permission_note.length > 0 && source.permission_note.length <= 1000 &&
      !sourceIds.has(source.id), "source provenance");
    sourceIds.add(source.id);
    timestamp(source.retrieved_at, "collection time", now);
    requireValue(Date.parse(source.retrieved_at) <= Date.parse(data.generated_at), "collection after generation");
    if (source.source_updated_at !== null) {
      timestamp(source.source_updated_at, "file update time", now);
      requireValue(Date.parse(source.source_updated_at) <= Date.parse(source.retrieved_at) + 300000, "file update after collection");
    }
  }
  requireValue(Array.isArray(data.players) && data.players.length > 0 && data.players.length <= 6000, "players");
  const ids = new Set();
  for (const player of data.players) {
    object(player, ["id", "rookie_season", "rosters"], "player fields");
    requireValue(typeof player.id === "string" && /^gsis:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(player.id) && player.id.length <= 100 && !ids.has(player.id), "stable player identity");
    ids.add(player.id);
    requireValue(player.rookie_season === null || (Number.isInteger(player.rookie_season) && player.rookie_season >= 1920 && player.rookie_season <= 2026), "rookie season");
    requireValue(Array.isArray(player.rosters) && player.rosters.length <= 128, "roster observations");
    requireValue(player.rookie_season !== null || player.rosters.length > 0, "empty player history");
    const records = new Set();
    for (const record of player.rosters) {
      object(record, ["season", "game_type", "team", "weeks"], "roster fields");
      requireValue(PLAYER_HISTORY_WINDOW.includes(record.season) && ["REG", "POST"].includes(record.game_type) && TEAMS.includes(record.team), "roster season/phase/team");
      const key = `${record.season}:${record.game_type}:${record.team}`;
      requireValue(!records.has(key), "duplicate roster observation");
      records.add(key);
      requireValue(Array.isArray(record.weeks) && record.weeks.length > 0 && record.weeks.length <= 22 &&
        record.weeks.every((week, index) => Number.isInteger(week) && week >= 1 && week <= 22 && (!index || week > record.weeks[index - 1])), "observed weeks");
    }
  }
  return data;
}

