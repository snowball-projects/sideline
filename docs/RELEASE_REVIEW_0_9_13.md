# 0.9.13 release review

Prepared for manual review against main
`e13062ca93b188f79d5102df5c45e504d1e928d1`. This is an unreleased audit
increment; no merge, tag, release or deployment is part of its preparation.

## Changes

- Required and optional browser artifacts now use a shared bounded response
  reader. It checks advertised length early, counts actual decoded bytes,
  cancels at the first oversized chunk and releases its reader on failure.
  A bounded growing byte buffer avoids per-chunk object retention and preserves
  UTF-8 characters split across chunks. Fetch deadlines remain in force. A
  follow-up rejects the 33rd consecutive empty chunk without relying on timers;
  any byte progress resets this guard.
- Optional schema limits use UTF-8 bytes, including local collector/build
  validation. Coaching facts also enforce their existing cap in the validator.
  The previously unbounded local logo-manifest response now has a 64 KiB cap.
- Oversized core refreshes preserve the displayed feed and selections;
  oversized optional refreshes retain validated history while fresh core data
  updates. These paths have desktop and mobile browser regressions.
- Python dependencies are fully resolved and hash-pinned in `requirements.txt`;
  `requirements.in` retains direct update constraints. CI enforces hashes and
  selects Python checks for either dependency file. The existing exact npm
  graph and browser dependency-free runtime are retained.
- The scheduled collector changes only from `23 * * * *` to `23 */4 * * *`:
  six daily opportunities at 00:23/04:23/08:23/12:23/16:23/20:23 UTC. Other job
  conditions, permissions, runners, concurrency, retention and deploy behavior
  are retained. Trigger delivery remains best effort.
- Package/cache versions, changelog, current source counts, defensive statistic
  rank descriptions and first-depth wording are reconciled for 0.9.13.

## Executed verification

These are local executions on Omarchy using Node **24.19.0**, Python
**3.12.14** and the locked Playwright **1.63.0** Chromium. They are not claims
about historical CI runs. The full local suite and first PR CI run tested
implementation commit `096f1eadc1072eecd1dc1e7fcc1082ca50f53437`.
Follow-up documentation clarifies deliberate dependency upgrades and unreleased
status. The later empty-chunk guard has its own test evidence below; original
full-suite results are not retroactively attributed to a different commit.

| Check | Result |
| --- | --- |
| `npm ci` | Exact locked npm graph installed |
| `npm test` | 180 passed, zero failed/skipped; includes the real offline collector/build subprocess test |
| `node --check web/app.mjs` | Passed |
| `npm run test:browser -- --workers=2` without generated artifacts | 106 passed, four deliberate project-specific skips; zero failures |
| Fresh Python 3.12 venv, `pip install --require-hashes -r requirements.txt` | Seven pinned project dependencies installed |
| `pip check` in that fresh venv | No broken requirements |
| `python -m unittest discover -s tests -v` in that fresh venv | 44 passed |
| `npm audit --json` | Zero known vulnerabilities in the npm graph |
| `pip-audit -r requirements.txt --disable-pip --no-deps --format json` | Seven fully pinned dependencies checked; zero known vulnerabilities |
| `npm run refresh` then `npm run build:live` | Passed; all five generated optional artifacts collected and 57 public files built |
| `npm run build` without generated artifacts | Passed; 51 public files with explicit fictional fallback |

Follow-up empty-chunk guard verification on 2026-10-18 UTC passed the full
**182-test Node suite**, the **106 browser checks with four deliberate skips**,
both JavaScript syntax checks and the offline build. The no-progress regression
was first run against the earlier implementation and failed as expected before
the guard was added; the source limits itself so a regression cannot hang CI.
The guard also has a positive test for empty bursts separated by byte progress.
Python dependencies and implementation are unchanged from the 44-test run above.

Browser validation covers two/six tiles, scrolling, keyboard/touch popup
activation/dismissal, defensive ranks and leader-star geometry, interrupted
refreshes and the new oversized-response paths. Four project-specific skips
are deliberate: the narrow-touch test skips desktop, while hover and desktop
keyboard tests skip mobile. Screenshots and the HTML report use synthetic data.

Live collection was executed on **2026-10-18 UTC**, with core generation
`2026-10-18T00:42:14.269Z`. Generated artifacts are ignored and excluded from
the commit. They were moved intact to a separate local review archive before
checking the offline path; original checkouts and migration archives were
untouched. No private inputs, league configuration or credentials were used.

## Review boundaries

The approved UI layout, injury interpretation, scope and source permissions are
preserved. Existing two/six-hour collection-age labels remain unchanged;
"delayed" describes elapsed collection age and can occur between successful
four-hour runs. It does not establish collector failure or report vintage.

The proposed workflow cadence and hashed install need PR review before merge.
Local audits report known advisories at execution time, not a permanent safety
claim. Final Pages deployment verification requires a later authorized merge;
this preparation does not publish. Cloud migration, the closed support
investigation and the weekly-games schedule button remain outside this change.
Repository protection/security settings, credentials and preserved research
have not been changed.
