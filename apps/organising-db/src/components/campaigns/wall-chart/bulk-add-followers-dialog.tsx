"use client";

/**
 * Bulk-add followers to a given leader within a specific campaign.
 *
 * As of Phase 3 of the leader-tasking work the picker UI lives in
 * `../shared/worker-picker.tsx` so it can be re-used by the task-list
 * stepper. This file is now a thin wrapper that wires the picker's
 * selection up to the leader-link mutation.
 */

import { WorkerPickerDialog } from "../shared/worker-picker";
import { useBulkCreateLeaderLinks } from "./use-leader-links";

export type BulkAddFollowersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  leaderWorkerId: number;
  leaderName?: string;
  onCompleted?: (inserted: number) => void;
};

export function BulkAddFollowersDialog({
  open,
  onOpenChange,
  campaignId,
  leaderWorkerId,
  leaderName,
  onCompleted,
}: BulkAddFollowersDialogProps) {
  const bulkCreate = useBulkCreateLeaderLinks(campaignId);

  return (
    <WorkerPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      campaignId={campaignId}
      leaderWorkerId={leaderWorkerId}
      leaderName={leaderName}
      title={`Add workers to ${leaderName ?? "leader"}`}
      description="Pick one or more workers in this campaign to link as followers. Workers already linked don't appear in the list."
      submitting={bulkCreate.isPending}
      submitLabel={(n) =>
        bulkCreate.isPending
          ? "Adding…"
          : `Add ${n} link${n === 1 ? "" : "s"}`
      }
      onSubmit={({ workerIds, notes }) => {
        if (workerIds.length === 0) return;
        bulkCreate.mutate(
          {
            leader_worker_id: leaderWorkerId,
            follower_worker_ids: workerIds,
            notes,
          },
          {
            onSuccess: (result) => {
              onCompleted?.(result?.inserted ?? 0);
              onOpenChange(false);
            },
          }
        );
      }}
    />
  );
}
