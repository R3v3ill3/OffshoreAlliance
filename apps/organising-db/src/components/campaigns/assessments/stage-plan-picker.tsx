"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { STANDALONE_STAGE_NUMBER } from "@/types/planner-types";
import type { CampaignStagePlanRow } from "@/lib/hooks/useCampaignAmbitionContext";

export type StagePlanPickerProps = {
  plans: CampaignStagePlanRow[];
  value: number | null;
  onChange: (planId: number) => void;
  disabled?: boolean;
};

function stageLabel(plan: CampaignStagePlanRow): string {
  if (plan.stage_number === STANDALONE_STAGE_NUMBER) {
    return "Standalone activities";
  }
  return `Stage ${plan.stage_number}${plan.stage_name ? ` — ${plan.stage_name}` : ""}`;
}

export function StagePlanPicker({ plans, value, onChange, disabled }: StagePlanPickerProps) {
  const sorted = [...plans].sort((a, b) => a.stage_number - b.stage_number);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Attach new ambitions to</Label>
      <Select
        value={value != null ? String(value) : undefined}
        onValueChange={(v) => onChange(Number(v))}
        disabled={disabled || sorted.length === 0}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select stage" />
        </SelectTrigger>
        <SelectContent>
          {sorted.map((plan) => (
            <SelectItem key={plan.plan_id} value={String(plan.plan_id)}>
              <span className="flex items-center gap-2">
                {stageLabel(plan)}
                {plan.status === "active" && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    active
                  </Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
