"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { WorkScope } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const NONE_PARENT = "__none__";

function collectDescendantIds(rootId: number, scopes: WorkScope[]): Set<number> {
  const byParent = new Map<number | null, number[]>();
  for (const s of scopes) {
    const p = s.parent_scope_id ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(s.scope_id);
  }
  const out = new Set<number>();
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    for (const c of byParent.get(id) ?? []) stack.push(c);
  }
  return out;
}

function labelForScope(scope: WorkScope, byId: Map<number, WorkScope>): string {
  const parts: string[] = [];
  let cur: WorkScope | undefined = scope;
  while (cur) {
    parts.unshift(cur.scope_name);
    cur =
      cur.parent_scope_id != null ? byId.get(cur.parent_scope_id) : undefined;
  }
  return parts.join(" › ");
}

export type WorkScopeDefinitionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** Required when mode is "edit" */
  scope?: WorkScope | null;
  /** After create, returns new scope id (e.g. pre-fill employer add picker) */
  onCreated?: (row: { scope_id: number }) => void;
};

export function WorkScopeDefinitionDialog({
  open,
  onOpenChange,
  mode,
  scope,
  onCreated,
}: WorkScopeDefinitionDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [scopeName, setScopeName] = useState("");
  const [description, setDescription] = useState("");
  const [parentKey, setParentKey] = useState<string>(NONE_PARENT);
  const [sortOrder, setSortOrder] = useState(0);
  const [isWholeOfProject, setIsWholeOfProject] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortSuggestedRef = useRef(false);
  const prevOpenRef = useRef(false);

  const { data: allScopes = [] } = useQuery({
    queryKey: ["work-scopes-dialog-options"],
    queryFn: async () => {
      const { data, error: qError } = await supabase
        .from("work_scopes")
        .select("*")
        .order("sort_order");
      if (qError) throw qError;
      return data as WorkScope[];
    },
    enabled: open,
  });

  const excludedParentIds = useMemo(() => {
    if (mode !== "edit" || !scope) return new Set<number>();
    const next = new Set<number>([scope.scope_id]);
    for (const id of collectDescendantIds(scope.scope_id, allScopes)) {
      next.add(id);
    }
    return next;
  }, [mode, scope, allScopes]);

  const parentOptions = useMemo(() => {
    const byId = new Map(allScopes.map((s) => [s.scope_id, s]));
    return allScopes
      .filter((s) => !excludedParentIds.has(s.scope_id))
      .map((s) => ({
        scope_id: s.scope_id,
        label: labelForScope(s, byId),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allScopes, excludedParentIds]);

  useEffect(() => {
    if (!open) {
      sortSuggestedRef.current = false;
      prevOpenRef.current = false;
      return;
    }
    const justOpened = !prevOpenRef.current;
    prevOpenRef.current = true;

    const frame = requestAnimationFrame(() => {
      if (justOpened) {
        setError(null);
        if (mode === "create") {
          setScopeName("");
          setDescription("");
          setParentKey(NONE_PARENT);
          setIsWholeOfProject(false);
          setIsActive(true);
          if (allScopes.length > 0) {
            sortSuggestedRef.current = true;
            const siblings = allScopes.filter(
              (s) => s.parent_scope_id === null && s.is_active
            );
            const maxOrder = siblings.reduce(
              (m, s) => Math.max(m, s.sort_order),
              0
            );
            setSortOrder(maxOrder + 1);
          } else {
            setSortOrder(0);
          }
        } else if (mode === "edit" && scope) {
          sortSuggestedRef.current = true;
          setScopeName(scope.scope_name);
          setDescription(scope.description ?? "");
          setParentKey(
            scope.parent_scope_id != null
              ? String(scope.parent_scope_id)
              : NONE_PARENT
          );
          setSortOrder(scope.sort_order);
          setIsWholeOfProject(scope.is_whole_of_project);
          setIsActive(scope.is_active);
        }
      } else if (
        mode === "create" &&
        allScopes.length > 0 &&
        !sortSuggestedRef.current
      ) {
        sortSuggestedRef.current = true;
        const siblings = allScopes.filter(
          (s) => s.parent_scope_id === null && s.is_active
        );
        const maxOrder = siblings.reduce(
          (m, s) => Math.max(m, s.sort_order),
          0
        );
        setSortOrder(maxOrder + 1);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, mode, scope, allScopes]);

  const invalidateScopeQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work-scopes-all"] });
    await queryClient.invalidateQueries({ queryKey: ["work-scopes-browse"] });
    await queryClient.invalidateQueries({
      queryKey: ["work-scopes-dialog-options"],
    });
    await queryClient.invalidateQueries({ queryKey: ["all-employer-scopes"] });
    await queryClient.invalidateQueries({ queryKey: ["all-worksite-scopes"] });
  };

  const handleSubmit = async () => {
    const name = scopeName.trim();
    if (!name) {
      setError("Scope name is required.");
      return;
    }

    const parent_scope_id =
      parentKey === NONE_PARENT ? null : Number(parentKey);

    setSubmitting(true);
    setError(null);

    if (mode === "create") {
      const { data, error: insError } = await supabase
        .from("work_scopes")
        .insert({
          scope_name: name,
          description: description.trim() || null,
          parent_scope_id,
          sort_order: sortOrder,
          is_whole_of_project: isWholeOfProject,
          is_active: true,
        })
        .select("scope_id")
        .single();

      if (insError) {
        setError(insError.message);
        setSubmitting(false);
        return;
      }

      await invalidateScopeQueries();
      onCreated?.({ scope_id: data.scope_id });
      setSubmitting(false);
      onOpenChange(false);
      return;
    }

    if (!scope) {
      setSubmitting(false);
      return;
    }

    const { error: updError } = await supabase
      .from("work_scopes")
      .update({
        scope_name: name,
        description: description.trim() || null,
        parent_scope_id,
        sort_order: sortOrder,
        is_whole_of_project: isWholeOfProject,
        is_active: isActive,
      })
      .eq("scope_id", scope.scope_id);

    if (updError) {
      setError(updError.message);
      setSubmitting(false);
      return;
    }

    await invalidateScopeQueries();
    setSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add work scope" : "Edit work scope"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a new entry in the scope hierarchy (e.g. Drilling — onshore vs offshore as separate scopes)."
              : "Update this scope. Deactivating hides it from browse and employer pickers but keeps existing links."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Scope name</Label>
            <Input
              id="ws-name"
              value={scopeName}
              onChange={(e) => setScopeName(e.target.value)}
              placeholder="e.g. Drilling — onshore"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ws-desc">Description (optional)</Label>
            <Textarea
              id="ws-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Short note for admins"
            />
          </div>

          <div className="space-y-2">
            <Label>Parent scope</Label>
            <Select value={parentKey} onValueChange={setParentKey}>
              <SelectTrigger>
                <SelectValue placeholder="Top level (no parent)" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE_PARENT}>Top level (no parent)</SelectItem>
                {parentOptions.map((opt) => (
                  <SelectItem
                    key={opt.scope_id}
                    value={String(opt.scope_id)}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ws-sort">Sort order</Label>
            <Input
              id="ws-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded border-input"
              checked={isWholeOfProject}
              onChange={(e) => setIsWholeOfProject(e.target.checked)}
            />
            <span>
              Whole-of-project scope (excluded from employer “add scope”
              picker)
            </span>
          </label>

          {mode === "edit" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Active (inactive scopes are hidden from browse and pickers)</span>
            </label>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? "Saving…"
              : mode === "create"
                ? "Create scope"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
