# sideline freshness watchdog - unfinished draft

Migration source preservation only. Read [known gaps](FRESHNESS_WATCHDOG_STATUS.md)
before using this draft. The defaults below are historical and not an adopted
operating policy. No scheduler, token or deployment is enabled.

Status: **planned, uninstalled**. This is one logical job, `sideline-freshness`,
owned by sideline. No token, scheduler, service account, deployment, or live
dispatch is created by these files. The existing GitHub cron and publication
workflow are unchanged. Host inventories reference this document and the
versioned command/templates; they do not duplicate sideline settings in other
projects.

## Command and configuration contract

Requires Node 24, HTTPS outbound access, and no package installation for the
watchdog itself. One invocation performs one inspection/recovery iteration:

```sh
node scripts/freshness-watchdog.mjs --dry-run
```

The default is dry-run even without that flag. It only reads the public feed
and, when overdue, GitHub workflow state. It does not acquire a lock, write
state, run a collector, or dispatch. `npm run watchdog` is the same default.
Offline synthetic checks: `node --test tests/freshness-watchdog.test.mjs`.

After separate approval for credentials and activation, the execution contract
is:

```sh
node scripts/freshness-watchdog.mjs --dispatch --state-file /var/lib/sideline-freshness/state.json
```

This command **publishes through the existing main workflow**. Do not run it
until that action and the credential are approved. The watchdog consumes
`SIDELINE_GITHUB_TOKEN` from its protected process environment, never an argument,
URL, browser artifact, log, or state file. Required GitHub access is a
fine-grained token restricted to `snowball-projects/sideline`, with **Actions:
write**, issued to a repository writer and approved under applicable organization
policy. A repository-scoped GitHub App installation with Actions write is an
alternative. Neither requires Contents write, an upstream data credential, or
additional Pages permissions. The existing workflow supplies Pages/OIDC access.

| Option | Default | Meaning |
| --- | --- | --- |
| `--dry-run` | Default mode | GET-only inspection; zero writes |
| `--dispatch` | Off | Permit at most one POST; requires token and state |
| `--state-file ABSOLUTE_PATH` | None | Required durable state/lock location for dispatch |
| `--max-age-minutes NUMBER` | 90 | Collection is overdue strictly beyond this age; range 60–1440 |
| `--wait-minutes NUMBER` | 20 | Whole iteration network/retry/poll budget; range 1–30 |

The feed URL, repository, `tests.yml`, and `main` live once in
`scripts/freshness-watchdog.mjs`. Provider migration changes the scheduler wrapper,
not these targets or safety decisions. The borrowed Spark is a temporary host,
not an availability commitment. There are no dependencies on Spark hardware,
an SSH address, Fairway, MODO, or a provider SDK.

## Behavior and bounds

1. Read the published `current.json` over HTTPS without forwarding the GitHub
   credential. Check schema 2/live mode and a valid UTC collection timestamp;
   reject a future timestamp beyond five minutes of clock skew. This monitors
   collection age, not report age, coverage, player health, or upstream freshness.
2. If current, exit `noop`. If overdue, inspect each active main workflow status
   (`queued`, `in_progress`, `waiting`, `pending`, `requested`). Status-filtered
   queries detect old blocked runs beyond newer completed history. Pull-request
   runs and other branches do not share main's concurrency group. Incomplete or
   malformed inspection fails closed. An active main run exits `skipped-busy`;
   its completion is checked on the next iteration, never cancelled by this job.
3. In dispatch mode, hold the exclusive state lock throughout the iteration.
   Reject corrupt state. A persisted dispatch intent suppresses another POST for
   45 minutes, including after a crash or uncertain API response. Recheck both
   feed and active runs immediately before dispatch.
4. Atomically persist intent **before** POSTing `{"ref":"main"}` to the existing
   workflow. There is no automatic POST retry, even for a timeout or HTTP 5xx:
   GitHub might have accepted it. A response with a run ID identifies the request;
   a legacy 204 is also supported. An uncertain response proceeds to publication
   verification instead of issuing another mutation.
5. Read the public feed after 30 seconds, then 60 seconds, then at most every
   120 seconds. A fresh timestamp must advance beyond the pre-dispatch baseline.
   An HTTP acknowledgement or successful workflow alone is insufficient.
   Regression, invalid data, read failure, or exhaustion fails clearly. At most
   20 publication polls occur, within the whole-iteration deadline.

GETs use at most three attempts, 1/3-second retry backoff, and longer server
`Retry-After`/rate-reset delays when required. Only transient transport failures,
HTTP 429, explicit HTTP 403 rate limiting, and HTTP 5xx are retryable. A delay
that exceeds the remaining budget fails instead of ignoring it. Each request
has a maximum ten-second timeout, including body reads. Responses are capped at
4 MiB; redirects are rejected. State reads are capped at 4 KiB. Raw exceptions,
response bodies, credential contents, and arbitrary CLI arguments are not logged.
The watchdog never downloads provider datasets or changes generated files.

One JSON line reports the terminal outcome: `noop`, `skipped-busy`, `verified`,
or `failed`. A POST also emits a `dispatched` progress line with either
`awaiting_publication` or `dispatch_response_uncertain`; this is **not** a terminal
success. The final line is authoritative. Records contain the job ID, reason,
UTC check time, dispatch-attempt flag, and only validated timestamps/run IDs;
failures may include a phase and HTTP status. Exit status is 1 for `failed`,
otherwise 0. Unknown faults have a fixed sanitized failure code.

## State ownership and operational limits

Dispatch mode requires a state file on a durable private filesystem. The local
adapter creates a mode-0700 parent/lock directory and atomically replaces a
mode-0600 intent file. Do not place it in a deployment artifact or tracked tree.
The `.watchdog/` directory is ignored for local experiments. The token is never
stored there. File permissions of an existing parent directory remain the
operator's responsibility.

The exclusive lock is an adjacent directory, `state.json.lock`. It is released
on normal completion and preserved on abrupt process termination. There is no
unsafe automatic lock expiry: after a crash, an operator must confirm no
watchdog process remains and inspect GitHub active runs before removing only
the stale lock directory. Keep the intent file/cooldown. An abandoned lock or
repeated `skipped-busy` result requires operator attention; success exit status
for busy does not establish data freshness.

Exactly **one scheduler owner** should activate this job. Two independent hosts
with separate state cannot prevent each other's dispatches. A managed runner
with ephemeral storage must supply a durable shared state/lease adapter matching
`acquire`, `release`, `read`, and atomic `write`, or use a single persistent runner.
Do not approve stateless activation. On migration, stop the old owner first,
inspect active runs, transfer durable intent if needed, and activate the new
owner. The provider-neutral `runWatchdog` function accepts injected transport,
clock, sleep, reporter, and state for such wrappers and deterministic tests.

GitHub does not provide an atomic check-and-dispatch operation or a dispatch
idempotency key. A GitHub cron/push/manual run can appear after the final check;
the existing main concurrency policy can still cancel a run in that race. These
safeguards reduce duplicates, not promise exactly-once execution. The original
GitHub schedule is intentionally unchanged. Missing publication, persistent
busy/lock state, and missing watchdog heartbeats must be monitored independently.
No alert channel is configured by this implementation.

The proposed systemd pair in `ops/systemd/` is **two units for this one job**.
It defaults to dry-run, assumes a reviewed `/opt/sideline` checkout and Node 24
at the specified executable path, and is not installed. Its hourly minute-33
timer is independent of GitHub cron; persistence catches up after host downtime
without replaying every missed hourly refresh. Activation, local account/path
setup, token injection, and alert routing are separate operator decisions.

## Offline validation

Run `node --test tests/freshness-watchdog.test.mjs` with Node 24. Tests use fake
transport/time and temporary local state; they do not dispatch or fetch providers.
Private support/settings material and historical operational receipts are excluded
from this source-only draft. See the status note for review requirements.
