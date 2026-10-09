import { TEAMS } from "./feed.mjs?v=0.9.6";

export const MAX_INJURY_HISTORY_BYTES = 2_000_000;
export const INJURY_HISTORY_SOURCE = Object.freeze({
  id: "nflverse-injuries-2025", label: "nflverse 2025 injury records",
  url: "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2025.csv",
  terms_url: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",
});
export const INJURY_FIELDS = ["report_primary_injury", "report_secondary_injury", "practice_primary_injury", "practice_secondary_injury", "report_status", "practice_status"];
export function validArchiveWeek(type, week) {
  return Number.isInteger(week) && (type === "REG" ? week >= 1 && week <= 18 : ({ WC: 19, DIV: 20, CON: 21, SB: 22 })[type] === week);
}
const requireValue = (ok, message) => { if (!ok) throw new Error("Invalid injury history: " + message); };
function object(value, fields) {
  requireValue(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key)), "fields");
}
function timestamp(value, now) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 300000 &&
    new Date(value).toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z"), "timestamp");
}
export function validateInjuryHistory(data, now = Date.now()) {
  object(data, ["schema_version", "season", "generated_at", "source", "players"]);
  requireValue(data.schema_version === 1 && data.season === 2025 && JSON.stringify(data).length <= MAX_INJURY_HISTORY_BYTES, "version/season/size");
  timestamp(data.generated_at, now);
  const source = data.source;
  object(source, ["id", "label", "url", "terms_url", "permission", "permission_note", "source_updated_at", "retrieved_at"]);
  requireValue(Object.entries(INJURY_HISTORY_SOURCE).every(([key, value]) => source[key] === value) && source.permission === "verified" &&
    typeof source.permission_note === "string" && source.permission_note.length > 0 && source.permission_note.length <= 1000, "source provenance");
  timestamp(source.retrieved_at, now);
  requireValue(Date.parse(source.retrieved_at) <= Date.parse(data.generated_at), "collection after generation");
  if (source.source_updated_at !== null) {
    timestamp(source.source_updated_at, now);
    requireValue(Date.parse(source.source_updated_at) <= Date.parse(source.retrieved_at) + 300000, "file update after collection");
  }
  requireValue(Array.isArray(data.players) && data.players.length <= 6000, "players");
  const ids = new Set(); let count = 0;
  for (const player of data.players) {
    object(player, ["id", "records"]);
    requireValue(typeof player.id === "string" && /^gsis:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(player.id) && player.id.length <= 100 && !ids.has(player.id), "identity");
    ids.add(player.id);
    requireValue(Array.isArray(player.records) && player.records.length > 0 && player.records.length <= 64, "records");
    const keys = new Set();
    for (const record of player.records) {
      object(record, ["game_type", "week", "team", ...INJURY_FIELDS]);
      requireValue((TEAMS.includes(record.team) || record.team === "LA") && validArchiveWeek(record.game_type, record.week), "team/phase/week");
      const key = `${record.game_type}:${record.week}:${record.team}`;
      requireValue(!keys.has(key), "duplicate observation"); keys.add(key);
      requireValue(INJURY_FIELDS.every((field) => record[field] === null || (typeof record[field] === "string" && record[field].length > 0 && record[field].length <= 500 && record[field].trim() === record[field])), "original report text");
      count++;
    }
  }
  requireValue(count <= 20000, "record limit");
  return data;
}
export function archivedInjuryRecords(data, playerId) {
  return (data?.players.find((player) => player.id === playerId)?.records || []).map((record) => ({
    week: { season: 2025, key: `2025-${record.game_type}-${record.week}`, label: (record.game_type === "REG" ? "" : record.game_type + " · ") + "Week " + record.week },
    report: { team: record.team },
    entry: {
      injury: [...new Set(INJURY_FIELDS.slice(0, 4).map((key) => record[key]).filter(Boolean))].join("; ") || "Not specified",
      practice_status: record.practice_status || "Not listed", game_status: record.report_status || "Not listed",
    },
  })).sort((a, b) => Number(b.week.key.split("-").at(-1)) - Number(a.week.key.split("-").at(-1)) || a.report.team.localeCompare(b.report.team));
}
