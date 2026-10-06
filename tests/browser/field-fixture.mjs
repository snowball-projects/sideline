import { normalizeSources } from "../../scripts/source-adapter.mjs";
import { sourceDefinitions } from "../../scripts/refresh-data.mjs";
import { validateFeed } from "../../web/feed.mjs";

// Entirely synthetic, source-shaped input. This module only runs in the test
// process: current.json is intercepted in memory, never written or published.
// The live transport branch is intentional so saved-selection and refresh
// behavior are tested without passing fictional mode off as production data.
export const NOW = "2026-09-13T12:00:00.000Z";
const UPDATED = "2026-09-13T11:00:00.000Z";
export const SELECTED = [
  ["fixture-selected-1", "Browser Fixture One", "QB"],
  ["fixture-selected-2", "Browser Fixture Two", "WR"],
  ["fixture-selected-3", "Browser Fixture Three", "RB"],
  ["fixture-selected-4", "Browser Fixture Four", "TE"],
  ["fixture-selected-5", "Browser Fixture Five", "WR"],
  ["fixture-selected-6", "Browser Fixture Six", "QB"],
];
export const DEFENDERS = [
  ["fixture-out", "Field Fixture Out", "DT", "Out", "Did Not Participate In Practice", 1, "ACT"],
  ["fixture-limited", "Field Fixture Limited", "DT", "", "Limited Participation in Practice", 1, "ACT"],
  ["fixture-dnp", "Field Fixture DNP", "DE", "", "Did Not Participate In Practice", 1, "ACT"],
  ["fixture-full", "Field Fixture Full", "DE", "", "Full Participation in Practice", 1, "ACT"],
  ["fixture-doubtful", "Field Fixture Doubtful", "LB", "Doubtful", "Did Not Participate In Practice", 1, "ACT"],
  ["fixture-no-report", "Field Fixture No Report", "LB", null, "", 1, "ACT"],
  ["fixture-not-listed", "Field Fixture Not Listed", "LB", "", "", 1, "ACT"],
  ["fixture-questionable", "Field Fixture Questionable", "CB", "Questionable", "Limited Participation in Practice", 1, "ACT"],
  ["fixture-corner", "Field Fixture Corner", "CB", null, "", 1, "ACT"],
  ["fixture-unknown", "Field Fixture Unknown", "S", "Unrecognized designation", "", 1, "ACT"],
  ["fixture-safety", "Field Fixture Safety", "S", null, "", 1, "ACT"],
  ["fixture-backup", "Depth Fixture Backup", "CB", "Out", "Did Not Participate In Practice", 2, "ACT"],
  ["fixture-reserve", "Depth Fixture Reserve", "DT", "Questionable", "Limited Participation in Practice", null, "RES"],
  ["fixture-squad", "Depth Fixture Squad", "LB", null, "", null, "DEV"],
];
const csv = (header, rows) => [header, ...rows.map((row) => row.join(","))].join("\n");

export function fieldFixture() {
  const definitions = sourceDefinitions(2026);
  const feed = normalizeSources({
    mode: "live",
    season: 2026,
    generatedAt: NOW,
    sources: definitions.map(({ key, ...source }) => source),
    metadata: Object.fromEntries(definitions.map((source) => [source.key, {
      source_id: source.id,
      reported_at: null,
      source_updated_at: UPDATED,
      retrieved_at: NOW,
    }])),
    rosterCsv: csv("season,week,team,full_name,gsis_id,gsis_it_id,espn_id,position,status,status_description_abbr", [
      ...SELECTED.map(([id, name, position]) => [2026, 1, "BUF", name, id, "", "", position, "ACT", "A01"]),
      ...DEFENDERS.map(([id, name, position, , , , status]) => [2026, 1, "CAR", name, id, "", "", position, status, status === "RES" ? "R01" : status === "DEV" ? "P01" : "A01"]),
      [2026, 1, "CAR", "Offense Fixture Excluded", "fixture-offense", "", "", "QB", "ACT", "A01"],
      [2026, 1, "CHI", "Next Week Fixture Defender", "fixture-next-week", "", "", "CB", "ACT", "A01"],
    ]),
    scheduleCsv: csv("game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score", [
      ["browser-fixture-week-1", 2026, "REG", 1, "2026-09-13", "13:00", "BUF", "CAR", "", ""],
      ["browser-fixture-week-2", 2026, "REG", 2, "2026-09-20", "13:00", "BUF", "CHI", "", ""],
    ]),
    injuryCsv: csv("season,season_type,game_type,team,week,gsis_id,position,full_name,report_primary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status", [
      ...DEFENDERS.filter(([, , , status]) => status !== null).map(([id, name, position, status, practice]) => [2026, "REG", "REG", "CAR", 1, id, position, name, "Knee", status, "Knee", "", practice]),
      [2026, "REG", "REG", "CHI", 2, "fixture-next-week", "CB", "Next Week Fixture Defender", "Ankle", "Out", "Ankle", "", "Did Not Participate In Practice"],
    ]),
    depthCsv: csv("dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank", DEFENDERS.filter(([, , , , , rank]) => rank !== null).map(([id, name, position, , , rank], index) => [UPDATED, "CAR", name, "", id, 2, "Defense", index + 1, position, position, index + 1, rank])),
  });
  feed.label = "Synthetic browser test fixture; never publish";
  return validateFeed(feed, Date.parse(NOW));
}

export const selectedIds = (count) => SELECTED.slice(0, count).map(([id]) => `gsis:${id}`);
