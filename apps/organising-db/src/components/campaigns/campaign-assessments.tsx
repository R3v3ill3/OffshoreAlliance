"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ACTIVITY_TEMPLATE_OPTIONS, VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import type { CampaignActivity, CampaignActivityTemplateKey } from "@/types/database";

type PrimitiveValue = string | number | boolean | null;

interface AssessmentFilter {
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
  const [templateChoice, setTemplateChoice] = useState<string>("__custom__");
  const [form, setForm] = useState({
    title: "",
    description: "",
    activity_kind: "task" as "task" | "assessment",
    is_binary: false,
    supporter_outcome_value: "" as string,
  });
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

  const [tableSearch, setTableSearch] = useState("");
  const [sortField, setSortField] = useState(DEFAULT_SORT_FIELD);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeFilters, setActiveFilters] = useState<AssessmentFilter[]>([]);
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
          `membership_id, worker_id, oa_leader_role,
           worker:workers(
             *,
             employer:employers!workers_employer_id_fkey(employer_name),
             worksite:worksites!workers_worksite_id_fkey(worksite_name),
             union_membership_type:union_membership_types!workers_union_membership_type_id_fkey(display_name),
             member_role_type:member_role_types!workers_member_role_type_id_fkey(display_name),
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

  const activityForRates = selectedActivityId ?? activities[0]?.activity_id ?? null;

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

  const createActivity = useMutation({
    mutationFn: async () => {
      const templateKey =
        templateChoice !== "__custom__" ? (templateChoice as CampaignActivityTemplateKey) : null;
      const fromTemplate = ACTIVITY_TEMPLATE_OPTIONS.find((t) => t.key === templateKey);
      const is_binary =
        fromTemplate?.defaultBinary ?? (templateKey === "vote" ? true : form.is_binary);
      const payload: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        title: form.title || fromTemplate?.label || "Activity",
        activity_kind: form.activity_kind,
        is_binary,
        is_custom: templateChoice === "__custom__",
        template_key: templateKey,
      };
      if (form.description) payload.description = form.description;
      if (is_binary && form.supporter_outcome_value) {
        payload.supporter_outcome_value = form.supporter_outcome_value;
      } else if (is_binary && templateKey === "vote") {
        payload.supporter_outcome_value = "yes";
      }
      const { error } = await supabase.from("campaign_activities").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-activities", campaignId] });
      setDialogOpen(false);
      setForm({
        title: "",
        description: "",
        activity_kind: "task",
        is_binary: false,
        supporter_outcome_value: "",
      });
      setTemplateChoice("__custom__");
    },
  });

  const saveRating = useMutation({
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
        },
        { onConflict: "activity_id,worker_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
    },
  });

  const bulkSaveRatings = useMutation({
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
        };
      });

      const { error } = await supabase
        .from("campaign_activity_ratings")
        .upsert(payload, { onConflict: "activity_id,worker_id" });
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
    return members.map((row: { worker_id: number; worker: unknown; oa_leader_role: string | null }) => {
      const rawWorkerValue = Array.isArray(row.worker) ? row.worker[0] : row.worker;
      const worker = (rawWorkerValue ?? {}) as Record<string, unknown>;
      const firstName = typeof worker.first_name === "string" ? worker.first_name : "";
      const lastName = typeof worker.last_name === "string" ? worker.last_name : "";
      const workerName = `${firstName} ${lastName}`.trim() || `Worker ${row.worker_id}`;
      const existing = ratingMap.get(row.worker_id);
      const summary = summaryMap.get(row.worker_id);

      const fieldValues: Record<string, PrimitiveValue> = {
        worker_name: workerName,
        worker_id: row.worker_id,
        oa_leader_role: row.oa_leader_role,
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
      const memberRoleType = worker.member_role_type as
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

  const selectedActivity = activities.find((activity) => activity.activity_id === activityForRates);

  const availableFields = useMemo(() => {
    const keys = new Set<string>();
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
  }, [activityForRates, activeFilters, tableSearch]);

  const filteredRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    return workerRows.filter((row) => {
      if (search) {
        const searchHit = Object.values(row.fieldValues).some((value) => {
          if (value == null) return false;
          return String(value).toLowerCase().includes(search);
        });
        if (!searchHit) return false;
      }

      const matchesFilters = activeFilters.every((filter) => {
        const value = row.fieldValues[filter.field] ?? null;
        return normalizeFilterValue(value) === filter.value;
      });

      return matchesFilters;
    });
  }, [activeFilters, tableSearch, workerRows]);

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
    setActiveFilters((prev) => {
      const withoutSameField = prev.filter((filter) => filter.field !== filterFieldDraft);
      return [...withoutSameField, { field: filterFieldDraft, value: filterValueDraft }];
    });
  };

  const removeFilter = (field: string) => {
    setActiveFilters((prev) => prev.filter((filter) => filter.field !== field));
  };

  const applySeedFilters = () => {
    if (!selectedSeedRow || seedAttributeKeys.size === 0) return;
    const nextFilters: AssessmentFilter[] = [...seedAttributeKeys]
      .map((field) => {
        const value = selectedSeedRow.fieldValues[field] ?? null;
        return {
          field,
          value: normalizeFilterValue(value),
        };
      })
      .filter((filter) => fieldsByKey.has(filter.field));

    setActiveFilters((prev) => {
      const nextByField = new Map(prev.map((filter) => [filter.field, filter]));
      nextFilters.forEach((filter) => nextByField.set(filter.field, filter));
      return [...nextByField.values()];
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
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              Add activity
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activities.map((activity) => (
                <Button
                  key={activity.activity_id}
                  variant={activity.activity_id === activityForRates ? "default" : "outline"}
                  size="sm"
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
              ))}
            </div>
          )}

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

                <div className="flex flex-wrap gap-2">
                  {activeFilters.map((filter) => (
                    <Badge key={filter.field} variant="secondary" className="gap-1">
                      {labelForField(filter.field)}:{" "}
                      {labelForValue(
                        (valuesByField.get(filter.field) ?? []).find(
                          (value) => normalizeFilterValue(value) === filter.value
                        ) ?? null
                      )}
                      <button
                        type="button"
                        className="ml-1 text-xs"
                        onClick={() => removeFilter(filter.field)}
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
                          <TableCell className="font-medium">{row.workerName}</TableCell>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add activity</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>From template</Label>
              <Select value={templateChoice} onValueChange={setTemplateChoice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__custom__">Custom</SelectItem>
                  {ACTIVITY_TEMPLATE_OPTIONS.map((template) => (
                    <SelectItem key={template.key} value={template.key}>
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Overrides template label if set"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Kind</Label>
                <Select
                  value={form.activity_kind}
                  onValueChange={(value) =>
                    setForm({ ...form, activity_kind: value as "task" | "assessment" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="assessment">Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {templateChoice === "__custom__" && (
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_binary}
                      onChange={(event) => setForm({ ...form, is_binary: event.target.checked })}
                    />
                    Binary / vote-style
                  </label>
                </div>
              )}
            </div>
            {(form.is_binary || templateChoice === "vote") && (
              <div className="space-y-2">
                <Label>Supporter outcome (for binary)</Label>
                <Select
                  value={form.supporter_outcome_value || "yes"}
                  onValueChange={(value) => setForm({ ...form, supporter_outcome_value: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createActivity.mutate()}
              disabled={createActivity.isPending || (templateChoice === "__custom__" && !form.title.trim())}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
