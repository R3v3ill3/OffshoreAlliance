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

export function AddScopeDialog({
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

  const [selectedScopeId, setSelectedScopeId] = useState("");
  const [selectedEmployerId, setSelectedEmployerId] = useState("none");
  const [roleType, setRoleType] = useState<EmployerRoleType>("Subcontractor");
  const [engagementType, setEngagementType] = useState<EngagementType>("contractor");
  const [selectedAgreementId, setSelectedAgreementId] = useState("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEmployer = selectedEmployerId !== "none" && !!selectedEmployerId;

  // Fetch agreements for selected employer
  const { data: employerAgreements = [] } = useQuery({
    queryKey: ["employer-agreements-for-scope-dlg", selectedEmployerId],
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
      const results: (AgreementOption & { groupLabel: "employer" })[] = [];

      for (const a of directRes.data ?? []) {
        if (!seen.has(a.agreement_id)) {
          seen.add(a.agreement_id);
          results.push({ ...a, groupLabel: "employer" });
        }
      }

      for (const j of junctionRes.data ?? []) {
        const ag = (j as unknown as { agreement_id: number; agreement: AgreementOption | null }).agreement;
        if (ag && !seen.has(ag.agreement_id)) {
          seen.add(ag.agreement_id);
          results.push({ ...ag, groupLabel: "employer" });
        }
      }

      return results;
    },
    enabled: hasEmployer,
  });

  function scopeLabel(s: ScopeOption) {
    const parts: string[] = [];
    if (s.parent?.parent) parts.push(s.parent.parent.scope_name);
    if (s.parent) parts.push(s.parent.scope_name);
    parts.push(s.scope_name);
    return parts.join(" › ");
  }

  // Scope options: filter out whole-of-project and already on site
  const scopeOptions = [...allScopes]
    .filter((s) => !s.is_whole_of_project)
    .map((s) => ({
      ...s,
      label: scopeLabel(s),
      alreadyOnSite: linkedScopeIds.has(s.scope_id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Employer options: site-linked first
  const employerOptions = [...allEmployers].sort((a, b) => {
    const aLinked = employerRoleEmployerIds.has(a.employer_id);
    const bLinked = employerRoleEmployerIds.has(b.employer_id);
    if (aLinked !== bLinked) return aLinked ? -1 : 1;
    return a.employer_name.localeCompare(b.employer_name);
  });

  // Agreement options: employer's agreements first (site-linked), then site agreements, then all
  const buildAgreementOptions = () => {
    type Row = AgreementOption & { groupLabel: string };
    const rows: Row[] = [];
    const seen = new Set<number>();

    // Employer's agreements
    for (const a of employerAgreements) {
      if (!seen.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: linkedAgreementIds.has(a.agreement_id) ? "employer-site" : "employer" });
        seen.add(a.agreement_id);
      }
    }
    // Site agreements not from employer
    for (const a of allAgreements) {
      if (!seen.has(a.agreement_id) && linkedAgreementIds.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "site" });
        seen.add(a.agreement_id);
      }
    }
    // All others
    for (const a of allAgreements) {
      if (!seen.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "all" });
        seen.add(a.agreement_id);
      }
    }
    return rows;
  };

  const canSave = !!selectedScopeId;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const scopeId = Number(selectedScopeId);
    const empId = hasEmployer ? Number(selectedEmployerId) : null;

    // 1. Add scope to worksite
    const payload: {
      worksite_id: number;
      scope_id: number;
      is_current: boolean;
      engagement_type: EngagementType;
      employer_id?: number;
    } = {
      worksite_id: worksiteId,
      scope_id: scopeId,
      is_current: true,
      engagement_type: engagementType,
    };
    if (empId) payload.employer_id = empId;

    const { error: scopeErr } = await supabase.from("worksite_scopes").insert(payload);
    if (scopeErr) { setError(scopeErr.message); setSaving(false); return; }

    // 2. Auto-link employer if not already on worksite
    if (empId && !employerRoleEmployerIds.has(empId)) {
      const { error: roleErr } = await supabase.from("employer_worksite_roles").insert({
        employer_id: empId,
        worksite_id: worksiteId,
        role_type: roleType,
        is_current: true,
      });
      if (roleErr) {
        // Non-fatal: scope was added successfully, just report the error
        setError(`Scope added, but employer link failed: ${roleErr.message}`);
        setSaving(false);
        onSuccess();
        handleClose();
        return;
      }
    }

    // 3. Link agreement if selected and not already linked
    if (selectedAgreementId !== "none") {
      const agId = Number(selectedAgreementId);
      if (!linkedAgreementIds.has(agId)) {
        await supabase.from("agreement_worksites").insert({
          agreement_id: agId,
          worksite_id: worksiteId,
        });
      }
    }

    setSaving(false);
    onSuccess();
    handleClose();
  };

  const handleClose = () => {
    setSelectedScopeId("");
    setSelectedEmployerId("none");
    setRoleType("Subcontractor");
    setEngagementType("contractor");
    setSelectedAgreementId("none");
    setError(null);
    onOpenChange(false);
  };

  const agreementOptions = buildAgreementOptions();
  const employerAlreadyOnSite = hasEmployer && employerRoleEmployerIds.has(Number(selectedEmployerId));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Work Scope</DialogTitle>
          <DialogDescription>
            Assign a work scope to this worksite. Optionally link an employer performing this
            work and an applicable enterprise agreement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Step 1: Scope */}
          <div className="space-y-2">
            <Label>
              Work scope <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedScopeId}
              onValueChange={(v) => {
                setSelectedScopeId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select scope..." />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((s) => (
                  <SelectItem
                    key={s.scope_id}
                    value={String(s.scope_id)}
                    disabled={s.alreadyOnSite}
                  >
                    {s.label}
                    {s.alreadyOnSite ? " (already on site)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Engagement type */}
          <div className="space-y-2">
            <Label>Engagement type</Label>
            <Select
              value={engagementType}
              onValueChange={(v) => setEngagementType(v as EngagementType)}
            >
              <SelectTrigger>
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

          {/* Step 2: Employer */}
          {selectedScopeId && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Employer (optional)</Label>
                <Select
                  value={selectedEmployerId}
                  onValueChange={(v) => {
                    setSelectedEmployerId(v);
                    setSelectedAgreementId("none");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {employerOptions.map((e) => (
                      <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                        {e.employer_name}
                        {employerRoleEmployerIds.has(e.employer_id) ? " ★" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasEmployer && !employerAlreadyOnSite && (
                  <p className="text-xs text-muted-foreground">
                    This employer will be automatically linked to the worksite.
                  </p>
                )}
              </div>

              {hasEmployer && !employerAlreadyOnSite && (
                <div className="space-y-2">
                  <Label>Employer role type</Label>
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
              )}
            </div>
          )}

          {/* Step 3: Agreement */}
          {selectedScopeId && hasEmployer && (
            <div className="space-y-2">
              <Label>Enterprise agreement (optional)</Label>
              <Select value={selectedAgreementId} onValueChange={setSelectedAgreementId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>

                  {agreementOptions.filter((a) =>
                    a.groupLabel === "employer" || a.groupLabel === "employer-site"
                  ).length > 0 && (
                    <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                      Employer&apos;s agreements
                    </div>
                  )}
                  {agreementOptions
                    .filter((a) => a.groupLabel === "employer" || a.groupLabel === "employer-site")
                    .map((a) => (
                      <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                        {a.short_name || a.agreement_name} ({a.decision_no})
                        {a.groupLabel === "employer-site" ? " ★" : ""}
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
                </SelectContent>
              </Select>
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
