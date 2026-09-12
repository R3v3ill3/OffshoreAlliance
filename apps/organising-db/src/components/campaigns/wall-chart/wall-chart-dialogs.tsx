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
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";

import { CreateTaskListDialog } from "../task-lists/create-task-list-dialog";
import { AddCampaignWorkerDialog } from "./add-campaign-worker-dialog";
import { ClearRatingsDialog } from "./clear-ratings-dialog";
import { MoveOrCopyWorkersDialog } from "./copy-worker-to-unit-dialog";
import { CreateOrganisingUnitDialog } from "./create-organising-unit-dialog";
import { DeleteOrganisingUnitDialog } from "./delete-organising-unit-dialog";
import { LinkToLeaderDialog } from "./link-to-leader-dialog";
import { SplitUnitDialog } from "./split-unit-dialog";
import type { WallChartActions } from "./hooks/use-wall-chart-actions";
import type { WallChartShellState } from "./hooks/use-wall-chart-shell-state";
import type { WallChartStructure } from "./hooks/use-wall-chart-structure";

/**
 * WP2.3 — every wall chart dialog, moved verbatim out of
 * `campaign-wall-chart.tsx` (`WC:2456–2630`). Open/close state still lives in
 * block A (`shell.dialogs`); the mutations still live in block F
 * (`actions`) and block C (`struct`), so the dialogs' props, confirm copy,
 * `canWrite` gates and invalidations are unchanged.
 */
export function WallChartDialogs({
  campaignId,
  canWrite,
  shell,
  struct,
  actions,
}: {
  campaignId: string;
  canWrite: boolean;
  shell: WallChartShellState;
  struct: WallChartStructure;
  actions: WallChartActions;
}) {
  const queryClient = shell.env.queryClient;
  const selection = shell.selection;
  const {
    bulkDialog,
    setBulkDialog,
    tileUnitDialog,
    setTileUnitDialog,
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
    createUnitOpen,
    setCreateUnitOpen,
    createTaskListOpen,
    setCreateTaskListOpen,
    importWizardOpen,
    setImportWizardOpen,
    addWorkerOpen,
    setAddWorkerOpen,
  } = shell.dialogs;
  const { taskListFiredDraft, setTaskListFiredDraft } = shell.dialogs;
  const { addWorkerContextOu, setAddWorkerContextOu, addWorkerFormKey } = shell.dialogs;
  const { setHighlightedOuId } = shell.highlight;
  const { ous, nextDisplayOrder } = struct;
  const { ouTypeById, workerById, unitsByWorker, childrenByParent } = struct.index;
  const { deleteUnitWorkers, splitMembers, handleBulkRemoveFromUnit } = actions;

  // Two pure derivations that only the dialogs read, moved verbatim with them.
  const tileDialogWorker =
    tileUnitDialog != null ? workerById.get(tileUnitDialog.workerId) : undefined;
  const tileDialogWorkerOuIds =
    tileUnitDialog != null ? unitsByWorker.get(tileUnitDialog.workerId) ?? [] : [];

  // Same body and same laziness as the JSX IIFE it replaces (§3.3 bans IIFEs
  // in JSX); only the call site moved.
  const removeConfirmDescription = () => {
    const count = selection.refs().filter((r) => r.ouId !== null).length;
    return `Remove ${count} assignment${count === 1 ? "" : "s"} from their respective units? Workers remain in the campaign and any other units they belong to. This cannot be undone.`;
  };

  return (
    <>
      <MoveOrCopyWorkersDialog
        key={
          tileUnitDialog
            ? `tile-${tileUnitDialog.workerId}-${tileUnitDialog.fromOuId ?? "unassigned"}`
            : "tile-none"
        }
        open={tileUnitDialog != null}
        onOpenChange={(v) => {
          if (!v) setTileUnitDialog(null);
        }}
        campaignId={campaignId}
        refs={
          tileUnitDialog
            ? [
                {
                  workerId: tileUnitDialog.workerId,
                  fromOuId: tileUnitDialog.fromOuId,
                  fromOuType: tileUnitDialog.fromOuType,
                },
              ]
            : []
        }
        mode="move"
        workerLabel={
          tileDialogWorker
            ? `${tileDialogWorker.first_name} ${tileDialogWorker.last_name}`
            : undefined
        }
        ous={ous}
        excludeOuIds={tileDialogWorkerOuIds}
      />

      {linkDialogOpen && (
        <LinkToLeaderDialog
          key={`link-${selection.size}`}
          open
          onOpenChange={(v) => {
            if (!v) setLinkDialogOpen(false);
          }}
          campaignId={campaignId}
          followerWorkerIds={selection.workerIds()}
          onCompleted={() => {
            selection.clear();
          }}
        />
      )}

      {bulkDialog && (
        <MoveOrCopyWorkersDialog
          key={`${bulkDialog.mode}-${selection.size}`}
          open
          onOpenChange={(v) => {
            if (!v) setBulkDialog(null);
          }}
          campaignId={campaignId}
          refs={selection.refs().map((r) => ({
            workerId: r.workerId,
            fromOuId: r.ouId,
            fromOuType: r.ouId != null ? (ouTypeById.get(r.ouId) ?? null) : null,
          }))}
          mode={bulkDialog.mode}
          ous={ous}
          onCompleted={() => {
            selection.clear();
          }}
        />
      )}

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove workers from unit?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeConfirmDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkRemoveFromUnit}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* CreateAssessmentDialog is mounted in the campaign page so the
          persistent header's "Add assessment" button can open it from any tab. */}

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
          members={splitMembers}
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
          allOus={ous}
          childOuIds={(childrenByParent.get(deleteTargetOu.ou_id) ?? []).map((c) => c.ou_id)}
          workers={deleteUnitWorkers}
          onDeleted={() => {
            setDeleteTargetOu(null);
            selection.clear();
          }}
        />
      )}
    </>
  );
}
