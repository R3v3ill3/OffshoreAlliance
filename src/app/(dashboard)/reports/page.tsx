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
import type { Sector, AgreementStatus } from "@/types/database";
import {
  FileText,
  Users,
  Map,
  Megaphone,
  DollarSign,
  Calendar,
  Download,
  ArrowLeft,
  Loader2,
} from "lucide-react";

type ReportType =
  | "agreement_expiry"
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
}

const reportOptions: ReportOption[] = [
  {
    type: "agreement_expiry",
    title: "Agreement Expiry",
    description: "Track upcoming agreement expirations with days remaining and status breakdown.",
    icon: <FileText className="h-8 w-8 text-blue-500" />,
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

function daysBadgeVariant(days: number | null) {
  if (days === null) return "secondary" as const;
  if (days < 0) return "destructive" as const;
  if (days <= 90) return "warning" as const;
  if (days <= 180) return "info" as const;
  return "success" as const;
}

const expiryColumns: Column<AgreementExpiryRow>[] = [
  { key: "decision_no", header: "Decision No." },
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
    "Decision No",
    "Agreement",
    "Sector",
    "Employer",
    "Expiry Date",
    "Days Remaining",
    "Status",
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

export default function ReportsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);

  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [withinDays, setWithinDays] = useState<string>("");

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
      result = result.filter(
        (a) => a.sector_id?.toString() === sectorFilter
      );
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

  const handleExport = useCallback(() => {
    const dateStr = new Date().toISOString().slice(0, 10);
    exportToCsv(agreements, `agreement-expiry-report-${dateStr}.csv`);
  }, [agreements]);

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
                <div className="space-y-1">
                  <CardTitle className="text-base">{report.title}</CardTitle>
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
                    <SelectItem value="Under_Negotiation">
                      Under Negotiation
                    </SelectItem>
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

              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {loadingAgreements ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
            This report is under development. The Agreement Expiry report is
            fully functional — select it from the reports menu to view live data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
