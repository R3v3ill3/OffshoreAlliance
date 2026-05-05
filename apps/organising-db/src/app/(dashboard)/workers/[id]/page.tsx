"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkerRelationshipsTab } from "@/components/campaigns/wall-chart/worker-relationships-tab";
import {
  MembershipNonOaFields,
  type NonOaUnionOptionRow,
  type UnionMembershipTypeOption,
} from "@/components/workers/membership-non-oa-fields";
import { WorkerCallHistoryPanel } from "@/components/workers/WorkerCallHistoryPanel";
import { WorkerObjectionsPanel } from "@/components/workers/WorkerObjectionsPanel";
import { WorkerIssueObservationsPanel } from "@/components/workers/WorkerIssueObservationsPanel";

const AU_STATES = ["WA", "NT", "QLD", "SA", "NSW", "VIC", "TAS", "ACT"];
const NONE_VALUE = "__none__";

function relOne<T>(v: unknown): T | null {
  if (v == null || v === undefined) return null;
  return (Array.isArray(v) ? v[0] : v) as T | null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface OccupationOption {
  occupation_id: number;
  canonical_name: string;
  group_name: string | null;
}

interface SpecialisationOption {
  specialisation_id: number;
  name: string;
  description: string | null;
}

interface WorkerDetail {
  worker_id: number;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  date_of_birth: string | null;
  gender: string | null;
  occupation: string | null;
  classification: string | null;
  canonical_occupation_id: number | null;
  member_number: string | null;
  join_date: string | null;
  resignation_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  employer_id: number | null;
  worksite_id: number | null;
  project_id: number | null;
  member_role_type_id: number | null;
  union_membership_type_id: number | null;
  non_oa_union_option_id: number | null;
  union_id: number | null;
  is_hsr: boolean | null;
  employer: { employer_name: string } | null;
  worksite: { worksite_name: string } | null;
  project: { project_id: number; project_name: string } | null;
  member_role_type: { display_name: string } | null;
  union_membership_type: { display_name: string; type_name: string } | null;
  non_oa_union_option: {
    badge_initials: string;
    display_name: string;
    non_oa_union_option_id: number;
  } | null;
  union: { union_code: string; union_name: string } | null;
  canonical_occupation: {
    occupation_id: number;
    canonical_name: string;
    occupation_group: { name: string } | null;
  } | null;
}

type WorkerEditForm = {
  first_name: string;
  last_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  date_of_birth: string;
  gender: string;
  occupation: string;
  classification: string;
  canonical_occupation_id: number | null;
  shift_id: number | null;
  work_area_id: number | null;
  roster_panel_id: number | null;
  employer_id: number | null;
  worksite_id: number | null;
  project_id: number | null;
  member_role_type_id: number | null;
  union_membership_type_id: number | null;
  non_oa_union_option_id: number | null;
  union_id: number | null;
  member_number: string;
  join_date: string;
  resignation_date: string;
  notes: string;
  is_active: boolean;
  is_hsr: boolean | null;
  additional_occupation_ids: number[];
  specialisation_ids: number[];
};

interface WorkerAgreement {
  agreement_id: number;
  agreement: {
    agreement_id: number;
    decision_no: string;
    agreement_name: string;
    status: string;
    expiry_date: string | null;
  };
}

interface WorkerAssignmentRow {
  assignment_id: number;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  contract: {
    contract_id: number;
    engagement_type: string | null;
    worksite: { worksite_id: number; worksite_name: string } | null;
    work_scope: { scope_id: number; scope_name: string } | null;
    contractor: { employer_id: number; employer_name: string } | null;
    agreement: {
      agreement_id: number;
      decision_no: string;
      agreement_name: string;
      short_name: string | null;
      status: string;
      expiry_date: string | null;
    } | null;
    program: { program_id: number; program_name: string } | null;
    project: { project_id: number; project_name: string } | null;
  } | null;
}

interface ContractOption {
  contract_id: number;
  label: string;
}

// ─── Occupation combobox ─────────────────────────────────────────────────────

function OccupationCombobox({
  value,
  onChange,
  options,
  placeholder = "Search occupations…",
  disabled = false,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  options: OccupationOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.occupation_id === value) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.canonical_name.toLowerCase().includes(q) ||
        (o.group_name?.toLowerCase().includes(q) ?? false)
    );
  }, [search, options]);

  // Group the filtered results by group_name
  const grouped = useMemo(() => {
    const map = new Map<string, OccupationOption[]>();
    for (const o of filtered) {
      const key = o.group_name ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(id: number) {
    onChange(id);
    setSearch("");
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex h-9 w-full cursor-text items-center rounded-md border border-input bg-background px-3 text-sm shadow-sm"
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            setSearch("");
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            value={search}
            placeholder={placeholder}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setOpen(true)}
          />
        ) : (
          <span className={selected ? "flex-1 truncate" : "flex-1 text-muted-foreground"}>
            {selected ? selected.canonical_name : placeholder}
          </span>
        )}
        {selected && !open && (
          <button
            type="button"
            className="ml-1 rounded text-muted-foreground hover:text-foreground"
            onClick={handleClear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">No occupations found.</p>
          ) : (
            [...grouped.entries()].map(([group, items]) => (
              <div key={group}>
                <div className="sticky top-0 bg-muted/80 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
                  {group}
                </div>
                {items.map((o) => (
                  <button
                    key={o.occupation_id}
                    type="button"
                    className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                      o.occupation_id === value ? "bg-accent/50 font-medium" : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(o.occupation_id);
                    }}
                  >
                    {o.canonical_name}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 py-3 sm:py-2 border-b last:border-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-1 sm:col-span-2 text-sm">{value || "—"}</dd>
    </div>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd MMM yyyy");
}

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function workerToEditForm(
  w: WorkerDetail,
  additionalIds: number[],
  specialisationIds: number[]
): WorkerEditForm {
  return {
    first_name: w.first_name,
    last_name: w.last_name,
    preferred_name: w.preferred_name ?? "",
    email: w.email ?? "",
    phone: w.phone ?? "",
    address: w.address ?? "",
    suburb: w.suburb ?? "",
    state: w.state ?? "",
    postcode: w.postcode ?? "",
    date_of_birth: dateInputValue(w.date_of_birth),
    gender: w.gender ?? "",
    occupation: w.occupation ?? "",
    classification: w.classification ?? "",
    canonical_occupation_id: w.canonical_occupation_id,
    shift_id: (w as { shift_id?: number | null }).shift_id ?? null,
    work_area_id: (w as { work_area_id?: number | null }).work_area_id ?? null,
    roster_panel_id:
      (w as { roster_panel_id?: number | null }).roster_panel_id ?? null,
    employer_id: w.employer_id,
    worksite_id: w.worksite_id,
    project_id: w.project_id,
    member_role_type_id: w.member_role_type_id,
    union_membership_type_id: w.union_membership_type_id,
    non_oa_union_option_id: w.non_oa_union_option_id,
    union_id: w.union_id,
    member_number: w.member_number ?? "",
    join_date: dateInputValue(w.join_date),
    resignation_date: dateInputValue(w.resignation_date),
    notes: w.notes ?? "",
    is_active: w.is_active,
    is_hsr: w.is_hsr,
    additional_occupation_ids: additionalIds,
    specialisation_ids: specialisationIds,
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WorkerDetailPage() {
  const params = useParams<{ id: string }>();
  const workerId = Number(params.id);
  const workerIdValid = Number.isFinite(workerId);
  const router = useRouter();
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<WorkerEditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addOccupationId, setAddOccupationId] = useState<string>("");

  const [dlgAssign, setDlgAssign] = useState(false);
  const [selContractId, setSelContractId] = useState("");
  const [dlgLoading, setDlgLoading] = useState(false);
  const [dlgError, setDlgError] = useState<string | null>(null);

  // ── Worker detail query ──────────────────────────────────────────────────
  const { data: worker, isLoading, isError, error: workerQueryError } = useQuery({
    queryKey: ["worker", params.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select(
          `*,
           employer:employers!workers_employer_id_fkey(employer_name),
           worksite:worksites!workers_worksite_id_fkey(worksite_name),
           project:projects!workers_project_id_fkey(project_id, project_name),
           member_role_type:member_role_types!workers_member_role_type_id_fkey(display_name),
           union_membership_type:union_membership_types!workers_union_membership_type_id_fkey(display_name, type_name),
           non_oa_union_option:non_oa_union_options!workers_non_oa_union_option_id_fkey(
             non_oa_union_option_id, badge_initials, display_name
           ),
           union:unions!workers_union_id_fkey(union_code, union_name),
           canonical_occupation:occupations!workers_canonical_occupation_id_fkey(
             occupation_id,
             canonical_name,
             occupation_group:occupation_groups!occupations_occupation_group_id_fkey(name)
           )`
        )
        .eq("worker_id", workerId)
        .single();

      if (error) throw error;
      const d = data as Record<string, unknown> & Omit<WorkerDetail, "union_membership_type" | "non_oa_union_option">;
      return {
        ...d,
        union_membership_type: relOne<WorkerDetail["union_membership_type"]>(d.union_membership_type),
        non_oa_union_option: relOne<WorkerDetail["non_oa_union_option"]>(d.non_oa_union_option),
      } as WorkerDetail;
    },
    enabled: !!user && workerIdValid,
  });

  // ── Additional occupations for this worker ───────────────────────────────
  const { data: workerAdditionalOccupations = [] } = useQuery({
    queryKey: ["worker-additional-occupations", params.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_additional_occupations")
        .select("occupation_id, occupation:occupations(occupation_id, canonical_name, occupation_group:occupation_groups(name))")
        .eq("worker_id", workerId);
      if (error) throw error;
      return (data ?? []) as unknown as {
        occupation_id: number;
        occupation: { occupation_id: number; canonical_name: string; occupation_group: { name: string } | null };
      }[];
    },
    enabled: !!user && workerIdValid,
  });

  // ── Worker specialisations ───────────────────────────────────────────────
  const { data: workerSpecialisations = [] } = useQuery({
    queryKey: ["worker-specialisations", params.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_specialisations")
        .select("specialisation_id, specialisation:specialisations(specialisation_id, name)")
        .eq("worker_id", workerId);
      if (error) throw error;
      return (data ?? []) as unknown as {
        specialisation_id: number;
        specialisation: { specialisation_id: number; name: string };
      }[];
    },
    enabled: !!user && workerIdValid,
  });

  // ── Reference data (only when editing) ──────────────────────────────────
  const { data: allOccupations = [] } = useQuery({
    queryKey: ["occupations-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupations")
        .select("occupation_id, canonical_name, occupation_group:occupation_groups(name)")
        .eq("is_active", true)
        .order("canonical_name");
      if (error) throw error;
      return (data ?? []).map((o) => ({
        occupation_id: o.occupation_id,
        canonical_name: o.canonical_name,
        group_name: (o.occupation_group as unknown as { name: string } | null)?.name ?? null,
      })) as OccupationOption[];
    },
    enabled: !!user && editing,
  });

  const { data: allSpecialisations = [] } = useQuery({
    queryKey: ["specialisations-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialisations")
        .select("specialisation_id, name, description")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as SpecialisationOption[];
    },
    enabled: !!user && editing,
  });

  const { data: memberRoleTypes = [] } = useQuery({
    queryKey: ["member-role-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_role_types")
        .select("role_type_id, display_name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as { role_type_id: number; display_name: string }[];
    },
    enabled: !!user && editing,
  });

  const { data: unionMembershipTypes = [] } = useQuery({
    queryKey: ["union-membership-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("union_membership_types")
        .select("union_membership_type_id, display_name, type_name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as UnionMembershipTypeOption[];
    },
    enabled: !!user && editing,
  });

  const { data: unionsList = [] } = useQuery({
    queryKey: ["unions-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unions")
        .select("union_id, union_code, union_name")
        .order("union_name");
      if (error) throw error;
      return data as { union_id: number; union_code: string; union_name: string }[];
    },
    enabled: !!user && editing,
  });

  const { data: shiftOptions = [] } = useQuery({
    queryKey: ["worker-shift-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_shift_options")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: number; name: string }[];
    },
    enabled: !!user && editing,
  });

  const { data: workAreaOptions = [] } = useQuery({
    queryKey: ["worker-work-area-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_work_area_options")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: number; name: string }[];
    },
    enabled: !!user && editing,
  });

  const { data: rosterPanelOptions = [] } = useQuery({
    queryKey: ["worker-roster-panel-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_roster_panel_options")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: number; name: string }[];
    },
    enabled: !!user && editing,
  });

  const { data: nonOaUnionOptionsList = [] } = useQuery({
    queryKey: ["non-oa-union-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("non_oa_union_options")
        .select("non_oa_union_option_id, badge_initials, display_name")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as NonOaUnionOptionRow[];
    },
    enabled: !!user && editing,
  });

  const { data: employersList = [] } = useQuery({
    queryKey: ["employers-all-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .order("employer_name");
      if (error) throw error;
      return data as { employer_id: number; employer_name: string }[];
    },
    enabled: !!user && editing,
  });

  const { data: worksitesList = [] } = useQuery({
    queryKey: ["worksites-all-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .eq("is_active", true)
        .order("worksite_name");
      if (error) throw error;
      return data as { worksite_id: number; worksite_name: string }[];
    },
    enabled: !!user && editing,
  });

  const editWorksiteId = editForm?.worksite_id ?? null;
  const { data: projectsForWorksite = [], isFetched: projectsForWorksiteFetched } = useQuery({
    queryKey: ["projects-for-worksite", editWorksiteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("project_id, project_name")
        .eq("worksite_id", editWorksiteId!)
        .eq("is_active", true)
        .order("project_name");
      if (error) throw error;
      return data as { project_id: number; project_name: string }[];
    },
    enabled: !!user && editing && editWorksiteId != null,
  });

  useEffect(() => {
    if (!editing || !editForm) return;
    if (editForm.worksite_id == null) {
      if (editForm.project_id != null) {
        setEditForm((prev) => (prev ? { ...prev, project_id: null } : prev));
      }
      return;
    }
    if (!projectsForWorksiteFetched) return;
    if (editForm.project_id == null) return;
    const ok = projectsForWorksite.some((p) => p.project_id === editForm.project_id);
    if (!ok) setEditForm((prev) => (prev ? { ...prev, project_id: null } : prev));
  }, [editing, editForm?.worksite_id, editForm?.project_id, projectsForWorksite, projectsForWorksiteFetched]);

  // ── Agreements ───────────────────────────────────────────────────────────
  const { data: workerAgreements = [], isLoading: loadingAgreements } = useQuery({
    queryKey: ["worker-agreements", params.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_agreements")
        .select(
          `agreement_id,
           agreement:agreements(agreement_id, decision_no, agreement_name, status, expiry_date)`
        )
        .eq("worker_id", workerId);
      if (error) throw error;
      return (data ?? []) as unknown as WorkerAgreement[];
    },
    enabled: !!user && workerIdValid,
  });

  // ── Assignments ──────────────────────────────────────────────────────────
  const { data: workerAssignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["worker-assignments", params.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_assignments")
        .select(
          `assignment_id, is_current, start_date, end_date, notes,
           contract:worksite_contracts(
             contract_id, engagement_type,
             worksite:worksites(worksite_id, worksite_name),
             work_scope:work_scopes(scope_id, scope_name),
             contractor:employers(employer_id, employer_name),
             agreement:agreements(agreement_id, decision_no, agreement_name, short_name, status, expiry_date),
             program:programs(program_id, program_name),
             project:projects(project_id, project_name)
           )`
        )
        .eq("worker_id", workerId)
        .order("is_current", { ascending: false })
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WorkerAssignmentRow[];
    },
    enabled: !!user && workerIdValid,
  });

  const { data: availableContracts = [], isLoading: loadingContracts } = useQuery({
    queryKey: ["worksite-contracts-for-worker", params.id, worker?.worksite_id],
    queryFn: async () => {
      if (!worker?.worksite_id) return [];
      const { data, error } = await supabase
        .from("worksite_contracts")
        .select(
          `contract_id,
           engagement_type,
           work_scope:work_scopes(scope_name),
           contractor:employers(employer_name),
           program:programs(program_name),
           project:projects(project_name),
           agreement:agreements(decision_no, short_name, agreement_name)`
        )
        .eq("worksite_id", worker.worksite_id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as {
        contract_id: number;
        engagement_type: string | null;
        work_scope?: { scope_name: string } | null;
        contractor?: { employer_name: string } | null;
        program?: { program_name: string } | null;
        project?: { project_name: string } | null;
        agreement?: { decision_no: string; short_name: string | null; agreement_name: string } | null;
      }[];
    },
    enabled: !!user && workerIdValid && worker?.worksite_id != null,
  });

  const contractOptions = useMemo<ContractOption[]>(() => {
    return availableContracts
      .map((c) => {
        const scope = c.work_scope?.scope_name ?? "Scope";
        const contractor = c.contractor?.employer_name ?? "Employer";
        const ctx: string[] = [];
        if (c.program?.program_name) ctx.push(`Program: ${c.program.program_name}`);
        if (c.project?.project_name) ctx.push(`Project: ${c.project.project_name}`);
        if (c.agreement?.decision_no) ctx.push(`EBA: ${c.agreement.decision_no}`);
        const base = `${scope} — ${contractor}`;
        return { contract_id: c.contract_id, label: ctx.length ? `${base} (${ctx.join(", ")})` : base };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [availableContracts]);

  // ── Additional occupations available to add ──────────────────────────────
  const additionalOccupationOptions = useMemo(() => {
    if (!editForm) return allOccupations;
    const excluded = new Set([
      ...(editForm.canonical_occupation_id != null ? [editForm.canonical_occupation_id] : []),
      ...editForm.additional_occupation_ids,
    ]);
    return allOccupations.filter((o) => !excluded.has(o.occupation_id));
  }, [allOccupations, editForm?.canonical_occupation_id, editForm?.additional_occupation_ids]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const resetAssignDlg = () => {
    setDlgError(null);
    setDlgLoading(false);
    setSelContractId("");
  };

  const handleLinkAssignment = async () => {
    if (!selContractId) return;
    setDlgLoading(true);
    setDlgError(null);
    const { error } = await supabase.from("worker_assignments").insert({
      worker_id: workerId,
      contract_id: Number(selContractId),
      is_current: true,
    });
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worker-assignments", params.id] });
    setDlgAssign(false);
    resetAssignDlg();
  };

  const handleRemoveAssignment = async (assignmentId: number) => {
    const { error } = await supabase.from("worker_assignments").delete().eq("assignment_id", assignmentId);
    if (error) return;
    await queryClient.invalidateQueries({ queryKey: ["worker-assignments", params.id] });
  };

  const handleToggleAssignmentCurrent = async (row: WorkerAssignmentRow) => {
    const { error } = await supabase
      .from("worker_assignments")
      .update({ is_current: !row.is_current })
      .eq("assignment_id", row.assignment_id);
    if (error) return;
    await queryClient.invalidateQueries({ queryKey: ["worker-assignments", params.id] });
  };

  const startEditing = () => {
    if (!worker) return;
    const additionalIds = workerAdditionalOccupations.map((a) => a.occupation_id);
    const specialisationIds = workerSpecialisations.map((s) => s.specialisation_id);
    setEditForm(workerToEditForm(worker, additionalIds, specialisationIds));
    setEditing(true);
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm(null);
    setSaveError(null);
    setAddOccupationId("");
  };

  const patchForm = (patch: Partial<WorkerEditForm>) => {
    setEditForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleAddOccupation = () => {
    const id = Number(addOccupationId);
    if (!id || !editForm) return;
    if (editForm.additional_occupation_ids.includes(id)) return;
    patchForm({ additional_occupation_ids: [...editForm.additional_occupation_ids, id] });
    setAddOccupationId("");
  };

  const handleRemoveAdditionalOccupation = (id: number) => {
    if (!editForm) return;
    patchForm({ additional_occupation_ids: editForm.additional_occupation_ids.filter((x) => x !== id) });
  };

  const handleToggleSpecialisation = (id: number, checked: boolean) => {
    if (!editForm) return;
    const current = editForm.specialisation_ids;
    patchForm({
      specialisation_ids: checked ? [...current, id] : current.filter((x) => x !== id),
    });
  };

  const saveEdits = async () => {
    if (!worker || !editForm) return;
    const fn = editForm.first_name.trim();
    const ln = editForm.last_name.trim();
    if (!fn || !ln) { setSaveError("First name and last name are required."); return; }

    setSaving(true);
    setSaveError(null);

    // 1. Update core worker fields
    const payload = {
      first_name: fn,
      last_name: ln,
      preferred_name: emptyToNull(editForm.preferred_name),
      email: emptyToNull(editForm.email),
      phone: emptyToNull(editForm.phone),
      address: emptyToNull(editForm.address),
      suburb: emptyToNull(editForm.suburb),
      state: emptyToNull(editForm.state),
      postcode: emptyToNull(editForm.postcode),
      date_of_birth: editForm.date_of_birth.trim() || null,
      gender: emptyToNull(editForm.gender),
      occupation: emptyToNull(editForm.occupation),
      classification: emptyToNull(editForm.classification),
      canonical_occupation_id: editForm.canonical_occupation_id,
      shift_id: editForm.shift_id,
      work_area_id: editForm.work_area_id,
      roster_panel_id: editForm.roster_panel_id,
      employer_id: editForm.employer_id,
      worksite_id: editForm.worksite_id,
      project_id: editForm.project_id,
      member_role_type_id: editForm.member_role_type_id,
      union_membership_type_id: editForm.union_membership_type_id,
      non_oa_union_option_id: editForm.non_oa_union_option_id,
      union_id: editForm.union_id,
      is_hsr: editForm.is_hsr,
      member_number: emptyToNull(editForm.member_number),
      join_date: editForm.join_date.trim() || null,
      resignation_date: editForm.resignation_date.trim() || null,
      notes: emptyToNull(editForm.notes),
      is_active: editForm.is_active,
    };

    const { error: workerError } = await supabase
      .from("workers")
      .update(payload)
      .eq("worker_id", worker.worker_id);

    if (workerError) { setSaveError(workerError.message); setSaving(false); return; }

    // 2. Sync additional occupations (delete + re-insert)
    const { error: delAddlError } = await supabase
      .from("worker_additional_occupations")
      .delete()
      .eq("worker_id", worker.worker_id);

    if (!delAddlError && editForm.additional_occupation_ids.length > 0) {
      await supabase.from("worker_additional_occupations").insert(
        editForm.additional_occupation_ids.map((occupation_id) => ({
          worker_id: worker.worker_id,
          occupation_id,
        }))
      );
    }

    // 3. Sync specialisations (delete + re-insert)
    const { error: delSpecError } = await supabase
      .from("worker_specialisations")
      .delete()
      .eq("worker_id", worker.worker_id);

    if (!delSpecError && editForm.specialisation_ids.length > 0) {
      await supabase.from("worker_specialisations").insert(
        editForm.specialisation_ids.map((specialisation_id) => ({
          worker_id: worker.worker_id,
          specialisation_id,
        }))
      );
    }

    await queryClient.invalidateQueries({ queryKey: ["worker", params.id] });
    await queryClient.invalidateQueries({ queryKey: ["non-oa-union-options"] });
    await queryClient.invalidateQueries({ queryKey: ["worker-additional-occupations", params.id] });
    await queryClient.invalidateQueries({ queryKey: ["worker-specialisations", params.id] });
    await queryClient.invalidateQueries({ queryKey: ["workers"] });
    await queryClient.invalidateQueries({ queryKey: ["worksite-contracts-for-worker", params.id] });

    setEditing(false);
    setEditForm(null);
    setSaving(false);
    setAddOccupationId("");
  };

  // ── Derived display values ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 max-w-lg mx-auto text-center">
        <p className="text-destructive font-medium">Could not load this worker.</p>
        <p className="text-sm text-muted-foreground">
          {workerQueryError instanceof Error ? workerQueryError.message : String(workerQueryError)}
        </p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Worker not found.</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const f = editForm;
  const displayFirst = editing && f ? f.first_name : worker.first_name;
  const displayLast = editing && f ? f.last_name : worker.last_name;
  const displayActive = editing && f ? f.is_active : worker.is_active;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {displayFirst} {displayLast}
            </h1>
            <p className="text-sm text-muted-foreground">Worker ID: {worker.worker_id}</p>
          </div>
          <Badge variant={displayActive ? "success" : "secondary"}>
            {displayActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        {canWrite && !editing && (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
        {canWrite && editing && f && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
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

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="agreements">Agreements</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
        </TabsList>

        {/* ── Details tab ──────────────────────────────────────────────── */}
        <TabsContent value="details" className="space-y-6 mt-4">
          {editing && f ? (
            <>
              {/* Personal */}
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="worker-first-name">First name</Label>
                      <Input
                        id="worker-first-name"
                        value={f.first_name}
                        onChange={(e) => patchForm({ first_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="worker-last-name">Last name</Label>
                      <Input
                        id="worker-last-name"
                        value={f.last_name}
                        onChange={(e) => patchForm({ last_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="worker-preferred-name">Preferred name</Label>
                    <Input
                      id="worker-preferred-name"
                      value={f.preferred_name}
                      onChange={(e) => patchForm({ preferred_name: e.target.value })}
                      placeholder="e.g. nickname or goes-by name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="worker-email">Email</Label>
                    <Input
                      id="worker-email"
                      type="email"
                      value={f.email}
                      onChange={(e) => patchForm({ email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="worker-phone">Phone</Label>
                    <Input
                      id="worker-phone"
                      value={f.phone}
                      onChange={(e) => patchForm({ phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="worker-dob">Date of birth</Label>
                    <Input
                      id="worker-dob"
                      type="date"
                      value={f.date_of_birth}
                      onChange={(e) => patchForm({ date_of_birth: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="worker-gender">Gender</Label>
                    <Input
                      id="worker-gender"
                      value={f.gender}
                      onChange={(e) => patchForm({ gender: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="worker-address">Address</Label>
                    <Input
                      id="worker-address"
                      value={f.address}
                      onChange={(e) => patchForm({ address: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="worker-suburb">Suburb</Label>
                      <Input
                        id="worker-suburb"
                        value={f.suburb}
                        onChange={(e) => patchForm({ suburb: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Select
                        value={f.state || NONE_VALUE}
                        onValueChange={(v) => patchForm({ state: v === NONE_VALUE ? "" : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>—</SelectItem>
                          {AU_STATES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="worker-postcode">Postcode</Label>
                      <Input
                        id="worker-postcode"
                        value={f.postcode}
                        onChange={(e) => patchForm({ postcode: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Employment */}
              <Card>
                <CardHeader>
                  <CardTitle>Employment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Employer</Label>
                    <Select
                      value={f.employer_id != null ? String(f.employer_id) : NONE_VALUE}
                      onValueChange={(v) => patchForm({ employer_id: v === NONE_VALUE ? null : Number(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select employer" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={NONE_VALUE}>—</SelectItem>
                        {employersList.map((e) => (
                          <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                            {e.employer_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Worksite</Label>
                    <Select
                      value={f.worksite_id != null ? String(f.worksite_id) : NONE_VALUE}
                      onValueChange={(v) => patchForm({ worksite_id: v === NONE_VALUE ? null : Number(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select worksite" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={NONE_VALUE}>—</SelectItem>
                        {worksitesList.map((ws) => (
                          <SelectItem key={ws.worksite_id} value={String(ws.worksite_id)}>
                            {ws.worksite_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select
                      value={f.project_id != null ? String(f.project_id) : NONE_VALUE}
                      onValueChange={(v) => patchForm({ project_id: v === NONE_VALUE ? null : Number(v) })}
                      disabled={f.worksite_id == null}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={f.worksite_id == null ? "Select a worksite first" : "Select project (optional)"}
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={NONE_VALUE}>—</SelectItem>
                        {projectsForWorksite.map((p) => (
                          <SelectItem key={p.project_id} value={String(p.project_id)}>
                            {p.project_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {f.worksite_id != null && projectsForWorksite.length === 0 && (
                      <p className="text-xs text-muted-foreground">No active projects at this worksite.</p>
                    )}
                  </div>

                  {/* Primary (canonical) occupation */}
                  <div className="space-y-2">
                    <Label>Primary Occupation</Label>
                    <OccupationCombobox
                      value={f.canonical_occupation_id}
                      onChange={(id) => patchForm({ canonical_occupation_id: id })}
                      options={allOccupations.filter(
                        (o) => !f.additional_occupation_ids.includes(o.occupation_id)
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      Select from the standardised occupation list.
                    </p>
                  </div>

                  {/* Additional occupations */}
                  <div className="space-y-2">
                    <Label>Additional Occupations</Label>
                    {f.additional_occupation_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {f.additional_occupation_ids.map((id) => {
                          const occ = allOccupations.find((o) => o.occupation_id === id);
                          return (
                            <Badge key={id} variant="secondary" className="gap-1 pr-1">
                              {occ?.canonical_name ?? `ID ${id}`}
                              <button
                                type="button"
                                className="rounded hover:text-destructive"
                                onClick={() => handleRemoveAdditionalOccupation(id)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Select
                          value={addOccupationId}
                          onValueChange={setAddOccupationId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Add an additional occupation…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {additionalOccupationOptions.map((o) => (
                              <SelectItem key={o.occupation_id} value={String(o.occupation_id)}>
                                {o.canonical_name}
                                {o.group_name && (
                                  <span className="text-muted-foreground"> · {o.group_name}</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddOccupation}
                        disabled={!addOccupationId}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      For dual-trade workers, e.g. Boilermaker + Welder.
                    </p>
                  </div>

                  {/* Specialisations */}
                  <div className="space-y-2">
                    <Label>Specialisations</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {allSpecialisations.map((spec) => (
                        <div key={spec.specialisation_id} className="flex items-start gap-2">
                          <Checkbox
                            id={`spec-${spec.specialisation_id}`}
                            checked={f.specialisation_ids.includes(spec.specialisation_id)}
                            onCheckedChange={(checked) =>
                              handleToggleSpecialisation(spec.specialisation_id, !!checked)
                            }
                          />
                          <label
                            htmlFor={`spec-${spec.specialisation_id}`}
                            className="text-sm leading-none cursor-pointer"
                          >
                            {spec.name}
                            {spec.description && (
                              <span className="block text-xs text-muted-foreground mt-0.5">
                                {spec.description}
                              </span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cross-cutting qualifications that apply on top of the primary occupation.
                    </p>
                  </div>

                  {/* Legacy raw occupation */}
                  <div className="space-y-2 pt-2 border-t">
                    <Label htmlFor="worker-occupation" className="text-muted-foreground">
                      Raw occupation (legacy)
                    </Label>
                    <Input
                      id="worker-occupation"
                      value={f.occupation}
                      onChange={(e) => patchForm({ occupation: e.target.value })}
                      className="text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      Original free-text entry from source data. Use Primary Occupation above for the canonical value.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="worker-classification">Classification</Label>
                    <Input
                      id="worker-classification"
                      value={f.classification}
                      onChange={(e) => patchForm({ classification: e.target.value })}
                    />
                  </div>

                  {/* Worker dimensions: typed shift / work area / roster
                      panel labels. Drive the campaign sub-unit splits and
                      the list-builder filters; managed under
                      Administration → Worker dimensions. */}
                  <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t">
                    <div className="space-y-1.5">
                      <Label>Shift</Label>
                      <Select
                        value={
                          f.shift_id != null ? String(f.shift_id) : NONE_VALUE
                        }
                        onValueChange={(v) =>
                          patchForm({
                            shift_id: v === NONE_VALUE ? null : Number(v),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>—</SelectItem>
                          {shiftOptions.map((o) => (
                            <SelectItem key={o.id} value={String(o.id)}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Work area</Label>
                      <Select
                        value={
                          f.work_area_id != null
                            ? String(f.work_area_id)
                            : NONE_VALUE
                        }
                        onValueChange={(v) =>
                          patchForm({
                            work_area_id:
                              v === NONE_VALUE ? null : Number(v),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>—</SelectItem>
                          {workAreaOptions.map((o) => (
                            <SelectItem key={o.id} value={String(o.id)}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Roster panel</Label>
                      <Select
                        value={
                          f.roster_panel_id != null
                            ? String(f.roster_panel_id)
                            : NONE_VALUE
                        }
                        onValueChange={(v) =>
                          patchForm({
                            roster_panel_id:
                              v === NONE_VALUE ? null : Number(v),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>—</SelectItem>
                          {rosterPanelOptions.map((o) => (
                            <SelectItem key={o.id} value={String(o.id)}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Membership */}
              <Card>
                <CardHeader>
                  <CardTitle>Membership</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MembershipNonOaFields
                    disabled={saving || !canWrite}
                    membershipTypes={unionMembershipTypes}
                    nonOaUnionOptions={nonOaUnionOptionsList}
                    invalidateQueryKeys={[["non-oa-union-options"], ["worker", params.id]]}
                    unionMembershipTypeId={f.union_membership_type_id}
                    nonOaUnionOptionId={f.non_oa_union_option_id}
                    onUnionMembershipChange={(id) => {
                      const prevIsNonOa = unionMembershipTypes.some(
                        (t) =>
                          t.union_membership_type_id === f.union_membership_type_id &&
                          t.type_name === "non_oa_member"
                      );
                      const nextIsNonOa = unionMembershipTypes.some(
                        (t) =>
                          t.union_membership_type_id === id &&
                          t.type_name === "non_oa_member"
                      );
                      patchForm({
                        union_membership_type_id: id,
                        non_oa_union_option_id:
                          !nextIsNonOa ? null : prevIsNonOa ? f.non_oa_union_option_id : null,
                      });
                    }}
                    onNonOaUnionChange={(id) => patchForm({ non_oa_union_option_id: id })}
                  />
                  <div className="space-y-2">
                    <Label>Organising role</Label>
                    <Select
                      value={f.member_role_type_id != null ? String(f.member_role_type_id) : NONE_VALUE}
                      onValueChange={(v) =>
                        patchForm({ member_role_type_id: v === NONE_VALUE ? null : Number(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>—</SelectItem>
                        {memberRoleTypes.map((r) => (
                          <SelectItem key={r.role_type_id} value={String(r.role_type_id)}>
                            {r.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Union</Label>
                    <Select
                      value={f.union_id != null ? String(f.union_id) : NONE_VALUE}
                      onValueChange={(v) =>
                        patchForm({ union_id: v === NONE_VALUE ? null : Number(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select union" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={NONE_VALUE}>—</SelectItem>
                        {unionsList.map((u) => (
                          <SelectItem key={u.union_id} value={String(u.union_id)}>
                            {u.union_code} — {u.union_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="worker-member-number">Member number</Label>
                    <Input
                      id="worker-member-number"
                      value={f.member_number}
                      onChange={(e) => patchForm({ member_number: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="worker-hsr"
                      checked={f.is_hsr === true}
                      onCheckedChange={(c) =>
                        patchForm({ is_hsr: c === true ? true : null })
                      }
                    />
                    <label htmlFor="worker-hsr" className="text-sm font-medium leading-none">
                      Health and safety representative (HSR)
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="worker-join">Join date</Label>
                      <Input
                        id="worker-join"
                        type="date"
                        value={f.join_date}
                        onChange={(e) => patchForm({ join_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="worker-resign">Resignation date</Label>
                      <Input
                        id="worker-resign"
                        type="date"
                        value={f.resignation_date}
                        onChange={(e) => patchForm({ resignation_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={f.is_active ? "active" : "inactive"}
                      onValueChange={(v) => patchForm({ is_active: v === "active" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={f.notes}
                    onChange={(e) => patchForm({ notes: e.target.value })}
                    rows={4}
                    placeholder="Internal notes…"
                  />
                </CardContent>
              </Card>

            </>
          ) : (
            <>
              {/* Personal */}
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl>
                    <FieldRow label="Full Name" value={`${worker.first_name} ${worker.last_name}`} />
                    {worker.preferred_name && (
                      <FieldRow label="Preferred Name" value={worker.preferred_name} />
                    )}
                    <FieldRow label="Email" value={worker.email} />
                    <FieldRow label="Phone" value={worker.phone} />
                    <FieldRow label="Date of Birth" value={formatDate(worker.date_of_birth)} />
                    <FieldRow label="Gender" value={worker.gender} />
                    <FieldRow
                      label="Address"
                      value={
                        [worker.address, worker.suburb, worker.state, worker.postcode]
                          .filter(Boolean)
                          .join(", ") || null
                      }
                    />
                  </dl>
                </CardContent>
              </Card>

              {/* Employment */}
              <Card>
                <CardHeader>
                  <CardTitle>Employment</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl>
                    <FieldRow label="Employer" value={worker.employer?.employer_name} />
                    <FieldRow label="Worksite" value={worker.worksite?.worksite_name} />
                    <FieldRow label="Project" value={worker.project?.project_name} />

                    {/* Canonical occupation */}
                    <FieldRow
                      label="Primary Occupation"
                      value={
                        worker.canonical_occupation ? (
                          <span className="flex items-center gap-2">
                            {worker.canonical_occupation.canonical_name}
                            {worker.canonical_occupation.occupation_group && (
                              <Badge variant="outline" className="text-xs font-normal">
                                {worker.canonical_occupation.occupation_group.name}
                              </Badge>
                            )}
                          </span>
                        ) : null
                      }
                    />

                    {/* Additional occupations */}
                    {workerAdditionalOccupations.length > 0 && (
                      <FieldRow
                        label="Additional Occupations"
                        value={
                          <span className="flex flex-wrap gap-1.5">
                            {workerAdditionalOccupations.map((a) => (
                              <Badge key={a.occupation_id} variant="secondary">
                                {a.occupation.canonical_name}
                              </Badge>
                            ))}
                          </span>
                        }
                      />
                    )}

                    {/* Specialisations */}
                    {workerSpecialisations.length > 0 && (
                      <FieldRow
                        label="Specialisations"
                        value={
                          <span className="flex flex-wrap gap-1.5">
                            {workerSpecialisations.map((s) => (
                              <Badge key={s.specialisation_id} variant="outline">
                                {s.specialisation.name}
                              </Badge>
                            ))}
                          </span>
                        }
                      />
                    )}

                    <FieldRow label="Classification" value={worker.classification} />

                    {/* Legacy field shown only when it differs from canonical or no canonical set */}
                    {worker.occupation && (
                      <FieldRow
                        label="Raw Occupation"
                        value={
                          <span className="text-muted-foreground text-xs">{worker.occupation}</span>
                        }
                      />
                    )}
                  </dl>
                </CardContent>
              </Card>

              {/* Membership */}
              <Card>
                <CardHeader>
                  <CardTitle>Membership</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl>
                    <FieldRow
                      label="Member type"
                      value={worker.union_membership_type?.display_name}
                    />
                    {worker.union_membership_type?.type_name === "non_oa_member" &&
                      worker.non_oa_union_option && (
                        <FieldRow
                          label="Other union (non-OA)"
                          value={`${worker.non_oa_union_option.badge_initials} — ${worker.non_oa_union_option.display_name}`}
                        />
                      )}
                    <FieldRow
                      label="Organising role"
                      value={worker.member_role_type?.display_name}
                    />
                    <FieldRow
                      label="HSR"
                      value={worker.is_hsr === true ? "Yes" : null}
                    />
                    <FieldRow
                      label="Union"
                      value={
                        worker.union
                          ? `${worker.union.union_code} — ${worker.union.union_name}`
                          : null
                      }
                    />
                    <FieldRow label="Member Number" value={worker.member_number} />
                    <FieldRow label="Join Date" value={formatDate(worker.join_date)} />
                    <FieldRow label="Resignation Date" value={formatDate(worker.resignation_date)} />
                  </dl>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{worker.notes || "—"}</p>
                </CardContent>
              </Card>

            </>
          )}
        </TabsContent>

        {/* ── Agreements tab ───────────────────────────────────────────── */}
        <TabsContent value="agreements" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Worker Agreements</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingAgreements ? (
                <div className="flex justify-center py-4">
                  <EurekaLoadingSpinner size="sm" />
                </div>
              ) : workerAgreements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agreements linked to this worker.</p>
              ) : (
                <div className="space-y-3">
                  {workerAgreements.map((wa) => (
                    <div
                      key={wa.agreement_id}
                      role="button"
                      tabIndex={0}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
                      onClick={() => router.push(`/agreements/${wa.agreement_id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/agreements/${wa.agreement_id}`);
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{wa.agreement.decision_no}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {wa.agreement.agreement_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {wa.agreement.expiry_date && (
                          <span className="text-xs text-muted-foreground">
                            Expires {formatDate(wa.agreement.expiry_date)}
                          </span>
                        )}
                        <Badge
                          variant={
                            wa.agreement.status === "Current"
                              ? "success"
                              : wa.agreement.status === "Expired"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {wa.agreement.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Assignments tab ──────────────────────────────────────────── */}
        <TabsContent value="assignments" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Contract Assignments</CardTitle>
              {canWrite && (
                <Dialog
                  open={dlgAssign}
                  onOpenChange={(o) => {
                    setDlgAssign(o);
                    if (!o) resetAssignDlg();
                  }}
                >
                  <Button size="sm" onClick={() => setDlgAssign(true)}>
                    <Plus className="h-4 w-4" />
                    Link Contract
                  </Button>
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>Link Contract</DialogTitle>
                      <DialogDescription>
                        Attach this worker to a contract at their current worksite.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Contract</Label>
                        <Select
                          value={selContractId}
                          onValueChange={setSelContractId}
                          disabled={loadingContracts || contractOptions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                loadingContracts
                                  ? "Loading contracts..."
                                  : contractOptions.length === 0
                                    ? "No contracts available"
                                    : "Select contract..."
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {contractOptions.map((o) => (
                              <SelectItem key={o.contract_id} value={String(o.contract_id)}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {worker.worksite_id == null && (
                          <p className="text-xs text-muted-foreground">
                            This worker has no worksite set; assign a worksite first to link contracts.
                          </p>
                        )}
                      </div>
                      {dlgError && <p className="text-sm text-destructive">{dlgError}</p>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDlgAssign(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleLinkAssignment}
                        disabled={!selContractId || dlgLoading || worker.worksite_id == null}
                      >
                        {dlgLoading ? "Linking..." : "Link"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {loadingAssignments ? (
                <div className="flex justify-center py-4">
                  <EurekaLoadingSpinner size="sm" />
                </div>
              ) : workerAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contract assignments linked to this worker.
                </p>
              ) : (
                <div className="space-y-3">
                  {workerAssignments.map((wa) => {
                    const c = wa.contract;
                    const scope = c?.work_scope?.scope_name ?? "—";
                    const contractor = c?.contractor?.employer_name ?? "—";
                    const worksiteName = c?.worksite?.worksite_name ?? "—";
                    const agreement = c?.agreement;
                    return (
                      <div
                        key={wa.assignment_id}
                        className="flex items-start justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {scope} — {contractor}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            Worksite: {worksiteName}
                            {c?.program?.program_name ? ` • Program: ${c.program.program_name}` : ""}
                            {c?.project?.project_name ? ` • Project: ${c.project.project_name}` : ""}
                          </p>
                          {agreement && (
                            <p className="text-xs text-muted-foreground truncate">
                              Agreement: {agreement.short_name || agreement.agreement_name} (
                              {agreement.decision_no})
                            </p>
                          )}
                          {wa.notes && (
                            <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                              {wa.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (!canWrite) return;
                              handleToggleAssignmentCurrent(wa);
                            }}
                            disabled={!canWrite}
                          >
                            <Badge
                              variant={wa.is_current ? "success" : "secondary"}
                              className={canWrite ? "cursor-pointer" : ""}
                            >
                              {wa.is_current ? "Current" : "Not current"}
                            </Badge>
                          </button>
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveAssignment(wa.assignment_id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Activity tab ─────────────────────────────────────────────── */}
        <TabsContent value="activity" className="mt-4 space-y-4">
          <WorkerCallHistoryPanel workerId={workerId} />
          <WorkerIssueObservationsPanel workerId={workerId} />
        </TabsContent>

        {/* ── Communications tab ───────────────────────────────────────── */}
        <TabsContent value="communications" className="mt-4 space-y-4">
          <WorkerCallHistoryPanel workerId={workerId} />
          <WorkerObjectionsPanel workerId={workerId} />
        </TabsContent>

        <TabsContent value="relationships" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Leader ↔ worker relationships</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkerRelationshipsTab workerId={workerId} canWrite={canWrite} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
