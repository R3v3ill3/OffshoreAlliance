"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useDeleteLeaderLink,
  useLeaderLinksAsFollower,
  useLeaderLinksAsLeader,
  type LeaderLink,
  type LinkedWorker,
} from "./use-leader-links";
import { BulkAddFollowersDialog } from "./bulk-add-followers-dialog";

export type WorkerRelationshipsTabProps = {
  workerId: number;
  /** When omitted, links are shown across all campaigns. Add flow is disabled without a campaign. */
  campaignId?: string;
  /** Display name for the viewed worker — used in the bulk-add dialog title. */
  workerName?: string;
  canWrite: boolean;
  /** Optional: the viewing worker's enduring role — used to gate leader-side UI. */
  isLeader?: boolean;
};

export function WorkerRelationshipsTab({
  workerId,
  campaignId,
  workerName,
  canWrite,
  isLeader = true,
}: WorkerRelationshipsTabProps) {
  const asFollower = useLeaderLinksAsFollower({ campaignId, workerId });
  const asLeader = useLeaderLinksAsLeader({ campaignId, workerId });
  const deleteLink = useDeleteLeaderLink();
  const [bulkOpen, setBulkOpen] = useState(false);

  return (
    <div className="space-y-5 py-3">
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Led by
        </h4>
        {asFollower.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (asFollower.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No leaders linked.</p>
        ) : (
          <div className="space-y-1.5">
            {(asFollower.data ?? []).map((l) => (
              <LinkRow
                key={l.link_id}
                link={l}
                subject={l.leader}
                canWrite={canWrite}
                onRemove={() => deleteLink.mutate(l.link_id)}
              />
            ))}
          </div>
        )}
      </section>

      {isLeader && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Leading
            </h4>
            {campaignId && canWrite && (
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setBulkOpen(true)}
              >
                Add workers…
              </Button>
            )}
          </div>
          {asLeader.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (asLeader.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workers linked to this leader yet.
              {campaignId && canWrite && (
                <>
                  {" "}Use <b>Add workers</b> to pick from this campaign — the
                  dialog surfaces workers in the leader’s own organising unit
                  first.
                </>
              )}
            </p>
          ) : (
            <div className="space-y-1.5">
              {(asLeader.data ?? []).map((l) => (
                <LinkRow
                  key={l.link_id}
                  link={l}
                  subject={l.follower}
                  canWrite={canWrite}
                  onRemove={() => deleteLink.mutate(l.link_id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {campaignId && bulkOpen && (
        <BulkAddFollowersDialog
          key={`bulk-${workerId}`}
          open
          onOpenChange={(v) => {
            if (!v) setBulkOpen(false);
          }}
          campaignId={campaignId}
          leaderWorkerId={workerId}
          leaderName={workerName}
        />
      )}
    </div>
  );
}

function LinkRow({
  link,
  subject,
  canWrite,
  onRemove,
}: {
  link: LeaderLink;
  subject: LinkedWorker | null;
  canWrite: boolean;
  onRemove: () => void;
}) {
  const name = subject
    ? `${subject.first_name} ${subject.last_name}`
    : `Worker ${link.leader_worker_id || link.follower_worker_id}`;
  const role = subject?.member_role_type?.display_name ?? subject?.member_role_type?.role_name;
  return (
    <div className="rounded border px-2 py-1.5 flex items-center justify-between gap-2 text-xs">
      <div className="min-w-0">
        <p className="font-medium truncate">{name}</p>
        <p className="text-muted-foreground">
          {role ? `${role} · ` : ""}
          {link.notes ? link.notes : "—"}
        </p>
      </div>
      {canWrite && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-destructive"
          onClick={onRemove}
        >
          Remove
        </Button>
      )}
    </div>
  );
}
