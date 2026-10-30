import { readFileSync } from "node:fs";
import { TEAMS, normalize } from "../scripts/collect.mjs";
const csv = (rows) =>
  Object.keys(rows[0]).join(",") +
  "\n" +
  rows
    .map((row) =>
      Object.values(row)
        .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
        .join(","),
    )
    .join("\n");
const day = (week, offset = 0) =>
  new Date(Date.UTC(2026, 8, 10 + (week - 1) * 7 + offset))
    .toISOString()
    .slice(0, 10);
export function fixtureInputs() {
  const schedule = [],
    roster = [],
    depth = [],
    injuries = [],
    teamStats = [],
    playerStats = [];
  for (let i = 0; i < TEAMS.length; i++) {
    const team = TEAMS[i],
      other = TEAMS[i ^ 1],
      pair = Math.floor(i / 2);
    roster.push({
      season: 2026,
      team,
      full_name: `Quarterback ${team}`,
      gsis_id: `qb-${team}`,
      position: "QB",
      status: "ACT",
    });
    for (const week of [1, 2, 3])
      for (const [slot, position, order, id] of [
        [1, "QB", 1, `qb-${team}`],
        [1, "QB", 2, `backup-${team}`],
        [2, "RB", 1, `rb-${team}`],
        [3, "WR", 1, `wr1-${team}`],
        [4, "WR", 2, `wr2-${team}`],
        [5, "WR", 3, `wr3-${team}`],
        [6, "LT", 1, `lt-${team}`],
        [7, "LG", 1, `lg-${team}`],
        [8, "C", 1, `c-${team}`],
        [9, "RG", 1, `rg-${team}`],
        [10, "RT", 1, `rt-${team}`],
        [11, "TE", 1, `te-${team}`],
        [1, "LDE", 1, `def-${team}`],
        [2, "MLB", 1, `lb-${team}`],
        [3, "LCB", 1, `cb-${team}`],
      ]) {
        depth.push({
          dt: `${day(week, -1)}T12:00:00Z`,
          team,
          player_name: id,
          gsis_id: id,
          espn_id: "",
          pos_grp: ["LDE", "MLB", "LCB"].includes(position)
            ? "Base 4-3 D"
            : "3WR 1TE",
          pos_abb: position,
          pos_slot: slot,
          pos_rank: order,
        });
      }
    const game_id = `2026_01_${i % 2 ? other : team}_${i % 2 ? team : other}`;
    const counts = {
      def_tackles_solo: i + 1,
      def_tackles_with_assist: 1,
      def_tackle_assists: 2,
      def_sacks: i % 3,
      def_interceptions: i % 2,
    };
    teamStats.push({
      season: 2026,
      season_type: "REG",
      week: 1,
      game_id,
      team,
      opponent_team: other,
      passing_yards: 200 + i * 2,
      rushing_yards: 100,
      sack_yards_lost: -10,
      sacks_suffered: 1,
      passing_interceptions: 1,
      fumbles_lost_total: 1,
      fumble_recovery_opp: 1,
      ...counts,
    });
    playerStats.push({
      season: 2026,
      season_type: "REG",
      week: 1,
      game_id,
      team,
      opponent_team: other,
      player_id: `def-${team}`,
      ...counts,
    });
    if (i === 0)
      injuries.push({
        season: 2026,
        game_type: "REG",
        week: 1,
        team,
        gsis_id: `qb-${team}`,
        report_primary_injury: "Knee",
        report_status: "Questionable",
        practice_status: "Limited Participation in Practice",
      });
    if (i % 2 === 0)
      for (let week = 1; week <= 18; week++) {
        if (week === (pair % 2 ? 3 : 2)) continue;
        schedule.push({
          game_id: `2026_${String(week).padStart(2, "0")}_${team}_${other}`,
          season: 2026,
          game_type: "REG",
          week,
          gameday: day(week),
          gametime: "20:00",
          away_team: team,
          home_team: other,
          away_score: week === 1 ? 10 + i : "",
          home_score: week === 1 ? 20 + i : "",
        });
      }
  }
  return Object.fromEntries(
    Object.entries({
      roster,
      schedule,
      injuries,
      depth,
      teamStats,
      playerStats,
    }).map(([key, rows]) => [
      key,
      {
        csv: csv(rows),
        metadata: {
          source_updated_at: "2026-09-24T12:00:00Z",
          retrieved_at: "2026-09-24T13:00:00Z",
        },
      },
    ]),
  );
}
export function fixture() {
  const assets = JSON.parse(
    readFileSync(new URL("../web/team-assets.json", import.meta.url), "utf8"),
  );
  for (const [team, asset] of Object.entries(assets)) asset.name = team;
  return normalize(fixtureInputs(), {
    season: 2026,
    now: new Date("2026-09-26T12:00:00Z"),
    assets,
  });
}
