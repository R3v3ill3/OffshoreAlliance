# OUX WP2.4c — nesting shape

`00_nesting_shape.sql` is read-only (four `SELECT`s, no write, no `SET LOCAL`, no environment guard): per campaign, the sub-unit-only groups (a), the paired / child-only / orphan sub-unit placements (b–e) and the nesting edges (f), for the data-invariant finding of `docs/organiser-ux-review/wp/wp2.4c.md` §3.2 / §5.
Run it on normal dev (agent, read is free, with the operator's confirmation) and on production (operator); paste both outputs into wp2.4c.md §9.2 — they settle NP-b and stop condition 6. It prints aggregates and group names only.
