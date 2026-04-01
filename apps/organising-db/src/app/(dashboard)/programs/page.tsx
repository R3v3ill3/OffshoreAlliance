"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
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
import { TermHint } from "@/components/ui/term-hint";
import type { Employer, Program, ProgramStatus } from "@/types/database";
import type { Database } from "@oa/db-types";

type ProgramRow = Program & {
  principal_employer?: { employer_id: number; employer_name: string } | null;
  program_worksites?: { worksite_id: number; is_current: boolean }[];
} & Record<string, unknown>;

const PROGRAM_STATUSES: ProgramStatus[] = [
  "planning",
  "active",
  "completed",
  "on_hold",
  "cancelled",
];

const STATUS_VARIANT: Record<
  ProgramStatus,
  "secondary" | "success" | "warning" | "destructive" | "info"
> = {
  planning: "info",
  active: "success",
  completed: "secondary",
  on_hold: "warning",
  cancelled: "destructive",
};

const INITIAL_FORM = {
  program_name: "",
  principal_employer_id: "none",
  program_status: "planning" as ProgramStatus,
  start_date: "",
  expected_end_date: "",
  actual_end_date: "",
  description: "",
  notes: "",
  is_active: true,
};

export default function ProgramsPage() {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { canWrite } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select(
          `*,
           principal_employer:employers!principal_employer_id(employer_id, employer_name),
           program_worksites(worksite_id, is_current)`
        )
        .order("program_name");
      if (error) throw error;
      return (data ?? []) as unknown as ProgramRow[];
    },
  });

  const { data: principalEmployers = [] } = useQuery({
    queryKey: ["principal-employers-for-programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name, employer_category")
        .eq("employer_category", "Principal_Employer")
        .order("employer_name");
      if (error) throw error;
      return data as Pick<Employer, "employer_id" | "employer_name" | "employer_category">[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Database["public"]["Tables"]["programs"]["Insert"] = {
        program_name: form.program_name.trim(),
        program_status: form.program_status,
        is_active: form.is_active,
      };
      if (form.principal_employer_id !== "none") {
        payload.principal_employer_id = Number(form.principal_employer_id);
      }
      if (form.start_date) payload.start_date = form.start_date;
      if (form.expected_end_date) payload.expected_end_date = form.expected_end_date;
      if (form.actual_end_date) payload.actual_end_date = form.actual_end_date;
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const { error } = await supabase.from("programs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      setDialogOpen(false);
      setForm(INITIAL_FORM);
    },
  });

  const columns: Column<ProgramRow>[] = useMemo(
    () => [
      { key: "program_name", header: "Program" },
      {
        key: "principal_employer",
        header: "Principal Employer",
        render: (row) =>
          row.principal_employer?.employer_name ? (
            <Badge variant="warning">{row.principal_employer.employer_name}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "program_status",
        header: "Status",
        render: (row) => (
          <Badge variant={STATUS_VARIANT[row.program_status]}>
            {row.program_status.replace(/_/g, " ")}
          </Badge>
        ),
      },
      {
        key: "worksite_count",
        header: "Worksites",
        sortable: false,
        render: (row) => {
          const currentCount =
            row.program_worksites?.filter((pw) => pw.is_current).length ?? 0;
          return currentCount ? (
            <Badge variant="secondary">{currentCount}</Badge>
          ) : (
            <span className="text-muted-foreground">0</span>
          );
        },
      },
      {
        key: "is_active",
        header: "Active",
        render: (row) => (
          <Badge variant={row.is_active ? "success" : "destructive"}>
            {row.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          <TermHint
            term="Programs"
            hint="Multi-worksite coordination groups, usually owned by a principal employer."
          />
        </h1>
        {canWrite && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            New Program
          </Button>
        )}
      </div>

      <DataTable
        data={programs}
        columns={columns}
        loading={isLoading}
        searchPlaceholder="Search programs..."
        searchKeys={["program_name", "program_status"]}
        onRowClick={(row) => router.push(`/programs/${row.program_id}`)}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setForm(INITIAL_FORM);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Program</DialogTitle>
            <DialogDescription>
              Programs are multi-worksite groupings (top-level projects).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Program name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.program_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, program_name: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.program_status}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, program_status: v as ProgramStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRAM_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Principal employer (optional)</Label>
                <Select
                  value={form.principal_employer_id}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, principal_employer_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {principalEmployers.map((e) => (
                      <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                        {e.employer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, start_date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Expected end</Label>
                <Input
                  type="date"
                  value={form.expected_end_date}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, expected_end_date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Actual end</Label>
                <Input
                  type="date"
                  value={form.actual_end_date}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, actual_end_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="program-is-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((p) => ({ ...p, is_active: e.target.checked }))
                }
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="program-is-active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.program_name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

