"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  fetchApi,
  API_FETCH_TIMEOUT_UPLOAD_MS,
} from "@/lib/api/fetch-api";
import { matchWorksiteCandidates } from "@/lib/utils/worksite-fuzzy";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import type { Worksite } from "@/types/database";
import { WORKSITE_TYPES } from "@/types/database";
import type { MembershipImportType, ParsedMembershipRow } from "@/app/api/membership-import/parse/route";

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

interface EmployerResolution {
  rawValue: string;
  occurrences: number;
  resolvedId: number | null;
  resolvedName: string | null;
  candidates: { employer_id: number; employer_name: string; score: number }[];
  confirmed: boolean;
  search: string;
  /** When true, create a new employer on apply */
  createNew: boolean;
  newEmployerName: string;
  newTradingName: string;
  newCategory: string;
}

interface WorksiteResolution {
  rawValue: string;
  occurrences: number;
  resolvedId: number | null;
  resolvedName: string | null;
  candidates: { worksite_id: number; worksite_name: string; confidence: string }[];
  confirmed: boolean;
  search: string;
  /** When true, create a new worksite on apply */
  createNew: boolean;
  newWorksiteName: string;
  newWorksiteType: string;
}

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

interface Employer {
  employer_id: number;
  employer_name: string;
  trading_name: string | null;
}

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

const EMPLOYER_CATEGORIES = [
  { value: "Producer", label: "Producer" },
  { value: "Major_Contractor", label: "Major Contractor" },
  { value: "Subcontractor", label: "Subcontractor" },
  { value: "Labour_Hire", label: "Labour Hire" },
  { value: "Specialist", label: "Specialist" },
  { value: "Principal_Employer", label: "Principal Employer" },
];

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

function scoreEmployer(query: string, employers: Employer[]) {
  return employers
    .map((e) => {
      const score = Math.max(
        jaccardEmployer(query, e.employer_name),
        e.trading_name ? jaccardEmployer(query, e.trading_name) : 0
      );
      return { employer_id: e.employer_id, employer_name: e.employer_name, score };
    })
    .filter((c) => c.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
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
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MembershipImportWizard({
  open,
  onOpenChange,
  onComplete,
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

  // ── Result ───────────────────────────────────────────────────────────────
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // When the parsed file has any shift / work area / roster panel values,
  // the apply route can auto-create matching options on the fly. We expose
  // this as a toggle on the confirm step so admins can opt out for a
  // cautious initial import.
  const [createMissingDimensionOptions, setCreateMissingDimensionOptions] =
    useState(true);

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: employers = [] } = useQuery<Employer[]>({
    queryKey: ["employers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name, trading_name")
        .eq("is_active", true)
        .order("employer_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

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
  function getVisibleSteps(): { id: WizardStep; label: string }[] {
    return ALL_STEPS.filter((s) => {
      if (s.id === "occupation_matching" && importType === "resignations") return false;
      if (s.id === "value_mapping" && importType !== "recommencing") return false;
      return true;
    });
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  function reset() {
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
  function buildEmployerResolutions() {
    const unique = [...new Set(rows.map((r) => r.employerRaw ?? "").filter(Boolean))];
    return unique.map((raw): EmployerResolution => {
      const candidates = scoreEmployer(raw, employers);
      const top = candidates[0];
      const autoAccept = top && top.score >= 0.6;
      return {
        rawValue: raw,
        occurrences: rows.filter((r) => (r.employerRaw ?? "") === raw).length,
        resolvedId: autoAccept ? top.employer_id : null,
        resolvedName: autoAccept ? top.employer_name : null,
        candidates,
        confirmed: autoAccept,
        search: "",
        createNew: false,
        newEmployerName: raw,
        newTradingName: "",
        newCategory: "",
      };
    });
  }

  function buildWorksiteResolutions() {
    const unique = [...new Set(rows.map((r) => r.worksiteRaw ?? "").filter(Boolean))];
    return unique.map((raw): WorksiteResolution => {
      const cands = matchWorksiteCandidates(raw, worksites);
      const top = cands[0];
      const autoAccept = top?.confidence === "high";
      return {
        rawValue: raw,
        occurrences: rows.filter((r) => (r.worksiteRaw ?? "") === raw).length,
        resolvedId: autoAccept ? top.worksite.worksite_id : null,
        resolvedName: autoAccept ? top.worksite.worksite_name : null,
        candidates: cands.map((c) => ({
          worksite_id: c.worksite.worksite_id,
          worksite_name: c.worksite.worksite_name,
          confidence: c.confidence,
        })),
        confirmed: autoAccept,
        search: "",
        createNew: false,
        newWorksiteName: raw,
        newWorksiteType: "",
      };
    });
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
    return unique.map((raw): MembershipTypeResolution => {
      const lc = raw.toLowerCase().trim();
      const match = unionMembershipTypes.find(
        (t) => t.display_name.toLowerCase() === lc || t.type_name.toLowerCase() === lc
      );
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
  function proceedFromPreview() {
    setEmployerResolutions(buildEmployerResolutions());
    setStep("employer_matching");
  }

  function proceedFromEmployerMatching() {
    setWorksiteResolutions(buildWorksiteResolutions());
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
    if (importType === "recommencing") {
      setMembershipTypeResolutions(buildMembershipTypeResolutions());
      setStep("value_mapping");
    } else {
      runDedupCheck();
    }
  }

  async function runDedupCheck() {
    setIsLoading(true);
    setStep("dedup_review");

    const refIds = rows.map((r) => r.referenceId).filter((x): x is string => !!x);
    const emails = rows.map((r) => r.email).filter((x): x is string => !!x);
    const phones = rows.map((r) => r.phone).filter((x): x is string => !!x);

    const refIdMap = new Map<string, { worker_id: number; first_name: string; last_name: string; email: string | null; phone: string | null; worksite_name: string | null }>();
    const emailMap = new Map<string, typeof refIdMap extends Map<string, infer V> ? V : never>();
    const phoneMap = new Map<string, typeof refIdMap extends Map<string, infer V> ? V : never>();

    // Match by reference_id
    if (refIds.length > 0) {
      const { data } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name, email, phone, reference_id, worksite:worksites(worksite_name)")
        .in("reference_id", refIds);
      for (const w of data ?? []) {
        const ws = Array.isArray(w.worksite) ? (w.worksite[0] as { worksite_name: string } | undefined) : (w.worksite as { worksite_name: string } | null);
        refIdMap.set(w.reference_id!, {
          worker_id: w.worker_id,
          first_name: w.first_name,
          last_name: w.last_name,
          email: w.email,
          phone: w.phone,
          worksite_name: ws?.worksite_name ?? null,
        });
      }
    }

    // Match by email (for rows not matched by reference_id)
    if (emails.length > 0) {
      const { data } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name, email, phone, worksite:worksites(worksite_name)")
        .in("email", emails);
      for (const w of data ?? []) {
        if (w.email) {
          const ws = Array.isArray(w.worksite) ? (w.worksite[0] as { worksite_name: string } | undefined) : (w.worksite as { worksite_name: string } | null);
          emailMap.set(w.email, {
            worker_id: w.worker_id,
            first_name: w.first_name,
            last_name: w.last_name,
            email: w.email,
            phone: w.phone,
            worksite_name: ws?.worksite_name ?? null,
          });
        }
      }
    }

    // Match by phone (for rows not yet matched)
    if (phones.length > 0) {
      const { data } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name, email, phone, worksite:worksites(worksite_name)")
        .in("phone", phones);
      for (const w of data ?? []) {
        if (w.phone) {
          const ws = Array.isArray(w.worksite) ? (w.worksite[0] as { worksite_name: string } | undefined) : (w.worksite as { worksite_name: string } | null);
          phoneMap.set(w.phone, {
            worker_id: w.worker_id,
            first_name: w.first_name,
            last_name: w.last_name,
            email: w.email,
            phone: w.phone,
            worksite_name: ws?.worksite_name ?? null,
          });
        }
      }
    }

    const dedup: DedupRow[] = rows.map((row) => {
      const byRef = row.referenceId ? refIdMap.get(row.referenceId) : null;
      if (byRef) {
        return {
          rowIndex: row.rowIndex,
          action: "update",
          existingWorkerId: byRef.worker_id,
          matchReason: "reference_id",
          existingName: `${byRef.first_name} ${byRef.last_name}`,
          existingEmail: byRef.email,
          existingPhone: byRef.phone,
          existingWorksite: byRef.worksite_name,
        };
      }
      const byEmail = row.email ? emailMap.get(row.email) : null;
      if (byEmail) {
        return {
          rowIndex: row.rowIndex,
          action: "update",
          existingWorkerId: byEmail.worker_id,
          matchReason: "email",
          existingName: `${byEmail.first_name} ${byEmail.last_name}`,
          existingEmail: byEmail.email,
          existingPhone: byEmail.phone,
          existingWorksite: byEmail.worksite_name,
        };
      }
      const byPhone = row.phone ? phoneMap.get(row.phone) : null;
      if (byPhone) {
        return {
          rowIndex: row.rowIndex,
          action: "update",
          existingWorkerId: byPhone.worker_id,
          matchReason: "phone",
          existingName: `${byPhone.first_name} ${byPhone.last_name}`,
          existingEmail: byPhone.email,
          existingPhone: byPhone.phone,
          existingWorksite: byPhone.worksite_name,
        };
      }
      return {
        rowIndex: row.rowIndex,
        action: importType === "resignations" ? "skip" : "create",
        existingWorkerId: null,
        matchReason: null,
        existingName: null,
        existingEmail: null,
        existingPhone: null,
        existingWorksite: null,
      };
    });

    setDedupRows(dedup);
    setIsLoading(false);
  }

  // ── Apply ────────────────────────────────────────────────────────────────
  async function applyImport() {
    setIsLoading(true);

    // Build resolution maps
    const empMap = new Map(employerResolutions.map((r) => [r.rawValue, r.resolvedId]));
    const wsMap = new Map(worksiteResolutions.map((r) => [r.rawValue, r.resolvedId]));
    const occMap = new Map(occupationResolutions.map((r) => [r.rawValue, r.resolvedOccupationId]));
    const mtMap = new Map(membershipTypeResolutions.map((r) => [r.rawValue, r.resolvedId]));
    const dedupMap = new Map(dedupRows.map((d) => [d.rowIndex, d]));

    // Create new employers first
    const newEmployers = employerResolutions.filter((r) => r.createNew && r.newEmployerName.trim());
    for (const res of newEmployers) {
      const { data } = await supabase
        .from("employers")
        .insert({
          employer_name: res.newEmployerName.trim(),
          trading_name: res.newTradingName.trim() || null,
          employer_category: res.newCategory || null,
          is_active: true,
        })
        .select("employer_id, employer_name")
        .single();
      if (data) {
        empMap.set(res.rawValue, data.employer_id);
      }
    }

    // Create new worksites
    const newWorksites = worksiteResolutions.filter((r) => r.createNew && r.newWorksiteName.trim());
    for (const res of newWorksites) {
      const { data } = await supabase
        .from("worksites")
        .insert({
          worksite_name: res.newWorksiteName.trim(),
          worksite_type: res.newWorksiteType || "Other",
          is_active: true,
          is_offshore: false,
        })
        .select("worksite_id, worksite_name")
        .single();
      if (data) {
        wsMap.set(res.rawValue, data.worksite_id);
      }
    }

    // Handle "create new occupations" — create them first before bulk apply
    const newOccupations = occupationResolutions.filter((r) => r.createNew && !r.resolvedOccupationId);
    for (const res of newOccupations) {
      const { data } = await supabase
        .from("occupations")
        .insert({
          canonical_name: res.newCanonicalName.trim(),
          occupation_group_id: res.newGroupId || null,
        })
        .select("occupation_id")
        .single();
      if (data) {
        // Register raw value as an alias
        if (res.rawValue.toLowerCase() !== res.newCanonicalName.toLowerCase()) {
          const { error: aliasErr } = await supabase.from("occupation_aliases").insert({
            occupation_id: data.occupation_id,
            alias_name: res.rawValue,
            source: "import",
          });
          // Unique index is on (occupation_id, lower(trim(alias_name))); duplicates are safe to skip.
          if (aliasErr && aliasErr.code !== "23505") throw aliasErr;
        }
        occMap.set(res.rawValue, data.occupation_id);
      }
    }

    const applyRows: ApplyRow[] = rows.map((row) => {
      const dedup = dedupMap.get(row.rowIndex);
      return {
        ...row,
        resolvedEmployerId: empMap.get(row.employerRaw ?? "") ?? null,
        resolvedWorksiteId: wsMap.get(row.worksiteRaw ?? "") ?? null,
        resolvedOccupationId: row.jobTitleRaw ? (occMap.get(row.jobTitleRaw) ?? null) : null,
        resolvedMembershipTypeId: row.membershipTypeRaw ? (mtMap.get(row.membershipTypeRaw) ?? null) : null,
        dedupAction: dedup?.action ?? "create",
        existingWorkerId: dedup?.existingWorkerId ?? null,
      };
    });

    try {
      const res = await fetchApi(`/api/membership-import/apply?type=${importType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: applyRows,
          createMissingDimensionOptions,
        }),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      const json = await res.json();
      setResult({
        created: json.created ?? 0,
        updated: json.updated ?? 0,
        skipped: json.skipped ?? 0,
        errors: json.errors ?? [],
      });
      setStep("done");
      if (onComplete) onComplete();
    } catch (e) {
      setResult({
        created: 0, updated: 0, skipped: 0,
        errors: [e instanceof Error ? e.message : "Unknown error"],
      });
      setStep("done");
    } finally {
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
    ];

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select the import type, then upload the corresponding monthly membership file.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
    const typeLabels: Record<MembershipImportType, string> = {
      new_joins: "New Joins",
      resignations: "Resignations",
      recommencing: "Recommencing Members",
    };
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {rows.length} rows — {typeLabels[importType]}
            </p>
          </div>
        </div>

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
          <Button variant="outline" onClick={() => { setStep("upload"); setRows([]); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromPreview}>
            Match Employers <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Employer Matching ─────────────────────────────────────────────
  function renderEmployerMatching() {
    const allConfirmed = employerResolutions.every((r) => r.confirmed || (r.createNew && r.newEmployerName.trim().length > 0));
    const filteredEmployers = (search: string) =>
      search
        ? employers.filter((e) =>
            e.employer_name.toLowerCase().includes(search.toLowerCase()) ||
            (e.trading_name ?? "").toLowerCase().includes(search.toLowerCase())
          )
        : [];

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {employerResolutions.length} unique employer{employerResolutions.length !== 1 ? "s" : ""} found.
          Match each to an existing employer record.
        </p>
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {employerResolutions.map((res) => (
            <div key={res.rawValue} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">&ldquo;{res.rawValue}&rdquo;</p>
                  <p className="text-xs text-muted-foreground">{res.occurrences} worker{res.occurrences !== 1 ? "s" : ""}</p>
                </div>
                {res.confirmed ? (
                  <Badge variant="default" className="gap-1 shrink-0">
                    <CheckCircle2 className="h-3 w-3" />
                    {res.resolvedName ?? "No employer"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0">Needs review</Badge>
                )}
              </div>

              {res.candidates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {res.candidates.map((c) => {
                    const selected = res.confirmed && res.resolvedId === c.employer_id;
                    return (
                      <Button
                        key={c.employer_id}
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          setEmployerResolutions((prev) =>
                            prev.map((r) =>
                              r.rawValue === res.rawValue
                                ? { ...r, resolvedId: c.employer_id, resolvedName: c.employer_name, confirmed: true }
                                : r
                            )
                          )
                        }
                      >
                        {selected && <CheckCircle2 className="h-3 w-3" />}
                        {c.employer_name}
                        <span className="text-muted-foreground text-[10px]">
                          {Math.round(c.score * 100)}%
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search employers…"
                  value={res.search}
                  onChange={(e) =>
                    setEmployerResolutions((prev) =>
                      prev.map((r) => r.rawValue === res.rawValue ? { ...r, search: e.target.value } : r)
                    )
                  }
                  className="pl-8 h-8 text-sm"
                />
                {res.search && filteredEmployers(res.search).length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-md max-h-40 overflow-y-auto">
                    {filteredEmployers(res.search).map((e) => (
                      <button
                        key={e.employer_id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() =>
                          setEmployerResolutions((prev) =>
                            prev.map((r) =>
                              r.rawValue === res.rawValue
                                ? { ...r, resolvedId: e.employer_id, resolvedName: e.employer_name, confirmed: true, search: "" }
                                : r
                            )
                          )
                        }
                      >
                        {e.employer_name}
                        {e.trading_name && <span className="ml-2 text-xs text-muted-foreground">{e.trading_name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {res.createNew ? (
                <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                  <p className="text-xs font-medium">New employer</p>
                  <Input
                    placeholder="Employer name (required)"
                    value={res.newEmployerName}
                    onChange={(e) =>
                      setEmployerResolutions((prev) =>
                        prev.map((r) => r.rawValue === res.rawValue ? { ...r, newEmployerName: e.target.value } : r)
                      )
                    }
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Input
                    placeholder="Trading name (optional)"
                    value={res.newTradingName}
                    onChange={(e) =>
                      setEmployerResolutions((prev) =>
                        prev.map((r) => r.rawValue === res.rawValue ? { ...r, newTradingName: e.target.value } : r)
                      )
                    }
                    className="h-8 text-sm"
                  />
                  <Select
                    value={res.newCategory || "__none__"}
                    onValueChange={(v) =>
                      setEmployerResolutions((prev) =>
                        prev.map((r) => r.rawValue === res.rawValue ? { ...r, newCategory: v === "__none__" ? "" : v } : r)
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No category</SelectItem>
                      {EMPLOYER_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() =>
                      setEmployerResolutions((prev) =>
                        prev.map((r) => r.rawValue === res.rawValue ? { ...r, createNew: false } : r)
                      )
                    }
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant={res.confirmed && !res.resolvedId ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() =>
                      setEmployerResolutions((prev) =>
                        prev.map((r) =>
                          r.rawValue === res.rawValue
                            ? { ...r, resolvedId: null, resolvedName: null, confirmed: true, createNew: false }
                            : r
                        )
                      )
                    }
                  >
                    <X className="h-3 w-3 mr-1" />
                    No employer match
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() =>
                      setEmployerResolutions((prev) =>
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
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("preview")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromEmployerMatching} disabled={!allConfirmed}>
            Match Worksites <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Worksite Matching ─────────────────────────────────────────────
  function renderWorksiteMatching() {
    const allConfirmed = worksiteResolutions.every((r) => r.confirmed || (r.createNew && r.newWorksiteName.trim().length > 0));

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {worksiteResolutions.length} unique worksite{worksiteResolutions.length !== 1 ? "s" : ""} found.
          Confirm or override the mapping for each.
        </p>
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {worksiteResolutions.map((res) => {
            const searchResults = res.search
              ? worksites.filter((w) => w.worksite_name.toLowerCase().includes(res.search.toLowerCase()))
              : [];
            return (
              <div key={res.rawValue} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">&ldquo;{res.rawValue}&rdquo;</p>
                    <p className="text-xs text-muted-foreground">{res.occurrences} worker{res.occurrences !== 1 ? "s" : ""}</p>
                  </div>
                  {res.confirmed ? (
                    <Badge variant="default" className="gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      {res.resolvedName ?? "No worksite"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0">Needs review</Badge>
                  )}
                </div>

                {res.candidates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {res.candidates.map((c) => {
                      const selected = res.confirmed && res.resolvedId === c.worksite_id;
                      return (
                        <Button
                          key={c.worksite_id}
                          variant={selected ? "default" : "outline"}
                          size="sm"
                          className="h-8 text-xs gap-1.5"
                          onClick={() =>
                            setWorksiteResolutions((prev) =>
                              prev.map((r) =>
                                r.rawValue === res.rawValue
                                  ? { ...r, resolvedId: c.worksite_id, resolvedName: c.worksite_name, confirmed: true }
                                  : r
                              )
                            )
                          }
                        >
                          {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                          <Badge variant={c.confidence === "high" ? "default" : c.confidence === "medium" ? "secondary" : "outline"} className="text-[10px] px-1 py-0 h-4">
                            {c.confidence}
                          </Badge>
                          {c.worksite_name}
                        </Button>
                      );
                    })}
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search worksites…"
                    value={res.search}
                    onChange={(e) =>
                      setWorksiteResolutions((prev) =>
                        prev.map((r) => r.rawValue === res.rawValue ? { ...r, search: e.target.value } : r)
                      )
                    }
                    className="pl-8 h-8 text-sm"
                  />
                  {res.search && searchResults.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-md max-h-40 overflow-y-auto">
                      {searchResults.map((ws) => (
                        <button
                          key={ws.worksite_id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          onClick={() =>
                            setWorksiteResolutions((prev) =>
                              prev.map((r) =>
                                r.rawValue === res.rawValue
                                  ? { ...r, resolvedId: ws.worksite_id, resolvedName: ws.worksite_name, confirmed: true, search: "" }
                                  : r
                              )
                            )
                          }
                        >
                          {ws.worksite_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {res.createNew ? (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <p className="text-xs font-medium">New worksite</p>
                    <Input
                      placeholder="Worksite name (required)"
                      value={res.newWorksiteName}
                      onChange={(e) =>
                        setWorksiteResolutions((prev) =>
                          prev.map((r) => r.rawValue === res.rawValue ? { ...r, newWorksiteName: e.target.value } : r)
                        )
                      }
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Select
                      value={res.newWorksiteType || "__none__"}
                      onValueChange={(v) =>
                        setWorksiteResolutions((prev) =>
                          prev.map((r) => r.rawValue === res.rawValue ? { ...r, newWorksiteType: v === "__none__" ? "" : v } : r)
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Worksite type (required)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select type…</SelectItem>
                        {WORKSITE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() =>
                        setWorksiteResolutions((prev) =>
                          prev.map((r) => r.rawValue === res.rawValue ? { ...r, createNew: false } : r)
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant={res.confirmed && !res.resolvedId ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() =>
                        setWorksiteResolutions((prev) =>
                          prev.map((r) =>
                            r.rawValue === res.rawValue
                              ? { ...r, resolvedId: null, resolvedName: null, confirmed: true, createNew: false }
                              : r
                          )
                        )
                      }
                    >
                      <X className="h-3 w-3 mr-1" />
                      No worksite
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() =>
                        setWorksiteResolutions((prev) =>
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
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("employer_matching")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromWorksiteMatching} disabled={!allConfirmed}>
            {importType !== "resignations" ? "Match Occupations" : "Check Duplicates"} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Render: Occupation Matching ───────────────────────────────────────────
  function renderOccupationMatching() {
    const allConfirmed = occupationResolutions.every((r) => r.confirmed || r.createNew);

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {occupationResolutions.length} unique job title{occupationResolutions.length !== 1 ? "s" : ""} found.
          Match each to a canonical occupation, or create a new one.
        </p>
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
            {importType === "recommencing" ? "Map Membership Types" : "Check Duplicates"} <ArrowRight className="h-4 w-4 ml-1" />
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
          Map the raw Membership Type values to recognised membership types.
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

    const createCount = dedupRows.filter((d) => d.action === "create").length;
    const updateCount = dedupRows.filter((d) => d.action === "update").length;
    const skipCount = dedupRows.filter((d) => d.action === "skip").length;

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
              if (importType === "recommencing") setStep("value_mapping");
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
    const typeLabels: Record<MembershipImportType, string> = {
      new_joins: "New Joins",
      resignations: "Resignations",
      recommencing: "Recommencing Members",
    };

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
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("dedup_review")} disabled={isLoading}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={applyImport} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Import {createCount + updateCount} records
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
            </p>
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
          <Button onClick={reset}>
            Import another file
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  const typeLabels: Record<MembershipImportType, string> = {
    new_joins: "New Joins",
    resignations: "Resignations",
    recommencing: "Recommencing Members",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Monthly Membership Import
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
