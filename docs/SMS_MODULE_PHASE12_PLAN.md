# SMS Module — Phase 12 Implementation Plan (Assessment tracking & reporting)

**Parent brief:** `docs/SMS_EXPANSION_BRIEF.md` (§F assessment tracking and reporting; §5.1 decision 9 — SETTLED; §5.2 open question Q10 — **resolved in this phase**, see below; §6 delivery plan Phase 12)
**Builds on:** Phases 0–10 as implemented. All SMS migrations through `20260813055705_sms_p2p_item_body_override` are applied to **both** DEV (`dpnnmkhabysfdogllsyh`) and PROD (`gteygwfgjvczanmrwgbr`).
**Status:** Implemented 2026-08-17 (migration `20260813120000_sms_source_taxonomy.sql` applied DEV then PROD).
**Git:** primary working directory, no worktrees, single commit at phase end, per `CLAUDE.md`.

## Objectives

1. **(§F gap 1, decision 9)** Split `campaign_activity_ratings.source` `'sms'` into `sms_chat` / `sms_survey` / `sms_inbound`, updating **every** producer in the same change.
2. **(§F gap 2)** Add the reporting the module lacked: chat-session throughput and the assessment split, exposed per campaign and org-wide.
3. **(§F "verify, don't rebuild")** Confirm SMS-recorded ratings already reach the wall chart.

## Decisions taken in-phase

### Q10 — backfill of existing `source='sms'` rows: **reclassify by attributability**

The brief's ground truth (2026-08-11) was "zero `source='sms'` rows exist, so this may resolve to nothing to backfill". That is no longer true — 25 rows existed on PROD at implementation time. They are cleanly attributable, so they were reclassified rather than left as legacy:

- The inbox assessments route always passes the authenticated user as `p_actor_id`.
- `fn_sms_to_rating` passes `sms_interactions.created_by`, which the survey runtime leaves NULL.

So actor present ⇒ `sms_chat`, actor absent ⇒ `sms_survey`. Outcome on PROD: 1 → `sms_chat`, 24 → `sms_survey`, 0 rows left on the legacy value.

**`'sms'` is retained in the CHECK** rather than dropped. Removing a value is the change that breaks a producer nobody remembered; keeping it costs nothing and leaves the migration reversible in practice.

### The CHECK is written against the union of both databases

PROD carried `an_sync` / `an_report_import`; DEV did not (the brief's Q10 note). The new constraint lists the union plus the three SMS values, so applying it converges DEV up to PROD instead of failing on PROD data.

### Discriminating `sms_survey` from `sms_inbound`

`fn_sms_to_rating` fires on any rating-bearing inbound `sms_interactions` row and previously could not tell which pathway produced it. Rather than sniffing the `notes` text, a new nullable `sms_interactions.rating_origin` (`'survey' | 'inbound_keyword'`) is stamped by the survey runtime and read by the trigger. Anything unstamped is a conversational/keyword reply ⇒ `sms_inbound`. Existing rating-bearing rows were backfilled to `'survey'`, which is sound because the survey runtime is the sole writer of `maps_to_rating`/`maps_to_binary` today — the webhook's conversational path leaves all three rating fields NULL by design (Phase 3).

### Reporting extends the Phase 7 surface rather than forking it

The brief suggests a new `/api/campaigns/[id]/sms/report`. Phase 7 already ships `/api/campaigns/[id]/sms-reporting` serving `vw_sms_campaign_rollup` + `vw_sms_sender_stats` into the panel that would render the new blocks anyway, so the two new views were added to that payload instead — one round trip, one panel, no duplicate rollup logic. This is the §6 overlap note between Phase 7 and workstream F, resolved in Phase 7's favour.

**Not rebuilt** (already covered by `vw_sms_campaign_rollup` / `vw_sms_sender_stats`): sends, delivery rate, inbound replies, reply rate against delivered, opt-outs, survey completion, per-sender median reply latency.

## Work items as built

1. **Migration `20260813120000_sms_source_taxonomy.sql`** — `sms_interactions.rating_origin` + CHECK + backfill; `campaign_activity_ratings.source` CHECK rewritten against the union + the three new values; the two backfill UPDATEs; `fn_sms_to_rating` rewritten to emit the split values (and its `search_path` pinned, clearing a standing advisor lint); the two new views.
2. **Producers** — `POST /api/sms/conversations/[id]/assessments` now writes `sms_chat`; `survey-runtime.ts` stamps `rating_origin: "survey"`. These move in the same commit as the migration, deliberately: the cautionary precedent in §F is the phone split, still broken because `20260613110000_outcome_model.sql` migrated rows to `phone_call_live` while `record_call_attempt()` kept writing `'call_outcome'`.
3. **`vw_sms_chat_session_report`** — per P2P chat session: openers sent, replies received, response rate, median seconds to first reply, assessments recorded. Denominators count openers that actually went out (`sent_at IS NOT NULL`), so an unsent roster cannot depress the response rate; the first-reply subquery is floored at `sent_at` so an earlier exchange on the same thread is not miscounted as a response to this session.
4. **`vw_sms_assessment_report`** — SMS-sourced assessments per (campaign, source), including legacy `'sms'` so pre-split rows stay visible.
5. **API** — both views added to `/api/campaigns/[id]/sms-reporting`; new `GET /api/reports/sms` for the org-wide view. The latter takes the **union** of campaigns appearing in either view, so a chat-only campaign with assessments but no blast still appears.
6. **UI** — two new blocks in `SmsReportingSection` (chat sessions, assessment split); new `/reports/sms` page; `/reports` registry entry ("SMS Engagement").
7. **Test** — `rating-source-taxonomy.test.ts` (8 tests) asserts schema and every producer still agree on the vocabulary. §F demands "a test should assert it"; behavioural assertion is impossible without a live DB (one producer is a Postgres trigger, the other a route calling a SECURITY DEFINER RPC), but schema/producer drift *is* the failure mode the phone split demonstrates, and that is checkable.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npx vitest run` — 27 files, 357 tests, all green.
3. Migration applied DEV → verified (views execute, column and trigger present) → applied PROD → backfill verified (24 `sms_survey`, 1 `sms_chat`, 0 legacy).
4. **Reader audit before the CHECK changed** (§F's explicit instruction): no code and no SQL view filters on `source = 'sms'`. `worker_ambition_rating` passes `source` through as a column without filtering; `vw_call_action_report` does not reference `source` at all, so the §6.1 regression risk does not apply here.
5. **Wall chart (§F verify-don't-rebuild):** confirmed. SMS ratings sit on real assessment activities across campaigns 50 and 61, and the wall-chart read path does not filter on `source`, so they render like any other rating.

## Known limitations

- `vw_sms_chat_session_report.assessments_recorded` counts SMS-sourced ratings for the session's members anywhere in the campaign, not strictly ratings caused by that session — there is no rating→session link in the schema, and adding one was judged out of scope for a reporting phase.
- Per-organiser throughput is read by grouping the chat-session report on `created_by` rather than as its own view; `vw_sms_sender_stats` already covers per-sender conversation work.
- `packages/db-types/generated.ts` is not regenerated here, so the new views are consumed through routes with hand-written row types in `src/types/sms.ts` (the established pattern for freshly-applied SMS views).

## Remaining after this phase

Phase 11 (workstream E2/E7 — polymorphic objection/issue capture and claim semantics) is the last unbuilt phase in the expansion brief. It carries the highest schema risk and decision 7 requires a `vw_call_action_report` regression check.
