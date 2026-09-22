# Work-package plan files — OA Universe alignment

One file per work package, `wp/<wp-id>.md` (for example `wp/da0.2.md`), written by the package's planner and
kept current by the orchestrator, the implementer and the verifier. The ledger is `../PROGRESS.md`; the
specification is `../OA_UNIVERSE_ALIGNMENT_PLAN.md` §5 (rows) and §3 (design); decisions are §6.

## Required sections, in this order

1. **Specification** — the plan's §5 row verbatim, the §3 sections it depends on, and the decisions it consumes.
2. **Files** — every file to change with `path:line` citations of the code as it is today; new files; migrations
   (timestamped, under `supabase/migrations/`, never an edit of an applied file); scripts under
   `scripts/data-hygiene/da<wp-id>/` (for example `scripts/data-hygiene/da0.2/`).
3. **Scripts** — for each mutating script: the environment guard, the preflight (counts and checksums), the change,
   the hygiene-log rows it writes (`public._oux_hygiene_log`, WP0.4 shape), the post-assertions, the appended
   read-only verification `SELECT`, and the rollback whose precondition is exactly the state the script leaves.
4. **Acceptance evidence** — the checksums, pack files and counts that prove each acceptance criterion, stated
   before implementation so the verifier can paste against them.
5. **Operator inputs** — decisions or data the package needs from the operator, each tied to a step.
6. **Risks** — with the safeguard for each.
7. **Approval** — the orchestrator's written approval, dated, or the reasons the plan was sent back.
8. **Deviations from plan** — kept by the implementer; each with its justification.
9. **Verification record** — raw command output and rehearsal results pasted by the verifier (forward → rollback →
   forward again, with the checksums at each stage), plus the pack delta table.
10. **Review** — the reviewer's ranked findings with `path:line`, blocking or advisory, and the overall verdict;
    fix rounds recorded (two maximum).
11. **Run sheet record** — for production and clone runs: each step, the pasted output, the date and who ran it.

## Conventions

- Plans cite existing code and the plan's evidence by `path:line`; a plan that guesses is sent back.
- Personal data never appears in a plan file: organisation names, worksite names, agreement names, occupation
  titles, ids and counts only.
- Every number in a plan file comes from a pasted query or command result, never from memory.
- Run sheets follow `scripts/data-hygiene/oux-wp3.8/README.md`: one file per SQL Editor submission, `BEGIN;` then
  the environment guard (`public._oux_env_marker` on a clone or dev; on production the operator inserts
  `SET LOCAL oux.env = 'production';` after every `BEGIN;` — the committed file omits that line and names no
  project), a read-only verification `SELECT` after the final `COMMIT;`, run as `postgres` without RLS, never through
  the connector's `apply_migration` on production.
