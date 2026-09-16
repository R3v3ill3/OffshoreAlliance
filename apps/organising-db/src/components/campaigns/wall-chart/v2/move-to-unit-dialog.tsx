"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DropRef } from "@/lib/campaign/groups/plan-drop";
import { ouDisplayName, type WallChartOU } from "../types";
import type { CampaignGroupRow } from "./use-wall-chart-groups";

const UNASSIGNED_VALUE = "__unassigned__";

export type MoveToUnitTarget = {
  ou: WallChartOU;
  group: CampaignGroupRow | null;
  /**
   * WP2.4c (wp2.4c.md §3.7, §3.13): an explicit label, used for a nested
   * card's "<Root> › <Child>". Absent → the WP2.4 rule below.
   */
  label?: string;
};

/**
 * WP2.4 (wp2.4.md §3.9, §3.13) — move-only "Move to unit…": from a Group's
 * view the targets are that Group's units plus "Unassigned in <Group>"; from
 * Not in any group they are every unit across Groups, labelled
 * "Group › Unit" (§3.5). Submitting hands the refs and the target to the same
 * planner a drop uses; there is no copy (CP-a). The parent re-mounts it via
 * `key` per operation, so nothing is reset here.
 */
export function MoveToUnitDialog({
  open,
  onOpenChange,
  refs,
  workerLabel,
  targets,
  group,
  pending,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refs: DropRef[];
  /** Named subject for a single worker; the count is used otherwise. */
  workerLabel?: string;
  /** Targets in display order; `group` is null only outside any Group view. */
  targets: MoveToUnitTarget[];
  /** The selected Group, or null in the Not in any group view (no Unassigned target). */
  group: CampaignGroupRow | null;
  pending: boolean;
  onMove: (targetOuId: number | null, refs: DropRef[]) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const workerCount = useMemo(() => new Set(refs.map((r) => r.workerId)).size, [refs]);
  const subject = workerLabel ?? `${workerCount} ${workerCount === 1 ? "worker" : "workers"}`;

  const submit = () => {
    if (!selected || refs.length === 0) return;
    onMove(selected === UNASSIGNED_VALUE ? null : Number(selected), refs);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {workerCount === 1 ? "worker" : `${workerCount} workers`}</DialogTitle>
          <DialogDescription>
            {group
              ? `Move ${subject} to another Unit of ${group.name}, or to Unassigned in ${group.name}. Their Units in other Groups are not affected.`
              : `Place ${subject} in a Unit. Each Group holds a worker in at most one Unit.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {targets.length === 0 && !group ? (
            <p className="text-sm text-muted-foreground">This campaign has no Units yet.</p>
          ) : (
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger aria-label="Target unit">
                <SelectValue placeholder="Choose a target…" />
              </SelectTrigger>
              <SelectContent>
                {group && <SelectItem value={UNASSIGNED_VALUE}>Unassigned in {group.name}</SelectItem>}
                {targets.map((t) => (
                  <SelectItem key={t.ou.ou_id} value={String(t.ou.ou_id)}>
                    {t.label ?? (t.group && !group ? `${t.group.name} › ${ouDisplayName(t.ou)}` : ouDisplayName(t.ou))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || pending}>
            {pending ? "Working…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
