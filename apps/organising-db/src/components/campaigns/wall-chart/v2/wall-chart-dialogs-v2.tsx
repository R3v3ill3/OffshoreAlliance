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
  const { ous, ouById, groupUnits, nextDisplayOrder, workersByUnit } = structure;
  const { workerById } = structure.index;
  const group = groupsState.selectedGroup;

  // Move targets: the Group's units, or — outside any Group — every unit that has a Group, "Group › Unit".
  const moveTargets = useMemo<MoveToUnitTarget[]>(() => {
    if (group) return groupUnits.map((ou) => ({ ou, group }));
    return groupsState.groups.flatMap((g) =>
      (structure.unitsByGroup.get(g.group_id) ?? []).map((ou) => ({ ou, group: g }))
    );
  }, [group, groupUnits, groupsState.groups, structure.unitsByGroup]);

  const tileDialogWorker = tileUnitDialog != null ? workerById.get(tileUnitDialog.workerId) : undefined;
  const tileRefs: DropRef[] = tileUnitDialog
    ? [{ workerId: tileUnitDialog.workerId, fromOuId: tileUnitDialog.fromOuId }]
    : [];
  const bulkRefs: DropRef[] = selection.refs().map((r) => ({ workerId: r.workerId, fromOuId: r.ouId }));

  const removeCount = new Set(selection.refs().filter((r) => r.ouId !== null).map((r) => r.workerId)).size;

  const workerCountByOu = useMemo(() => {
    const m = new Map<number, number>();
    for (const [ouId, ids] of workersByUnit) m.set(ouId, ids.length);
    return m;
  }, [workersByUnit]);

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
          candidates={groupUnits.filter((u) => u.ou_id !== mergeSourceOu.ou_id)}
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
          // Same-Group targets only (§3.13): the dialog's own same-parent /
          // same-container rule then applies within them.
          allOus={groupUnits}
          childOuIds={[]}
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
