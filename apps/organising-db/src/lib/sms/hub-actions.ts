/**
 * SMS hub helpers — pure, so the hub page, the create wizard and the
 * numbers page cannot drift on what an "action" is, how one is
 * addressed in a URL, and which bucket its status falls in.
 *
 * An SMS action is one of four things an organiser runs: a blast
 * (sms_lists mode 'blast'), a chat board (sms_lists mode 'p2p'), a
 * survey (sms_surveys) or a relay (sms_relays). Blasts, chats and
 * surveys always live inside a campaign — a real one, or the hidden
 * per-send episode campaign behind a standalone action. Relays are
 * either campaign-linked or org-wide (campaign_id NULL).
 */

export type SmsActionKind = 'blast' | 'chat' | 'survey' | 'relay'

export const SMS_ACTION_KINDS: SmsActionKind[] = ['blast', 'chat', 'survey', 'relay']

export const SMS_ACTION_KIND_LABEL: Record<SmsActionKind, string> = {
  blast: 'Blast',
  chat: 'Chat board',
  survey: 'Survey',
  relay: 'Relay',
}

export function isSmsActionKind(value: unknown): value is SmsActionKind {
  return typeof value === 'string' && (SMS_ACTION_KINDS as string[]).includes(value)
}

/**
 * Where an action belongs. `standalone` is only meaningful for blast,
 * chat and survey (they get a hidden episode campaign); `org` is only
 * meaningful for relays (campaign_id NULL).
 */
export type SmsActionScope =
  | { type: 'campaign'; campaignId: number }
  | { type: 'standalone' }
  | { type: 'org' }

/** Scope choices the wizard offers for a kind. */
export function scopeOptionsForKind(kind: SmsActionKind): Array<'standalone' | 'org' | 'campaign'> {
  return kind === 'relay' ? ['org', 'campaign'] : ['standalone', 'campaign']
}

/**
 * `?scope=` on hub URLs: `standalone`, `org`, a campaign id, or
 * absent/`all`. Returns null for "no scope chosen".
 */
export function parseScopeParam(raw: string | null | undefined): SmsActionScope | null {
  if (!raw) return null
  if (raw === 'standalone') return { type: 'standalone' }
  if (raw === 'org') return { type: 'org' }
  const n = Number(raw)
  if (Number.isInteger(n) && n > 0) return { type: 'campaign', campaignId: n }
  return null
}

export function scopeToParam(scope: SmsActionScope): string {
  if (scope.type === 'campaign') return String(scope.campaignId)
  return scope.type
}

/**
 * Status buckets for the hub's filter chips. `live` is something
 * sending or receiving right now; `pending` is set up but not
 * running (drafts, paused sends, a relay created paused); `finished`
 * is done and read-only.
 */
export type SmsActionStatusGroup = 'live' | 'pending' | 'finished'

export const SMS_STATUS_GROUP_LABEL: Record<SmsActionStatusGroup, string> = {
  live: 'Live',
  pending: 'Drafts & paused',
  finished: 'Finished',
}

export function smsActionStatusGroup(
  kind: SmsActionKind,
  status: string,
): SmsActionStatusGroup {
  switch (kind) {
    case 'blast':
      if (status === 'queued' || status === 'sending') return 'live'
      if (status === 'draft' || status === 'paused') return 'pending'
      return 'finished'
    case 'chat':
      // A chat board is its working list; the list stays 'draft' while
      // the board is open and moves on when it is closed.
      return status === 'draft' ? 'live' : 'finished'
    case 'survey':
      if (status === 'open') return 'live'
      if (status === 'draft' || status === 'paused') return 'pending'
      return 'finished'
    case 'relay':
      if (status === 'active') return 'live'
      if (status === 'paused') return 'pending'
      return 'finished'
  }
}

/** Organiser-facing status word — chat boards do not say "draft". */
export function smsActionStatusLabel(kind: SmsActionKind, status: string): string {
  if (kind === 'chat') return status === 'draft' ? 'active' : 'closed'
  return status
}

/**
 * An action reference as it travels in a URL (`?open=blast:12:34`).
 * Blast / chat / survey carry their campaign id because every route
 * under them is campaign-scoped; relays are addressed by relay id.
 */
export type SmsActionRef =
  | { kind: 'blast' | 'chat' | 'survey'; campaignId: number; id: number }
  | { kind: 'relay'; id: number }

export function encodeSmsActionRef(ref: SmsActionRef): string {
  return ref.kind === 'relay'
    ? `relay:${ref.id}`
    : `${ref.kind}:${ref.campaignId}:${ref.id}`
}

export function decodeSmsActionRef(raw: string | null | undefined): SmsActionRef | null {
  if (!raw) return null
  const parts = raw.split(':')
  const kind = parts[0]
  if (!isSmsActionKind(kind)) return null
  const nums = parts.slice(1).map(Number)
  if (nums.some((n) => !Number.isInteger(n) || n <= 0)) return null
  if (kind === 'relay') {
    return nums.length === 1 ? { kind, id: nums[0] } : null
  }
  return nums.length === 2 ? { kind, campaignId: nums[0], id: nums[1] } : null
}

/** Hub URL that opens a given action's detail. Chats open their workspace. */
export function smsActionHref(ref: SmsActionRef, opts?: { standalone?: boolean }): string {
  if (ref.kind === 'chat') {
    return `/campaigns/${ref.campaignId}/sms/chat/${ref.id}`
  }
  const params = new URLSearchParams({ open: encodeSmsActionRef(ref) })
  if (opts?.standalone) params.set('standalone', '1')
  return `/sms?${params.toString()}`
}

/** Wizard URL to start a new action, optionally seeded from an existing one. */
export function smsCreateHref(args: {
  kind?: SmsActionKind
  scope?: SmsActionScope | null
  duplicateFrom?: SmsActionRef | null
}): string {
  const params = new URLSearchParams()
  if (args.kind) params.set('kind', args.kind)
  if (args.scope) params.set('scope', scopeToParam(args.scope))
  if (args.duplicateFrom) params.set('duplicate', encodeSmsActionRef(args.duplicateFrom))
  const qs = params.toString()
  return qs ? `/sms/new?${qs}` : '/sms/new'
}

/** Where an action lives inside its campaign's Outreach → SMS tab. */
export function smsActionCampaignHref(ref: SmsActionRef, campaignId: number | null): string | null {
  if (campaignId == null) return null
  const base = `/campaigns/${campaignId}?tab=outreach&sub=sms`
  switch (ref.kind) {
    case 'blast':
      return `${base}&sms_view=blasts&sms_list=${ref.id}`
    case 'chat':
      return `/campaigns/${campaignId}/sms/chat/${ref.id}`
    case 'survey':
      return `${base}&sms_view=surveys`
    case 'relay':
      return `${base}&sms_view=relays`
  }
}

/** "(copy)" once, never "(copy) (copy)". */
export function duplicateName(name: string | null | undefined): string {
  const base = (name ?? '').replace(/\s*\(copy\)\s*$/i, '').trim()
  return base ? `${base} (copy)` : ''
}
