"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type {
  CampaignScopeType,
  CampaignStatus,
  CampaignType,
  EnterpriseAgreementSubtype,
} from "@/types/database";
import { CAMPAIGN_SCOPE_LABELS, EA_SUBTYPE_LABELS } from "@/lib/campaign/constants";
import Link from "next/link";

const SCOPES: CampaignScopeType[] = [
  "single_employer_single_site",
  "single_employer_multi_site",
  "multi_employer_single_site",
  "multi_employer_multi_site",
];

export function CampaignWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, canWrite } = useAuth();

  const initialCid = searchParams.get("cid");
  const [step, setStep] = useState(initialCid ? 2 : 1);
  const [campaignId, setCampaignId] = useState<number | null>(
    initialCid ? Number(initialCid) || null : null
  );

  const [basics, setBasics] = useState({
    name: "",
    description: "",
    campaign_type: "organising" as CampaignType,
    enterprise_agreement_subtype: "" as "" | EnterpriseAgreementSubtype,
    status: "planning" as CampaignStatus,
    start_date: "",
    end_date: "",
    organiser_id: "",
    notes: "",
    campaign_scope: "" as "" | CampaignScopeType,
    total_worker_estimate: "",
    sector_wide: false,
  });

  const [selectedEmployers, setSelectedEmployers] = useState<number[]>([]);
  const [selectedWorksites, setSelectedWorksites] = useState<number[]>([]);
  const [worksiteSectorWide, setWorksiteSectorWide] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState<number[]>([]);
  const [employerDialog, setEmployerDialog] = useState(false);
  const [newEmployerName, setNewEmployerName] = useState("");

  const { data: organisers = [] } = useQuery({
    queryKey: ["organisers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organisers")
        .select("organiser_id, organiser_name")
        .eq("is_active", true)
        .order("organiser_name");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: employers = [] } = useQuery({
    queryKey: ["employers-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .eq("is_active", true)
        .order("employer_name");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: worksites = [] } = useQuery({
    queryKey: ["worksites-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .eq("is_active", true)
        .order("worksite_name");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: candidateWorkers = [] } = useQuery({
    queryKey: ["wizard-workers", selectedEmployers, selectedWorksites, worksiteSectorWide],
    queryFn: async () => {
      let q = supabase
        .from("workers")
        .select("worker_id, first_name, last_name, employer_id, worksite_id")
        .eq("is_active", true);

      if (selectedEmployers.length > 0) {
        q = q.in("employer_id", selectedEmployers);
      }
      if (selectedWorksites.length > 0 && !worksiteSectorWide) {
        q = q.in("worksite_id", selectedWorksites);
      }

      const { data, error } = await q.order("last_name").limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    enabled:
      !!user &&
      step === 3 &&
      (selectedEmployers.length > 0 || selectedWorksites.length > 0 || worksiteSectorWide),
  });

  const { data: existingCampaign } = useQuery({
    queryKey: ["campaign-wizard", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("campaign_id", campaignId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!campaignId,
  });

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: basics.name,
        campaign_type: basics.campaign_type,
        status: basics.status,
        sector_wide: basics.sector_wide,
      };
      if (basics.description) payload.description = basics.description;
      if (basics.start_date) payload.start_date = basics.start_date;
      if (basics.end_date) payload.end_date = basics.end_date;
      if (basics.organiser_id) payload.organiser_id = Number(basics.organiser_id);
      if (basics.notes) payload.notes = basics.notes;
      if (basics.campaign_scope) payload.campaign_scope = basics.campaign_scope;
      if (basics.enterprise_agreement_subtype) {
        payload.enterprise_agreement_subtype = basics.enterprise_agreement_subtype;
      }
      if (basics.total_worker_estimate) {
        const n = Number(basics.total_worker_estimate);
        if (!Number.isNaN(n)) payload.total_worker_estimate = n;
      }

      const { data, error } = await supabase.from("campaigns").insert(payload).select("campaign_id").single();
      if (error) throw error;
      return data.campaign_id as number;
    },
    onSuccess: (id) => {
      setCampaignId(id);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.replace(`/campaigns/new?cid=${id}`);
      setStep(2);
    },
  });

  const saveScopeMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("No campaign");
      await supabase.from("campaign_employers").delete().eq("campaign_id", campaignId);
      await supabase.from("campaign_worksites").delete().eq("campaign_id", campaignId);

      if (selectedEmployers.length > 0) {
        const { error } = await supabase.from("campaign_employers").insert(
          selectedEmployers.map((employer_id) => ({ campaign_id: campaignId, employer_id }))
        );
        if (error) throw error;
      }

      if (worksiteSectorWide) {
        const { error } = await supabase.from("campaign_worksites").insert({
          campaign_id: campaignId,
          worksite_id: null,
          sector_wide: true,
        });
        if (error) throw error;
      } else if (selectedWorksites.length > 0) {
        const { error } = await supabase.from("campaign_worksites").insert(
          selectedWorksites.map((worksite_id) => ({
            campaign_id: campaignId,
            worksite_id,
            sector_wide: false,
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      setStep(3);
    },
  });

  const saveWorkersMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("No campaign");
      await supabase.from("campaign_worker_membership").delete().eq("campaign_id", campaignId);
      if (selectedWorkers.length === 0) return;
      const { error } = await supabase.from("campaign_worker_membership").insert(
        selectedWorkers.map((worker_id) => ({ campaign_id: campaignId, worker_id }))
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
      router.push(`/campaigns/${campaignId}`);
    },
  });

  const addEmployerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .insert({ employer_name: newEmployerName.trim() })
        .select("employer_id")
        .single();
      if (error) throw error;
      return data.employer_id as number;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["employers-active"] });
      setSelectedEmployers((s) => [...s, id]);
      setEmployerDialog(false);
      setNewEmployerName("");
    },
  });

  const toggle = (id: number, list: number[], setList: (v: number[]) => void) => {
    if (list.includes(id)) setList(list.filter((x) => x !== id));
    else setList([...list, id]);
  };

  const stepTitle = useMemo(() => {
    if (step === 1) return "Basics & scope";
    if (step === 2) return "Employers & worksites";
    return "Allocate workers";
  }, [step]);

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (!canWrite) {
    return <p className="text-muted-foreground">You do not have permission to create campaigns.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Campaign wizard</h1>
          <p className="text-sm text-muted-foreground">
            Step {step} of 3 — {stepTitle}
          </p>
        </div>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign basics</CardTitle>
            <CardDescription>Name, type, dates, and universe scope.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={basics.description}
                onChange={(e) => setBasics({ ...basics, description: e.target.value })}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign type</Label>
                <Select
                  value={basics.campaign_type}
                  onValueChange={(v) => setBasics({ ...basics, campaign_type: v as CampaignType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bargaining">Bargaining</SelectItem>
                    <SelectItem value="organising">Organising</SelectItem>
                    <SelectItem value="mobilisation">Mobilisation</SelectItem>
                    <SelectItem value="political">Political</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>EA subtype (optional)</Label>
                <Select
                  value={basics.enterprise_agreement_subtype || "__none__"}
                  onValueChange={(v) =>
                    setBasics({
                      ...basics,
                      enterprise_agreement_subtype:
                        v === "__none__" ? "" : (v as EnterpriseAgreementSubtype),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not applicable</SelectItem>
                    {(Object.keys(EA_SUBTYPE_LABELS) as EnterpriseAgreementSubtype[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {EA_SUBTYPE_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={basics.status}
                  onValueChange={(v) => setBasics({ ...basics, status: v as CampaignStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Organiser</Label>
                <Select
                  value={basics.organiser_id || "__none__"}
                  onValueChange={(v) => setBasics({ ...basics, organiser_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {organisers.map((o: { organiser_id: number; organiser_name: string }) => (
                      <SelectItem key={o.organiser_id} value={String(o.organiser_id)}>
                        {o.organiser_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={basics.start_date}
                  onChange={(e) => setBasics({ ...basics, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={basics.end_date}
                  onChange={(e) => setBasics({ ...basics, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Campaign scope</Label>
              <Select
                value={basics.campaign_scope || "__none__"}
                onValueChange={(v) =>
                  setBasics({
                    ...basics,
                    campaign_scope: v === "__none__" ? "" : (v as CampaignScopeType),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  {SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CAMPAIGN_SCOPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Total worker estimate</Label>
              <Input
                type="number"
                min={0}
                value={basics.total_worker_estimate}
                onChange={(e) => setBasics({ ...basics, total_worker_estimate: e.target.value })}
                placeholder="Optional headcount"
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                id="sw"
                type="checkbox"
                checked={basics.sector_wide}
                onChange={(e) => setBasics({ ...basics, sector_wide: e.target.checked })}
              />
              <span className="text-sm font-normal">Sector-wide campaign flag</span>
            </label>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={basics.notes}
                onChange={(e) => setBasics({ ...basics, notes: e.target.value })}
              />
            </div>
            <Button
              className="w-full sm:w-auto"
              disabled={!basics.name || createCampaignMutation.isPending}
              onClick={() => createCampaignMutation.mutate()}
            >
              {createCampaignMutation.isPending ? "Saving…" : "Continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && campaignId && (
        <Card>
          <CardHeader>
            <CardTitle>Employers & worksites</CardTitle>
            <CardDescription>Select targets for this campaign. Add a new employer if needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Employers</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setEmployerDialog(true)}>
                  Add employer
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                {employers.map((e: { employer_id: number; employer_name: string }) => (
                  <label key={e.employer_id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedEmployers.includes(e.employer_id)}
                      onChange={() => toggle(e.employer_id, selectedEmployers, setSelectedEmployers)}
                    />
                    {e.employer_name}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input
                id="ws_sw"
                type="checkbox"
                checked={worksiteSectorWide}
                onChange={(e) => {
                  const c = e.target.checked;
                  setWorksiteSectorWide(c);
                  if (c) setSelectedWorksites([]);
                }}
              />
              <span className="text-sm font-normal">Sector-wide worksites (no specific site)</span>
            </label>
            {!worksiteSectorWide && (
              <div>
                <Label className="mb-2 block">Worksites</Label>
                <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                  {worksites.map((w: { worksite_id: number; worksite_name: string }) => (
                    <label key={w.worksite_id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedWorksites.includes(w.worksite_id)}
                        onChange={() =>
                          toggle(w.worksite_id, selectedWorksites, setSelectedWorksites)
                        }
                      />
                      {w.worksite_name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                onClick={() => saveScopeMutation.mutate()}
                disabled={
                  saveScopeMutation.isPending ||
                  (selectedEmployers.length === 0 && !worksiteSectorWide && selectedWorksites.length === 0)
                }
              >
                {saveScopeMutation.isPending ? "Saving…" : "Continue to workers"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && campaignId && (
        <Card>
          <CardHeader>
            <CardTitle>Allocate workers</CardTitle>
            <CardDescription>
              Workers are filtered by your employer and worksite selections. Use the{" "}
              <Link href="/workers" className="underline">
                Workers
              </Link>{" "}
              import tools to add new people, then return here and refresh selections if needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidateWorkers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No workers match the filters. Adjust employers or worksites (step 2) or add workers
                first.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border p-2 space-y-1">
                {candidateWorkers.map(
                  (w: {
                    worker_id: number;
                    first_name: string;
                    last_name: string;
                  }) => (
                    <label key={w.worker_id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedWorkers.includes(w.worker_id)}
                        onChange={() =>
                          toggle(w.worker_id, selectedWorkers, setSelectedWorkers)
                        }
                      />
                      {w.first_name} {w.last_name}
                    </label>
                  )
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => saveWorkersMutation.mutate()} disabled={saveWorkersMutation.isPending}>
                {saveWorkersMutation.isPending ? "Saving…" : "Finish"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {existingCampaign && step > 1 && (
        <p className="text-xs text-muted-foreground">
          Editing campaign #{campaignId}: {existingCampaign.name as string}
        </p>
      )}

      <Dialog open={employerDialog} onOpenChange={setEmployerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New employer</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Employer name"
            value={newEmployerName}
            onChange={(e) => setNewEmployerName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmployerDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newEmployerName.trim() || addEmployerMutation.isPending}
              onClick={() => addEmployerMutation.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
