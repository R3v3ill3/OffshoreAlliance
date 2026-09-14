import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { structureApi } from "@/lib/campaign/structure-api";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

export type AllocateWorkersArgs = {
  ouId: number;
  workerIds: number[];
  isPrimary?: boolean;
};

export type AllocateWorkersResult = {
  /** Placements written (a worker already on the unit is neither written nor counted). */
  inserted: number;
  /**
   * Workers left where they were because they already hold a unit in the
   * target's group (WP2.2 rule C-a, `p_on_conflict: "skip"`), or were
   * already on the unit.
   */
  skipped: number;
};

/**
 * Allocates one or more workers to an organising unit through the structure
 * API (WP2.2 §3.11 row 13: `structure_placements_assign`). Mirrors the
 * `assignOu` mutation in `campaign-units-section.tsx` but exposed as a
 * reusable hook so the bulk toolbar (and any other caller) can perform the
 * same allocation without depending on the units section's component tree.
 *
 * Conflict handling (`p_on_conflict: "skip"`, wp2.2.md D46): a worker who is
 * already on the unit, or who already holds a unit in the target's group, is
 * skipped and reported in `skipped`; the rest are inserted. The legacy
 * insert had no `onConflict`, so a worker already on the unit failed the
 * whole batch and a second unit in the same group was written silently.
 *
 * On success, invalidates `campaign-worker-ou` (for the wall chart + list
 * view) and `campaign-ou-coverage` (for unit stats).
 */
export function useAllocateWorkersToOu(campaignId: string | number) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation<AllocateWorkersResult, Error, AllocateWorkersArgs>({
    mutationFn: async ({ ouId, workerIds, isPrimary }) => {
      if (workerIds.length === 0) return { inserted: 0, skipped: 0 };
      const result = await structureApi(supabase).placements.assign({
        campaignId: Number(campaignId),
        ouId,
        workerIds,
        source: "manual",
        // Primary flag only applies when allocating a single worker. With
        // multi-select we keep all entries as secondary so we don't accidentally
        // overwrite each worker's existing primary unit.
        isPrimary: !!isPrimary && workerIds.length === 1,
        onConflict: "skip",
      });
      return { inserted: result.inserted, skipped: result.skipped };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    },
  });
}
