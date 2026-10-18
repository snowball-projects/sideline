# Freshness contract — proposed operating design

Aim for the freshest obtainable current data, especially in the hours before
games. **Six hours is a proposed maximum tolerable age, not a desired cadence or an
existing guarantee.** The measurable fetch-age limit below is a proposed
operating proxy, not a substitute for the report-freshness objective; adopting
it still needs agreement. Cron remains `23 */4 * * *` UTC. This document adds
no scheduler, monitor, alert or automatic recovery.

## Distinct clocks

| Clock | Evidence and meaning |
| --- | --- |
| Job attempt/run age | Main's `checks and Pages` workflow and its collection/deploy jobs: creation, start and completion times. A recent attempt, unrelated workflow, green unit test or queued job does not prove new data reached the site. |
| Successful fetch age | Each required source's `retrieved_at`, recorded after its response body finishes. Evaluate roster, schedule, injuries and depth separately; the oldest required fetch determines the conservative core age. |
| Assembly/publication age | `generated_at` describes core-feed assembly after the required downloads. Compare the successfully deployed artifact with live `current.json`; assembly time, deployment time and Pages' HTTP Last-Modified are not original report times. |
| Upstream file age | `source_updated_at` preserves the source asset's HTTP Last-Modified, or unknown. A successful re-fetch can advance `retrieved_at` without advancing this file clock. |
| Original report age | `reported_at`/`reported_date` only when supplied. The current injury source supplies neither: report age is **unknown**, even after a recent successful fetch or file update. |
| Browser check age | The browser's last attempted same-origin check, including failed attempts. It neither triggers provider collection nor resets the retained feed's timestamps. |

Use UTC instants and original provenance. Missing/unverifiable times cannot
establish freshness. Optional historical artifacts and manually checked coaching
facts retain their own clocks; they do not certify current injury freshness.

## Game relevance and last-good behavior

Prioritize known upcoming, uncanceled games, particularly the hours before
kickoff. The exact pre-game window and desired check cadence still need an
operating decision; do not equate that window with the six-hour age proposal.
Unknown kickoff or an outdated/missing schedule is uncertainty, not evidence
that no game needs attention. Byes and historical selections do not create a
current pre-game requirement. Elapsed kickoff alone does not establish final.

Core collection, validation or deployment failure keeps the last deployed valid
snapshot. Browser failure/rollback keeps the last validated view. Retention
never advances original fetch, file, assembly or report times. Failed optional
collection may retain validated history without blocking fresh core data.
Unknown coverage/vintage never becomes health or a fresh-report claim.

## What reaching six hours means

At six hours the proposed limit is reached; beyond it the successful-fetch
objective is breached if **any required live source** is older. This identifies
a collection/publication freshness gap, not the cause and not proof that an
underlying report changed. Conversely, a fetch below six hours does not prove
a six-hour-old report. Existing UI age labels are not a monitoring guarantee.

Detection would need to compare live per-source fetch times with main's actual
attempts and deployment outcomes. Recovery must verify a new live artifact,
not merely dispatch or queue a job. An agreed response could inspect the failed
stage and dispatch the existing workflow, preserving last-good data and source
rate/access limits. Before-game gaps deserve higher urgency. Alert lead time,
owner, response deadline and recovery trigger must be agreed before claiming
the maximum is enforced.

## Infrastructure choices to agree before implementation

1. Keep current cron with an explicit owner-driven inspection/manual-dispatch
   procedure. Simple, but no automatic six-hour assurance.
2. Agree a game-window-aware cadence and detection/recovery design in the
   existing workflow. A missing scheduled trigger cannot detect its own absence;
   the design must account for missed/queued jobs and deploy/served-artifact lag.
3. Consider an independent watcher only under a separately agreed design,
   including reliability, ownership, permissions and cost. None is added here.

No GitHub support case is reopened. Portfolio-owned repository safeguards are
outside this contract.
