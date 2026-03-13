"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChartNoAxesCombined } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

interface WorksiteDistributionChartProps {
  data: { name: string; value: number }[];
  isLoading?: boolean;
}

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#8dd1e1",
  "#a4de6c",
  "#d0ed57",
];

export function WorksiteDistributionChart({
  data,
  isLoading,
}: WorksiteDistributionChartProps) {
  // Memoize sorted data to prevent unnecessary re-renders
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.value - a.value);
  }, [data]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ChartNoAxesCombined className="h-4 w-4 text-muted-foreground" />
          Worksite Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[300px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <EurekaLoadingSpinner size="md" />
          </div>
        ) : sortedData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No worksite data available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sortedData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {sortedData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`${value ?? ""} worksites`, "Count"]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend layout="vertical" align="right" verticalAlign="middle" />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
