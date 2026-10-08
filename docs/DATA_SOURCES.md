# Data sources

Reviewed September 13, 2026. This is the source decision for the player-search
dashboard; historical research inputs retain their own provenance.

## Selected integration

Use the current-season injury and roster CSVs, compressed depth-chart CSV, and schedule CSV published
in **nflverse-data releases**. Access is public, requires no API key or account,
and uses the data repository's explicit
[CC BY 4.0 license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md).
The license permits sharing and adaptation with attribution. Retain nflverse
credit, source and license links, the warranty disclaimer, and a description
of sideline's filtering, normalization and joins. The data do not inherit sideline's
MIT software license.

This decision relies on the publisher's affirmative data license, rather than
the mere availability of a URL. The current license is standard CC BY 4.0 with
no injury, roster or schedule exclusion; its GitHub blob is
`0fb847eb09afc05734c2f1aa34bc3ebd995a072a`.

The separate [nflverse umbrella package](https://nflverse.nflverse.com/)
distinguishes its software license from underlying owners' data terms. That
general caution is not a dataset-specific revocation of the release license.
The published [injury builder](https://github.com/nflverse/nflverse-rosters/blob/main/exec/update-injuries.R)
calls `nflapi::nflapi_injuries`; the `nflapi` repository was unavailable for
independent inspection during this review. Do not claim that sideline has an
NFL contract, official endorsement or a separately verified upstream agreement.
Reassess if the publisher adds a restriction or a rights holder disputes the
grant. Do not expand this decision to photographs, logos, news text, unreviewed
datasets or direct NFL website/API collection.

## Verified coverage

These are observations of files retrieved September 13, 2026 at approximately
05:57 UTC, not promises about later coverage.

| Release asset                                                                                               | Observed coverage                                                    | Asset last modified (UTC) |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| [injuries_2026.csv](https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv) | 182 regular-season week 1 rows, all 32 teams, all reported positions | September 12, 11:35:55    |
| [roster_2026.csv](https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv)      | 2,963 records, all 32 teams, latest available week 1                 | September 12, 11:37:40    |
| [games.csv](https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv)                | 272 regular-season 2026 games, weeks 1–18                            | September 13, 05:06:24    |

The [injury release](https://github.com/nflverse/nflverse-data/releases/tag/injuries)
also contains 2025 data, updated September 7, 2026. The older
[availability page](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html#injury-data)
still says the feed ended after 2024. Current release contents supersede that
statement as evidence of availability. They do not establish uninterrupted
operation or complete reporting at every future refresh.

The injury CSV contains game designation, practice participation, and primary
and secondary injury descriptions. Blank game designation is retained as
unreported, never changed to “healthy.” In this observation 123 rows had no
game designation; 27 were Out, 26 Questionable and six Doubtful. Offensive and
special-teams entries remain in the opponent report. “All available entries”
means all matching rows in the supplied file, not independently certified
completeness against each team's original report. An absent team or week is
unknown coverage, never an empty injury report.

No report publication date or practice-day date is present in the current CSV.
The week is known, but report vintage is unavailable. HTTP `Last-Modified`
describes the published file, and retrieval time describes sideline's request;
neither may be relabelled as the original report date. A newly retrieved file
can still contain old evidence. Started games cannot be described as a verified
pre-game snapshot when the underlying report vintage is unknown.

## Identity and schedule joins

The [roster builder](https://github.com/nflverse/nflverse-rosters/blob/main/R/rosters.R)
uses weekly NGS data for modern seasons, supplemented by Shield/player identity
data, with a Shield fallback. Its
[season conversion](https://github.com/nflverse/nflverse-rosters/blob/main/R/utils_rosters_weekly_to_season.R)
selects each identity's latest available week. This is periodic source context,
not a guarantee that a transaction is reflected immediately.

The observed roster includes active, inactive, reserve, practice-squad, exempt,
cut and retired records. An `ACT`-only filter would lose current injured or
inactive roster members. Exclude departed/retired statuses while retaining
current roster membership independently of game availability. Preserve stable
source identifiers and reject ambiguous current-team joins rather than choosing
a team by name. This observation had no duplicate GSIS IDs and one absent GSIS
ID; that player's `gsis_it_id` was present and supports a namespaced fallback.

The [schedule dictionary](https://nflreadr.nflverse.com/articles/dictionary_schedules.html)
defines `gametime` in Eastern time regardless of venue. Combine it with
`gameday` using `America/New_York`, including daylight-saving changes, then
display the user's local time. Missing kickoff time remains unknown. A bye
requires adequate schedule coverage; a missing or conflicting schedule is not
proof of a bye. Match the exact season, week and current team. Future schedule
changes replace the current view on a later successful refresh.

## Defensive roster and first-string context

The September 13 follow-up adds the current opponent roster and color-coded
status borders, plus the fourth release asset:
[depth_charts_2026.csv.gz](https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_2026.csv.gz).
The same affirmative nflverse-data CC BY 4.0 grant was rechecked for this
specific dataset; it has no dataset-specific exclusion. The publisher's
[release notes](https://github.com/nflverse/nflreadr/releases) identify ESPN as
the post-2024 depth-chart source. As with injuries, this relies on the publisher's
data grant and does not assert an independently verified upstream agreement or
authorize direct ESPN collection.

The [availability documentation](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html#depth-chart-data)
says these observations update daily and have timestamps rather than NFL weeks.
The September 13 file contains a season of observations (about 49.1 MB expanded,
10.1 MB compressed), with the latest snapshot covering all 32 teams. sideline
retains 2,222 position assignments from each team's latest available timestamp.
`dt` is an observation timestamp, not confirmation of a game lineup. Rank 1
means first string at that chart position. Multiple assignments are preserved;
no name-based identity joins or game-start guarantees are introduced.

The collector reads bounded gzip input (20 MiB) and rejects expansion above
160 MiB or two million CSV rows. CSV rows are consumed as parsed, keeping only
the latest snapshot per team in memory. Downloaded season history is neither
committed nor sent to visitors. Source limits fail clearly as the archive grows.
Browser first-string labels require exact player/team matches, the current
schedule week, and depth observation, source update and retrieval within 24 hours.
Older, future, missing or transferred-player chart evidence cannot create a
current first-string label. Current rosters are not historical game rosters.

The UI starts with every current defensive roster member of the opponent, including
reserves and practice squad, then merges injuries by stable ID. It additionally
retains report-only defensive identities, since roster/report updates need not agree.
A player absent from the injury file has no matching injury entry, not confirmed
health. Reported Out, Doubtful and Questionable override first-string colors;
reserve status, practice status and missing evidence remain separate. Offensive, special-teams and unclassified positions are excluded from the
tiles following the founder's latest correction. The collector preserves
all-position source records. First-string labels require a defensive chart
position; returner or other special-teams assignments do not establish a
defensive starting role. The
legend and full explanations are in information and player popups.

### Field presentation mapping (October 6 follow-up)

The existing reviewed depth source supplies the field labels; no new provider is
introduced. Exact defensive abbreviations are preserved. LCB/RCB/CB are corner
context, NB/NCB nickel context, FS/SS/S safety context; LDE/RDE/DE are end context,
LDT/RDT/DT/DI interior context, NT nose context, EDGE explicit edge context.
LB/MLB/ILB/OLB and published weak/strong/left/right linebacker variants remain
linebacker context: those labels alone do not establish rush versus coverage duty.
Generic DL and DB stay generic. Multiple assignments remain separate; ambiguous
or unrecognized labels use the original roster family rather than an invented
role. Ranks, source IDs and observation timestamps remain available in details.

An October 6, 2026 15:24 UTC collection observed 1,052 injury entries in weeks
1–4 and no Week 5 report for any team. Fresh file timestamps did not change that
coverage. PHI's current chart contained eleven first-depth defenders; NYJ and WAS
contained twelve. Named markers preserve all those identities rather than discarding the twelfth
or inferring a game lineup. This is an observation,
not a promise about future data. Generated source payloads remain uncommitted.

## Refresh and zero-cost operation

Upstream's [injury workflow](https://github.com/nflverse/nflverse-rosters/blob/main/.github/workflows/update_injuries.yaml)
runs at 07:07 UTC daily September–February. The
[roster workflow](https://github.com/nflverse/nflverse-rosters/blob/main/.github/workflows/update_rosters.yaml)
runs at 07:07 UTC daily year-round. These are schedules, not completion-time
guarantees. The [availability documentation](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html#nflverse-gameschedule-data)
describes schedule updates every five minutes during the season. Rechecking
more often cannot create newer injury reports than the upstream publishes.

sideline collects centrally once an hour at minute 23 and publishes one compact
static dataset through the existing GitHub Pages build. Each scheduled run makes
one download attempt per source: 96 source downloads per scheduled day,
approximately 317 MB/day at the September 13 observed sizes, plus the HTTPS requests needed
to follow release redirects. Each download permits at most three redirects and
no immediate retries. Manual/deployment runs add four download attempts.
Visitors read the same artifact and never multiply provider requests. Hourly
checks improve schedule freshness and catch delayed upstream runs; they do not
turn daily injury collection into live reporting.

The refresh workflow runs the Node adapter, tests and build; the historical
Python research suite remains part of source-change verification. A failed
collection leaves the previous published artifact unchanged and ageing. Neither
raw downloads nor the generated dataset are committed to Git. Deployment
artifacts expire after one day. See [DASHBOARD.md](DASHBOARD.md) and the checked-in
workflow for the operating commands. Source vintage, retrieval time, incomplete
coverage and stale states remain visible after successful retrieval. Requests
are bounded; rate limits fail the run without a tight retry loop.

GitHub documents [scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
as best effort: runs can be delayed or dropped under load, and schedules in
public repositories can be disabled after 60 days without repository activity.
The off-hour minute reduces contention; it cannot guarantee execution. Revive
the schedule explicitly if GitHub disables it, and verify a fresh deployment
before claiming that refresh has resumed.

The four observed downloads total approximately 13.2 MB, including a 10.1 MB
gzip depth-chart archive. GitHub's
[release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#storage-and-bandwidth-quotas)
specify no release bandwidth quota; they permit up to 1,000 assets per release
and require each asset to be below 2 GiB. This is not an availability guarantee
or permission to ignore abuse controls. Direct asset downloads do not require
the REST metadata API. If metadata calls are added, the
[REST limit](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
is 60 unauthenticated requests per hour per originating IP; authenticated
workflow tokens have a separate 1,000-per-hour repository allowance. Do not add
an account, paid runner, paid API, metered service or browser credential.

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
is available for public repositories on GitHub Free, including organizations.
Its published-site limit is 1 GB, soft bandwidth limit is 100 GB/month, and
deployment timeout is ten minutes. The ten-builds-per-hour soft limit does not
apply to custom Actions publishing. Rate limiting or quota exhaustion can still
make the site unavailable; do not solve this by enabling a paid service.

[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
makes standard GitHub-hosted runners free for public repositories and Pages.
Use standard `ubuntu-latest`; larger runners are charged even for public repos.
Storage is not an unlimited allowance: GitHub Free for organizations includes
500 MB of shared artifact/Packages storage and 10 GB of cache per repository.
Keep this small site's deployment artifacts at one-day retention, avoid raw
data/cache archives, and monitor aggregate organization storage before expanding
retention. No billing settings or paid capacity are part of this integration.

## Alternatives reviewed

| Candidate                                                                                                             | Current findings and reason not selected                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Sleeper API](https://docs.sleeper.com/)                                                                              | Free noncommercial read API, no token; suggested ceiling below 1,000 calls/minute. The player map is intended to be cached and requested at most daily. It supplies player status fields, not a documented complete weekly practice/game report or NFL schedule endpoint. Its [general terms](https://support.sleeper.com/en/articles/5486620-general-terms-of-use) restrict automated extraction outside authorization; API access alone is not an unrestricted redistribution license. |
| ESPN                                                                                                                  | No current public redistribution grant or supported quota for the unofficial injury endpoint was established. The [Disney terms applying to ESPN](https://disneytermsofuse.com/english/) restrict automated extraction and public distribution without permission. Do not treat the retained historical watchlist collector as an authorized dashboard feed.                                                                                                                             |
| Official NFL/team pages                                                                                               | [NFL terms](https://www.nfl.com/legal/terms/) require consent for systematic collection. Direct scraping is not selected.                                                                                                                                                                                                                                                                                                                                                                |
| [API-Sports NFL](https://www.api-football.com/news/post/how-to-get-started-with-api-nfl-the-complete-beginners-guide) | Its August 2026 guide lists a free 100 requests/day, 10/minute plan, no card, with all endpoints; actual injury coverage requires a season coverage check. Its [terms](https://api-sports.io/terms) explicitly withhold a publication license and direct users to rights holders. No account was created.                                                                                                                                                                                |
| [BALLDONTLIE NFL](https://nfl.balldontlie.io/)                                                                        | Free access is five requests/minute for teams, players and games. Injuries and active players require the $9.99/month ALL-STAR tier; a temporary trial is not zero-cost ongoing operation.                                                                                                                                                                                                                                                                                               |
| [MySportsFeeds](https://www.mysportsfeeds.com/)                                                                       | Advertises free personal/private access; [current-season discounts](https://www.mysportsfeeds.com/register) require contacting the provider. No zero-cost public-display permission was established.                                                                                                                                                                                                                                                                                     |
| [NFLMeta](https://nflmeta.org/pricing)                                                                                | Free is 5,000 requests/month, 20/minute and 25,000 rows/month, with card verification. [Terms](https://nflmeta.org/terms) restrict Free to personal research/private evaluation and restrict dataset redistribution. No account or billing change was made.                                                                                                                                                                                                                              |

The selected integration supplies injury context, not evidence of fantasy-point
effects. Positional relevance is a qualified football hypothesis. Counts,
practice participation and game designations do not measure advantage, assign
individual coverage or justify numerical player boosts.

## September 14 contribution and game-state extension

The approved fifth input is the fixed 2025 regular-season defensive `stats_player`
release, collected and normalized separately under the reviewed publisher CC BY
4.0 grant. [CONTRIBUTION_REVIEW.md](CONTRIBUTION_REVIEW.md) records exact source
URLs, definitions, rights limits, observed coverage and excluded PFR/FTN families.
Historical event totals are not current quality or participation. The initial
223 KB derived artifact covers 1,034 defenders and 10,404 stat-game records across
272 games/all 32 teams; independent completeness remains partial.

[GAME_STATUS_REVIEW.md](GAME_STATUS_REVIEW.md) records the actual schedule schema:
no live/final/cancelled/postponed state is provided. Scores and elapsed kickoff
do not establish one. No new game-status source or faster upstream collection
is introduced. The browser checks shared data and updates clock labels; it does
not force injury-source updates.

## October 8, 2026 freshness and coverage investigation

This is a point-in-time observation, not a new source or scheduling policy.
The live `current.json`, a fresh Chromium response and the existing Pages
artifact from [run 37754495107](https://github.com/snowball-projects/sideline/actions/runs/37754495107)
all carried the same generated feed. The downloaded artifact and public JSON
matched SHA-256 `e71a4a1b6d29313df2a3eaa2e98c96a117a76a7b66faff9a64556c7365586149`.

| Event | Exact UTC timestamp |
| --- | --- |
| Published injury asset update | 2026-10-08T06:01:28.000Z |
| sideline retrieved injuries | 2026-10-08T09:07:57.408Z |
| sideline generated feed | 2026-10-08T09:07:57.610Z |
| Pages artifact created | 2026-10-08T09:08:01Z |
| Live JSON HTTP Last-Modified | 2026-10-08T09:08:10Z |
| Pages action reported success | 2026-10-08T09:08:13.7636126Z |
| Public HTTP response observed | 2026-10-08T15:41:49Z |
| Fresh source inspection generated (inspection only) | 2026-10-08T15:43:22.295Z |

“File 9h old” at approximately 15:41 UTC is the floored difference from
06:01:28, not the age of the 09:07 collection or the original team report.
`reported_at` remains null: the current source supplies no report or practice-day
timestamp. A browser check reads same-origin JSON with `cache: no-cache`; it
cannot cause a collection or establish a new original-report date. The observed
public response was a cache miss (`Age: 0`), and a new browser session loaded
`app.mjs?v=0.9.1` and the same feed.

Week 5 contains 21 team reports and 222 all-position injury rows. Exact matchup
and stable-ID checks for the founder's three WR comparisons produced:

| Selected WR | Opponent | Team report rows | Defensive matches | Roster defenders without an injury entry |
| --- | --- | ---: | ---: | ---: |
| Parker Washington (JAX) | PHI | report absent | 0 | 36 |
| Denzel Boston (CLE) | NYJ | 8 | 3 | 38 |
| Malachi Fields (NYG) | WAS | 23 | 11 | 27 |

All reported defensive IDs for NYJ and WAS match their current roster; neither
has a report-only defensive identity. NYJ's Francisco Mauigoa and Jarvis
Brownlee Jr. report DNP; Kingsley Enagbare reports LP. WAS has four LP, three
DNP and four Full defensive rows. These rows have no game designation. The
other NYJ/WAS defenders are absent from partial source reports, and PHI has
missing team coverage. Neither case establishes health. Complete-report omissions
remain separate in the UI. If a same-name report identity has a different ID,
both identities remain intact and the mismatch is labelled; names never repair
joins or transfer statuses.

The current [publisher injury workflow](https://github.com/nflverse/nflverse-rosters/blob/main/.github/workflows/update_injuries.yaml)
configures 07:07 UTC daily in September–February. Its October 8
[scheduled run 37793089786](https://github.com/nflverse/nflverse-rosters/actions/runs/37793089786)
was created and started at **14:30:53Z** and finished at **14:32:52Z**; the injury
asset update became **14:32:41Z**. The fresh inspection saw that newer file,
roster update 14:34:41Z, depth update 14:33:15Z and schedule update 15:06:52Z,
but still the same 21 Week 5 teams, NYJ 8 rows, WAS 23 and no PHI. Thus collecting
the newer file would reduce file age but would not fill this coverage gap.

sideline still configures `23 * * * *`. Actual scheduled runs on October 8 were
created at **02:02:49Z** and **09:07:45Z**; no later run was present during this
inspection. The latter also started at 09:07:45Z, so the observed delay was
before run creation, not a long executing collection. Upstream has the same
created/start pattern. The APIs do not identify the scheduler's internal reason
for these gaps; configured cron is not evidence that every hourly trigger ran.
The preceding three sideline failures ([October 6 21:42 run](https://github.com/snowball-projects/sideline/actions/runs/37535725812),
[October 7 01:38 run](https://github.com/snowball-projects/sideline/actions/runs/37558086604),
[October 7 08:49 run](https://github.com/snowball-projects/sideline/actions/runs/37596351781))
each failed on the required schedule release's HTTP 404. The collector correctly
rejected the update and kept the previous deployment. Later successful runs
published normally; the inspected 09:08 artifact proves that deployment succeeded.
No workflow was dispatched, no refresh schedule changed and no site deployed by
this investigation. An immediate publication or a scheduling change requires
separate approval; a new source completeness claim requires separate evidence.

A local `npm run refresh` generated a validated feed at
`2026-10-08T15:54:54.492Z`, with the newer source-file timestamps above and
unchanged Week 5 coverage. `npm run build:live` included both validated current
and 2025 historical data. These ignored local files were used for verification
only and were not committed or deployed.

## October 8, 2026 optional player-details observation

The local v0.9.3 collector generated a validated artifact at
**2026-10-08T17:37:44.790Z** using the same four approved source assets. Injury
file update remains **14:32:41Z**, roster **14:34:41Z**, depth **14:33:15Z**,
and schedule **17:16:34Z**. Week 5 still has 21 teams and 222 all-position rows;
PHI remains absent. This local collection does not publish or change schedules.

The current roster has 2,617 normalized identities, including 1,243 defenders.
Supported defender bio coverage: birth date 1,227; league experience and NFL
eligibility year 1,243 each; college 1,216; draft club/pick 841 each. Optional
facts reuse the reviewed roster CSV; no new source requests or visitor calls
are added. The [roster dictionary](https://raw.githubusercontent.com/nflverse/nflreadr/main/data-raw/dictionary_rosters.csv)
describes birth date as Sleeper API-derived, `years_exp` as years played in the
league, and `entry_year` as first NFL eligibility. Roster `rookie_year` is
separately defined as the year rookie eligibility was lost, so it is not
relabeled rookie season. Missing draft fields do not establish undrafted
status. Draft clubs preserve source codes AZ/OAK/SD/STL rather than replacing
historical locations with current franchises. No source field establishes
uninterrupted current-team or current-defense tenure.

Player details can display current-season injury entries already collected,
through the selected week, joining exact IDs across reported teams. Preserve
primary and secondary report/practice injury text, deduplicating identical
text without classifying body parts or counting separate injuries. Count
**reported weeks**, not injuries, games missed or healthy weeks. These are the
latest stored weekly entries, not a preserved pregame reconstruction. Earlier
reports remain historical details and never supply a current badge or status.

The inspected 2025 and 2026 injury CSVs have no practice date/day or report
timestamp. The 2024 asset has `date_modified`, but it does not establish the
practice calendar date or preserve every daily revision. Seasonal release
assets and quarterly archive backups are not a daily practice-history contract.
Current practice is therefore labelled undated. Multi-season injury collection,
player-reference rookie seasons and historical roster seasons need a bounded
source/identity review before implementation. Roster observations must not be
represented as uninterrupted tenure.

The [Eagles official report](https://www.philadelphiaeagles.com/team/injury-report/)
showed Week 5 PHI/JAX Wednesday practice entries while PHI was absent from
nflverse; Thursday/Friday cells were blank. Its weekday labels alone do not
establish a calendar date without confirming the fixture. This verifies a feed
coverage gap, not an absent official report. The missing-coverage label now
says “missing from this feed.” No direct team-site ingestion, 32-team crawler,
news redistribution or isolated coordinator table is added. Those sources
need their own coverage and publication-rights review.

Existing 2025 REG production and historical team subtotals remain unchanged.
The current [player-stat documentation](https://nflreadr.nflverse.com/reference/load_player_stats.html)
and [variable definitions](https://nflfastr.com/articles/stats_variables.html)
support investigating additional season/team windows; new tackle categories
must remain distinct rather than reusing removed legacy `def_tackles` fields.
No coordinator fields exist in the current reviewed feeds. Coordinator names,
tenure, prior teams and predecessors require a separately sourced league-wide
model; team consultancy is not coordinator tenure.

## October 8, 2026 bounded rookie/roster-history review

This decision expands the reviewed nflverse release integration to exactly
three assets below. The publisher CC BY 4.0 license was rechecked; its blob
remains `0fb847eb09afc05734c2f1aa34bc3ebd995a072a`. Attribution, source links,
modification descriptions and the source warranty disclaimer remain preserved.
This does not expand the data grant to media, reference photos, third-party
ratings, reference draft/PFR fields, or direct team-site collection.

| Fixed release asset | Source file update UTC | Selected observation |
| --- | --- | --- |
| [players.csv.gz](https://github.com/nflverse/nflverse-data/releases/download/players/players.csv.gz) | 2026-10-08 15:34:24Z | Explicit `rookie_season`, exact GSIS identity |
| [roster_weekly_2025.csv.gz](https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2025.csv.gz) | 2026-03-14 07:33:06Z | 2025 REG/POST team and observed week sets |
| [roster_weekly_2026.csv.gz](https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv.gz) | 2026-10-08 14:34:38Z | 2026 REG/POST team and observed week sets |

The ignored local optional artifact generated **2026-10-08T18:25:53.800Z**
matched all **1,243** current defensive identities; **1,227** have an explicit
rookie season. The remaining 16 are not inferred from draft, eligibility, age
or names. Weekly observations join 998 of those defenders in 2025 and all
1,243 in 2026. Their source records show multiple teams for 83 and 23 players
respectively; these counts describe observations, not transfer event dates.
Jarvis Brownlee has rookie season 2024 and 2025 TEN/NYJ observations; Frankie
Luvu has rookie season 2018 and WAS observations; Francisco Mauigoa has rookie
season 2025 and NYJ observations. Source weeks with gaps remain separate.

Only REG/POST records for current defenders survive. Departed CUT/RET/UFA/FA
observations are excluded; inactive, reserve and practice-squad observations
remain roster context. A week observation is not a game played, a first joining
date, or proof of uninterrupted current-team/current-defense tenure. Annual
rosters select the latest week and cannot replace this weekly history. These
are latest stored source observations, not preserved selected-week as-of data.

Three fixed central downloads use 4 MiB compressed and 20 MiB expanded bounds,
strict required columns, duplicate reference-ID rejection and fixed-season
validation. `web/player-history.json` is ignored, optional, atomic and separately
validated. Its browser schema caps 1 MB and retains explicit nullable rookie
season and season/phase/team/week sets with source-file and collection times.
Optional failure retains only validated prior local/browser facts or omits the
section; it does not block a fresh core injury publication. Visitors request
only same-origin artifacts. No new service, account, credential or schedule is
introduced. Build output remains an explicit allowlist.

The local core feed generated **2026-10-08T18:25:50.058Z** with injury file
**14:32:41Z**, retrieved separately from the unknown original report time.
The collector's new current-week audit has 30 scheduled teams, 21 reported,
nine missing (ARI, BUF, DEN, LAC, LAR, LV, PHI, SEA, SF), and confirmed CAR/KC
byes. Missing coverage still cannot mean health. The audit is diagnostic only;
there is no new board paragraph or source completeness claim.

The original dated-practice/daily-revision limits above still apply. The held
official-team source is not recollected or ingested, and the inaccessible
upstream nflapi repository is not pursued through alternate access paths.
Direct systematic team-site retrieval/publication requires a separate permission
decision. No outreach, paid accounts or new coordinator feed is introduced.
League-wide dated practice history and coordinator/predecessor coverage remain
separate research requirements; current roster observations cannot establish
defensive-coordinator tenure.

The follow-up documentation check confirms that [nflreadr injury reports](https://nflreadr.nflverse.com/reference/load_injuries.html)
describe weekly, season-level archives available since 2009, not daily snapshots.
The [weekly roster loader](https://nflreadr.nflverse.com/reference/load_rosters_weekly.html)
distinguishes weekly observations from annual latest-week selection and documents
availability back to 2002. Neither establishes dated practice progression.
[Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) offers CC0
structured data as a permissible coaching-research candidate; prose elsewhere
has separate share-alike terms. Current coordinator role/date/predecessor coverage
across all 32 teams is unmeasured, so permission alone is not a usable coaching
model and no coaching facts are published by this change.
