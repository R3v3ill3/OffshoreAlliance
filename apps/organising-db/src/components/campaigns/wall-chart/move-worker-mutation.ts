"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { structureApi, type PlacementsMoveResult } from "@/lib/campaign/structure-api";
import {
  stampEmployerWorksiteFromOu,
  syncWorkersToMatchingCampaigns,
} from "@/lib/workers/sync-campaign-universe";

export type MoveWorkerVars = {
  /**
   * Each ref identifies *one specific assignment* to move/copy:
   * the worker at a given source ou (or Unassigned when `fromOuId` is null).
   * For copy mode, `fromOuId` is ignored.
   */
  refs: { workerId: number; fromOuId: number | null }[];
  /** Target OU; null = Unassigned (remove from all units in this campaign). */
  toOuId: number | null;
  mode: "move" | "copy";
  /**
   * When true (default), moving or copying a worker INTO a sub-unit also
   * keeps (or creates) the worker's placement on the sub-unit's parent OU —
   * but only when the parent can hold placements AND is in a different group
   * from the target (an Employer container above a worksite; wp2.2.md D4).
   * A parent in the target's own group can never hold the worker alongside
   * the child (C-a), so nothing is written for it; a parent without a group
   * is skipped. When the source IS that parent, the parent row is kept
   * (copy semantics for the parent only, D19).
   *
   * When false, the move re-points the source placement only, with no
   * special handling for parent/child relationships.
   *
   * Has no effect when toOuId is null or the target is a top-level OU.
   */
  keepInParent?: boolean;
};

export type MoveWorkerResult = {
  inserted: number;
  deleted: number;
  skipped: number;
};

/**
 * Bulk move or copy worker↔OU assignments through the WP2.2 structure API
 * (`structure_placements_move`, wp2.2.md §3.3 / §3.11 row 1).
 *
 * Contract (unchanged from the legacy client-side sequence):
 * - move + toOuId != null  : the (fromOuId, workerId) placement is re-pointed
 *                            to toOuId (inserted when the worker came from
 *                            Unassigned). Primary flag travels with the row.
 *                            Any other placement the worker held in the
 *                            target's group is displaced (C-b).
 * - copy + toOuId != null  : a new (toOuId, workerId) placement, is_primary
 *                            false; workers already at the target are skipped;
 *                            a same-group copy is refused with
 *                            `duplicate_in_group` (K1, C-c).
 * - move + toOuId == null  : every placement of the workers in this campaign
 *                            is removed (the worker becomes "Unassigned").
 * - copy + toOuId == null  : no-op.
 *
 * The RPC takes one `p_from_ou_id`, so a move whose refs come from several
 * source units issues one call per source unit (each call is its own
 * transaction); a copy and an unassign are always one call. Re-issuing a
 * completed move is a harmless no-op (`skipped`, wp2.2.md §1.5).
 */
export function useMoveWorkersMutation(campaignId: string | number) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useAuthAwareMutation({
    mutationFn: async (vars: MoveWorkerVars): Promise<MoveWorkerResult> => {
      if (vars.refs.length === 0) return { inserted: 0, deleted: 0, skipped: 0 };

      const api = structureApi(supabase);
      const campaignIdNum = Number(campaignId);
      const workerIds = [...new Set(vars.refs.map((r) => r.workerId))];
      let inserted = 0;
      let deleted = 0;
      let skipped = 0;

      const tally = (result: PlacementsMoveResult) => {
        // A re-pointed source row or a fresh target row both land the worker
        // at the target, which is what the legacy `inserted` counted; parent
        // rows were counted there too. `deleted` was the source rows removed;
        // rows displaced from the target's group are removals as well.
        inserted += result.moved + result.inserted + result.parent_inserted;
        deleted += result.removed + result.displaced;
        skipped += result.skipped;
      };

      if (vars.toOuId == null) {
        // "Move to Unassigned" = strip all OU assignments for these workers in this campaign.
        if (vars.mode !== "move") return { inserted: 0, deleted: 0, skipped: workerIds.length };
        tally(await api.placements.move({ campaignId: campaignIdNum, workerIds, toOuId: null }));
      } else if (vars.mode === "copy") {
        // Copy ignores the source: one call, `p_from_ou_id` null, keep_source.
        tally(
          await api.placements.move({
            campaignId: campaignIdNum,
            workerIds,
            fromOuId: null,
            toOuId: vars.toOuId,
            keepSource: true,
            keepInParent: vars.keepInParent,
          })
        );
      } else {
        // Move: one call per source unit (Unassigned counts as one source).
        // A ref whose source is the target is already there — skipped, never sent.
        const bySource = new Map<number | null, number[]>();
        const sent = new Set<number>();
        for (const ref of vars.refs) {
          if (ref.fromOuId === vars.toOuId) continue;
          const list = bySource.get(ref.fromOuId) ?? [];
          if (!list.includes(ref.workerId)) list.push(ref.workerId);
          bySource.set(ref.fromOuId, list);
          sent.add(ref.workerId);
        }
        skipped += workerIds.filter((w) => !sent.has(w)).length;
        for (const [fromOuId, ids] of bySource) {
          tally(
            await api.placements.move({
              campaignId: campaignIdNum,
              workerIds: ids,
              fromOuId,
              toOuId: vars.toOuId,
              keepInParent: vars.keepInParent,
            })
          );
        }
      }

      if (vars.toOuId != null) {
        const { data: targetOu } = await supabase
          .from("campaign_organising_units")
          .select("unit_basis")
          .eq("ou_id", vars.toOuId)
          .maybeSingle();
        if (targetOu?.unit_basis) {
          await stampEmployerWorksiteFromOu(supabase, workerIds, targetOu.unit_basis);
        }
        await syncWorkersToMatchingCampaigns(supabase, workerIds);
      }

      return { inserted, deleted, skipped };
    },
    // Invalidate on settle, not only on success: each RPC is one transaction,
    // but a multi-source move is several, and a failure part-way must still
    // refetch so the board shows what the database holds.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["campaign-worker-ou", String(campaignId)] });
      qc.invalidateQueries({ queryKey: ["campaign-members-full", String(campaignId)] });
      qc.invalidateQueries({ queryKey: ["workers"] });
    },
  });
}
