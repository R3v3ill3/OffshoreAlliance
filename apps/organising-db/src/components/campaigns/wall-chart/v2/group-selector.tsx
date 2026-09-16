"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FirstUseHint } from "@/components/hints/first-use-hint";
import {
  groupParamValue,
  parseGroupParam,
  type GroupSelection,
} from "@/lib/campaign/groups/resolve-group-selection";
import type { CampaignGroupRow } from "./use-wall-chart-groups";

export const NOT_IN_ANY_GROUP_LABEL = "Not in any group";

/**
 * WP2.4 — the Group selector (wp2.4.md §3.5 item 1, plan 5.6 `:305`): groups
 * in display order, then "Not in any group"; single-select; always shown,
 * even with one group or none. The WP1.7 `wall_chart_group_selector` hint
 * anchors here (§3.16).
 *
 * WP2.4c (wp2.4c.md §3.5, SG-a / B2): `groups` is the PRIMARY list
 * (`groupsState.primaryGroups`). A group every unit of which is nested under
 * a unit of another group is already on screen inside those parents' cards,
 * so it is not offered — and, since the resolver validates `?group=` and the
 * stored preference against the same ids, no view exists that this control
 * cannot reach and "Unassigned in <a sub-unit-only group>" is never rendered.
 */
export function GroupSelector({
  groups,
  value,
  onChange,
  hintVisible,
  onHintDismiss,
}: {
  /** The primary groups, in display order (wp2.4c.md §3.5). */
  groups: readonly CampaignGroupRow[];
  value: GroupSelection;
  onChange: (next: GroupSelection) => void;
  hintVisible: boolean;
  onHintDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[12rem]">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Group</Label>
      <FirstUseHint id="wall_chart_group_selector" visible={hintVisible} onDismiss={onHintDismiss}>
        <Select
          value={groupParamValue(value)}
          onValueChange={(next) => {
            const parsed = parseGroupParam(next);
            if (parsed !== null) onChange(parsed);
          }}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Group">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.group_id} value={String(g.group_id)}>
                {g.name}
              </SelectItem>
            ))}
            <SelectItem value={groupParamValue("none")}>{NOT_IN_ANY_GROUP_LABEL}</SelectItem>
          </SelectContent>
        </Select>
      </FirstUseHint>
    </div>
  );
}
