"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAssessmentDistributions } from "@/lib/hooks/useAssessmentDistributions";
import { OuTypeSelector } from "./assessment-charts/OuTypeSelector";
import { AssessmentStackedBarChart } from "./assessment-charts/AssessmentStackedBarChart";

interface WallChartAssessmentChartsProps {
  campaignId: string;
  /** The activityId currently selected in the wall chart header.
   *  null = cumulative mode → show default 3 assessments. */
  activeAssessmentId: number | null;
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
        <OuTypeSelector
          groups={ouGroups}
          value={effectiveOuType}
          onChange={setSelectedOuType}
        />
      </CardHeader>
      <CardContent className="space-y-6">
        {optionsToShow.map((opt) => {
          const { campaignRow, ouRows, ambitionTarget } = computeDistributions(
            opt.activity_id,
            effectiveOuType
          );
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
