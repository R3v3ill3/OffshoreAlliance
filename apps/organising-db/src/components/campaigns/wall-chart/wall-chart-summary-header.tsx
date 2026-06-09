"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  CompactRatingsBar,
  UnitSummaryMetrics,
  type DisplayMode,
} from "./unit-summary-metrics";
import type { WallChartMetrics } from "./metrics";

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
  /** Slot for the campaign-level list-activity badge selector. */
  listBadgeSelector?: ReactNode;
  rightSlot?: ReactNode;
  /**
   * Slot for the campaign-level AssessmentSelector. Rendered above the
   * controls row inside the same sticky card so the rating selector follows
   * the user as they scroll.
   */
  assessmentSelector?: ReactNode;
  /**
   * When true, the parent has detected this header is "stuck" to the top of
   * the viewport. The header collapses verbose content (title, name, metric
   * chips) but always keeps the assessment selector, controls, and the thin
   * stacked rating bar visible. A chevron lets the user peek at the full
   * metrics on demand.
   */
  isStuck?: boolean;
};

export function WallChartSummaryHeader({
  campaignName,
  metrics,
  mode,
  onModeChange,
  participationSelector,
  participationLabel,
  overlayToggle,
  listBadgeSelector,
  rightSlot,
  assessmentSelector,
  isStuck,
}: WallChartSummaryHeaderProps) {
  const [expandedWhenStuck, setExpandedWhenStuck] = useState(false);
  const showFullBody = !isStuck || expandedWhenStuck;

  return (
    <Card className="border-primary/20 bg-card print:break-inside-avoid">
      <CardHeader className={cn("pb-2", isStuck && "py-2")}>
        {assessmentSelector && (
          <div className="rounded border bg-muted/30 px-3 py-1.5 print:hidden">
            {assessmentSelector}
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-2">
          {!isStuck && (
            <div>
              <h2 className="text-base font-semibold">Campaign summary</h2>
              {campaignName && (
                <p className="text-xs text-muted-foreground mt-0.5">{campaignName}</p>
              )}
            </div>
          )}
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 print:hidden",
              isStuck && "ml-auto"
            )}
          >
            {participationSelector}
            {listBadgeSelector}
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
            {isStuck && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => setExpandedWhenStuck((v) => !v)}
                aria-pressed={expandedWhenStuck}
                aria-label={
                  expandedWhenStuck ? "Collapse campaign summary" : "Expand campaign summary"
                }
                title={expandedWhenStuck ? "Hide details" : "Show details"}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    expandedWhenStuck && "rotate-180"
                  )}
                  aria-hidden
                />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("pt-0", isStuck && !expandedWhenStuck && "pb-2")}>
        {showFullBody ? (
          <UnitSummaryMetrics
            metrics={metrics}
            mode={mode}
            participationLabel={participationLabel}
            compact
          />
        ) : (
          // Stuck + collapsed: keep just the thin stacked rating bar so the
          // user retains a visual sense of the cumulative rating mix while
          // scrolling. Click the chevron above to expand the full metrics.
          <CompactRatingsBar
            buckets={metrics.ratingBuckets}
            total={metrics.total}
          />
        )}
      </CardContent>
    </Card>
  );
}
