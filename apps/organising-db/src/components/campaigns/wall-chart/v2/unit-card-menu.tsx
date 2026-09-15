"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WallChartOU } from "../types";

export type UnitCardMenuAction = "rename" | "estimate" | "assign" | "split" | "merge" | "delete";

/**
 * WP2.4 — the unit card's single ⋯ menu (wp2.4.md §3.6, MN-a): Rename, Set
 * estimate, Assign people, Split, Merge, Delete. Write-gated: a read-only
 * viewer sees no menu at all. The accessible name "Unit actions" is the
 * legacy kebab's, so the a11y inventory reads the same.
 */
export function UnitCardMenu({
  ou,
  canMerge,
  onAction,
}: {
  ou: WallChartOU;
  /** False when the unit is alone in its Group (nothing to merge with). */
  canMerge: boolean;
  onAction: (action: UnitCardMenuAction, ou: WallChartOU) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label="Unit actions"
          title="Unit actions"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAction("rename", ou)}>Rename…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("estimate", ou)}>Set estimate…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("assign", ou)}>Assign people…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAction("split", ou)}>Split…</DropdownMenuItem>
        <DropdownMenuItem disabled={!canMerge} onSelect={() => onAction("merge", ou)}>
          Merge…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => onAction("delete", ou)}>
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
