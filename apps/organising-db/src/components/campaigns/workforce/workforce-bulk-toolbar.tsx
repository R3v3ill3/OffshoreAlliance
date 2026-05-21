"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Star, ArrowRightLeft } from "lucide-react";
import {
  RatingPicker,
  type RatingPickerValue,
} from "@/components/campaigns/assessments/rating-picker";
import { useAllocateWorkersToOu } from "@/lib/campaign/use-allocate-workers-to-ou";
import { useBatchSaveActivityRatings } from "@/lib/campaign/use-batch-save-activity-ratings";
import {
  ouDisplayName,
  type AssessmentSelection,
  type WallChartAssessmentOption,
  type WallChartOU,
} from "../wall-chart/types";
import { useWallChartAssessmentOptions } from "../wall-chart/assessment-selector";

export type WorkforceBulkToolbarProps = {
  campaignId: string;
  selectedWorkerIds: number[];
  ous: WallChartOU[];
  /** Currently-selected assessment from the list view header; used as the default for "Set rating". */
  defaultAssessment: AssessmentSelection;
  onClearSelection: () => void;
  /** Optional callback fired after a successful bulk action — typically to clear the selection. */
  onActionComplete?: () => void;
};

export function WorkforceBulkToolbar({
  campaignId,
  selectedWorkerIds,
  ous,
  defaultAssessment,
  onClearSelection,
  onActionComplete,
}: WorkforceBulkToolbarProps) {
  const selectedCount = selectedWorkerIds.length;
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 border-b bg-secondary/60 backdrop-blur supports-[backdrop-filter]:bg-secondary/40 flex items-center gap-2 flex-wrap">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onClearSelection}
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5 mr-1" aria-hidden />
        Clear
      </Button>
      <span className="text-xs font-medium">
        {selectedCount} worker{selectedCount === 1 ? "" : "s"} selected
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <SetRatingAction
          campaignId={campaignId}
          selectedWorkerIds={selectedWorkerIds}
          defaultAssessment={defaultAssessment}
          onComplete={onActionComplete}
        />
        <AssignToUnitAction
          campaignId={campaignId}
          selectedWorkerIds={selectedWorkerIds}
          ous={ous}
          onComplete={onActionComplete}
        />
      </div>
    </div>
  );
}

function SetRatingAction({
  campaignId,
  selectedWorkerIds,
  defaultAssessment,
  onComplete,
}: {
  campaignId: string;
  selectedWorkerIds: number[];
  defaultAssessment: AssessmentSelection;
  onComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: assessmentOptions = [] } = useWallChartAssessmentOptions(campaignId);
  const initialActivityId =
    defaultAssessment.kind === "assessment" ? defaultAssessment.activityId : null;
  const [activityId, setActivityId] = useState<number | null>(initialActivityId);
  const [value, setValue] = useState<RatingPickerValue>({ rating: null, binary_value: null });
  const save = useBatchSaveActivityRatings(campaignId);

  const selectedOption: WallChartAssessmentOption | undefined = useMemo(
    () => assessmentOptions.find((o) => o.activity_id === activityId),
    [assessmentOptions, activityId]
  );

  const reset = () => {
    setValue({ rating: null, binary_value: null });
    setActivityId(initialActivityId);
  };

  const onOpenChange = (next: boolean) => {
    if (next) reset();
    setOpen(next);
  };

  const canSave =
    !save.isPending &&
    activityId != null &&
    selectedOption != null &&
    (selectedOption.is_binary ? value.binary_value !== null : value.rating !== null);

  const handleSave = () => {
    if (!selectedOption || activityId == null) return;
    save.mutate(
      {
        activityId,
        workerIds: selectedWorkerIds,
        rating: value.rating,
        binaryValue: value.binary_value,
        source: "staff-bulk",
      },
      {
        onSuccess: () => {
          toast.success(
            `Saved ${selectedWorkerIds.length} rating${selectedWorkerIds.length === 1 ? "" : "s"} for ${selectedOption.title}.`
          );
          setOpen(false);
          onComplete?.();
        },
        onError: (err) => {
          toast.error(`Failed to save ratings: ${err.message}`);
        },
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs">
          <Star className="h-3.5 w-3.5 mr-1" aria-hidden />
          Set rating
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Assessment
            </Label>
            <Select
              value={activityId != null ? String(activityId) : ""}
              onValueChange={(v) => {
                setActivityId(Number(v));
                setValue({ rating: null, binary_value: null });
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Pick an assessment…" />
              </SelectTrigger>
              <SelectContent>
                {assessmentOptions.length === 0 ? (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">No assessments in this campaign</SelectLabel>
                  </SelectGroup>
                ) : (
                  assessmentOptions.map((o) => (
                    <SelectItem key={o.activity_id} value={String(o.activity_id)}>
                      {o.title}
                      {o.is_binary ? " (binary)" : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          {selectedOption && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Rating to apply
              </Label>
              <RatingPicker
                value={value}
                onChange={setValue}
                isBinary={selectedOption.is_binary}
                customLabels={selectedOption.rating_labels}
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
              className="h-7 text-xs"
            >
              {save.isPending
                ? "Saving…"
                : `Apply to ${selectedWorkerIds.length}`}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AssignToUnitAction({
  campaignId,
  selectedWorkerIds,
  ous,
  onComplete,
}: {
  campaignId: string;
  selectedWorkerIds: number[];
  ous: WallChartOU[];
  onComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ouId, setOuId] = useState<number | null>(null);
  const allocate = useAllocateWorkersToOu(campaignId);

  // Group containers can't be assigned to directly.
  const assignableOus = useMemo(
    () => ous.filter((o) => !o.is_group_container),
    [ous]
  );

  const handleSave = () => {
    if (ouId == null) return;
    const target = ous.find((o) => o.ou_id === ouId);
    allocate.mutate(
      { ouId, workerIds: selectedWorkerIds },
      {
        onSuccess: (res) => {
          toast.success(
            `Allocated ${res?.inserted ?? selectedWorkerIds.length} worker${(res?.inserted ?? selectedWorkerIds.length) === 1 ? "" : "s"} to ${target ? ouDisplayName(target) : "unit"}.`
          );
          setOpen(false);
          setOuId(null);
          onComplete?.();
        },
        onError: (err) => {
          toast.error(`Failed to allocate workers: ${err.message}`);
        },
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs">
          <ArrowRightLeft className="h-3.5 w-3.5 mr-1" aria-hidden />
          Assign to unit
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Target organising unit
            </Label>
            <Select
              value={ouId != null ? String(ouId) : ""}
              onValueChange={(v) => setOuId(Number(v))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select a unit…" />
              </SelectTrigger>
              <SelectContent>
                {assignableOus.length === 0 ? (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">No units in this campaign</SelectLabel>
                  </SelectGroup>
                ) : (
                  assignableOus.map((o) => (
                    <SelectItem key={o.ou_id} value={String(o.ou_id)}>
                      {ouDisplayName(o)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Workers stay in any units they already belong to. Primary unit
              isn&apos;t changed by a bulk allocation.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={ouId == null || allocate.isPending}
              className="h-7 text-xs"
            >
              {allocate.isPending
                ? "Allocating…"
                : `Allocate ${selectedWorkerIds.length}`}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
