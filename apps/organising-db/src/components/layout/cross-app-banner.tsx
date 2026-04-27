"use client";

import { usePathname } from "next/navigation";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Phase 5: hide the platform banner on stage planning pages where the
// header chrome was already too tall (the working area was getting
// squeezed by 4-5 stacked headers before the cleanup).
function isStagePlanningRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /\/campaigns\/[^/]+\/plan\/stage\//.test(pathname);
}

export function CrossAppBanner() {
  const pathname = usePathname();
  if (isStagePlanningRoute(pathname)) return null;

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
