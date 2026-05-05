"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAssessmentDistributions } from "@/lib/hooks/useAssessmentDistributions";
import { OuTypeSelector } from "./assessment-charts/OuTypeSelector";
import { AssessmentStackedBarChart } from "./assessment-charts/AssessmentStackedBarChart";
import {
  RATING_CHART_COLORS,
  RATING_DISPLAY_ORDER,
} from "./assessment-charts/rating-palette";
import type { RatingDistribution } from "@/lib/hooks/useAssessmentDistributions";

interface WallChartAssessmentChartsProps {
  campaignId: string;
  /** The activityId currently selected in the wall chart header.
   *  null = cumulative mode → show default 3 assessments. */
  activeAssessmentId: number | null;
}

/** Compact "Whole Campaign" summary row shown in collapsed state. */
function CollapsedAssessmentRow({
  assessmentTitle,
  campaignRow,
}: {
  assessmentTitle: string;
  campaignRow: RatingDistribution;
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold">{assessmentTitle}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 pr-3 font-medium min-w-[100px]">Unit</th>
              {RATING_DISPLAY_ORDER.map((rKey) => (
                <th key={rKey} className="py-1 px-2 text-center font-medium min-w-[50px]">
                  <span
                    className="inline-block w-2 h-2 rounded-sm mr-1"
                    style={{ backgroundColor: RATING_CHART_COLORS[rKey] }}
                  />
                  {rKey === 0 ? "None" : `R${rKey}`}
                </th>
              ))}
              <th className="py-1 px-2 text-center font-medium min-w-[45px]">Total</th>
              <th className="py-1 px-2 text-center font-medium min-w-[60px]">% Supp.</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              <td className="py-1.5 pr-3 max-w-[140px] truncate">{campaignRow.entityLabel}</td>
              {RATING_DISPLAY_ORDER.map((rKey) => {
                const countKey = `r${rKey}` as keyof typeof campaignRow.counts;
                return (
                  <td key={rKey} className="py-1.5 px-2 text-center tabular-nums">
                    {campaignRow.counts[countKey]}
                    <span className="text-muted-foreground ml-0.5 text-[10px]">
                      ({campaignRow.pcts[countKey]}%)
                    </span>
                  </td>
                );
              })}
              <td className="py-1.5 px-2 text-center tabular-nums">{campaignRow.totalWorkers}</td>
              <td className="py-1.5 px-2 text-center tabular-nums">{campaignRow.supportivePct}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WallChartAssessmentCharts({
  campaignId,
  activeAssessmentId,
}: WallChartAssessmentChartsProps) {
  const {
    assessmentOptions,
    defaultAssessmentIds,
    ouGroups,
    computeDistributions,
    defaultOuType,
    isLoading,
  } = useAssessmentDistributions(campaignId);

  const [selectedOuType, setSelectedOuType] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const displayActivityIds = useMemo(() => {
    if (activeAssessmentId != null) return [activeAssessmentId];
    return defaultAssessmentIds;
  }, [activeAssessmentId, defaultAssessmentIds]);

  const effectiveOuType = useMemo(() => {
    if (selectedOuType !== null) return selectedOuType;
    return defaultOuType(displayActivityIds);
  }, [selectedOuType, displayActivityIds, defaultOuType]);

  if (!isLoading && assessmentOptions.length === 0) return null;

  const optionsToShow = assessmentOptions.filter((o) =>
    displayActivityIds.includes(o.activity_id)
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Assessment distribution</CardTitle>
        <div className="flex items-center gap-2">
          <OuTypeSelector
            groups={ouGroups}
            value={effectiveOuType}
            onChange={setSelectedOuType}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse assessment distribution" : "Expand assessment distribution"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className={expanded ? "space-y-6" : "space-y-4 pt-0"}>
        {optionsToShow.map((opt) => {
          const { campaignRow, ouRows, ambitionTarget } = computeDistributions(
            opt.activity_id,
            effectiveOuType
          );
          if (expanded) {
            return (
              <AssessmentStackedBarChart
                key={opt.activity_id}
                assessmentTitle={opt.title}
                distributions={[campaignRow, ...ouRows]}
                ambitionTarget={ambitionTarget}
                isBinary={opt.is_binary}
                isLoading={isLoading}
              />
            );
          }
          return (
            <CollapsedAssessmentRow
              key={opt.activity_id}
              assessmentTitle={opt.title}
              campaignRow={campaignRow}
            />
          );
        })}
        {isLoading && optionsToShow.length === 0 && (
          <AssessmentStackedBarChart
            assessmentTitle=""
            distributions={[]}
            ambitionTarget={null}
            isLoading={true}
          />
        )}
      </CardContent>
    </Card>
  );
}
