"use client";

import { Database } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function CrossAppBanner() {
  return (
    <div className="flex h-9 shrink-0 items-center border-b bg-muted/40 px-3 gap-1 text-xs font-medium">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1 cursor-default",
          "bg-background border text-foreground shadow-sm"
        )}
        aria-current="page"
      >
        <Database className="h-3 w-3 shrink-0" />
        <span>Offshore Alliance Platform</span>
      </div>
    </div>
  );
}
