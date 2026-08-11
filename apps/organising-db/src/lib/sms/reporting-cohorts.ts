/**
 * "Create list from responders" cohort maths (Phase 7, brief §3.1
 * item 11 — the CallHub-style one-click follow-up loop).
 *
 * Pure module — unit tested in __tests__/reporting-cohorts.test.ts.
 * The routes load the rows and hand them here; the resulting worker
 * ids become a draft campaign_worker_list usable by every channel.
 */

export type BlastCohort = 'replied' | 'delivered_not_replied' | 'failed'

export type SurveyCohort = 'completed' | 'started_not_completed' | 'non_responders'

export const BLAST_COHORT_LABELS: Record<BlastCohort, string> = {
  replied: 'replied',
  delivered_not_replied: 'delivered, no reply',
  failed: 'failed',
}

export const SURVEY_COHORT_LABELS: Record<SurveyCohort, string> = {
  completed: 'completed',
  started_not_completed: 'started, not completed',
  non_responders: 'non-responders',
}

export interface BlastCohortItem {
  worker_id: number
  status: string
  sent_at: string | null
}

/**
 * "Replied" = the worker has inbound SMS traffic (any of their
 * conversations' last_inbound_at) at/after the item's send time —
 * blasts don't carry per-message thread links, so the conversation
 * inbound stamp is the response signal (same linkage the Phase 2
 * webhook uses for the blast→thread mirror).
 */
export function computeBlastCohortWorkerIds(
  items: BlastCohortItem[],
  lastInboundByWorker: Map<number, string>,
  cohort: BlastCohort,
): number[] {
  const out = new Set<number>()
  for (const item of items) {
    switch (cohort) {
      case 'failed':
        if (item.status === 'failed') out.add(item.worker_id)
        break
      case 'replied':
      case 'delivered_not_replied': {
        const inboundAt = lastInboundByWorker.get(item.worker_id)
        const replied =
          item.sent_at != null &&
          inboundAt != null &&
          Date.parse(inboundAt) >= Date.parse(item.sent_at)
        if (cohort === 'replied') {
          if (replied) out.add(item.worker_id)
        } else if (item.status === 'delivered' && !replied) {
          out.add(item.worker_id)
        }
        break
      }
    }
  }
  return [...out]
}

export interface SurveyCohortSession {
  worker_id: number
  state: string
  first_answer_at: string | null
}

/**
 * Survey cohorts over the frozen sessions. 'non_responders' excludes
 * opted_out sessions — a STOP is a response, and re-targeting an
 * opted-out member is exactly what the suppression layer exists to
 * prevent (the list itself is channel-agnostic, so this is belt braces).
 */
export function computeSurveyCohortWorkerIds(
  sessions: SurveyCohortSession[],
  cohort: SurveyCohort,
): number[] {
  const out = new Set<number>()
  for (const s of sessions) {
    switch (cohort) {
      case 'completed':
        if (s.state === 'completed') out.add(s.worker_id)
        break
      case 'started_not_completed':
        if (s.first_answer_at != null && s.state !== 'completed') {
          out.add(s.worker_id)
        }
        break
      case 'non_responders':
        if (s.first_answer_at == null && s.state !== 'opted_out') {
          out.add(s.worker_id)
        }
        break
    }
  }
  return [...out]
}
