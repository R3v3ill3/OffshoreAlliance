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
        .select(
          `membership_id, worker_id,
           worker:workers(
             worker_id, first_name, last_name, email, phone,
             member_role_type_id, is_bargaining_rep, is_hsr,
             union_membership_type_id,
             non_oa_union_option_id,
             canonical_occupation_id,
             member_role_type:member_role_types(role_name, role_type_id, display_name),
             union_membership_type:union_membership_types(type_name, display_name),
             non_oa_union_option:non_oa_union_options!workers_non_oa_union_option_id_fkey(
               non_oa_union_option_id, badge_initials, display_name
             ),
             canonical_occupation:occupations!workers_canonical_occupation_id_fkey(occupation_id, canonical_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as unknown as RawMemberRow[];
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

  const memberRows = useMemo<WallChartMemberRow[]>(() => {
    return members.map((row) => {
      const wr = row.worker;
      const w = (Array.isArray(wr) ? wr[0] : wr) as RawWorker | null;
      const mtRaw = w?.member_role_type;
      const mt = (Array.isArray(mtRaw) ? mtRaw[0] : mtRaw) ?? null;
      const umRaw = w?.union_membership_type;
      const um = (Array.isArray(umRaw) ? umRaw[0] : umRaw) ?? null;
      const nauoRaw = w?.non_oa_union_option;
      const nauo = (Array.isArray(nauoRaw) ? nauoRaw[0] : nauoRaw) ?? null;
      const coRaw = w?.canonical_occupation;
      const occ = (Array.isArray(coRaw) ? coRaw[0] : coRaw) ?? null;

      return {
        membership_id: row.membership_id,
        worker_id: row.worker_id,
        worker: w
          ? {
              worker_id: w.worker_id,
              first_name: w.first_name,
              last_name: w.last_name,
              email: w.email,
              phone: w.phone,
              member_role_type_id: w.member_role_type_id,
              is_bargaining_rep: w.is_bargaining_rep,
              is_hsr: w.is_hsr,
              union_membership_type_id: w.union_membership_type_id,
              non_oa_union_option_id: w.non_oa_union_option_id ?? null,
              canonical_occupation_id: w.canonical_occupation_id,
              member_role_type: mt,
              union_membership_type: um,
              non_oa_union_option:
                nauo &&
                typeof nauo === "object" &&
                "badge_initials" in nauo &&
                typeof (nauo as { badge_initials: unknown }).badge_initials === "string"
                  ? (nauo as {
                      non_oa_union_option_id: number;
                      badge_initials: string;
                      display_name: string;
                    })
                  : null,
              canonical_occupation: occ,
            }
          : null,
      };
    });
  }, [members]);

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

type RawMemberRow = { membership_id: number; worker_id: number; worker: unknown };

type RawWorker = {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  member_role_type_id: number | null;
  is_bargaining_rep: boolean | null;
  is_hsr: boolean | null;
  union_membership_type_id: number | null;
  non_oa_union_option_id: number | null;
  canonical_occupation_id: number | null;
  member_role_type: unknown;
  union_membership_type: unknown;
  non_oa_union_option: unknown;
  canonical_occupation: unknown;
};
