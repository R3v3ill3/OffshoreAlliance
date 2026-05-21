"use client";

import { useMemo, useState } from "react";
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
import { Building2, MapPin, Plus, Trash2 } from "lucide-react";

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
  const [sectorConfirmOpen, setSectorConfirmOpen] = useState(false);
  const [employerSearch, setEmployerSearch] = useState("");
  const [worksiteSearch, setWorksiteSearch] = useState("");
  const [showAllWorksites, setShowAllWorksites] = useState(false);

  const invalidateScope = () => {
    queryClient.invalidateQueries({ queryKey: SCOPE_KEYS.employers(campaignId) });
    queryClient.invalidateQueries({ queryKey: SCOPE_KEYS.worksites(campaignId) });
    queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-member-ids", campaignId] });
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

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Campaign scope: the employers and worksites this campaign covers. These rarely change.
        Workers, organising units, and ratings now live on the Wall Chart / List and Campaign Units
        sub-tabs.
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

    </div>
  );
}
