"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { OaLeaderRole } from "@/types/database";
import { getWallChartDefaultCumulative, isWorkerMemberLike } from "@/lib/campaign/constants";

function ratingBgClass(cumulative: number | null | undefined): string {
  if (cumulative == null) return "bg-zinc-300/80 dark:bg-zinc-600/80";
  if (cumulative < 2) return "bg-sky-600/35";
  if (cumulative < 3) return "bg-emerald-600/35";
  if (cumulative < 4) return "bg-amber-600/35";
  return "bg-red-600/35";
}

const wallChartGridClass =
  "grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 print:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] print:gap-1.5";

export function CampaignWallChart({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members-full", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `membership_id, worker_id, oa_leader_role,
           worker:workers(
             worker_id, first_name, last_name, email, phone,
             member_role_type:member_role_types(role_name, role_type_id),
             union_membership_type:union_membership_types(type_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ratingSummary = [] } = useQuery({
    queryKey: ["campaign-rating-summary", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_worker_rating_summary").select("*").eq(
        "campaign_id",
        campaignId
      );
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ous = [] } = useQuery({
    queryKey: ["campaign-ous", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ouIdsKey = ous.map((o: { ou_id: number }) => o.ou_id).join(",");

  const { data: ouAssign = [] } = useQuery({
    queryKey: ["campaign-worker-ou", campaignId, ouIdsKey],
    queryFn: async () => {
      const ids = ous.map((o: { ou_id: number }) => o.ou_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id, is_primary")
        .in("ou_id", ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: ous.length > 0,
  });

  const { data: campaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("total_worker_estimate").eq("campaign_id", campaignId).single();
      if (error) throw error;
      return data;
    },
  });

  const summaryByWorker = useMemo(() => {
    const m = new Map<number, { cumulative_rating: number | null; last_activity_rating: number | null }>();
    for (const r of ratingSummary as {
      worker_id: number;
      cumulative_rating: number | null;
      last_activity_rating: number | null;
    }[]) {
      m.set(r.worker_id, r);
    }
    return m;
  }, [ratingSummary]);

  const workerNameById = useMemo(() => {
    const m = new Map<number, { first: string; last: string }>();
    for (const row of members as { worker_id: number; worker: unknown }[]) {
      const wr = row.worker;
      const w = (Array.isArray(wr) ? wr[0] : wr) as { first_name: string; last_name: string } | null;
      if (w) m.set(row.worker_id, { first: w.first_name, last: w.last_name });
    }
    return m;
  }, [members]);

  const compareWorkerIds = useCallback(
    (a: number, b: number) => {
      const na = workerNameById.get(a);
      const nb = workerNameById.get(b);
      const lastCmp = (na?.last ?? "").localeCompare(nb?.last ?? "", undefined, { sensitivity: "base" });
      if (lastCmp !== 0) return lastCmp;
      const firstCmp = (na?.first ?? "").localeCompare(nb?.first ?? "", undefined, { sensitivity: "base" });
      if (firstCmp !== 0) return firstCmp;
      return a - b;
    },
    [workerNameById]
  );

  const assignedWorkerIds = useMemo(() => {
    const s = new Set<number>();
    if ((ous as { ou_id: number }[]).length === 0) return s;
    for (const a of ouAssign as { worker_id: number }[]) {
      s.add(a.worker_id);
    }
    return s;
  }, [ous, ouAssign]);

  const unassignedWorkerIds = useMemo(() => {
    const ids = (members as { worker_id: number }[])
      .map((row) => row.worker_id)
      .filter((id) => !assignedWorkerIds.has(id));
    ids.sort(compareWorkerIds);
    return ids;
  }, [members, assignedWorkerIds, compareWorkerIds]);

  const workersByOu = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const ou of ous as { ou_id: number }[]) {
      map.set(ou.ou_id, []);
    }
    for (const a of ouAssign as { ou_id: number; worker_id: number; is_primary: boolean }[]) {
      const list = map.get(a.ou_id);
      if (list) list.push(a.worker_id);
    }
    for (const list of map.values()) {
      list.sort(compareWorkerIds);
    }
    return map;
  }, [ous, ouAssign, compareWorkerIds]);

  const selectedRow = useMemo(() => {
    if (selectedWorkerId == null) return undefined;
    const raw = members.find((x: { worker_id: number }) => x.worker_id === selectedWorkerId) as unknown;
    const m = raw as {
      membership_id: number;
      worker_id: number;
      oa_leader_role: string | null;
      worker: unknown;
    } | undefined;
    if (!m) return undefined;
    const wr = m.worker;
    const w = (Array.isArray(wr) ? wr[0] : wr) as {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      member_role_type: unknown;
      union_membership_type: unknown;
    } | null;
    const mtRaw = w?.member_role_type;
    const mt = (Array.isArray(mtRaw) ? mtRaw[0] : mtRaw) as {
      role_name: string;
      role_type_id: number;
    } | null;
    const umRaw = w?.union_membership_type;
    const um = (Array.isArray(umRaw) ? umRaw[0] : umRaw) as { type_name: string } | null;
    if (!w) return undefined;
    return {
      membership_id: m.membership_id,
      worker_id: m.worker_id,
      oa_leader_role: m.oa_leader_role as OaLeaderRole | null,
      worker: {
        ...w,
        member_role_type: mt,
        union_membership_type: um,
      },
    };
  }, [members, selectedWorkerId]);

  const updateWorker = useAuthAwareMutation({
    mutationFn: async (vars: {
      worker_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      member_role_type_id: number | null;
    }) => {
      const { error } = await supabase
        .from("workers")
        .update({
          first_name: vars.first_name,
          last_name: vars.last_name,
          email: vars.email,
          phone: vars.phone,
          member_role_type_id: vars.member_role_type_id,
        })
        .eq("worker_id", vars.worker_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
    },
  });

  const updateMembership = useAuthAwareMutation({
    mutationFn: async (vars: { membership_id: number; oa_leader_role: OaLeaderRole | null }) => {
      const { error } = await supabase
        .from("campaign_worker_membership")
        .update({ oa_leader_role: vars.oa_leader_role })
        .eq("membership_id", vars.membership_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
    },
  });

  const { data: roleTypes = [] } = useQuery({
    queryKey: ["member_role_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_role_types")
        .select("role_type_id, role_name, display_name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedWorkerId,
  });

  const estimate = (campaign?.total_worker_estimate as number | null) ?? 0;
  const named = members.length;
  const campaignGreySlots = Math.max(0, estimate - named);

  function renderCell(workerId: number) {
    const raw = members.find((m: { worker_id: number }) => m.worker_id === workerId) as unknown;
    const row = raw as {
      worker_id: number;
      oa_leader_role: string | null;
      worker: unknown;
    } | undefined;
    const wr = row?.worker;
    const w = (Array.isArray(wr) ? wr[0] : wr) as {
      first_name: string;
      last_name: string;
      member_role_type: unknown;
      union_membership_type: unknown;
    } | null;
    const mtRaw = w?.member_role_type;
    const mt = (Array.isArray(mtRaw) ? mtRaw[0] : mtRaw) as { role_name: string } | null;
    const umRaw = w?.union_membership_type;
    const um = (Array.isArray(umRaw) ? umRaw[0] : umRaw) as { type_name: string } | null;
    const sum = summaryByWorker.get(workerId);
    const storedCum = sum?.cumulative_rating ?? null;
    const last = sum?.last_activity_rating ?? null;
    const defaultCum =
      storedCum == null
        ? getWallChartDefaultCumulative({
            unionMembershipTypeName: um?.type_name,
            memberRoleName: mt?.role_name,
            oaLeaderRole: row?.oa_leader_role,
          })
        : null;
    const colourCum = storedCum ?? defaultCum;
    const isMemberLike = isWorkerMemberLike({
      unionMembershipTypeName: um?.type_name,
      memberRoleName: mt?.role_name,
    });

    const displayName = w ? `${w.first_name} ${w.last_name}` : String(workerId);
    const titleRatings = `Cumulative ${storedCum ?? "—"}, last activity ${last ?? "—"}`;
    const titleDefaultHint =
      defaultCum != null
        ? ` Background uses default ${defaultCum} (${defaultCum === 1 ? "leadership" : "member"}) for colour only.`
        : "";

    return (
      <button
        key={workerId}
        type="button"
        disabled={!canWrite}
        title={`${displayName}. ${titleRatings}.${titleDefaultHint}`}
        onClick={() => canWrite && setSelectedWorkerId(workerId)}
        className={`text-left text-[11px] leading-tight p-1.5 rounded border min-h-[3.25rem] flex flex-col gap-0.5 justify-between ${ratingBgClass(
          colourCum
        )} ${canWrite ? "cursor-pointer hover:opacity-90" : ""}`}
      >
        <span className="font-medium line-clamp-2 break-words">{displayName}</span>
        <span className="text-[9px] text-muted-foreground tabular-nums">
          c{storedCum ?? "—"} · L{last ?? "—"}
        </span>
        <div className="flex items-center gap-0.5 flex-wrap">
          {row?.oa_leader_role && (
            <span className="text-[9px] uppercase bg-background/60 px-0.5 rounded leading-none py-px">
              {row.oa_leader_role}
            </span>
          )}
          {isMemberLike && (
            <Image src="/eurekaflag.gif" alt="Member" width={14} height={10} className="rounded-sm shrink-0" unoptimized />
          )}
        </div>
      </button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Wall chart</CardTitle>
        <p className="text-sm text-muted-foreground">
          Colours: blue &lt;2, green 2–&lt;3, orange 3–&lt;4, red ≥4, grey unrated. Cells show c = cumulative
          and L = last activity (hover for full labels). Unrated cells may use membership or leadership defaults
          for background colour only (see hover text).{" "}
          <span className="text-foreground/90">
            Campaign-level unmapped slots are unnamed gaps from the worker estimate; unassigned are named members
            not placed in an organising unit yet.
          </span>{" "}
          Click a name to edit (staff only).
        </p>
      </CardHeader>
      <CardContent className="space-y-8 print:space-y-4">
        {campaignGreySlots > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Campaign-level unmapped ({campaignGreySlots})</p>
            <div className={`${wallChartGridClass} print:break-inside-avoid`}>
              {Array.from({ length: Math.min(campaignGreySlots, 40) }).map((_, i) => (
                <div
                  key={i}
                  className="min-h-[3.25rem] rounded border border-dashed bg-zinc-300/50 dark:bg-zinc-600/50 text-[10px] flex items-center justify-center text-muted-foreground"
                >
                  —
                </div>
              ))}
            </div>
            {campaignGreySlots > 40 && (
              <p className="text-xs text-muted-foreground mt-2">+{campaignGreySlots - 40} more unmapped slots</p>
            )}
          </div>
        )}

        {unassignedWorkerIds.length > 0 && (
          <div className="space-y-2 print:break-inside-avoid">
            <p className="text-sm font-medium">
              Unassigned workers
              <span className="text-muted-foreground font-normal text-xs ml-2">{unassignedWorkerIds.length}</span>
            </p>
            <div className={wallChartGridClass}>{unassignedWorkerIds.map((wid) => renderCell(wid))}</div>
          </div>
        )}

        {ous.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add organising units to group workers into frames on the wall chart. Until then, members appear under
            unassigned above (if any).
          </p>
        ) : (
          (ous as { ou_id: number; name: string; total_workers_estimated: number | null }[]).map((ou) => {
            const ids = workersByOu.get(ou.ou_id) ?? [];
            const est = ou.total_workers_estimated ?? 0;
            const placeholders = Math.max(0, est - ids.length);

            return (
              <div key={ou.ou_id} className="space-y-2 print:break-inside-avoid">
                <p className="text-sm font-medium">
                  {ou.name}
                  <span className="text-muted-foreground font-normal text-xs ml-2">
                    {ids.length} named
                    {est > 0 && ` / ${est} est.`}
                  </span>
                </p>
                <div className={wallChartGridClass}>
                  {ids.map((wid) => renderCell(wid))}
                  {Array.from({ length: Math.min(placeholders, 24) }).map((_, i) => (
                    <div
                      key={`p-${i}`}
                      className="min-h-[3.25rem] rounded border border-dashed bg-zinc-300/50 dark:bg-zinc-600/50"
                    />
                  ))}
                </div>
                {placeholders > 24 && (
                  <p className="text-xs text-muted-foreground">+{placeholders - 24} more placeholder cells</p>
                )}
              </div>
            );
          })
        )}

        <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          Print
        </Button>
      </CardContent>

      <Sheet open={!!selectedRow} onOpenChange={() => setSelectedWorkerId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Worker in campaign</SheetTitle>
          </SheetHeader>
          {selectedRow?.worker && (
            <WorkerCampaignSheetBody
              key={selectedRow.worker_id}
              membershipId={selectedRow.membership_id}
              workerId={selectedRow.worker_id}
              worker={selectedRow.worker}
              oaLeaderRole={selectedRow.oa_leader_role as OaLeaderRole | null}
              roleTypes={roleTypes}
              canWrite={canWrite}
              onClose={() => setSelectedWorkerId(null)}
              updateWorker={updateWorker}
              updateMembership={updateMembership}
            />
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function WorkerCampaignSheetBody({
  membershipId,
  workerId,
  worker,
  oaLeaderRole,
  roleTypes,
  canWrite,
  onClose,
  updateWorker,
  updateMembership,
}: {
  membershipId: number;
  workerId: number;
  worker: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    member_role_type: { role_name: string; role_type_id: number } | null;
    union_membership_type: { type_name: string } | null;
  };
  oaLeaderRole: OaLeaderRole | null;
  roleTypes: { role_type_id: number; role_name: string; display_name: string }[];
  canWrite: boolean;
  onClose: () => void;
  updateWorker: {
    mutate: (vars: {
      worker_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      member_role_type_id: number | null;
    }) => void;
  };
  updateMembership: {
    mutate: (vars: { membership_id: number; oa_leader_role: OaLeaderRole | null }) => void;
  };
}) {
  const [first, setFirst] = useState(worker.first_name);
  const [last, setLast] = useState(worker.last_name);
  const [email, setEmail] = useState(worker.email ?? "");
  const [phone, setPhone] = useState(worker.phone ?? "");
  const [roleId, setRoleId] = useState(String(worker.member_role_type?.role_type_id ?? ""));
  const [oa, setOa] = useState<OaLeaderRole | "">(oaLeaderRole ?? "");

  const delegateOk = isWorkerMemberLike({
    unionMembershipTypeName: worker.union_membership_type?.type_name,
    memberRoleName: worker.member_role_type?.role_name,
  });

  return (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <Label>First name</Label>
        <Input value={first} onChange={(e) => setFirst(e.target.value)} disabled={!canWrite} />
      </div>
      <div className="space-y-2">
        <Label>Last name</Label>
        <Input value={last} onChange={(e) => setLast(e.target.value)} disabled={!canWrite} />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canWrite} />
      </div>
      <div className="space-y-2">
        <Label>Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canWrite} />
      </div>
      <div className="space-y-2">
        <Label>Organising role</Label>
        <Select value={roleId || "__none__"} onValueChange={setRoleId} disabled={!canWrite}>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {roleTypes.map((r) => (
              <SelectItem key={r.role_type_id} value={String(r.role_type_id)}>
                {r.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>OA leader role (this campaign)</Label>
        <Select
          value={oa || "__none__"}
          onValueChange={(v) => setOa(v === "__none__" ? "" : (v as OaLeaderRole))}
          disabled={!canWrite}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            <SelectItem value="contact">Contact</SelectItem>
            <SelectItem value="activist">Activist</SelectItem>
            <SelectItem value="delegate" disabled={!delegateOk}>
              Delegate
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {canWrite && (
        <Button
          onClick={() => {
            updateWorker.mutate({
              worker_id: workerId,
              first_name: first,
              last_name: last,
              email: email || null,
              phone: phone || null,
              member_role_type_id: roleId && roleId !== "__none__" ? Number(roleId) : null,
            });
            updateMembership.mutate({
              membership_id: membershipId,
              oa_leader_role: oa || null,
            });
            onClose();
          }}
        >
          Save
        </Button>
      )}
    </div>
  );
}
