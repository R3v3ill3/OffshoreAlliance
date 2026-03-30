"use client";

import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { CampaignStatusBadge, type CampaignWithStages } from "./campaign-status-badge";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Building2,
  FileText,
  Users,
  Layers,
  FolderOpen,
} from "lucide-react";

export interface ProjectDetail {
  project_id: number;
  work_type: string;
  project_status: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  worksite: {
    worksite_id: number;
    worksite_name: string;
    worksite_type: string;
    is_offshore: boolean;
    basin: string | null;
  } | null;
  employers: {
    employer_id: number;
    employer_name: string;
    employer_category: string | null;
    role_type: string;
  }[];
  agreements: {
    agreement_id: number;
    agreement_name: string;
    short_name: string | null;
    status: string;
    expiry_date: string | null;
  }[];
  workers: {
    worker_id: number;
    first_name: string;
    last_name: string;
    occupation: string | null;
    employer_id: number | null;
    is_active: boolean;
  }[];
  work_scopes: {
    scope_id: number;
    scope_name: string;
    engagement_type: string | null;
  }[];
}

interface ProjectDetailSheetProps {
  project: ProjectDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns: CampaignWithStages[];
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  active: "success",
  operational: "success",
  planning: "secondary",
  commissioning: "secondary",
  brownfields: "secondary",
  decommissioning: "warning",
  completed: "outline",
  absorbed: "outline",
};

type EmployerRow = ProjectDetail["employers"][number] & Record<string, unknown>;
type AgreementRow = ProjectDetail["agreements"][number] & Record<string, unknown>;
type WorkerRow = ProjectDetail["workers"][number] & Record<string, unknown>;
type ScopeRow = ProjectDetail["work_scopes"][number] & Record<string, unknown>;

export function ProjectDetailSheet({
  project,
  open,
  onOpenChange,
  campaigns,
}: ProjectDetailSheetProps) {
  const router = useRouter();

  if (!project) return null;

  const employerIds = project.employers.map((e) => e.employer_id);

  const employerColumns: Column<EmployerRow>[] = [
    {
      key: "employer_name",
      header: "Employer",
      render: (row) => <span className="font-medium">{row.employer_name as string}</span>,
    },
    {
      key: "role_type",
      header: "Role",
      render: (row) => (
        <Badge variant="secondary">{(row.role_type as string).replace(/_/g, " ")}</Badge>
      ),
    },
    {
      key: "employer_category",
      header: "Category",
      render: (row) =>
        row.employer_category ? (
          <span className="text-sm text-muted-foreground">
            {(row.employer_category as string).replace(/_/g, " ")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const agreementColumns: Column<AgreementRow>[] = [
    {
      key: "agreement_name",
      header: "Agreement",
      render: (row) => (
        <span className="font-medium">{row.short_name as string || row.agreement_name as string}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={STATUS_VARIANTS[row.status as string] ?? "secondary"}>
          {(row.status as string).replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      key: "expiry_date",
      header: "Expiry",
      render: (row) =>
        row.expiry_date ? (
          <span className="text-sm">{new Date(row.expiry_date as string).toLocaleDateString()}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const workerColumns: Column<WorkerRow>[] = [
    {
      key: "first_name",
      header: "Name",
      render: (row) => (
        <span className="font-medium">{row.first_name as string} {row.last_name as string}</span>
      ),
    },
    {
      key: "occupation",
      header: "Occupation",
      render: (row) =>
        row.occupation ? (
          <span className="text-sm">{row.occupation as string}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => (
        <Badge variant={row.is_active ? "success" : "outline"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  const scopeColumns: Column<ScopeRow>[] = [
    {
      key: "scope_name",
      header: "Work Scope",
      render: (row) => <span className="font-medium">{row.scope_name as string}</span>,
    },
    {
      key: "engagement_type",
      header: "Engagement",
      render: (row) =>
        row.engagement_type ? (
          <Badge variant="secondary">{(row.engagement_type as string).replace(/_/g, " ")}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="space-y-1">
              <SheetTitle className="text-xl flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-muted-foreground" />
                {project.work_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                {project.worksite && ` — ${project.worksite.worksite_name}`}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={STATUS_VARIANTS[project.project_status] ?? "secondary"}
                >
                  {project.project_status.replace(/_/g, " ")}
                </Badge>
                {project.worksite?.is_offshore && (
                  <Badge variant="outline">Offshore</Badge>
                )}
                {project.worksite?.basin && (
                  <span className="text-sm text-muted-foreground">
                    {project.worksite.basin}
                  </span>
                )}
              </SheetDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <CampaignStatusBadge employerIds={employerIds} campaigns={campaigns} />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Worksite info */}
          {project.worksite && (
            <div className="px-6 py-4 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Worksite
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Name</span>
                  <button
                    onClick={() => router.push(`/worksites/${project.worksite!.worksite_id}`)}
                    className="block font-medium text-primary hover:underline"
                  >
                    {project.worksite.worksite_name}
                  </button>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium">{project.worksite.worksite_type.replace(/_/g, " ")}</p>
                </div>
                {project.start_date && (
                  <div>
                    <span className="text-muted-foreground">Start Date</span>
                    <p className="font-medium">
                      {new Date(project.start_date).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {project.end_date && (
                  <div>
                    <span className="text-muted-foreground">End Date</span>
                    <p className="font-medium">
                      {new Date(project.end_date).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Employers */}
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Employers ({project.employers.length})
            </h3>
            <DataTable
              data={project.employers as EmployerRow[]}
              columns={employerColumns}
              searchPlaceholder="Search employers..."
              searchKeys={["employer_name"]}
              onRowClick={(row) => router.push(`/employers/${row.employer_id}`)}
              pageSize={10}
            />
          </div>

          <Separator />

          {/* Agreements */}
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Enterprise Agreements ({project.agreements.length})
            </h3>
            <DataTable
              data={project.agreements as AgreementRow[]}
              columns={agreementColumns}
              searchPlaceholder="Search agreements..."
              searchKeys={["agreement_name", "short_name"]}
              onRowClick={(row) => router.push(`/agreements/${row.agreement_id}`)}
              pageSize={10}
            />
          </div>

          {/* Workers */}
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              Workers ({project.workers.length})
            </h3>
            <DataTable
              data={project.workers as WorkerRow[]}
              columns={workerColumns}
              searchPlaceholder="Search workers..."
              searchKeys={["first_name", "last_name", "occupation"]}
              onRowClick={(row) => router.push(`/workers/${row.worker_id}`)}
              pageSize={10}
            />
          </div>

          {/* Work Scopes */}
          <div className="px-6 py-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Work Scopes ({project.work_scopes.length})
            </h3>
            {project.work_scopes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No work scopes assigned.</p>
            ) : (
              <DataTable
                data={project.work_scopes as ScopeRow[]}
                columns={scopeColumns}
                searchPlaceholder="Search scopes..."
                searchKeys={["scope_name"]}
                pageSize={10}
              />
            )}
          </div>

          {project.notes && (
            <div className="px-6 pb-6">
              <Separator className="mb-4" />
              <h3 className="text-sm font-semibold mb-1">Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {project.notes}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
