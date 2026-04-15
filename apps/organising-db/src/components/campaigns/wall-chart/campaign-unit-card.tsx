"use client";

import { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WALL_CHART_GRID_CLASS } from "./rating-colour";
import { humanizeOuType, ouDisplayName, type WallChartOU } from "./types";

export type CampaignUnitCardProps = {
  /** Pass null when rendering a pseudo-unit (e.g. unassigned). */
  ou: WallChartOU | null;
  /** Title override for pseudo-units like "Unassigned". */
  fallbackTitle?: string;
  workerCount: number;
  estimate?: number | null;
  /** Optional summary metric content rendered in the header band. */
  summary?: ReactNode;
  /** Optional toolbar rendered next to the title (filters/sort). */
  toolbar?: ReactNode;
  /** Worker tiles. */
  children: ReactNode;
  /** Placeholder cells (greyed out) for unfilled estimate slots. */
  placeholders?: number;
};

const PLACEHOLDER_CAP = 24;

export function CampaignUnitCard({
  ou,
  fallbackTitle,
  workerCount,
  estimate,
  summary,
  toolbar,
  children,
  placeholders = 0,
}: CampaignUnitCardProps) {
  const title = ou ? ouDisplayName(ou) : (fallbackTitle ?? "Unit");
  const typeChip = ou?.ou_type ? humanizeOuType(ou.ou_type) : null;
  const est = estimate ?? ou?.total_workers_estimated ?? 0;
  const cappedPlaceholders = Math.max(0, placeholders);

  return (
    <Card className="print:break-inside-avoid print:shadow-none">
      <CardHeader className="pb-2 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold leading-tight truncate">{title}</h3>
              {typeChip && (
                <span className="text-[10px] uppercase tracking-wide rounded border px-1.5 py-px text-muted-foreground">
                  {typeChip}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {workerCount} named{est > 0 && ` / ${est} est.`}
            </p>
          </div>
          {toolbar && <div className="flex items-center gap-1 print:hidden">{toolbar}</div>}
        </div>
        {summary && <div className="pt-1">{summary}</div>}
      </CardHeader>
      <CardContent>
        <div className={WALL_CHART_GRID_CLASS}>
          {children}
          {Array.from({ length: Math.min(cappedPlaceholders, PLACEHOLDER_CAP) }).map((_, i) => (
            <div
              key={`p-${i}`}
              className="min-h-[3.25rem] rounded border border-dashed bg-zinc-300/50 dark:bg-zinc-600/50"
            />
          ))}
        </div>
        {cappedPlaceholders > PLACEHOLDER_CAP && (
          <p className="text-xs text-muted-foreground mt-2">
            +{cappedPlaceholders - PLACEHOLDER_CAP} more placeholder cells
          </p>
        )}
      </CardContent>
    </Card>
  );
}
