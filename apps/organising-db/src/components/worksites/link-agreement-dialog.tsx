"use client";

import { useState } from "react";
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

type ScopeOption = Pick<WorkScope, "scope_id" | "scope_name" | "is_whole_of_project"> & {
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

  // Build scope label helper
  function scopeLabel(s: ScopeOption) {
    const parts: string[] = [];
    if (s.parent?.parent) parts.push(s.parent.parent.scope_name);
    if (s.parent) parts.push(s.parent.scope_name);
    parts.push(s.scope_name);
    return parts.join(" › ");
  }

  // Scopes to show: agreement-linked first, then others not already on worksite
  const scopeOptions = [...allScopes]
    .filter((s) => !s.is_whole_of_project)
    .map((s) => ({
      ...s,
      linkedToAgreement: agreementScopes.includes(s.scope_id),
      alreadyOnSite: linkedScopeIds.has(s.scope_id),
    }))
    .sort((a, b) => {
      if (a.linkedToAgreement !== b.linkedToAgreement)
        return a.linkedToAgreement ? -1 : 1;
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

    // 3. Optionally link scopes
    for (const scopeId of selectedScopeIds) {
      if (!linkedScopeIds.has(scopeId)) {
        await supabase.from("worksite_scopes").insert({
          worksite_id: worksiteId,
          scope_id: scopeId,
          is_current: true,
        });
      }
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
    setError(null);
    onOpenChange(false);
  };

  const availableAgreements = allAgreements.filter(
    (a) => !linkedAgreementIds.has(a.agreement_id)
  );

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
          {/* Step 1: Agreement */}
          <div className="space-y-2">
            <Label>
              Agreement <span className="text-destructive">*</span>
            </Label>
            <Select value={selectedAgreementId} onValueChange={setSelectedAgreementId}>
              <SelectTrigger>
                <SelectValue placeholder="Select agreement..." />
              </SelectTrigger>
              <SelectContent>
                {availableAgreements.map((a) => (
                  <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                    {a.short_name || a.agreement_name} ({a.decision_no})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {/* Step 3: Work scopes */}
          {selectedAgreementId && (
            <div className="space-y-2">
              <Label>Also add work scopes (optional)</Label>
              {scopeOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active scopes available.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                  {scopeOptions.map((s) => (
                    <div key={s.scope_id} className="flex items-center gap-2 py-0.5">
                      <Checkbox
                        id={`scope-${s.scope_id}`}
                        checked={selectedScopeIds.has(s.scope_id)}
                        onCheckedChange={() => toggleScope(s.scope_id)}
                        disabled={s.alreadyOnSite}
                      />
                      <Label
                        htmlFor={`scope-${s.scope_id}`}
                        className={`text-sm font-normal cursor-pointer ${s.alreadyOnSite ? "text-muted-foreground line-through" : ""}`}
                      >
                        {scopeLabel(s)}
                      </Label>
                      {s.linkedToAgreement && (
                        <Badge variant="secondary" className="text-xs ml-auto">
                          in agreement
                        </Badge>
                      )}
                      {s.alreadyOnSite && (
                        <Badge variant="success" className="text-xs ml-auto">
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
            {saving ? "Linking..." : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
