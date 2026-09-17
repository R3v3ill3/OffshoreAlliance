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
import { indexUnitsById, nestingParentOf } from "@/lib/campaign/groups/derive-group-tree";
import { humanizeOuType, ouDisplayName, type WallChartOU } from "./types";
import { useMoveWorkersMutation } from "./move-worker-mutation";
import {
  ALREADY_IN_GROUP_MESSAGE,
  structureErrorMessage,
} from "@/lib/campaign/structure-error-message";
import { toast } from "sonner";

/** WP2.4 (wp2.4.md §3.13): a campaign group, for labelling and same-group locking. */
export type MoveDialogGroup = { group_id: number; name: string };

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
  /**
   * WP2.4 (wp2.4.md §3.13): the campaign's groups. When given, every target
   * is labelled "Group › Unit" and, in copy mode, a target in a group where
   * the worker already holds a unit (one of `excludeOuIds`) is disabled with
   * the K1 sentence, because the structure API would refuse it (C-c). Absent
   * on the legacy path, which is unchanged.
   */
  groups?: MoveDialogGroup[];
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
  groups,
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

  // WP2.4 group awareness: only when the caller passed `groups`.
  const groupNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of groups ?? []) m.set(g.group_id, g.name);
    return m;
  }, [groups]);
  const lockedGroupIds = useMemo(() => {
    const s = new Set<number>();
    if (!groups || mode !== "copy") return s;
    const excl = new Set(excludeOuIds);
    for (const o of ous) {
      if (excl.has(o.ou_id) && o.group_id != null) s.add(o.group_id);
    }
    return s;
  }, [groups, mode, ous, excludeOuIds]);
  const targetLabel = (o: WallChartOU) => {
    const groupName = o.group_id != null ? groupNameById.get(o.group_id) : undefined;
    return groupName ? `${groupName} › ${ouDisplayName(o)}` : ouDisplayName(o);
  };
  /**
   * WP2.4c (wp2.4c.md §3.10, AP-a): a NESTED target is offered only once the
   * worker is in its root. `placements.move` places the parent with `skip`, so
   * copying onto a shift under KGP while the worker sits on Barrow would leave
   * Barrow in place and manufacture the NC-a orphan shape the chart hides.
   * Only under `groups` (the v2 callers); the legacy path passes none.
   */
  const ouById = useMemo(() => indexUnitsById(ous), [ous]);
  const nestedLock = useMemo(() => {
    const m = new Map<number, string>();
    if (!groups) return m;
    const held = new Set(excludeOuIds);
    for (const o of ous) {
      const parentId = nestingParentOf(o, ouById);
      if (parentId == null) continue;
      const parent = ouById.get(parentId);
      if (!parent || parent.group_id == null) continue;
      if (held.has(parent.ou_id)) continue;
      // A worker with no row in the root's group is fine: the RPC's
      // `keepInParent` creates it. One on ANOTHER unit of that group is not.
      const elsewhere = ous.some(
        (u) => u.group_id === parent.group_id && u.ou_id !== parent.ou_id && held.has(u.ou_id)
      );
      if (elsewhere) m.set(o.ou_id, `Move to ${ouDisplayName(parent)} first`);
    }
    return m;
  }, [groups, ous, ouById, excludeOuIds]);
  const isLocked = (o: WallChartOU) => o.group_id != null && lockedGroupIds.has(o.group_id);
  const lockSentence = (o: WallChartOU): string | null =>
    isLocked(o) ? ALREADY_IN_GROUP_MESSAGE : (nestedLock.get(o.ou_id) ?? null);
  const anyLocked = groups ? available.some(isLocked) : false;

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
        // Announce a failed move/copy and keep the dialog open so the user can
        // retry or cancel; nothing else reads moveMutation.error. A same-group
        // copy is refused by the structure API (wp2.2.md §3.4 C-c, K1) and a
        // legacy exclusivity rule (D17) is surfaced readably, not as SQL.
        onError: (err) => {
          toast.error(
            structureErrorMessage(
              err,
              `${mode === "move" ? "Moving" : "Copying"} the workers failed.`
            )
          );
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
                {available.map((o) => {
                  const locked = lockSentence(o);
                  return (
                    <SelectItem key={o.ou_id} value={String(o.ou_id)} disabled={locked !== null}>
                      {targetLabel(o)}
                      {locked ? ` — ${locked}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          {anyLocked && (
            <p className="text-xs text-muted-foreground">{ALREADY_IN_GROUP_MESSAGE}</p>
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
  /** WP2.4 (§3.13): passed through; see `MoveOrCopyWorkersDialogProps.groups`. */
  groups?: MoveDialogGroup[];
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
      groups={props.groups}
    />
  );
}
