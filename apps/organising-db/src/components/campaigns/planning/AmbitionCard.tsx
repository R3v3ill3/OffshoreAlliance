"use client"

import { format, parseISO, isValid } from "date-fns"
import { Calendar, CheckCircle, Link2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DateInput } from "@/components/ui/date-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils/cn"
import { isAmbitionMetricIncomplete } from "@/lib/planning/ambition-metric-status"
import { formatCategoryLabel } from "@/lib/utils/option-sorting"
import type { AmbitionScope, PlanAmbition } from "@/types/planner-types"

type AmbitionRow = PlanAmbition & {
  ambition_options?: {
    option_text: string
    category: string
    has_variable: boolean | null
    variable_label: string | null
    variable_type: string | null
    default_scope?: string | null
  } | null
  parent_campaign_ambition_id?: number | null
}

export interface CampaignAmbitionOption {
  campaign_ambition_id: number
  category: "membership" | "member_leaders" | "activism" | "industrial_outcomes"
  subcategory: string | null
  label: string
}

type Patch = Record<string, string | number | boolean | null | undefined>

interface AmbitionCardProps {
  ambition: AmbitionRow
  /** Stage number, used in error messaging when target_date crosses next stage's start. */
  stageNumber: number
  /** Next stage's planned start; used to block hard-gate flags whose target falls past it. */
  nextStagePlannedStartDate?: string | null
  /** Optional contextual hint (current value vs target) to render under the target field. */
  hint?: string | null
  /**
   * When set, the auto-link tooltip explains that editing the target on this
   * ambition mirrors a sibling. Phase 7 keeps this metadata visible so the
   * cross-link isn't silently surprising.
   */
  linkedTo?: "density" | "member-count"
  linkedTotals?: { totalWorkerEstimate: number; memberLikeCount: number }
  /** Campaign-level ambitions available for the parent picker. */
  campaignAmbitionOptions: CampaignAmbitionOption[]
  /** Apply a partial patch to the underlying plan_ambitions row. */
  onPatch: (ambitionId: number, patch: Patch) => Promise<void> | void
  /** Remove the ambition (the parent should guard against system_default ambitions). */
  onDelete: (ambition: AmbitionRow) => Promise<void> | void
}

function mapVariableTypeToMetric(
  variableType: string | null | undefined
): string | undefined {
  if (!variableType) return undefined
  if (variableType === "number") return "count"
  if (variableType === "percentage") return "percentage"
  if (variableType === "date") return "date"
  return undefined
}

/**
 * Single card that combines selection, scope, gate, target, date, and the
 * stage→campaign ambition link for one `plan_ambitions` row. Replaces the
 * Phase-pre-7 dual rendering (separate selection card + per-row metric
 * card) that confused users with two visual treatments of the same item.
 *
 * Visual rule: the card has one consistent neutral surface; achieved
 * ambitions get a subtle green tint; metric-incomplete is signalled with a
 * small inline pill, not a card-level color change.
 */
export function AmbitionCard({
  ambition,
  stageNumber,
  nextStagePlannedStartDate,
  hint,
  linkedTo,
  linkedTotals,
  campaignAmbitionOptions,
  onPatch,
  onDelete,
}: AmbitionCardProps) {
  const option = ambition.ambition_options
  const optionText = option?.option_text || ambition.custom_text || "Ambition"
  const hasVariable = option?.has_variable || false
  const variableLabel = option?.variable_label
  const variableType = option?.variable_type
  const rowMetric =
    ambition.metric_type || mapVariableTypeToMetric(variableType)

  const displayText = hasVariable
    ? optionText.replace(
        "{target_value}",
        ambition.target_value ? `[${ambition.target_value}]` : "[set target]"
      )
    : optionText

  const showNumericTargets =
    hasVariable ||
    rowMetric === "count" ||
    rowMetric === "percentage" ||
    rowMetric === "range" ||
    rowMetric === "text"

  const metricIncomplete =
    !ambition.is_achieved && isAmbitionMetricIncomplete(ambition)

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-4 transition-colors",
        ambition.is_achieved && "bg-green-50/60 border-green-200"
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={ambition.is_achieved ?? false}
          onCheckedChange={(checked) =>
            void onPatch(ambition.ambition_id, { is_achieved: !!checked })
          }
          className="mt-1 border-slate-300"
        />

        <div className="flex-1 min-w-0 space-y-3">
          {/* Headline */}
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "text-sm font-medium leading-snug",
                ambition.is_achieved
                  ? "line-through text-muted-foreground"
                  : "text-slate-900"
              )}
            >
              {displayText}
            </p>
            {!ambition.is_system_default && (
              <button
                type="button"
                onClick={() => void onDelete(ambition)}
                className="shrink-0 text-muted-foreground hover:text-red-500"
                title="Remove ambition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {option?.category && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {formatCategoryLabel(option.category)}
              </Badge>
            )}
            {!option?.category && ambition.custom_text && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                Custom
              </Badge>
            )}
            {ambition.is_system_default && (
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                Membership
              </Badge>
            )}
            {ambition.ambition_scope === "campaign_setup" ? (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1 border-slate-300 text-slate-600"
              >
                Setup
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1 border-sky-300 text-sky-700 bg-sky-50"
              >
                Worker-assessable
              </Badge>
            )}
            {ambition.is_hard_gate && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1 border-red-300 text-red-700 bg-red-50"
              >
                Hard gate
              </Badge>
            )}
            {ambition.parent_campaign_ambition_id != null && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1 border-blue-300 text-blue-700 bg-blue-50"
              >
                <Link2 className="h-2.5 w-2.5 mr-0.5" />
                Campaign-linked
              </Badge>
            )}
            {metricIncomplete && (
              <Badge className="text-[10px] h-4 px-1 bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200">
                Target not set
              </Badge>
            )}
            {ambition.is_achieved && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1 border-green-400 text-green-700 bg-green-50"
              >
                <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                Achieved
              </Badge>
            )}
          </div>

          {/* Controls grid */}
          <div className="grid sm:grid-cols-2 gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                Scope
              </Label>
              <Select
                value={ambition.ambition_scope}
                onValueChange={(v) =>
                  void onPatch(ambition.ambition_id, {
                    ambition_scope: v as AmbitionScope,
                  })
                }
              >
                <SelectTrigger className="h-8 flex-1 min-w-[180px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker_assessable">
                    Worker-assessable
                  </SelectItem>
                  <SelectItem value="campaign_setup">Campaign setup</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                Gate
              </Label>
              <Select
                value={ambition.is_hard_gate ? "hard" : "soft"}
                onValueChange={(v) => {
                  if (
                    v === "hard" &&
                    nextStagePlannedStartDate &&
                    ambition.target_date
                  ) {
                    const targetD = parseISO(ambition.target_date)
                    const nextStart = parseISO(nextStagePlannedStartDate)
                    if (
                      isValid(targetD) &&
                      isValid(nextStart) &&
                      targetD > nextStart
                    ) {
                      toast.error(
                        `Cannot set as hard gate — ambition target date (${format(
                          targetD,
                          "dd/MM/yyyy"
                        )}) is after Stage ${stageNumber + 1}'s planned start (${format(
                          nextStart,
                          "dd/MM/yyyy"
                        )}).`
                      )
                      return
                    }
                  }
                  void onPatch(ambition.ambition_id, {
                    is_hard_gate: v === "hard",
                  })
                }}
              >
                <SelectTrigger className="h-8 flex-1 min-w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soft">Soft (override ok)</SelectItem>
                  <SelectItem value="hard">Hard (must meet)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {showNumericTargets && (
              <div className="sm:col-span-2 space-y-1">
                {rowMetric === "range" ? (
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Min
                      </Label>
                      <Input
                        className="h-7 w-20 text-sm"
                        value={ambition.target_value || ""}
                        onChange={(e) =>
                          void onPatch(ambition.ambition_id, {
                            target_value: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Max
                      </Label>
                      <Input
                        className="h-7 w-20 text-sm"
                        value={ambition.target_value_max || ""}
                        onChange={(e) =>
                          void onPatch(ambition.ambition_id, {
                            target_value_max: e.target.value || null,
                          })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      {variableLabel ||
                        (rowMetric === "percentage"
                          ? "Target %"
                          : rowMetric === "count"
                          ? "Target #"
                          : "Target")}
                    </Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type={variableType === "date" ? "date" : "text"}
                        value={ambition.target_value || ""}
                        onChange={(e) =>
                          void onPatch(ambition.ambition_id, {
                            target_value: e.target.value,
                          })
                        }
                        placeholder={
                          variableType === "percentage" ||
                          rowMetric === "percentage"
                            ? "0-100"
                            : rowMetric === "count"
                            ? "0"
                            : ""
                        }
                        className="w-24 h-7 text-sm"
                      />
                      {(variableType === "percentage" ||
                        rowMetric === "percentage") && (
                        <span className="text-xs text-muted-foreground">%</span>
                      )}
                      {linkedTo && linkedTotals && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link2 className="h-3.5 w-3.5 text-blue-400" />
                            </TooltipTrigger>
                            <TooltipContent
                              side="right"
                              className="max-w-xs text-xs"
                            >
                              Linked to{" "}
                              {linkedTo === "density" ? "density" : "member count"}{" "}
                              ambition. Editing this target auto-updates the
                              other based on {linkedTotals.totalWorkerEstimate}{" "}
                              estimated workers and {linkedTotals.memberLikeCount}{" "}
                              current members.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                )}
                {hint && (
                  <p className="text-[11px] text-blue-600/80 pl-0.5">{hint}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                Target date
              </Label>
              <DateInput
                value={ambition.target_date || ""}
                onChange={(iso) =>
                  void onPatch(ambition.ambition_id, {
                    target_date: iso || null,
                    target_date_user_overridden: true,
                  })
                }
                className="w-36 h-7 text-xs"
              />
            </div>

            {campaignAmbitionOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <Link2 className="h-3 w-3 text-muted-foreground" />
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Connects to
                </Label>
                <Select
                  value={
                    ambition.parent_campaign_ambition_id != null
                      ? String(ambition.parent_campaign_ambition_id)
                      : "__none__"
                  }
                  onValueChange={(v) =>
                    void onPatch(ambition.ambition_id, {
                      parent_campaign_ambition_id:
                        v === "__none__" ? null : Number(v),
                    })
                  }
                >
                  <SelectTrigger className="h-7 flex-1 min-w-[180px] text-xs">
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs">
                      Not linked
                    </SelectItem>
                    {campaignAmbitionOptions.map((opt) => (
                      <SelectItem
                        key={opt.campaign_ambition_id}
                        value={String(opt.campaign_ambition_id)}
                        className="text-xs"
                      >
                        {opt.label}{" "}
                        <span className="text-muted-foreground">
                          ({opt.category})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
