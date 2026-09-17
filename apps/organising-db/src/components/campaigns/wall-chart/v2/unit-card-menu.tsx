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
 *
 * WP2.4c (wp2.4c.md §3.8, SP-a): a nested card passes `canSplit={false}` and
 * shows no Split… item — an item that can never succeed is not offered.
 */
export function UnitCardMenu({
  ou,
  canMerge,
  canSplit = true,
  onAction,
}: {
  ou: WallChartOU;
  /** False when the unit is alone in its Group (nothing to merge with). */
  canMerge: boolean;
  /**
   * WP2.4c (wp2.4c.md §3.8, SP-a): false on a NESTED card — a split there
   * would create a grandchild under a plain root, which the depth trigger
   * refuses, so the item is not offered at all. Default true, so every
   * WP2.4 caller is unchanged.
   */
  canSplit?: boolean;
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
        {canSplit && (
          <DropdownMenuItem onSelect={() => onAction("split", ou)}>Split…</DropdownMenuItem>
        )}
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
