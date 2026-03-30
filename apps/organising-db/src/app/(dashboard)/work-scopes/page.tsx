"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { WorkScope } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

type ScopeWithCounts = WorkScope & {
  parent?: { scope_name: string; parent?: { scope_name: string } };
  employer_count: number;
  worksite_count: number;
};

type ScopeTree = WorkScope & {
  employer_count: number;
  worksite_count: number;
  children: ScopeTree[];
};

type EmployerScopeRow = {
  employer_id: number;
  employer_name: string;
  is_current: boolean;
  source: string;
} & Record<string, unknown>;

type WorksiteScopeRow = {
  worksite_id: number;
  worksite_name: string;
  employer_name: string | null;
  engagement_type: string | null;
  is_current: boolean;
} & Record<string, unknown>;

export default function WorkScopesPage() {
  const router = useRouter();
  const supabase = createClient();

  const { data: scopes = [], isLoading } = useQuery({
    queryKey: ["work-scopes-browse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scopes")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as WorkScope[];
    },
  });

  const { data: employerScopes = [] } = useQuery({
    queryKey: ["all-employer-scopes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_scopes")
        .select("scope_id, employer:employers(employer_id, employer_name), is_current, source")
        .eq("is_current", true);
      if (error) throw error;
      return data as unknown as { scope_id: number; employer?: { employer_id: number; employer_name: string }; is_current: boolean; source: string }[];
    },
  });

  const { data: worksiteScopes = [] } = useQuery({
    queryKey: ["all-worksite-scopes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksite_scopes")
        .select("scope_id, worksite:worksites(worksite_id, worksite_name), employer:employers(employer_name), engagement_type, is_current")
        .eq("is_current", true);
      if (error) throw error;
      return data as unknown as { scope_id: number; worksite?: { worksite_id: number; worksite_name: string }; employer?: { employer_name: string }; engagement_type: string | null; is_current: boolean }[];
    },
  });

  const employerCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const es of employerScopes) {
      map.set(es.scope_id, (map.get(es.scope_id) || 0) + 1);
    }
    return map;
  }, [employerScopes]);

  const worksiteCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const ws of worksiteScopes) {
      map.set(ws.scope_id, (map.get(ws.scope_id) || 0) + 1);
    }
    return map;
  }, [worksiteScopes]);

  const tree = useMemo(() => {
    const scopeMap = new Map<number, ScopeTree>();
    const roots: ScopeTree[] = [];

    for (const s of scopes) {
      scopeMap.set(s.scope_id, {
        ...s,
        employer_count: employerCountMap.get(s.scope_id) || 0,
        worksite_count: worksiteCountMap.get(s.scope_id) || 0,
        children: [],
      });
    }

    for (const node of scopeMap.values()) {
      if (node.parent_scope_id && scopeMap.has(node.parent_scope_id)) {
        scopeMap.get(node.parent_scope_id)!.children.push(node);
      } else if (!node.parent_scope_id) {
        roots.push(node);
      }
    }

    return roots;
  }, [scopes, employerCountMap, worksiteCountMap]);

  function employersForScope(scopeId: number): EmployerScopeRow[] {
    return employerScopes
      .filter((es) => es.scope_id === scopeId && es.employer)
      .map((es) => ({
        employer_id: es.employer!.employer_id,
        employer_name: es.employer!.employer_name,
        is_current: es.is_current,
        source: es.source,
      }));
  }

  function worksitesForScope(scopeId: number): WorksiteScopeRow[] {
    return worksiteScopes
      .filter((ws) => ws.scope_id === scopeId && ws.worksite)
      .map((ws) => ({
        worksite_id: ws.worksite!.worksite_id,
        worksite_name: ws.worksite!.worksite_name,
        employer_name: ws.employer?.employer_name ?? null,
        engagement_type: ws.engagement_type,
        is_current: ws.is_current,
      }));
  }

  const empCols: Column<EmployerScopeRow>[] = [
    { key: "employer_name", header: "Employer" },
    {
      key: "source",
      header: "Source",
      render: (item) => (
        <Badge variant={item.source === "auto" ? "info" : "secondary"}>
          {item.source === "auto" ? "Auto" : "Manual"}
        </Badge>
      ),
    },
  ];

  const wsCols: Column<WorksiteScopeRow>[] = [
    { key: "worksite_name", header: "Worksite" },
    { key: "employer_name", header: "Employer", render: (item) => item.employer_name ?? "—" },
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
  ];

  function renderScope(node: ScopeTree, depth: number = 0) {
    if (node.is_whole_of_project) return null;

    const emps = employersForScope(node.scope_id);
    const wss = worksitesForScope(node.scope_id);
    const hasData = emps.length > 0 || wss.length > 0 || node.children.length > 0;

    return (
      <AccordionItem key={node.scope_id} value={String(node.scope_id)}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-3 text-left">
            <span className="font-medium">{node.scope_name}</span>
            {node.employer_count > 0 && (
              <Badge variant="secondary">{node.employer_count} employer{node.employer_count !== 1 ? "s" : ""}</Badge>
            )}
            {node.worksite_count > 0 && (
              <Badge variant="info">{node.worksite_count} worksite{node.worksite_count !== 1 ? "s" : ""}</Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pl-4">
            {node.children.length > 0 && (
              <Accordion type="multiple" className="w-full">
                {node.children.map((child) => renderScope(child, depth + 1))}
              </Accordion>
            )}
            {emps.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Employers</h4>
                <DataTable
                  data={emps as EmployerScopeRow[]}
                  columns={empCols}
                  searchPlaceholder="Search employers..."
                  searchKeys={["employer_name"]}
                  pageSize={10}
                  onRowClick={(item) => router.push(`/employers/${item.employer_id}`)}
                />
              </div>
            )}
            {wss.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Worksites</h4>
                <DataTable
                  data={wss as WorksiteScopeRow[]}
                  columns={wsCols}
                  searchPlaceholder="Search worksites..."
                  searchKeys={["worksite_name", "employer_name"]}
                  pageSize={10}
                  onRowClick={(item) => router.push(`/worksites/${item.worksite_id}`)}
                />
              </div>
            )}
            {!hasData && (
              <p className="text-sm text-muted-foreground">No employers or worksites assigned to this scope.</p>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  const totalEmployers = new Set(employerScopes.filter((e) => e.employer).map((e) => e.employer!.employer_id)).size;
  const totalWorksites = new Set(worksiteScopes.filter((w) => w.worksite).map((w) => w.worksite!.worksite_id)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Work Scopes</h1>
        <p className="text-muted-foreground">
          Browse the work scope hierarchy and see which employers and worksites are associated with each scope.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Scopes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{scopes.filter((s) => !s.is_whole_of_project).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Employers with Scopes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalEmployers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Worksites with Scopes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalWorksites}</p>
          </CardContent>
        </Card>
      </div>

      <Accordion type="multiple" className="w-full">
        {tree.map((root) => renderScope(root))}
      </Accordion>
    </div>
  );
}
