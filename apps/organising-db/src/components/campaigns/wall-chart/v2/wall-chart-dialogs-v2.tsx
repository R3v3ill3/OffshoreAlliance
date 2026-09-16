"use client";

import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";
import type { DropRef } from "@/lib/campaign/groups/plan-drop";

import { CreateTaskListDialog } from "../../task-lists/create-task-list-dialog";
import { AddCampaignWorkerDialog } from "../add-campaign-worker-dialog";
import { ClearRatingsDialog } from "../clear-ratings-dialog";
import { CreateOrganisingUnitDialog } from "../create-organising-unit-dialog";
import { DeleteOrganisingUnitDialog } from "../delete-organising-unit-dialog";
import { LinkToLeaderDialog } from "../link-to-leader-dialog";
import { MergeUnitsDialog } from "../merge-units-dialog";
import { SplitUnitDialog } from "../split-unit-dialog";
import { ouDisplayName, type WallChartOU } from "../types";
import { EditUnitDialog } from "./edit-unit-dialog";
import { MoveToUnitDialog, type MoveToUnitTarget } from "./move-to-unit-dialog";
import type { WallChartActionsV2 } from "./use-wall-chart-actions-v2";
import type { WallChartGroupsState } from "./use-wall-chart-groups";
import type { WallChartGroupView } from "./use-wall-chart-group-view";
import type { WallChartShellV2 } from "./use-wall-chart-shell-v2";

/**
 * WP2.4 — every v2 wall-chart dialog and its wiring (wp2.4.md §3.4, §3.13).
 * Open/close state lives in the v2 shell state (`shell.dialogs`); the
 * writers live in the actions hook. The move dialogs are the v2
 * `MoveToUnitDialog` (move-only, CP-a); Rename / Set estimate are the MN-a
 * `EditUnitDialog`; Merge picks a partner in the same Group and then hands
 * the pair to the existing `MergeUnitsDialog`; everything else is the
 * dialog the legacy chart mounts, with the selected Group's units where the
 * legacy passed every unit.
 */
export function WallChartDialogsV2({
  campaignId,
  canWrite,
  shell,
  groupsState,
  structure,
  actions,
}: {
  campaignId: string;
  canWrite: boolean;
  shell: WallChartShellV2;
  groupsState: WallChartGroupsState;
  structure: WallChartGroupView;
  actions: WallChartActionsV2;
}) {
  const queryClient = shell.env.queryClient;
  const { selection, moveWorkers } = shell;
  const {
    tileUnitDialog,
    setTileUnitDialog,
    bulkMoveOpen,
    setBulkMoveOpen,
    removeConfirmOpen,
    setRemoveConfirmOpen,
    clearRatingsDialogOpen,
    setClearRatingsDialogOpen,
    linkDialogOpen,
    setLinkDialogOpen,
    splitTargetOu,
    setSplitTargetOu,
    deleteTargetOu,
    setDeleteTargetOu,
    mergeSourceOu,
    setMergeSourceOu,
    editUnit,
    setEditUnit,
    createUnitOpen,
    setCreateUnitOpen,
    createTaskListOpen,
    setCreateTaskListOpen,
    taskListFiredDraft,
    setTaskListFiredDraft,
    importWizardOpen,
    setImportWizardOpen,
    addWorkerOpen,
    setAddWorkerOpen,
    addWorkerContextOu,
    setAddWorkerContextOu,
    addWorkerFormKey,
  } = shell.dialogs;
  const { setHighlightedOuId } = shell.highlight;
  const { ous, ouById, groupUnits, nextDisplayOrder, workersByUnit, tree, rollupByUnit, cardTitle } = structure;
  const { workerById } = structure.index;
  const group = groupsState.selectedGroup;

  /**
   * Move targets (wp2.4c.md §3.7): inside a Group, its roots, each root's
   * nested children right after it as "<Root> › <Child>", then the flat
   * foreign-nested cards — the same order the band renders. Outside any Group
   * they stay every unit that has a Group, "Group › Unit" (§3.5: the Not in
   * any group view is unchanged).
   */
  const moveTargets = useMemo<MoveToUnitTarget[]>(() => {
    if (group) {
      if (!tree) return groupUnits.map((ou) => ({ ou, group }));
      const out: MoveToUnitTarget[] = [];
      for (const root of tree.roots) {
        out.push({ ou: root, group });
        for (const child of tree.childrenByRoot.get(root.ou_id) ?? []) {
          out.push({ ou: child, group, label: `${ouDisplayName(root)} › ${ouDisplayName(child)}` });
        }
      }
      // A flat foreign-nested card is titled "<Parent> › <Unit>" here too
      // (§3.13; review A-2, fix round 1).
      for (const flat of tree.foreignNested) out.push({ ou: flat, group, label: cardTitle(flat) });
      return out;
    }
    return groupsState.groups.flatMap((g) =>
      (structure.unitsByGroup.get(g.group_id) ?? []).map((ou) => ({ ou, group: g }))
    );
  }, [group, tree, groupUnits, groupsState.groups, structure.unitsByGroup, cardTitle]);

  /**
   * The delete dialog's inputs (wp2.4c.md §3.9). `childOuIds` is EVERY unit
   * whose `parent_ou_id` is the target — not the NE-a nesting set — because
   * `delete-organising-unit-dialog.tsx:121` sends `deleteChildren: true`
   * unconditionally and `structure_unit_delete` then removes every child with
   * its placements. What the dialog announces has to be what the RPC deletes
   * (review B-2, fix round 1): the nesting set left two classes unannounced —
   * a group container's members (Delete… on campaign 42's "EDI Downer" card
   * takes all four worksites, their shifts and their placements) and a C-k
   * same-group child (deleting "Barrow" takes the "Barrow Jetty" card beside
   * it). Both are real children of the target and neither nests under NE-a.
   * With them named, the dialog takes its "Delete group + N sub-units" branch
   * and drops the reassignment step, which is right: those placements go too.
   *
   * A NESTED card has no children and hands over, as reassignment targets, its
   * siblings in the same Group under the same root plus that Group's roots —
   * the dialog's own same-parent rule then narrows them.
   */
  const deleteChildOuIds = useMemo(() => {
    if (!deleteTargetOu) return [] as number[];
    return ous.filter((o) => o.parent_ou_id === deleteTargetOu.ou_id).map((o) => o.ou_id);
  }, [deleteTargetOu, ous]);
  const deleteAllOus = useMemo(() => {
    if (!deleteTargetOu || !tree) return groupUnits;
    const nestedSiblings = [...tree.childrenByRoot.values()]
      .flat()
      .filter((c) => c.parent_ou_id === deleteTargetOu.parent_ou_id && c.group_id === deleteTargetOu.group_id);
    // A card is nested when it is one of its root's children; a root and a
    // flat foreign-nested card both keep WP2.4's Group-wide list.
    const isNested = nestedSiblings.some((c) => c.ou_id === deleteTargetOu.ou_id);
    if (!isNested) return groupUnits;
    return [...nestedSiblings, ...groupUnits];
  }, [deleteTargetOu, tree, groupUnits]);

  const tileDialogWorker = tileUnitDialog != null ? workerById.get(tileUnitDialog.workerId) : undefined;
  const tileRefs: DropRef[] = tileUnitDialog
    ? [{ workerId: tileUnitDialog.workerId, fromOuId: tileUnitDialog.fromOuId }]
    : [];
  const bulkRefs: DropRef[] = selection.refs().map((r) => ({ workerId: r.workerId, fromOuId: r.ouId }));

  const removeCount = new Set(selection.refs().filter((r) => r.ouId !== null).map((r) => r.workerId)).size;

  const workerCountByOu = useMemo(() => {
    const m = new Map<number, number>();
    for (const [ouId, ids] of workersByUnit) m.set(ouId, ids.length);
    // A root's count is its roll-up, so the merge dialog names the same
    // number the card shows (wp2.4c.md §3.6).
    for (const [ouId, ids] of rollupByUnit) m.set(ouId, ids.length);
    return m;
  }, [workersByUnit, rollupByUnit]);

  return (
    <>
      <MoveToUnitDialog
        key={tileUnitDialog ? `tile-${tileUnitDialog.workerId}-${tileUnitDialog.fromOuId ?? "u"}` : "tile-none"}
        open={tileUnitDialog != null}
        onOpenChange={(v) => {
          if (!v) setTileUnitDialog(null);
        }}
        refs={tileRefs}
        workerLabel={tileDialogWorker ? `${tileDialogWorker.first_name} ${tileDialogWorker.last_name}` : undefined}
        targets={moveTargets}
        group={group}
        pending={moveWorkers.isPending}
        onMove={(targetOuId, refs) => actions.moveRefsTo(refs, targetOuId, () => setTileUnitDialog(null))}
      />

      {bulkMoveOpen && (
        <MoveToUnitDialog
          key={`bulk-${selection.size}`}
          open
          onOpenChange={(v) => {
            if (!v) setBulkMoveOpen(false);
          }}
          refs={bulkRefs}
          targets={moveTargets}
          group={group}
          pending={moveWorkers.isPending}
          onMove={(targetOuId, refs) => actions.moveRefsTo(refs, targetOuId, () => setBulkMoveOpen(false))}
        />
      )}

      {linkDialogOpen && (
        <LinkToLeaderDialog
          key={`link-${selection.size}`}
          open
          onOpenChange={(v) => {
            if (!v) setLinkDialogOpen(false);
          }}
          campaignId={campaignId}
          followerWorkerIds={selection.workerIds()}
          onCompleted={() => selection.clear()}
        />
      )}

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from {group?.name ?? "the Group"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {`${removeCount} ${removeCount === 1 ? "worker" : "workers"} will become Unassigned in ${
                group?.name ?? "this Group"
              }. They stay in the campaign and in their Units of every other Group. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={actions.handleBulkRemoveFromGroup}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editUnit && (
        <EditUnitDialog
          key={`edit-${editUnit.ou.ou_id}-${editUnit.field}`}
          open
          onOpenChange={(v) => {
            if (!v) setEditUnit(null);
          }}
          campaignId={campaignId}
          ou={editUnit.ou}
          field={editUnit.field}
        />
      )}

      {mergeSourceOu && (
        <MergeWithDialog
          key={`merge-${mergeSourceOu.ou_id}`}
          campaignId={campaignId}
          source={mergeSourceOu}
          candidates={actions.mergeCandidatesFor(mergeSourceOu)}
          workerCountByOu={workerCountByOu}
          onClose={() => setMergeSourceOu(null)}
        />
      )}

      <CreateOrganisingUnitDialog
        open={createUnitOpen}
        onOpenChange={setCreateUnitOpen}
        campaignId={campaignId}
        displayOrder={nextDisplayOrder}
        onCreated={(focusOuId) => {
          window.setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-ou-id="${focusOuId}"]`);
            if (!el) return;
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            setHighlightedOuId(focusOuId);
            window.setTimeout(() => setHighlightedOuId(null), 2500);
          }, 250);
        }}
      />

      <CreateTaskListDialog
        campaignId={campaignId}
        open={createTaskListOpen}
        onOpenChange={(next) => {
          setCreateTaskListOpen(next);
          if (!next) setTaskListFiredDraft(null);
        }}
        draft={taskListFiredDraft ?? undefined}
      />

      <WorkerImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        campaignId={campaignId}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
          queryClient.invalidateQueries({ queryKey: ["workers"] });
        }}
      />

      <AddCampaignWorkerDialog
        open={addWorkerOpen}
        onOpenChange={(next) => {
          setAddWorkerOpen(next);
          if (!next) setAddWorkerContextOu(null);
        }}
        campaignId={campaignId}
        canWrite={canWrite}
        contextOu={addWorkerContextOu}
        organisingUnits={ous}
        formResetKey={addWorkerFormKey}
        // AP-a (wp2.4c.md §3.10): "Assign people…" on a nested card places the
        // worker on the sub-unit only (the route has no parent logic), so the
        // chart adds the root row itself for the workers who hold none.
        onAdded={(workerIds) => actions.handleWorkersAdded(addWorkerContextOu, workerIds)}
      />

      {splitTargetOu && (
        <SplitUnitDialog
          open
          onOpenChange={(v) => {
            if (!v) setSplitTargetOu(null);
          }}
          campaignId={campaignId}
          parent={splitTargetOu}
          sourceContainer={
            splitTargetOu.ou_group_id != null ? (ouById.get(splitTargetOu.ou_group_id) ?? null) : null
          }
          members={actions.splitMembers}
        />
      )}

      <ClearRatingsDialog
        open={clearRatingsDialogOpen}
        onOpenChange={setClearRatingsDialogOpen}
        campaignId={campaignId}
        workerIds={selection.workerIds()}
        onSuccess={() => selection.clear()}
      />

      {deleteTargetOu && (
        <DeleteOrganisingUnitDialog
          open={!!deleteTargetOu}
          onOpenChange={(o) => {
            if (!o) setDeleteTargetOu(null);
          }}
          campaignId={campaignId}
          unit={deleteTargetOu}
          // Same-Group targets only (§3.13), plus a nested source's siblings
          // (wp2.4c.md §3.9); the dialog's own same-parent / same-container
          // rule then applies within them.
          allOus={deleteAllOus}
          childOuIds={deleteChildOuIds}
          workers={actions.deleteUnitWorkers}
          onDeleted={() => {
            setDeleteTargetOu(null);
            selection.clear();
          }}
        />
      )}
    </>
  );
}

/**
 * "Merge…" from a card: choose the other Unit of the same Group, then the
 * existing `MergeUnitsDialog` decides the survivor and issues
 * `structure_unit_merge` (units must share a group, C-j).
 */
function MergeWithDialog({
  campaignId,
  source,
  candidates,
  workerCountByOu,
  onClose,
}: {
  campaignId: string;
  source: WallChartOU;
  candidates: WallChartOU[];
  workerCountByOu: Map<number, number>;
  onClose: () => void;
}) {
  const [partnerId, setPartnerId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const partner = candidates.find((u) => String(u.ou_id) === partnerId) ?? null;

  if (confirming && partner) {
    return (
      <MergeUnitsDialog
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        campaignId={campaignId}
        ous={[source, partner]}
        workerCountByOu={workerCountByOu}
      />
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Merge {ouDisplayName(source)} with…</DialogTitle>
          <DialogDescription>
            Choose another Unit of the same Group. You then pick which of the two survives.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">There is no other Unit in this Group to merge with.</p>
          ) : (
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger aria-label="Merge with">
                <SelectValue placeholder="Choose a Unit…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((u) => (
                  <SelectItem key={u.ou_id} value={String(u.ou_id)}>
                    {ouDisplayName(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!partner} onClick={() => setConfirming(true)}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
