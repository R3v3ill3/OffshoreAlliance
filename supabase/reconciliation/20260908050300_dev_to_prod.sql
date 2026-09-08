-- One-time DEV convergence captured before the 2026-09-08 baseline cutover.
-- This file is audit/recovery material and is intentionally outside supabase/migrations.
-- It must never be applied to PROD.

CREATE OR REPLACE FUNCTION public.normalise_phone_au(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN digits = '' THEN NULL
    WHEN length(digits) = 9 THEN '0' || digits
    WHEN length(digits) = 10 AND digits LIKE '0%' THEN digits
    WHEN length(digits) = 11 AND digits LIKE '61%' THEN '0' || substr(digits, 3)
    WHEN length(digits) = 12 AND digits LIKE '610%' THEN '0' || substr(digits, 4)
    ELSE digits
  END
  FROM (
    SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS digits
  ) d;
$$;

SET local check_function_bodies = off;

DROP VIEW "public"."v_campaign_foundational_readiness";

DROP VIEW "public"."v_section_plan_soc_recording_grid";

DROP VIEW "public"."v_section_plan_workforce_mapping";

DROP VIEW "public"."v_strength_assessment_inputs";

DROP VIEW "public"."campaign_worker_rating_summary";

ALTER TABLE "public"."campaign_comms_drafts"
  DROP CONSTRAINT "campaign_comms_drafts_sent_via_check";

ALTER TABLE "public"."campaign_organising_units"
  DROP CONSTRAINT "campaign_organising_units_ou_group_id_fkey";

ALTER TABLE "public"."email_engagement_events"
  DROP CONSTRAINT "email_engagement_events_event_type_check";

ALTER TABLE "public"."email_list_items"
  DROP CONSTRAINT "email_list_items_status_check";

ALTER TABLE "public"."email_lists"
  DROP CONSTRAINT "email_lists_status_check";

DROP FUNCTION "public"."record_assessment_event"(integer, integer, integer, character varying, character varying, integer, character varying, text, uuid);

CREATE SEQUENCE "public"."activist_tasks_activist_task_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."campaign_activist_profiles_profile_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."campaign_ou_coverage_coverage_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."campaign_wocs_woc_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."email_canned_replies_reply_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."email_conversation_events_event_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."email_conversation_notes_note_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."email_conversations_conversation_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."email_delivery_events_event_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."email_message_attachments_attachment_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."email_messages_message_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."email_wrappers_wrapper_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."participation_import_batches_batch_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."structure_test_results_result_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."structure_tests_structure_test_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."woc_committee_meetings_meeting_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."woc_members_woc_member_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."activist_tasks" (
  "activist_task_id"      bigint                   NOT NULL DEFAULT nextval('public.activist_tasks_activist_task_id_seq'::regclass),
  "campaign_id"           integer                  NOT NULL,
  "worker_id"             integer                  NOT NULL,
  "status"                text                     NOT NULL DEFAULT 'draft'::text,
  "responsibility"        text                     NOT NULL,
  "why_it_matters"        text,
  "campaign_moment"       text,
  "rung"                  smallint,
  "resources_provided"    text,
  "commitment"            text,
  "assigned_at"           date,
  "due_date"              date,
  "walkthrough_plan"      text,
  "inoculation"           text,
  "checkin_dates"         jsonb,
  "six_conditions"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "outcome"               text,
  "outcome_notes"         text,
  "debrief_date"          date,
  "acknowledgement"       text,
  "reassessment_notes"    text,
  "next_task_id"          bigint,
  "task_list_id"          integer,
  "activity_id"           integer,
  "set_in_woc_meeting_id" bigint,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "activist_tasks_outcome_check" CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['done'::text, 'partly'::text, 'not_done'::text])))),
  CONSTRAINT "activist_tasks_pkey" PRIMARY KEY (activist_task_id),
  CONSTRAINT "activist_tasks_rung_check" CHECK (((rung IS NULL) OR ((rung >= 1) AND (rung <= 5)))),
  CONSTRAINT "activist_tasks_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'assigned'::text, 'in_progress'::text, 'complete'::text, 'cancelled'::text]))),
  "created_by"            uuid                     DEFAULT auth.uid()
);

ALTER TABLE "public"."activist_tasks"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."campaign_activist_profiles" (
  "profile_id"         bigint                   NOT NULL DEFAULT nextval('public.campaign_activist_profiles_profile_id_seq'::regclass),
  "campaign_id"        integer                  NOT NULL,
  "worker_id"          integer                  NOT NULL,
  "source"             text                     NOT NULL DEFAULT 'manual'::text,
  "is_archived"        boolean                  NOT NULL DEFAULT false,
  "identified_via"     text,
  "recruited_by"       uuid,
  "recruited_by_text"  text,
  "recruited_at"       date,
  "domain"             text,
  "followers_evidence" text,
  "skab_notes"         text,
  "current_rung"       smallint,
  "four_a_stage"       text                     NOT NULL DEFAULT 'assess'::text,
  "last_contact_date"  date,
  "next_contact_date"  date,
  "notes"              text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_activist_profiles_campaign_id_worker_id_key" UNIQUE (campaign_id, worker_id),
  CONSTRAINT "campaign_activist_profiles_current_rung_check" CHECK (((current_rung IS NULL) OR ((current_rung >= 1) AND (current_rung <= 5)))),
  CONSTRAINT "campaign_activist_profiles_domain_check"
    CHECK (((domain IS NULL) OR (domain = ANY (ARRAY['recruitment'::text, 'comms'::text, 'mobilisation'::text, 'representation'::text])))),
  CONSTRAINT "campaign_activist_profiles_four_a_stage_check" CHECK ((four_a_stage = ANY (ARRAY['assess'::text, 'assign'::text, 'assist'::text, 'acknowledge'::text]))),
  CONSTRAINT "campaign_activist_profiles_identified_via_check"
    CHECK
    (((identified_via IS NULL) OR (identified_via = ANY (ARRAY['workmate_rec'::text, 'office_call'::text, 'outreach'::text, 'event'::text, 'observed'::text, 'other'::text])))),
  CONSTRAINT "campaign_activist_profiles_pkey" PRIMARY KEY (profile_id),
  CONSTRAINT "campaign_activist_profiles_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'auto_rating'::text, 'auto_task'::text, 'auto_role'::text, 'auto_woc'::text]))),
  "created_by"         uuid                     DEFAULT auth.uid()
);

ALTER TABLE "public"."campaign_activist_profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."campaign_ou_coverage" (
  "coverage_id"      bigint                   NOT NULL DEFAULT nextval('public.campaign_ou_coverage_coverage_id_seq'::regclass),
  "ou_id"            integer                  NOT NULL,
  "leader_worker_id" integer,
  "second_worker_id" integer,
  "reachable_48h"    boolean,
  "priority_action"  text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_ou_coverage_ou_id_key" UNIQUE (ou_id),
  CONSTRAINT "campaign_ou_coverage_pkey" PRIMARY KEY (coverage_id)
);

ALTER TABLE "public"."campaign_ou_coverage"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."campaign_wocs" (
  "woc_id"      bigint                   NOT NULL DEFAULT nextval('public.campaign_wocs_woc_id_seq'::regclass),
  "campaign_id" integer                  NOT NULL,
  "name"        text                     NOT NULL,
  "scope_ou_id" integer,
  "cadence"     text,
  "format"      text,
  "status"      text                     NOT NULL DEFAULT 'forming'::text,
  "notes"       text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_wocs_format_check" CHECK (((format IS NULL) OR (format = ANY (ARRAY['in_person'::text, 'video'::text, 'split_swing'::text, 'mixed'::text])))),
  CONSTRAINT "campaign_wocs_pkey" PRIMARY KEY (woc_id),
  CONSTRAINT "campaign_wocs_status_check" CHECK ((status = ANY (ARRAY['forming'::text, 'active'::text, 'paused'::text, 'disbanded'::text]))),
  "created_by"  uuid                     DEFAULT auth.uid()
);

ALTER TABLE "public"."campaign_wocs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_canned_replies" (
  "reply_id"    bigint                   NOT NULL DEFAULT nextval('public.email_canned_replies_reply_id_seq'::regclass),
  "campaign_id" integer,
  "title"       character varying(120)   NOT NULL,
  "body"        text                     NOT NULL,
  "created_by"  uuid,
  "is_active"   boolean                  NOT NULL DEFAULT true,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_canned_replies_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 10000))),
  CONSTRAINT "email_canned_replies_pkey" PRIMARY KEY (reply_id),
  CONSTRAINT "email_canned_replies_title_check" CHECK ((length(TRIM(BOTH FROM title)) >= 1))
);

ALTER TABLE "public"."email_canned_replies"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_conversation_events" (
  "event_id"        bigint                   NOT NULL DEFAULT nextval('public.email_conversation_events_event_id_seq'::regclass),
  "conversation_id" integer                  NOT NULL,
  "actor_user_id"   uuid,
  "event_type"      character varying(40)    NOT NULL,
  "detail"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_conversation_events_event_type_check"
    CHECK
    (((event_type)::text = ANY (ARRAY[('assigned'::character varying)::text, ('state_changed'::character varying)::text, ('campaign_attached'::character varying)::text,
    ('worker_matched'::character varying)::text, ('opt_out_changed'::character varying)::text]))),
  CONSTRAINT "email_conversation_events_pkey" PRIMARY KEY (event_id)
);

ALTER TABLE "public"."email_conversation_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_conversation_notes" (
  "note_id"         bigint                   NOT NULL DEFAULT nextval('public.email_conversation_notes_note_id_seq'::regclass),
  "conversation_id" integer                  NOT NULL,
  "author_user_id"  uuid,
  "body"            text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_conversation_notes_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 5000))),
  CONSTRAINT "email_conversation_notes_pkey" PRIMARY KEY (note_id)
);

ALTER TABLE "public"."email_conversation_notes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_conversations" (
  "conversation_id"       integer                  NOT NULL DEFAULT nextval('public.email_conversations_conversation_id_seq'::regclass),
  "worker_id"             integer,
  "email_address"         character varying(320)   NOT NULL,
  "campaign_id"           integer,
  "subject"               character varying(500),
  "state"                 character varying(20)    NOT NULL DEFAULT 'triage'::character varying,
  "assignee_user_id"      uuid,
  "unread_count"          integer                  NOT NULL DEFAULT 0,
  "last_message_at"       timestamp with time zone,
  "last_inbound_at"       timestamp with time zone,
  "last_outbound_at"      timestamp with time zone,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "original_subject"      character varying(500),
  "subject_normalized"    character varying(500),
  "last_message_preview"  text,
  "last_rfc_message_id"   character varying(300),
  "rfc_references"        text,
  "graph_conversation_id" text,
  "claim_user_id"         uuid,
  "claimed_until"         timestamp with time zone,
  "closed_at"             timestamp with time zone,
  "closed_by_user_id"     uuid,
  CONSTRAINT "email_conversations_pkey" PRIMARY KEY (conversation_id),
  CONSTRAINT "email_conversations_state_check"
    CHECK
    (((state)::text = ANY (ARRAY[('needs_message'::character varying)::text, ('messaged'::character varying)::text, ('needs_response'::character varying)::text, ('convo'::character
    varying)::text, ('closed'::character varying)::text, ('triage'::character varying)::text]))),
  CONSTRAINT "uq_email_conversations_thread" UNIQUE NULLS NOT DISTINCT (email_address, campaign_id)
);

ALTER TABLE "public"."email_conversations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_delivery_events" (
  "event_id"              bigint                   NOT NULL DEFAULT nextval('public.email_delivery_events_event_id_seq'::regclass),
  "provider_event_id"     character varying(150)   NOT NULL,
  "provider_message_id"   character varying(150),
  "send_id"               bigint,
  "event_type"            character varying(30)    NOT NULL,
  "payload"               jsonb,
  "occurred_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "email_message_id"      bigint,
  "processing_started_at" timestamp with time zone,
  "processed_at"          timestamp with time zone,
  "processing_error"      text,
  CONSTRAINT "email_delivery_events_pkey" PRIMARY KEY (event_id),
  CONSTRAINT "email_delivery_events_provider_event_id_key" UNIQUE (provider_event_id)
);

ALTER TABLE "public"."email_delivery_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_message_attachments" (
  "attachment_id"      bigint                   NOT NULL DEFAULT nextval('public.email_message_attachments_attachment_id_seq'::regclass),
  "message_id"         bigint                   NOT NULL,
  "conversation_id"    integer                  NOT NULL,
  "storage_bucket"     text                     NOT NULL DEFAULT 'email-attachments'::text,
  "storage_path"       text                     NOT NULL,
  "filename"           text                     NOT NULL,
  "content_type"       text,
  "byte_size"          bigint,
  "content_id"         text,
  "is_inline"          boolean                  NOT NULL DEFAULT false,
  "created_by_user_id" uuid,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_message_attachments_pkey" PRIMARY KEY (attachment_id),
  CONSTRAINT "uq_email_attachment_path" UNIQUE (storage_bucket, storage_path)
);

ALTER TABLE "public"."email_message_attachments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_messages" (
  "message_id"                           bigint                   NOT NULL DEFAULT nextval('public.email_messages_message_id_seq'::regclass),
  "conversation_id"                      integer                  NOT NULL,
  "direction"                            character varying(10)    NOT NULL,
  "subject"                              character varying(500),
  "body_text"                            text,
  "body_html"                            text,
  "from_email"                           character varying(320),
  "to_email"                             character varying(320),
  "provider_message_id"                  character varying(300),
  "in_reply_to"                          character varying(300),
  "send_id"                              bigint,
  "sender_user_id"                       uuid,
  "attachments"                          jsonb,
  "status"                               character varying(20)    NOT NULL DEFAULT 'received'::character varying,
  "error"                                text,
  "created_at"                           timestamp with time zone NOT NULL DEFAULT now(),
  "rfc_message_id"                       character varying(300),
  "rfc_references"                       text,
  "graph_message_id"                     text,
  "delivered_at"                         timestamp with time zone,
  "reply_workflow_processed_at"          timestamp with time zone,
  "reply_workflow_processing_started_at" timestamp with time zone,
  "reply_workflow_error"                 text,
  CONSTRAINT "email_messages_direction_check" CHECK (((direction)::text = ANY (ARRAY[('inbound'::character varying)::text, ('outbound'::character varying)::text]))),
  CONSTRAINT "email_messages_pkey" PRIMARY KEY (message_id),
  CONSTRAINT "email_messages_provider_message_id_key" UNIQUE (provider_message_id),
  CONSTRAINT "email_messages_status_check"
    CHECK
    (((status)::text = ANY (ARRAY[('received'::character varying)::text, ('queued'::character varying)::text, ('sent'::character varying)::text, ('delivered'::character
    varying)::text, ('failed'::character varying)::text])))
);

ALTER TABLE "public"."email_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_unsubscribe_tokens" (
  "token"      text                     NOT NULL,
  "worker_id"  integer                  NOT NULL,
  "send_id"    bigint,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "used_at"    timestamp with time zone,
  CONSTRAINT "email_unsubscribe_tokens_pkey" PRIMARY KEY (token)
);

ALTER TABLE "public"."email_unsubscribe_tokens"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_wrappers" (
  "wrapper_id"  integer                  NOT NULL DEFAULT nextval('public.email_wrappers_wrapper_id_seq'::regclass),
  "name"        character varying(200)   NOT NULL,
  "description" text,
  "header_html" text                     NOT NULL DEFAULT ''::text,
  "footer_html" text                     NOT NULL,
  "is_default"  boolean                  NOT NULL DEFAULT false,
  "is_active"   boolean                  NOT NULL DEFAULT true,
  "created_by"  uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_wrappers_pkey" PRIMARY KEY (wrapper_id)
);

ALTER TABLE "public"."email_wrappers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."participation_import_batches" (
  "batch_id"         integer                  NOT NULL DEFAULT nextval('public.participation_import_batches_batch_id_seq'::regclass),
  "campaign_id"      integer                  NOT NULL,
  "activity_id"      integer                  NOT NULL,
  "source_kind"      character varying(20)    NOT NULL,
  "an_resource_type" character varying(20),
  "an_resource_id"   character varying(100),
  "file_name"        character varying(300),
  "mapping"          jsonb,
  "rows_total"       integer                  NOT NULL DEFAULT 0,
  "rows_matched"     integer                  NOT NULL DEFAULT 0,
  "rows_created"     integer                  NOT NULL DEFAULT 0,
  "rows_updated"     integer                  NOT NULL DEFAULT 0,
  "rows_skipped"     integer                  NOT NULL DEFAULT 0,
  "workers_created"  integer                  NOT NULL DEFAULT 0,
  "created_by"       uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "participation_import_batches_pkey" PRIMARY KEY (batch_id),
  CONSTRAINT "participation_import_batches_source_kind_check"
    CHECK (((source_kind)::text = ANY (ARRAY[('an_api'::character varying)::text, ('an_report_csv'::character varying)::text])))
);

ALTER TABLE "public"."participation_import_batches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."structure_test_results" (
  "result_id"         bigint                   NOT NULL DEFAULT nextval('public.structure_test_results_result_id_seq'::regclass),
  "structure_test_id" bigint                   NOT NULL,
  "ou_id"             integer                  NOT NULL,
  "eligible"          integer,
  "participated"      integer,
  "passed"            boolean,
  "leader_worker_id"  integer,
  "learnings"         text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "structure_test_results_eligible_check" CHECK (((eligible IS NULL) OR (eligible >= 0))),
  CONSTRAINT "structure_test_results_participated_check" CHECK (((participated IS NULL) OR (participated >= 0))),
  CONSTRAINT "structure_test_results_pkey" PRIMARY KEY (result_id),
  CONSTRAINT "structure_test_results_structure_test_id_ou_id_key" UNIQUE (structure_test_id, ou_id)
);

ALTER TABLE "public"."structure_test_results"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."structure_tests" (
  "structure_test_id"  bigint                   NOT NULL DEFAULT nextval('public.structure_tests_structure_test_id_seq'::regclass),
  "campaign_id"        integer                  NOT NULL,
  "test_number"        integer,
  "test_date"          date,
  "title"              text                     NOT NULL,
  "description"        text,
  "target_description" text,
  "pass_threshold_pct" numeric(5,2),
  "activity_id"        integer,
  "event_id"           integer,
  "learnings"          text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "structure_tests_pass_threshold_pct_check" CHECK (((pass_threshold_pct IS NULL) OR ((pass_threshold_pct >= (0)::numeric) AND (pass_threshold_pct <= (100)::numeric)))),
  CONSTRAINT "structure_tests_pkey" PRIMARY KEY (structure_test_id),
  "created_by"         uuid                     DEFAULT auth.uid()
);

ALTER TABLE "public"."structure_tests"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."woc_committee_meetings" (
  "meeting_id"                 bigint                   NOT NULL DEFAULT nextval('public.woc_committee_meetings_meeting_id_seq'::regclass),
  "woc_id"                     bigint                   NOT NULL,
  "meeting_date"               date                     NOT NULL,
  "format"                     text,
  "chair_worker_id"            integer,
  "activity_id"                integer,
  "event_id"                   integer,
  "whats_new"                  text,
  "recognition_notes"          text,
  "new_tasks_summary"          text,
  "crews_represented_snapshot" jsonb,
  "crews_missing_snapshot"     jsonb,
  "attendees_snapshot"         jsonb,
  "next_meeting_date"          date,
  "next_chair_worker_id"       integer,
  "notes"                      text,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "woc_committee_meetings_format_check" CHECK (((format IS NULL) OR (format = ANY (ARRAY['in_person'::text, 'video'::text, 'split_swing'::text, 'mixed'::text])))),
  CONSTRAINT "woc_committee_meetings_pkey" PRIMARY KEY (meeting_id),
  "created_by"                 uuid                     DEFAULT auth.uid()
);

ALTER TABLE "public"."woc_committee_meetings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."woc_members" (
  "woc_member_id" bigint                   NOT NULL DEFAULT nextval('public.woc_members_woc_member_id_seq'::regclass),
  "woc_id"        bigint                   NOT NULL,
  "worker_id"     integer                  NOT NULL,
  "woc_role"      text                     NOT NULL DEFAULT 'member'::text,
  "joined_on"     date                     NOT NULL DEFAULT CURRENT_DATE,
  "left_on"       date,
  "notes"         text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "woc_members_pkey" PRIMARY KEY (woc_member_id),
  CONSTRAINT "woc_members_woc_id_worker_id_key" UNIQUE (woc_id, worker_id),
  CONSTRAINT "woc_members_woc_role_check" CHECK ((woc_role = ANY (ARRAY['chair'::text, 'mapper'::text, 'comms_steward'::text, 'recruitment_lead'::text, 'member'::text])))
);

ALTER TABLE "public"."woc_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."woc_scope_units" (
  "woc_id"     bigint                   NOT NULL,
  "ou_id"      integer                  NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "woc_scope_units_pkey" PRIMARY KEY (woc_id, ou_id)
);

ALTER TABLE "public"."woc_scope_units"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."activist_tasks_activist_task_id_seq" OWNED BY "public"."activist_tasks"."activist_task_id";

ALTER SEQUENCE "public"."campaign_activist_profiles_profile_id_seq" OWNED BY "public"."campaign_activist_profiles"."profile_id";

ALTER TABLE "public"."campaign_activities"
  ADD COLUMN "an_resource_type" character varying(20);

ALTER TABLE "public"."campaign_activities"
  ADD COLUMN "an_resource_id" character varying(100);

ALTER TABLE "public"."campaign_activities"
  ADD COLUMN "an_browser_url" text;

ALTER TABLE "public"."campaign_activities"
  ADD COLUMN "an_last_synced_at" timestamp WITH time zone;

ALTER TABLE "public"."campaign_activities"
  ADD COLUMN "is_perception" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."campaign_activity_ratings"
  ADD COLUMN "import_batch_id" integer;

ALTER TABLE "public"."campaign_comms_drafts"
  ADD COLUMN "wrapper_id" integer;

ALTER TABLE "public"."campaign_organising_units"
  ADD COLUMN "user_rating" smallint;

ALTER SEQUENCE "public"."campaign_ou_coverage_coverage_id_seq" OWNED BY "public"."campaign_ou_coverage"."coverage_id";

ALTER SEQUENCE "public"."campaign_wocs_woc_id_seq" OWNED BY "public"."campaign_wocs"."woc_id";

ALTER SEQUENCE "public"."email_canned_replies_reply_id_seq" OWNED BY "public"."email_canned_replies"."reply_id";

ALTER SEQUENCE "public"."email_conversation_events_event_id_seq" OWNED BY "public"."email_conversation_events"."event_id";

ALTER SEQUENCE "public"."email_conversation_notes_note_id_seq" OWNED BY "public"."email_conversation_notes"."note_id";

ALTER SEQUENCE "public"."email_conversations_conversation_id_seq" OWNED BY "public"."email_conversations"."conversation_id";

ALTER SEQUENCE "public"."email_delivery_events_event_id_seq" OWNED BY "public"."email_delivery_events"."event_id";

ALTER TABLE "public"."email_engagement_events"
  ADD COLUMN "source_message_id" text;

ALTER TABLE "public"."email_list_items"
  ADD COLUMN "claimed_at" timestamp WITH time zone;

ALTER TABLE "public"."email_list_items"
  ADD COLUMN "provider_message_id" character varying(150);

ALTER TABLE "public"."email_list_items"
  ADD COLUMN "failure_reason" text;

ALTER TABLE "public"."email_list_items"
  ADD COLUMN "send_before" timestamp WITH time zone;

ALTER TABLE "public"."email_list_items"
  ADD COLUMN "delivered_at" timestamp WITH time zone;

ALTER TABLE "public"."email_lists"
  ADD COLUMN "wrapper_id" integer;

ALTER TABLE "public"."email_lists"
  ADD COLUMN "timezone" text NOT NULL DEFAULT 'Australia/Perth'::text;

ALTER TABLE "public"."email_lists"
  ADD COLUMN "blackout_override" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."email_lists"
  ADD COLUMN "scheduled_for" timestamp WITH time zone;

ALTER TABLE "public"."email_lists"
  ADD COLUMN "delivered_items" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."email_lists"
  ADD COLUMN "failed_items" integer NOT NULL DEFAULT 0;

ALTER SEQUENCE "public"."email_message_attachments_attachment_id_seq" OWNED BY "public"."email_message_attachments"."attachment_id";

ALTER SEQUENCE "public"."email_messages_message_id_seq" OWNED BY "public"."email_messages"."message_id";

ALTER TABLE "public"."email_send_log"
  ADD COLUMN "provider_message_id" character varying(150);

ALTER TABLE "public"."email_send_log"
  ADD COLUMN "delivered_at" timestamp WITH time zone;

ALTER TABLE "public"."email_send_log"
  ADD COLUMN "first_open_at" timestamp WITH time zone;

ALTER TABLE "public"."email_send_log"
  ADD COLUMN "open_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."email_send_log"
  ADD COLUMN "unsubscribed_at" timestamp WITH time zone;

ALTER SEQUENCE "public"."email_wrappers_wrapper_id_seq" OWNED BY "public"."email_wrappers"."wrapper_id";

ALTER SEQUENCE "public"."participation_import_batches_batch_id_seq" OWNED BY "public"."participation_import_batches"."batch_id";

ALTER TABLE "public"."sms_lists"
  ADD COLUMN "relay_id" integer;

ALTER SEQUENCE "public"."structure_test_results_result_id_seq" OWNED BY "public"."structure_test_results"."result_id";

ALTER SEQUENCE "public"."structure_tests_structure_test_id_seq" OWNED BY "public"."structure_tests"."structure_test_id";

ALTER SEQUENCE "public"."woc_committee_meetings_meeting_id_seq" OWNED BY "public"."woc_committee_meetings"."meeting_id";

ALTER SEQUENCE "public"."woc_members_woc_member_id_seq" OWNED BY "public"."woc_members"."woc_member_id";

ALTER TABLE "public"."worker_notes"
  ADD COLUMN "email_message_id" bigint;

ALTER TABLE "public"."workers"
  ADD COLUMN "email_opt_out" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."workers"
  ADD COLUMN "email_opt_out_at" timestamp WITH time zone;

ALTER TABLE "public"."workers"
  ADD COLUMN "email_opt_out_source" character varying(20);

ALTER TABLE "public"."workers"
  ADD COLUMN "email_consent_source" character varying(20);

CREATE OR REPLACE FUNCTION public.apply_participation_import (
  p_activity_id     integer,
  p_rows            jsonb,
  p_source          character varying DEFAULT 'an_report_import'::character varying,
  p_rating_phase    character varying DEFAULT 'actual'::character varying,
  p_actor_id        uuid              DEFAULT NULL::uuid,
  p_import_batch_id integer           DEFAULT NULL::integer
)
  RETURNS integer
  LANGUAGE plpgsql
  AS $function$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      AS x(worker_id INT, rating INT, binary_value TEXT, notes TEXT)
  LOOP
    IF r.worker_id IS NULL THEN
      CONTINUE;
    END IF;
    PERFORM record_assessment_event(
      p_activity_id := p_activity_id,
      p_worker_id := r.worker_id,
      p_rating := r.rating,
      p_binary_value := r.binary_value,
      p_rating_phase := p_rating_phase,
      p_event_id := NULL,
      p_source := p_source,
      p_notes := r.notes,
      p_actor_id := p_actor_id,
      p_import_batch_id := p_import_batch_id
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_active_wocs (
  p_agreement_id integer
)
  RETURNS integer
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM campaign_wocs cw
  JOIN campaign_timelines ct ON ct.campaign_id = cw.campaign_id
  WHERE ct.agreement_id = p_agreement_id
    AND cw.status = 'active';
  RETURN COALESCE(v_count, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_email_reply_workflow (
  p_message_id  bigint,
  p_occurred_at timestamp with time zone DEFAULT now()
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE v_conversation_id INTEGER;
BEGIN
  UPDATE email_messages
  SET reply_workflow_processed_at = now(), reply_workflow_processing_started_at = NULL, reply_workflow_error = NULL
  WHERE message_id = p_message_id AND reply_workflow_processed_at IS NULL AND reply_workflow_processing_started_at IS NOT NULL
  RETURNING conversation_id INTO v_conversation_id;
  IF v_conversation_id IS NULL THEN RETURN false; END IF;
  UPDATE email_conversations
  SET unread_count = unread_count + 1,
      last_message_at = GREATEST(COALESCE(last_message_at, p_occurred_at), p_occurred_at),
      last_inbound_at = GREATEST(COALESCE(last_inbound_at, p_occurred_at), p_occurred_at),
      state = CASE WHEN state = 'triage' AND worker_id IS NULL THEN 'triage' ELSE 'needs_response' END
  WHERE conversation_id = v_conversation_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cou_enforce_group_consistency()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  -- A dangling ou_group_id (group set, no parent) is only reachable while a
  -- parent group is being deleted. Clear it rather than rejecting the delete.
  IF NEW.ou_group_id IS NOT NULL AND NEW.parent_ou_id IS NULL THEN
    NEW.ou_group_id := NULL;
  END IF;

  IF NEW.ou_group_id IS NOT NULL
     AND NEW.parent_ou_id IS NOT NULL
     AND NEW.ou_group_id <> NEW.parent_ou_id THEN
    RAISE EXCEPTION
      'campaign_organising_units: ou_group_id (%) must equal parent_ou_id (%) when both are set',
      NEW.ou_group_id, NEW.parent_ou_id;
  END IF;

  IF NEW.is_group_container = TRUE AND NEW.ou_group_id IS NOT NULL THEN
    RAISE EXCEPTION
      'campaign_organising_units: a group container (ou_id %) cannot also be a group member',
      NEW.ou_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_activist_profile_on_activist_task()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  PERFORM fn_ensure_activist_profile(NEW.campaign_id, NEW.worker_id, 'auto_task');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_activist_profile_on_membership()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_role_type_id INT;
  v_status TEXT;
BEGIN
  SELECT member_role_type_id INTO v_role_type_id
  FROM workers WHERE worker_id = NEW.worker_id;
  IF NOT fn_role_type_is_activist_like(v_role_type_id) THEN
    RETURN NEW;
  END IF;
  SELECT status INTO v_status FROM campaigns WHERE campaign_id = NEW.campaign_id;
  IF v_status IN ('planning', 'active') THEN
    PERFORM fn_ensure_activist_profile(NEW.campaign_id, NEW.worker_id, 'auto_role');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_activist_profile_on_rating()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_campaign_id INT;
BEGIN
  IF NEW.rating IS DISTINCT FROM 1 THEN
    RETURN NEW;
  END IF;
  SELECT campaign_id INTO v_campaign_id
  FROM campaign_activities WHERE activity_id = NEW.activity_id;
  PERFORM fn_ensure_activist_profile(v_campaign_id, NEW.worker_id, 'auto_rating');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_activist_profile_on_role_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  r RECORD;
BEGIN
  IF NOT fn_role_type_is_activist_like(NEW.member_role_type_id) THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT cwm.campaign_id
    FROM campaign_worker_membership cwm
    JOIN campaigns c ON c.campaign_id = cwm.campaign_id
    WHERE cwm.worker_id = NEW.worker_id
      AND c.status IN ('planning', 'active')
  LOOP
    PERFORM fn_ensure_activist_profile(r.campaign_id, NEW.worker_id, 'auto_role');
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_activist_profile_on_task_list()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF NEW.status = 'active' AND NEW.leader_worker_id IS NOT NULL THEN
    PERFORM fn_ensure_activist_profile(NEW.campaign_id, NEW.leader_worker_id, 'auto_task');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_activist_profile_on_woc_member()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_campaign_id INT;
BEGIN
  SELECT campaign_id INTO v_campaign_id FROM campaign_wocs WHERE woc_id = NEW.woc_id;
  PERFORM fn_ensure_activist_profile(v_campaign_id, NEW.worker_id, 'auto_woc');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ensure_activist_profile (
  p_campaign_id integer,
  p_worker_id   integer,
  p_source      text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF p_campaign_id IS NULL OR p_worker_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO campaign_activist_profiles (campaign_id, worker_id, source)
  VALUES (p_campaign_id, p_worker_id, p_source)
  ON CONFLICT (campaign_id, worker_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_role_type_is_activist_like (
  p_role_type_id integer
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM member_role_types
    WHERE role_type_id = p_role_type_id
      AND lower(role_name) IN ('contact', 'activist', 'delegate')
  );
$function$;

CREATE OR REPLACE FUNCTION public.increment_email_click_count (
  p_send_id     bigint,
  p_occurred_at timestamp with time zone DEFAULT now()
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  UPDATE email_send_log
  SET click_count = click_count + 1,
      first_click_at = COALESCE(first_click_at, p_occurred_at)
  WHERE send_id = p_send_id;
$function$;

CREATE OR REPLACE FUNCTION public.increment_email_open_count (
  p_send_id     bigint,
  p_occurred_at timestamp with time zone DEFAULT now()
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  UPDATE email_send_log
  SET open_count = open_count + 1,
      first_open_at = COALESCE(first_open_at, p_occurred_at)
  WHERE send_id = p_send_id;
$function$;

CREATE OR REPLACE FUNCTION public.match_workers_for_import (
  p_emails     text[] DEFAULT '{}'::text[],
  p_phones     text[] DEFAULT '{}'::text[],
  p_name_keys  text[] DEFAULT '{}'::text[],
  p_last_names text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    worker_id      integer,
    first_name     character varying,
    last_name      character varying,
    preferred_name character varying,
    email          character varying,
    phone          character varying
  )
  LANGUAGE sql
  STABLE
  AS $function$
  WITH name_norm AS (
    SELECT
      w.worker_id,
      regexp_replace(lower(btrim(w.first_name)), '\s+', ' ', 'g') || '||' ||
        regexp_replace(lower(btrim(w.last_name)), '\s+', ' ', 'g') AS name_key,
      CASE WHEN w.preferred_name IS NOT NULL AND btrim(w.preferred_name) <> '' THEN
        regexp_replace(lower(btrim(w.preferred_name)), '\s+', ' ', 'g') || '||' ||
          regexp_replace(lower(btrim(w.last_name)), '\s+', ' ', 'g')
      END AS preferred_key,
      regexp_replace(lower(btrim(w.last_name)), '\s+', ' ', 'g') AS last_key
    FROM workers w
  )
  SELECT DISTINCT w.worker_id, w.first_name, w.last_name, w.preferred_name, w.email, w.phone
  FROM workers w
  LEFT JOIN name_norm n ON n.worker_id = w.worker_id
  WHERE
    (cardinality(p_emails) > 0 AND lower(btrim(coalesce(w.email, ''))) = ANY (p_emails))
    OR (cardinality(p_phones) > 0 AND normalise_phone_au(w.phone) = ANY (p_phones))
    OR (cardinality(p_name_keys) > 0 AND (
      n.name_key = ANY (p_name_keys)
      OR n.preferred_key = ANY (p_name_keys)
    ))
  UNION
  -- Surname-only candidates, capped so common surnames can't flood the
  -- response. These are suggestions for user confirmation, never
  -- auto-matches.
  SELECT s.worker_id, s.first_name, s.last_name, s.preferred_name, s.email, s.phone
  FROM (
    SELECT w.worker_id, w.first_name, w.last_name, w.preferred_name, w.email, w.phone
    FROM workers w
    JOIN name_norm n ON n.worker_id = w.worker_id
    WHERE cardinality(p_last_names) > 0 AND n.last_key = ANY (p_last_names)
    LIMIT 500
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.normalise_email_subject (
  p_subject text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  AS $function$
  SELECT NULLIF(lower(trim(regexp_replace(p_subject, '^(\s*((re|fw|fwd)\s*:\s*))+', '', 'i'))), '');
$function$;

CREATE OR REPLACE FUNCTION public.normalise_phone_au (
  p text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  SELECT CASE
    WHEN digits = '' THEN NULL
    WHEN length(digits) = 9 THEN '0' || digits
    WHEN length(digits) = 10 AND digits LIKE '0%' THEN digits
    WHEN length(digits) = 11 AND digits LIKE '61%' THEN '0' || substr(digits, 3)
    WHEN length(digits) = 12 AND digits LIKE '610%' THEN '0' || substr(digits, 4)
    ELSE digits
  END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS digits) d;
$function$;

CREATE OR REPLACE FUNCTION public.record_assessment_event (
  p_activity_id     integer,
  p_worker_id       integer,
  p_rating          integer           DEFAULT NULL::integer,
  p_binary_value    character varying DEFAULT NULL::character varying,
  p_rating_phase    character varying DEFAULT 'actual'::character varying,
  p_event_id        integer           DEFAULT NULL::integer,
  p_source          character varying DEFAULT 'staff'::character varying,
  p_notes           text              DEFAULT NULL::text,
  p_actor_id        uuid              DEFAULT NULL::uuid,
  p_import_batch_id integer           DEFAULT NULL::integer
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_rating_id INT;
BEGIN
  IF p_rating IS NULL AND p_binary_value IS NULL THEN
    RAISE EXCEPTION
      'record_assessment_event: at least one of p_rating or p_binary_value must be non-null';
  END IF;

  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION
      'record_assessment_event: p_rating must be 1..5 (got %)', p_rating;
  END IF;

  IF p_rating_phase NOT IN ('expected', 'actual') THEN
    RAISE EXCEPTION
      'record_assessment_event: p_rating_phase must be expected or actual (got %)', p_rating_phase;
  END IF;

  INSERT INTO campaign_activity_ratings (
    activity_id, worker_id, rating, binary_value, notes,
    source, rated_at, rated_by_user_id, rating_phase, event_id,
    import_batch_id
  )
  VALUES (
    p_activity_id, p_worker_id, p_rating, p_binary_value, p_notes,
    p_source, now(), p_actor_id, p_rating_phase, p_event_id,
    p_import_batch_id
  )
  ON CONFLICT (activity_id, worker_id, rating_phase, event_id) DO UPDATE SET
    rating = COALESCE(EXCLUDED.rating, campaign_activity_ratings.rating),
    binary_value = COALESCE(EXCLUDED.binary_value, campaign_activity_ratings.binary_value),
    notes = COALESCE(EXCLUDED.notes, campaign_activity_ratings.notes),
    source = EXCLUDED.source,
    rated_at = EXCLUDED.rated_at,
    rated_by_user_id = COALESCE(EXCLUDED.rated_by_user_id, campaign_activity_ratings.rated_by_user_id),
    import_batch_id = COALESCE(EXCLUDED.import_batch_id, campaign_activity_ratings.import_batch_id)
  RETURNING rating_id INTO v_rating_id;

  RETURN v_rating_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_email_conversation_from_message()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  UPDATE email_conversations
  SET original_subject = COALESCE(original_subject, NULLIF(NEW.subject, '')),
      subject = COALESCE(NULLIF(NEW.subject, ''), subject),
      subject_normalized = COALESCE(normalise_email_subject(NULLIF(NEW.subject, '')), subject_normalized),
      last_message_preview = NULLIF(left(trim(regexp_replace(COALESCE(NULLIF(NEW.body_text, ''), regexp_replace(COALESCE(NEW.body_html, ''), '<[^>]+>', ' ', 'g')), '\s+', ' ', 'g')), 240), ''),
      last_rfc_message_id = COALESCE(NEW.rfc_message_id, last_rfc_message_id),
      rfc_references = COALESCE(NEW.rfc_references, rfc_references)
  WHERE conversation_id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_email_conversation_inbound (
  p_conversation_id integer,
  p_occurred_at     timestamp with time zone DEFAULT now()
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  UPDATE email_conversations
  SET unread_count = unread_count + 1,
      last_message_at = GREATEST(COALESCE(last_message_at, p_occurred_at), p_occurred_at),
      last_inbound_at = GREATEST(COALESCE(last_inbound_at, p_occurred_at), p_occurred_at),
      state = CASE
        WHEN state = 'triage' AND worker_id IS NULL THEN 'triage'
        ELSE 'needs_response'
      END
  WHERE conversation_id = p_conversation_id;
$function$;

CREATE OR REPLACE FUNCTION public.touch_email_conversation_outbound (
  p_conversation_id integer,
  p_occurred_at     timestamp with time zone DEFAULT now()
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  UPDATE email_conversations
  SET last_message_at = GREATEST(COALESCE(last_message_at, p_occurred_at), p_occurred_at),
      last_outbound_at = GREATEST(COALESCE(last_outbound_at, p_occurred_at), p_occurred_at),
      state = CASE
        WHEN state IN ('needs_message', 'closed') THEN 'messaged'
        ELSE state
      END
  WHERE conversation_id = p_conversation_id;
$function$;

ALTER TABLE "public"."activist_tasks"
  ADD CONSTRAINT "activist_tasks_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES public.campaign_activities(activity_id) ON DELETE SET NULL;

ALTER TABLE "public"."activist_tasks"
  ADD CONSTRAINT "activist_tasks_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE;

ALTER TABLE "public"."activist_tasks"
  ADD CONSTRAINT "activist_tasks_next_task_id_fkey" FOREIGN KEY (next_task_id) REFERENCES public.activist_tasks(activist_task_id) ON DELETE SET NULL;

ALTER TABLE "public"."activist_tasks"
  ADD CONSTRAINT "activist_tasks_task_list_id_fkey" FOREIGN KEY (task_list_id) REFERENCES public.campaign_task_lists(task_list_id) ON DELETE SET NULL;

ALTER TABLE "public"."activist_tasks"
  ADD CONSTRAINT "activist_tasks_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(worker_id) ON DELETE CASCADE;

ALTER TABLE "public"."campaign_activist_profiles"
  ADD CONSTRAINT "campaign_activist_profiles_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE;

ALTER TABLE "public"."campaign_activist_profiles"
  ADD CONSTRAINT "campaign_activist_profiles_recruited_by_fkey" FOREIGN KEY (recruited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_activist_profiles"
  ADD CONSTRAINT "campaign_activist_profiles_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(worker_id) ON DELETE CASCADE;

ALTER TABLE "public"."campaign_activities"
  ADD CONSTRAINT "campaign_activities_an_resource_type_check"
    CHECK
    (((an_resource_type)::text = ANY (ARRAY[('form'::character varying)::text, ('survey'::character varying)::text, ('petition'::character varying)::text, ('event'::character
    varying)::text])));

ALTER TABLE "public"."campaign_comms_drafts"
  ADD CONSTRAINT "campaign_comms_drafts_sent_via_check"
    CHECK
    (((sent_via IS NULL) OR ((sent_via)::text = ANY (ARRAY[('action_network'::character varying)::text, ('yabbr'::character varying)::text, ('manual'::character varying)::text,
    ('mobile_message'::character varying)::text, ('sendgrid'::character varying)::text, ('outlook_direct'::character varying)::text]))));

ALTER TABLE "public"."campaign_organising_units"
  ADD CONSTRAINT "campaign_organising_units_ou_group_id_fkey" FOREIGN KEY (ou_group_id) REFERENCES public.campaign_organising_units(ou_id);

ALTER TABLE "public"."campaign_organising_units"
  ADD CONSTRAINT "campaign_organising_units_user_rating_check" CHECK (((user_rating IS NULL) OR ((user_rating >= 1) AND (user_rating <= 5))));

ALTER TABLE "public"."campaign_ou_coverage"
  ADD CONSTRAINT "campaign_ou_coverage_leader_worker_id_fkey" FOREIGN KEY (leader_worker_id) REFERENCES public.workers(worker_id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_ou_coverage"
  ADD CONSTRAINT "campaign_ou_coverage_ou_id_fkey" FOREIGN KEY (ou_id) REFERENCES public.campaign_organising_units(ou_id) ON DELETE CASCADE;

ALTER TABLE "public"."campaign_ou_coverage"
  ADD CONSTRAINT "campaign_ou_coverage_second_worker_id_fkey" FOREIGN KEY (second_worker_id) REFERENCES public.workers(worker_id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_wocs"
  ADD CONSTRAINT "campaign_wocs_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE;

ALTER TABLE "public"."campaign_wocs"
  ADD CONSTRAINT "campaign_wocs_scope_ou_id_fkey" FOREIGN KEY (scope_ou_id) REFERENCES public.campaign_organising_units(ou_id) ON DELETE SET NULL;

ALTER TABLE "public"."email_canned_replies"
  ADD CONSTRAINT "email_canned_replies_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE;

ALTER TABLE "public"."email_canned_replies"
  ADD CONSTRAINT "email_canned_replies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."email_conversation_events"
  ADD CONSTRAINT "email_conversation_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."email_conversation_notes"
  ADD CONSTRAINT "email_conversation_notes_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."email_conversations"
  ADD CONSTRAINT "email_conversations_assignee_user_id_fkey" FOREIGN KEY (assignee_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."email_conversations"
  ADD CONSTRAINT "email_conversations_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id) ON DELETE SET NULL;

ALTER TABLE "public"."email_conversations"
  ADD CONSTRAINT "email_conversations_claim_user_id_fkey" FOREIGN KEY (claim_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."email_conversations"
  ADD CONSTRAINT "email_conversations_closed_by_user_id_fkey" FOREIGN KEY (closed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."email_conversation_events"
  ADD CONSTRAINT "email_conversation_events_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.email_conversations(conversation_id) ON DELETE CASCADE;

ALTER TABLE "public"."email_conversation_notes"
  ADD CONSTRAINT "email_conversation_notes_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.email_conversations(conversation_id) ON DELETE CASCADE;

ALTER TABLE "public"."email_conversations"
  ADD CONSTRAINT "email_conversations_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(worker_id) ON DELETE SET NULL;

ALTER TABLE "public"."email_delivery_events"
  ADD CONSTRAINT "email_delivery_events_send_id_fkey" FOREIGN KEY (send_id) REFERENCES public.email_send_log(send_id) ON DELETE SET NULL;

ALTER TABLE "public"."email_engagement_events"
  ADD CONSTRAINT "email_engagement_events_event_type_check"
    CHECK
    ((event_type = ANY (ARRAY['replied'::text, 'bounced'::text, 'clicked'::text, 'forwarded'::text, 'delivered'::text, 'opened'::text, 'unsubscribed'::text, 'spam_report'::text])));

ALTER TABLE "public"."email_list_items"
  ADD CONSTRAINT "email_list_items_status_check"
    CHECK
    (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('queued'::character varying)::text, ('sending'::character varying)::text, ('sent'::character
    varying)::text,
    ('delivered'::character varying)::text,
    ('failed'::character varying)::text,
    ('skipped'::character varying)::text, ('bounced'::character varying)::text, ('unsubscribed'::character varying)::text, ('opted_out'::character varying)::text])));

ALTER TABLE "public"."email_lists"
  ADD CONSTRAINT "email_lists_status_check"
    CHECK
    (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('active'::character varying)::text, ('queued'::character varying)::text, ('sending'::character
    varying)::text, ('sent'::character varying)::text, ('completed'::character varying)::text, ('paused'::character varying)::text, ('cancelled'::character varying)::text])));

ALTER TABLE "public"."email_message_attachments"
  ADD CONSTRAINT "email_message_attachments_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."email_messages"
  ADD CONSTRAINT "email_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.email_conversations(conversation_id) ON DELETE CASCADE;

ALTER TABLE "public"."email_delivery_events"
  ADD CONSTRAINT "email_delivery_events_email_message_id_fkey" FOREIGN KEY (email_message_id) REFERENCES public.email_messages(message_id) ON DELETE SET NULL;

ALTER TABLE "public"."email_messages"
  ADD CONSTRAINT "email_messages_send_id_fkey" FOREIGN KEY (send_id) REFERENCES public.email_send_log(send_id) ON DELETE SET NULL;

ALTER TABLE "public"."email_messages"
  ADD CONSTRAINT "email_messages_sender_user_id_fkey" FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."email_unsubscribe_tokens"
  ADD CONSTRAINT "email_unsubscribe_tokens_send_id_fkey" FOREIGN KEY (send_id) REFERENCES public.email_send_log(send_id) ON DELETE SET NULL;

ALTER TABLE "public"."email_unsubscribe_tokens"
  ADD CONSTRAINT "email_unsubscribe_tokens_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(worker_id) ON DELETE CASCADE;

ALTER TABLE "public"."email_wrappers"
  ADD CONSTRAINT "email_wrappers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_comms_drafts"
  ADD CONSTRAINT "campaign_comms_drafts_wrapper_id_fkey" FOREIGN KEY (wrapper_id) REFERENCES public.email_wrappers(wrapper_id) ON DELETE SET NULL;

ALTER TABLE "public"."email_lists"
  ADD CONSTRAINT "email_lists_wrapper_id_fkey" FOREIGN KEY (wrapper_id) REFERENCES public.email_wrappers(wrapper_id) ON DELETE SET NULL;

ALTER TABLE "public"."participation_import_batches"
  ADD CONSTRAINT "participation_import_batches_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES public.campaign_activities(activity_id) ON DELETE CASCADE;

ALTER TABLE "public"."participation_import_batches"
  ADD CONSTRAINT "participation_import_batches_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE;

ALTER TABLE "public"."participation_import_batches"
  ADD CONSTRAINT "participation_import_batches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_activity_ratings"
  ADD CONSTRAINT "campaign_activity_ratings_import_batch_id_fkey" FOREIGN KEY (import_batch_id) REFERENCES public.participation_import_batches(batch_id) ON DELETE SET NULL;

ALTER TABLE "public"."sms_lists"
  ADD CONSTRAINT "sms_lists_relay_id_fkey" FOREIGN KEY (relay_id) REFERENCES public.sms_relays(relay_id) ON DELETE SET NULL;

ALTER TABLE "public"."structure_test_results"
  ADD CONSTRAINT "structure_test_results_leader_worker_id_fkey" FOREIGN KEY (leader_worker_id) REFERENCES public.workers(worker_id) ON DELETE SET NULL;

ALTER TABLE "public"."structure_test_results"
  ADD CONSTRAINT "structure_test_results_ou_id_fkey" FOREIGN KEY (ou_id) REFERENCES public.campaign_organising_units(ou_id) ON DELETE CASCADE;

ALTER TABLE "public"."structure_tests"
  ADD CONSTRAINT "structure_tests_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES public.campaign_activities(activity_id) ON DELETE SET NULL;

ALTER TABLE "public"."structure_tests"
  ADD CONSTRAINT "structure_tests_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE;

ALTER TABLE "public"."structure_tests"
  ADD CONSTRAINT "structure_tests_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.activity_events(event_id) ON DELETE SET NULL;

ALTER TABLE "public"."structure_test_results"
  ADD CONSTRAINT "structure_test_results_structure_test_id_fkey" FOREIGN KEY (structure_test_id) REFERENCES public.structure_tests(structure_test_id) ON DELETE CASCADE;

ALTER TABLE "public"."woc_committee_meetings"
  ADD CONSTRAINT "woc_committee_meetings_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES public.campaign_activities(activity_id) ON DELETE SET NULL;

ALTER TABLE "public"."woc_committee_meetings"
  ADD CONSTRAINT "woc_committee_meetings_chair_worker_id_fkey" FOREIGN KEY (chair_worker_id) REFERENCES public.workers(worker_id) ON DELETE SET NULL;

ALTER TABLE "public"."woc_committee_meetings"
  ADD CONSTRAINT "woc_committee_meetings_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.activity_events(event_id) ON DELETE SET NULL;

ALTER TABLE "public"."woc_committee_meetings"
  ADD CONSTRAINT "woc_committee_meetings_next_chair_worker_id_fkey" FOREIGN KEY (next_chair_worker_id) REFERENCES public.workers(worker_id) ON DELETE SET NULL;

ALTER TABLE "public"."activist_tasks"
  ADD CONSTRAINT "activist_tasks_set_in_woc_meeting_id_fkey" FOREIGN KEY (set_in_woc_meeting_id) REFERENCES public.woc_committee_meetings(meeting_id) ON DELETE SET NULL;

ALTER TABLE "public"."woc_committee_meetings"
  ADD CONSTRAINT "woc_committee_meetings_woc_id_fkey" FOREIGN KEY (woc_id) REFERENCES public.campaign_wocs(woc_id) ON DELETE CASCADE;

ALTER TABLE "public"."woc_members"
  ADD CONSTRAINT "woc_members_woc_id_fkey" FOREIGN KEY (woc_id) REFERENCES public.campaign_wocs(woc_id) ON DELETE CASCADE;

ALTER TABLE "public"."woc_members"
  ADD CONSTRAINT "woc_members_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(worker_id) ON DELETE CASCADE;

ALTER TABLE "public"."woc_scope_units"
  ADD CONSTRAINT "woc_scope_units_ou_id_fkey" FOREIGN KEY (ou_id) REFERENCES public.campaign_organising_units(ou_id) ON DELETE CASCADE;

ALTER TABLE "public"."woc_scope_units"
  ADD CONSTRAINT "woc_scope_units_woc_id_fkey" FOREIGN KEY (woc_id) REFERENCES public.campaign_wocs(woc_id) ON DELETE CASCADE;

ALTER TABLE "public"."worker_notes"
  ADD CONSTRAINT "worker_notes_email_message_id_fkey" FOREIGN KEY (email_message_id) REFERENCES public.email_messages(message_id) ON DELETE SET NULL;

ALTER TABLE "public"."workers"
  ADD CONSTRAINT "workers_email_consent_source_check"
    CHECK
    (((email_consent_source IS NULL) OR ((email_consent_source)::text = ANY (ARRAY[('import'::character varying)::text, ('manual'::character varying)::text, ('legacy'::character
    varying)::text]))));

ALTER TABLE "public"."workers"
  ADD CONSTRAINT "workers_email_opt_out_source_check"
    CHECK
    (((email_opt_out_source IS NULL) OR ((email_opt_out_source)::text = ANY (ARRAY[('unsubscribe_link'::character varying)::text, ('spam_report'::character varying)::text,
    ('staff'::character varying)::text, ('import'::character varying)::text]))));

CREATE VIEW "public"."campaign_worker_rating_summary" WITH (security_invoker=true) AS  WITH worker_base_rating AS (
         SELECT m_1.campaign_id,
            m_1.worker_id,
                CASE
                    WHEN (lower((mrt.role_name)::text) = ANY (ARRAY['contact'::text, 'activist'::text, 'delegate'::text])) THEN 1
                    WHEN (w.is_bargaining_rep = true) THEN 1
                    WHEN ((umt.type_name)::text = ANY (ARRAY[('financial_member'::character varying)::text, ('non_oa_member'::character varying)::text, ('member_pending'::character varying)::text])) THEN 2
                    ELSE NULL::integer
                END AS base_rating
           FROM (((public.campaign_worker_membership m_1
             JOIN public.workers w ON ((w.worker_id = m_1.worker_id)))
             LEFT JOIN public.union_membership_types umt ON ((umt.union_membership_type_id = w.union_membership_type_id)))
             LEFT JOIN public.member_role_types mrt ON ((mrt.role_type_id = w.member_role_type_id)))
        ), rating_activity AS (
         SELECT r_1.rating_id,
            r_1.worker_id,
            r_1.activity_id,
            r_1.rating,
            r_1.binary_value,
            r_1.rated_at,
            a.campaign_id,
                CASE
                    WHEN (lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['yes'::text, 'y'::text, 'true'::text, 't'::text, '1'::text])) THEN 'yes'::text
                    WHEN (lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['no'::text, 'n'::text, 'false'::text, 'f'::text, '0'::text])) THEN 'no'::text
                    WHEN (lower(TRIM(BOTH FROM r_1.binary_value)) = 'abstained'::text) THEN 'abstain'::text
                    WHEN (lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text])) THEN lower(TRIM(BOTH FROM r_1.binary_value))
                    ELSE lower(TRIM(BOTH FROM r_1.binary_value))
                END AS binary_key,
                CASE
                    WHEN (lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['yes'::text, 'y'::text, 'true'::text, 't'::text, '1'::text])) THEN 'yes'::text
                    WHEN (lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['no'::text, 'n'::text, 'false'::text, 'f'::text, '0'::text])) THEN 'no'::text
                    WHEN (lower(TRIM(BOTH FROM a.supporter_outcome_value)) = 'abstained'::text) THEN 'abstain'::text
                    WHEN (lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text])) THEN lower(TRIM(BOTH FROM a.supporter_outcome_value))
                    ELSE COALESCE(NULLIF(lower(TRIM(BOTH FROM a.supporter_outcome_value)), ''::text), 'yes'::text)
                END AS supporter_key
           FROM (public.campaign_activity_ratings r_1
             JOIN public.campaign_activities a ON ((a.activity_id = r_1.activity_id)))
          WHERE (a.is_perception = false)
        )
 SELECT m.campaign_id,
    m.worker_id,
        CASE
            WHEN (wb.base_rating IS NOT NULL) THEN (round((((wb.base_rating)::numeric + COALESCE(sum((r.rating)::numeric) FILTER (WHERE (r.rating IS NOT NULL)), (0)::numeric)) / ((1 + count(r.rating_id) FILTER (WHERE (r.rating IS NOT NULL))))::numeric)))::integer
            WHEN (count(r.rating_id) FILTER (WHERE (r.rating IS NOT NULL)) > 0) THEN (round(avg((r.rating)::numeric) FILTER (WHERE (r.rating IS NOT NULL))))::integer
            ELSE NULL::integer
        END AS cumulative_rating,
    ( SELECT r2.rating
           FROM (public.campaign_activity_ratings r2
             JOIN public.campaign_activities a2 ON ((a2.activity_id = r2.activity_id)))
          WHERE ((a2.campaign_id = m.campaign_id) AND (a2.is_perception = false) AND (r2.worker_id = m.worker_id) AND (r2.rating IS NOT NULL))
          ORDER BY r2.rated_at DESC NULLS LAST
         LIMIT 1) AS last_activity_rating,
    COALESCE(bool_or((((r.rating IS NOT NULL) AND (r.rating = ANY (ARRAY[1, 2]))) OR ((r.binary_key IS NOT NULL) AND (r.binary_key <> ALL (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text, 'maybe'::text])) AND (r.binary_key = r.supporter_key)))), false) AS has_supportive_activity_rating,
    (count(DISTINCT r.activity_id) FILTER (WHERE (((r.rating IS NOT NULL) AND (r.rating = ANY (ARRAY[1, 2]))) OR ((r.binary_key IS NOT NULL) AND (r.binary_key <> ALL (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text, 'maybe'::text])) AND (r.binary_key = r.supporter_key)))))::integer AS supportive_activity_count
   FROM ((public.campaign_worker_membership m
     JOIN worker_base_rating wb ON (((wb.campaign_id = m.campaign_id) AND (wb.worker_id = m.worker_id))))
     LEFT JOIN rating_activity r ON (((r.worker_id = m.worker_id) AND (r.campaign_id = m.campaign_id))))
  GROUP BY m.campaign_id, m.worker_id, wb.base_rating;

CREATE VIEW "public"."v_campaign_activist_register" WITH (security_invoker=true) AS  SELECT p.profile_id,
    p.campaign_id,
    p.worker_id,
    (((w.first_name)::text || ' '::text) || (w.last_name)::text) AS worker_name,
    w.member_role_type_id,
    mrt.role_name,
    mrt.display_name AS role_display_name,
    umt.type_name AS union_membership_type,
    w.is_hsr,
    w.is_bargaining_rep,
    cwrs.cumulative_rating AS current_rating,
    p.source,
    p.is_archived,
    p.identified_via,
    p.recruited_by,
    p.recruited_by_text,
    p.recruited_at,
    p.domain,
    p.followers_evidence,
    p.skab_notes,
    p.current_rung,
    p.four_a_stage,
    p.last_contact_date,
    p.next_contact_date,
    p.notes,
    p.created_at,
    p.updated_at,
    t.activist_task_id AS current_task_id,
    t.responsibility AS current_task_responsibility,
    t.rung AS current_task_rung,
    t.due_date AS current_task_due,
    t.status AS current_task_status,
    wm.woc_ids,
    wm.woc_names
   FROM ((((((public.campaign_activist_profiles p
     JOIN public.workers w ON ((w.worker_id = p.worker_id)))
     LEFT JOIN public.member_role_types mrt ON ((mrt.role_type_id = w.member_role_type_id)))
     LEFT JOIN public.union_membership_types umt ON ((umt.union_membership_type_id = w.union_membership_type_id)))
     LEFT JOIN public.campaign_worker_rating_summary cwrs ON (((cwrs.campaign_id = p.campaign_id) AND (cwrs.worker_id = p.worker_id))))
     LEFT JOIN LATERAL ( SELECT activist_tasks.activist_task_id,
            activist_tasks.responsibility,
            activist_tasks.rung,
            activist_tasks.due_date,
            activist_tasks.status
           FROM public.activist_tasks
          WHERE ((activist_tasks.campaign_id = p.campaign_id) AND (activist_tasks.worker_id = p.worker_id) AND (activist_tasks.status = ANY (ARRAY['draft'::text, 'assigned'::text, 'in_progress'::text])))
          ORDER BY COALESCE(activist_tasks.assigned_at, (activist_tasks.created_at)::date) DESC, activist_tasks.activist_task_id DESC
         LIMIT 1) t ON (true))
     LEFT JOIN LATERAL ( SELECT array_agg(cw.woc_id) AS woc_ids,
            array_agg(cw.name) AS woc_names
           FROM (public.woc_members m
             JOIN public.campaign_wocs cw ON ((cw.woc_id = m.woc_id)))
          WHERE ((m.worker_id = p.worker_id) AND (cw.campaign_id = p.campaign_id) AND (m.left_on IS NULL))) wm ON (true));

CREATE VIEW "public"."v_campaign_coverage_map" WITH (security_invoker=true) AS  SELECT cou.campaign_id,
    cou.ou_id,
    cou.name AS ou_name,
    cou.ou_type,
    cou.parent_ou_id,
    COALESCE(cou.is_group_container, false) AS is_group_container,
    cou.total_workers_estimated,
    counts.assigned_workers,
    counts.member_count,
        CASE
            WHEN (COALESCE(counts.assigned_workers, (0)::bigint) = 0) THEN NULL::numeric
            ELSE round(((counts.member_count)::numeric / (counts.assigned_workers)::numeric), 3)
        END AS density,
    cov.leader_worker_id,
    (((lw.first_name)::text || ' '::text) || (lw.last_name)::text) AS leader_name,
    leader_rating.cumulative_rating AS leader_rating,
    cov.second_worker_id,
    (((sw.first_name)::text || ' '::text) || (sw.last_name)::text) AS second_name,
    cov.reachable_48h,
    cov.priority_action,
        CASE
            WHEN (cov.leader_worker_id IS NULL) THEN 'gap'::text
            WHEN (cov.second_worker_id IS NULL) THEN 'leader_no_second'::text
            ELSE 'covered'::text
        END AS coverage_status
   FROM (((((public.campaign_organising_units cou
     LEFT JOIN public.campaign_ou_coverage cov ON ((cov.ou_id = cou.ou_id)))
     LEFT JOIN public.workers lw ON ((lw.worker_id = cov.leader_worker_id)))
     LEFT JOIN public.workers sw ON ((sw.worker_id = cov.second_worker_id)))
     LEFT JOIN public.campaign_worker_rating_summary leader_rating ON (((leader_rating.campaign_id = cou.campaign_id) AND (leader_rating.worker_id = cov.leader_worker_id))))
     LEFT JOIN LATERAL ( SELECT count(DISTINCT cwo.worker_id) AS assigned_workers,
            count(DISTINCT cwo.worker_id) FILTER (WHERE ((umt.type_name)::text = ANY (ARRAY[('financial_member'::character varying)::text, ('member_pending'::character varying)::text]))) AS member_count
           FROM ((public.campaign_worker_ou cwo
             JOIN public.workers w ON ((w.worker_id = cwo.worker_id)))
             LEFT JOIN public.union_membership_types umt ON ((umt.union_membership_type_id = w.union_membership_type_id)))
          WHERE (cwo.ou_id = cou.ou_id)) counts ON (true));

CREATE VIEW "public"."v_campaign_coverage_summary" WITH (security_invoker=true) AS  SELECT campaign_id,
    count(*) AS units_mapped,
    count(*) FILTER (WHERE (coverage_status = 'covered'::text)) AS units_covered,
    count(*) FILTER (WHERE (coverage_status = 'leader_no_second'::text)) AS units_leader_no_second,
    count(*) FILTER (WHERE (coverage_status = 'gap'::text)) AS units_gap,
    sum(COALESCE(assigned_workers, (0)::bigint)) AS workers_mapped,
    sum(COALESCE(member_count, (0)::bigint)) AS members,
        CASE
            WHEN (sum(COALESCE(assigned_workers, (0)::bigint)) = (0)::numeric) THEN NULL::numeric
            ELSE round((sum(COALESCE(member_count, (0)::bigint)) / sum(COALESCE(assigned_workers, (0)::bigint))), 3)
        END AS overall_density
   FROM public.v_campaign_coverage_map m
  WHERE (is_group_container = false)
  GROUP BY campaign_id;

CREATE VIEW "public"."v_campaign_foundational_readiness" WITH (security_invoker=true) AS  SELECT campaign_id,
    (COALESCE(( SELECT sum(ou.total_workers_estimated) AS sum
           FROM public.campaign_organising_units ou
          WHERE ((ou.campaign_id = c.campaign_id) AND (ou.total_workers_estimated IS NOT NULL))), (0)::bigint))::integer AS universe_size,
    (( SELECT count(DISTINCT cwm.worker_id) AS count
           FROM public.campaign_worker_membership cwm
          WHERE (cwm.campaign_id = c.campaign_id)))::integer AS workers_allocated,
    (( SELECT count(DISTINCT cwm.worker_id) AS count
           FROM (public.campaign_worker_membership cwm
             JOIN public.workers w ON ((w.worker_id = cwm.worker_id)))
          WHERE ((cwm.campaign_id = c.campaign_id) AND (((w.phone IS NOT NULL) AND ((w.phone)::text <> ''::text)) OR ((w.email IS NOT NULL) AND ((w.email)::text <> ''::text))))))::integer AS workers_with_contact,
    (( SELECT count(DISTINCT cwrs.worker_id) AS count
           FROM public.campaign_worker_rating_summary cwrs
          WHERE ((cwrs.campaign_id = c.campaign_id) AND (cwrs.cumulative_rating IS NOT NULL))))::integer AS workers_with_rating,
    (( SELECT count(*) AS count
           FROM public.campaign_organising_units ou
          WHERE ((ou.campaign_id = c.campaign_id) AND (ou.anchor_worker_id IS NULL))))::integer AS ous_missing_leaders
   FROM public.campaigns c;

CREATE VIEW "public"."v_section_plan_soc_recording_grid" WITH (security_invoker=on) AS  SELECT s.soc_id,
    sp.section_plan_id,
    sp.campaign_id,
    s.soc_kind,
    s.name AS soc_name,
    w.worker_id,
    (((w.first_name)::text || ' '::text) || (w.last_name)::text) AS worker_name,
    w.member_role_type_id,
    cwrs.cumulative_rating AS current_rating,
    r.no_vote_rating,
    r.pabo_rating,
    r.member_status_confirmed,
    r.notes,
    r.recorded_at,
    r.activity_event_id
   FROM (((((public.section_plan_socs s
     JOIN public.section_plans sp ON ((sp.section_plan_id = s.section_plan_id)))
     JOIN public.campaign_worker_membership cwm ON ((cwm.campaign_id = sp.campaign_id)))
     JOIN public.workers w ON ((w.worker_id = cwm.worker_id)))
     LEFT JOIN public.campaign_worker_rating_summary cwrs ON (((cwrs.campaign_id = sp.campaign_id) AND (cwrs.worker_id = w.worker_id))))
     LEFT JOIN LATERAL ( SELECT section_plan_soc_recordings.no_vote_rating,
            section_plan_soc_recordings.pabo_rating,
            section_plan_soc_recordings.member_status_confirmed,
            section_plan_soc_recordings.notes,
            section_plan_soc_recordings.recorded_at,
            section_plan_soc_recordings.activity_event_id
           FROM public.section_plan_soc_recordings
          WHERE ((section_plan_soc_recordings.soc_id = s.soc_id) AND (section_plan_soc_recordings.worker_id = w.worker_id))
          ORDER BY section_plan_soc_recordings.recorded_at DESC
         LIMIT 1) r ON (true));

CREATE VIEW "public"."v_section_plan_workforce_mapping" WITH (security_invoker=on) AS  SELECT ou.campaign_id,
    ou.ou_id AS worksite_ou_id,
    ou.name AS worksite_name,
    ou.total_workers_estimated,
    (count(DISTINCT cwo.worker_id))::integer AS workers_count,
    (count(DISTINCT
        CASE
            WHEN (w.member_role_type_id IS NOT NULL) THEN cwo.worker_id
            ELSE NULL::integer
        END))::integer AS members_count,
        CASE
            WHEN (count(DISTINCT cwo.worker_id) = 0) THEN NULL::numeric
            ELSE round(((100.0 * (count(DISTINCT
            CASE
                WHEN (w.member_role_type_id IS NOT NULL) THEN cwo.worker_id
                ELSE NULL::integer
            END))::numeric) / (count(DISTINCT cwo.worker_id))::numeric), 1)
        END AS density_pct,
    (count(DISTINCT
        CASE
            WHEN (w.member_role_type_id IS NULL) THEN cwo.worker_id
            ELSE NULL::integer
        END))::integer AS non_member_count,
    (count(DISTINCT
        CASE
            WHEN (cwrs.cumulative_rating IS NULL) THEN cwo.worker_id
            ELSE NULL::integer
        END))::integer AS unrated_count
   FROM (((public.campaign_organising_units ou
     LEFT JOIN public.campaign_worker_ou cwo ON ((cwo.ou_id = ou.ou_id)))
     LEFT JOIN public.workers w ON ((w.worker_id = cwo.worker_id)))
     LEFT JOIN public.campaign_worker_rating_summary cwrs ON (((cwrs.campaign_id = ou.campaign_id) AND (cwrs.worker_id = cwo.worker_id))))
  WHERE ((ou.ou_type)::text = 'worksite'::text)
  GROUP BY ou.campaign_id, ou.ou_id, ou.name, ou.total_workers_estimated;

CREATE VIEW "public"."v_strength_assessment_inputs" WITH (security_invoker=true) AS  WITH rating_counts AS (
         SELECT campaign_worker_rating_summary.campaign_id,
            count(*) AS eligible_count,
            count(*) FILTER (WHERE (campaign_worker_rating_summary.cumulative_rating = 1)) AS supportive_leader_count,
            count(*) FILTER (WHERE (campaign_worker_rating_summary.cumulative_rating = 2)) AS supporter_count,
            count(*) FILTER (WHERE (campaign_worker_rating_summary.cumulative_rating = 3)) AS neutral_count,
            count(*) FILTER (WHERE (campaign_worker_rating_summary.cumulative_rating = 4)) AS opposed_count,
            count(*) FILTER (WHERE (campaign_worker_rating_summary.cumulative_rating = 5)) AS oppositional_count,
            count(*) FILTER (WHERE (campaign_worker_rating_summary.cumulative_rating IS NULL)) AS unassessed_count
           FROM public.campaign_worker_rating_summary
          GROUP BY campaign_worker_rating_summary.campaign_id
        ), ambition_agg AS (
         SELECT ambition_progress.campaign_id,
            sum(ambition_progress.universe) AS total_ambition_universe,
            sum(ambition_progress.supportive) AS total_supportive,
            sum(ambition_progress.unassessed) AS total_unassessed,
                CASE
                    WHEN (sum(ambition_progress.universe) > (0)::numeric) THEN round(((100.0 * sum(ambition_progress.supportive)) / sum(ambition_progress.universe)), 1)
                    ELSE (0)::numeric
                END AS overall_supportive_pct
           FROM public.ambition_progress
          GROUP BY ambition_progress.campaign_id
        )
 SELECT rc.campaign_id,
    rc.eligible_count,
    rc.supportive_leader_count,
    rc.supporter_count,
    rc.neutral_count,
    rc.opposed_count,
    rc.oppositional_count,
    rc.unassessed_count,
    aa.total_ambition_universe,
    aa.total_supportive,
    aa.total_unassessed,
    aa.overall_supportive_pct
   FROM (rating_counts rc
     LEFT JOIN ambition_agg aa USING (campaign_id));

CREATE VIEW "public"."v_woc_unit_representation" WITH (security_invoker=true) AS  WITH RECURSIVE scope AS (
         SELECT cw_1.woc_id,
            cw_1.scope_ou_id AS ou_id
           FROM public.campaign_wocs cw_1
          WHERE (cw_1.scope_ou_id IS NOT NULL)
        UNION
         SELECT wsu.woc_id,
            wsu.ou_id
           FROM public.woc_scope_units wsu
        UNION
         SELECT s_1.woc_id,
            child.ou_id
           FROM (scope s_1
             JOIN public.campaign_organising_units child ON ((child.parent_ou_id = s_1.ou_id)))
        )
 SELECT s.woc_id,
    cw.campaign_id,
    s.ou_id,
    cou.name AS ou_name,
    cou.parent_ou_id,
    (EXISTS ( SELECT 1
           FROM (public.woc_members m
             JOIN public.campaign_worker_ou cwo ON (((cwo.worker_id = m.worker_id) AND (cwo.ou_id = s.ou_id))))
          WHERE ((m.woc_id = s.woc_id) AND (m.left_on IS NULL)))) AS represented,
    ( SELECT count(DISTINCT m.worker_id) AS count
           FROM (public.woc_members m
             JOIN public.campaign_worker_ou cwo ON (((cwo.worker_id = m.worker_id) AND (cwo.ou_id = s.ou_id))))
          WHERE ((m.woc_id = s.woc_id) AND (m.left_on IS NULL))) AS member_count
   FROM ((scope s
     JOIN public.campaign_wocs cw ON ((cw.woc_id = s.woc_id)))
     JOIN public.campaign_organising_units cou ON ((cou.ou_id = s.ou_id)))
  WHERE (COALESCE(cou.is_group_container, false) = false);

CREATE VIEW "public"."vw_email_campaign_summary" AS  SELECT el.campaign_id,
    el.list_id,
    el.name AS list_name,
    el.status AS list_status,
    el.draft_id,
    el.wrapper_id,
    el.timezone,
    el.blackout_override,
    el.scheduled_for,
    el.total_items,
    el.sent_items,
    el.delivered_items,
    el.failed_items,
    el.created_at,
    count(eli.item_id) AS item_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'pending'::text)) AS pending_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'queued'::text)) AS queued_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'sending'::text)) AS sending_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'sent'::text)) AS sent_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'delivered'::text)) AS delivered_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'failed'::text)) AS failed_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'skipped'::text)) AS skipped_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'bounced'::text)) AS bounced_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'unsubscribed'::text)) AS unsubscribed_count,
    count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'opted_out'::text)) AS opted_out_count,
        CASE
            WHEN (count(eli.item_id) FILTER (WHERE ((eli.status)::text = ANY (ARRAY[('sent'::character varying)::text, ('delivered'::character varying)::text, ('failed'::character varying)::text, ('bounced'::character varying)::text]))) > 0) THEN round(((100.0 * (count(eli.item_id) FILTER (WHERE ((eli.status)::text = 'delivered'::text)))::numeric) / (count(eli.item_id) FILTER (WHERE ((eli.status)::text = ANY (ARRAY[('sent'::character varying)::text, ('delivered'::character varying)::text, ('failed'::character varying)::text, ('bounced'::character varying)::text]))))::numeric), 1)
            ELSE (0)::numeric
        END AS delivery_rate_pct
   FROM (public.email_lists el
     LEFT JOIN public.email_list_items eli ON ((eli.list_id = el.list_id)))
  GROUP BY el.campaign_id, el.list_id, el.name, el.status, el.draft_id, el.wrapper_id, el.timezone, el.blackout_override, el.scheduled_for, el.total_items, el.sent_items, el.delivered_items, el.failed_items, el.created_at;

CREATE INDEX idx_activist_tasks_campaign_worker ON public.activist_tasks USING btree (campaign_id, worker_id);

CREATE INDEX idx_activist_tasks_status ON public.activist_tasks USING btree (campaign_id, status);

CREATE INDEX idx_activist_tasks_woc_meeting ON public.activist_tasks USING btree (set_in_woc_meeting_id)
  WHERE (set_in_woc_meeting_id IS NOT NULL);

CREATE INDEX idx_campaign_activities_an_resource ON public.campaign_activities USING btree (an_resource_type, an_resource_id)
  WHERE (an_resource_id IS NOT NULL);

CREATE INDEX idx_campaign_wocs_campaign ON public.campaign_wocs USING btree (campaign_id);

CREATE INDEX idx_cap_campaign ON public.campaign_activist_profiles USING btree (campaign_id);

CREATE INDEX idx_cap_next_contact ON public.campaign_activist_profiles USING btree (campaign_id, next_contact_date)
  WHERE ((next_contact_date IS NOT NULL) AND (is_archived = false));

CREATE INDEX idx_cap_worker ON public.campaign_activist_profiles USING btree (worker_id);

CREATE INDEX idx_car_import_batch ON public.campaign_activity_ratings USING btree (import_batch_id)
  WHERE (import_batch_id IS NOT NULL);

CREATE INDEX idx_ece_actor ON public.email_conversation_events USING btree (actor_user_id)
  WHERE (actor_user_id IS NOT NULL);

CREATE INDEX idx_ece_conversation ON public.email_conversation_events USING btree (conversation_id, created_at, event_id);

CREATE INDEX idx_ecnotes_author ON public.email_conversation_notes USING btree (author_user_id);

CREATE INDEX idx_ecnotes_conversation ON public.email_conversation_notes USING btree (conversation_id, created_at, note_id);

CREATE INDEX idx_econv_active_claim ON public.email_conversations USING btree (claim_user_id, claimed_until)
  WHERE (claim_user_id IS NOT NULL);

CREATE INDEX idx_econv_assignee ON public.email_conversations USING btree (assignee_user_id, last_message_at DESC)
  WHERE (assignee_user_id IS NOT NULL);

CREATE INDEX idx_econv_campaign ON public.email_conversations USING btree (campaign_id)
  WHERE (campaign_id IS NOT NULL);

CREATE INDEX idx_econv_closed_by ON public.email_conversations USING btree (closed_by_user_id)
  WHERE (closed_by_user_id IS NOT NULL);

CREATE INDEX idx_econv_graph_conversation ON public.email_conversations USING btree (graph_conversation_id)
  WHERE (graph_conversation_id IS NOT NULL);

CREATE INDEX idx_econv_inbox ON public.email_conversations USING btree (last_message_at DESC, conversation_id DESC);

CREATE INDEX idx_econv_state ON public.email_conversations USING btree (state, last_message_at DESC);

CREATE INDEX idx_econv_subject_normalized ON public.email_conversations USING btree (subject_normalized)
  WHERE (subject_normalized IS NOT NULL);

CREATE INDEX idx_econv_worker ON public.email_conversations USING btree (worker_id)
  WHERE (worker_id IS NOT NULL);

CREATE INDEX idx_ecr_campaign_active ON public.email_canned_replies USING btree (campaign_id, title)
  WHERE is_active;

CREATE INDEX idx_ecr_campaign ON public.email_canned_replies USING btree (campaign_id);

CREATE INDEX idx_ecr_created_by ON public.email_canned_replies USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX idx_ede_email_message ON public.email_delivery_events USING btree (email_message_id)
  WHERE (email_message_id IS NOT NULL);

CREATE INDEX idx_ede_occurred ON public.email_delivery_events USING btree (occurred_at DESC);

CREATE INDEX idx_ede_send ON public.email_delivery_events USING btree (send_id)
  WHERE (send_id IS NOT NULL);

CREATE INDEX idx_el_dispatch ON public.email_lists USING btree (status)
  WHERE ((status)::text = ANY (ARRAY[('queued'::character varying)::text, ('sending'::character varying)::text]));

CREATE INDEX idx_eli_provider_message ON public.email_list_items USING btree (provider_message_id)
  WHERE (provider_message_id IS NOT NULL);

CREATE INDEX idx_ema_conversation ON public.email_message_attachments USING btree (conversation_id, created_at);

CREATE INDEX idx_ema_created_by ON public.email_message_attachments USING btree (created_by_user_id)
  WHERE (created_by_user_id IS NOT NULL);

CREATE INDEX idx_ema_message ON public.email_message_attachments USING btree (message_id);

CREATE INDEX idx_email_messages_pending_reply_workflow ON public.email_messages USING btree (reply_workflow_processing_started_at, created_at)
  WHERE (reply_workflow_processed_at IS NULL);

CREATE INDEX idx_emsg_conversation_page ON public.email_messages USING btree (conversation_id, message_id DESC);

CREATE INDEX idx_emsg_conversation ON public.email_messages USING btree (conversation_id, created_at);

CREATE INDEX idx_emsg_send ON public.email_messages USING btree (send_id)
  WHERE (send_id IS NOT NULL);

CREATE INDEX idx_esl_provider_message ON public.email_send_log USING btree (provider_message_id)
  WHERE (provider_message_id IS NOT NULL);

CREATE INDEX idx_eut_worker ON public.email_unsubscribe_tokens USING btree (worker_id);

CREATE INDEX idx_pib_activity ON public.participation_import_batches USING btree (activity_id);

CREATE INDEX idx_pib_campaign ON public.participation_import_batches USING btree (campaign_id);

CREATE INDEX idx_sl_relay ON public.sms_lists USING btree (relay_id)
  WHERE (relay_id IS NOT NULL);

CREATE INDEX idx_str_results_ou ON public.structure_test_results USING btree (ou_id);

CREATE INDEX idx_str_results_test ON public.structure_test_results USING btree (structure_test_id);

CREATE INDEX idx_structure_tests_campaign ON public.structure_tests USING btree (campaign_id, test_date DESC);

CREATE INDEX idx_wcm_activity ON public.woc_committee_meetings USING btree (activity_id)
  WHERE (activity_id IS NOT NULL);

CREATE INDEX idx_wcm_woc_date ON public.woc_committee_meetings USING btree (woc_id, meeting_date DESC);

CREATE INDEX idx_woc_members_woc ON public.woc_members USING btree (woc_id);

CREATE INDEX idx_woc_members_worker ON public.woc_members USING btree (worker_id);

CREATE UNIQUE INDEX uq_email_engagement_source_message ON public.email_engagement_events USING btree (send_id, event_type, source_message_id)
  WHERE (source_message_id IS NOT NULL);

CREATE UNIQUE INDEX uq_email_messages_graph_message_id ON public.email_messages USING btree (graph_message_id)
  WHERE (graph_message_id IS NOT NULL);

CREATE UNIQUE INDEX uq_email_messages_id_conversation ON public.email_messages USING btree (message_id, conversation_id);

ALTER TABLE "public"."email_message_attachments"
  ADD CONSTRAINT "fk_email_attachment_message_conversation" FOREIGN KEY (message_id, conversation_id) REFERENCES public.email_messages(message_id, conversation_id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX uq_email_messages_rfc_message_id ON public.email_messages USING btree (rfc_message_id)
  WHERE (rfc_message_id IS NOT NULL);

CREATE UNIQUE INDEX uq_email_wrappers_default ON public.email_wrappers USING btree (is_default)
  WHERE is_default;

CREATE UNIQUE INDEX uq_worker_notes_email_message ON public.worker_notes USING btree (email_message_id)
  WHERE (email_message_id IS NOT NULL);

CREATE TRIGGER trg_activist_profile_on_activist_task
  AFTER INSERT ON public.activist_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_activist_profile_on_activist_task();

CREATE TRIGGER trg_activist_tasks_updated_at
  BEFORE UPDATE ON public.activist_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_campaign_activist_profiles_updated_at
  BEFORE UPDATE ON public.campaign_activist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_activist_profile_on_rating
  AFTER INSERT OR UPDATE OF rating ON public.campaign_activity_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_activist_profile_on_rating();

CREATE TRIGGER trg_campaign_ou_coverage_updated_at
  BEFORE UPDATE ON public.campaign_ou_coverage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_activist_profile_on_task_list
  AFTER INSERT OR UPDATE OF status, leader_worker_id ON public.campaign_task_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_activist_profile_on_task_list();

CREATE TRIGGER trg_campaign_wocs_updated_at
  BEFORE UPDATE ON public.campaign_wocs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_activist_profile_on_membership
  AFTER INSERT ON public.campaign_worker_membership
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_activist_profile_on_membership();

CREATE TRIGGER trg_email_canned_replies_updated_at
  BEFORE UPDATE ON public.email_canned_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_email_conversations_updated_at
  BEFORE UPDATE ON public.email_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_refresh_email_conversation_from_message
  AFTER INSERT ON public.email_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_email_conversation_from_message();

CREATE TRIGGER trg_email_wrappers_updated_at
  BEFORE UPDATE ON public.email_wrappers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_structure_test_results_updated_at
  BEFORE UPDATE ON public.structure_test_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_structure_tests_updated_at
  BEFORE UPDATE ON public.structure_tests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_woc_committee_meetings_updated_at
  BEFORE UPDATE ON public.woc_committee_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_activist_profile_on_woc_member
  AFTER INSERT ON public.woc_members
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_activist_profile_on_woc_member();

CREATE TRIGGER trg_woc_members_updated_at
  BEFORE UPDATE ON public.woc_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_activist_profile_on_role_change
  AFTER UPDATE OF member_role_type_id ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_activist_profile_on_role_change();

CREATE POLICY "activist_tasks_read" ON "public"."activist_tasks"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "activist_tasks_write" ON "public"."activist_tasks"
  FOR ALL
  TO "authenticated"
  USING (public.can_write_to_campaign(campaign_id));

CREATE POLICY "campaign_activist_profiles_read" ON "public"."campaign_activist_profiles"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "campaign_activist_profiles_write" ON "public"."campaign_activist_profiles"
  FOR ALL
  TO "authenticated"
  USING (public.can_write_to_campaign(campaign_id));

CREATE POLICY "campaign_ou_coverage_read" ON "public"."campaign_ou_coverage"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "campaign_ou_coverage_write" ON "public"."campaign_ou_coverage"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.campaign_organising_units cou
  WHERE ((cou.ou_id = campaign_ou_coverage.ou_id) AND public.can_write_to_campaign(cou.campaign_id)))));

CREATE POLICY "campaign_wocs_read" ON "public"."campaign_wocs"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "campaign_wocs_write" ON "public"."campaign_wocs"
  FOR ALL
  TO "authenticated"
  USING (public.can_write_to_campaign(campaign_id));

CREATE POLICY "Authenticated read email canned replies" ON "public"."email_canned_replies"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Staff delete email canned replies" ON "public"."email_canned_replies"
  FOR DELETE
  TO "authenticated"
  USING (((campaign_id IS NULL) OR public.can_write_to_campaign(campaign_id)));

CREATE POLICY "Staff insert email canned replies" ON "public"."email_canned_replies"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND ((campaign_id IS NULL) OR public.can_write_to_campaign(campaign_id))));

CREATE POLICY "Staff update email canned replies" ON "public"."email_canned_replies"
  FOR UPDATE
  TO "authenticated"
  USING (((campaign_id IS NULL) OR public.can_write_to_campaign(campaign_id)))
  WITH CHECK (((campaign_id IS NULL) OR public.can_write_to_campaign(campaign_id)));

CREATE POLICY "Authenticated read email conversation events" ON "public"."email_conversation_events"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Staff insert email conversation events" ON "public"."email_conversation_events"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((actor_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.email_conversations c
  WHERE ((c.conversation_id = email_conversation_events.conversation_id) AND ((c.campaign_id IS NULL) OR public.can_write_to_campaign(c.campaign_id)))))));

CREATE POLICY "Authenticated read email conversation notes" ON "public"."email_conversation_notes"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Authors insert email conversation notes" ON "public"."email_conversation_notes"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((author_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.email_conversations c
  WHERE ((c.conversation_id = email_conversation_notes.conversation_id) AND ((c.campaign_id IS NULL) OR public.can_write_to_campaign(c.campaign_id)))))));

CREATE POLICY "Authenticated read email_conversations" ON "public"."email_conversations"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Staff delete email_conversations" ON "public"."email_conversations"
  FOR DELETE
  TO "authenticated"
  USING (((campaign_id IS NULL) OR public.can_write_to_campaign(campaign_id)));

CREATE POLICY "Staff insert email_conversations" ON "public"."email_conversations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((campaign_id IS NULL) OR public.can_write_to_campaign(campaign_id)));

CREATE POLICY "Staff update email_conversations" ON "public"."email_conversations"
  FOR UPDATE
  TO "authenticated"
  USING (((campaign_id IS NULL) OR public.can_write_to_campaign(campaign_id)))
  WITH CHECK (((campaign_id IS NULL) OR public.can_write_to_campaign(campaign_id)));

CREATE POLICY "Authenticated read email attachments" ON "public"."email_message_attachments"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Authenticated read email_messages" ON "public"."email_messages"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Staff insert email_messages" ON "public"."email_messages"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.email_conversations c
  WHERE ((c.conversation_id = email_messages.conversation_id) AND ((c.campaign_id IS NULL) OR public.can_write_to_campaign(c.campaign_id))))));

CREATE POLICY "Admins write email_wrappers" ON "public"."email_wrappers"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated read email_wrappers" ON "public"."email_wrappers"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Admin can delete participation_import_batches" ON "public"."participation_import_batches"
  FOR DELETE
  TO "authenticated"
  USING ((public.get_user_role() = 'admin'::text));

CREATE POLICY "Admin/User can insert participation_import_batches" ON "public"."participation_import_batches"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.get_user_role() = ANY (ARRAY['admin'::text, 'user'::text])));

CREATE POLICY "Admin/User can update participation_import_batches" ON "public"."participation_import_batches"
  FOR UPDATE
  TO "authenticated"
  USING ((public.get_user_role() = ANY (ARRAY['admin'::text, 'user'::text])))
  WITH CHECK ((public.get_user_role() = ANY (ARRAY['admin'::text, 'user'::text])));

CREATE POLICY "Authenticated users can read participation_import_batches" ON "public"."participation_import_batches"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "structure_test_results_read" ON "public"."structure_test_results"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "structure_test_results_write" ON "public"."structure_test_results"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.structure_tests st
  WHERE ((st.structure_test_id = structure_test_results.structure_test_id) AND public.can_write_to_campaign(st.campaign_id)))));

CREATE POLICY "structure_tests_read" ON "public"."structure_tests"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "structure_tests_write" ON "public"."structure_tests"
  FOR ALL
  TO "authenticated"
  USING (public.can_write_to_campaign(campaign_id));

CREATE POLICY "woc_committee_meetings_read" ON "public"."woc_committee_meetings"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "woc_committee_meetings_write" ON "public"."woc_committee_meetings"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.campaign_wocs cw
  WHERE ((cw.woc_id = woc_committee_meetings.woc_id) AND public.can_write_to_campaign(cw.campaign_id)))));

CREATE POLICY "woc_members_read" ON "public"."woc_members"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "woc_members_write" ON "public"."woc_members"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.campaign_wocs cw
  WHERE ((cw.woc_id = woc_members.woc_id) AND public.can_write_to_campaign(cw.campaign_id)))));

CREATE POLICY "woc_scope_units_read" ON "public"."woc_scope_units"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "woc_scope_units_write" ON "public"."woc_scope_units"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.campaign_wocs cw
  WHERE ((cw.woc_id = woc_scope_units.woc_id) AND public.can_write_to_campaign(cw.campaign_id)))));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."campaigns";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."email_conversation_notes";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."email_conversations";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."email_messages";

COMMENT ON COLUMN "public"."campaign_activities"."an_resource_id" IS 'Action Network action id this assessment tracks (uuid from the AN API). Set by the participation import wizard; enables one-click re-sync.';

COMMENT ON COLUMN "public"."campaign_activities"."is_perception" IS 'True for perception-of-others questions (e.g. "how many coworkers will vote yes?"). Ratings on perception assessments are excluded from cumulative_rating, last_activity_rating and supportive-activity flags.';

COMMENT ON COLUMN "public"."campaign_comms_drafts"."wrapper_id" IS 'Email wrapper applied at platform (SendGrid) send time. NULL = the default wrapper.';

COMMENT ON COLUMN "public"."campaign_organising_units"."user_rating" IS 'Subjective organiser rating of the unit: 1 (extremely strong) .. 5 (hostile). Independent of worker assessment ratings and of any sub-unit ratings.';

COMMENT ON COLUMN "public"."email_conversations"."graph_conversation_id" IS 'Microsoft Graph conversation id when this in-app thread has been reconciled with Outlook.';

COMMENT ON COLUMN "public"."email_conversations"."original_subject" IS 'First non-empty subject observed for the conversation.';

COMMENT ON COLUMN "public"."email_conversations"."subject" IS 'Latest non-empty message subject, refreshed by the message append trigger.';

COMMENT ON COLUMN "public"."sms_lists"."relay_id" IS 'When set, this blast is a launch text for the relay: it invites members to text the relay number. A relay may have several (launch, reminder). The relay number is a permitted sender ONLY for lists carrying its relay_id.';

COMMENT ON COLUMN "public"."sms_messages"."reactions" IS 'SMS tapback reactions (like/love/…) from the member, stored on the parent message. Each element: {kind, emoji, from_e164, at, provider_message_id}.';

COMMENT ON COLUMN "public"."workers"."email_opt_out" IS 'Email consent withdrawal (Spam Act). Independent of email_status, which is deliverability (bounce) only. Re-checked at dispatch time.';

COMMENT ON FUNCTION "public"."record_assessment_event"(integer, integer, integer, character varying, character varying, integer, character varying, text, uuid, integer) IS
  'Single upsert entry point for campaign_activity_ratings. Validates rating range and phase; returns the rating_id. Other sources (SMS, email, petition, meeting, staff UI, AN import) should funnel through this.';

COMMENT ON TABLE "public"."email_canned_replies" IS 'Reusable email inbox reply snippets; campaign_id NULL means organisation-wide.';

COMMENT ON TABLE "public"."email_conversation_events" IS 'Staff workflow audit trail for assignment, state, campaign, worker, and consent changes.';

COMMENT ON TABLE "public"."email_conversation_notes" IS 'Internal staff notes rendered in the email timeline; never sent externally.';

COMMENT ON TABLE "public"."email_conversations" IS 'Email threads for the hybrid in-app inbox, fed by SendGrid Inbound Parse (forwarded from the real offshore-alliance.au mailbox). One thread per member address per campaign scope (UNIQUE NULLS NOT DISTINCT).';

COMMENT ON TABLE "public"."email_delivery_events" IS 'SendGrid Event Webhook audit log (service-role only). UNIQUE(provider_event_id) makes redelivered webhooks no-ops.';

COMMENT ON TABLE "public"."email_message_attachments" IS 'Private Storage metadata for inbound and outbound email attachments.';

COMMENT ON TABLE "public"."email_messages" IS 'Per-message rows in an email conversation (inbound + outbound). UNIQUE provider_message_id makes webhook appends idempotent.';

COMMENT ON TABLE "public"."email_unsubscribe_tokens" IS 'Per-(worker, send) unsubscribe tokens for /u/[token]. Service-role only.';

COMMENT ON TABLE "public"."email_wrappers" IS 'Reusable header/footer shells applied around the draft body at platform send time. footer_html must contain {{unsubscribe_url}}.';

COMMENT ON VIEW "public"."v_campaign_foundational_readiness" IS 'Per-campaign readiness snapshot for the Phase 2 bargaining hub. Five metrics: universe_size (sum of OU estimates), workers_allocated (campaign_worker_membership headcount), workers_with_contact (have phone or email), workers_with_rating (have a cumulative_rating), ous_missing_leaders (no anchor_worker_id). security_invoker=true so RLS on underlying tables is inherited.';

COMMENT ON VIEW "public"."v_strength_assessment_inputs" IS 'Live pre-population data for the bargaining strength capture form. Aggregates worker rating counts from campaign_worker_rating_summary and ambition progress from ambition_progress. Security-invoker so RLS is inherited.';

GRANT EXECUTE
  ON FUNCTION "public"."apply_participation_import"(integer, jsonb, character varying, character varying, uuid, integer)
  TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."complete_email_reply_workflow"(bigint, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."complete_email_reply_workflow"(bigint, timestamp WITH time zone) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."confirm_upcoming_project_match"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."delete_campaign"(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."fn_activist_profile_on_activist_task"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fn_activist_profile_on_activist_task"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."fn_activist_profile_on_membership"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fn_activist_profile_on_membership"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."fn_activist_profile_on_rating"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fn_activist_profile_on_rating"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."fn_activist_profile_on_role_change"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fn_activist_profile_on_role_change"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."fn_activist_profile_on_task_list"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fn_activist_profile_on_task_list"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."fn_activist_profile_on_woc_member"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fn_activist_profile_on_woc_member"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."fn_ensure_activist_profile"(integer, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fn_ensure_activist_profile"(integer, integer, text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."fn_role_type_is_activist_like"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fn_role_type_is_activist_like"(integer) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."increment_email_click_count"(bigint, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."increment_email_click_count"(bigint, timestamp WITH time zone) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."increment_email_open_count"(bigint, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."increment_email_open_count"(bigint, timestamp WITH time zone) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."match_workers_for_import"(text[], text[], text[], text[]) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."normalise_email_subject"(text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."normalise_phone_au"(text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE
  ON FUNCTION "public"."record_assessment_event"(integer, integer, integer, character varying, character varying, integer, character varying, text, uuid, integer)
  TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."refresh_email_conversation_from_message"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."skip_call_list_item_for_share"(integer, integer, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."sync_agreement_expired_status_by_date"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."touch_email_conversation_inbound"(integer, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."touch_email_conversation_inbound"(integer, timestamp WITH time zone) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."touch_email_conversation_outbound"(integer, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."touch_email_conversation_outbound"(integer, timestamp WITH time zone) TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."activist_tasks_activist_task_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."campaign_activist_profiles_profile_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."campaign_ou_coverage_coverage_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."campaign_wocs_woc_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."email_canned_replies_reply_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."email_conversation_events_event_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."email_conversation_notes_note_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."email_conversations_conversation_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."email_delivery_events_event_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."email_message_attachments_attachment_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."email_messages_message_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."email_wrappers_wrapper_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."participation_import_batches_batch_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."structure_test_results_result_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."structure_tests_structure_test_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."woc_committee_meetings_meeting_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."woc_members_woc_member_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."activist_tasks" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_activist_profiles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_ou_coverage" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_wocs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_canned_replies" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_conversation_events" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_conversation_notes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_conversations" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_delivery_events" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_message_attachments" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_messages" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_unsubscribe_tokens" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_wrappers" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."participation_import_batches"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."structure_test_results" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."structure_tests" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."woc_committee_meetings" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."woc_members" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."woc_scope_units" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."campaign_worker_rating_summary"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."v_campaign_activist_register"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_campaign_coverage_map" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_campaign_coverage_summary" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."v_campaign_foundational_readiness"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."v_section_plan_soc_recording_grid"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."v_section_plan_workforce_mapping"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."v_strength_assessment_inputs"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_woc_unit_representation" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vw_email_campaign_summary" TO "anon", "authenticated", "postgres", "service_role";
