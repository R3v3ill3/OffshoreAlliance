/**
 * SMS archive / delete policy — pure, so the hub, campaign sheets and
 * API cannot drift on what is live, what may be archived, and who may
 * delete.
 *
 * Archive is hygiene (archived_at). It is not a status. Paused counts
 * as live: paused surveys still intercept inbound, paused relays still
 * claim the number, paused blasts still have queued recipients.
 */

import type { SmsActionKind } from '@/lib/sms/hub-actions'

export type SmsArchiveRole = 'admin' | 'user' | 'viewer'

export type SmsLifecycleAction =
  | 'cancel_blast'
  | 'close_survey'
  | 'end_relay'
  | 'open_board'

export interface SmsArchiveSubject {
  kind: SmsActionKind
  status: string
  archivedAt: string | null
  /** Chat boards: list.sent_items. Unused openers-never-sent = 0. */
  sentItems?: number
  /** Relays: rows in sms_relay_messages. Unused = 0. */
  relayMessageCount?: number
  isTest?: boolean
  isBallot?: boolean
  /** Relays with campaign_id NULL. */
  isOrgWide?: boolean
  writesFacts?: boolean
  writesRatings?: boolean
}

export type ArchivedFilter = 'exclude' | 'include' | 'only'

export function parseArchivedParam(raw: string | null | undefined): ArchivedFilter {
  if (raw === '1' || raw === 'include') return 'include'
  if (raw === 'only') return 'only'
  return 'exclude'
}

/**
 * Still sending, receiving, or able to resume into that. Chat `draft`
 * with any send is an open board; unused draft boards are not live.
 */
export function isSmsActionLive(subject: SmsArchiveSubject): boolean {
  const { kind, status } = subject
  switch (kind) {
    case 'blast':
      return status === 'queued' || status === 'sending' || status === 'paused'
    case 'chat':
      return status === 'draft' && (subject.sentItems ?? 0) > 0
    case 'survey':
      return status === 'open' || status === 'paused'
    case 'relay':
      return status === 'active' || (status === 'paused' && (subject.relayMessageCount ?? 0) > 0)
  }
}

/** Unused setup that should be deleted rather than archived. */
export function isSmsActionUnusedDraft(subject: SmsArchiveSubject): boolean {
  if (subject.archivedAt) return false
  switch (subject.kind) {
    case 'blast':
      return subject.status === 'draft'
    case 'chat':
      return subject.status === 'draft' && (subject.sentItems ?? 0) === 0
    case 'survey':
      return subject.status === 'draft'
    case 'relay':
      return subject.status === 'paused' && (subject.relayMessageCount ?? 0) === 0
  }
}

export function isSmsActionInertForArchive(subject: SmsArchiveSubject): boolean {
  if (subject.archivedAt) return false
  switch (subject.kind) {
    case 'blast':
      return subject.status === 'sent' || subject.status === 'cancelled'
    case 'chat':
      return subject.status === 'sent' || subject.status === 'cancelled'
    case 'survey':
      return subject.status === 'closed'
    case 'relay':
      return subject.status === 'ended'
  }
}

export function archiveBlocker(subject: SmsArchiveSubject): {
  message: string
  lifecycle: SmsLifecycleAction
} | null {
  if (subject.archivedAt) {
    return null
  }
  if (isSmsActionUnusedDraft(subject)) {
    return null
  }
  if (isSmsActionInertForArchive(subject)) {
    return null
  }
  switch (subject.kind) {
    case 'blast':
      if (subject.status === 'paused') {
        return {
          message: 'Cancel this blast before archiving — paused sends still have queued recipients that would resume.',
          lifecycle: 'cancel_blast',
        }
      }
      return {
        message: 'This blast is still sending. Cancel it before archiving.',
        lifecycle: 'cancel_blast',
      }
    case 'chat':
      return {
        message: 'This is an open board. Close it before archiving.',
        lifecycle: 'open_board',
      }
    case 'survey':
      return {
        message:
          subject.status === 'paused'
            ? 'Close this survey before archiving — a paused survey still intercepts replies and holds live sessions.'
            : 'This survey is still open. Close it before archiving.',
        lifecycle: 'close_survey',
      }
    case 'relay':
      return {
        message:
          'End this relay and release its number before archiving. A paused relay still claims the number and intercepts inbound.',
        lifecycle: 'end_relay',
      }
  }
}

export type SmsDeleteGate =
  | { allowed: false; status: 403 | 409; error: string; lifecycle?: SmsLifecycleAction; needsTypedConfirm?: boolean }
  | { allowed: true; needsTypedConfirm: boolean; usesAdminClient: boolean }

export function deleteGate(
  subject: SmsArchiveSubject,
  role: SmsArchiveRole,
): SmsDeleteGate {
  if (role === 'viewer') {
    return { allowed: false, status: 403, error: 'No write access' }
  }
  const isAdmin = role === 'admin'

  if (subject.kind === 'relay' && subject.isOrgWide && !isAdmin) {
    return {
      allowed: false,
      status: 403,
      error: 'Only admins can delete org-wide relays — archive instead',
    }
  }

  if (isSmsActionLive(subject)) {
    const block = archiveBlocker(subject)
    return {
      allowed: false,
      status: 409,
      error: block?.message ?? 'This action is still live',
      lifecycle: block?.lifecycle,
    }
  }

  if (isSmsActionUnusedDraft(subject)) {
    return { allowed: true, needsTypedConfirm: false, usesAdminClient: subject.kind === 'relay' }
  }

  // Closed (or archived) test surveys: writers may delete with a
  // confirm dialog, no type-DELETE. Production finished work stays
  // admin-only.
  if (subject.kind === 'survey' && subject.isTest) {
    return { allowed: true, needsTypedConfirm: false, usesAdminClient: true }
  }

  // Finished / archived work.
  if (!isAdmin) {
    return {
      allowed: false,
      status: 403,
      error: 'Only admins can delete finished SMS actions — archive instead',
    }
  }

  if (subject.kind === 'survey' && subject.isBallot) {
    return { allowed: true, needsTypedConfirm: true, usesAdminClient: true }
  }

  return { allowed: true, needsTypedConfirm: true, usesAdminClient: true }
}

export function canArchive(role: SmsArchiveRole, subject: SmsArchiveSubject): boolean {
  if (role === 'viewer') return false
  if (subject.archivedAt) return false
  if (isSmsActionUnusedDraft(subject)) return false
  return isSmsActionInertForArchive(subject) && archiveBlocker(subject) === null
}

export function canUnarchive(role: SmsArchiveRole, subject: SmsArchiveSubject): boolean {
  if (role === 'viewer') return false
  return subject.archivedAt != null
}

export function lifecycleLabel(action: SmsLifecycleAction): string {
  switch (action) {
    case 'cancel_blast':
      return 'Cancel blast'
    case 'close_survey':
      return 'Close survey'
    case 'end_relay':
      return 'End relay and release number'
    case 'open_board':
      return 'Open board'
  }
}

export interface SmsPairMember {
  kind: SmsActionKind
  id: number
  campaignId: number | null
  name: string
}

/** GET /api/sms/actions inspect payload — shared by API and UI. */
export interface SmsActionInspect {
  kind: SmsActionKind
  id: number
  campaignId: number | null
  name: string
  status: string
  archivedAt: string | null
  isTest: boolean
  isBallot: boolean
  isOrgWide: boolean
  isEpisode: boolean
  writesFacts: boolean
  writesRatings: boolean
  canArchive: boolean
  canUnarchive: boolean
  canDelete: boolean
  needsTypedConfirm: boolean
  blocker: { message: string; lifecycle: SmsLifecycleAction } | null
  pair: SmsPairMember[]
  exportHref: string | null
  factsWarning: string | null
}
