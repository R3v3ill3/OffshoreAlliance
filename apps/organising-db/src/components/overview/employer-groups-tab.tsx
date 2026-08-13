"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { excludeSmsEpisodes } from "@/lib/campaign/visible-campaigns";
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
import {
  Search,
  Building2,
  MapPin,
  FileText,
  Users,
  ArrowUpDown,
  Star,
} from "lucide-react";
import {
  CampaignStatusBadge,
  getCampaignStatusForEmployers,
  type CampaignWithStages,
} from "./campaign-status-badge";
import {
  EmployerGroupDetailSheet,
  type EmployerGroupDetail,
} from "./employer-group-detail-sheet";

type SortField = "name" | "members" | "worksites" | "workers" | "agreements";
type GroupFilter = "all" | "grouped" | "ungrouped";

interface EmployerRow {
  employer_id: number;
  employer_name: string;
  employer_category: string | null;
  abn: string | null;
  parent_employer_id: number | null;
  is_active: boolean;
}

export function EmployerGroupsTab() {
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedGroup, setSelectedGroup] = useState<EmployerGroupDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: allEmployers = [], isLoading: employersLoading } = useQuery({
    queryKey: ["overview-all-employers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name, employer_category, abn, parent_employer_id, is_active")
        .order("employer_name");
      if (error) throw error;
      return data as EmployerRow[];
    },
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ["overview-sectors-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sectors")
        .select("sector_id, sector_name")
        .order("sector_name");
      if (error) throw error;
      return data as { sector_id: number; sector_name: string }[];
    },
  });

  const { data: employerSectors = [] } = useQuery({
    queryKey: ["overview-employer-sectors-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_sectors")
        .select("employer_id, sector_id");
      if (error) throw error;
      return data as { employer_id: number; sector_id: number }[];
    },
  });

  const { data: worksiteRoles = [] } = useQuery({
    queryKey: ["overview-employer-worksite-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_worksite_roles")
        .select(`
          employer_id,
          worksites (
            worksite_id,
            worksite_name,
            worksite_type,
            is_offshore,
            is_active
          )
        `);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as unknown) as {
        employer_id: number;
        worksites: {
          worksite_id: number;
          worksite_name: string;
          worksite_type: string;
          is_offshore: boolean;
          is_active: boolean;
        } | null;
      }[];
    },
  });

  const { data: agreementEmployers = [] } = useQuery({
    queryKey: ["overview-agreement-employers-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreement_employers")
        .select(`
          employer_id,
          agreements (
            agreement_id,
            agreement_name,
            short_name,
            status,
            expiry_date
          )
        `);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as unknown) as {
        employer_id: number;
        agreements: {
          agreement_id: number;
          agreement_name: string;
          short_name: string | null;
          status: string;
          expiry_date: string | null;
        } | null;
      }[];
    },
  });

  const { data: allWorkers = [] } = useQuery({
    queryKey: ["overview-workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select(
          "worker_id, first_name, last_name, occupation, employer_id, is_active"
        );
      if (error) throw error;
      return data as {
        worker_id: number;
        first_name: string;
        last_name: string;
        occupation: string | null;
        employer_id: number | null;
        is_active: boolean;
      }[];
    },
  });

  const { data: employerScopes = [] } = useQuery({
    queryKey: ["overview-employer-scopes-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_scopes")
        .select(`
          employer_id,
          work_scopes (
            scope_id,
            scope_name
          )
        `)
        .eq("is_current", true);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as unknown) as {
        employer_id: number;
        work_scopes: { scope_id: number; scope_name: string } | null;
      }[];
    },
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["overview-campaigns"],
    queryFn: async () => {
      const { data, error } = await excludeSmsEpisodes(
        supabase
          .from("campaigns")
          .select(`
          campaign_id,
          name,
          status,
          campaign_employers (employer_id),
          campaign_stage_plans (stage_number, status)
        `)
          .in("status", ["planning", "active"])
      );
      if (error) throw error;
      return data as CampaignWithStages[];
    },
  });

  // Build groups from employers
  const groups: EmployerGroupDetail[] = useMemo(() => {
    if (!allEmployers.length) return [];

    // Find employer IDs that are referenced as parent by at least one other employer
    const parentIds = new Set(
      allEmployers
        .filter((e) => e.parent_employer_id !== null)
        .map((e) => e.parent_employer_id!)
    );

    // Helper: build detail for a set of employer IDs
    const buildGroupDetail = (
      employerIds: number[],
      groupName: string,
      parentId: number | null,
      isGrouped: boolean
    ): EmployerGroupDetail => {
      const empIdSet = new Set(employerIds);

      // Worksites (deduplicated)
      const worksiteMap = new Map<
        number,
        EmployerGroupDetail["worksites"][number]
      >();
      for (const role of worksiteRoles) {
        if (empIdSet.has(role.employer_id) && role.worksites) {
          if (!worksiteMap.has(role.worksites.worksite_id)) {
            worksiteMap.set(role.worksites.worksite_id, role.worksites);
          }
        }
      }

      // Agreements (deduplicated)
      const agreementMap = new Map<
        number,
        EmployerGroupDetail["agreements"][number]
      >();
      for (const ae of agreementEmployers) {
        if (empIdSet.has(ae.employer_id) && ae.agreements) {
          if (!agreementMap.has(ae.agreements.agreement_id)) {
            agreementMap.set(ae.agreements.agreement_id, ae.agreements);
          }
        }
      }

      // Workers
      const workers = allWorkers.filter(
        (w) => w.employer_id !== null && empIdSet.has(w.employer_id)
      );

      // Work scopes (deduplicated)
      const scopeMap = new Map<
        number,
        { scope_id: number; scope_name: string; engagement_type: null }
      >();
      for (const es of employerScopes) {
        if (empIdSet.has(es.employer_id) && es.work_scopes) {
          if (!scopeMap.has(es.work_scopes.scope_id)) {
            scopeMap.set(es.work_scopes.scope_id, {
              ...es.work_scopes,
              engagement_type: null,
            });
          }
        }
      }

      const memberEmployers = allEmployers.filter((e) =>
        empIdSet.has(e.employer_id)
      );
      const parentEmp = parentId
        ? allEmployers.find((e) => e.employer_id === parentId) ?? null
        : null;

      return {
        group_id: parentId,
        group_name: groupName,
        is_grouped: isGrouped,
        parent_employer: parentEmp
          ? {
              employer_id: parentEmp.employer_id,
              employer_name: parentEmp.employer_name,
              employer_category: parentEmp.employer_category,
              abn: parentEmp.abn,
              is_active: parentEmp.is_active,
            }
          : null,
        members: memberEmployers.map((e) => ({
          employer_id: e.employer_id,
          employer_name: e.employer_name,
          employer_category: e.employer_category,
          abn: e.abn,
          is_active: e.is_active,
          is_parent: e.employer_id === parentId,
        })),
        worksites: Array.from(worksiteMap.values()),
        agreements: Array.from(agreementMap.values()),
        workers,
        work_scopes: Array.from(scopeMap.values()),
      };
    };

    const result: EmployerGroupDetail[] = [];
    const processedEmployerIds = new Set<number>();

    // Build groups: each parent employer + their children
    for (const parentId of parentIds) {
      const parent = allEmployers.find((e) => e.employer_id === parentId);
      if (!parent) continue;

      const children = allEmployers.filter(
        (e) => e.parent_employer_id === parentId
      );
      const allMemberIds = [parentId, ...children.map((c) => c.employer_id)];

      result.push(
        buildGroupDetail(allMemberIds, parent.employer_name, parentId, true)
      );

      allMemberIds.forEach((id) => processedEmployerIds.add(id));
    }

    // Ungrouped: employers not yet in any group
    for (const emp of allEmployers) {
      if (!processedEmployerIds.has(emp.employer_id)) {
        result.push(
          buildGroupDetail(
            [emp.employer_id],
            emp.employer_name,
            null,
            false
          )
        );
      }
    }

    return result;
  }, [
    allEmployers,
    worksiteRoles,
    agreementEmployers,
    allWorkers,
    employerScopes,
  ]);

  const filtered = useMemo(() => {
    let list = groups;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((g) => g.group_name.toLowerCase().includes(q));
    }
    if (groupFilter === "grouped") {
      list = list.filter((g) => g.is_grouped);
    } else if (groupFilter === "ungrouped") {
      list = list.filter((g) => !g.is_grouped);
    }
    if (sectorFilter !== "all") {
      const sectorId = Number(sectorFilter);
      const empIdsInSector = new Set(
        employerSectors
          .filter((es) => es.sector_id === sectorId)
          .map((es) => es.employer_id)
      );
      list = list.filter((g) =>
        g.members.some((m) => empIdsInSector.has(m.employer_id))
      );
    }
    if (campaignFilter === "has_campaign") {
      list = list.filter(
        (g) =>
          getCampaignStatusForEmployers(
            g.members.map((m) => m.employer_id),
            campaigns
          ) !== null
      );
    } else if (campaignFilter === "no_campaign") {
      list = list.filter(
        (g) =>
          getCampaignStatusForEmployers(
            g.members.map((m) => m.employer_id),
            campaigns
          ) === null
      );
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.group_name.localeCompare(b.group_name);
          break;
        case "members":
          cmp = a.members.length - b.members.length;
          break;
        case "worksites":
          cmp = a.worksites.length - b.worksites.length;
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
  }, [
    groups,
    search,
    groupFilter,
    sectorFilter,
    campaignFilter,
    campaigns,
    sortField,
    sortDir,
    employerSectors,
  ]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const groupedCount = groups.filter((g) => g.is_grouped).length;
  const ungroupedCount = groups.filter((g) => !g.is_grouped).length;

  const isLoading = employersLoading || campaignsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <EurekaLoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{groupedCount} groups</Badge>
        <Badge variant="outline">{ungroupedCount} ungrouped</Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select
          value={groupFilter}
          onValueChange={(v) => setGroupFilter(v as GroupFilter)}
        >
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Group type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="grouped">Groups only</SelectItem>
            <SelectItem value="ungrouped">Ungrouped only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.sector_id} value={String(s.sector_id)}>
                {s.sector_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaign Status</SelectItem>
            <SelectItem value="has_campaign">Has Active Campaign</SelectItem>
            <SelectItem value="no_campaign">No Campaign</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-sm text-muted-foreground">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="text-sm text-muted-foreground">Sort:</span>
          {(
            [
              { field: "name" as SortField, label: "Name" },
              { field: "members" as SortField, label: "Members" },
              { field: "worksites" as SortField, label: "Worksites" },
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
              {sortField === field && <ArrowUpDown className="h-3 w-3" />}
            </Button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No employer groups match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((group) => {
            const employerIds = group.members.map((m) => m.employer_id);
            return (
              <Card
                key={group.is_grouped ? `group-${group.group_id}` : `emp-${group.members[0]?.employer_id}`}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                onClick={() => {
                  setSelectedGroup(group);
                  setSheetOpen(true);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight flex items-center gap-2">
                      {group.is_grouped && (
                        <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                      {group.group_name}
                    </CardTitle>
                    {group.is_grouped ? (
                      <Badge variant="warning" className="shrink-0 text-xs">
                        Group
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        Standalone
                      </Badge>
                    )}
                  </div>
                  {group.is_grouped && (
                    <p className="text-xs text-muted-foreground">
                      {group.members.filter((m) => !m.is_parent).length} subsidiar
                      {group.members.filter((m) => !m.is_parent).length !== 1
                        ? "ies"
                        : "y"}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {group.is_grouped && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          Members
                        </span>
                        <span className="text-lg font-semibold">
                          {group.members.length}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Worksites
                      </span>
                      <span className="text-lg font-semibold">
                        {group.worksites.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Agreements
                      </span>
                      <span className="text-lg font-semibold">
                        {group.agreements.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Workers
                      </span>
                      <span className="text-lg font-semibold">
                        {group.workers.length}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1 border-t">
                    <CampaignStatusBadge
                      employerIds={employerIds}
                      campaigns={campaigns}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EmployerGroupDetailSheet
        group={selectedGroup}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        campaigns={campaigns}
      />
    </div>
  );
}
