# OUX WP2.4 — phase-2 metric

`00_phase2_metrics.sql` is read-only (two `SELECT`s, no write, no `SET LOCAL`, no environment guard): the share of memberships in at least one unit and the median unit size, for the phase-2 exit line of `docs/organiser-ux-review/wp/wp2.4.md` §3.19 / §5.
Run it on normal dev (agent, read is free) and on production (operator, at phase exit); paste both outputs into wp2.4.md §9.2. It prints aggregates only.
