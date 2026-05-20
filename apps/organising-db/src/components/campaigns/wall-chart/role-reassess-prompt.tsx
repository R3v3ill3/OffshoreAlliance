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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { WallChartRoleType } from "./types";

const ACTIVIST_ROLE_TYPE_ID = 8;

export type RoleReassessPromptProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: number;
  workerName: string;
  campaignId: string;
  currentRoleName: string | null;
  roleTypes: WallChartRoleType[];
};

export function RoleReassessPrompt({
  open,
  onOpenChange,
  workerId,
  workerName,
  campaignId,
  currentRoleName,
  roleTypes,
}: RoleReassessPromptProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState<string>(String(ACTIVIST_ROLE_TYPE_ID));

  function handleOpenChange(next: boolean) {
    if (next) setRoleId(String(ACTIVIST_ROLE_TYPE_ID));
    onOpenChange(next);
  }

  const updateRole = useAuthAwareMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("workers")
        .update({ member_role_type_id: Number(roleId) })
        .eq("worker_id", workerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-member-ids", campaignId] });
      toast.success("Role updated");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Failed to update role: ${(err as Error).message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reassess member role?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{workerName}</span> just became a
            task-list leader. Their current role is{" "}
            <span className="font-medium text-foreground">
              {currentRoleName ?? "None"}
            </span>
            . Update to better reflect their role in the campaign, or skip to leave it unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">New role</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleTypes.map((r) => (
                <SelectItem key={r.role_type_id} value={String(r.role_type_id)}>
                  {r.display_name ?? r.role_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button onClick={() => updateRole.mutate()} disabled={updateRole.isPending}>
            {updateRole.isPending ? "Saving…" : "Update role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
