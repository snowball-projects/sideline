import test from "node:test";
import assert from "node:assert/strict";
import { validateContributions, MAX_CONTRIBUTION_BYTES } from "../web/contribution.mjs";
import { validateDefenseStats, MAX_DEFENSE_STATS_BYTES } from "../web/defense-stats.mjs";
import { validatePlayerHistory, MAX_PLAYER_HISTORY_BYTES } from "../web/player-history.mjs";
import { validateInjuryHistory, MAX_INJURY_HISTORY_BYTES } from "../web/injury-history.mjs";

// Each envelope passes the shape/version gates. Oversized multibyte content
// must hit the byte guard before deeper source or row validation.
for (const [label, validate, max, envelope] of [
  ["production", validateContributions, MAX_CONTRIBUTION_BYTES,
    { schema_version: 1, season: 2025, season_type: "REG", source: null, coverage: null, players: null }],
  ["defense statistics", validateDefenseStats, MAX_DEFENSE_STATS_BYTES,
    { schema_version: 1, season: 2026, generated_at: null, sources: [], teams: [], players: null }],
  ["roster history", validatePlayerHistory, MAX_PLAYER_HISTORY_BYTES,
    { schema_version: 1, generated_at: null, window: [2025, 2026], sources: [], players: null }],
  ["injury history", validateInjuryHistory, MAX_INJURY_HISTORY_BYTES,
    { schema_version: 1, season: 2025, generated_at: null, source: null, players: null }],
]) {
  test(label + " rejects bytes exceeding the cap even below the UTF-16 length cap", () => {
    const data = { ...envelope, players: "é".repeat(Math.floor(max / 2)) };
    assert.ok(JSON.stringify(data).length < max);
    assert.ok(new TextEncoder().encode(JSON.stringify(data)).byteLength > max);
    assert.throws(() => validate(data), /size/);
  });
}
