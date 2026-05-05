"use client";

/**
 * Pending Review tab — Phase 5.
 *
 * Renders pending leader-form submissions for a single campaign and lets a
 * staff reviewer Approve / Merge / Reject each row. Suggested existing-worker
 * matches are pre-fetched in one round trip via
 * `/api/campaigns/[id]/prospective/suggestions`.
 *
 * Public exports:
 *   - <PendingReviewTab campaignId={…} canWrite={…} />
 *   - usePendingReviewCount(campaignId) — small hook reused by the tab badge.
 *
 * Both share the same React-Query keys so the in-page count badge stays in
 * sync after every mutation:
 *   - ["campaign-pending-review", campaignId]
 *   - ["campaign-pending-review-suggestions", campaignId]
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { fetchApi } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { Inbox, Search, X } from "lucide-react";

/* ---------- shared shapes ---------- */

interface PendingRow {
  prospective_id: number;
  campaign_id: number;
  task_list_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  rating: number | null;
  source_token_id: number | null;
  source_leader_worker_id: number | null;
  created_at: string;
  // Joined / derived later.
  source_leader_name?: string | null;
  source_task_list_title?: string | null;
}

interface SuggestionEntry {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  employer_id: number | null;
  score: number;
  match_reason: string;
}

type SuggestionsMap = Record<number, SuggestionEntry[]>;

/* ---------- query helpers ---------- */

export function usePendingReviewCount(campaignId: string | number) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["campaign-pending-review-count", String(campaignId)],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("campaign_prospective_workers")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("review_status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/* ---------- main component ---------- */

export function PendingReviewTab({
  campaignId,
  canWrite,
}: {
  campaignId: string | number;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const cidStr = String(campaignId);

  const {
    data: pending = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["campaign-pending-review", cidStr],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("campaign_prospective_workers")
        .select(
          `prospective_id, campaign_id, task_list_id, first_name, last_name,
           email, phone, notes, rating, source_token_id, source_leader_worker_id,
           created_at,
           source_leader:workers!campaign_prospective_workers_source_leader_worker_id_fkey(first_name, last_name),
           task_list:campaign_task_lists(title)`
        )
        .eq("campaign_id", campaignId)
        .eq("review_status", "pending")
        .order("created_at", { ascending: false });
      if (e) throw e;
      return (data ?? []).map((r: unknown) => {
        const row = r as PendingRow & {
          source_leader: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
          task_list: { title: string | null } | { title: string | null }[] | null;
        };
        const leader = Array.isArray(row.source_leader)
          ? row.source_leader[0]
          : row.source_leader;
        const list = Array.isArray(row.task_list)
          ? row.task_list[0]
          : row.task_list;
        return {
          ...row,
          source_leader_name: leader
            ? `${leader.first_name} ${leader.last_name}`
            : null,
          source_task_list_title: list?.title ?? null,
        } as PendingRow;
      });
    },
  });

  const { data: suggestionsResp } = useQuery({
    queryKey: ["campaign-pending-review-suggestions", cidStr],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/prospective/suggestions`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to fetch suggestions");
      }
      return (await res.json()) as { suggestions: SuggestionsMap };
    },
    // Only fetch if there might be pending entries — saves an extra call when
    // the list is empty. Re-fired by the mutation invalidations below.
    enabled: pending.length > 0,
  });

  const suggestions: SuggestionsMap = suggestionsResp?.suggestions ?? {};

  // Modal state — at most one open at a time.
  const [actionRow, setActionRow] = useState<PendingRow | null>(null);
  const [mode, setMode] = useState<"approve" | "merge" | "reject" | null>(null);

  function close() {
    setActionRow(null);
    setMode(null);
  }

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: ["campaign-pending-review", cidStr],
    });
    queryClient.invalidateQueries({
      queryKey: ["campaign-pending-review-count", cidStr],
    });
    queryClient.invalidateQueries({
      queryKey: ["campaign-pending-review-suggestions", cidStr],
    });
    // Also invalidate the legacy "campaign-prospective" list shown in
    // campaign-task-lists so it does not show stale rows.
    queryClient.invalidateQueries({
      queryKey: ["campaign-prospective", cidStr],
    });
  }

  /* ---------- empty / loading states ---------- */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <EurekaLoadingSpinner size="md" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load pending submissions:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </CardContent>
      </Card>
    );
  }

  if (pending.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No pending submissions to review.
          </p>
        </CardContent>
      </Card>
    );
  }

  /* ---------- table ---------- */

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Pending leader-form submissions
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Workers added by leaders via the task webform. Approve to create a
            new worker record, merge into an existing record, or reject with a
            reason.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Suggested matches</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((row) => (
                  <PendingTableRow
                    key={row.prospective_id}
                    row={row}
                    matches={suggestions[row.prospective_id] ?? []}
                    canWrite={canWrite}
                    onApprove={() => {
                      setActionRow(row);
                      setMode("approve");
                    }}
                    onMerge={() => {
                      setActionRow(row);
                      setMode("merge");
                    }}
                    onReject={() => {
                      setActionRow(row);
                      setMode("reject");
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {actionRow && mode === "approve" && (
        <ApproveDialog
          campaignId={campaignId}
          row={actionRow}
          onClose={close}
          onDone={() => {
            invalidate();
            close();
          }}
        />
      )}
      {actionRow && mode === "merge" && (
        <MergeDialog
          campaignId={campaignId}
          row={actionRow}
          suggested={suggestions[actionRow.prospective_id] ?? []}
          onClose={close}
          onDone={() => {
            invalidate();
            close();
          }}
        />
      )}
      {actionRow && mode === "reject" && (
        <RejectDialog
          campaignId={campaignId}
          row={actionRow}
          onClose={close}
          onDone={() => {
            invalidate();
            close();
          }}
        />
      )}
    </div>
  );
}

/* ---------- row ---------- */

function PendingTableRow({
  row,
  matches,
  canWrite,
  onApprove,
  onMerge,
  onReject,
}: {
  row: PendingRow;
  matches: SuggestionEntry[];
  canWrite: boolean;
  onApprove: () => void;
  onMerge: () => void;
  onReject: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {row.first_name} {row.last_name}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <div className="space-y-0.5">
          {row.email && <div>{row.email}</div>}
          {row.phone && <div>{row.phone}</div>}
          {!row.email && !row.phone && <span>—</span>}
        </div>
      </TableCell>
      <TableCell className="max-w-[20ch] truncate text-xs" title={row.notes ?? ""}>
        {row.notes || "—"}
      </TableCell>
      <TableCell>
        {row.rating != null ? (
          <Badge variant="secondary">{row.rating}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs">
        {row.source_leader_name ? (
          <div>
            <div className="font-medium">{row.source_leader_name}</div>
            <div className="text-muted-foreground">
              {row.source_task_list_title ?? "—"}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">Unknown leader</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {format(new Date(row.created_at), "d MMM yyyy")}
      </TableCell>
      <TableCell className="text-xs">
        {matches.length === 0 ? (
          <span className="text-muted-foreground">No matches</span>
        ) : (
          <div className="space-y-0.5">
            {matches.slice(0, 3).map((m) => (
              <div key={m.worker_id} className="flex items-center gap-1.5">
                <span className="font-medium">
                  {m.first_name} {m.last_name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({m.match_reason})
                </span>
              </div>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right space-x-1.5">
        {canWrite && (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={onApprove}
              type="button"
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onMerge}
              type="button"
            >
              Merge
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              type="button"
              className="text-muted-foreground"
            >
              Reject
            </Button>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}

/* ---------- approve dialog ---------- */

function ApproveDialog({
  campaignId,
  row,
  onClose,
  onDone,
}: {
  campaignId: string | number;
  row: PendingRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const mutation = useAuthAwareMutation({
    mutationFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/prospective/${row.prospective_id}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Failed to approve"
        );
      }
      return json as { ok: true; worker_id: number };
    },
    onSuccess: () => {
      onDone();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Failed to approve");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve as new worker</DialogTitle>
          <DialogDescription>
            A new worker record will be created for{" "}
            <span className="font-medium text-foreground">
              {row.first_name} {row.last_name}
            </span>{" "}
            and added to this campaign&apos;s membership.
            {row.rating != null
              ? " The submitted rating will be saved against the source task list activity."
              : ""}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Approving…" : "Approve as new"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- merge dialog ---------- */

const mergeFormSchema = z.object({
  worker_id: z
    .number()
    .int()
    .positive("Pick a worker to merge into"),
});
type MergeFormValues = z.infer<typeof mergeFormSchema>;

function MergeDialog({
  campaignId,
  row,
  suggested,
  onClose,
  onDone,
}: {
  campaignId: string | number;
  row: PendingRow;
  suggested: SuggestionEntry[];
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const form = useForm<MergeFormValues>({
    resolver: zodResolver(mergeFormSchema),
    defaultValues: {
      worker_id: suggested[0]?.worker_id ?? (undefined as unknown as number),
    },
  });

  // Search by name/email/phone (admin-side, RLS-bound).
  const { data: searchResults = [] } = useQuery({
    queryKey: ["pending-review-merge-search", searchQ],
    queryFn: async () => {
      if (searchQ.trim().length < 2) return [];
      const q = searchQ.trim();
      // OR-search across name / email / phone — limit 25.
      const { data, error: sErr } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name, email, phone")
        .eq("is_active", true)
        .or(
          `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
        )
        .limit(25);
      if (sErr) throw sErr;
      return data ?? [];
    },
    enabled: searchQ.trim().length >= 2,
  });

  const mutation = useAuthAwareMutation({
    mutationFn: async (values: MergeFormValues) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/prospective/${row.prospective_id}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ existing_worker_id: values.worker_id }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Failed to merge"
        );
      }
      return json;
    },
    onSuccess: () => onDone(),
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Failed to merge");
    },
  });

  // Build the option list — suggested first, then any search results not
  // already in the suggested set.
  const candidates = useMemo(() => {
    const seen = new Set<number>();
    const out: Array<
      Pick<SuggestionEntry, "worker_id" | "first_name" | "last_name" | "email" | "phone"> & {
        match_reason?: string;
      }
    > = [];
    for (const s of suggested) {
      if (!seen.has(s.worker_id)) {
        seen.add(s.worker_id);
        out.push(s);
      }
    }
    for (const r of searchResults) {
      if (!seen.has(r.worker_id)) {
        seen.add(r.worker_id);
        out.push(r);
      }
    }
    return out;
  }, [suggested, searchResults]);

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge into existing worker</DialogTitle>
          <DialogDescription>
            Collapse{" "}
            <span className="font-medium text-foreground">
              {row.first_name} {row.last_name}
            </span>{" "}
            onto an existing worker record. Missing email/phone on the existing
            row will be filled from the submission, and notes will be appended
            with a timestamped marker.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label htmlFor="worker-merge-search">
              Search for a different worker
            </Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="worker-merge-search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Name, email or phone (min 2 chars)"
                className="pl-8 pr-8"
              />
              {searchQ && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                  onClick={() => setSearchQ("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="rounded-md border max-h-72 overflow-y-auto">
            {candidates.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">
                {searchQ.trim().length >= 2
                  ? "No matches for that search."
                  : "No suggested matches — search above to find a worker."}
              </p>
            ) : (
              <Controller
                control={form.control}
                name="worker_id"
                render={({ field }) => (
                  <ul className="divide-y">
                    {candidates.map((c) => {
                      const id = c.worker_id;
                      const isSelected = field.value === id;
                      return (
                        <li key={id}>
                          <label
                            className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-accent ${
                              isSelected ? "bg-accent" : ""
                            }`}
                          >
                            <input
                              type="radio"
                              className="mt-1"
                              checked={isSelected}
                              onChange={() => field.onChange(id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">
                                {c.first_name} {c.last_name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {c.email || c.phone || "—"}
                              </div>
                              {"match_reason" in c && c.match_reason && (
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                                  {c.match_reason}
                                </div>
                              )}
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              />
            )}
          </div>

          {form.formState.errors.worker_id && (
            <p className="text-sm text-destructive">
              {form.formState.errors.worker_id.message}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Merging…" : "Merge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- reject dialog ---------- */

const rejectFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Please give a brief reason")
    .max(2000),
});
type RejectFormValues = z.infer<typeof rejectFormSchema>;

function RejectDialog({
  campaignId,
  row,
  onClose,
  onDone,
}: {
  campaignId: string | number;
  row: PendingRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RejectFormValues>({
    resolver: zodResolver(rejectFormSchema),
    defaultValues: { reason: "" },
  });

  const mutation = useAuthAwareMutation({
    mutationFn: async (values: RejectFormValues) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/prospective/${row.prospective_id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: values.reason }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Failed to reject"
        );
      }
      return json;
    },
    onSuccess: () => onDone(),
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Failed to reject");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject submission</DialogTitle>
          <DialogDescription>
            Reject{" "}
            <span className="font-medium text-foreground">
              {row.first_name} {row.last_name}
            </span>
            . The reason is recorded for audit and shown to anyone who looks at
            the prospective record later.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              placeholder="e.g. duplicate, not a worker at this site, not engaged…"
              {...form.register("reason")}
            />
            {form.formState.errors.reason && (
              <p className="text-sm text-destructive">
                {form.formState.errors.reason.message}
              </p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
