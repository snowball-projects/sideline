import { CONTRIBUTION_SEASON, CONTRIBUTION_SOURCE, CONTRIBUTION_TERMS, CONTRIBUTION_COUNTS } from "../web/contribution.mjs";
export function contributionSource(season = CONTRIBUTION_SEASON) {
  requireValue([2024, 2025].includes(season), "reviewed season");
  return CONTRIBUTION_SOURCE.replace("2025.csv.gz", season + ".csv.gz");
}
export const MAX_CONTRIBUTION_BYTES = 1_500_000;
const TEAMS = new Set(
  "ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS".split(
    " ",
  ),
);
function requireValue(ok, message) {
  if (!ok) throw new Error(`Invalid contribution data: ${message}`);
}
function object(value, keys, label) {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    label,
  );
  requireValue(
    Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
    `${label} fields`,
  );
}
function integer(value, min, max, label) {
  requireValue(Number.isInteger(value) && value >= min && value <= max, label);
}
function timestamp(value, label, now) {
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      Date.parse(value) <= now + 300_000,
    label,
  );
  // Date.parse normalizes impossible month days, so require canonical UTC input.
  requireValue(
    new Date(value).toISOString().replace(".000Z", "Z") ===
      value.replace(".000Z", "Z"),
    label,
  );
}
function counts(record, label) {
  integer(record.recorded_games, 1, 18, `${label} recorded game rows`);
  for (const key of CONTRIBUTION_COUNTS) {
    const value = record[key];
    requireValue(
      typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= record.recorded_games * 100 &&
        Number.isInteger(value * (key === "sacks" ? 2 : 1)),
      `${label} ${key}`,
    );
  }
}

/** Strict optional artifact boundary. Callers retain their core feed on failure. */
export function validateContributions(data, now = Date.now(), season = CONTRIBUTION_SEASON) {
  const sourceUrl = contributionSource(season);
  requireValue(Number.isFinite(now), "clock");
  object(
    data,
    [
      "schema_version",
      "season",
      "season_type",
      "source",
      "coverage",
      "players",
    ],
    "artifact",
  );
  requireValue(
    data.schema_version === 1 &&
      data.season === season &&
      data.season_type === "REG",
    "reviewed period",
  );
  requireValue(
    new TextEncoder().encode(JSON.stringify(data)).byteLength <= MAX_CONTRIBUTION_BYTES,
    "artifact size",
  );
  object(
    data.source,
    [
      "url",
      "terms_url",
      "permission",
      "permission_note",
      "retrieved_at",
      "source_updated_at",
    ],
    "source",
  );
  const source = data.source;
  requireValue(
    source.url === sourceUrl &&
      source.terms_url === CONTRIBUTION_TERMS &&
      source.permission === "verified",
    "reviewed source",
  );
  requireValue(
    typeof source.permission_note === "string" &&
      source.permission_note.length >= 20 &&
      source.permission_note.length <= 1500,
    "permission note",
  );
  timestamp(source.retrieved_at, "retrieval time", now);
  if (source.source_updated_at !== null)
    timestamp(
      source.source_updated_at,
      "file update time",
      Math.min(now, Date.parse(source.retrieved_at)),
    );
  object(
    data.coverage,
    ["status", "teams", "game_count", "record_count", "player_count"],
    "coverage",
  );
  const coverage = data.coverage;
  requireValue(
    coverage.status === "partial",
    "independent completeness is not established",
  );
  requireValue(
    Array.isArray(coverage.teams) &&
      coverage.teams.length > 0 &&
      coverage.teams.length <= 32 &&
      new Set(coverage.teams).size === coverage.teams.length &&
      coverage.teams.every((team) => TEAMS.has(team)),
    "covered teams",
  );
  integer(coverage.game_count, 1, 300, "covered games");
  integer(coverage.record_count, 1, 40_000, "covered defensive stat rows");
  integer(coverage.player_count, 1, 3000, "covered players");
  requireValue(
    Array.isArray(data.players) &&
      data.players.length === coverage.player_count,
    "player coverage",
  );
  const ids = new Set(),
    teams = new Set();
  let records = 0;
  for (const player of data.players) {
    object(
      player,
      ["id", "teams", "recorded_games", ...CONTRIBUTION_COUNTS],
      "player",
    );
    requireValue(
      typeof player.id === "string" &&
        /^gsis:00-\d{7}$/.test(player.id) &&
        !ids.has(player.id),
      "unique GSIS identity",
    );
    ids.add(player.id);
    counts(player, "player");
    requireValue(
      player.recorded_games <= coverage.game_count,
      "player game coverage",
    );
    requireValue(
      Array.isArray(player.teams) &&
        player.teams.length > 0 &&
        player.teams.length <= 4,
      "historical teams",
    );
    const playerTeams = new Set();
    for (const team of player.teams) {
      object(
        team,
        ["team", "recorded_games", ...CONTRIBUTION_COUNTS],
        "team subtotal",
      );
      requireValue(
        TEAMS.has(team.team) && !playerTeams.has(team.team),
        "unique historical team",
      );
      playerTeams.add(team.team);
      teams.add(team.team);
      counts(team, "team subtotal");
    }
    for (const key of ["recorded_games", ...CONTRIBUTION_COUNTS])
      requireValue(
        player[key] === player.teams.reduce((sum, team) => sum + team[key], 0),
        `team subtotal ${key}`,
      );
    records += player.recorded_games;
  }
  requireValue(records === coverage.record_count, "stat-row denominator");
  requireValue(
    teams.size === coverage.teams.length &&
      coverage.teams.every((team) => teams.has(team)),
    "team coverage totals",
  );
  return data;
}
