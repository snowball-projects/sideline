# Player-to-opponent injury reports

**Founder decision: September 13, 2026.** This is the current narrow scope and
supersedes earlier dashboard and fantasy-product proposals.

## The product

A search box finds any player in the current NFL roster source. Users select a
handful; each player appears with that week's opponent and the opponent's available
defensive roster and defensive injuries. Players can be removed. The current regular-season
week is selected automatically when covered by the schedule.

Injured current roster members must not disappear because they are not
game-active. Stable source identities and the latest available team membership
drive joins. Transfers appear after the source refreshes; do not claim an
instant transaction feed. The latest founder correction limits opponent tiles to defensive players,
including defenders without reported injuries. Offense and special teams are
excluded. Collection still preserves the source reports; display filtering is
explicit. Counts describe rows, never an advantage score.

There are no league settings, roster construction, roster imports, league
accounts, ESPN Fantasy connections or multi-league management. These were
removed from the proposed direction, not deferred requirements. There is no
draft, waiver, trade, general ranking or start/sit engine.

## Contribution scope approved September 14, 2026

The founder approved defender importance (participation/performance evidence),
selected-player relevance and availability, for injured and uninjured defenders.
This supersedes earlier exclusions against contribution analysis, without
reopening leagues, roster imports, broad start/sit or fantasy-suite features.
Use traceable, separately named signals. Workload is not quality; role relevance
is not a causal benefit. No arbitrary composite, injury-count advantage,
replacement-quality assumption or point/probability boost is approved without
credible out-of-time validation and simple baselines.

The initial implementation supplies current source-backed depth context and
separate **2025 regular-season recorded events**, visibly naming historical
teams. Passing disruption uses sacks/QB hits; coverage uses passes defended and
interceptions. These separate production counts are not an overall defender ranking.
Missing history is not zero; previous teams and roles may differ. Details show
compact season-labelled production and source links. No favorable effect or
confirmed absence is inferred from an undated Out/Q report.

Current snap share was not approved because the obtainable PFR-derived family
has unresolved upstream redistribution restrictions. Modern FTN participation
is postseason-only. Recorded stat-game rows are not games played. No validated
current defensive-quality or rushing-benefit metric is available in this
release. The fixed historical baseline is deliberately not presented as current
form; adding a separate current-season, pre-match window remains future work.
See [CONTRIBUTION_REVIEW.md](CONTRIBUTION_REVIEW.md) for inputs, definitions,
rights, sample, coverage, interpretations and limitations.

## Implemented behavior

Version 0.9.3 extends the founder's October 6 field-and-status direction.
The static dashboard retains six selected players, automatic opponents,
explicit byes, source-relative completeness, missing reports, unknown kickoff,
started-game uncertainty and freshness warnings. Selections are browser IDs,
not a league roster.

A compact toolbar contains search, week selection and information. Each equal
comparison tile has compact identity, a prominent schematic defensive field
and an always-visible integrated depth/status panel. Small screens stack tiles.
Named individual markers show source first-depth defensive identities in relative
positional bands, all above a single line of scrimmage. Published chart roles,
including LCB/RCB/NB, FS/SS and defensive-line and linebacker abbreviations, guide
the schematic when fresh evidence is available. Generic roster roles are fallback
context, not a basis to infer edge/off-ball or coverage duties. Multiple published
assignments and their provenance remain intact. It is a typical depth-chart
schematic, never a confirmed lineup or actual snap/shadow assignment.
Missing or ambiguous first-depth evidence uses role/count stacks. Charts with
more than eleven published first-depth identities retain all of them; no
arbitrary eleven is chosen. Multiple compatible first-depth roles share one
individual marker instead of duplicating a person. Stacks expose all
matching identities in All, including Out players, backups and inactive players.
A missing exact-match injury report is summarized once per opponent tile. Partial
coverage is retained in source details. Missing status uses neutral, badge-free markers;
individual details retain the reason availability is unknown. Complete-report
omissions remain distinct from partial coverage and report-only roster identities.

All preserves every current opponent defensive roster member and unmatched
defensive report entry. Out filters only explicit Out game designations;
Uncertain includes Questionable, Doubtful, LP and DNP, excluding game Out.
Game Out/Doubtful/Questionable badges take precedence over practice badges.
Practice DNP never becomes game Out. Missing status appears only in All.
Inactive roster context is not an Out designation.
Depth and roster context are secondary row/detail text. A missing report,
blank designation or badge-free row never establishes health or availability.
No separate duplicate long roster panels or impact scores are introduced.

Hover/focus previews and tap/click details expose injury, availability, actual
position, source-backed depth and source evidence. Leave, Close, Escape, outside
press, focus changes and state changes dismiss details reliably. Historical
production and its source metadata remain in details rather than crowding the field.
An optional, initially collapsed player section supplies available roster bio
facts and current-season weekly injury records through the selected week. It
preserves source injury text and reported teams, counts reported weeks, labels
practice undated, and omits unsupported facts and empty sections. Rookie season,
continuous team tenure, daily progression and coordinator history require
additional source work.

Injury-file time, sideline collection, browser checking and original report time
remain distinct. A recent file or collection is not a recent report; original
report publication dates are absent in the current source. Source attribution,
refresh limits, privacy and licensing remain available through information
buttons. Missing data, byes, elapsed kickoffs, fictional mode and failures keep
compact visible states.

All 32 team logos are hosted locally: twelve public-domain SVGs and twenty
small copyrighted thumbnails for editorial team identification. Image failure
uses ordinary team abbreviations. Portraits are omitted until a practical
licensed source is established. [MEDIA.md](MEDIA.md) owns asset provenance and
the limits of the selected public-domain determinations.

The source review found current 2026 injuries despite older documentation
claiming the feed ended after 2024. The current CSV omits report publication
dates: information details say so. File update and collection times do not
replace report vintage. Source coverage is partial until independently
established; every available matching defensive row is displayed. A missing team/week
never becomes an assertion that nobody is injured.

## Operating boundary

Use the existing public GitHub Pages deployment and one shared hourly collection.
Upstream injury and roster updates are normally daily. The Refresh button checks
the same-origin current and historical artifacts; it cannot force an upstream
update. Visible tabs check every five minutes with failure backoff up to an hour.
No overlapping requests; failed checks keep prior data. New data waits until
open details, search or focused roster/week interactions finish. No per-visitor provider
requests, account system, paid APIs, metered service or browser credentials.
GitHub schedules can be delayed or dormant. Failure retains the previous
published artifact; ageing and absent coverage remain visible.

The [source decision](DATA_SOURCES.md) records current coverage, explicit public
data licensing, limits and provenance uncertainty. The [dashboard guide](DASHBOARD.md)
owns the schema, commands, deployment and recovery. Do not require users to
maintain reports or opponents manually.

Elapsed kickoff is labelled “Start passed · status unconfirmed.” The source has
no explicit live/final status; scores never manufacture it. Browser clocks
update minute labels without downloading upstream archives. See
[GAME_STATUS_REVIEW.md](GAME_STATUS_REVIEW.md).

Outside the available schedule, the UI does not guess the NFL week or reuse an
old opponent. The current source observation covers the regular season.
Postseason phases are supported only when supplied by the source.

## Evidence and history

Distinguish reported availability, uncertain participation, plausible role
relevance and measured fantasy effects. Practice participation is not a game
guarantee; an injured defender is not proof of a weak replacement. Historical
availability calibration is not evidence of improved opposing fantasy outcomes.

Keep Python research, append-only frozen inputs, calibration and historical
draft/league utilities intact and out of the main flow. The founder reported
that the 2026 draft passed without useful sideline assistance. Do not rewrite
that history, backfill recommendations or reintroduce its scope.

The canonical repository is `snowball-projects/sideline`. sideline remains one
peer snowball project. Original software is MIT; third-party data and private
inputs retain their terms. No further repository retirement is authorized here.
