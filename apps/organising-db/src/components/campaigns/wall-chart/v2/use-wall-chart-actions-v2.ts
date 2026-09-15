import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { deriveGroupView, groupOfUnit } from "@/lib/campaign/groups/derive-group-view";
import { planDrop, type DropPlan, type DropRef } from "@/lib/campaign/groups/plan-drop";
import { structureApi } from "@/lib/campaign/structure-api";
import { structureErrorMessage } from "@/lib/campaign/structure-error-message";

import type { WorkerDragRef } from "../dnd";
import type { DeleteUnitWorker } from "../delete-organising-unit-dialog";
import type { SplitMember } from "../split-unit-dialog";
import type { WallChartShellV2 } from "./use-wall-chart-shell-v2";
import type { WallChartGroupView } from "./use-wall-chart-group-view";

/**
 * WP2.4 block F′ — the v2 wall chart's writers (wp2.4.md §3.4, §3.9).
 *
 * Every drop and every "Move to unit…" goes through the pure `planDrop`
 * (plan 5.6 drag rules, CP-a: no copy, Shift is ignored) and then through
 * `useMoveWorkersMutation`: one `placements.move` per source unit, or one
 * `placements.move({ toOuId: null, withinGroupId })` for the group's
 * Unassigned card. "Remove from <Group>" is one
 * `placements.unassign({ withinGroupId })`. A refusal toasts through
 * `structureErrorMessage`; a success clears the selection. Nothing here
 * writes a structure table directly (the guard test proves it).
 *
 * The delete-dialog worker list and the lazy split-members read are the
 * legacy block F's, restated over the group view.
 */
export function useWallChartActionsV2({
  campaignId,
  canWrite,
  shell,
  structure,
}: {
  campaignId: string;
  canWrite: boolean;
  shell: WallChartShellV2;
  structure: WallChartGroupView;
}) {
  const { supabase, queryClient } = shell.env;
  const { selection, moveWorkers } = shell;
  const { deleteTargetOu, splitTargetOu, setRemoveConfirmOpen } = shell.dialogs;
  const { groupId, groupUnitIds, placementByWorker, workersByUnit, ouAssignments, ous } = structure;
  const { workerById, memberRows } = structure.index;

  /**
   * The plan for dropping `refs` on `targetOuId` (`null` = Unassigned in the
   * selected group). From the Not in any group view the target names its own
   * group, so the plan is made against THAT group's view (§3.8: "Move to
   * unit… lists every unit across groups").
   */
  const planFor = useCallback(
    (refs: readonly DropRef[], targetOuId: number | null): DropPlan => {
      if (groupId != null) {
        return planDrop({ refs, targetOuId, groupId, groupUnitIds, placementByWorker });
      }
      if (targetOuId == null) return { kind: "noop" };
      const targetGroup = groupOfUnit(ous, targetOuId);
      if (targetGroup == null) return { kind: "noop" };
      const view = deriveGroupView(memberRows, ous, ouAssignments, targetGroup);
      return planDrop({
        refs,
        targetOuId,
        groupId: targetGroup,
        groupUnitIds: new Set(view.units.map((u) => u.ou_id)),
        placementByWorker: view.placementByWorker,
      });
    },
    [groupId, groupUnitIds, placementByWorker, ous, memberRows, ouAssignments]
  );

  const executePlan = useCallback(
    (plan: DropPlan, onDone?: () => void) => {
      if (plan.kind === "noop") return;
      moveWorkers.mutate(
        plan.kind === "move"
          ? { refs: plan.refs, toOuId: plan.toOuId, mode: "move" }
          : { refs: plan.refs, toOuId: null, mode: "move", withinGroupId: plan.withinGroupId },
        {
          onSuccess: () => {
            if (selection.size > 0) selection.clear();
            onDone?.();
          },
          onError: (err) => {
            toast.error(structureErrorMessage(err, "Moving the worker failed."));
          },
        }
      );
    },
    [moveWorkers, selection]
  );

  /** `CampaignUnitCard.onWorkerDrop`: `mode` is ignored (CP-a) — Shift produces the same move. */
  const handleWorkerDrop = useCallback(
    ({ targetOuId, payload }: { targetOuId: number | null; payload: { refs: WorkerDragRef[] }; mode: "move" | "copy" }) => {
      if (!canWrite) return;
      if (payload.refs.length === 0) return;
      executePlan(planFor(payload.refs, targetOuId));
    },
    [canWrite, executePlan, planFor]
  );

  /** The move-to-unit dialog and the selection bar's Move to unit… */
  const moveRefsTo = useCallback(
    (refs: readonly DropRef[], targetOuId: number | null, onDone?: () => void) => {
      if (!canWrite) return;
      const plan = planFor(refs, targetOuId);
      if (plan.kind === "noop") {
        onDone?.();
        return;
      }
      executePlan(plan, onDone);
    },
    [canWrite, executePlan, planFor]
  );

  /** "Remove from <Group>": one unassign within the selected group (§3.5, §3.9). */
  const handleBulkRemoveFromGroup = useCallback(async () => {
    if (!canWrite || groupId == null) return;
    const workerIds = [...new Set(selection.refs().filter((r) => r.ouId !== null).map((r) => r.workerId))];
    if (workerIds.length === 0) return;
    let failed = false;
    try {
      await structureApi(supabase).placements.unassign({
        campaignId: Number(campaignId),
        workerIds,
        withinGroupId: groupId,
      });
    } catch (err) {
      failed = true;
      toast.error(structureErrorMessage(err, "Removing the workers from the Group failed."));
    }
    queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    if (failed) return;
    selection.clear();
    setRemoveConfirmOpen(false);
  }, [canWrite, groupId, selection, supabase, campaignId, queryClient, setRemoveConfirmOpen]);

  /** "Select all" = a click on the card count (§3.6): toggles the card's visible tiles in the selection. */
  const toggleSelectAll = useCallback(
    (ouId: number | null, workerIds: readonly number[]) => {
      if (workerIds.length === 0) return;
      const allSelected = workerIds.every((id) => selection.has(ouId, id));
      if (allSelected) {
        for (const id of workerIds) selection.toggle(ouId, id);
      } else {
        selection.addAll(workerIds.filter((id) => !selection.has(ouId, id)).map((workerId) => ({ ouId, workerId })));
      }
    },
    [selection]
  );

  // ── Delete dialog: the unit's workers (block F, over the group view) ──────
  const deleteUnitWorkers = useMemo((): DeleteUnitWorker[] => {
    if (!deleteTargetOu) return [];
    const workerIds = workersByUnit.get(deleteTargetOu.ou_id) ?? [];
    const primaryByWorker = new Map<number, boolean>();
    for (const a of ouAssignments) {
      if (a.ou_id === deleteTargetOu.ou_id && a.is_primary) primaryByWorker.set(a.worker_id, true);
    }
    return workerIds.map((wid) => {
      const w = workerById.get(wid);
      return {
        worker_id: wid,
        label: w ? `${w.last_name}, ${w.first_name}`.trim() : `Worker #${wid}`,
        is_primary: primaryByWorker.get(wid),
      };
    });
  }, [deleteTargetOu, workersByUnit, ouAssignments, workerById]);

  // ── Split: members for the targeted unit (block F, verbatim read) ─────────
  const splitMemberWorkerIds = useMemo(() => {
    if (!splitTargetOu) return [] as number[];
    return workersByUnit.get(splitTargetOu.ou_id) ?? [];
  }, [splitTargetOu, workersByUnit]);

  const { data: splitMembers = [] } = useQuery({
    queryKey: ["split-unit-members", splitTargetOu?.ou_id ?? "none", splitMemberWorkerIds.join(",")],
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
        const occ = (Array.isArray(occRel) ? occRel[0] : occRel) as { canonical_name: string } | null;
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

  return {
    handleWorkerDrop,
    moveRefsTo,
    handleBulkRemoveFromGroup,
    toggleSelectAll,
    deleteUnitWorkers,
    splitMembers,
  };
}

export type WallChartActionsV2 = ReturnType<typeof useWallChartActionsV2>;
