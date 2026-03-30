"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, LayoutList, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AgreementsCalendar } from "@/components/agreements/agreements-calendar";
import type { AgreementStatus } from "@/types/database";

interface AgreementRow {
  agreement_id: number;
  decision_no: string;
  agreement_name: string;
  short_name: string | null;
  commencement_date: string | null;
  expiry_date: string | null;
  status: AgreementStatus;
  sector: { sector_name: string } | null;
  employer: { employer_name: string } | null;
  agreement_unions: { union: { union_code: string } | null }[];
  [key: string]: unknown;
}

const STATUS_VARIANT: Record<AgreementStatus, "success" | "destructive" | "info" | "secondary"> = {
  Current: "success",
  Expired: "destructive",
  Under_Negotiation: "info",
  Terminated: "secondary",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

function truncate(s: string, max = 50) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const columns: Column<AgreementRow>[] = [
  { key: "decision_no", header: "Decision No" },
  {
    key: "agreement_name",
    header: "Agreement Name",
    render: (row) => row.short_name || truncate(row.agreement_name),
  },
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
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={STATUS_VARIANT[row.status]}>
        {row.status.replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    key: "commencement_date",
    header: "Commencement",
    render: (row) => formatDate(row.commencement_date),
  },
  {
    key: "expiry_date",
    header: "Expiry",
    render: (row) => formatDate(row.expiry_date),
  },
  {
    key: "union_coverage",
    header: "Union Coverage",
    sortable: false,
    render: (row) => {
      const codes = row.agreement_unions
        ?.map((au) => au.union?.union_code)
        .filter(Boolean);
      return codes?.length ? codes.join(", ") : "—";
    },
  },
];

interface SectorOption {
  sector_id: number;
  sector_name: string;
}
interface EmployerOption {
  employer_id: number;
  employer_name: string;
}

const INITIAL_FORM = {
  decision_no: "",
  agreement_name: "",
  short_name: "",
  sector_id: "",
  employer_id: "",
  industry_classification: "",
  date_of_decision: "",
  commencement_date: "",
  expiry_date: "",
  status: "Current" as AgreementStatus,
  is_greenfield: false,
  is_variation: false,
  fwc_link: "",
  notes: "",
};

export default function AgreementsPage() {
  const router = useRouter();
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const { data: agreements = [], isLoading } = useQuery({
    queryKey: ["agreements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(
          `agreement_id, decision_no, agreement_name, short_name,
           commencement_date, expiry_date, status,
           sector:sectors(sector_name),
           employer:employers(employer_name),
           agreement_unions(union:unions(union_code))`
        )
        .order("decision_no", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as AgreementRow[];
    },
    enabled: !!user,
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sectors")
        .select("sector_id, sector_name")
        .order("sector_name");
      return (data ?? []) as SectorOption[];
    },
    enabled: !!user,
  });

  const { data: employers = [] } = useQuery({
    queryKey: ["employers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .order("employer_name");
      return (data ?? []) as EmployerOption[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        decision_no: form.decision_no,
        agreement_name: form.agreement_name,
        status: form.status,
        is_greenfield: form.is_greenfield,
        is_variation: form.is_variation,
      };
      if (form.short_name) payload.short_name = form.short_name;
      if (form.sector_id) payload.sector_id = Number(form.sector_id);
      if (form.employer_id) payload.employer_id = Number(form.employer_id);
      if (form.industry_classification) payload.industry_classification = form.industry_classification;
      if (form.date_of_decision) payload.date_of_decision = form.date_of_decision;
      if (form.commencement_date) payload.commencement_date = form.commencement_date;
      if (form.expiry_date) payload.expiry_date = form.expiry_date;
      if (form.fwc_link) payload.fwc_link = form.fwc_link;
      if (form.notes) payload.notes = form.notes;

      const { error } = await supabase.from("agreements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreements"] });
      setDialogOpen(false);
      setForm(INITIAL_FORM);
    },
  });

  const filtered = useMemo(() => {
    if (statusFilter === "all") return agreements;
    return agreements.filter((a) => a.status === statusFilter);
  }, [agreements, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Agreements</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border bg-muted/30 p-0.5">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 gap-1.5"
              onClick={() => setViewMode("table")}
            >
              <LayoutList className="h-4 w-4" />
              <span className="text-xs">Table</span>
            </Button>
            <Button
              variant={viewMode === "calendar" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 gap-1.5"
              onClick={() => setViewMode("calendar")}
            >
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs">Calendar</span>
            </Button>
          </div>
          {canWrite && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add Agreement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Agreement</DialogTitle>
                <DialogDescription>
                  Create a new enterprise bargaining agreement record.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="decision_no">Decision No *</Label>
                    <Input
                      id="decision_no"
                      value={form.decision_no}
                      onChange={(e) => setForm({ ...form, decision_no: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status *</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm({ ...form, status: v as AgreementStatus })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Current">Current</SelectItem>
                        <SelectItem value="Expired">Expired</SelectItem>
                        <SelectItem value="Under_Negotiation">Under Negotiation</SelectItem>
                        <SelectItem value="Terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agreement_name">Agreement Name *</Label>
                  <Input
                    id="agreement_name"
                    value={form.agreement_name}
                    onChange={(e) => setForm({ ...form, agreement_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="short_name">Short Name</Label>
                  <Input
                    id="short_name"
                    value={form.short_name}
                    onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sector_id">Sector</Label>
                    <Select
                      value={form.sector_id}
                      onValueChange={(v) => setForm({ ...form, sector_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select sector" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectors.map((s) => (
                          <SelectItem key={s.sector_id} value={String(s.sector_id)}>
                            {s.sector_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employer_id">Employer</Label>
                    <Select
                      value={form.employer_id}
                      onValueChange={(v) => setForm({ ...form, employer_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select employer" />
                      </SelectTrigger>
                      <SelectContent>
                        {employers.map((e) => (
                          <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                            {e.employer_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry_classification">Industry Classification</Label>
                  <Input
                    id="industry_classification"
                    value={form.industry_classification}
                    onChange={(e) => setForm({ ...form, industry_classification: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date_of_decision">Date of Decision</Label>
                    <Input
                      id="date_of_decision"
                      type="date"
                      value={form.date_of_decision}
                      onChange={(e) => setForm({ ...form, date_of_decision: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="commencement_date">Commencement</Label>
                    <Input
                      id="commencement_date"
                      type="date"
                      value={form.commencement_date}
                      onChange={(e) => setForm({ ...form, commencement_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiry_date">Expiry</Label>
                    <Input
                      id="expiry_date"
                      type="date"
                      value={form.expiry_date}
                      onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_greenfield}
                      onChange={(e) => setForm({ ...form, is_greenfield: e.target.checked })}
                      className="rounded border-input"
                    />
                    Greenfield Agreement
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_variation}
                      onChange={(e) => setForm({ ...form, is_variation: e.target.checked })}
                      className="rounded border-input"
                    />
                    Variation
                  </label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fwc_link">FWC Link</Label>
                  <Input
                    id="fwc_link"
                    type="url"
                    value={form.fwc_link}
                    onChange={(e) => setForm({ ...form, fwc_link: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!form.decision_no || !form.agreement_name || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating…" : "Create Agreement"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Label className="text-sm text-muted-foreground">Status</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Current">Current</SelectItem>
            <SelectItem value="Expired">Expired</SelectItem>
            <SelectItem value="Under_Negotiation">Under Negotiation</SelectItem>
            <SelectItem value="Terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {viewMode === "table" ? (
        <DataTable<AgreementRow>
          data={filtered}
          columns={columns}
          searchPlaceholder="Search by decision no, agreement name…"
          searchKeys={["decision_no", "agreement_name", "short_name"]}
          onRowClick={(row) => router.push(`/agreements/${row.agreement_id}`)}
          loading={isLoading}
        />
      ) : (
        <AgreementsCalendar agreements={filtered} />
      )}
    </div>
  );
}
