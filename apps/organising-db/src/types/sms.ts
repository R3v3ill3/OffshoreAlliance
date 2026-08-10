// Hand-written row types for the SMS module tables:
//   - 20260810100000_sms_foundations (sms_numbers, sms_number_assignments)
//   - 20260810120000_sms_broadcast (sms_lists, sms_list_items,
//     sms_send_log, sms_delivery_events, vw_sms_campaign_summary)
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
