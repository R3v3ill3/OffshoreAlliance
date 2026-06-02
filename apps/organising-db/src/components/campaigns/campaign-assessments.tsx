"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import { formatWorkerLabel } from "@/lib/workers/format-worker-label";
import type { CampaignActivity } from "@/types/database";
import { CampaignWorkerNameButton } from "./campaign-worker-detail-provider";
import { CreateAssessmentDialog } from "./assessments/create-assessment-dialog";
import { ActivityAmbitionLinksPanel } from "./assessments/activity-ambition-links-panel";
import { invalidateCampaignAmbitionCaches } from "@/lib/hooks/useCampaignAmbitionContext";
import {
  removeDeletedActivityFromWallChartCache,
  refreshWallChartAssessmentOptions,
} from "./wall-chart/assessment-selector";
import { CampaignTaskListsSection } from "./campaign-task-lists";
import { AssessmentsTabCharts } from "./AssessmentsTabCharts";

type PrimitiveValue = string | number | boolean | null;

interface AssessmentFilter {
  id: string;
  field: string;
  value: string;
}

interface AssessmentWorkerRow {
  worker_id: number;
  workerName: string;
  rawWorker: Record<string, unknown>;
  fieldValues: Record<string, PrimitiveValue>;
}

const EMPTY_VALUE = "__empty__";
const UNSET_VALUE = "__unset__";
const DEFAULT_SORT_FIELD = "worker_name";

/** Always offered for sort/filter even when every row is null (e.g. filter “Empty”). */
const CORE_ASSESSMENT_FIELDS = [
  "membership_type_name",
  "member_role_type_name",
  "employer_name",
  "worksite_name",
] as const;

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  membership_type_name: "Union membership",
  member_role_type_name: "Organising role",
  employer_name: "Employer",
  worksite_name: "Worksite",
  organising_role: "Organising role",
  worker_name: "Worker",
};

function isPrimitiveValue(value: unknown): value is PrimitiveValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function normalizeFilterValue(value: PrimitiveValue): string {
  return value === null ? EMPTY_VALUE : String(value);
}

function labelForField(field: string): string {
  const override = FIELD_LABEL_OVERRIDES[field];
  if (override) return override;
  return field
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function labelForValue(value: PrimitiveValue): string {
  if (value === null) return "(Empty)";
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

export function CampaignAssessmentsSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [activityPendingDelete, setActivityPendingDelete] = useState<CampaignActivity | null>(null);

  const [tableSearch, setTableSearch] = useState("");
  const [sortField, setSortField] = useState(DEFAULT_SORT_FIELD);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeFilters, setActiveFilters] = useState<AssessmentFilter[]>([]);
  const [filterCombineMode, setFilterCombineMode] = useState<"all" | "any">("all");
  const [filterFieldDraft, setFilterFieldDraft] = useState(DEFAULT_SORT_FIELD);
  const [filterValueDraft, setFilterValueDraft] = useState<string>(UNSET_VALUE);

  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<number>>(new Set());
  const [bulkRating, setBulkRating] = useState<string>(UNSET_VALUE);
  const [bulkBinaryValue, setBulkBinaryValue] = useState<string>(UNSET_VALUE);

  const [seedSearch, setSeedSearch] = useState("");
  const [seedWorkerId, setSeedWorkerId] = useState<string>(UNSET_VALUE);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedAttributeKeys, setSeedAttributeKeys] = useState<Set<string>>(new Set());

  const { data: activities = [] } = useQuery({
    queryKey: ["campaign-activities", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignActivity[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `membership_id, worker_id,
           worker:workers(
             *,
             employer:employers!workers_employer_id_fkey(employer_name),
             worksite:worksites!workers_worksite_id_fkey(worksite_name),
             union_membership_type:union_membership_types!workers_union_membership_type_id_fkey(display_name),
             member_role_type:member_role_types!workers_member_role_type_id_fkey(display_name, role_name),
             canonical_occupation:occupations!workers_canonical_occupation_id_fkey(occupation_id, canonical_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ratingSummary = [] } = useQuery({
    queryKey: ["campaign-rating-summary", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_rating_summary")
        .select("*")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const assessmentActivities = useMemo(
    () => activities.filter((a) => a.activity_kind === "assessment"),
    [activities]
  );

  const activityForRates =
    selectedActivityId ?? assessmentActivities[0]?.activity_id ?? null;

  const { data: ratingsForActivity = [] } = useQuery({
    queryKey: ["campaign-activity-ratings", activityForRates],
    queryFn: async () => {
      if (!activityForRates) return [];
      const { data, error } = await supabase
        .from("campaign_activity_ratings")
        .select("*")
        .eq("activity_id", activityForRates);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activityForRates,
  });

  const pendingDeleteId = activityPendingDelete?.activity_id ?? null;

  const {
    data: deleteImpact,
    isFetching: deleteImpactLoading,
    isError: deleteImpactError,
  } = useQuery({
    queryKey: ["activity-delete-impact", pendingDeleteId],
    queryFn: async () => {
      const [ratingsRes, listsRes] = await Promise.all([
        supabase
          .from("campaign_activity_ratings")
          .select("rating_id", { count: "exact", head: true })
          .eq("activity_id", pendingDeleteId!),
        supabase
          .from("campaign_task_lists")
          .select("task_list_id", { count: "exact", head: true })
          .eq("activity_id", pendingDeleteId!),
      ]);
      if (ratingsRes.error) throw ratingsRes.error;
      if (listsRes.error) throw listsRes.error;
      return {
        ratingCount: ratingsRes.count ?? 0,
        taskListCount: listsRes.count ?? 0,
      };
    },
    enabled: pendingDeleteId != null,
  });

  const deleteActivity = useAuthAwareMutation({
    mutationFn: async (activityId: number) => {
      const { error } = await supabase
        .from("campaign_activities")
        .delete()
        .eq("activity_id", activityId)
        .eq("campaign_id", Number(campaignId));
      if (error) throw error;
    },
    onSuccess: (_data, activityId) => {
      removeDeletedActivityFromWallChartCache(queryClient, campaignId, activityId);
      refreshWallChartAssessmentOptions(queryClient, campaignId);
      queryClient.invalidateQueries({ queryKey: ["campaign-activities", campaignId] });
      queryClient.invalidateQueries({
        queryKey: ["campaign-assessment-options", campaignId],
      });
      queryClient.invalidateQueries({ queryKey: ["activity-ambition-links", activityId] });
      invalidateCampaignAmbitionCaches(queryClient, campaignId);
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      queryClient.removeQueries({ queryKey: ["activity-delete-impact", activityId] });
      setSelectedActivityId((current) => (current === activityId ? null : current));
      setActivityPendingDelete(null);
      toast.success("Activity removed");
    },
    onError: (err: Error) => {
      toast.error(err?.message || "Failed to remove activity");
    },
  });

  const saveRating = useAuthAwareMutation({
    mutationFn: async (vars: {
      activity_id: number;
      worker_id: number;
      rating: number;
      binary_value?: string | null;
    }) => {
      const { error } = await supabase.from("campaign_activity_ratings").upsert(
        {
          activity_id: vars.activity_id,
          worker_id: vars.worker_id,
          rating: vars.rating,
          binary_value: vars.binary_value ?? null,
          source: "staff",
          rated_at: new Date().toISOString(),
          rating_phase: "actual",
          event_id: null,
        },
        { onConflict: "activity_id,worker_id,rating_phase,event_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
    },
  });

  const bulkSaveRatings = useAuthAwareMutation({
    mutationFn: async (rows: AssessmentWorkerRow[]) => {
      if (!activityForRates || rows.length === 0) return;
      const shouldSetRating = bulkRating !== UNSET_VALUE;
      const shouldSetBinary = bulkBinaryValue !== UNSET_VALUE;
      if (!shouldSetRating && !shouldSetBinary) return;

      const payload = rows.map((row) => {
        const nextRating = shouldSetRating
          ? Number(bulkRating)
          : typeof row.fieldValues.activity_rating === "number"
            ? row.fieldValues.activity_rating
            : 3;
        const nextBinary = shouldSetBinary
          ? bulkBinaryValue === EMPTY_VALUE
            ? null
            : bulkBinaryValue
          : typeof row.fieldValues.activity_binary_value === "string"
            ? row.fieldValues.activity_binary_value
            : null;
        return {
          activity_id: activityForRates,
          worker_id: row.worker_id,
          rating: nextRating,
          binary_value: nextBinary,
          source: "staff",
          rated_at: new Date().toISOString(),
          rating_phase: "actual" as const,
          event_id: null,
        };
      });

      const { error } = await supabase
        .from("campaign_activity_ratings")
        .upsert(payload, { onConflict: "activity_id,worker_id,rating_phase,event_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      setBulkRating(UNSET_VALUE);
      setBulkBinaryValue(UNSET_VALUE);
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
    },
  });

  const summaryMap = useMemo(
    () =>
      new Map(
        ratingSummary.map(
          (row: {
            worker_id: number;
            cumulative_rating: number | null;
            last_activity_rating: number | null;
          }) => [row.worker_id, row]
        )
      ),
    [ratingSummary]
  );

  const ratingMap = useMemo(
    () =>
      new Map(
        ratingsForActivity.map(
          (row: { worker_id: number; rating: number; binary_value: string | null }) => [
            row.worker_id,
            row,
          ]
        )
      ),
    [ratingsForActivity]
  );

  const workerRows = useMemo<AssessmentWorkerRow[]>(() => {
    return members.map((row: { worker_id: number; worker: unknown }) => {
      const rawWorkerValue = Array.isArray(row.worker) ? row.worker[0] : row.worker;
      const worker = (rawWorkerValue ?? {}) as Record<string, unknown>;
      const workerName = formatWorkerLabel(row.worker_id, worker);
      const existing = ratingMap.get(row.worker_id);
      const summary = summaryMap.get(row.worker_id);

      const memberRoleType = worker.member_role_type as
        | { display_name?: string; role_name?: string }
        | null
        | undefined;

      const fieldValues: Record<string, PrimitiveValue> = {
        worker_name: workerName,
        worker_id: row.worker_id,
        organising_role: memberRoleType?.display_name ?? null,
        activity_rating: existing?.rating ?? null,
        activity_binary_value: existing?.binary_value ?? null,
        cumulative_rating: summary?.cumulative_rating ?? null,
        last_activity_rating: summary?.last_activity_rating ?? null,
      };

      for (const [key, value] of Object.entries(worker)) {
        if (isPrimitiveValue(value)) fieldValues[key] = value;
      }

      const employer = worker.employer as { employer_name?: string } | null | undefined;
      const worksite = worker.worksite as { worksite_name?: string } | null | undefined;
      const membershipType = worker.union_membership_type as
        | { display_name?: string }
        | null
        | undefined;
      const canonicalOccupation = worker.canonical_occupation as
        | { canonical_name?: string }
        | null
        | undefined;

      fieldValues.employer_name = employer?.employer_name ?? null;
      fieldValues.worksite_name = worksite?.worksite_name ?? null;
      fieldValues.membership_type_name = membershipType?.display_name ?? null;
      fieldValues.member_role_type_name = memberRoleType?.display_name ?? null;
      fieldValues.canonical_occupation_name = canonicalOccupation?.canonical_name ?? null;

      return {
        worker_id: row.worker_id,
        workerName,
        rawWorker: worker,
        fieldValues,
      };
    });
  }, [members, ratingMap, summaryMap]);

  const selectedActivity = assessmentActivities.find(
    (activity) => activity.activity_id === activityForRates
  );

  const availableFields = useMemo(() => {
    const keys = new Set<string>(CORE_ASSESSMENT_FIELDS);
    workerRows.forEach((row) => {
      Object.entries(row.fieldValues).forEach(([field, value]) => {
        if (value !== null) keys.add(field);
      });
    });
    return [...keys].sort((a, b) => labelForField(a).localeCompare(labelForField(b)));
  }, [workerRows]);

  const fieldsByKey = useMemo(() => new Set(availableFields), [availableFields]);

  const valuesByField = useMemo(() => {
    const map = new Map<string, PrimitiveValue[]>();
    availableFields.forEach((field) => {
      const valueMap = new Map<string, PrimitiveValue>();
      workerRows.forEach((row) => {
        const value = row.fieldValues[field] ?? null;
        valueMap.set(normalizeFilterValue(value), value);
      });
      const orderedValues = [...valueMap.values()].sort((a, b) => {
        const aLabel = labelForValue(a);
        const bLabel = labelForValue(b);
        return aLabel.localeCompare(bLabel, undefined, { numeric: true });
      });
      map.set(field, orderedValues);
    });
    return map;
  }, [availableFields, workerRows]);

  useEffect(() => {
    if (!fieldsByKey.has(filterFieldDraft)) {
      const fallback = availableFields[0] ?? DEFAULT_SORT_FIELD;
      setFilterFieldDraft(fallback);
      setFilterValueDraft(UNSET_VALUE);
    }
  }, [availableFields, fieldsByKey, filterFieldDraft]);

  useEffect(() => {
    if (availableFields.length === 0) return;
    if (!fieldsByKey.has(sortField)) {
      setSortField(availableFields.includes(DEFAULT_SORT_FIELD) ? DEFAULT_SORT_FIELD : availableFields[0]);
    }
  }, [availableFields, fieldsByKey, sortField]);

  useEffect(() => {
    setSelectedWorkerIds(new Set());
    setBulkRating(UNSET_VALUE);
    setBulkBinaryValue(UNSET_VALUE);
  }, [activityForRates, activeFilters, filterCombineMode, tableSearch]);

  const filteredRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    const matchClause = (row: AssessmentWorkerRow, filter: AssessmentFilter) => {
      const value = row.fieldValues[filter.field] ?? null;
      return normalizeFilterValue(value) === filter.value;
    };
    return workerRows.filter((row) => {
      if (search) {
        const searchHit = Object.values(row.fieldValues).some((value) => {
          if (value == null) return false;
          return String(value).toLowerCase().includes(search);
        });
        if (!searchHit) return false;
      }

      if (activeFilters.length === 0) return true;
      if (filterCombineMode === "all") {
        return activeFilters.every((f) => matchClause(row, f));
      }
      return activeFilters.some((f) => matchClause(row, f));
    });
  }, [activeFilters, filterCombineMode, tableSearch, workerRows]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      const aValue = a.fieldValues[sortField] ?? null;
      const bValue = b.fieldValues[sortField] ?? null;
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }
      const compare = String(aValue).localeCompare(String(bValue), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sortDirection === "asc" ? compare : -compare;
    });
    return rows;
  }, [filteredRows, sortDirection, sortField]);

  const selectedRows = useMemo(
    () => sortedRows.filter((row) => selectedWorkerIds.has(row.worker_id)),
    [selectedWorkerIds, sortedRows]
  );

  const selectableSeedRows = useMemo(() => {
    const term = seedSearch.trim().toLowerCase();
    if (!term) return sortedRows;
    return sortedRows.filter((row) => row.workerName.toLowerCase().includes(term));
  }, [seedSearch, sortedRows]);

  const selectedSeedRow = useMemo(
    () => sortedRows.find((row) => String(row.worker_id) === seedWorkerId) ?? null,
    [seedWorkerId, sortedRows]
  );

  const seedableAttributes = useMemo(() => {
    if (!selectedSeedRow) return [];
    return Object.entries(selectedSeedRow.fieldValues)
      .filter(([, value]) => value !== null)
      .sort(([a], [b]) => labelForField(a).localeCompare(labelForField(b)));
  }, [selectedSeedRow]);

  const addFilter = () => {
    if (filterValueDraft === UNSET_VALUE || !filterFieldDraft) return;
    const clause: AssessmentFilter = {
      id: crypto.randomUUID(),
      field: filterFieldDraft,
      value: filterValueDraft,
    };
    setActiveFilters((prev) => {
      if (filterCombineMode === "all") {
        return [...prev.filter((f) => f.field !== filterFieldDraft), clause];
      }
      return [...prev, clause];
    });
  };

  const removeFilter = (id: string) => {
    setActiveFilters((prev) => prev.filter((filter) => filter.id !== id));
  };

  const applySeedFilters = () => {
    if (!selectedSeedRow || seedAttributeKeys.size === 0) return;
    const nextFilters: AssessmentFilter[] = [...seedAttributeKeys]
      .map((field) => {
        const value = selectedSeedRow.fieldValues[field] ?? null;
        return {
          id: crypto.randomUUID(),
          field,
          value: normalizeFilterValue(value),
        };
      })
      .filter((filter) => fieldsByKey.has(filter.field));

    setActiveFilters((prev) => {
      if (filterCombineMode === "all") {
        const nextByField = new Map(prev.map((filter) => [filter.field, filter]));
        nextFilters.forEach((filter) => nextByField.set(filter.field, filter));
        return [...nextByField.values()];
      }
      return [...prev, ...nextFilters];
    });

    setSeedDialogOpen(false);
    setSeedAttributeKeys(new Set());
  };

  const toggleWorker = (workerId: number, selected: boolean) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(workerId);
      else next.delete(workerId);
      return next;
    });
  };

  const allVisibleSelected =
    sortedRows.length > 0 && sortedRows.every((row) => selectedWorkerIds.has(row.worker_id));
  const someVisibleSelected = sortedRows.some((row) => selectedWorkerIds.has(row.worker_id));

  const hasBulkChanges = bulkRating !== UNSET_VALUE || bulkBinaryValue !== UNSET_VALUE;
  const selectedCount = selectedWorkerIds.size;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Tasks & assessments</CardTitle>
          {canWrite && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Add assessment
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {assessmentActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assessments yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assessmentActivities.map((activity) => (
                <div
                  key={activity.activity_id}
                  className="inline-flex items-stretch rounded-md border bg-background shadow-sm overflow-hidden"
                >
                  <Button
                    variant={activity.activity_id === activityForRates ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none border-0 shadow-none px-3"
                    onClick={() => {
                      setSelectedActivityId(activity.activity_id);
                    }}
                  >
                    {activity.title}
                    {activity.template_key && (
                      <Badge variant="secondary" className="ml-1 text-[10px]">
                        {activity.template_key}
                      </Badge>
                    )}
                  </Button>
                  {canWrite && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-none border-l px-2 text-muted-foreground hover:text-destructive"
                      title="Remove activity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivityPendingDelete(activity);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {activityForRates && selectedActivity && (
            <ActivityAmbitionLinksPanel
              campaignId={campaignId}
              activityId={activityForRates}
              activityTitle={selectedActivity.title}
              canWrite={canWrite}
            />
          )}

          <AssessmentsTabCharts campaignId={campaignId} />

          {activityForRates && workerRows.length > 0 && (
            <>
              <div className="rounded-md border p-3 space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1 md:col-span-2">
                    <Label>Search workers</Label>
                    <Input
                      value={tableSearch}
                      onChange={(event) => setTableSearch(event.target.value)}
                      placeholder="Name, phone, email, occupation, role..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Sort by</Label>
                    <Select value={sortField} onValueChange={setSortField}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map((field) => (
                          <SelectItem key={field} value={field}>
                            {labelForField(field)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Direction</Label>
                    <Select
                      value={sortDirection}
                      onValueChange={(value) => setSortDirection(value as "asc" | "desc")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asc">Ascending</SelectItem>
                        <SelectItem value="desc">Descending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <Select
                    value={filterFieldDraft}
                    onValueChange={(value) => {
                      setFilterFieldDraft(value);
                      setFilterValueDraft(UNSET_VALUE);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a field" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((field) => (
                        <SelectItem key={field} value={field}>
                          {labelForField(field)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterValueDraft} onValueChange={setFilterValueDraft}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a value" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET_VALUE}>Choose a value</SelectItem>
                      {(valuesByField.get(filterFieldDraft) ?? []).map((value) => (
                        <SelectItem key={normalizeFilterValue(value)} value={normalizeFilterValue(value)}>
                          {labelForValue(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addFilter} disabled={filterValueDraft === UNSET_VALUE}>
                    Add filter
                  </Button>
                </div>

                <div className="space-y-1 max-w-xs">
                  <Label>Match filters</Label>
                  <Select
                    value={filterCombineMode}
                    onValueChange={(value) => setFilterCombineMode(value as "all" | "any")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All conditions (AND)</SelectItem>
                      <SelectItem value="any">Any condition (OR)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    With OR, you can add several filters on the same field (e.g. two employers). With AND, a
                    second filter on the same field replaces the first.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeFilters.map((filter) => (
                    <Badge key={filter.id} variant="secondary" className="gap-1">
                      {labelForField(filter.field)}:{" "}
                      {labelForValue(
                        (valuesByField.get(filter.field) ?? []).find(
                          (value) => normalizeFilterValue(value) === filter.value
                        ) ?? null
                      )}
                      <button
                        type="button"
                        className="ml-1 text-xs"
                        onClick={() => removeFilter(filter.id)}
                      >
                        x
                      </button>
                    </Badge>
                  ))}
                  {activeFilters.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setActiveFilters([])}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>

                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-1">
                    <Label>Find a worker</Label>
                    <Input
                      value={seedSearch}
                      onChange={(event) => setSeedSearch(event.target.value)}
                      placeholder="Search by worker name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Select worker</Label>
                    <Select value={seedWorkerId} onValueChange={setSeedWorkerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select one worker" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>Select one worker</SelectItem>
                        {selectableSeedRows.slice(0, 200).map((row) => (
                          <SelectItem key={row.worker_id} value={String(row.worker_id)}>
                            {row.workerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setSeedDialogOpen(true)}
                    disabled={!selectedSeedRow}
                  >
                    Use worker attributes
                  </Button>
                </div>
              </div>

              {selectedCount > 0 && (
                <div className="rounded-md border p-3 space-y-3">
                  <div className="text-sm font-medium">
                    {selectedCount} selected for bulk assessment update
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Rating (1-5)</Label>
                      <Select value={bulkRating} onValueChange={setBulkRating} disabled={!canWrite}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNSET_VALUE}>No change</SelectItem>
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <SelectItem key={rating} value={String(rating)}>
                              {rating}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedActivity?.is_binary && (
                      <div className="space-y-1">
                        <Label>Response</Label>
                        <Select
                          value={bulkBinaryValue}
                          onValueChange={setBulkBinaryValue}
                          disabled={!canWrite}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNSET_VALUE}>No change</SelectItem>
                            <SelectItem value={EMPTY_VALUE}>Clear value</SelectItem>
                            {VOTE_SUPPORTER_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => bulkSaveRatings.mutate(selectedRows)}
                      disabled={!canWrite || !hasBulkChanges || bulkSaveRatings.isPending}
                    >
                      Apply to selected
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedWorkerIds(new Set())}
                      disabled={bulkSaveRatings.isPending}
                    >
                      Clear selection
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                Showing {sortedRows.length} of {workerRows.length} workers
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                          onCheckedChange={(checked) => {
                            const selected = checked === true;
                            setSelectedWorkerIds((prev) => {
                              const next = new Set(prev);
                              sortedRows.forEach((row) => {
                                if (selected) next.add(row.worker_id);
                                else next.delete(row.worker_id);
                              });
                              return next;
                            });
                          }}
                          aria-label="Select all visible workers"
                        />
                      </TableHead>
                      <TableHead>Worker</TableHead>
                      <TableHead>Rating (1-5)</TableHead>
                      {selectedActivity?.is_binary && <TableHead>Response</TableHead>}
                      <TableHead>Cumulative</TableHead>
                      <TableHead>Last</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={selectedActivity?.is_binary ? 6 : 5}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No workers match these filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedRows.map((row) => {
                        const existingRating = row.fieldValues.activity_rating;
                        const existingBinary = row.fieldValues.activity_binary_value;
                        return (
                          <TableRow key={row.worker_id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedWorkerIds.has(row.worker_id)}
                              onCheckedChange={(checked) => toggleWorker(row.worker_id, checked === true)}
                              aria-label={`Select ${row.workerName}`}
                            />
                          </TableCell>
                          <TableCell>
                            <CampaignWorkerNameButton workerId={row.worker_id}>
                              {row.workerName}
                            </CampaignWorkerNameButton>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={typeof existingRating === "number" ? String(existingRating) : UNSET_VALUE}
                              onValueChange={(value) => {
                                if (value === UNSET_VALUE) return;
                                saveRating.mutate({
                                  activity_id: activityForRates,
                                  worker_id: row.worker_id,
                                  rating: Number(value),
                                  binary_value: typeof existingBinary === "string" ? existingBinary : null,
                                });
                              }}
                              disabled={!canWrite}
                            >
                              <SelectTrigger className="w-24 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNSET_VALUE}>-</SelectItem>
                                {[1, 2, 3, 4, 5].map((rating) => (
                                  <SelectItem key={rating} value={String(rating)}>
                                    {rating}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          {selectedActivity?.is_binary && (
                            <TableCell>
                              <Select
                                value={typeof existingBinary === "string" ? existingBinary : UNSET_VALUE}
                                onValueChange={(value) => {
                                  if (value === UNSET_VALUE) return;
                                  saveRating.mutate({
                                    activity_id: activityForRates,
                                    worker_id: row.worker_id,
                                    rating:
                                      typeof existingRating === "number" ? existingRating : 3,
                                    binary_value: value,
                                  });
                                }}
                                disabled={!canWrite}
                              >
                                <SelectTrigger className="w-32 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={UNSET_VALUE}>-</SelectItem>
                                  {VOTE_SUPPORTER_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          <TableCell>{labelForValue(row.fieldValues.cumulative_rating ?? null)}</TableCell>
                          <TableCell>{labelForValue(row.fieldValues.last_activity_rating ?? null)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Leader task lists — same data and management surface as the
          Plan & Execution → Task Lists tab. Embedded here so tasks created
          via any pathway (plan, wall-chart build list, phone call) can be
          reviewed, edited, and deleted from the workforce assessments view. */}
      <CampaignTaskListsSection campaignId={campaignId} canWrite={canWrite} />

      <Dialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Apply selected worker attributes as filters</DialogTitle>
          </DialogHeader>
          {!selectedSeedRow ? (
            <p className="text-sm text-muted-foreground">Pick a worker first to seed filters.</p>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
              {seedableAttributes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This worker does not have any non-empty attributes to apply.
                </p>
              ) : (
                seedableAttributes.map(([field, value]) => (
                  <label key={field} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={seedAttributeKeys.has(field)}
                      onCheckedChange={(checked) => {
                        setSeedAttributeKeys((prev) => {
                          const next = new Set(prev);
                          if (checked === true) next.add(field);
                          else next.delete(field);
                          return next;
                        });
                      }}
                    />
                    <span className="font-medium">{labelForField(field)}:</span>
                    <span className="text-muted-foreground">{labelForValue(value)}</span>
                  </label>
                ))
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeedDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applySeedFilters} disabled={!selectedSeedRow || seedAttributeKeys.size === 0}>
              Apply selected attributes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateAssessmentDialog
        campaignId={campaignId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lockKind="assessment"
      />

      <AlertDialog
        open={activityPendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setActivityPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this activity?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {deleteImpactLoading ? (
                  <p>Checking linked ratings and task lists…</p>
                ) : deleteImpactError ? (
                  <>
                    <p>
                      <span className="font-medium text-foreground">
                        {activityPendingDelete?.title}
                      </span>{" "}
                      ({activityPendingDelete?.activity_kind}) will be permanently removed.
                    </p>
                    <p>
                      Could not load linked data. Removing still deletes any ratings and task lists
                      tied to this activity.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <span className="font-medium text-foreground">
                        {activityPendingDelete?.title}
                      </span>{" "}
                      ({activityPendingDelete?.activity_kind}) will be permanently removed.
                    </p>
                    {(deleteImpact?.ratingCount ?? 0) > 0 && (
                      <p>
                        This activity has ratings for{" "}
                        <span className="font-medium text-foreground">
                          {deleteImpact?.ratingCount}
                        </span>{" "}
                        worker
                        {deleteImpact?.ratingCount === 1 ? "" : "s"}. Those ratings will be deleted
                        and campaign rating summaries (including the wall chart) will change.
                      </p>
                    )}
                    {(deleteImpact?.taskListCount ?? 0) > 0 && (
                      <p>
                        <span className="font-medium text-foreground">
                          {deleteImpact?.taskListCount}
                        </span>{" "}
                        linked leader task list
                        {deleteImpact?.taskListCount === 1 ? "" : "s"} (and share links) will also
                        be removed.
                      </p>
                    )}
                    {(deleteImpact?.ratingCount ?? 0) === 0 &&
                      (deleteImpact?.taskListCount ?? 0) === 0 && (
                        <p>No ratings or task lists are linked to this activity.</p>
                      )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteActivity.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                deleteActivity.isPending || (pendingDeleteId != null && deleteImpactLoading)
              }
              onClick={() => {
                if (!activityPendingDelete) return;
                void deleteActivity.mutateAsync(activityPendingDelete.activity_id);
              }}
            >
              {deleteActivity.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
