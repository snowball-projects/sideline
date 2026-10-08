import { PLAYER_HISTORY_POLICY, normalizePlayerHistory } from "../../scripts/player-history-data.mjs";
import { PLAYER_HISTORY_SOURCES, PLAYER_HISTORY_TERMS } from "../../web/player-history.mjs";

export const HISTORY_NOW = "2026-09-13T12:00:00.000Z";
export const referenceCsv = "gsis_id,display_name,rookie_season,draft_year\nfixture-a,Same Name,2024,2023\nfixture-b,Missing Rookie,,2025\nwrong-id,Missing Rookie,2025,2025\nfixture-qb,Offense,2024,2024\n";
const header = "season,team,week,game_type,gsis_id,status";
export const rosterCsvs = {
  2025: [header, "2025,TEN,1,REG,fixture-a,ACT", "2025,TEN,2,REG,fixture-a,ACT", "2025,TEN,4,REG,fixture-a,ACT", "2025,NYJ,5,REG,fixture-a,ACT", "2025,TEN,6,REG,fixture-a,CUT", "2025,PHI,1,REG,fixture-b,CUT", "2025,BUF,2,REG,fixture-b,ACT", "2025,CAR,3,REG,fixture-b,UFA", "2025,PHI,19,POST,fixture-c,RES"].join("\n"),
  2026: [header, "2026,NYJ,1,REG,fixture-a,ACT", "2026,NYJ,3,REG,fixture-a,ACT", "2026,NYJ,1,REG,fixture-a,ACT", "2026,NYJ,1,REG,fixture-b,INA", "2026,PHI,1,REG,fixture-c,RET", "2026,CAR,1,REG,fixture-qb,ACT"].join("\n"),
};
export const historySources = () => PLAYER_HISTORY_SOURCES.map((source) => ({
  ...source, terms_url: PLAYER_HISTORY_TERMS, permission: "verified", permission_note: PLAYER_HISTORY_POLICY.reason,
  source_updated_at: "2026-09-13T11:00:00.000Z", retrieved_at: HISTORY_NOW,
}));
export const historyPlayers = [
  { id: "gsis:fixture-a", position: "LB", team: "NYJ" },
  { id: "gsis:fixture-b", position: "CB", team: "NYJ", bio: { entry_year: 2025, draft_number: 15 } },
  { id: "gsis:fixture-c", position: "DT", team: "PHI" },
  { id: "gsis:fixture-d", name: "Same Name", position: "LB", team: "NYJ" },
  { id: "gsis:fixture-qb", position: "QB", team: "CAR" },
];
export const historyFixture = () => normalizePlayerHistory(referenceCsv, rosterCsvs, historyPlayers, historySources(), HISTORY_NOW);
