# Browser verification

The production UI has no runtime dependencies. Playwright is a development-only
verification tool. Use Node 24 and Python 3.12, then run:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:browser
```

The suite builds and serves `dist/` on port 8787. Both desktop Chromium and
390px touch/mobile Chromium run against that same public artifact. Browser
responses for `current.json` are intercepted in memory using the source adapter
and clearly synthetic test inputs in `field-fixture.mjs`; no fixture is written
to `web/current.json` or included in the build. Normal app requests remain local,
and optional historical production is explicitly unavailable in these cases.

Coverage includes two/six selections, desktop horizontal scrolling and mobile
stacking, compact named first-depth markers, long surnames and matching initials,
and minimum control sizes with no label/target collisions. Both eleven- and
twelve-person source first-depth sets remain visible, including at 320px; a
multiply-listed identity keeps its chart roles on one marker. Source chart
positions (including LCB/RCB/NB, FS/SS and LDE/RDE) take precedence over coarse
roster positions, while missing depth keeps anonymous coarse-position stacks.
The dense fixture retains forty defenders, twelve named first-depth identities,
generic DB/LB/DL stacks and a secondary-only FS/SS stack. Six-tile checks mix
that missing-report matchup with a smaller partial-report defense, asserting
desktop line-of-scrimmage alignment despite different role wrapping and notices.
Full-roster stack highlighting, All/Out/Uncertain filters, one shared missing
Week 5 report notice, and ordinary partial-report Unknown states are covered.
The existing pointer preview, keyboard/touch activation, repeated and interrupted
dismissal, deferred-clock Escape/depth-expiry regressions, week/selection changes
and explicit fictional mode remain part of the suite. Offscreen row activation
also checks that delayed pre-opening scroll events preserve details, while real
list scrolling after opening still dismisses them.

The `field browser checks` CI job runs on source pushes and pull requests using
standard public Ubuntu runners. It does not run on the hourly data-only refresh.
A source deployment waits for its successful completion. This job does not change
repository branch-protection settings or grant merge approval.

The `field-browser-evidence` artifact contains the HTML report, traces on
failure, failure screenshots, and positive screenshots of two/six selections,
scrolled named tiles, dense mixed-matchup charts, colliding-name and multi-role
details, missing reports, partial-report Unknown details, and missing-depth
states on desktop and mobile. Evidence is retained for one day. Review those images before merging;
passing geometry and behavior assertions do not replace visual review. Every
screenshot uses synthetic test data and is not evidence about real NFL players.
