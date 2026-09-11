import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import type { WorkerDragRef } from "../dnd";
import type { DeleteUnitWorker } from "../delete-organising-unit-dialog";
import type { SplitMember } from "../split-unit-dialog";
import type { WallChartShellEnv, WallChartShellState } from "./use-wall-chart-shell-state";
import type { WallChartStructure } from "./use-wall-chart-structure";

/**
 * WP2.3 block F — the wall chart's writers, moved verbatim out of
 * `campaign-wall-chart.tsx` (`WC:1252–1426`). The delete-dialog worker list,
 * the lazy split-members query, drag-and-drop move/copy and bulk
 * remove-from-unit.
 *
 * Behaviour preserved exactly: the cross-`ou_type` move is still blocked
 * silently with no toast, `moveWorkers.mutate` is still called with
 * `(variables, { onSuccess, onError })`, and `toast.error` still fires only
 * from the mutation's `onError`.
 */
export function useWallChartActions({
  campaignId,
  canWrite,
  env,
  selection,
  dialogs,
  moveWorkers,
  ouAssign,
  index,
}: {
  campaignId: string;
  canWrite: boolean;
  env: WallChartShellEnv;
  selection: WallChartShellState["selection"];
  dialogs: WallChartShellState["dialogs"];
  moveWorkers: WallChartShellState["moveWorkers"];
  ouAssign: WallChartStructure["ouAssignments"];
  index: WallChartStructure["index"];
}) {
  const { supabase, queryClient } = env;
  const { deleteTargetOu, splitTargetOu, setRemoveConfirmOpen } = dialogs;
  const { workerById, ouTypeById, workersByOu } = index;

  // ── Split: members for the targeted OU ─────────────────────────────────
  // Lazy-loaded only when a split dialog is open; pulls dimension columns +
  // tag names so the dialog can group on them.
  const deleteUnitWorkers = useMemo((): DeleteUnitWorker[] => {
    if (!deleteTargetOu) return [];
    const workerIds = workersByOu.get(deleteTargetOu.ou_id) ?? [];
    const primaryByWorker = new Map<number, boolean>();
    for (const a of ouAssign) {
      if (a.ou_id === deleteTargetOu.ou_id && a.is_primary) {
        primaryByWorker.set(a.worker_id, true);
      }
    }
    return workerIds.map((wid) => {
      const w = workerById.get(wid);
      const label = w
        ? `${w.last_name}, ${w.first_name}`.trim()
        : `Worker #${wid}`;
      return {
        worker_id: wid,
        label,
        is_primary: primaryByWorker.get(wid),
      };
    });
  }, [deleteTargetOu, workersByOu, ouAssign, workerById]);

  const splitMemberWorkerIds = useMemo(() => {
    if (!splitTargetOu) return [] as number[];
    return workersByOu.get(splitTargetOu.ou_id) ?? [];
  }, [splitTargetOu, workersByOu]);

  const { data: splitMembers = [] } = useQuery({
    queryKey: [
      "split-unit-members",
      splitTargetOu?.ou_id ?? "none",
      splitMemberWorkerIds.join(","),
    ],
    enabled: !!splitTargetOu && splitMemberWorkerIds.length > 0,
    queryFn: async (): Promise<SplitMember[]> => {
      if (splitMemberWorkerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name,
           shift_id, work_area_id, roster_panel_id,
           canonical_occupation_id,
           canonical_occupation:occupations!workers_canonical_occupation_id_fkey(canonical_name)`
        )
        .in("worker_id", splitMemberWorkerIds);
      if (error) throw error;
      const { data: tagRows, error: tagErr } = await supabase
        .from("worker_tags")
        .select("worker_id, tag:tags(tag_name)")
        .in("worker_id", splitMemberWorkerIds);
      if (tagErr) throw tagErr;
      const tagsByWorker = new Map<number, string[]>();
      for (const row of (tagRows ?? []) as Array<{
        worker_id: number;
        tag: { tag_name?: string } | { tag_name?: string }[] | null;
      }>) {
        const t = Array.isArray(row.tag) ? row.tag[0] : row.tag;
        const name = t?.tag_name?.trim().toLowerCase();
        if (!name) continue;
        const list = tagsByWorker.get(row.worker_id) ?? [];
        list.push(name);
        tagsByWorker.set(row.worker_id, list);
      }
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const occRel = r.canonical_occupation;
        const occ = (Array.isArray(occRel) ? occRel[0] : occRel) as
          | { canonical_name: string }
          | null;
        return {
          worker_id: r.worker_id as number,
          first_name: r.first_name as string,
          last_name: r.last_name as string,
          canonical_occupation_id: (r.canonical_occupation_id as number | null) ?? null,
          canonical_occupation_name: occ?.canonical_name ?? null,
          shift_id: (r.shift_id as number | null) ?? null,
          work_area_id: (r.work_area_id as number | null) ?? null,
          roster_panel_id: (r.roster_panel_id as number | null) ?? null,
          tag_names: tagsByWorker.get(r.worker_id as number) ?? [],
        };
      });
    },
  });

  const handleWorkerDrop = useCallback(
    ({
      targetOuId,
      payload,
      mode,
    }: {
      targetOuId: number | null;
      payload: { refs: WorkerDragRef[] };
      mode: "move" | "copy";
    }) => {
      if (!canWrite) return;
      if (payload.refs.length === 0) return;
      // Avoid pointless no-ops: dropping on the same unit with no cross-unit refs.
      const allAlreadyThere = payload.refs.every((r) => r.fromOuId === targetOuId);
      if (mode === "move" && allAlreadyThere) return;

      // Cross-dimension move guard: units of the same ou_type form a "dimension"
      // (e.g. all worksite units). Moving a worker between units of different
      // ou_types is semantically wrong — a worker's worksite can't be changed by
      // dropping them into an employer column. Block the move; allow copy
      // (Shift+drag) so a user can still add the worker to another dimension.
      // "custom" units are unconstrained — they're not part of a structured dimension.
      if (mode === "move" && targetOuId != null) {
        const targetType = ouTypeById.get(targetOuId);
        const nonCustomSourceTypes = payload.refs
          .map((r) => r.fromOuType)
          .filter((t): t is string => !!t && t !== "custom");
        if (
          targetType &&
          targetType !== "custom" &&
          nonCustomSourceTypes.length > 0 &&
          nonCustomSourceTypes.some((t) => t !== targetType)
        ) {
          // Silently block — the drag visual already constrains this via the
          // wallchart grouping (units are shown in ou_type bands). A toast would
          // be intrusive for accidental mis-drops.
          return;
        }
      }

      moveWorkers.mutate(
        {
          refs: payload.refs,
          toOuId: targetOuId,
          mode,
        },
        {
          onSuccess: () => {
            // Clear selection after successful bulk action.
            if (selection.size > 0) selection.clear();
          },
          // The mutation has no onError of its own and nothing reads .error, so
          // a NoRowsAffectedError on the source delete (WP1.6) would otherwise
          // be silent while the board refetches into the partial state.
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Moving the worker failed.");
          },
        }
      );
    },
    [canWrite, moveWorkers, ouTypeById, selection]
  );

  // Removes selected workers from their specific source units (not all units).
  // Grouped by ouId so workers in multiple selected units are handled correctly.
  const handleBulkRemoveFromUnit = useCallback(async () => {
    if (!canWrite) return;
    const refs = selection.refs().filter((r) => r.ouId !== null);
    if (refs.length === 0) return;

    const byOu = new Map<number, number[]>();
    for (const ref of refs) {
      const ouId = ref.ouId as number;
      if (!byOu.has(ouId)) byOu.set(ouId, []);
      byOu.get(ouId)!.push(ref.workerId);
    }

    for (const [ouId, workerIds] of byOu.entries()) {
      const { error } = await supabase
        .from("campaign_worker_ou" as never)
        .delete()
        .eq("ou_id", ouId)
        .in("worker_id", workerIds);
      if (error) throw error;
    }

    queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    selection.clear();
    setRemoveConfirmOpen(false);
    // setRemoveConfirmOpen is a stable block-A useState setter.
  }, [canWrite, selection, supabase, queryClient, campaignId, setRemoveConfirmOpen]);
  return { deleteUnitWorkers, splitMembers, handleWorkerDrop, handleBulkRemoveFromUnit };
}

export type WallChartActions = ReturnType<typeof useWallChartActions>;
