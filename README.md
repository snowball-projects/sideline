# sideline

All 32 NFL teams, with pre-week records, unit statistics, starters and injuries.
Compare any teams or open a matchup across the line of scrimmage.
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
yards/touchdown leaders or defensive count leaders, including ties.
Depth charts retain observed slot order; missing charts and reports stay unknown.
Compare choices remain in your browser. Cards use name pills when wide and 40px
position dots when narrow; team matchup pages always use pills. Visible status
codes have a compact key; unlisted players are unmarked and unknown Out counts
sort after supported counts.

[MIT software](LICENSE). Original data: CC0. nflverse: CC BY 4.0.
Team marks retain their owners’ terms. [Sources and credits](THIRD-PARTY-NOTICES.md).
