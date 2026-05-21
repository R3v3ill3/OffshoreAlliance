"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CampaignWallChart } from "../campaign-wall-chart";
import { WorkforceListView } from "./workforce-list-view";

export type WorkforceView = "wall-chart" | "list";

const DEFAULT_VIEW: WorkforceView = "wall-chart";

function parseView(raw: string | null): WorkforceView {
  return raw === "list" ? "list" : DEFAULT_VIEW;
}

export function WorkforceBoard({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(() => parseView(searchParams.get("view")), [searchParams]);

  const setView = useCallback(
    (next: WorkforceView) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_VIEW) {
        params.delete("view");
      } else {
        params.set("view", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="space-y-3">
      <ViewToggle view={view} onChange={setView} />
      {view === "list" ? (
        <WorkforceListView campaignId={campaignId} canWrite={canWrite} />
      ) : (
        <CampaignWallChart campaignId={campaignId} canWrite={canWrite} />
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: WorkforceView;
  onChange: (next: WorkforceView) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-background p-0.5">
      <ToggleButton
        active={view === "wall-chart"}
        onClick={() => onChange("wall-chart")}
        icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden />}
        label="Wall chart"
      />
      <ToggleButton
        active={view === "list"}
        onClick={() => onChange("list")}
        icon={<List className="h-3.5 w-3.5" aria-hidden />}
        label="List"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      className={cn("h-7 px-2 text-xs gap-1", active && "shadow-sm")}
      aria-pressed={active}
    >
      {icon}
      {label}
    </Button>
  );
}
