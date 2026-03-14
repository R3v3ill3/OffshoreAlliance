"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";
import { Plus, Upload } from "lucide-react";

interface WorkerRow {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  employer: { employer_name: string } | null;
  worksite: { worksite_name: string } | null;
  member_role_type: { display_name: string } | null;
  [key: string]: unknown;
}

const columns: Column<WorkerRow>[] = [
  {
    key: "name",
    header: "Name",
    render: (row) => `${row.first_name} ${row.last_name}`,
  },
  {
    key: "email",
    header: "Email",
    render: (row) => row.email ?? "—",
  },
  {
    key: "phone",
    header: "Phone",
    render: (row) => row.phone ?? "—",
    sortable: false,
  },
  {
    key: "employer_name",
    header: "Employer",
    render: (row) => row.employer?.employer_name ?? "—",
  },
  {
    key: "worksite_name",
    header: "Worksite",
    render: (row) => row.worksite?.worksite_name ?? "—",
  },
  {
    key: "role",
    header: "Role",
    render: (row) => row.member_role_type?.display_name ?? "—",
  },
  {
    key: "is_active",
    header: "Status",
    render: (row) => (
      <Badge variant={row.is_active ? "success" : "secondary"}>
        {row.is_active ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

export default function WorkersPage() {
  const router = useRouter();
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [importWizardOpen, setImportWizardOpen] = useState(false);

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name, email, phone, is_active,
           employer:employers(employer_name),
           worksite:worksites(worksite_name),
           member_role_type:member_role_types(display_name)`
        )
        .order("last_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as WorkerRow[];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Workers</h1>
        {canWrite && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setImportWizardOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Import Workers
            </Button>
            <Button onClick={() => router.push("/workers/new")}>
              <Plus className="h-4 w-4" />
              Add Worker
            </Button>
          </div>
        )}
      </div>

      <DataTable<WorkerRow>
        data={workers}
        columns={columns}
        searchPlaceholder="Search by name or email..."
        searchKeys={["first_name", "last_name", "email"]}
        onRowClick={(row) => router.push(`/workers/${row.worker_id}`)}
        loading={isLoading}
      />

      <WorkerImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        onComplete={() => queryClient.invalidateQueries({ queryKey: ["workers"] })}
      />
    </div>
  );
}
