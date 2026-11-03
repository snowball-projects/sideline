# sideline

All 32 NFL teams, with pre-week records, unit statistics, starters and injuries.
Phones use overlapping team strips with a lifted, scrollable matchup and bottom
pile. Larger screens keep the team grid and separate matchup page.
A snowball project. [Open sideline](https://snowball-projects.github.io/sideline/).

Node 24:

```sh
npm ci
npm test
npm run refresh
npm run build
npm run dev
```

Preview: http://127.0.0.1:8786/. Browser checks: `npx playwright install --with-deps chromium`,
then `npm run test:browser`.

One collector checks six nflverse datasets and writes `web/current.json`.
GitHub Actions refreshes every four hours and publishes GitHub Pages.
Failed collection leaves the published site intact. Records and statistics use
completed league weeks before the selected week. Stars mark top-10 positional
yards/touchdown leaders or defensive count leaders, including ties. Tracked
starter stats publish pre-week values, league ranks and the measures earning stars.
Depth charts retain observed slot order; missing charts and reports stay unknown.
Compare choices remain in your browser. Cards use name pills when wide and 40px
position dots when narrow; larger-screen matchup pages always use pills. Five
injury badges have a compact key; other players stay unmarked. Player details show
supplied injury facts, ranked stats and ordered replacements for game designations.
Unknown Out counts sort after supported counts.

[MIT software](LICENSE). Original data: CC0. nflverse: CC BY 4.0.
Team marks retain their owners’ terms. [Sources and credits](THIRD-PARTY-NOTICES.md).
