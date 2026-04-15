"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateLeaderLink,
  useDeleteLeaderLink,
  useLeaderLinksAsFollower,
  useLeaderLinksAsLeader,
  type LeaderLink,
  type LinkedWorker,
} from "./use-leader-links";

export type WorkerRelationshipsTabProps = {
  workerId: number;
  /** When omitted, links are shown across all campaigns. Add flow is disabled without a campaign. */
  campaignId?: string;
  canWrite: boolean;
  /** Optional: the viewing worker's enduring role — used to gate leader-side UI. */
  isLeader?: boolean;
};

export function WorkerRelationshipsTab({
  workerId,
  campaignId,
  canWrite,
  isLeader = true,
}: WorkerRelationshipsTabProps) {
  const asFollower = useLeaderLinksAsFollower({ campaignId, workerId });
  const asLeader = useLeaderLinksAsLeader({ campaignId, workerId });
  const deleteLink = useDeleteLeaderLink();

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
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Leading
          </h4>
          {asLeader.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (asLeader.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workers linked to this leader yet.
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
          {campaignId && canWrite && (
            <div className="mt-3">
              <AddFollowerLinkForm campaignId={campaignId} leaderWorkerId={workerId} />
            </div>
          )}
        </section>
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

function AddFollowerLinkForm({
  campaignId,
  leaderWorkerId,
}: {
  campaignId: string;
  leaderWorkerId: number;
}) {
  const supabase = createClient();
  const [followerId, setFollowerId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const createLink = useCreateLeaderLink(campaignId);

  // Fetch candidate workers in this campaign, excluding the leader and already-linked workers.
  const { data: campaignWorkers = [] } = useQuery({
    queryKey: ["campaign-workers-picker", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `worker_id,
           worker:workers(worker_id, first_name, last_name)`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? [])
        .map((row) => {
          const wr = (row as { worker: unknown }).worker;
          const w = (Array.isArray(wr) ? wr[0] : wr) as
            | { worker_id: number; first_name: string; last_name: string }
            | null;
          return w;
        })
        .filter((w): w is NonNullable<typeof w> => !!w);
    },
  });

  const { data: existingFollowerIds = new Set<number>() } = useQuery({
    queryKey: ["leader-links-existing-followers", campaignId, leaderWorkerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_leader_worker_links")
        .select("follower_worker_id")
        .eq("campaign_id", campaignId)
        .eq("leader_worker_id", leaderWorkerId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.follower_worker_id as number));
    },
  });

  const options = useMemo(() => {
    return campaignWorkers
      .filter((w) => w.worker_id !== leaderWorkerId && !existingFollowerIds.has(w.worker_id))
      .sort(
        (a, b) =>
          a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
      );
  }, [campaignWorkers, leaderWorkerId, existingFollowerIds]);

  const submit = () => {
    if (!followerId) return;
    createLink.mutate(
      {
        leader_worker_id: leaderWorkerId,
        follower_worker_id: Number(followerId),
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          setFollowerId("");
          setNotes("");
        },
      }
    );
  };

  return (
    <div className="rounded border p-2 space-y-2">
      <Label className="text-xs">Add worker to leader</Label>
      <Select value={followerId} onValueChange={setFollowerId}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select a worker…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((w) => (
            <SelectItem key={w.worker_id} value={String(w.worker_id)}>
              {w.last_name}, {w.first_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="h-8 text-xs"
      />
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={!followerId || createLink.isPending}
      >
        Add link
      </Button>
    </div>
  );
}
