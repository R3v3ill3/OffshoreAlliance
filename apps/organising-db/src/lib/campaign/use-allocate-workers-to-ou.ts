import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

export type AllocateWorkersArgs = {
  ouId: number;
  workerIds: number[];
  isPrimary?: boolean;
};

/**
 * Inserts rows into `campaign_worker_ou` to allocate one or more workers to
 * an organising unit. Mirrors the existing `assignOu` mutation in
 * `campaign-units-section.tsx` but exposed as a reusable hook so the bulk
 * toolbar (and any other caller) can perform the same allocation without
 * depending on the units section's component tree.
 *
 * On success, invalidates `campaign-worker-ou` (for the wall chart + list
 * view) and `campaign-ou-coverage` (for unit stats).
 */
export function useAllocateWorkersToOu(campaignId: string | number) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation<{ inserted: number }, Error, AllocateWorkersArgs>({
    mutationFn: async ({ ouId, workerIds, isPrimary }) => {
      if (workerIds.length === 0) return { inserted: 0 };
      const rows = workerIds.map((workerId) => ({
        ou_id: ouId,
        worker_id: workerId,
        // Primary flag only applies when allocating a single worker. With
        // multi-select we keep all entries as secondary so we don't accidentally
        // overwrite each worker's existing primary unit.
        is_primary: !!isPrimary && workerIds.length === 1,
        assignment_source: "manual",
      }));
      const { error } = await (supabase as unknown as {
        from: (table: string) => {
          insert: (
            row: Record<string, unknown>[]
          ) => Promise<{ error: Error | null }>;
        };
      })
        .from("campaign_worker_ou")
        .insert(rows);
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    },
  });
}
