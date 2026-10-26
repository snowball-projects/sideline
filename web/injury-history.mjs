export const INJURY_HISTORY_SOURCE = Object.freeze({
  id: "nflverse-injuries-2025", label: "nflverse 2025 injury records",
  url: "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2025.csv",
  terms_url: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",
});
export const INJURY_FIELDS = ["report_primary_injury", "report_secondary_injury", "practice_primary_injury", "practice_secondary_injury", "report_status", "practice_status"];
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
