"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Agreement,
  Employer,
  EmployerWorksiteRole,
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worksiteId: number;
  role: (EmployerWorksiteRole & { employer?: Employer }) | null;
  linkedAgreementIds: Set<number>;
  allAgreements: AgreementOption[];
  onSuccess: () => void;
}

export function EditEmployerRoleDialog({
  open,
  onOpenChange,
  role,
  linkedAgreementIds,
  allAgreements,
  onSuccess,
}: Props) {
  const supabase = createClient();

  const [roleType, setRoleType] = useState<EmployerRoleType>("Subcontractor");
  const [isCurrent, setIsCurrent] = useState(true);
  const [selectedAgreementId, setSelectedAgreementId] = useState("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form state when the role being edited changes
  useEffect(() => {
    if (role) {
      setRoleType(role.role_type as EmployerRoleType);
      setIsCurrent(role.is_current);
      setSelectedAgreementId("none");
      setError(null);
    }
  }, [role]);

  // Fetch agreements linked to this employer
  const { data: employerAgreements = [] } = useQuery({
    queryKey: ["employer-agreements-for-edit-dlg", role?.employer_id],
    queryFn: async () => {
      const empId = role!.employer_id;

      const [directRes, junctionRes] = await Promise.all([
        supabase
          .from("agreements")
          .select("agreement_id, agreement_name, short_name, decision_no, status")
          .eq("employer_id", empId),
        supabase
          .from("agreement_employers")
          .select(
            "agreement_id, is_primary, agreement:agreements(agreement_id, agreement_name, short_name, decision_no, status)"
          )
          .eq("employer_id", empId),
      ]);

      const seen = new Set<number>();
      const results: AgreementOption[] = [];

      for (const a of directRes.data ?? []) {
        if (!seen.has(a.agreement_id)) {
          seen.add(a.agreement_id);
          results.push(a);
        }
      }

      for (const j of junctionRes.data ?? []) {
        const ag = (
          j as unknown as { agreement: AgreementOption | null }
        ).agreement;
        if (ag && !seen.has(ag.agreement_id)) {
          seen.add(ag.agreement_id);
          results.push(ag);
        }
      }

      return results;
    },
    enabled: open && !!role?.employer_id,
  });

  // Build grouped agreement options
  const buildAgreementOptions = () => {
    type Row = AgreementOption & { groupLabel: string };
    const rows: Row[] = [];
    const seen = new Set<number>();

    // Employer's agreements not yet on worksite — link both
    for (const a of employerAgreements) {
      if (!linkedAgreementIds.has(a.agreement_id) && !seen.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "employer-new" });
        seen.add(a.agreement_id);
      }
    }
    // Employer's agreements already on worksite — informational only, still selectable
    for (const a of employerAgreements) {
      if (linkedAgreementIds.has(a.agreement_id) && !seen.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "employer-site" });
        seen.add(a.agreement_id);
      }
    }
    // Other site agreements
    for (const a of allAgreements) {
      if (linkedAgreementIds.has(a.agreement_id) && !seen.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "site" });
        seen.add(a.agreement_id);
      }
    }
    // All remaining agreements
    for (const a of allAgreements) {
      if (!seen.has(a.agreement_id)) {
        rows.push({ ...a, groupLabel: "all" });
        seen.add(a.agreement_id);
      }
    }
    return rows;
  };

  const handleSave = async () => {
    if (!role) return;
    setSaving(true);
    setError(null);

    // Update role type and is_current
    const { error: updateErr } = await supabase
      .from("employer_worksite_roles")
      .update({ role_type: roleType, is_current: isCurrent })
      .eq("id", role.id);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    // Link agreement to worksite if selected and not already linked
    if (selectedAgreementId !== "none") {
      const agId = Number(selectedAgreementId);
      if (!linkedAgreementIds.has(agId)) {
        const { error: awErr } = await supabase.from("agreement_worksites").insert({
          agreement_id: agId,
          worksite_id: role.worksite_id,
        });
        if (awErr) {
          setError(awErr.message);
          setSaving(false);
          return;
        }
      }
    }

    setSaving(false);
    onSuccess();
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedAgreementId("none");
    setError(null);
    onOpenChange(false);
  };

  if (!role) return null;

  const agreementOptions = buildAgreementOptions();
  const employerName = role.employer?.employer_name ?? `Employer #${role.employer_id}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Employer Role</DialogTitle>
          <DialogDescription>
            Update the role and status of <strong>{employerName}</strong> at this worksite,
            or link an enterprise agreement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Role type */}
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

          {/* Is current */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-role-is-current"
              checked={isCurrent}
              onCheckedChange={(v) => setIsCurrent(!!v)}
            />
            <Label htmlFor="edit-role-is-current" className="cursor-pointer font-normal">
              Currently active at this worksite
            </Label>
          </div>

          {/* Link agreement */}
          <div className="space-y-2">
            <Label>Link an enterprise agreement (optional)</Label>
            <Select value={selectedAgreementId} onValueChange={setSelectedAgreementId}>
              <SelectTrigger>
                <SelectValue placeholder="Select agreement..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>

                {agreementOptions.filter((a) => a.groupLabel === "employer-new").length > 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                    Employer&apos;s agreements — not yet on this worksite
                  </div>
                )}
                {agreementOptions
                  .filter((a) => a.groupLabel === "employer-new")
                  .map((a) => (
                    <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                      {a.short_name || a.agreement_name} ({a.decision_no})
                    </SelectItem>
                  ))}

                {agreementOptions.filter((a) => a.groupLabel === "employer-site").length > 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium mt-1">
                    Employer&apos;s agreements — already on this worksite
                  </div>
                )}
                {agreementOptions
                  .filter((a) => a.groupLabel === "employer-site")
                  .map((a) => (
                    <SelectItem key={a.agreement_id} value={String(a.agreement_id)} disabled>
                      {a.short_name || a.agreement_name} ({a.decision_no})
                    </SelectItem>
                  ))}

                {agreementOptions.filter((a) => a.groupLabel === "site").length > 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium mt-1">
                    Other agreements on this worksite
                  </div>
                )}
                {agreementOptions
                  .filter((a) => a.groupLabel === "site")
                  .map((a) => (
                    <SelectItem key={a.agreement_id} value={String(a.agreement_id)} disabled>
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
            {selectedAgreementId !== "none" && !linkedAgreementIds.has(Number(selectedAgreementId)) && (
              <p className="text-xs text-muted-foreground">
                This agreement will be linked to the worksite.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
