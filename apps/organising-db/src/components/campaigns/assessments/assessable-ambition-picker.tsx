"use client";

import { useMemo, useState } from "react";
import { useAddAmbition } from "@/lib/hooks/useStagePlan";
import { useAmbitionOptions } from "@/lib/hooks/usePlannerOptions";
import {
  useAssessableAmbitions,
  useCampaignStagePlansForAmbitions,
  type AssessableAmbitionRow,
} from "@/lib/hooks/useCampaignAmbitionContext";
import { OptionSelector, type SelectableOption } from "@/components/campaigns/planning/OptionSelector";
import { CustomAmbitionDialog } from "./custom-ambition-dialog";
import { StagePlanPicker } from "./stage-plan-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { formatCategoryLabel } from "@/lib/utils/option-sorting";
import { STANDALONE_STAGE_NUMBER } from "@/types/planner-types";
import type { AmbitionScope } from "@/types/planner-types";
import { toast } from "sonner";

function mapVariableTypeToMetric(
  variableType: string | null | undefined
): string | undefined {
  if (!variableType) return undefined;
  if (variableType === "number") return "count";
  if (variableType === "percentage") return "percentage";
  if (variableType === "date") return "date";
  return undefined;
}

function ambitionLabel(a: AssessableAmbitionRow): string {
  return a.custom_text?.trim() || a.option_text || `Ambition #${a.ambition_id}`;
}

export type AssessableAmbitionPickerProps = {
  campaignId: string;
  selectedIds: Set<number>;
  primaryId: number | null;
  onSelectedIdsChange: (ids: Set<number>) => void;
  onPrimaryIdChange: (id: number | null) => void;
  /** When false, hide stage picker and catalog (link-only mode). */
  allowCreate?: boolean;
  /** When false, skip data fetching (e.g. closed dialog). */
  enabled?: boolean;
};

export function AssessableAmbitionPicker({
  campaignId,
  selectedIds,
  primaryId,
  onSelectedIdsChange,
  onPrimaryIdChange,
  allowCreate = true,
  enabled = true,
}: AssessableAmbitionPickerProps) {
  const numericCampaignId = Number(campaignId);
  const [createPlanId, setCreatePlanId] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  const { data: stageData, isLoading: stagesLoading } = useCampaignStagePlansForAmbitions(
    campaignId,
    enabled
  );
  const { data: ambitions = [], isLoading: ambitionsLoading } = useAssessableAmbitions(
    campaignId,
    enabled
  );
  const addAmbition = useAddAmbition();

  const plans = stageData?.plans ?? [];
  const effectiveCreatePlanId = createPlanId ?? stageData?.defaultPlanId ?? null;
  const createStagePlan = plans.find((p) => p.plan_id === effectiveCreatePlanId) ?? null;
  const createStageNumber = createStagePlan?.stage_number ?? 1;

  const { data: catalogOptions = [] } = useAmbitionOptions(
    createStageNumber > STANDALONE_STAGE_NUMBER ? createStageNumber : 1
  );

  const ambitionsByStage = useMemo(() => {
    const groups = new Map<number, { stage_name: string | null; rows: AssessableAmbitionRow[] }>();
    for (const a of ambitions) {
      const bucket = groups.get(a.stage_number) ?? { stage_name: a.stage_name, rows: [] };
      bucket.rows.push(a);
      groups.set(a.stage_number, bucket);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([stage_number, v]) => ({ stage_number, ...v }));
  }, [ambitions]);

  const ambitionsOnCreatePlan = useMemo(
    () => ambitions.filter((a) => a.plan_id === effectiveCreatePlanId),
    [ambitions, effectiveCreatePlanId]
  );

  const catalogSelectedOptionIds = useMemo(
    () =>
      ambitionsOnCreatePlan
        .filter((a) => selectedIds.has(a.ambition_id) && a.ambition_option_id != null)
        .map((a) => a.ambition_option_id as number),
    [ambitionsOnCreatePlan, selectedIds]
  );

  function toggleAmbition(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
      if (primaryId === id) {
        onPrimaryIdChange(next.size > 0 ? (next.values().next().value ?? null) : null);
      }
    } else {
      next.add(id);
      if (primaryId == null) onPrimaryIdChange(id);
    }
    onSelectedIdsChange(next);
  }

  function selectAmbitionId(id: number) {
    const next = new Set(selectedIds);
    next.add(id);
    onSelectedIdsChange(next);
    if (primaryId == null) onPrimaryIdChange(id);
  }

  const selectableOptions: SelectableOption[] = catalogOptions.map((o) => ({
    id: o.option_id,
    text: o.option_text.replace("{target_value}", "___"),
    description: formatCategoryLabel(o.category),
    category: o.category,
    use_count: o.use_count,
    is_system_default: o.is_system_default,
  }));

  async function handleCatalogSelect(option: SelectableOption) {
    if (!createStagePlan) return;
    const fullOption = catalogOptions.find((o) => o.option_id === option.id);
    if (!fullOption) return;

    const existing = ambitionsOnCreatePlan.find((a) => a.ambition_option_id === option.id);
    if (existing) {
      selectAmbitionId(existing.ambition_id);
      return;
    }

    const optionScope = (fullOption.default_scope as AmbitionScope | undefined) ?? "worker_assessable";
    if (optionScope !== "worker_assessable") {
      toast.error("Only worker-assessable ambitions can link to assessments");
      return;
    }

    try {
      const result = await addAmbition.mutateAsync({
        plan_id: createStagePlan.plan_id,
        ambition_option_id: option.id,
        target_unit: fullOption.variable_type || undefined,
        metric_type: mapVariableTypeToMetric(fullOption.variable_type),
        target_date: createStagePlan.planned_end_date || undefined,
        sort_order: ambitionsOnCreatePlan.length,
        ambition_scope: "worker_assessable",
        campaign_id: numericCampaignId,
        stage_number: createStagePlan.stage_number,
      });
      selectAmbitionId((result as { ambition_id: number }).ambition_id);
    } catch {
      toast.error("Failed to add ambition from catalog");
    }
  }

  function handleCatalogDeselect(optionId: number) {
    const fullOption = catalogOptions.find((o) => o.option_id === optionId);
    if (!fullOption) return;
    const existing = ambitionsOnCreatePlan.find((a) => a.ambition_option_id === optionId);
    if (!existing) return;
    toggleAmbition(existing.ambition_id);
  }

  const isLoading = stagesLoading || ambitionsLoading;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Linked ambitions</Label>
        <Badge variant="outline" className="text-[10px]">
          {selectedIds.size} selected
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Ratings for this assessment roll up into selected worker-assessable ambitions.
        Mark one as <span className="font-medium">Primary</span> when several are linked.
      </p>

      {allowCreate && (
        <div className="space-y-2 rounded-md border p-3 bg-muted/30">
          <p className="text-xs font-medium">Add ambitions</p>
          {plans.length > 0 && (
            <StagePlanPicker
              plans={plans}
              value={effectiveCreatePlanId}
              onChange={setCreatePlanId}
              disabled={isLoading}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={!createStagePlan}
              onClick={() => setCustomOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Custom ambition
            </Button>
            {createStagePlan && createStagePlan.stage_number > STANDALONE_STAGE_NUMBER && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setShowCatalog((v) => !v)}
              >
                {showCatalog ? "Hide catalog" : "Browse catalog"}
              </Button>
            )}
          </div>
          {createStagePlan?.stage_number === STANDALONE_STAGE_NUMBER && (
            <p className="text-[11px] text-muted-foreground">
              Standalone stage has no catalog — use custom ambitions, or pick a P2W/B2W stage
              above to browse suggested ambitions.
            </p>
          )}
          {showCatalog && createStagePlan && createStagePlan.stage_number > STANDALONE_STAGE_NUMBER && (
            <OptionSelector
              options={selectableOptions}
              selectedIds={catalogSelectedOptionIds}
              onSelect={handleCatalogSelect}
              onDeselect={handleCatalogDeselect}
              multiSelect
              libraryHeading="Suggested ambitions for this stage"
              maxHeight="12rem"
            />
          )}
          {createStagePlan && (
            <CustomAmbitionDialog
              open={customOpen}
              onOpenChange={setCustomOpen}
              campaignId={numericCampaignId}
              stagePlan={createStagePlan}
              sortOrder={ambitionsOnCreatePlan.length}
              onCreated={(ambitionId) => selectAmbitionId(ambitionId)}
            />
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground italic">Loading ambitions…</p>
      ) : ambitions.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No worker-assessable ambitions yet. Add one above, or create them in the campaign
          planner.
        </p>
      ) : (
        <div className="max-h-52 overflow-y-auto rounded border divide-y">
          {ambitionsByStage.map((grp) => (
            <div key={grp.stage_number} className="px-2 py-1.5 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {grp.stage_number === STANDALONE_STAGE_NUMBER
                  ? "Standalone activities"
                  : `Stage ${grp.stage_number}${grp.stage_name ? ` — ${grp.stage_name}` : ""}`}
              </p>
              {grp.rows.map((a) => {
                const checked = selectedIds.has(a.ambition_id);
                const isPrimary = primaryId === a.ambition_id;
                return (
                  <div key={a.ambition_id} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleAmbition(a.ambition_id)}
                      id={`assess-amb-${a.ambition_id}`}
                    />
                    <label htmlFor={`assess-amb-${a.ambition_id}`} className="flex-1 cursor-pointer">
                      {ambitionLabel(a)}
                    </label>
                    {checked && (
                      <button
                        type="button"
                        onClick={() => onPrimaryIdChange(a.ambition_id)}
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

      {selectedIds.size === 0 && ambitions.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-500">
          Not linked to any ambition — ratings won&apos;t contribute to ambition progress.
        </p>
      )}
      {selectedIds.size > 1 && primaryId == null && (
        <p className="text-[11px] text-amber-600 dark:text-amber-500">
          Mark a primary ambition for chart targets and rollups.
        </p>
      )}
    </div>
  );
}
