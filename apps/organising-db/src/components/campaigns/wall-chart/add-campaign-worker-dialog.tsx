"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, UserPlus } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type SearchHit = {
  worker_id: number;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  employer_name: string | null;
  worksite_name: string | null;
  in_campaign: boolean;
};

type DuplicateMatch = {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  method: string;
  in_campaign: boolean;
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

function invalidateWallChartSlices(
  queryClient: ReturnType<typeof useQueryClient>,
  campaignId: string,
  cidNum: number
) {
  queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["workers"] });
  queryClient.invalidateQueries({ queryKey: ["add-workers-existing-membership", cidNum] });
  queryClient.invalidateQueries({ queryKey: ["campaign-wall-chart", campaignId] });
}

function useCampaignEmployerWorksiteOptions(campaignId: string, cidNum: number) {
  const supabase = createClient();

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

  return { employersOptions, worksitesOptions, employersLoading, worksitesLoading };
}

function EmployerWorksiteFields({
  employersOptions,
  worksitesOptions,
  employersLoading,
  worksitesLoading,
  employerSelectValue,
  worksiteSelectValue,
  onEmployerChange,
  onWorksiteChange,
}: {
  employersOptions: { employer_id: number; employer_name: string }[];
  worksitesOptions: { worksite_id: number; worksite_name: string }[];
  employersLoading: boolean;
  worksitesLoading: boolean;
  employerSelectValue: string;
  worksiteSelectValue: string;
  onEmployerChange: (v: string) => void;
  onWorksiteChange: (v: string) => void;
}) {
  const listsLoaded = !employersLoading && !worksitesLoading;
  const noCampaignEmployers = listsLoaded && employersOptions.length === 0;
  const noCampaignWorksites = listsLoaded && worksitesOptions.length === 0;

  return (
    <>
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
          <Select value={employerSelectValue} onValueChange={onEmployerChange}>
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
          <Select value={worksiteSelectValue} onValueChange={onWorksiteChange}>
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
    </>
  );
}

function DuplicateMatches({
  matches,
  pending,
  onAttach,
  onForceCreate,
  onDismiss,
}: {
  matches: DuplicateMatch[];
  pending: boolean;
  onAttach: (workerId: number) => void;
  onForceCreate: () => void;
  onDismiss: () => void;
}) {
  const attachable = matches.filter((m) => !m.in_campaign);
  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-3">
      <p className="text-sm font-medium">Possible existing records</p>
      <ul className="space-y-2">
        {matches.map((m) => (
          <li
            key={m.worker_id}
            className="flex items-start justify-between gap-2 text-sm"
          >
            <div>
              <p className="font-medium">
                {m.first_name} {m.last_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {[m.email, m.phone, `matched on ${m.method}`].filter(Boolean).join(" · ")}
                {m.in_campaign ? " · already in this campaign" : ""}
              </p>
            </div>
            {!m.in_campaign && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => onAttach(m.worker_id)}
              >
                Add this person
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {attachable.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This person is already on the campaign. Search for someone else or cancel.
          </p>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onForceCreate}>
            Create anyway
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Back
        </Button>
      </div>
    </div>
  );
}

function SearchExistingBody({
  campaignId,
  contextOu,
  organisingUnits,
  employersOptions,
  worksitesOptions,
  employersLoading,
  worksitesLoading,
  employerSelectValue,
  worksiteSelectValue,
  onEmployerChange,
  onWorksiteChange,
  ouPick,
  onOuPick,
  onSuccess,
  onCancel,
}: {
  campaignId: string;
  contextOu: WallChartOU | null;
  organisingUnits: WallChartOU[];
  employersOptions: { employer_id: number; employer_name: string }[];
  worksitesOptions: { worksite_id: number; worksite_name: string }[];
  employersLoading: boolean;
  worksitesLoading: boolean;
  employerSelectValue: string;
  worksiteSelectValue: string;
  onEmployerChange: (v: string) => void;
  onWorksiteChange: (v: string) => void;
  ouPick: string | null;
  onOuPick: (v: string) => void;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const cidNum = Number(campaignId);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<SearchHit | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["worker-search", campaignId, debounced],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/workers/search?q=${encodeURIComponent(debounced)}&exclude_campaign_id=${cidNum}&limit=20`
      );
      const json = (await res.json()) as { workers?: SearchHit[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Search failed");
      return json.workers ?? [];
    },
    enabled: debounced.length >= 2,
  });

  const attachMutation = useMutation({
    mutationFn: async (workerId: number) => {
      let ouResolved: number | null = null;
      if (contextOu && !contextOu.is_group_container) ouResolved = contextOu.ou_id;
      else {
        const rawOu = ouPick ?? NONE_VALUE;
        ouResolved = rawOu === NONE_VALUE ? null : Number(rawOu);
      }
      const res = await fetchApi(`/api/campaigns/${campaignId}/create-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: selected?.first_name || "Existing",
          last_name: selected?.last_name || "Worker",
          attach_existing_worker_id: workerId,
          employer_id: employerSelectValue === NONE_VALUE ? null : Number(employerSelectValue),
          worksite_id: worksiteSelectValue === NONE_VALUE ? null : Number(worksiteSelectValue),
          ou_id: ouResolved,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string; worker_id?: number };
      if (!res.ok || !json.success) throw new Error(json.error || `Request failed (${res.status})`);
      return json.worker_id;
    },
    onSuccess: (workerId) => {
      toast.success(workerId ? `Worker #${workerId} added to this campaign.` : "Worker added.");
      invalidateWallChartSlices(queryClient, campaignId, cidNum);
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to add worker"),
  });

  return (
    <>
      <div className="grid gap-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="wc-search-existing">Search the worker database</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="wc-search-existing"
              className="pl-8"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Name, email, or phone"
              autoComplete="off"
            />
          </div>
        </div>

        {debounced.length >= 2 && (
          <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
            {isFetching && hits.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching…
              </p>
            ) : hits.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No matching workers.</p>
            ) : (
              hits.map((hit) => (
                <button
                  key={hit.worker_id}
                  type="button"
                  disabled={hit.in_campaign}
                  onClick={() => setSelected(hit)}
                  className={`w-full text-left px-3 py-2 text-sm ${
                    selected?.worker_id === hit.worker_id ? "bg-muted" : "hover:bg-muted/60"
                  } ${hit.in_campaign ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <p className="font-medium">
                    {hit.first_name} {hit.last_name}
                    {hit.preferred_name ? ` (${hit.preferred_name})` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[hit.email, hit.phone, hit.employer_name, hit.worksite_name]
                      .filter(Boolean)
                      .join(" · ")}
                    {hit.in_campaign ? " · already in this campaign" : ""}
                  </p>
                </button>
              ))
            )}
          </div>
        )}

        {contextOu ? (
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Organising unit</Label>
            <p className="text-sm font-medium">{ouDisplayName(contextOu)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Organising unit (optional)</Label>
            <Select value={ouPick ?? NONE_VALUE} onValueChange={onOuPick}>
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
          </div>
        )}

        <EmployerWorksiteFields
          employersOptions={employersOptions}
          worksitesOptions={worksitesOptions}
          employersLoading={employersLoading}
          worksitesLoading={worksitesLoading}
          employerSelectValue={employerSelectValue}
          worksiteSelectValue={worksiteSelectValue}
          onEmployerChange={onEmployerChange}
          onWorksiteChange={onWorksiteChange}
        />
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!selected || selected.in_campaign || attachMutation.isPending}
          onClick={() => selected && attachMutation.mutate(selected.worker_id)}
        >
          {attachMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Adding…
            </>
          ) : (
            "Add to campaign"
          )}
        </Button>
      </DialogFooter>
    </>
  );
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
  const queryClient = useQueryClient();
  const cidNum = Number(campaignId);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [employerPick, setEmployerPick] = useState<string | null>(null);
  const [worksitePick, setWorksitePick] = useState<string | null>(null);
  const [ouPick, setOuPick] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);

  const { employersOptions, worksitesOptions, employersLoading, worksitesLoading } =
    useCampaignEmployerWorksiteOptions(campaignId, cidNum);

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

  const resolvedOuId = (): number | null => {
    if (contextOu && !contextOu.is_group_container) return contextOu.ou_id;
    const rawOu = ouPick ?? NONE_VALUE;
    return rawOu === NONE_VALUE ? null : Number(rawOu);
  };

  const createBody = (extra: Record<string, unknown> = {}) => ({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim() || null,
    phone: phone.trim() || null,
    employer_id: employerSelectValue === NONE_VALUE ? null : Number(employerSelectValue),
    worksite_id: worksiteSelectValue === NONE_VALUE ? null : Number(worksiteSelectValue),
    ou_id: resolvedOuId(),
    ...extra,
  });

  const mutation = useMutation({
    mutationFn: async (extra: Record<string, unknown> = {}) => {
      const fname = firstName.trim();
      const lname = lastName.trim();
      if (!extra.attach_existing_worker_id && (!fname || !lname)) {
        throw new Error("First and last name are required.");
      }
      const res = await fetchApi(`/api/campaigns/${campaignId}/create-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody(extra)),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        worker_id?: number;
        code?: string;
        matches?: DuplicateMatch[];
      };
      if (res.status === 409 && json.matches) {
        const err = new Error(json.error || "Matching worker found");
        err.name = "DuplicateWorkerError";
        setDuplicates(json.matches);
        throw err;
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      return json.worker_id;
    },
    onSuccess: (workerId) => {
      toast.success(workerId ? `Worker #${workerId} added.` : "Worker added.");
      invalidateWallChartSlices(queryClient, campaignId, cidNum);
      onSuccess();
    },
    onError: (err: Error) => {
      if (err.name === "DuplicateWorkerError") return;
      toast.error(err.message || "Failed to add worker");
    },
  });

  const unitLabelLocked = contextOu ? ouDisplayName(contextOu) : null;

  return (
    <Tabs defaultValue="existing" className="mt-1">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="existing">From database</TabsTrigger>
        <TabsTrigger value="new">
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          New worker
        </TabsTrigger>
      </TabsList>

      <TabsContent value="existing">
        <SearchExistingBody
          campaignId={campaignId}
          contextOu={contextOu}
          organisingUnits={organisingUnits}
          employersOptions={employersOptions}
          worksitesOptions={worksitesOptions}
          employersLoading={employersLoading}
          worksitesLoading={worksitesLoading}
          employerSelectValue={employerSelectValue}
          worksiteSelectValue={worksiteSelectValue}
          onEmployerChange={setEmployerPick}
          onWorksiteChange={setWorksitePick}
          ouPick={ouPick}
          onOuPick={setOuPick}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      </TabsContent>

      <TabsContent value="new">
        {duplicates ? (
          <div className="py-2">
            <DuplicateMatches
              matches={duplicates}
              pending={mutation.isPending}
              onAttach={(workerId) => {
                setDuplicates(null);
                mutation.mutate({ attach_existing_worker_id: workerId });
              }}
              onForceCreate={() => {
                setDuplicates(null);
                mutation.mutate({ force_create: true });
              }}
              onDismiss={() => setDuplicates(null)}
            />
          </div>
        ) : (
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

              <EmployerWorksiteFields
                employersOptions={employersOptions}
                worksitesOptions={worksitesOptions}
                employersLoading={employersLoading}
                worksitesLoading={worksitesLoading}
                employerSelectValue={employerSelectValue}
                worksiteSelectValue={worksiteSelectValue}
                onEmployerChange={setEmployerPick}
                onWorksiteChange={setWorksitePick}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={mutation.isPending || !firstName.trim() || !lastName.trim()}
                onClick={() => mutation.mutate({})}
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
        )}
      </TabsContent>
    </Tabs>
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add worker</DialogTitle>
          <DialogDescription>
            Add someone already in the database, or create a new worker. New records are
            checked for duplicates before they are saved.
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
