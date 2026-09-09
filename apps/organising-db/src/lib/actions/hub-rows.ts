/**
 * Actions hub — the one shape every action takes in the hub table,
 * whatever channel it runs on, and the pure rules for bucketing,
 * scoping, sorting and filtering it.
 *
 * An "action" is a piece of outreach an organiser runs: an SMS blast,
 * chat board, survey or relay; an email send; or a call list. Each
 * lives either inside a campaign or on its own — Standalone. The
 * mechanisms differ underneath (SMS uses a hidden per-send campaign,
 * call lists are filed on the shared non-campaign container, org-wide
 * relays carry no campaign at all) but the organiser sees one word.
 *
 * Pure by design: no React, no Supabase client, no `next/*` runtime
 * import. The routes and the hub page both depend on this module, so
 * they cannot drift on what a row means, and vitest exercises it
 * directly.
 */

import {
  smsActionCampaignHref,
  smsActionHref,
  smsActionStatusGroup,
  smsActionStatusLabel,
  type SmsActionKind,
  type SmsActionRef,
} from '@/lib/sms/hub-actions'
import type { SmsActivityRow } from '@/app/api/sms/activity/route'

/** The hub's own route. One constant so `/sms` and `/actions` cannot disagree. */
export { ACTIONS_HUB_PATH } from '@/lib/actions/hub-path'

export type HubActionKind =
  | 'sms_blast'
  | 'sms_chat'
  | 'sms_survey'
  | 'sms_relay'
  | 'email_send'
  | 'call_list'

export const HUB_ACTION_KINDS: HubActionKind[] = [
  'sms_blast',
  'sms_chat',
  'sms_survey',
  'sms_relay',
  'email_send',
  'call_list',
]

/** Plural, because they label filter chips over a list. */
export const HUB_KIND_LABEL: Record<HubActionKind, string> = {
  sms_blast: 'Blasts',
  sms_chat: 'Chats',
  sms_survey: 'Surveys',
  sms_relay: 'Relays',
  email_send: 'Emails',
  call_list: 'Call lists',
}

/** Singular, for the line under a row's name. */
export const HUB_KIND_NOUN: Record<HubActionKind, string> = {
  sms_blast: 'Blast',
  sms_chat: 'Chat board',
  sms_survey: 'Survey',
  sms_relay: 'Relay',
  email_send: 'Email',
  call_list: 'Call list',
}

/**
 * `live` is running right now; `drafts_paused` is set up but not
 * running; `finished` is done and read-only; `archived` is put away.
 * Only SMS can be archived today — no other source table carries
 * `archived_at`.
 */
export type HubActionBucket = 'live' | 'drafts_paused' | 'finished' | 'archived'

export const HUB_ACTION_BUCKETS: HubActionBucket[] = [
  'live',
  'drafts_paused',
  'finished',
  'archived',
]

export const HUB_BUCKET_LABEL: Record<HubActionBucket, string> = {
  live: 'Live',
  drafts_paused: 'Drafts & paused',
  finished: 'Finished',
  archived: 'Archived',
}

/**
 * Where an action belongs. There is no `org` variant: an org-wide
 * relay, a hidden episode campaign and the shared non-campaign
 * container all read as **Standalone** to an organiser.
 */
export type HubActionScope =
  | { kind: 'campaign'; campaignId: number; name: string }
  | { kind: 'standalone' }

export interface HubActionRow {
  /** Stable across kinds; the table key. */
  key: string
  kind: HubActionKind
  name: string
  /** The raw source status, for the badge. */
  status: string
  /** Organiser-facing status word (chat boards say "active", not "draft"). */
  statusLabel: string
  bucket: HubActionBucket
  audienceSize: number
  /** Kind-specific one-liner: "212/240 messaged", "18/40 called". */
  results: string
  scope: HubActionScope
  owner: { userId: string | null; isMine: boolean; unknown: boolean }
  updatedAt: string
  href: string
  /** Where it lives inside its campaign, when it has one; null for Standalone. */
  campaignHref: string | null
  /** SMS rows carry their ref so the hub can open the existing sheets. */
  smsRef: SmsActionRef | null
  /** SMS only — the archive/un-archive/delete controls key off it. */
  archivedAt: string | null
  /** SMS only — extra badges the hub already shows. */
  pendingModerationCount: number
  /** SMS blasts only — the launch-text relay the row belongs to. */
  relayId: number | null
  /** The line under the row's name. */
  subtitle: string
  /** SMS only — the sending number, for the Number column and search. */
  senderPhone: string | null
  senderLabel: string | null
}

export interface ShapeCtx {
  currentUserId: string | null
}

/** What a shaper needs to know about the campaign a row is filed under. */
export interface HubCampaignRef {
  name: string | null
  is_sms_episode: boolean
  is_standing: boolean
}

/** One cross-campaign email row: an `email_lists` row, or an un-listed draft. */
export interface EmailActivityRow {
  /** `list` = an `email_lists` row; `draft` = a `campaign_comms_drafts` row with no list. */
  source: 'list' | 'draft'
  id: number
  campaign_id: number
  /** The wizard target, when there is one. */
  draft_id: number | null
  name: string
  status: string
  total_items: number
  delivered_items: number
  failed_items: number
  created_by: string | null
  created_at: string
  updated_at: string
  campaign: HubCampaignRef | null
}

/** One cross-campaign `call_lists` row. */
export interface CallActivityRow {
  id: number
  campaign_id: number
  name: string
  status: string
  total_items: number
  completed_items: number
  created_by: string | null
  created_at: string
  updated_at: string
  campaign: HubCampaignRef | null
}

const HUB_KIND_BY_SMS_KIND: Record<SmsActionKind, HubActionKind> = {
  blast: 'sms_blast',
  chat: 'sms_chat',
  survey: 'sms_survey',
  relay: 'sms_relay',
}

const SMS_KIND_BY_HUB_KIND: Partial<Record<HubActionKind, SmsActionKind>> = {
  sms_blast: 'blast',
  sms_chat: 'chat',
  sms_survey: 'survey',
  sms_relay: 'relay',
}

export function hubKindForSmsKind(kind: SmsActionKind): HubActionKind {
  return HUB_KIND_BY_SMS_KIND[kind]
}

/** The SMS kind behind a hub kind, or null for email / calls. */
export function smsKindForHubKind(kind: HubActionKind): SmsActionKind | null {
  return SMS_KIND_BY_HUB_KIND[kind] ?? null
}

export function isHubActionKind(value: unknown): value is HubActionKind {
  return typeof value === 'string' && (HUB_ACTION_KINDS as string[]).includes(value)
}

export function isHubActionBucket(value: unknown): value is HubActionBucket {
  return typeof value === 'string' && (HUB_ACTION_BUCKETS as string[]).includes(value)
}

/**
 * Which chip a row sits under. The four SMS kinds delegate to
 * `smsActionStatusGroup` so there is exactly one definition of SMS
 * bucketing and it cannot drift; `pending` is renamed to
 * `drafts_paused` on the way out.
 *
 * An unrecognised status falls to `finished` rather than throwing —
 * data drift must not blank the hub.
 */
export function bucketFor(
  kind: HubActionKind,
  status: string,
  archivedAt?: string | null,
): HubActionBucket {
  const smsKind = smsKindForHubKind(kind)
  if (smsKind) {
    const group = smsActionStatusGroup(smsKind, status, archivedAt)
    return group === 'pending' ? 'drafts_paused' : group
  }
  // Defensive: neither email_lists, campaign_comms_drafts nor
  // call_lists has an archived_at column today.
  if (archivedAt) return 'archived'
  if (kind === 'email_send') {
    // The union of email_lists_status_check and
    // campaign_comms_drafts_status_check; the two sets agree wherever
    // they overlap.
    if (status === 'active' || status === 'queued' || status === 'sending') return 'live'
    if (
      status === 'draft' ||
      status === 'paused' ||
      status === 'generating' ||
      status === 'approved'
    ) {
      return 'drafts_paused'
    }
    return 'finished'
  }
  if (kind === 'call_list') {
    if (status === 'active') return 'live'
    if (status === 'draft' || status === 'paused') return 'drafts_paused'
    return 'finished'
  }
  return 'finished'
}

/** Organiser-facing status word. */
export function statusLabelFor(
  kind: HubActionKind,
  status: string,
  archivedAt?: string | null,
): string {
  const smsKind = smsKindForHubKind(kind)
  if (smsKind) return smsActionStatusLabel(smsKind, status, archivedAt)
  if (archivedAt) return 'archived'
  return status
}

/**
 * One scope rule for all three shapers. Standalone covers every way an
 * action can sit outside a campaign: no campaign at all (org-wide
 * relay), a hidden SMS episode campaign, or the shared non-campaign
 * container that call lists are filed on. The container's name is
 * never shown.
 */
export function scopeFor(
  campaignId: number | null,
  campaign: HubCampaignRef | null | undefined,
): HubActionScope {
  if (campaignId == null) return { kind: 'standalone' }
  if (campaign?.is_sms_episode || campaign?.is_standing) return { kind: 'standalone' }
  return { kind: 'campaign', campaignId, name: campaign?.name?.trim() || 'Campaign' }
}

export function scopeLabelFor(scope: HubActionScope): string {
  return scope.kind === 'standalone' ? 'Standalone' : scope.name
}

function ownerFor(createdBy: string | null, ctx: ShapeCtx) {
  return {
    userId: createdBy,
    isMine: createdBy != null && ctx.currentUserId != null && createdBy === ctx.currentUserId,
    unknown: createdBy == null,
  }
}

export function smsRowToRef(row: SmsActivityRow): SmsActionRef {
  return row.kind === 'relay'
    ? { kind: 'relay', id: row.id }
    : { kind: row.kind, campaignId: row.campaign_id as number, id: row.id }
}

export function shapeSmsRow(row: SmsActivityRow, ctx: ShapeCtx): HubActionRow {
  const kind = hubKindForSmsKind(row.kind)
  const ref = smsRowToRef(row)
  // The activity route has already resolved an episode campaign to
  // `standalone`; feed that through the shared rule rather than
  // re-deriving it, so all three shapers answer the same way.
  const scope = scopeFor(row.campaign_id, {
    name: row.campaign_name,
    is_sms_episode: row.scope === 'standalone',
    is_standing: false,
  })
  const results =
    row.kind === 'survey'
      ? `${row.question_count ?? 0}q · ${row.progress_count}/${row.audience_count} completed`
      : row.kind === 'relay'
        ? `${row.progress_count}/${row.audience_count} target${row.audience_count === 1 ? '' : 's'} active`
        : `${row.progress_count}/${row.audience_count} messaged`
  return {
    key: `${kind}:${row.id}`,
    kind,
    name: row.name,
    status: row.status,
    statusLabel: statusLabelFor(kind, row.status, row.archived_at),
    bucket: bucketFor(kind, row.status, row.archived_at),
    audienceSize: row.audience_count,
    results,
    scope,
    owner: ownerFor(row.created_by ?? null, ctx),
    updatedAt: row.updated_at,
    href: smsActionHref(ref, { standalone: scope.kind === 'standalone' }),
    campaignHref:
      scope.kind === 'campaign' ? smsActionCampaignHref(ref, scope.campaignId) : null,
    smsRef: ref,
    archivedAt: row.archived_at ?? null,
    pendingModerationCount: row.pending_moderation_count ?? 0,
    relayId: row.relay_id ?? null,
    subtitle: row.relay_name
      ? `Launch text for ${row.relay_name}`
      : `${HUB_KIND_NOUN[kind]}${row.is_test ? ' · test' : ''}`,
    senderPhone: row.sender_phone ?? null,
    senderLabel: row.sender_label ?? null,
  }
}

export function shapeEmailRow(row: EmailActivityRow, ctx: ShapeCtx): HubActionRow {
  const kind: HubActionKind = 'email_send'
  const scope = scopeFor(row.campaign_id, row.campaign)
  // A draft that already owns a list is listed once, as the list; the
  // route filters those out, so a `draft` row here has no send record.
  const results =
    row.source === 'draft'
      ? 'Not sent yet'
      : `${row.delivered_items}/${row.total_items} delivered${
          row.failed_items > 0 ? ` · ${row.failed_items} failed` : ''
        }`
  const href =
    row.draft_id != null
      ? `/campaigns/${row.campaign_id}/email/wizard?draft_id=${row.draft_id}`
      : `/campaigns/${row.campaign_id}?tab=outreach&sub=comms`
  return {
    // list_id and draft_id come from different sequences, so the
    // source is part of the key.
    key: `${kind}:${row.source}:${row.id}`,
    kind,
    name: row.name,
    status: row.status,
    statusLabel: statusLabelFor(kind, row.status),
    bucket: bucketFor(kind, row.status),
    audienceSize: row.total_items,
    results,
    scope,
    owner: ownerFor(row.created_by, ctx),
    updatedAt: row.updated_at,
    href,
    campaignHref: scope.kind === 'campaign' ? href : null,
    smsRef: null,
    archivedAt: null,
    pendingModerationCount: 0,
    relayId: null,
    subtitle: row.source === 'draft' ? 'Email draft' : 'Email send',
    senderPhone: null,
    senderLabel: null,
  }
}

export function shapeCallListRow(row: CallActivityRow, ctx: ShapeCtx): HubActionRow {
  const kind: HubActionKind = 'call_list'
  const scope = scopeFor(row.campaign_id, row.campaign)
  const href = `/campaigns/${row.campaign_id}/phone/lists/${row.id}`
  return {
    key: `${kind}:${row.id}`,
    kind,
    name: row.name,
    status: row.status,
    statusLabel: statusLabelFor(kind, row.status),
    bucket: bucketFor(kind, row.status),
    audienceSize: row.total_items,
    results: `${row.completed_items}/${row.total_items} called`,
    scope,
    owner: ownerFor(row.created_by, ctx),
    updatedAt: row.updated_at,
    href,
    campaignHref: scope.kind === 'campaign' ? href : null,
    smsRef: null,
    archivedAt: null,
    pendingModerationCount: 0,
    relayId: null,
    subtitle: 'Call list',
    senderPhone: null,
    senderLabel: null,
  }
}

/** Newest first; ties broken on `key` so the order never flickers. */
export function sortHubRows(rows: HubActionRow[]): HubActionRow[] {
  return [...rows].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key),
  )
}

export interface HubRowFilters {
  mine: boolean
  bucket: HubActionBucket | 'all'
  kind: HubActionKind | 'all'
  search: string
}

export function filterHubRows(rows: HubActionRow[], f: HubRowFilters): HubActionRow[] {
  const term = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.mine && !r.owner.isMine) return false
    if (f.kind !== 'all' && r.kind !== f.kind) return false
    if (f.bucket !== 'all' && r.bucket !== f.bucket) return false
    if (!term) return true
    return (
      r.name.toLowerCase().includes(term) ||
      scopeLabelFor(r.scope).toLowerCase().includes(term) ||
      (r.senderPhone ?? '').includes(term) ||
      (r.senderLabel ?? '').toLowerCase().includes(term)
    )
  })
}

export function countBy(rows: HubActionRow[]): {
  byKind: Record<string, number>
  byBucket: Record<string, number>
} {
  const byKind: Record<string, number> = { all: rows.length }
  const byBucket: Record<string, number> = { all: rows.length }
  for (const r of rows) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
    byBucket[r.bucket] = (byBucket[r.bucket] ?? 0) + 1
  }
  return { byKind, byBucket }
}
