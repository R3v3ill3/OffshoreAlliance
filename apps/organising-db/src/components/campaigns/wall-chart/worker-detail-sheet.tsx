"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isWorkerMemberLike } from "@/lib/campaign/constants";
import { WorkerRelationshipsTab } from "./worker-relationships-tab";
import type { WallChartOU, WallChartRoleType, WallChartWorker } from "./types";
import { ouDisplayName } from "./types";

export type WorkerDetailSheetProps = {
  campaignId: string;
  workerId: number;
  worker: WallChartWorker;
  ous: WallChartOU[];
  assignedOuIds: number[];
  primaryOuId: number | null;
  roleTypes: WallChartRoleType[];
  canWrite: boolean;
  onClose: () => void;
  onRequestCopyToUnit?: (workerId: number) => void;
};

export function WorkerDetailSheet({
  campaignId,
  workerId,
  worker,
  ous,
  assignedOuIds,
  primaryOuId,
  roleTypes,
  canWrite,
  onClose,
  onRequestCopyToUnit,
}: WorkerDetailSheetProps) {
  return (
    <Tabs defaultValue="details" className="mt-2">
      <TabsList className="grid grid-cols-5 w-full">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="campaign">Campaign</TabsTrigger>
        <TabsTrigger value="ratings">Ratings</TabsTrigger>
        <TabsTrigger value="units">Units</TabsTrigger>
        <TabsTrigger value="relationships">Relationships</TabsTrigger>
      </TabsList>

      <TabsContent value="details">
        <DetailsTab
          campaignId={campaignId}
          workerId={workerId}
          worker={worker}
          roleTypes={roleTypes}
          canWrite={canWrite}
          onClose={onClose}
        />
      </TabsContent>

      <TabsContent value="campaign">
        <CampaignTab worker={worker} />
      </TabsContent>

      <TabsContent value="ratings">
        <RatingsTab campaignId={campaignId} workerId={workerId} />
      </TabsContent>

      <TabsContent value="units">
        <UnitsTab
          campaignId={campaignId}
          workerId={workerId}
          ous={ous}
          assignedOuIds={assignedOuIds}
          primaryOuId={primaryOuId}
          canWrite={canWrite}
          onRequestCopyToUnit={onRequestCopyToUnit}
        />
      </TabsContent>

      <TabsContent value="relationships">
        <WorkerRelationshipsTab
          workerId={workerId}
          campaignId={campaignId}
          canWrite={canWrite}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Details — edits first/last/email/phone/role + HSR + Bargaining rep
// ---------------------------------------------------------------------------

function DetailsTab({
  campaignId,
  workerId,
  worker,
  roleTypes,
  canWrite,
  onClose,
}: {
  campaignId: string;
  workerId: number;
  worker: WallChartWorker;
  roleTypes: WallChartRoleType[];
  canWrite: boolean;
  onClose: () => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [first, setFirst] = useState(worker.first_name);
  const [last, setLast] = useState(worker.last_name);
  const [email, setEmail] = useState(worker.email ?? "");
  const [phone, setPhone] = useState(worker.phone ?? "");
  const [roleId, setRoleId] = useState(String(worker.member_role_type?.role_type_id ?? ""));
  const [isHsr, setIsHsr] = useState(!!worker.is_hsr);
  const [isBargainingRep, setIsBargainingRep] = useState(!!worker.is_bargaining_rep);

  const delegateOk = isWorkerMemberLike({
    unionMembershipTypeName: worker.union_membership_type?.type_name,
    memberRoleName: worker.member_role_type?.role_name,
    isBargainingRep: isBargainingRep,
  });

  const updateWorker = useAuthAwareMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("workers")
        .update({
          first_name: first,
          last_name: last,
          email: email || null,
          phone: phone || null,
          member_role_type_id: roleId && roleId !== "__none__" ? Number(roleId) : null,
          is_hsr: isHsr,
          is_bargaining_rep: isBargainingRep,
        })
        .eq("worker_id", workerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
    },
  });

  return (
    <div className="grid gap-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name">
          <Input value={first} onChange={(e) => setFirst(e.target.value)} disabled={!canWrite} />
        </Field>
        <Field label="Last name">
          <Input value={last} onChange={(e) => setLast(e.target.value)} disabled={!canWrite} />
        </Field>
      </div>
      <Field label="Email">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canWrite} />
      </Field>
      <Field label="Phone">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canWrite} />
      </Field>
      <Field label="Occupation">
        <Input
          value={worker.canonical_occupation?.canonical_name ?? "—"}
          disabled
          readOnly
        />
      </Field>
      <Field label="Organising role">
        <Select value={roleId || "__none__"} onValueChange={setRoleId} disabled={!canWrite}>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {roleTypes.map((r) => (
              <SelectItem
                key={r.role_type_id}
                value={String(r.role_type_id)}
                disabled={r.role_name === "delegate" && !delegateOk}
              >
                {r.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <ToggleRow
          label="HSR"
          checked={isHsr}
          onChange={setIsHsr}
          disabled={!canWrite}
        />
        <ToggleRow
          label="Bargaining rep"
          checked={isBargainingRep}
          onChange={setIsBargainingRep}
          disabled={!canWrite}
        />
      </div>

      {canWrite && (
        <Button
          onClick={() => {
            updateWorker.mutate(undefined, {
              onSuccess: () => onClose(),
            });
          }}
        >
          Save
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign — read-only context about this worker's campaign standing.
// ---------------------------------------------------------------------------

function CampaignTab({ worker }: { worker: WallChartWorker }) {
  return (
    <div className="grid gap-3 py-3 text-sm">
      <KV k="Union membership">
        {worker.union_membership_type?.display_name ??
          worker.union_membership_type?.type_name ??
          "—"}
      </KV>
      <KV k="Role (enduring)">
        {worker.member_role_type?.display_name ?? worker.member_role_type?.role_name ?? "None"}
      </KV>
      <KV k="HSR">{worker.is_hsr ? "Yes" : "No"}</KV>
      <KV k="Bargaining rep">{worker.is_bargaining_rep ? "Yes" : "No"}</KV>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ratings — activity-level rating history for this worker in this campaign.
// ---------------------------------------------------------------------------

function RatingsTab({ campaignId, workerId }: { campaignId: string; workerId: number }) {
  const supabase = createClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["worker-activity-ratings", campaignId, workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activity_ratings")
        .select(
          `rating_id, rating, binary_value, rated_at, source,
           activity:campaign_activities(activity_id, title, campaign_id)`
        )
        .eq("worker_id", workerId)
        .order("rated_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((r) => {
          const aRaw = (r as { activity: unknown }).activity;
          const a = (Array.isArray(aRaw) ? aRaw[0] : aRaw) as
            | { activity_id: number; title: string; campaign_id: number }
            | null;
          return { ...(r as Record<string, unknown>), activity: a } as {
            rating_id: number;
            rating: number | null;
            binary_value: string | null;
            rated_at: string;
            source: string | null;
            activity: { activity_id: number; title: string; campaign_id: number } | null;
          };
        })
        .filter((r) => r.activity?.campaign_id === Number(campaignId));
    },
  });

  if (isLoading) return <p className="py-3 text-sm text-muted-foreground">Loading ratings…</p>;
  if (rows.length === 0)
    return (
      <p className="py-3 text-sm text-muted-foreground">
        No activity ratings recorded for this worker yet.
      </p>
    );

  return (
    <div className="py-3 space-y-2">
      {rows.map((r) => (
        <div
          key={r.rating_id}
          className="rounded border px-2 py-1.5 flex items-center justify-between text-xs"
        >
          <div className="min-w-0">
            <p className="font-medium truncate">{r.activity?.title ?? "(untitled activity)"}</p>
            <p className="text-muted-foreground">
              {new Date(r.rated_at).toLocaleDateString()} · {r.source ?? "—"}
            </p>
          </div>
          <div className="tabular-nums font-semibold">
            {r.rating != null ? r.rating : r.binary_value ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Units — membership in organising units. Primary toggle, remove, add.
// ---------------------------------------------------------------------------

function UnitsTab({
  campaignId,
  workerId,
  ous,
  assignedOuIds,
  primaryOuId,
  canWrite,
  onRequestCopyToUnit,
}: {
  campaignId: string;
  workerId: number;
  ous: WallChartOU[];
  assignedOuIds: number[];
  primaryOuId: number | null;
  canWrite: boolean;
  onRequestCopyToUnit?: (workerId: number) => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const ouById = useMemo(() => {
    const m = new Map<number, WallChartOU>();
    for (const o of ous) m.set(o.ou_id, o);
    return m;
  }, [ous]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
  };

  const setPrimary = useAuthAwareMutation({
    mutationFn: async (ouId: number) => {
      // Clear any existing primary for this worker in this campaign, then set new.
      const campaignOuIds = ous.map((o) => o.ou_id);
      if (campaignOuIds.length === 0) return;
      const { error: clearErr } = await supabase
        .from("campaign_worker_ou")
        .update({ is_primary: false })
        .eq("worker_id", workerId)
        .in("ou_id", campaignOuIds);
      if (clearErr) throw clearErr;
      const { error } = await supabase
        .from("campaign_worker_ou")
        .update({ is_primary: true })
        .eq("worker_id", workerId)
        .eq("ou_id", ouId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeFromUnit = useAuthAwareMutation({
    mutationFn: async (ouId: number) => {
      const { error } = await supabase
        .from("campaign_worker_ou")
        .delete()
        .eq("worker_id", workerId)
        .eq("ou_id", ouId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div className="py-3 space-y-2">
      {assignedOuIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This worker isn’t assigned to any organising unit in this campaign.
        </p>
      ) : (
        assignedOuIds.map((ouId) => {
          const ou = ouById.get(ouId);
          if (!ou) return null;
          const isPrimary = primaryOuId === ouId;
          return (
            <div
              key={ouId}
              className="rounded border px-2 py-1.5 flex items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{ouDisplayName(ou)}</p>
                {isPrimary && (
                  <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide text-primary">
                    Primary
                  </span>
                )}
              </div>
              {canWrite && (
                <div className="flex gap-1">
                  {!isPrimary && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setPrimary.mutate(ouId)}
                    >
                      Make primary
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-destructive"
                    onClick={() => removeFromUnit.mutate(ouId)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          );
        })
      )}
      {canWrite && onRequestCopyToUnit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRequestCopyToUnit(workerId)}
        >
          Add to another unit
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
