export type EmailConversationState =
  | 'needs_message'
  | 'messaged'
  | 'needs_response'
  | 'convo'
  | 'closed'
  | 'triage'

export type EmailInboxTab =
  | 'mine'
  | 'needs_response'
  | 'unassigned'
  | 'triage'
  | 'waiting'
  | 'team'
  | 'closed'
  | 'all'

export interface EmailConversationWorkerSummary {
  worker_id: number
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  email: string | null
  occupation: string | null
  email_status: string | null
  email_opt_out: boolean
  email_opt_out_at: string | null
  email_opt_out_source: string | null
  employer: { employer_id: number; employer_name: string } | null
  worksite: { worksite_id: number; worksite_name: string } | null
}

export interface EmailConversationListItem {
  conversation_id: number
  worker_id: number | null
  email_address: string
  campaign_id: number | null
  subject: string | null
  original_subject: string | null
  last_message_preview: string | null
  state: EmailConversationState
  assignee_user_id: string | null
  claim_user_id: string | null
  claimed_until: string | null
  is_overdue: boolean
  unread_count: number
  last_message_at: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  graph_conversation_id: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  worker: EmailConversationWorkerSummary | null
  campaign: {
    campaign_id: number
    name: string
    campaign_type?: string | null
    status?: string | null
  } | null
}

export interface EmailMessageAttachment {
  attachment_id: number
  message_id: number
  conversation_id: number
  filename: string
  content_type: string | null
  byte_size: number | null
  content_id: string | null
  is_inline: boolean
  created_at: string
}

export interface EmailMessage {
  message_id: number
  conversation_id: number
  direction: 'inbound' | 'outbound'
  subject: string | null
  body_text: string | null
  body_html: string | null
  from_email: string | null
  to_email: string | null
  provider_message_id: string | null
  rfc_message_id: string | null
  rfc_references: string | null
  graph_message_id: string | null
  send_id: number | null
  sender_user_id: string | null
  status: 'received' | 'queued' | 'sent' | 'delivered' | 'failed'
  error: string | null
  delivered_at: string | null
  created_at: string
  attachments: EmailMessageAttachment[]
}

export interface EmailConversationNote {
  note_id: number
  conversation_id: number
  author_user_id: string | null
  body: string
  created_at: string
}

export interface EmailConversationEvent {
  event_id: number
  conversation_id: number
  actor_user_id: string | null
  event_type:
    | 'assigned'
    | 'state_changed'
    | 'campaign_attached'
    | 'worker_matched'
    | 'opt_out_changed'
  detail: Record<string, unknown>
  created_at: string
}

export interface EmailOriginatingSend {
  send_id: number
  subject: string | null
  body_html: string | null
  body: string | null
  created_at: string
  send_method: string
  delivered_at: string | null
  bounced_at: string | null
  first_open_at: string | null
  open_count: number
  click_count: number
}

export interface EmailConversationDetail {
  conversation: EmailConversationListItem
  messages: EmailMessage[]
  notes: EmailConversationNote[]
  events: EmailConversationEvent[]
  user_names: Record<string, string>
  has_more_messages: boolean
  originating_send: EmailOriginatingSend | null
}

export interface EmailCannedReply {
  reply_id: number
  campaign_id: number | null
  title: string
  body: string
  created_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
