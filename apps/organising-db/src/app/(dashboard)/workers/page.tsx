"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column, type DataTableSelection } from "@/components/data-tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";
import { WorkerFilterBar, EMPTY_FILTERS, type WorkerFilters } from "@/components/workers/worker-filter-bar";
import { BatchEditDialog } from "@/components/workers/batch-edit-dialog";
import { Upload, Filter, Pencil, X, CheckSquare } from "lucide-react";

function FilterableCell({
  value,
  filterKey,
  filterId,
  onFilter,
}: {
  value: string | null;
  filterKey: keyof WorkerFilters;
  filterId: number | null;
  onFilter: (patch: Partial<WorkerFilters>) => void;
}) {
  if (!value) return <span>—</span>;
  return (
    <span className="group/filter inline-flex items-center gap-1">
      {value}
      {filterId != null && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFilter({ [filterKey]: filterId });
          }}
          className="opacity-0 group-hover/filter:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
          title={`Filter by this ${filterKey.replace(/_id$/, "").replace(/_/g, " ")}`}
        >
          <Filter className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </span>
  );
}

export interface WorkerRow {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  is_hsr: boolean | null;
  employer_id: number | null;
  worksite_id: number | null;
  union_membership_type_id: number | null;
  member_role_type_id: number | null;
  canonical_occupation_id: number | null;
  employer: { employer_name: string } | null;
  worksite: { worksite_name: string } | null;
  union_membership_type: { display_name: string } | null;
  member_role_type: { display_name: string } | null;
  [key: string]: unknown;
}

export default function WorkersPage() {
  const router = useRouter();
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [filters, setFilters] = useState<WorkerFilters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name, email, phone, is_active, is_hsr,
           employer_id, worksite_id, union_membership_type_id, member_role_type_id,
           canonical_occupation_id,
           employer:employers(employer_name),
           worksite:worksites(worksite_name),
           union_membership_type:union_membership_types(display_name),
           member_role_type:member_role_types(display_name)`
        )
        .order("last_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as WorkerRow[];
    },
    enabled: !!user,
  });

  // Campaign universe filter: fetch worker IDs for the selected campaign
  const { data: campaignWorkerIds } = useQuery({
    queryKey: ["campaign-worker-ids", filters.campaign_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select("worker_id")
        .eq("campaign_id", filters.campaign_id!);
      if (error) throw error;
      return new Set((data ?? []).map((r: { worker_id: number }) => r.worker_id));
    },
    enabled: !!user && filters.campaign_id != null,
  });

  const clientFiltered = useMemo(() => {
    let result = workers;

    if (filters.employer_id != null)
      result = result.filter((w) => w.employer_id === filters.employer_id);
    if (filters.worksite_id != null)
      result = result.filter((w) => w.worksite_id === filters.worksite_id);
    if (filters.union_membership_type_id != null)
      result = result.filter(
        (w) => w.union_membership_type_id === filters.union_membership_type_id
      );
    if (filters.member_role_type_id != null)
      result = result.filter(
        (w) => w.member_role_type_id === filters.member_role_type_id
      );
    if (filters.is_active != null)
      result = result.filter((w) => w.is_active === filters.is_active);
    if (filters.campaign_id != null && campaignWorkerIds)
      result = result.filter((w) => campaignWorkerIds.has(w.worker_id));

    return result;
  }, [workers, filters, campaignWorkerIds]);

  const applyFilter = useCallback(
    (patch: Partial<WorkerFilters>) => {
      setFilters((prev) => ({ ...prev, ...patch }));
      setSelectedIds(new Set());
    },
    []
  );

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(clientFiltered.map((w) => String(w.worker_id))));
  }, [clientFiltered]);

  const selection: DataTableSelection<WorkerRow> = {
    rowId: (w) => String(w.worker_id),
    selectedIds,
    onToggleRow: (id, selected) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    onToggleAllVisible: (ids, selected) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
        return next;
      });
    },
  };

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
      render: (row) => (
        <FilterableCell
          value={row.employer?.employer_name ?? null}
          filterKey="employer_id"
          filterId={row.employer_id}
          onFilter={applyFilter}
        />
      ),
    },
    {
      key: "worksite_name",
      header: "Worksite",
      render: (row) => (
        <FilterableCell
          value={row.worksite?.worksite_name ?? null}
          filterKey="worksite_id"
          filterId={row.worksite_id}
          onFilter={applyFilter}
        />
      ),
    },
    {
      key: "member_type",
      header: "Member type",
      render: (row) => (
        <FilterableCell
          value={row.union_membership_type?.display_name ?? null}
          filterKey="union_membership_type_id"
          filterId={row.union_membership_type_id}
          onFilter={applyFilter}
        />
      ),
    },
    {
      key: "role",
      header: "Organising role",
      render: (row) => (
        <FilterableCell
          value={row.member_role_type?.display_name ?? null}
          filterKey="member_role_type_id"
          filterId={row.member_role_type_id}
          onFilter={applyFilter}
        />
      ),
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

  const selectedWorkerIds = [...selectedIds].map(Number);

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
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {selectedIds.size} worker{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={selectAllFiltered}
          >
            Select all {clientFiltered.length} matching
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
            <X className="ml-1 h-3 w-3" />
          </Button>
          <div className="flex-1" />
          {canWrite && (
            <Button
              size="sm"
              className="h-7"
              onClick={() => setBatchEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit Selected
            </Button>
          )}
        </div>
      )}

      <DataTable<WorkerRow>
        data={clientFiltered}
        columns={columns}
        searchPlaceholder="Search by name or email..."
        searchKeys={["first_name", "last_name", "email"]}
        onRowClick={(row) => router.push(`/workers/${row.worker_id}`)}
        loading={isLoading}
        selection={selection}
        filterBar={
          <WorkerFilterBar filters={filters} onChange={applyFilter} />
        }
      />

      <WorkerImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        onComplete={() => queryClient.invalidateQueries({ queryKey: ["workers"] })}
      />

      {canWrite && (
        <BatchEditDialog
          open={batchEditOpen}
          onOpenChange={setBatchEditOpen}
          workerIds={selectedWorkerIds}
          onComplete={() => {
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["workers"] });
          }}
        />
      )}
    </div>
  );
}
