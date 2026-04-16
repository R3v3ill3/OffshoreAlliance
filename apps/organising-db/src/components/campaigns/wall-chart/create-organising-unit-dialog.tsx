"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CampaignOuType } from "@/types/database";

const OU_TYPES: CampaignOuType[] = [
  "shift",
  "department",
  "network",
  "job_type",
  "worksite",
  "ethnic_community",
  "crew_rotation",
  "accommodation",
  "work_area",
  "custom",
];

export function CreateOrganisingUnitDialog({
  open,
  onOpenChange,
  campaignId,
  displayOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  displayOrder: number;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [ouType, setOuType] = useState<CampaignOuType>("shift");
  const [estimate, setEstimate] = useState("");

  const createOu = useAuthAwareMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        name: name.trim(),
        ou_type: ouType,
        display_order: displayOrder,
        source: "manual",
      };
      if (estimate.trim()) {
        const n = Number(estimate);
        if (!Number.isNaN(n) && n >= 0) payload.total_workers_estimated = n;
      }
      const { error } = await supabase.from("campaign_organising_units").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      onOpenChange(false);
      setName("");
      setOuType("shift");
      setEstimate("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New organising unit</DialogTitle>
          <DialogDescription>
            Creates a unit for this campaign. You can refine details later on the Structure tab.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="wc-new-ou-name">Name</Label>
            <Input
              id="wc-new-ou-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Shift A"
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={ouType} onValueChange={(v) => setOuType(v as CampaignOuType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OU_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wc-new-ou-est">Worker estimate (optional)</Label>
            <Input
              id="wc-new-ou-est"
              type="number"
              min={0}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="e.g. 12"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || createOu.isPending}
            onClick={() => createOu.mutate()}
          >
            {createOu.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
