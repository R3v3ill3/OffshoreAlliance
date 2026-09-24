-- Estimated arrival and stay end for the mobilisation calendar.
-- Nullable: most signals only have a publication or detection time.

ALTER TABLE "public"."mobilisation_signals"
  ADD COLUMN IF NOT EXISTS "arrival_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "ends_at" timestamp with time zone;

COMMENT ON COLUMN "public"."mobilisation_signals"."arrival_at" IS
  'Estimated or observed arrival. AIS entry uses the fix time; a course that reaches a geofence uses that ETA. Regulatory and news rows set this only when the text states a start date.';

COMMENT ON COLUMN "public"."mobilisation_signals"."ends_at" IS
  'Expected end of the stay when a source states an end date or a duration. Null when the length of stay is unknown.';

CREATE INDEX IF NOT EXISTS "idx_mobilisation_signals_arrival"
  ON "public"."mobilisation_signals" ("arrival_at")
  WHERE "arrival_at" IS NOT NULL;
