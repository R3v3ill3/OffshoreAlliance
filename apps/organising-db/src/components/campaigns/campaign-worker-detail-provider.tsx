"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { WorkerDetailSheet } from "./wall-chart/worker-detail-sheet";
import { CopyWorkerToUnitDialog } from "./wall-chart/copy-worker-to-unit-dialog";
import type {
  WallChartMemberRow,
  WallChartOU,
  WallChartOUAssignment,
  WallChartRoleType,
  WallChartWorkerContactFocusField,
} from "./wall-chart/types";
import {
  CAMPAIGN_MEMBERS_FULL_SELECT,
  normalizeCampaignMemberRows,
  type RawCampaignMemberRow,
} from "./wall-chart/normalize-members";

type CampaignWorkerDetailContextValue = {
  openWorkerDetail: (
    workerId: number,
    options?: { focusField?: WallChartWorkerContactFocusField | null }
  ) => void;
};

const CampaignWorkerDetailContext =
  createContext<CampaignWorkerDetailContextValue | null>(null);

type CampaignWorkerDetailProviderProps = {
  campaignId: string;
  canWrite: boolean;
  children: ReactNode;
};

export function CampaignWorkerDetailProvider({
  campaignId,
  canWrite,
  children,
}: CampaignWorkerDetailProviderProps) {
  const supabase = createClient();
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [detailFocusField, setDetailFocusField] =
    useState<WallChartWorkerContactFocusField | null>(null);
  const [copyWorkerId, setCopyWorkerId] = useState<number | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members-full", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(CAMPAIGN_MEMBERS_FULL_SELECT)
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as unknown as RawCampaignMemberRow[];
    },
  });

  const { data: ous = [] } = useQuery({
    queryKey: ["campaign-ous", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WallChartOU[];
    },
  });

  const ouIdsKey = ous.map((o) => o.ou_id).join(",");

  const { data: ouAssign = [] } = useQuery({
    queryKey: ["campaign-worker-ou", campaignId, ouIdsKey],
    queryFn: async () => {
      const ids = ous.map((o) => o.ou_id);
      if (ids.length === 0) return [] as WallChartOUAssignment[];
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id, is_primary")
        .in("ou_id", ids);
      if (error) throw error;
      return (data ?? []) as WallChartOUAssignment[];
    },
    enabled: ous.length > 0,
  });

  const memberRows = useMemo<WallChartMemberRow[]>(
    () => normalizeCampaignMemberRows(members),
    [members]
  );

  const unitsByWorker = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const a of ouAssign) {
      const list = m.get(a.worker_id) ?? [];
      list.push(a.ou_id);
      m.set(a.worker_id, list);
    }
    return m;
  }, [ouAssign]);

  const selectedRow = useMemo(() => {
    if (selectedWorkerId == null) return undefined;
    return memberRows.find((r) => r.worker_id === selectedWorkerId);
  }, [memberRows, selectedWorkerId]);

  const copyWorker = useMemo(() => {
    if (copyWorkerId == null) return undefined;
    return memberRows.find((r) => r.worker_id === copyWorkerId)?.worker ?? undefined;
  }, [memberRows, copyWorkerId]);

  const { data: roleTypes = [] } = useQuery({
    queryKey: ["member_role_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_role_types")
        .select("role_type_id, role_name, display_name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as WallChartRoleType[];
    },
    enabled: selectedWorkerId != null,
  });

  const openWorkerDetail = useCallback(
    (
      workerId: number,
      options?: { focusField?: WallChartWorkerContactFocusField | null }
    ) => {
      setDetailFocusField(options?.focusField ?? null);
      setSelectedWorkerId(workerId);
    },
    []
  );

  const closeWorkerDetail = useCallback(() => {
    setSelectedWorkerId(null);
    setDetailFocusField(null);
  }, []);

  const contextValue = useMemo(
    () => ({ openWorkerDetail }),
    [openWorkerDetail]
  );

  return (
    <CampaignWorkerDetailContext.Provider value={contextValue}>
      {children}

      <Sheet
        open={!!selectedRow}
        onOpenChange={(open) => {
          if (!open) closeWorkerDetail();
        }}
      >
        <SheetContent
          className="w-full sm:max-w-xl overflow-y-auto"
          onOpenAutoFocus={(e) => {
            if (detailFocusField) e.preventDefault();
          }}
        >
          <SheetHeader>
            <SheetTitle>
              {selectedRow?.worker
                ? `${selectedRow.worker.first_name} ${selectedRow.worker.last_name}`
                : "Worker"}
            </SheetTitle>
          </SheetHeader>
          {selectedRow?.worker && (
            <WorkerDetailSheet
              key={selectedRow.worker_id}
              campaignId={campaignId}
              workerId={selectedRow.worker_id}
              worker={selectedRow.worker}
              ous={ous}
              assignedOuIds={(unitsByWorker.get(selectedRow.worker_id) ?? [])
                .slice()
                .sort((a, b) => a - b)}
              primaryOuId={
                ouAssign.find(
                  (a) => a.worker_id === selectedRow.worker_id && a.is_primary
                )?.ou_id ?? null
              }
              roleTypes={roleTypes}
              canWrite={canWrite}
              detailFocusField={detailFocusField}
              onClose={closeWorkerDetail}
              onRequestCopyToUnit={(id) => setCopyWorkerId(id)}
            />
          )}
        </SheetContent>
      </Sheet>

      <CopyWorkerToUnitDialog
        open={copyWorkerId != null}
        onOpenChange={(open) => {
          if (!open) setCopyWorkerId(null);
        }}
        campaignId={campaignId}
        workerId={copyWorkerId}
        workerName={
          copyWorker ? `${copyWorker.first_name} ${copyWorker.last_name}` : undefined
        }
        ous={ous}
        currentOuIds={copyWorkerId != null ? unitsByWorker.get(copyWorkerId) ?? [] : []}
      />
    </CampaignWorkerDetailContext.Provider>
  );
}

export function useCampaignWorkerDetail() {
  return useContext(CampaignWorkerDetailContext);
}

export function CampaignWorkerNameButton({
  workerId,
  children,
  className,
}: {
  workerId: number;
  children: ReactNode;
  className?: string;
}) {
  const detail = useCampaignWorkerDetail();

  if (!detail) {
    return <span className={className}>{children}</span>;
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    detail.openWorkerDetail(workerId);
  };

  return (
    <Button
      type="button"
      variant="link"
      className={cn(
        "h-auto p-0 align-baseline text-left font-medium leading-normal",
        className
      )}
      onClick={handleClick}
    >
      {children}
    </Button>
  );
}

