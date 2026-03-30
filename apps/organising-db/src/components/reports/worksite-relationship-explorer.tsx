"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorksiteMap } from "@/components/maps/worksite-map";
import type {
  EbaStatusCategory,
  EmployerCategory,
  EmployerRoleType,
  EmployerWorksiteRole,
  Worksite,
  WorksiteEmployerEbaStatus,
} from "@/types/database";
import { Building2, Factory, Network, Star } from "lucide-react";
import { EBA_STATUS_META, ebaStatusLabel, ebaStatusVariant } from "./principal-employer-eba-chart";

type EmployerLite = {
  employer_id: number;
  employer_name: string;
  parent_employer_id: number | null;
  employer_category: EmployerCategory | null;
};

interface WorksiteRelationshipExplorerProps {
  worksites: Worksite[];
  coverageRows: WorksiteEmployerEbaStatus[];
  worksiteRoles: EmployerWorksiteRole[];
  employers: EmployerLite[];
  isLoading?: boolean;
}

type GraphNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: "worksite" | "principal" | "employer" | "parent";
  employerId?: number;
};

const STATUS_RANK: Record<EbaStatusCategory, number> = {
  no_eba_no_bargaining: 7,
  expired_eba: 6,
  expiry_lt_6m: 5,
  first_bargaining: 4,
  expiry_6_12m: 3,
  expiry_12_24m: 2,
  expiry_gt_24m: 1,
};

const STATUS_COLOR: Record<EbaStatusCategory, string> = Object.fromEntries(
  EBA_STATUS_META.map((m) => [m.category, m.color])
) as Record<EbaStatusCategory, string>;

export function WorksiteRelationshipExplorer({
  worksites,
  coverageRows,
  worksiteRoles,
  employers,
  isLoading = false,
}: WorksiteRelationshipExplorerProps) {
  const [selectedWorksiteId, setSelectedWorksiteId] = useState<number | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const employerById = useMemo(
    () => new Map(employers.map((e) => [e.employer_id, e])),
    [employers]
  );

  const summaries = useMemo(() => {
    const grouped = new Map<number, WorksiteEmployerEbaStatus[]>();
    for (const row of coverageRows) {
      const bucket = grouped.get(row.worksite_id) ?? [];
      bucket.push(row);
      grouped.set(row.worksite_id, bucket);
    }

    return worksites.map((ws) => {
      const rows = grouped.get(ws.worksite_id) ?? [];
      const counts: Partial<Record<EbaStatusCategory, number>> = {};
      for (const row of rows) {
        counts[row.eba_status_category] = (counts[row.eba_status_category] ?? 0) + 1;
      }

      const worst = rows.reduce<EbaStatusCategory | null>((acc, row) => {
        if (!acc) return row.eba_status_category;
        return STATUS_RANK[row.eba_status_category] > STATUS_RANK[acc]
          ? row.eba_status_category
          : acc;
      }, null);

      return {
        worksite: ws,
        rows,
        pairCount: rows.length,
        counts,
        worstCategory: worst,
      };
    });
  }, [coverageRows, worksites]);

  useEffect(() => {
    if (!selectedWorksiteId && summaries.length > 0) {
      setSelectedWorksiteId(summaries[0].worksite.worksite_id);
      return;
    }
    if (
      selectedWorksiteId &&
      !summaries.some((s) => s.worksite.worksite_id === selectedWorksiteId)
    ) {
      setSelectedWorksiteId(summaries[0]?.worksite.worksite_id ?? null);
    }
  }, [selectedWorksiteId, summaries]);

  const selectedSummary = useMemo(
    () => summaries.find((s) => s.worksite.worksite_id === selectedWorksiteId) ?? null,
    [summaries, selectedWorksiteId]
  );

  const selectedRoles = useMemo(() => {
    if (!selectedWorksiteId) return [];
    return worksiteRoles.filter(
      (r) => r.worksite_id === selectedWorksiteId && r.is_current
    );
  }, [selectedWorksiteId, worksiteRoles]);

  const roleMap = useMemo(() => {
    const map = new Map<number, EmployerRoleType[]>();
    for (const role of selectedRoles) {
      const current = map.get(role.employer_id) ?? [];
      if (!current.includes(role.role_type)) current.push(role.role_type);
      map.set(role.employer_id, current);
    }
    return map;
  }, [selectedRoles]);

  const graph = useMemo(() => {
    if (!selectedSummary) return null;

    const width = 860;
    const height = 520;
    const center = { x: width / 2, y: height / 2 + 10 };
    const employerRows = selectedSummary.rows;

    const nodes: GraphNode[] = [
      {
        id: `worksite-${selectedSummary.worksite.worksite_id}`,
        label: selectedSummary.worksite.worksite_name,
        x: center.x,
        y: center.y,
        kind: "worksite",
      },
    ];

    const edges: { from: string; to: string; color: string; dashed?: boolean }[] = [];

    const principalId =
      selectedSummary.worksite.principal_employer_id ??
      employerRows.find((r) => r.principal_employer_id)?.principal_employer_id ??
      null;

    if (principalId) {
      const principal = employerById.get(principalId);
      nodes.push({
        id: `principal-${principalId}`,
        label: principal?.employer_name ?? "Principal Employer",
        x: center.x,
        y: 70,
        kind: "principal",
        employerId: principalId,
      });
      edges.push({
        from: `principal-${principalId}`,
        to: `worksite-${selectedSummary.worksite.worksite_id}`,
        color: "#a16207",
        dashed: true,
      });
    }

    const ringRadius = Math.max(150, Math.min(220, 120 + employerRows.length * 8));
    const startAngle = -Math.PI / 2;
    const step = (2 * Math.PI) / Math.max(1, employerRows.length);

    const parentAngleBuckets = new Map<number, number[]>();

    employerRows.forEach((row, idx) => {
      const employer = employerById.get(row.employer_id);
      const angle = startAngle + idx * step;
      const x = center.x + ringRadius * Math.cos(angle);
      const y = center.y + ringRadius * Math.sin(angle);
      nodes.push({
        id: `employer-${row.employer_id}`,
        label: employer?.employer_name ?? row.employer_name,
        x,
        y,
        kind: "employer",
        employerId: row.employer_id,
      });

      edges.push({
        from: `worksite-${selectedSummary.worksite.worksite_id}`,
        to: `employer-${row.employer_id}`,
        color: STATUS_COLOR[row.eba_status_category],
      });

      const parentId = employer?.parent_employer_id ?? row.parent_employer_id;
      if (parentId) {
        const parentAngles = parentAngleBuckets.get(parentId) ?? [];
        parentAngles.push(angle);
        parentAngleBuckets.set(parentId, parentAngles);
      }
    });

    parentAngleBuckets.forEach((angles, parentId) => {
      const avgAngle = angles.reduce((sum, a) => sum + a, 0) / angles.length;
      const parentRadius = ringRadius + 90;
      const x = center.x + parentRadius * Math.cos(avgAngle);
      const y = center.y + parentRadius * Math.sin(avgAngle);
      const parent = employerById.get(parentId);
      nodes.push({
        id: `parent-${parentId}`,
        label: parent?.employer_name ?? `Parent ${parentId}`,
        x,
        y,
        kind: "parent",
        employerId: parentId,
      });

      for (const row of employerRows) {
        const child = employerById.get(row.employer_id);
        if (child?.parent_employer_id === parentId || row.parent_employer_id === parentId) {
          edges.push({
            from: `parent-${parentId}`,
            to: `employer-${row.employer_id}`,
            color: "#6b7280",
            dashed: true,
          });
        }
      }
    });

    return { width, height, nodes, edges };
  }, [selectedSummary, employerById]);

  const activeNode = useMemo(
    () => graph?.nodes.find((n) => n.id === activeNodeId) ?? null,
    [graph, activeNodeId]
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Loading worksite relationship explorer...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-blue-600" />
            Worksite Coverage Overview
          </CardTitle>
          <CardDescription>
            Marker colour reflects the highest EBA risk for each worksite. Select a worksite to inspect
            employer, parent-company and principal-employer connections.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <WorksiteMap
            worksites={worksites}
            height="420px"
            showFilters={false}
            selectedWorksiteId={selectedWorksiteId}
            onWorksiteClick={(ws) => {
              setSelectedWorksiteId(ws.worksite_id);
              setActiveNodeId(`worksite-${ws.worksite_id}`);
            }}
            markerColorResolver={(ws) => {
              const summary = summaries.find((s) => s.worksite.worksite_id === ws.worksite_id);
              if (!summary?.worstCategory) return "#9ca3af";
              return STATUS_COLOR[summary.worstCategory];
            }}
            popupExtraContent={(ws) => {
              const summary = summaries.find((s) => s.worksite.worksite_id === ws.worksite_id);
              if (!summary?.worstCategory) {
                return <p className="text-xs text-muted-foreground">No EBA coverage rows</p>;
              }
              return (
                <div className="space-y-1">
                  <p className="text-xs">
                    <span className="font-medium">Worst status:</span>{" "}
                    {ebaStatusLabel(summary.worstCategory)}
                  </p>
                  <p className="text-xs">
                    <span className="font-medium">Employer pairs:</span> {summary.pairCount}
                  </p>
                </div>
              );
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaries
              .slice()
              .sort((a, b) => {
                const aRank = a.worstCategory ? STATUS_RANK[a.worstCategory] : 0;
                const bRank = b.worstCategory ? STATUS_RANK[b.worstCategory] : 0;
                return bRank - aRank || b.pairCount - a.pairCount;
              })
              .slice(0, 8)
              .map((summary) => (
                <button
                  key={summary.worksite.worksite_id}
                  className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                    summary.worksite.worksite_id === selectedWorksiteId
                      ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedWorksiteId(summary.worksite.worksite_id);
                    setActiveNodeId(`worksite-${summary.worksite.worksite_id}`);
                  }}
                >
                  <p className="font-medium text-sm">{summary.worksite.worksite_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.pairCount} employer-worksite pairs
                  </p>
                  <div className="mt-2">
                    <Badge variant={summary.worstCategory ? ebaStatusVariant(summary.worstCategory) : "secondary"}>
                      {summary.worstCategory ? ebaStatusLabel(summary.worstCategory) : "No coverage"}
                    </Badge>
                  </div>
                </button>
              ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-emerald-600" />
            Relationship Drilldown
          </CardTitle>
          <CardDescription>
            Edges from worksite to employer are coloured by EBA status. Dashed links show principal and parent-company relationships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!graph || !selectedSummary ? (
            <p className="text-sm text-muted-foreground">Select a worksite to view its relationship graph.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-lg border p-2 overflow-x-auto">
                <svg
                  width={graph.width}
                  height={graph.height}
                  viewBox={`0 0 ${graph.width} ${graph.height}`}
                  role="img"
                  aria-label="Worksite relationship graph"
                >
                  {graph.edges.map((edge, idx) => {
                    const from = graph.nodes.find((n) => n.id === edge.from);
                    const to = graph.nodes.find((n) => n.id === edge.to);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={`${edge.from}-${edge.to}-${idx}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={edge.color}
                        strokeWidth={2}
                        strokeDasharray={edge.dashed ? "5,5" : undefined}
                        opacity={0.85}
                      />
                    );
                  })}

                  {graph.nodes.map((node) => {
                    const isActive = node.id === activeNodeId;
                    const fill =
                      node.kind === "worksite"
                        ? "#0ea5e9"
                        : node.kind === "principal"
                          ? "#f59e0b"
                          : node.kind === "parent"
                            ? "#64748b"
                            : "#10b981";
                    const radius =
                      node.kind === "worksite" ? 16 : node.kind === "principal" ? 14 : 11;
                    return (
                      <g
                        key={node.id}
                        onClick={() => setActiveNodeId(node.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius}
                          fill={fill}
                          stroke={isActive ? "#111827" : "#ffffff"}
                          strokeWidth={isActive ? 3 : 2}
                        />
                        <text
                          x={node.x}
                          y={node.y + radius + 12}
                          textAnchor="middle"
                          className="fill-foreground"
                          fontSize={11}
                        >
                          {node.label.length > 24 ? `${node.label.slice(0, 24)}...` : node.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Selected Node</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {activeNode ? (
                      <div className="space-y-2">
                        <p className="font-medium">{activeNode.label}</p>
                        <Badge variant="outline">
                          {activeNode.kind === "worksite" && "Worksite"}
                          {activeNode.kind === "principal" && "Principal Employer"}
                          {activeNode.kind === "employer" && "Employer"}
                          {activeNode.kind === "parent" && "Parent Employer"}
                        </Badge>
                        {activeNode.employerId && employerById.get(activeNode.employerId)?.employer_category && (
                          <p className="text-xs text-muted-foreground">
                            Category: {employerById.get(activeNode.employerId)?.employer_category?.replace(/_/g, " ")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Click a node to inspect details.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Employer Coverage at {selectedSummary.worksite.worksite_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedSummary.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No current employer coverage rows for this worksite.</p>
                    ) : (
                      selectedSummary.rows
                        .slice()
                        .sort((a, b) => STATUS_RANK[b.eba_status_category] - STATUS_RANK[a.eba_status_category])
                        .map((row) => (
                          <div key={`${row.worksite_id}-${row.employer_id}`} className="rounded border p-2">
                            <p className="text-sm font-medium">{row.employer_name}</p>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <Badge variant={ebaStatusVariant(row.eba_status_category)}>
                                {ebaStatusLabel(row.eba_status_category)}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setActiveNodeId(`employer-${row.employer_id}`)}
                              >
                                Focus
                              </Button>
                            </div>
                            {roleMap.get(row.employer_id)?.length ? (
                              <p className="text-xs text-muted-foreground mt-1">
                                Roles: {roleMap.get(row.employer_id)?.map((r) => r.replace(/_/g, " ")).join(", ")}
                              </p>
                            ) : null}
                          </div>
                        ))
                    )}
                  </CardContent>
                </Card>

                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    EBA Legend
                  </p>
                  <div className="grid grid-cols-1 gap-1">
                    {EBA_STATUS_META.map((meta) => (
                      <div key={meta.category} className="text-xs flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
                        {meta.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
