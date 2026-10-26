# sideline

A snowball project. NFL team cards, weekly opponents, starters and injury reports.
[Open sideline](https://snowball-projects.github.io/sideline/).

Node 24:

```sh
npm ci
npm test
node --check web/app.mjs
npm run build
npm run dev
```

Preview at http://127.0.0.1:8786/. For desktop/mobile browser checks, run
`npx playwright install --with-deps chromium`, then `npm run test:browser`.

`npm run refresh` collects public nflverse roster, schedule, injury, depth and
optional historical/statistical data. `npm run build:live` builds the live site.
GitHub Actions refreshes and publishes every four hours. Failed collection keeps
the previous site; each source retains its dates. Missing injury data is unknown.

[MIT software](LICENSE). Original data are CC0; third-party data and team marks
retain their own terms and [credits](THIRD-PARTY-NOTICES.md).
