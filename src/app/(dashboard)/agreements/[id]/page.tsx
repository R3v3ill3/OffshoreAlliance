"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2, Star, Loader2, Users } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgreementStatus, DuesIncreaseType, AgreementOrgRole, WorkRole } from "@/types/database";

const AGREEMENT_ROLE_LABELS: Record<AgreementOrgRole, string> = {
  organiser: "Organiser",
  lead: "Lead",
  industrial_officer: "Industrial Officer",
};

const WORK_ROLE_LABELS: Record<WorkRole, string> = {
  coordinator: "Co-ordinator",
  lead_organiser: "Lead Organiser",
  organiser: "Organiser",
  industrial_officer: "Industrial Officer",
  industrial_coordinator: "Industrial Co-ordinator",
  specialist: "Specialist",
};

interface AgreementDetail {
  agreement_id: number;
  decision_no: string;
  agreement_name: string;
  short_name: string | null;
  sector_id: number | null;
  employer_id: number | null;
  industry_classification: string | null;
  date_of_decision: string | null;
  commencement_date: string | null;
  expiry_date: string | null;
  status: AgreementStatus;
  is_greenfield: boolean;
  is_variation: boolean;
  fwc_link: string | null;
  supersedes_id: number | null;
  variation_of_id: number | null;
  notes: string | null;
  sector: { sector_name: string } | null;
  employer: { employer_name: string } | null;
  agreement_unions: { union: { union_id: number; union_code: string; union_name: string } | null }[];
  dues_increases: DuesIncreaseRow[];
}

interface DuesIncreaseRow {
  increase_id: number;
  increase_number: number;
  effective_date: string | null;
  increase_type: DuesIncreaseType | null;
  percentage: number | null;
  minimum_pct: number | null;
  maximum_pct: number | null;
  raw_description: string | null;
}

interface WorksiteLink {
  worksite: {
    worksite_id: number;
    worksite_name: string;
    worksite_type: string;
    is_offshore: boolean;
  } | null;
}

interface WorkerLink {
  worker: {
    worker_id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    occupation: string | null;
  } | null;
}

interface SuccessorAgreement {
  agreement_id: number;
  decision_no: string;
  agreement_name: string;
  short_name: string | null;
  status: AgreementStatus;
}

interface AgreementOrganiserRow {
  id: number;
  organiser_id: number;
  is_primary: boolean;
  agreement_role: AgreementOrgRole;
  organiser: { organiser_id: number; organiser_name: string; email: string | null } | null;
  user_profile: {
    user_id: string;
    display_name: string;
    work_role: WorkRole | null;
    reports_to: string | null;
  } | null;
}

interface OrganiserOption {
  organiser_id: number;
  organiser_name: string;
  user_profile: {
    user_id: string;
    display_name: string;
    work_role: WorkRole | null;
    reports_to: string | null;
  } | null;
}

const STATUS_VARIANT: Record<AgreementStatus, "success" | "destructive" | "info" | "secondary"> = {
  Current: "success",
  Expired: "destructive",
  Under_Negotiation: "info",
  Terminated: "secondary",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

function pct(v: number | null) {
  if (v == null) return "—";
  return `${v}%`;
}

export default function AgreementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const id = params.id as string;

  // Organiser tab state
  const [addOrgOpen, setAddOrgOpen] = useState(false);
  const [addOrgId, setAddOrgId] = useState<string>("");
  const [addOrgRole, setAddOrgRole] = useState<AgreementOrgRole>("organiser");
  const [addOrgPrimary, setAddOrgPrimary] = useState(false);
  const [addOrgError, setAddOrgError] = useState<string | null>(null);
  const [suggestLead, setSuggestLead] = useState<{ name: string; organiserId: number } | null>(null);

  const { data: agreement, isLoading } = useQuery({
    queryKey: ["agreement", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(
          `*, sector:sectors(sector_name),
           employer:employers(employer_name),
           agreement_unions(union:unions(union_id, union_code, union_name)),
           dues_increases(*)`
        )
        .eq("agreement_id", id)
        .single();

      if (error) throw error;
      return data as unknown as AgreementDetail;
    },
    enabled: !!user,
  });

  const { data: worksites = [] } = useQuery({
    queryKey: ["agreement-worksites", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreement_worksites")
        .select("worksite:worksites(worksite_id, worksite_name, worksite_type, is_offshore)")
        .eq("agreement_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as WorksiteLink[];
    },
    enabled: !!user,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["agreement-workers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_agreements")
        .select("worker:workers(worker_id, first_name, last_name, email, occupation)")
        .eq("agreement_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as WorkerLink[];
    },
    enabled: !!user,
  });

  const { data: predecessorAgreement } = useQuery({
    queryKey: ["agreement-predecessor", agreement?.supersedes_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("agreement_id, decision_no, agreement_name, short_name, status")
        .eq("agreement_id", agreement!.supersedes_id!)
        .single();
      if (error) throw error;
      return data as unknown as SuccessorAgreement;
    },
    enabled: !!user && !!agreement?.supersedes_id,
  });

  const { data: successors = [] } = useQuery({
    queryKey: ["agreement-successors", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("agreement_id, decision_no, agreement_name, short_name, status")
        .eq("supersedes_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as SuccessorAgreement[];
    },
    enabled: !!user,
  });

  // Agreement organisers
  const { data: agreementOrganisers = [], isLoading: orgLoading } = useQuery({
    queryKey: ["agreement-organisers", id],
    queryFn: async () => {
      const res = await fetch(`/api/agreements/${id}/organisers`);
      if (!res.ok) throw new Error("Failed to load organisers");
      return res.json() as Promise<AgreementOrganiserRow[]>;
    },
    enabled: !!user,
  });

  // All organisers linked to user accounts, for the add dialog
  const { data: availableOrganisers = [] } = useQuery({
    queryKey: ["organisers-with-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisers")
        .select(
          `organiser_id, organiser_name,
           user_profile:user_profiles(user_id, display_name, work_role, reports_to)`
        )
        .eq("is_active", true)
        .order("organiser_name");
      if (error) throw error;
      return (data ?? []) as unknown as OrganiserOption[];
    },
    enabled: !!user,
  });

  const addOrgMutation = useMutation({
    mutationFn: async () => {
      setAddOrgError(null);
      const res = await fetch(`/api/agreements/${id}/organisers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organiserId: parseInt(addOrgId, 10),
          agreementRole: addOrgRole,
          isPrimary: addOrgPrimary,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add organiser");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreement-organisers", id] });
      // Check if we should suggest a lead
      if (addOrgPrimary) {
        const selected = availableOrganisers.find(
          (o) => o.organiser_id === parseInt(addOrgId, 10)
        );
        const reportsTo = selected?.user_profile?.reports_to;
        if (reportsTo) {
          const alreadyAdded = agreementOrganisers.some(
            (ao) => ao.user_profile?.user_id === reportsTo
          );
          if (!alreadyAdded) {
            // Find the manager's organiser record
            const managerOrg = availableOrganisers.find(
              (o) => o.user_profile?.user_id === reportsTo
            );
            if (
              managerOrg &&
              (managerOrg.user_profile?.work_role === "lead_organiser" ||
                managerOrg.user_profile?.work_role === "coordinator")
            ) {
              setSuggestLead({
                name: managerOrg.organiser_name,
                organiserId: managerOrg.organiser_id,
              });
            }
          }
        }
      }
      setAddOrgOpen(false);
      setAddOrgId("");
      setAddOrgRole("organiser");
      setAddOrgPrimary(false);
    },
    onError: (err: Error) => {
      setAddOrgError(err.message);
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await fetch(`/api/agreements/${id}/organisers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, isPrimary: true }),
      });
      if (!res.ok) throw new Error("Failed to set primary");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreement-organisers", id] });
    },
  });

  const removeOrgMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await fetch(
        `/api/agreements/${id}/organisers?assignmentId=${assignmentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to remove organiser");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreement-organisers", id] });
    },
  });

  const addSuggestedLeadMutation = useMutation({
    mutationFn: async (organiserId: number) => {
      const res = await fetch(`/api/agreements/${id}/organisers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organiserId,
          agreementRole: "lead",
          isPrimary: false,
        }),
      });
      if (!res.ok) throw new Error("Failed to add lead");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreement-organisers", id] });
      setSuggestLead(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Agreement not found.</p>
      </div>
    );
  }

  const sortedDues = [...(agreement.dues_increases ?? [])].sort(
    (a, b) => a.increase_number - b.increase_number
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/agreements")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {agreement.short_name || agreement.agreement_name}
            </h1>
            <Badge variant={STATUS_VARIANT[agreement.status]}>
              {agreement.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Decision No: {agreement.decision_no}
            {agreement.short_name && (
              <span className="ml-4">{agreement.agreement_name}</span>
            )}
          </p>
        </div>
        {canWrite && (
          <Button variant="outline">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agreement Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
            <div>
              <span className="text-muted-foreground">Sector</span>
              <p className="font-medium">{agreement.sector?.sector_name ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Employer</span>
              <p className="font-medium">{agreement.employer?.employer_name ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Industry Classification</span>
              <p className="font-medium">{agreement.industry_classification ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date of Decision</span>
              <p className="font-medium">{formatDate(agreement.date_of_decision)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Commencement</span>
              <p className="font-medium">{formatDate(agreement.commencement_date)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Expiry</span>
              <p className="font-medium">{formatDate(agreement.expiry_date)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">FWC Link</span>
              {agreement.fwc_link ? (
                <a
                  href={agreement.fwc_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline flex items-center gap-1"
                >
                  View on FWC <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className="font-medium">—</p>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Greenfield</span>
              <p className="font-medium">{agreement.is_greenfield ? "Yes" : "No"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Variation</span>
              <p className="font-medium">{agreement.is_variation ? "Yes" : "No"}</p>
            </div>
            <div className="col-span-full">
              <span className="text-muted-foreground">Union Coverage</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {agreement.agreement_unions?.length ? (
                  agreement.agreement_unions.map((au) =>
                    au.union ? (
                      <Badge key={au.union.union_id} variant="outline">
                        {au.union.union_code} — {au.union.union_name}
                      </Badge>
                    ) : null
                  )
                ) : (
                  <p className="font-medium">—</p>
                )}
              </div>
            </div>
            {agreement.notes && (
              <div className="col-span-full">
                <span className="text-muted-foreground">Notes</span>
                <p className="font-medium whitespace-pre-wrap">{agreement.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {sortedDues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dues Increase Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Min</TableHead>
                    <TableHead>Max</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDues.map((d) => (
                    <TableRow key={d.increase_id}>
                      <TableCell>{d.increase_number}</TableCell>
                      <TableCell>{formatDate(d.effective_date)}</TableCell>
                      <TableCell>
                        {d.increase_type ? (
                          <Badge variant="outline">{d.increase_type}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{pct(d.percentage)}</TableCell>
                      <TableCell>{pct(d.minimum_pct)}</TableCell>
                      <TableCell>{pct(d.maximum_pct)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {d.raw_description ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="organisers">
        <TabsList>
          <TabsTrigger value="organisers">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Organisers
            {agreementOrganisers.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {agreementOrganisers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="worksites">Worksites</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="organisers">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Auto-suggest lead banner */}
              {suggestLead && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
                  <span className="text-amber-800 dark:text-amber-300">
                    <strong>{suggestLead.name}</strong> is the primary organiser&apos;s lead — add them as Lead on this agreement?
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSuggestLead(null)}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => addSuggestedLeadMutation.mutate(suggestLead.organiserId)}
                      disabled={addSuggestedLeadMutation.isPending}
                    >
                      {addSuggestedLeadMutation.isPending && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Add as Lead
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {agreementOrganisers.length === 0
                    ? "No organisers assigned."
                    : `${agreementOrganisers.length} organiser${agreementOrganisers.length !== 1 ? "s" : ""} assigned.`}
                </p>
                {canWrite && (
                  <Button size="sm" onClick={() => setAddOrgOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Add Organiser
                  </Button>
                )}
              </div>

              {orgLoading ? (
                <div className="flex justify-center py-8">
                  <EurekaLoadingSpinner size="sm" />
                </div>
              ) : agreementOrganisers.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Work Role</TableHead>
                        <TableHead>Agreement Role</TableHead>
                        <TableHead>Primary</TableHead>
                        {canWrite && <TableHead />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agreementOrganisers.map((ao) => (
                        <TableRow key={ao.id}>
                          <TableCell className="font-medium">
                            {ao.organiser?.organiser_name ?? "—"}
                          </TableCell>
                          <TableCell>
                            {ao.user_profile?.work_role ? (
                              <Badge variant="outline">
                                {WORK_ROLE_LABELS[ao.user_profile.work_role]}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                ao.agreement_role === "lead"
                                  ? "info"
                                  : ao.agreement_role === "industrial_officer"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {AGREEMENT_ROLE_LABELS[ao.agreement_role]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {ao.is_primary ? (
                              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            ) : canWrite ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Set as primary"
                                onClick={() => setPrimaryMutation.mutate(ao.id)}
                                disabled={setPrimaryMutation.isPending}
                              >
                                <Star className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          {canWrite && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => removeOrgMutation.mutate(ao.id)}
                                disabled={removeOrgMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Add Organiser dialog */}
          <Dialog open={addOrgOpen} onOpenChange={(o) => { setAddOrgOpen(o); if (!o) { setAddOrgId(""); setAddOrgRole("organiser"); setAddOrgPrimary(false); setAddOrgError(null); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Organiser</DialogTitle>
                <DialogDescription>
                  Assign an organiser to this agreement and specify their role.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Organiser</Label>
                  <Select value={addOrgId} onValueChange={setAddOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organiser..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOrganisers
                        .filter(
                          (o) =>
                            !agreementOrganisers.some(
                              (ao) => ao.organiser_id === o.organiser_id
                            )
                        )
                        .map((o) => (
                          <SelectItem
                            key={o.organiser_id}
                            value={String(o.organiser_id)}
                          >
                            {o.organiser_name}
                            {o.user_profile?.work_role
                              ? ` — ${WORK_ROLE_LABELS[o.user_profile.work_role]}`
                              : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Agreement Role</Label>
                  <Select
                    value={addOrgRole}
                    onValueChange={(v) => setAddOrgRole(v as AgreementOrgRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organiser">Organiser</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="industrial_officer">Industrial Officer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPrimary"
                    checked={addOrgPrimary}
                    onChange={(e) => setAddOrgPrimary(e.target.checked)}
                    className="h-4 w-4 rounded border"
                  />
                  <Label htmlFor="isPrimary" className="font-normal cursor-pointer">
                    Set as primary organiser
                  </Label>
                </div>
                {addOrgError && (
                  <p className="text-sm text-destructive">{addOrgError}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOrgOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => addOrgMutation.mutate()}
                  disabled={!addOrgId || addOrgMutation.isPending}
                >
                  {addOrgMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Add Organiser
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="worksites">
          <Card>
            <CardContent className="pt-6">
              {worksites.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No worksites linked to this agreement.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worksite</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {worksites.map((ws) =>
                        ws.worksite ? (
                          <TableRow
                            key={ws.worksite.worksite_id}
                            className="cursor-pointer"
                            onClick={() =>
                              router.push(`/worksites/${ws.worksite!.worksite_id}`)
                            }
                          >
                            <TableCell className="font-medium">
                              {ws.worksite.worksite_name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {ws.worksite.worksite_type.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {ws.worksite.is_offshore ? "Offshore" : "Onshore"}
                            </TableCell>
                          </TableRow>
                        ) : null
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workers">
          <Card>
            <CardContent className="pt-6">
              {workers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No workers linked to this agreement.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Occupation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workers.map((wl) =>
                        wl.worker ? (
                          <TableRow
                            key={wl.worker.worker_id}
                            className="cursor-pointer"
                            onClick={() =>
                              router.push(`/workers/${wl.worker!.worker_id}`)
                            }
                          >
                            <TableCell className="font-medium">
                              {wl.worker.first_name} {wl.worker.last_name}
                            </TableCell>
                            <TableCell>{wl.worker.email ?? "—"}</TableCell>
                            <TableCell>{wl.worker.occupation ?? "—"}</TableCell>
                          </TableRow>
                        ) : null
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center py-8">
                Upload and manage documents here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {predecessorAgreement && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Supersedes
                  </h3>
                  <button
                    onClick={() =>
                      router.push(`/agreements/${predecessorAgreement.agreement_id}`)
                    }
                    className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors w-full text-left"
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {predecessorAgreement.short_name ||
                          predecessorAgreement.agreement_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {predecessorAgreement.decision_no}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[predecessorAgreement.status]}>
                      {predecessorAgreement.status.replace(/_/g, " ")}
                    </Badge>
                  </button>
                </div>
              )}

              {successors.length > 0 && (
                <div>
                  {predecessorAgreement && <Separator className="my-4" />}
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Superseded By
                  </h3>
                  <div className="space-y-2">
                    {successors.map((s) => (
                      <button
                        key={s.agreement_id}
                        onClick={() =>
                          router.push(`/agreements/${s.agreement_id}`)
                        }
                        className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors w-full text-left"
                      >
                        <div className="flex-1">
                          <p className="font-medium">
                            {s.short_name || s.agreement_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {s.decision_no}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[s.status]}>
                          {s.status.replace(/_/g, " ")}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!predecessorAgreement && successors.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No agreement history available.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
