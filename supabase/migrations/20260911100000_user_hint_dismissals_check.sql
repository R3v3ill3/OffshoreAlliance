-- WP1.7 fix round 1 (finding 7) — bound hint_id to the registry's id shape.
--
-- hint_id stays deliberately un-enumerated (adding a hint needs no migration),
-- but it must at least look like a registry id: lower-case snake_case, at most
-- 64 characters. Same expression as the registry test
-- (apps/organising-db/src/lib/hints/__tests__/registry.test.ts). A separate
-- file because 20260911090000_user_hint_dismissals.sql is already applied.

ALTER TABLE "public"."user_hint_dismissals"
  ADD CONSTRAINT "user_hint_dismissals_hint_id_check"
  CHECK ("hint_id" ~ '^[a-z][a-z0-9_]{0,63}$');
