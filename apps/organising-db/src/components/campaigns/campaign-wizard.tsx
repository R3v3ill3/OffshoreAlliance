"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Search, X } from "lucide-react";
import type {
  CampaignScopeType,
  CampaignStatus,
  CampaignType,
  EnterpriseAgreementSubtype,
} from "@/types/database";
import { CAMPAIGN_SCOPE_LABELS, EA_SUBTYPE_LABELS } from "@/lib/campaign/constants";
import { resolveCampaignOrganiserId } from "@/lib/campaign/resolve-campaign-organiser";
import { CampaignOrganiserSelect } from "@/components/campaigns/campaign-organiser-select";
import { StepEmployersWorksites } from "@/components/campaigns/step-employers-worksites";
import { StepAllocateWorkers } from "@/components/campaigns/step-allocate-workers";
import Link from "next/link";

const SCOPES: CampaignScopeType[] = [
  "single_employer_single_site",
  "single_employer_multi_site",
  "multi_employer_single_site",
  "multi_employer_multi_site",
];

// ─── Replacement Agreement Picker ────────────────────────────────────────────

interface AgreementOption {
  agreement_id: number;
  agreement_name: string;
  short_name: string | null;
  status: string | null;
  employer_name: string | null;
}

interface ReplacedAgreementPickerProps {
  value: number | null;
  onChange: (id: number | null) => void;
}

function ReplacedAgreementPicker({ value, onChange }: ReplacedAgreementPickerProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newAgreementName, setNewAgreementName] = useState("");

  const { data: agreements = [] } = useQuery<AgreementOption[]>({
    queryKey: ["agreements-for-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(
          `agreement_id, agreement_name, short_name, status,
           employer:employers(employer_name)`
        )
        .order("agreement_name");
      if (error) throw error;
      return (data ?? []).map((a: Record<string, unknown>) => {
        const emp = a.employer as { employer_name: string } | null;
        return {
          agreement_id: a.agreement_id as number,
          agreement_name: a.agreement_name as string,
          short_name: (a.short_name as string | null) ?? null,
          status: (a.status as string | null) ?? null,
          employer_name: emp?.employer_name ?? null,
        };
      });
    },
    enabled: !!user,
  });

  const createAgreementMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("agreements")
        .insert({ agreement_name: name, status: "Expired" })
        .select("agreement_id")
        .single();
      if (error) throw error;
      return data.agreement_id as number;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["agreements-for-picker"] });
      onChange(id);
      setAddDialogOpen(false);
      setNewAgreementName("");
    },
  });

  const selected = agreements.find((a) => a.agreement_id === value);

  const filtered = agreements.filter((a) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      a.agreement_name.toLowerCase().includes(term) ||
      (a.short_name ?? "").toLowerCase().includes(term) ||
      (a.employer_name ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-2">
      <Label>Which agreement is being replaced? *</Label>

      {selected ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selected.agreement_name}</p>
            {selected.employer_name && (
              <p className="text-xs text-muted-foreground truncate">{selected.employer_name}</p>
            )}
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {selected.status ?? "—"}
          </Badge>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 text-sm"
              placeholder="Search agreements by name or employer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border p-1 space-y-0.5">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-3 text-center">
                No agreements found.
              </p>
            )}
            {filtered.map((a) => (
              <button
                key={a.agreement_id}
                type="button"
                className="w-full text-left rounded px-2 py-1.5 hover:bg-muted transition-colors"
                onClick={() => {
                  onChange(a.agreement_id);
                  setSearch("");
                }}
              >
                <p className="text-sm font-medium">{a.agreement_name}</p>
                <div className="flex items-center gap-2">
                  {a.employer_name && (
                    <p className="text-xs text-muted-foreground">{a.employer_name}</p>
                  )}
                  {a.status && (
                    <Badge variant="outline" className="text-xs h-4 px-1">
                      {a.status}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setAddDialogOpen(true)}
          >
            + Add agreement not in list
          </Button>
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add enterprise agreement</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Agreement name</Label>
            <Input
              placeholder="e.g. Acme Offshore Operations Enterprise Agreement 2022"
              value={newAgreementName}
              onChange={(e) => setNewAgreementName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A basic record will be created with status "Expired". You can update further details
              from the Agreements page.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newAgreementName.trim() || createAgreementMutation.isPending}
              onClick={() => createAgreementMutation.mutate(newAgreementName.trim())}
            >
              {createAgreementMutation.isPending ? "Creating…" : "Create & select"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function CampaignWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, canWrite, isAdmin, profile, loading: authLoading } = useAuth();
  const permissionDeniedLoggedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || canWrite) return;
    if (permissionDeniedLoggedForUser.current === user.id) return;
    permissionDeniedLoggedForUser.current = user.id;
    console.warn("[CampaignWizard] Signed in but canWrite is false", {
      userId: user.id,
      role: profile?.role ?? null,
      authLoading,
    });
  }, [user, canWrite, profile?.role, authLoading]);

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
    replaced_agreement_id: null as number | null,
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

  // ── Queries ───────────────────────────────────────────────────────────────

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

  // EA employers for the replaced agreement — used when auto-linking on save
  const { data: eaEmployerIds = [] } = useQuery<number[]>({
    queryKey: ["ea-employers", basics.replaced_agreement_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("agreement_employers")
        .select("employer_id")
        .eq("agreement_id", basics.replaced_agreement_id!);
      return (data ?? []).map((r) => r.employer_id);
    },
    enabled: !!user && !!basics.replaced_agreement_id,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");

      const resolvedOrganiserId = await resolveCampaignOrganiserId(supabase, basics.organiser_id, {
        currentUserId: user.id,
        isAdmin,
      });

      const payload: Record<string, unknown> = {
        name: basics.name,
        campaign_type: basics.campaign_type,
        status: basics.status,
        sector_wide: basics.sector_wide,
      };
      if (basics.description) payload.description = basics.description;
      if (basics.start_date) payload.start_date = basics.start_date;
      if (basics.end_date) payload.end_date = basics.end_date;
      if (resolvedOrganiserId != null) payload.organiser_id = resolvedOrganiserId;
      if (basics.notes) payload.notes = basics.notes;
      if (basics.campaign_scope) payload.campaign_scope = basics.campaign_scope;
      if (basics.enterprise_agreement_subtype) {
        payload.enterprise_agreement_subtype = basics.enterprise_agreement_subtype;
      }
      if (
        basics.enterprise_agreement_subtype === "replacement" &&
        basics.replaced_agreement_id
      ) {
        payload.replaced_agreement_id = basics.replaced_agreement_id;
      }
      if (basics.total_worker_estimate) {
        const n = Number(basics.total_worker_estimate);
        if (!Number.isNaN(n)) payload.total_worker_estimate = n;
      }

      const { data, error } = await supabase
        .from("campaigns")
        .insert(payload)
        .select("campaign_id")
        .single();
      if (error) throw error;
      return data.campaign_id as number;
    },
    onSuccess: (id) => {
      setCampaignId(id);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["organisers"] });
      queryClient.invalidateQueries({ queryKey: ["user-profiles-staff-organiser-picker"] });
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

        // Auto-link employers not yet in the replaced EA
        if (basics.replaced_agreement_id && eaEmployerIds.length >= 0) {
          const eaSet = new Set(eaEmployerIds);
          const toLink = selectedEmployers.filter((id) => !eaSet.has(id));
          if (toLink.length > 0) {
            await supabase.from("agreement_employers").upsert(
              toLink.map((employer_id) => ({
                agreement_id: basics.replaced_agreement_id!,
                employer_id,
                is_primary: false,
              })),
              { onConflict: "agreement_id,employer_id", ignoreDuplicates: true }
            );
          }
        }
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
      if (basics.campaign_type === "bargaining") {
        setStep(4);
      } else {
        router.push(`/campaigns/${campaignId}`);
      }
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────


  const stepTitle = useMemo(() => {
    if (step === 1) return "Basics & scope";
    if (step === 2) return "Employers & worksites";
    if (step === 3) return "Allocate workers";
    return "Create campaign plan";
  }, [step]);

  const step1Valid =
    !!basics.name &&
    (basics.enterprise_agreement_subtype !== "replacement" || !!basics.replaced_agreement_id);

  // ── Guards ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <EurekaLoadingSpinner />
      </div>
    );
  }

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Campaign wizard</h1>
          <p className="text-sm text-muted-foreground">
            {step < 4
              ? `Step ${step} of ${basics.campaign_type === "bargaining" ? "4" : "3"} — ${stepTitle}`
              : `Step 4 of 4 — ${stepTitle}`}
          </p>
        </div>
      </div>

      {/* ── Step 1: Basics & scope ──────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign basics</CardTitle>
            <CardDescription>Name, type, dates, and universe scope.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={basics.name}
                onChange={(e) => setBasics({ ...basics, name: e.target.value })}
              />
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
                  onValueChange={(v) =>
                    setBasics({ ...basics, campaign_type: v as CampaignType })
                  }
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
                      // Clear replaced agreement when subtype is removed
                      replaced_agreement_id:
                        v === "replacement" ? basics.replaced_agreement_id : null,
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

            {/* Replacement EA picker — shown only when subtype is 'replacement' */}
            {basics.enterprise_agreement_subtype === "replacement" && (
              <ReplacedAgreementPicker
                value={basics.replaced_agreement_id}
                onChange={(id) => setBasics({ ...basics, replaced_agreement_id: id })}
              />
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={basics.status}
                  onValueChange={(v) =>
                    setBasics({ ...basics, status: v as CampaignStatus })
                  }
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
              <CampaignOrganiserSelect
                label="Organiser"
                value={basics.organiser_id}
                onChange={(v) =>
                  setBasics({ ...basics, organiser_id: v === "__none__" ? "" : v })
                }
                allowNone
                autoDefaultToCurrentUser
              />
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
                onChange={(e) =>
                  setBasics({ ...basics, total_worker_estimate: e.target.value })
                }
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
              disabled={!step1Valid || createCampaignMutation.isPending}
              onClick={() => createCampaignMutation.mutate()}
            >
              {createCampaignMutation.isPending ? "Saving…" : "Continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Employers & worksites ───────────────────────────────── */}
      {step === 2 && campaignId && (
        <StepEmployersWorksites
          campaignScope={basics.campaign_scope}
          replacedAgreementId={basics.replaced_agreement_id}
          selectedEmployers={selectedEmployers}
          setSelectedEmployers={setSelectedEmployers}
          selectedWorksites={selectedWorksites}
          setSelectedWorksites={setSelectedWorksites}
          worksiteSectorWide={worksiteSectorWide}
          setWorksiteSectorWide={setWorksiteSectorWide}
          isPending={saveScopeMutation.isPending}
          onBack={() => setStep(1)}
          onContinue={() => saveScopeMutation.mutate()}
        />
      )}

      {/* ── Step 3: Allocate workers ────────────────────────────────────── */}
      {step === 3 && campaignId && (
        <StepAllocateWorkers
          campaignId={campaignId}
          selectedEmployers={selectedEmployers}
          selectedWorksites={selectedWorksites}
          worksiteSectorWide={worksiteSectorWide}
          selectedWorkers={selectedWorkers}
          setSelectedWorkers={setSelectedWorkers}
          isPending={saveWorkersMutation.isPending}
          onBack={() => setStep(2)}
          onContinue={() => saveWorkersMutation.mutate()}
        />
      )}

      {/* ── Step 4: Create campaign plan (bargaining only) ──────────────── */}
      {step === 4 && campaignId && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle>Campaign created</CardTitle>
                <CardDescription>
                  The campaign has been set up. Would you like to create a strategic
                  campaign plan in OA Planner?
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              OA Planner uses a "Playing to Win" methodology with six campaign stages and
              five gate assessments. It will be pre-linked to this bargaining campaign.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild className="flex-1">
                <a
                  href={`/campaigns/new?campaign_id=${campaignId}${existingCampaign?.organiser_id ? `&organiser_id=${existingCampaign.organiser_id}` : ""}`}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Create Campaign Plan in OA Planner
                </a>
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push(`/campaigns/${campaignId}`)}
              >
                Skip for now — go to campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {existingCampaign && step > 1 && step < 4 && (
        <p className="text-xs text-muted-foreground">
          Editing campaign #{campaignId}: {existingCampaign.name as string}
        </p>
      )}
    </div>
  );
}
