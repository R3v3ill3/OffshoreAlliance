"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type {
  Employer,
  Agreement,
  Worker,
  EmployerWorksiteRole,
  Worksite,
  EmployerCategory,
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
import { ArrowLeft, Pencil, X, Save } from "lucide-react";
import { format } from "date-fns";

const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  "Producer",
  "Major_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Specialist",
];

const AU_STATES = ["WA", "NT", "QLD", "SA", "NSW", "VIC", "TAS", "ACT"];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

type AgreementRow = Agreement & Record<string, unknown>;
type WorksiteRoleRow = EmployerWorksiteRole & {
  worksite?: Worksite;
} & Record<string, unknown>;
type WorkerRow = Worker & Record<string, unknown>;

export default function EmployerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { canWrite } = useAuth();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Employer>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    data: employer,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["employer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("*")
        .eq("employer_id", id)
        .single();
      if (error) throw error;
      return data as Employer;
    },
    enabled: !!id,
  });

  const { data: agreements = [] } = useQuery({
    queryKey: ["employer-agreements", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("*")
        .eq("employer_id", id)
        .order("expiry_date", { ascending: false });
      if (error) throw error;
      return data as Agreement[];
    },
    enabled: !!id,
  });

  const { data: worksiteRoles = [] } = useQuery({
    queryKey: ["employer-worksite-roles", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_worksite_roles")
        .select("*, worksite:worksites(*)")
        .eq("employer_id", id);
      if (error) throw error;
      return data as (EmployerWorksiteRole & { worksite?: Worksite })[];
    },
    enabled: !!id,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["employer-workers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*, worksite:worksites(worksite_name)")
        .eq("employer_id", id)
        .order("last_name");
      if (error) throw error;
      return data as (Worker & { worksite?: { worksite_name: string } })[];
    },
    enabled: !!id,
  });

  const startEditing = () => {
    if (!employer) return;
    setEditForm({ ...employer });
    setEditing(true);
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm({});
    setSaveError(null);
  };

  const handleEditChange = (field: keyof Employer, value: string | null) => {
    setEditForm((prev) => ({ ...prev, [field]: value || null }));
  };

  const saveEdits = async () => {
    if (!employer) return;
    setSaving(true);
    setSaveError(null);

    const { error } = await supabase
      .from("employers")
      .update(editForm)
      .eq("employer_id", employer.employer_id);

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["employer", id] });
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

  const worksiteRoleColumns: Column<WorksiteRoleRow>[] = useMemo(
    () => [
      {
        key: "worksite_name",
        header: "Worksite",
        render: (item) => item.worksite?.worksite_name ?? "—",
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
        key: "worksite_name",
        header: "Worksite",
        render: (item) => {
          const w = item as WorkerRow & {
            worksite?: { worksite_name: string };
          };
          return w.worksite?.worksite_name ?? "—";
        },
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading employer...</p>
      </div>
    );
  }

  if (isError || !employer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">Employer not found or failed to load.</p>
        <Button variant="outline" onClick={() => router.push("/employers")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Employers
        </Button>
      </div>
    );
  }

  const displayValue = (field: keyof Employer) => {
    if (editing) {
      const val = editForm[field];
      if (
        field === "employer_category" ||
        field === "state"
      ) {
        const options =
          field === "employer_category" ? EMPLOYER_CATEGORIES : AU_STATES;
        return (
          <Select
            value={(val as string) ?? ""}
            onValueChange={(v) => handleEditChange(field, v)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder={`Select ${field.replace(/_/g, " ")}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      return (
        <Input
          className="h-8"
          value={(val as string) ?? ""}
          onChange={(e) => handleEditChange(field, e.target.value)}
        />
      );
    }
    const val = employer[field];
    if (val == null || val === "") return "—";
    if (typeof val === "string") return val.replace(/_/g, " ");
    return String(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/employers")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {employer.employer_name}
          </h1>
          {employer.trading_name && (
            <p className="text-muted-foreground">
              Trading as: {employer.trading_name}
            </p>
          )}
        </div>
        <Badge variant={employer.is_active ? "success" : "destructive"}>
          {employer.is_active ? "Active" : "Inactive"}
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

      <Card>
        <CardHeader>
          <CardTitle>Employer Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            {(
              [
                ["employer_name", "Employer Name"],
                ["trading_name", "Trading Name"],
                ["abn", "ABN"],
                ["employer_category", "Category"],
                ["parent_company", "Parent Company"],
                ["website", "Website"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["address", "Address"],
                ["state", "State"],
                ["postcode", "Postcode"],
              ] as [keyof Employer, string][]
            ).map(([field, label]) => (
              <div key={field}>
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <div className="mt-1 text-sm">{displayValue(field)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="agreements">
        <TabsList>
          <TabsTrigger value="agreements">
            Agreements ({agreements.length})
          </TabsTrigger>
          <TabsTrigger value="worksites">
            Worksites ({worksiteRoles.length})
          </TabsTrigger>
          <TabsTrigger value="workers">
            Workers ({workers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agreements">
          {agreements.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No agreements found for this employer.
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

        <TabsContent value="worksites">
          {worksiteRoles.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No worksite associations found for this employer.
            </div>
          ) : (
            <DataTable
              data={worksiteRoles as WorksiteRoleRow[]}
              columns={worksiteRoleColumns}
              searchPlaceholder="Search worksites..."
              searchKeys={["worksite_name", "role_type"]}
            />
          )}
        </TabsContent>

        <TabsContent value="workers">
          {workers.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No workers found for this employer.
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
