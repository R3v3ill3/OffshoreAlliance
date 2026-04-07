"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
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
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  XCircle,
  Plus,
  Target,
} from "lucide-react";
import type {
  WorkplanTaskType,
  WorkplanTaskStatus,
} from "@/types/database";

const STAGE_NAMES: Record<number, string> = {
  1: "Contact ID & Mapping",
  2: "Intro Comms & Education",
  3: "Member Mobilisation",
  4: "Develop Claims / MSD",
  5: "Endorsement & Commence Bargaining",
  6: "Bargaining to Win",
};

const TASK_TYPES: { value: WorkplanTaskType; label: string }[] = [
  { value: "discovery", label: "Discovery" },
  { value: "outreach", label: "Outreach" },
  { value: "mapping", label: "Mapping" },
  { value: "engagement", label: "Engagement" },
  { value: "admin", label: "Admin" },
  { value: "other", label: "Other" },
];

const TASK_STATUSES: { value: WorkplanTaskStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  planned: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  blocked: AlertTriangle,
  cancelled: XCircle,
};

const STATUS_COLOR: Record<string, string> = {
  planned: "text-muted-foreground",
  in_progress: "text-blue-600",
  completed: "text-green-600",
  blocked: "text-amber-600",
  cancelled: "text-red-400",
};

const PRIORITY_LABELS: Record<number, { label: string; variant: "destructive" | "warning" | "secondary" }> = {
  1: { label: "High", variant: "destructive" },
  2: { label: "Medium", variant: "warning" },
  3: { label: "Low", variant: "secondary" },
};

interface TaskRow {
  task_id: number;
  campaign_id: number;
  stage_number: number;
  plan_ambition_id: number | null;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  assigned_organiser_id: number | null;
  assigned_ou_id: number | null;
  due_date: string | null;
  completed_at: string | null;
  priority: number;
  outcome_notes: string | null;
}

interface AmbitionRow {
  ambition_id: number;
  plan_id: number;
  custom_text: string | null;
  target_value: string | null;
  target_unit: string | null;
  ambition_options: { category: string } | null;
}

interface OuRow {
  ou_id: number;
  name: string;
  ou_type: string;
}

interface OrganiserRow {
  organiser_id: number;
  organiser_name: string;
}

const INITIAL_FORM = {
  title: "",
  description: "",
  task_type: "other" as WorkplanTaskType,
  priority: 2,
  plan_ambition_id: "" as string,
  assigned_organiser_id: "" as string,
  assigned_ou_id: "" as string,
  due_date: "",
};

export function CampaignWorkplanSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [selectedStage, setSelectedStage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const { data: stagePlans = [] } = useQuery({
    queryKey: ["campaign-stage-plans", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_stage_plans")
        .select("plan_id, stage_number, stage_name, status, workplan_status")
        .eq("campaign_id", Number(campaignId))
        .order("stage_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ["campaign-workplan-tasks", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_stage_workplan_tasks")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .order("priority")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });

  const currentPlan = stagePlans.find(
    (p: { stage_number: number }) => p.stage_number === selectedStage
  );

  const { data: ambitions = [] } = useQuery({
    queryKey: ["campaign-ambitions", campaignId, currentPlan?.plan_id],
    queryFn: async () => {
      if (!currentPlan) return [];
      const { data, error } = await supabase
        .from("plan_ambitions")
        .select("ambition_id, plan_id, custom_text, target_value, target_unit, ambition_options(category)")
        .eq("plan_id", currentPlan.plan_id);
      if (error) throw error;
      return (data ?? []) as unknown as AmbitionRow[];
    },
    enabled: !!currentPlan,
  });

  const { data: ous = [] } = useQuery({
    queryKey: ["campaign-ous-select", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, name, ou_type")
        .eq("campaign_id", Number(campaignId))
        .order("name");
      if (error) throw error;
      return (data ?? []) as OuRow[];
    },
  });

  const { data: organisers = [] } = useQuery({
    queryKey: ["organisers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisers")
        .select("organiser_id, organiser_name")
        .order("organiser_name");
      if (error) throw error;
      return (data ?? []) as OrganiserRow[];
    },
  });

  const stageTasks = useMemo(
    () => allTasks.filter((t) => t.stage_number === selectedStage),
    [allTasks, selectedStage]
  );

  const stageTaskCounts = useMemo(() => {
    const counts: Record<number, { total: number; completed: number }> = {};
    for (let s = 1; s <= 6; s++) counts[s] = { total: 0, completed: 0 };
    for (const t of allTasks) {
      if (!counts[t.stage_number]) counts[t.stage_number] = { total: 0, completed: 0 };
      if (t.status !== "cancelled") counts[t.stage_number].total++;
      if (t.status === "completed") counts[t.stage_number].completed++;
    }
    return counts;
  }, [allTasks]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<number | null, TaskRow[]>();
    for (const t of stageTasks) {
      const key = t.plan_ambition_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return groups;
  }, [stageTasks]);

  const createTask = useMutation({
    mutationFn: async (payload: typeof form) => {
      const row: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        stage_number: selectedStage,
        title: payload.title,
        description: payload.description || null,
        task_type: payload.task_type,
        priority: payload.priority,
        due_date: payload.due_date || null,
      };
      if (payload.plan_ambition_id) row.plan_ambition_id = Number(payload.plan_ambition_id);
      if (payload.assigned_organiser_id) row.assigned_organiser_id = Number(payload.assigned_organiser_id);
      if (payload.assigned_ou_id) row.assigned_ou_id = Number(payload.assigned_ou_id);

      const { error } = await supabase
        .from("campaign_stage_workplan_tasks")
        .insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-workplan-tasks", campaignId] });
      setDialogOpen(false);
      setForm(INITIAL_FORM);
    },
  });

  const updateTask = useMutation({
    mutationFn: async (vars: { task_id: number; updates: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("campaign_stage_workplan_tasks")
        .update(vars.updates)
        .eq("task_id", vars.task_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-workplan-tasks", campaignId] });
      setEditTask(null);
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: async (vars: { task_id: number; status: string }) => {
      const updates: Record<string, unknown> = { status: vars.status };
      if (vars.status === "completed") updates.completed_at = new Date().toISOString();
      else updates.completed_at = null;
      const { error } = await supabase
        .from("campaign_stage_workplan_tasks")
        .update(updates)
        .eq("task_id", vars.task_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-workplan-tasks", campaignId] });
    },
  });

  function openEdit(task: TaskRow) {
    setEditTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      task_type: task.task_type as WorkplanTaskType,
      priority: task.priority,
      plan_ambition_id: task.plan_ambition_id?.toString() || "",
      assigned_organiser_id: task.assigned_organiser_id?.toString() || "",
      assigned_ou_id: task.assigned_ou_id?.toString() || "",
      due_date: task.due_date || "",
    });
  }

  function handleSave() {
    if (editTask) {
      const updates: Record<string, unknown> = {
        title: form.title,
        description: form.description || null,
        task_type: form.task_type,
        priority: form.priority,
        due_date: form.due_date || null,
        plan_ambition_id: form.plan_ambition_id ? Number(form.plan_ambition_id) : null,
        assigned_organiser_id: form.assigned_organiser_id ? Number(form.assigned_organiser_id) : null,
        assigned_ou_id: form.assigned_ou_id ? Number(form.assigned_ou_id) : null,
      };
      updateTask.mutate({ task_id: editTask.task_id, updates });
    } else {
      createTask.mutate(form);
    }
  }

  function ambitionLabel(a: AmbitionRow): string {
    let text = a.custom_text ?? "Ambition";
    if (a.target_value) {
      text = text.replace("{target_value}", a.target_value);
    }
    return text;
  }

  function renderTaskCard(task: TaskRow) {
    const Icon = STATUS_ICON[task.status] || Circle;
    const color = STATUS_COLOR[task.status] || "";
    const ou = ous.find((o) => o.ou_id === task.assigned_ou_id);
    const org = organisers.find((o) => o.organiser_id === task.assigned_organiser_id);
    const pri = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[2];

    return (
      <div
        key={task.task_id}
        className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
      >
        <button
          className={`mt-0.5 flex-shrink-0 ${color}`}
          disabled={!canWrite}
          onClick={() => {
            const next =
              task.status === "planned"
                ? "in_progress"
                : task.status === "in_progress"
                ? "completed"
                : task.status === "completed"
                ? "planned"
                : task.status;
            updateTaskStatus.mutate({ task_id: task.task_id, status: next });
          }}
          title={`Status: ${task.status}. Click to cycle.`}
        >
          <Icon className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}
            >
              {task.title}
            </span>
            <Badge variant={pri.variant} className="text-[10px] px-1.5 py-0">
              {pri.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {task.task_type.replace(/_/g, " ")}
            </Badge>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {org && <span>{org.organiser_name}</span>}
            {ou && (
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {ou.name}
              </span>
            )}
            {task.due_date && <span>Due: {task.due_date}</span>}
          </div>
        </div>
        {canWrite && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs flex-shrink-0"
            onClick={() => openEdit(task)}
          >
            Edit
          </Button>
        )}
      </div>
    );
  }

  const activeCount = stageTaskCounts[selectedStage]?.total || 0;
  const completedCount = stageTaskCounts[selectedStage]?.completed || 0;
  const completionPct = activeCount > 0 ? Math.round((completedCount / activeCount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Stage selector pills */}
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5, 6].map((s) => {
          const counts = stageTaskCounts[s];
          const isActive = s === selectedStage;
          const plan = stagePlans.find((p: { stage_number: number }) => p.stage_number === s);
          return (
            <button
              key={s}
              onClick={() => setSelectedStage(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              Stage {s}
              {counts.total > 0 && (
                <span className="ml-1.5 opacity-80">
                  {counts.completed}/{counts.total}
                </span>
              )}
              {!plan && <span className="ml-1 opacity-60">(no plan)</span>}
            </button>
          );
        })}
      </div>

      {/* Stage header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">
                Stage {selectedStage}: {STAGE_NAMES[selectedStage]}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {currentPlan && (
                  <Badge variant="outline" className="text-xs">
                    Plan: {(currentPlan as { status: string }).status}
                  </Badge>
                )}
                {activeCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {completedCount}/{activeCount} tasks ({completionPct}%)
                  </span>
                )}
              </div>
            </div>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => {
                  setEditTask(null);
                  setForm(INITIAL_FORM);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add task
              </Button>
            )}
          </div>
          {activeCount > 0 && (
            <Progress value={completionPct} className="mt-2 h-1.5" />
          )}
        </CardHeader>
      </Card>

      {/* Non-plan warning */}
      {!currentPlan && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3">
            <p className="text-sm text-amber-800">
              No strategic plan exists for this stage yet. You can still create workplan tasks --
              they will be linked once a plan is created in the OA Planner.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Draft plan info */}
      {currentPlan && (currentPlan as { status: string }).status === "draft" && stageTasks.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <p className="text-sm text-blue-800">
              Stage {selectedStage} plan is still in draft. Tasks may evolve as the plan is refined.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tasks grouped by ambition */}
      {stageTasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Circle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No workplan tasks for this stage</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add tasks to track operational work toward stage ambitions
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Tasks linked to ambitions */}
          {ambitions.map((amb) => {
            const tasks = groupedTasks.get(amb.ambition_id) || [];
            if (tasks.length === 0) return null;
            const done = tasks.filter((t) => t.status === "completed").length;
            const active = tasks.filter((t) => t.status !== "cancelled").length;
            return (
              <Card key={amb.ambition_id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {ambitionLabel(amb)}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {done}/{active}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tasks.map(renderTaskCard)}
                </CardContent>
              </Card>
            );
          })}

          {/* Unlinked tasks */}
          {groupedTasks.has(null) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  General tasks (not linked to an ambition)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {groupedTasks.get(null)!.map(renderTaskCard)}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog
        open={dialogOpen || !!editTask}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditTask(null);
            setForm(INITIAL_FORM);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTask ? "Edit task" : `New task — Stage ${selectedStage}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Map crew rotations for Platform X"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Optional details..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Task type</Label>
                <Select
                  value={form.task_type}
                  onValueChange={(v) => setForm({ ...form, task_type: v as WorkplanTaskType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority.toString()}
                  onValueChange={(v) => setForm({ ...form, priority: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">High</SelectItem>
                    <SelectItem value="2">Medium</SelectItem>
                    <SelectItem value="3">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {ambitions.length > 0 && (
              <div className="space-y-1.5">
                <Label>Linked ambition</Label>
                <Select
                  value={form.plan_ambition_id || "__none__"}
                  onValueChange={(v) =>
                    setForm({ ...form, plan_ambition_id: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {ambitions.map((a) => (
                      <SelectItem key={a.ambition_id} value={a.ambition_id.toString()}>
                        {ambitionLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Assigned organiser</Label>
                <Select
                  value={form.assigned_organiser_id || "__none__"}
                  onValueChange={(v) =>
                    setForm({ ...form, assigned_organiser_id: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {organisers.map((o) => (
                      <SelectItem key={o.organiser_id} value={o.organiser_id.toString()}>
                        {o.organiser_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Organising unit</Label>
                <Select
                  value={form.assigned_ou_id || "__none__"}
                  onValueChange={(v) =>
                    setForm({ ...form, assigned_ou_id: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {ous.map((o) => (
                      <SelectItem key={o.ou_id} value={o.ou_id.toString()}>
                        {o.name} ({o.ou_type.replace(/_/g, " ")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            {editTask && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={editTask.status}
                  onValueChange={(v) => {
                    updateTaskStatus.mutate({ task_id: editTask.task_id, status: v });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setEditTask(null);
                setForm(INITIAL_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!form.title || createTask.isPending || updateTask.isPending}
              onClick={handleSave}
            >
              {editTask ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
