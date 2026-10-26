// Historical event counts are not defensive quality, playing-time or advantage scores.
export const CONTRIBUTION_SEASON = 2025;
export const CONTRIBUTION_SOURCE =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv.gz";
export const CONTRIBUTION_TERMS =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
export const CONTRIBUTION_COUNTS = [
  "sacks",
  "qb_hits",
  "passes_defended",
  "interceptions",
];
const LIMITATION =
  "Recorded events, not defensive quality or playing time. Historical teams and roles may differ. Replacement quality and the effect on your player are unmeasured.";
const METRICS = {
  sacks: { key: "sacks", label: "Sacks", short: "sacks" },
  qb_hits: { key: "qb_hits", label: "Quarterback hits", short: "QB hits" },
  passes_defended: {
    key: "passes_defended",
    label: "Passes defended",
    short: "PD",
  },
  interceptions: { key: "interceptions", label: "Interceptions", short: "INT" },
};
export function contributionMetrics(selectedPosition) {
  const keys =
    selectedPosition === "QB"
      ? ["sacks", "qb_hits"]
      : ["WR", "TE"].includes(selectedPosition)
        ? ["passes_defended", "interceptions"]
        : selectedPosition === "MIXED"
          ? ["sacks", "passes_defended"]
          : [];
  return keys.map((key) => ({ ...METRICS[key] }));
}

/** Exact identity lookup; historical team context is deliberately preserved. */
export function defenderContribution(data, defenderId, selectedPosition) {
  if (!data) return null;
  const record = data.players.find((player) => player.id === defenderId);
  if (!record) return null;
  return {
    period: data.season + " regular season",
    record,
    metrics: contributionMetrics(selectedPosition).map((metric) => ({
      ...metric,
      value: record[metric.key],
    })),
    allMetrics: CONTRIBUTION_COUNTS.map((key) => ({
      ...METRICS[key],
      value: record[key],
    })),
    relevance:
      selectedPosition === "QB"
        ? "Recorded passing disruption; not a pressure rate or an individual matchup."
        : ["WR", "TE"].includes(selectedPosition)
          ? "Recorded coverage events; they do not identify who will cover your player or measure coverage efficiency."
          : selectedPosition === "MIXED"
            ? "Separate recorded pass-disruption and coverage events. The broad roster position does not establish a current rush or coverage assignment. All four recorded counts are shown above."
            : "These counts do not isolate rushing defense or establish benefit for this position.",
    limitation: LIMITATION,
    absence:
      "If unavailable, this recorded contribution must be replaced; the effect on your player is unmeasured.",
  };
}

// Each event has its own leader set; no weights or overall defender ranking.
export function productionLeaders(data, members) {
  const ids = new Set(members.map((member) => member.id));
  const records = data?.players.filter((player) => ids.has(player.id)) || [];
  return Object.fromEntries(
    CONTRIBUTION_COUNTS.map((key) => {
      const highest = Math.max(0, ...records.map((record) => record[key]));
      return [
        key,
        highest > 0
          ? records
              .filter((record) => record[key] === highest)
              .map((record) => record.id)
          : [],
      ];
    }),
  );
}
