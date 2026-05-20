"use client";

import { useMemo, useState } from "react";
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
import { humanizeOuType, ouDisplayName, type WallChartOU } from "./types";
import { useMoveWorkersMutation } from "./move-worker-mutation";

export type MoveMode = "move" | "copy";

export type MoveOrCopyWorkersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  /**
   * One ref per (ouId, workerId) assignment to act on. For a single-worker
   * right-click, pass one ref. For a multi-select bulk move, pass the whole
   * selection. `fromOuId: null` means the assignment came from Unassigned.
   * `fromOuType` is used to restrict move targets to same-dimension units.
   */
  refs: { workerId: number; fromOuId: number | null; fromOuType?: string | null }[];
  /** Initial mode; the user can still toggle inside the dialog. */
  mode?: MoveMode;
  /** When true, lock to this mode and hide the toggle (used by the right-click Copy flow). */
  lockMode?: boolean;
  /** Labels for the worker(s) — shown in the description. */
  workerLabel?: string;
  ous: WallChartOU[];
  /** Restrict the target selector to OU ids the dragged worker(s) aren't already in. */
  excludeOuIds?: number[];
  /** Called with the result of the move/copy for surfacing a toast-style message. */
  onCompleted?: (result: { inserted: number; deleted: number; skipped: number }) => void;
};

export function MoveOrCopyWorkersDialog({
  open,
  onOpenChange,
  campaignId,
  refs,
  mode: initialMode = "move",
  lockMode,
  workerLabel,
  ous,
  excludeOuIds = [],
  onCompleted,
}: MoveOrCopyWorkersDialogProps) {
  // The parent re-mounts this dialog via `key` when a new bulk operation
  // starts, so initial state is taken directly from props (no reset effect).
  const [mode, setMode] = useState<MoveMode>(initialMode);
  const [selectedOuId, setSelectedOuId] = useState<string>("");

  // In move mode, restrict targets to the same ou_type dimension as the source
  // units, so users can't accidentally move workers across incompatible dimensions
  // (e.g. from a worksite unit into an employer unit).
  // "custom" units are unconstrained. Copy mode is always unrestricted.
  const sourceDimensionType = useMemo(() => {
    const nonCustomTypes = refs
      .map((r) => r.fromOuType)
      .filter((t): t is string => !!t && t !== "custom");
    if (nonCustomTypes.length === 0) return null;
    const unique = [...new Set(nonCustomTypes)];
    return unique.length === 1 ? unique[0] : null; // null = mixed source types
  }, [refs]);

  const available = useMemo(() => {
    const excl = new Set(excludeOuIds);
    // Never offer group containers as assignment targets — workers must be
    // assigned to the individual member units within a group.
    const candidates = ous.filter(
      (o) => !excl.has(o.ou_id) && !o.is_group_container
    );
    // When moving within a structured dimension, only offer same-type targets.
    if (
      mode === "move" &&
      sourceDimensionType !== null &&
      sourceDimensionType !== "custom"
    ) {
      return candidates.filter((o) => o.ou_type === sourceDimensionType);
    }
    return candidates;
  }, [ous, excludeOuIds, mode, sourceDimensionType]);

  const moveMutation = useMoveWorkersMutation(campaignId);
  const hasUnassignedTarget = mode === "move";
  const hasTargetOptions = available.length > 0 || hasUnassignedTarget;

  const submit = () => {
    if (refs.length === 0) return;
    const toOuId = selectedOuId === "__unassigned__" ? null : Number(selectedOuId);
    if (selectedOuId !== "__unassigned__" && !selectedOuId) return;
    moveMutation.mutate(
      { refs, toOuId, mode },
      {
        onSuccess: (result) => {
          onCompleted?.(result);
          onOpenChange(false);
        },
      }
    );
  };

  const workerCount = new Set(refs.map((r) => r.workerId)).size;
  const description = workerLabel
    ? `${mode === "move" ? "Move" : "Copy"} ${workerLabel} to another organising unit.`
    : `${mode === "move" ? "Move" : "Copy"} ${workerCount} ${
        workerCount === 1 ? "worker" : "workers"
      } to another organising unit.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "move" ? "Move" : "Copy"} {workerCount === 1 ? "worker" : `${workerCount} workers`}
          </DialogTitle>
          <DialogDescription>
            {description}
            {mode === "copy" && " Their existing unit memberships stay as-is."}
            {mode === "move" && " They will be removed from their current unit."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {!lockMode && (
            <div className="inline-flex rounded border bg-background overflow-hidden">
              <Button
                type="button"
                variant={mode === "move" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-7 px-3 text-xs"
                onClick={() => setMode("move")}
                aria-pressed={mode === "move"}
              >
                Move
              </Button>
              <Button
                type="button"
                variant={mode === "copy" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-7 px-3 text-xs"
                onClick={() => setMode("copy")}
                aria-pressed={mode === "copy"}
              >
                Copy
              </Button>
            </div>
          )}

          {sourceDimensionType && mode === "move" && (
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <strong>{humanizeOuType(sourceDimensionType)}</strong> units only —
              moves are restricted to within the same dimension. Switch to{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setMode("copy")}
              >
                Copy
              </button>{" "}
              to add workers to a different dimension.
            </p>
          )}
          {available.length === 0 && mode === "copy" ? (
            <p className="text-sm text-muted-foreground">
              These workers are already in every organising unit for this campaign.
            </p>
          ) : !hasTargetOptions ? (
            <p className="text-sm text-muted-foreground">
              No other {sourceDimensionType ? humanizeOuType(sourceDimensionType) + " " : ""}units
              are available to move to.
            </p>
          ) : (
            <Select value={selectedOuId} onValueChange={setSelectedOuId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a target unit…" />
              </SelectTrigger>
              <SelectContent>
                {mode === "move" && (
                  <SelectItem value="__unassigned__">Unassigned (remove from all units)</SelectItem>
                )}
                {available.map((o) => (
                  <SelectItem key={o.ou_id} value={String(o.ou_id)}>
                    {ouDisplayName(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              !selectedOuId ||
              (mode === "copy" && available.length === 0) ||
              moveMutation.isPending
            }
          >
            {moveMutation.isPending ? "Working…" : mode === "move" ? "Move" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Backwards-compatible shim that matches the original single-worker Copy flow.
 * Used by the worker-tile right-click, worker-detail-sheet "Add to another unit"
 * button, etc. Those callsites continue to pass a single workerId + currentOuIds.
 */
export type CopyWorkerToUnitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  workerId: number | null;
  workerName?: string;
  ous: WallChartOU[];
  currentOuIds: number[];
};

export function CopyWorkerToUnitDialog(props: CopyWorkerToUnitDialogProps) {
  const refs = props.workerId != null ? [{ workerId: props.workerId, fromOuId: null }] : [];
  return (
    <MoveOrCopyWorkersDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      campaignId={props.campaignId}
      refs={refs}
      mode="copy"
      lockMode
      workerLabel={props.workerName}
      ous={props.ous}
      excludeOuIds={props.currentOuIds}
    />
  );
}
