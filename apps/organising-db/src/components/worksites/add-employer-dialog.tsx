"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Employer,
  Agreement,
  WorkScope,
  EmployerRoleType,
  EngagementType,
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

const ROLE_TYPES: EmployerRoleType[] = [
  "Owner",
  "Operator",
  "Principal_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Other",
];

const ENGAGEMENT_TYPES: EngagementType[] = [
  "direct_employment",
  "contractor",
  "subcontractor",
  "labour_hire",
];

type EmployerOption = Pick<Employer, "employer_id" | "employer_name" | "employer_category">;
type AgreementOption = Pick<
  Agreement,
  "agreement_id" | "agreement_name" | "short_name" | "decision_no" | "status"
>;
type ScopeOption = Pick<WorkScope, "scope_id" | "scope_name" | "is_whole_of_project"> & {
  parent?: { scope_name: string; parent?: { scope_name: string } };
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worksiteId: number;
  employerRoleEmployerIds: Set<number>;
  linkedAgreementIds: Set<number>;
  linkedScopeIds: Set<number>;
  allEmployers: EmployerOption[];
  allAgreements: AgreementOption[];
  allScopes: ScopeOption[];
  onSuccess: () => void;
}

export function AddEmployerDialog({
  open,
  onOpenChange,
  worksiteId,
  employerRoleEmployerIds,
  linkedAgreementIds,
  linkedScopeIds,
  allEmployers,
  allAgreements,
  allScopes,
  onSuccess,
}: Props) {
  const supabase = createClient();

  const [selectedEmployerId, setSelectedEmployerId] = useState("");
  const [roleType, setRoleType] = useState<EmployerRoleType>("Subcontractor");
  const [selectedAgreementId, setSelectedAgreementId] = useState("none");
  const [engagementType, setEngagementType] = useState<EngagementType>("contractor");
  const [selectedScopeIds, setSelectedScopeIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch agreements linked to this employer (via employer_id FK or agreement_employers)
  const { data: employerAgreements = [] } = useQuery({
    queryKey: ["employer-agreements-for-dlg", selectedEmployerId],
    queryFn: async () => {
      const empId = Number(selectedEmployerId);

      const [directRes, junctionRes] = await Promise.all([
        supabase
          .from("agreements")
          .select("agreement_id, agreement_name, short_name, decision_no, status")
          .eq("employer_id", empId),
        supabase
          .from("agreement_employers")
          .select("agreement_id, is_primary, agreement:agreements(agreement_id, agreement_name, short_name, decision_no, status)")
          .eq("employer_id", empId),
      ]);

      const seen = new Set<number>();
      const results: (AgreementOption & { is_primary: boolean; source: "direct" | "junction" })[] = [];

      for (const a of directRes.data ?? []) {
        if (!seen.has(a.agreement_id)) {
          seen.add(a.agreement_id);
          results.push({ ...a, is_primary: true, source: "direct" });
        }
      }

      for (const j of junctionRes.data ?? []) {
        const ag = (j as unknown as { agreement_id: number; is_primary: boolean; agreement: AgreementOption | null }).agreement;
        if (ag && !seen.has(ag.agreement_id)) {
          seen.add(ag.agreement_id);
          results.push({ ...ag, is_primary: (j as { is_primary: boolean }).is_primary, source: "junction" });
        }
      }

      return results;
    },
    enabled: !!selectedEmployerId,
  });

  // Fetch scopes linked to this employer
  const { data: employerScopeIds = [] } = useQuery({
    queryKey: ["employer-scopes-for-dlg", selectedEmployerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employer_scopes")
        .select("scope_id")
        .eq("employer_id", Number(selectedEmployerId));
      return (data ?? []).map((r: { scope_id: number }) => r.scope_id);
    },
    enabled: !!selectedEmployerId,
  });

  function scopeLabel(s: ScopeOption) {
    const parts: string[] = [];
    if (s.parent?.parent) parts.push(s.parent.parent.scope_name);
    if (s.parent) parts.push(s.parent.scope_name);
    parts.push(s.scope_name);
    return parts.join(" › ");
  }

  // Build employer options: already-on-site first, then others
  const employerOptions = [...allEmployers]
    .filter((e) => !employerRoleEmployerIds.has(e.employer_id))
    .map((e) => ({ ...e, onSite: false }))
    .concat(
      allEmployers
        .filter((e) => employerRoleEmployerIds.has(e.employer_id))
        .map((e) => ({ ...e, onSite: true }))
    )
    .sort((a, b) => {
      if (a.onSite !== b.onSite) return a.onSite ? 1 : -1; // not-yet-linked first
      return a.employer_name.localeCompare(b.employer_name);
    });

  // Build agreement options: employer's agreements first (if not already linked), then site agreements, then others
  const buildAgreementOptions = () => {
    type Row = AgreementOption & { groupLabel: string };
    const rows: Row[] = [];
    const seen = new Set<number>();

    for (const a of employerAgreements) {
      if (!linkedAgreementIds.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "employer" });
        seen.add(a.agreement_id);
      }
    }
    for (const a of allAgreements) {
      if (!seen.has(a.agreement_id) && linkedAgreementIds.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "site" });
        seen.add(a.agreement_id);
      }
    }
    for (const a of allAgreements) {
      if (!seen.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "all" });
        seen.add(a.agreement_id);
      }
    }
    return rows;
  };

  // Scope options: employer-linked scopes first, then others not already on worksite
  const scopeOptions = [...allScopes]
    .filter((s) => !s.is_whole_of_project)
    .map((s) => ({
      ...s,
      linkedToEmployer: employerScopeIds.includes(s.scope_id),
      alreadyOnSite: linkedScopeIds.has(s.scope_id),
    }))
    .sort((a, b) => {
      if (a.linkedToEmployer !== b.linkedToEmployer)
        return a.linkedToEmployer ? -1 : 1;
      return scopeLabel(a).localeCompare(scopeLabel(b));
    });

  const toggleScope = (scopeId: number) => {
    setSelectedScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) next.delete(scopeId);
      else next.add(scopeId);
      return next;
    });
  };

  const canSave = !!selectedEmployerId;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const empId = Number(selectedEmployerId);

    // 1. Add employer role (if not already on worksite)
    if (!employerRoleEmployerIds.has(empId)) {
      const { error: roleErr } = await supabase.from("employer_worksite_roles").insert({
        employer_id: empId,
        worksite_id: worksiteId,
        role_type: roleType,
        is_current: true,
      });
      if (roleErr) { setError(roleErr.message); setSaving(false); return; }
    }

    // 2. Link agreement if selected
    if (selectedAgreementId !== "none") {
      const agId = Number(selectedAgreementId);
      if (!linkedAgreementIds.has(agId)) {
        await supabase.from("agreement_worksites").insert({
          agreement_id: agId,
          worksite_id: worksiteId,
        });
      }
    }

    // 3. Add selected scopes
    for (const scopeId of selectedScopeIds) {
      if (!linkedScopeIds.has(scopeId)) {
        await supabase.from("worksite_scopes").insert({
          worksite_id: worksiteId,
          scope_id: scopeId,
          employer_id: empId,
          engagement_type: engagementType,
          is_current: true,
        });
      }
    }

    setSaving(false);
    onSuccess();
    handleClose();
  };

  const handleClose = () => {
    setSelectedEmployerId("");
    setRoleType("Subcontractor");
    setSelectedAgreementId("none");
    setEngagementType("contractor");
    setSelectedScopeIds(new Set());
    setError(null);
    onOpenChange(false);
  };

  const agreementOptions = buildAgreementOptions();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Employer</DialogTitle>
          <DialogDescription>
            Add an employer to this worksite. Optionally link an enterprise agreement and
            select work scopes performed by this employer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Step 1: Employer + role */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Employer <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedEmployerId} onValueChange={(v) => {
                setSelectedEmployerId(v);
                setSelectedAgreementId("none");
                setSelectedScopeIds(new Set());
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employer..." />
                </SelectTrigger>
                <SelectContent>
                  {employerOptions.map((e) => (
                    <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                      {e.employer_name}
                      {e.onSite ? " (already linked)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Role type</Label>
              <Select
                value={roleType}
                onValueChange={(v) => setRoleType(v as EmployerRoleType)}
              >
                <SelectTrigger>
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
          </div>

          {/* Step 2: Agreement */}
          {selectedEmployerId && (
            <div className="space-y-2">
              <Label>Enterprise agreement (optional)</Label>
              <Select value={selectedAgreementId} onValueChange={setSelectedAgreementId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agreement..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {agreementOptions.length > 0 && (
                    <>
                      {agreementOptions.filter((a) => a.groupLabel === "employer").length > 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                          Employer&apos;s agreements
                        </div>
                      )}
                      {agreementOptions
                        .filter((a) => a.groupLabel === "employer")
                        .map((a) => (
                          <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                            {a.short_name || a.agreement_name} ({a.decision_no})
                          </SelectItem>
                        ))}

                      {agreementOptions.filter((a) => a.groupLabel === "site").length > 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground font-medium mt-1">
                          Already on this worksite
                        </div>
                      )}
                      {agreementOptions
                        .filter((a) => a.groupLabel === "site")
                        .map((a) => (
                          <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                            {a.short_name || a.agreement_name} ({a.decision_no})
                          </SelectItem>
                        ))}

                      {agreementOptions.filter((a) => a.groupLabel === "all").length > 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground font-medium mt-1">
                          All agreements
                        </div>
                      )}
                      {agreementOptions
                        .filter((a) => a.groupLabel === "all")
                        .map((a) => (
                          <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                            {a.short_name || a.agreement_name} ({a.decision_no})
                          </SelectItem>
                        ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Step 3: Work scopes */}
          {selectedEmployerId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Work scopes for this employer (optional)</Label>
                {selectedScopeIds.size > 0 && (
                  <Badge variant="secondary">{selectedScopeIds.size} selected</Badge>
                )}
              </div>
              {selectedScopeIds.size > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Engagement type for selected scopes</Label>
                  <Select
                    value={engagementType}
                    onValueChange={(v) => setEngagementType(v as EngagementType)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENGAGEMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {scopeOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active scopes available.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                  {scopeOptions.map((s) => (
                    <div key={s.scope_id} className="flex items-center gap-2 py-0.5">
                      <Checkbox
                        id={`emp-scope-${s.scope_id}`}
                        checked={selectedScopeIds.has(s.scope_id)}
                        onCheckedChange={() => toggleScope(s.scope_id)}
                        disabled={s.alreadyOnSite}
                      />
                      <Label
                        htmlFor={`emp-scope-${s.scope_id}`}
                        className={`text-sm font-normal cursor-pointer flex-1 ${s.alreadyOnSite ? "text-muted-foreground line-through" : ""}`}
                      >
                        {scopeLabel(s)}
                      </Label>
                      {s.linkedToEmployer && !s.alreadyOnSite && (
                        <Badge variant="secondary" className="text-xs">
                          employer scope
                        </Badge>
                      )}
                      {s.alreadyOnSite && (
                        <Badge variant="success" className="text-xs">
                          on site
                        </Badge>
                      )}
                    </div>
                  ))}
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
            {saving ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
