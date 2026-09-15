'use client'

import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { assertRowsAffected } from '@/lib/supabase/assert-rows-affected'
import { structureApi } from '@/lib/campaign/structure-api'
import { structureErrorMessage } from '@/lib/campaign/structure-error-message'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import { toast } from 'sonner'

export type RemovalReasonCode = 'removed_from_campaign' | 'no_longer_in_universe'

export interface UseRemoveWorkerFromCampaignArgs {
  campaignId: string | number
  /**
   * Default worker for the hook instance. Single-worker call sites (e.g. the
   * worker-detail panel) pass these here; multi-worker call sites (the
   * dialler) leave them undefined and supply per-mutate overrides instead.
   */
  workerId?: number
  workerName?: string
  onRemoved?: () => void
}

export interface RemovalOptions {
  reasonCode: RemovalReasonCode
  /** Override the hook-level workerId (required when the hook was constructed without one). */
  workerId?: number
  workerName?: string
  clearEmployer?: boolean
  clearWorksite?: boolean
  /** When provided, the audit row links back to the originating phone-call session. */
  actionId?: number | null
  /** Optional free-text note recorded in worker_activity_log.description. */
  note?: string | null
}

/**
 * Shared mutation for removing a worker from a campaign universe.
 *
 * Mirrors the behaviour of the "No longer in campaign universe" panel in
 * worker-detail-sheet.tsx: removes campaign OU assignments + membership,
 * optionally clears employer/worksite, and (new) writes an audit row to
 * worker_activity_log keyed to the campaign and (optionally) the phone-call
 * action_id so session reports can attribute the removal.
 */
export function useRemoveWorkerFromCampaign({
  campaignId,
  workerId: defaultWorkerId,
  workerName: defaultWorkerName,
  onRemoved,
}: UseRemoveWorkerFromCampaignArgs) {
  const supabase = createClient()
  const qc = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (opts: RemovalOptions) => {
      const cidNum = Number(campaignId)
      const workerId = opts.workerId ?? defaultWorkerId
      if (workerId == null) {
        throw new Error('useRemoveWorkerFromCampaign: workerId is required')
      }

      // 1. Resolve connection_id (needed for worker_activity_log) before
      //    we delete the membership row so we can audit-link the removal.
      const { data: connectionRow } = await supabase
        .from('worker_campaign_connections')
        .select('connection_id')
        .eq('campaign_id', cidNum)
        .eq('worker_id', workerId)
        .maybeSingle()

      // 2. Remove all OU assignments for this worker in this campaign —
      //    WP2.2 §3.11 row 12: one `structure_placements_unassign` with no
      //    unit and no group, i.e. every placement of the worker on the
      //    campaign's units (the RPC scopes the delete to the campaign; the
      //    legacy ou_id read is no longer needed). A worker may legitimately
      //    be in no unit, so `removed: 0` is fine; a refusal (42501) throws
      //    instead of an RLS-silent zero. The membership delete below stays
      //    the loud check for the row that must exist.
      const { removed: unitRowsRemoved } = await structureApi(supabase).placements.unassign({
        campaignId: cidNum,
        workerIds: [workerId],
      })

      // 3. Remove campaign membership. The row exists for every member, so
      //    zero rows normally means RLS filtered the delete (WP1.6) — fail
      //    loudly. Exception: when unit rows WERE just deleted, RLS cannot be
      //    the cause (wp16_cwo_delete and wp16_cwm_delete carry the same role
      //    floor and campaign scope), so a missing membership row is a
      //    pre-existing inconsistency (unit rows without membership). The
      //    unit rows are gone, which is what was asked for: treat it as
      //    success and warn rather than tell the user they lack permission.
      const memRes = await supabase
        .from('campaign_worker_membership')
        .delete({ count: 'exact' })
        .eq('campaign_id', cidNum)
        .eq('worker_id', workerId)
      if (unitRowsRemoved > 0 && !memRes.error && memRes.count === 0) {
        console.warn(
          `useRemoveWorkerFromCampaign: worker ${workerId} had ${unitRowsRemoved} unit row(s) on campaign ${cidNum} but no campaign_worker_membership row; unit rows removed, nothing else to delete.`
        )
      } else {
        assertRowsAffected(memRes, 1, 'Removing the worker from the campaign')
      }

      // 4. Optionally clear employer / worksite on the worker record.
      const workerUpdates: Record<string, unknown> = {}
      if (opts.clearEmployer) workerUpdates.employer_id = null
      if (opts.clearWorksite) workerUpdates.worksite_id = null
      if (Object.keys(workerUpdates).length > 0) {
        const { error: wErr } = await supabase
          .from('workers')
          .update(workerUpdates)
          .eq('worker_id', workerId)
        if (wErr) throw wErr
      }

      // 5. Scrub from any active campaign call lists.
      const { data: campaignLists } = await supabase
        .from('call_lists')
        .select('list_id')
        .eq('campaign_id', cidNum)
      if (campaignLists && campaignLists.length > 0) {
        const listIds = campaignLists.map((l) => l.list_id)
        await supabase
          .from('call_list_items')
          .delete()
          .eq('worker_id', workerId)
          .in('list_id', listIds)
      }

      // 6. Audit row (requires an extant connection_id; we record one even
      //    after the connection is gone so attempts to re-add this worker
      //    later can be related back to the removal). We intentionally write
      //    the audit row *before* deleting the connection so the FK holds.
      //    The existing flow above does not delete the connection — it just
      //    removes membership + OU links — so we can simply insert here.
      if (connectionRow?.connection_id) {
        await supabase.from('worker_activity_log').insert({
          connection_id: connectionRow.connection_id,
          activity_type: 'campaign_removal',
          description: opts.note || `Removed from campaign (${opts.reasonCode})`,
          outcome: opts.reasonCode,
          contact_method: 'phone',
          action_id: opts.actionId ?? null,
          metadata: {
            reason_code: opts.reasonCode,
            clear_employer: !!opts.clearEmployer,
            clear_worksite: !!opts.clearWorksite,
          },
        })
      }
    },
    // Invalidate on settle, not only on success: the steps above are several
    // writes without one transaction (the unassign is its own), so a
    // NoRowsAffectedError part-way (unit rows gone, membership refused) must
    // refetch to show the real state rather than keep the pre-removal picture.
    onSettled: () => {
      const cidStr = String(campaignId)
      const cidNum = Number(campaignId)
      qc.invalidateQueries({ queryKey: ['campaign-members-full', cidStr] })
      qc.invalidateQueries({ queryKey: ['campaign-members', cidStr] })
      qc.invalidateQueries({ queryKey: ['campaign-worker-ou', cidStr] })
      qc.invalidateQueries({ queryKey: ['campaign-list-builder-workers', cidNum] })
      qc.invalidateQueries({ queryKey: ['campaign-ou-coverage', cidStr] })
      qc.invalidateQueries({ queryKey: ['campaign-rating-summary', cidStr] })
      qc.invalidateQueries({ queryKey: ['workers'] })
      qc.invalidateQueries({ queryKey: ['call-list-items'] })
    },
    onSuccess: (_data, variables) => {
      const name =
        variables.workerName ??
        defaultWorkerName ??
        `Worker #${variables.workerId ?? defaultWorkerId ?? '?'}`
      toast.success(`${name} removed from campaign.`)
      onRemoved?.()
    },
    onError: (err: Error) => {
      // A StructureApiError kind becomes its organiser sentence (D28/D40); a
      // plain Error keeps its own message exactly as before.
      toast.error(structureErrorMessage(err, 'Failed to remove worker from campaign'))
    },
  })
}
