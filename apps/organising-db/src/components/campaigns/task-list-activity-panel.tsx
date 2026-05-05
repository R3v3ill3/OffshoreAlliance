"use client";

/**
 * Phase 6 — leader task list activity slide-over.
 *
 * Opens when the staff user clicks "View activity" on a task-list row in
 * `campaign-task-lists.tsx`. Displays the live `TaskListProgressSummary` plus
 * the audit timeline emitted by `/api/campaign-leader/[token]/*` (Phases 2 + 4).
 *
 * Public exports:
 *   - <TaskListActivityPanel campaignId taskListId taskListTitle leaderName open onOpenChange />
 *
 * Auto-refresh: the React-Query call uses `refetchInterval: 30_000`, plus a
 * manual refresh button. Closing the slide-over invalidates the campaign-wide
 * progress-batch query so the row badges in the list page update too.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchApi } from "@/lib/api/fetch-api";
import {
  Activity,
  Edit3,
  KeyRound,
  LogIn,
  RefreshCw,
  ShieldAlert,
  Star,
  UserPlus,
  UserSearch,
  Users,
} from "lucide-react";
import type { TaskListProgressSummary } from "@/lib/campaign/task-list-progress";

interface TimelineEvent {
  event_id: number;
  event_type: string;
  worker_id: number | null;
  worker_name: string | null;
  payload: unknown;
  created_at: string;
  ip_hash_tail: string | null;
}

interface ProgressResponse {
  summary: TaskListProgressSummary;
  events: TimelineEvent[];
  next_cursor: number | null;
}

export function TaskListActivityPanel({
  campaignId,
  taskListId,
  taskListTitle,
  campaignName,
  leaderName,
  status,
  open,
  onOpenChange,
}: {
  campaignId: string | number;
  taskListId: number | null;
  taskListTitle: string;
  campaignName?: string | null;
  leaderName?: string | null;
  status?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [olderEvents, setOlderEvents] = useState<TimelineEvent[]>([]);
  const [olderCursor, setOlderCursor] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Reset accumulated "older" events whenever the panel re-opens against a
  // new task list — otherwise we'd carry stale rows across opens.
  useEffect(() => {
    setOlderEvents([]);
    setOlderCursor(null);
  }, [taskListId, open]);

  const enabled = open && taskListId != null;

  const { data, isLoading, isError, refetch, isFetching, error } = useQuery({
    queryKey: ["task-list-progress", String(campaignId), taskListId ?? -1],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/task-lists/${taskListId}/progress?limit=50`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? "Failed to load progress"
        );
      }
      return (await res.json()) as ProgressResponse;
    },
    enabled,
    refetchInterval: open ? 30_000 : false,
    refetchOnWindowFocus: false,
  });

  // Whenever the live page reloads, reset the cursor so the "Older" walk
  // starts after the freshest first page.
  useEffect(() => {
    if (data) {
      setOlderEvents([]);
      setOlderCursor(data.next_cursor);
    }
  }, [data]);

  async function loadOlder() {
    if (!taskListId || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/task-lists/${taskListId}/progress?cursor=${olderCursor}&limit=50`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? "Failed to load older events"
        );
      }
      const json = (await res.json()) as ProgressResponse;
      setOlderEvents((prev) => [...prev, ...json.events]);
      setOlderCursor(json.next_cursor);
    } catch (e) {
      console.error("loadOlder failed", e);
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Closing — invalidate the campaign-wide batch so row badges refresh.
      queryClient.invalidateQueries({
        queryKey: ["task-list-progress-batch", String(campaignId)],
      });
    }
    onOpenChange(next);
  }

  const summary = data?.summary;
  const liveEvents = data?.events ?? [];
  const allEvents = [...liveEvents, ...olderEvents];

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto p-0"
      >
        <div className="p-6 pb-4 border-b">
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-base">
              {taskListTitle || "Task list"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {campaignName ? <span>{campaignName}</span> : null}
              {campaignName && leaderName ? (
                <span className="text-muted-foreground"> · </span>
              ) : null}
              {leaderName ? <span>Leader: {leaderName}</span> : null}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status ? <StatusPill status={status} /> : null}
            {summary ? (
              <span className="text-xs text-muted-foreground">
                {summary.workers_rated}/{summary.workers_total} rated
                {summary.existing_added + summary.prospective_added > 0
                  ? ` · +${
                      summary.existing_added + summary.prospective_added
                    } added`
                  : ""}
                {summary.workers_edited > 0
                  ? ` · ${summary.workers_edited} edited`
                  : ""}
                {summary.membership_changed > 0
                  ? ` · ${summary.membership_changed} membership`
                  : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          ) : null}

          {isError ? (
            <p className="text-sm text-destructive">
              {error instanceof Error
                ? error.message
                : "Failed to load activity."}
            </p>
          ) : null}

          {!isLoading && !isError && allEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet — once the leader opens the link or saves changes,
              events will appear here.
            </p>
          ) : null}

          <ul className="space-y-2">
            {allEvents.map((e) => (
              <TimelineRow key={e.event_id} event={e} />
            ))}
          </ul>

          {olderCursor != null ? (
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
              >
                {loadingOlder ? "Loading…" : "Older"}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="border-t px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Auto-refreshes every 30 s</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="h-7 gap-1.5"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ----------------------------------------------------------------- */
/* Per-event row                                                     */
/* ----------------------------------------------------------------- */

function TimelineRow({ event }: { event: TimelineEvent }) {
  const meta = describeEvent(event);
  const Icon = meta.icon;
  return (
    <li className="flex gap-3 rounded-md border bg-card px-3 py-2 text-sm">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.tone}`}
      >
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{meta.title}</span>
          {event.worker_name ? (
            <span className="text-xs text-muted-foreground">
              · {event.worker_name}
            </span>
          ) : null}
        </div>
        {meta.detail ? (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">
            {meta.detail}
          </p>
        ) : null}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
          {timeAgo(event.created_at)}
          {event.ip_hash_tail ? ` · ip…${event.ip_hash_tail}` : ""}
        </p>
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------- */
/* Event presentation                                                 */
/* ----------------------------------------------------------------- */

interface EventPresentation {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: string;
  title: string;
  detail: string | null;
}

function describeEvent(e: TimelineEvent): EventPresentation {
  const payload = (e.payload ?? {}) as Record<string, unknown>;
  switch (e.event_type) {
    case "opened":
      return {
        icon: LogIn,
        tone: "bg-muted text-muted-foreground",
        title: "Page opened",
        detail: null,
      };
    case "auth_success":
      return {
        icon: KeyRound,
        tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        title: "Password accepted",
        detail: null,
      };
    case "auth_fail":
      return {
        icon: ShieldAlert,
        tone: "bg-red-500/15 text-red-700 dark:text-red-400",
        title: "Password rejected",
        detail:
          typeof payload.attempts_remaining === "number"
            ? `${payload.attempts_remaining} attempts remaining`
            : null,
      };
    case "rating_saved": {
      const rating = payload.rating;
      const binary = payload.binary_value;
      const bits: string[] = [];
      if (typeof rating === "number") bits.push(`Rated ${rating}/5`);
      if (typeof binary === "string" && binary) bits.push(`Response: ${binary}`);
      return {
        icon: Star,
        tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        title: "Rating saved",
        detail: bits.length > 0 ? bits.join(" · ") : null,
      };
    }
    case "worker_edited": {
      const patch = payload.patch as Record<string, unknown> | undefined;
      const fields = patch ? Object.keys(patch) : [];
      return {
        icon: Edit3,
        tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
        title: "Worker edited",
        detail: fields.length > 0 ? `Fields: ${fields.join(", ")}` : null,
      };
    }
    case "membership_changed": {
      const from = payload.from;
      const to = payload.to;
      return {
        icon: Users,
        tone: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
        title: "Membership changed",
        detail:
          typeof from === "string" && typeof to === "string"
            ? `${from} → ${to}`
            : null,
      };
    }
    case "existing_added":
      return {
        icon: UserSearch,
        tone: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
        title: "Added existing worker",
        detail: null,
      };
    case "prospective_added": {
      const first = payload.first_name;
      const last = payload.last_name;
      const name =
        typeof first === "string" || typeof last === "string"
          ? `${first ?? ""} ${last ?? ""}`.trim()
          : null;
      return {
        icon: UserPlus,
        tone: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
        title: "Added new prospective worker",
        detail: name || null,
      };
    }
    default:
      return {
        icon: Activity,
        tone: "bg-muted text-muted-foreground",
        title: e.event_type,
        detail: null,
      };
  }
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "draft"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`${tone} border-transparent`}>
      {status}
    </Badge>
  );
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

// Exported for the row badge in campaign-task-lists.tsx — share the same
// pretty-printer so both surfaces agree on the relative-time wording.
export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  return timeAgo(iso);
}

