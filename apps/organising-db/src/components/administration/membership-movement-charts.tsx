"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatWeekEnding } from "@/lib/membership-updates/kinds";
import {
  ROLLING_WINDOW_WEEKS,
  rollingMovementSeries,
  weeklyMovementSeries,
  type MovementCounts,
} from "@/lib/membership-updates/movement-series";

const INS_COLOR = "var(--chart-series-1)";
const OUTS_COLOR = "var(--chart-series-2)";
const NET_COLOR = "hsl(var(--foreground))";

const KIND_SERIES = [
  { key: "newMembers", label: "New", color: "var(--chart-series-1)" },
  { key: "recommenced", label: "Recommenced", color: "var(--chart-series-2)" },
  { key: "resigned", label: "Resigned", color: "var(--chart-series-3)" },
  { key: "unfinancial", label: "Unfinancial", color: "var(--chart-series-4)" },
] as const;

const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 12 };
const CHART_MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };

/** "05/09" — the year is in the tooltip. */
function shortWeek(isoDate: string): string {
  return formatWeekEnding(isoDate).slice(0, 5);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

interface LegendItem {
  label: string;
  color: string;
  shape: "box" | "line";
}

function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={item.shape === "box" ? "h-2.5 w-2.5 rounded-sm" : "h-0.5 w-3.5 rounded-full"}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function TooltipCard({
  title,
  rows,
  footnote,
}: {
  title: string;
  rows: { label: string; value: string; color: string; strong?: boolean }[];
  footnote?: string;
}) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: row.color }} />
            {row.label}
          </span>
          <span className={`tabular-nums text-foreground ${row.strong ? "font-semibold" : ""}`}>
            {row.value}
          </span>
        </div>
      ))}
      {footnote && <p className="mt-1 text-muted-foreground">{footnote}</p>}
    </div>
  );
}

function ChartPanel({
  title,
  description,
  legend,
  children,
}: {
  title: string;
  description: string;
  legend: LegendItem[];
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        <ChartLegend items={legend} />
      </div>
      <div className="h-[260px] w-full">{children}</div>
    </div>
  );
}

const FLOW_LEGEND: LegendItem[] = [
  { label: "Ins (new + recommenced)", color: INS_COLOR, shape: "box" },
  { label: "Outs (resigned + unfinancial)", color: OUTS_COLOR, shape: "box" },
  { label: "Net", color: NET_COLOR, shape: "line" },
];

interface FlowPoint {
  asOf: string;
  ins: number;
  outs: number;
  net: number;
}

/**
 * Ins drawn up from zero, outs drawn down, net as a line through both —
 * shared by the weekly and rolling charts.
 */
function FlowChart<T extends FlowPoint>({
  data,
  footnote,
}: {
  data: T[];
  footnote?: (point: T) => string | undefined;
}) {
  // Outs plotted below the axis; the tooltip still reports them as a count.
  const plotted = data.map((p) => ({ ...p, outsBelow: -p.outs }));
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <ComposedChart data={plotted} margin={CHART_MARGIN} stackOffset="sign" barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="asOf" tickFormatter={shortWeek} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
          content={({ active, label }) => {
            const point = data.find((p) => p.asOf === label);
            if (!active || !point) return null;
            return (
              <TooltipCard
                title={`Week ending ${formatWeekEnding(point.asOf)}`}
                rows={[
                  { label: "Ins", value: String(point.ins), color: INS_COLOR },
                  { label: "Outs", value: String(point.outs), color: OUTS_COLOR },
                  { label: "Net", value: signed(point.net), color: NET_COLOR, strong: true },
                ]}
                footnote={footnote?.(point)}
              />
            );
          }}
        />
        <Bar dataKey="ins" name="Ins" stackId="flow" fill={INS_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="outsBelow" name="Outs" stackId="flow" fill={OUTS_COLOR} radius={[0, 0, 4, 4]} maxBarSize={40} />
        <Line
          dataKey="net"
          name="Net"
          type="linear"
          stroke={NET_COLOR}
          strokeWidth={2}
          dot={{ r: 4, fill: NET_COLOR, stroke: "hsl(var(--card))", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "hsl(var(--card))", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MembershipMovementCharts({ snapshots }: { snapshots: MovementCounts[] }) {
  const weekly = useMemo(() => weeklyMovementSeries(snapshots), [snapshots]);
  const rolling = useMemo(() => rollingMovementSeries(weekly), [weekly]);

  if (weekly.length === 0) return null;

  const latestRolling = rolling[rolling.length - 1];

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <ChartPanel
        title="Ins and outs by week"
        description="Members in and out each week, with the net movement."
        legend={FLOW_LEGEND}
      >
        <FlowChart data={weekly} />
      </ChartPanel>

      <ChartPanel
        title={`Rolling ${ROLLING_WINDOW_WEEKS}-week movement`}
        description={
          latestRolling.weeksInWindow < ROLLING_WINDOW_WEEKS
            ? `Totals for the ${ROLLING_WINDOW_WEEKS} weeks up to each week ending. Only ${latestRolling.weeksInWindow} week${latestRolling.weeksInWindow === 1 ? "" : "s"} recorded so far, so this is the running total since the first report.`
            : `Totals for the ${ROLLING_WINDOW_WEEKS} weeks up to each week ending.`
        }
        legend={FLOW_LEGEND}
      >
        <FlowChart
          data={rolling}
          footnote={(p) =>
            p.weeksInWindow < ROLLING_WINDOW_WEEKS
              ? `${p.weeksInWindow} of ${ROLLING_WINDOW_WEEKS} weeks recorded`
              : undefined
          }
        />
      </ChartPanel>

      <div className="xl:col-span-2">
        <ChartPanel
          title="Each file by week"
          description="Rows in each of the four weekly spreadsheets."
          legend={KIND_SERIES.map((s) => ({ label: s.label, color: s.color, shape: "line" }))}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={weekly} margin={CHART_MARGIN}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="asOf" tickFormatter={shortWeek} tick={AXIS_TICK} tickLine={false} axisLine={false} padding={{ left: 16, right: 16 }} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
                content={({ active, label }) => {
                  const point = weekly.find((p) => p.asOf === label);
                  if (!active || !point) return null;
                  return (
                    <TooltipCard
                      title={`Week ending ${formatWeekEnding(point.asOf)}`}
                      rows={KIND_SERIES.map((s) => ({
                        label: s.label,
                        value: String(point[s.key]),
                        color: s.color,
                      }))}
                    />
                  );
                }}
              />
              {KIND_SERIES.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="linear"
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 4, fill: s.color, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  activeDot={{ r: 5, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </div>
  );
}
