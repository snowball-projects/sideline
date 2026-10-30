sideline
Copyright 2026 snowball

Published data are derived from nflverse data licensed under
Creative Commons Attribution 4.0 International:
https://github.com/nflverse/nflverse-data
https://creativecommons.org/licenses/by/4.0/

Schedule inputs came from NFL Data by Lee Sharpe and nflverse:
https://github.com/nflverse/nfldata

The source data were filtered, normalized, joined, and statistically summarized.
Raw source data are not redistributed in this repository.

The dashboard additionally publishes filtered and normalized NFL roster,
schedule, and injury records from nflverse-data release CSVs:
https://github.com/nflverse/nflverse-data/releases
https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md

These data are licensed by their publisher under Creative Commons Attribution
4.0 International, not sideline's MIT software license:
https://creativecommons.org/licenses/by/4.0/

sideline filters roster membership, normalizes identity/team/status fields, joins
weekly opponents and reports, and adds qualified positional context. Matching injury entries are joined to depth-chart players. No endorsement by nflverse or the
NFL is implied. Data are provided without warranties under the source license;
underlying report timestamps and independent completeness are not established.

The dashboard also includes twelve individually reviewed team logos from
Wikimedia Commons, identified as public domain on their source file pages.
Team trademarks remain with their owners; their use identifies the teams and
does not imply endorsement. These marks are not original snowball software.
web/team-assets.json records individual source URLs, license statements,
revisions, checksums and sanitization.

Twenty additional team-logo PNG thumbnails retain their owners' copyrights and
trademarks. They are used solely for small editorial team identification in
roster, matchup and injury reporting; no open-source image license, NFL license
or endorsement is claimed. Wikipedia source-file rationales are not licenses for
sideline. Exact sources, notices, dimensions and hashes are in web/team-assets.json.
Do not apply the MIT
software license or nflverse CC BY data grant to these images.

Depth-chart observations and weekly team/player statistics also derive from
nflverse-data under its publisher's CC BY 4.0 grant. sideline chooses the latest
depth observation inside each selected week before kickoff (or week end for a
bye), groups formation slots, and preserves every backup behind each starter.
First depth does not confirm game participation. Missing observations remain
unavailable. Injury rows establish team/week report availability; absent rows
cannot distinguish an unpublished report from a report with no listed injuries.
The source supplies no report publication dates.

Statistics use complete, settled regular-season weeks before the selected week.
Schedule scores supply points; net yards include sack yards lost. Sacks and
turnovers are totals. Competition ranks preserve ties. Gold stars retain the
league top-10 definition in tackles, sacks or interceptions, including ties,
only after weekly player counts reconcile to team counts. No defensive-quality,
participation or fantasy-advantage score is implied. Source URLs, file dates,
collection dates and review dates are retained in the single published data file.

Data dictionaries:
https://nflreadr.nflverse.com/articles/dictionary_depth_charts.html
https://nflreadr.nflverse.com/articles/dictionary_team_stats.html
https://nflreadr.nflverse.com/articles/dictionary_player_stats.html
