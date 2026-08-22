"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api/fetch-api";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { useCampaignWorkerDetail } from "@/components/campaigns/campaign-worker-detail-provider";
import type { DuplicateCluster } from "@/lib/workers/duplicate-clusters";
import { DUPLICATE_REASON_LABELS } from "@/lib/workers/duplicate-clusters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClusterAction = "skip" | "remove" | "merge";

type ClusterDraft = {
  confirmed: boolean;
  action: ClusterAction;
  keepWorkerId: number;
  includeWorkerIds: number[];
};

function extrasOf(cluster: DuplicateCluster, keepWorkerId: number): number[] {
  return cluster.workers.map((w) => w.worker_id).filter((id) => id !== keepWorkerId);
}

export function FindDuplicateWorkersDialog({
  open,
  onOpenChange,
  campaignId,
  canWrite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const workerDetail = useCampaignWorkerDetail();
  const [drafts, setDrafts] = useState<Record<string, ClusterDraft>>({});

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["campaign-worker-duplicates", campaignId],
    enabled: open,
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/workers/duplicates`);
      if (!res.ok) throw new Error("Failed to search for duplicates");
      return (await res.json()) as { scanned: number; clusters: DuplicateCluster[] };
    },
  });

  const clusters = data?.clusters ?? [];

  useEffect(() => {
    if (!open || !data) return;
    setDrafts((prev) => {
      const next: Record<string, ClusterDraft> = {};
      for (const c of data.clusters) {
        next[c.cluster_id] = prev[c.cluster_id] ?? {
          confirmed: c.confidence === "high",
          action: c.confidence === "high" ? "merge" : "skip",
          keepWorkerId: c.suggested_keep_id,
          includeWorkerIds: extrasOf(c, c.suggested_keep_id),
        };
      }
      return next;
    });
  }, [open, data]);

  const pendingCount = useMemo(() => {
    return clusters.filter((c) => {
      const d = drafts[c.cluster_id];
      return d?.confirmed && d.action !== "skip" && d.includeWorkerIds.length > 0;
    }).length;
  }, [clusters, drafts]);

  const apply = useAuthAwareMutation({
    mutationFn: async () => {
      const actions = clusters.flatMap((c): Array<
        | { action: "remove"; keep_worker_id: number; remove_worker_ids: number[] }
        | { action: "merge"; keep_worker_id: number; merge_from_worker_ids: number[] }
      > => {
        const d = drafts[c.cluster_id];
        if (!d?.confirmed || d.action === "skip") return [];
        const others = d.includeWorkerIds.filter((id) => id !== d.keepWorkerId);
        if (others.length === 0) return [];
        if (d.action === "remove") {
          return [
            {
              action: "remove" as const,
              keep_worker_id: d.keepWorkerId,
              remove_worker_ids: others,
            },
          ];
        }
        return [
          {
            action: "merge" as const,
            keep_worker_id: d.keepWorkerId,
            merge_from_worker_ids: others,
          },
        ];
      });
      if (actions.length === 0) {
        throw new Error("Confirm at least one match and choose remove or merge.");
      }
      const res = await fetchApi(`/api/campaigns/${campaignId}/workers/duplicates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to apply");
      return json as { removed: number; merged: number };
    },
    onSuccess: async (json) => {
      toast.success(
        [
          json.removed ? `${json.removed} removed from campaign` : null,
          json.merged ? `${json.merged} record(s) merged` : null,
        ]
          .filter(Boolean)
          .join(". ") || "Done"
      );
      queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-facts", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-list-builder-workers"] });
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      await refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function patch(id: string, next: Partial<ClusterDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }

  function toggleInclude(clusterId: string, workerId: number, included: boolean) {
    setDrafts((prev) => {
      const d = prev[clusterId];
      if (!d) return prev;
      const set = new Set(d.includeWorkerIds);
      if (included) set.add(workerId);
      else set.delete(workerId);
      set.delete(d.keepWorkerId);
      return { ...prev, [clusterId]: { ...d, includeWorkerIds: [...set] } };
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Find duplicate workers</DialogTitle>
          <DialogDescription>
            Matches in this campaign by email, phone, or name. Confirm each group,
            choose who to keep, then remove extras from the campaign, merge them
            into the kept record, or open a card to edit.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching this campaign…
          </div>
        ) : clusters.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No likely duplicates among {data?.scanned ?? 0} campaign members.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {clusters.length} possible duplicate group
              {clusters.length === 1 ? "" : "s"} in {data?.scanned} members.
              Name-only matches stay unchecked until you confirm.
            </p>
            {clusters.map((cluster) => {
              const d = drafts[cluster.cluster_id];
              if (!d) return null;
              return (
                <div key={cluster.cluster_id} className="rounded-md border p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {cluster.reasons.map((r) => (
                        <Badge key={r} variant={cluster.confidence === "high" ? "default" : "secondary"}>
                          {DUPLICATE_REASON_LABELS[r]}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {cluster.workers.length} records
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={d.confirmed}
                        onCheckedChange={(v) => patch(cluster.cluster_id, { confirmed: v === true })}
                      />
                      Confirm match
                    </label>
                  </div>

                  <RadioGroup
                    value={String(d.keepWorkerId)}
                    onValueChange={(v) => {
                      const keepWorkerId = Number(v);
                      patch(cluster.cluster_id, {
                        keepWorkerId,
                        includeWorkerIds: extrasOf(cluster, keepWorkerId),
                      });
                    }}
                    className="space-y-2"
                  >
                    {cluster.workers.map((w) => {
                      const isKeep = w.worker_id === d.keepWorkerId;
                      const included = d.includeWorkerIds.includes(w.worker_id);
                      return (
                        <div
                          key={w.worker_id}
                          className="flex flex-wrap items-start justify-between gap-2 rounded border bg-muted/20 px-2 py-1.5"
                        >
                          <label className="flex items-start gap-2 min-w-0 flex-1 text-sm">
                            <RadioGroupItem
                              value={String(w.worker_id)}
                              className="mt-0.5"
                              aria-label={`Keep ${w.first_name} ${w.last_name}`}
                            />
                            <span className="min-w-0">
                              <span className="font-medium">
                                {w.first_name} {w.last_name}
                              </span>
                              {isKeep && (
                                <Badge variant="outline" className="ml-1 text-[10px]">
                                  Keep
                                </Badge>
                              )}
                              <span className="block text-xs text-muted-foreground truncate">
                                {[
                                  w.email,
                                  w.phone,
                                  w.employer_name,
                                  w.worksite_name,
                                  w.occupation,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || `Worker #${w.worker_id}`}
                              </span>
                            </span>
                          </label>
                          <div className="flex items-center gap-2">
                            {!isKeep && (
                              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Checkbox
                                  checked={included}
                                  onCheckedChange={(v) =>
                                    toggleInclude(cluster.cluster_id, w.worker_id, v === true)
                                  }
                                />
                                {d.action === "remove"
                                  ? "Remove"
                                  : d.action === "merge"
                                    ? "Merge"
                                    : "Include"}
                              </label>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                onOpenChange(false);
                                workerDetail?.openWorkerDetail(w.worker_id);
                              }}
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </RadioGroup>

                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs">If confirmed</Label>
                    <Select
                      value={d.action}
                      onValueChange={(v) => patch(cluster.cluster_id, { action: v as ClusterAction })}
                      disabled={!d.confirmed}
                    >
                      <SelectTrigger className="h-8 w-[280px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Leave as-is</SelectItem>
                        <SelectItem value="remove">
                          Remove extras from this campaign
                        </SelectItem>
                        <SelectItem value="merge">
                          Merge extras into the kept record
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {d.confirmed && d.action === "remove" && (
                    <p className="text-[11px] text-muted-foreground">
                      The kept record stays on the campaign. Checked extras are
                      removed from this campaign only — not deleted from the database.
                    </p>
                  )}
                  {d.confirmed && d.action === "merge" && (
                    <p className="text-[11px] text-muted-foreground">
                      Ratings, notes, lists and contact history from checked extras
                      move onto the kept worker. Those extra records are then
                      deleted globally, including in other campaigns.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canWrite && clusters.length > 0 && (
            <Button
              type="button"
              onClick={() => apply.mutate()}
              disabled={apply.isPending || isFetching || pendingCount === 0}
            >
              {apply.isPending ? "Applying…" : `Apply (${pendingCount})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FindDuplicatesButton({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canWrite) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Users className="h-3.5 w-3.5" aria-hidden />
        <Search className="h-3 w-3" aria-hidden />
        Find duplicates
      </Button>
      <FindDuplicateWorkersDialog
        open={open}
        onOpenChange={setOpen}
        campaignId={campaignId}
        canWrite={canWrite}
      />
    </>
  );
}
