"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import Link from "next/link";

interface CampaignsByStageChartProps {
  data: { name: string; value: number }[];
  isLoading?: boolean;
}

const STAGE_COLORS: Record<string, string> = {
  "Not Started": "#94a3b8",
  Planning: "#3b82f6",
  Activation: "#8b5cf6",
  Mobilization: "#f59e0b",
  "Gate Review": "#ef4444",
  Consolidation: "#10b981",
  Completion: "#06b6d4",
};

const STAGE_ORDER = [
  "Not Started",
  "Planning",
  "Activation",
  "Mobilization",
  "Gate Review",
  "Consolidation",
  "Completion",
];

export function CampaignsByStageChart({
  data,
  isLoading,
}: CampaignsByStageChartProps) {
  // Sort data by stage order
  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      const aIndex = STAGE_ORDER.indexOf(a.name);
      const bIndex = STAGE_ORDER.indexOf(b.name);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
    return sorted;
  }, [data]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Campaigns by Stage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="h-[300px] w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <EurekaLoadingSpinner size="md" />
            </div>
          ) : sortedData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No campaign stage data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={sortedData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  formatter={(value) => [`${value ?? 0} campaigns`, "Count"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {sortedData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        STAGE_COLORS[entry.name] ||
                        STAGE_COLORS["Not Started"]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
