"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Globe2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type { AgreementStatus, OrganisingUniverseRow } from "@/types/database";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

type UniverseTableRow = OrganisingUniverseRow & Record<string, unknown>;

const NONE = "__none__";

function statusBadgeVariant(status: AgreementStatus | null) {
  if (!status) return "secondary" as const;
  switch (status) {
    case "Current":
      return "success" as const;
    case "Expired":
      return "destructive" as const;
    case "Under_Negotiation":
      return "warning" as const;
    case "Terminated":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function labelFromSnake(value: string | null | undefined) {
  if (value == null) return "—";
  return value.replace(/_/g, " ");
}

function formatExpiry(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "dd MMM yyyy");
}

const universeColumns: Column<UniverseTableRow>[] = [
  {
    key: "worksite_name",
    header: "Worksite",
    render: (row) => (
      <span className="font-medium">{row.worksite_name}</span>
    ),
  },
  {
    key: "principal_employer_name",
    header: "Principal Employer",
    render: (row) => row.principal_employer_name ?? "—",
  },
  {
    key: "employer_name",
    header: "Employer",
    render: (row) => row.employer_name ?? "—",
  },
  {
    key: "employer_category",
    header: "Category",
    render: (row) => labelFromSnake(row.employer_category),
  },
  {
    key: "agreement_name",
    header: "Agreement",
    render: (row) => {
      const expiryLabel = formatExpiry(row.agreement_expiry);
      return (
        <div className="space-y-0.5">
          <div>{row.agreement_name ?? row.agreement_short_name ?? "—"}</div>
          {expiryLabel && (
            <div className="text-xs text-muted-foreground">
              Expires {expiryLabel}
            </div>
          )}
        </div>
      );
    },
  },
  {
    key: "agreement_status",
    header: "Status",
    render: (row) =>
      row.agreement_status ? (
        <Badge variant={statusBadgeVariant(row.agreement_status)}>
          {row.agreement_status.replace(/_/g, " ")}
        </Badge>
      ) : (
        "—"
      ),
  },
  {
    key: "agreement_scope",
    header: "Scope",
    render: (row) => labelFromSnake(row.agreement_scope),
  },
  {
    key: "worker_count",
    header: "Worker Count",
    className: "text-right tabular-nums",
    render: (row) => row.worker_count.toLocaleString(),
  },
];

export default function OrganisingUniverseReportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [principalFilter, setPrincipalFilter] = useState<string>("all");
  const [worksiteFilter, setWorksiteFilter] = useState<string>("all");
  const [employerFilter, setEmployerFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<
    "all" | "offshore" | "onshore"
  >("all");

  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ["organising-universe-view"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organising_universe_view")
        .select("*")
        .order("worksite_name", { ascending: true });
      if (error) throw error;
      return data as OrganisingUniverseRow[];
    },
    enabled: !!user,
  });

  const principalOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rawRows) {
      const id = row.principal_employer_id;
      const key = id != null ? String(id) : NONE;
      const label = row.principal_employer_name ?? "(No principal employer)";
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: "base" })
    );
  }, [rawRows]);

  const worksiteOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of rawRows) {
      map.set(row.worksite_id, row.worksite_name);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: "base" })
    );
  }, [rawRows]);

  const employerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rawRows) {
      const id = row.employer_id;
      const key = id != null ? String(id) : NONE;
      const label = row.employer_name ?? "(No employer)";
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: "base" })
    );
  }, [rawRows]);

  const filteredRows = useMemo((): UniverseTableRow[] => {
    return rawRows
      .filter((row) => {
        if (principalFilter !== "all") {
          if (principalFilter === NONE && row.principal_employer_id != null) {
            return false;
          }
          if (
            principalFilter !== NONE &&
            String(row.principal_employer_id ?? "") !== principalFilter
          ) {
            return false;
          }
        }
        if (worksiteFilter !== "all" && String(row.worksite_id) !== worksiteFilter) {
          return false;
        }
        if (employerFilter !== "all") {
          if (employerFilter === NONE && row.employer_id != null) {
            return false;
          }
          if (
            employerFilter !== NONE &&
            String(row.employer_id ?? "") !== employerFilter
          ) {
            return false;
          }
        }
        if (locationFilter === "offshore" && !row.is_offshore) return false;
        if (locationFilter === "onshore" && row.is_offshore) return false;
        return true;
      })
      .map((row) => row as UniverseTableRow);
  }, [
    rawRows,
    principalFilter,
    worksiteFilter,
    employerFilter,
    locationFilter,
  ]);

  const tableData = filteredRows;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 shrink-0"
              onClick={() => router.push("/reports")}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Globe2 className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">Organising Universe</h1>
            </div>
          </div>
          <p className="text-muted-foreground max-w-3xl pl-1 sm:pl-10">
            Every worksite row in the organising universe: principal employer,
            linked employers, agreements, and worker counts. Filter and export to
            CSV for planning and coverage analysis.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Refine rows before searching or exporting. Filters apply on top of
            the full view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 min-w-[200px] flex-1">
              <Label>Principal Employer</Label>
              <Select
                value={principalFilter}
                onValueChange={(v) => {
                  setPrincipalFilter(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {principalOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[200px] flex-1">
              <Label>Worksite</Label>
              <Select
                value={worksiteFilter}
                onValueChange={setWorksiteFilter}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {worksiteOptions.map(([id, name]) => (
                    <SelectItem key={id} value={String(id)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[200px] flex-1">
              <Label>Employer</Label>
              <Select value={employerFilter} onValueChange={setEmployerFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {employerOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[180px]">
              <Label>Offshore / Onshore</Label>
              <Select
                value={locationFilter}
                onValueChange={(v) =>
                  setLocationFilter(v as "all" | "offshore" | "onshore")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="offshore">Offshore</SelectItem>
                  <SelectItem value="onshore">Onshore</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <EurekaLoadingSpinner size="lg" />
        </div>
      ) : (
        <DataTable<UniverseTableRow>
          data={tableData}
          columns={universeColumns}
          searchPlaceholder="Search worksites, employers, agreements..."
          searchKeys={[
            "worksite_name",
            "principal_employer_name",
            "employer_name",
            "agreement_name",
            "agreement_short_name",
          ]}
          onRowClick={(row) => router.push(`/worksites/${row.worksite_id}`)}
        />
      )}
    </div>
  );
}
