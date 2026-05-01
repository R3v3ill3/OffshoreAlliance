"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RATING_CHART_COLORS,
  RATING_LABELS,
  RATING_SHORT_LABELS,
  RATING_DISPLAY_ORDER,
} from "./rating-palette";
import type { RatingDistribution, AmbitionTarget } from "@/lib/hooks/useAssessmentDistributions";

interface AssessmentStackedBarChartProps {
  assessmentTitle: string;
  distributions: RatingDistribution[];
  ambitionTarget: AmbitionTarget | null;
  isBinary?: boolean;
  isLoading?: boolean;
}

type ChartRow = {
  entityLabel: string;
  entityId: string;
  pct_r1: number;
  pct_r2: number;
  pct_r3: number;
  pct_r4: number;
  pct_r5: number;
  pct_r0: number;
};

function buildChartData(distributions: RatingDistribution[]): ChartRow[] {
  return distributions.map((d) => ({
    entityLabel: d.entityLabel,
    entityId: d.entityId,
    pct_r1: d.pcts.r1,
    pct_r2: d.pcts.r2,
    pct_r3: d.pcts.r3,
    pct_r4: d.pcts.r4,
    pct_r5: d.pcts.r5,
    pct_r0: d.pcts.r0,
  }));
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm space-y-1 min-w-[220px]">
      <p className="font-semibold mb-2 truncate max-w-[200px]">{label}</p>
      {payload
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: p.fill }}
              />
              {p.name}
            </span>
            <span className="font-medium">{p.value}%</span>
          </div>
        ))}
    </div>
  );
};

function MetTargetTick({
  x,
  y,
  payload,
  metTargetIds,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  metTargetIds: Set<string>;
}) {
  if (!payload) return null;
  const label = payload.value;
  const xPos = x ?? 0;
  const yPos = y ?? 0;
  return (
    <g transform={`translate(${xPos},${yPos})`}>
      <text
        x={-4}
        y={0}
        dy={4}
        textAnchor="end"
        fill="#6b7280"
        fontSize={11}
      >
        {label.length > 18 ? label.slice(0, 17) + "…" : label}
      </text>
      {metTargetIds.has(label) && (
        <text x={-130} y={0} dy={4} textAnchor="start" fill="#16a34a" fontSize={11}>
          ✓
        </text>
      )}
    </g>
  );
}

export function AssessmentStackedBarChart({
  assessmentTitle,
  distributions,
  ambitionTarget,
  isBinary = false,
  isLoading = false,
}: AssessmentStackedBarChartProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (distributions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No rating data for this assessment.
      </p>
    );
  }

  const chartData = buildChartData(distributions);
  const chartHeight = Math.max(120, distributions.length * 36 + 60);
  const metTargetIds = new Set(
    distributions.filter((d) => d.metTarget).map((d) => d.entityLabel)
  );

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">{assessmentTitle}</h4>
        {isBinary && (
          <p className="text-xs text-muted-foreground">(binary activity — numeric ratings only shown)</p>
        )}
        {ambitionTarget && (
          <p className="text-xs text-muted-foreground">
            Ambition target:{" "}
            <span className="font-medium text-emerald-600">{ambitionTarget.targetPct}% supportive</span>
            {" "}— {ambitionTarget.label}
          </p>
        )}
      </div>

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 8, left: 140 }}
            barSize={20}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="entityLabel"
              width={136}
              tick={(props: { x: number; y: number; payload: { value: string } }) => (
                <MetTargetTick {...props} metTargetIds={metTargetIds} />
              )}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconSize={10}
              iconType="square"
            />
            {RATING_DISPLAY_ORDER.map((rKey) => (
              <Bar
                key={rKey}
                dataKey={`pct_r${rKey}`}
                name={RATING_SHORT_LABELS[rKey]}
                stackId="s"
                fill={RATING_CHART_COLORS[rKey]}
                isAnimationActive={false}
              />
            ))}
            {ambitionTarget && (
              <ReferenceLine
                x={ambitionTarget.targetPct}
                stroke="#16a34a"
                strokeDasharray="4 2"
                strokeWidth={2}
                label={{
                  value: `Target ${ambitionTarget.targetPct}%`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#16a34a",
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs min-w-[120px]">Unit</TableHead>
              {RATING_DISPLAY_ORDER.map((rKey) => (
                <TableHead key={rKey} className="text-xs text-center min-w-[60px]">
                  <span
                    className="inline-block w-2 h-2 rounded-sm mr-1"
                    style={{ backgroundColor: RATING_CHART_COLORS[rKey] }}
                  />
                  {rKey === 0 ? "None" : `R${rKey}`}
                </TableHead>
              ))}
              <TableHead className="text-xs text-center min-w-[50px]">Total</TableHead>
              <TableHead className="text-xs text-center min-w-[70px]">% Supp.</TableHead>
              {ambitionTarget && (
                <>
                  <TableHead className="text-xs text-center min-w-[60px]">Target</TableHead>
                  <TableHead className="text-xs text-center min-w-[50px]">Met?</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {distributions.map((d, i) => (
              <TableRow
                key={d.entityId}
                className={i === 0 ? "font-semibold border-t-2" : ""}
              >
                <TableCell className="text-xs py-2 max-w-[140px] truncate">{d.entityLabel}</TableCell>
                {RATING_DISPLAY_ORDER.map((rKey) => {
                  const countKey = `r${rKey}` as keyof typeof d.counts;
                  return (
                    <TableCell key={rKey} className="text-xs text-center py-2">
                      {d.counts[countKey]}
                      <span className="text-muted-foreground ml-0.5 text-[10px]">
                        ({d.pcts[countKey]}%)
                      </span>
                    </TableCell>
                  );
                })}
                <TableCell className="text-xs text-center py-2">{d.totalWorkers}</TableCell>
                <TableCell className="text-xs text-center py-2">{d.supportivePct}%</TableCell>
                {ambitionTarget && (
                  <>
                    <TableCell className="text-xs text-center py-2">
                      {ambitionTarget.targetPct}%
                    </TableCell>
                    <TableCell className="text-xs text-center py-2">
                      {d.metTarget ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
