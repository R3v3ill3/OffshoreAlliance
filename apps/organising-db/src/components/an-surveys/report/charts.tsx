"use client";

/**
 * The chart primitives the survey dashboard draws. Every number in here is
 * one the app computed (see an-survey-report/helpers.ts) — the chart kind
 * is the only thing the AI chose.
 */

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import {
  REPORT_PALETTE,
  formatPercent,
  formatSliceValue,
  type SurveyReportLabelMode,
} from "@/lib/sms/survey-report";
import type { CrossTab } from "@/lib/an-surveys/types";
import {
  cellHeat,
  type CrosstabChartKind,
  type DisplayRow,
  type QuestionChartKind,
} from "@/lib/an-survey-report/helpers";

const SYNTHETIC_COLOR = "#cbd5e1";

export function rowColor(row: DisplayRow, index: number): string {
  return row.synthetic ? SYNTHETIC_COLOR : REPORT_PALETTE[index % REPORT_PALETTE.length];
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function tooltipText(count: number, base: number): string {
  return `${count.toLocaleString()} (${formatPercent(count, base)})`;
}

// ─── One question ───────────────────────────────────────────────────────────

export interface QuestionChartProps {
  rows: DisplayRow[];
  chart: QuestionChartKind;
  labelMode: SurveyReportLabelMode;
  emptyText?: string;
}

export function QuestionChart({ rows, chart, labelMode, emptyText = "No answers" }: QuestionChartProps) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (rows.length === 0 || total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{emptyText}</div>
    );
  }
  if (chart === "pie") return <RowsPie rows={rows} labelMode={labelMode} />;
  if (chart === "stacked") return <RowsStacked rows={rows} labelMode={labelMode} />;
  if (chart === "hbar") return <RowsHBar rows={rows} labelMode={labelMode} />;
  return <RowsBar rows={rows} labelMode={labelMode} />;
}

function RowsBar({ rows, labelMode }: { rows: DisplayRow[]; labelMode: SurveyReportLabelMode }) {
  const base = rows[0]?.base ?? 0;
  const tall = rows.some((r) => r.label.length > 12) || rows.length > 6;
  return (
    <ResponsiveContainer width="100%" height={tall ? 300 : 240}>
      <BarChart data={rows} margin={{ top: 18, right: 8, left: 0, bottom: tall ? 60 : 8 }}>
        <XAxis
          dataKey="label"
          interval={0}
          tick={{ fontSize: 11 }}
          angle={tall ? -30 : 0}
          textAnchor={tall ? "end" : "middle"}
          height={tall ? 70 : 30}
          tickFormatter={(v: unknown) => truncate(String(v), 22)}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
        <Tooltip formatter={(value) => tooltipText(Number(value ?? 0), base)} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={r.key} fill={rowColor(r, i)} />
          ))}
          <LabelList
            dataKey="count"
            position="top"
            fontSize={11}
            formatter={(v) => formatSliceValue(Number(v), base, labelMode)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RowsHBar({ rows, labelMode }: { rows: DisplayRow[]; labelMode: SurveyReportLabelMode }) {
  const base = rows[0]?.base ?? 0;
  const height = Math.max(120, rows.length * 30 + 20);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 4 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={170}
          interval={0}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: unknown) => truncate(String(v), 28)}
        />
        <Tooltip formatter={(value) => tooltipText(Number(value ?? 0), base)} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={r.key} fill={rowColor(r, i)} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            fontSize={11}
            formatter={(v) => formatSliceValue(Number(v), base, labelMode)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RowsPie({ rows, labelMode }: { rows: DisplayRow[]; labelMode: SurveyReportLabelMode }) {
  const base = rows[0]?.base ?? 0;
  const data = rows.filter((r) => r.count > 0).map((r, i) => ({ ...r, color: rowColor(r, i) }));
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={75}
            isAnimationActive={false}
            label={(props: PieLabelRenderProps) => formatSliceValue(Number(props.value ?? 0), base, labelMode)}
          >
            {data.map((r) => (
              <Cell key={r.key} fill={r.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => tooltipText(Number(value ?? 0), base)} />
        </PieChart>
      </ResponsiveContainer>
      <RowLegend rows={rows} />
    </>
  );
}

/** One 100% bar split across the options. */
function RowsStacked({ rows, labelMode }: { rows: DisplayRow[]; labelMode: SurveyReportLabelMode }) {
  const base = rows[0]?.base ?? 0;
  const datum: Record<string, number | string> = { name: "All respondents" };
  for (const r of rows) datum[r.key] = r.count;
  return (
    <>
      <ResponsiveContainer width="100%" height={70}>
        <BarChart data={[datum]} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, base || "auto"]} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            formatter={(value, name) => [
              tooltipText(Number(value ?? 0), base),
              rows.find((r) => r.key === String(name))?.label ?? String(name),
            ]}
          />
          {rows.map((r, i) => (
            <Bar key={r.key} dataKey={r.key} stackId="one" fill={rowColor(r, i)} isAnimationActive={false}>
              <LabelList
                dataKey={r.key}
                position="center"
                fontSize={11}
                fill="#fff"
                formatter={(v) => (Number(v) / (base || 1) < 0.06 ? "" : formatSliceValue(Number(v), base, labelMode))}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <RowLegend rows={rows} />
    </>
  );
}

export function RowLegend({ rows }: { rows: DisplayRow[] }) {
  return (
    <ul className="mt-1 space-y-1">
      {rows.map((r, i) => (
        <li key={r.key} className="flex items-center gap-2 text-xs" title={r.label}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: rowColor(r, i) }} />
          <span className="truncate">{r.label}</span>
          <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
            {r.count.toLocaleString()} · {formatPercent(r.count, r.base)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Cross-tabs ─────────────────────────────────────────────────────────────

export interface CrossTabViewProps {
  crosstab: CrossTab;
  chart: CrosstabChartKind;
  labelMode: SurveyReportLabelMode;
  rowLabel: string;
  colLabel: string;
}

export function CrossTabView({ crosstab, chart, labelMode, rowLabel, colLabel }: CrossTabViewProps) {
  if (crosstab.n === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Nobody answered both questions.
      </div>
    );
  }
  if (chart === "stacked_bar") return <CrossTabStacked crosstab={crosstab} labelMode={labelMode} />;
  return (
    <CrossTabTable
      crosstab={crosstab}
      labelMode={labelMode}
      heat={chart === "heatmap"}
      rowLabel={rowLabel}
      colLabel={colLabel}
    />
  );
}

function CrossTabStacked({ crosstab, labelMode }: { crosstab: CrossTab; labelMode: SurveyReportLabelMode }) {
  const data = useMemo(
    () =>
      crosstab.row_options.map((ro, i) => {
        const d: Record<string, number | string> = { label: ro.label, __total: crosstab.row_totals[i] ?? 0 };
        crosstab.col_options.forEach((co, j) => {
          const count = crosstab.cells[i]?.[j] ?? 0;
          const total = crosstab.row_totals[i] ?? 0;
          d[co.key] = labelMode === "percent" ? (total > 0 ? Math.round((count / total) * 1000) / 10 : 0) : count;
          d[`__count_${co.key}`] = count;
        });
        return d;
      }),
    [crosstab, labelMode]
  );
  const height = Math.max(140, crosstab.row_options.length * 34 + 60);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          allowDecimals={false}
          domain={labelMode === "percent" ? [0, 100] : undefined}
          tickFormatter={(v: unknown) => (labelMode === "percent" ? `${v}%` : String(v))}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          interval={0}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: unknown) => truncate(String(v), 24)}
        />
        <Tooltip
          formatter={(value, name, item) => {
            const payload = (item?.payload ?? {}) as Record<string, number | string>;
            const count = Number(payload[`__count_${String(name)}`] ?? value ?? 0);
            const total = Number(payload.__total ?? 0);
            return [tooltipText(count, total), crosstab.col_options.find((c) => c.key === String(name))?.label ?? String(name)];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => crosstab.col_options.find((c) => c.key === String(value))?.label ?? String(value)}
        />
        {crosstab.col_options.map((co, j) => (
          <Bar
            key={co.key}
            dataKey={co.key}
            stackId="x"
            fill={REPORT_PALETTE[j % REPORT_PALETTE.length]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function CrossTabTable({
  crosstab,
  labelMode,
  heat,
  rowLabel,
  colLabel,
}: {
  crosstab: CrossTab;
  labelMode: SurveyReportLabelMode;
  heat: boolean;
  rowLabel: string;
  colLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">
              <span className="text-muted-foreground">{rowLabel}</span>
              <span className="mx-1 text-muted-foreground">↓ / →</span>
              <span className="text-muted-foreground">{colLabel}</span>
            </TableHead>
            {crosstab.col_options.map((co) => (
              <TableHead key={co.key} className="text-right" title={co.label}>
                {truncate(co.label, 20)}
              </TableHead>
            ))}
            <TableHead className="text-right font-semibold">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {crosstab.row_options.map((ro, i) => {
            const rowTotal = crosstab.row_totals[i] ?? 0;
            return (
              <TableRow key={ro.key}>
                <TableCell className="font-medium" title={ro.label}>
                  {truncate(ro.label, 36)}
                </TableCell>
                {crosstab.col_options.map((co, j) => {
                  const v = crosstab.cells[i]?.[j] ?? 0;
                  const h = heat ? cellHeat(v, crosstab.cells) : 0;
                  return (
                    <TableCell
                      key={co.key}
                      className={cn("text-right tabular-nums", heat && h > 0.55 && "text-white")}
                      style={heat ? { backgroundColor: `rgba(99, 102, 241, ${(h * 0.85).toFixed(3)})` } : undefined}
                      title={tooltipText(v, rowTotal)}
                    >
                      {formatSliceValue(v, rowTotal, labelMode)}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-semibold tabular-nums">{rowTotal.toLocaleString()}</TableCell>
              </TableRow>
            );
          })}
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            {crosstab.col_totals.map((t, j) => (
              <TableCell key={crosstab.col_options[j]?.key ?? j} className="text-right font-semibold tabular-nums">
                {formatSliceValue(t, crosstab.n, labelMode)}
              </TableCell>
            ))}
            <TableCell className="text-right font-semibold tabular-nums">{crosstab.n.toLocaleString()}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {labelMode === "percent" ? "Row percentages; " : ""}
        {crosstab.n.toLocaleString()} respondents answered both questions.
      </p>
    </div>
  );
}
