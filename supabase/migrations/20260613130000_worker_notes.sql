-- Structured worker notes for timestamped organiser observations and future follow-up workflows.

CREATE TABLE IF NOT EXISTS worker_notes (
  note_id SERIAL PRIMARY KEY,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  campaign_id INT REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
  note_text TEXT NOT NULL,
  flag_for_follow_up BOOLEAN NOT NULL DEFAULT false,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_notes_worker_created
  ON worker_notes(worker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_notes_follow_up
  ON worker_notes(flag_for_follow_up, created_at DESC)
  WHERE flag_for_follow_up = true;

ALTER TABLE worker_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_notes'
      AND policyname = 'Authenticated users can read worker_notes'
  ) THEN
    CREATE POLICY "Authenticated users can read worker_notes"
      ON worker_notes FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_notes'
      AND policyname = 'Admin/User can insert worker_notes'
  ) THEN
    CREATE POLICY "Admin/User can insert worker_notes"
      ON worker_notes FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN ('admin', 'user'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_notes'
      AND policyname = 'Admin/User can update worker_notes'
  ) THEN
    CREATE POLICY "Admin/User can update worker_notes"
      ON worker_notes FOR UPDATE TO authenticated
      USING (get_user_role() IN ('admin', 'user'))
      WITH CHECK (get_user_role() IN ('admin', 'user'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_notes'
      AND policyname = 'Admin can delete worker_notes'
  ) THEN
    CREATE POLICY "Admin can delete worker_notes"
      ON worker_notes FOR DELETE TO authenticated
      USING (get_user_role() = 'admin');
  END IF;
END $$;
