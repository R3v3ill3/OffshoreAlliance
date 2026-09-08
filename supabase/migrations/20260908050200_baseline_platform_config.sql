-- Environment-safe platform configuration omitted by schema-only dumps.
-- Credentials remain blank and webhook tokens are generated per database.

INSERT INTO public.app_settings (key, value)
VALUES
  ('action_network_api_key', ''),
  ('mobile_message_api_username', ''),
  ('mobile_message_api_password', ''),
  ('sms_provider', ''),
  ('sendgrid_api_key', ''),
  ('sendgrid_webhook_public_key', ''),
  ('email_provider', ''),
  ('email_from_address', ''),
  ('email_from_name', ''),
  ('email_reply_to', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES
  ('sms_webhook_token', encode(extensions.gen_random_bytes(32), 'hex')),
  ('email_webhook_token', encode(extensions.gen_random_bytes(32), 'hex')),
  ('email_inbound_token', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('campaign-documents', 'campaign-documents', false, NULL, NULL),
  ('documents', 'documents', false, NULL, NULL),
  ('email-attachments', 'email-attachments', false, NULL, NULL),
  ('help-videos', 'help-videos', true, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated users can read documents"
  ON storage.objects;
CREATE POLICY "Authenticated users can read documents"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Admin/User can upload documents"
  ON storage.objects;
CREATE POLICY "Admin/User can upload documents"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      SELECT role
      FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
    ) IN ('admin', 'user')
  );

DROP POLICY IF EXISTS "Authenticated users can read campaign-documents"
  ON storage.objects;
CREATE POLICY "Authenticated users can read campaign-documents"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-documents');

DROP POLICY IF EXISTS "Admin/User can upload campaign-documents"
  ON storage.objects;
CREATE POLICY "Admin/User can upload campaign-documents"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-documents'
    AND (
      SELECT role
      FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
    ) IN ('admin', 'user')
  );

DROP POLICY IF EXISTS "Admin/User can update campaign-documents"
  ON storage.objects;
CREATE POLICY "Admin/User can update campaign-documents"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'campaign-documents'
    AND (
      SELECT role
      FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
    ) IN ('admin', 'user')
  );

DROP POLICY IF EXISTS "Admin can delete campaign-documents"
  ON storage.objects;
CREATE POLICY "Admin can delete campaign-documents"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campaign-documents'
    AND (
      SELECT role
      FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
    ) = 'admin'
  );

DROP POLICY IF EXISTS "Authenticated read email attachment objects"
  ON storage.objects;
CREATE POLICY "Authenticated read email attachment objects"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'email-attachments');

DROP POLICY IF EXISTS "Staff receive private email conversation realtime"
  ON realtime.messages;
CREATE POLICY "Staff receive private email conversation realtime"
  ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() ~ '^email-conversation:[0-9]+$' THEN EXISTS (
        SELECT 1
        FROM public.email_conversations c
        WHERE c.conversation_id =
          split_part(realtime.topic(), ':', 2)::integer
          AND (
            c.campaign_id IS NULL
            OR public.can_write_to_campaign(c.campaign_id)
          )
      )
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Staff send private email conversation realtime"
  ON realtime.messages;
CREATE POLICY "Staff send private email conversation realtime"
  ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN realtime.topic() ~ '^email-conversation:[0-9]+$' THEN EXISTS (
        SELECT 1
        FROM public.email_conversations c
        WHERE c.conversation_id =
          split_part(realtime.topic(), ':', 2)::integer
          AND (
            c.campaign_id IS NULL
            OR public.can_write_to_campaign(c.campaign_id)
          )
      )
      ELSE false
    END
  );

DO $cron$
DECLARE
  existing_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping agreement expiry schedule';
    RETURN;
  END IF;

  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'agreement_status_expire_by_date'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'agreement_status_expire_by_date',
    '5 0 * * *',
    $sql$SELECT public.sync_agreement_expired_status_by_date()$sql$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END
$cron$;
