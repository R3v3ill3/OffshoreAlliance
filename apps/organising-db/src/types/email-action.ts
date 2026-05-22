/**
 * Narrowed TypeScript types for the campaign-scoped email orchestration
 * state stored on campaign_comms_drafts (entry_branch, email_list_id) and
 * email_lists / email_list_items.
 *
 * Mirrors the shape of phone-call-action.ts. Unlike phone, email has no
 * separate orchestration table — the session lives on the existing draft
 * row, so these types are intentionally smaller.
 */

export type EmailPathway = 'ai' | 'paste'
export type EmailOrder = 'setup_first' | 'list_first'

export type EmailEntryBranch =
  | 'ai_first'
  | 'paste_first'
  | 'ai_list_first'
  | 'paste_list_first'
  | 'build_list'

/** Map a (pathway, order) pair to the entry_branch enum value. */
export function entryBranchForEmail(pathway: EmailPathway, order: EmailOrder): EmailEntryBranch {
  if (pathway === 'ai') {
    return order === 'setup_first' ? 'ai_first' : 'ai_list_first'
  }
  return order === 'setup_first' ? 'paste_first' : 'paste_list_first'
}

/** Derive the pathway from an entry_branch value. build_list defaults to 'ai'. */
export function pathwayForEmail(branch: EmailEntryBranch): EmailPathway {
  if (branch === 'paste_first' || branch === 'paste_list_first') return 'paste'
  return 'ai'
}

/** Derive the order from an entry_branch value. build_list is treated as list_first. */
export function orderForEmail(branch: EmailEntryBranch): EmailOrder {
  if (branch === 'ai_first' || branch === 'paste_first') return 'setup_first'
  return 'list_first'
}

export type EmailListStatus = 'draft' | 'active' | 'sent' | 'completed' | 'paused'
export type EmailListItemStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'skipped'
  | 'bounced'
  | 'unsubscribed'

export interface EmailList {
  list_id: number
  campaign_id: number
  draft_id: number | null
  name: string
  description: string | null
  status: EmailListStatus
  source_filters: Record<string, unknown> | null
  total_items: number
  sent_items: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EmailListItem {
  item_id: number
  list_id: number
  worker_id: number
  email: string | null
  sort_order: number
  priority_score: number | null
  status: EmailListItemStatus
  send_status_detail: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}
