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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeaderUnitContext } from "./leader-unit-context";
import { useBulkCreateLeaderLinks } from "./use-leader-links";

/**
 * Bulk-add followers to a given leader within a specific campaign.
 *
 * The picker groups candidates into "Suggested from your units" (workers who
 * share at least one organising unit with the leader) and "Other". A toggle
 * narrows the list to just the Suggested group; the unit chip on each row is
 * always shown and highlighted when the unit matches one of the leader's.
 *
 * Additional filters let the user narrow by organising unit, occupation, and
 * sort order so that workers from outside the leader's own unit are easy to
 * find and add.
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
  occupation: string | null;
  member_role_type: { role_name: string; display_name: string } | null;
};

type SortKey = "name-asc" | "name-desc" | "role" | "ou";

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
  const [occupationFilter, setOccupationFilter] = useState("");
  const [ouFilter, setOuFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name-asc");
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
             worker_id, first_name, last_name, occupation,
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
              occupation: string | null;
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
          occupation: w.occupation ?? null,
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

  const selectedOuId = ouFilter === "all" ? null : Number(ouFilter);

  const { suggested, others } = useMemo(() => {
    const nameQ = search.trim().toLowerCase();
    const occQ = occupationFilter.trim().toLowerCase();

    const base = campaignWorkers
      .filter((w) => w.worker_id !== leaderWorkerId && !existingFollowerIds.has(w.worker_id))
      .filter((w) => {
        if (!nameQ) return true;
        return (
          w.first_name.toLowerCase().includes(nameQ) ||
          w.last_name.toLowerCase().includes(nameQ)
        );
      })
      .filter((w) => {
        if (!occQ) return true;
        return (w.occupation ?? "").toLowerCase().includes(occQ);
      })
      .filter((w) => {
        if (selectedOuId == null) return true;
        return ctx.allWorkerOuIds(w.worker_id).includes(selectedOuId);
      });

    const sorted = [...base].sort((a, b) => {
      switch (sortBy) {
        case "name-desc":
          return (
            b.last_name.localeCompare(a.last_name) ||
            b.first_name.localeCompare(a.first_name)
          );
        case "role": {
          const ra = a.member_role_type?.display_name ?? a.member_role_type?.role_name ?? "";
          const rb = b.member_role_type?.display_name ?? b.member_role_type?.role_name ?? "";
          return ra.localeCompare(rb) || a.last_name.localeCompare(b.last_name);
        }
        case "ou": {
          const oa = ctx.allWorkerOuNames(a.worker_id)[0] ?? "";
          const ob = ctx.allWorkerOuNames(b.worker_id)[0] ?? "";
          return oa.localeCompare(ob) || a.last_name.localeCompare(b.last_name);
        }
        default:
          return (
            a.last_name.localeCompare(b.last_name) ||
            a.first_name.localeCompare(b.first_name)
          );
      }
    });

    // When a specific OU filter is active, collapse the suggested/other grouping
    // since the user has already targeted a unit.
    if (selectedOuId != null) {
      return { suggested: sorted, others: [] };
    }

    const suggested: CampaignWorkerRow[] = [];
    const others: CampaignWorkerRow[] = [];
    for (const w of sorted) {
      if (ctx.isSharedUnit(w.worker_id)) suggested.push(w);
      else others.push(w);
    }
    return { suggested, others };
  }, [
    campaignWorkers,
    existingFollowerIds,
    leaderWorkerId,
    search,
    occupationFilter,
    selectedOuId,
    sortBy,
    ctx,
  ]);

  const visible = useMemo(
    () => (onlyMyUnits && selectedOuId == null ? suggested : [...suggested, ...others]),
    [onlyMyUnits, selectedOuId, suggested, others]
  );

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
      ? `Show only workers in ${leaderName ?? "this leader"}'s unit${
          ctx.leaderOuIds.size === 1 ? "" : "s"
        } (${[...ctx.leaderOuIds].map((id) => ctx.ouNames.get(id)).filter(Boolean).join(", ")})`
      : "Show only workers in this leader's units";

  const hasActiveFilters =
    occupationFilter.trim() !== "" || ouFilter !== "all" || search.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add workers to {leaderName ?? "leader"}</DialogTitle>
          <DialogDescription>
            Pick one or more workers in this campaign to link as followers.
            Workers already linked don't appear in the list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* OU filter + sort row */}
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <Select value={ouFilter} onValueChange={(v) => { setOuFilter(v); setOnlyMyUnits(false); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Filter by organising unit…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All organising units</SelectItem>
                  {ctx.allOuEntries.map((ou) => (
                    <SelectItem key={ou.id} value={String(ou.id)}>
                      {ou.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36 shrink-0">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Sort…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Name A → Z</SelectItem>
                  <SelectItem value="name-desc">Name Z → A</SelectItem>
                  <SelectItem value="role">By role</SelectItem>
                  <SelectItem value="ou">By unit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Name search */}
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />

          {/* Occupation filter */}
          <Input
            placeholder="Filter by occupation…"
            value={occupationFilter}
            onChange={(e) => setOccupationFilter(e.target.value)}
            className="h-8 text-xs"
          />

          {/* "Only my units" toggle — hidden when an OU filter is active */}
          {ouFilter === "all" && (
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
          )}

          {hasActiveFilters && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline"
              onClick={() => {
                setSearch("");
                setOccupationFilter("");
                setOuFilter("all");
                setOnlyMyUnits(ctx.leaderOuIds.size > 0);
              }}
            >
              Clear all filters
            </button>
          )}

          <div className="max-h-72 overflow-y-auto rounded border divide-y">
            {visible.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No matching workers.</p>
            ) : (
              <>
                {suggested.length > 0 && selectedOuId == null && (
                  <GroupHeader
                    label="Suggested from leader's units"
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
                    unitNames={ctx.allWorkerOuNames(w.worker_id)}
                    highlightUnits={ctx.isSharedUnit(w.worker_id)}
                  />
                ))}
                {(onlyMyUnits ? false : others.length > 0) && selectedOuId == null && (
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
                  selectedOuId == null &&
                  others.map((w) => (
                    <CandidateRow
                      key={`o-${w.worker_id}`}
                      worker={w}
                      checked={selected.has(w.worker_id)}
                      onToggle={() => toggle(w.worker_id)}
                      unitNames={ctx.allWorkerOuNames(w.worker_id)}
                      highlightUnits={false}
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
  unitNames,
  highlightUnits,
}: {
  worker: CampaignWorkerRow;
  checked: boolean;
  onToggle: () => void;
  unitNames: string[];
  highlightUnits: boolean;
}) {
  const role =
    worker.member_role_type?.display_name ?? worker.member_role_type?.role_name;
  const unitText = unitNames.join(", ");
  return (
    <label className="flex items-start gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/40">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">
          {worker.last_name}, {worker.first_name}
        </span>
        {worker.occupation && (
          <span className="block text-[10px] text-muted-foreground truncate">
            {worker.occupation}
          </span>
        )}
      </span>
      <span className="flex flex-col items-end gap-0.5 shrink-0">
        {role && (
          <span className="text-[10px] uppercase bg-background border px-1 rounded">
            {role}
          </span>
        )}
        {unitText && (
          <span
            title={`Unit(s): ${unitText}`}
            className={`text-[10px] rounded px-1 truncate max-w-[10rem] ${
              highlightUnits
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {unitText}
          </span>
        )}
      </span>
    </label>
  );
}
