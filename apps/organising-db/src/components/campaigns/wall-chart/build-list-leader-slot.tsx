"use client";

import { useState } from "react";
import { Crown, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { CampaignOrganiserSelect } from "@/components/campaigns/campaign-organiser-select";
import {
  DND_MIME_TYPE,
  parseDragPayload,
} from "./dnd";

export type LeaderSlotWorker = {
  worker_id: number;
  first_name: string;
  last_name: string;
};

export type LeaderSlotProps = {
  /** Currently chosen leader worker (if any). */
  workerLeader: LeaderSlotWorker | null;
  /** Currently chosen organiser leader picker value (CampaignOrganiserSelect format). */
  organiserPickerValue: string;
  onOrganiserPickerChange: (next: string) => void;
  /** Called when a worker tile is dropped (whether from list or wall chart). */
  onAcceptWorker: (workerId: number) => void;
  /** Called when the existing leader is cleared. */
  onClearWorkerLeader: () => void;
  disabled?: boolean;
};

/**
 * Leader slot for the build-list panel (visible only when purpose === 'task').
 *
 * Accepts worker drops via the standard wall-chart MIME, so the user can drag
 * a worker either from the list itself (promoting it to leader) or directly
 * from a unit card in the wall chart (without first adding to the list).
 *
 * As a fallback, an organiser picker dropdown lets the user nominate a staff
 * organiser instead of a worker.
 */
export function BuildListLeaderSlot({
  workerLeader,
  organiserPickerValue,
  onOrganiserPickerChange,
  onAcceptWorker,
  onClearWorkerLeader,
  disabled,
}: LeaderSlotProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!e.dataTransfer.types.includes(DND_MIME_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragOver) setDragOver(true);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    const raw = e.dataTransfer.getData(DND_MIME_TYPE);
    if (!raw) return;
    const payload = parseDragPayload(raw);
    if (!payload || payload.refs.length === 0) return;
    e.preventDefault();
    setDragOver(false);
    // Only the first ref is used as the leader.
    onAcceptWorker(payload.refs[0].workerId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Crown className="h-3 w-3" /> Task leader
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded border-2 border-dashed px-3 py-2 text-xs transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : workerLeader
              ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20"
              : "border-muted-foreground/30 bg-muted/30"
        )}
      >
        {workerLeader ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">
                {workerLeader.first_name} {workerLeader.last_name}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Worker leader · drag another worker here to replace
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={onClearWorkerLeader}
              disabled={disabled}
              aria-label="Clear leader"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground italic">
            Drag a worker tile here to set the task leader, or pick an organiser below.
          </p>
        )}
      </div>

      {!workerLeader && (
        <CampaignOrganiserSelect
          label="Organiser leader (alternative)"
          value={organiserPickerValue}
          onChange={onOrganiserPickerChange}
          allowNone
          autoDefaultToCurrentUser={false}
          showStaffHint={false}
        />
      )}
    </div>
  );
}
