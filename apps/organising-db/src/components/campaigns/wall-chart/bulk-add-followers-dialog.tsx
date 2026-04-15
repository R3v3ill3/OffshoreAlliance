"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useLeaderUnitContext } from "./leader-unit-context";
import { useBulkCreateLeaderLinks } from "./use-leader-links";

/**
 * Bulk-add followers to a given leader within a specific campaign.
 *
 * The picker groups candidates into "Suggested from your units" (workers who
 * share at least one organising unit with the leader) and "Other". A toggle
 * narrows the list to just the Suggested group; the unit chip on each row is
 * always shown and highlighted when the unit matches one of the leader's.
 */
export type BulkAddFollowersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  leaderWorkerId: number;
  leaderName?: string;
  onCompleted?: (inserted: number) => void;
};

type CampaignWorkerRow = {
  worker_id: number;
  first_name: string;
  last_name: string;
  member_role_type: { role_name: string; display_name: string } | null;
};

export function BulkAddFollowersDialog({
  open,
  onOpenChange,
  campaignId,
  leaderWorkerId,
  leaderName,
  onCompleted,
}: BulkAddFollowersDialogProps) {
  const supabase = createClient();
  const ctx = useLeaderUnitContext({ campaignId, leaderWorkerId });
  const [onlyMyUnits, setOnlyMyUnits] = useState(true);
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const { data: campaignWorkers = [] } = useQuery({
    queryKey: ["campaign-workers-picker", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `worker_id,
           worker:workers(
             worker_id, first_name, last_name,
             member_role_type:member_role_types(role_name, display_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      const out: CampaignWorkerRow[] = [];
      for (const row of data ?? []) {
        const wr = (row as { worker: unknown }).worker;
        const w = (Array.isArray(wr) ? wr[0] : wr) as
          | {
              worker_id: number;
              first_name: string;
              last_name: string;
              member_role_type: unknown;
            }
          | null
          | undefined;
        if (!w) continue;
        const mt = (Array.isArray(w.member_role_type)
          ? w.member_role_type[0]
          : w.member_role_type) as { role_name: string; display_name: string } | null;
        out.push({
          worker_id: w.worker_id,
          first_name: w.first_name,
          last_name: w.last_name,
          member_role_type: mt,
        });
      }
      return out;
    },
    enabled: open,
  });

  const { data: existingFollowerIds = new Set<number>() } = useQuery({
    queryKey: ["leader-links-existing-followers", campaignId, leaderWorkerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_leader_worker_links")
        .select("follower_worker_id")
        .eq("campaign_id", Number(campaignId))
        .eq("leader_worker_id", leaderWorkerId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.follower_worker_id as number));
    },
    enabled: open,
  });

  const { suggested, others } = useMemo(() => {
    const base = campaignWorkers
      .filter((w) => w.worker_id !== leaderWorkerId && !existingFollowerIds.has(w.worker_id))
      .filter((w) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          w.first_name.toLowerCase().includes(q) || w.last_name.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
      );
    const suggested: CampaignWorkerRow[] = [];
    const others: CampaignWorkerRow[] = [];
    for (const w of base) {
      if (ctx.isSharedUnit(w.worker_id)) suggested.push(w);
      else others.push(w);
    }
    return { suggested, others };
  }, [campaignWorkers, existingFollowerIds, leaderWorkerId, search, ctx]);

  const visible = useMemo(() => (onlyMyUnits ? suggested : [...suggested, ...others]), [
    onlyMyUnits,
    suggested,
    others,
  ]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const w of visible) next.add(w.worker_id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const bulkCreate = useBulkCreateLeaderLinks(campaignId);

  const submit = () => {
    if (selected.size === 0) return;
    bulkCreate.mutate(
      {
        leader_worker_id: leaderWorkerId,
        follower_worker_ids: [...selected],
        notes: notes.trim() || null,
      },
      {
        onSuccess: (result) => {
          onCompleted?.(result?.inserted ?? 0);
          onOpenChange(false);
        },
      }
    );
  };

  const myUnitsLabel =
    ctx.leaderOuIds.size > 0
      ? `Show only workers in ${leaderName ?? "this leader"}’s unit${
          ctx.leaderOuIds.size === 1 ? "" : "s"
        } (${[...ctx.leaderOuIds].map((id) => ctx.ouNames.get(id)).filter(Boolean).join(", ")})`
      : "Show only workers in this leader’s units";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add workers to {leaderName ?? "leader"}</DialogTitle>
          <DialogDescription>
            Pick one or more workers in this campaign to link as followers.
            Workers already linked don’t appear in the list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={onlyMyUnits}
              onCheckedChange={(v) => setOnlyMyUnits(!!v)}
              disabled={ctx.leaderOuIds.size === 0}
            />
            <span className="flex-1">
              {myUnitsLabel}
              {ctx.leaderOuIds.size === 0 && " — leader is not yet in any unit"}
            </span>
            {ctx.leaderOuIds.size > 0 && (
              <span className="text-muted-foreground">{suggested.length}</span>
            )}
          </label>

          <Input
            placeholder="Search workers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />

          <div className="max-h-72 overflow-y-auto rounded border divide-y">
            {visible.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No matching workers.</p>
            ) : (
              <>
                {suggested.length > 0 && (
                  <GroupHeader
                    label="Suggested from leader’s units"
                    count={suggested.length}
                    onSelectAll={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const w of suggested) next.add(w.worker_id);
                        return next;
                      });
                    }}
                  />
                )}
                {suggested.map((w) => (
                  <CandidateRow
                    key={`s-${w.worker_id}`}
                    worker={w}
                    checked={selected.has(w.worker_id)}
                    onToggle={() => toggle(w.worker_id)}
                    sharedUnits={ctx.sharedUnitNames(w.worker_id)}
                    isShared
                  />
                ))}
                {!onlyMyUnits && others.length > 0 && (
                  <GroupHeader
                    label="Other campaign workers"
                    count={others.length}
                    onSelectAll={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const w of others) next.add(w.worker_id);
                        return next;
                      });
                    }}
                  />
                )}
                {!onlyMyUnits &&
                  others.map((w) => (
                    <CandidateRow
                      key={`o-${w.worker_id}`}
                      worker={w}
                      checked={selected.has(w.worker_id)}
                      onToggle={() => toggle(w.worker_id)}
                      sharedUnits={[]}
                    />
                  ))}
              </>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {selected.size} selected
              {visible.length > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="underline"
                    onClick={selectAllVisible}
                  >
                    Select all visible
                  </button>
                  {selected.size > 0 && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="underline"
                        onClick={clearSelection}
                      >
                        Clear
                      </button>
                    </>
                  )}
                </>
              )}
            </span>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes (applied to every new link, optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={selected.size === 0 || bulkCreate.isPending}
          >
            {bulkCreate.isPending
              ? "Adding…"
              : `Add ${selected.size} link${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupHeader({
  label,
  count,
  onSelectAll,
}: {
  label: string;
  count: number;
  onSelectAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1 bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
      <span>
        {label} <span className="normal-case">({count})</span>
      </span>
      <button type="button" className="underline normal-case" onClick={onSelectAll}>
        Select all
      </button>
    </div>
  );
}

function CandidateRow({
  worker,
  checked,
  onToggle,
  sharedUnits,
  isShared,
}: {
  worker: CampaignWorkerRow;
  checked: boolean;
  onToggle: () => void;
  sharedUnits: string[];
  isShared?: boolean;
}) {
  const role =
    worker.member_role_type?.display_name ?? worker.member_role_type?.role_name;
  const unitText = sharedUnits.join(", ");
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/40">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="flex-1 truncate">
        {worker.last_name}, {worker.first_name}
      </span>
      {role && (
        <span className="text-[10px] uppercase bg-background border px-1 rounded">
          {role}
        </span>
      )}
      {isShared && unitText && (
        <span
          title={`Shared unit(s): ${unitText}`}
          className="text-[10px] rounded bg-primary/15 text-primary px-1 truncate max-w-[10rem]"
        >
          {unitText}
        </span>
      )}
    </label>
  );
}
