"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Sector,
  AgreementStatus,
  Employer,
  Worksite,
  EmployerWorksiteRole,
  PrincipalEmployerEbaSummary,
  WorksiteEmployerEbaStatus,
  EbaStatusCategory,
} from "@/types/database";
import {
  FileText,
  Users,
  Map,
  Megaphone,
  DollarSign,
  Calendar,
  Download,
  ArrowLeft,
  Star,
  Network,
} from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import {
  PrincipalEmployerEbaChart,
  EBA_STATUS_META,
  ebaStatusLabel,
  ebaStatusVariant,
} from "@/components/reports/principal-employer-eba-chart";
import { WorksiteRelationshipExplorer } from "@/components/reports/worksite-relationship-explorer";

// ---------------------------------------------------------------
// Report type registry
// ---------------------------------------------------------------
type ReportType =
  | "agreement_expiry"
  | "principal_employer_coverage"
  | "worksite_relationship_explorer"
  | "membership_density"
  | "organiser_patches"
  | "campaign_activity"
  | "dues_schedule"
  | "bargaining_calendar";

interface ReportOption {
  type: ReportType;
  title: string;
  description: string;
  icon: React.ReactNode;
  isNew?: boolean;
}

const reportOptions: ReportOption[] = [
  {
    type: "agreement_expiry",
    title: "Agreement Expiry",
    description: "Track upcoming agreement expirations with days remaining and status breakdown.",
    icon: <FileText className="h-8 w-8 text-blue-500" />,
  },
  {
    type: "principal_employer_coverage",
    title: "Principal Employer EBA Coverage",
    description:
      "EBA status breakdown for Shell, Woodside, Inpex and Chevron assets — coverage by worksite and employer group.",
    icon: <Star className="h-8 w-8 text-amber-500" />,
    isNew: true,
  },
  {
    type: "worksite_relationship_explorer",
    title: "Worksite Relationship Explorer",
    description:
      "Hybrid map + network drilldown for employer, parent company and principal employer connections with EBA overlays.",
    icon: <Network className="h-8 w-8 text-blue-500" />,
    isNew: true,
  },
  {
    type: "membership_density",
    title: "Membership Density",
    description: "Analyse union membership density by worksite, employer, and sector.",
    icon: <Users className="h-8 w-8 text-green-500" />,
  },
  {
    type: "organiser_patches",
    title: "Organiser Patches",
    description: "Overview of organiser patch assignments, workloads, and coverage gaps.",
    icon: <Map className="h-8 w-8 text-purple-500" />,
  },
  {
    type: "campaign_activity",
    title: "Campaign Activity",
    description: "Summarise campaign actions, outcomes, and worker engagement metrics.",
    icon: <Megaphone className="h-8 w-8 text-orange-500" />,
  },
  {
    type: "dues_schedule",
    title: "Dues Schedule",
    description: "View upcoming dues increases across agreements with effective dates.",
    icon: <DollarSign className="h-8 w-8 text-emerald-500" />,
  },
  {
    type: "bargaining_calendar",
    title: "Bargaining Calendar",
    description: "Calendar view of bargaining timelines, key dates, and milestones.",
    icon: <Calendar className="h-8 w-8 text-red-500" />,
  },
];

// ---------------------------------------------------------------
// Agreement Expiry report types
// ---------------------------------------------------------------
interface AgreementExpiryRow {
  agreement_id: number;
  decision_no: string;
  agreement_name: string;
  expiry_date: string | null;
  status: AgreementStatus;
  sector: { sector_name: string } | null;
  employer: { employer_name: string } | null;
  days_remaining: number | null;
  [key: string]: unknown;
}

function statusBadgeVariant(status: AgreementStatus) {
  switch (status) {
    case "Current":       return "success"       as const;
    case "Expired":       return "destructive"   as const;
    case "Under_Negotiation": return "warning"   as const;
    case "Terminated":    return "secondary"     as const;
    default:              return "outline"       as const;
  }
}

function daysBadgeVariant(days: number | null) {
  if (days === null) return "secondary" as const;
  if (days < 0)      return "destructive" as const;
  if (days <= 90)    return "warning"    as const;
  if (days <= 180)   return "info"       as const;
  return "success" as const;
}

const expiryColumns: Column<AgreementExpiryRow>[] = [
  { key: "decision_no",    header: "Decision No." },
  { key: "agreement_name", header: "Agreement" },
  {
    key: "sector_name",
    header: "Sector",
    render: (row) => row.sector?.sector_name ?? "—",
  },
  {
    key: "employer_name",
    header: "Employer",
    render: (row) => row.employer?.employer_name ?? "—",
  },
  {
    key: "expiry_date",
    header: "Expiry Date",
    render: (row) =>
      row.expiry_date
        ? new Date(row.expiry_date).toLocaleDateString("en-AU")
        : "—",
  },
  {
    key: "days_remaining",
    header: "Days Remaining",
    render: (row) => (
      <Badge variant={daysBadgeVariant(row.days_remaining)}>
        {row.days_remaining !== null ? row.days_remaining : "N/A"}
      </Badge>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={statusBadgeVariant(row.status)}>
        {row.status.replace(/_/g, " ")}
      </Badge>
    ),
  },
];

function exportToCsv(data: AgreementExpiryRow[], filename: string) {
  const headers = [
    "Decision No", "Agreement", "Sector", "Employer",
    "Expiry Date", "Days Remaining", "Status",
  ];
  const rows = data.map((row) => [
    row.decision_no,
    row.agreement_name,
    row.sector?.sector_name ?? "",
    row.employer?.employer_name ?? "",
    row.expiry_date ?? "",
    row.days_remaining?.toString() ?? "",
    row.status,
  ]);
  const csvContent = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------
// Principal Employer EBA Coverage report helpers
// ---------------------------------------------------------------
type EbaCoverageRow = WorksiteEmployerEbaStatus & Record<string, unknown>;

function ebaCoverageExportToCsv(data: EbaCoverageRow[], peFilter: string, filename: string) {
  const headers = [
    "Principal Employer", "Worksite", "Employer",
    "EBA Status", "Current EBA Expiry", "Has Current EBA", "Has Expired EBA", "In Bargaining",
  ];
  const rows = data.map((row) => [
    row.principal_employer_name ?? peFilter,
    row.worksite_name,
    row.employer_name,
    ebaStatusLabel(row.eba_status_category as EbaStatusCategory),
    row.max_current_expiry
      ? new Date(row.max_current_expiry as string).toLocaleDateString("en-AU")
      : "",
    row.has_current ? "Yes" : "No",
    row.has_expired ? "Yes" : "No",
    row.has_bargaining ? "Yes" : "No",
  ]);
  const csvContent = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const ebaCoverageColumns: Column<EbaCoverageRow>[] = [
  {
    key: "principal_employer_name",
    header: "Principal Employer",
    render: (row) =>
      row.principal_employer_name ? (
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
          {row.principal_employer_name as string}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { key: "worksite_name", header: "Worksite" },
  { key: "employer_name", header: "Employer" },
  {
    key: "eba_status_category",
    header: "EBA Status",
    render: (row) => {
      const cat = row.eba_status_category as EbaStatusCategory;
      return (
        <Badge variant={ebaStatusVariant(cat)}>
          {ebaStatusLabel(cat)}
        </Badge>
      );
    },
  },
  {
    key: "max_current_expiry",
    header: "Current EBA Expiry",
    render: (row) =>
      row.max_current_expiry
        ? new Date(row.max_current_expiry as string).toLocaleDateString("en-AU")
        : "—",
  },
  {
    key: "has_bargaining",
    header: "In Bargaining",
    render: (row) =>
      row.has_bargaining ? (
        <Badge variant="warning">Yes</Badge>
      ) : null,
  },
];

// ---------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------
export default function ReportsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);

  // Agreement Expiry filters
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [withinDays, setWithinDays] = useState<string>("");

  // Principal Employer Coverage filters
  const [peFilter, setPeFilter] = useState<string>("all");
  const [ebaCatFilter, setEbaCatFilter] = useState<string>("all");

  // ---- shared data ----
  const { data: sectors = [] } = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sectors")
        .select("*")
        .order("sector_name");
      if (error) throw error;
      return data as Sector[];
    },
    enabled: !!user,
  });

  // ---- Agreement Expiry ----
  const { data: rawAgreements = [], isLoading: loadingAgreements } = useQuery({
    queryKey: ["report-agreements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(
          `agreement_id, decision_no, agreement_name, expiry_date, status, sector_id,
           sector:sectors(sector_name),
           employer:employers(employer_name)`
        )
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data as unknown as (AgreementExpiryRow & { sector_id: number | null })[];
    },
    enabled: !!user && selectedReport === "agreement_expiry",
  });

  const agreements = useMemo(() => {
    const now = new Date();
    let result = rawAgreements.map((a) => ({
      ...a,
      days_remaining: a.expiry_date
        ? Math.ceil(
            (new Date(a.expiry_date).getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null,
    }));
    if (sectorFilter !== "all") {
      result = result.filter((a) => a.sector_id?.toString() === sectorFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (withinDays) {
      const days = parseInt(withinDays, 10);
      if (!isNaN(days)) {
        result = result.filter(
          (a) => a.days_remaining !== null && a.days_remaining <= days
        );
      }
    }
    return result;
  }, [rawAgreements, sectorFilter, statusFilter, withinDays]);

  const handleExportExpiry = useCallback(() => {
    const dateStr = new Date().toISOString().slice(0, 10);
    exportToCsv(agreements, `agreement-expiry-report-${dateStr}.csv`);
  }, [agreements]);

  // ---- Principal Employer EBA Coverage ----
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
    enabled: !!user && selectedReport === "principal_employer_coverage",
  });

  const { data: ebaSummary = [], isLoading: loadingEbaSummary } = useQuery({
    queryKey: ["principal-employer-eba-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("principal_employer_eba_summary")
        .select("*")
        .order("principal_employer_name");
      if (error) throw error;
      return data as PrincipalEmployerEbaSummary[];
    },
    enabled: !!user && selectedReport === "principal_employer_coverage",
  });

  const { data: rawEbaCoverage = [], isLoading: loadingEbaCoverage } = useQuery({
    queryKey: ["eba-coverage-detail", peFilter],
    queryFn: async () => {
      let query = supabase
        .from("worksite_employer_eba_status")
        .select("*")
        .order("principal_employer_name", { ascending: true })
        .order("worksite_name", { ascending: true })
        .order("employer_name", { ascending: true });
      if (peFilter !== "all") {
        query = query.eq("principal_employer_id", Number(peFilter));
      } else {
        // Only show rows that are linked to a principal employer (via worksite)
        query = query.not("principal_employer_id", "is", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as WorksiteEmployerEbaStatus[];
    },
    enabled: !!user && selectedReport === "principal_employer_coverage",
  });

  const filteredEbaCoverage = useMemo((): EbaCoverageRow[] => {
    let result = rawEbaCoverage as EbaCoverageRow[];
    if (ebaCatFilter !== "all") {
      result = result.filter((r) => r.eba_status_category === ebaCatFilter);
    }
    return result;
  }, [rawEbaCoverage, ebaCatFilter]);

  const filteredSummary = useMemo(() => {
    if (peFilter === "all") return ebaSummary;
    return ebaSummary.filter(
      (pe) => pe.principal_employer_id === Number(peFilter)
    );
  }, [ebaSummary, peFilter]);

  const handleExportEba = useCallback(() => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const peName =
      peFilter === "all"
        ? "All"
        : principalEmployers.find((pe) => String(pe.employer_id) === peFilter)
            ?.employer_name ?? peFilter;
    ebaCoverageExportToCsv(
      filteredEbaCoverage,
      peName,
      `eba-coverage-${peName.toLowerCase()}-${dateStr}.csv`
    );
  }, [filteredEbaCoverage, peFilter, principalEmployers]);

  // ---- Worksite Relationship Explorer (Option A) ----
  const { data: explorerWorksites = [], isLoading: loadingExplorerWorksites } = useQuery({
    queryKey: ["explorer-worksites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("*")
        .order("worksite_name");
      if (error) throw error;
      return data as Worksite[];
    },
    enabled: !!user && selectedReport === "worksite_relationship_explorer",
  });

  const { data: explorerCoverage = [], isLoading: loadingExplorerCoverage } = useQuery({
    queryKey: ["explorer-coverage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksite_employer_eba_status")
        .select("*");
      if (error) throw error;
      return data as WorksiteEmployerEbaStatus[];
    },
    enabled: !!user && selectedReport === "worksite_relationship_explorer",
  });

  const { data: explorerRoles = [], isLoading: loadingExplorerRoles } = useQuery({
    queryKey: ["explorer-worksite-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_worksite_roles")
        .select("*")
        .eq("is_current", true);
      if (error) throw error;
      return data as EmployerWorksiteRole[];
    },
    enabled: !!user && selectedReport === "worksite_relationship_explorer",
  });

  const { data: explorerEmployers = [], isLoading: loadingExplorerEmployers } = useQuery({
    queryKey: ["explorer-employers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name, parent_employer_id, employer_category");
      if (error) throw error;
      return data as Pick<Employer, "employer_id" | "employer_name" | "parent_employer_id" | "employer_category">[];
    },
    enabled: !!user && selectedReport === "worksite_relationship_explorer",
  });

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  if (!selectedReport) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reportOptions.map((report) => (
            <Card
              key={report.type}
              className="cursor-pointer transition-shadow hover:shadow-lg"
              onClick={() => setSelectedReport(report.type)}
            >
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <div className="rounded-lg bg-muted p-2">{report.icon}</div>
                <div className="space-y-1 flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {report.title}
                    {report.isNew && (
                      <Badge variant="success" className="text-xs">New</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Button size="sm" className="w-full">
                  Run Report
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ---- Agreement Expiry ----
  if (selectedReport === "agreement_expiry") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedReport(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Agreement Expiry Report</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Sector</Label>
                <Select value={sectorFilter} onValueChange={setSectorFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Sectors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sectors</SelectItem>
                    {sectors.map((s) => (
                      <SelectItem
                        key={s.sector_id}
                        value={s.sector_id.toString()}
                      >
                        {s.sector_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Current">Current</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                    <SelectItem value="Under_Negotiation">Under Negotiation</SelectItem>
                    <SelectItem value="Terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expiring within (days)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 90"
                  value={withinDays}
                  onChange={(e) => setWithinDays(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <Button variant="outline" onClick={handleExportExpiry}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {loadingAgreements ? (
          <div className="flex items-center justify-center py-12">
            <EurekaLoadingSpinner size="lg" />
          </div>
        ) : (
          <DataTable<AgreementExpiryRow>
            data={agreements}
            columns={expiryColumns}
            searchPlaceholder="Search agreements..."
            searchKeys={["decision_no", "agreement_name"]}
          />
        )}
      </div>
    );
  }

  // ---- Principal Employer EBA Coverage ----
  if (selectedReport === "principal_employer_coverage") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedReport(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Star className="h-7 w-7 text-amber-500 fill-amber-500" />
            Principal Employer EBA Coverage
          </h1>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Principal Employer</Label>
                <Select value={peFilter} onValueChange={setPeFilter}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="All Principal Employers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Principal Employers</SelectItem>
                    {principalEmployers.map((pe) => (
                      <SelectItem
                        key={pe.employer_id}
                        value={String(pe.employer_id)}
                      >
                        {pe.employer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>EBA Status</Label>
                <Select value={ebaCatFilter} onValueChange={setEbaCatFilter}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {EBA_STATUS_META.map((m) => (
                      <SelectItem key={m.category} value={m.category}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handleExportEba}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary chart */}
        {loadingEbaSummary ? (
          <div className="flex items-center justify-center py-8">
            <EurekaLoadingSpinner size="lg" />
          </div>
        ) : filteredSummary.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>EBA Status Distribution</CardTitle>
              <CardDescription>
                % of employer-worksite pairs in each EBA status category
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PrincipalEmployerEbaChart data={filteredSummary} />
            </CardContent>
          </Card>
        ) : null}

        {/* Summary cards */}
        {filteredSummary.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredSummary.map((pe) => (
              <Card key={pe.principal_employer_id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    {pe.principal_employer_name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {pe.total_pairs} employer-worksite pair{pe.total_pairs !== 1 ? "s" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {EBA_STATUS_META.filter(
                    (m) => (pe[m.key] as number) > 0
                  ).map((meta) => (
                    <div key={meta.label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: meta.color }}
                        />
                        {meta.label}
                      </span>
                      <span className="font-medium">
                        {pe[meta.key] as number}{" "}
                        <span className="text-muted-foreground">
                          ({pe[meta.pctKey] as number}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Drilldown table */}
        <Card>
          <CardHeader>
            <CardTitle>Employer Coverage Detail</CardTitle>
            <CardDescription>
              Each row represents one employer active at one worksite within a Principal Employer&apos;s assets.
              {rawEbaCoverage.length === 0 && !loadingEbaCoverage &&
                " Assign Principal Employers to worksites and link employers to those worksites to populate this table."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {loadingEbaCoverage ? (
              <div className="flex items-center justify-center py-12">
                <EurekaLoadingSpinner size="lg" />
              </div>
            ) : (
              <DataTable<EbaCoverageRow>
                data={filteredEbaCoverage}
                columns={ebaCoverageColumns}
                searchPlaceholder="Search employers or worksites..."
                searchKeys={["employer_name", "worksite_name", "principal_employer_name"]}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Worksite Relationship Explorer ----
  if (selectedReport === "worksite_relationship_explorer") {
    const explorerLoading =
      loadingExplorerWorksites ||
      loadingExplorerCoverage ||
      loadingExplorerRoles ||
      loadingExplorerEmployers;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedReport(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Network className="h-7 w-7 text-blue-500" />
            Worksite Relationship Explorer
          </h1>
        </div>

        <WorksiteRelationshipExplorer
          worksites={explorerWorksites}
          coverageRows={explorerCoverage}
          worksiteRoles={explorerRoles}
          employers={explorerEmployers}
          isLoading={explorerLoading}
        />
      </div>
    );
  }

  // ---- Stub for other reports ----
  const reportInfo = reportOptions.find((r) => r.type === selectedReport);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedReport(null)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">{reportInfo?.title} Report</h1>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-lg bg-muted p-4 mb-4">{reportInfo?.icon}</div>
          <p className="text-lg font-medium mb-2">{reportInfo?.title}</p>
          <p className="text-muted-foreground max-w-md">
            This report is under development. The Agreement Expiry and Principal
            Employer EBA Coverage reports are fully functional — select them from
            the reports menu to view live data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
