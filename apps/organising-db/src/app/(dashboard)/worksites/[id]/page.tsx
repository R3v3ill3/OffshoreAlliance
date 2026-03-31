"use client";

import { useState, useMemo, useCallback } from "react";
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
import type { Database } from "@oa/db-types";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
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

type AgreementRow = Agreement & {
  employer?: { employer_id: number; employer_name: string } | null;
} & Record<string, unknown>;
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

type ProgramWorksiteRow = {
  id: number;
  program_id: number;
  worksite_id: number;
  is_current: boolean;
  is_primary: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  program?: {
    program_id: number;
    program_name: string;
    program_status: string;
    is_active: boolean;
    principal_employer?: { employer_id: number; employer_name: string } | null;
  } | null;
} & Record<string, unknown>;

type WorksiteContractRow = {
  contract_id: number;
  worksite_id: number;
  program_id: number | null;
  project_id: number | null;
  scope_id: number;
  contractor_employer_id: number;
  agreement_id: number | null;
  engagement_type: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  work_scope?: WorkScope;
  contractor?: { employer_id: number; employer_name: string } | null;
  agreement?: Pick<Agreement, "agreement_id" | "agreement_name" | "short_name" | "decision_no" | "status" | "expiry_date"> | null;
  program?: { program_id: number; program_name: string } | null;
  project?: { project_id: number; project_name: string } | null;
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
  const { id: idParam } = useParams<{ id: string }>();
  const worksiteId = Number(idParam);
  const worksiteIdValid = Number.isFinite(worksiteId);
  const id = idParam;
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
  const [dlgProgram, setDlgProgram] = useState(false);
  const [dlgContract, setDlgContract] = useState(false);
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

  const [selProgramId, setSelProgramId] = useState("");
  const [selProgramPrimary, setSelProgramPrimary] = useState(false);

  const [contractScopeId, setContractScopeId] = useState("");
  const [contractEmployerId, setContractEmployerId] = useState("");
  const [contractEngagement, setContractEngagement] =
    useState<EngagementType>("contractor");
  const [contractAgreementId, setContractAgreementId] = useState("none");
  const [contractProgramId, setContractProgramId] = useState("none");
  const [contractProjectId, setContractProjectId] = useState("none");
  const [contractIsCurrent, setContractIsCurrent] = useState(true);
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [contractNotes, setContractNotes] = useState("");

  const [agreementEmployerFilter, setAgreementEmployerFilter] =
    useState<string>("all");

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
        .eq("worksite_id", worksiteId)
        .single();
      if (error) throw error;
      return data as WorksiteWithJoins;
    },
    enabled: worksiteIdValid,
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
        .select("*, agreement:agreements(*, employer:employers(employer_id, employer_name))")
        .eq("worksite_id", worksiteId);
      if (error) throw error;
      return data as { agreement?: AgreementRow }[];
    },
    enabled: worksiteIdValid,
  });

  const agreements = useMemo(
    () =>
      agreementWorksites
        .map((aw) => aw.agreement)
        .filter((a): a is AgreementRow => !!a),
    [agreementWorksites]
  );

  const agreementEmployerOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of agreements) {
      if (a.employer_id != null) {
        map.set(a.employer_id, a.employer?.employer_name ?? `Employer #${a.employer_id}`);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [agreements]);

  const filteredAgreements = useMemo(() => {
    if (agreementEmployerFilter === "all") return agreements;
    const id = Number(agreementEmployerFilter);
    return agreements.filter((a) => a.employer_id === id);
  }, [agreements, agreementEmployerFilter]);

  const agreementCountByEmployerId = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of agreements) {
      if (a.employer_id != null) {
        map.set(a.employer_id, (map.get(a.employer_id) || 0) + 1);
      }
    }
    return map;
  }, [agreements]);

  const { data: employerRoles = [] } = useQuery({
    queryKey: ["worksite-employer-roles", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_worksite_roles")
        .select("*, employer:employers(*)")
        .eq("worksite_id", worksiteId);
      if (error) throw error;
      return data as (EmployerWorksiteRole & { employer?: Employer })[];
    },
    enabled: worksiteIdValid,
  });

  const employerRoleEmployerIds = useMemo(
    () => new Set(employerRoles.map((r) => r.employer_id)),
    [employerRoles]
  );

  const { data: workers = [] } = useQuery({
    queryKey: ["worksite-workers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*, employer:employers(employer_name)")
        .eq("worksite_id", worksiteId)
        .order("last_name");
      if (error) throw error;
      return data as (Worker & { employer?: { employer_name: string } })[];
    },
    enabled: worksiteIdValid,
  });

  const { data: wsScopes = [] } = useQuery({
    queryKey: ["worksite-scopes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksite_scopes")
        .select("*, work_scope:work_scopes(*), employer:employers(employer_id, employer_name)")
        .eq("worksite_id", worksiteId);
      if (error) throw error;
      return data as WorksiteScopeRow[];
    },
    enabled: worksiteIdValid,
  });

  const { data: wsProjects = [] } = useQuery({
    queryKey: ["worksite-projects", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("worksite_id", worksiteId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as ProjectRow[];
    },
    enabled: worksiteIdValid,
  });

  const { data: wsProgramLinks = [] } = useQuery({
    queryKey: ["worksite-programs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_worksites")
        .select(
          "*, program:programs(program_id, program_name, program_status, is_active, principal_employer:employers(employer_id, employer_name))"
        )
        .eq("worksite_id", worksiteId)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return data as ProgramWorksiteRow[];
    },
    enabled: worksiteIdValid,
  });

  const { data: wsContracts = [] } = useQuery({
    queryKey: ["worksite-contracts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksite_contracts")
        .select(
          "*, work_scope:work_scopes(*), contractor:employers(employer_id, employer_name), agreement:agreements(agreement_id, agreement_name, short_name, decision_no, status, expiry_date), program:programs(program_id, program_name), project:projects(project_id, project_name)"
        )
        .eq("worksite_id", worksiteId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as WorksiteContractRow[];
    },
    enabled: worksiteIdValid,
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
        .eq("parent_worksite_id", worksiteId)
        .order("worksite_name");
      if (error) throw error;
      return data as Worksite[];
    },
    enabled: worksiteIdValid,
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

  const { data: allPrograms = [] } = useQuery({
    queryKey: ["programs-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("program_id, program_name, program_status, is_active")
        .order("program_name");
      if (error) throw error;
      return (data ?? []) as {
        program_id: number;
        program_name: string;
        program_status: string;
        is_active: boolean;
      }[];
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

  const contractScopeOptions = useMemo(() => {
    return allScopes
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

  const linkedProgramIds = useMemo(
    () => new Set(wsProgramLinks.map((pw) => pw.program_id)),
    [wsProgramLinks]
  );

  const contractEmployerOptions = useMemo(() => {
    return allEmployers
      .map((e) => ({
        employer_id: e.employer_id,
        employer_name: e.employer_name,
        in_worksite: employerRoleEmployerIds.has(e.employer_id),
      }))
      .sort((a, b) => {
        if (a.in_worksite !== b.in_worksite) return a.in_worksite ? -1 : 1;
        return a.employer_name.localeCompare(b.employer_name);
      });
  }, [allEmployers, employerRoleEmployerIds]);

  const contractProgramOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const pw of wsProgramLinks) {
      if (pw.program) map.set(pw.program.program_id, pw.program.program_name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [wsProgramLinks]);

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

    // Strip join fields that aren't actual DB columns (operator, principal_employer, parent_worksite)
    const { operator: _op, principal_employer: _pe, parent_worksite: _pw, ...updateData } =
      editForm as WorksiteWithJoins & Partial<Worksite>;

    const { error } = await supabase
      .from("worksites")
      .update(updateData)
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
    setSelProgramId("");
    setSelProgramPrimary(false);
    setContractScopeId("");
    setContractEmployerId("");
    setContractEngagement("contractor");
    setContractAgreementId("none");
    setContractProgramId("none");
    setContractProjectId("none");
    setContractIsCurrent(true);
    setContractStartDate("");
    setContractEndDate("");
    setContractNotes("");
  };

  const handleLinkAgreement = async () => {
    if (!selAgreementId) return;
    setDlgLoading(true);
    setDlgError(null);
    const { error } = await supabase.from("agreement_worksites").insert({
      agreement_id: Number(selAgreementId),
      worksite_id: worksiteId,
    });
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-agreements", id] });
    setDlgAgreement(false);
    resetDlg();
  };

  const handleUnlinkAgreement = useCallback(async (agreementId: number) => {
    const { error } = await supabase
      .from("agreement_worksites")
      .delete()
      .eq("agreement_id", agreementId)
      .eq("worksite_id", worksiteId);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-agreements", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worksiteId, id]);

  const handleAddEmployer = async () => {
    if (!selEmployerId) return;
    setDlgLoading(true);
    setDlgError(null);
    const { error } = await supabase.from("employer_worksite_roles").insert({
      employer_id: Number(selEmployerId),
      worksite_id: worksiteId,
      role_type: selRoleType,
      is_current: true,
    });
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-employer-roles", id] });
    setDlgEmployer(false);
    resetDlg();
  };

  const handleRemoveEmployerRole = useCallback(async (roleId: number) => {
    const { error } = await supabase.from("employer_worksite_roles").delete().eq("id", roleId);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-employer-roles", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleEmployerCurrent = useCallback(async (role: EmployerWorksiteRole) => {
    const { error } = await supabase
      .from("employer_worksite_roles")
      .update({ is_current: !role.is_current })
      .eq("id", role.id);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-employer-roles", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAddScope = async () => {
    if (!selScopeId) return;
    setDlgLoading(true);
    setDlgError(null);
    const payload: Database["public"]["Tables"]["worksite_scopes"]["Insert"] = {
      worksite_id: worksiteId,
      scope_id: Number(selScopeId),
      engagement_type: selEngagement,
      is_current: true,
    };
    if (selScopeEmployerId) payload.employer_id = Number(selScopeEmployerId);
    // #region agent log
    fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'worksites/[id]/page.tsx:handleAddScope-start',message:'handleAddScope insert start',data:{payload,worksiteId,selScopeId},timestamp:Date.now(),hypothesisId:'H-D'})}).catch(()=>{});
    // #endregion
    const { error, data: insertData } = await supabase.from("worksite_scopes").insert(payload).select();
    // #region agent log
    fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'worksites/[id]/page.tsx:handleAddScope-result',message:'handleAddScope insert result',data:{success:!error,error:error?{message:error.message,code:(error as Record<string,unknown>).code,details:(error as Record<string,unknown>).details,hint:(error as Record<string,unknown>).hint,status:(error as Record<string,unknown>).status}:null,insertedRows:insertData?.length??null},timestamp:Date.now(),hypothesisId:'H-D,H-A'})}).catch(()=>{});
    // #endregion
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-scopes", id] });
    setDlgScope(false);
    resetDlg();
  };

  const handleRemoveScope = useCallback(async (scopeRowId: number) => {
    const { error } = await supabase.from("worksite_scopes").delete().eq("id", scopeRowId);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-scopes", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleScopeCurrent = useCallback(async (row: WorksiteScopeRow) => {
    const { error } = await supabase
      .from("worksite_scopes")
      .update({ is_current: !row.is_current })
      .eq("id", row.id);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-scopes", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return;
    setDlgLoading(true);
    setDlgError(null);
    const projectPayload: Database["public"]["Tables"]["projects"]["Insert"] = {
      project_name: newProjectName.trim(),
      worksite_id: worksiteId,
      work_type: newProjectType,
      project_status: newProjectStatus,
      is_active: true,
    };
    const { error } = await supabase.from("projects").insert(projectPayload);
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-projects", id] });
    setDlgProject(false);
    resetDlg();
  };

  const handleLinkProgram = async () => {
    if (!selProgramId) return;
    setDlgLoading(true);
    setDlgError(null);
    const { error } = await supabase.from("program_worksites").insert({
      program_id: Number(selProgramId),
      worksite_id: worksiteId,
      is_current: true,
      is_primary: selProgramPrimary,
    } satisfies Database["public"]["Tables"]["program_worksites"]["Insert"]);
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-programs", id] });
    setDlgProgram(false);
    resetDlg();
  };

  const handleUnlinkProgram = useCallback(async (rowId: number) => {
    const { error } = await supabase.from("program_worksites").delete().eq("id", rowId);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-programs", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleProgramPrimary = useCallback(async (row: ProgramWorksiteRow) => {
    const { error } = await supabase
      .from("program_worksites")
      .update({ is_primary: !row.is_primary })
      .eq("id", row.id);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-programs", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAddContract = async () => {
    if (!contractScopeId || !contractEmployerId) return;
    setDlgLoading(true);
    setDlgError(null);

    const payload: Database["public"]["Tables"]["worksite_contracts"]["Insert"] = {
      worksite_id: worksiteId,
      scope_id: Number(contractScopeId),
      contractor_employer_id: Number(contractEmployerId),
      engagement_type: contractEngagement,
      is_current: contractIsCurrent,
    };
    if (contractAgreementId !== "none") payload.agreement_id = Number(contractAgreementId);
    if (contractProgramId !== "none") payload.program_id = Number(contractProgramId);
    if (contractProjectId !== "none") payload.project_id = Number(contractProjectId);
    if (contractStartDate) payload.start_date = contractStartDate;
    if (contractEndDate) payload.end_date = contractEndDate;
    if (contractNotes.trim()) payload.notes = contractNotes.trim();

    const { error } = await supabase.from("worksite_contracts").insert(payload);
    if (error) { setDlgError(error.message); setDlgLoading(false); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-contracts", id] });
    setDlgContract(false);
    resetDlg();
  };

  const handleRemoveContract = useCallback(async (contractId: number) => {
    const { error } = await supabase.from("worksite_contracts").delete().eq("contract_id", contractId);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-contracts", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleContractCurrent = useCallback(async (row: WorksiteContractRow) => {
    const { error } = await supabase
      .from("worksite_contracts")
      .update({ is_current: !row.is_current })
      .eq("contract_id", row.contract_id);
    if (error) { setSaveError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["worksite-contracts", id] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ROLE_TYPES: EmployerRoleType[] = ["Owner", "Operator", "Principal_Contractor", "Subcontractor", "Labour_Hire", "Other"];
  const ENGAGEMENT_TYPES: EngagementType[] = ["direct_employment", "contractor", "subcontractor", "labour_hire"];
  const WORK_TYPES: WorkType[] = ["production", "construction", "decommissioning", "brownfields", "service_provision", "maintenance"];
  const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "commissioning", "operational", "decommissioning", "completed", "absorbed"];

  const agreementColumns: Column<AgreementRow>[] = useMemo(
    () => [
      { key: "decision_no", header: "Decision No" },
      { key: "agreement_name", header: "Agreement Name" },
      {
        key: "employer_name",
        header: "Employer",
        render: (item) =>
          item.employer?.employer_name ??
          (item.employer_id != null ? `Employer #${item.employer_id}` : "—"),
      },
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
    [canWrite, handleUnlinkAgreement]
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
        key: "agreements",
        header: "Agreements",
        sortable: false,
        render: (item) => {
          const count = agreementCountByEmployerId.get(item.employer_id) ?? 0;
          return count ? (
            <Badge variant="secondary">{count}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
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
    [
      canWrite,
      agreementCountByEmployerId,
      handleToggleEmployerCurrent,
      handleRemoveEmployerRole,
    ]
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
    [canWrite, handleToggleScopeCurrent, handleRemoveScope]
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

  const programColumns: Column<ProgramWorksiteRow>[] = useMemo(
    () => [
      {
        key: "program_name",
        header: "Program",
        render: (row) => row.program?.program_name ?? `#${row.program_id}`,
      },
      {
        key: "program_status",
        header: "Status",
        render: (row) =>
          row.program?.program_status ? (
            <Badge variant="secondary">
              {row.program.program_status.replace(/_/g, " ")}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "principal_employer",
        header: "Principal Employer",
        render: (row) =>
          row.program?.principal_employer?.employer_name ? (
            <Badge variant="warning">
              {row.program.principal_employer.employer_name}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "is_primary",
        header: "Primary",
        render: (row) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (canWrite) handleToggleProgramPrimary(row);
            }}
            disabled={!canWrite}
          >
            <Badge
              variant={row.is_primary ? "warning" : "secondary"}
              className={canWrite ? "cursor-pointer" : ""}
            >
              {row.is_primary ? "Yes" : "No"}
            </Badge>
          </button>
        ),
      },
      {
        key: "is_current",
        header: "Current",
        render: (row) => (
          <Badge variant={row.is_current ? "success" : "secondary"}>
            {row.is_current ? "Yes" : "No"}
          </Badge>
        ),
      },
      ...(canWrite
        ? [
            {
              key: "actions" as const,
              header: "",
              sortable: false,
              render: (row: ProgramWorksiteRow) => (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnlinkProgram(row.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ),
            },
          ]
        : []),
    ],
    [canWrite, handleToggleProgramPrimary, handleUnlinkProgram]
  );

  const contractColumns: Column<WorksiteContractRow>[] = useMemo(
    () => [
      {
        key: "scope_name",
        header: "Work Scope",
        render: (row) => row.work_scope?.scope_name ?? "—",
      },
      {
        key: "contractor_name",
        header: "Contractor",
        render: (row) => row.contractor?.employer_name ?? `#${row.contractor_employer_id}`,
      },
      {
        key: "engagement_type",
        header: "Engagement",
        render: (row) =>
          row.engagement_type ? (
            <Badge variant="secondary">{row.engagement_type.replace(/_/g, " ")}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "agreement",
        header: "Agreement",
        render: (row) => {
          const a = row.agreement;
          if (!a) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="text-sm">
              {a.short_name || a.agreement_name}
            </span>
          );
        },
      },
      {
        key: "program",
        header: "Program",
        render: (row) =>
          row.program?.program_name ? (
            <Badge variant="secondary">{row.program.program_name}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "project",
        header: "Site Project",
        render: (row) =>
          row.project?.project_name ? (
            <Badge variant="secondary">{row.project.project_name}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "is_current",
        header: "Current",
        render: (row) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (canWrite) handleToggleContractCurrent(row);
            }}
            disabled={!canWrite}
          >
            <Badge
              variant={row.is_current ? "success" : "secondary"}
              className={canWrite ? "cursor-pointer" : ""}
            >
              {row.is_current ? "Yes" : "No"}
            </Badge>
          </button>
        ),
      },
      {
        key: "start_date",
        header: "Start",
        render: (row) => formatDate(row.start_date),
      },
      ...(canWrite
        ? [
            {
              key: "actions" as const,
              header: "",
              sortable: false,
              render: (row: WorksiteContractRow) => (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveContract(row.contract_id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ),
            },
          ]
        : []),
    ],
    [canWrite, handleToggleContractCurrent, handleRemoveContract]
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
          <TabsTrigger value="contracts">
            Contracts ({wsContracts.length})
          </TabsTrigger>
          <TabsTrigger value="projects">
            Site Projects ({wsProjects.length})
          </TabsTrigger>
          <TabsTrigger value="programs">
            Programs ({wsProgramLinks.length})
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
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> Link Agreement
                    </Button>
                  </DialogTrigger>
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
                      <Button variant="outline" onClick={() => { setDlgAgreement(false); resetDlg(); }}>Cancel</Button>
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
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Employer:</span>
                    <Select value={agreementEmployerFilter} onValueChange={setAgreementEmployerFilter}>
                      <SelectTrigger className="w-64 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All ({agreements.length})</SelectItem>
                        {agreementEmployerOptions.map(([empId, name]) => (
                          <SelectItem key={empId} value={String(empId)}>
                            {name} ({agreementCountByEmployerId.get(empId) ?? 0})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DataTable
                  data={filteredAgreements as AgreementRow[]}
                  columns={agreementColumns}
                  searchPlaceholder="Search agreements..."
                  searchKeys={["decision_no", "agreement_name", "employer_name"]}
                  onRowClick={(item) =>
                    router.push(`/agreements/${item.agreement_id}`)
                  }
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="employers">
          <div className="space-y-4">
            {canWrite && (
              <div className="flex justify-end">
                <Dialog open={dlgEmployer} onOpenChange={(o) => { setDlgEmployer(o); if (!o) resetDlg(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> Add Employer
                    </Button>
                  </DialogTrigger>
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
                      <Button variant="outline" onClick={() => { setDlgEmployer(false); resetDlg(); }}>Cancel</Button>
                      <Button onClick={handleAddEmployer} disabled={!selEmployerId || dlgLoading}>
                        {dlgLoading ? "Adding..." : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Asset owner (principal employer)</Label>
                  <div className="mt-1 text-sm">
                    {worksite.principal_employer ? (
                      <button
                        className="underline hover:text-foreground"
                        onClick={() =>
                          router.push(`/employers/${worksite.principal_employer!.employer_id}`)
                        }
                      >
                        {worksite.principal_employer.employer_name}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Operator</Label>
                  <div className="mt-1 text-sm">
                    {worksite.operator ? (
                      <button
                        className="underline hover:text-foreground"
                        onClick={() =>
                          router.push(`/employers/${worksite.operator!.employer_id}`)
                        }
                      >
                        {worksite.operator.employer_name}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </div>
              {worksite.principal_employer_id != null &&
                !employerRoleEmployerIds.has(worksite.principal_employer_id) && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Note: the asset owner is stored on the worksite record and may not appear below unless
                    added as an employer role.
                  </p>
                )}
            </div>
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
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> Add Work Scope
                    </Button>
                  </DialogTrigger>
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
                      <Button variant="outline" onClick={() => { setDlgScope(false); resetDlg(); }}>Cancel</Button>
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

        <TabsContent value="contracts">
          <div className="space-y-4">
            {canWrite && (
              <div className="flex justify-end">
                <Dialog open={dlgContract} onOpenChange={(o) => { setDlgContract(o); if (!o) resetDlg(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> Add Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add Contract</DialogTitle>
                      <DialogDescription>
                        Link a contractor employer to a work scope at this worksite, optionally tied to a program, site project, and/or specific agreement.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Work Scope <span className="text-destructive">*</span></Label>
                          <Select value={contractScopeId} onValueChange={setContractScopeId}>
                            <SelectTrigger><SelectValue placeholder="Select scope..." /></SelectTrigger>
                            <SelectContent>
                              {contractScopeOptions.map((s) => (
                                <SelectItem key={s.scope_id} value={String(s.scope_id)}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Contractor employer <span className="text-destructive">*</span></Label>
                          <Select value={contractEmployerId} onValueChange={setContractEmployerId}>
                            <SelectTrigger><SelectValue placeholder="Select employer..." /></SelectTrigger>
                            <SelectContent>
                              {contractEmployerOptions.map((e) => (
                                <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                                  {e.employer_name}{e.in_worksite ? "" : " (not linked)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Engagement Type</Label>
                          <Select value={contractEngagement} onValueChange={(v) => setContractEngagement(v as EngagementType)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ENGAGEMENT_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Program (optional)</Label>
                          <Select value={contractProgramId} onValueChange={setContractProgramId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {contractProgramOptions.map(([pid, name]) => (
                                <SelectItem key={pid} value={String(pid)}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Site Project (optional)</Label>
                          <Select value={contractProjectId} onValueChange={setContractProjectId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {wsProjects.map((p) => (
                                <SelectItem key={p.project_id} value={String(p.project_id)}>
                                  {p.project_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Agreement (optional)</Label>
                          <Select value={contractAgreementId} onValueChange={setContractAgreementId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {agreements.map((a) => (
                                <SelectItem key={a.agreement_id} value={String(a.agreement_id)}>
                                  {a.short_name || a.agreement_name} ({a.decision_no})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Start date</Label>
                          <Input type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>End date</Label>
                          <Input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                          <input
                            id="contract-is-current"
                            type="checkbox"
                            checked={contractIsCurrent}
                            onChange={(e) => setContractIsCurrent(e.target.checked)}
                            className="h-4 w-4 rounded border-input"
                          />
                          <Label htmlFor="contract-is-current">Current</Label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea value={contractNotes} onChange={(e) => setContractNotes(e.target.value)} />
                      </div>

                      {dlgError && <p className="text-sm text-destructive">{dlgError}</p>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setDlgContract(false); resetDlg(); }}>Cancel</Button>
                      <Button onClick={handleAddContract} disabled={!contractScopeId || !contractEmployerId || dlgLoading}>
                        {dlgLoading ? "Adding..." : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {wsContracts.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No contracts found for this worksite.
              </div>
            ) : (
              <DataTable
                data={wsContracts as WorksiteContractRow[]}
                columns={contractColumns}
                searchPlaceholder="Search contracts..."
                searchKeys={["scope_name", "contractor_name"]}
                onRowClick={(row) => {
                  if (row.agreement?.agreement_id) {
                    router.push(`/agreements/${row.agreement.agreement_id}`);
                    return;
                  }
                  if (row.contractor?.employer_id) {
                    router.push(`/employers/${row.contractor.employer_id}`);
                  }
                }}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="projects">
          <div className="space-y-4">
            {canWrite && (
              <div className="flex justify-end">
                <Dialog open={dlgProject} onOpenChange={(o) => { setDlgProject(o); if (!o) resetDlg(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> Add Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Project</DialogTitle>
                      <DialogDescription>Create a new site-level project at this worksite.</DialogDescription>
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
                      <Button variant="outline" onClick={() => { setDlgProject(false); resetDlg(); }}>Cancel</Button>
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

        <TabsContent value="programs">
          <div className="space-y-4">
            {canWrite && (
              <div className="flex justify-end">
                <Dialog open={dlgProgram} onOpenChange={(o) => { setDlgProgram(o); if (!o) resetDlg(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> Link Program
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Link Program</DialogTitle>
                      <DialogDescription>Associate this worksite with an existing program.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Program</Label>
                        <Select value={selProgramId} onValueChange={setSelProgramId}>
                          <SelectTrigger><SelectValue placeholder="Select program..." /></SelectTrigger>
                          <SelectContent>
                            {allPrograms
                              .filter((p) => !linkedProgramIds.has(p.program_id))
                              .map((p) => (
                                <SelectItem key={p.program_id} value={String(p.program_id)}>
                                  {p.program_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="program-link-primary-worksite"
                          type="checkbox"
                          checked={selProgramPrimary}
                          onChange={(e) => setSelProgramPrimary(e.target.checked)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <Label htmlFor="program-link-primary-worksite">Mark as primary</Label>
                      </div>
                      {dlgError && <p className="text-sm text-destructive">{dlgError}</p>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setDlgProgram(false); resetDlg(); }}>Cancel</Button>
                      <Button onClick={handleLinkProgram} disabled={!selProgramId || dlgLoading}>
                        {dlgLoading ? "Linking..." : "Link"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {wsProgramLinks.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No programs linked to this worksite.
              </div>
            ) : (
              <DataTable
                data={wsProgramLinks as ProgramWorksiteRow[]}
                columns={programColumns}
                searchPlaceholder="Search programs..."
                searchKeys={["program_name"]}
                onRowClick={(row) =>
                  row.program?.program_id
                    ? router.push(`/programs/${row.program.program_id}`)
                    : undefined
                }
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
