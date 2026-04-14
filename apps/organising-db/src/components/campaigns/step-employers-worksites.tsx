"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, MapPin, Plus, X } from "lucide-react";
import type { CampaignScopeType } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmployerRow {
  employer_id: number;
  employer_name: string;
}

interface WorksiteRow {
  worksite_id: number;
  worksite_name: string;
}

interface StepEmployersWorksitesProps {
  campaignScope: CampaignScopeType | "" | null;
  replacedAgreementId: number | null;
  selectedEmployers: number[];
  setSelectedEmployers: (v: number[]) => void;
  selectedWorksites: number[];
  setSelectedWorksites: (v: number[]) => void;
  worksiteSectorWide: boolean;
  setWorksiteSectorWide: (v: boolean) => void;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSingleEmployer(scope: CampaignScopeType | "" | null) {
  return (
    scope === "single_employer_single_site" || scope === "single_employer_multi_site"
  );
}

function isSingleSite(scope: CampaignScopeType | "" | null) {
  return (
    scope === "multi_employer_single_site" || scope === "single_employer_single_site"
  );
}

function isSiteFirst(scope: CampaignScopeType | "" | null) {
  return scope === "multi_employer_single_site";
}

// ─── Small sub-components ────────────────────────────────────────────────────

/** Filterable checkbox/radio list */
function EntityList({
  items,
  selected,
  onToggle,
  singleSelect,
  placeholder,
  eaLinkedIds,
  emptyLabel,
}: {
  items: { id: number; label: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  singleSelect?: boolean;
  placeholder?: string;
  eaLinkedIds?: Set<number>;
  emptyLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = items.filter(
    (i) => !search || i.label.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: EA-linked first, then alphabetical
  const sorted = useMemo(() => {
    if (!eaLinkedIds || eaLinkedIds.size === 0) return filtered;
    return [...filtered].sort((a, b) => {
      const aLinked = eaLinkedIds.has(a.id) ? 0 : 1;
      const bLinked = eaLinkedIds.has(b.id) ? 0 : 1;
      if (aLinked !== bLinked) return aLinked - bLinked;
      return a.label.localeCompare(b.label);
    });
  }, [filtered, eaLinkedIds]);

  return (
    <div className="space-y-2">
      <Input
        placeholder={placeholder ?? "Search…"}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground px-1 py-2">
            {emptyLabel ?? "No items found."}
          </p>
        )}
        {sorted.map((item) => {
          const isSelected = selected.includes(item.id);
          const isLinked = eaLinkedIds?.has(item.id);
          return (
            <label
              key={item.id}
              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
            >
              <input
                type={singleSelect ? "radio" : "checkbox"}
                name={singleSelect ? "entity-single" : undefined}
                checked={isSelected}
                onChange={() => onToggle(item.id)}
              />
              <span className="flex-1">{item.label}</span>
              {isLinked && (
                <Badge variant="secondary" className="text-xs h-5 px-1">
                  EA
                </Badge>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** "Add entity" dialog — select existing or create new */
function AddEntityDialog({
  open,
  onOpenChange,
  title,
  allItems,
  excludeIds,
  onSelectExisting,
  onCreateNew,
  existingPlaceholder,
  newNamePlaceholder,
  isCreating,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  allItems: { id: number; label: string }[];
  excludeIds: number[];
  onSelectExisting: (id: number) => void;
  onCreateNew: (name: string) => void;
  existingPlaceholder?: string;
  newNamePlaceholder?: string;
  isCreating: boolean;
}) {
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");

  const available = allItems.filter(
    (i) => !excludeIds.includes(i.id) && (!search || i.label.toLowerCase().includes(search.toLowerCase()))
  );

  function handleClose() {
    setSearch("");
    setNewName("");
    setTab("existing");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "new")}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">
              Select existing
            </TabsTrigger>
            <TabsTrigger value="new" className="flex-1">
              Create new
            </TabsTrigger>
          </TabsList>
          <TabsContent value="existing" className="space-y-2 mt-3">
            <Input
              placeholder={existingPlaceholder ?? "Search…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
              {available.length === 0 && (
                <p className="text-sm text-muted-foreground px-1 py-2">No items available.</p>
              )}
              {available.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                  onClick={() => {
                    onSelectExisting(item.id);
                    handleClose();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="new" className="space-y-3 mt-3">
            <Input
              placeholder={newNamePlaceholder ?? "Enter name…"}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                disabled={!newName.trim() || isCreating}
                onClick={() => {
                  onCreateNew(newName.trim());
                  setNewName("");
                }}
              >
                {isCreating ? "Creating…" : "Create & add"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StepEmployersWorksites({
  campaignScope,
  replacedAgreementId,
  selectedEmployers,
  setSelectedEmployers,
  selectedWorksites,
  setSelectedWorksites,
  worksiteSectorWide,
  setWorksiteSectorWide,
  isPending,
  onBack,
  onContinue,
}: StepEmployersWorksitesProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [addEmployerOpen, setAddEmployerOpen] = useState(false);
  const [addWorksiteOpen, setAddWorksiteOpen] = useState(false);

  // ── All entities ─────────────────────────────────────────────────────────

  const { data: allEmployers = [] } = useQuery<EmployerRow[]>({
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

  const { data: allWorksites = [] } = useQuery<WorksiteRow[]>({
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

  // ── EA-linked entities (when replacedAgreementId is set) ──────────────────

  const { data: eaEmployerIds = [] } = useQuery<number[]>({
    queryKey: ["ea-employers", replacedAgreementId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agreement_employers")
        .select("employer_id")
        .eq("agreement_id", replacedAgreementId!);
      return (data ?? []).map((r) => r.employer_id);
    },
    enabled: !!user && !!replacedAgreementId,
  });

  const { data: eaWorksiteIds = [] } = useQuery<number[]>({
    queryKey: ["ea-worksites", replacedAgreementId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agreement_worksites")
        .select("worksite_id")
        .eq("agreement_id", replacedAgreementId!);
      return (data ?? []).map((r) => r.worksite_id);
    },
    enabled: !!user && !!replacedAgreementId,
  });

  const eaEmployerSet = useMemo(() => new Set(eaEmployerIds), [eaEmployerIds]);
  const eaWorksiteSet = useMemo(() => new Set(eaWorksiteIds), [eaWorksiteIds]);

  // ── Cross-filtered worksites: linked to selected employers ────────────────

  const { data: linkedWorksiteIds = [] } = useQuery<number[]>({
    queryKey: ["employer-worksites", selectedEmployers],
    queryFn: async () => {
      const { data } = await supabase
        .from("employer_worksite_roles")
        .select("worksite_id")
        .in("employer_id", selectedEmployers)
        .eq("is_current", true);
      return [...new Set((data ?? []).map((r) => r.worksite_id))];
    },
    enabled: !!user && selectedEmployers.length > 0,
  });

  // ── Cross-filtered employers: linked to selected worksites ────────────────

  const { data: linkedEmployerIds = [] } = useQuery<number[]>({
    queryKey: ["worksite-employers", selectedWorksites],
    queryFn: async () => {
      const { data } = await supabase
        .from("employer_worksite_roles")
        .select("employer_id")
        .in("worksite_id", selectedWorksites)
        .eq("is_current", true);
      return [...new Set((data ?? []).map((r) => r.employer_id))];
    },
    enabled: !!user && selectedWorksites.length > 0,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createEmployerMutation = useAuthAwareMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("employers")
        .insert({ employer_name: name })
        .select("employer_id")
        .single();
      if (error) throw error;
      return data.employer_id as number;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["employers-active"] });
      toggleEmployer(id);
    },
  });

  const createWorksiteMutation = useAuthAwareMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("worksites")
        .insert({ worksite_name: name, worksite_type: "Other" })
        .select("worksite_id")
        .single();
      if (error) throw error;
      return data.worksite_id as number;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["worksites-active"] });
      toggleWorksite(id);
    },
  });

  const linkEmployerWorksiteMutation = useAuthAwareMutation({
    mutationFn: async ({
      employer_id,
      worksite_id,
    }: {
      employer_id: number;
      worksite_id: number;
    }) => {
      // Upsert — ignore if already linked with this role
      await supabase.from("employer_worksite_roles").upsert(
        { employer_id, worksite_id, role_type: "Other", is_current: true },
        { onConflict: "employer_id,worksite_id,role_type", ignoreDuplicates: true }
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["employer-worksites", [vars.employer_id]] });
      queryClient.invalidateQueries({ queryKey: ["worksite-employers", [vars.worksite_id]] });
    },
  });

  // ── Toggle helpers ────────────────────────────────────────────────────────

  const toggleEmployer = (id: number) => {
    if (isSingleEmployer(campaignScope)) {
      // Single-select: replace selection and clear worksites
      if (selectedEmployers.includes(id)) {
        setSelectedEmployers([]);
        setSelectedWorksites([]);
      } else {
        setSelectedEmployers([id]);
        setSelectedWorksites([]);
      }
    } else {
      if (selectedEmployers.includes(id)) {
        setSelectedEmployers(selectedEmployers.filter((x) => x !== id));
      } else {
        setSelectedEmployers([...selectedEmployers, id]);
      }
    }
  };

  const toggleWorksite = (id: number) => {
    if (isSingleSite(campaignScope)) {
      if (selectedWorksites.includes(id)) {
        setSelectedWorksites([]);
        if (isSiteFirst(campaignScope)) setSelectedEmployers([]);
      } else {
        setSelectedWorksites([id]);
        if (isSiteFirst(campaignScope)) setSelectedEmployers([]);
      }
    } else {
      if (selectedWorksites.includes(id)) {
        setSelectedWorksites(selectedWorksites.filter((x) => x !== id));
      } else {
        setSelectedWorksites([...selectedWorksites, id]);
      }
    }
  };

  // ── Handle "add" actions with auto-linking ────────────────────────────────

  const handleAddWorksite = (id: number) => {
    toggleWorksite(id);
    // Link to the primary selected employer if applicable
    if (selectedEmployers.length > 0) {
      linkEmployerWorksiteMutation.mutate({
        employer_id: selectedEmployers[0],
        worksite_id: id,
      });
    }
  };

  const handleAddEmployer = (id: number) => {
    toggleEmployer(id);
    // Link to the primary selected worksite if applicable
    if (selectedWorksites.length > 0) {
      linkEmployerWorksiteMutation.mutate({
        employer_id: id,
        worksite_id: selectedWorksites[0],
      });
    }
  };

  // ── Derived entity lists for display ─────────────────────────────────────

  const allEmployerItems = useMemo(
    () => allEmployers.map((e) => ({ id: e.employer_id, label: e.employer_name })),
    [allEmployers]
  );

  const allWorksiteItems = useMemo(
    () => allWorksites.map((w) => ({ id: w.worksite_id, label: w.worksite_name })),
    [allWorksites]
  );

  /**
   * The "primary" worksite list shown in the main UI depends on scope:
   * - Employer-first scopes: filter to worksites linked to the selected employer(s),
   *   showing EA-linked ones at top.
   * - Site-first scopes: show all (filtered after site is chosen).
   * - No scope: cross-filter dynamically.
   */
  const displayedWorksiteItems = useMemo(() => {
    if (worksiteSectorWide) return [];

    if (isSiteFirst(campaignScope) || !campaignScope) {
      // show all worksites (unfiltered until employer chosen)
      return allWorksiteItems;
    }

    if (selectedEmployers.length === 0) {
      // Employer-first but none chosen yet: show EA-linked worksites as hints
      if (eaWorksiteSet.size > 0) {
        return allWorksiteItems.filter((w) => eaWorksiteSet.has(w.id));
      }
      return [];
    }

    // Filter to worksites linked to selected employer(s)
    const linked = new Set(linkedWorksiteIds);
    // Merge with EA worksites if replacedAgreementId present
    if (eaWorksiteSet.size > 0) {
      eaWorksiteSet.forEach((id) => linked.add(id));
    }

    if (linked.size === 0) return allWorksiteItems; // fallback: show all if no links found
    return allWorksiteItems.filter((w) => linked.has(w.id));
  }, [
    campaignScope,
    selectedEmployers,
    allWorksiteItems,
    linkedWorksiteIds,
    eaWorksiteSet,
    worksiteSectorWide,
  ]);

  const displayedEmployerItems = useMemo(() => {
    if (!isSiteFirst(campaignScope) || selectedWorksites.length === 0) {
      return allEmployerItems;
    }

    // Site-first: filter employers to those linked to selected worksite(s)
    const linked = new Set(linkedEmployerIds);
    if (eaEmployerSet.size > 0) {
      eaEmployerSet.forEach((id) => linked.add(id));
    }

    if (linked.size === 0) return allEmployerItems;
    return allEmployerItems.filter((e) => linked.has(e.id));
  }, [campaignScope, selectedWorksites, allEmployerItems, linkedEmployerIds, eaEmployerSet]);

  // ── Validation ────────────────────────────────────────────────────────────

  const canContinue =
    selectedEmployers.length > 0 || worksiteSectorWide || selectedWorksites.length > 0;

  // ── Section labels from scope ─────────────────────────────────────────────

  const employerLabel = isSingleEmployer(campaignScope) ? "Employer (select one)" : "Employers";
  const worksiteLabel = isSingleSite(campaignScope) ? "Worksite (select one)" : "Worksites";

  // Are worksites gated behind employer selection?
  const worksiteGated =
    isSingleEmployer(campaignScope) ||
    campaignScope === "multi_employer_multi_site";

  const siteFirstMode = isSiteFirst(campaignScope);

  const eaHintText =
    replacedAgreementId && (eaEmployerSet.size > 0 || eaWorksiteSet.size > 0)
      ? `Employers and worksites linked to the replaced EA are marked with "EA" and shown first.`
      : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employers &amp; worksites</CardTitle>
        <CardDescription>
          Select the targets for this campaign.
          {eaHintText && <span className="block mt-1 text-xs">{eaHintText}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── SITE-FIRST: worksite picker comes first ─────────────────────── */}
        {siteFirstMode && (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {worksiteLabel}
                </Label>
              </div>
              <EntityList
                items={allWorksiteItems}
                selected={selectedWorksites}
                onToggle={toggleWorksite}
                singleSelect={isSingleSite(campaignScope)}
                placeholder="Search worksites…"
                eaLinkedIds={eaWorksiteSet}
                emptyLabel="No worksites found."
              />
            </div>

            {selectedWorksites.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {employerLabel}
                    {displayedEmployerItems.length < allEmployerItems.length && (
                      <Badge variant="outline" className="ml-1 text-xs h-5 font-normal">
                        filtered
                      </Badge>
                    )}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setAddEmployerOpen(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Add employer
                  </Button>
                </div>
                <EntityList
                  items={displayedEmployerItems}
                  selected={selectedEmployers}
                  onToggle={toggleEmployer}
                  placeholder="Search employers…"
                  eaLinkedIds={eaEmployerSet}
                  emptyLabel="No linked employers found. Use 'Add employer' to include one."
                />
              </div>
            )}
          </>
        )}

        {/* ── EMPLOYER-FIRST (default / single-employer / multi-multi) ────── */}
        {!siteFirstMode && (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {employerLabel}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setAddEmployerOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  Add employer
                </Button>
              </div>
              <EntityList
                items={displayedEmployerItems}
                selected={selectedEmployers}
                onToggle={toggleEmployer}
                singleSelect={isSingleEmployer(campaignScope)}
                placeholder="Search employers…"
                eaLinkedIds={eaEmployerSet}
                emptyLabel="No employers found."
              />
            </div>

            {/* Sector-wide option */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={worksiteSectorWide}
                onChange={(e) => {
                  setWorksiteSectorWide(e.target.checked);
                  if (e.target.checked) setSelectedWorksites([]);
                }}
              />
              <span className="text-sm font-normal">Sector-wide worksites (no specific site)</span>
            </label>

            {/* Worksites — gated on employer selection when scope implies it */}
            {!worksiteSectorWide && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {worksiteLabel}
                    {worksiteGated &&
                      selectedEmployers.length > 0 &&
                      displayedWorksiteItems.length < allWorksiteItems.length && (
                        <Badge variant="outline" className="ml-1 text-xs h-5 font-normal">
                          filtered
                        </Badge>
                      )}
                  </Label>
                  {(!worksiteGated || selectedEmployers.length > 0) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setAddWorksiteOpen(true)}
                    >
                      <Plus className="h-3 w-3" />
                      Add worksite
                    </Button>
                  )}
                </div>

                {worksiteGated && selectedEmployers.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                    Select an employer above to see linked worksites.
                  </p>
                ) : (
                  <EntityList
                    items={displayedWorksiteItems}
                    selected={selectedWorksites}
                    onToggle={toggleWorksite}
                    singleSelect={isSingleSite(campaignScope)}
                    placeholder="Search worksites…"
                    eaLinkedIds={eaWorksiteSet}
                    emptyLabel={
                      selectedEmployers.length > 0
                        ? "No worksites linked to this employer yet. Use 'Add worksite' to connect one."
                        : "No worksites found."
                    }
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* ── Selected summary chips ───────────────────────────────────────── */}
        {(selectedEmployers.length > 0 || selectedWorksites.length > 0 || worksiteSectorWide) && (
          <div className="rounded-md bg-muted/40 p-3 space-y-2 text-sm">
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
              Selected
            </p>
            <div className="flex flex-wrap gap-1">
              {selectedEmployers.map((id) => {
                const e = allEmployers.find((x) => x.employer_id === id);
                return (
                  <Badge key={id} variant="secondary" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    {e?.employer_name ?? `Employer #${id}`}
                    <button
                      type="button"
                      onClick={() => toggleEmployer(id)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
              {worksiteSectorWide && (
                <Badge variant="secondary">Sector-wide worksites</Badge>
              )}
              {!worksiteSectorWide &&
                selectedWorksites.map((id) => {
                  const w = allWorksites.find((x) => x.worksite_id === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {w?.worksite_name ?? `Worksite #${id}`}
                      <button
                        type="button"
                        onClick={() => toggleWorksite(id)}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────────────────── */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button onClick={onContinue} disabled={isPending || !canContinue}>
            {isPending ? "Saving…" : "Continue to workers"}
          </Button>
        </div>
      </CardContent>

      {/* ── Add employer dialog ───────────────────────────────────────────── */}
      <AddEntityDialog
        open={addEmployerOpen}
        onOpenChange={setAddEmployerOpen}
        title="Add employer"
        allItems={allEmployerItems}
        excludeIds={selectedEmployers}
        onSelectExisting={handleAddEmployer}
        onCreateNew={(name) => createEmployerMutation.mutate(name)}
        existingPlaceholder="Search employers…"
        newNamePlaceholder="Employer name"
        isCreating={createEmployerMutation.isPending}
      />

      {/* ── Add worksite dialog ───────────────────────────────────────────── */}
      <AddEntityDialog
        open={addWorksiteOpen}
        onOpenChange={setAddWorksiteOpen}
        title="Add worksite"
        allItems={allWorksiteItems}
        excludeIds={selectedWorksites}
        onSelectExisting={handleAddWorksite}
        onCreateNew={(name) => createWorksiteMutation.mutate(name)}
        existingPlaceholder="Search worksites…"
        newNamePlaceholder="Worksite name"
        isCreating={createWorksiteMutation.isPending}
      />
    </Card>
  );
}
