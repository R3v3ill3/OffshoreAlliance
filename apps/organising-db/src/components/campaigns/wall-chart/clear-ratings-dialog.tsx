"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ClearRatingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  workerIds: number[];
  onSuccess?: () => void;
};

export function ClearRatingsDialog({
  open,
  onOpenChange,
  campaignId,
  workerIds,
  onSuccess,
}: ClearRatingsDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");

  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ["campaign-activities", campaignId, "assessment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("activity_id, title, is_binary")
        .eq("campaign_id", campaignId)
        .eq("activity_kind", "assessment")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { activity_id: number; title: string; is_binary: boolean | null }[];
    },
    enabled: open,
  });

  const clearMutation = useAuthAwareMutation<void, Error, void>({
    mutationFn: async () => {
      if (!selectedActivityId || workerIds.length === 0) return;
      const activityId = Number(selectedActivityId);
      const { error } = await supabase
        .from("campaign_activity_ratings")
        .delete()
        .in("worker_id", workerIds)
        .eq("activity_id", activityId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings-dist", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-assessments-rated", campaignId] });
      toast.success(
        `Ratings cleared for ${workerIds.length} ${workerIds.length === 1 ? "worker" : "workers"}`
      );
      setSelectedActivityId("");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(`Failed to clear ratings: ${(err as Error).message}`);
    },
  });

  const selectedAssessment = assessments.find(
    (a) => String(a.activity_id) === selectedActivityId
  );

  function handleClose() {
    if (clearMutation.isPending) return;
    setSelectedActivityId("");
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear ratings for selected workers</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete all ratings (across all phases) for{" "}
            <strong>
              {workerIds.length} {workerIds.length === 1 ? "worker" : "workers"}
            </strong>{" "}
            on the chosen assessment. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1 py-2">
          <Label className="text-xs">Assessment to clear</Label>
          <Select
            value={selectedActivityId}
            onValueChange={setSelectedActivityId}
            disabled={isLoading || assessments.length === 0}
          >
            <SelectTrigger className="h-8">
              <SelectValue
                placeholder={
                  isLoading
                    ? "Loading assessments…"
                    : assessments.length === 0
                      ? "No assessments in this campaign"
                      : "Choose an assessment…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-[10px]">Assessments</SelectLabel>
                {assessments.map((a) => (
                  <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                    {a.title}
                    {a.is_binary ? " (binary)" : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {selectedAssessment && (
            <p className="text-[11px] text-muted-foreground pt-1">
              All existing ratings for &ldquo;{selectedAssessment.title}&rdquo; will be removed for
              the selected workers.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose} disabled={clearMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!selectedActivityId || clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            {clearMutation.isPending ? "Clearing…" : "Clear ratings"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
