"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
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
import { ouDisplayName, type WallChartOU } from "./types";

export type CopyWorkerToUnitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  workerId: number | null;
  workerName?: string;
  ous: WallChartOU[];
  currentOuIds: number[];
};

export function CopyWorkerToUnitDialog({
  open,
  onOpenChange,
  campaignId,
  workerId,
  workerName,
  ous,
  currentOuIds,
}: CopyWorkerToUnitDialogProps) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [selectedOuId, setSelectedOuId] = useState<string>("");

  const available = useMemo(() => {
    const set = new Set(currentOuIds);
    return ous.filter((o) => !set.has(o.ou_id));
  }, [ous, currentOuIds]);

  const addToUnit = useAuthAwareMutation({
    mutationFn: async () => {
      if (!workerId || !selectedOuId) return;
      const { error } = await supabase.from("campaign_worker_ou").insert({
        ou_id: Number(selectedOuId),
        worker_id: workerId,
        is_primary: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      setSelectedOuId("");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy worker to another unit</DialogTitle>
          <DialogDescription>
            {workerName ? `Add ${workerName} ` : "Add this worker "}
            to an additional organising unit in this campaign. Their primary unit
            doesn’t change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This worker is already in every organising unit for this campaign.
            </p>
          ) : (
            <Select value={selectedOuId} onValueChange={setSelectedOuId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a unit…" />
              </SelectTrigger>
              <SelectContent>
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
            onClick={() => addToUnit.mutate()}
            disabled={!selectedOuId || available.length === 0 || addToUnit.isPending}
          >
            Add to unit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
