"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import { collapseActivityRatingsToWorkerMap } from "@/lib/utils/collapse-activity-ratings";
import { useCampaignWorkerDetail } from "../campaign-worker-detail-provider";
import { WorkforceBulkToolbar } from "./workforce-bulk-toolbar";
import { AssessmentSelector } from "../wall-chart/assessment-selector";
import {
  CAMPAIGN_MEMBERS_FULL_SELECT,
  normalizeCampaignMemberRows,
  type RawCampaignMemberRow,
} from "../wall-chart/normalize-members";
import { ratingBgClass, ratingBorderTextClass } from "../wall-chart/rating-colour";
import {
  ouDisplayName,
  type ActivityRating,
  type AssessmentSelection,
  type WallChartOU,
  type WallChartOUAssignment,
  type WallChartRatingSummary,
  type WallChartWorker,
} from "../wall-chart/types";
import { CumulativeRatingDot, WorkerBadgeRow } from "../wall-chart/worker-badges";

type Row = {
  id: string;
  membership_id: number;
  worker_id: number;
  worker: WallChartWorker;
  rating: WallChartRatingSummary | null;
  primary_ou_id: number | null;
  group_name: string;
  unit_name: string;
  occupation_name: string;
  worksite_name: string;
  employer_name: string;
  union_role_name: string;
  membership_name: string;
  cumulative: number | null;
  last_activity: number | null;
  selected_rating: number | null;
  full_name: string;
  email: string;
  phone: string;
  unit_ids: number[];
  other_unit_names: string[];
} & Record<string, unknown>;

type FilterState = {
  ratings: Set<RatingBucket>;
  roles: Set<RoleKey>;
  membershipTypeIds: Set<number>;
  includeNonMember: boolean;
  occupationIds: Set<number>;
  ouGroupIds: Set<number>;
  ouIds: Set<number>;
  employerIds: Set<number>;
  worksiteIds: Set<number>;
};

type RatingBucket = "unrated" | "1" | "2" | "3" | "4" | "5";
type RoleKey = "delegate" | "activist" | "contact" | "hsr" | "bargaining_rep" | "none";

const DEFAULT_FILTER: FilterState = {
  ratings: new Set(),
  roles: new Set(),
  membershipTypeIds: new Set(),
  includeNonMember: false,
  occupationIds: new Set(),
  ouGroupIds: new Set(),
  ouIds: new Set(),
  employerIds: new Set(),
  worksiteIds: new Set(),
};

function ratingBucket(rating: number | null | undefined): RatingBucket {
  if (rating == null) return "unrated";
  if (rating < 2) return "1";
  if (rating < 3) return "2";
  if (rating < 4) return "3";
  if (rating < 5) return "4";
  return "5";
}

function hasActiveFilter(s: FilterState): boolean {
  return (
    s.ratings.size > 0 ||
    s.roles.size > 0 ||
    s.membershipTypeIds.size > 0 ||
    s.includeNonMember ||
    s.occupationIds.size > 0 ||
    s.ouGroupIds.size > 0 ||
    s.ouIds.size > 0 ||
    s.employerIds.size > 0 ||
    s.worksiteIds.size > 0
  );
}

function workerRoleKeys(worker: WallChartWorker): RoleKey[] {
  const keys: RoleKey[] = [];
  const rn = worker.member_role_type?.role_name?.toLowerCase();
  if (rn === "delegate") keys.push("delegate");
  if (rn === "activist") keys.push("activist");
  if (rn === "contact") keys.push("contact");
  if (worker.is_hsr) keys.push("hsr");
  if (worker.is_bargaining_rep) keys.push("bargaining_rep");
  if (keys.length === 0) keys.push("none");
  return keys;
}

const ROLE_OPTIONS: { key: RoleKey; label: string }[] = [
  { key: "delegate", label: "Delegate" },
  { key: "activist", label: "Activist" },
  { key: "contact", label: "Contact" },
  { key: "hsr", label: "HSR" },
  { key: "bargaining_rep", label: "Bargaining rep" },
  { key: "none", label: "No role" },
];

const RATING_OPTIONS: { key: RatingBucket; label: string }[] = [
  { key: "unrated", label: "Unrated" },
  { key: "1", label: "1 (<2)" },
  { key: "2", label: "2 (2–<3)" },
  { key: "3", label: "3 (3–<4)" },
  { key: "4", label: "4 (4–<5)" },
  { key: "5", label: "5" },
];

export function WorkforceListView({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const workerDetail = useCampaignWorkerDetail();
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [assessment, setAssessment] = useState<AssessmentSelection>({ kind: "cumulative" });
  const [groupedView, setGroupedView] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members-full", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(CAMPAIGN_MEMBERS_FULL_SELECT)
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as unknown as RawCampaignMemberRow[];
    },
  });

  const memberRows = useMemo(() => normalizeCampaignMemberRows(members), [members]);

  const { data: ratingSummary = [] } = useQuery({
    queryKey: ["campaign-rating-summary", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_rating_summary")
        .select("*")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as WallChartRatingSummary[];
    },
  });

  const { data: ous = [] } = useQuery({
    queryKey: ["campaign-ous", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WallChartOU[];
    },
  });

  const ouIdsKey = ous.map((o) => o.ou_id).join(",");
  const { data: ouAssign = [] } = useQuery({
    queryKey: ["campaign-worker-ou", campaignId, ouIdsKey],
    queryFn: async () => {
      const ids = ous.map((o) => o.ou_id);
      if (ids.length === 0) return [] as WallChartOUAssignment[];
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id, is_primary")
        .in("ou_id", ids);
      if (error) throw error;
      return (data ?? []) as WallChartOUAssignment[];
    },
    enabled: ous.length > 0,
  });

  const activityIds =
    assessment.kind === "assessment" ? [assessment.activityId] : ([] as number[]);
  const activityIdsKey = activityIds.join(",");
  const { data: activityRatingByActivity = new Map<number, Map<number, ActivityRating>>() } =
    useQuery({
      queryKey: ["campaign-activity-ratings", campaignId, activityIdsKey],
      enabled: activityIds.length > 0,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("campaign_activity_ratings")
          .select(
            "rating_id, worker_id, activity_id, rating, binary_value, rating_phase, rated_at, source, notes"
          )
          .in("activity_id", activityIds);
        if (error) throw error;
        const byActivity = new Map<number, ActivityRating[]>();
        for (const r of (data ?? []) as ActivityRating[]) {
          const arr = byActivity.get(r.activity_id) ?? [];
          arr.push(r);
          byActivity.set(r.activity_id, arr);
        }
        const out = new Map<number, Map<number, ActivityRating>>();
        for (const id of activityIds) {
          out.set(id, collapseActivityRatingsToWorkerMap(byActivity.get(id) ?? []));
        }
        return out;
      },
    });

  // -- Indexes ---------------------------------------------------------------
  const ratingByWorker = useMemo(() => {
    const m = new Map<number, WallChartRatingSummary>();
    for (const r of ratingSummary) m.set(r.worker_id, r);
    return m;
  }, [ratingSummary]);

  const ouById = useMemo(() => {
    const m = new Map<number, WallChartOU>();
    for (const o of ous) m.set(o.ou_id, o);
    return m;
  }, [ous]);

  // Primary OU per worker (falls back to first assignment when no primary flag).
  const primaryOuByWorker = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of ouAssign) {
      if (m.has(a.worker_id)) continue;
      m.set(a.worker_id, a.ou_id);
    }
    // Second pass: prefer is_primary when present.
    for (const a of ouAssign) {
      if (a.is_primary) m.set(a.worker_id, a.ou_id);
    }
    return m;
  }, [ouAssign]);

  const allOuIdsByWorker = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const a of ouAssign) {
      const arr = m.get(a.worker_id) ?? [];
      arr.push(a.ou_id);
      m.set(a.worker_id, arr);
    }
    return m;
  }, [ouAssign]);

  const groupNameByOuId = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of ous) {
      if (o.ou_group_id == null) continue;
      const group = ouById.get(o.ou_group_id);
      if (group) m.set(o.ou_id, ouDisplayName(group));
    }
    return m;
  }, [ous, ouById]);

  // -- Rows ------------------------------------------------------------------
  const rows = useMemo<Row[]>(() => {
    const activityRatings =
      assessment.kind === "assessment"
        ? activityRatingByActivity.get(assessment.activityId) ?? null
        : null;
    return memberRows
      .map((r): Row | null => {
        if (!r.worker) return null;
        const w = r.worker;
        const rating = ratingByWorker.get(r.worker_id) ?? null;
        const primaryOuId = primaryOuByWorker.get(r.worker_id) ?? null;
        const primaryOu = primaryOuId != null ? ouById.get(primaryOuId) ?? null : null;
        const otherUnitIds = (allOuIdsByWorker.get(r.worker_id) ?? []).filter(
          (id) => id !== primaryOuId
        );
        const otherUnitNames = otherUnitIds
          .map((id) => ouById.get(id))
          .filter(Boolean)
          .map((o) => ouDisplayName(o as WallChartOU));
        const selectedRating =
          assessment.kind === "assessment"
            ? activityRatings?.get(r.worker_id)?.rating ?? null
            : null;
        return {
          id: String(r.membership_id),
          membership_id: r.membership_id,
          worker_id: r.worker_id,
          worker: w,
          rating,
          primary_ou_id: primaryOuId,
          group_name: primaryOuId != null ? groupNameByOuId.get(primaryOuId) ?? "—" : "—",
          unit_name: primaryOu ? ouDisplayName(primaryOu) : "—",
          occupation_name: w.canonical_occupation?.canonical_name ?? "—",
          worksite_name: w.worksite?.worksite_name ?? "—",
          employer_name: w.employer?.employer_name ?? "—",
          union_role_name:
            w.member_role_type?.display_name ?? w.member_role_type?.role_name ?? "—",
          membership_name:
            w.union_membership_type?.display_name ??
            w.union_membership_type?.type_name ??
            "—",
          cumulative: rating?.cumulative_rating ?? null,
          last_activity: rating?.last_activity_rating ?? null,
          selected_rating: selectedRating,
          full_name: `${w.first_name} ${w.last_name}`,
          email: w.email ?? "",
          phone: w.phone ?? "",
          unit_ids: allOuIdsByWorker.get(r.worker_id) ?? [],
          other_unit_names: otherUnitNames,
        };
      })
      .filter((r): r is Row => r !== null);
  }, [
    memberRows,
    ratingByWorker,
    primaryOuByWorker,
    allOuIdsByWorker,
    ouById,
    groupNameByOuId,
    assessment,
    activityRatingByActivity,
  ]);

  // -- Filter options derived from current rows ------------------------------
  const filterOptions = useMemo(() => {
    const employerSeen = new Map<number, string>();
    const worksiteSeen = new Map<number, string>();
    const occupationSeen = new Map<number, string>();
    const membershipSeen = new Map<number, string>();
    const ouSeen = new Map<number, string>();
    const groupSeen = new Map<number, string>();
    for (const r of rows) {
      if (r.worker.employer_id != null) {
        employerSeen.set(r.worker.employer_id, r.worker.employer?.employer_name ?? `#${r.worker.employer_id}`);
      }
      if (r.worker.worksite_id != null) {
        worksiteSeen.set(r.worker.worksite_id, r.worker.worksite?.worksite_name ?? `#${r.worker.worksite_id}`);
      }
      if (r.worker.canonical_occupation_id != null) {
        occupationSeen.set(
          r.worker.canonical_occupation_id,
          r.worker.canonical_occupation?.canonical_name ?? `#${r.worker.canonical_occupation_id}`
        );
      }
      if (r.worker.union_membership_type_id != null) {
        membershipSeen.set(
          r.worker.union_membership_type_id,
          r.worker.union_membership_type?.display_name ?? r.worker.union_membership_type?.type_name ?? `#${r.worker.union_membership_type_id}`
        );
      }
    }
    for (const o of ous) {
      if (o.is_group_container) {
        groupSeen.set(o.ou_id, ouDisplayName(o));
      } else {
        ouSeen.set(o.ou_id, ouDisplayName(o));
      }
    }
    const toSorted = (m: Map<number, string>) =>
      [...m.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    return {
      employers: toSorted(employerSeen),
      worksites: toSorted(worksiteSeen),
      occupations: toSorted(occupationSeen),
      memberships: toSorted(membershipSeen),
      ous: toSorted(ouSeen),
      groups: toSorted(groupSeen),
    };
  }, [rows, ous]);

  // -- Filtering -------------------------------------------------------------
  const filteredRows = useMemo(() => {
    if (!hasActiveFilter(filter)) return rows;
    return rows.filter((r) => {
      if (filter.ratings.size > 0) {
        const bucket = ratingBucket(
          assessment.kind === "assessment" ? r.selected_rating : r.cumulative
        );
        if (!filter.ratings.has(bucket)) return false;
      }
      if (filter.roles.size > 0) {
        const keys = workerRoleKeys(r.worker);
        if (!keys.some((k) => filter.roles.has(k))) return false;
      }
      if (filter.membershipTypeIds.size > 0 || filter.includeNonMember) {
        const mId = r.worker.union_membership_type_id;
        const matchesType = mId != null && filter.membershipTypeIds.has(mId);
        const isNonMember = mId == null;
        if (!matchesType && !(filter.includeNonMember && isNonMember)) return false;
      }
      if (filter.occupationIds.size > 0) {
        const oId = r.worker.canonical_occupation_id;
        if (oId == null || !filter.occupationIds.has(oId)) return false;
      }
      if (filter.employerIds.size > 0) {
        const eId = r.worker.employer_id;
        if (eId == null || !filter.employerIds.has(eId)) return false;
      }
      if (filter.worksiteIds.size > 0) {
        const wId = r.worker.worksite_id;
        if (wId == null || !filter.worksiteIds.has(wId)) return false;
      }
      if (filter.ouIds.size > 0) {
        if (!r.unit_ids.some((id) => filter.ouIds.has(id))) return false;
      }
      if (filter.ouGroupIds.size > 0) {
        // Match worker if any of their units belongs to a selected group, or
        // their primary unit IS a selected group.
        const inGroup = r.unit_ids.some((uid) => {
          const unit = ouById.get(uid);
          return unit?.ou_group_id != null && filter.ouGroupIds.has(unit.ou_group_id);
        });
        if (!inGroup) return false;
      }
      return true;
    });
  }, [rows, filter, assessment, ouById]);

  // Map membership-id-keyed selection back to worker IDs for bulk actions.
  const selectedWorkerIds = useMemo(() => {
    const ids: number[] = [];
    for (const r of rows) {
      if (selection.has(r.id)) ids.push(r.worker_id);
    }
    return ids;
  }, [rows, selection]);

  // -- Selection -------------------------------------------------------------
  const toggleRow = useCallback((id: string, selected: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const toggleAllVisible = useCallback(
    (visible: string[], selected: boolean) => {
      setSelection((prev) => {
        const next = new Set(prev);
        for (const id of visible) {
          if (selected) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    []
  );

  // -- Columns ---------------------------------------------------------------
  const columns: Column<Row>[] = useMemo(
    () => [
      {
        key: "full_name",
        header: "Worker",
        sortable: true,
        render: (r) => (
          <div className="flex flex-col gap-1 min-w-0">
            <button
              type="button"
              className="text-left font-medium hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                workerDetail?.openWorkerDetail(r.worker_id);
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <CumulativeRatingDot value={r.cumulative} />
                <span className="truncate">{r.full_name}</span>
              </div>
            </button>
            <WorkerBadgeRow
              worker={r.worker}
              canWrite={canWrite}
              showBargainingRepBadge
              onContactBadgeClick={(workerId, field) =>
                workerDetail?.openWorkerDetail(workerId, { focusField: field })
              }
            />
          </div>
        ),
      },
      {
        key: "group_name",
        header: "Group",
        sortable: true,
      },
      {
        key: "unit_name",
        header: "Unit",
        sortable: true,
        render: (r) => (
          <div className="flex flex-col">
            <span>{r.unit_name}</span>
            {r.other_unit_names.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                +{r.other_unit_names.length} more
              </span>
            )}
          </div>
        ),
      },
      { key: "occupation_name", header: "Occupation", sortable: true },
      { key: "worksite_name", header: "Worksite", sortable: true },
      { key: "employer_name", header: "Employer", sortable: true },
      { key: "union_role_name", header: "Role", sortable: true },
      { key: "membership_name", header: "Membership", sortable: true },
      {
        key: "cumulative",
        header: "Cumulative",
        sortable: true,
        render: (r) => <RatingPill value={r.cumulative} />,
      },
      {
        key: "last_activity",
        header: "Last activity",
        sortable: true,
        render: (r) => <RatingPill value={r.last_activity} />,
      },
      {
        key: "selected_rating",
        header:
          assessment.kind === "assessment"
            ? `Selected: ${assessment.title}`
            : "Selected assessment",
        sortable: true,
        render: (r) =>
          assessment.kind === "assessment" ? (
            <RatingPill value={r.selected_rating} />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
    ],
    [workerDetail, canWrite, assessment]
  );

  const filterActive = hasActiveFilter(filter);
  const filterCount =
    filter.ratings.size +
    filter.roles.size +
    filter.membershipTypeIds.size +
    (filter.includeNonMember ? 1 : 0) +
    filter.occupationIds.size +
    filter.ouGroupIds.size +
    filter.ouIds.size +
    filter.employerIds.size +
    filter.worksiteIds.size;

  // For grouped view: bucket filtered rows by their employer group (ou_group_id
  // of their primary unit, or "—" for ungrouped/unassigned).
  const groupedRows = useMemo(() => {
    if (!groupedView) return null;
    const buckets = new Map<string, { label: string; ouId: number | null; rows: Row[] }>();
    const unassignedKey = "__unassigned__";
    for (const r of filteredRows) {
      const primaryOu = r.primary_ou_id != null ? ouById.get(r.primary_ou_id) ?? null : null;
      const containerOuId =
        primaryOu != null
          ? ((primaryOu as WallChartOU & { ou_group_id?: number | null }).ou_group_id ??
             // if primary OU is itself a container, use it directly
             (primaryOu.is_group_container ? primaryOu.ou_id : null))
          : null;
      const key = containerOuId != null ? String(containerOuId) : unassignedKey;
      if (!buckets.has(key)) {
        const containerOu = containerOuId != null ? ouById.get(containerOuId) ?? null : null;
        buckets.set(key, {
          label: containerOu ? ouDisplayName(containerOu) : "Unassigned / No group",
          ouId: containerOuId,
          rows: [],
        });
      }
      buckets.get(key)!.rows.push(r);
    }
    // Sort buckets: named groups first (by display_order then name), unassigned last.
    const named = [...buckets.entries()]
      .filter(([k]) => k !== unassignedKey)
      .sort(([, a], [, b]) => {
        const ouA = a.ouId != null ? ouById.get(a.ouId) : null;
        const ouB = b.ouId != null ? ouById.get(b.ouId) : null;
        const ordA = (ouA as WallChartOU & { display_order?: number | null } | null)?.display_order ?? 999;
        const ordB = (ouB as WallChartOU & { display_order?: number | null } | null)?.display_order ?? 999;
        if (ordA !== ordB) return ordA - ordB;
        return a.label.localeCompare(b.label);
      });
    const unassigned = buckets.get(unassignedKey);
    return unassigned ? [...named, [unassignedKey, unassigned] as const] : named;
  }, [groupedView, filteredRows, ouById]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <AssessmentSelector
            campaignId={campaignId}
            value={assessment}
            onChange={setAssessment}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={filterActive ? "secondary" : "outline"}
                size="sm"
                className="h-8 text-xs"
              >
                Filter{filterActive ? ` (${filterCount})` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-96 max-h-[70vh] overflow-y-auto">
              <FilterPanel
                filter={filter}
                onChange={setFilter}
                options={filterOptions}
              />
            </PopoverContent>
          </Popover>
          {filterOptions.groups.length > 0 && (
            <Button
              type="button"
              variant={groupedView ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => { setGroupedView((v) => !v); setCollapsedGroups(new Set()); }}
              title={groupedView ? "Switch to flat list" : "Group rows by employer"}
            >
              <Layers className="h-3.5 w-3.5" />
              {groupedView ? "Flat list" : "Group by employer"}
            </Button>
          )}
        </div>
        <WorkforceBulkToolbar
          campaignId={campaignId}
          selectedWorkerIds={selectedWorkerIds}
          ous={ous}
          defaultAssessment={assessment}
          onClearSelection={() => setSelection(new Set())}
          onActionComplete={() => setSelection(new Set())}
        />
        {groupedView && groupedRows ? (
          <div className="space-y-2">
            {groupedRows.map(([key, bucket]) => {
              const isCollapsed = collapsedGroups.has(key);
              const allSelected = bucket.rows.length > 0 && bucket.rows.every((r) => selection.has(r.id));
              return (
                <div key={key} className="border rounded-md overflow-hidden">
                  {/* Group header */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 text-left"
                    onClick={() => toggleGroup(key)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-semibold text-sm flex-1 truncate">{bucket.label}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {bucket.rows.length} worker{bucket.rows.length !== 1 ? "s" : ""}
                    </span>
                    {/* Roll-up rating dots */}
                    <span className="flex items-center gap-1 shrink-0">
                      {(() => {
                        const vals = bucket.rows.map((r) => r.cumulative).filter((v): v is number => v != null);
                        if (vals.length === 0) return null;
                        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                        return <CumulativeRatingDot value={avg} />;
                      })()}
                    </span>
                  </button>
                  {/* Group rows */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/20">
                            <th className="w-8 px-2 py-1.5">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={(v) =>
                                  toggleAllVisible(bucket.rows.map((r) => r.id), !!v)
                                }
                              />
                            </th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">Worker</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">Unit</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">Occupation</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">Role</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">Membership</th>
                            <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground">Rating</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bucket.rows.map((r) => (
                            <tr
                              key={r.id}
                              className={cn(
                                "border-b last:border-0 hover:bg-muted/30 cursor-pointer",
                                selection.has(r.id) && "bg-primary/5"
                              )}
                              onClick={() => toggleRow(r.id, !selection.has(r.id))}
                            >
                              <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selection.has(r.id)}
                                  onCheckedChange={(v) => toggleRow(r.id, !!v)}
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <button
                                    type="button"
                                    className="text-left font-medium hover:underline flex items-center gap-1.5 min-w-0"
                                    onClick={(e) => { e.stopPropagation(); workerDetail?.openWorkerDetail(r.worker_id); }}
                                  >
                                    <CumulativeRatingDot value={r.cumulative} />
                                    <span className="truncate">{r.full_name}</span>
                                  </button>
                                  <WorkerBadgeRow
                                    worker={r.worker}
                                    canWrite={canWrite}
                                    showBargainingRepBadge
                                    onContactBadgeClick={(wid, field) =>
                                      workerDetail?.openWorkerDetail(wid, { focusField: field })
                                    }
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-xs">{r.unit_name}</td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.occupation_name}</td>
                              <td className="px-3 py-1.5 text-xs">{r.union_role_name}</td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.membership_name}</td>
                              <td className="px-3 py-1.5 text-right">
                                <RatingPill value={r.cumulative} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
        <DataTable<Row>
          data={filteredRows}
          columns={columns}
          searchPlaceholder="Search workers, employers, worksites…"
          searchKeys={[
            "full_name",
            "email",
            "phone",
            "employer_name",
            "worksite_name",
            "occupation_name",
            "unit_name",
          ]}
          selection={{
            rowId: (r) => r.id,
            selectedIds: selection,
            onToggleRow: toggleRow,
            onToggleAllVisible: toggleAllVisible,
          }}
        />
        )}
      </CardContent>
    </Card>
  );
}

function RatingPill({ value }: { value: number | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-7 h-6 rounded border bg-white text-xs font-bold",
        ratingBorderTextClass(value),
        value != null ? ratingBgClass(value) : null
      )}
    >
      {value ?? "—"}
    </span>
  );
}

type FilterOptions = {
  employers: { id: number; label: string }[];
  worksites: { id: number; label: string }[];
  occupations: { id: number; label: string }[];
  memberships: { id: number; label: string }[];
  ous: { id: number; label: string }[];
  groups: { id: number; label: string }[];
};

function FilterPanel({
  filter,
  onChange,
  options,
}: {
  filter: FilterState;
  onChange: (next: FilterState) => void;
  options: FilterOptions;
}) {
  const toggleNum = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  return (
    <div className="space-y-4">
      <Section label="Role">
        <div className="grid grid-cols-2 gap-1.5">
          {ROLE_OPTIONS.map((r) => (
            <CheckboxRow
              key={r.key}
              label={r.label}
              checked={filter.roles.has(r.key)}
              onChange={() => onChange({ ...filter, roles: toggle(filter.roles, r.key) })}
            />
          ))}
        </div>
      </Section>
      <Section label="Rating bucket">
        <div className="grid grid-cols-2 gap-1.5">
          {RATING_OPTIONS.map((r) => (
            <CheckboxRow
              key={r.key}
              label={r.label}
              checked={filter.ratings.has(r.key)}
              onChange={() =>
                onChange({ ...filter, ratings: toggle(filter.ratings, r.key) })
              }
            />
          ))}
        </div>
      </Section>
      <Section label="Membership">
        <div className="space-y-1">
          <CheckboxRow
            label="Non-member"
            checked={filter.includeNonMember}
            onChange={() =>
              onChange({ ...filter, includeNonMember: !filter.includeNonMember })
            }
          />
          {options.memberships.map((m) => (
            <CheckboxRow
              key={m.id}
              label={m.label}
              checked={filter.membershipTypeIds.has(m.id)}
              onChange={() =>
                onChange({
                  ...filter,
                  membershipTypeIds: toggleNum(filter.membershipTypeIds, m.id),
                })
              }
            />
          ))}
        </div>
      </Section>
      {options.occupations.length > 0 && (
        <Section label="Occupation">
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {options.occupations.map((o) => (
              <CheckboxRow
                key={o.id}
                label={o.label}
                checked={filter.occupationIds.has(o.id)}
                onChange={() =>
                  onChange({
                    ...filter,
                    occupationIds: toggleNum(filter.occupationIds, o.id),
                  })
                }
              />
            ))}
          </div>
        </Section>
      )}
      {options.groups.length > 0 && (
        <Section label="Organising group">
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {options.groups.map((g) => (
              <CheckboxRow
                key={g.id}
                label={g.label}
                checked={filter.ouGroupIds.has(g.id)}
                onChange={() =>
                  onChange({
                    ...filter,
                    ouGroupIds: toggleNum(filter.ouGroupIds, g.id),
                  })
                }
              />
            ))}
          </div>
        </Section>
      )}
      {options.ous.length > 0 && (
        <Section label="Organising unit">
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {options.ous.map((u) => (
              <CheckboxRow
                key={u.id}
                label={u.label}
                checked={filter.ouIds.has(u.id)}
                onChange={() =>
                  onChange({ ...filter, ouIds: toggleNum(filter.ouIds, u.id) })
                }
              />
            ))}
          </div>
        </Section>
      )}
      {options.employers.length > 0 && (
        <Section label="Employer">
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {options.employers.map((e) => (
              <CheckboxRow
                key={e.id}
                label={e.label}
                checked={filter.employerIds.has(e.id)}
                onChange={() =>
                  onChange({
                    ...filter,
                    employerIds: toggleNum(filter.employerIds, e.id),
                  })
                }
              />
            ))}
          </div>
        </Section>
      )}
      {options.worksites.length > 0 && (
        <Section label="Worksite">
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {options.worksites.map((w) => (
              <CheckboxRow
                key={w.id}
                label={w.label}
                checked={filter.worksiteIds.has(w.id)}
                onChange={() =>
                  onChange({
                    ...filter,
                    worksiteIds: toggleNum(filter.worksiteIds, w.id),
                  })
                }
              />
            ))}
          </div>
        </Section>
      )}
      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(DEFAULT_FILTER)}
          disabled={!hasActiveFilter(filter)}
          className="h-7 px-2 text-xs"
        >
          Clear all
        </Button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <Label className="flex items-center gap-2 text-xs cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className="flex-1 truncate">{label}</span>
    </Label>
  );
}
