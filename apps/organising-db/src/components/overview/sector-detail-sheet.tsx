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
import { Tag, Building2, FileText, Users, Layers, MapPin } from "lucide-react";

export interface SectorDetail {
  sector_id: number;
  sector_name: string;
  description: string | null;
  employers: {
    employer_id: number;
    employer_name: string;
    employer_category: string | null;
    is_active: boolean;
    source: "direct" | "agreement";
  }[];
  agreements: {
    agreement_id: number;
    agreement_name: string;
    short_name: string | null;
    status: string;
    expiry_date: string | null;
    employer_id: number | null;
  }[];
  worksites: {
    worksite_id: number;
    worksite_name: string;
    worksite_type: string;
    is_offshore: boolean;
    is_active: boolean;
  }[];
  workers: {
    worker_id: number;
    first_name: string;
    last_name: string;
    occupation: string | null;
    is_active: boolean;
  }[];
  work_scopes: {
    scope_id: number;
    scope_name: string;
  }[];
}

interface SectorDetailSheetProps {
  sector: SectorDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns: CampaignWithStages[];
}

const AGREEMENT_STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  Current: "success",
  Under_Negotiation: "warning",
  Expired: "outline",
  Terminated: "destructive",
};

type EmployerRow = SectorDetail["employers"][number] & Record<string, unknown>;
type AgreementRow = SectorDetail["agreements"][number] & Record<string, unknown>;
type WorksiteRow = SectorDetail["worksites"][number] & Record<string, unknown>;
type WorkerRow = SectorDetail["workers"][number] & Record<string, unknown>;
type ScopeRow = SectorDetail["work_scopes"][number] & Record<string, unknown>;

export function SectorDetailSheet({
  sector,
  open,
  onOpenChange,
  campaigns,
}: SectorDetailSheetProps) {
  const router = useRouter();

  if (!sector) return null;

  const employerIds = sector.employers.map((e) => e.employer_id);

  const employerColumns: Column<EmployerRow>[] = [
    {
      key: "employer_name",
      header: "Employer",
      render: (row) => <span className="font-medium">{row.employer_name as string}</span>,
    },
    {
      key: "employer_category",
      header: "Category",
      render: (row) =>
        row.employer_category ? (
          <Badge variant="secondary">
            {(row.employer_category as string).replace(/_/g, " ")}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "source",
      header: "Link",
      render: (row) => (
        <Badge variant="outline" className="text-xs">
          {row.source === "direct" ? "Direct" : "Via Agreement"}
        </Badge>
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

  const agreementColumns: Column<AgreementRow>[] = [
    {
      key: "agreement_name",
      header: "Agreement",
      render: (row) => (
        <span className="font-medium">{(row.short_name as string) || (row.agreement_name as string)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={AGREEMENT_STATUS_VARIANTS[row.status as string] ?? "secondary"}>
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

  const worksiteColumns: Column<WorksiteRow>[] = [
    {
      key: "worksite_name",
      header: "Worksite",
      render: (row) => <span className="font-medium">{row.worksite_name as string}</span>,
    },
    {
      key: "worksite_type",
      header: "Type",
      render: (row) => (
        <span className="text-sm">{(row.worksite_type as string).replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "is_offshore",
      header: "Location",
      render: (row) => (
        <Badge variant="outline">{row.is_offshore ? "Offshore" : "Onshore"}</Badge>
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
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="pr-6 space-y-1">
            <SheetTitle className="text-xl flex items-center gap-2">
              <Tag className="h-5 w-5 text-muted-foreground" />
              {sector.sector_name}
            </SheetTitle>
            {sector.description && (
              <SheetDescription>{sector.description}</SheetDescription>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <CampaignStatusBadge employerIds={employerIds} campaigns={campaigns} />
            <Badge variant="outline">{sector.employers.length} employers</Badge>
            <Badge variant="outline">{sector.agreements.length} agreements</Badge>
            <Badge variant="outline">{sector.workers.length} workers</Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Employers */}
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Employers ({sector.employers.length})
            </h3>
            {sector.employers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No employers in this sector.</p>
            ) : (
              <DataTable
                data={sector.employers as EmployerRow[]}
                columns={employerColumns}
                searchPlaceholder="Search employers..."
                searchKeys={["employer_name"]}
                onRowClick={(row) => router.push(`/employers/${row.employer_id}`)}
                pageSize={10}
              />
            )}
          </div>

          {/* Agreements */}
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Enterprise Agreements ({sector.agreements.length})
            </h3>
            {sector.agreements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agreements in this sector.</p>
            ) : (
              <DataTable
                data={sector.agreements as AgreementRow[]}
                columns={agreementColumns}
                searchPlaceholder="Search agreements..."
                searchKeys={["agreement_name", "short_name"]}
                onRowClick={(row) => router.push(`/agreements/${row.agreement_id}`)}
                pageSize={10}
              />
            )}
          </div>

          {/* Worksites */}
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Worksites ({sector.worksites.length})
            </h3>
            {sector.worksites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No worksites linked to this sector.</p>
            ) : (
              <DataTable
                data={sector.worksites as WorksiteRow[]}
                columns={worksiteColumns}
                searchPlaceholder="Search worksites..."
                searchKeys={["worksite_name"]}
                onRowClick={(row) => router.push(`/worksites/${row.worksite_id}`)}
                pageSize={10}
              />
            )}
          </div>

          {/* Workers */}
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              Workers ({sector.workers.length})
            </h3>
            {sector.workers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workers linked to this sector.</p>
            ) : (
              <DataTable
                data={sector.workers as WorkerRow[]}
                columns={workerColumns}
                searchPlaceholder="Search workers..."
                searchKeys={["first_name", "last_name", "occupation"]}
                onRowClick={(row) => router.push(`/workers/${row.worker_id}`)}
                pageSize={10}
              />
            )}
          </div>

          {/* Work Scopes */}
          <div className="px-6 py-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Work Scopes ({sector.work_scopes.length})
            </h3>
            {sector.work_scopes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No work scopes in this sector.</p>
            ) : (
              <DataTable
                data={sector.work_scopes as ScopeRow[]}
                columns={scopeColumns}
                searchPlaceholder="Search scopes..."
                searchKeys={["scope_name"]}
                pageSize={10}
              />
            )}
          </div>

          <Separator />
        </div>
      </SheetContent>
    </Sheet>
  );
}
