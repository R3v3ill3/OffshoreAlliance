"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type DimensionTable =
  | "worker_shift_options"
  | "worker_work_area_options"
  | "worker_roster_panel_options";

interface OptionRow {
  id: number;
  name: string;
  is_active: boolean;
  sort_order: number;
  employer_id: number | null;
  worksite_id: number | null;
}

interface DimensionEditorProps {
  table: DimensionTable;
  title: string;
  description: string;
  /** Worker FK column on the workers table — used when warning the admin
   *  about delete impact. */
  workerFkColumn: "shift_id" | "work_area_id" | "roster_panel_id";
}

/**
 * CRUD UI for a single worker_*_options table. Three of these are
 * embedded in the administration page. Each list supports inline create,
 * rename, sort-order change, active toggle and soft delete.
 */
function DimensionEditor({
  table,
  title,
  description,
  workerFkColumn,
}: DimensionEditorProps) {
  const supabase = createClient();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OptionRow | null>(null);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);

  const queryKey = useMemo(() => ["admin-worker-dimension", table], [table]);

  const { data: options = [], isLoading } = useQuery<OptionRow[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id, name, is_active, sort_order, employer_id, worksite_id")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OptionRow[];
    },
  });

  function reset() {
    setEditing(null);
    setName("");
    setSortOrder(0);
    setIsActive(true);
  }

  const upsertMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      if (editing) {
        const { error } = await supabase
          .from(table)
          .update({
            name: trimmed,
            sort_order: sortOrder,
            is_active: isActive,
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert({
          name: trimmed,
          sort_order: sortOrder,
          is_active: isActive,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setOpen(false);
      reset();
    },
  });

  const deleteMutation = useAuthAwareMutation({
    mutationFn: async (id: number) => {
      // First null any worker FKs pointing at this option so the delete
      // never trips the ON DELETE SET NULL silently — admins should see
      // the impact in the affected count above.
      await supabase
        .from("workers")
        .update({ [workerFkColumn]: null })
        .eq(workerFkColumn, id);
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : options.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No options yet.</p>
        ) : (
          <ul className="divide-y">
            {options.map((opt) => (
              <li
                key={opt.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{opt.name}</span>
                  {!opt.is_active && (
                    <Badge variant="outline" className="text-[10px]">
                      inactive
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    #{opt.id}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="Edit"
                    onClick={() => {
                      setEditing(opt);
                      setName(opt.name);
                      setSortOrder(opt.sort_order ?? 0);
                      setIsActive(opt.is_active);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${opt.name}"? Any workers currently assigned to this option will have their ${workerFkColumn.replace(/_/g, " ")} cleared.`
                        )
                      ) {
                        deleteMutation.mutate(opt.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit option" : "Add option"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Rename or change the sort order / active state of this option."
                : "Add a new option that can be assigned to workers via the import or worker form."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Day shift, Night shift, 2/2 panel A"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={String(sortOrder)}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={isActive}
                onCheckedChange={(v) => setIsActive(!!v)}
              />
              Active (shown in worker form / import mapping)
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => upsertMutation.mutate()}
              disabled={upsertMutation.isPending || name.trim().length === 0}
            >
              {upsertMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Three-column reference data tab covering the typed worker dimensions
 * introduced alongside OU sub-units: shift, work area, and roster panel.
 */
export function WorkerDimensionsTab() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Worker dimensions</h2>
        <p className="text-sm text-muted-foreground">
          Reusable shift, work-area and roster-panel labels. These power the
          typed dropdowns on workers, the filters in the campaign list builder,
          and the dimension picker on the &ldquo;Split into sub-units&rdquo;
          dialog. Existing values are preserved when an option is renamed.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DimensionEditor
          table="worker_shift_options"
          title="Shifts"
          description="e.g. Day, Night, Swing, 12hr A, 12hr B."
          workerFkColumn="shift_id"
        />
        <DimensionEditor
          table="worker_work_area_options"
          title="Work areas"
          description="e.g. Drilling, Production, Maintenance, Catering."
          workerFkColumn="work_area_id"
        />
        <DimensionEditor
          table="worker_roster_panel_options"
          title="Roster panels"
          description="e.g. 2/2 Panel A, 4/4 Panel B, FIFO Roster 1."
          workerFkColumn="roster_panel_id"
        />
      </div>
    </div>
  );
}
