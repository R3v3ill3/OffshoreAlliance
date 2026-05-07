"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
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
import { ACTIVITY_TEMPLATE_OPTIONS, VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import { RATING_LEVELS } from "@/types/planner-types";
import { toast } from "sonner";
import type { CampaignActivityTemplateKey } from "@/types/database";

type AmbitionRow = {
  ambition_id: number;
  plan_id: number;
  custom_text: string | null;
  stage_number: number;
  stage_name: string | null;
  option_text: string | null;
};

export type CreateAssessmentDialogProps = {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When set, the activity_kind toggle is hidden and the value is hardcoded.
   * Used by the wall-chart surface which only creates assessments.
   */
  lockKind?: "assessment";
  onCreated?: (activityId: number) => void;
};

export function CreateAssessmentDialog({
  campaignId,
  open,
  onOpenChange,
  lockKind,
  onCreated,
}: CreateAssessmentDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [templateChoice, setTemplateChoice] = useState<string>("__custom__");
  const [form, setForm] = useState({
    title: "",
    description: "",
    activity_kind: (lockKind ?? "task") as "task" | "assessment",
    is_binary: false,
    supporter_outcome_value: "",
  });
  const [selectedAmbitionIds, setSelectedAmbitionIds] = useState<Set<number>>(new Set());
  const [primaryAmbitionId, setPrimaryAmbitionId] = useState<number | null>(null);
  const [showCustomLabels, setShowCustomLabels] = useState(false);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});

  const { data: ambitions = [] } = useQuery({
    queryKey: ["campaign-ambitions-assessable", campaignId],
    enabled: open,
    queryFn: async (): Promise<AmbitionRow[]> => {
      const { data, error } = await supabase
        .from("plan_ambitions")
        .select(
          `ambition_id, plan_id, custom_text, ambition_scope,
           plan:campaign_stage_plans!inner(stage_number, stage_name, campaign_id),
           ambition_options(option_text)`
        )
        .eq("plan.campaign_id", Number(campaignId))
        .eq("ambition_scope", "worker_assessable")
        .order("plan_id");
      if (error) throw error;
      type Raw = {
        ambition_id: number;
        plan_id: number;
        custom_text: string | null;
        plan: { stage_number: number; stage_name: string | null } | { stage_number: number; stage_name: string | null }[] | null;
        ambition_options: { option_text: string | null } | { option_text: string | null }[] | null;
      };
      return ((data ?? []) as Raw[]).map((r) => {
        const plan = Array.isArray(r.plan) ? r.plan[0] : r.plan;
        const opt = Array.isArray(r.ambition_options)
          ? r.ambition_options[0]
          : r.ambition_options;
        return {
          ambition_id: r.ambition_id,
          plan_id: r.plan_id,
          custom_text: r.custom_text,
          stage_number: plan?.stage_number ?? 0,
          stage_name: plan?.stage_name ?? null,
          option_text: opt?.option_text ?? null,
        };
      });
    },
  });

  const ambitionsByStage = useMemo(() => {
    const groups = new Map<number, { stage_name: string | null; rows: AmbitionRow[] }>();
    for (const a of ambitions) {
      const bucket = groups.get(a.stage_number) ?? { stage_name: a.stage_name, rows: [] };
      bucket.rows.push(a);
      groups.set(a.stage_number, bucket);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([stage_number, v]) => ({ stage_number, ...v }));
  }, [ambitions]);

  function ambitionLabel(a: AmbitionRow): string {
    return a.custom_text?.trim() || a.option_text || `Ambition #${a.ambition_id}`;
  }

  function resetForm() {
    setForm({
      title: "",
      description: "",
      activity_kind: (lockKind ?? "task") as "task" | "assessment",
      is_binary: false,
      supporter_outcome_value: "",
    });
    setTemplateChoice("__custom__");
    setSelectedAmbitionIds(new Set());
    setPrimaryAmbitionId(null);
    setShowCustomLabels(false);
    setCustomLabels({});
  }

  function toggleAmbition(id: number) {
    setSelectedAmbitionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (primaryAmbitionId === id) {
          const fallback = next.size > 0 ? next.values().next().value ?? null : null;
          setPrimaryAmbitionId(fallback);
        }
      } else {
        next.add(id);
        if (primaryAmbitionId == null) setPrimaryAmbitionId(id);
      }
      return next;
    });
  }

  const createAssessment = useAuthAwareMutation({
    mutationFn: async () => {
      const templateKey =
        templateChoice !== "__custom__" ? (templateChoice as CampaignActivityTemplateKey) : null;
      const fromTemplate = ACTIVITY_TEMPLATE_OPTIONS.find((t) => t.key === templateKey);
      const is_binary =
        fromTemplate?.defaultBinary ?? (templateKey === "vote" ? true : form.is_binary);
      const payload: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        title: form.title || fromTemplate?.label || "Activity",
        activity_kind: lockKind ?? form.activity_kind,
        is_binary,
        is_custom: templateChoice === "__custom__",
        template_key: templateKey,
      };
      if (form.description) payload.description = form.description;
      if (is_binary && form.supporter_outcome_value) {
        payload.supporter_outcome_value = form.supporter_outcome_value;
      } else if (is_binary && templateKey === "vote") {
        payload.supporter_outcome_value = "yes";
      }
      if (!is_binary) {
        const nonEmpty = Object.fromEntries(
          Object.entries(customLabels).filter(([, v]) => v.trim() !== ""),
        );
        if (Object.keys(nonEmpty).length > 0) {
          payload.rating_labels = nonEmpty;
        }
      }
      const { data: inserted, error } = await supabase
        .from("campaign_activities")
        .insert(payload)
        .select("activity_id")
        .single();
      if (error) throw error;
      const activity_id = (inserted as { activity_id: number }).activity_id;

      const ambitionIds = Array.from(selectedAmbitionIds);
      if (ambitionIds.length > 0) {
        const rows = ambitionIds.map((plan_ambition_id) => ({
          activity_id,
          plan_ambition_id,
          is_primary: plan_ambition_id === primaryAmbitionId,
          weight: 1.0,
        }));
        const { error: linkErr } = await supabase.from("activity_ambitions").insert(rows);
        if (linkErr) {
          // Surface but don't roll back the activity itself.
          toast.error(`Activity created, but ambition link failed: ${linkErr.message}`);
        }
      }

      return activity_id;
    },
    onSuccess: (activity_id) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-activities", campaignId] });
      queryClient.invalidateQueries({
        queryKey: ["campaign-ambition-links", campaignId, activity_id],
      });
      toast.success("Assessment created");
      resetForm();
      onOpenChange(false);
      onCreated?.(activity_id);
    },
    onError: (err) => {
      toast.error(`Failed to create assessment: ${(err as Error).message}`);
    },
  });

  const effectiveKind = lockKind ?? form.activity_kind;
  const customTitleRequired = templateChoice === "__custom__" && !form.title.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lockKind === "assessment" ? "Add assessment" : "Add activity"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label>From template</Label>
            <Select value={templateChoice} onValueChange={setTemplateChoice}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__custom__">Custom</SelectItem>
                {ACTIVITY_TEMPLATE_OPTIONS.map((template) => (
                  <SelectItem key={template.key} value={template.key}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Overrides template label if set"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {!lockKind && (
              <div className="space-y-2">
                <Label>Kind</Label>
                <Select
                  value={form.activity_kind}
                  onValueChange={(value) =>
                    setForm({ ...form, activity_kind: value as "task" | "assessment" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="assessment">Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {templateChoice === "__custom__" && (
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_binary}
                    onChange={(event) => setForm({ ...form, is_binary: event.target.checked })}
                  />
                  Binary / vote-style
                </label>
              </div>
            )}
          </div>
          {(form.is_binary || templateChoice === "vote") && (
            <div className="space-y-2">
              <Label>Supporter outcome (for binary)</Label>
              <Select
                value={form.supporter_outcome_value || "yes"}
                onValueChange={(value) => setForm({ ...form, supporter_outcome_value: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOTE_SUPPORTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!form.is_binary && templateChoice !== "vote" && (
            <div className="border-t pt-3 space-y-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowCustomLabels((v) => !v)}
              >
                <span>{showCustomLabels ? "▾" : "▸"}</span>
                Custom rating labels
                <span className="text-[10px] text-muted-foreground">(optional)</span>
              </button>
              {showCustomLabels && (
                <div className="space-y-2 pl-1">
                  <p className="text-xs text-muted-foreground">
                    Override the default 1–5 label text for this specific assessment. Leave blank to
                    keep the default.
                  </p>
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      Keep the scale&apos;s logic consistent
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Custom labels must still reflect the same underlying meaning:
                    </p>
                    <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 pl-3 list-disc">
                      <li><span className="font-medium">1</span> — Supportive leader (actively organises others)</li>
                      <li><span className="font-medium">2</span> — Supporter (supports but doesn&apos;t organise)</li>
                      <li><span className="font-medium">3</span> — Undecided / neutral</li>
                      <li><span className="font-medium">4</span> — Opposed (individually)</li>
                      <li><span className="font-medium">5</span> — Oppositional leader (actively organises opposition)</li>
                    </ul>
                  </div>
                  {RATING_LEVELS.filter((lvl) => lvl.value > 0).map((lvl) => (
                    <div key={lvl.value} className="flex items-center gap-2">
                      <span className="w-4 text-xs font-medium text-muted-foreground shrink-0">
                        {lvl.value}
                      </span>
                      <Input
                        value={customLabels[String(lvl.value)] ?? ""}
                        onChange={(e) =>
                          setCustomLabels((prev) => ({
                            ...prev,
                            [String(lvl.value)]: e.target.value,
                          }))
                        }
                        placeholder={lvl.label}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {effectiveKind === "assessment" && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Linked ambitions</Label>
                <Badge variant="outline" className="text-[10px]">
                  {selectedAmbitionIds.size} selected
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Ratings for this assessment roll up into the selected worker-assessable ambitions.
                Mark exactly one as <span className="font-medium">Primary</span>.
              </p>
              {ambitions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No worker-assessable ambitions exist yet for this campaign. You can still create
                  the assessment and link it later.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded border divide-y">
                  {ambitionsByStage.map((grp) => (
                    <div key={grp.stage_number} className="px-2 py-1.5 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Stage {grp.stage_number}
                        {grp.stage_name ? ` — ${grp.stage_name}` : ""}
                      </p>
                      {grp.rows.map((a) => {
                        const checked = selectedAmbitionIds.has(a.ambition_id);
                        const isPrimary = primaryAmbitionId === a.ambition_id;
                        return (
                          <div key={a.ambition_id} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleAmbition(a.ambition_id)}
                              id={`amb-${a.ambition_id}`}
                            />
                            <label
                              htmlFor={`amb-${a.ambition_id}`}
                              className="flex-1 cursor-pointer"
                            >
                              {ambitionLabel(a)}
                            </label>
                            {checked && (
                              <button
                                type="button"
                                onClick={() => setPrimaryAmbitionId(a.ambition_id)}
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                  isPrimary
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-transparent text-muted-foreground hover:bg-accent"
                                }`}
                              >
                                {isPrimary ? "Primary" : "Mark primary"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
              {selectedAmbitionIds.size === 0 && ambitions.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">
                  Not linked to any ambition — ratings won&apos;t contribute to ambition progress.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createAssessment.mutate()}
            disabled={createAssessment.isPending || customTitleRequired}
          >
            {createAssessment.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
