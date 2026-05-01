"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RATING_CHART_COLORS,
  RATING_LABELS,
  RATING_DISPLAY_ORDER,
} from "./rating-palette";
import type { RatingDistribution, AmbitionTarget } from "@/lib/hooks/useAssessmentDistributions";

const INNER_START = 36;
const THICKNESS = 16;
const GAP = 4;
const MAX_RINGS = 6;

function ringInner(i: number) {
  return INNER_START + i * (THICKNESS + GAP);
}
function ringOuter(i: number) {
  return ringInner(i) + THICKNESS;
}

type PieSegment = { name: string; value: number; fill: string; ratingKey: number };

function buildPieData(dist: RatingDistribution): PieSegment[] {
  const segments: PieSegment[] = [];
  for (const rKey of RATING_DISPLAY_ORDER) {
    const countKey = `r${rKey}` as keyof typeof dist.counts;
    const pct = dist.pcts[countKey];
    if (pct <= 0) continue;
    segments.push({
      name: RATING_LABELS[rKey],
      value: pct,
      fill: RATING_CHART_COLORS[rKey],
      ratingKey: rKey,
    });
  }
  // If all zero (no workers), show a single grey segment
  if (segments.length === 0) {
    segments.push({ name: "No workers", value: 100, fill: "#e5e7eb", ratingKey: 0 });
  }
  return segments;
}

const DonutTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: PieSegment }[];
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const seg = payload[0];
  return (
    <div className="rounded-lg border bg-background p-2 shadow-lg text-xs">
      <span
        className="inline-block w-2.5 h-2.5 rounded-sm mr-1"
        style={{ backgroundColor: seg.payload.fill }}
      />
      {seg.name}: <span className="font-medium">{seg.value}%</span>
    </div>
  );
};

interface AssessmentDonutChartProps {
  rings: RatingDistribution[];
  assessmentTitle: string;
  ambitionTarget: AmbitionTarget | null;
  isLoading?: boolean;
}

export function AssessmentDonutChart({
  rings,
  assessmentTitle,
  ambitionTarget,
  isLoading = false,
}: AssessmentDonutChartProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-[160px] w-full" />
      </div>
    );
  }

  if (rings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No data for this assessment.</p>
    );
  }

  const clipped = rings.slice(0, MAX_RINGS);
  const wasClipped = rings.length > MAX_RINGS;

  // Chart height: outermost ring outer radius + margin
  const maxRadius = ringOuter(clipped.length - 1);
  const chartHeight = maxRadius + 20;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{assessmentTitle}</h4>
      {ambitionTarget && (
        <p className="text-xs text-muted-foreground">
          Target:{" "}
          <span className="font-medium text-emerald-600">{ambitionTarget.targetPct}% supportive</span>
          {" — "}{ambitionTarget.label}
        </p>
      )}

      <div className="flex items-start gap-4">
        {/* Semi-circle chart */}
        <div style={{ flex: "0 0 260px", height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <PieChart>
              {clipped.map((ring, idx) => (
                <Pie
                  key={ring.entityId}
                  data={buildPieData(ring)}
                  cx="50%"
                  cy="90%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={ringInner(idx)}
                  outerRadius={ringOuter(idx)}
                  dataKey="value"
                  paddingAngle={1}
                  isAnimationActive={false}
                >
                  {buildPieData(ring).map((seg, j) => (
                    <Cell key={j} fill={seg.fill} />
                  ))}
                </Pie>
              ))}
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Entity label list */}
        <div className="flex-1 space-y-1.5 pt-1">
          {clipped.map((ring, idx) => (
            <div key={ring.entityId} className="flex items-center gap-1.5 text-xs">
              {/* Ring colour swatch (innermost = campaign = index 0) */}
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0 border border-border"
                style={{
                  background: `conic-gradient(${buildPieData(ring)
                    .map((s, i, arr) => {
                      const cumPrev = arr.slice(0, i).reduce((a, b) => a + b.value, 0);
                      const cumCur = cumPrev + s.value;
                      return `${s.fill} ${cumPrev}% ${cumCur}%`;
                    })
                    .join(", ")})`,
                }}
              />
              <span className="font-medium truncate max-w-[120px]" title={ring.entityLabel}>
                {idx === 0 ? <span className="underline">{ring.entityLabel}</span> : ring.entityLabel}
              </span>
              <span className="text-muted-foreground shrink-0">
                {ring.supportivePct}% supp.
              </span>
              {ring.metTarget && ambitionTarget && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              )}
            </div>
          ))}
          {wasClipped && (
            <p className="text-[10px] text-muted-foreground">
              Showing top {MAX_RINGS - 1} units by size
            </p>
          )}
        </div>
      </div>

      {/* Rating legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {RATING_DISPLAY_ORDER.map((rKey) => (
          <span key={rKey} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: RATING_CHART_COLORS[rKey] }}
            />
            {rKey === 0 ? "Unassessed" : `${rKey} — ${RATING_LABELS[rKey]}`}
          </span>
        ))}
      </div>
    </div>
  );
}
