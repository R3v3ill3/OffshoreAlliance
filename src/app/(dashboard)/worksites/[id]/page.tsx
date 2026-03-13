"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type {
  Worksite,
  Employer,
  Agreement,
  Worker,
  EmployerWorksiteRole,
  WorksiteType,
} from "@/types/database";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Pencil, X, Save, Star } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { format } from "date-fns";

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

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

type AgreementRow = Agreement & Record<string, unknown>;
type EmployerRoleRow = EmployerWorksiteRole & {
  employer?: Employer;
} & Record<string, unknown>;
type WorkerRow = Worker & Record<string, unknown>;

type WorksiteWithJoins = Worksite & {
  operator?: { employer_id: number; employer_name: string };
  principal_employer?: { employer_id: number; employer_name: string };
};

export default function WorksiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { canWrite } = useAuth();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Worksite>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    data: worksite,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["worksite", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select(
          "*, operator:employers!operator_id(employer_id, employer_name), principal_employer:employers!principal_employer_id(employer_id, employer_name)"
        )
        .eq("worksite_id", id)
        .single();
      if (error) throw error;
      return data as WorksiteWithJoins;
    },
    enabled: !!id,
  });

  // All principal employers for the edit selector
  const { data: principalEmployers = [] } = useQuery({
    queryKey: ["principal-employers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .eq("employer_category", "Principal_Employer")
        .order("employer_name");
      if (error) throw error;
      return data as Pick<Employer, "employer_id" | "employer_name">[];
    },
  });

  const { data: agreementWorksites = [] } = useQuery({
    queryKey: ["worksite-agreements", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreement_worksites")
        .select("*, agreement:agreements(*)")
        .eq("worksite_id", id);
      if (error) throw error;
      return data as { agreement?: Agreement }[];
    },
    enabled: !!id,
  });

  const agreements = useMemo(
    () =>
      agreementWorksites
        .map((aw) => aw.agreement)
        .filter((a): a is Agreement => !!a),
    [agreementWorksites]
  );

  const { data: employerRoles = [] } = useQuery({
    queryKey: ["worksite-employer-roles", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_worksite_roles")
        .select("*, employer:employers(*)")
        .eq("worksite_id", id);
      if (error) throw error;
      return data as (EmployerWorksiteRole & { employer?: Employer })[];
    },
    enabled: !!id,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["worksite-workers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*, employer:employers(employer_name)")
        .eq("worksite_id", id)
        .order("last_name");
      if (error) throw error;
      return data as (Worker & { employer?: { employer_name: string } })[];
    },
    enabled: !!id,
  });

  const startEditing = () => {
    if (!worksite) return;
    setEditForm({ ...worksite });
    setEditing(true);
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm({});
    setSaveError(null);
  };

  const handleEditChange = (
    field: keyof Worksite,
    value: string | number | boolean | null
  ) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdits = async () => {
    if (!worksite) return;
    setSaving(true);
    setSaveError(null);

    const { error } = await supabase
      .from("worksites")
      .update(editForm)
      .eq("worksite_id", worksite.worksite_id);

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["worksite", id] });
    setEditing(false);
    setEditForm({});
    setSaving(false);
  };

  const agreementColumns: Column<AgreementRow>[] = useMemo(
    () => [
      { key: "decision_no", header: "Decision No" },
      { key: "agreement_name", header: "Agreement Name" },
      {
        key: "status",
        header: "Status",
        render: (item) => {
          const variant =
            item.status === "Current"
              ? "success"
              : item.status === "Expired"
                ? "destructive"
                : item.status === "Under_Negotiation"
                  ? "warning"
                  : "secondary";
          return (
            <Badge variant={variant}>
              {item.status.replace(/_/g, " ")}
            </Badge>
          );
        },
      },
      {
        key: "expiry_date",
        header: "Expiry Date",
        render: (item) => formatDate(item.expiry_date),
      },
    ],
    []
  );

  const employerRoleColumns: Column<EmployerRoleRow>[] = useMemo(
    () => [
      {
        key: "employer_name",
        header: "Employer",
        render: (item) => item.employer?.employer_name ?? "—",
      },
      {
        key: "role_type",
        header: "Role",
        render: (item) => (
          <Badge variant="secondary">{item.role_type.replace(/_/g, " ")}</Badge>
        ),
      },
      {
        key: "is_current",
        header: "Current",
        render: (item) => (
          <Badge variant={item.is_current ? "success" : "secondary"}>
            {item.is_current ? "Yes" : "No"}
          </Badge>
        ),
      },
    ],
    []
  );

  const workerColumns: Column<WorkerRow>[] = useMemo(
    () => [
      {
        key: "last_name",
        header: "Name",
        render: (item) => `${item.first_name} ${item.last_name}`,
      },
      { key: "occupation", header: "Role" },
      {
        key: "employer_name",
        header: "Employer",
        render: (item) => {
          const w = item as WorkerRow & {
            employer?: { employer_name: string };
          };
          return w.employer?.employer_name ?? "—";
        },
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !worksite) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">
          Worksite not found or failed to load.
        </p>
        <Button variant="outline" onClick={() => router.push("/worksites")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Worksites
        </Button>
      </div>
    );
  }

  const renderField = (
    field: keyof Worksite,
    label: string,
    type: "text" | "select" | "number" | "checkbox" = "text"
  ) => {
    if (editing) {
      if (field === "worksite_type") {
        return (
          <div>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="mt-1">
              <Select
                value={(editForm.worksite_type as string) ?? ""}
                onValueChange={(v) =>
                  handleEditChange("worksite_type", v as WorksiteType)
                }
              >
                <SelectTrigger className="h-8">
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
          </div>
        );
      }
      if (field === "principal_employer_id") {
        return (
          <div>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="mt-1">
              <Select
                value={
                  editForm.principal_employer_id != null
                    ? String(editForm.principal_employer_id)
                    : "none"
                }
                onValueChange={(v) =>
                  handleEditChange(
                    "principal_employer_id",
                    v === "none" ? null : Number(v)
                  )
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select principal employer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {principalEmployers.map((pe) => (
                    <SelectItem key={pe.employer_id} value={String(pe.employer_id)}>
                      {pe.employer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      }
      if (type === "checkbox") {
        return (
          <div>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!editForm[field]}
                onChange={(e) => handleEditChange(field, e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">
                {editForm[field] ? "Yes" : "No"}
              </span>
            </div>
          </div>
        );
      }
      return (
        <div>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <div className="mt-1">
            <Input
              className="h-8"
              type={type}
              step={type === "number" ? "any" : undefined}
              value={String(editForm[field] ?? "")}
              onChange={(e) =>
                handleEditChange(
                  field,
                  type === "number" && e.target.value
                    ? parseFloat(e.target.value)
                    : e.target.value || null
                )
              }
            />
          </div>
        </div>
      );
    }

    // View mode — special handling for principal_employer_id
    if (field === "principal_employer_id") {
      const peName = worksite.principal_employer?.employer_name;
      return (
        <div>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <div className="mt-1 text-sm">
            {peName ? (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                {peName}
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
      );
    }

    const val = worksite[field];
    let display: string;
    if (val == null || val === "") {
      display = "—";
    } else if (typeof val === "boolean") {
      display = val ? "Yes" : "No";
    } else if (typeof val === "string") {
      display = val.replace(/_/g, " ");
    } else {
      display = String(val);
    }

    return (
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="mt-1 text-sm">{display}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/worksites")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {worksite.worksite_name}
          </h1>
          <p className="text-muted-foreground">
            {worksite.worksite_type.replace(/_/g, " ")}
            {worksite.operator
              ? ` · Operated by ${worksite.operator.employer_name}`
              : ""}
            {worksite.principal_employer
              ? ` · ${worksite.principal_employer.employer_name} asset`
              : ""}
          </p>
        </div>
        <Badge variant={worksite.is_offshore ? "info" : "secondary"}>
          {worksite.is_offshore ? "Offshore" : "Onshore"}
        </Badge>
        <Badge variant={worksite.is_active ? "success" : "destructive"}>
          {worksite.is_active ? "Active" : "Inactive"}
        </Badge>
        {canWrite && !editing && (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelEditing}
              disabled={saving}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdits} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Worksite Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              {renderField("worksite_name", "Name")}
              {renderField("worksite_type", "Type", "select")}
              {renderField("principal_employer_id", "Principal Employer")}
              <div>
                <Label className="text-xs text-muted-foreground">Operator</Label>
                <div className="mt-1 text-sm">
                  {worksite.operator?.employer_name ?? "—"}
                </div>
              </div>
              {renderField("location_description", "Location")}
              {renderField("basin", "Basin")}
              {renderField("latitude", "Latitude", "number")}
              {renderField("longitude", "Longitude", "number")}
              {renderField("is_offshore", "Offshore", "checkbox")}
              {renderField("is_active", "Active", "checkbox")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              id="worksite-map"
              className="h-64 bg-muted rounded-lg flex items-center justify-center"
            >
              <p className="text-muted-foreground text-sm">
                Map view coming soon
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="agreements">
        <TabsList>
          <TabsTrigger value="agreements">
            Agreements ({agreements.length})
          </TabsTrigger>
          <TabsTrigger value="employers">
            Employers ({employerRoles.length})
          </TabsTrigger>
          <TabsTrigger value="workers">
            Workers ({workers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agreements">
          {agreements.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No agreements found for this worksite.
            </div>
          ) : (
            <DataTable
              data={agreements as AgreementRow[]}
              columns={agreementColumns}
              searchPlaceholder="Search agreements..."
              searchKeys={["decision_no", "agreement_name"]}
              onRowClick={(item) =>
                router.push(`/agreements/${item.agreement_id}`)
              }
            />
          )}
        </TabsContent>

        <TabsContent value="employers">
          {employerRoles.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No employer associations found for this worksite.
            </div>
          ) : (
            <DataTable
              data={employerRoles as EmployerRoleRow[]}
              columns={employerRoleColumns}
              searchPlaceholder="Search employers..."
              searchKeys={["employer_name", "role_type"]}
              onRowClick={(item) =>
                item.employer
                  ? router.push(`/employers/${item.employer.employer_id}`)
                  : undefined
              }
            />
          )}
        </TabsContent>

        <TabsContent value="workers">
          {workers.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No workers found at this worksite.
            </div>
          ) : (
            <DataTable
              data={workers as WorkerRow[]}
              columns={workerColumns}
              searchPlaceholder="Search workers..."
              searchKeys={["first_name", "last_name", "occupation"]}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
