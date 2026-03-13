-- ============================================================
-- Migration 00008: Employer Wizard RPC
-- Atomic apply function for the Employer Connection Wizard.
-- Performs stale-data validation, parent company creation with
-- duplicate checking, employer category + parent linking, and
-- worksite principal employer assignment in a single transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_employer_wizard_changes(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group           JSONB;
  v_update          JSONB;
  v_conflicts       JSONB := '[]'::JSONB;
  v_new_parent_id   INT;
  v_existing_id     INT;
  v_actual_ts       TIMESTAMPTZ;
  v_expected_ts     TIMESTAMPTZ;
  v_member_id       INT;
  v_parents_created INT := 0;
  v_employers_updated INT := 0;
  v_worksites_updated INT := 0;
  v_admin_user_id   TEXT;
BEGIN
  v_admin_user_id := payload->>'admin_user_id';

  -- ── Phase 1: Optimistic-lock validation ──────────────────
  -- Check every employer that will be category-updated
  FOR v_update IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(payload->'category_updates', '[]'::JSONB)
    )
  LOOP
    IF v_update->>'expected_updated_at' IS NOT NULL THEN
      SELECT updated_at INTO v_actual_ts
        FROM employers
       WHERE employer_id = (v_update->>'employer_id')::INT;

      v_expected_ts := (v_update->>'expected_updated_at')::TIMESTAMPTZ;

      IF v_actual_ts IS NOT NULL
         AND v_expected_ts IS NOT NULL
         AND v_actual_ts != v_expected_ts
      THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'type',     'employer',
          'id',       (v_update->>'employer_id')::INT,
          'field',    'category',
          'expected', v_expected_ts,
          'actual',   v_actual_ts
        );
      END IF;
    END IF;
  END LOOP;

  -- Check every worksite that will be PE-updated
  FOR v_update IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(payload->'worksite_updates', '[]'::JSONB)
    )
  LOOP
    IF v_update->>'expected_updated_at' IS NOT NULL THEN
      SELECT updated_at INTO v_actual_ts
        FROM worksites
       WHERE worksite_id = (v_update->>'worksite_id')::INT;

      v_expected_ts := (v_update->>'expected_updated_at')::TIMESTAMPTZ;

      IF v_actual_ts IS NOT NULL
         AND v_expected_ts IS NOT NULL
         AND v_actual_ts != v_expected_ts
      THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'type',     'worksite',
          'id',       (v_update->>'worksite_id')::INT,
          'field',    'principal_employer',
          'expected', v_expected_ts,
          'actual',   v_actual_ts
        );
      END IF;
    END IF;
  END LOOP;

  -- Abort if stale data detected
  IF jsonb_array_length(v_conflicts) > 0 THEN
    RETURN jsonb_build_object(
      'success',   false,
      'error',     'stale_data',
      'conflicts', v_conflicts,
      'message',   'Some records were modified since the wizard loaded data. Please re-run the analysis with fresh data.'
    );
  END IF;

  -- ── Phase 2: Create parent companies & link children ─────
  FOR v_group IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(payload->'parent_groups', '[]'::JSONB)
    )
  LOOP
    IF (v_group->>'is_new_parent')::BOOLEAN THEN
      -- Duplicate check (case-insensitive)
      SELECT employer_id INTO v_existing_id
        FROM employers
       WHERE lower(employer_name) = lower(v_group->>'proposed_parent_name')
       LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        v_new_parent_id := v_existing_id;
      ELSE
        INSERT INTO employers (employer_name, is_active)
        VALUES (v_group->>'proposed_parent_name', true)
        RETURNING employer_id INTO v_new_parent_id;
        v_parents_created := v_parents_created + 1;
      END IF;
    ELSE
      v_new_parent_id := (v_group->>'existing_parent_id')::INT;
    END IF;

    -- Link member employers (skip self-references)
    FOR v_member_id IN
      SELECT (value)::INT
        FROM jsonb_array_elements_text(v_group->'member_employer_ids')
    LOOP
      IF v_member_id != v_new_parent_id THEN
        UPDATE employers
           SET parent_employer_id = v_new_parent_id,
               updated_at        = now()
         WHERE employer_id = v_member_id;
        v_employers_updated := v_employers_updated + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- ── Phase 3: Category updates ────────────────────────────
  FOR v_update IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(payload->'category_updates', '[]'::JSONB)
    )
  LOOP
    UPDATE employers
       SET employer_category = (v_update->>'proposed_category')::VARCHAR,
           updated_at        = now()
     WHERE employer_id = (v_update->>'employer_id')::INT;
    v_employers_updated := v_employers_updated + 1;
  END LOOP;

  -- ── Phase 4: Worksite PE updates ─────────────────────────
  FOR v_update IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(payload->'worksite_updates', '[]'::JSONB)
    )
  LOOP
    UPDATE worksites
       SET principal_employer_id = (v_update->>'principal_employer_id')::INT,
           updated_at            = now()
     WHERE worksite_id = (v_update->>'worksite_id')::INT;
    v_worksites_updated := v_worksites_updated + 1;
  END LOOP;

  -- ── Phase 5: Audit log ───────────────────────────────────
  INSERT INTO import_logs (
    file_name, import_type, records_created, records_updated,
    errors, imported_by, imported_at
  ) VALUES (
    'Employer Connection Wizard',
    'employer_wizard',
    v_parents_created,
    v_employers_updated + v_worksites_updated,
    NULL,
    v_admin_user_id,
    now()
  );

  RETURN jsonb_build_object(
    'success',           true,
    'parents_created',   v_parents_created,
    'employers_updated', v_employers_updated,
    'worksites_updated', v_worksites_updated
  );
END;
$$;
