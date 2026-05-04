"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

export type UnionMembershipTypeOption = {
  union_membership_type_id: number;
  display_name: string;
  type_name: string;
};

export type NonOaUnionOptionRow = {
  non_oa_union_option_id: number;
  badge_initials: string;
  display_name: string;
};

type Props = {
  disabled?: boolean;
  membershipTypes: UnionMembershipTypeOption[];
  nonOaUnionOptions: NonOaUnionOptionRow[];
  invalidateQueryKeys?: readonly unknown[][];
  unionMembershipTypeId: number | null;
  nonOaUnionOptionId: number | null;
  onUnionMembershipChange: (id: number | null) => void;
  onNonOaUnionChange: (id: number | null) => void;
};

function membershipIdForNonOa(types: UnionMembershipTypeOption[]): number | null {
  const row = types.find((t) => t.type_name === "non_oa_member");
  return row?.union_membership_type_id ?? null;
}

export function MembershipNonOaFields({
  disabled,
  membershipTypes,
  nonOaUnionOptions,
  invalidateQueryKeys,
  unionMembershipTypeId,
  nonOaUnionOptionId,
  onUnionMembershipChange,
  onNonOaUnionChange,
}: Props) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newBadge, setNewBadge] = useState("");
  const [newName, setNewName] = useState("");

  const nonOaMembershipPk = useMemo(() => membershipIdForNonOa(membershipTypes), [membershipTypes]);
  const nonOaSelected =
    nonOaMembershipPk != null && unionMembershipTypeId === nonOaMembershipPk;

  const sortedOptions = useMemo(
    () => [...nonOaUnionOptions].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [nonOaUnionOptions],
  );

  const insertOption = useAuthAwareMutation({
    mutationFn: async () => {
      const badge = newBadge.trim().toUpperCase();
      const dn = newName.trim();
      if (!badge || !dn) throw new Error("Badge and name are required");
      const { data, error } = await supabase
        .from("non_oa_union_options")
        .insert({
          badge_initials: badge,
          display_name: dn,
          is_builtin: false,
          sort_order: 100,
        })
        .select("non_oa_union_option_id")
        .single();
      if (error) throw error;
      return data as { non_oa_union_option_id: number };
    },
    onSuccess: (row) => {
      onNonOaUnionChange(row.non_oa_union_option_id);
      setAddOpen(false);
      setNewBadge("");
      setNewName("");
      for (const key of invalidateQueryKeys ?? []) {
        void qc.invalidateQueries({ queryKey: key as unknown[] });
      }
    },
  });

  return (
    <>
      <div className="space-y-2">
        <Label>Member type</Label>
        <Select
          value={unionMembershipTypeId != null ? String(unionMembershipTypeId) : NONE}
          onValueChange={(v) => {
            const id = v === NONE ? null : Number(v);
            onUnionMembershipChange(id);
          }}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select member type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {membershipTypes.map((r) => (
              <SelectItem key={r.union_membership_type_id} value={String(r.union_membership_type_id)}>
                {r.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {nonOaSelected && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grow min-w-[12rem] space-y-2">
              <Label>Other union (non-OA)</Label>
              <Select
                value={nonOaUnionOptionId != null ? String(nonOaUnionOptionId) : NONE}
                onValueChange={(v) => {
                  onNonOaUnionChange(v === NONE ? null : Number(v));
                }}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select union" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>—</SelectItem>
                  {sortedOptions.map((o) => (
                    <SelectItem key={o.non_oa_union_option_id} value={String(o.non_oa_union_option_id)}>
                      {o.badge_initials} — {o.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!disabled && (
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                Add union…
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Shown as a initials badge on wall charts and counted by union on unit overview when set.
          </p>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add union</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="nauo-badge">Initials / badge text</Label>
              <Input
                id="nauo-badge"
                value={newBadge}
                onChange={(e) => setNewBadge(e.target.value)}
                placeholder="e.g. AIMPE"
                maxLength={32}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nauo-name">Display name</Label>
              <Input
                id="nauo-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full organisation name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={insertOption.isPending}
              onClick={() =>
                insertOption.mutate(undefined, {
                  onError: () => {},
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
          {insertOption.isError && (
            <p className="text-sm text-destructive">
              {insertOption.error instanceof Error ? insertOption.error.message : "Could not save"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
