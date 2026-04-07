"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";

interface BatchEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerIds: number[];
  onComplete: () => void;
}

interface FieldUpdate {
  enabled: boolean;
  value: string;
}

const INITIAL_FIELDS: Record<string, FieldUpdate> = {
  union_membership_type_id: { enabled: false, value: "" },
  member_role_type_id: { enabled: false, value: "" },
  employer_id: { enabled: false, value: "" },
  worksite_id: { enabled: false, value: "" },
  canonical_occupation_id: { enabled: false, value: "" },
  is_active: { enabled: false, value: "" },
  is_hsr: { enabled: false, value: "" },
  add_agreement_id: { enabled: false, value: "" },
};

export function BatchEditDialog({
  open,
  onOpenChange,
  workerIds,
  onComplete,
}: BatchEditDialogProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const [fields, setFields] = useState<Record<string, FieldUpdate>>({ ...INITIAL_FIELDS });
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: employers = [] } = useQuery({
    queryKey: ["batch-edit-employers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .order("employer_name");
      return data ?? [];
    },
    enabled: !!user && open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: worksites = [] } = useQuery({
    queryKey: ["batch-edit-worksites"],
    queryFn: async () => {
      const { data } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .order("worksite_name");
      return data ?? [];
    },
    enabled: !!user && open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: membershipTypes = [] } = useQuery({
    queryKey: ["batch-edit-membership-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("union_membership_types")
        .select("union_membership_type_id, display_name")
        .order("display_name");
      return data ?? [];
    },
    enabled: !!user && open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: roleTypes = [] } = useQuery({
    queryKey: ["batch-edit-role-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("member_role_types")
        .select("role_type_id, display_name")
        .order("display_name");
      return data ?? [];
    },
    enabled: !!user && open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: occupations = [] } = useQuery({
    queryKey: ["batch-edit-occupations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("occupations")
        .select("occupation_id, canonical_name")
        .order("canonical_name");
      return data ?? [];
    },
    enabled: !!user && open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: agreements = [] } = useQuery({
    queryKey: ["batch-edit-agreements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agreements")
        .select("agreement_id, agreement_name")
        .order("agreement_name");
      return data ?? [];
    },
    enabled: !!user && open,
    staleTime: 5 * 60 * 1000,
  });

  const updateField = useCallback(
    (key: string, patch: Partial<FieldUpdate>) => {
      setFields((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...patch },
      }));
    },
    []
  );

  const enabledFields = Object.entries(fields).filter(([, f]) => f.enabled && f.value !== "");

  const resetAndClose = useCallback(() => {
    setFields({ ...INITIAL_FIELDS });
    setConfirming(false);
    setSubmitting(false);
    setError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/workers/batch-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_ids: workerIds,
          updates: buildUpdates(),
          agreement_updates: buildAgreementUpdates(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      onComplete();
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  };

  const buildUpdates = () => {
    const updates: Record<string, unknown> = {};
    for (const [key, f] of Object.entries(fields)) {
      if (!f.enabled || !f.value || key === "add_agreement_id") continue;
      if (key === "is_active" || key === "is_hsr") {
        updates[key] = f.value === "true";
      } else {
        updates[key] = Number(f.value);
      }
    }
    return Object.keys(updates).length > 0 ? updates : undefined;
  };

  const buildAgreementUpdates = () => {
    const agr = fields.add_agreement_id;
    if (!agr.enabled || !agr.value) return undefined;
    return { add_agreement_ids: [Number(agr.value)] };
  };

  const fieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      union_membership_type_id: "Membership Status",
      member_role_type_id: "Organising Role",
      employer_id: "Employer",
      worksite_id: "Worksite",
      canonical_occupation_id: "Occupation",
      is_active: "Active Status",
      is_hsr: "HSR Status",
      add_agreement_id: "Enterprise Agreement",
    };
    return labels[key] ?? key;
  };

  const summaryLabel = (key: string, value: string): string => {
    const find = <T extends Record<string, unknown>>(arr: T[], idKey: string, val: number, nameKey: string) => {
      const item = arr.find((x) => x[idKey] === val);
      return item ? String(item[nameKey]) : String(val);
    };
    const numVal = Number(value);

    switch (key) {
      case "employer_id":
        return find(employers, "employer_id", numVal, "employer_name");
      case "worksite_id":
        return find(worksites, "worksite_id", numVal, "worksite_name");
      case "union_membership_type_id":
        return find(membershipTypes, "union_membership_type_id", numVal, "display_name");
      case "member_role_type_id":
        return find(roleTypes, "role_type_id", numVal, "display_name");
      case "canonical_occupation_id":
        return find(occupations, "occupation_id", numVal, "canonical_name");
      case "add_agreement_id":
        return find(agreements, "agreement_id", numVal, "agreement_name");
      case "is_active":
        return value === "true" ? "Active" : "Inactive";
      case "is_hsr":
        return value === "true" ? "Yes" : "No";
      default:
        return value;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : resetAndClose())}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Batch Edit {workerIds.length} Worker{workerIds.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Select which fields to update. Only checked fields will be changed.
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Confirm batch update</p>
                <p className="text-muted-foreground mt-1">
                  You are about to update {workerIds.length} worker{workerIds.length !== 1 ? "s" : ""}.
                  The following fields will be changed:
                </p>
                <ul className="mt-2 space-y-1">
                  {enabledFields.map(([key, f]) => (
                    <li key={key} className="flex gap-2">
                      <span className="font-medium">{fieldLabel(key)}:</span>
                      <span>{summaryLabel(key, f.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <FieldRow
              fieldKey="union_membership_type_id"
              label="Membership Status"
              fields={fields}
              onUpdate={updateField}
            >
              <Select
                value={fields.union_membership_type_id.value}
                onValueChange={(v) => updateField("union_membership_type_id", { value: v })}
                disabled={!fields.union_membership_type_id.enabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {membershipTypes.map((m: { union_membership_type_id: number; display_name: string }) => (
                    <SelectItem key={m.union_membership_type_id} value={String(m.union_membership_type_id)}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            <FieldRow
              fieldKey="member_role_type_id"
              label="Organising Role"
              fields={fields}
              onUpdate={updateField}
            >
              <Select
                value={fields.member_role_type_id.value}
                onValueChange={(v) => updateField("member_role_type_id", { value: v })}
                disabled={!fields.member_role_type_id.enabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roleTypes.map((r: { role_type_id: number; display_name: string }) => (
                    <SelectItem key={r.role_type_id} value={String(r.role_type_id)}>
                      {r.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            <FieldRow
              fieldKey="employer_id"
              label="Employer"
              fields={fields}
              onUpdate={updateField}
            >
              <Select
                value={fields.employer_id.value}
                onValueChange={(v) => updateField("employer_id", { value: v })}
                disabled={!fields.employer_id.enabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select employer" />
                </SelectTrigger>
                <SelectContent>
                  {employers.map((e: { employer_id: number; employer_name: string }) => (
                    <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                      {e.employer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            <FieldRow
              fieldKey="worksite_id"
              label="Worksite"
              fields={fields}
              onUpdate={updateField}
            >
              <Select
                value={fields.worksite_id.value}
                onValueChange={(v) => updateField("worksite_id", { value: v })}
                disabled={!fields.worksite_id.enabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select worksite" />
                </SelectTrigger>
                <SelectContent>
                  {worksites.map((w: { worksite_id: number; worksite_name: string }) => (
                    <SelectItem key={w.worksite_id} value={String(w.worksite_id)}>
                      {w.worksite_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            <FieldRow
              fieldKey="canonical_occupation_id"
              label="Occupation"
              fields={fields}
              onUpdate={updateField}
            >
              <Select
                value={fields.canonical_occupation_id.value}
                onValueChange={(v) => updateField("canonical_occupation_id", { value: v })}
                disabled={!fields.canonical_occupation_id.enabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select occupation" />
                </SelectTrigger>
                <SelectContent>
                  {occupations.map((o: { occupation_id: number; canonical_name: string }) => (
                    <SelectItem key={o.occupation_id} value={String(o.occupation_id)}>
                      {o.canonical_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            <FieldRow
              fieldKey="add_agreement_id"
              label="Enterprise Agreement"
              fields={fields}
              onUpdate={updateField}
            >
              <Select
                value={fields.add_agreement_id.value}
                onValueChange={(v) => updateField("add_agreement_id", { value: v })}
                disabled={!fields.add_agreement_id.enabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select agreement" />
                </SelectTrigger>
                <SelectContent>
                  {agreements.map((a: { agreement_id: number; agreement_name: string }) => (
                    <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                      {a.agreement_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            <FieldRow
              fieldKey="is_active"
              label="Active Status"
              fields={fields}
              onUpdate={updateField}
            >
              <Select
                value={fields.is_active.value}
                onValueChange={(v) => updateField("is_active", { value: v })}
                disabled={!fields.is_active.enabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>

            <FieldRow
              fieldKey="is_hsr"
              label="HSR"
              fields={fields}
              onUpdate={updateField}
            >
              <Select
                value={fields.is_hsr.value}
                onValueChange={(v) => updateField("is_hsr", { value: v })}
                disabled={!fields.is_hsr.enabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={submitting}>
            Cancel
          </Button>
          {confirming && (
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
              Back
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={enabledFields.length === 0 || submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {confirming ? "Apply Changes" : "Review Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  fieldKey,
  label,
  fields,
  onUpdate,
  children,
}: {
  fieldKey: string;
  label: string;
  fields: Record<string, FieldUpdate>;
  onUpdate: (key: string, patch: Partial<FieldUpdate>) => void;
  children: React.ReactNode;
}) {
  const field = fields[fieldKey];
  return (
    <div className="flex items-center gap-3">
      <Checkbox
        checked={field.enabled}
        onCheckedChange={(c) =>
          onUpdate(fieldKey, { enabled: c === true, ...(c === true ? {} : { value: "" }) })
        }
        id={`batch-${fieldKey}`}
      />
      <Label
        htmlFor={`batch-${fieldKey}`}
        className="w-36 text-sm shrink-0 cursor-pointer"
      >
        {label}
      </Label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
