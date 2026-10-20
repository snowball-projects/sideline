# Freshness watchdog - draft source, not deployed

This branch preserves one unfinished operator-side experiment so contributors
can review it from a fresh checkout. It is not a completed freshness repair,
approved scheduler, or production feature. No workflow or public data changed.

The script defaults to GET-only inspection. Its optional dispatch path and the
uninstalled systemd templates require a separate activation decision. Do not
create credentials, install units, or dispatch to validate this preservation PR.

Known gaps:

- The historical default is 90 minutes of `generated_at` assembly age. Main's
  schedule is four-hourly, and the proposed freshness contract evaluates each
  required source's fetch age separately from original report age. Reconcile
  these semantics and adopt a policy before any recovery activation.
- The draft transport retains one object per response chunk and lacks current
  main's empty-read guard. Its byte cap alone is not a complete resource bound.
- An overdue dry run returns a successful `noop` with `dry_run_would_dispatch`;
  it does not supply an unattended alert or freshness guarantee.
- Durable state, a single scheduler owner, alert routing and operator recovery
  are not configured. Normal GitHub/main activity can race with a dispatch.
- Independent review against current main and operational acceptance remain
  outstanding. Synthetic tests are not evidence of a live repair.

Only source, tests, documentation and uninstalled templates are included.
Support tickets, private settings screenshots, credentials, live source captures
and operational receipts remain outside the repository. Further work should use
the shared cloud development environment; these local originals are retained.
