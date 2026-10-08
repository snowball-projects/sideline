import { TEAMS } from "./feed.mjs?v=0.9.4";

export const MAX_PLAYER_HISTORY_BYTES = 1_000_000;
export const PLAYER_HISTORY_WINDOW = [2025, 2026];
export const PLAYER_HISTORY_TERMS = "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
export const PLAYER_HISTORY_SOURCES = [
  { id: "nflverse-player-reference", label: "nflverse player reference", url: "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv.gz" },
  ...PLAYER_HISTORY_WINDOW.map((season) => ({
    id: `nflverse-weekly-roster-${season}`, label: `nflverse ${season} weekly rosters`,
    url: `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv.gz`,
  })),
];

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
  requireValue(JSON.stringify(data).length <= MAX_PLAYER_HISTORY_BYTES, "size limit");
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

export function playerHistoryFor(data, id) {
  return data?.players.find((player) => player.id === id) || null;
}

export function observedWeeksLabel(weeks) {
  const ranges = [];
  for (const week of weeks) {
    const last = ranges.at(-1);
    if (last && week === last[1] + 1) last[1] = week;
    else ranges.push([week, week]);
  }
  return ranges.map(([start, end]) => "W" + start + (start === end ? "" : "–" + end)).join(", ");
}
