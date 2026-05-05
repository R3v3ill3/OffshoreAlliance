"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RatingPicker, type RatingPickerValue } from "@/components/campaigns/assessments/rating-picker";
import { useSaveActivityRating } from "@/lib/hooks/useSaveActivityRating";

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

  const canSave =
    !save.isPending &&
    (isBinary ? value.binary_value !== null || value.rating === null : true);

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
