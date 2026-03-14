"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { matchWorksiteCandidates } from "@/lib/utils/worksite-fuzzy";
import type { WorksiteCandidate } from "@/lib/utils/worksite-fuzzy";
import type { ParsedWorkerRow, ParsedWorkerGroup } from "@/app/api/worker-import/parse/route";
import type { WorkerImportRow } from "@/app/api/worker-import/apply/route";
import type { Worksite } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Search,
  X,
  AlertTriangle,
  Users,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type WizardStep =
  | "upload"
  | "worksite_matching"
  | "row_review"
  | "dedup_check"
  | "confirm"
  | "done";

interface WorksiteResolution {
  groupName: string;
  worksiteId: number | null;
  worksiteName: string | null;
  candidates: WorksiteCandidate[];
  confirmed: boolean;
}

interface ReviewRow extends ParsedWorkerRow {
  groupName: string;
  resolvedWorksiteId: number | null;
  resolvedWorksiteName: string | null;
  // Overrides
  overrideFirstName?: string;
  overrideLastName?: string;
  overridePhone?: string;
  overrideEmail?: string;
  overrideMemberRoleTypeId?: number | null;
}

interface DedupMatch {
  rowIndex: number;
  existingWorkerId: number;
  existingFirstName: string;
  existingLastName: string;
  existingEmail: string | null;
  existingPhone: string | null;
  existingWorksiteName: string | null;
  matchedOn: "email" | "phone";
  action: "update" | "skip" | "create";
}

interface MemberRoleType {
  role_type_id: number;
  role_name: string;
  display_name: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "worksite_matching", label: "Worksite Matching" },
  { id: "row_review", label: "Row Review" },
  { id: "dedup_check", label: "Dedup Check" },
  { id: "confirm", label: "Confirm" },
  { id: "done", label: "Done" },
];

const STEP_INDEX: Record<WizardStep, number> = {
  upload: 0,
  worksite_matching: 1,
  row_review: 2,
  dedup_check: 3,
  confirm: 4,
  done: 5,
};

function confidenceBadgeVariant(
  confidence: "high" | "medium" | "low"
): "default" | "secondary" | "destructive" | "outline" {
  if (confidence === "high") return "default";
  if (confidence === "medium") return "secondary";
  return "outline";
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface WorkerImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function WorkerImportWizard({
  open,
  onOpenChange,
  onComplete,
}: WorkerImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>("upload");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [groups, setGroups] = useState<ParsedWorkerGroup[]>([]);
  const [worksiteResolutions, setWorksiteResolutions] = useState<WorksiteResolution[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [dedupMatches, setDedupMatches] = useState<DedupMatch[]>([]);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [worksiteSearch, setWorksiteSearch] = useState<Record<string, string>>({});

  // Load worksites and member role types from Supabase
  const supabase = createClient();

  const { data: worksites = [] } = useQuery<Worksite[]>({
    queryKey: ["worksites-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("*")
        .order("worksite_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: memberRoleTypes = [] } = useQuery<MemberRoleType[]>({
    queryKey: ["member-role-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_role_types")
        .select("role_type_id, role_name, display_name")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function reset() {
    setStep("upload");
    setIsLoading(false);
    setFileName("");
    setGroups([]);
    setWorksiteResolutions([]);
    setReviewRows([]);
    setDedupMatches([]);
    setResult(null);
    setParseError(null);
    setWorksiteSearch({});
  }

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        setParseError("Only .xlsx and .xls files are supported.");
        return;
      }
      setParseError(null);
      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/worker-import/parse", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!json.success) {
          setParseError(json.error ?? "Parse failed");
          return;
        }

        setFileName(json.fileName);
        setGroups(json.groups);

        // Build worksite resolutions with fuzzy matching
        const resolutions: WorksiteResolution[] = json.groups.map(
          (g: ParsedWorkerGroup) => {
            const candidates = matchWorksiteCandidates(g.groupName, worksites);
            const topCandidate = candidates[0];
            const autoAccept = topCandidate?.confidence === "high";
            return {
              groupName: g.groupName,
              worksiteId: autoAccept ? topCandidate.worksite.worksite_id : null,
              worksiteName: autoAccept ? topCandidate.worksite.worksite_name : null,
              candidates,
              confirmed: autoAccept,
            };
          }
        );
        setWorksiteResolutions(resolutions);
        setStep("worksite_matching");
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [worksites]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  function resolveWorksite(groupName: string, worksite: Worksite | null) {
    setWorksiteResolutions((prev) =>
      prev.map((r) =>
        r.groupName === groupName
          ? {
              ...r,
              worksiteId: worksite?.worksite_id ?? null,
              worksiteName: worksite?.worksite_name ?? null,
              confirmed: true,
            }
          : r
      )
    );
  }

  function proceedToRowReview() {
    // Flatten all groups into review rows with worksite resolution applied
    const resolutionMap = new Map(
      worksiteResolutions.map((r) => [r.groupName, r])
    );

    const rows: ReviewRow[] = groups.flatMap((g) => {
      const resolution = resolutionMap.get(g.groupName);
      return g.rows.map((row) => ({
        ...row,
        groupName: g.groupName,
        resolvedWorksiteId: resolution?.worksiteId ?? null,
        resolvedWorksiteName: resolution?.worksiteName ?? null,
      }));
    });
    setReviewRows(rows);
    setStep("row_review");
  }

  async function proceedToDedupCheck() {
    setIsLoading(true);
    setStep("dedup_check");

    // Collect unique emails and phones from review rows
    const emails = reviewRows
      .map((r) => r.overrideEmail ?? r.email)
      .filter((e): e is string => !!e);
    const phones = reviewRows
      .map((r) => r.overridePhone ?? r.phone)
      .filter((p): p is string => !!p);

    const matches: DedupMatch[] = [];

    if (emails.length > 0) {
      const { data: emailMatches } = await supabase
        .from("workers")
        .select(
          "worker_id, first_name, last_name, email, phone, worksite:worksites(worksite_name)"
        )
        .in("email", emails);

      for (const existing of emailMatches ?? []) {
        const row = reviewRows.find(
          (r) => (r.overrideEmail ?? r.email) === existing.email
        );
        if (row) {
          const worksiteRaw = existing.worksite as unknown;
          const worksite = Array.isArray(worksiteRaw)
            ? (worksiteRaw[0] as { worksite_name: string } | undefined) ?? null
            : (worksiteRaw as { worksite_name: string } | null);
          matches.push({
            rowIndex: row.rowIndex,
            existingWorkerId: existing.worker_id,
            existingFirstName: existing.first_name,
            existingLastName: existing.last_name,
            existingEmail: existing.email,
            existingPhone: existing.phone,
            existingWorksiteName: worksite?.worksite_name ?? null,
            matchedOn: "email",
            action: "update",
          });
        }
      }
    }

    if (phones.length > 0) {
      const matchedRowIndices = new Set(matches.map((m) => m.rowIndex));
      const { data: phoneMatches } = await supabase
        .from("workers")
        .select(
          "worker_id, first_name, last_name, email, phone, worksite:worksites(worksite_name)"
        )
        .in("phone", phones);

      for (const existing of phoneMatches ?? []) {
        const row = reviewRows.find(
          (r) =>
            !matchedRowIndices.has(r.rowIndex) &&
            (r.overridePhone ?? r.phone) === existing.phone
        );
        if (row) {
          const worksiteRaw = existing.worksite as unknown;
          const worksite = Array.isArray(worksiteRaw)
            ? (worksiteRaw[0] as { worksite_name: string } | undefined) ?? null
            : (worksiteRaw as { worksite_name: string } | null);
          matches.push({
            rowIndex: row.rowIndex,
            existingWorkerId: existing.worker_id,
            existingFirstName: existing.first_name,
            existingLastName: existing.last_name,
            existingEmail: existing.email,
            existingPhone: existing.phone,
            existingWorksiteName: worksite?.worksite_name ?? null,
            matchedOn: "phone",
            action: "update",
          });
        }
      }
    }

    setDedupMatches(matches);
    setIsLoading(false);
  }

  function updateDedupAction(rowIndex: number, action: DedupMatch["action"]) {
    setDedupMatches((prev) =>
      prev.map((m) => (m.rowIndex === rowIndex ? { ...m, action } : m))
    );
  }

  async function applyImport() {
    setIsLoading(true);
    const dedupMap = new Map(dedupMatches.map((m) => [m.rowIndex, m]));

    const rows: WorkerImportRow[] = reviewRows.map((row) => {
      const dedup = dedupMap.get(row.rowIndex);
      let action: WorkerImportRow["action"] = "create";
      let existingWorkerId: number | undefined;

      if (dedup) {
        action = dedup.action;
        if (dedup.action === "update") existingWorkerId = dedup.existingWorkerId;
      }

      return {
        rowIndex: row.rowIndex,
        firstName: row.overrideFirstName ?? row.firstName,
        lastName: row.overrideLastName ?? row.lastName,
        email: row.overrideEmail ?? row.email,
        phone: row.overridePhone ?? row.phone,
        memberRoleTypeId: row.overrideMemberRoleTypeId !== undefined
          ? row.overrideMemberRoleTypeId
          : row.memberRoleTypeId,
        unionId: row.unionId,
        resignationDate: row.resignationDate,
        worksiteId: row.resolvedWorksiteId,
        rawMembershipStatus: row.rawMembershipStatus,
        notes: null,
        action,
        existingWorkerId,
      };
    });

    try {
      const res = await fetch("/api/worker-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, rows }),
      });
      const json = await res.json();
      setResult({
        created: json.created ?? 0,
        updated: json.updated ?? 0,
        skipped: json.skipped ?? 0,
        errors: json.errors ?? [],
      });
      setStep("done");
    } catch (e) {
      setResult({
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : "Unknown error"],
      });
      setStep("done");
    } finally {
      setIsLoading(false);
    }
  }

  function updateReviewRow(rowIndex: number, patch: Partial<ReviewRow>) {
    setReviewRows((prev) =>
      prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r))
    );
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const currentStepIndex = STEP_INDEX[step];

  function StepIndicator() {
    return (
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium border transition-colors ${
                i < currentStepIndex
                  ? "bg-primary text-primary-foreground border-primary"
                  : i === currentStepIndex
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-muted-foreground/30"
              }`}
            >
              {i < currentStepIndex ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-8 mx-1 ${
                  i < currentStepIndex ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
        <span className="ml-3 text-sm text-muted-foreground font-medium">
          {STEPS[currentStepIndex].label}
        </span>
      </div>
    );
  }

  // ─── Step renderers ────────────────────────────────────────────────────────

  function renderUpload() {
    return (
      <div className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Drop your .xlsx file here</p>
          <p className="text-xs text-muted-foreground mt-1">
            or click to browse — supports ESS/Woodside crew list format
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
        {parseError && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {parseError}
          </div>
        )}
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Expected format:</p>
          <p>• Worksite group names appear as rows with only the first column filled</p>
          <p>• Columns: Name | Membership Status | Phone | Email</p>
          <p>• Name can be &quot;LASTNAME, Firstname&quot; or &quot;Firstname Lastname&quot;</p>
        </div>
      </div>
    );
  }

  function renderWorksiteMatching() {
    const allConfirmed = worksiteResolutions.every((r) => r.confirmed);
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {worksiteResolutions.length} worksite group{worksiteResolutions.length !== 1 ? "s" : ""} detected.
          Confirm or override the worksite mapping for each group.
        </p>
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {worksiteResolutions.map((resolution) => {
            const group = groups.find((g) => g.groupName === resolution.groupName);
            const searchTerm = worksiteSearch[resolution.groupName] ?? "";
            const filteredWorksites = searchTerm
              ? worksites.filter((ws) =>
                  ws.worksite_name.toLowerCase().includes(searchTerm.toLowerCase())
                )
              : [];

            return (
              <div
                key={resolution.groupName}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{resolution.groupName}</p>
                    <p className="text-xs text-muted-foreground">
                      {group?.rows.length ?? 0} worker{(group?.rows.length ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {resolution.confirmed ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {resolution.worksiteName ?? "No Worksite"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Needs Review</Badge>
                  )}
                </div>

                {/* Fuzzy match candidates */}
                {resolution.candidates.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Suggested matches:</p>
                    <div className="flex flex-wrap gap-2">
                      {resolution.candidates.map((c) => (
                        <button
                          key={c.worksite.worksite_id}
                          onClick={() => resolveWorksite(resolution.groupName, c.worksite)}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:bg-accent transition-colors"
                        >
                          <Badge
                            variant={confidenceBadgeVariant(c.confidence)}
                            className="text-[10px] px-1 py-0 h-4"
                          >
                            {c.confidence}
                          </Badge>
                          {c.worksite.worksite_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search worksites..."
                    value={searchTerm}
                    onChange={(e) =>
                      setWorksiteSearch((prev) => ({
                        ...prev,
                        [resolution.groupName]: e.target.value,
                      }))
                    }
                    className="pl-8 h-8 text-sm"
                  />
                  {searchTerm && filteredWorksites.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-md max-h-40 overflow-y-auto">
                      {filteredWorksites.map((ws) => (
                        <button
                          key={ws.worksite_id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            resolveWorksite(resolution.groupName, ws);
                            setWorksiteSearch((prev) => ({
                              ...prev,
                              [resolution.groupName]: "",
                            }));
                          }}
                        >
                          {ws.worksite_name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {ws.worksite_type}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {resolution.worksiteId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setWorksiteResolutions((prev) =>
                          prev.map((r) =>
                            r.groupName === resolution.groupName
                              ? { ...r, worksiteId: null, worksiteName: null, confirmed: true }
                              : r
                          )
                        )
                      }
                      className="text-xs h-7"
                    >
                      <X className="h-3 w-3 mr-1" />
                      No Worksite
                    </Button>
                  )}
                  {!resolution.confirmed && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setWorksiteResolutions((prev) =>
                          prev.map((r) =>
                            r.groupName === resolution.groupName
                              ? { ...r, confirmed: true }
                              : r
                          )
                        )
                      }
                      className="text-xs h-7"
                    >
                      Skip (no worksite)
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("upload")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedToRowReview} disabled={!allConfirmed}>
            Review Rows <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderRowReview() {
    const warningCount = reviewRows.filter((r) => r.parseWarnings.length > 0).length;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {reviewRows.length} workers parsed.
            {warningCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                {warningCount} row{warningCount !== 1 ? "s" : ""} with warnings.
              </span>
            )}
          </p>
        </div>

        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">First Name</TableHead>
                <TableHead className="text-xs">Last Name</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Role Type</TableHead>
                <TableHead className="text-xs">Worksite</TableHead>
                <TableHead className="text-xs w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviewRows.map((row) => (
                <TableRow
                  key={row.rowIndex}
                  className={row.parseWarnings.length > 0 ? "bg-amber-50" : ""}
                >
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideFirstName ?? row.firstName}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideFirstName: e.target.value,
                        })
                      }
                      className="h-7 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideLastName ?? row.lastName}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideLastName: e.target.value,
                        })
                      }
                      className="h-7 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overridePhone ?? row.phone ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overridePhone: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideEmail ?? row.email ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideEmail: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Select
                      value={
                        String(
                          row.overrideMemberRoleTypeId !== undefined
                            ? row.overrideMemberRoleTypeId
                            : row.memberRoleTypeId ?? ""
                        )
                      }
                      onValueChange={(v) =>
                        updateReviewRow(row.rowIndex, {
                          overrideMemberRoleTypeId: v ? Number(v) : null,
                        })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">—</SelectItem>
                        {memberRoleTypes.map((rt) => (
                          <SelectItem key={rt.role_type_id} value={String(rt.role_type_id)}>
                            {rt.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1 text-xs text-muted-foreground whitespace-nowrap">
                    {row.resolvedWorksiteName ?? "—"}
                  </TableCell>
                  <TableCell className="p-1">
                    {row.parseWarnings.length > 0 && (
                      <span title={row.parseWarnings.join("\n")}>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("worksite_matching")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedToDedupCheck}>
            Check for Duplicates <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderDedupCheck() {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Checking for existing workers…</p>
        </div>
      );
    }

    const rowMap = new Map(reviewRows.map((r) => [r.rowIndex, r]));

    if (dedupMatches.length === 0) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">No duplicates found</p>
              <p className="text-xs text-muted-foreground">
                All {reviewRows.length} workers will be created as new records.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("row_review")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => setStep("confirm")}>
              Proceed to Confirm <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </DialogFooter>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {dedupMatches.length} potential duplicate{dedupMatches.length !== 1 ? "s" : ""} found.
          Choose how to handle each match.
        </p>

        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {dedupMatches.map((match) => {
            const importRow = rowMap.get(match.rowIndex);
            if (!importRow) return null;

            return (
              <div key={match.rowIndex} className="border rounded-lg p-4">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    Matched on <span className="font-medium text-foreground">{match.matchedOn}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs mb-3">
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                      Importing
                    </p>
                    <p className="font-medium">
                      {importRow.overrideFirstName ?? importRow.firstName}{" "}
                      {importRow.overrideLastName ?? importRow.lastName}
                    </p>
                    <p className="text-muted-foreground">{importRow.overrideEmail ?? importRow.email ?? "—"}</p>
                    <p className="text-muted-foreground">{importRow.overridePhone ?? importRow.phone ?? "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                      Existing (#{match.existingWorkerId})
                    </p>
                    <p className="font-medium">
                      {match.existingFirstName} {match.existingLastName}
                    </p>
                    <p className="text-muted-foreground">{match.existingEmail ?? "—"}</p>
                    <p className="text-muted-foreground">{match.existingPhone ?? "—"}</p>
                    {match.existingWorksiteName && (
                      <p className="text-muted-foreground">{match.existingWorksiteName}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {(["update", "skip", "create"] as DedupMatch["action"][]).map((action) => (
                    <Button
                      key={action}
                      variant={match.action === action ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7 capitalize"
                      onClick={() => updateDedupAction(match.rowIndex, action)}
                    >
                      {action === "update"
                        ? "Update Existing"
                        : action === "skip"
                          ? "Skip"
                          : "Import as New"}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("row_review")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep("confirm")}>
            Proceed to Confirm <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderConfirm() {
    const dedupMap = new Map(dedupMatches.map((m) => [m.rowIndex, m]));
    let toCreate = 0;
    let toUpdate = 0;
    let toSkip = 0;

    for (const row of reviewRows) {
      const dedup = dedupMap.get(row.rowIndex);
      if (!dedup) { toCreate++; continue; }
      if (dedup.action === "update") toUpdate++;
      else if (dedup.action === "skip") toSkip++;
      else toCreate++;
    }

    const worksiteSummary = worksiteResolutions.filter((r) => r.worksiteId);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "To Create", value: toCreate, color: "text-green-600" },
            { label: "To Update", value: toUpdate, color: "text-blue-600" },
            { label: "To Skip", value: toSkip, color: "text-muted-foreground" },
          ].map(({ label, value, color }) => (
            <div key={label} className="border rounded-lg p-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {worksiteSummary.length > 0 && (
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Worksite Assignments</p>
            {worksiteSummary.map((r) => {
              const count = groups.find((g) => g.groupName === r.groupName)?.rows.length ?? 0;
              return (
                <div key={r.groupName} className="flex justify-between text-xs">
                  <span className="font-medium">{r.groupName}</span>
                  <span className="text-muted-foreground">
                    → {r.worksiteName} ({count} workers)
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          This action will be logged to Import History.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("dedup_check")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={applyImport} disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Applying…</>
            ) : (
              <>Apply Import <ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderDone() {
    if (!result) return null;
    const hasErrors = result.errors.length > 0;
    return (
      <div className="space-y-4">
        <div className={`flex items-center gap-3 p-4 rounded-lg ${hasErrors ? "bg-amber-50" : "bg-green-50"}`}>
          {hasErrors ? (
            <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
          )}
          <div>
            <p className="font-medium text-sm">
              {hasErrors ? "Import completed with errors" : "Import successful"}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.created} created · {result.updated} updated · {result.skipped} skipped
            </p>
          </div>
        </div>

        {hasErrors && (
          <div className="border rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-destructive">Errors:</p>
            {result.errors.map((err, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {err}
              </p>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
            }}
          >
            Import Another File
          </Button>
          <Button
            onClick={() => {
              onComplete?.();
              onOpenChange(false);
              reset();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Worker Import Wizard
          </DialogTitle>
          <DialogDescription>
            Import workers from an xlsx spreadsheet with automatic worksite matching and deduplication.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        {isLoading && step === "upload" ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Parsing spreadsheet…</p>
          </div>
        ) : (
          <>
            {step === "upload" && renderUpload()}
            {step === "worksite_matching" && renderWorksiteMatching()}
            {step === "row_review" && renderRowReview()}
            {step === "dedup_check" && renderDedupCheck()}
            {step === "confirm" && renderConfirm()}
            {step === "done" && renderDone()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
