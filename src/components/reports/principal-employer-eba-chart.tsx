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
  Cell,
} from "recharts";
import type { PrincipalEmployerEbaSummary, EbaStatusCategory } from "@/types/database";

// ---------------------------------------------------------------
// Status category metadata: order, label, colour
// Ordered from "most covered" (green) to "least covered" (grey)
// ---------------------------------------------------------------
export interface EbaStatusMeta {
  key: keyof PrincipalEmployerEbaSummary;
  pctKey: keyof PrincipalEmployerEbaSummary;
  label: string;
  color: string;
  category: EbaStatusCategory;
}

export const EBA_STATUS_META: EbaStatusMeta[] = [
  {
    key: "count_gt_24m",
    pctKey: "pct_gt_24m",
    label: "> 24 months",
    color: "#16a34a",
    category: "expiry_gt_24m",
  },
  {
    key: "count_12_24m",
    pctKey: "pct_12_24m",
    label: "12–24 months",
    color: "#4ade80",
    category: "expiry_12_24m",
  },
  {
    key: "count_6_12m",
    pctKey: "pct_6_12m",
    label: "6–12 months",
    color: "#fbbf24",
    category: "expiry_6_12m",
  },
  {
    key: "count_lt_6m",
    pctKey: "pct_lt_6m",
    label: "< 6 months",
    color: "#f97316",
    category: "expiry_lt_6m",
  },
  {
    key: "count_expired",
    pctKey: "pct_expired",
    label: "Expired EBA",
    color: "#ef4444",
    category: "expired_eba",
  },
  {
    key: "count_first_bargaining",
    pctKey: "pct_first_bargaining",
    label: "First Bargaining",
    color: "#a78bfa",
    category: "first_bargaining",
  },
  {
    key: "count_no_eba",
    pctKey: "pct_no_eba",
    label: "No EBA",
    color: "#9ca3af",
    category: "no_eba_no_bargaining",
  },
];

// Human-readable label for a single EBA status category
export function ebaStatusLabel(category: EbaStatusCategory): string {
  return EBA_STATUS_META.find((m) => m.category === category)?.label ?? category;
}

// Badge-style colour class for a single EBA status category
export function ebaStatusVariant(
  category: EbaStatusCategory
): "success" | "warning" | "destructive" | "secondary" | "info" {
  switch (category) {
    case "expiry_gt_24m":
    case "expiry_12_24m":
      return "success";
    case "expiry_6_12m":
      return "warning";
    case "expiry_lt_6m":
      return "destructive";
    case "expired_eba":
      return "destructive";
    case "first_bargaining":
      return "info";
    case "no_eba_no_bargaining":
      return "secondary";
  }
}

// ---------------------------------------------------------------
// Stacked horizontal bar chart — one row per principal employer
// Bars show % of employer-worksite pairs in each EBA status
// ---------------------------------------------------------------

interface ChartRow {
  name: string;
  [key: string]: number | string;
}

interface PrincipalEmployerEbaChartProps {
  data: PrincipalEmployerEbaSummary[];
  /** When true, renders a compact single-employer bar (for dashboard cards) */
  compact?: boolean;
}

function buildChartData(data: PrincipalEmployerEbaSummary[]): ChartRow[] {
  return data.map((pe) => {
    const row: ChartRow = { name: pe.principal_employer_name };
    for (const meta of EBA_STATUS_META) {
      row[meta.label] = Number(pe[meta.pctKey]) ?? 0;
    }
    return row;
  });
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
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm space-y-1 min-w-[200px]">
      <p className="font-semibold mb-2">{label}</p>
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

export function PrincipalEmployerEbaChart({
  data,
  compact = false,
}: PrincipalEmployerEbaChartProps) {
  const chartData = buildChartData(data);
  const chartHeight = compact ? 80 : Math.max(120, data.length * 60 + 60);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        No data available. Link worksites to this principal employer to see coverage.
      </div>
    );
  }

  return (
    <div style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: compact ? 0 : 24, left: compact ? 4 : 8 }}
          barSize={compact ? 16 : 24}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            hide={compact}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={compact ? 0 : 90}
            tick={{ fontSize: compact ? 0 : 12 }}
            hide={compact}
          />
          <Tooltip content={<CustomTooltip />} />
          {!compact && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconSize={10}
              iconType="square"
            />
          )}
          {EBA_STATUS_META.map((meta) => (
            <Bar
              key={meta.label}
              dataKey={meta.label}
              stackId="eba"
              fill={meta.color}
              isAnimationActive={false}
            >
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={meta.color} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------
// Compact summary legend — shows count + % for each category
// Useful alongside the chart for precise numbers
// ---------------------------------------------------------------
interface EbaSummaryLegendsProps {
  summary: PrincipalEmployerEbaSummary;
}

export function EbaSummaryLegend({ summary }: EbaSummaryLegendsProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {EBA_STATUS_META.filter(
        (m) => (summary[m.key] as number) > 0
      ).map((meta) => (
        <div key={meta.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-sm shrink-0"
            style={{ backgroundColor: meta.color }}
          />
          <span className="text-muted-foreground">{meta.label}:</span>
          <span className="font-medium">
            {summary[meta.key] as number}{" "}
            <span className="text-muted-foreground">
              ({summary[meta.pctKey] as number}%)
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
