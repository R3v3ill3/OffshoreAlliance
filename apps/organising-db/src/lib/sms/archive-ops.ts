/**
 * Server-side archive / delete for SMS actions. Policy lives in
 * archive-policy.ts; this file loads rows, pairs launch texts with
 * relays, keeps standalone episodes in lockstep, and stamps worker-list
 * provenance when a parent is hard-deleted.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SmsActionKind } from '@/lib/sms/hub-actions'
import {
  archiveBlocker,
  canArchive,
  canUnarchive,
  deleteGate,
  isSmsActionUnusedDraft,
  type SmsArchiveRole,
  type SmsArchiveSubject,
  type SmsLifecycleAction,
  type SmsActionInspect,
  type SmsPairMember,
} from '@/lib/sms/archive-policy'

export type { SmsActionInspect, SmsPairMember }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

export interface SmsActionActor {
  userId: string
  role: SmsArchiveRole
}

export interface SmsActionRefInput {
  kind: SmsActionKind
  id: number
  campaignId?: number | null
}

function roleOf(actor: SmsActionActor): SmsArchiveRole {
  return actor.role
}

async function campaignIsEpisode(db: Db, campaignId: number | null): Promise<boolean> {
  if (campaignId == null) return false
  const { data, error } = await db
    .from('campaigns')
    .select('is_sms_episode')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (error) throw error
  return !!data?.is_sms_episode
}

async function loadList(
  db: Db,
  listId: number,
): Promise<{
  list_id: number
  campaign_id: number
  name: string
  status: string
  mode: string | null
  relay_id: number | null
  archived_at: string | null
  sent_items: number | null
} | null> {
  const { data, error } = await db
    .from('sms_lists')
    .select('list_id, campaign_id, name, status, mode, relay_id, archived_at, sent_items')
    .eq('list_id', listId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function loadSurvey(
  db: Db,
  surveyId: number,
): Promise<{
  survey_id: number
  campaign_id: number
  title: string
  status: string
  purpose: string
  is_test: boolean | null
  archived_at: string | null
  activity_id: number | null
} | null> {
  const { data, error } = await db
    .from('sms_surveys')
    .select(
      'survey_id, campaign_id, title, status, purpose, is_test, archived_at, activity_id',
    )
    .eq('survey_id', surveyId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function loadRelay(
  db: Db,
  relayId: number,
): Promise<{
  relay_id: number
  campaign_id: number | null
  name: string
  status: string
  archived_at: string | null
} | null> {
  const { data, error } = await db
    .from('sms_relays')
    .select('relay_id, campaign_id, name, status, archived_at')
    .eq('relay_id', relayId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function relayMessageCount(db: Db, relayId: number): Promise<number> {
  const { count, error } = await db
    .from('sms_relay_messages')
    .select('relay_message_id', { count: 'exact', head: true })
    .eq('relay_id', relayId)
  if (error) throw error
  return count ?? 0
}

async function surveyWriteFlags(
  db: Db,
  surveyId: number,
): Promise<{ writesFacts: boolean; writesRatings: boolean }> {
  const { data, error } = await db
    .from('sms_survey_questions')
    .select('write_fact, write_rating')
    .eq('survey_id', surveyId)
    .is('retired_at', null)
  if (error) throw error
  const rows = data ?? []
  return {
    writesFacts: rows.some((q) => !!q.write_fact),
    writesRatings: rows.some((q) => !!q.write_rating),
  }
}

async function launchListsForRelay(db: Db, relayId: number) {
  const { data, error } = await db
    .from('sms_lists')
    .select('list_id, campaign_id, name, status, archived_at, sent_items, mode')
    .eq('relay_id', relayId)
  if (error) throw error
  return data ?? []
}

export async function loadSubject(
  db: Db,
  ref: SmsActionRefInput,
): Promise<{ subject: SmsArchiveSubject; row: Record<string, unknown> } | null> {
  if (ref.kind === 'relay') {
    const relay = await loadRelay(db, ref.id)
    if (!relay) return null
    const count = await relayMessageCount(db, relay.relay_id)
    return {
      row: relay,
      subject: {
        kind: 'relay',
        status: relay.status,
        archivedAt: relay.archived_at,
        relayMessageCount: count,
        isOrgWide: relay.campaign_id == null,
      },
    }
  }
  if (ref.kind === 'survey') {
    const survey = await loadSurvey(db, ref.id)
    if (!survey) return null
    if (ref.campaignId != null && survey.campaign_id !== ref.campaignId) return null
    const flags = await surveyWriteFlags(db, survey.survey_id)
    return {
      row: survey,
      subject: {
        kind: 'survey',
        status: survey.status,
        archivedAt: survey.archived_at,
        isTest: !!survey.is_test,
        isBallot: survey.purpose === 'indicative_ballot',
        writesFacts: flags.writesFacts,
        writesRatings: flags.writesRatings,
      },
    }
  }
  const list = await loadList(db, ref.id)
  if (!list) return null
  if (ref.campaignId != null && list.campaign_id !== ref.campaignId) return null
  const kind: SmsActionKind = (list.mode ?? 'blast') === 'p2p' ? 'chat' : 'blast'
  if (kind !== ref.kind) return null
  return {
    row: list,
    subject: {
      kind,
      status: list.status,
      archivedAt: list.archived_at,
      sentItems: list.sent_items ?? 0,
    },
  }
}

async function pairFor(
  db: Db,
  ref: SmsActionRefInput,
  row: Record<string, unknown>,
): Promise<SmsPairMember[]> {
  if (ref.kind === 'relay') {
    const lists = await launchListsForRelay(db, ref.id)
    return lists.map((l) => ({
      kind: 'blast' as const,
      id: l.list_id,
      campaignId: l.campaign_id,
      name: l.name,
    }))
  }
  if (ref.kind === 'blast' && row.relay_id != null) {
    const relay = await loadRelay(db, row.relay_id as number)
    if (!relay) return []
    const lists = await launchListsForRelay(db, relay.relay_id)
    const members: SmsPairMember[] = [
      {
        kind: 'relay',
        id: relay.relay_id,
        campaignId: relay.campaign_id,
        name: relay.name,
      },
    ]
    for (const l of lists) {
      if (l.list_id === ref.id) continue
      members.push({
        kind: 'blast',
        id: l.list_id,
        campaignId: l.campaign_id,
        name: l.name,
      })
    }
    return members
  }
  return []
}

function exportHref(ref: SmsActionRefInput, campaignId: number | null): string | null {
  if (campaignId == null) return null
  if (ref.kind === 'blast' || ref.kind === 'chat') {
    return `/api/campaigns/${campaignId}/sms-lists/${ref.id}/export`
  }
  if (ref.kind === 'survey') {
    return `/api/campaigns/${campaignId}/sms-surveys/${ref.id}/export`
  }
  return null
}

export async function inspectSmsAction(
  db: Db,
  actor: SmsActionActor,
  ref: SmsActionRefInput,
): Promise<SmsActionInspect | null> {
  const loaded = await loadSubject(db, ref)
  if (!loaded) return null
  const { subject, row } = loaded
  const campaignId =
    ref.kind === 'relay'
      ? ((row.campaign_id as number | null) ?? null)
      : (row.campaign_id as number)
  const name =
    ref.kind === 'survey' ? (row.title as string) : (row.name as string)
  const gate = deleteGate(subject, roleOf(actor))
  const blocker = archiveBlocker(subject)
  const pair = await pairFor(db, ref, row)
  const isEpisode = await campaignIsEpisode(db, campaignId)
  const factsWarning =
    subject.writesFacts && !isSmsActionUnusedDraft(subject)
      ? 'Worker facts collected by this survey stay on each member. After delete you will not be able to open the original SMS answer from those facts.'
      : null
  return {
    kind: subject.kind,
    id: ref.id,
    campaignId,
    name,
    status: subject.status,
    archivedAt: subject.archivedAt,
    isTest: !!subject.isTest,
    isBallot: !!subject.isBallot,
    isOrgWide: !!subject.isOrgWide,
    isEpisode,
    writesFacts: !!subject.writesFacts,
    writesRatings: !!subject.writesRatings,
    canArchive: canArchive(roleOf(actor), subject),
    canUnarchive: canUnarchive(roleOf(actor), subject),
    canDelete: gate.allowed,
    needsTypedConfirm: gate.allowed ? gate.needsTypedConfirm : false,
    blocker: canArchive(roleOf(actor), subject) ? null : blocker,
    pair,
    exportHref: exportHref(ref, campaignId),
    factsWarning,
  }
}

async function setListArchived(db: Db, listId: number, archivedAt: string | null) {
  const { error } = await db.from('sms_lists').update({ archived_at: archivedAt }).eq('list_id', listId)
  if (error) throw error
}

async function setSurveyArchived(db: Db, surveyId: number, archivedAt: string | null) {
  const { error } = await db
    .from('sms_surveys')
    .update({ archived_at: archivedAt })
    .eq('survey_id', surveyId)
  if (error) throw error
}

async function setRelayArchived(admin: Db, relayId: number, archivedAt: string | null) {
  const { error } = await admin
    .from('sms_relays')
    .update({ archived_at: archivedAt })
    .eq('relay_id', relayId)
  if (error) throw error
}

async function setEpisodeArchived(db: Db, campaignId: number, archivedAt: string | null) {
  const { error } = await db
    .from('campaigns')
    .update({ archived_at: archivedAt })
    .eq('campaign_id', campaignId)
    .eq('is_sms_episode', true)
  if (error) throw error
}

async function archiveEpisodeLockstep(db: Db, campaignId: number, archivedAt: string | null) {
  const isEpisode = await campaignIsEpisode(db, campaignId)
  if (!isEpisode) return
  const { data: lists, error: lErr } = await db
    .from('sms_lists')
    .select('list_id')
    .eq('campaign_id', campaignId)
  if (lErr) throw lErr
  for (const l of lists ?? []) {
    await setListArchived(db, l.list_id, archivedAt)
  }
  const { data: surveys, error: sErr } = await db
    .from('sms_surveys')
    .select('survey_id')
    .eq('campaign_id', campaignId)
  if (sErr) throw sErr
  for (const s of surveys ?? []) {
    await setSurveyArchived(db, s.survey_id, archivedAt)
  }
  await setEpisodeArchived(db, campaignId, archivedAt)
}

async function assertLaunchTextsInert(
  db: Db,
  relayId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lists = await launchListsForRelay(db, relayId)
  for (const l of lists) {
    const kind: SmsActionKind = (l.mode ?? 'blast') === 'p2p' ? 'chat' : 'blast'
    const sub: SmsArchiveSubject = {
      kind,
      status: l.status,
      archivedAt: l.archived_at,
      sentItems: l.sent_items ?? 0,
    }
    const block = archiveBlocker(sub)
    if (block && !isSmsActionUnusedDraft(sub) && !l.archived_at) {
      return {
        ok: false,
        error: `Launch text "${l.name}" is still live — ${block.message}`,
      }
    }
  }
  return { ok: true }
}

export type SmsActionResult =
  | { ok: true; paired: number }
  | {
      ok: false
      status: number
      error: string
      lifecycle?: SmsLifecycleAction
      needsTypedConfirm?: boolean
      code?: string
    }

export async function archiveSmsAction(
  db: Db,
  admin: Db,
  actor: SmsActionActor,
  ref: SmsActionRefInput,
): Promise<SmsActionResult> {
  const loaded = await loadSubject(db, ref)
  if (!loaded) return { ok: false, status: 404, error: 'SMS action not found' }
  const { subject, row } = loaded
  if (!canArchive(roleOf(actor), subject)) {
    const block = archiveBlocker(subject)
    if (block) {
      return { ok: false, status: 409, error: block.message, lifecycle: block.lifecycle }
    }
    return { ok: false, status: 409, error: 'This action cannot be archived' }
  }
  const now = new Date().toISOString()
  let paired = 0

  if (ref.kind === 'relay') {
    const listsOk = await assertLaunchTextsInert(db, ref.id)
    if (!listsOk.ok) return { ok: false, status: 409, error: listsOk.error }
    await setRelayArchived(admin, ref.id, now)
    const lists = await launchListsForRelay(db, ref.id)
    for (const l of lists) {
      if (!l.archived_at) {
        await setListArchived(db, l.list_id, now)
        paired += 1
      }
    }
  } else if (ref.kind === 'blast' && row.relay_id != null) {
    const relay = await loadRelay(db, row.relay_id as number)
    if (!relay) return { ok: false, status: 404, error: 'Linked relay not found' }
    if (relay.status !== 'ended') {
      return {
        ok: false,
        status: 409,
        error:
          'End this relay and release its number before archiving. Launch texts and the relay are archived together.',
        lifecycle: 'end_relay',
        code: 'NEEDS_END_RELAY',
      }
    }
    const listsOk = await assertLaunchTextsInert(db, relay.relay_id)
    if (!listsOk.ok) return { ok: false, status: 409, error: listsOk.error }
    await setRelayArchived(admin, relay.relay_id, now)
    paired += 1
    const lists = await launchListsForRelay(db, relay.relay_id)
    for (const l of lists) {
      if (!l.archived_at) {
        await setListArchived(db, l.list_id, now)
        if (l.list_id !== ref.id) paired += 1
      }
    }
  } else if (ref.kind === 'survey') {
    await setSurveyArchived(db, ref.id, now)
  } else {
    await setListArchived(db, ref.id, now)
  }

  const campaignId = (row.campaign_id as number | null) ?? null
  if (campaignId != null) await archiveEpisodeLockstep(db, campaignId, now)

  return { ok: true, paired }
}

export async function unarchiveSmsAction(
  db: Db,
  admin: Db,
  actor: SmsActionActor,
  ref: SmsActionRefInput,
): Promise<SmsActionResult> {
  const loaded = await loadSubject(db, ref)
  if (!loaded) return { ok: false, status: 404, error: 'SMS action not found' }
  const { subject, row } = loaded
  if (!canUnarchive(roleOf(actor), subject)) {
    return { ok: false, status: 409, error: 'This action is not archived' }
  }
  let paired = 0

  if (ref.kind === 'relay') {
    await setRelayArchived(admin, ref.id, null)
    const lists = await launchListsForRelay(db, ref.id)
    for (const l of lists) {
      if (l.archived_at) {
        await setListArchived(db, l.list_id, null)
        paired += 1
      }
    }
  } else if (ref.kind === 'blast' && row.relay_id != null) {
    const relay = await loadRelay(db, row.relay_id as number)
    if (relay) {
      await setRelayArchived(admin, relay.relay_id, null)
      paired += 1
      const lists = await launchListsForRelay(db, relay.relay_id)
      for (const l of lists) {
        if (l.archived_at) {
          await setListArchived(db, l.list_id, null)
          if (l.list_id !== ref.id) paired += 1
        }
      }
    } else {
      await setListArchived(db, ref.id, null)
    }
  } else if (ref.kind === 'survey') {
    await setSurveyArchived(db, ref.id, null)
  } else {
    await setListArchived(db, ref.id, null)
  }

  const campaignId = (row.campaign_id as number | null) ?? null
  if (campaignId != null) await archiveEpisodeLockstep(db, campaignId, null)

  return { ok: true, paired }
}

async function markWorkerListsGone(admin: Db, ref: SmsActionRefInput) {
  const now = new Date().toISOString()
  if (ref.kind === 'blast' || ref.kind === 'chat') {
    const { error } = await admin
      .from('campaign_worker_lists')
      .update({ source_sms_gone_at: now })
      .or(`source_sms_list_id.eq.${ref.id},fired_sms_list_id.eq.${ref.id}`)
    if (error) throw error
  }
  if (ref.kind === 'survey') {
    const { error } = await admin
      .from('campaign_worker_lists')
      .update({ source_sms_gone_at: now })
      .eq('source_sms_survey_id', ref.id)
    if (error) throw error
  }
}

export async function deleteSmsAction(
  db: Db,
  admin: Db,
  actor: SmsActionActor,
  ref: SmsActionRefInput,
  confirm?: string,
): Promise<SmsActionResult> {
  const loaded = await loadSubject(db, ref)
  if (!loaded) return { ok: false, status: 404, error: 'SMS action not found' }
  const { subject, row } = loaded
  const gate = deleteGate(subject, roleOf(actor))
  if (!gate.allowed) {
    return {
      ok: false,
      status: gate.status,
      error: gate.error,
      lifecycle: gate.lifecycle,
    }
  }
  if (gate.needsTypedConfirm && confirm !== 'DELETE') {
    return {
      ok: false,
      status: 400,
      error: subject.isBallot
        ? 'Deleting a closed ballot requires confirm=DELETE (destroys the eligibility roll and audit events). Ratings and facts stay.'
        : 'Admin delete of finished SMS work requires confirm=DELETE',
      needsTypedConfirm: true,
    }
  }

  await markWorkerListsGone(admin, ref)

  let paired = 0
  const writer = gate.usesAdminClient ? admin : db

  if (ref.kind === 'relay') {
    const lists = await launchListsForRelay(db, ref.id)
    for (const l of lists) {
      const launchSub: SmsArchiveSubject = {
        kind: 'blast',
        status: l.status,
        archivedAt: l.archived_at,
        sentItems: l.sent_items ?? 0,
      }
      if (isSmsActionUnusedDraft(launchSub)) {
        await markWorkerListsGone(admin, { kind: 'blast', id: l.list_id })
        const { error } = await admin.from('sms_lists').delete().eq('list_id', l.list_id)
        if (error) throw error
        paired += 1
      }
    }
    const { error } = await admin.from('sms_relays').delete().eq('relay_id', ref.id)
    if (error) throw error
  } else if (ref.kind === 'survey') {
    const { error } = await writer.from('sms_surveys').delete().eq('survey_id', ref.id)
    if (error) throw error
  } else {
    const { error } = await writer.from('sms_lists').delete().eq('list_id', ref.id)
    if (error) throw error
  }

  return { ok: true, paired }
}

export function applyArchivedFilter<T extends { is: Function; not: Function }>(
  query: T,
  filter: 'exclude' | 'include' | 'only',
  column = 'archived_at',
): T {
  if (filter === 'exclude') return query.is(column, null) as T
  if (filter === 'only') return query.not(column, 'is', null) as T
  return query
}
