"use client";

import { Database, MapIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const OA_PLANNER_URL =
  process.env.NEXT_PUBLIC_OA_PLANNER_URL ?? "https://oaplanner.uconstruct.app";

export function CrossAppBanner() {
  return (
    <div className="flex h-9 shrink-0 items-center border-b bg-muted/40 px-3 gap-1 text-xs font-medium">
      <span className="text-muted-foreground mr-1 hidden sm:inline">Apps:</span>

      {/* Active app — this app */}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1 cursor-default",
          "bg-background border text-foreground shadow-sm"
        )}
        aria-current="page"
      >
        <Database className="h-3 w-3 shrink-0" />
        <span>Organising DB</span>
      </div>

      {/* Separator */}
      <span className="text-muted-foreground/40 select-none px-0.5">·</span>

      {/* OAPlanner — same-tab link; cookie domain is shared so session carries over */}
      <a
        href={OA_PLANNER_URL}
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors",
          "text-muted-foreground hover:bg-background hover:text-foreground hover:border hover:shadow-sm"
        )}
        title="Open OA Planner — campaign strategic planning"
      >
        <MapIcon className="h-3 w-3 shrink-0" />
        <span>OA Planner</span>
      </a>
    </div>
  );
}
