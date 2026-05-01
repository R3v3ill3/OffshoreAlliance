"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAssessmentDistributions } from "@/lib/hooks/useAssessmentDistributions";
import { OuTypeSelector } from "./assessment-charts/OuTypeSelector";
import { AssessmentStackedBarChart } from "./assessment-charts/AssessmentStackedBarChart";

interface AssessmentsTabChartsProps {
  campaignId: string;
}

export function AssessmentsTabCharts({ campaignId }: AssessmentsTabChartsProps) {
  const {
    assessmentOptions,
    defaultAssessmentIds,
    ouGroups,
    computeDistributions,
    defaultOuType,
    isLoading,
  } = useAssessmentDistributions(campaignId);

  const [selectedOuType, setSelectedOuType] = useState<string | null>(null);

  const ratedOptions = useMemo(
    () => assessmentOptions.filter((o) => o.last_rated_at != null),
    [assessmentOptions]
  );

  const effectiveOuType = useMemo(() => {
    if (selectedOuType !== null) return selectedOuType;
    return defaultOuType(defaultAssessmentIds);
  }, [selectedOuType, defaultAssessmentIds, defaultOuType]);

  if (!isLoading && ratedOptions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Rating distribution by unit</CardTitle>
        <OuTypeSelector
          groups={ouGroups}
          value={effectiveOuType}
          onChange={setSelectedOuType}
        />
      </CardHeader>
      <CardContent className="space-y-6">
        {ratedOptions.map((opt) => {
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
        {isLoading && ratedOptions.length === 0 && (
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
