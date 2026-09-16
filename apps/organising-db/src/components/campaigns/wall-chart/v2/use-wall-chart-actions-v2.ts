import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { groupOfUnit } from "@/lib/campaign/groups/derive-group-view";
import { deriveGroupTree, nestingParentOf, indexUnitsById } from "@/lib/campaign/groups/derive-group-tree";
import type { DropRef } from "@/lib/campaign/groups/plan-drop";
import { planNestedDrop, type NestedDropPlan } from "@/lib/campaign/groups/plan-nested-drop";
import { structureApi } from "@/lib/campaign/structure-api";
import { structureErrorMessage } from "@/lib/campaign/structure-error-message";

import type { WorkerDragRef } from "../dnd";
import type { WallChartOU } from "../types";
import type { DeleteUnitWorker } from "../delete-organising-unit-dialog";
import type { SplitMember } from "../split-unit-dialog";
import type { WallChartShellV2 } from "./use-wall-chart-shell-v2";
import type { WallChartGroupView } from "./use-wall-chart-group-view";

/**
 * WP2.4 block F′ — the v2 wall chart's writers (wp2.4.md §3.4, §3.9;
 * wp2.4c.md §3.7).
 *
 * Every drop and every "Move to unit…" goes through the pure
 * `planNestedDrop` (the §3.7 table; a superset of WP2.4's `planDrop`, which
 * it reduces to exactly when no unit of the group has children) and then
 * through `useMoveWorkersMutation`'s ordered `steps`: adds before removes,
 * each step one existing RPC in its own transaction, `keepInParent: true` on
 * every move and `fromOuId` always a row the worker actually holds. CP-a
 * still holds: there is no copy, Shift is ignored.
 *
 * "Remove from <Group>" is the Unassigned row of that table
 * (`placements.unassign({ withinGroupId })` for the group, then for every
 * sub-unit group the selection holds a row in — NS-a / D1, so a removed
 * worker cannot re-appear inside the root they were removed from as a
 * child-only tile). A refusal toasts through `structureErrorMessage`, which
 * passes a `MoveStepError`'s "Step n of m failed: …" sentence through
 * unchanged; a success clears the selection. Nothing here writes a structure
 * table directly (the guard test proves it).
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
  const { groupId, tree, workersByUnit, ouAssignments, ous } = structure;
  const { workerById, memberRows } = structure.index;

  const groupOf = useCallback((ouId: number) => groupOfUnit(ous, ouId), [ous]);

  /**
   * The plan for dropping `refs` on `targetOuId` (`null` = Unassigned in the
   * selected group). From the Not in any group view the target names its own
   * group, so the plan is made against THAT group's tree (§3.8: "Move to
   * unit… lists every unit across groups").
   */
  const planFor = useCallback(
    (refs: readonly DropRef[], targetOuId: number | null): NestedDropPlan => {
      if (groupId != null && tree) {
        return planNestedDrop({ refs, targetOuId, groupId, tree, groupOfUnit: groupOf });
      }
      if (targetOuId == null) return { kind: "noop" };
      const targetGroup = groupOf(targetOuId);
      if (targetGroup == null) return { kind: "noop" };
      return planNestedDrop({
        refs,
        targetOuId,
        groupId: targetGroup,
        tree: deriveGroupTree(memberRows, ous, ouAssignments, targetGroup),
        groupOfUnit: groupOf,
      });
    },
    [groupId, tree, groupOf, ous, memberRows, ouAssignments]
  );

  const executePlan = useCallback(
    (plan: NestedDropPlan, targetOuId: number | null, onDone?: () => void) => {
      if (plan.kind === "noop") return;
      moveWorkers.mutate(
        // `toOuId` is still the card that was dropped on: the mutation reads
        // it for the employer/worksite stamping and the reverse sync it runs
        // once after the last step (NX-a).
        { refs: plan.refs, toOuId: targetOuId, mode: "move", steps: plan.steps },
        {
          // A-7 (wp2.4c.md §3.7): `useMoveWorkersMutation` SUMS
          // `{inserted, deleted, skipped}` across the steps, so a one-worker
          // three-step drop returns `inserted: 3`. Nothing here reads them,
          // and no "N workers moved" copy may: a count of workers is
          // `plan.refs.length`, never those totals.
          onSuccess: () => {
            if (selection.size > 0) selection.clear();
            onDone?.();
          },
          onError: (err) => {
            // A `MoveStepError` carries the §3.13 sentence, which
            // `structureErrorMessage` passes through byte-for-byte (D3).
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
      executePlan(planFor(payload.refs, targetOuId), targetOuId);
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
      executePlan(plan, targetOuId, onDone);
    },
    [canWrite, executePlan, planFor]
  );

  /**
   * "Remove from <Group>": one unassign within the selected group, then one
   * within every sub-unit group the selected workers hold a row in under this
   * group's tree (wp2.4c.md §3.7 bullet, NS-a / D1). Without the second call a
   * worker "removed from Worksite" who still held a shift under a worksite
   * would re-appear inside that worksite as a child-only tile, which is what
   * the derivation renders (NP-a) and what B3 forbids.
   */
  const handleBulkRemoveFromGroup = useCallback(async () => {
    if (!canWrite || groupId == null) return;
    const workerIds = [...new Set(selection.refs().filter((r) => r.ouId !== null).map((r) => r.workerId))];
    if (workerIds.length === 0) return;
    /** Sub-unit group → the selected workers holding a row in it, in selection order. */
    const byChildGroup = new Map<number, number[]>();
    for (const workerId of workerIds) {
      for (const childOuId of tree?.childPlacementsByWorker.get(workerId) ?? []) {
        const childGroup = groupOf(childOuId);
        if (childGroup == null || childGroup === groupId) continue;
        const list = byChildGroup.get(childGroup) ?? [];
        if (!list.includes(workerId)) list.push(workerId);
        byChildGroup.set(childGroup, list);
      }
    }
    const api = structureApi(supabase);
    let failed = false;
    try {
      await api.placements.unassign({
        campaignId: Number(campaignId),
        workerIds,
        withinGroupId: groupId,
      });
      for (const [childGroupId, ids] of byChildGroup) {
        await api.placements.unassign({
          campaignId: Number(campaignId),
          workerIds: ids,
          withinGroupId: childGroupId,
        });
      }
    } catch (err) {
      failed = true;
      toast.error(structureErrorMessage(err, "Removing the workers from the Group failed."));
    }
    queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    if (failed) return;
    selection.clear();
    setRemoveConfirmOpen(false);
  }, [canWrite, groupId, tree, groupOf, selection, supabase, campaignId, queryClient, setRemoveConfirmOpen]);

  /**
   * Merge… partners (wp2.4c.md §3.8): a ROOT merges with the other roots of
   * its Group (as WP2.4 did); a NESTED card merges only with its siblings in
   * the same Group under the same root — `structure_unit_merge` needs one
   * group (C-j) and the survivor keeps its `parent_ou_id`.
   */
  const mergeCandidatesFor = useCallback(
    (ou: WallChartOU): WallChartOU[] => {
      if (!tree) return [];
      const rootId = [...tree.childrenByRoot].find(([, children]) =>
        children.some((c) => c.ou_id === ou.ou_id)
      )?.[0];
      if (rootId == null) {
        return [...tree.roots, ...tree.foreignNested].filter((u) => u.ou_id !== ou.ou_id);
      }
      return (tree.childrenByRoot.get(rootId) ?? []).filter(
        (c) => c.ou_id !== ou.ou_id && c.group_id === ou.group_id
      );
    },
    [tree]
  );

  /**
   * AP-a (wp2.4c.md §3.10): "Assign people…" on a card with a nesting parent
   * places the worker on the sub-unit only (the add-workers writer has no
   * parent logic), so the chart adds the root row itself for the workers who
   * hold none — one `placements.move({ fromOuId: null, toOuId: root })`. On a
   * root, nothing is sent.
   *
   * The test is membership of the ROOT's group, read from the placement rows
   * (review B-1, fix round 1). It is NOT `placementByWorker`, which is the
   * worker's row in the SELECTED group: the two coincide only while the card
   * is drawn nested. On a `foreignNested` card — a shift under a worksite,
   * seen from the Shift group's own view (§3.6, the mixed case) — the selected
   * group is Shift while the root's group is Worksite, so a worker already on
   * another worksite would have passed the old filter and been moved to this
   * card's worksite by `structure_placements_move`'s displace rule (C-b): a
   * silent structural move out of a dialog's success callback, which §12.10
   * item 5 says must never happen. Such a worker is left exactly where they
   * are; moving them is a drag, not a side effect of adding them.
   */
  const handleWorkersAdded = useCallback(
    (contextOu: WallChartOU | null, workerIds: readonly number[]) => {
      if (!canWrite || !contextOu || workerIds.length === 0) return;
      const parentOuId = nestingParentOf(contextOu, indexUnitsById(ous));
      if (parentOuId == null) return;
      const parentGroup = groupOf(parentOuId);
      if (parentGroup == null) return;
      const heldInParentGroup = new Set(
        ouAssignments.filter((a) => groupOf(a.ou_id) === parentGroup).map((a) => a.worker_id)
      );
      const withoutAnyRow = workerIds.filter((id) => !heldInParentGroup.has(id));
      if (withoutAnyRow.length === 0) return;
      moveWorkers.mutate(
        {
          refs: withoutAnyRow.map((workerId) => ({ workerId, fromOuId: null })),
          toOuId: parentOuId,
          mode: "move",
          steps: [{ kind: "move", toOuId: parentOuId, fromOuId: null, workerIds: withoutAnyRow, keepInParent: true }],
        },
        {
          onError: (err) => toast.error(structureErrorMessage(err, "Adding the workers to the parent Unit failed.")),
        }
      );
    },
    [canWrite, ous, groupOf, ouAssignments, moveWorkers]
  );

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
  //
  // Every member who holds the unit's OWN row, not the card's tiles (review
  // A-4, fix round 1): Stage 2 re-pointed `workersByUnit` to the tree's
  // per-card list, which on a root with children is "members not yet in a
  // sub-unit". Splitting KGP into crews must still be able to place the
  // workers who are on Day or Night — they hold KGP's row and
  // `structure_unit_split` moves exactly that row. This is WP2.4's list
  // (`deriveGroupView().workersByUnit`), restated over the flat placement map.
  const splitMemberWorkerIds = useMemo(() => {
    if (!splitTargetOu) return [] as number[];
    const ouId = splitTargetOu.ou_id;
    return memberRows
      .map((r) => r.worker_id)
      .filter((id) => structure.placementByWorker.get(id) === ouId);
  }, [splitTargetOu, memberRows, structure.placementByWorker]);

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
    mergeCandidatesFor,
    handleWorkersAdded,
    toggleSelectAll,
    deleteUnitWorkers,
    splitMembers,
  };
}

export type WallChartActionsV2 = ReturnType<typeof useWallChartActionsV2>;
