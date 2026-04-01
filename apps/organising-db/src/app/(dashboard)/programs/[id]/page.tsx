"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type { Program, ProgramWorksite, Worksite } from "@/types/database";
import type { Database } from "@oa/db-types";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { TermHint } from "@/components/ui/term-hint";

type ProgramWithJoin = Program & {
  principal_employer?: { employer_id: number; employer_name: string } | null;
};

type ProgramWorksiteRow = ProgramWorksite & {
  worksite?: Pick<Worksite, "worksite_id" | "worksite_name" | "worksite_type" | "is_offshore" | "is_active">;
} & Record<string, unknown>;

export default function ProgramDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const programId = Number(idParam);
  const programIdValid = Number.isFinite(programId);

  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { canWrite } = useAuth();

  const [dlgLink, setDlgLink] = useState(false);
  const [selWorksiteId, setSelWorksiteId] = useState<string>("");
  const [selPrimary, setSelPrimary] = useState(false);
  const [dlgLoading, setDlgLoading] = useState(false);
  const [dlgError, setDlgError] = useState<string | null>(null);

  const {
    data: program,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["program", idParam],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select(
          "*, principal_employer:employers!principal_employer_id(employer_id, employer_name)"
        )
        .eq("program_id", programId)
        .single();
      if (error) throw error;
      return data as ProgramWithJoin;
    },
    enabled: programIdValid,
  });

  const { data: programWorksites = [] } = useQuery({
    queryKey: ["program-worksites", idParam],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_worksites")
        .select(
          "*, worksite:worksites(worksite_id, worksite_name, worksite_type, is_offshore, is_active)"
        )
        .eq("program_id", programId);
      if (error) throw error;
      return (data ?? []) as ProgramWorksiteRow[];
    },
    enabled: programIdValid,
  });

  const { data: allWorksites = [] } = useQuery({
    queryKey: ["worksites-all-for-programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .order("worksite_name");
      if (error) throw error;
      return (data ?? []) as Pick<Worksite, "worksite_id" | "worksite_name">[];
    },
  });

  const linkedWorksiteIds = useMemo(
    () => new Set(programWorksites.map((pw) => pw.worksite_id)),
    [programWorksites]
  );

  const linkOptions = useMemo(() => {
    return allWorksites
      .filter((w) => !linkedWorksiteIds.has(w.worksite_id))
      .map((w) => ({ id: String(w.worksite_id), label: w.worksite_name }));
  }, [allWorksites, linkedWorksiteIds]);

  const resetDlg = () => {
    setDlgError(null);
    setDlgLoading(false);
    setSelWorksiteId("");
    setSelPrimary(false);
  };

  const handleLinkWorksite = async () => {
    if (!selWorksiteId) return;
    setDlgLoading(true);
    setDlgError(null);

    const payload: Database["public"]["Tables"]["program_worksites"]["Insert"] = {
      program_id: programId,
      worksite_id: Number(selWorksiteId),
      is_current: true,
      is_primary: selPrimary,
    };

    const { error } = await supabase.from("program_worksites").insert(payload);
    if (error) {
      setDlgError(error.message);
      setDlgLoading(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["program-worksites", idParam] });
    setDlgLink(false);
    resetDlg();
  };

  const handleUnlinkWorksite = async (row: ProgramWorksiteRow) => {
    const { error } = await supabase
      .from("program_worksites")
      .delete()
      .eq("id", row.id);
    if (error) return;
    await queryClient.invalidateQueries({ queryKey: ["program-worksites", idParam] });
  };

  const handleTogglePrimary = async (row: ProgramWorksiteRow) => {
    const { error } = await supabase
      .from("program_worksites")
      .update({ is_primary: !row.is_primary })
      .eq("id", row.id);
    if (error) return;
    await queryClient.invalidateQueries({ queryKey: ["program-worksites", idParam] });
  };

  const columns: Column<ProgramWorksiteRow>[] = [
    {
      key: "worksite_name",
      header: "Worksite",
      render: (row) => row.worksite?.worksite_name ?? `#${row.worksite_id}`,
    },
    {
      key: "worksite_type",
      header: "Type",
      render: (row) =>
        row.worksite?.worksite_type ? (
          <Badge variant="secondary">{row.worksite.worksite_type.replace(/_/g, " ")}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "offshore",
      header: "Offshore",
      render: (row) => (
        <Badge variant={row.worksite?.is_offshore ? "info" : "secondary"}>
          {row.worksite?.is_offshore ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      key: "is_current",
      header: "Current",
      render: (row) => (
        <Badge variant={row.is_current ? "success" : "secondary"}>
          {row.is_current ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      key: "is_primary",
      header: "Primary",
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePrimary(row);
          }}
          className="inline-flex"
          disabled={!canWrite}
        >
          <Badge
            variant={row.is_primary ? "warning" : "secondary"}
            className={canWrite ? "cursor-pointer" : ""}
          >
            {row.is_primary ? "Yes" : "No"}
          </Badge>
        </button>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions" as const,
            header: "",
            sortable: false,
            render: (row: ProgramWorksiteRow) => (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnlinkWorksite(row);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ),
          },
        ]
      : []),
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !program) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">Program not found or failed to load.</p>
        <Button variant="outline" onClick={() => router.push("/programs")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Programs
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/programs")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{program.program_name}</h1>
          <p className="text-muted-foreground">
            {program.principal_employer?.employer_name
              ? `Principal employer: ${program.principal_employer.employer_name}`
              : "No principal employer set"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <TermHint
              term="Primary Worksite"
              hint="The main worksite in a program, flagged by program_worksites.is_primary."
            />
          </p>
        </div>
        <Badge variant={program.is_active ? "success" : "destructive"}>
          {program.is_active ? "Active" : "Inactive"}
        </Badge>
        <Badge variant="secondary">{program.program_status.replace(/_/g, " ")}</Badge>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          <TermHint
            term="Worksites"
            hint="All worksites linked to this program through program_worksites."
          />
        </h2>
        {canWrite && (
          <Button size="sm" onClick={() => setDlgLink(true)}>
            <Plus className="h-4 w-4" />
            Link Worksite
          </Button>
        )}
      </div>

      <DataTable
        data={programWorksites}
        columns={columns}
        searchPlaceholder="Search worksites..."
        searchKeys={["worksite_name"]}
        onRowClick={(row) =>
          row.worksite?.worksite_id
            ? router.push(`/worksites/${row.worksite.worksite_id}`)
            : undefined
        }
      />

      <Dialog
        open={dlgLink}
        onOpenChange={(o) => {
          setDlgLink(o);
          if (!o) resetDlg();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Worksite</DialogTitle>
            <DialogDescription>Add a worksite to this program.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Worksite</Label>
              <Select value={selWorksiteId} onValueChange={setSelWorksiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select worksite..." />
                </SelectTrigger>
                <SelectContent>
                  {linkOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="program-link-primary"
                type="checkbox"
                checked={selPrimary}
                onChange={(e) => setSelPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="program-link-primary">Mark as primary</Label>
            </div>

            {dlgError && <p className="text-sm text-destructive">{dlgError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgLink(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkWorksite} disabled={!selWorksiteId || dlgLoading}>
              {dlgLoading ? "Linking..." : "Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

