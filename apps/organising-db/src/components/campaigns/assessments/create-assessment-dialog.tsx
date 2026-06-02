"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssessableAmbitionPicker } from "./assessable-ambition-picker";
import { invalidateCampaignAmbitionCaches } from "@/lib/hooks/useCampaignAmbitionContext";
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
import {
  ACTIVITY_TEMPLATE_OPTIONS,
  BINARY_SUPPORTER_OUTCOME_OPTIONS,
} from "@/lib/campaign/constants";
import { RATING_LEVELS } from "@/types/planner-types";
import { toast } from "sonner";
import type { CampaignActivityTemplateKey } from "@/types/database";

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
      invalidateCampaignAmbitionCaches(queryClient, campaignId);
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
                  {BINARY_SUPPORTER_OUTCOME_OPTIONS.map((option) => (
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
            <div className="border-t pt-3">
              <AssessableAmbitionPicker
                campaignId={campaignId}
                selectedIds={selectedAmbitionIds}
                primaryId={primaryAmbitionId}
                onSelectedIdsChange={setSelectedAmbitionIds}
                onPrimaryIdChange={setPrimaryAmbitionId}
                enabled={open}
              />
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
