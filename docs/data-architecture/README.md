# Data architecture — OA Universe alignment

Working folder for aligning the Organising DB's structure and content with the OA Universe sector map
(September 2026). Start with `OA_UNIVERSE_ALIGNMENT_PLAN.md`.

| Path | What it is |
|---|---|
| `OA_UNIVERSE_ALIGNMENT_PLAN.md` | Findings from the schema and content review, the target model, the interrogation method, work packages, decision register |
| `ORCHESTRATION_PROMPT.md` | The prompt for the Claude Code session that orchestrates phases 0 to 6: team and model table, rules, work-package protocol, run-sheet handover, per-package assignments |
| `reference/OA_universe_context_for_database_reconciliation.md` | The map owner's account of the workbook and the modelling distinctions it forces |
| `reference/OA_universe.xlsx` | The sector map itself (cell comments and colour tags preserved) |
| `reference/oa-universe-tabs/*.csv` | One CSV per workbook tab, for diff-able reference and scripted loads |
| `reference/oa-universe-tabs/viz/index.html` | Cover page linking a charted, searchable HTML view of each tab — open it in a browser, no server needed |
| `../../scripts/data-hygiene/oa-universe/build_tab_visualisations.py` | Regenerates those HTML pages from the CSVs |
| `worksheets/employers_adjudication_2026-09-22.csv` | Every production employer with lineage, proposed canonical mapping, action and open question; decision columns to fill in |
| `worksheets/worksites_adjudication_2026-09-22.csv` | Every production worksite with proposed grain, OA Universe asset, action and open question; decision columns to fill in |
| `../../scripts/data-hygiene/oa-universe/` | Read-only profiling pack (00–07) that produced the plan's numbers and re-measures each washing round |

Worksheets are snapshots dated in the file name. A new round exports a new dated pair; decisions are
copied forward and, once Phase 2 lands, recorded in the `fact_reviews` table instead.
