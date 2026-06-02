"use client";

import { useEffect, useState } from "react";
import { useAddAmbition } from "@/lib/hooks/useStagePlan";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import type { CampaignStagePlanRow } from "@/lib/hooks/useCampaignAmbitionContext";

type CustomMetric = "count" | "percentage" | "range" | "boolean";

export type CustomAmbitionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
  stagePlan: CampaignStagePlanRow;
  sortOrder?: number;
  onCreated: (ambitionId: number) => void;
};

export function CustomAmbitionDialog({
  open,
  onOpenChange,
  campaignId,
  stagePlan,
  sortOrder = 0,
  onCreated,
}: CustomAmbitionDialogProps) {
  const addAmbition = useAddAmbition();
  const defaultTargetDate = stagePlan.planned_end_date ?? "";

  const [customStatement, setCustomStatement] = useState("");
  const [customMetric, setCustomMetric] = useState<CustomMetric>("percentage");
  const [customTarget, setCustomTarget] = useState("");
  const [customTargetMax, setCustomTargetMax] = useState("");
  const [customTargetDate, setCustomTargetDate] = useState(defaultTargetDate);

  useEffect(() => {
    if (open) setCustomTargetDate(defaultTargetDate);
  }, [open, defaultTargetDate]);

  async function submit() {
    if (!customStatement.trim()) {
      toast.error("Enter an ambition statement");
      return;
    }
    if (customMetric === "range" && (!customTarget.trim() || !customTargetMax.trim())) {
      toast.error("Enter min and max for a range metric");
      return;
    }
    if (customMetric !== "boolean" && customMetric !== "range" && !customTarget.trim()) {
      toast.error("Enter a success threshold");
      return;
    }

    try {
      const result = await addAmbition.mutateAsync({
        plan_id: stagePlan.plan_id,
        custom_text: customStatement.trim(),
        metric_type: customMetric,
        target_value:
          customMetric === "boolean" ? "true" : customMetric === "range" ? customTarget.trim() : customTarget.trim(),
        target_value_max: customMetric === "range" ? customTargetMax.trim() : undefined,
        target_date: customTargetDate || defaultTargetDate || undefined,
        target_date_user_overridden: !!(customTargetDate && customTargetDate !== defaultTargetDate),
        sort_order: sortOrder,
        ambition_scope: "worker_assessable",
        campaign_id: campaignId,
        stage_number: stagePlan.stage_number,
      });
      const ambitionId = (result as { ambition_id: number }).ambition_id;
      toast.success("Ambition created");
      setCustomStatement("");
      setCustomTarget("");
      setCustomTargetMax("");
      onOpenChange(false);
      onCreated(ambitionId);
    } catch {
      toast.error("Failed to add custom ambition");
    }
  }

  const stageLabel =
    stagePlan.stage_number === 0
      ? "Standalone activities"
      : `Stage ${stagePlan.stage_number}${stagePlan.stage_name ? ` — ${stagePlan.stage_name}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Custom ambition</DialogTitle>
          <DialogDescription>
            Worker-assessable ambition for {stageLabel}. Ratings from linked assessments roll up
            here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Statement</Label>
            <Input
              value={customStatement}
              onChange={(e) => setCustomStatement(e.target.value)}
              placeholder="e.g. 50% supportive in shutdown crew"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Metric</Label>
            <Select
              value={customMetric}
              onValueChange={(v) => setCustomMetric(v as CustomMetric)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="count">Number (count)</SelectItem>
                <SelectItem value="range">Range (min–max)</SelectItem>
                <SelectItem value="boolean">Yes / No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {customMetric === "range" ? (
            <div className="flex gap-2">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Min</Label>
                <Input value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} />
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Max</Label>
                <Input value={customTargetMax} onChange={(e) => setCustomTargetMax(e.target.value)} />
              </div>
            </div>
          ) : customMetric !== "boolean" ? (
            <div className="space-y-1">
              <Label className="text-xs">Success threshold</Label>
              <Input
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                placeholder={customMetric === "percentage" ? "e.g. 50" : "Target value"}
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className="text-xs">Target date</Label>
            <DateInput value={customTargetDate} onChange={setCustomTargetDate} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={addAmbition.isPending}>
            {addAmbition.isPending ? "Adding…" : "Add ambition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
