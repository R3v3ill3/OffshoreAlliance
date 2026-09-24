# DA0.2 — production run sheet (operator only)

Ready-to-paste files generated from the committed scripts in the parent folder (`SET LOCAL oux.env = 'production';`
already inserted after `BEGIN;` in the mutating files). Supabase dashboard → production project → SQL Editor →
New query → paste the whole file → Run. One file per submission, in this order, each result pasted to the
orchestrator before the next. Run in a quiet window and before the next weekly membership batch.

Prerequisites (all met 2026-09-24): P1 (the 304 `member_number` values are synthetic), P2 (workers 681, 1537, 1541
synthetic), P6 (ten roles), P7 (rollback rehearsed on the clone: `90` succeeded and restored every data row).

| Step | File | Kind | Expect |
|---|---|---|---|
| P1 | `P1_preflight_before.sql` | read-only, ~250 rows | E Σ 3119/72, F Σ 16, G BLOCKER Σ 2, md5 `f6589df6…`, `workers_active` 5749 |
| P2 | `P2_remove_test_dataset.sql` | **mutating**, one transaction | `5085, 5900, 0, 0, 0, 0, emp=741 ws=185 cwm=50, 0, 3139, 3138` |
| P3 | `P3_preflight_after.sql` | read-only | entities absent; other campaigns' checksums identical to P1; 64 −1 membership |
| P4 | the profiling pack `scripts/data-hygiene/oa-universe/00`–`07` (read-only) | | `workers_active 5085`; `05` shows no `test` cluster |
| PX1 | `PX1_rollback.sql` | recovery only | only if P2's row differs from the expectation or the orchestrator says so |

Keep the hygiene-log rows for at least 30 days: PX1 restores everything from them until they are cleaned up.
