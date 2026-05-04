"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from "@/lib/api/fetch-api";
import {
  Mail,
  Phone,
  Download,
  RefreshCw,
  Users,
  ChevronDown,
  ChevronRight,
  Search,
  CheckSquare,
  Square,
  Loader2,
  CheckCircle,
  AlertCircle,
  Send,
  ListPlus,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CampaignListBuilderProps {
  campaignId: string | number;
  canWrite: boolean;
  onListPrepared?: (tag: {
    tag_id: string;
    tag_href: string;
    tag_name: string;
    contacts_tagged: number;
    contacts_created: number;
  }) => void;
  /** When provided, the component switches to variation-aware multi-list creation mode. */
  variationMode?: {
    dimension: "membership_status" | "organising_role" | "occupation" | "rating_band";
    segments: Array<{ key: string; label: string }>;
  };
  /** Script ID to link when creating call lists. */
  scriptId?: number | null;
  /** phone_call_actions.action_id to update list_ids after bulk creation. */
  actionId?: number | null;
}

interface WorkerRow {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  employer_name: string | null;
  worksite_name: string | null;
  organising_role: string | null;
  organising_role_name: string | null;
  is_bargaining_rep: boolean;
  membership_status: string | null;
  union_membership_type_name?: string | null;
  non_oa_union_badge_initials?: string | null;
  action_network_id: string | null;
  unit_count?: number;
  is_multi_unit_member?: boolean;
}

interface EmployerOption {
  employer_id: number;
  employer_name: string;
}

interface WorksiteOption {
  worksite_id: number;
  worksite_name: string;
}

interface AnTagOption {
  an_tag_id: string;
  an_tag_name: string;
}

interface UnitOption {
  ou_id: number;
  name: string;
  ou_type: string;
}

const MEMBERSHIP_OPTIONS = [
  { value: "member", label: "Members" },
  { value: "member_pending", label: "Member – pending" },
  { value: "non_member", label: "Non-members" },
  { value: "lapsed", label: "Lapsed" },
];

const ROLE_OPTIONS = [
  { value: "delegate", label: "Delegate" },
  { value: "activist", label: "Activist" },
  { value: "contact", label: "Contact" },
  { value: "none", label: "None" },
];

export function CampaignListBuilder({
  campaignId,
  canWrite,
  onListPrepared,
  variationMode,
  scriptId,
  actionId,
}: CampaignListBuilderProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const numericId = Number(campaignId);

  const [membershipFilter, setMembershipFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [employerFilter, setEmployerFilter] = useState<string>("");
  const [worksiteFilter, setWorksiteFilter] = useState<string>("");
  const [occupationSearch, setOccupationSearch] = useState("");
  const [ouFilter, setOuFilter] = useState<string>("");
  const [ouTypeFilter, setOuTypeFilter] = useState<string>("");
  const [multiUnitOnly, setMultiUnitOnly] = useState(false);
  const [includeAnTags, setIncludeAnTags] = useState<string[]>([]);
  const [excludeAnTags, setExcludeAnTags] = useState<string[]>([]);
  const [showAnTags, setShowAnTags] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState<Set<number>>(
    new Set()
  );
  const [syncingTags, setSyncingTags] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [pushingList, setPushingList] = useState(false);
  const [pushResult, setPushResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Sort state
  const [sortKey, setSortKey] = useState<string>("name_asc");

  // Call list creation state
  const [listBaseName, setListBaseName] = useState("");
  const [creatingLists, setCreatingLists] = useState(false);
  const [createListResult, setCreateListResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const { data: employers = [] } = useQuery({
    queryKey: ["campaign-employers", numericId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_employers")
        .select("employer_id, employers(employer_name)")
        .eq("campaign_id", numericId);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        employer_id: row.employer_id as number,
        employer_name: (
          row.employers as { employer_name: string } | null
        )?.employer_name ?? "Unknown",
      })) as EmployerOption[];
    },
    enabled: !!user,
  });

  const { data: worksites = [] } = useQuery({
    queryKey: ["campaign-worksites", numericId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worksites")
        .select("worksite_id, worksites(worksite_name)")
        .eq("campaign_id", numericId);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        worksite_id: row.worksite_id as number,
        worksite_name: (
          row.worksites as { worksite_name: string } | null
        )?.worksite_name ?? "Unknown",
      })) as WorksiteOption[];
    },
    enabled: !!user,
  });

  const { data: units = [] } = useQuery({
    queryKey: ["campaign-units", numericId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, name, ou_type")
        .eq("campaign_id", numericId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as UnitOption[];
    },
    enabled: !!user,
  });

  const {
    data: anTags = [],
    refetch: refetchAnTags,
  } = useQuery({
    queryKey: ["campaign-an-tags", numericId],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${numericId}/sync-an`);
      if (!res.ok) throw new Error("Failed to fetch AN tags");
      const json = await res.json();
      return (json.data ?? []).map(
        (t: { an_tag_id: string; an_tag_name: string; worker_count?: number }) => ({
          an_tag_id: t.an_tag_id,
          an_tag_name: t.an_tag_name,
        })
      ) as AnTagOption[];
    },
    enabled: !!user && showAnTags,
  });

  const handleSyncTags = useCallback(async () => {
    setSyncingTags(true);
    setSyncResult(null);
    try {
      const res = await fetchApi(`/api/campaigns/${numericId}/sync-an`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_tags" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Sync failed");
      const { synced, errors } = json.data;
      setSyncResult({
        type: "success",
        message: `Synced ${synced} tag${synced !== 1 ? "s" : ""}${
          errors?.length ? ` (${errors.length} error${errors.length !== 1 ? "s" : ""})` : ""
        }`,
      });
      refetchAnTags();
      queryClient.invalidateQueries({
        queryKey: ["campaign-an-tags", numericId],
      });
    } catch (err) {
      setSyncResult({
        type: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      setSyncingTags(false);
    }
  }, [numericId, refetchAnTags, queryClient]);

  const {
    data: workers = [],
    isLoading: workersLoading,
    refetch: refetchWorkers,
  } = useQuery({
    queryKey: [
      "campaign-list-builder-workers",
      numericId,
      membershipFilter,
      roleFilter,
      employerFilter,
      worksiteFilter,
      ouFilter,
      ouTypeFilter,
      multiUnitOnly,
      occupationSearch,
      includeAnTags,
      excludeAnTags,
      sortKey,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (membershipFilter.length)
        params.set("membership", membershipFilter.join(","));
      if (roleFilter.length) params.set("roles", roleFilter.join(","));
      if (employerFilter) params.set("employer_id", employerFilter);
      if (worksiteFilter) params.set("worksite_id", worksiteFilter);
      if (ouFilter) params.set("ou_id", ouFilter);
      if (ouTypeFilter) params.set("ou_type", ouTypeFilter);
      if (multiUnitOnly) params.set("multi_unit_only", "true");
      if (occupationSearch.trim())
        params.set("occupation", occupationSearch.trim());
      if (includeAnTags.length)
        params.set("an_tags", includeAnTags.join(","));
      if (excludeAnTags.length)
        params.set("exclude_an_tags", excludeAnTags.join(","));
      params.set("sort", sortKey);

      const res = await fetchApi(
        `/api/campaigns/${numericId}/list-builder?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch workers");
      const json = await res.json();
      return (json.data ?? []) as WorkerRow[];
    },
    enabled: !!user,
  });

  const toggleMembership = (value: string) => {
    setMembershipFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleRole = (value: string) => {
    setRoleFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleAnTag = (
    tagId: string,
    type: "include" | "exclude"
  ) => {
    if (type === "include") {
      setIncludeAnTags((prev) =>
        prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
      );
      setExcludeAnTags((prev) => prev.filter((t) => t !== tagId));
    } else {
      setExcludeAnTags((prev) =>
        prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
      );
      setIncludeAnTags((prev) => prev.filter((t) => t !== tagId));
    }
  };

  const allSelected = useMemo(
    () => workers.length > 0 && selectedWorkers.size === workers.length,
    [workers, selectedWorkers]
  );

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedWorkers(new Set());
    } else {
      setSelectedWorkers(new Set(workers.map((w) => w.worker_id)));
    }
  }, [allSelected, workers]);

  const toggleWorker = (workerId: number) => {
    setSelectedWorkers((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const exportCsv = useCallback(() => {
    const rows = workers.filter(
      (w) => selectedWorkers.size === 0 || selectedWorkers.has(w.worker_id)
    );
    const headers = [
      "Name",
      "Email",
      "Phone",
      "Employer",
      "Worksite",
      "Occupation",
      "Role",
      "Membership bucket",
      "Membership type code",
      "Other union initials",
    ];
    const csvContent = [
      headers.join(","),
      ...rows.map((w) =>
        [
          `"${w.first_name} ${w.last_name}"`,
          `"${w.email ?? ""}"`,
          `"${w.phone ?? ""}"`,
          `"${w.employer_name ?? ""}"`,
          `"${w.worksite_name ?? ""}"`,
          `"${w.occupation ?? ""}"`,
          `"${w.organising_role ?? ""}"`,
          `"${w.membership_status ?? ""}"`,
          `"${w.union_membership_type_name ?? ""}"`,
          `"${w.non_oa_union_badge_initials ?? ""}"`,
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaignId}-contacts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workers, selectedWorkers, campaignId]);

  const emailCount = useMemo(
    () => workers.filter((w) => w.email).length,
    [workers]
  );
  const phoneCount = useMemo(
    () => workers.filter((w) => w.phone).length,
    [workers]
  );

  /** Build a filter object matching what list-builder + populate routes accept */
  function buildCurrentFilters(): Record<string, string | string[] | boolean | undefined> {
    return {
      membership: membershipFilter.length > 0 ? membershipFilter.join(",") : undefined,
      roles: roleFilter.length > 0 ? roleFilter.join(",") : undefined,
      employer_id: employerFilter || undefined,
      worksite_id: worksiteFilter || undefined,
      ou_id: ouFilter || undefined,
      ou_type: ouTypeFilter || undefined,
      multi_unit_only: multiUnitOnly || undefined,
      occupation: occupationSearch.trim() || undefined,
      an_tags: includeAnTags.length > 0 ? includeAnTags.join(",") : undefined,
      exclude_an_tags: excludeAnTags.length > 0 ? excludeAnTags.join(",") : undefined,
    };
  }

  const handleCreateVariationLists = useCallback(async () => {
    if (!variationMode || variationMode.segments.length === 0) return;
    const baseName = listBaseName.trim() || `Call list`;
    setCreatingLists(true);
    setCreateListResult(null);
    try {
      const baseFilters = buildCurrentFilters();
      const segments = variationMode.segments.map((seg) => {
        // Merge the segment filter on top of base filters
        const segFilters: Record<string, string | string[] | boolean | undefined> = {
          ...baseFilters,
          [variationMode.dimension === "membership_status" ? "membership" : variationMode.dimension]: seg.key,
        };
        return { key: seg.key, label: seg.label, filters: segFilters };
      });

      const res = await fetchApi(`/api/campaigns/${numericId}/call-lists/bulk-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_name: baseName,
          script_id: scriptId ?? null,
          action_id: actionId ?? null,
          segments,
        }),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Bulk create failed");
      }
      const count = (data.list_ids as number[]).length;
      setCreateListResult({
        type: "success",
        message: `Created ${count} variation call list${count !== 1 ? "s" : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["call-lists", numericId] });
    } catch (err) {
      setCreateListResult({
        type: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setCreatingLists(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variationMode, listBaseName, numericId, scriptId, actionId, membershipFilter, roleFilter, employerFilter, worksiteFilter, ouFilter, ouTypeFilter, multiUnitOnly, occupationSearch, includeAnTags, excludeAnTags, queryClient]);

  const handleCreateSingleList = useCallback(async () => {
    const name = listBaseName.trim() || `Call list`;
    setCreatingLists(true);
    setCreateListResult(null);
    try {
      const baseFilters = buildCurrentFilters();
      // Create list
      const createRes = await fetchApi(`/api/campaigns/${numericId}/call-lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          script_id: scriptId ?? null,
          source_filters: baseFilters,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Create failed");

      // Populate
      const listId = createData.list_id as number;
      const popRes = await fetchApi(
        `/api/campaigns/${numericId}/call-lists/${listId}/populate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: baseFilters }),
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        }
      );
      const popData = await popRes.json();
      if (!popRes.ok) throw new Error(popData.error || "Populate failed");

      setCreateListResult({
        type: "success",
        message: `Created call list "${name}" with ${(popData.added as number) ?? 0} contacts`,
      });
      queryClient.invalidateQueries({ queryKey: ["call-lists", numericId] });
    } catch (err) {
      setCreateListResult({
        type: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setCreatingLists(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listBaseName, numericId, scriptId, membershipFilter, roleFilter, employerFilter, worksiteFilter, ouFilter, ouTypeFilter, multiUnitOnly, occupationSearch, includeAnTags, excludeAnTags, queryClient]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Contact Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tier 1: Organising DB filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Membership Status */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Membership Status</Label>
              <div className="flex flex-wrap gap-3">
                {MEMBERSHIP_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={membershipFilter.includes(opt.value)}
                      onCheckedChange={() => toggleMembership(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* OA Leader Role */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">OA Leader Role</Label>
              <div className="flex flex-wrap gap-3">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={roleFilter.includes(opt.value)}
                      onCheckedChange={() => toggleRole(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Occupation Search */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Occupation</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search occupation..."
                  value={occupationSearch}
                  onChange={(e) => setOccupationSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>

            {/* Employer */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Employer</Label>
              <Select value={employerFilter} onValueChange={setEmployerFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All employers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All employers</SelectItem>
                  {employers.map((e) => (
                    <SelectItem
                      key={e.employer_id}
                      value={String(e.employer_id)}
                    >
                      {e.employer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Worksite */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Worksite</Label>
              <Select value={worksiteFilter} onValueChange={setWorksiteFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All worksites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All worksites</SelectItem>
                  {worksites.map((w) => (
                    <SelectItem
                      key={w.worksite_id}
                      value={String(w.worksite_id)}
                    >
                      {w.worksite_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Campaign unit</Label>
              <Select value={ouFilter} onValueChange={setOuFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All units" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All units</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.ou_id} value={String(u.ou_id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Unit type</Label>
              <Select value={ouTypeFilter} onValueChange={setOuTypeFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All unit types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All types</SelectItem>
                  {[...new Set(units.map((u) => u.ou_type))].map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={multiUnitOnly}
              onCheckedChange={(v) => setMultiUnitOnly(v === true)}
            />
            Show only workers assigned to multiple units
          </label>

          {/* Tier 2: AN Tags (expandable) */}
          <div className="border rounded-md">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
              onClick={() => setShowAnTags(!showAnTags)}
            >
              {showAnTags ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Action Network Tags
              {(includeAnTags.length > 0 || excludeAnTags.length > 0) && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {includeAnTags.length + excludeAnTags.length} selected
                </Badge>
              )}
            </button>
            {showAnTags && (
              <div className="px-3 pb-3 pt-1 border-t space-y-2">
                {anTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No AN tags found. Sync tags from Action Network to use this
                    filter.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {anTags.map((tag) => (
                      <div
                        key={tag.an_tag_id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <label className="flex items-center gap-1 cursor-pointer text-green-700 dark:text-green-400">
                          <Checkbox
                            checked={includeAnTags.includes(tag.an_tag_id)}
                            onCheckedChange={() =>
                              toggleAnTag(tag.an_tag_id, "include")
                            }
                          />
                          <span className="text-xs">+</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer text-red-600 dark:text-red-400">
                          <Checkbox
                            checked={excludeAnTags.includes(tag.an_tag_id)}
                            onCheckedChange={() =>
                              toggleAnTag(tag.an_tag_id, "exclude")
                            }
                          />
                          <span className="text-xs">-</span>
                        </label>
                        <span className="truncate text-xs">
                          {tag.an_tag_name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {canWrite && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={syncingTags}
                      onClick={handleSyncTags}
                    >
                      {syncingTags ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {syncingTags ? "Syncing…" : "Sync Tags from AN"}
                    </Button>
                    {syncResult && (
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          syncResult.type === "success"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {syncResult.type === "success" ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {syncResult.message}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-semibold">
              {workersLoading ? "Loading..." : `${workers.length} contacts`}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {emailCount} email
              </span>
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {phoneCount} phone
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sort selector */}
            <div className="flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              <Select value={sortKey} onValueChange={setSortKey}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="Sort…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Name A→Z</SelectItem>
                  <SelectItem value="name_desc">Name Z→A</SelectItem>
                  <SelectItem value="worksite">Worksite</SelectItem>
                  <SelectItem value="employer">Employer</SelectItem>
                  <SelectItem value="membership">Membership</SelectItem>
                  <SelectItem value="recent_contact">Recent contact</SelectItem>
                  <SelectItem value="priority_score_desc">Priority score</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchWorkers()}
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={workers.length === 0}
              className="text-xs"
            >
              <Download className="h-3 w-3" />
              Export CSV
            </Button>
            {onListPrepared && (
              <Button
                size="sm"
                onClick={async () => {
                  setPushingList(true);
                  setPushResult(null);
                  try {
                    const res = await fetchApi(`/api/campaigns/${numericId}/push-list`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        filters: {
                          membership: membershipFilter.length > 0 ? membershipFilter : undefined,
                          roles: roleFilter.length > 0 ? roleFilter : undefined,
                          employer_id: employerFilter || undefined,
                          worksite_id: worksiteFilter || undefined,
                          ou_id: ouFilter || undefined,
                          ou_type: ouTypeFilter || undefined,
                          multi_unit_only: multiUnitOnly || undefined,
                          occupation: occupationSearch || undefined,
                          an_tags: includeAnTags.length > 0 ? includeAnTags : undefined,
                          exclude_an_tags: excludeAnTags.length > 0 ? excludeAnTags : undefined,
                        },
                      }),
                      timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) {
                      throw new Error(data.error || "Push failed");
                    }
                    setPushResult({
                      type: "success",
                      message: `Tag "${data.tag_name}" created: ${data.contacts_tagged} tagged, ${data.contacts_created} new contacts${data.contacts_skipped > 0 ? `, ${data.contacts_skipped} skipped (no email)` : ""}`,
                    });
                    onListPrepared({
                      tag_id: data.tag_id,
                      tag_href: data.tag_href,
                      tag_name: data.tag_name,
                      contacts_tagged: data.contacts_tagged,
                      contacts_created: data.contacts_created,
                    });
                  } catch (err) {
                    setPushResult({
                      type: "error",
                      message: err instanceof Error ? err.message : "Unknown error",
                    });
                  } finally {
                    setPushingList(false);
                  }
                }}
                disabled={workers.length === 0 || pushingList}
                className="text-xs"
              >
                {pushingList ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                {pushingList ? "Pushing to AN…" : "Prepare for Send"}
              </Button>
            )}
          </div>
          {pushResult && (
            <div className={`mt-2 flex items-start gap-2 text-xs p-2 rounded ${
              pushResult.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {pushResult.type === "success" ? (
                <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              )}
              <span>{pushResult.message}</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Call list creation row */}
          {canWrite && (
            <div className="mb-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder={
                    variationMode
                      ? `Base list name (e.g. "May call round")`
                      : `List name (e.g. "May call round")`
                  }
                  value={listBaseName}
                  onChange={(e) => setListBaseName(e.target.value)}
                  className="h-8 text-xs max-w-xs"
                />
                {variationMode ? (
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => void handleCreateVariationLists()}
                    disabled={workers.length === 0 || creatingLists}
                  >
                    {creatingLists ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ListPlus className="h-3 w-3" />
                    )}
                    {creatingLists
                      ? "Creating…"
                      : `Create ${variationMode.segments.length} variation list${variationMode.segments.length !== 1 ? "s" : ""}`}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => void handleCreateSingleList()}
                    disabled={workers.length === 0 || creatingLists}
                  >
                    {creatingLists ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ListPlus className="h-3 w-3" />
                    )}
                    {creatingLists ? "Creating…" : "Save as call list"}
                  </Button>
                )}
              </div>
              {createListResult && (
                <div
                  className={`flex items-start gap-2 text-xs p-2 rounded ${
                    createListResult.type === "success"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {createListResult.type === "success" ? (
                    <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  )}
                  <span>{createListResult.message}</span>
                </div>
              )}
            </div>
          )}
          {workers.length === 0 && !workersLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No contacts match the current filters.
            </p>
          ) : (
            <div className="rounded-md border max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="flex items-center"
                      >
                        {allSelected ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Employer</TableHead>
                    <TableHead>Worksite</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead className="w-16">Channels</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) => (
                    <TableRow key={w.worker_id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedWorkers.has(w.worker_id)}
                          onCheckedChange={() => toggleWorker(w.worker_id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {w.first_name} {w.last_name}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">
                        {w.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{w.phone ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {w.employer_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {w.worksite_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {w.organising_role ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {w.organising_role}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{w.unit_count ?? 0}</span>
                          {w.is_multi_unit_member ? (
                            <Badge variant="warning" className="text-[10px]">
                              multi
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {w.email && (
                            <Mail className="h-3.5 w-3.5 text-blue-500" />
                          )}
                          {w.phone && (
                            <Phone className="h-3.5 w-3.5 text-green-500" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
