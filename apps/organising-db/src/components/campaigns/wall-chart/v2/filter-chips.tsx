"use client";

import { X } from "lucide-react";
import {
  DEFAULT_FILTER_STATE,
  activeFilterKeys,
  type WallChartFilterKey,
  type WallChartFilterState,
} from "../filters";
import { participationSourceLabel } from "../participation-selector";

const CHIP_LABELS: Record<WallChartFilterKey, string> = {
  membership: "Membership",
  roles: "Role",
  ratings: "Rating",
  occupations: "Occupation",
  phone: "Phone",
  email: "Email",
  assessments: "Assessment ratings",
  facts: "Data fields",
  other_group: "In unit of another group",
  participation: "Participation",
};

/**
 * The filter state with ONE dimension reset to its default (a chip's ×).
 * Pure; Sort is not a dimension and is never touched.
 */
export function clearFilterKey(state: WallChartFilterState, key: WallChartFilterKey): WallChartFilterState {
  const d = DEFAULT_FILTER_STATE();
  switch (key) {
    case "membership":
      return { ...state, membershipTypeIds: d.membershipTypeIds, includeNonMember: d.includeNonMember };
    case "roles":
      return { ...state, roles: d.roles };
    case "ratings":
      return { ...state, ratings: d.ratings };
    case "occupations":
      return { ...state, occupationIds: d.occupationIds };
    case "phone":
      return { ...state, phone: d.phone };
    case "email":
      return { ...state, email: d.email };
    case "assessments":
      return { ...state, assessmentFilters: d.assessmentFilters };
    case "facts":
      return { ...state, factFilters: d.factFilters };
    case "other_group":
      return { ...state, otherGroupUnitIds: d.otherGroupUnitIds };
    case "participation":
      return { ...state, participation: d.participation };
  }
}

/** The chip's text: the dimension name, with the source named for Participation. */
export function chipLabel(state: WallChartFilterState, key: WallChartFilterKey): string {
  if (key === "participation" && state.participation) {
    return `${CHIP_LABELS.participation}: ${participationSourceLabel(state.participation)}`;
  }
  if (key === "other_group") {
    const n = state.otherGroupUnitIds?.size ?? 0;
    return `${CHIP_LABELS.other_group} (${n})`;
  }
  return CHIP_LABELS[key];
}

/**
 * WP2.4 — active filters as chips with a remove × (wp2.4.md §3.5 item 4,
 * plan 5.6 `:308`). Renders nothing when no dimension constrains.
 */
export function FilterChips({
  state,
  onChange,
}: {
  state: WallChartFilterState;
  onChange: (next: WallChartFilterState) => void;
}) {
  const keys = activeFilterKeys(state);
  if (keys.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1 print:hidden" aria-label="Active filters">
      {keys.map((key) => {
        const label = chipLabel(state, key);
        return (
          <li
            key={key}
            className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
          >
            <span>{label}</span>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted"
              onClick={() => onChange(clearFilterKey(state, key))}
              aria-label={`Remove ${label} filter`}
              title="Remove"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
