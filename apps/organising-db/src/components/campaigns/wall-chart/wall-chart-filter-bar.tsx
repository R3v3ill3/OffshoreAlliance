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
import {
  DEFAULT_FILTER_STATE,
  hasActiveFilter,
  type RatingBucket,
  type RoleFilterKey,
  type SortKey,
  type WallChartFilterState,
} from "./filters";

export type MembershipTypeOption = { id: number; label: string };
export type OccupationOption = { id: number; label: string };

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
};

export function WallChartFilterBar({
  state,
  onChange,
  membershipTypes,
  occupations,
  onApplyToAll,
  compact,
}: WallChartFilterBarProps) {
  const active = hasActiveFilter(state);
  const activeCount =
    state.membershipTypeIds.size +
    (state.includeNonMember ? 1 : 0) +
    state.roles.size +
    state.ratings.size +
    state.occupationIds.size;

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

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
