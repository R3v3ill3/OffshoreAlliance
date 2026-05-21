'use client'

import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
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

      // 2. Remove all OU assignments for this worker in this campaign.
      const { data: ouRows } = await supabase
        .from('campaign_organising_units')
        .select('ou_id')
        .eq('campaign_id', cidNum)
      const ouIds = (ouRows ?? []).map((r) => r.ou_id)
      if (ouIds.length > 0) {
        const { error: ouErr } = await supabase
          .from('campaign_worker_ou')
          .delete()
          .eq('worker_id', workerId)
          .in('ou_id', ouIds)
        if (ouErr) throw ouErr
      }

      // 3. Remove campaign membership.
      const { error: memErr } = await supabase
        .from('campaign_worker_membership')
        .delete()
        .eq('campaign_id', cidNum)
        .eq('worker_id', workerId)
      if (memErr) throw memErr

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
    onSuccess: (_data, variables) => {
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
      const name =
        variables.workerName ??
        defaultWorkerName ??
        `Worker #${variables.workerId ?? defaultWorkerId ?? '?'}`
      toast.success(`${name} removed from campaign.`)
      onRemoved?.()
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove worker from campaign')
    },
  })
}
