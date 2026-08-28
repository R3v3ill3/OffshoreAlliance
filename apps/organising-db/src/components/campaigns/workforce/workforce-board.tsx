"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { fetchApi } from "@/lib/api/fetch-api";
import { CampaignWallChart } from "../campaign-wall-chart";
import { ImportParticipationDialog } from "../wall-chart/participation-import/import-participation-dialog";
import { FindDuplicatesButton } from "../wall-chart/find-duplicate-workers-dialog";
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

  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  useQuery({
    queryKey: ["sync-universe-workers", campaignId],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sync-universe-workers`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        success?: boolean;
        workersAdded?: number;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Universe sync failed");
      }
      if ((json.workersAdded ?? 0) > 0) {
        queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
        queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      }
      return json;
    },
    enabled: canWrite,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ViewToggle view={view} onChange={setView} />
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <FindDuplicatesButton campaignId={campaignId} canWrite={canWrite} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setImportOpen(true)}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Import participation
            </Button>
          </div>
        )}
      </div>
      {view === "list" ? (
        <WorkforceListView campaignId={campaignId} canWrite={canWrite} />
      ) : (
        <CampaignWallChart campaignId={campaignId} canWrite={canWrite} />
      )}
      {canWrite && (
        <ImportParticipationDialog
          campaignId={campaignId}
          open={importOpen}
          onOpenChange={setImportOpen}
        />
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
