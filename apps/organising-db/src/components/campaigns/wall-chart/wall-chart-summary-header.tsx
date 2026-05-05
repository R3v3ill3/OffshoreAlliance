"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UnitSummaryMetrics, type DisplayMode } from "./unit-summary-metrics";
import type { WallChartMetrics } from "./metrics";
import type { ReactNode } from "react";

export type WallChartSummaryHeaderProps = {
  campaignName?: string | null;
  metrics: WallChartMetrics;
  mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
  /** Slot for the participation source selector (Phase 4). */
  participationSelector?: ReactNode;
  participationLabel?: string;
  /** Slot for the relationship overlay toggle (Phase 8). */
  overlayToggle?: ReactNode;
  rightSlot?: ReactNode;
};

export function WallChartSummaryHeader({
  campaignName,
  metrics,
  mode,
  onModeChange,
  participationSelector,
  participationLabel,
  overlayToggle,
  rightSlot,
}: WallChartSummaryHeaderProps) {
  return (
    <Card className="border-primary/20 bg-primary/[0.02] print:break-inside-avoid">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Campaign summary</h2>
            {campaignName && (
              <p className="text-xs text-muted-foreground mt-0.5">{campaignName}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {participationSelector}
            <div className="inline-flex rounded border bg-background overflow-hidden">
              <Button
                type="button"
                variant={mode === "pct" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-7 px-2 text-xs"
                onClick={() => onModeChange("pct")}
                aria-pressed={mode === "pct"}
              >
                %
              </Button>
              <Button
                type="button"
                variant={mode === "count" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-7 px-2 text-xs"
                onClick={() => onModeChange("count")}
                aria-pressed={mode === "count"}
              >
                #
              </Button>
            </div>
            {overlayToggle}
            {rightSlot}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <UnitSummaryMetrics metrics={metrics} mode={mode} participationLabel={participationLabel} compact />
      </CardContent>
    </Card>
  );
}
