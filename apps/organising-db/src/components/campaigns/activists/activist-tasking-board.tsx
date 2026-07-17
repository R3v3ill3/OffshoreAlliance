"use client";

/**
 * 4A Tasking board — the tracker's Tasking Log as a kanban over the
 * cycle: Draft → Assigned → In progress → Complete. Completed tasks
 * without a recorded acknowledgement surface an "acknowledge" nudge,
 * and newly recruited activists with no first task get the 48-hour
 * rule callout (Fred Ross: put live wires to work immediately).
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { CampaignWorkerNameButton } from "../campaign-worker-detail-provider";
import { ladderRungFor } from "@/lib/campaign/activist-constants";
import {
  useActivistRegister,
  useActivistTasks,
} from "./use-activist-data";
import { ActivistTaskDialog } from "./activist-task-dialog";
import type { ActivistTaskRow, WorkerOption } from "./types";

const COLUMNS: Array<{
  key: string;
  title: string;
  hint: string;
  statuses: string[];
}> = [
  {
    key: "draft",
    title: "Draft",
    hint: "Being designed — six conditions not yet checked.",
    statuses: ["draft"],
  },
  {
    key: "assigned",
    title: "Assigned",
    hint: "A real ask with a real yes; due date set.",
    statuses: ["assigned"],
  },
  {
    key: "in_progress",
    title: "In progress (assist)",
    hint: "Walk-throughs, inoculation, check-ins.",
    statuses: ["in_progress"],
  },
  {
    key: "complete",
    title: "Complete (acknowledge)",
    hint: "Debrief, recognise, reassess — then go again.",
    statuses: ["complete"],
  },
];

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function daysSince(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000)
  );
}

export function ActivistTaskingBoard({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const { data: tasks = [], isLoading } = useActivistTasks(campaignId);
  const { data: registerRows = [] } = useActivistRegister(campaignId);

  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [dialogTask, setDialogTask] = useState<ActivistTaskRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaultWorker, setDialogDefaultWorker] = useState<
    number | undefined
  >(undefined);

  const activistOptions = useMemo<WorkerOption[]>(
    () =>
      registerRows
        .filter((r) => !r.is_archived)
        .map((r) => {
          const [first, ...rest] = (r.worker_name ?? "").split(" ");
          return {
            worker_id: r.worker_id!,
            first_name: first ?? "",
            last_name: rest.join(" "),
          };
        }),
    [registerRows]
  );

  const nameByWorker = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of registerRows) m.set(r.worker_id!, r.worker_name ?? "");
    return m;
  }, [registerRows]);

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== "cancelled" &&
          (workerFilter === "all" || String(t.worker_id) === workerFilter)
      ),
    [tasks, workerFilter]
  );

  // 48-hour rule: recently recruited activists with no task at all.
  const needFirstTask = useMemo(() => {
    const tasked = new Set(tasks.map((t) => t.worker_id));
    return registerRows.filter(
      (r) =>
        !r.is_archived &&
        !tasked.has(r.worker_id!) &&
        r.recruited_at != null &&
        daysSince(r.recruited_at) <= 7
    );
  }, [registerRows, tasks]);

  const openNew = (workerId?: number) => {
    setDialogTask(null);
    setDialogDefaultWorker(workerId);
    setDialogOpen(true);
  };

  const openEdit = (task: ActivistTaskRow) => {
    setDialogTask(task);
    setDialogDefaultWorker(undefined);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {needFirstTask.length > 0 && canWrite && (
        <Card className="border-amber-400/60">
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="font-medium">48-hour rule:</span>
            <span className="text-muted-foreground">
              new activists without a first task —
            </span>
            {needFirstTask.map((r) => (
              <Button
                key={r.profile_id}
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => openNew(r.worker_id!)}
              >
                {r.worker_name}
                <Plus className="h-3 w-3" />
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={workerFilter} onValueChange={setWorkerFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activists</SelectItem>
            {activistOptions.map((w) => (
              <SelectItem key={w.worker_id} value={String(w.worker_id)}>
                {w.first_name} {w.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canWrite && (
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="h-4 w-4" />
            New 4A task
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colTasks = visibleTasks.filter((t) =>
            col.statuses.includes(t.status)
          );
          return (
            <Card key={col.key} className="min-h-40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {col.title}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({colTasks.length})
                  </span>
                </CardTitle>
                <CardDescription className="text-xs">{col.hint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {colTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tasks.</p>
                ) : (
                  colTasks.map((t) => {
                    const rung = ladderRungFor(t.rung);
                    const needsAck =
                      t.status === "complete" && !t.acknowledgement;
                    return (
                      <div
                        key={t.activist_task_id}
                        role="button"
                        tabIndex={0}
                        className="w-full cursor-pointer rounded-md border p-2.5 text-left transition-colors hover:bg-muted/50"
                        onClick={() => openEdit(t)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") openEdit(t);
                        }}
                      >
                        <CampaignWorkerNameButton workerId={t.worker_id}>
                          <span className="text-xs">
                            {nameByWorker.get(t.worker_id) ?? `#${t.worker_id}`}
                          </span>
                        </CampaignWorkerNameButton>
                        <p className="mt-1 text-sm leading-snug line-clamp-3">
                          {t.responsibility}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {rung && (
                            <Badge variant="outline" className="text-[10px]">
                              {rung.shortLabel}
                            </Badge>
                          )}
                          {t.due_date && (
                            <Badge
                              variant="outline"
                              className={
                                isOverdue(t.due_date) && t.status !== "complete"
                                  ? "text-[10px] border-red-500 text-red-600 dark:text-red-400"
                                  : "text-[10px]"
                              }
                            >
                              due {t.due_date}
                            </Badge>
                          )}
                          {needsAck && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-400"
                            >
                              acknowledge
                            </Badge>
                          )}
                          {t.outcome && (
                            <Badge variant="secondary" className="text-[10px]">
                              {t.outcome === "not_done" ? "not done" : t.outcome}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ActivistTaskDialog
        campaignId={campaignId}
        canWrite={canWrite}
        task={dialogTask}
        defaultWorkerId={dialogDefaultWorker}
        workerOptions={activistOptions}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
