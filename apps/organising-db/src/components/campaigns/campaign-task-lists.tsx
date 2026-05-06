"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { fetchApi } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, EyeOff, Copy, Check, Activity as ActivityIcon } from "lucide-react";
import {
  CreateTaskListDialog,
  type CreateTaskListDraft,
} from "./task-lists/create-task-list-dialog";
import {
  TaskListActivityPanel,
  relativeTime,
} from "./task-list-activity-panel";
import type { TaskListProgressSummary } from "@/lib/campaign/task-list-progress";

const EXPIRY_PRESETS: { label: string; hours: number }[] = [
  { label: "2 hours", hours: 2 },
  { label: "8 hours", hours: 8 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "14 days", hours: 336 },
];
const DEFAULT_EXPIRY_HOURS = 168; // 7 days

type IssueDialogTarget = { taskListId: number; title: string };
type IssueResult = {
  url: string;
  password: string;
  expires_at: string | null;
  expires_in_hours: number;
};

type TaskListRow = {
  task_list_id: number;
  title: string | null;
  status: string;
  activity_id: number | null;
  leader_worker_id: number | null;
  leader_organiser_id: number | null;
  include_membership_ask: boolean;
  leader_instructions: string | null;
  activity: { title: string } | { title: string }[] | null;
  campaign: { name: string } | { name: string }[] | null;
  leader_worker:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null;
  leader_organiser:
    | { organiser_name: string | null }
    | { organiser_name: string | null }[]
    | null;
  items: { worker_id: number }[] | null;
};

type ActivityPanelTarget = {
  taskListId: number;
  title: string;
  status: string;
  campaignName: string | null;
  leaderName: string | null;
};

export function CampaignTaskListsSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [issueTarget, setIssueTarget] = useState<IssueDialogTarget | null>(null);
  const [issueResult, setIssueResult] = useState<IssueResult | null>(null);
  // Phase 3 — drafts now live in the same surface; default visibility includes
  // both drafts and active rows so users can finish setup without hunting.
  const [statusFilter, setStatusFilter] = useState<
    "all" | "draft" | "active" | "completed"
  >("all");
  const [draftBeingEdited, setDraftBeingEdited] = useState<CreateTaskListDraft | null>(
    null
  );
  // Phase 6 — slide-over progress panel.
  const [activityPanelTarget, setActivityPanelTarget] =
    useState<ActivityPanelTarget | null>(null);

  const { data: taskLists = [] } = useQuery({
    queryKey: ["campaign-task-lists", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_task_lists")
        .select(
          `task_list_id, title, status, activity_id, leader_worker_id, leader_organiser_id,
           include_membership_ask, leader_instructions,
           activity:campaign_activities(title),
           campaign:campaigns(name),
           leader_worker:workers!campaign_task_lists_leader_worker_id_fkey(first_name, last_name),
           leader_organiser:organisers!campaign_task_lists_leader_organiser_id_fkey(organiser_name),
           items:campaign_task_list_items(worker_id)`
        )
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TaskListRow[];
    },
  });

  // Phase 6 — campaign-wide progress batch. One round-trip on mount + refetch
  // every 60s so badges stay roughly fresh without hammering the API.
  // Closing the slide-over also invalidates this key (see TaskListActivityPanel)
  // so badges update immediately after the user has just been watching.
  const { data: progressBatch = {} } = useQuery({
    queryKey: ["task-list-progress-batch", campaignId],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/task-lists/progress-batch`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? "Failed to load progress"
        );
      }
      return (await res.json()) as Record<string, TaskListProgressSummary>;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const revokeTokens = useAuthAwareMutation({
    mutationFn: async (taskListId: number) => {
      const { error } = await supabase
        .from("campaign_leader_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("task_list_id", taskListId)
        .is("revoked_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-task-lists", campaignId] });
    },
  });

  function leaderNameFor(row: TaskListRow): string | null {
    const w = Array.isArray(row.leader_worker)
      ? row.leader_worker[0]
      : row.leader_worker;
    if (w) return `${w.first_name} ${w.last_name}`.trim();
    const o = Array.isArray(row.leader_organiser)
      ? row.leader_organiser[0]
      : row.leader_organiser;
    if (o) {
      return o.organiser_name?.trim() || "Organiser";
    }
    return null;
  }

  function campaignNameFor(row: TaskListRow): string | null {
    const c = Array.isArray(row.campaign) ? row.campaign[0] : row.campaign;
    return c?.name ?? null;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Leader task lists</CardTitle>
          {canWrite && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              New task list
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Create a list for a campaign leader. Link an activity if you want ratings to flow to
            it; otherwise the list is standalone. A worker assigned as leader is rated 1 for the
            linked activity and promoted to Activist if currently no role or Contact. Workers on
            the list are added for assessment and are not automatically rated.
          </p>

          {/* Status filter chips — drafts are visible by default. */}
          <StatusFilterChips
            value={statusFilter}
            onChange={setStatusFilter}
            counts={{
              all: taskLists.length,
              draft: taskLists.filter((t) => t.status === "draft").length,
              active: taskLists.filter((t) => t.status === "active").length,
              completed: taskLists.filter((t) => t.status === "completed").length,
            }}
          />

          {taskLists.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">No task lists yet.</p>
          ) : (
            <div className="rounded-md border mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title / activity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskLists
                    .filter((tl) => {
                      if (statusFilter === "all") return true;
                      return tl.status === statusFilter;
                    })
                    .map((row) => {
                      const ar = row.activity;
                      const act = (Array.isArray(ar) ? ar[0] : ar) as
                        | { title: string }
                        | null;
                      const isDraft = row.status === "draft";
                      const summary =
                        progressBatch[String(row.task_list_id)] ?? null;
                      const leaderName = leaderNameFor(row);
                      const campaignName = campaignNameFor(row);
                      return (
                        <TableRow key={row.task_list_id}>
                          <TableCell>
                            <div className="font-medium">{row.title || "Untitled"}</div>
                            <div className="text-xs text-muted-foreground">
                              {act?.title ?? "Standalone"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                                row.status === "active"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                  : row.status === "draft"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {row.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ProgressBadge summary={summary} isDraft={isDraft} />
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {!isDraft && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setActivityPanelTarget({
                                    taskListId: row.task_list_id,
                                    title: row.title || "Untitled",
                                    status: row.status,
                                    campaignName,
                                    leaderName,
                                  })
                                }
                                className="gap-1"
                              >
                                <ActivityIcon size={14} /> View activity
                              </Button>
                            )}
                            {canWrite && isDraft && (
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={() =>
                                  setDraftBeingEdited({
                                    task_list_id: row.task_list_id,
                                    title: row.title,
                                    activity_id: row.activity_id,
                                    leader_worker_id: row.leader_worker_id,
                                    leader_organiser_id: row.leader_organiser_id,
                                    include_membership_ask: !!row.include_membership_ask,
                                    leader_instructions: row.leader_instructions ?? null,
                                    worker_ids: (row.items ?? []).map(
                                      (i) => i.worker_id
                                    ),
                                  })
                                }
                              >
                                Complete setup
                              </Button>
                            )}
                            {canWrite && !isDraft && (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setIssueTarget({
                                      taskListId: row.task_list_id,
                                      title: row.title || "Untitled",
                                    })
                                  }
                                >
                                  Generate link
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => revokeTokens.mutate(row.task_list_id)}
                                >
                                  Revoke links
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/*
        Phase 5 superseded the legacy mini "Prospective workers" card. The
        full review queue lives in the campaign's Plan & Execution → Pending
        review sub-tab. We leave a small affordance here so users who land on
        the task lists tab and need to review submissions don't have to hunt.
      */}
      <p className="text-xs text-muted-foreground">
        New worker submissions from leader webforms appear in the{" "}
        <a
          className="underline hover:text-foreground"
          href={`/campaigns/${campaignId}?tab=plan&sub=pending-review`}
        >
          Pending review tab
        </a>
        .
      </p>

      <CreateTaskListDialog
        campaignId={campaignId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Stepper dialog re-opened with a draft pre-populated. Lives separately
          so opening "Complete setup" can't collide with the "New task list"
          flow (different keys, different state). */}
      {draftBeingEdited && (
        <CreateTaskListDialog
          key={`draft-${draftBeingEdited.task_list_id}`}
          campaignId={campaignId}
          open={!!draftBeingEdited}
          onOpenChange={(o) => {
            if (!o) setDraftBeingEdited(null);
          }}
          draft={draftBeingEdited}
          onCreated={() => setDraftBeingEdited(null)}
        />
      )}

      <IssueLinkDialog
        campaignId={campaignId}
        target={issueTarget}
        onClose={() => setIssueTarget(null)}
        onIssued={(r) => {
          setIssueTarget(null);
          setIssueResult(r);
          queryClient.invalidateQueries({ queryKey: ["campaign-task-lists", campaignId] });
        }}
      />

      <IssuedLinkResultDialog
        result={issueResult}
        onClose={() => setIssueResult(null)}
      />

      <TaskListActivityPanel
        campaignId={campaignId}
        taskListId={activityPanelTarget?.taskListId ?? null}
        taskListTitle={activityPanelTarget?.title ?? ""}
        campaignName={activityPanelTarget?.campaignName ?? null}
        leaderName={activityPanelTarget?.leaderName ?? null}
        status={activityPanelTarget?.status ?? null}
        open={activityPanelTarget !== null}
        onOpenChange={(o) => {
          if (!o) setActivityPanelTarget(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress badge — compact summary shown in each task-list row       */
/* ------------------------------------------------------------------ */

function ProgressBadge({
  summary,
  isDraft,
}: {
  summary: TaskListProgressSummary | null;
  isDraft: boolean;
}) {
  if (isDraft) {
    return (
      <span className="text-xs text-muted-foreground">Draft — not shareable</span>
    );
  }
  if (!summary) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  const added = summary.existing_added + summary.prospective_added;
  const lastSeen = summary.last_auth_success_at ?? summary.last_event_at;
  return (
    <div className="text-xs leading-snug space-y-0.5">
      <div>
        <span className="font-medium tabular-nums">
          {summary.workers_rated}/{summary.workers_total}
        </span>{" "}
        rated
        {added > 0 ? (
          <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
            +{added} added
          </span>
        ) : null}
        {summary.workers_edited > 0 ? (
          <span className="ml-1.5 text-sky-600 dark:text-sky-400">
            {summary.workers_edited} edited
          </span>
        ) : null}
      </div>
      <div className="text-muted-foreground">
        {lastSeen ? `· last seen ${relativeTime(lastSeen)}` : "· no activity yet"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status filter chips                                                 */
/* ------------------------------------------------------------------ */

type StatusFilter = "all" | "draft" | "active" | "completed";

function StatusFilterChips({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  const opts: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "draft", label: "Drafts" },
    { id: "active", label: "Active" },
    { id: "completed", label: "Completed" },
  ];
  return (
    <div role="tablist" aria-label="Filter task lists by status" className="flex flex-wrap gap-1">
      {opts.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={`text-xs px-2 py-1 rounded-md border transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent border-input text-muted-foreground"
            }`}
          >
            {opt.label}
            <span
              className={`ml-1.5 text-[10px] tabular-nums ${
                isActive ? "text-primary-foreground/80" : "text-muted-foreground/80"
              }`}
            >
              {counts[opt.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Issue link dialog — collects password + expiry, posts to API.       */
/* ------------------------------------------------------------------ */

function IssueLinkDialog({
  campaignId,
  target,
  onClose,
  onIssued,
}: {
  campaignId: string;
  target: IssueDialogTarget | null;
  onClose: () => void;
  onIssued: (r: IssueResult) => void;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [expiryMode, setExpiryMode] = useState<string>(String(DEFAULT_EXPIRY_HOURS));
  const [customHours, setCustomHours] = useState<string>("48");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = target !== null;

  // Reset when opening for a new target.
  useMemo(() => {
    if (open) {
      setPassword("");
      setShowPassword(false);
      setExpiryMode(String(DEFAULT_EXPIRY_HOURS));
      setCustomHours("48");
      setError(null);
    }
  }, [open]);

  function resolveExpiryHours(): number | null {
    if (expiryMode === "custom") {
      const n = Number(customHours);
      if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
      if (n < 2 || n > 336) return null;
      return n;
    }
    const n = Number(expiryMode);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  async function handleSubmit() {
    if (!target) return;
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    const hours = resolveExpiryHours();
    if (hours == null) {
      setError("Expiry must be between 2 and 336 hours (14 days).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/task-lists/${target.taskListId}/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, expiresInHours: hours }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : json.error?.formErrors?.[0] || "Failed to issue link";
        throw new Error(msg);
      }
      onIssued({
        url: json.url,
        password,
        expires_at: json.expires_at,
        expires_in_hours: json.expires_in_hours ?? hours,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to issue link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue leader link</DialogTitle>
        </DialogHeader>
        {target && (
          <p className="text-xs text-muted-foreground -mt-2">
            For task list:{" "}
            <span className="font-medium text-foreground">{target.title}</span>
          </p>
        )}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="leader-password">Password (set by you, share separately)</Label>
            <div className="relative">
              <Input
                id="leader-password"
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="pr-10"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              The leader needs this password to open the form. Share it on a different
              channel from the link itself.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="leader-expiry">Expires in</Label>
            <Select value={expiryMode} onValueChange={setExpiryMode}>
              <SelectTrigger id="leader-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_PRESETS.map((p) => (
                  <SelectItem key={p.hours} value={String(p.hours)}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {expiryMode === "custom" && (
              <div className="pt-2">
                <Label htmlFor="custom-hours" className="text-xs">
                  Hours (2 – 336)
                </Label>
                <Input
                  id="custom-hours"
                  type="number"
                  min={2}
                  max={336}
                  step={1}
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Issuing…" : "Issue link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Result dialog — shows URL + password with copy buttons.             */
/* ------------------------------------------------------------------ */

function IssuedLinkResultDialog({
  result,
  onClose,
}: {
  result: IssueResult | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"url" | "password" | null>(null);

  function copy(value: string, kind: "url" | "password") {
    void navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
  }

  return (
    <Dialog
      open={!!result}
      onOpenChange={(o) => {
        if (!o) {
          setCopied(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leader link ready</DialogTitle>
        </DialogHeader>
        {result && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Share the link and the password using two different channels.</strong>{" "}
              For example: email the link, SMS the password. The password is only shown
              once — you cannot reveal it again from this screen.
            </div>

            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Link
              </Label>
              <div className="flex items-stretch gap-2">
                <p className="flex-1 break-all font-mono text-sm bg-muted p-2 rounded">
                  {result.url}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy(result.url, "url")}
                >
                  {copied === "url" ? <Check size={14} /> : <Copy size={14} />}
                  <span className="ml-1">Copy</span>
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Password
              </Label>
              <div className="flex items-stretch gap-2">
                <p className="flex-1 break-all font-mono text-sm bg-muted p-2 rounded">
                  {result.password}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy(result.password, "password")}
                >
                  {copied === "password" ? <Check size={14} /> : <Copy size={14} />}
                  <span className="ml-1">Copy</span>
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Expires in {result.expires_in_hours} hour
              {result.expires_in_hours === 1 ? "" : "s"}
              {result.expires_at
                ? ` (${new Date(result.expires_at).toLocaleString()})`
                : ""}
              .
            </p>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
