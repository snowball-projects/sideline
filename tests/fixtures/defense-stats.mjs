import { TEAMS } from "../../web/feed.mjs";
import { defenseStatSources, DEFENSE_STATS_TERMS, validateDefenseStats } from "../../web/defense-stats.mjs";
export const STATS_NOW = "2026-09-13T12:00:00.000Z";
export const leaderId = "gsis:00-0099000";
export function defenseFixture() {
  const teams = [], players = [], games = [];
  for (let index = 0; index < TEAMS.length; index += 2) {
    const [home, away] = TEAMS.slice(index, index + 2);
    const game_id = `2026_01_${away}_${home}`;
    games.push({ id: game_id, week_key: "2026-REG-1", home, away, kickoff: "2026-09-06T17:00:00Z", status: "scheduled" });
    for (const [offset, team] of [home, away].entries()) {
      const n = index + offset;
      teams.push({ game_id, week: 1, team, opponent: team === home ? away : home, net_yards: 200 + n,
        tackles: 60 - n, sacks: 16 - Math.floor(n / 2), interceptions: 16 - Math.floor(n / 2), takeaways: 17 - Math.floor(n / 2) });
      const { tackles, sacks, interceptions } = teams.at(-1);
      // Two identities split the source team totals; tackles stay under the
      // single-game validation bound. CAR's featured player qualifies in all 3.
      players.push({ id: team === "CAR" ? leaderId : `gsis:00-${String(1000000 + n).padStart(7, "0")}`, game_id, team, tackles: Math.ceil(tackles / 2), sacks: sacks / 2, interceptions: Math.ceil(interceptions / 2) });
      players.push({ id: `gsis:00-${String(2000000 + n).padStart(7, "0")}`, game_id, team, tackles: Math.floor(tackles / 2), sacks: sacks / 2, interceptions: Math.floor(interceptions / 2) });
    }
  }
  const data = validateDefenseStats({ schema_version: 1, season: 2026, generated_at: STATS_NOW,
    sources: defenseStatSources(2026).map((source) => ({ ...source, terms_url: DEFENSE_STATS_TERMS, retrieved_at: STATS_NOW, source_updated_at: null })), teams, players }, Date.parse(STATS_NOW));
  const feed = { mode: "live", schedule: { coverage: "complete" }, weeks: [
    { key: "2026-REG-1", week: 1, season: 2026, starts_at: "2026-09-01T04:00:00Z" },
    { key: "2026-REG-2", week: 2, season: 2026, starts_at: "2026-09-08T04:00:00Z" },
  ], games: [...games, { id: "selected-game", week_key: "2026-REG-2", home: "CAR", away: "BUF", kickoff: "2026-09-13T17:00:00Z" }] };
  return { data, feed };
}
