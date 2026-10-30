# sideline

NFL offenses against their weekly opposing defenses, with starters, injuries and
pre-week league ranks. A snowball project. [Open sideline](https://snowball-projects.github.io/sideline/).

Node 24:

```sh
npm ci
npm test
npm run refresh
npm run build
npm run dev
```

Preview at http://127.0.0.1:8786/. Browser checks: install Chromium with
`npx playwright install --with-deps chromium`, then `npm run test:browser`.

One collector checks six nflverse datasets and writes `web/current.json`.
GitHub Actions refreshes every four hours and publishes static GitHub Pages.
Failed collection leaves the published site intact. Injury reports have no
publication dates; missing rows do not establish health. Historical starters
require depth observations inside that week before kickoff. Stats use completed
league weeks before the selected week; source gaps remain unavailable.

[MIT software](LICENSE). Original data: CC0. nflverse: CC BY 4.0.
Team marks retain their owners’ terms. [Sources and credits](THIRD-PARTY-NOTICES.md).
