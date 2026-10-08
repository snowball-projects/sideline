import { normalizeInjuryHistory, INJURY_HISTORY_POLICY } from "../../scripts/injury-history-data.mjs";
import { INJURY_HISTORY_SOURCE } from "../../web/injury-history.mjs";
export const ARCHIVE_NOW = "2026-09-13T12:00:00.000Z";
export const archiveSource = () => ({ ...INJURY_HISTORY_SOURCE, permission: "verified", permission_note: INJURY_HISTORY_POLICY.reason,
  source_updated_at: "2026-09-07T11:00:00.000Z", retrieved_at: ARCHIVE_NOW });
export const archivePlayers = [
  { id: "gsis:fixture-out", name: "Same Name", position: "LB" },
  { id: "gsis:fixture-limited", position: "CB" },
  { id: "gsis:fixture-qb", position: "QB" },
];
const fields = "season,game_type,week,team,gsis_id,full_name,report_primary_injury,report_secondary_injury,practice_primary_injury,practice_secondary_injury,report_status,practice_status";
export const archiveCsv = [fields,
  "2025,REG,1,TEN,fixture-out,Same Name,Ankle,Wrist,Ankle,, ,Limited Participation in Practice",
  "2025,REG,5,NYJ,fixture-out,Same Name,Concussion,,Concussion,,Out,Did Not Participate In Practice",
  "2025,WC,19,NYJ,fixture-out,Same Name,Knee,,Knee,,Questionable,Full Participation in Practice",
  "2025,REG,2,LA,fixture-limited,Other Defender,Shoulder,,,,,",
  "2025,REG,3,PHI,wrong-id,Same Name,Calf,,,,Out,Did Not Participate In Practice",
  "2025,REG,3,CAR,fixture-qb,Offense,Foot,,,,Out,Did Not Participate In Practice",
].join("\n");
export const archiveFixture = () => normalizeInjuryHistory(archiveCsv, archivePlayers, archiveSource(), ARCHIVE_NOW);
