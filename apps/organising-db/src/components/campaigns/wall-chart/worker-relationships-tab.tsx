"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  useDeleteLeaderLink,
  useLeaderLinksAsFollower,
  useLeaderLinksAsLeader,
  type LeaderLink,
  type LinkedWorker,
} from "./use-leader-links";
import { BulkAddFollowersDialog } from "./bulk-add-followers-dialog";
import { LinkToLeaderDialog } from "./link-to-leader-dialog";
import { useLeaderUnitContext } from "./leader-unit-context";
import { CreateTaskListDialog } from "../task-lists/create-task-list-dialog";
import { RoleReassessPrompt } from "./role-reassess-prompt";
import type { WallChartRoleType } from "./types";

/** Roles that already imply leadership — skip the reassess prompt for these. */
const LEADER_ROLE_TYPE_IDS = new Set<number>([7, 8]); // Delegate, Activist

export type WorkerRelationshipsTabProps = {
  workerId: number;
  /** When omitted, links are shown across all campaigns. Add flow is disabled without a campaign. */
  campaignId?: string;
  /** Display name for the viewed worker — used in the bulk-add dialog title. */
  workerName?: string;
  canWrite: boolean;
  /** Optional: the viewing worker's enduring role — used to gate leader-side UI. */
  isLeader?: boolean;
  /** Current member_role_type_id of the viewed worker — drives the post-task reassess prompt. */
  currentRoleTypeId?: number | null;
  /** Current role display name of the viewed worker — shown in the reassess prompt. */
  currentRoleName?: string | null;
  /** Available role types for the reassess prompt picker. */
  roleTypes?: WallChartRoleType[];
};

export function WorkerRelationshipsTab({
  workerId,
  campaignId,
  workerName,
  canWrite,
  isLeader = true,
  currentRoleTypeId = null,
  currentRoleName = null,
  roleTypes = [],
}: WorkerRelationshipsTabProps) {
  const supabase = createClient();
  const asFollower = useLeaderLinksAsFollower({ campaignId, workerId });
  const asLeader = useLeaderLinksAsLeader({ campaignId, workerId });
  const deleteLink = useDeleteLeaderLink();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [createTaskListOpen, setCreateTaskListOpen] = useState(false);
  const [reassessOpen, setReassessOpen] = useState(false);
  // Unit context keyed to the viewer — used to chip each link row with whether
  // the counterparty shares an organising unit with them.
  const ctx = useLeaderUnitContext({ campaignId, leaderWorkerId: workerId });

  const { data: ledTaskLists = [] } = useQuery({
    queryKey: ["campaign-task-lists", campaignId, "for-leader", workerId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_task_lists")
        .select(
          `task_list_id, title, status, activity_id,
           activity:campaign_activities(title)`
        )
        .eq("campaign_id", campaignId!)
        .eq("leader_worker_id", workerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        task_list_id: number;
        title: string | null;
        status: string;
        activity_id: number | null;
        activity: { title: string } | { title: string }[] | null;
      }>;
    },
  });

  const displayWorkerName = workerName ?? "This worker";
  const showReassessOnCreate =
    currentRoleTypeId == null || !LEADER_ROLE_TYPE_IDS.has(currentRoleTypeId);

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
                otherWorkerId={l.leader_worker_id}
                sharedUnits={ctx.sharedUnitNames(l.leader_worker_id)}
                hasSharedUnit={ctx.isSharedUnit(l.leader_worker_id)}
                campaignId={campaignId}
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
                  otherWorkerId={l.follower_worker_id}
                  sharedUnits={ctx.sharedUnitNames(l.follower_worker_id)}
                  hasSharedUnit={ctx.isSharedUnit(l.follower_worker_id)}
                  campaignId={campaignId}
                  canWrite={canWrite}
                  onRemove={() => deleteLink.mutate(l.link_id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {campaignId && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tasks led by this worker
            </h4>
            {canWrite && (
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setCreateTaskListOpen(true)}
              >
                New task list
              </Button>
            )}
          </div>
          {ledTaskLists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No task lists led by this worker yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {ledTaskLists.map((tl) => {
                const act = Array.isArray(tl.activity) ? tl.activity[0] : tl.activity;
                return (
                  <div
                    key={tl.task_list_id}
                    className="rounded border px-2 py-1.5 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{tl.title || "Untitled"}</p>
                      <p className="text-muted-foreground">
                        {act?.title ?? "Standalone"} · {tl.status}
                      </p>
                    </div>
                  </div>
                );
              })}
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

      {campaignId && (
        <CreateTaskListDialog
          campaignId={campaignId}
          open={createTaskListOpen}
          onOpenChange={setCreateTaskListOpen}
          leaderWorkerLock={{ workerId, workerName: displayWorkerName }}
          onCreated={() => {
            if (showReassessOnCreate && roleTypes.length > 0) {
              setReassessOpen(true);
            }
          }}
        />
      )}

      {campaignId && (
        <RoleReassessPrompt
          open={reassessOpen}
          onOpenChange={setReassessOpen}
          workerId={workerId}
          workerName={displayWorkerName}
          campaignId={campaignId}
          currentRoleName={currentRoleName}
          roleTypes={roleTypes}
        />
      )}
    </div>
  );
}

function LinkRow({
  link,
  subject,
  otherWorkerId: _otherWorkerId,
  sharedUnits,
  hasSharedUnit,
  campaignId,
  canWrite,
  onRemove,
}: {
  link: LeaderLink;
  subject: LinkedWorker | null;
  otherWorkerId: number;
  sharedUnits: string[];
  hasSharedUnit: boolean;
  /** Omitted when showing cross-campaign links on /workers/[id]. */
  campaignId?: string;
  canWrite: boolean;
  onRemove: () => void;
}) {
  const name = subject
    ? `${subject.first_name} ${subject.last_name}`
    : `Worker ${link.leader_worker_id || link.follower_worker_id}`;
  const role = subject?.member_role_type?.display_name ?? subject?.member_role_type?.role_name;
  // Only show chips when we have campaign context — across campaigns we don't
  // have enough signal to claim "same unit".
  const showChip = !!campaignId;
  return (
    <div className="rounded border px-2 py-1.5 flex items-center justify-between gap-2 text-xs">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-medium truncate">{name}</p>
          {showChip && hasSharedUnit && (
            <span
              title={`Shared unit(s): ${sharedUnits.join(", ")}`}
              className="text-[10px] rounded bg-primary/15 text-primary px-1 truncate max-w-[10rem]"
            >
              {sharedUnits.join(", ") || "Same unit"}
            </span>
          )}
          {showChip && !hasSharedUnit && (
            <span
              title="This relationship crosses organising units"
              className="text-[10px] rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1"
            >
              Crosses units
            </span>
          )}
        </div>
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
