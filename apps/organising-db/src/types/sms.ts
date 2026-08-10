// Hand-written row types for the SMS module tables:
//   - 20260810100000_sms_foundations (sms_numbers, sms_number_assignments)
//   - 20260810120000_sms_broadcast (sms_lists, sms_list_items,
//     sms_send_log, sms_delivery_events, vw_sms_campaign_summary)
//   - 20260810140000_sms_conversations (sms_conversations, sms_messages,
//     sms_conversation_notes, sms_canned_replies)
//   - 20260811120000_sms_surveys (sms_surveys, sms_survey_questions,
//     sms_survey_sessions, sms_survey_answers + funnel views)
// TODO: replace with generated types after migration apply (pnpm gen:types).

export type SmsNumberPurpose = "organiser" | "relay" | "survey" | "spare";

export interface SmsNumberRow {
  number_id: number;
  phone_e164: string;
  label: string | null;
  purpose: SmsNumberPurpose;
  organiser_id: number | null;
  provider: string;
  status: "active" | "retired";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsNumberAssignmentRow {
  assignment_id: number;
  number_id: number;
  purpose: SmsNumberPurpose;
  organiser_id: number | null;
  assigned_at: string;
  unassigned_at: string | null;
}

// ─── Phase 1 (broadcast) ────────────────────────────────────────────

export type SmsListStatus =
  | "draft"
  | "queued"
  | "sending"
  | "sent"
  | "paused"
  | "cancelled";

export type SmsListItemStatus =
  | "pending"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "skipped"
  | "opted_out"
  | "blocked";

export type SmsSendLogStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "blocked";

export type SmsDeliveryEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "replied"
  | "opted_out";

export interface SmsListRow {
  list_id: number;
  campaign_id: number;
  draft_id: number | null;
  name: string;
  description: string | null;
  status: SmsListStatus;
  source_filters: Record<string, unknown> | null;
  sender_number_id: number | null;
  timezone: string;
  blackout_override: boolean;
  blackout_override_reason: string | null;
  scheduled_for: string | null;
  total_items: number;
  sent_items: number;
  delivered_items: number;
  failed_items: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsListItemRow {
  item_id: number;
  list_id: number;
  worker_id: number;
  phone_e164: string | null;
  sort_order: number;
  status: SmsListItemStatus;
  claimed_at: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  send_before: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsSendLogRow {
  send_id: number;
  draft_id: number;
  campaign_id: number;
  worker_id: number;
  list_id: number | null;
  phone_e164: string | null;
  provider_message_id: string | null;
  segments: number | null;
  cost: number | null;
  status: SmsSendLogStatus;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  reply_count: number;
  first_reply_at: string | null;
  created_at: string;
}

export interface SmsDeliveryEventRow {
  event_id: number;
  provider_message_id: string;
  event_type: SmsDeliveryEventType;
  part_number: number;
  payload: Record<string, unknown> | null;
  occurred_at: string;
}

// ─── Phase 2 (inbox & 2-way conversations) ──────────────────────────

/**
 * Spoke contact state machine (brief §3.1 item 2) plus 'triage' for
 * unmatched inbound. Inbound always flips a worker-matched thread to
 * 'needs_response' (including closed → reopen).
 */
export type SmsConversationState =
  | "needs_message"
  | "messaged"
  | "needs_response"
  | "convo"
  | "closed"
  | "triage";

export type SmsMessageDirection = "inbound" | "outbound";

export type SmsMessageStatus =
  | "received"
  | "queued"
  | "sent"
  | "delivered"
  | "failed";

export interface SmsConversationRow {
  conversation_id: number;
  our_number_id: number;
  worker_id: number | null;
  phone_e164: string;
  campaign_id: number | null;
  activity_id: number | null;
  state: SmsConversationState;
  assignee_user_id: string | null;
  escalated_to_user_id: string | null;
  claim_user_id: string | null;
  claimed_until: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsMessageRow {
  message_id: number;
  conversation_id: number;
  direction: SmsMessageDirection;
  body: string | null;
  phone_e164: string | null;
  sender_user_id: string | null;
  provider_message_id: string | null;
  interaction_id: number | null;
  status: SmsMessageStatus;
  error: string | null;
  segments: number | null;
  created_at: string;
}

export interface SmsConversationNoteRow {
  note_id: number;
  conversation_id: number;
  author_user_id: string;
  body: string;
  created_at: string;
}

export interface SmsCannedReplyRow {
  reply_id: number;
  campaign_id: number | null;
  title: string;
  body: string;
  is_active: boolean;
  /**
   * Phase 3 scripted-answer link (20260811100000): the assessment
   * outcome this reply follows up — binary values (yes/no/unsure/
   * abstain) or '1'..'5' for scale ratings. NULL = plain canned reply.
   */
  outcome_value: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Phase 3 (in-chat assessment capture) ───────────────────────────

/**
 * Thread context scopes (brief §7.3): 'conversation' is the native
 * thread; 'activity' filters to activity-linked traffic; 'campaign' /
 * 'all' merge every conversation for the worker (read-only in the UI —
 * the composer always sends to the current conversation).
 */
export type SmsThreadScope = "conversation" | "activity" | "campaign" | "all";

// ─── Phase 4 (survey engine) ────────────────────────────────────────

export type SmsSurveyPurpose = "survey" | "indicative_ballot";
export type SmsSurveyStatus = "draft" | "open" | "closed";
export type SmsSurveyQuestionType = "choice" | "yes_no" | "scale" | "open_text";

/**
 * §4.1 per-recipient session state machine:
 * queued → invited → active → completed | expired | opted_out |
 * handed_off | undeliverable. At most ONE invited/active session
 * per phone (partial unique index).
 */
export type SmsSurveySessionState =
  | "queued"
  | "invited"
  | "active"
  | "completed"
  | "expired"
  | "opted_out"
  | "handed_off"
  | "undeliverable";

export interface SmsSurveyChoiceOption {
  value: string;
  label: string;
  synonyms?: string[];
}

export interface SmsSurveyScaleRange {
  min: number;
  max: number;
}

/** Per-answer next-question overrides: parsed value → question_id | 'end'. */
export type SmsSurveyBranching = Record<string, number | "end">;

export interface SmsSurveyRow {
  survey_id: number;
  campaign_id: number;
  activity_id: number | null;
  title: string;
  purpose: SmsSurveyPurpose;
  status: SmsSurveyStatus;
  version: number;
  retry_limit: number;
  question_timeout_minutes: number;
  session_ttl_hours: number;
  reminder_offsets: number[];
  handoff_escalate_to: string | null;
  sender_number_id: number | null;
  timezone: string;
  blackout_override: boolean;
  blackout_override_reason: string | null;
  invitation_body: string | null;
  completion_body: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsSurveyQuestionRow {
  question_id: number;
  survey_id: number;
  sort_order: number;
  prompt: string;
  qtype: SmsSurveyQuestionType;
  options: SmsSurveyChoiceOption[] | SmsSurveyScaleRange | null;
  branching: SmsSurveyBranching | null;
  write_rating: boolean;
  invalid_prompt: string | null;
  nudge_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsSurveySessionRow {
  session_id: number;
  survey_id: number;
  survey_version: number;
  worker_id: number;
  phone_e164: string;
  conversation_id: number | null;
  state: SmsSurveySessionState;
  current_question_id: number | null;
  retry_count: number;
  nudged: boolean;
  reminders_sent: number;
  last_prompt_at: string | null;
  invited_at: string | null;
  first_answer_at: string | null;
  last_activity_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsSurveyAnswerRow {
  answer_id: number;
  session_id: number;
  question_id: number;
  raw_body: string | null;
  parsed_value: string | null;
  invalid_attempts: number;
  provider_message_id: string | null;
  received_at: string;
  created_at: string;
}

export interface VwSmsSurveyFunnelRow {
  survey_id: number;
  campaign_id: number;
  total_sessions: number;
  queued_count: number;
  invited_count: number;
  active_count: number;
  completed_count: number;
  expired_count: number;
  opted_out_count: number;
  handed_off_count: number;
  undeliverable_count: number;
  ever_invited_count: number;
  started_count: number;
}

export interface VwSmsSurveyQuestionStatsRow {
  survey_id: number;
  question_id: number;
  sort_order: number;
  qtype: SmsSurveyQuestionType;
  answered_count: number;
  unparsed_count: number;
  invalid_attempts: number;
}

export interface VwSmsCampaignSummaryRow {
  campaign_id: number;
  list_id: number;
  list_name: string;
  list_status: SmsListStatus;
  draft_id: number | null;
  sender_number_id: number | null;
  timezone: string;
  blackout_override: boolean;
  scheduled_for: string | null;
  total_items: number;
  sent_items: number;
  delivered_items: number;
  failed_items: number;
  created_at: string;
  item_count: number;
  pending_count: number;
  queued_count: number;
  sending_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  skipped_count: number;
  opted_out_count: number;
  blocked_count: number;
  delivery_rate_pct: number;
}
