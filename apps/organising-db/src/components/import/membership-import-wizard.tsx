"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  fetchApi,
  API_FETCH_TIMEOUT_UPLOAD_MS,
} from "@/lib/api/fetch-api";
import {
  distinctNameInputs,
  outcomeForRaw,
  outcomesByFold,
  requestNameResolution,
} from "@/lib/import/resolve-names-client";
import type { ResolutionOutcome } from "@/lib/import/resolve-names-types";
import { NameResolutionTable, NameReviewsLink } from "@/components/import/name-resolution-table";
import { chunkArray, fetchInChunks } from "@/lib/supabase/chunk-in-filter";
import { loadCampaignProtectedWorkerIds } from "@/lib/workers/campaign-protected-fields";
import { parseMembershipStatus } from "@/lib/workers/worker-import-membership";
import {
  MEMBERSHIP_IMPORT_TYPE_LABELS,
  WEEKLY_UPDATE_COMBINED_HEADERS,
  type MembershipImportType,
} from "@/lib/import/membership-import-types";
import {
  MEMBERSHIP_UPDATE_DEFAULT_TYPE_KEY,
  MEMBERSHIP_UPDATE_KIND_LABELS,
  computeNetMovement,
  defaultActionForUnmatched,
  type MembershipUpdateKind,
} from "@/lib/membership-updates/kinds";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Search,
  Plus,
  X,
  UserCheck,
  UserPlus,
  SkipForward,
  Users,
} from "lucide-react";
import type { ParsedMembershipRow } from "@/app/api/membership-import/parse/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep =
  | "upload"
  | "preview"
  | "employer_matching"
  | "worksite_matching"
  | "occupation_matching"
  | "value_mapping"
  | "dedup_review"
  | "confirm"
  | "done";

/** Read-only outcome of the single resolution path per distinct employer string (DA0.3). */
type EmployerResolution = ResolutionOutcome;
/** Read-only outcome of the single resolution path per distinct worksite string (DA0.3). */
type WorksiteResolution = ResolutionOutcome;


interface OccupationResolution {
  rawValue: string;
  occurrences: number;
  resolvedOccupationId: number | null;
  resolvedCanonicalName: string | null;
  candidates: { occupation_id: number; canonical_name: string }[];
  confirmed: boolean;
  createNew: boolean;
  newCanonicalName: string;
  newGroupId: number | null;
  search: string;
}

interface MembershipTypeResolution {
  rawValue: string;
  occurrences: number;
  resolvedId: number | null;
  resolvedLabel: string | null;
  confirmed: boolean;
}

type DedupAction = "create" | "update" | "skip";

interface DedupRow {
  rowIndex: number;
  action: DedupAction;
  existingWorkerId: number | null;
  matchReason: "reference_id" | "email" | "phone" | "name_employer" | null;
  existingName: string | null;
  existingEmail: string | null;
  existingPhone: string | null;
  existingWorksite: string | null;
  /** Member of a live campaign — employer / worksite / job title are protected on update. */
  inCampaign: boolean;
}

interface ApplyRow extends ParsedMembershipRow {
  resolvedEmployerId: number | null;
  resolvedWorksiteId: number | null;
  resolvedOccupationId: number | null;
  resolvedMembershipTypeId: number | null;
  dedupAction: DedupAction;
  existingWorkerId: number | null;
}

// ─── Interfaces for DB data ───────────────────────────────────────────────────

interface Occupation {
  occupation_id: number;
  canonical_name: string;
  occupation_group_id: number | null;
}

interface OccupationGroup {
  group_id: number;
  name: string;
}

interface UnionMembershipTypeRow {
  union_membership_type_id: number;
  type_name: string;
  display_name: string;
}

// ─── Fuzzy employer scoring ───────────────────────────────────────────────────

function normStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccardEmployer(a: string, b: string): number {
  const ta = new Set(normStr(a).split(" ").filter((w) => w.length >= 2));
  const tb = new Set(normStr(b).split(" ").filter((w) => w.length >= 2));
  if (ta.size === 0 && tb.size === 0) return 1;
  const intersection = new Set([...ta].filter((x) => tb.has(x)));
  const union = new Set([...ta, ...tb]);
  return intersection.size / union.size;
}

function scoreOccupation(query: string, occupations: Occupation[]) {
  return occupations
    .map((o) => ({
      occupation_id: o.occupation_id,
      canonical_name: o.canonical_name,
      score: jaccardEmployer(query, o.canonical_name),
    }))
    .filter((c) => c.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Rows per apply request. The server writes rows sequentially (one update
 * or insert each, plus the occasional lookup), so this keeps every request
 * comfortably inside the 120 s client timeout even on a slow connection.
 */
const APPLY_BATCH_SIZE = 200;

function weeklyCountsFromRows(rows: ParsedMembershipRow[]) {
  const counts = { new: 0, recommenced: 0, resigned: 0, unfinancial: 0 };
  for (const row of rows) {
    if (row.sourceKind && row.sourceKind in counts) counts[row.sourceKind] += 1;
  }
  return counts;
}

function WeeklyMovementSummary({ rows }: { rows: ParsedMembershipRow[] }) {
  const counts = weeklyCountsFromRows(rows);
  const net = computeNetMovement(counts);
  return (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
      {(["new", "recommenced", "resigned", "unfinancial"] as const).map((kind) => (
        <div key={kind} className="rounded-md border bg-background px-2 py-1.5">
          <p className="text-muted-foreground">{MEMBERSHIP_UPDATE_KIND_LABELS[kind]}</p>
          <p className="text-sm font-semibold">{counts[kind]}</p>
        </div>
      ))}
      <div className="rounded-md border bg-background px-2 py-1.5">
        <p className="text-muted-foreground">Net movement</p>
        <p className={`text-sm font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>
          {net > 0 ? `+${net}` : net}
        </p>
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const ALL_STEPS: { id: WizardStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "preview", label: "Preview" },
  { id: "employer_matching", label: "Employers" },
  { id: "worksite_matching", label: "Worksites" },
  { id: "occupation_matching", label: "Occupations" },
  { id: "value_mapping", label: "Map Values" },
  { id: "dedup_review", label: "Dedup" },
  { id: "confirm", label: "Confirm" },
  { id: "done", label: "Done" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface MembershipImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  /** Prepared weekly-update rows — skips the file-upload step. */
  preparedRows?: ParsedMembershipRow[];
  preparedHeaders?: string[];
  preparedFileName?: string;
  preparedType?: MembershipImportType;
  weeklyBatchId?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MembershipImportWizard({
  open,
  onOpenChange,
  onComplete,
  preparedRows,
  preparedHeaders,
  preparedFileName,
  preparedType,
  weeklyBatchId,
}: MembershipImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // ── Step state ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>("upload");
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── Import state ─────────────────────────────────────────────────────────
  const [importType, setImportType] = useState<MembershipImportType>("new_joins");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedMembershipRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // ── Resolution state ─────────────────────────────────────────────────────
  const [employerResolutions, setEmployerResolutions] = useState<EmployerResolution[]>([]);
  const [worksiteResolutions, setWorksiteResolutions] = useState<WorksiteResolution[]>([]);
  const [occupationResolutions, setOccupationResolutions] = useState<OccupationResolution[]>([]);
  const [membershipTypeResolutions, setMembershipTypeResolutions] = useState<MembershipTypeResolution[]>([]);
  const [dedupRows, setDedupRows] = useState<DedupRow[]>([]);
  const [dedupError, setDedupError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [protectCampaignWorkers, setProtectCampaignWorkers] = useState(true);
  const [applyProgress, setApplyProgress] = useState<{
    done: number;
    total: number;
    rowsDone: number;
    rowsTotal: number;
  } | null>(null);

  // ── Result ───────────────────────────────────────────────────────────────
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    protectedUpdates: number;
    errors: string[];
    /** Employer / worksite names queued for review on the Name Reviews page. */
    queued: number;
  } | null>(null);

  // When the parsed file has any shift / work area / roster panel values,
  // the apply route can auto-create matching options on the fly. We expose
  // this as a toggle on the confirm step so admins can opt out for a
  // cautious initial import.
  const [createMissingDimensionOptions, setCreateMissingDimensionOptions] =
    useState(true);

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: occupations = [] } = useQuery<Occupation[]>({
    queryKey: ["occupations-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupations")
        .select("occupation_id, canonical_name, occupation_group_id")
        .eq("is_active", true)
        .order("canonical_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: occupationAliases = [] } = useQuery<
    { occupation_id: number; alias_name: string }[]
  >({
    queryKey: ["occupation-aliases-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupation_aliases")
        .select("occupation_id, alias_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: occupationGroups = [] } = useQuery<OccupationGroup[]>({
    queryKey: ["occupation-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupation_groups")
        .select("group_id, name")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: unionMembershipTypes = [] } = useQuery<UnionMembershipTypeRow[]>({
    queryKey: ["union-membership-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("union_membership_types")
        .select("union_membership_type_id, type_name, display_name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  // ── Step visibility ──────────────────────────────────────────────────────
  const hasValueMapping =
    importType === "recommencing" || importType === "status_sync" || importType === "weekly_update";

  function getVisibleSteps(): { id: WizardStep; label: string }[] {
    return ALL_STEPS.filter((s) => {
      if (s.id === "upload" && (preparedRows?.length ?? 0) > 0) return false;
      if (s.id === "occupation_matching" && importType === "resignations") return false;
      if (s.id === "value_mapping" && !hasValueMapping) return false;
      return true;
    });
  }

  function hydratePrepared() {
    if (!preparedRows?.length) return false;
    setImportType(preparedType ?? "weekly_update");
    setRows(preparedRows);
    setHeaders(preparedHeaders?.length ? preparedHeaders : [...WEEKLY_UPDATE_COMBINED_HEADERS]);
    setFileName(preparedFileName ?? "Weekly update");
    setStep("preview");
    return true;
  }

  useEffect(() => {
    if (open && preparedRows?.length) hydratePrepared();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate only when a prepared batch is opened
  }, [open, preparedRows, preparedFileName, preparedType]);

  // ── Reset ────────────────────────────────────────────────────────────────
  function reset() {
    if (hydratePrepared()) {
      setIsLoading(false);
      setParseError(null);
      setEmployerResolutions([]);
      setWorksiteResolutions([]);
      setOccupationResolutions([]);
      setMembershipTypeResolutions([]);
      setDedupRows([]);
      setDedupError(null);
      setProtectCampaignWorkers(true);
      setApplyProgress(null);
      setResult(null);
      return;
    }
    setStep("upload");
    setIsLoading(false);
    setParseError(null);
    setFileName("");
    setRows([]);
    setHeaders([]);
    setEmployerResolutions([]);
    setWorksiteResolutions([]);
    setOccupationResolutions([]);
    setMembershipTypeResolutions([]);
    setDedupRows([]);
    setDedupError(null);
    setProtectCampaignWorkers(true);
    setApplyProgress(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── File handling ────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        setParseError("Only .xlsx and .xls files are supported.");
        return;
      }
      setParseError(null);
      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetchApi(`/api/membership-import/parse?type=${importType}`, {
          method: "POST",
          body: formData,
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        });
        const json = await res.json();
        if (!json.success) {
          setParseError(json.error ?? "Parse failed");
          return;
        }
        setFileName(json.fileName ?? file.name);
        setRows(json.rows);
        setHeaders(json.headers);
        setStep("preview");
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [importType]
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

  // ── Build resolutions from parsed rows ───────────────────────────────────
  // ── Resolve employer / worksite names through the single path (DA0.3) ──
  // Dry run over every distinct string in the file: nothing is written, the
  // outcomes are shown read-only on the Employers and Worksites steps, and
  // decisions are made on the Name Reviews page.
  async function resolveNamesForPreview(): Promise<boolean> {
    setResolveError(null);
    try {
      const inputs = distinctNameInputs(
        rows.map((row) => ({ employer: row.employerRaw, worksite: row.worksiteRaw }))
      );
      const resolved = await requestNameResolution({
        importType: `membership_${importType}`,
        fileName: fileName || `membership_${importType}`,
        persist: false,
        employerNames: inputs.employerNames,
        worksiteNames: inputs.worksiteNames,
        sourceContext: { weeklyBatchId: weeklyBatchId ?? null },
      });
      setEmployerResolutions(resolved.employers);
      setWorksiteResolutions(resolved.worksites);
      return true;
    } catch (error) {
      setEmployerResolutions([]);
      setWorksiteResolutions([]);
      setResolveError(
        `Could not resolve employer and worksite names: ${
          error instanceof Error ? error.message : String(error)
        }. Go back and try again.`
      );
      return false;
    }
  }

  function buildOccupationResolutions() {
    const unique = [...new Set(rows.map((r) => r.jobTitleRaw ?? "").filter(Boolean))];
    return unique.map((raw): OccupationResolution => {
      const lc = raw.toLowerCase().trim();
      // Exact match against canonical or alias
      const exactCanonical = occupations.find(
        (o) => o.canonical_name.toLowerCase() === lc
      );
      const exactAlias = occupationAliases.find(
        (a) => a.alias_name.toLowerCase() === lc
      );
      const exactOcc = exactCanonical ?? (exactAlias
        ? occupations.find((o) => o.occupation_id === exactAlias.occupation_id) ?? null
        : null);

      const candidates = exactOcc
        ? []
        : scoreOccupation(raw, occupations);

      const top = candidates[0];
      const autoAccept = !!exactOcc || (top && top.score >= 0.7);
      const resolved = exactOcc ?? (autoAccept && top ? occupations.find((o) => o.occupation_id === top.occupation_id) ?? null : null);

      return {
        rawValue: raw,
        occurrences: rows.filter((r) => (r.jobTitleRaw ?? "") === raw).length,
        resolvedOccupationId: resolved?.occupation_id ?? null,
        resolvedCanonicalName: resolved?.canonical_name ?? null,
        candidates: candidates.map((c) => ({
          occupation_id: c.occupation_id,
          canonical_name: c.canonical_name,
        })),
        confirmed: autoAccept,
        createNew: false,
        newCanonicalName: raw,
        newGroupId: null,
        search: "",
      };
    });
  }

  function buildMembershipTypeResolutions() {
    const unique = [...new Set(rows.map((r) => r.membershipTypeRaw ?? "").filter(Boolean))];
    const byTypeName = new Map(unionMembershipTypes.map((t) => [t.type_name, t]));
    return unique.map((raw): MembershipTypeResolution => {
      const lc = raw.toLowerCase().trim();
      let match = unionMembershipTypes.find(
        (t) => t.display_name.toLowerCase() === lc || t.type_name.toLowerCase() === lc
      );
      if (!match && importType === "weekly_update") {
        const kind = rows.find((r) => r.membershipTypeRaw === raw)?.sourceKind as
          | MembershipUpdateKind
          | undefined;
        const typeKey = kind ? MEMBERSHIP_UPDATE_DEFAULT_TYPE_KEY[kind] : null;
        if (typeKey) match = byTypeName.get(typeKey);
      }
      if (!match && importType === "status_sync") {
        // Account-status exports use their own vocabulary. Only the
        // unambiguous values are pre-filled; suspended / stopped-payment
        // states are left for the admin to decide.
        if (/^active$/i.test(lc)) {
          match = byTypeName.get("financial_member");
        } else {
          const parsed = parseMembershipStatus(raw);
          if (parsed.membershipKey) match = byTypeName.get(parsed.membershipKey);
        }
      }
      return {
        rawValue: raw,
        occurrences: rows.filter((r) => (r.membershipTypeRaw ?? "") === raw).length,
        resolvedId: match?.union_membership_type_id ?? null,
        resolvedLabel: match?.display_name ?? null,
        confirmed: !!match,
      };
    });
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  async function proceedFromPreview() {
    setIsLoading(true);
    try {
      await resolveNamesForPreview();
    } finally {
      setIsLoading(false);
    }
    setStep("employer_matching");
  }

  function proceedFromEmployerMatching() {
    setStep("worksite_matching");
  }

  function proceedFromWorksiteMatching() {
    if (importType !== "resignations") {
      setOccupationResolutions(buildOccupationResolutions());
      setStep("occupation_matching");
    } else {
      runDedupCheck();
    }
  }

  function proceedFromOccupationMatching() {
    if (hasValueMapping) {
      setMembershipTypeResolutions(buildMembershipTypeResolutions());
      setStep("value_mapping");
    } else {
      runDedupCheck();
    }
  }

  async function runDedupCheck() {
    setIsLoading(true);
    setDedupError(null);
    setStep("dedup_review");

    const refIds = rows.map((r) => r.referenceId).filter((x): x is string => !!x);
    const emails = rows.map((r) => r.email).filter((x): x is string => !!x);
    const phones = rows.map((r) => r.phone).filter((x): x is string => !!x);

    type ExistingWorker = {
      worker_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      reference_id?: string | null;
      worksite: unknown;
    };
    type Existing = {
      worker_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      worksite_name: string | null;
    };
    const refIdMap = new Map<string, Existing>();
    const emailMap = new Map<string, Existing>();
    const phoneMap = new Map<string, Existing>();

    function toExisting(w: ExistingWorker): Existing {
      const ws = Array.isArray(w.worksite)
        ? (w.worksite[0] as { worksite_name: string } | undefined)
        : (w.worksite as { worksite_name: string } | null);
      return {
        worker_id: w.worker_id,
        first_name: w.first_name,
        last_name: w.last_name,
        email: w.email,
        phone: w.phone,
        worksite_name: ws?.worksite_name ?? null,
      };
    }

    const select =
      "worker_id, first_name, last_name, email, phone, reference_id, worksite:worksites(worksite_name)";

    // Lookups are chunked and error-checked: one unbounded `.in()` on a
    // several-thousand-row member list would exceed the URL limit or be
    // capped by PostgREST max-rows, and a swallowed error would turn every
    // row into a create.
    try {
      if (refIds.length > 0) {
        const data = await fetchInChunks<string, ExistingWorker>(refIds, (chunk) =>
          supabase.from("workers").select(select).in("reference_id", chunk)
        );
        for (const w of data) {
          if (w.reference_id) refIdMap.set(w.reference_id, toExisting(w));
        }
      }

      // Emails are compared case-insensitively; both spellings are sent so
      // the DB filter hits whichever casing the record was saved with.
      if (emails.length > 0) {
        const variants = [...new Set(emails.flatMap((e) => [e, e.toLowerCase()]))];
        const data = await fetchInChunks<string, ExistingWorker>(variants, (chunk) =>
          supabase.from("workers").select(select).in("email", chunk)
        );
        for (const w of data) {
          if (w.email) emailMap.set(w.email.toLowerCase(), toExisting(w));
        }
      }

      if (phones.length > 0) {
        const data = await fetchInChunks<string, ExistingWorker>(phones, (chunk) =>
          supabase.from("workers").select(select).in("phone", chunk)
        );
        for (const w of data) {
          if (w.phone) phoneMap.set(w.phone, toExisting(w));
        }
      }

      const dedup: DedupRow[] = rows.map((row) => {
        const matched = (existing: Existing, matchReason: DedupRow["matchReason"]): DedupRow => ({
          rowIndex: row.rowIndex,
          action: "update",
          existingWorkerId: existing.worker_id,
          matchReason,
          existingName: `${existing.first_name} ${existing.last_name}`,
          existingEmail: existing.email,
          existingPhone: existing.phone,
          existingWorksite: existing.worksite_name,
          inCampaign: false,
        });
        const byRef = row.referenceId ? refIdMap.get(row.referenceId) : null;
        if (byRef) return matched(byRef, "reference_id");
        const byEmail = row.email ? emailMap.get(row.email.toLowerCase()) : null;
        if (byEmail) return matched(byEmail, "email");
        const byPhone = row.phone ? phoneMap.get(row.phone) : null;
        if (byPhone) return matched(byPhone, "phone");
        return {
          rowIndex: row.rowIndex,
          action:
            importType === "weekly_update" && row.sourceKind
              ? defaultActionForUnmatched(row.sourceKind)
              : importType === "resignations"
                ? "skip"
                : "create",
          existingWorkerId: null,
          matchReason: null,
          existingName: null,
          existingEmail: null,
          existingPhone: null,
          existingWorksite: null,
          inCampaign: false,
        };
      });

      const protectedIds = await loadCampaignProtectedWorkerIds(
        supabase,
        dedup.map((d) => d.existingWorkerId).filter((id): id is number => id != null)
      );
      for (const d of dedup) {
        if (d.existingWorkerId != null) d.inCampaign = protectedIds.has(d.existingWorkerId);
      }

      setDedupRows(dedup);
    } catch (error) {
      setDedupRows([]);
      setDedupError(
        `Could not check for existing workers: ${
          error instanceof Error ? error.message : String(error)
        }. Nothing has been imported — go back and try again.`
      );
    } finally {
      setIsLoading(false);
    }
  }

  // ── Apply ────────────────────────────────────────────────────────────────
  async function applyImport() {
    setIsLoading(true);

    // Build resolution maps
    const occMap = new Map(occupationResolutions.map((r) => [r.rawValue, r.resolvedOccupationId]));
    const mtMap = new Map(membershipTypeResolutions.map((r) => [r.rawValue, r.resolvedId]));
    const dedupMap = new Map(dedupRows.map((d) => [d.rowIndex, d]));

    const setupErrors: string[] = [];

    // Names are unique on occupations. "Create new"
    // for a name that already exists (typically an inactive record the
    // matching step did not list) returns 409; reuse that record instead of
    // silently leaving the workers without one.
    async function insertOrReuse(
      table: "occupations",
      idColumn: string,
      nameColumn: string,
      name: string,
      insertRow: Record<string, unknown>
    ): Promise<number | null> {
      const { data, error } = await supabase
        .from(table)
        .insert(insertRow)
        .select(idColumn)
        .single();
      if (!error && data) return Number((data as unknown as Record<string, unknown>)[idColumn]);
      if (error && error.code === "23505") {
        const { data: existing, error: lookupError } = await supabase
          .from(table)
          .select(idColumn)
          .ilike(nameColumn, name)
          .limit(1)
          .maybeSingle();
        if (!lookupError && existing) {
          return Number((existing as unknown as Record<string, unknown>)[idColumn]);
        }
        setupErrors.push(
          `${table}: "${name}" already exists but could not be looked up${
            lookupError ? ` — ${lookupError.message}` : ""
          }`
        );
        return null;
      }
      setupErrors.push(`${table}: failed to create "${name}" — ${error?.message ?? "unknown error"}`);
      return null;
    }

    // DA0.3: employer and worksite names go through the single resolution
    // path once, for the rows that will be written. This creates the file's
    // import_logs row, writes the auto aliases and the queue rows; the FKs
    // come from the outcomes (null when queued or rejected) and the raw
    // strings travel with each row. Nothing is created here.
    let importId: number | null = null;
    let queuedNames = 0;
    let empMap = new Map<string, ResolutionOutcome>();
    let wsMap = new Map<string, ResolutionOutcome>();
    try {
      const nonSkipped = rows.filter((row) => (dedupMap.get(row.rowIndex)?.action ?? "create") !== "skip");
      const inputs = distinctNameInputs(
        nonSkipped.map((row) => ({ employer: row.employerRaw, worksite: row.worksiteRaw }))
      );
      const resolved = await requestNameResolution({
        importType: `membership_${importType}`,
        fileName: fileName || `membership_${importType}`,
        persist: true,
        employerNames: inputs.employerNames,
        worksiteNames: inputs.worksiteNames,
        sourceContext: {
          weeklyBatchId: weeklyBatchId ?? null,
          sourceKinds: [
            ...new Set(nonSkipped.map((r) => r.sourceKind).filter((k): k is NonNullable<typeof k> => !!k)),
          ],
        },
      });
      importId = resolved.importId;
      queuedNames = resolved.queued;
      empMap = outcomesByFold(resolved.employers);
      wsMap = outcomesByFold(resolved.worksites);
    } catch (error) {
      setupErrors.push(`Name resolution: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Handle "create new occupations" — create them first before bulk apply
    const newOccupations = occupationResolutions.filter((r) => r.createNew && !r.resolvedOccupationId);
    for (const res of newOccupations) {
      const name = res.newCanonicalName.trim();
      const id = await insertOrReuse("occupations", "occupation_id", "canonical_name", name, {
        canonical_name: name,
        occupation_group_id: res.newGroupId || null,
      });
      if (id == null) continue;
      // Register raw value as an alias
      if (res.rawValue.toLowerCase() !== name.toLowerCase()) {
        const { error: aliasErr } = await supabase.from("occupation_aliases").insert({
          occupation_id: id,
          alias_name: res.rawValue,
          source: "import",
        });
        // Unique index is on (occupation_id, lower(trim(alias_name))); duplicates are safe to skip.
        if (aliasErr && aliasErr.code !== "23505") {
          setupErrors.push(`occupation alias "${res.rawValue}": ${aliasErr.message}`);
        }
      }
      occMap.set(res.rawValue, id);
    }

    if (setupErrors.length > 0) {
      setResult({
        created: 0,
        updated: 0,
        skipped: 0,
        protectedUpdates: 0,
        queued: 0,
        errors: [
          "Import not started — fix these before applying (no worker rows were written):",
          ...setupErrors,
        ],
      });
      setStep("done");
      setIsLoading(false);
      return;
    }

    const applyRows: ApplyRow[] = rows.map((row) => {
      const dedup = dedupMap.get(row.rowIndex);
      return {
        ...row,
        resolvedEmployerId: outcomeForRaw(empMap, row.employerRaw)?.resolvedId ?? null,
        resolvedWorksiteId: outcomeForRaw(wsMap, row.worksiteRaw)?.resolvedId ?? null,
        resolvedOccupationId: row.jobTitleRaw ? (occMap.get(row.jobTitleRaw) ?? null) : null,
        resolvedMembershipTypeId: row.membershipTypeRaw ? (mtMap.get(row.membershipTypeRaw) ?? null) : null,
        dedupAction: dedup?.action ?? "create",
        existingWorkerId: dedup?.existingWorkerId ?? null,
      };
    });

    // Rows go to the server in batches: one request for a several-thousand
    // row file outruns the client timeout, and a timed-out request reports
    // nothing even though the server may have kept writing. Each batch is
    // small enough to finish well inside the limit, and totals accumulate
    // as batches complete so a failure part-way is reported truthfully.
    const batches = chunkArray(
      applyRows.filter((r) => r.dedupAction !== "skip"),
      APPLY_BATCH_SIZE
    );
    const skippedUpFront = applyRows.length - batches.reduce((n, b) => n + b.length, 0);
    const totals = { created: 0, updated: 0, skipped: skippedUpFront, protectedUpdates: 0 };
    const errors: string[] = [];
    setApplyProgress({ done: 0, total: batches.length, rowsDone: 0, rowsTotal: applyRows.length });

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
          const res = await fetchApi(`/api/membership-import/apply?type=${importType}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: batch,
              createMissingDimensionOptions,
              protectCampaignWorkers,
              fileName,
              batchIndex: i + 1,
              batchCount: batches.length,
              importId,
            }),
            timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
          });
          const json = await res.json();
          if (!res.ok || json.success === false) {
            errors.push(
              `Batch ${i + 1}/${batches.length} failed: ${json.error ?? `HTTP ${res.status}`}`
            );
            break;
          }
          totals.created += json.created ?? 0;
          totals.updated += json.updated ?? 0;
          totals.skipped += json.skipped ?? 0;
          totals.protectedUpdates += json.protectedUpdates ?? 0;
          errors.push(...(json.errors ?? []));
          errors.push(...((json.warnings ?? []) as string[]).map((w) => `Warning (rows were written): ${w}`));
        } catch (e) {
          const isAbort = e instanceof DOMException && e.name === "AbortError";
          errors.push(
            isAbort
              ? `Batch ${i + 1}/${batches.length} timed out after ${
                  API_FETCH_TIMEOUT_UPLOAD_MS / 1000
                }s. Earlier batches were applied; check Import History before re-running (re-running is safe — matched rows update in place).`
              : `Batch ${i + 1}/${batches.length}: ${e instanceof Error ? e.message : "Unknown error"}`
          );
          break;
        }
        setApplyProgress({
          done: i + 1,
          total: batches.length,
          rowsDone: skippedUpFront + batches.slice(0, i + 1).reduce((n, b) => n + b.length, 0),
          rowsTotal: applyRows.length,
        });
      }
      if (
        weeklyBatchId &&
        (totals.created + totals.updated > 0 || errors.length === 0)
      ) {
        try {
          const completeRes = await fetchApi(`/api/membership-updates/${weeklyBatchId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "complete",
              importSummary: { ...totals, errors, fileName },
            }),
          });
          if (!completeRes.ok) {
            errors.push(
              "Rows were imported, but the weekly update could not be marked complete. Open Weekly Updates to close it."
            );
          }
        } catch {
          errors.push(
            "Rows were imported, but the weekly update could not be marked complete. Open Weekly Updates to close it."
          );
        }
      }
      setResult({ ...totals, errors, queued: queuedNames });
      setStep("done");
      if (onComplete) onComplete();
    } finally {
      setApplyProgress(null);
      setIsLoading(false);
    }
  }

  // ── Step indicator ───────────────────────────────────────────────────────
  function StepIndicator() {
    const visible = getVisibleSteps();
    const idx = visible.findIndex((s) => s.id === step);
    return (
      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {visible.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium border transition-colors ${
                i <= idx
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-muted-foreground/30"
              }`}
            >
              {i < idx ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            {i < visible.length - 1 && (
              <div className={`h-px w-5 mx-1 ${i < idx ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground font-medium">
          {visible[idx]?.label ?? ""}
        </span>
      </div>
    );
  }

  // ── Render: Upload ───────────────────────────────────────────────────────
  function renderUpload() {
    const types: { value: MembershipImportType; label: string; desc: string }[] = [
      {
        value: "new_joins",
        label: "New Joins",
        desc: "Reference ID, First/Last Name, Employer, Worksite, Job Title, Email, Phone, Joining Date, Re Joined Date",
      },
      {
        value: "resignations",
        label: "Resignations",
        desc: "Reference ID, First/Last Name, Company, Worksite, Joining Date, Resignation Date, Reason, Email, Phone",
      },
      {
        value: "recommencing",
        label: "Recommencing Members",
        desc: "Reference ID, First/Last Name, Employer, Worksite, Job Title, Membership Type, Email, Phone, Date",
      },
      {
        value: "status_sync",
        label: MEMBERSHIP_IMPORT_TYPE_LABELS.status_sync,
        desc: "Reference ID, First/Last Name, Member Account Status, Company Name, Employee Worksite, Job Title, Phone, Email. Updates membership status on every matched member; workers in campaigns keep their campaign employer, worksite and job title.",
      },
    ];

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select the import type, then upload the corresponding membership file.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {types.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setImportType(t.value)}
              className={`text-left rounded-lg border p-3 transition-colors ${
                importType === t.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-muted-foreground/30 hover:border-primary/40"
              }`}
            >
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{t.desc}</p>
            </button>
          ))}
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Drop your .xlsx file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
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
      </div>
    );
  }

  // ── Render: Preview ──────────────────────────────────────────────────────
  function renderPreview() {
    const preview = rows.slice(0, 5);
    const typeLabels = MEMBERSHIP_IMPORT_TYPE_LABELS;
    const weeklyNet =
      importType === "weekly_update" ? computeNetMovement(weeklyCountsFromRows(rows)) : null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {rows.length} rows — {typeLabels[importType]}
              {weeklyNet != null ? ` · net movement ${weeklyNet > 0 ? `+${weeklyNet}` : weeklyNet}` : ""}
            </p>
          </div>
        </div>
        {importType === "weekly_update" && <WeeklyMovementSummary rows={rows} />}

        <div className="border rounded-lg overflow-auto max-h-[260px]">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.slice(0, 6).map((h) => (
                  <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                ))}
                {headers.length > 6 && (
                  <TableHead className="text-xs text-muted-foreground">+{headers.length - 6} more</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((row) => (
                <TableRow key={row.rowIndex}>
                  <TableCell className="text-xs">{row.referenceId ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.firstName}</TableCell>
                  <TableCell className="text-xs">{row.lastName}</TableCell>
                  <TableCell className="text-xs">{row.employerRaw ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.worksiteRaw ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.email ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length > 5 && (
          <p className="text-xs text-muted-foreground">Showing first 5 of {rows.length} rows</p>
        )}

        <DialogFooter>
          {(preparedRows?.length ?? 0) === 0 && (
            <Button variant="outline" onClick={() => { setStep("upload"); setRows([]); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          <Button onClick={proceedFromPreview}>
            Match Employers <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Employer Matching ─────────────────────────────────────────────
  function renderEmployerMatching() {
    return (
      <div className="space-y-4">
        {resolveError && (
          <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{resolveError}</span>
          </div>
        )}
        <NameResolutionTable entity="employer" outcomes={employerResolutions} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("preview")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromEmployerMatching}>
            Match Worksites <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Worksite Matching (read-only outcomes; decisions on Name Reviews) ──
  function renderWorksiteMatching() {
    return (
      <div className="space-y-4">
        <NameResolutionTable entity="worksite" outcomes={worksiteResolutions} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("employer_matching")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromWorksiteMatching}>
            {importType !== "resignations" ? "Match Occupations" : "Check Duplicates"} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Occupation Matching ───────────────────────────────────────────
  function renderOccupationMatching() {
    const allConfirmed = occupationResolutions.every((r) => r.confirmed || r.createNew);

    const unresolvedOccupations = occupationResolutions.filter((r) => !r.confirmed && !r.createNew).length;

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {occupationResolutions.length} unique job title{occupationResolutions.length !== 1 ? "s" : ""} found.
            Match each to a canonical occupation, or create a new one.
            {unresolvedOccupations > 0 ? ` ${unresolvedOccupations} still need review.` : ""}
          </p>
          {unresolvedOccupations > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 shrink-0"
              onClick={() =>
                setOccupationResolutions((prev) =>
                  prev.map((r) =>
                    r.confirmed || r.createNew
                      ? r
                      : { ...r, resolvedOccupationId: null, resolvedCanonicalName: null, confirmed: true }
                  )
                )
              }
            >
              <X className="h-3 w-3 mr-1" />
              Skip {unresolvedOccupations} unmatched
            </Button>
          )}
        </div>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {occupationResolutions.map((res) => {
            const searchResults = res.search
              ? occupations.filter((o) => o.canonical_name.toLowerCase().includes(res.search.toLowerCase()))
              : [];

            return (
              <div key={res.rawValue} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">&ldquo;{res.rawValue}&rdquo;</p>
                    <p className="text-xs text-muted-foreground">{res.occurrences} worker{res.occurrences !== 1 ? "s" : ""}</p>
                  </div>
                  {(res.confirmed || res.createNew) ? (
                    <Badge variant="default" className="gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      {res.createNew ? `New: ${res.newCanonicalName}` : (res.resolvedCanonicalName ?? "No occupation")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0">Needs review</Badge>
                  )}
                </div>

                {!res.createNew && (
                  <>
                    {res.candidates.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {res.candidates.map((c) => {
                          const selected = res.confirmed && res.resolvedOccupationId === c.occupation_id;
                          return (
                            <Button
                              key={c.occupation_id}
                              variant={selected ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                setOccupationResolutions((prev) =>
                                  prev.map((r) =>
                                    r.rawValue === res.rawValue
                                      ? { ...r, resolvedOccupationId: c.occupation_id, resolvedCanonicalName: c.canonical_name, confirmed: true }
                                      : r
                                  )
                                )
                              }
                            >
                              {selected && <CheckCircle2 className="h-3 w-3 mr-1" />}
                              {c.canonical_name}
                            </Button>
                          );
                        })}
                      </div>
                    )}

                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search occupations…"
                        value={res.search}
                        onChange={(e) =>
                          setOccupationResolutions((prev) =>
                            prev.map((r) => r.rawValue === res.rawValue ? { ...r, search: e.target.value } : r)
                          )
                        }
                        className="pl-8 h-8 text-sm"
                      />
                      {res.search && searchResults.length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-md max-h-40 overflow-y-auto">
                          {searchResults.map((o) => (
                            <button
                              key={o.occupation_id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                              onClick={() =>
                                setOccupationResolutions((prev) =>
                                  prev.map((r) =>
                                    r.rawValue === res.rawValue
                                      ? { ...r, resolvedOccupationId: o.occupation_id, resolvedCanonicalName: o.canonical_name, confirmed: true, search: "" }
                                      : r
                                  )
                                )
                              }
                            >
                              {o.canonical_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant={res.confirmed && !res.resolvedOccupationId ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() =>
                          setOccupationResolutions((prev) =>
                            prev.map((r) =>
                              r.rawValue === res.rawValue
                                ? { ...r, resolvedOccupationId: null, resolvedCanonicalName: null, confirmed: true }
                                : r
                            )
                          )
                        }
                      >
                        <X className="h-3 w-3 mr-1" />
                        Skip
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() =>
                          setOccupationResolutions((prev) =>
                            prev.map((r) =>
                              r.rawValue === res.rawValue
                                ? { ...r, createNew: true, confirmed: false }
                                : r
                            )
                          )
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Create new
                      </Button>
                    </div>
                  </>
                )}

                {res.createNew && (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <p className="text-xs font-medium">New occupation</p>
                    <Input
                      placeholder="Canonical name"
                      value={res.newCanonicalName}
                      onChange={(e) =>
                        setOccupationResolutions((prev) =>
                          prev.map((r) => r.rawValue === res.rawValue ? { ...r, newCanonicalName: e.target.value } : r)
                        )
                      }
                      className="h-8 text-sm"
                    />
                    <Select
                      value={res.newGroupId ? String(res.newGroupId) : "__none__"}
                      onValueChange={(v) =>
                        setOccupationResolutions((prev) =>
                          prev.map((r) =>
                            r.rawValue === res.rawValue
                              ? { ...r, newGroupId: v !== "__none__" ? Number(v) : null }
                              : r
                          )
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Occupation group (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No group</SelectItem>
                        {occupationGroups.map((g) => (
                          <SelectItem key={g.group_id} value={String(g.group_id)}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() =>
                        setOccupationResolutions((prev) =>
                          prev.map((r) =>
                            r.rawValue === res.rawValue
                              ? { ...r, createNew: false, confirmed: false }
                              : r
                          )
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("worksite_matching")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromOccupationMatching} disabled={!allConfirmed}>
            {hasValueMapping ? "Map Membership Status" : "Check Duplicates"} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Value Mapping (Membership Type) ───────────────────────────────
  function renderValueMapping() {
    const allConfirmed = membershipTypeResolutions.every((r) => r.confirmed);
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {importType === "status_sync"
            ? "Map each Member Account Status value to a membership type. Rows mapped to “Ignore” keep the worker's current status."
            : importType === "weekly_update"
              ? "Each row's membership status comes from which weekly file it was in (New, Recommenced, Resigned, Unfinancial). Confirm the mapped type — Unfinancial defaults to On hold."
              : "Map the raw Membership Type values to recognised membership types."}
        </p>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Spreadsheet value</TableHead>
                <TableHead className="text-xs w-16 text-right">Rows</TableHead>
                <TableHead className="text-xs">Map to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membershipTypeResolutions.map((res) => (
                <TableRow key={res.rawValue} className={!res.confirmed ? "bg-amber-50" : ""}>
                  <TableCell className="p-2 text-xs font-mono">&ldquo;{res.rawValue}&rdquo;</TableCell>
                  <TableCell className="p-2 text-xs text-right text-muted-foreground">{res.occurrences}</TableCell>
                  <TableCell className="p-1.5">
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={res.confirmed ? (res.resolvedId != null ? String(res.resolvedId) : "__ignore__") : "__unset__"}
                        onValueChange={(v) => {
                          const id = v === "__ignore__" ? null : Number(v);
                          const label = v === "__ignore__" ? null : (unionMembershipTypes.find((t) => t.union_membership_type_id === id)?.display_name ?? null);
                          setMembershipTypeResolutions((prev) =>
                            prev.map((r) =>
                              r.rawValue === res.rawValue
                                ? { ...r, resolvedId: id, resolvedLabel: label, confirmed: true }
                                : r
                            )
                          );
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore__" className="text-xs text-muted-foreground">— Ignore</SelectItem>
                          {unionMembershipTypes.map((t) => (
                            <SelectItem key={t.union_membership_type_id} value={String(t.union_membership_type_id)} className="text-xs">
                              {t.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {res.confirmed
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      }
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("occupation_matching")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => runDedupCheck()} disabled={!allConfirmed}>
            Check Duplicates <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Dedup Review ──────────────────────────────────────────────────
  function renderDedupCheck() {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Checking for existing workers…</p>
        </div>
      );
    }

    if (dedupError) {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {dedupError}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (hasValueMapping) setStep("value_mapping");
                else if (importType !== "resignations") setStep("occupation_matching");
                else setStep("worksite_matching");
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => runDedupCheck()}>Retry check</Button>
          </DialogFooter>
        </div>
      );
    }

    const createCount = dedupRows.filter((d) => d.action === "create").length;
    const updateCount = dedupRows.filter((d) => d.action === "update").length;
    const skipCount = dedupRows.filter((d) => d.action === "skip").length;
    const inCampaignCount = dedupRows.filter((d) => d.action === "update" && d.inCampaign).length;

    const matchBadge = (reason: DedupRow["matchReason"]) => {
      if (!reason) return null;
      const labels: Record<string, string> = {
        reference_id: "Ref ID",
        email: "Email",
        phone: "Phone",
        name_employer: "Name",
      };
      return <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{labels[reason]}</Badge>;
    };

    return (
      <div className="space-y-4">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5"><UserPlus className="h-4 w-4 text-green-600" />{createCount} new</span>
          <span className="flex items-center gap-1.5"><UserCheck className="h-4 w-4 text-blue-600" />{updateCount} update</span>
          <span className="flex items-center gap-1.5"><SkipForward className="h-4 w-4 text-muted-foreground" />{skipCount} skip</span>
        </div>

        {inCampaignCount > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/40 text-xs">
            <Users className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{inCampaignCount}</span> of the
              matched workers {inCampaignCount === 1 ? "is" : "are"} in a live campaign. On
              update, their employer, worksite and job title are kept from the campaign;
              membership status and contact details are taken from the file.
            </p>
          </div>
        )}

        <div className="border rounded-lg overflow-auto max-h-[380px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Matched to</TableHead>
                <TableHead className="text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const dedup = dedupRows[i];
                if (!dedup) return null;
                return (
                  <TableRow key={row.rowIndex} className={dedup.matchReason ? "bg-blue-50/40" : ""}>
                    <TableCell className="p-2 text-xs">
                      {row.firstName} {row.lastName}
                      {row.referenceId && <span className="ml-2 text-muted-foreground font-mono text-[10px]">{row.referenceId}</span>}
                    </TableCell>
                    <TableCell className="p-2 text-xs">
                      {dedup.matchReason ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {matchBadge(dedup.matchReason)}
                          <span className="text-muted-foreground">{dedup.existingName}</span>
                          {dedup.inCampaign && (
                            <Badge variant="outline" className="text-[10px] px-1.5 h-4 gap-1">
                              <Users className="h-3 w-3" /> In campaign
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="p-1.5">
                      <Select
                        value={dedup.action}
                        onValueChange={(v) =>
                          setDedupRows((prev) =>
                            prev.map((d) => d.rowIndex === dedup.rowIndex ? { ...d, action: v as DedupAction } : d)
                          )
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="create" className="text-xs">Create new</SelectItem>
                          {dedup.existingWorkerId && <SelectItem value="update" className="text-xs">Update existing</SelectItem>}
                          <SelectItem value="skip" className="text-xs">Skip</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (hasValueMapping) setStep("value_mapping");
              else if (importType !== "resignations") setStep("occupation_matching");
              else setStep("worksite_matching");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep("confirm")}>
            Confirm Import <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Confirm ────────────────────────────────────────────────────────
  function renderConfirm() {
    const createCount = dedupRows.filter((d) => d.action === "create").length;
    const updateCount = dedupRows.filter((d) => d.action === "update").length;
    const skipCount = dedupRows.filter((d) => d.action === "skip").length;
    const protectedUpdateCount = dedupRows.filter(
      (d) => d.action === "update" && d.inCampaign
    ).length;
    const typeLabels = MEMBERSHIP_IMPORT_TYPE_LABELS;

    // Detect whether the file carries any shift / work area / roster panel
    // columns so we can show the "create missing options" toggle.
    const shiftCount = rows.filter((r) => !!r.shiftRaw).length;
    const workAreaCount = rows.filter((r) => !!r.workAreaRaw).length;
    const rosterCount = rows.filter((r) => !!r.rosterPanelRaw).length;
    const hasDimensions = shiftCount + workAreaCount + rosterCount > 0;
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <p className="font-medium text-sm">{typeLabels[importType]} — {fileName}</p>
          {importType === "weekly_update" && (
            <WeeklyMovementSummary rows={rows} />
          )}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="text-center p-3 rounded-md bg-green-50 border border-green-200">
              <p className="text-2xl font-bold text-green-700">{createCount}</p>
              <p className="text-xs text-green-600 mt-1">New workers</p>
            </div>
            <div className="text-center p-3 rounded-md bg-blue-50 border border-blue-200">
              <p className="text-2xl font-bold text-blue-700">{updateCount}</p>
              <p className="text-xs text-blue-600 mt-1">Updates</p>
            </div>
            <div className="text-center p-3 rounded-md bg-muted border">
              <p className="text-2xl font-bold text-muted-foreground">{skipCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Skipped</p>
            </div>
          </div>
        </div>

        {hasDimensions && (
          <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <p className="text-xs font-medium">Worker dimension columns detected</p>
            <p className="text-xs text-muted-foreground">
              {shiftCount > 0 && (
                <>
                  Shift on <strong>{shiftCount}</strong> row
                  {shiftCount === 1 ? "" : "s"}
                  {workAreaCount + rosterCount > 0 ? " · " : ""}
                </>
              )}
              {workAreaCount > 0 && (
                <>
                  Work area on <strong>{workAreaCount}</strong> row
                  {workAreaCount === 1 ? "" : "s"}
                  {rosterCount > 0 ? " · " : ""}
                </>
              )}
              {rosterCount > 0 && (
                <>
                  Roster panel on <strong>{rosterCount}</strong> row
                  {rosterCount === 1 ? "" : "s"}
                </>
              )}
            </p>
            <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={createMissingDimensionOptions}
                onChange={(e) =>
                  setCreateMissingDimensionOptions(e.target.checked)
                }
              />
              Create missing options on the fly (otherwise unmatched values
              are left blank on the worker)
            </label>
          </div>
        )}

        {updateCount > 0 && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="membership-protect-campaign-workers"
                checked={protectCampaignWorkers}
                onCheckedChange={(v) => setProtectCampaignWorkers(v === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="membership-protect-campaign-workers"
                  className="text-sm font-medium cursor-pointer"
                >
                  Keep employer, worksite and job title for workers in campaigns
                </Label>
                <p className="text-xs text-muted-foreground">
                  {protectedUpdateCount > 0 ? (
                    <>
                      <span className="font-medium text-foreground">{protectedUpdateCount}</span> of
                      the {updateCount} updates {protectedUpdateCount === 1 ? "is" : "are"} for
                      workers in a live campaign.{" "}
                    </>
                  ) : null}
                  Campaign records are more current for those fields; the file still sets
                  membership status and contact details.
                </p>
                {!protectCampaignWorkers && protectedUpdateCount > 0 && (
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Protection off: campaign
                    workers&apos; employer, worksite and job title will be overwritten by the file.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("dedup_review")} disabled={isLoading}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={applyImport} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {applyProgress
              ? `Importing… ${applyProgress.rowsDone}/${applyProgress.rowsTotal} rows (batch ${Math.min(
                  applyProgress.done + 1,
                  applyProgress.total
                )} of ${applyProgress.total})`
              : `Import ${createCount + updateCount} records`}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Done ──────────────────────────────────────────────────────────
  function renderDone() {
    if (!result) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
          <div>
            <p className="font-medium text-sm text-green-800">Import complete</p>
            <p className="text-xs text-green-700 mt-0.5">
              {result.created} created · {result.updated} updated · {result.skipped} skipped
              {result.protectedUpdates > 0
                ? ` · ${result.protectedUpdates} kept campaign employer/worksite/job title`
                : ""}
            </p>
            {result.queued > 0 && (
              <p className="mt-1 text-xs text-green-700">
                <NameReviewsLink queued={result.queued} /> — those workers were imported without the
                queued employer / worksite and are filled in when the queue is decided.
              </p>
            )}
          </div>
        </div>
        {result.errors.length > 0 && (
          <div className="rounded-md bg-destructive/10 p-3 space-y-1">
            <p className="text-xs font-medium text-destructive">Errors ({result.errors.length})</p>
            {result.errors.slice(0, 10).map((e, i) => (
              <p key={i} className="text-xs text-destructive">{e}</p>
            ))}
            {result.errors.length > 10 && (
              <p className="text-xs text-muted-foreground">…and {result.errors.length - 10} more</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Close
          </Button>
          {!weeklyBatchId && (
            <Button onClick={reset}>
              Import another file
            </Button>
          )}
        </DialogFooter>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  const typeLabels = MEMBERSHIP_IMPORT_TYPE_LABELS;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Membership Import
            {step !== "upload" && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                — {typeLabels[importType]}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {step !== "upload" && <StepIndicator />}

        {isLoading && step === "upload" ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Parsing file…</p>
          </div>
        ) : (
          <>
            {step === "upload" && renderUpload()}
            {step === "preview" && renderPreview()}
            {step === "employer_matching" && renderEmployerMatching()}
            {step === "worksite_matching" && renderWorksiteMatching()}
            {step === "occupation_matching" && renderOccupationMatching()}
            {step === "value_mapping" && renderValueMapping()}
            {step === "dedup_review" && renderDedupCheck()}
            {step === "confirm" && renderConfirm()}
            {step === "done" && renderDone()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
