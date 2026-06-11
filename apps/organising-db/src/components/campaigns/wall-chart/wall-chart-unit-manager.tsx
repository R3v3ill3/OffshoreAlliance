"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, LayoutGrid, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  onDeleteUnit?: (ou: WallChartOU) => void;
};

export function WallChartUnitManager({
  ous,
  canWrite,
  hiddenOuIds,
  onToggleHidden,
  onShowAllHidden,
  onReorder,
  onOpenCreateUnit,
  onDeleteUnit,
}: WallChartUnitManagerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Track which containers are expanded in the tree (default: all expanded).
  const [collapsedContainers, setCollapsedContainers] = useState<Set<number>>(() => new Set());

  // Build parent → children map and isolate top-level OUs.
  const { topLevelOus, childrenByParent } = useMemo(() => {
    const cbp = new Map<number, WallChartOU[]>();
    for (const ou of ous) {
      const pid = (ou as WallChartOU & { parent_ou_id?: number | null }).parent_ou_id;
      if (pid == null) continue;
      const list = cbp.get(pid) ?? [];
      list.push(ou);
      cbp.set(pid, list);
    }
    const top = ous.filter(
      (o) => (o as WallChartOU & { parent_ou_id?: number | null }).parent_ou_id == null
    );
    return { topLevelOus: top, childrenByParent: cbp };
  }, [ous]);

  const hiddenCount = useMemo(() => {
    let n = 0;
    for (const ou of ous) if (hiddenOuIds.has(ou.ou_id)) n++;
    return n;
  }, [ous, hiddenOuIds]);

  const q = search.trim().toLowerCase();

  // For reordering, we work on top-level OUs only. Children always follow
  // their parent so ordering a container implicitly orders its children.
  const moveTopLevel = (index: number, dir: -1 | 1) => {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= topLevelOus.length) return;
    // Build a flat ordered id list: top-level in new order, with each
    // container's children immediately after it.
    const reordered = [...topLevelOus];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, removed);
    const ids: number[] = [];
    for (const top of reordered) {
      ids.push(top.ou_id);
      for (const child of childrenByParent.get(top.ou_id) ?? []) {
        ids.push(child.ou_id);
      }
    }
    // Append any OUs not covered (e.g. children without a visible parent).
    const seen = new Set(ids);
    for (const ou of ous) {
      if (!seen.has(ou.ou_id)) ids.push(ou.ou_id);
    }
    onReorder(ids);
  };

  if (ous.length === 0) {
    return canWrite ? (
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onOpenCreateUnit}>
        New unit
      </Button>
    ) : null;
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
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
        <PopoverContent align="start" className="w-80 max-h-[min(32rem,80vh)] flex flex-col p-0">
          {/* Header row */}
          <div className="px-3 pt-3 pb-2 space-y-2 border-b">
            <p className="text-xs text-muted-foreground">
              Visibility is stored in this browser only. Ordering is saved for everyone.
            </p>
            <Input
              placeholder="Search units…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
            />
            <div className="flex flex-wrap gap-2">
              {hiddenCount > 0 && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onShowAllHidden}>
                  Show all
                </Button>
              )}
              {canWrite && (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenCreateUnit}>
                  New unit
                </Button>
              )}
            </div>
          </div>
          {/* Scrollable tree */}
          <ul className="overflow-y-auto flex-1 p-2 space-y-0.5">
            {topLevelOus.map((ou, topIndex) => {
              const children = childrenByParent.get(ou.ou_id) ?? [];
              const isContainer = (ou as WallChartOU & { is_group_container?: boolean }).is_group_container;
              const isCollapsed = collapsedContainers.has(ou.ou_id);
              const label = ouDisplayName(ou);
              const matchesSearch = !q || label.toLowerCase().includes(q);
              const matchingChildren = children.filter((c) =>
                !q || ouDisplayName(c).toLowerCase().includes(q)
              );
              // Show row if it matches or any child matches.
              if (q && !matchesSearch && matchingChildren.length === 0) return null;

              return (
                <li key={ou.ou_id}>
                  {/* Top-level row */}
                  <div className="flex items-center gap-1.5 rounded-md bg-muted/30 border px-2 py-1.5">
                    {/* Collapse toggle for containers */}
                    {children.length > 0 ? (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setCollapsedContainers((prev) => {
                            const next = new Set(prev);
                            if (next.has(ou.ou_id)) next.delete(ou.ou_id);
                            else next.add(ou.ou_id);
                            return next;
                          })
                        }
                        aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <Checkbox
                      id={`wc-ou-vis-${ou.ou_id}`}
                      checked={!hiddenOuIds.has(ou.ou_id)}
                      onCheckedChange={() => onToggleHidden(ou.ou_id)}
                      disabled={isContainer}
                      title={isContainer ? "Group containers are always visible" : undefined}
                    />
                    <Label
                      htmlFor={`wc-ou-vis-${ou.ou_id}`}
                      className="flex-1 text-xs font-semibold truncate cursor-pointer"
                    >
                      {label}
                      {children.length > 0 && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          ({children.length})
                        </span>
                      )}
                    </Label>
                    {canWrite && !q && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={topIndex === 0}
                          onClick={() => moveTopLevel(topIndex, -1)}
                          aria-label={`Move ${label} up`}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={topIndex === topLevelOus.length - 1}
                          onClick={() => moveTopLevel(topIndex, 1)}
                          aria-label={`Move ${label} down`}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        {onDeleteUnit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => onDeleteUnit(ou)}
                            aria-label={`Delete ${label}`}
                            title="Delete unit"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Children (indented) */}
                  {!isCollapsed && (matchingChildren.length > 0 || (!q && children.length > 0)) && (
                    <ul className="ml-4 mt-0.5 space-y-0.5">
                      {(q ? matchingChildren : children).map((child) => {
                        const childLabel = ouDisplayName(child);
                        return (
                          <li
                            key={child.ou_id}
                            className="flex items-center gap-1.5 rounded-md border border-l-2 border-l-primary/30 bg-muted/10 px-2 py-1"
                          >
                            <span className="w-3.5 shrink-0" />
                            <Checkbox
                              id={`wc-ou-vis-${child.ou_id}`}
                              checked={!hiddenOuIds.has(child.ou_id)}
                              onCheckedChange={() => onToggleHidden(child.ou_id)}
                            />
                            <Label
                              htmlFor={`wc-ou-vis-${child.ou_id}`}
                              className="flex-1 text-xs truncate cursor-pointer"
                            >
                              {childLabel}
                            </Label>
                            {canWrite && onDeleteUnit && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => onDeleteUnit(child)}
                                aria-label={`Delete ${childLabel}`}
                                title="Delete unit"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
