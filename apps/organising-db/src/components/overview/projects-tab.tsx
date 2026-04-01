"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { Search, MapPin, Building2, FileText, Users, ArrowUpDown } from "lucide-react";
import { CampaignStatusBadge, type CampaignWithStages } from "./campaign-status-badge";
import { ProjectDetailSheet, type ProjectDetail } from "./project-detail-sheet";
import type { WorkType, ProjectStatus } from "@/types/database";

const WORK_TYPES: WorkType[] = [
  "production",
  "construction",
  "decommissioning",
  "brownfields",
  "service_provision",
  "maintenance",
];

const PROJECT_STATUSES: ProjectStatus[] = [
  "planning",
  "active",
  "commissioning",
  "operational",
  "decommissioning",
  "completed",
  "absorbed",
];

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

type SortField = "name" | "status" | "employers" | "workers" | "agreements";

interface ProjectRow {
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
  employers: { employer_id: number; employer_name: string; employer_category: string | null; role_type: string }[];
  agreements: { agreement_id: number; agreement_name: string; short_name: string | null; status: string; expiry_date: string | null }[];
  workers: { worker_id: number; first_name: string; last_name: string; occupation: string | null; employer_id: number | null; is_active: boolean }[];
  work_scopes: { scope_id: number; scope_name: string; engagement_type: string | null }[];
}

export function ProjectsTab() {
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [workTypeFilter, setWorkTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("active");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: rawProjects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["overview-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(`
          project_id,
          work_type,
          project_status,
          is_active,
          start_date,
          expected_end_date,
          actual_end_date,
          notes,
          worksites (
            worksite_id,
            worksite_name,
            worksite_type,
            is_offshore,
            basin
          ),
          project_employers (
            role_type,
            employers (
              employer_id,
              employer_name,
              employer_category
            )
          ),
          project_agreements (
            agreements (
              agreement_id,
              agreement_name,
              short_name,
              status,
              expiry_date
            )
          )
        `)
        .order("work_type");
      if (error) throw error;
      return data;
    },
  });

  const { data: workersByProject = [] } = useQuery({
    queryKey: ["overview-workers-by-project"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name, occupation, employer_id, project_id, is_active")
        .not("project_id", "is", null);
      if (error) throw error;
      return data as { worker_id: number; first_name: string; last_name: string; occupation: string | null; employer_id: number | null; project_id: number | null; is_active: boolean }[];
    },
  });

  const { data: worksiteScopes = [] } = useQuery({
    queryKey: ["overview-worksite-scopes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksite_scopes")
        .select(`
          worksite_id,
          engagement_type,
          work_scopes (
            scope_id,
            scope_name
          )
        `);
      if (error) throw error;
      return data;
    },
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["overview-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(`
          campaign_id,
          name,
          status,
          campaign_employers (employer_id),
          campaign_stage_plans (stage_number, status)
        `)
        .in("status", ["planning", "active"]);
      if (error) throw error;
      return data as CampaignWithStages[];
    },
  });

  const projects: ProjectRow[] = useMemo(() => {
    return rawProjects.map((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = p as any;

      const employers = ((raw.project_employers ?? []) as { role_type: string; employers: { employer_id: number; employer_name: string; employer_category: string | null } | null }[]).flatMap((pe) => {
        if (!pe.employers) return [];
        return [{ ...pe.employers, role_type: pe.role_type }];
      });

      const agreements = ((raw.project_agreements ?? []) as { agreements: { agreement_id: number; agreement_name: string; short_name: string | null; status: string; expiry_date: string | null } | null }[]).flatMap((pa) => {
        if (!pa.agreements) return [];
        return [pa.agreements];
      });

      const workers = workersByProject.filter((w) => w.project_id === p.project_id);

      const ws = raw.worksites as { worksite_id: number; worksite_name: string; worksite_type: string; is_offshore: boolean; basin: string | null } | null;
      const wsId = ws?.worksite_id;
      const scopesForWs = wsId
        ? worksiteScopes.filter((s) => s.worksite_id === wsId).map((s) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sc = (s.work_scopes as unknown) as { scope_id: number; scope_name: string } | null;
            return {
              scope_id: sc?.scope_id ?? 0,
              scope_name: sc?.scope_name ?? "",
              engagement_type: s.engagement_type,
            };
          })
        : [];

      return {
        project_id: p.project_id,
        work_type: p.work_type,
        project_status: p.project_status,
        is_active: p.is_active,
        start_date: p.start_date,
        end_date: p.actual_end_date ?? p.expected_end_date ?? null,
        notes: p.notes,
        worksite: ws,
        employers,
        agreements,
        workers,
        work_scopes: scopesForWs,
      };
    });
  }, [rawProjects, workersByProject, worksiteScopes]);

  const filtered = useMemo(() => {
    let list = projects;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.work_type.toLowerCase().includes(q) ||
          (p.worksite?.worksite_name ?? "").toLowerCase().includes(q) ||
          p.project_status.toLowerCase().includes(q)
      );
    }
    if (workTypeFilter !== "all") {
      list = list.filter((p) => p.work_type === workTypeFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((p) => p.project_status === statusFilter);
    }
    if (activeFilter === "active") {
      list = list.filter((p) => p.is_active);
    } else if (activeFilter === "inactive") {
      list = list.filter((p) => !p.is_active);
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = (a.worksite?.worksite_name ?? a.work_type).localeCompare(
            b.worksite?.worksite_name ?? b.work_type
          );
          break;
        case "status":
          cmp = a.project_status.localeCompare(b.project_status);
          break;
        case "employers":
          cmp = a.employers.length - b.employers.length;
          break;
        case "workers":
          cmp = a.workers.length - b.workers.length;
          break;
        case "agreements":
          cmp = a.agreements.length - b.agreements.length;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [projects, search, workTypeFilter, statusFilter, activeFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const isLoading = projectsLoading || campaignsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <EurekaLoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={workTypeFilter} onValueChange={setWorkTypeFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Work type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Work Types</SelectItem>
            {WORK_TYPES.map((wt) => (
              <SelectItem key={wt} value={wt}>
                {wt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-sm text-muted-foreground">
            {filtered.length} project{filtered.length !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="text-sm text-muted-foreground">Sort:</span>
          {(
            [
              { field: "name" as SortField, label: "Name" },
              { field: "employers" as SortField, label: "Employers" },
              { field: "workers" as SortField, label: "Workers" },
              { field: "agreements" as SortField, label: "Agreements" },
            ] as { field: SortField; label: string }[]
          ).map(({ field, label }) => (
            <Button
              key={field}
              variant={sortField === field ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => toggleSort(field)}
            >
              {label}
              {sortField === field && (
                <ArrowUpDown className="h-3 w-3" />
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No projects match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const employerIds = project.employers.map((e) => e.employer_id);
            return (
              <Card
                key={project.project_id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                onClick={() => {
                  setSelectedProject(project);
                  setSheetOpen(true);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">
                      {project.work_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      {project.worksite && (
                        <span className="text-muted-foreground font-normal">
                          {" — "}{project.worksite.worksite_name}
                        </span>
                      )}
                    </CardTitle>
                    <Badge
                      variant={STATUS_VARIANTS[project.project_status] ?? "secondary"}
                      className="shrink-0 text-xs"
                    >
                      {project.project_status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {project.worksite && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {project.worksite.worksite_type.replace(/_/g, " ")}
                      {project.worksite.is_offshore && " · Offshore"}
                      {project.worksite.basin && ` · ${project.worksite.basin}`}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        Employers
                      </span>
                      <span className="text-lg font-semibold">{project.employers.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Agreements
                      </span>
                      <span className="text-lg font-semibold">{project.agreements.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Workers
                      </span>
                      <span className="text-lg font-semibold">{project.workers.length}</span>
                    </div>
                  </div>

                  <div className="pt-1 border-t">
                    <CampaignStatusBadge employerIds={employerIds} campaigns={campaigns} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectDetailSheet
        project={selectedProject}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        campaigns={campaigns}
      />
    </div>
  );
}
