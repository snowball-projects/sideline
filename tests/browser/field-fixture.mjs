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

// Deliberately distinguish coarse roster positions from the current chart's
// real position labels. The two Johnsons have the same compact visible name;
// full names and stable IDs must still distinguish their detail controls.
export const NAMED_DEFENDERS = [
  ["fixture-out", "Avery O'Malley-Smith-Williams", "LB", "Out", "Did Not Participate In Practice", 1, "ACT", "LDE"],
  ["fixture-limited", "Bennett D'Angelo", "LB", "", "Limited Participation in Practice", 1, "ACT", "RDE"],
  ["fixture-dnp", "Cameron Brown", "DT", "", "Did Not Participate In Practice", 1, "ACT", "LDT"],
  ["fixture-full", "Devin Washington", "DT", "", "Full Participation in Practice", 1, "ACT", "RDT"],
  ["fixture-doubtful", "Elliot Campbell", "LB", "Doubtful", "Did Not Participate In Practice", 1, "ACT", "MLB"],
  ["fixture-no-report", "Francis Hernández", "LB", null, "", 1, "ACT", "WLB"],
  ["fixture-not-listed", "Jamal Johnson", "DB", "", "", 1, "ACT", "LCB"],
  ["fixture-questionable", "Jordan Johnson", "DB", "Questionable", "Limited Participation in Practice", 1, "ACT", "RCB"],
  ["fixture-corner", "Kieran Fitzpatrick", "DB", null, "", 1, "ACT", "NB"],
  ["fixture-unknown", "Luca Anderson", "DB", "Unrecognized designation", "", 1, "ACT", "FS"],
  ["fixture-safety", "Miles Montgomery", "DB", null, "", 1, "ACT", "SS"],
  ["fixture-backup", "Nico Robinson", "DB", "Out", "Did Not Participate In Practice", 2, "ACT", "RCB"],
  ["fixture-reserve", "Otis Jefferson", "DT", "Questionable", "Limited Participation in Practice", null, "RES", "DT"],
  ["fixture-squad", "Parker Thompson", "LB", null, "", null, "DEV", "LB"],
];
// A larger, wholly synthetic defense also carries unplaced current roster
// members and a secondary-only multi-role chart entry. None are replacements
// for the twelve source first-depth identities or derived from provider data.
export const DENSE_DEFENDERS = [
  ...NAMED_DEFENDERS.map((entry) => entry[0] === "fixture-backup"
    ? entry.map((value, index) => index === 5 ? 1 : value)
    : [...entry]),
  ["fixture-secondary-safety", "Quinn Reserve Safety", "DB", null, "", 2, "ACT", ["FS", "SS"]],
  ...Array.from({ length: 25 }, (_, index) => [
    `fixture-dense-${index + 1}`, `Dense Fixture Reserve ${index + 1}`,
    ["DB", "LB", "DL"][index % 3], null, "", null, index % 2 ? "ACT" : "RES",
  ]),
];

export const ALTERNATE_DEFENDERS = DEFENDERS.map(([id, name, ...context]) => [
  `alternate-${id}`, `Alternate ${name}`, ...context,
]);
const csv = (header, rows) => [header, ...rows.map((row) => row.join(","))].join("\n");

export function fieldFixture({ defenders = DEFENDERS, alternateDefenders = null, week = 1 } = {}) {
  const definitions = sourceDefinitions(2026);
  const defenses = [["CAR", defenders], ...(alternateDefenders ? [["DEN", alternateDefenders]] : [])];
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
      ...SELECTED.map(([id, name, position], index) => [2026, week, alternateDefenders && index >= 3 ? "MIA" : "BUF", name, id, "", "", position, "ACT", "A01"]),
      ...defenses.flatMap(([team, members]) => members.map(([id, name, position, , , , status]) => [2026, week, team, name, id, "", "", position, status, status === "RES" ? "R01" : status === "DEV" ? "P01" : "A01"])),
      [2026, week, "CAR", "Offense Fixture Excluded", "fixture-offense", "", "", "QB", "ACT", "A01"],
      [2026, week, "CHI", "Next Week Fixture Defender", "fixture-next-week", "", "", "CB", "ACT", "A01"],
    ]),
    scheduleCsv: csv("game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score", [
      [`browser-fixture-week-${week}`, 2026, "REG", week, "2026-09-13", "13:00", "BUF", "CAR", "", ""],
      [`browser-fixture-week-${week + 1}`, 2026, "REG", week + 1, "2026-09-20", "13:00", "BUF", "CHI", "", ""],
      ...(alternateDefenders ? [[`browser-fixture-alternate-${week}`, 2026, "REG", week, "2026-09-13", "16:25", "MIA", "DEN", "", ""]] : []),
    ]),
    injuryCsv: csv("season,season_type,game_type,team,week,gsis_id,position,full_name,report_primary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status", [
      ...defenses.flatMap(([team, members]) => members.filter(([, , , status]) => status !== null).map(([id, name, position, status, practice]) => [2026, "REG", "REG", team, week, id, position, name, "Knee", status, "Knee", "", practice])),
      [2026, "REG", "REG", "CHI", week + 1, "fixture-next-week", "CB", "Next Week Fixture Defender", "Ankle", "Out", "Ankle", "", "Did Not Participate In Practice"],
    ]),
    depthCsv: csv("dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank", defenses.flatMap(([team, members]) => members.filter(([, , , , , rank]) => rank !== null).flatMap(([id, name, position, , , rank, , chartPosition], index) =>
      (Array.isArray(chartPosition) ? chartPosition : [chartPosition || position]).map((chartRole) => [UPDATED, team, name, "", id, 2, "Defense", index + 1, chartRole, chartRole, index + 1, rank])))),
  });
  feed.label = "Synthetic browser test fixture; never publish";
  return validateFeed(feed, Date.parse(NOW));
}

export const selectedIds = (count) => SELECTED.slice(0, count).map(([id]) => `gsis:${id}`);
