"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { fetchApi } from "@/lib/api/fetch-api";
import { useDevice } from "@/contexts/device-context";
import { useGroupsV2 } from "@/lib/flags/groups-v2";
import { syncChangedSomething } from "@/lib/workers/sync-notice-message";
import {
  resolveWorkforceView,
  type WorkforceView,
} from "@/lib/campaign/workforce-view";
import { CampaignWallChart } from "../campaign-wall-chart";
import { CampaignWallChartV2 } from "../campaign-wall-chart-v2";
import { ImportParticipationDialog } from "../wall-chart/participation-import/import-participation-dialog";
import { FindDuplicatesButton } from "../wall-chart/find-duplicate-workers-dialog";
import { SyncOnOpenNotice } from "./sync-on-open-notice";
import { WorkforceListView } from "./workforce-list-view";

export type { WorkforceView } from "@/lib/campaign/workforce-view";

/** The sync route's JSON as the board reads it (wp2.4.md §3.14; counts are D62's plus `membersAdded`). */
type SyncUniverseResponse = {
  success?: boolean;
  workersAdded?: number;
  membersAdded?: number;
  ouAssignmentsUpserted?: number;
  ouAssignmentsSkipped?: number;
  error?: string;
};

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
  // isMobile comes from the request's user-agent header, so it is identical on
  // the server and the client — safe to read during render, no hydration gap.
  const { isMobile } = useDevice();
  const view = useMemo(
    () => resolveWorkforceView(searchParams.get("view"), isMobile),
    [searchParams, isMobile]
  );
  // WP2.4 (FL-b, wp2.4.md §3.1 principle 1): the one place that chooses a shell.
  const groupsV2 = useGroupsV2();

  const setView = useCallback(
    (next: WorkforceView) => {
      const params = new URLSearchParams(searchParams.toString());
      // Always write the param. Dropping it for the "default" view would send a
      // phone user who picked the wall chart straight back to the list.
      params.set("view", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  // Sync-on-open (SY-c, wp2.4.md §3.14): the same POST on every board mount
  // when the user can write; what it changed is announced below, and the
  // members / placements are refetched only when something changed
  // (`membersAdded` or placements made — not `workersAdded`, which counts
  // every matched member and is > 0 on almost every open).
  const sync = useQuery({
    queryKey: ["sync-universe-workers", campaignId],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sync-universe-workers`, {
        method: "POST",
      });
      const json = (await res.json()) as SyncUniverseResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Universe sync failed");
      }
      return json;
    },
    enabled: canWrite,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  // Only a POST this mount actually made counts: a re-mount within `staleTime`
  // reads the cached result and must neither refetch nor re-show a notice the
  // user dismissed (fix round 2, A1).
  const syncResult = sync.isFetchedAfterMount ? sync.data : undefined;
  useEffect(() => {
    if (!syncResult || !syncChangedSomething(syncResult)) return;
    queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
  }, [syncResult, queryClient, campaignId]);

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
      {syncResult && <SyncOnOpenNotice key={sync.dataUpdatedAt} result={syncResult} />}
      {view === "list" ? (
        <WorkforceListView campaignId={campaignId} canWrite={canWrite} />
      ) : groupsV2 ? (
        <CampaignWallChartV2 campaignId={campaignId} canWrite={canWrite} />
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
