"use client";

/**
 * 4A Tasking Worksheet dialog — one task cycle per activist.
 *
 * Mirrors the paper tool: Assign (responsibility not errand, why it
 * matters, rung, resources, commitment), Assist (walk-through,
 * inoculation, check-ins) and Acknowledge (outcome, debrief,
 * recognition, reassessment). The six conditions for learning gate
 * the move from draft to assigned.
 *
 * Saving also advances the activist's profile 4A stage:
 * draft → assign · assigned/in progress → assist · complete → acknowledge.
 * A completed task with outcome "done" lifts the profile's current
 * rung to the task's rung.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVIST_TASK_OUTCOMES,
  ACTIVIST_TASK_STATUSES,
  LADDER_RUNGS,
  SIX_CONDITIONS,
  type ActivistTaskStatus,
} from "@/lib/campaign/activist-constants";
import { invalidateActivistData, useSaveActivistTask } from "./use-activist-data";
import type { ActivistTaskRow, WorkerOption } from "./types";
import { workerOptionName } from "./types";

const NONE = "__none__";

type TaskForm = {
  worker_id: string;
  status: ActivistTaskStatus;
  responsibility: string;
  why_it_matters: string;
  campaign_moment: string;
  rung: string;
  resources_provided: string;
  commitment: string;
  assigned_at: string;
  due_date: string;
  walkthrough_plan: string;
  inoculation: string;
  six_conditions: Record<string, boolean>;
  outcome: string;
  outcome_notes: string;
  debrief_date: string;
  acknowledgement: string;
  reassessment_notes: string;
};

function emptyForm(workerId?: number): TaskForm {
  return {
    worker_id: workerId != null ? String(workerId) : "",
    status: "draft",
    responsibility: "",
    why_it_matters: "",
    campaign_moment: "",
    rung: NONE,
    resources_provided: "",
    commitment: "",
    assigned_at: "",
    due_date: "",
    walkthrough_plan: "",
    inoculation: "",
    six_conditions: {},
    outcome: NONE,
    outcome_notes: "",
    debrief_date: "",
    acknowledgement: "",
    reassessment_notes: "",
  };
}

function formFromTask(task: ActivistTaskRow): TaskForm {
  return {
    worker_id: String(task.worker_id),
    status: task.status as ActivistTaskStatus,
    responsibility: task.responsibility ?? "",
    why_it_matters: task.why_it_matters ?? "",
    campaign_moment: task.campaign_moment ?? "",
    rung: task.rung != null ? String(task.rung) : NONE,
    resources_provided: task.resources_provided ?? "",
    commitment: task.commitment ?? "",
    assigned_at: task.assigned_at ?? "",
    due_date: task.due_date ?? "",
    walkthrough_plan: task.walkthrough_plan ?? "",
    inoculation: task.inoculation ?? "",
    six_conditions: (task.six_conditions as Record<string, boolean> | null) ?? {},
    outcome: task.outcome ?? NONE,
    outcome_notes: task.outcome_notes ?? "",
    debrief_date: task.debrief_date ?? "",
    acknowledgement: task.acknowledgement ?? "",
    reassessment_notes: task.reassessment_notes ?? "",
  };
}

/** Profile 4A stage implied by a task's status. */
function stageForStatus(status: ActivistTaskStatus): string | null {
  switch (status) {
    case "draft":
      return "assign";
    case "assigned":
    case "in_progress":
      return "assist";
    case "complete":
      return "acknowledge";
    default:
      return null;
  }
}

export function ActivistTaskDialog({
  campaignId,
  canWrite,
  task,
  defaultWorkerId,
  workerOptions,
  open,
  onOpenChange,
  wocMeetingId,
}: {
  campaignId: string;
  canWrite: boolean;
  /** Existing task to edit, or null to create. */
  task: ActivistTaskRow | null;
  defaultWorkerId?: number;
  workerOptions: WorkerOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When creating from a WOC meeting, link the task to that meeting. */
  wocMeetingId?: number | null;
}) {
  if (!open) return null;
  return (
    <ActivistTaskDialogInner
      key={task?.activist_task_id ?? `new-${defaultWorkerId ?? "any"}`}
      campaignId={campaignId}
      canWrite={canWrite}
      task={task}
      defaultWorkerId={defaultWorkerId}
      workerOptions={workerOptions}
      onOpenChange={onOpenChange}
      wocMeetingId={wocMeetingId}
    />
  );
}

function ActivistTaskDialogInner({
  campaignId,
  canWrite,
  task,
  defaultWorkerId,
  workerOptions,
  onOpenChange,
  wocMeetingId,
}: {
  campaignId: string;
  canWrite: boolean;
  task: ActivistTaskRow | null;
  defaultWorkerId?: number;
  workerOptions: WorkerOption[];
  onOpenChange: (open: boolean) => void;
  wocMeetingId?: number | null;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const saveMutation = useSaveActivistTask(campaignId);
  const [form, setForm] = useState<TaskForm>(() =>
    task ? formFromTask(task) : emptyForm(defaultWorkerId)
  );

  const set = (patch: Partial<TaskForm>) => setForm((f) => ({ ...f, ...patch }));

  const allConditionsMet = useMemo(
    () => SIX_CONDITIONS.every((c) => form.six_conditions[c.key]),
    [form.six_conditions]
  );

  const movingBeyondDraft = form.status !== "draft" && form.status !== "cancelled";
  const blockedBySixConditions = movingBeyondDraft && !allConditionsMet;

  const save = async () => {
    if (!form.worker_id) {
      toast.error("Pick an activist for this task.");
      return;
    }
    if (!form.responsibility.trim()) {
      toast.error("Write the responsibility — the outcome they own.");
      return;
    }
    if (blockedBySixConditions) {
      toast.error(
        "Check all six conditions before moving this task beyond draft."
      );
      return;
    }

    const shared = {
      status: form.status,
      responsibility: form.responsibility.trim(),
      why_it_matters: form.why_it_matters || null,
      campaign_moment: form.campaign_moment || null,
      rung: form.rung === NONE ? null : Number(form.rung),
      resources_provided: form.resources_provided || null,
      commitment: form.commitment || null,
      assigned_at:
        form.assigned_at ||
        (form.status !== "draft" ? new Date().toISOString().slice(0, 10) : null),
      due_date: form.due_date || null,
      walkthrough_plan: form.walkthrough_plan || null,
      inoculation: form.inoculation || null,
      six_conditions: form.six_conditions,
      outcome: form.outcome === NONE ? null : form.outcome,
      outcome_notes: form.outcome_notes || null,
      debrief_date: form.debrief_date || null,
      acknowledgement: form.acknowledgement || null,
      reassessment_notes: form.reassessment_notes || null,
    };

    saveMutation.mutate(
      task
        ? { kind: "update", taskId: task.activist_task_id, update: shared }
        : {
            kind: "insert",
            insert: {
              campaign_id: Number(campaignId),
              worker_id: Number(form.worker_id),
              set_in_woc_meeting_id: wocMeetingId ?? null,
              ...shared,
            },
          },
      {
        onSuccess: async () => {
          // Advance the profile's 4A stage (and rung on a done task).
          const stage = stageForStatus(form.status);
          const workerId = Number(form.worker_id);
          if (stage) {
            const update: Record<string, unknown> = { four_a_stage: stage };
            if (
              form.status === "complete" &&
              form.outcome === "done" &&
              form.rung !== NONE
            ) {
              const { data: profile } = await supabase
                .from("campaign_activist_profiles")
                .select("current_rung")
                .eq("campaign_id", Number(campaignId))
                .eq("worker_id", workerId)
                .maybeSingle();
              const rung = Number(form.rung);
              if (!profile?.current_rung || rung > profile.current_rung) {
                update.current_rung = rung;
              }
            }
            await supabase
              .from("campaign_activist_profiles")
              .update(update)
              .eq("campaign_id", Number(campaignId))
              .eq("worker_id", workerId);
          }
          invalidateActivistData(queryClient, campaignId);
          toast.success(task ? "Task updated" : "Task created");
          onOpenChange(false);
        },
      }
    );
  };

  const workerName =
    workerOptions.find((w) => String(w.worker_id) === form.worker_id) ?? null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {task
              ? `4A task — ${workerName ? workerOptionName(workerName) : ""}`
              : "New 4A task"}
          </DialogTitle>
          <DialogDescription>
            One worksheet per activist per task cycle: assign a responsibility
            (not an errand), plan the assist, acknowledge the work — then go
            again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* ── Assign ────────────────────────────────────────────── */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Assign</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Activist</Label>
                <Select
                  value={form.worker_id}
                  onValueChange={(v) => set({ worker_id: v })}
                  disabled={!!task}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an activist…" />
                  </SelectTrigger>
                  <SelectContent>
                    {workerOptions.map((w) => (
                      <SelectItem key={w.worker_id} value={String(w.worker_id)}>
                        {workerOptionName(w)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => set({ status: v as ActivistTaskStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVIST_TASK_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="task-resp">
                  Responsibility — the outcome they own *
                </Label>
                <Textarea
                  id="task-resp"
                  rows={2}
                  placeholder={
                    "e.g. Get all 12 of crew B onto the group chat and across the ballot timing"
                  }
                  value={form.responsibility}
                  onChange={(e) => set({ responsibility: e.target.value })}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="task-why">
                  Why it matters (the one-liner they could repeat at smoko)
                </Label>
                <Input
                  id="task-why"
                  value={form.why_it_matters}
                  onChange={(e) => set({ why_it_matters: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-moment">Campaign moment this serves</Label>
                <Input
                  id="task-moment"
                  placeholder="Ballot, NERR, bargaining, mapping…"
                  value={form.campaign_moment}
                  onChange={(e) => set({ campaign_moment: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Ladder rung (stretch, not swamp)</Label>
                <Select value={form.rung} onValueChange={(v) => set({ rung: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {LADDER_RUNGS.map((r) => (
                      <SelectItem key={r.value} value={String(r.value)}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-assigned">Assigned on</Label>
                <Input
                  id="task-assigned"
                  type="date"
                  value={form.assigned_at}
                  onChange={(e) => set({ assigned_at: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-due">Due date</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => set({ due_date: e.target.value })}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="task-resources">
                  Resources provided (lists, materials, contacts, scripts)
                </Label>
                <Input
                  id="task-resources"
                  value={form.resources_provided}
                  onChange={(e) => set({ resources_provided: e.target.value })}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="task-commitment">
                  Their commitment — specific action, specific date (a soft yes is
                  a sure no)
                </Label>
                <Input
                  id="task-commitment"
                  value={form.commitment}
                  onChange={(e) => set({ commitment: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* ── Assist ────────────────────────────────────────────── */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Assist</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-walkthrough">Walk-through plan</Label>
                <Textarea
                  id="task-walkthrough"
                  rows={2}
                  placeholder="Will you do it with them the first time? When?"
                  value={form.walkthrough_plan}
                  onChange={(e) => set({ walkthrough_plan: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-inoculation">Inoculation</Label>
                <Textarea
                  id="task-inoculation"
                  rows={2}
                  placeholder="What will the company / the crib-room cynic say — and the response?"
                  value={form.inoculation}
                  onChange={(e) => set({ inoculation: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* ── Six conditions ────────────────────────────────────── */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">
              Six conditions for learning
              {blockedBySixConditions && (
                <span className="ml-2 text-xs font-normal text-red-600 dark:text-red-400">
                  all six required before the task leaves draft
                </span>
              )}
            </h4>
            <div className="space-y-2">
              {SIX_CONDITIONS.map((c) => (
                <label key={c.key} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={!!form.six_conditions[c.key]}
                    onCheckedChange={(checked) =>
                      set({
                        six_conditions: {
                          ...form.six_conditions,
                          [c.key]: checked === true,
                        },
                      })
                    }
                    className="mt-0.5"
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Acknowledge ───────────────────────────────────────── */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">
              Acknowledge (complete after the task)
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Outcome vs the responsibility</Label>
                <Select
                  value={form.outcome}
                  onValueChange={(v) => set({ outcome: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not debriefed yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not debriefed yet</SelectItem>
                    {ACTIVIST_TASK_OUTCOMES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-debrief">Debrief date</Label>
                <Input
                  id="task-debrief"
                  type="date"
                  value={form.debrief_date}
                  onChange={(e) => set({ debrief_date: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="task-outcome-notes">
                  What happened / what got in the way (problem-solve, never ignore)
                </Label>
                <Textarea
                  id="task-outcome-notes"
                  rows={2}
                  value={form.outcome_notes}
                  onChange={(e) => set({ outcome_notes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-ack">
                  Recognition — what, when, where (WOC, group chat, in person)
                </Label>
                <Input
                  id="task-ack"
                  value={form.acknowledgement}
                  onChange={(e) => set({ acknowledgement: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-reassess">
                  Reassessment — what did this reveal? New rung reached?
                </Label>
                <Input
                  id="task-reassess"
                  value={form.reassessment_notes}
                  onChange={(e) => set({ reassessment_notes: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {canWrite && (
            <Button onClick={save} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save task"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
