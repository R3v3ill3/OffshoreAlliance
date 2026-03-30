"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type {
  Worksite,
  Employer,
  Agreement,
  Worker,
  EmployerWorksiteRole,
  EmployerRoleType,
  EngagementType,
  WorksiteType,
  WorkType,
  ProjectStatus,
  WorkScope,
  Project,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Pencil, X, Save, Star, Building2, Plus, Trash2 } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { format } from "date-fns";

const WORKSITE_TYPES: WorksiteType[] = [
  "FPSO",
  "FLNG",
  "Platform",
  "Onshore_LNG",
  "Gas_Plant",
  "Hub",
  "Drill_Centre",
  "Region",
  "Heliport",
  "Pipeline",
  "Airfield",
  "Onshore_Facilities",
  "CPF",
  "Gas_Field",
  "Other",
];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

type AgreementRow = Agreement & Record<string, unknown>;
type EmployerRoleRow = EmployerWorksiteRole & {
  employer?: Employer;
} & Record<string, unknown>;
type WorkerRow = Worker & Record<string, unknown>;

type WorksiteScopeRow = {
  id: number;
  scope_id: number;
  worksite_id: number;
  employer_id: number | null;
  engagement_type: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  work_scope?: WorkScope;
  employer?: { employer_id: number; employer_name: string };
} & Record<string, unknown>;

type ProjectRow = Project & {
  worksite?: { worksite_id: number; worksite_name: string };
} & Record<string, unknown>;

type ChildWorksiteRow = Worksite & Record<string, unknown>;

type WorksiteWithJoins = Worksite & {
  operator?: { employer_id: number; employer_name: string };
  principal_employer?: { employer_id: number; employer_name: string };
  parent_worksite?: { worksite_id: number; worksite_name: string };
};

export default function WorksiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { canWrite } = useAuth();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Worksite>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [dlgAgreement, setDlgAgreement] = useState(false);
  const [dlgEmployer, setDlgEmployer] = useState(false);
  const [dlgScope, setDlgScope] = useState(false);
  const [dlgProject, setDlgProject] = useState(false);
  const [dlgLoading, setDlgLoading] = useState(false);
  const [dlgError, setDlgError] = useState<string | null>(null);

  const [selAgreementId, setSelAgreementId] = useState("");
  const [selEmployerId, setSelEmployerId] = useState("");
  const [selRoleType, setSelRoleType] = useState<EmployerRoleType>("Subcontractor");
  const [selScopeId, setSelScopeId] = useState("");
  const [selScopeEmployerId, setSelScopeEmployerId] = useState("");
  const [selEngagement, setSelEngagement] = useState<EngagementType>("contractor");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState<WorkType>("production");
  const [newProjectStatus, setNewProjectStatus] = useState<ProjectStatus>("planning");

  const [workerEmpFilter, setWorkerEmpFilter] = useState<string>("all");
  const [workerProjectFilter, setWorkerProjectFilter] = useState<string>("all");

  const {
    data: worksite,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["worksite", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select(
          "*, operator:employers!operator_id(employer_id, employer_name), principal_employer:employers!principal_employer_id(employer_id, employer_name), parent_worksite:worksites!parent_worksite_id(worksite_id, worksite_name)"
        )
        .eq("worksite_id", id)
        .single();
      if (error) throw error;
      return data as WorksiteWithJoins;
    },
    enabled: !!id,
  });

  // All principal employers for the edit selector
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
  });

  const { data: agreementWorksites = [] } = useQuery({
    queryKey: ["worksite-agreements", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreement_worksites")
        .select("*, agreement:agreements(*)")
        .eq("worksite_id", id);
      if (error) throw error;
      return data as { agreement?: Agreement }[];
    },
    enabled: !!id,
  });

  const agreements = useMemo(
    () =>
      agreementWorksites
        .map((aw) => aw.agreement)
        .filter((a): a is Agreement => !!a),
    [agreementWorksites]
  );

  const { data: employerRoles = [] } = useQuery({
    queryKey: ["worksite-employer-roles", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_worksite_roles")
        .select("*, employer:employers(*)")
        .eq("worksite_id", id);
      if (error) throw error;
      return data as (EmployerWorksiteRole & { employer?: Employer })[];
    },
    enabled: !!id,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["worksite-workers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*, employer:employers(employer_name)")
        .eq("worksite_id", id)
        .order("last_name");
      if (error) throw error;
      return data as (Worker & { employer?: { employer_name: string } })[];
    },
    enabled: !!id,
  });

  const { data: wsScopes = [] } = useQuery({
    queryKey: ["worksite-scopes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksite_scopes")
        .select("*, work_scope:work_scopes(*), employer:employers(employer_id, employer_name)")
        .eq("worksite_id", id);
      if (error) throw error;
      return data as WorksiteScopeRow[];
    },
    enabled: !!id,
  });

  const { data: wsProjects = [] } = useQuery({
    queryKey: ["worksite-projects", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("worksite_id", id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as ProjectRow[];
    },
    enabled: !!id,
  });

  const filteredWorkers = useMemo(() => {
    let result = workers;
    if (workerEmpFilter !== "all") {
      result = result.filter((w) => String(w.employer_id) === workerEmpFilter);
    }
    if (workerProjectFilter !== "all") {
      result = result.filter((w) => String(w.project_id) === workerProjectFilter);
    }
    return result;
  }, [workers, workerEmpFilter, workerProjectFilter]);

  const workerSummary = useMemo(() => {
    const empMap = new Map<string, number>();
    for (const w of workers) {
      const name = (w as { employer?: { employer_name: string } }).employer?.employer_name ?? "Unassigned";
      empMap.set(name, (empMap.get(name) || 0) + 1);
    }
    return { total: workers.length, byEmployer: Array.from(empMap.entries()).sort((a, b) => b[1] - a[1]) };
  }, [workers]);

  const workerEmployers = useMemo(() => {
    const map = new Map<number, string>();
    for (const w of workers) {
      if (w.employer_id && (w as { employer?: { employer_name: string } }).employer?.employer_name) {
        map.set(w.employer_id, (w as { employer?: { employer_name: string } }).employer!.employer_name);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [workers]);

  const workerProjectOptions = useMemo(() => {
    const map = new Map<number, string>();
    const nameById = new Map(wsProjects.map((p) => [p.project_id, p.project_name]));
    for (const w of workers) {
      if (w.project_id != null) {
        map.set(
          w.project_id,
          nameById.get(w.project_id) ?? `Project #${w.project_id}`
        );
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [workers, wsProjects]);

  const { data: childWorksites = [] } = useQuery({
    queryKey: ["worksite-children", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("*")
        .eq("parent_worksite_id", id)
        .order("worksite_name");
      if (error) throw error;
      return data as Worksite[];
    },
    enabled: !!id,
  });

  const { data: allWorksites = [] } = useQuery({
    queryKey: ["worksites-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .order("worksite_name");
      if (error) throw error;
      return data as Pick<Worksite, "worksite_id" | "worksite_name">[];
    },
  });

  const { data: allAgreements = [] } = useQuery({
    queryKey: ["agreements-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("agreement_id, agreement_name, short_name, decision_no, status")
        .order("agreement_name");
      if (error) throw error;
      return data as Pick<Agreement, "agreement_id" | "agreement_name" | "short_name" | "decision_no" | "status">[];
    },
  });

  const { data: allEmployers = [] } = useQuery({
    queryKey: ["employers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name, employer_category")
        .order("employer_name");
      if (error) throw error;
      return data as Pick<Employer, "employer_id" | "employer_name" | "employer_category">[];
    },
  });

  const { data: allScopes = [] } = useQuery({
    queryKey: ["work-scopes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scopes")
        .select("*, parent:work_scopes!parent_scope_id(scope_name, parent:work_scopes!parent_scope_id(scope_name))")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as (WorkScope & { parent?: { scope_name: string; parent?: { scope_name: string } } })[];
    },
  });

  const scopeOptions = useMemo(() => {
    return allScopes
      .filter((s) => !s.is_whole_of_project)
      .map((s) => {
        const parts: string[] = [];
        if (s.parent?.parent) parts.push(s.parent.parent.scope_name);
        if (s.parent) parts.push(s.parent.scope_name);
        parts.push(s.scope_name);
        return { scope_id: s.scope_id, label: parts.join(" › ") };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allScopes]);

  const linkedAgreementIds = useMemo(
    () => new Set(agreements.map((a) => a.agreement_id)),
    [agreements]
  );

  const startEditing = () => {
    if (!worksite) return;
    setEditForm({ ...worksite });
    setEditing(true);
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm({});
    setSaveError(null);
  };

  const handleEditChange = (
    field: keyof Worksite,
    value: string | number | boolean | null
  ) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdits = async () => {
    if (!worksite) return;
    setSaving(true);
    setSaveError(null);

    const { error } = await supabase
      .from("worksites")
      .update(editForm)
      .eq("worksite_id", worksite.worksite_id);

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["worksite", id] });
    setEditing(false);
    setEditForm({});
    setSaving(false);
  };

  const resetDlg = () => {
    setDlgError(null);
    setDlgLoading(false);
    setSelAgreementId("");
    setSelEmployerId("");
    setSelRoleType("Subcontractor");
    setSelScopeId("");
    setSelScopeEmployerId("");
    setSelEngagement("contractor");
    setNewProjectName("");
    setNewProjectType("production");
    setNewProjectStatus("planning");
  };

  const handleLinkAgreement = async () => {
    if (!selAgreementId) return;
    setDlgLoading(true);
    setDlgError(null);
    const { error } = await supabase.from("agreement_worksites").insert({
      agreement_id: Number(selAgreementId),
      worksite_id: Number(id),
    });
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-agreements", id] });
    setDlgAgreement(false);
    resetDlg();
  };

  const handleUnlinkAgreement = async (agreementId: number) => {
    const { error } = await supabase
      .from("agreement_worksites")
      .delete()
      .eq("agreement_id", agreementId)
      .eq("worksite_id", Number(id));
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-agreements", id] });
  };

  const handleAddEmployer = async () => {
    if (!selEmployerId) return;
    setDlgLoading(true);
    setDlgError(null);
    const { error } = await supabase.from("employer_worksite_roles").insert({
      employer_id: Number(selEmployerId),
      worksite_id: Number(id),
      role_type: selRoleType,
      is_current: true,
    });
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-employer-roles", id] });
    setDlgEmployer(false);
    resetDlg();
  };

  const handleRemoveEmployerRole = async (roleId: number) => {
    const { error } = await supabase.from("employer_worksite_roles").delete().eq("id", roleId);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-employer-roles", id] });
  };

  const handleToggleEmployerCurrent = async (role: EmployerWorksiteRole) => {
    const { error } = await supabase
      .from("employer_worksite_roles")
      .update({ is_current: !role.is_current })
      .eq("id", role.id);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-employer-roles", id] });
  };

  const handleAddScope = async () => {
    if (!selScopeId) return;
    setDlgLoading(true);
    setDlgError(null);
    const payload: Record<string, unknown> = {
      worksite_id: Number(id),
      scope_id: Number(selScopeId),
      engagement_type: selEngagement,
      is_current: true,
    };
    if (selScopeEmployerId) payload.employer_id = Number(selScopeEmployerId);
    const { error } = await supabase.from("worksite_scopes").insert(payload);
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-scopes", id] });
    setDlgScope(false);
    resetDlg();
  };

  const handleRemoveScope = async (scopeRowId: number) => {
    const { error } = await supabase.from("worksite_scopes").delete().eq("id", scopeRowId);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-scopes", id] });
  };

  const handleToggleScopeCurrent = async (row: WorksiteScopeRow) => {
    const { error } = await supabase
      .from("worksite_scopes")
      .update({ is_current: !row.is_current })
      .eq("id", row.id);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-scopes", id] });
  };

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return;
    setDlgLoading(true);
    setDlgError(null);
    const { error } = await supabase.from("projects").insert({
      project_name: newProjectName.trim(),
      worksite_id: Number(id),
      work_type: newProjectType,
      project_status: newProjectStatus,
      is_active: true,
    });
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-projects", id] });
    setDlgProject(false);
    resetDlg();
  };

  const ROLE_TYPES: EmployerRoleType[] = ["Owner", "Operator", "Principal_Contractor", "Subcontractor", "Labour_Hire", "Other"];
  const ENGAGEMENT_TYPES: EngagementType[] = ["direct_employment", "contractor", "subcontractor", "labour_hire"];
  const WORK_TYPES: WorkType[] = ["production", "construction", "decommissioning", "brownfields", "service_provision", "maintenance"];
  const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "commissioning", "operational", "decommissioning", "completed", "absorbed"];

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
      ...(canWrite ? [{
        key: "actions" as const,
        header: "",
        sortable: false,
        render: (item: AgreementRow) => (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); handleUnlinkAgreement(item.agreement_id); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ),
      }] : []),
    ],
    [canWrite]
  );

  const employerRoleColumns: Column<EmployerRoleRow>[] = useMemo(
    () => [
      {
        key: "employer_name",
        header: "Employer",
        render: (item) => item.employer?.employer_name ?? "—",
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
          <button onClick={(e) => { e.stopPropagation(); handleToggleEmployerCurrent(item); }}>
            <Badge variant={item.is_current ? "success" : "secondary"} className="cursor-pointer">
              {item.is_current ? "Yes" : "No"}
            </Badge>
          </button>
        ),
      },
      ...(canWrite ? [{
        key: "actions" as const,
        header: "",
        sortable: false,
        render: (item: EmployerRoleRow) => (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); handleRemoveEmployerRole(item.id); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ),
      }] : []),
    ],
    [canWrite]
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
        key: "employer_name",
        header: "Employer",
        render: (item) => {
          const w = item as WorkerRow & {
            employer?: { employer_name: string };
          };
          return w.employer?.employer_name ?? "—";
        },
      },
    ],
    []
  );

  const wsScopeColumns: Column<WorksiteScopeRow>[] = useMemo(
    () => [
      {
        key: "scope_name",
        header: "Work Scope",
        render: (item) => item.work_scope?.scope_name ?? "—",
      },
      {
        key: "employer_name",
        header: "Employer",
        render: (item) => item.employer?.employer_name ?? "—",
      },
      {
        key: "engagement_type",
        header: "Engagement",
        render: (item) =>
          item.engagement_type ? (
            <Badge variant="secondary">{item.engagement_type.replace(/_/g, " ")}</Badge>
          ) : (
            "—"
          ),
      },
      {
        key: "is_current",
        header: "Current",
        render: (item) => (
          <button onClick={(e) => { e.stopPropagation(); handleToggleScopeCurrent(item); }}>
            <Badge variant={item.is_current ? "success" : "secondary"} className="cursor-pointer">
              {item.is_current ? "Yes" : "No"}
            </Badge>
          </button>
        ),
      },
      {
        key: "start_date",
        header: "Start",
        render: (item) => formatDate(item.start_date),
      },
      ...(canWrite ? [{
        key: "actions" as const,
        header: "",
        sortable: false,
        render: (item: WorksiteScopeRow) => (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); handleRemoveScope(item.id); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ),
      }] : []),
    ],
    [canWrite]
  );

  const projectColumns: Column<ProjectRow>[] = useMemo(
    () => [
      { key: "project_name", header: "Project" },
      {
        key: "work_type",
        header: "Type",
        render: (item) => (
          <Badge variant="secondary">{item.work_type.replace(/_/g, " ")}</Badge>
        ),
      },
      {
        key: "project_status",
        header: "Status",
        render: (item) => (
          <Badge
            variant={
              item.project_status === "operational" || item.project_status === "active"
                ? "success"
                : item.project_status === "completed"
                  ? "secondary"
                  : "warning"
            }
          >
            {item.project_status.replace(/_/g, " ")}
          </Badge>
        ),
      },
      {
        key: "start_date",
        header: "Start",
        render: (item) => formatDate(item.start_date),
      },
      {
        key: "expected_end_date",
        header: "Expected End",
        render: (item) => formatDate(item.expected_end_date),
      },
    ],
    []
  );

  const childWorksiteColumns: Column<ChildWorksiteRow>[] = useMemo(
    () => [
      { key: "worksite_name", header: "Name" },
      {
        key: "worksite_type",
        header: "Type",
        render: (item) => (
          <Badge variant="secondary">{item.worksite_type.replace(/_/g, " ")}</Badge>
        ),
      },
      {
        key: "is_offshore",
        header: "Offshore",
        render: (item) => (
          <Badge variant={item.is_offshore ? "info" : "secondary"}>
            {item.is_offshore ? "Yes" : "No"}
          </Badge>
        ),
      },
      {
        key: "is_active",
        header: "Active",
        render: (item) => (
          <Badge variant={item.is_active ? "success" : "destructive"}>
            {item.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !worksite) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">
          Worksite not found or failed to load.
        </p>
        <Button variant="outline" onClick={() => router.push("/worksites")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Worksites
        </Button>
      </div>
    );
  }

  const renderField = (
    field: keyof Worksite,
    label: string,
    type: "text" | "select" | "number" | "checkbox" = "text"
  ) => {
    if (editing) {
      if (field === "worksite_type") {
        return (
          <div>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="mt-1">
              <Select
                value={(editForm.worksite_type as string) ?? ""}
                onValueChange={(v) =>
                  handleEditChange("worksite_type", v as WorksiteType)
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {WORKSITE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      }
      if (field === "principal_employer_id") {
        return (
          <div>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="mt-1">
              <Select
                value={
                  editForm.principal_employer_id != null
                    ? String(editForm.principal_employer_id)
                    : "none"
                }
                onValueChange={(v) =>
                  handleEditChange(
                    "principal_employer_id",
                    v === "none" ? null : Number(v)
                  )
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select principal employer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {principalEmployers.map((pe) => (
                    <SelectItem key={pe.employer_id} value={String(pe.employer_id)}>
                      {pe.employer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      }
      if (field === ("parent_worksite_id" as keyof Worksite)) {
        return (
          <div>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="mt-1">
              <Select
                value={
                  (editForm as Record<string, unknown>).parent_worksite_id != null
                    ? String((editForm as Record<string, unknown>).parent_worksite_id)
                    : "none"
                }
                onValueChange={(v) =>
                  handleEditChange(
                    "parent_worksite_id" as keyof Worksite,
                    v === "none" ? null : Number(v)
                  )
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select parent worksite" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (standalone)</SelectItem>
                  {allWorksites
                    .filter((w) => w.worksite_id !== worksite.worksite_id)
                    .map((w) => (
                      <SelectItem key={w.worksite_id} value={String(w.worksite_id)}>
                        {w.worksite_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      }
      if (type === "checkbox") {
        return (
          <div>
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!editForm[field]}
                onChange={(e) => handleEditChange(field, e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">
                {editForm[field] ? "Yes" : "No"}
              </span>
            </div>
          </div>
        );
      }
      return (
        <div>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <div className="mt-1">
            <Input
              className="h-8"
              type={type}
              step={type === "number" ? "any" : undefined}
              value={String(editForm[field] ?? "")}
              onChange={(e) =>
                handleEditChange(
                  field,
                  type === "number" && e.target.value
                    ? parseFloat(e.target.value)
                    : e.target.value || null
                )
              }
            />
          </div>
        </div>
      );
    }

    // View mode — special handling for principal_employer_id
    if (field === "principal_employer_id") {
      const peName = worksite.principal_employer?.employer_name;
      return (
        <div>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <div className="mt-1 text-sm">
            {peName ? (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                {peName}
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
      );
    }

    if (field === ("parent_worksite_id" as keyof Worksite)) {
      const pw = worksite.parent_worksite;
      return (
        <div>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <div className="mt-1 text-sm">
            {pw ? (
              <button
                className="underline hover:text-foreground flex items-center gap-1"
                onClick={() => router.push(`/worksites/${pw.worksite_id}`)}
              >
                <Building2 className="h-3 w-3" />
                {pw.worksite_name}
              </button>
            ) : (
              "—"
            )}
          </div>
        </div>
      );
    }

    const val = worksite[field];
    let display: string;
    if (val == null || val === "") {
      display = "—";
    } else if (typeof val === "boolean") {
      display = val ? "Yes" : "No";
    } else if (typeof val === "string") {
      display = val.replace(/_/g, " ");
    } else {
      display = String(val);
    }

    return (
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="mt-1 text-sm">{display}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/worksites")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {worksite.worksite_name}
          </h1>
          <p className="text-muted-foreground">
            {worksite.worksite_type.replace(/_/g, " ")}
            {worksite.operator
              ? ` · Operated by ${worksite.operator.employer_name}`
              : ""}
            {worksite.principal_employer
              ? ` · ${worksite.principal_employer.employer_name} asset`
              : ""}
          </p>
          {worksite.parent_worksite && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              Part of:{" "}
              <button
                className="underline hover:text-foreground"
                onClick={() =>
                  router.push(`/worksites/${worksite.parent_worksite!.worksite_id}`)
                }
              >
                {worksite.parent_worksite.worksite_name}
              </button>
            </p>
          )}
        </div>
        <Badge variant={worksite.is_offshore ? "info" : "secondary"}>
          {worksite.is_offshore ? "Offshore" : "Onshore"}
        </Badge>
        <Badge variant={worksite.is_active ? "success" : "destructive"}>
          {worksite.is_active ? "Active" : "Inactive"}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Worksite Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              {renderField("worksite_name", "Name")}
              {renderField("worksite_type", "Type", "select")}
              {renderField("principal_employer_id", "Principal Employer")}
              {renderField("parent_worksite_id" as keyof Worksite, "Parent Worksite")}
              <div>
                <Label className="text-xs text-muted-foreground">Operator</Label>
                <div className="mt-1 text-sm">
                  {worksite.operator?.employer_name ?? "—"}
                </div>
              </div>
              {renderField("location_description", "Location")}
              {renderField("basin", "Basin")}
              {renderField("latitude", "Latitude", "number")}
              {renderField("longitude", "Longitude", "number")}
              {renderField("is_offshore", "Offshore", "checkbox")}
              {renderField("is_active", "Active", "checkbox")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              id="worksite-map"
              className="h-64 bg-muted rounded-lg flex items-center justify-center"
            >
              <p className="text-muted-foreground text-sm">
                Map view coming soon
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Workers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{workers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Employers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{employerRoles.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agreements</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{agreements.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Work Scopes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{wsScopes.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="agreements">
        <TabsList>
          <TabsTrigger value="agreements">
            Agreements ({agreements.length})
          </TabsTrigger>
          <TabsTrigger value="employers">
            Employers ({employerRoles.length})
          </TabsTrigger>
          <TabsTrigger value="work_scopes">
            Work Scopes ({wsScopes.length})
          </TabsTrigger>
          <TabsTrigger value="projects">
            Projects ({wsProjects.length})
          </TabsTrigger>
          <TabsTrigger value="workers">
            Workers ({workers.length})
          </TabsTrigger>
          {childWorksites.length > 0 && (
            <TabsTrigger value="children">
              Sub-Worksites ({childWorksites.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="agreements">
          <div className="space-y-4">
            {canWrite && (
              <div className="flex justify-end">
                <Dialog open={dlgAgreement} onOpenChange={(o) => { setDlgAgreement(o); if (!o) resetDlg(); }}>
                  <Button size="sm" onClick={() => setDlgAgreement(true)}>
                    <Plus className="h-4 w-4" /> Link Agreement
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Link Agreement</DialogTitle>
                      <DialogDescription>Associate an existing agreement with this worksite.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <Label>Agreement</Label>
                      <Select value={selAgreementId} onValueChange={setSelAgreementId}>
                        <SelectTrigger><SelectValue placeholder="Select agreement..." /></SelectTrigger>
                        <SelectContent>
                          {allAgreements
                            .filter((a) => !linkedAgreementIds.has(a.agreement_id))
                            .map((a) => (
                              <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                                {a.short_name || a.agreement_name} ({a.decision_no})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {dlgError && <p className="text-sm text-destructive">{dlgError}</p>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDlgAgreement(false)}>Cancel</Button>
                      <Button onClick={handleLinkAgreement} disabled={!selAgreementId || dlgLoading}>
                        {dlgLoading ? "Linking..." : "Link"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            {agreements.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No agreements found for this worksite.
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
          </div>
        </TabsContent>

        <TabsContent value="employers">
          <div className="space-y-4">
            {canWrite && (
              <div className="flex justify-end">
                <Dialog open={dlgEmployer} onOpenChange={(o) => { setDlgEmployer(o); if (!o) resetDlg(); }}>
                  <Button size="sm" onClick={() => setDlgEmployer(true)}>
                    <Plus className="h-4 w-4" /> Add Employer
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Employer</DialogTitle>
                      <DialogDescription>Add an employer role at this worksite.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Employer</Label>
                        <Select value={selEmployerId} onValueChange={setSelEmployerId}>
                          <SelectTrigger><SelectValue placeholder="Select employer..." /></SelectTrigger>
                          <SelectContent>
                            {allEmployers.map((e) => (
                              <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                                {e.employer_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={selRoleType} onValueChange={(v) => setSelRoleType(v as EmployerRoleType)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLE_TYPES.map((r) => (
                              <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {dlgError && <p className="text-sm text-destructive">{dlgError}</p>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDlgEmployer(false)}>Cancel</Button>
                      <Button onClick={handleAddEmployer} disabled={!selEmployerId || dlgLoading}>
                        {dlgLoading ? "Adding..." : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            {employerRoles.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No employer associations found for this worksite.
              </div>
            ) : (
              <DataTable
                data={employerRoles as EmployerRoleRow[]}
                columns={employerRoleColumns}
                searchPlaceholder="Search employers..."
                searchKeys={["employer_name", "role_type"]}
                onRowClick={(item) =>
                  item.employer
                    ? router.push(`/employers/${item.employer.employer_id}`)
                    : undefined
                }
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="work_scopes">
          <div className="space-y-4">
            {canWrite && (
              <div className="flex justify-end">
                <Dialog open={dlgScope} onOpenChange={(o) => { setDlgScope(o); if (!o) resetDlg(); }}>
                  <Button size="sm" onClick={() => setDlgScope(true)}>
                    <Plus className="h-4 w-4" /> Add Work Scope
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Work Scope</DialogTitle>
                      <DialogDescription>Assign a work scope to this worksite, optionally with an employer.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Work Scope</Label>
                        <Select value={selScopeId} onValueChange={setSelScopeId}>
                          <SelectTrigger><SelectValue placeholder="Select scope..." /></SelectTrigger>
                          <SelectContent>
                            {scopeOptions.map((s) => (
                              <SelectItem key={s.scope_id} value={String(s.scope_id)}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Employer (optional)</Label>
                        <Select value={selScopeEmployerId || "none"} onValueChange={(v) => setSelScopeEmployerId(v === "none" ? "" : v)}>
                          <SelectTrigger><SelectValue placeholder="Select employer..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {allEmployers.map((e) => (
                              <SelectItem key={e.employer_id} value={String(e.employer_id)}>{e.employer_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Engagement Type</Label>
                        <Select value={selEngagement} onValueChange={(v) => setSelEngagement(v as EngagementType)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ENGAGEMENT_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {dlgError && <p className="text-sm text-destructive">{dlgError}</p>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDlgScope(false)}>Cancel</Button>
                      <Button onClick={handleAddScope} disabled={!selScopeId || dlgLoading}>
                        {dlgLoading ? "Adding..." : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            {wsScopes.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No work scopes found for this worksite.
              </div>
            ) : (
              <DataTable
                data={wsScopes as WorksiteScopeRow[]}
                columns={wsScopeColumns}
                searchPlaceholder="Search scopes..."
                searchKeys={["scope_name", "employer_name"]}
                onRowClick={(item) =>
                  item.employer
                    ? router.push(`/employers/${item.employer.employer_id}`)
                    : undefined
                }
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="projects">
          <div className="space-y-4">
            {canWrite && (
              <div className="flex justify-end">
                <Dialog open={dlgProject} onOpenChange={(o) => { setDlgProject(o); if (!o) resetDlg(); }}>
                  <Button size="sm" onClick={() => setDlgProject(true)}>
                    <Plus className="h-4 w-4" /> Add Project
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Project</DialogTitle>
                      <DialogDescription>Create a new project at this worksite.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Project Name <span className="text-destructive">*</span></Label>
                        <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Work Type</Label>
                        <Select value={newProjectType} onValueChange={(v) => setNewProjectType(v as WorkType)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {WORK_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={newProjectStatus} onValueChange={(v) => setNewProjectStatus(v as ProjectStatus)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PROJECT_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {dlgError && <p className="text-sm text-destructive">{dlgError}</p>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDlgProject(false)}>Cancel</Button>
                      <Button onClick={handleAddProject} disabled={!newProjectName.trim() || dlgLoading}>
                        {dlgLoading ? "Creating..." : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            {wsProjects.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No projects found at this worksite.
              </div>
            ) : (
              <DataTable
                data={wsProjects as ProjectRow[]}
                columns={projectColumns}
                searchPlaceholder="Search projects..."
                searchKeys={["project_name"]}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="workers">
          <div className="space-y-4">
            {workers.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Employer:</span>
                  <Select value={workerEmpFilter} onValueChange={setWorkerEmpFilter}>
                    <SelectTrigger className="w-48 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ({workers.length})</SelectItem>
                      {workerEmployers.map(([empId, name]) => (
                        <SelectItem key={empId} value={String(empId)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Project:</span>
                  <Select value={workerProjectFilter} onValueChange={setWorkerProjectFilter}>
                    <SelectTrigger className="w-48 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ({workers.length})</SelectItem>
                      {workerProjectOptions.map(([projectId, name]) => (
                        <SelectItem key={projectId} value={String(projectId)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1" />
                <div className="flex flex-wrap gap-2">
                  {workerSummary.byEmployer.slice(0, 5).map(([name, count]) => (
                    <Badge key={name} variant="secondary">{name}: {count}</Badge>
                  ))}
                  {workerSummary.byEmployer.length > 5 && (
                    <Badge variant="secondary">+{workerSummary.byEmployer.length - 5} more</Badge>
                  )}
                </div>
              </div>
            )}
            {filteredWorkers.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No workers found at this worksite.
              </div>
            ) : (
              <DataTable
                data={filteredWorkers as WorkerRow[]}
                columns={workerColumns}
                searchPlaceholder="Search workers..."
                searchKeys={["first_name", "last_name", "occupation"]}
                onRowClick={(item) => router.push(`/workers/${item.worker_id}`)}
              />
            )}
          </div>
        </TabsContent>

        {childWorksites.length > 0 && (
          <TabsContent value="children">
            <DataTable
              data={childWorksites as ChildWorksiteRow[]}
              columns={childWorksiteColumns}
              searchPlaceholder="Search sub-worksites..."
              searchKeys={["worksite_name"]}
              onRowClick={(item) =>
                router.push(`/worksites/${item.worksite_id}`)
              }
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
