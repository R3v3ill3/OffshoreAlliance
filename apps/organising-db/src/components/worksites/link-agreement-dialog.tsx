"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Agreement,
  WorkScope,
  EmployerRoleType,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import { X, ChevronRight, ChevronDown } from "lucide-react";

const ROLE_TYPES: EmployerRoleType[] = [
  "Owner",
  "Operator",
  "Principal_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Other",
];

type AgreementOption = Pick<
  Agreement,
  "agreement_id" | "agreement_name" | "short_name" | "decision_no" | "status"
>;

type ScopeOption = Pick<WorkScope, "scope_id" | "scope_name" | "is_whole_of_project" | "parent_scope_id"> & {
  parent?: { scope_name: string; parent?: { scope_name: string } };
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worksiteId: number;
  linkedAgreementIds: Set<number>;
  employerRoleEmployerIds: Set<number>;
  linkedScopeIds: Set<number>;
  allAgreements: AgreementOption[];
  allScopes: ScopeOption[];
  onSuccess: () => void;
}

export function LinkAgreementDialog({
  open,
  onOpenChange,
  worksiteId,
  linkedAgreementIds,
  employerRoleEmployerIds,
  linkedScopeIds,
  allAgreements,
  allScopes,
  onSuccess,
}: Props) {
  const supabase = createClient();

  const [selectedAgreementId, setSelectedAgreementId] = useState("");
  const [linkEmployer, setLinkEmployer] = useState(true);
  const [employerRoleType, setEmployerRoleType] =
    useState<EmployerRoleType>("Subcontractor");
  const [selectedScopeIds, setSelectedScopeIds] = useState<Set<number>>(
    new Set()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agreement combobox state
  const [agreementSearch, setAgreementSearch] = useState("");
  const [agreementOpen, setAgreementOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Scope tree expansion state
  const [expandedScopeIds, setExpandedScopeIds] = useState<Set<number>>(new Set());

  // Fetch employer linked to this agreement (both direct FK and agreement_employers)
  const { data: agreementEmployers = [] } = useQuery({
    queryKey: ["agreement-employers-for-dlg", selectedAgreementId],
    queryFn: async () => {
      const agId = Number(selectedAgreementId);

      const [directRes, junctionRes] = await Promise.all([
        supabase
          .from("agreements")
          .select("employer_id, employer:employers(employer_id, employer_name)")
          .eq("agreement_id", agId)
          .single(),
        supabase
          .from("agreement_employers")
          .select("employer_id, is_primary, employer:employers(employer_id, employer_name)")
          .eq("agreement_id", agId),
      ]);

      const results: { employer_id: number; employer_name: string; is_primary: boolean }[] =
        [];

      // Direct FK employer
      const direct = directRes.data as {
        employer_id: number | null;
        employer: { employer_id: number; employer_name: string } | null;
      } | null;
      if (direct?.employer_id && direct.employer) {
        results.push({
          employer_id: direct.employer_id,
          employer_name: direct.employer.employer_name,
          is_primary: true,
        });
      }

      // Junction table employers
      const junction = (junctionRes.data ?? []) as unknown as {
        employer_id: number;
        is_primary: boolean;
        employer: { employer_id: number; employer_name: string } | null;
      }[];
      for (const j of junction) {
        if (j.employer && !results.some((r) => r.employer_id === j.employer_id)) {
          results.push({
            employer_id: j.employer_id,
            employer_name: j.employer.employer_name,
            is_primary: j.is_primary,
          });
        }
      }

      return results;
    },
    enabled: !!selectedAgreementId,
  });

  // Fetch scopes linked to this agreement
  const { data: agreementScopes = [] } = useQuery({
    queryKey: ["agreement-scopes-for-dlg", selectedAgreementId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agreement_scopes")
        .select("scope_id")
        .eq("agreement_id", Number(selectedAgreementId));
      return (data ?? []).map((r: { scope_id: number }) => r.scope_id);
    },
    enabled: !!selectedAgreementId,
  });

  // Agreement combobox: close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setAgreementOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const availableAgreements = useMemo(
    () => allAgreements.filter((a) => !linkedAgreementIds.has(a.agreement_id)),
    [allAgreements, linkedAgreementIds]
  );

  const selectedAgreement = useMemo(
    () => availableAgreements.find((a) => String(a.agreement_id) === selectedAgreementId) ?? null,
    [availableAgreements, selectedAgreementId]
  );

  const filteredAgreements = useMemo(() => {
    const q = agreementSearch.toLowerCase().trim();
    if (!q) return availableAgreements;
    return availableAgreements.filter(
      (a) =>
        (a.agreement_name?.toLowerCase().includes(q)) ||
        (a.short_name?.toLowerCase().includes(q)) ||
        (a.decision_no?.toLowerCase().includes(q))
    );
  }, [agreementSearch, availableAgreements]);

  function agreementDisplayName(a: AgreementOption) {
    return `${a.short_name || a.agreement_name} (${a.decision_no})`;
  }

  // Scope tree: group by parent_scope_id for hierarchical rendering
  const scopeTree = useMemo(() => {
    const enriched = allScopes
      .filter((s) => !s.is_whole_of_project)
      .map((s) => ({
        ...s,
        linkedToAgreement: agreementScopes.includes(s.scope_id),
        alreadyOnSite: linkedScopeIds.has(s.scope_id),
      }));

    const byParent = new Map<number | null, typeof enriched>();
    for (const s of enriched) {
      const key = s.parent_scope_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(s);
    }

    return { enriched, byParent };
  }, [allScopes, agreementScopes, linkedScopeIds]);

  const toggleScopeExpand = (scopeId: number) => {
    setExpandedScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) next.delete(scopeId);
      else next.add(scopeId);
      return next;
    });
  };

  const toggleScope = (scopeId: number) => {
    setSelectedScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) next.delete(scopeId);
      else next.add(scopeId);
      return next;
    });
  };

  const canSave = !!selectedAgreementId;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const agId = Number(selectedAgreementId);

    // 1. Link agreement to worksite
    const { error: awErr } = await supabase
      .from("agreement_worksites")
      .insert({ agreement_id: agId, worksite_id: worksiteId });
    if (awErr) { setError(awErr.message); setSaving(false); return; }

    // 2. Optionally link employers
    if (linkEmployer) {
      for (const emp of agreementEmployers) {
        if (!employerRoleEmployerIds.has(emp.employer_id)) {
          await supabase.from("employer_worksite_roles").insert({
            employer_id: emp.employer_id,
            worksite_id: worksiteId,
            role_type: employerRoleType,
            is_current: true,
          });
        }
      }
    }

    // 3. Optionally link scopes (duplicates handled by DB unique constraint)
    for (const scopeId of selectedScopeIds) {
      await supabase.from("worksite_scopes").insert({
        worksite_id: worksiteId,
        scope_id: scopeId,
        is_current: true,
      });
    }

    setSaving(false);
    onSuccess();
    handleClose();
  };

  const handleClose = () => {
    setSelectedAgreementId("");
    setLinkEmployer(true);
    setEmployerRoleType("Subcontractor");
    setSelectedScopeIds(new Set());
    setAgreementSearch("");
    setAgreementOpen(false);
    setExpandedScopeIds(new Set());
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Link Agreement</DialogTitle>
          <DialogDescription>
            Associate an enterprise agreement with this worksite. Optionally also link the
            agreement&apos;s employer and any related work scopes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Step 1: Agreement (searchable combobox) */}
          <div className="space-y-2">
            <Label>
              Agreement <span className="text-destructive">*</span>
            </Label>
            <div ref={comboboxRef} className="relative">
              <div
                className="flex h-9 w-full cursor-text items-center rounded-md border border-input bg-background px-3 text-sm shadow-sm min-w-0"
                onClick={() => {
                  setAgreementOpen(true);
                  setAgreementSearch("");
                  setTimeout(() => searchInputRef.current?.focus(), 0);
                }}
              >
                {agreementOpen ? (
                  <input
                    ref={searchInputRef}
                    className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-0"
                    value={agreementSearch}
                    placeholder="Search agreements…"
                    onChange={(e) => setAgreementSearch(e.target.value)}
                    onFocus={() => setAgreementOpen(true)}
                  />
                ) : (
                  <span
                    className={selectedAgreement ? "flex-1 truncate" : "flex-1 text-muted-foreground"}
                    title={selectedAgreement ? agreementDisplayName(selectedAgreement) : undefined}
                  >
                    {selectedAgreement ? agreementDisplayName(selectedAgreement) : "Select agreement…"}
                  </span>
                )}
                {selectedAgreement && !agreementOpen && (
                  <button
                    type="button"
                    className="ml-1 rounded text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAgreementId("");
                      setAgreementSearch("");
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {agreementOpen && (
                <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {filteredAgreements.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">No agreements found.</p>
                  ) : (
                    filteredAgreements.map((a) => (
                      <button
                        key={a.agreement_id}
                        type="button"
                        className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                          String(a.agreement_id) === selectedAgreementId ? "bg-accent/50 font-medium" : ""
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedAgreementId(String(a.agreement_id));
                          setAgreementSearch("");
                          setAgreementOpen(false);
                        }}
                      >
                        {agreementDisplayName(a)}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Employer linking */}
          {selectedAgreementId && agreementEmployers.length > 0 && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="link-employer-check"
                  checked={linkEmployer}
                  onCheckedChange={(v) => setLinkEmployer(!!v)}
                />
                <Label htmlFor="link-employer-check" className="cursor-pointer font-normal">
                  Also link agreement&apos;s employer(s) to this worksite
                </Label>
              </div>

              {linkEmployer && (
                <div className="space-y-3 pl-6">
                  <div className="flex flex-wrap gap-2">
                    {agreementEmployers.map((e) => (
                      <div key={e.employer_id} className="flex items-center gap-1.5">
                        <span className="text-sm">{e.employer_name}</span>
                        {e.is_primary && (
                          <Badge variant="secondary" className="text-xs">primary</Badge>
                        )}
                        {employerRoleEmployerIds.has(e.employer_id) && (
                          <Badge variant="success" className="text-xs">already linked</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  {agreementEmployers.some(
                    (e) => !employerRoleEmployerIds.has(e.employer_id)
                  ) && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Role type</Label>
                      <Select
                        value={employerRoleType}
                        onValueChange={(v) => setEmployerRoleType(v as EmployerRoleType)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_TYPES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Work scopes (hierarchical tree) */}
          {selectedAgreementId && (
            <div className="space-y-2">
              <Label>Also add work scopes (optional)</Label>
              {scopeTree.enriched.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active scopes available.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-md border p-2">
                  <ScopeTreeLevel
                    parentId={null}
                    byParent={scopeTree.byParent}
                    depth={0}
                    selectedScopeIds={selectedScopeIds}
                    expandedScopeIds={expandedScopeIds}
                    onToggleScope={toggleScope}
                    onToggleExpand={toggleScopeExpand}
                  />
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "Linking..." : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Scope tree recursive renderer ──────────────────────────────────────────

type EnrichedScope = ScopeOption & {
  linkedToAgreement: boolean;
  alreadyOnSite: boolean;
};

function ScopeTreeLevel({
  parentId,
  byParent,
  depth,
  selectedScopeIds,
  expandedScopeIds,
  onToggleScope,
  onToggleExpand,
}: {
  parentId: number | null;
  byParent: Map<number | null, EnrichedScope[]>;
  depth: number;
  selectedScopeIds: Set<number>;
  expandedScopeIds: Set<number>;
  onToggleScope: (id: number) => void;
  onToggleExpand: (id: number) => void;
}) {
  const children = byParent.get(parentId);
  if (!children || children.length === 0) return null;

  return (
    <div className={depth > 0 ? "pl-5 border-l border-border/50" : undefined}>
      {children.map((s) => {
        const hasChildren = byParent.has(s.scope_id);
        const expanded = expandedScopeIds.has(s.scope_id);

        return (
          <div key={s.scope_id}>
            <div className="flex items-center gap-1.5 py-0.5">
              {hasChildren ? (
                <button
                  type="button"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent"
                  onClick={() => onToggleExpand(s.scope_id)}
                >
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <Checkbox
                id={`scope-${s.scope_id}`}
                checked={selectedScopeIds.has(s.scope_id)}
                onCheckedChange={() => onToggleScope(s.scope_id)}
              />
              <Label
                htmlFor={`scope-${s.scope_id}`}
                className="text-sm font-normal cursor-pointer"
              >
                {s.scope_name}
              </Label>
              {s.linkedToAgreement && (
                <Badge variant="secondary" className="text-xs ml-auto shrink-0">
                  in agreement
                </Badge>
              )}
              {s.alreadyOnSite && (
                <Badge variant="outline" className="text-xs ml-auto shrink-0">
                  on site
                </Badge>
              )}
            </div>
            {hasChildren && expanded && (
              <ScopeTreeLevel
                parentId={s.scope_id}
                byParent={byParent}
                depth={depth + 1}
                selectedScopeIds={selectedScopeIds}
                expandedScopeIds={expandedScopeIds}
                onToggleScope={onToggleScope}
                onToggleExpand={onToggleExpand}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
