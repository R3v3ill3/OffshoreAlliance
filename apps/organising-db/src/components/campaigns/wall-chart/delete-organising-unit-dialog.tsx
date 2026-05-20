"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import {
  getReassignmentTargetOus,
  ouTargetLabel,
  type OuRowForReassignment,
} from "@/lib/campaign/ou-reassignment-targets";
import type { WallChartOU } from "./types";

const UNASSIGNED_VALUE = "__unassigned__";

export type DeleteUnitWorker = {
  worker_id: number;
  label: string;
  is_primary?: boolean;
};

export type DeleteOrganisingUnitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | number;
  unit: Pick<
    WallChartOU,
    "ou_id" | "name" | "ou_type" | "parent_ou_id" | "ou_group_id" | "is_group_container"
  >;
  allOus: OuRowForReassignment[];
  childOuIds?: number[];
  workers: DeleteUnitWorker[];
  onDeleted?: () => void;
};

type ReassignMode = "bulk" | "individual";

export function DeleteOrganisingUnitDialog({
  open,
  onOpenChange,
  campaignId,
  unit,
  allOus,
  childOuIds = [],
  workers,
  onDeleted,
}: DeleteOrganisingUnitDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const campaignKey = String(campaignId);

  const [reassignMode, setReassignMode] = useState<ReassignMode>("bulk");
  const [bulkTarget, setBulkTarget] = useState<string>("");
  const [perWorkerTarget, setPerWorkerTarget] = useState<Record<number, string>>({});

  const candidateOus = useMemo(
    () => getReassignmentTargetOus(allOus, unit.ou_id),
    [allOus, unit.ou_id]
  );

  const isFromSubUnit = (unit.parent_ou_id ?? null) != null;
  const inGroup = (unit.ou_group_id ?? null) != null;
  const hasChildren = childOuIds.length > 0;
  const needsReassign = workers.length > 0 && !hasChildren;

  useEffect(() => {
    if (!open) return;
    setReassignMode(workers.length > 1 ? "bulk" : "individual");
    setBulkTarget("");
    setPerWorkerTarget({});
  }, [open, unit.ou_id, workers.length]);

  const deleteMutation = useAuthAwareMutation({
    mutationFn: async (reassignments: Map<number, number | null>) => {
      const ouId = unit.ou_id;
      const workerIds = [...reassignments.keys()];

      if (workerIds.length > 0) {
        const { data: sourceRows, error: srcErr } = await supabase
          .from("campaign_worker_ou")
          .select("worker_id, is_primary")
          .eq("ou_id", ouId)
          .in("worker_id", workerIds);
        if (srcErr) throw srcErr;

        const primaryByWorker = new Map<number, boolean>();
        for (const row of sourceRows ?? []) {
          primaryByWorker.set(row.worker_id as number, row.is_primary === true);
        }

        for (const [workerId, toOuId] of reassignments) {
          if (toOuId != null) {
            const wasPrimary = primaryByWorker.get(workerId) === true;
            const { error: insErr } = await supabase.from("campaign_worker_ou").upsert(
              {
                ou_id: toOuId,
                worker_id: workerId,
                assignment_source: "manual",
                is_primary: wasPrimary,
              },
              { onConflict: "ou_id,worker_id", ignoreDuplicates: false }
            );
            if (insErr) throw insErr;

            if (wasPrimary) {
              const { data: campOus, error: ouErr } = await supabase
                .from("campaign_organising_units")
                .select("ou_id")
                .eq("campaign_id", Number(campaignId));
              if (ouErr) throw ouErr;
              const otherOuIds = (campOus ?? [])
                .map((o) => o.ou_id as number)
                .filter((id) => id !== toOuId);
              if (otherOuIds.length > 0) {
                const { error: clrErr } = await supabase
                  .from("campaign_worker_ou")
                  .update({ is_primary: false })
                  .eq("worker_id", workerId)
                  .in("ou_id", otherOuIds);
                if (clrErr) throw clrErr;
              }
            }
          }

          const { error: delErr } = await supabase
            .from("campaign_worker_ou")
            .delete()
            .eq("ou_id", ouId)
            .eq("worker_id", workerId);
          if (delErr) throw delErr;
        }
      }

      const { error: delOuErr } = await supabase
        .from("campaign_organising_units")
        .delete()
        .eq("ou_id", ouId);
      if (delOuErr) throw delOuErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignKey] });
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignKey] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignKey] });
      queryClient.invalidateQueries({ queryKey: ["campaign-unit-rules", campaignKey] });
      onDeleted?.();
      onOpenChange(false);
    },
    onError: (e: Error) => window.alert(e.message || "Could not delete unit"),
  });

  const buildReassignmentMap = (): Map<number, number | null> | null => {
    const map = new Map<number, number | null>();
    if (reassignMode === "bulk") {
      if (!bulkTarget) return null;
      const toOuId = bulkTarget === UNASSIGNED_VALUE ? null : Number(bulkTarget);
      for (const w of workers) {
        map.set(w.worker_id, toOuId);
      }
      return map;
    }
    for (const w of workers) {
      const target = perWorkerTarget[w.worker_id];
      if (!target) return null;
      map.set(w.worker_id, target === UNASSIGNED_VALUE ? null : Number(target));
    }
    return map;
  };

  const reassignmentsReady = useMemo(() => {
    if (!needsReassign) return true;
    if (reassignMode === "bulk") return Boolean(bulkTarget);
    return workers.every((w) => Boolean(perWorkerTarget[w.worker_id]));
  }, [needsReassign, reassignMode, bulkTarget, perWorkerTarget, workers]);

  const handleConfirmDelete = () => {
    if (hasChildren) return;
    if (!needsReassign) {
      deleteMutation.mutate(new Map());
      return;
    }
    const map = buildReassignmentMap();
    if (!map) return;
    deleteMutation.mutate(map);
  };

  const targetHint = isFromSubUnit
    ? "Only sibling sub-units in the same parent are shown."
    : inGroup
      ? "Only other units in the same group are shown."
      : unit.ou_type && unit.ou_type !== "custom"
        ? `Only ${(unit.ou_type ?? "").replace(/_/g, " ")} units are shown.`
        : "All eligible organising units are shown.";

  const unitTitle =
    unit.name?.trim() || `${(unit.ou_type ?? "unit").replace(/_/g, " ")} #${unit.ou_id}`;

  if (!open) return null;

  if (hasChildren) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot delete unit yet</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{unitTitle}</strong> has {childOuIds.length} sub-unit
              {childOuIds.length === 1 ? "" : "s"}. Delete or reassign workers in those sub-units
              first, then delete the sub-units before removing this unit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (!needsReassign) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organising unit?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{unitTitle}</strong>? This cannot be undone. Assignment
              rules for this unit will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete unit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete unit and reassign workers</DialogTitle>
          <DialogDescription>
            <strong>{unitTitle}</strong> has {workers.length}{" "}
            {workers.length === 1 ? "worker" : "workers"} assigned. Choose where each should go
            before the unit is removed. {targetHint}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Workers stay in the campaign. &quot;Unassigned&quot; only removes them from this unit;
            other unit memberships are kept.
          </p>
        </div>

        <div className="space-y-4 py-1">
          {workers.length > 1 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Reassignment</Label>
              <RadioGroup
                value={reassignMode}
                onValueChange={(v) => setReassignMode(v as ReassignMode)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="bulk" id="reassign-bulk" />
                  <Label htmlFor="reassign-bulk" className="font-normal cursor-pointer">
                    Same destination for all workers
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="individual" id="reassign-individual" />
                  <Label htmlFor="reassign-individual" className="font-normal cursor-pointer">
                    Choose destination per worker
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {reassignMode === "bulk" ? (
            <TargetSelect
              value={bulkTarget}
              onValueChange={setBulkTarget}
              candidateOus={candidateOus}
            />
          ) : (
            <ScrollArea className="max-h-56 rounded-md border">
              <ul className="divide-y">
                {workers.map((w) => (
                  <li
                    key={w.worker_id}
                    className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center"
                  >
                    <span className="text-sm font-medium shrink-0 sm:w-40 truncate" title={w.label}>
                      {w.label}
                      {w.is_primary ? (
                        <span className="text-muted-foreground font-normal"> (primary)</span>
                      ) : null}
                    </span>
                    <TargetSelect
                      className="flex-1"
                      value={perWorkerTarget[w.worker_id] ?? ""}
                      onValueChange={(v) =>
                        setPerWorkerTarget((prev) => ({ ...prev, [w.worker_id]: v }))
                      }
                      candidateOus={candidateOus}
                    />
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reassignmentsReady || deleteMutation.isPending}
            onClick={handleConfirmDelete}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete unit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetSelect({
  value,
  onValueChange,
  candidateOus,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  candidateOus: OuRowForReassignment[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Choose destination…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED_VALUE}>Unassigned (remove from this unit only)</SelectItem>
        {candidateOus.map((o) => (
          <SelectItem key={o.ou_id} value={String(o.ou_id)}>
            {ouTargetLabel(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
