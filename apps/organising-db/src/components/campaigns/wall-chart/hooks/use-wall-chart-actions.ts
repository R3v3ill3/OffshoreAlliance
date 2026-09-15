import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { structureApi } from "@/lib/campaign/structure-api";

import type { WorkerDragRef } from "../dnd";
import type { DeleteUnitWorker } from "../delete-organising-unit-dialog";
import type { SplitMember } from "../split-unit-dialog";
import { isCrossDimensionMoveBlocked } from "../ou-move-compatibility";
import { structureErrorMessage } from "@/lib/campaign/structure-error-message";
import type { WallChartShellEnv, WallChartShellState } from "./use-wall-chart-shell-state";
import type { WallChartStructure } from "./use-wall-chart-structure";

/**
 * WP2.3 block F — the wall chart's writers, moved out of
 * `campaign-wall-chart.tsx` (`WC:1252–1426`). The delete-dialog worker list,
 * the lazy split-members query, drag-and-drop move/copy and bulk
 * remove-from-unit.
 *
 * Cross-`ou_type` moves are blocked silently unless source and target are
 * nested (employer container → worksite child, wp2.2.md D4). `moveWorkers.mutate`
 * is called with `(variables, { onSuccess, onError })`; `toast.error` fires
 * only from the mutation's `onError`.
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
  const { workerById, ouTypeById, parentByOu, workersByOu } = index;

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
      // (e.g. all worksite units). Moving between unrelated dimensions is wrong
      // — a worker's worksite can't be changed by dropping them into a foreign
      // employer column. Nested parent→child moves are allowed: after WP2.1 an
      // employer container's worksite children sit in another group/type, and
      // that drop is exactly how organisers place workers into sub-units
      // (structure_placements_move keep_in_parent / D4). Copy (Shift+drag) is
      // always allowed. "custom" units are unconstrained.
      if (
        isCrossDimensionMoveBlocked({
          mode,
          targetOuId,
          refs: payload.refs,
          ouTypeById,
          parentByOu,
        })
      ) {
        // Silently block — the drag visual already constrains unrelated
        // mis-drops via ou_type bands. A toast would be intrusive.
        return;
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
          // a refused move would otherwise be silent while the board refetches.
          // A plain Error keeps its own message; a StructureApiError gets the
          // organiser-facing sentence (K1 same-group copy, D17 rule).
          onError: (err) => {
            toast.error(structureErrorMessage(err, "Moving the worker failed."));
          },
        }
      );
    },
    [canWrite, moveWorkers, ouTypeById, parentByOu, selection]
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

    // WP2.2 §3.11 row 8: one `structure_placements_unassign` per unit. A
    // refusal (e.g. `forbidden`) is announced rather than left as an
    // unhandled rejection (wp2.2.md D36); the board refetches either way.
    const api = structureApi(supabase);
    let failed = false;
    try {
      for (const [ouId, workerIds] of byOu.entries()) {
        await api.placements.unassign({ campaignId: Number(campaignId), workerIds, ouId });
      }
    } catch (err) {
      failed = true;
      toast.error(structureErrorMessage(err, "Removing the workers from their units failed."));
    }

    queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    if (failed) return;
    selection.clear();
    setRemoveConfirmOpen(false);
    // setRemoveConfirmOpen is a stable block-A useState setter.
  }, [canWrite, selection, supabase, queryClient, campaignId, setRemoveConfirmOpen]);
  return { deleteUnitWorkers, splitMembers, handleWorkerDrop, handleBulkRemoveFromUnit };
}

export type WallChartActions = ReturnType<typeof useWallChartActions>;
