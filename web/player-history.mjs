export const PLAYER_HISTORY_WINDOW = [2025, 2026];
export const PLAYER_HISTORY_TERMS = "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
export const PLAYER_HISTORY_SOURCES = [
  { id: "nflverse-player-reference", label: "nflverse player reference", url: "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv.gz" },
  ...PLAYER_HISTORY_WINDOW.map((season) => ({
    id: `nflverse-weekly-roster-${season}`, label: `nflverse ${season} weekly rosters`,
    url: `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv.gz`,
  })),
];

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
