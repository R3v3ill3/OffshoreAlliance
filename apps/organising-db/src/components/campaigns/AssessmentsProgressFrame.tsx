"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAssessmentDistributions } from "@/lib/hooks/useAssessmentDistributions";
import { OuTypeSelector } from "./assessment-charts/OuTypeSelector";
import { AssessmentDonutChart } from "./assessment-charts/AssessmentDonutChart";

interface AssessmentsProgressFrameProps {
  campaignId: number;
  campaignLabel?: string;
}

const MAX_SELECTED = 3;
const VISIBLE_DEFAULT = 5;

export function AssessmentsProgressFrame({
  campaignId,
  campaignLabel = "Campaign",
}: AssessmentsProgressFrameProps) {
  const {
    assessmentOptions,
    defaultAssessmentIds,
    ouGroups,
    computeDistributions,
    defaultOuType,
    isLoading,
  } = useAssessmentDistributions(String(campaignId));

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedOuType, setSelectedOuType] = useState<string | null>(null);
  const [showAllAssessments, setShowAllAssessments] = useState(false);

  // Initialise from defaults once data loads
  const effectiveIds = useMemo(() => {
    if (selectedIds.length > 0) return selectedIds;
    return defaultAssessmentIds;
  }, [selectedIds, defaultAssessmentIds]);

  const effectiveOuType = useMemo(() => {
    if (selectedOuType !== null) return selectedOuType;
    return defaultOuType(effectiveIds);
  }, [selectedOuType, effectiveIds, defaultOuType]);

  const toggleAssessment = (activityId: number) => {
    setSelectedIds((prev) => {
      const prevIds = prev.length > 0 ? prev : defaultAssessmentIds;
      if (prevIds.includes(activityId)) {
        return prevIds.filter((id) => id !== activityId);
      }
      if (prevIds.length >= MAX_SELECTED) {
        // Drop the one with the oldest last_rated_at
        const withDates = prevIds.map((id) => ({
          id,
          date: assessmentOptions.find((o) => o.activity_id === id)?.last_rated_at ?? "",
        }));
        withDates.sort((a, b) => a.date.localeCompare(b.date));
        return [...withDates.slice(1).map((x) => x.id), activityId];
      }
      return [...prevIds, activityId];
    });
  };

  if (!isLoading && assessmentOptions.length === 0) return null;

  const visibleOptions = showAllAssessments
    ? assessmentOptions
    : assessmentOptions.slice(0, VISIBLE_DEFAULT);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Assessments progress</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <OuTypeSelector
            groups={ouGroups}
            value={effectiveOuType}
            onChange={setSelectedOuType}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assessment selector buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          {visibleOptions.map((opt) => {
            const isActive = effectiveIds.includes(opt.activity_id);
            return (
              <Button
                key={opt.activity_id}
                size="sm"
                variant={isActive ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => toggleAssessment(opt.activity_id)}
              >
                {opt.title}
                {!opt.last_rated_at && (
                  <span className="ml-1 text-muted-foreground">(no ratings)</span>
                )}
              </Button>
            );
          })}
          {assessmentOptions.length > VISIBLE_DEFAULT && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setShowAllAssessments((v) => !v)}
            >
              {showAllAssessments
                ? "Show fewer"
                : `+${assessmentOptions.length - VISIBLE_DEFAULT} more`}
            </Button>
          )}
        </div>

        {/* Donut charts — one per selected assessment */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {effectiveIds.map((activityId) => {
            const opt = assessmentOptions.find((o) => o.activity_id === activityId);
            if (!opt) return null;
            const { campaignRow, ouRows, ambitionTarget } = computeDistributions(
              activityId,
              effectiveOuType
            );
            const rings = [campaignRow, ...ouRows];
            return (
              <AssessmentDonutChart
                key={activityId}
                rings={rings}
                assessmentTitle={opt.title}
                ambitionTarget={ambitionTarget}
                isLoading={isLoading}
              />
            );
          })}
          {isLoading && effectiveIds.length === 0 && (
            <AssessmentDonutChart
              rings={[]}
              assessmentTitle=""
              ambitionTarget={null}
              isLoading={true}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
