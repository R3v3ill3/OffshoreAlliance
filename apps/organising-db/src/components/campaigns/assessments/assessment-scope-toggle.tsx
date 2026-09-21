"use client";

/**
 * WP3.8 (wp3.8.md §3.7 "Assessments tab", UI-a) — "Share with family
 * campaigns", the one control that flips `campaign_activities.scope` on an
 * OWNED assessment of a campaign that has no parent.
 *
 * Writes only `{ scope }`, on the owner's row (`.eq("activity_id").eq("campaign_id")`),
 * invalidates the family-keyed readers and emits `assessment_scope_changed`.
 * Turning sharing off while children exist confirms first: the activity
 * disappears from every child list on its next fetch, and the ratings
 * recorded from the children stay on this row (RAT-a).
 *
 * Enforced in the UI for writers of the owner (wp3.8.md §3.4, recorded
 * looseness: the update policy is role-only).
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { trackAssessmentScopeChanged } from "@/lib/analytics/events";
import { FAMILY_SCOPE, type ActivityScope } from "@/lib/campaign/families";
import { WALL_CHART_ASSESSMENT_OPTIONS_KEY } from "@/components/campaigns/wall-chart/assessment-selector";

export type AssessmentScopeToggleProps = {
  campaignId: string;
  activityId: number;
  activityTitle: string;
  scope: ActivityScope;
  /** How many campaigns are part of this one — names the count in the turn-off warning. */
  childCount: number;
  disabled?: boolean;
};

/** Every reader that lists a campaign's assessments; the children read the parent's rows under their own ids. */
export function invalidateAssessmentScopeReaders(
  queryClient: ReturnType<typeof useQueryClient>,
  campaignId: string
): void {
  queryClient.invalidateQueries({ queryKey: ["campaign-activities-family", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["campaign-activities", campaignId] });
  queryClient.invalidateQueries({ queryKey: [WALL_CHART_ASSESSMENT_OPTIONS_KEY, campaignId] });
  queryClient.invalidateQueries({ queryKey: ["wallchart-activities-list", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["wallchart-latest-activity", campaignId] });
}

export function AssessmentScopeToggle({
  campaignId,
  activityId,
  activityTitle,
  scope,
  childCount,
  disabled,
}: AssessmentScopeToggleProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [confirmOff, setConfirmOff] = useState(false);
  const shared = scope === FAMILY_SCOPE;
  const switchId = `assessment-scope-${activityId}`;

  const setScope = useAuthAwareMutation<void, Error, ActivityScope>({
    mutationFn: async (next) => {
      const { error } = await supabase
        .from("campaign_activities")
        .update({ scope: next })
        .eq("activity_id", activityId)
        .eq("campaign_id", Number(campaignId));
      if (error) throw error;
    },
    onSuccess: (_data, next) => {
      invalidateAssessmentScopeReaders(queryClient, campaignId);
      trackAssessmentScopeChanged({
        campaign_id: Number(campaignId),
        activity_id: activityId,
        scope: next,
        child_count: childCount,
      });
      toast.success(
        next === FAMILY_SCOPE
          ? `"${activityTitle}" is now shared with family campaigns`
          : `"${activityTitle}" is no longer shared`
      );
    },
    onError: (err) => {
      toast.error(`Failed to change sharing: ${err.message}`);
    },
  });

  const handleChange = (checked: boolean) => {
    if (setScope.isPending) return;
    if (checked) {
      setScope.mutate(FAMILY_SCOPE);
      return;
    }
    if (childCount > 0) {
      setConfirmOff(true);
      return;
    }
    setScope.mutate("campaign");
  };

  return (
    <>
      <div className="flex items-center gap-1.5 border-l px-2">
        <Switch
          id={switchId}
          className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
          checked={shared}
          onCheckedChange={handleChange}
          disabled={disabled || setScope.isPending}
          aria-label={`Share "${activityTitle}" with family campaigns`}
        />
        <Label htmlFor={switchId} className="text-[10px] text-muted-foreground whitespace-nowrap">
          Share with family campaigns
        </Label>
      </div>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop sharing &ldquo;{activityTitle}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Child campaigns will no longer see this assessment. Ratings recorded from them stay
              here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setScope.isPending}>Keep sharing</AlertDialogCancel>
            <AlertDialogAction
              disabled={setScope.isPending}
              onClick={() => {
                setConfirmOff(false);
                setScope.mutate("campaign");
              }}
            >
              Stop sharing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
