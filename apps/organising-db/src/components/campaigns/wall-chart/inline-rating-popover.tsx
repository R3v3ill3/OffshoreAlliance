"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RatingPicker, type RatingPickerValue } from "@/components/campaigns/assessments/rating-picker";
import { useSaveActivityRating } from "@/lib/hooks/useSaveActivityRating";
import { useWallChartAssessmentOptions } from "./assessment-selector";
import type { WallChartAssessmentOption } from "./types";

export type InlineRatingPopoverProps = {
  campaignId: string | number;
  activityId: number;
  activityTitle: string;
  isBinary: boolean;
  workerId: number;
  workerName: string;
  initial: RatingPickerValue;
  disabled?: boolean;
  /** Optional callback to open worker details */
  onOpenDetail?: () => void;
  /** Per-level label overrides for the 1–5 scale. Keys "1"–"5". */
  customLabels?: Record<string, string> | null;
  /** The clickable anchor (typically a rating number chip inside a WorkerTile). */
  children: ReactNode;
};

export function InlineRatingPopover({
  campaignId,
  activityId,
  activityTitle,
  isBinary,
  workerId,
  workerName,
  initial,
  disabled,
  onOpenDetail,
  customLabels,
  children,
}: InlineRatingPopoverProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<RatingPickerValue>(initial);
  const [notes, setNotes] = useState("");

  const save = useSaveActivityRating({
    campaignId,
    onSuccess: () => {
      toast.success(`Rating saved for ${workerName}`);
      setOpen(false);
      setNotes("");
    },
    onError: (err) => {
      toast.error(`Failed to save rating: ${err.message}`);
    },
  });

  const onOpenChange = (next: boolean) => {
    if (next) {
      // Reset to the latest initial value every time the popover opens so
      // repeated quick edits start from the current stored value.
      setValue(initial);
      setNotes("");
    }
    setOpen(next);
  };

  // A value must actually be selected: a row with BOTH rating and
  // binary_value null violates the `car_rating_or_binary_chk` DB constraint
  // (PostgREST 400). To clear a rating, use the delete action in the worker
  // detail sheet.
  const canSave =
    !save.isPending &&
    (isBinary ? value.binary_value !== null : value.rating !== null);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {activityTitle}
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold truncate">{workerName}</p>
            {onOpenDetail && (
              <button
                type="button"
                className="text-[10px] text-primary hover:underline shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onOpenDetail();
                }}
              >
                View details
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rating</Label>
          <RatingPicker
            value={value}
            onChange={setValue}
            isBinary={isBinary}
            customLabels={customLabels}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-xs"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                activityId,
                workerId,
                rating: value.rating,
                binary_value: value.binary_value,
                notes: notes || null,
              })
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// CumulativeRatingPopover — for cumulative-mode tiles.
// Lets the user pick an assessment then set a rating, without opening the
// full worker detail sheet.
// ---------------------------------------------------------------------------

export type CumulativeRatingPopoverProps = {
  campaignId: string | number;
  workerId: number;
  workerName: string;
  onOpenDetail?: () => void;
  /** The clickable trigger (the large rating badge on the tile). */
  children: ReactNode;
};

export function CumulativeRatingPopover({
  campaignId,
  workerId,
  workerName,
  onOpenDetail,
  children,
}: CumulativeRatingPopoverProps) {
  const [open, setOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [value, setValue] = useState<RatingPickerValue>({ rating: null, binary_value: null });
  const [notes, setNotes] = useState("");

  const { data: options = [], isLoading } = useWallChartAssessmentOptions(String(campaignId));

  const selectedOption: WallChartAssessmentOption | undefined = options.find(
    (o) => String(o.activity_id) === selectedActivityId
  );

  const save = useSaveActivityRating({
    campaignId,
    onSuccess: () => {
      toast.success(`Rating saved for ${workerName}`);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(`Failed to save rating: ${err.message}`);
    },
  });

  const onOpenChange = (next: boolean) => {
    if (next) {
      setSelectedActivityId("");
      setValue({ rating: null, binary_value: null });
      setNotes("");
    }
    setOpen(next);
  };

  const handleActivityChange = (val: string) => {
    setSelectedActivityId(val);
    setValue({ rating: null, binary_value: null });
    setNotes("");
  };

  const isBinary = selectedOption?.is_binary ?? false;

  // Same constraint guard as InlineRatingPopover: one of rating /
  // binary_value must be selected or the DB rejects the row with a 400.
  const canSave =
    !save.isPending &&
    selectedOption != null &&
    (isBinary ? value.binary_value !== null : value.rating !== null);

  const withRatings = options.filter((o) => o.last_rated_at != null);
  const withoutRatings = options.filter((o) => o.last_rated_at == null);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold truncate">{workerName}</p>
          {onOpenDetail && (
            <button
              type="button"
              className="text-[10px] text-primary hover:underline shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onOpenDetail();
              }}
            >
              View details
            </button>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Assessment</Label>
          <Select
            value={selectedActivityId}
            onValueChange={handleActivityChange}
            disabled={isLoading || options.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue
                placeholder={
                  isLoading
                    ? "Loading…"
                    : options.length === 0
                      ? "No assessments"
                      : "Select assessment…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {withRatings.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px]">Assessments</SelectLabel>
                  {withRatings.map((opt) => (
                    <SelectItem key={opt.activity_id} value={String(opt.activity_id)}>
                      {opt.title}{opt.is_binary ? " (binary)" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {withoutRatings.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px]">Not yet rated</SelectLabel>
                  {withoutRatings.map((opt) => (
                    <SelectItem key={opt.activity_id} value={String(opt.activity_id)}>
                      {opt.title}{opt.is_binary ? " (binary)" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
        {selectedOption && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Rating</Label>
              <RatingPicker
                value={value}
                onChange={setValue}
                isBinary={isBinary}
                customLabels={selectedOption?.rating_labels}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() => {
              if (!selectedOption) return;
              save.mutate({
                activityId: selectedOption.activity_id,
                workerId,
                rating: value.rating,
                binary_value: value.binary_value,
                notes: notes || null,
              });
            }}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
