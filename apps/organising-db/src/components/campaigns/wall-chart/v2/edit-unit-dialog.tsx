"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { structureApi, type UnitPatch } from "@/lib/campaign/structure-api";
import { structureErrorMessage } from "@/lib/campaign/structure-error-message";
import { ouDisplayName, type WallChartOU } from "../types";

export type EditUnitField = "name" | "estimate";

/**
 * WP2.4 (MN-a, wp2.4.md §3.6) — Rename… / Set estimate… from the card's ⋯
 * menu: one `units.update({ ouId, patch: { name } | { total_workers_estimated } })`
 * (both keys are in `structure_unit_update`'s whitelist), the units query
 * invalidated on success, a refusal toasted through `structureErrorMessage`.
 * The parent re-mounts the dialog via `key` per (unit, field), so the initial
 * value is read from props once.
 */
export function EditUnitDialog({
  open,
  onOpenChange,
  campaignId,
  ou,
  field,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  ou: WallChartOU;
  field: EditUnitField;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(
    field === "name" ? (ou.name ?? "") : ou.total_workers_estimated != null ? String(ou.total_workers_estimated) : ""
  );

  const patch: UnitPatch | null =
    field === "name"
      ? value.trim()
        ? { name: value.trim() }
        : null
      : value.trim() === ""
        ? { total_workers_estimated: null }
        : /^\d+$/.test(value.trim())
          ? { total_workers_estimated: Number(value.trim()) }
          : null;

  const save = useAuthAwareMutation({
    mutationFn: async (p: UnitPatch) => {
      await structureApi(supabase).units.update({ campaignId: Number(campaignId), ouId: ou.ou_id, patch: p });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error(structureErrorMessage(e, field === "name" ? "Renaming the Unit failed." : "Saving the estimate failed.")),
  });

  const title = field === "name" ? "Rename Unit" : "Set estimate";
  const inputId = `edit-unit-${ou.ou_id}-${field}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {field === "name"
              ? `A new name for ${ouDisplayName(ou)}.`
              : `How many workers ${ouDisplayName(ou)} is expected to hold; unfilled slots show as grey cells. Leave blank for no estimate.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (patch && !save.isPending) save.mutate(patch);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={inputId} className="text-xs">
              {field === "name" ? "Name" : "Estimated workers"}
            </Label>
            <Input
              id={inputId}
              autoFocus
              value={value}
              inputMode={field === "estimate" ? "numeric" : undefined}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patch || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
