"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import {
  activeAssessmentFilters,
  DEFAULT_FILTER_STATE,
  hasActiveFilter,
  type ContactPresence,
  type RatingBucket,
  type RoleFilterKey,
  type SortKey,
  type WallChartFilterState,
} from "./filters";
import { FactFilterControls } from "../data-fields/fact-filter-controls";
import type { CampaignDataField } from "@/lib/campaign-facts/types";

export type MembershipTypeOption = { id: number; label: string };
export type OccupationOption = { id: number; label: string };
export type AssessmentFilterOption = {
  activityId: number;
  title: string;
  isBinary: boolean;
};

const PRESENCE_OPTIONS: { key: ContactPresence; label: string }[] = [
  { key: "any", label: "Any" },
  { key: "has", label: "Has" },
  { key: "missing", label: "Doesn’t have" },
];

const ROLE_OPTIONS: { key: RoleFilterKey; label: string }[] = [
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

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "last_name", label: "Last name" },
  { key: "first_name", label: "First name" },
  { key: "cumulative_desc", label: "Cumulative rating (high → low)" },
  { key: "cumulative_asc", label: "Cumulative rating (low → high)" },
  { key: "last_activity_desc", label: "Last activity (high → low)" },
  { key: "last_activity_asc", label: "Last activity (low → high)" },
  { key: "relationships", label: "Group by relationships" },
  { key: "occupation", label: "Occupation" },
];

export type WallChartFilterBarProps = {
  state: WallChartFilterState;
  onChange: (state: WallChartFilterState) => void;
  membershipTypes: MembershipTypeOption[];
  occupations: OccupationOption[];
  onApplyToAll?: () => void;
  compact?: boolean;
  dataFields?: CampaignDataField[];
  assessmentOptions?: AssessmentFilterOption[];
};

export function WallChartFilterBar({
  state,
  onChange,
  membershipTypes,
  occupations,
  onApplyToAll,
  compact,
  dataFields = [],
  assessmentOptions = [],
}: WallChartFilterBarProps) {
  const active = hasActiveFilter(state);
  const activeCount =
    state.membershipTypeIds.size +
    (state.includeNonMember ? 1 : 0) +
    state.roles.size +
    state.ratings.size +
    state.occupationIds.size +
    (state.phone !== "any" ? 1 : 0) +
    (state.email !== "any" ? 1 : 0) +
    activeAssessmentFilters(state).length +
    state.factFilters.length;
  const sortableFields = dataFields.filter((f) => f.sortable);

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const addedAssessmentIds = new Set(
    state.assessmentFilters.map((f) => f.activityId)
  );
  const addableAssessments = assessmentOptions.filter(
    (o) => !addedAssessmentIds.has(o.activityId)
  );

  const addAssessmentFilter = (activityId: number) =>
    onChange({
      ...state,
      assessmentFilters: [
        ...state.assessmentFilters,
        { activityId, buckets: new Set<RatingBucket>() },
      ],
    });

  const removeAssessmentFilter = (activityId: number) =>
    onChange({
      ...state,
      assessmentFilters: state.assessmentFilters.filter(
        (f) => f.activityId !== activityId
      ),
    });

  const toggleAssessmentBucket = (activityId: number, bucket: RatingBucket) =>
    onChange({
      ...state,
      assessmentFilters: state.assessmentFilters.map((f) =>
        f.activityId === activityId
          ? { ...f, buckets: toggle(f.buckets, bucket) }
          : f
      ),
    });

  const reset = () => onChange(DEFAULT_FILTER_STATE());

  return (
    <div className="flex items-center gap-1">
      <Select
        value={state.sort}
        onValueChange={(v) => onChange({ ...state, sort: v as SortKey })}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={active ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
          >
            Filter{active ? ` (${activeCount})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
          <div className="space-y-4">
            <Section label="Role">
              <div className="grid grid-cols-2 gap-1.5">
                {ROLE_OPTIONS.map((r) => (
                  <CheckboxRow
                    key={r.key}
                    label={r.label}
                    checked={state.roles.has(r.key)}
                    onChange={() => onChange({ ...state, roles: toggle(state.roles, r.key) })}
                  />
                ))}
              </div>
            </Section>

            <Section label="Cumulative rating">
              <div className="grid grid-cols-2 gap-1.5">
                {RATING_OPTIONS.map((r) => (
                  <CheckboxRow
                    key={r.key}
                    label={r.label}
                    checked={state.ratings.has(r.key)}
                    onChange={() => onChange({ ...state, ratings: toggle(state.ratings, r.key) })}
                  />
                ))}
              </div>
            </Section>

            <Section label="Membership">
              <div className="space-y-1">
                <CheckboxRow
                  label="Non-member"
                  checked={state.includeNonMember}
                  onChange={() => onChange({ ...state, includeNonMember: !state.includeNonMember })}
                />
                {membershipTypes.map((m) => (
                  <CheckboxRow
                    key={m.id}
                    label={m.label}
                    checked={state.membershipTypeIds.has(m.id)}
                    onChange={() =>
                      onChange({
                        ...state,
                        membershipTypeIds: toggle(state.membershipTypeIds, m.id),
                      })
                    }
                  />
                ))}
              </div>
            </Section>

            {occupations.length > 0 && (
              <Section label="Occupation">
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {occupations.map((o) => (
                    <CheckboxRow
                      key={o.id}
                      label={o.label}
                      checked={state.occupationIds.has(o.id)}
                      onChange={() =>
                        onChange({
                          ...state,
                          occupationIds: toggle(state.occupationIds, o.id),
                        })
                      }
                    />
                  ))}
                </div>
              </Section>
            )}

            <Section label="Contact details">
              <div className="grid grid-cols-2 gap-2">
                <PresenceSelect
                  label="Phone"
                  value={state.phone}
                  onChange={(phone) => onChange({ ...state, phone })}
                />
                <PresenceSelect
                  label="Email"
                  value={state.email}
                  onChange={(email) => onChange({ ...state, email })}
                />
              </div>
            </Section>

            {(assessmentOptions.length > 0 ||
              state.assessmentFilters.length > 0) && (
              <Section label="Assessment ratings">
                <div className="space-y-2">
                  {state.assessmentFilters.map((af) => {
                    const opt = assessmentOptions.find(
                      (o) => o.activityId === af.activityId
                    );
                    return (
                      <div
                        key={af.activityId}
                        className="rounded border p-2 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">
                            {opt?.title ?? `Assessment ${af.activityId}`}
                            {opt?.isBinary ? " (binary)" : ""}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => removeAssessmentFilter(af.activityId)}
                            aria-label={`Remove ${opt?.title ?? "assessment"} filter`}
                            title="Remove"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {RATING_OPTIONS.map((r) => (
                            <CheckboxRow
                              key={r.key}
                              label={r.key === "unrated" ? "Not rated" : r.label}
                              checked={af.buckets.has(r.key)}
                              onChange={() =>
                                toggleAssessmentBucket(af.activityId, r.key)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {addableAssessments.length > 0 && (
                    <Select
                      value="__add__"
                      onValueChange={(v) => {
                        if (v !== "__add__") addAssessmentFilter(Number(v));
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Add assessment filter…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__add__" disabled>
                          Add assessment filter…
                        </SelectItem>
                        {addableAssessments.map((o) => (
                          <SelectItem
                            key={o.activityId}
                            value={String(o.activityId)}
                          >
                            {o.title}
                            {o.isBinary ? " (binary)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </Section>
            )}

            {dataFields.some((f) => f.filterable) && (
              <FactFilterControls
                fields={dataFields}
                filters={state.factFilters}
                onChange={(factFilters) => onChange({ ...state, factFilters })}
              />
            )}

            {sortableFields.length > 0 && (
              <Section label="Sort by data field">
                <Select
                  value={
                    state.sortFactFieldId != null
                      ? `${state.sort}:${state.sortFactFieldId}`
                      : "none"
                  }
                  onValueChange={(v) => {
                    if (v === "none") {
                      onChange({
                        ...state,
                        sortFactFieldId: null,
                        sort:
                          state.sort === "fact_asc" || state.sort === "fact_desc"
                            ? "last_name"
                            : state.sort,
                      });
                      return;
                    }
                    const [dir, id] = v.split(":");
                    onChange({
                      ...state,
                      sort: dir as SortKey,
                      sortFactFieldId: Number(id),
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {sortableFields.map((f) => (
                      <SelectItem key={`d-${f.field_id}`} value={`fact_desc:${f.field_id}`}>
                        {f.label} (high → low)
                      </SelectItem>
                    ))}
                    {sortableFields.map((f) => (
                      <SelectItem key={`a-${f.field_id}`} value={`fact_asc:${f.field_id}`}>
                        {f.label} (low → high)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Section>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={!active}
                className="h-7 px-2 text-xs"
              >
                Clear
              </Button>
              {onApplyToAll && !compact && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onApplyToAll}
                  className="h-7 px-2 text-xs"
                >
                  Apply to all units
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
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

function PresenceSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ContactPresence;
  onChange: (value: ContactPresence) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as ContactPresence)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESENCE_OPTIONS.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
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

/** Helper to memoise membership/occupation option lists from already-loaded worker data. */
export function useDerivedOptions(
  memberList: {
    worker_id: number;
    worker: { union_membership_type_id: number | null; canonical_occupation_id: number | null } | null;
  }[],
  labels: { membershipTypes: Map<number, string>; occupations: Map<number, string> }
): { membershipTypes: MembershipTypeOption[]; occupations: OccupationOption[] } {
  return useMemo(() => {
    const mtSeen = new Set<number>();
    const occSeen = new Set<number>();
    for (const row of memberList) {
      const w = row.worker;
      if (!w) continue;
      if (w.union_membership_type_id != null) mtSeen.add(w.union_membership_type_id);
      if (w.canonical_occupation_id != null) occSeen.add(w.canonical_occupation_id);
    }
    const membershipTypes: MembershipTypeOption[] = [...mtSeen].map((id) => ({
      id,
      label: labels.membershipTypes.get(id) ?? `Type ${id}`,
    }));
    membershipTypes.sort((a, b) => a.label.localeCompare(b.label));
    const occupations: OccupationOption[] = [...occSeen].map((id) => ({
      id,
      label: labels.occupations.get(id) ?? `Occupation ${id}`,
    }));
    occupations.sort((a, b) => a.label.localeCompare(b.label));
    return { membershipTypes, occupations };
  }, [memberList, labels]);
}
