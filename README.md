# sideline

A snowball project. Find an NFL player and see their opponent's injury report.

[Open sideline](https://snowball-projects.github.io/sideline/) ·
[Product scope](docs/PRODUCT.md) · [Dashboard guide](docs/DASHBOARD.md) ·
[Data sources](docs/DATA_SOURCES.md) · [Image credits](docs/MEDIA.md)

Version 0.9.6 adds optional 2024 defensive production in collapsed Player details, preserving the separate 2025 baseline and current injury statuses.

Search the current roster source by name, team or position and select up to six
players. A compact toolbar holds search, the week selector and information.
Each tile shows a schematic field with individual defensive Xs and position
stacks above an integrated roster panel. The field uses only source-backed
identities and position labels:
coarse DL/LB/DB roles never become invented cornerback/safety assignments or a
confirmed eleven-player lineup. Source first-depth individuals appear only
when that evidence exists and has
at most eleven members; otherwise position stacks represent the available
roster without assigning a person. Stacks highlight matching rows in All.
Every available defender remains accessible, including backups, inactive/reserve players and report-only identities.

All is the complete roster. Out contains explicit Out game designations;
Uncertain contains Questionable, Doubtful, LP and DNP, excluding game Out.
Missing status stays neutral in All and never means healthy. Source-backed
depth and roster context are secondary text. Hover, keyboard focus or tap an X
for compact injury, practice, game and recorded-stat details; expand Sources and timestamps for provenance. Escape, Close, outside
press and leaving the preview dismiss it. Remove a selected player with ×.
Mobile tiles stack; larger screens preserve aligned comparison fields.

Selections stay in the browser; there are no accounts or league connections.
Separate 2025 defensive-event history and expandable 2024 recorded production are available in details where a
stable record exists. Missing history is unknown; no injury-benefit score,
replacement-quality claim or invented assignment is supplied.
See [Contribution evidence](docs/CONTRIBUTION_REVIEW.md).

Refresh checks the latest shared files without forcing an upstream update.
Visible tabs check every five minutes, with failure backoff. File age remains
separate from unknown report time. Elapsed kickoff is labelled status
unconfirmed because the source supplies no live/final field; no scores are shown.

Optional defensive coaching facts cover all 32 teams: 31 formal coordinators
and Tampa Bay’s head coach/defensive playcaller, with compact role/start-season
lines. Selected prior jobs, prior coordinators, source links and individual
checked times stay collapsed in Sources. Unsupported facts/seasons are omitted;
coaching never changes injury status or comparison logic. See
[the coverage review](docs/COACHING_REVIEW.md).

The dashboard defaults to the current regular-season NFL week when the schedule
covers it. Explicit byes, missing schedules/reports, changed kickoffs, started
games and old collections have distinct states. Broad defensive-role context
is available within report entries. Injury counts do not measure advantage;
sideline supplies no point boosts, rankings or start/sit verdicts.

All 32 team logos are served locally with recorded provenance and use bases. Player photos are omitted pending a practical
licensed source. Source details, timestamps, privacy and licensing sit behind
the information buttons; the board keeps only compact operational exceptions.

## Current data and honest limits

The dashboard uses roster, schedule, injury and depth-chart releases from **nflverse-data**
under its explicit **CC BY 4.0 data license**. The integration preserves all
matching injury rows and credits the source; independent completeness against
original team reports is not established. Source report dates are currently
absent. Information popups distinguish that unknown vintage from file
modification and sideline collection times.

The collector checks four required sources plus five optional historical
sources in the existing hourly GitHub Actions run at minute 23.
Upstream injury and roster files normally update daily, not live. Schedules
update more often. Runs can be delayed, fail or become dormant; a failed
core collection leaves the previous site visible with ageing timestamps. Failed
history collection retains a validated local copy if available, or omits history,
without preventing fresh injury publication. Data gaps
never imply a healthy opponent.

See [the source review](docs/DATA_SOURCES.md) for the September 13 evidence,
publisher-license basis, upstream provenance limitation, refresh schedules and
free quotas. The existing public GitHub Pages site and standard public Actions
runners require no API key or new paid service. Browser requests stay on the
site's origin. A labelled fictional example is available when current data
cannot be loaded.

## Run

Node 24 and Python 3.12:

```sh
npm ci
npm test
node --check web/app.mjs
npm run build
npm run dev
```

Preview: `http://127.0.0.1:8786/`. An offline build includes the interface and
fictional fixture. To collect the approved public data before building:

```sh
npm run refresh
npm run build
```

The collector writes ignored `web/current.json` atomically after validation.
Raw provider files are never written to the repository. Builds copy an explicit
public allowlist to `dist/`; private inputs and historical research are excluded.
`npm run build:live` requires validated current data, and is the publication path.

The Python research suite remains credential-free:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
```

Both unit suites and Chromium desktop/mobile browser checks run on source
changes. To run the browser suite locally after installing Node dependencies:

```sh
npx playwright install --with-deps chromium
npm run test:browser
```

Browser tests intercept only synthetic source-shaped fixtures in the test
process and never write them to production artifacts. Screenshot/report evidence
is retained in CI for one day. The separate data-refresh run verifies the
Node suite and static build. Deployment and recovery are documented in
[the dashboard guide](docs/DASHBOARD.md).

## Preserved research

The founder's September 13 direction replaces the earlier manual comparison
flow. League settings, roster construction/imports, ESPN Fantasy connections,
multi-league management, drafts, waivers, trades, general rankings and a
start/sit engine are outside product scope.

The Python implementation and frozen evidence remain available for research:

| Source                                                                           | Purpose                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| [injury_snapshot.py](scripts/injury_snapshot.py)                                 | Append-only, verified point-in-time inputs  |
| [injury_signal.py](scripts/injury_signal.py)                                     | Experimental defender and unit availability |
| [calibrate_defender_availability.py](scripts/calibrate_defender_availability.py) | Historical calibration and evaluation       |
| [export_espn_history.py](scripts/export_espn_history.py)                         | Historical private league exports           |
| [draft_board.py](scripts/draft_board.py)                                         | Historical draft experiments                |

These utilities are not part of the browser flow or active roadmap. Local
credentials, league configuration, private history and generated artifacts
remain ignored. Provider access in historical scripts is not authorization for
public collection or redistribution.

The [frozen availability study](reports/2021-2024-defender-availability-calibration.md)
measures defender participation and workload, not opposing fantasy outcomes.
The [older research proposal](reports/2026-opponent-injury-signal-proposal.md)
and [draft protocol](reports/2026-draft-decision-protocol.md) remain historical
records. The previous dashboard is preserved in Git at
`ba7bdc8d97004ed1f22be6d9f97075722f6a622b`.

## License

Copyright 2026 snowball. Original software, documentation and synthetic fixtures
use the [MIT License](LICENSE). Published nflverse data retain **CC BY 4.0**;
third-party packages and data retain their own terms. See [third-party notices](THIRD-PARTY-NOTICES.md).
Team logos have their own documented [public-domain bases and trademark
status](docs/MEDIA.md). The software license does not cover team marks, private
inputs or personal writing.

[Operations](https://snowball-projects.github.io/operations/#sideline)
