# Defensive team context and league leaders

Reviewed October 15, 2026 for the founder's requested team value/rank pairs and
individual top-10 stars. These are separate recorded statistics, not an overall
quality ranking, matchup assignment, injury benefit or start/sit signal.

## Sources and permission

The supplied [ESPN summary](https://www.espn.com/nfl/stats/_/view/team) exposes
Yards Allowed and Turnovers categories. Its full table was bot-gated during this
review. The [individual defense table](https://www.espn.com/nfl/stats/player/_/view/defense)
identifies total tackles, solo tackles, assists, sacks and interceptions. Neither
an undocumented ESPN endpoint nor direct NFL scraping is selected: no current
redistribution grant has been established for those sources. In particular,
ESPN's summary label alone does not prove whether its Turnovers tile represents
interceptions, takeaways or differential. No ESPN numeric result is hardcoded.

Use these two current-season nflverse-data release families, with no accounts,
provider calls from visitors, paid tiers or new service:

- [2026 weekly team statistics](https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2026.csv)
- [2026 weekly player statistics](https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv)

The publisher's [CC BY 4.0 grant](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md)
was rechecked for these calculated-stat releases, with no dataset-specific
exclusion. The [documented loader](https://nflreadr.nflverse.com/reference/load_team_stats.html)
selects week-level files and aims to match official box scores; this does not
make sideline an official feed or establish a separately verified NFL agreement.
The [team dictionary](https://raw.githubusercontent.com/nflverse/nflreadr/main/data-raw/dictionary_team_stats.json),
[player dictionary](https://raw.githubusercontent.com/nflverse/nflreadr/main/data-raw/dictionary_player_stats.json)
and [calculator](https://github.com/nflverse/nflfastR/blob/master/R/calculate_stats.R)
define the selected fields. They use play-by-play and stat credits, not PFR or
FTN advanced participation data. Preserve attribution, modifications, source
links and the publisher's warranty disclaimer. The data do not inherit MIT.

## Observed coverage

Collected **2026-10-15T21:09:50Z**: team file updated **14:12:06Z**, player file
updated **14:12:02Z**. The team CSV is **65,213 bytes**, **158 team-game rows**, all
**32 teams**, **79 games**, REG weeks **1–5** (32/32/32/32/30 team rows). The player
CSV is **2,452,455 bytes**, **5,506 stat-game rows** in the same weeks. Selecting
positive tackle/sack/interception records retains **3,269 player-game rows**;
the combined derived artifact is about **367 KB**. Every team's per-game
combined tackles, sacks and interceptions exactly reconciles to summed player
credits in this observation. These are recorded-stat rows, not individual games
played or participation denominators.

With the complete current schedule, pre-week-6 calculation gives SEA **251.2 YPG
allowed, #1**, DET **20 sacks, #1**, and SEA **11 takeaways, #1**. MIN has **10
takeaways (tied #2)** and **6 interceptions**. These observations support the
first two recollections and distinguish interceptions from total takeaways;
they do not establish ESPN's underlying summary formula.

## Definitions and cutoffs

- **YPG allowed**: sum each opponent's `passing_yards + rushing_yards +
  sack_yards_lost` (the last is signed negative in these releases), divided by
  the defense's distinct included games. Kneels/scrambles remain source rushing
  yards. Sack loss is applied once. Lower is better; rank uses unrounded values,
  display uses one decimal. Byes add no game or zero-yard record.
- **Sacks**: total `def_sacks`, preserving half-sack credits; higher is better.
- **Takeaways**: total `def_interceptions + fumble_recovery_opp`; higher is
  better. Forced fumbles alone, own recoveries, turnovers on downs, giveaways
  and turnover differential do not enter this measure. Opponent recoveries can
  include special-teams events, as standard team takeaways do.
- **Combined tackles**: `def_tackles_solo + def_tackles_with_assist +
  def_tackle_assists`, the calculator's distinct tackle credits (stat IDs 79,
  80 and 82). Solo-only is not used. These source credits are not promised to
  exactly match another provider's scoring/revisions.
- **Individual stars**: positive season totals in combined tackles, sacks or
  interceptions at league competition rank <=10. All ties qualify, including
  rank 10 even when more than ten players qualify. Rank is `1 + count strictly
  better`, so ties rank 1, 1, 3. `T#` visibly marks ties. Rank across all recorded
  identities, not just the selected opponent's roster. Multiple categories stay
  separate in the existing hover/tap detail.

For selected regular-season week W, include only weeks 1 through W−1 of that
same season. Never selected-week or later results, last season, or a live
season summary. Use the earlier of the current clock and the selected week's
first scheduled kickoff; require each prior game to be at least 24 hours past
kickoff. This is a conservative settlement guard, not evidence of official
final status. Source records are recalculated and may be corrected later:
historical views are reconstructed windows, not an archive of exactly what
was known before kickoff. That distinction appears in source details.

Require a complete league schedule, every preceding week, known kickoffs,
paired source team-game rows matching the scheduled opponents, and at least
one recorded game per team before ranking any team. Missing prior data makes
all three pairs unavailable, not zero or a misleading partial-league rank.
Week 1 has no baseline. Postseason, unknown kickoffs and future/unsettled windows
also remain unavailable. Player stars additionally require the included
player-file sums to reconcile with every team-game's three event totals;
missing individual evidence suppresses all stars without hiding valid team
metrics. A missing identity never produces a badge.

Join exact GSIS IDs to current defensive roster members and report-only
identities. Sum a player's included records across trades; details retain the
recorded teams. Current roster membership is not historical team attribution.
Names never repair joins and a report for another identity cannot inherit a star.

## Operation and bounds

`npm run refresh` adds two bounded downloads to the existing central collection,
with the existing 30-second timeout, HTTPS release redirect allowlist, three
redirect maximum, no immediate retry and no cadence/workflow changes. Each input
is capped at 12 MiB and 40,000 parsed rows. The browser artifact is capped at
4 MB, 544 team-game rows and 30,000 player-game rows, with strict provenance,
identity, field, count, timestamp and duplicate validation. Downloads grow with
the season; limits fail clearly rather than silently truncate. At observed
sizes these two requests add about 2.52 MB per refresh (about 60.4 MB/day at the
existing hourly cadence), plus redirect requests. No new runner/storage plan.

Atomic optional writes retain only a validated same-season prior file on failure;
invalid files are removed. The static build copies only the explicit new module
and validated JSON allowlist entries. Browser refresh retains validated previous
facts on failed/older fetches and exposes file/retrieval times in report info.
Raw provider files and generated JSON remain ignored and uncommitted. Existing
scheduling and the held support/source investigations remain untouched.
