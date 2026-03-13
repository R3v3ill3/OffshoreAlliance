"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type { Worksite, Employer, WorksiteType } from "@/types/database";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

const WORKSITE_TYPES: WorksiteType[] = [
  "FPSO",
  "FLNG",
  "Platform",
  "Onshore_LNG",
  "Gas_Plant",
  "Hub",
  "Drill_Centre",
  "Region",
  "Heliport",
  "Pipeline",
  "Airfield",
  "Onshore_Facilities",
  "CPF",
  "Gas_Field",
  "Other",
];

type EmployerRole = {
  role_type: string;
  employer?: { employer_id: number; employer_name: string };
};

type WorksiteRow = Worksite & {
  operator?: { employer_name: string };
  principal_employer?: { employer_name: string };
  agreement_worksites?: { agreement_id: number }[];
  employer_worksite_roles?: EmployerRole[];
} & Record<string, unknown>;

const INITIAL_FORM = {
  worksite_name: "",
  worksite_type: "" as string,
  operator_id: "" as string,
  principal_employer_id: "" as string,
  location_description: "",
  latitude: "",
  longitude: "",
  basin: "",
  is_offshore: false,
  is_active: true,
};

export default function WorksitesPage() {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { canWrite } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: worksites = [], isLoading, isError } = useQuery({
    queryKey: ["worksites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select(`
          *,
          operator:employers!operator_id(employer_name),
          principal_employer:employers!principal_employer_id(employer_name),
          agreement_worksites(agreement_id),
          employer_worksite_roles(
            role_type,
            employer:employers(employer_id, employer_name)
          )
        `)
        .order("worksite_name");
      if (error) throw error;
      return data as WorksiteRow[];
    },
  });

  const { data: employers = [] } = useQuery({
    queryKey: ["employers-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name, employer_category")
        .order("employer_name");
      if (error) throw error;
      return data as Pick<Employer, "employer_id" | "employer_name" | "employer_category">[];
    },
  });

  const principalEmployers = useMemo(
    () => employers.filter((e) => e.employer_category === "Principal_Employer"),
    [employers]
  );

  const columns: Column<WorksiteRow>[] = useMemo(
    () => [
      { key: "worksite_name", header: "Name" },
      {
        key: "worksite_type",
        header: "Type",
        render: (item) => (
          <Badge variant="secondary">
            {item.worksite_type.replace(/_/g, " ")}
          </Badge>
        ),
      },
      {
        key: "principal_employer",
        header: "Principal Employer",
        render: (item) => {
          const pe = item as WorksiteRow & {
            principal_employer?: { employer_name: string };
          };
          return pe.principal_employer?.employer_name ? (
            <Badge variant="warning">{pe.principal_employer.employer_name}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        key: "employers",
        header: "Employers",
        render: (item) => {
          const roles = item.employer_worksite_roles ?? [];
          const uniqueNames = [
            ...new Map(
              roles
                .filter((r) => r.employer?.employer_name)
                .map((r) => [r.employer!.employer_id, r.employer!.employer_name])
            ).values(),
          ];
          if (uniqueNames.length === 0) {
            return <span className="text-muted-foreground">{item.operator?.employer_name ?? "—"}</span>;
          }
          const [first, ...rest] = uniqueNames;
          return (
            <span className="flex items-center gap-1.5">
              <span className="truncate max-w-[180px]" title={first}>{first}</span>
              {rest.length > 0 && (
                <Badge variant="secondary">+{rest.length}</Badge>
              )}
            </span>
          );
        },
      },
      {
        key: "agreement_count",
        header: "Agreements",
        render: (item) => {
          const count = item.agreement_worksites?.length ?? 0;
          return count === 0
            ? <span className="text-muted-foreground">—</span>
            : <Badge variant="secondary">{count}</Badge>;
        },
      },
      { key: "location_description", header: "Location" },
      { key: "basin", header: "Basin" },
      {
        key: "is_offshore",
        header: "Offshore",
        render: (item) => (
          <Badge variant={item.is_offshore ? "info" : "secondary"}>
            {item.is_offshore ? "Yes" : "No"}
          </Badge>
        ),
      },
      {
        key: "is_active",
        header: "Active",
        render: (item) => (
          <Badge variant={item.is_active ? "success" : "destructive"}>
            {item.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    []
  );

  const handleFieldChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetDialog = () => {
    setForm(INITIAL_FORM);
    setError(null);
    setSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.worksite_name.trim()) {
      setError("Worksite name is required.");
      return;
    }
    if (!form.worksite_type) {
      setError("Worksite type is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      worksite_name: form.worksite_name.trim(),
      worksite_type: form.worksite_type,
      is_offshore: form.is_offshore,
      is_active: form.is_active,
    };
    if (form.operator_id) payload.operator_id = Number(form.operator_id);
    if (form.principal_employer_id)
      payload.principal_employer_id = Number(form.principal_employer_id);
    if (form.location_description)
      payload.location_description = form.location_description.trim();
    if (form.latitude) payload.latitude = parseFloat(form.latitude);
    if (form.longitude) payload.longitude = parseFloat(form.longitude);
    if (form.basin) payload.basin = form.basin.trim();

    const { error: insertError } = await supabase
      .from("worksites")
      .insert(payload);

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["worksites"] });
    setDialogOpen(false);
    resetDialog();
  };

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">
          Failed to load worksites. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Worksites</h1>
          <p className="text-muted-foreground">
            Manage offshore and onshore worksites.
          </p>
        </div>
        {canWrite && (
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetDialog();
            }}
          >
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Worksite
            </Button>
            <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Worksite</DialogTitle>
                <DialogDescription>
                  Create a new worksite record.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="worksite_name">
                      Worksite Name{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="worksite_name"
                      value={form.worksite_name}
                      onChange={(e) =>
                        handleFieldChange("worksite_name", e.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="worksite_type">
                      Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={form.worksite_type}
                      onValueChange={(v) =>
                        handleFieldChange("worksite_type", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKSITE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="principal_employer_id">Principal Employer</Label>
                    <Select
                      value={form.principal_employer_id}
                      onValueChange={(v) =>
                        handleFieldChange("principal_employer_id", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select principal employer" />
                      </SelectTrigger>
                      <SelectContent>
                        {principalEmployers.map((emp) => (
                          <SelectItem
                            key={emp.employer_id}
                            value={String(emp.employer_id)}
                          >
                            {emp.employer_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="operator_id">Operator</Label>
                    <Select
                      value={form.operator_id}
                      onValueChange={(v) =>
                        handleFieldChange("operator_id", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {employers.map((emp) => (
                          <SelectItem
                            key={emp.employer_id}
                            value={String(emp.employer_id)}
                          >
                            {emp.employer_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="basin">Basin</Label>
                    <Input
                      id="basin"
                      value={form.basin}
                      onChange={(e) =>
                        handleFieldChange("basin", e.target.value)
                      }
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2 space-y-2">
                    <Label htmlFor="location_description">
                      Location Description
                    </Label>
                    <Input
                      id="location_description"
                      value={form.location_description}
                      onChange={(e) =>
                        handleFieldChange(
                          "location_description",
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) =>
                        handleFieldChange("latitude", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) =>
                        handleFieldChange("longitude", e.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <input
                      id="is_offshore"
                      type="checkbox"
                      checked={form.is_offshore}
                      onChange={(e) =>
                        handleFieldChange("is_offshore", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="is_offshore">Offshore</Label>
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <input
                      id="is_active"
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) =>
                        handleFieldChange("is_active", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="is_active">Active</Label>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : "Save Worksite"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <DataTable
        data={worksites}
        columns={columns}
        searchPlaceholder="Search worksites..."
        searchKeys={["worksite_name", "location_description"]}
        onRowClick={(item) =>
          router.push(`/worksites/${item.worksite_id}`)
        }
        loading={isLoading}
      />
    </div>
  );
}
