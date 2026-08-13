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
import { Search, Building2, FileText, Users, Layers, ArrowUpDown, Tag } from "lucide-react";
import { CampaignStatusBadge, getCampaignStatusForEmployers, type CampaignWithStages } from "./campaign-status-badge";
import { SectorDetailSheet, type SectorDetail } from "./sector-detail-sheet";

type SortField = "name" | "employers" | "agreements" | "workers";

export function SectorsTab() {
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [employerFilter, setEmployerFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedSector, setSelectedSector] = useState<SectorDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: sectors = [], isLoading: sectorsLoading } = useQuery({
    queryKey: ["overview-sectors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sectors")
        .select("sector_id, sector_name, description")
        .order("sector_name");
      if (error) throw error;
      return data as { sector_id: number; sector_name: string; description: string | null }[];
    },
  });

  const { data: employerSectors = [] } = useQuery({
    queryKey: ["overview-employer-sectors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_sectors")
        .select(`
          sector_id,
          employers (
            employer_id,
            employer_name,
            employer_category,
            is_active
          )
        `);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as unknown) as {
        sector_id: number;
        employers: { employer_id: number; employer_name: string; employer_category: string | null; is_active: boolean } | null;
      }[];
    },
  });

  const { data: agreementsWithSector = [] } = useQuery({
    queryKey: ["overview-agreements-with-sector"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(`
          agreement_id,
          agreement_name,
          short_name,
          status,
          expiry_date,
          sector_id,
          employer_id,
          agreement_employers (
            employers (
              employer_id,
              employer_name,
              employer_category,
              is_active
            )
          )
        `)
        .not("sector_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  // Fetch worksites via employer_worksite_roles (employer → worksite link)
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
        worksites: { worksite_id: number; worksite_name: string; worksite_type: string; is_offshore: boolean; is_active: boolean } | null;
      }[];
    },
  });

  // Fetch workers via employers
  const { data: allWorkers = [] } = useQuery({
    queryKey: ["overview-workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name, occupation, employer_id, is_active");
      if (error) throw error;
      return data as { worker_id: number; first_name: string; last_name: string; occupation: string | null; employer_id: number | null; is_active: boolean }[];
    },
  });

  // Fetch work scopes via agreement_scopes
  const { data: agreementScopes = [] } = useQuery({
    queryKey: ["overview-agreement-scopes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreement_scopes")
        .select(`
          agreement_id,
          work_scopes (
            scope_id,
            scope_name
          )
        `);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as unknown) as {
        agreement_id: number;
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

  const sectorDetails: SectorDetail[] = useMemo(() => {
    return sectors.map((sector) => {
      // Direct employers via employer_sectors
      const directEmployers = employerSectors
        .filter((es) => es.sector_id === sector.sector_id && es.employers)
        .map((es) => ({ ...es.employers!, source: "direct" as const }));

      const directEmployerIds = new Set(directEmployers.map((e) => e.employer_id));

      // Agreements in this sector
      const sectorAgreements = agreementsWithSector
        .filter((a) => a.sector_id === sector.sector_id)
        .map((a) => ({
          agreement_id: a.agreement_id,
          agreement_name: a.agreement_name,
          short_name: a.short_name,
          status: a.status,
          expiry_date: a.expiry_date,
          employer_id: a.employer_id,
        }));

      // Employers via agreements (deduplicated)
      const viaAgreementEmployers: SectorDetail["employers"] = [];
      for (const agr of agreementsWithSector.filter((a) => a.sector_id === sector.sector_id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const empLinks = ((agr.agreement_employers ?? []) as unknown) as { employers: { employer_id: number; employer_name: string; employer_category: string | null; is_active: boolean } | null }[];
        for (const el of empLinks) {
          if (el.employers && !directEmployerIds.has(el.employers.employer_id)) {
            viaAgreementEmployers.push({ ...el.employers, source: "agreement" });
            directEmployerIds.add(el.employers.employer_id);
          }
        }
        // Also add agreement.employer_id directly if set
        if (agr.employer_id && !directEmployerIds.has(agr.employer_id)) {
          // find in all workers or skip — we can't easily look up without all employers
          // (we'll just record the id; employer_name won't be available here)
        }
      }

      const allEmployers = [...directEmployers, ...viaAgreementEmployers];
      const allEmployerIds = allEmployers.map((e) => e.employer_id);

      // Worksites via employer → worksite roles
      const worksiteMap = new Map<number, SectorDetail["worksites"][number]>();
      for (const role of worksiteRoles) {
        if (allEmployerIds.includes(role.employer_id) && role.worksites) {
          if (!worksiteMap.has(role.worksites.worksite_id)) {
            worksiteMap.set(role.worksites.worksite_id, role.worksites);
          }
        }
      }

      // Workers via employer
      const employerIdSet = new Set(allEmployerIds);
      const workers = allWorkers.filter((w) => w.employer_id !== null && employerIdSet.has(w.employer_id));

      // Work scopes via agreement_scopes
      const agreementIds = new Set(sectorAgreements.map((a) => a.agreement_id));
      const scopeMap = new Map<number, { scope_id: number; scope_name: string }>();
      for (const as_ of agreementScopes) {
        if (agreementIds.has(as_.agreement_id) && as_.work_scopes) {
          if (!scopeMap.has(as_.work_scopes.scope_id)) {
            scopeMap.set(as_.work_scopes.scope_id, as_.work_scopes);
          }
        }
      }

      return {
        sector_id: sector.sector_id,
        sector_name: sector.sector_name,
        description: sector.description,
        employers: allEmployers,
        agreements: sectorAgreements,
        worksites: Array.from(worksiteMap.values()),
        workers,
        work_scopes: Array.from(scopeMap.values()),
      };
    });
  }, [sectors, employerSectors, agreementsWithSector, worksiteRoles, allWorkers, agreementScopes]);

  const filtered = useMemo(() => {
    let list = sectorDetails;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.sector_name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q)
      );
    }
    if (employerFilter === "has_employers") {
      list = list.filter((s) => s.employers.length > 0);
    } else if (employerFilter === "no_employers") {
      list = list.filter((s) => s.employers.length === 0);
    }
    if (campaignFilter === "has_campaign") {
      list = list.filter(
        (s) =>
          getCampaignStatusForEmployers(
            s.employers.map((e) => e.employer_id),
            campaigns
          ) !== null
      );
    } else if (campaignFilter === "no_campaign") {
      list = list.filter(
        (s) =>
          getCampaignStatusForEmployers(
            s.employers.map((e) => e.employer_id),
            campaigns
          ) === null
      );
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.sector_name.localeCompare(b.sector_name);
          break;
        case "employers":
          cmp = a.employers.length - b.employers.length;
          break;
        case "agreements":
          cmp = a.agreements.length - b.agreements.length;
          break;
        case "workers":
          cmp = a.workers.length - b.workers.length;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [sectorDetails, search, employerFilter, campaignFilter, campaigns, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const isLoading = sectorsLoading || campaignsLoading;

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
            placeholder="Search sectors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={employerFilter} onValueChange={setEmployerFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Employer filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            <SelectItem value="has_employers">Has Employers</SelectItem>
            <SelectItem value="no_employers">No Employers</SelectItem>
          </SelectContent>
        </Select>

        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Campaign filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaign Status</SelectItem>
            <SelectItem value="has_campaign">Has Active Campaign</SelectItem>
            <SelectItem value="no_campaign">No Campaign</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-sm text-muted-foreground">
            {filtered.length} sector{filtered.length !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="text-sm text-muted-foreground">Sort:</span>
          {(
            [
              { field: "name" as SortField, label: "Name" },
              { field: "employers" as SortField, label: "Employers" },
              { field: "agreements" as SortField, label: "Agreements" },
              { field: "workers" as SortField, label: "Workers" },
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
          No sectors match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((sector) => {
            const employerIds = sector.employers.map((e) => e.employer_id);
            return (
              <Card
                key={sector.sector_id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                onClick={() => {
                  setSelectedSector(sector);
                  setSheetOpen(true);
                }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                    {sector.sector_name}
                  </CardTitle>
                  {sector.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {sector.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        Employers
                      </span>
                      <span className="text-lg font-semibold">{sector.employers.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Agreements
                      </span>
                      <span className="text-lg font-semibold">{sector.agreements.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Workers
                      </span>
                      <span className="text-lg font-semibold">{sector.workers.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        Scopes
                      </span>
                      <span className="text-lg font-semibold">{sector.work_scopes.length}</span>
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

      <SectorDetailSheet
        sector={selectedSector}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        campaigns={campaigns}
      />
    </div>
  );
}
