"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ouDisplayName } from "./types";
import type { WallChartOU } from "./types";

export type WallChartUnitManagerProps = {
  ous: WallChartOU[];
  canWrite: boolean;
  hiddenOuIds: Set<number>;
  onToggleHidden: (ouId: number) => void;
  onShowAllHidden: () => void;
  onReorder: (orderedOuIds: number[]) => void;
  onOpenCreateUnit: () => void;
};

export function WallChartUnitManager({
  ous,
  canWrite,
  hiddenOuIds,
  onToggleHidden,
  onShowAllHidden,
  onReorder,
  onOpenCreateUnit,
}: WallChartUnitManagerProps) {
  const [open, setOpen] = useState(false);

  const hiddenCount = useMemo(() => {
    let n = 0;
    for (const ou of ous) {
      if (hiddenOuIds.has(ou.ou_id)) n++;
    }
    return n;
  }, [ous, hiddenOuIds]);

  if (ous.length === 0) {
    return canWrite ? (
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onOpenCreateUnit}>
        New unit
      </Button>
    ) : null;
  }

  const move = (index: number, dir: -1 | 1) => {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= ous.length) return;
    const ids = ous.map((o) => o.ou_id);
    const [removed] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, removed);
    onReorder(ids);
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={hiddenCount > 0 ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Units
            {hiddenCount > 0 ? ` (${ous.length - hiddenCount}/${ous.length})` : ` (${ous.length})`}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-h-[min(24rem,70vh)] overflow-y-auto">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Choose which units appear on the wall chart. Order is saved for everyone. Visibility is stored in
              this browser only.
            </p>
            <div className="flex flex-wrap gap-2">
              {hiddenCount > 0 && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onShowAllHidden}>
                  Show all units
                </Button>
              )}
              {canWrite && (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenCreateUnit}>
                  New unit
                </Button>
              )}
            </div>
            <ul className="space-y-1">
              {ous.map((ou, index) => {
                const visible = !hiddenOuIds.has(ou.ou_id);
                const label = ouDisplayName(ou);
                return (
                  <li
                    key={ou.ou_id}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
                  >
                    <Checkbox
                      id={`wc-ou-vis-${ou.ou_id}`}
                      checked={visible}
                      onCheckedChange={() => onToggleHidden(ou.ou_id)}
                    />
                    <Label
                      htmlFor={`wc-ou-vis-${ou.ou_id}`}
                      className="flex-1 text-xs font-medium truncate cursor-pointer"
                    >
                      {label}
                    </Label>
                    {canWrite && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          aria-label={`Move ${label} up`}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={index === ous.length - 1}
                          onClick={() => move(index, 1)}
                          aria-label={`Move ${label} down`}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
