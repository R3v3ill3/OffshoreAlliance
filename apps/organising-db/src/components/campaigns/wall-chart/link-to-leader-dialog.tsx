"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Given the current wall-chart selection (worker ids), pick a leader from the
 * campaign's workers-with-a-leader-role and bulk-insert follower links.
 *
 * Self-links (leader also in the selection) are silently skipped by the
 * inserter (the DB has a CHECK constraint against leader == follower).
 */
export type LinkToLeaderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  /** Distinct worker ids to be linked as followers of the chosen leader. */
  followerWorkerIds: number[];
  onCompleted?: (inserted: number, skipped: number) => void;
};

const LEADER_ROLE_IDS = new Set([7, 8]); // Delegate, Activist

export function LinkToLeaderDialog({
  open,
  onOpenChange,
  campaignId,
  followerWorkerIds,
  onCompleted,
}: LinkToLeaderDialogProps) {
  const supabase = createClient();
  const qc = useQueryClient();

  const [leaderId, setLeaderId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: leaders = [] } = useQuery({
    queryKey: ["wallchart-leader-candidates", campaignId],
    queryFn: async () => {
      // Any campaign worker who has a leader role (Delegate/Activist) or is HSR / Bargaining Rep.
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `worker_id,
           worker:workers(
             worker_id, first_name, last_name,
             member_role_type_id, is_hsr, is_bargaining_rep,
             member_role_type:member_role_types(role_name, display_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      const rows = (data ?? [])
        .map((row) => {
          const wr = (row as { worker: unknown }).worker;
          return (Array.isArray(wr) ? wr[0] : wr) as
            | {
                worker_id: number;
                first_name: string;
                last_name: string;
                member_role_type_id: number | null;
                is_hsr: boolean | null;
                is_bargaining_rep: boolean | null;
                member_role_type: unknown;
              }
            | null;
        })
        .filter((w): w is NonNullable<typeof w> => !!w)
        .filter(
          (w) =>
            (w.member_role_type_id != null && LEADER_ROLE_IDS.has(w.member_role_type_id)) ||
            w.is_hsr === true ||
            w.is_bargaining_rep === true
        );
      rows.sort(
        (a, b) =>
          a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
      );
      return rows;
    },
    enabled: open,
  });

  const { data: existingLinks = [] } = useQuery({
    queryKey: ["wallchart-leader-existing", campaignId, leaderId],
    queryFn: async () => {
      if (!leaderId) return [] as { follower_worker_id: number }[];
      const { data, error } = await supabase
        .from("campaign_leader_worker_links")
        .select("follower_worker_id")
        .eq("campaign_id", Number(campaignId))
        .eq("leader_worker_id", Number(leaderId));
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!leaderId,
  });

  const linkInsert = useAuthAwareMutation({
    mutationFn: async () => {
      if (!leaderId) return { inserted: 0, skipped: followerWorkerIds.length };
      const leaderN = Number(leaderId);
      const already = new Set(existingLinks.map((e) => e.follower_worker_id as number));
      const toInsert = followerWorkerIds.filter(
        (id) => id !== leaderN && !already.has(id)
      );
      if (toInsert.length === 0) {
        return { inserted: 0, skipped: followerWorkerIds.length };
      }
      const rows = toInsert.map((id) => ({
        campaign_id: Number(campaignId),
        leader_worker_id: leaderN,
        follower_worker_id: id,
        notes: notes.trim() || null,
      }));
      const { error } = await supabase.from("campaign_leader_worker_links").insert(rows);
      if (error) throw error;
      return { inserted: toInsert.length, skipped: followerWorkerIds.length - toInsert.length };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["leader-links"] });
      onCompleted?.(result?.inserted ?? 0, result?.skipped ?? 0);
      onOpenChange(false);
    },
  });

  const selectedLeader = useMemo(
    () => leaders.find((l) => String(l.worker_id) === leaderId),
    [leaders, leaderId]
  );
  const followerCount = new Set(followerWorkerIds).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link {followerCount} {followerCount === 1 ? "worker" : "workers"} to a leader</DialogTitle>
          <DialogDescription>
            Pick a leader (Delegate, Activist, HSR, or Bargaining rep) to assign
            the selected workers to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Leader</Label>
            <Select value={leaderId} onValueChange={setLeaderId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a leader…" />
              </SelectTrigger>
              <SelectContent>
                {leaders.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    No eligible leaders in this campaign
                  </SelectItem>
                )}
                {leaders.map((l) => {
                  const mt = (Array.isArray(l.member_role_type)
                    ? l.member_role_type[0]
                    : l.member_role_type) as
                    | { role_name: string; display_name: string }
                    | null;
                  const roleLabel =
                    mt?.display_name ??
                    mt?.role_name ??
                    (l.is_bargaining_rep
                      ? "Bargaining rep"
                      : l.is_hsr
                      ? "HSR"
                      : "Leader");
                  return (
                    <SelectItem key={l.worker_id} value={String(l.worker_id)}>
                      {l.last_name}, {l.first_name} · {roleLabel}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes (optional, applied to every link)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {selectedLeader && existingLinks.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {existingLinks.length} of the selected workers are already linked to this
              leader — they will be skipped.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => linkInsert.mutate()} disabled={!leaderId || linkInsert.isPending}>
            {linkInsert.isPending ? "Linking…" : "Add links"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
