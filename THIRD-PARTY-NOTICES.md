sideline
Copyright 2026 snowball

Published calibration results were derived from nflverse data licensed under
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
weekly opponents and reports, and adds qualified positional context. Every
available matching injury entry is retained. No endorsement by nflverse or the
NFL is implied. Data are provided without warranties under the source license;
underlying report timestamps and independent completeness are not established.
See docs/DATA_SOURCES.md for the source review and provenance limits.

The dashboard also includes twelve individually reviewed team logos from
Wikimedia Commons, identified as public domain on their source file pages.
Team trademarks remain with their owners; their use identifies the teams and
does not imply endorsement. These marks are not original snowball software.
web/team-assets.json records individual source URLs, license statements,
revisions, checksums and sanitization. See docs/MEDIA.md for details and limits.

Twenty additional team-logo PNG thumbnails retain their owners' copyrights and
trademarks. They are used solely for small editorial team identification in
roster, matchup and injury reporting; no open-source image license, NFL license
or endorsement is claimed. Wikipedia source-file rationales are not licenses for
sideline. Exact sources, notices, dimensions and hashes are in web/team-assets.json;
docs/MEDIA.md records the limited use and its boundaries. Do not apply the MIT
software license or nflverse CC BY data grant to these images.

Depth-chart observations are also derived from the separately reviewed
nflverse-data release under CC BY 4.0. sideline retains the latest observation per
team and joins by player identity and team; first string does not confirm game
participation. See docs/DATA_SOURCES.md.

Historical defensive event counts are derived from separately labelled nflverse-calculated 2024 and 2025
regular-season player statistics under the publisher's CC BY 4.0 data grant:
https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv.gz
https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2024.csv.gz
sideline filters REG defensive records, sums separate credited event counts by
GSIS identity, and preserves historical team subtotals and source provenance.
Seasons remain separate; LA is normalized to LAR for the same historical franchise.
These are not defensive-quality, participation or fantasy-advantage scores.
No independently verified NFL agreement or endorsement is claimed. No warranties
are provided under the source license. See docs/CONTRIBUTION_REVIEW.md.

Explicit rookie seasons and observed 2025/2026 roster team/week records are
derived from the reviewed nflverse-data player-reference and weekly-roster
release assets under the same publisher CC BY 4.0 grant. sideline selects
current defenders by GSIS identity, filters departed roster statuses, and
aggregates source week observations without asserting tenure or games played.
Player-reference photos, third-party ratings and draft-reference fields are
excluded. Source and collection timestamps remain attached to the optional
artifact. See docs/DATA_SOURCES.md for fixed asset URLs and review limits.

The optional 2025 injury-history archive also derives from nflverse-data
under the publisher CC BY 4.0 license:
https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2025.csv
sideline selects current defensive identities by GSIS ID and preserves reported
weeks, phases, historical teams, original injury/body-part text and separate
practice/game status. Null status and absent weeks remain unknown. Source-file
and collection timestamps are preserved without claiming daily practice dates,
distinct injury counts, current availability or a complete career history.
The source warranty disclaimer and lack of endorsement above apply.
