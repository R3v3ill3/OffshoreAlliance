"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { fetchApi } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CampaignOuUnitBasis } from "@/types/organising-row-types";
import { ouDisplayName, type WallChartOU } from "./types";

const NONE_VALUE = "__none__";

type CampaignEmployerRow = {
  employer_id: number;
  employers: { employer_name: string } | { employer_name: string }[] | null;
};

type CampaignWorksiteRow = {
  worksite_id: number | null;
  worksites: { worksite_name: string } | { worksite_name: string }[] | null;
};

function unwrapOne<T extends Record<string, unknown>>(
  v: T | T[] | null | undefined
): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function basisFromOu(ou: WallChartOU | null): CampaignOuUnitBasis | null {
  const raw = ou?.unit_basis;
  if (!raw || typeof raw !== "object") return null;
  return raw as CampaignOuUnitBasis;
}

function AddCampaignWorkerFormBody({
  campaignId,
  contextOu,
  organisingUnits,
  onSuccess,
  onCancel,
}: {
  campaignId: string;
  contextOu: WallChartOU | null;
  organisingUnits: WallChartOU[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const cidNum = Number(campaignId);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  /** null = fall back to unit-basis suggestion */
  const [employerPick, setEmployerPick] = useState<string | null>(null);
  const [worksitePick, setWorksitePick] = useState<string | null>(null);
  /** Header flow — null selects unassigned vs explicit NONE_VALUE */
  const [ouPick, setOuPick] = useState<string | null>(null);

  const { data: campaignEmployers = [], isLoading: employersLoading } = useQuery({
    queryKey: ["add-campaign-worker-employers", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_employers")
        .select("employer_id, employers(employer_name)")
        .eq("campaign_id", cidNum)
        .order("employer_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CampaignEmployerRow[];
    },
    enabled: Number.isFinite(cidNum),
  });

  const { data: campaignWorksites = [], isLoading: worksitesLoading } = useQuery({
    queryKey: ["add-campaign-worker-worksites", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worksites")
        .select("worksite_id, worksites(worksite_name)")
        .eq("campaign_id", cidNum)
        .not("worksite_id", "is", null)
        .order("worksite_id", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((r: CampaignWorksiteRow) => r.worksite_id != null) as CampaignWorksiteRow[];
    },
    enabled: Number.isFinite(cidNum),
  });

  const employersOptions = useMemo(() => {
    return campaignEmployers.map((row) => {
      const emp = unwrapOne(row.employers as { employer_name: string }[] | null);
      return {
        employer_id: row.employer_id,
        employer_name: emp?.employer_name ?? `Employer #${row.employer_id}`,
      };
    });
  }, [campaignEmployers]);

  const worksitesOptions = useMemo(() => {
    return campaignWorksites.map((row) => {
      const ws = unwrapOne(row.worksites as { worksite_name: string }[] | null);
      return {
        worksite_id: row.worksite_id as number,
        worksite_name: ws?.worksite_name ?? `Worksite #${row.worksite_id}`,
      };
    });
  }, [campaignWorksites]);

  const basis = basisFromOu(contextOu);

  const suggestedEmployerId =
    basis?.employer_id != null &&
    employersOptions.some((e) => e.employer_id === basis.employer_id)
      ? String(basis.employer_id)
      : NONE_VALUE;

  const suggestedWorksiteId =
    basis?.worksite_id != null &&
    worksitesOptions.some((w) => w.worksite_id === basis.worksite_id)
      ? String(basis.worksite_id)
      : NONE_VALUE;

  const employerSelectValue = employerPick ?? suggestedEmployerId;
  const worksiteSelectValue = worksitePick ?? suggestedWorksiteId;

  const invalidateWallChartSlices = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["workers"] });
    queryClient.invalidateQueries({ queryKey: ["add-workers-existing-membership", cidNum] });
    queryClient.invalidateQueries({ queryKey: ["campaign-wall-chart", campaignId] });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const fname = firstName.trim();
      const lname = lastName.trim();
      if (!fname || !lname) {
        throw new Error("First and last name are required.");
      }

      let ouResolved: number | null = null;
      // Group containers cannot receive worker assignments directly — skip the OU.
      if (contextOu && !contextOu.is_group_container) ouResolved = contextOu.ou_id;
      else {
        const rawOu = ouPick ?? NONE_VALUE;
        ouResolved = rawOu === NONE_VALUE ? null : Number(rawOu);
      }

      const body: Record<string, unknown> = {
        first_name: fname,
        last_name: lname,
        email: email.trim() || null,
        phone: phone.trim() || null,
        employer_id: employerSelectValue === NONE_VALUE ? null : Number(employerSelectValue),
        worksite_id: worksiteSelectValue === NONE_VALUE ? null : Number(worksiteSelectValue),
        ou_id: ouResolved,
      };

      const res = await fetchApi(`/api/campaigns/${campaignId}/create-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        worker_id?: number;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      return json.worker_id;
    },
    onSuccess: (workerId) => {
      toast.success(workerId ? `Worker #${workerId} added.` : "Worker added.");
      invalidateWallChartSlices();
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add worker");
    },
  });

  const unitLabelLocked = contextOu ? ouDisplayName(contextOu) : null;
  const listsLoaded = !employersLoading && !worksitesLoading;
  const noCampaignEmployers = listsLoaded && employersOptions.length === 0;
  const noCampaignWorksites = listsLoaded && worksitesOptions.length === 0;

  return (
    <>
      <div className="grid gap-4 py-2">
        {contextOu ? (
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Organising unit</Label>
            <p className="text-sm font-medium">{unitLabelLocked}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Organising unit (optional)</Label>
            <Select value={ouPick ?? NONE_VALUE} onValueChange={setOuPick}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Unassigned (campaign member only)</SelectItem>
                {organisingUnits
                  .filter((ou) => !ou.is_group_container)
                  .map((ou) => (
                    <SelectItem key={ou.ou_id} value={String(ou.ou_id)}>
                      {ouDisplayName(ou)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Unassigned workers appear under &quot;Unassigned workers&quot; on the wall chart.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="wc-add-fn">First name</Label>
            <Input
              id="wc-add-fn"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wc-add-ln">Last name</Label>
            <Input
              id="wc-add-ln"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wc-add-email">Email (optional)</Label>
          <Input
            id="wc-add-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wc-add-phone">Phone (optional)</Label>
          <Input
            id="wc-add-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>

        <div className="space-y-2">
          <Label>Employer (optional)</Label>
          {employersLoading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading employers…
            </p>
          ) : noCampaignEmployers ? (
            <p className="text-xs text-muted-foreground rounded border bg-muted/40 px-2 py-1.5">
              No employers are linked to this campaign yet. You can leave this blank or add
              employers on the campaign Structure / settings.
            </p>
          ) : (
            <Select
              value={employerSelectValue}
              onValueChange={(v) => setEmployerPick(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select employer…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>—</SelectItem>
                {employersOptions.map((e) => (
                  <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                    {e.employer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Worksite (optional)</Label>
          {worksitesLoading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading worksites…
            </p>
          ) : noCampaignWorksites ? (
            <p className="text-xs text-muted-foreground rounded border bg-muted/40 px-2 py-1.5">
              No sites are linked to this campaign yet. You can leave this blank or attach
              worksites on the campaign.
            </p>
          ) : (
            <Select
              value={worksiteSelectValue}
              onValueChange={(v) => setWorksitePick(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select worksite…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>—</SelectItem>
                {worksitesOptions.map((w) => (
                  <SelectItem key={w.worksite_id} value={String(w.worksite_id)}>
                    {w.worksite_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={mutation.isPending || !firstName.trim() || !lastName.trim()}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving…
            </>
          ) : (
            "Add worker"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AddCampaignWorkerDialog({
  open,
  onOpenChange,
  campaignId,
  canWrite,
  contextOu,
  organisingUnits,
  formResetKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  canWrite: boolean;
  contextOu: WallChartOU | null;
  organisingUnits: WallChartOU[];
  /** Increment when opening the dialog so the form remounts with a clean state. */
  formResetKey: number;
}) {
  if (!canWrite) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add worker</DialogTitle>
          <DialogDescription>
            Creates a worker record scoped to this campaign&apos;s employers and worksites.
            {contextOu ? " They will be assigned to the organising unit you opened this from." : ""}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <AddCampaignWorkerFormBody
            key={`${campaignId}:${formResetKey}:${contextOu?.ou_id ?? "header"}`}
            campaignId={campaignId}
            contextOu={contextOu}
            organisingUnits={organisingUnits}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
