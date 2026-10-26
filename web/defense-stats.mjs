import { TEAMS } from "./feed.mjs?v=0.9.15";

export const DEFENSE_STATS_TERMS = "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
export function competitionRank(records, key, value, lower = false) {
  return 1 + records.filter((row) => lower ? row[key] < value : row[key] > value).length;
}

// Reconstruct the pre-week window, never the selected week's later results.
// A 24h settlement guard avoids using a newly started game's partial totals.
function rankWindow(data, feed, weekKey, now = Date.now()) {
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

// During settlement (or incomplete new data), retain the last complete earlier
// pre-week window. Never use selected-week results or manufacture missing rows.
export function defenseRankings(data, feed, weekKey, now = Date.now()) {
  const requested = feed?.weeks.find((week) => week.key === weekKey);
  const first = rankWindow(data, feed, weekKey, now);
  if (!requested || feed.mode !== "live" || requested.season !== data?.season || !weekKey.includes("-REG-")) return first;
  const candidates = feed.weeks.filter((week) => week.season === requested.season && week.key.includes("-REG-") && week.week < requested.week)
    .sort((a, b) => b.week - a.week);
  let result = first;
  for (const candidate of candidates) {
    if (result.available) break;
    result = rankWindow(data, feed, candidate.key, now);
  }
  if (!result.available) return first;
  const keys = new Set(feed.weeks.filter((week) => week.season === requested.season && week.key.includes("-REG-") && week.week <= result.throughWeek).map((week) => week.key));
  const settledAt = Math.max(...feed.games.filter((game) => keys.has(game.week_key)).map((game) => Date.parse(game.kickoff) + 86400000));
  return { ...result, requestedWeek: requested.week, fallback: result.throughWeek < requested.week - 1,
    settled_at: new Date(settledAt).toISOString() };
}
