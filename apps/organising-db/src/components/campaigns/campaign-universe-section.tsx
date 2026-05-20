"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Building2, MapPin, Plus, Trash2, Upload, Users } from "lucide-react";
import { CampaignUnitsSection } from "@/components/campaigns/campaign-units-section";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";
import { isWorkerMemberLike } from "@/lib/campaign/constants";

const SCOPE_KEYS = {
  employers: (cid: string) => ["campaign-universe-employers", cid] as const,
  worksites: (cid: string) => ["campaign-universe-worksites", cid] as const,
};

function normalizeOne<T>(rel: T | T[] | null): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export function CampaignUniverseSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const cid = Number(campaignId);

  const [employerDialog, setEmployerDialog] = useState(false);
  const [worksiteDialog, setWorksiteDialog] = useState(false);
  const [workerDialog, setWorkerDialog] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [sectorConfirmOpen, setSectorConfirmOpen] = useState(false);
  const [employerSearch, setEmployerSearch] = useState("");
  const [worksiteSearch, setWorksiteSearch] = useState("");
  const [workerSearch, setWorkerSearch] = useState("");
  const [showAllWorksites, setShowAllWorksites] = useState(false);

  const invalidateScope = () => {
    queryClient.invalidateQueries({ queryKey: SCOPE_KEYS.employers(campaignId) });
    queryClient.invalidateQueries({ queryKey: SCOPE_KEYS.worksites(campaignId) });
    queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
  };

  const { data: campaignMeta } = useQuery({
    queryKey: ["campaign-universe-meta", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("campaign_id, replaced_agreement_id, enterprise_agreement_subtype")
        .eq("campaign_id", cid)
        .single();
      if (error) throw error;
      return data as {
        campaign_id: number;
        replaced_agreement_id: number | null;
        enterprise_agreement_subtype: string | null;
      };
    },
    enabled: !!user && Number.isFinite(cid),
  });

  const { data: campaignEmployers = [] } = useQuery({
    queryKey: SCOPE_KEYS.employers(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_employers")
        .select(
          `id, employer_id,
           employer:employers(employer_id, employer_name)`
        )
        .eq("campaign_id", cid)
        .order("employer_id");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && Number.isFinite(cid),
  });

  const { data: campaignWorksites = [] } = useQuery({
    queryKey: SCOPE_KEYS.worksites(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worksites")
        .select(
          `id, worksite_id, sector_wide,
           worksite:worksites(worksite_id, worksite_name)`
        )
        .eq("campaign_id", cid);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && Number.isFinite(cid),
  });

  // Comprehensive members query — same cache key as campaign-units-section so both get full shape.
  const {
    data: members = [],
    isFetching: membersFetching,
    isStale: membersStale,
    isFetched: membersFetched,
    dataUpdatedAt: membersUpdatedAt,
  } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `membership_id, worker_id,
           worker:workers(
             worker_id, first_name, last_name, preferred_name,
             member_role_type_id, is_bargaining_rep, occupation,
             member_role_type:member_role_types(role_name, role_type_id, display_name),
             union_membership_type:union_membership_types(type_name),
             employer:employers(employer_name),
             worksite:worksites(worksite_name)
           )`
        )
        .eq("campaign_id", cid);
      if (error) throw error;
      const rows = data ?? [];
      const sample = rows[0] as { worker_id?: number; worker?: unknown } | undefined;
      const sampleWorker = normalizeOne(
        sample?.worker as { first_name?: string; last_name?: string } | null
      );
      // #region agent log
      fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3dd855'},body:JSON.stringify({sessionId:'3dd855',location:'campaign-universe-section.tsx:members-queryFn',message:'universe section fetched campaign-members (full worker join)',data:{campaignId,rowCount:rows.length,hasWorkerJoin:sample?.worker!=null,sampleWorkerId:sample?.worker_id,sampleFirstName:sampleWorker?.first_name??null,sampleLastName:sampleWorker?.last_name??null,selectShape:'full-worker-join'},timestamp:Date.now(),hypothesisId:'H2-H4'})}).catch(()=>{});
      // #endregion
      return rows;
    },
    enabled: !!user && Number.isFinite(cid),
  });

  useEffect(() => {
    if (!Number.isFinite(cid) || members.length === 0) return;
    const sample = members[0] as { worker_id?: number; worker?: unknown };
    const sampleWorker = normalizeOne(
      sample?.worker as { first_name?: string; last_name?: string } | null
    );
    const missingNameCount = members.filter((m: { worker?: unknown; worker_id: number }) => {
      const w = normalizeOne(
        m.worker as { first_name?: string; last_name?: string } | null
      );
      return !w || !(`${w.first_name ?? ""} ${w.last_name ?? ""}`.trim());
    }).length;
    // #region agent log
    fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3dd855'},body:JSON.stringify({sessionId:'3dd855',location:'campaign-universe-section.tsx:members-effect',message:'universe section members cache/render state',data:{campaignId,memberCount:members.length,missingNameCount,hasWorkerJoin:sample?.worker!=null,sampleWorkerId:sample?.worker_id,sampleFirstName:sampleWorker?.first_name??null,sampleLastName:sampleWorker?.last_name??null,isFetching:membersFetching,isStale:membersStale,isFetched:membersFetched,dataUpdatedAt:membersUpdatedAt,userReady:!!user},timestamp:Date.now(),hypothesisId:'H1-H3-H5'})}).catch(()=>{});
    // #endregion
  }, [members, membersFetching, membersStale, membersFetched, membersUpdatedAt, campaignId, cid, user]);

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
  });

  const employerIds = useMemo(
    () =>
      campaignEmployers
        .map((r: { employer_id: number }) => r.employer_id)
        .filter(Boolean),
    [campaignEmployers]
  );
  const employerIdsKey = employerIds.join(",");

  const sectorWideRow = useMemo(
    () => campaignWorksites.find((r: { sector_wide?: boolean }) => r.sector_wide === true),
    [campaignWorksites]
  );
  const isSectorWide = !!sectorWideRow;

  const siteRows = useMemo(
    () =>
      campaignWorksites.filter(
        (r: { sector_wide?: boolean; worksite_id?: number | null }) =>
          !r.sector_wide && r.worksite_id != null
      ),
    [campaignWorksites]
  );

  const worksiteIds = useMemo(
    () =>
      siteRows
        .map((r: { worksite_id: number | null }) => r.worksite_id)
        .filter((id): id is number => id != null),
    [siteRows]
  );

  // Show employer column only when there are multiple employers in this campaign.
  const showEmployerCol = campaignEmployers.length > 1;
  // Show worksite column only when there are multiple specific (non-sector-wide) worksites.
  const showWorksiteCol = !isSectorWide && siteRows.length > 1;

  const { data: eaEmployerIds = [] } = useQuery({
    queryKey: ["universe-ea-employers", campaignMeta?.replaced_agreement_id],
    queryFn: async () => {
      const aid = campaignMeta!.replaced_agreement_id!;
      const { data, error } = await supabase
        .from("agreement_employers")
        .select("employer_id")
        .eq("agreement_id", aid);
      if (error) throw error;
      return (data ?? []).map((r) => r.employer_id);
    },
    enabled: !!user && !!campaignMeta?.replaced_agreement_id,
  });

  const { data: linkedWorksiteIds = [] } = useQuery({
    queryKey: ["universe-linked-worksites", employerIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_worksite_roles")
        .select("worksite_id")
        .in("employer_id", employerIds)
        .eq("is_current", true);
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.worksite_id))];
    },
    enabled: !!user && employerIds.length > 0,
  });

  const { data: principalWorksiteIds = [] } = useQuery({
    queryKey: ["universe-principal-worksites", employerIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id")
        .in("principal_employer_id", employerIds)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []).map((r) => r.worksite_id);
    },
    enabled: !!user && employerIds.length > 0,
  });

  const { data: allEmployers = [] } = useQuery({
    queryKey: ["employers-active-universe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .eq("is_active", true)
        .order("employer_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && employerDialog,
  });

  const { data: allWorksites = [] } = useQuery({
    queryKey: ["worksites-active-universe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .eq("is_active", true)
        .order("worksite_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && worksiteDialog,
  });

  const linkedWorksiteSet = useMemo(() => {
    const s = new Set<number>([...linkedWorksiteIds, ...principalWorksiteIds]);
    return s;
  }, [linkedWorksiteIds, principalWorksiteIds]);

  const candidateWorksitesForDialog = useMemo(() => {
    const selected = new Set(worksiteIds);
    const pool = showAllWorksites
      ? allWorksites
      : allWorksites.filter((w) => linkedWorksiteSet.has(w.worksite_id));
    return pool.filter((w) => !selected.has(w.worksite_id));
  }, [allWorksites, linkedWorksiteSet, worksiteIds, showAllWorksites]);

  const { data: candidateWorkers = [], isFetching: workersLoading } = useQuery({
    queryKey: [
      "universe-worker-candidates",
      campaignId,
      employerIdsKey,
      isSectorWide,
      worksiteIds.join(","),
    ],
    queryFn: async () => {
      let q = supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name, employer_id, worksite_id,
           employer:employers(employer_name),
           worksite:worksites(worksite_name)`
        )
        .eq("is_active", true);

      if (employerIds.length > 0) {
        q = q.in("employer_id", employerIds);
      }
      if (!isSectorWide && worksiteIds.length > 0) {
        q = q.in("worksite_id", worksiteIds);
      }

      const { data, error } = await q.order("last_name").limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    enabled:
      !!user &&
      workerDialog &&
      (employerIds.length > 0 || (!isSectorWide && worksiteIds.length > 0)),
  });

  const memberWorkerIds = useMemo(
    () => new Set(members.map((m: { worker_id: number }) => m.worker_id)),
    [members]
  );

  const addableWorkers = useMemo(() => {
    return candidateWorkers.filter((w) => !memberWorkerIds.has(w.worker_id));
  }, [candidateWorkers, memberWorkerIds]);

  const filteredAddableWorkers = useMemo(() => {
    if (!workerSearch.trim()) return addableWorkers;
    const t = workerSearch.toLowerCase();
    return addableWorkers.filter(
      (w) =>
        w.first_name.toLowerCase().includes(t) || w.last_name.toLowerCase().includes(t)
    );
  }, [addableWorkers, workerSearch]);

  const addEmployerMutation = useAuthAwareMutation({
    mutationFn: async (employer_id: number) => {
      const { error } = await supabase.from("campaign_employers").insert({
        campaign_id: cid,
        employer_id,
      });
      if (error) throw error;

      if (
        campaignMeta?.replaced_agreement_id &&
        campaignMeta.enterprise_agreement_subtype === "replacement"
      ) {
        const eaSet = new Set(eaEmployerIds);
        if (!eaSet.has(employer_id)) {
          await supabase.from("agreement_employers").upsert(
            {
              agreement_id: campaignMeta.replaced_agreement_id,
              employer_id,
              is_primary: false,
            },
            { onConflict: "agreement_id,employer_id", ignoreDuplicates: true }
          );
        }
      }
    },
    onSuccess: () => {
      invalidateScope();
      queryClient.invalidateQueries({ queryKey: ["employers-active-universe"] });
      setEmployerDialog(false);
      setEmployerSearch("");
    },
    onError: (e: Error) => {
      window.alert(e.message || "Could not add employer");
    },
  });

  const removeEmployerMutation = useAuthAwareMutation({
    mutationFn: async (rowId: number) => {
      const { error } = await supabase.from("campaign_employers").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: invalidateScope,
    onError: (e: Error) => window.alert(e.message || "Could not remove employer"),
  });

  const linkEmployerWorksite = async (employer_id: number, worksite_id: number) => {
    await supabase.from("employer_worksite_roles").upsert(
      { employer_id, worksite_id, role_type: "Other", is_current: true },
      { onConflict: "employer_id,worksite_id,role_type", ignoreDuplicates: true }
    );
  };

  const addWorksiteMutation = useAuthAwareMutation({
    mutationFn: async (worksite_id: number) => {
      const { error } = await supabase.from("campaign_worksites").insert({
        campaign_id: cid,
        worksite_id,
        sector_wide: false,
      });
      if (error) throw error;
      if (employerIds.length > 0) {
        await linkEmployerWorksite(employerIds[0], worksite_id);
      }
    },
    onSuccess: () => {
      invalidateScope();
      queryClient.invalidateQueries({ queryKey: ["universe-linked-worksites", employerIdsKey] });
      setWorksiteDialog(false);
      setWorksiteSearch("");
      setShowAllWorksites(false);
    },
    onError: (e: Error) => window.alert(e.message || "Could not add worksite"),
  });

  const removeWorksiteMutation = useAuthAwareMutation({
    mutationFn: async (rowId: number) => {
      const { error } = await supabase.from("campaign_worksites").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: invalidateScope,
    onError: (e: Error) => window.alert(e.message || "Could not remove worksite"),
  });

  const setSectorWideMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const { error: delErr } = await supabase.from("campaign_worksites").delete().eq("campaign_id", cid);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("campaign_worksites").insert({
        campaign_id: cid,
        worksite_id: null,
        sector_wide: true,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      invalidateScope();
      setSectorConfirmOpen(false);
    },
    onError: (e: Error) => window.alert(e.message || "Could not update worksite scope"),
  });

  const clearSectorWideMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("campaign_worksites").delete().eq("id", sectorWideRow!.id);
      if (error) throw error;
    },
    onSuccess: invalidateScope,
    onError: (e: Error) => window.alert(e.message || "Could not clear sector-wide"),
  });

  const addWorkerMutation = useAuthAwareMutation({
    mutationFn: async (worker_id: number) => {
      const { error } = await supabase.from("campaign_worker_membership").insert({
        campaign_id: cid,
        worker_id,
      });
      if (error) throw error;
    },
    onSuccess: invalidateScope,
    onError: (e: Error) => window.alert(e.message || "Could not add worker"),
  });

  const removeWorkerMutation = useAuthAwareMutation({
    mutationFn: async (membership_id: number) => {
      const { error } = await supabase
        .from("campaign_worker_membership")
        .delete()
        .eq("membership_id", membership_id);
      if (error) throw error;
    },
    onSuccess: invalidateScope,
    onError: (e: Error) => window.alert(e.message || "Could not remove worker"),
  });

  const updateWorkerRole = useAuthAwareMutation({
    mutationFn: async (vars: { worker_id: number; member_role_type_id: number | null }) => {
      const { error } = await supabase
        .from("workers")
        .update({ member_role_type_id: vars.member_role_type_id })
        .eq("worker_id", vars.worker_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
    },
    onError: (e: Error) => window.alert(e.message || "Could not update role"),
  });

  const existingEmployerSet = useMemo(
    () => new Set(employerIds),
    [employerIds]
  );

  const pickableEmployers = useMemo(() => {
    return allEmployers
      .filter((e) => !existingEmployerSet.has(e.employer_id))
      .filter(
        (e) =>
          !employerSearch.trim() ||
          e.employer_name.toLowerCase().includes(employerSearch.toLowerCase())
      );
  }, [allEmployers, existingEmployerSet, employerSearch]);

  const workerPickerEnabled =
    employerIds.length > 0 || (!isSectorWide && worksiteIds.length > 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Campaign universe is the scope of employers, worksites, and workers for this campaign. It
        matches what you set in the campaign wizard and drives who you can add as members. Use the
        campaign units section below to define and assign organising units.
      </p>

      {/* Employers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Employers
            </CardTitle>
            <CardDescription>Principal employers included in this campaign.</CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => setEmployerDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add employer
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {campaignEmployers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No employers linked yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  {canWrite && <TableHead className="w-[100px] text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignEmployers.map((row: { id: number; employer_id: number; employer: unknown }) => {
                  const emp = normalizeOne(row.employer as { employer_name?: string } | null);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {emp?.employer_name ?? `Employer #${row.employer_id}`}
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeEmployerMutation.mutate(row.id)}
                            disabled={removeEmployerMutation.isPending}
                            aria-label="Remove employer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Worksites */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Worksites
            </CardTitle>
            <CardDescription>
              Specific sites or sector-wide coverage. Switching to sector-wide removes individual
              site rows.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {canWrite && !isSectorWide && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSectorConfirmOpen(true)}
                disabled={employerIds.length === 0}
                title={employerIds.length === 0 ? "Add an employer first" : undefined}
              >
                Use sector-wide
              </Button>
            )}
            {canWrite && isSectorWide && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => clearSectorWideMutation.mutate()}
                disabled={clearSectorWideMutation.isPending}
              >
                Use specific worksites
              </Button>
            )}
            {canWrite && !isSectorWide && (
              <Button
                size="sm"
                onClick={() => setWorksiteDialog(true)}
                disabled={employerIds.length === 0}
                title={employerIds.length === 0 ? "Add an employer first" : undefined}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add worksite
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isSectorWide ? (
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium">Sector-wide</span>
              <span className="text-muted-foreground"> — all worksites under the selected employers.</span>
            </div>
          ) : siteRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No specific worksites. Add sites or switch to sector-wide.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worksite</TableHead>
                  {canWrite && <TableHead className="w-[100px] text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteRows.map(
                  (row: {
                    id: number;
                    worksite_id: number | null;
                    worksite: unknown;
                  }) => {
                    const ws = normalizeOne(
                      row.worksite as { worksite_name?: string } | null
                    );
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {ws?.worksite_name ?? `Worksite #${row.worksite_id}`}
                        </TableCell>
                        {canWrite && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeWorksiteMutation.mutate(row.id)}
                              disabled={removeWorksiteMutation.isPending}
                              aria-label="Remove worksite"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  }
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Workers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Workers in campaign
            </CardTitle>
            <CardDescription>
              Members allocated to this campaign. Add or remove people here, and assign organising roles.
            </CardDescription>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/campaigns/${campaignId}/add-workers`}>
                  <Users className="h-4 w-4 mr-1" />
                  Add workers (bulk)
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImportWizardOpen(true)}
              >
                <Upload className="h-4 w-4 mr-1" />
                Import Workers
              </Button>
              <Button
                size="sm"
                onClick={() => setWorkerDialog(true)}
                disabled={!workerPickerEnabled}
                title={
                  !workerPickerEnabled
                    ? "Add employers (and specific worksites if not sector-wide) first"
                    : undefined
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                Add worker
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No workers on this campaign yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Organising role</TableHead>
                  <TableHead className="hidden sm:table-cell">Job type</TableHead>
                  {showWorksiteCol && <TableHead className="hidden md:table-cell">Worksite</TableHead>}
                  {showEmployerCol && <TableHead className="hidden md:table-cell">Employer</TableHead>}
                  {canWrite && <TableHead className="w-[60px] text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(
                  (m: {
                    membership_id: number;
                    worker: unknown;
                    worker_id: number;
                  }) => {
                    const w = normalizeOne(
                      m.worker as {
                        first_name?: string;
                        last_name?: string;
                        occupation?: string | null;
                        member_role_type_id?: number | null;
                        is_bargaining_rep?: boolean | null;
                        member_role_type?: { role_name?: string; role_type_id?: number; display_name?: string } | { role_name?: string; role_type_id?: number; display_name?: string }[] | null;
                        union_membership_type?: { type_name?: string } | { type_name?: string }[] | null;
                        employer?: { employer_name?: string } | { employer_name?: string }[] | null;
                        worksite?: { worksite_name?: string } | { worksite_name?: string }[] | null;
                      } | null
                    );
                    const mt = normalizeOne(w?.member_role_type ?? null);
                    const um = normalizeOne(w?.union_membership_type ?? null);
                    const emp = normalizeOne(w?.employer ?? null);
                    const ws = normalizeOne(w?.worksite ?? null);
                    const delegateOk = isWorkerMemberLike({
                      unionMembershipTypeName: um?.type_name,
                      memberRoleName: mt?.role_name,
                      isBargainingRep: w?.is_bargaining_rep,
                    });
                    return (
                      <TableRow key={m.membership_id}>
                        <TableCell className="font-medium">
                          {w
                            ? `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim()
                            : `Worker #${m.worker_id}`}
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <Select
                              value={
                                w?.member_role_type_id != null
                                  ? String(w.member_role_type_id)
                                  : "__none__"
                              }
                              onValueChange={(v) => {
                                const roleTypeId = v === "__none__" ? null : Number(v);
                                const selectedRole = roleTypes.find(
                                  (rt) => rt.role_type_id === roleTypeId
                                );
                                if (selectedRole?.role_name === "delegate" && !delegateOk) return;
                                updateWorkerRole.mutate({
                                  worker_id: m.worker_id,
                                  member_role_type_id: roleTypeId,
                                });
                              }}
                            >
                              <SelectTrigger className="w-40 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {roleTypes.map((rt) => (
                                  <SelectItem
                                    key={rt.role_type_id}
                                    value={String(rt.role_type_id)}
                                    disabled={rt.role_name === "delegate" && !delegateOk}
                                  >
                                    {rt.display_name}
                                    {rt.role_name === "delegate" && !delegateOk
                                      ? " (members only)"
                                      : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {mt?.display_name ?? "None"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {w?.occupation ?? "—"}
                        </TableCell>
                        {showWorksiteCol && (
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {ws?.worksite_name ?? "—"}
                          </TableCell>
                        )}
                        {showEmployerCol && (
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {emp?.employer_name ?? "—"}
                          </TableCell>
                        )}
                        {canWrite && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeWorkerMutation.mutate(m.membership_id)}
                              disabled={removeWorkerMutation.isPending}
                              aria-label="Remove worker"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  }
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Campaign units — renders its own Card */}
      <CampaignUnitsSection campaignId={campaignId} canWrite={canWrite} />

      <AlertDialog open={sectorConfirmOpen} onOpenChange={setSectorConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use sector-wide worksites?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all specific worksite rows for this campaign and marks scope as
              sector-wide (all sites under the selected employers). You can switch back to specific
              sites afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setSectorWideMutation.mutate()}
              disabled={setSectorWideMutation.isPending}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={employerDialog} onOpenChange={setEmployerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add employer</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search employers…"
            value={employerSearch}
            onChange={(e) => setEmployerSearch(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-64 overflow-y-auto rounded-md border p-2 space-y-1">
            {pickableEmployers.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-3 text-center">
                No matching employers.
              </p>
            ) : (
              pickableEmployers.map((e) => (
                <button
                  key={e.employer_id}
                  type="button"
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
                  onClick={() => addEmployerMutation.mutate(e.employer_id)}
                  disabled={addEmployerMutation.isPending}
                >
                  {e.employer_name}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmployerDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={worksiteDialog} onOpenChange={setWorksiteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add worksite</DialogTitle>
          </DialogHeader>
          {employerIds.length > 0 && (
            <div className="flex items-center space-x-2 py-2">
              <Checkbox
                id="show-all-ws"
                checked={showAllWorksites}
                onCheckedChange={(c) => setShowAllWorksites(c === true)}
              />
              <Label htmlFor="show-all-ws" className="text-sm font-normal cursor-pointer">
                Show all active worksites (not only those linked to campaign employers)
              </Label>
            </div>
          )}
          <Input
            placeholder="Search worksites…"
            value={worksiteSearch}
            onChange={(e) => setWorksiteSearch(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-64 overflow-y-auto rounded-md border p-2 space-y-1">
            {candidateWorksitesForDialog.filter((w) =>
              !worksiteSearch.trim()
                ? true
                : w.worksite_name.toLowerCase().includes(worksiteSearch.toLowerCase())
            ).length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-3 text-center">
                {showAllWorksites || linkedWorksiteSet.size === 0
                  ? "No worksites to add."
                  : "No linked worksites found. Enable 'show all' or link sites to employers first."}
              </p>
            ) : (
              candidateWorksitesForDialog
                .filter((w) =>
                  !worksiteSearch.trim()
                    ? true
                    : w.worksite_name.toLowerCase().includes(worksiteSearch.toLowerCase())
                )
                .map((w) => (
                  <button
                    key={w.worksite_id}
                    type="button"
                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
                    onClick={() => addWorksiteMutation.mutate(w.worksite_id)}
                    disabled={addWorksiteMutation.isPending}
                  >
                    {w.worksite_name}
                  </button>
                ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorksiteDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={workerDialog} onOpenChange={setWorkerDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add worker</DialogTitle>
          </DialogHeader>
          {!workerPickerEnabled ? (
            <p className="text-sm text-muted-foreground">
              Add at least one employer first. If you are not using sector-wide worksites, add
              worksites so workers can be filtered correctly.
            </p>
          ) : (
            <>
              <Input
                placeholder="Search by name…"
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
              />
              {workersLoading && (
                <p className="text-sm text-muted-foreground py-2">Loading workers…</p>
              )}
              <div className="max-h-72 overflow-y-auto rounded-md border p-2 space-y-1 mt-2">
                {filteredAddableWorkers.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2 py-3 text-center">
                    {addableWorkers.length === 0
                      ? "All matching workers are already on this campaign, or none match the current filters."
                      : "No workers match your search."}
                  </p>
                ) : (
                  filteredAddableWorkers.map((w) => {
                    const emp = normalizeOne(
                      (w as { employer?: { employer_name?: string } | { employer_name?: string }[] | null }).employer ?? null
                    );
                    const ws = normalizeOne(
                      (w as { worksite?: { worksite_name?: string } | { worksite_name?: string }[] | null }).worksite ?? null
                    );
                    return (
                      <button
                        key={w.worker_id}
                        type="button"
                        className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
                        onClick={() => addWorkerMutation.mutate(w.worker_id)}
                        disabled={addWorkerMutation.isPending}
                      >
                        <span className="font-medium">{w.first_name} {w.last_name}</span>
                        {(emp?.employer_name || ws?.worksite_name) && (
                          <span className="ml-2 text-muted-foreground text-xs">
                            {[emp?.employer_name, ws?.worksite_name].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setWorkerDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkerImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        campaignId={campaignId}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
          queryClient.invalidateQueries({ queryKey: ["workers"] });
        }}
      />
    </div>
  );
}
