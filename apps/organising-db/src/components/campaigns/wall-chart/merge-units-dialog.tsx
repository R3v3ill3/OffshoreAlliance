"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ouDisplayName, type WallChartOU } from "./types";

export type MergeUnitsDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaignId: string;
  /**
   * The pre-selected duplicate units to merge. The dialog lets the user pick
   * which one survives; all others have their workers re-assigned to the
   * survivor and are then deleted.
   */
  ous: WallChartOU[];
  /** Worker counts per ou_id, for display. */
  workerCountByOu: Map<number, number>;
};

export function MergeUnitsDialog({
  open,
  onOpenChange,
  campaignId,
  ous,
  workerCountByOu,
}: MergeUnitsDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [survivorId, setSurvivorId] = useState<number | null>(() => ous[0]?.ou_id ?? null);

  const survivor = useMemo(() => ous.find((o) => o.ou_id === survivorId) ?? null, [ous, survivorId]);
  const toDelete = useMemo(() => ous.filter((o) => o.ou_id !== survivorId), [ous, survivorId]);

  const totalWorkers = useMemo(
    () => [...new Set(ous.flatMap((o) => Array.from({ length: workerCountByOu.get(o.ou_id) ?? 0 })))].length,
    [ous, workerCountByOu]
  );

  const merge = useAuthAwareMutation({
    mutationFn: async () => {
      if (!survivor) throw new Error("No survivor selected");
      const deleteIds = toDelete.map((o) => o.ou_id);
      if (deleteIds.length === 0) return;

      // Re-assign workers from units being deleted to the survivor.
      for (const deleteId of deleteIds) {
        // Get workers in this unit.
        const { data: assignments, error: fetchErr } = await supabase
          .from("campaign_worker_ou")
          .select("worker_id, is_primary")
          .eq("ou_id", deleteId);
        if (fetchErr) throw fetchErr;

        for (const a of assignments ?? []) {
          // Upsert into survivor — ignore if already there.
          await supabase
            .from("campaign_worker_ou")
            .upsert(
              { ou_id: survivor.ou_id, worker_id: a.worker_id, is_primary: a.is_primary ?? false, assignment_source: "manual" },
              { onConflict: "ou_id,worker_id", ignoreDuplicates: true }
            );
        }

        // Delete the source unit (cascade deletes its campaign_worker_ou rows).
        const { error: delErr } = await supabase
          .from("campaign_organising_units")
          .delete()
          .eq("ou_id", deleteId);
        if (delErr) throw delErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      onOpenChange(false);
    },
    onError: (e: Error) => window.alert(e.message || "Merge failed"),
  });

  if (ous.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate units</DialogTitle>
          <DialogDescription>
            Choose which unit survives. Workers from all other selected units will be
            re-assigned to the survivor, then those units will be deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Merging {ous.length} units · {totalWorkers} distinct worker
            {totalWorkers !== 1 ? "s" : ""} across all units will be assigned to the survivor.
          </p>

          <RadioGroup
            value={String(survivorId ?? "")}
            onValueChange={(v) => setSurvivorId(Number(v))}
            className="space-y-2"
          >
            {ous.map((ou) => {
              const count = workerCountByOu.get(ou.ou_id) ?? 0;
              const isSurvivor = ou.ou_id === survivorId;
              return (
                <Label
                  key={ou.ou_id}
                  htmlFor={`merge-survivor-${ou.ou_id}`}
                  className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    isSurvivor ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value={String(ou.ou_id)} id={`merge-survivor-${ou.ou_id}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ouDisplayName(ou)}</p>
                    <p className="text-xs text-muted-foreground">
                      {(ou as WallChartOU & { ou_type?: string }).ou_type?.replace(/_/g, " ")} · OU #{ou.ou_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={isSurvivor ? "default" : "secondary"} className="text-[10px]">
                      {count} worker{count !== 1 ? "s" : ""}
                    </Badge>
                    {isSurvivor && (
                      <Badge variant="outline" className="text-[10px] text-primary border-primary">
                        survivor
                      </Badge>
                    )}
                  </div>
                </Label>
              );
            })}
          </RadioGroup>

          {toDelete.length > 0 && (
            <p className="text-xs text-muted-foreground border-t pt-3">
              Will delete: {toDelete.map((o) => ouDisplayName(o)).join(", ")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => merge.mutate()}
            disabled={merge.isPending || !survivor || toDelete.length === 0}
          >
            {merge.isPending ? "Merging…" : `Merge (keep ${survivor ? ouDisplayName(survivor) : "—"})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
