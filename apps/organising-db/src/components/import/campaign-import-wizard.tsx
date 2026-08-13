"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { excludeSmsEpisodes } from "@/lib/campaign/visible-campaigns";
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS, API_FETCH_TIMEOUT_STREAM_MS } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Building2,
  Ship,
  Users,
  X,
} from "lucide-react";
import { WORKSITE_TYPES } from "@/types/database";
import {
  autoMapCampaignHeader,
  CAMPAIGN_MAPPABLE_FIELDS,
  type CampaignMappableField,
  type CampaignAnalyseResponse,
  type EmployerProposal,
  type VesselProposal,
  type CampaignImportApplyResponse,
  type CampaignImportWorkerRow,
} from "@/lib/import/campaign-import-shared";

// ─── Types ───────────────────────────────────────────────────────────────────

type WizardStep =
  | "campaign"
  | "upload"
  | "column_mapping"
  | "status_mapping"
  | "employer_match"
  | "vessel_match"
  | "occupation_match"
  | "dedup"
  | "ou_build"
  | "review"
  | "done";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "campaign", label: "Campaign" },
  { id: "upload", label: "Upload" },
  { id: "column_mapping", label: "Columns" },
  { id: "status_mapping", label: "Status" },
  { id: "employer_match", label: "Employers" },
  { id: "vessel_match", label: "Vessels" },
  { id: "occupation_match", label: "Occupations" },
  { id: "dedup", label: "Dedup" },
  { id: "ou_build", label: "Units" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const MERGE_PREFIX = "merge::";
const EMPLOYER_CATEGORIES = ["Producer", "Major_Contractor", "Subcontractor", "Labour_Hire", "Specialist"];

interface ColumnMapping {
  header: string;
  field: CampaignMappableField;
}

interface WorkerRow {
  rowIndex: number;
  referenceId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  rawStatus: string;
  rawOccupation: string | null;
  companyName: string;
  worksiteRaw: string;
  notes: string | null;
  employerKey: string;
  vesselKey: string;
}

interface EmployerResolution {
  key: string;
  canonicalName: string;
  variants: string[];
  count: number;
  action: "match" | "create";
  matchedEmployerId: number | null;
  newCategory: string | null;
  mergeIntoKey: string | null;
  confidence: string;
}

interface VesselResolution {
  key: string;
  employerKey: string;
  canonicalName: string;
  variants: string[];
  count: number;
  isGeneric: boolean;
  action: "match" | "create" | "unspecified";
  matchedWorksiteId: number | null;
  newWorksiteType: string;
  mergeIntoKey: string | null;
  confidence: string;
}

interface OccupationResolution {
  rawValue: string;
  count: number;
  action: "match" | "create" | "skip";
  matchedOccupationId: number | null;
  createName: string | null;
}

interface StatusResolution {
  rawValue: string;
  count: number;
  membershipTypeId: number | null;
}

interface DedupMatch {
  rowIndex: number;
  existingWorkerId: number;
  existingName: string;
  matchedOn: "reference_id" | "email" | "phone";
  action: "update" | "skip" | "create";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseName(raw: string): { firstName: string; lastName: string; preferredName: string | null } {
  const trimmed = raw.trim();
  const nick = trimmed.match(/\(([^)]+)\)/);
  const preferredName = nick ? nick[1].trim() : null;
  const cleaned = trimmed.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (cleaned.includes(",")) {
    const [last, first] = cleaned.split(",", 2);
    return { firstName: (first ?? "").trim(), lastName: last.trim(), preferredName };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return { firstName: cleaned, lastName: "", preferredName };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1], preferredName };
}

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 11 && digits.startsWith("61")) return `0${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith("610")) return `0${digits.slice(3)}`;
  return raw.trim();
}

function confidenceBadge(c: string): "default" | "secondary" | "outline" {
  if (c === "high") return "default";
  if (c === "medium") return "secondary";
  return "outline";
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CampaignImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function CampaignImportWizard({ open, onOpenChange, onComplete }: CampaignImportWizardProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>("campaign");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Campaign target
  const [campaignMode, setCampaignMode] = useState<"existing" | "new">("existing");
  const [existingCampaignId, setExistingCampaignId] = useState<number | null>(null);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignType, setNewCampaignType] = useState("organising");
  const [newCampaignStatus, setNewCampaignStatus] = useState("planning");
  const [newCampaignOrganiserId, setNewCampaignOrganiserId] = useState<number | null>(null);

  // Upload
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [headerRows, setHeaderRows] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // Derived worker rows + analysis
  const [workerRows, setWorkerRows] = useState<WorkerRow[]>([]);
  const [employerResolutions, setEmployerResolutions] = useState<EmployerResolution[]>([]);
  const [vesselResolutions, setVesselResolutions] = useState<VesselResolution[]>([]);
  const [occupationResolutions, setOccupationResolutions] = useState<OccupationResolution[]>([]);
  const [statusResolutions, setStatusResolutions] = useState<StatusResolution[]>([]);
  const [dedupMatches, setDedupMatches] = useState<DedupMatch[]>([]);

  // OU build
  const [buildOus, setBuildOus] = useState(true);
  const [listName, setListName] = useState("");

  const [result, setResult] = useState<CampaignImportApplyResponse | null>(null);

  // ── Reference data ────────────────────────────────────────────────────────
  const { data: campaigns = [] } = useQuery({
    queryKey: ["cil-campaigns"],
    queryFn: async () => {
      const { data } = await excludeSmsEpisodes(
        supabase.from("campaigns").select("campaign_id, name").order("created_at", { ascending: false })
      );
      return (data ?? []) as { campaign_id: number; name: string }[];
    },
    enabled: open,
  });
  const { data: organisers = [] } = useQuery({
    queryKey: ["cil-organisers"],
    queryFn: async () => {
      const { data } = await supabase.from("organisers").select("organiser_id, organiser_name").eq("is_active", true).order("organiser_name");
      return (data ?? []) as { organiser_id: number; organiser_name: string }[];
    },
    enabled: open,
  });
  const { data: dbEmployers = [] } = useQuery({
    queryKey: ["cil-employers"],
    queryFn: async () => {
      const { data } = await supabase.from("employers").select("employer_id, employer_name").order("employer_name");
      return (data ?? []) as { employer_id: number; employer_name: string }[];
    },
    enabled: open,
  });
  const { data: dbWorksites = [] } = useQuery({
    queryKey: ["cil-worksites"],
    queryFn: async () => {
      const { data } = await supabase.from("worksites").select("worksite_id, worksite_name").order("worksite_name");
      return (data ?? []) as { worksite_id: number; worksite_name: string }[];
    },
    enabled: open,
  });
  const { data: dbOccupations = [] } = useQuery({
    queryKey: ["cil-occupations"],
    queryFn: async () => {
      const { data } = await supabase.from("occupations").select("occupation_id, canonical_name").eq("is_active", true).order("canonical_name");
      return (data ?? []) as { occupation_id: number; canonical_name: string }[];
    },
    enabled: open,
  });
  const { data: membershipTypes = [] } = useQuery({
    queryKey: ["cil-membership-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("union_membership_types")
        .select("union_membership_type_id, type_name, display_name")
        .eq("is_active", true)
        .order("sort_order");
      return (data ?? []) as { union_membership_type_id: number; type_name: string; display_name: string }[];
    },
    enabled: open,
  });

  const membershipIdByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of membershipTypes) m.set(t.type_name, t.union_membership_type_id);
    return m;
  }, [membershipTypes]);

  // ── Reset ───────────────────────────────────────────────────────────────
  function reset() {
    setStep("campaign");
    setIsLoading(false);
    setError(null);
    setDragOver(false);
    setCampaignMode("existing");
    setExistingCampaignId(null);
    setNewCampaignName("");
    setNewCampaignType("organising");
    setNewCampaignStatus("planning");
    setNewCampaignOrganiserId(null);
    setFileNames([]);
    setHeaderRows([]);
    setColumnMappings([]);
    setWorkerRows([]);
    setEmployerResolutions([]);
    setVesselResolutions([]);
    setOccupationResolutions([]);
    setStatusResolutions([]);
    setDedupMatches([]);
    setBuildOus(true);
    setListName("");
    setResult(null);
  }

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  // ── File upload (multi-file, header format) ───────────────────────────────
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
    if (list.length === 0) {
      setError("Only .xlsx and .xls files are supported.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const allRows: Record<string, string>[] = [];
      let headerSet: string[] = [];
      const names: string[] = [];
      for (const file of list) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetchApi("/api/worker-import/parse?forceFormat=header", {
          method: "POST",
          body: formData,
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        });
        const json = await res.json();
        if (!json.success || json.format !== "header") {
          setError(json.error ?? `Could not read ${file.name} as a column-based spreadsheet`);
          setIsLoading(false);
          return;
        }
        if (headerSet.length === 0) headerSet = json.headers;
        allRows.push(...json.rows);
        names.push(json.fileName);
      }
      setFileNames(names);
      setHeaderRows(allRows);
      setColumnMappings(headerSet.map((h) => ({ header: h, field: autoMapCampaignHeader(h) })));
      setStep("column_mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Build worker rows from mappings + run analyse ─────────────────────────
  function buildWorkerRows(): WorkerRow[] {
    const col = (f: CampaignMappableField) => columnMappings.find((m) => m.field === f)?.header ?? "";
    const refCol = col("reference_id");
    const firstCol = col("first_name");
    const lastCol = col("last_name");
    const fullCol = col("full_name");
    const companyCol = col("company_name");
    const worksiteCol = col("worksite");
    const occCol = col("occupation");
    const statusCol = col("membership_status");
    const phoneCol = col("phone");
    const emailCol = col("email");
    const notesCol = col("notes");

    return headerRows
      .map((row, i): WorkerRow => {
        let firstName = "";
        let lastName = "";
        let preferredName: string | null = null;
        if (fullCol) {
          const p = parseName(String(row[fullCol] ?? "").trim());
          firstName = p.firstName;
          lastName = p.lastName;
          preferredName = p.preferredName;
        } else {
          firstName = String(row[firstCol] ?? "").trim();
          lastName = String(row[lastCol] ?? "").trim();
        }
        const phoneRaw = phoneCol ? String(row[phoneCol] ?? "").trim() : "";
        return {
          rowIndex: i,
          referenceId: refCol ? String(row[refCol] ?? "").trim() || null : null,
          firstName,
          lastName,
          preferredName,
          email: emailCol ? String(row[emailCol] ?? "").trim() || null : null,
          phone: normalisePhone(phoneRaw),
          rawStatus: statusCol ? String(row[statusCol] ?? "").trim() : "",
          rawOccupation: occCol ? String(row[occCol] ?? "").trim() || null : null,
          companyName: companyCol ? String(row[companyCol] ?? "").trim() : "",
          worksiteRaw: worksiteCol ? String(row[worksiteCol] ?? "").trim() : "",
          notes: notesCol ? String(row[notesCol] ?? "").trim() || null : null,
          employerKey: "",
          vesselKey: "",
        };
      })
      .filter((r) => r.firstName || r.lastName);
  }

  async function proceedFromColumns() {
    const hasCompany = columnMappings.some((m) => m.field === "company_name");
    const hasName = columnMappings.some((m) => m.field === "full_name") ||
      (columnMappings.some((m) => m.field === "first_name") && columnMappings.some((m) => m.field === "last_name"));
    if (!hasCompany) {
      setError("Map a column to ‘Company Name’ so employers and vessels can be matched.");
      return;
    }
    if (!hasName) {
      setError("Map either a Full Name column, or both First Name and Last Name.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const rows = buildWorkerRows();
      const occCounts = new Map<string, number>();
      const statusCounts = new Map<string, number>();
      for (const r of rows) {
        if (r.rawOccupation) occCounts.set(r.rawOccupation, (occCounts.get(r.rawOccupation) ?? 0) + 1);
        if (r.rawStatus) statusCounts.set(r.rawStatus, (statusCounts.get(r.rawStatus) ?? 0) + 1);
      }
      const res = await fetchApi("/api/campaign-import/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rows.map((r) => ({ companyName: r.companyName, worksite: r.worksiteRaw })),
          occupationValues: [...occCounts].map(([value, count]) => ({ value, count })),
          statusValues: [...statusCounts].map(([value, count]) => ({ value, count })),
        }),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      const json = (await res.json()) as CampaignAnalyseResponse | { error: string };
      if (!("success" in json)) {
        setError(json.error ?? "Analysis failed");
        setIsLoading(false);
        return;
      }

      // Attach cluster keys to worker rows.
      const withKeys = rows.map((r, i) => ({
        ...r,
        employerKey: json.rowAssignments[i]?.employerKey ?? "",
        vesselKey: json.rowAssignments[i]?.vesselKey ?? "",
      }));
      setWorkerRows(withKeys);

      setEmployerResolutions(
        json.employers.map((e: EmployerProposal) => ({
          key: e.key,
          canonicalName: e.canonicalName,
          variants: e.variants,
          count: e.count,
          action: e.match.isNew ? "create" : "match",
          matchedEmployerId: e.match.matchedId,
          newCategory: null,
          mergeIntoKey: null,
          confidence: e.match.confidence,
        }))
      );
      setVesselResolutions(
        json.employers.flatMap((e: EmployerProposal) =>
          e.vessels.map((v: VesselProposal) => ({
            key: v.key,
            employerKey: e.key,
            canonicalName: v.canonicalName,
            variants: v.variants,
            count: v.count,
            isGeneric: v.isGeneric,
            action: v.isGeneric ? "unspecified" : v.match.isNew ? "create" : "match",
            matchedWorksiteId: v.match.matchedId,
            newWorksiteType: "Other",
            mergeIntoKey: null,
            confidence: v.match.confidence,
          }))
        )
      );
      setOccupationResolutions(
        json.occupations.map((o) => ({
          rawValue: o.rawValue,
          count: o.count,
          action: o.matchedOccupationId ? "match" : "create",
          matchedOccupationId: o.matchedOccupationId,
          createName: o.createName,
        }))
      );
      setStatusResolutions(
        json.statuses.map((s) => ({
          rawValue: s.rawValue,
          count: s.count,
          membershipTypeId: s.membershipKey ? membershipIdByKey.get(s.membershipKey) ?? null : null,
        }))
      );

      const target = campaignMode === "existing"
        ? campaigns.find((c) => c.campaign_id === existingCampaignId)?.name
        : newCampaignName;
      if (!listName) setListName(`${target ?? "Imported"} — ${fileNames[0] ?? "list"}`.slice(0, 200));

      setStep(statusResolutions.length > 0 || statusCounts.size > 0 ? "status_mapping" : "employer_match");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Dedup ─────────────────────────────────────────────────────────────────
  async function runDedup() {
    setIsLoading(true);
    setStep("dedup");
    const refIds = workerRows.map((r) => r.referenceId).filter((x): x is string => !!x);
    const emails = workerRows.map((r) => r.email).filter((x): x is string => !!x);
    const phones = workerRows.map((r) => r.phone).filter((x): x is string => !!x);
    const matches: DedupMatch[] = [];
    const seen = new Set<number>();

    async function lookup(column: "reference_id" | "email" | "phone", values: string[]) {
      if (values.length === 0) return;
      const { data } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name, reference_id, email, phone")
        .in(column, [...new Set(values)]);
      for (const w of data ?? []) {
        const row = workerRows.find((r) => {
          if (seen.has(r.rowIndex)) return false;
          if (column === "reference_id") return r.referenceId === w.reference_id;
          if (column === "email") return r.email === w.email;
          return r.phone === w.phone;
        });
        if (row) {
          seen.add(row.rowIndex);
          matches.push({
            rowIndex: row.rowIndex,
            existingWorkerId: w.worker_id,
            existingName: `${w.first_name} ${w.last_name}`.trim(),
            matchedOn: column,
            action: "update",
          });
        }
      }
    }
    await lookup("reference_id", refIds);
    await lookup("email", emails);
    await lookup("phone", phones);
    setDedupMatches(matches);
    setIsLoading(false);
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  async function applyImport() {
    setIsLoading(true);
    setError(null);
    const dedupByRow = new Map(dedupMatches.map((m) => [m.rowIndex, m]));
    const rows: CampaignImportWorkerRow[] = workerRows.map((r) => {
      const d = dedupByRow.get(r.rowIndex);
      return {
        rowIndex: r.rowIndex,
        referenceId: r.referenceId,
        firstName: r.firstName,
        lastName: r.lastName,
        preferredName: r.preferredName,
        email: r.email,
        phone: r.phone,
        rawStatus: r.rawStatus,
        rawOccupation: r.rawOccupation,
        notes: r.notes,
        employerKey: r.employerKey,
        vesselKey: r.vesselKey,
        action: d ? d.action : "create",
        existingWorkerId: d && d.action === "update" ? d.existingWorkerId : undefined,
      };
    });

    try {
      const res = await fetchApi("/api/campaign-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: fileNames.join(", "),
          campaignId: campaignMode === "existing" ? existingCampaignId : null,
          newCampaign:
            campaignMode === "new"
              ? {
                  name: newCampaignName.trim(),
                  campaign_type: newCampaignType,
                  status: newCampaignStatus,
                  organiser_id: newCampaignOrganiserId,
                }
              : null,
          buildOus,
          listName,
          employers: employerResolutions.map((e) => ({
            key: e.key,
            canonicalName: e.canonicalName,
            variants: e.variants,
            action: e.action,
            matchedEmployerId: e.matchedEmployerId,
            newCategory: e.newCategory,
            mergeIntoKey: e.mergeIntoKey,
          })),
          vessels: vesselResolutions.map((v) => ({
            key: v.key,
            employerKey: v.employerKey,
            canonicalName: v.canonicalName,
            variants: v.variants,
            isGeneric: v.isGeneric,
            action: v.action,
            matchedWorksiteId: v.matchedWorksiteId,
            newWorksiteType: v.newWorksiteType,
            mergeIntoKey: v.mergeIntoKey,
          })),
          occupations: occupationResolutions.map((o) => ({
            rawValue: o.rawValue,
            action: o.action,
            matchedOccupationId: o.matchedOccupationId,
            createName: o.createName,
          })),
          statuses: statusResolutions.map((s) => ({ rawValue: s.rawValue, membershipTypeId: s.membershipTypeId })),
          rows,
        }),
        timeoutMs: API_FETCH_TIMEOUT_STREAM_MS,
      });
      const json = (await res.json().catch(() => null)) as
        | CampaignImportApplyResponse
        | { error?: string }
        | null;
      if (!json || typeof json !== "object") {
        setError("The server returned an unexpected response. Please try again.");
        setIsLoading(false);
        return;
      }
      if ("error" in json && json.error) {
        setError(String(json.error));
        setIsLoading(false);
        return;
      }
      if (!("stats" in json)) {
        setError(
          "The import didn’t complete — the server returned no result (it may have timed out or run low on memory). Try splitting the file into smaller imports."
        );
        setIsLoading(false);
        return;
      }
      setResult(json as CampaignImportApplyResponse);
      setStep("done");
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const currentIndex = STEPS.findIndex((s) => s.id === step);

  function StepIndicator() {
    return (
      <div className="flex items-center gap-0.5 mb-4 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-medium border ${
                i <= currentIndex ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-muted-foreground/30"
              }`}
            >
              {i < currentIndex ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-px w-3 mx-0.5 ${i < currentIndex ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground font-medium">{STEPS[currentIndex]?.label}</span>
      </div>
    );
  }

  const vesselsByEmployer = useMemo(() => {
    const m = new Map<string, VesselResolution[]>();
    for (const v of vesselResolutions) {
      if (!m.has(v.employerKey)) m.set(v.employerKey, []);
      m.get(v.employerKey)!.push(v);
    }
    return m;
  }, [vesselResolutions]);

  const employerNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employerResolutions) m.set(e.key, e.canonicalName);
    return m;
  }, [employerResolutions]);

  const vesselLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vesselResolutions) {
      const emp = employerNameByKey.get(v.employerKey) ?? "";
      m.set(v.key, emp ? `${emp} · ${v.canonicalName}` : v.canonicalName);
    }
    return m;
  }, [vesselResolutions, employerNameByKey]);

  const vesselByKeyMap = useMemo(() => {
    const m = new Map<string, VesselResolution>();
    for (const v of vesselResolutions) m.set(v.key, v);
    return m;
  }, [vesselResolutions]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import campaign lists</DialogTitle>
          <DialogDescription>
            Upload member lists, match employers and vessels, then build organising units in one flow.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm mb-3">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}

        {/* ── Campaign ── */}
        {step === "campaign" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={campaignMode === "existing" ? "default" : "outline"} size="sm" onClick={() => setCampaignMode("existing")}>
                Existing campaign
              </Button>
              <Button variant={campaignMode === "new" ? "default" : "outline"} size="sm" onClick={() => setCampaignMode("new")}>
                New campaign
              </Button>
            </div>
            {campaignMode === "existing" ? (
              <div className="space-y-2">
                <Label className="text-xs">Select a campaign to import into</Label>
                <Select value={existingCampaignId ? String(existingCampaignId) : ""} onValueChange={(v) => setExistingCampaignId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Choose campaign…" /></SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.campaign_id} value={String(c.campaign_id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Campaign name</Label>
                  <Input value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="e.g. Offshore Deck & Engine 2026" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={newCampaignType} onValueChange={setNewCampaignType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["organising", "bargaining", "mobilisation", "political"].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={newCampaignStatus} onValueChange={setNewCampaignStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["planning", "active", "completed", "suspended"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Organiser (optional)</Label>
                  <Select value={newCampaignOrganiserId ? String(newCampaignOrganiserId) : ""} onValueChange={(v) => setNewCampaignOrganiserId(v ? Number(v) : null)}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {organisers.map((o) => (
                        <SelectItem key={o.organiser_id} value={String(o.organiser_id)}>{o.organiser_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                onClick={() => { setError(null); setStep("upload"); }}
                disabled={campaignMode === "existing" ? !existingCampaignId : !newCampaignName.trim()}
              >
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Upload ── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              {isLoading ? <Loader2 className="mx-auto h-12 w-12 text-muted-foreground mb-3 animate-spin" /> : <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-3" />}
              <p className="text-sm font-medium">Drop one or more member-list .xlsx files</p>
              <p className="text-xs text-muted-foreground mt-1">
                Expected columns: Reference ID, First/Last Name, Member Account Status, Company Name, Worksite, Job Title, Phone, Email
              </p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }} />
            </div>
            {fileNames.length > 0 && (
              <p className="text-xs text-muted-foreground">{fileNames.length} file(s): {fileNames.join(", ")}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("campaign")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Column mapping ── */}
        {step === "column_mapping" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{headerRows.length} rows. Map each column to a field.</p>
            <div className="border rounded-lg overflow-auto max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Column</TableHead>
                    <TableHead className="text-xs">Sample</TableHead>
                    <TableHead className="text-xs w-[260px]">Maps to</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnMappings.map((m, idx) => (
                    <TableRow key={m.header}>
                      <TableCell className="p-2 text-xs font-medium">{m.header}</TableCell>
                      <TableCell className="p-2 text-xs text-muted-foreground truncate max-w-[200px]">
                        {headerRows[0]?.[m.header] ?? ""}
                      </TableCell>
                      <TableCell className="p-2">
                        <Select
                          value={m.field}
                          onValueChange={(v) =>
                            setColumnMappings((prev) => prev.map((x, i) => (i === idx ? { ...x, field: v as CampaignMappableField } : x)))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CAMPAIGN_MAPPABLE_FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={proceedFromColumns} disabled={isLoading}>
                {isLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analysing…</> : <>Next <ArrowRight className="h-4 w-4 ml-1" /></>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Status mapping ── */}
        {step === "status_mapping" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Map each account status to an OA membership type. The original text is saved on each worker’s notes.</p>
            <div className="border rounded-lg overflow-auto max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Account status</TableHead>
                    <TableHead className="text-xs w-16">Rows</TableHead>
                    <TableHead className="text-xs w-[260px]">Membership type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statusResolutions.map((s, idx) => (
                    <TableRow key={s.rawValue} className={s.membershipTypeId == null ? "bg-amber-50/50" : ""}>
                      <TableCell className="p-2 text-xs font-medium">{s.rawValue || <span className="text-muted-foreground">(blank)</span>}</TableCell>
                      <TableCell className="p-2 text-xs text-muted-foreground">{s.count}</TableCell>
                      <TableCell className="p-2">
                        <Select
                          value={s.membershipTypeId ? String(s.membershipTypeId) : ""}
                          onValueChange={(v) =>
                            setStatusResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, membershipTypeId: v ? Number(v) : null } : x)))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
                          <SelectContent>
                            {membershipTypes.map((t) => (
                              <SelectItem key={t.union_membership_type_id} value={String(t.union_membership_type_id)}>{t.display_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("column_mapping")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep("employer_match")}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Employer match ── */}
        {step === "employer_match" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {employerResolutions.length} employers detected. Match each to an existing employer, create a new one, or merge variants together.
            </p>
            <div className="border rounded-lg overflow-auto max-h-[440px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[220px]">Employer (from file)</TableHead>
                    <TableHead className="text-xs w-14">Rows</TableHead>
                    <TableHead className="text-xs w-[110px]">Action</TableHead>
                    <TableHead className="text-xs">Match / Category</TableHead>
                    <TableHead className="text-xs w-14">Conf.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employerResolutions.map((e, idx) => (
                    <TableRow key={e.key} className={e.mergeIntoKey ? "opacity-40 bg-muted/30" : e.action === "create" ? "bg-blue-50/40" : ""}>
                      <TableCell className="p-2 text-xs font-medium">
                        {e.action === "create" && !e.mergeIntoKey ? (
                          <Input
                            value={e.canonicalName}
                            onChange={(ev) => setEmployerResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, canonicalName: ev.target.value } : x)))}
                            className="h-7 text-xs"
                            aria-label="New employer name"
                          />
                        ) : (
                          <>
                            {e.canonicalName}
                            {e.mergeIntoKey && <span className="text-muted-foreground ml-1">→ {employerNameByKey.get(e.mergeIntoKey) ?? e.mergeIntoKey}</span>}
                          </>
                        )}
                        {e.variants.length > 1 && <Badge variant="secondary" className="ml-1 text-[10px]">{e.variants.length}</Badge>}
                      </TableCell>
                      <TableCell className="p-2 text-xs text-muted-foreground">{e.count}</TableCell>
                      <TableCell className="p-2">
                        <Select
                          value={e.mergeIntoKey ? "match" : e.action}
                          onValueChange={(v) => setEmployerResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, action: v as "match" | "create", mergeIntoKey: null } : x)))}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="match">Match</SelectItem>
                            <SelectItem value="create">Create</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-2">
                        {e.action === "match" || e.mergeIntoKey ? (
                          <Select
                            value={e.mergeIntoKey ? `${MERGE_PREFIX}${e.mergeIntoKey}` : e.matchedEmployerId ? String(e.matchedEmployerId) : ""}
                            onValueChange={(v) => {
                              if (v.startsWith(MERGE_PREFIX)) {
                                const target = v.slice(MERGE_PREFIX.length);
                                setEmployerResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, mergeIntoKey: target, matchedEmployerId: null } : x)));
                              } else {
                                setEmployerResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, matchedEmployerId: Number(v), mergeIntoKey: null } : x)));
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Existing employers</SelectLabel>
                                {dbEmployers.map((de) => (
                                  <SelectItem key={de.employer_id} value={String(de.employer_id)}>{de.employer_name}</SelectItem>
                                ))}
                              </SelectGroup>
                              <SelectGroup>
                                <SelectLabel>Merge into another (from file)</SelectLabel>
                                {employerResolutions.filter((o) => o.key !== e.key && !o.mergeIntoKey).map((o) => (
                                  <SelectItem key={o.key} value={`${MERGE_PREFIX}${o.key}`}>{o.canonicalName}</SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select value={e.newCategory ?? ""} onValueChange={(v) => setEmployerResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, newCategory: v } : x)))}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Category…" /></SelectTrigger>
                            <SelectContent>
                              {EMPLOYER_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="p-2"><Badge variant={confidenceBadge(e.confidence)} className="text-[10px]">{e.confidence}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(statusResolutions.length > 0 ? "status_mapping" : "column_mapping")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep("vessel_match")}>Vessels <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Vessel match ── */}
        {step === "vessel_match" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Within each employer, match vessels/worksites to existing records or create them. If the same vessel
              appears under more than one employer, set the second one to <span className="font-medium">Match → “Same worksite as”</span> and
              pick the other employer’s vessel — one shared worksite is created, with a unit under each employer. Generic values become an “Unspecified vessel” unit.
            </p>
            <div className="border rounded-lg overflow-auto max-h-[440px] divide-y">
              {employerResolutions.filter((e) => !e.mergeIntoKey).map((e) => {
                const vessels = vesselsByEmployer.get(e.key) ?? [];
                if (vessels.length === 0) return null;
                return (
                  <div key={e.key} className="p-2">
                    <p className="text-xs font-semibold flex items-center gap-1 mb-1">
                      <Building2 className="h-3 w-3" /> {e.canonicalName}
                    </p>
                    <Table>
                      <TableBody>
                        {vessels.map((v) => {
                          const idx = vesselResolutions.findIndex((x) => x.key === v.key);
                          return (
                            <TableRow key={v.key} className={v.action === "create" ? "bg-blue-50/40" : v.action === "unspecified" ? "opacity-70" : ""}>
                              <TableCell className="p-1.5 text-xs font-medium w-[210px]">
                                {v.action === "create" && !v.mergeIntoKey ? (
                                  <div className="flex items-center gap-1">
                                    <Ship className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    <Input
                                      value={v.canonicalName}
                                      onChange={(ev) => setVesselResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, canonicalName: ev.target.value } : x)))}
                                      className="h-7 text-xs"
                                      aria-label="New worksite name"
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <Ship className="inline h-3 w-3 mr-1 text-muted-foreground" />
                                    {v.canonicalName}
                                    {v.variants.length > 1 && <Badge variant="secondary" className="ml-1 text-[10px]">{v.variants.length}</Badge>}
                                    {v.mergeIntoKey && (
                                      <span className="text-muted-foreground ml-1">→ {vesselLabelByKey.get(v.mergeIntoKey) ?? "shared"}</span>
                                    )}
                                  </>
                                )}
                              </TableCell>
                              <TableCell className="p-1.5 text-xs text-muted-foreground w-12">{v.count}</TableCell>
                              <TableCell className="p-1.5 w-[110px]">
                                <Select
                                  value={v.action}
                                  onValueChange={(val) => setVesselResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, action: val as VesselResolution["action"], mergeIntoKey: null } : x)))}
                                >
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="match">Match</SelectItem>
                                    <SelectItem value="create">Create</SelectItem>
                                    <SelectItem value="unspecified">Unspecified</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="p-1.5">
                                {v.action === "match" ? (
                                  <Select
                                    value={v.mergeIntoKey ? `${MERGE_PREFIX}${v.mergeIntoKey}` : v.matchedWorksiteId ? String(v.matchedWorksiteId) : ""}
                                    onValueChange={(val) => {
                                      if (val.startsWith(MERGE_PREFIX)) {
                                        const target = val.slice(MERGE_PREFIX.length);
                                        setVesselResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, mergeIntoKey: target, matchedWorksiteId: null } : x)));
                                      } else {
                                        setVesselResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, matchedWorksiteId: Number(val), mergeIntoKey: null } : x)));
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        <SelectLabel>Existing worksites</SelectLabel>
                                        {dbWorksites.map((dw) => (
                                          <SelectItem key={dw.worksite_id} value={String(dw.worksite_id)}>{dw.worksite_name}</SelectItem>
                                        ))}
                                      </SelectGroup>
                                      <SelectGroup>
                                        <SelectLabel>Same worksite as (any employer)</SelectLabel>
                                        {vesselResolutions
                                          .filter((o) => o.key !== v.key && !o.isGeneric && !o.mergeIntoKey)
                                          .map((o) => (
                                            <SelectItem key={o.key} value={`${MERGE_PREFIX}${o.key}`}>
                                              {(employerNameByKey.get(o.employerKey) ?? o.employerKey)} · {o.canonicalName}
                                              {o.action === "create" ? " (new)" : ""}
                                            </SelectItem>
                                          ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                ) : v.action === "create" ? (
                                  <Select value={v.newWorksiteType} onValueChange={(val) => setVesselResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, newWorksiteType: val } : x)))}>
                                    <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {WORKSITE_TYPES.map((t) => (<SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">employer-level bucket</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("employer_match")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep("occupation_match")}>Occupations <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Occupation match ── */}
        {step === "occupation_match" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{occupationResolutions.length} job titles. Match to existing occupations or create new ones.</p>
            <div className="border rounded-lg overflow-auto max-h-[440px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Job title (from file)</TableHead>
                    <TableHead className="text-xs w-14">Rows</TableHead>
                    <TableHead className="text-xs w-[100px]">Action</TableHead>
                    <TableHead className="text-xs">Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {occupationResolutions.map((o, idx) => (
                    <TableRow key={o.rawValue} className={o.action === "create" ? "bg-blue-50/40" : o.action === "skip" ? "opacity-50" : ""}>
                      <TableCell className="p-2 text-xs font-medium">{o.rawValue}</TableCell>
                      <TableCell className="p-2 text-xs text-muted-foreground">{o.count}</TableCell>
                      <TableCell className="p-2">
                        <Select value={o.action} onValueChange={(v) => setOccupationResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, action: v as OccupationResolution["action"] } : x)))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="match">Match</SelectItem>
                            <SelectItem value="create">Create</SelectItem>
                            <SelectItem value="skip">Skip</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-2">
                        {o.action === "match" ? (
                          <Select value={o.matchedOccupationId ? String(o.matchedOccupationId) : ""} onValueChange={(v) => setOccupationResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, matchedOccupationId: Number(v) } : x)))}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                            <SelectContent>
                              {dbOccupations.map((d) => (<SelectItem key={d.occupation_id} value={String(d.occupation_id)}>{d.canonical_name}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        ) : o.action === "create" ? (
                          <Input className="h-7 text-xs" value={o.createName ?? o.rawValue} onChange={(e) => setOccupationResolutions((prev) => prev.map((x, i) => (i === idx ? { ...x, createName: e.target.value } : x)))} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("vessel_match")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={runDedup}>Check duplicates <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Dedup ── */}
        {step === "dedup" && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking for existing workers…
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {dedupMatches.length} of {workerRows.length} rows match existing workers. Choose what to do with each; the rest are created.
                </p>
                {dedupMatches.length > 0 && (
                  <div className="border rounded-lg overflow-auto max-h-[420px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Import row</TableHead>
                          <TableHead className="text-xs">Existing worker</TableHead>
                          <TableHead className="text-xs w-20">Matched on</TableHead>
                          <TableHead className="text-xs w-[200px]">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dedupMatches.map((m) => {
                          const row = workerRows.find((r) => r.rowIndex === m.rowIndex);
                          return (
                            <TableRow key={m.rowIndex}>
                              <TableCell className="p-2 text-xs">{row ? `${row.firstName} ${row.lastName}` : m.rowIndex}</TableCell>
                              <TableCell className="p-2 text-xs">{m.existingName}</TableCell>
                              <TableCell className="p-2 text-xs"><Badge variant="outline" className="text-[10px]">{m.matchedOn}</Badge></TableCell>
                              <TableCell className="p-2">
                                <div className="flex gap-1">
                                  {(["update", "skip", "create"] as const).map((a) => (
                                    <Button
                                      key={a}
                                      size="sm"
                                      variant={m.action === a ? "default" : "outline"}
                                      className="h-7 text-xs"
                                      onClick={() => setDedupMatches((prev) => prev.map((x) => (x.rowIndex === m.rowIndex ? { ...x, action: a } : x)))}
                                    >
                                      {a}
                                    </Button>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStep("occupation_match")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
                  <Button onClick={() => setStep("ou_build")}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {/* ── OU build ── */}
        {step === "ou_build" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border p-3">
              <Checkbox id="build-ous" checked={buildOus} onCheckedChange={(c) => setBuildOus(!!c)} />
              <Label htmlFor="build-ous" className="text-sm">
                Build organising units now — one group per employer, with a unit per vessel, and assign workers automatically
              </Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Worker list name</Label>
              <Input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Imported list" />
            </div>
            {buildOus && (
              <div className="border rounded-lg overflow-auto max-h-[360px] p-2 space-y-2">
                {employerResolutions.filter((e) => !e.mergeIntoKey).map((e) => {
                  // Hide a vessel only when it folds into another vessel under the SAME
                  // employer; one shared across employers still becomes a unit here.
                  const vessels = (vesselsByEmployer.get(e.key) ?? []).filter((v) => {
                    if (!v.mergeIntoKey) return true;
                    const target = vesselByKeyMap.get(v.mergeIntoKey);
                    return !target || target.employerKey !== v.employerKey;
                  });
                  return (
                    <div key={e.key} className="text-xs">
                      <p className="font-semibold flex items-center gap-1"><Building2 className="h-3 w-3" /> {e.canonicalName} <span className="text-muted-foreground">({e.count})</span></p>
                      <ul className="ml-5 mt-0.5 space-y-0.5">
                        {vessels.map((v) => (
                          <li key={v.key} className="flex items-center gap-1 text-muted-foreground">
                            <Ship className="h-2.5 w-2.5" /> {v.canonicalName} <span>({v.count})</span>
                            {v.mergeIntoKey && <span className="text-[10px] text-primary/70">shared</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("dedup")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep("review")}>Review <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Review ── */}
        {step === "review" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="font-medium flex items-center gap-1"><Users className="h-4 w-4" /> Workers</p>
                <p className="text-muted-foreground text-xs mt-1">
                  {workerRows.length} rows · {dedupMatches.filter((m) => m.action === "update").length} update · {dedupMatches.filter((m) => m.action === "skip").length} skip · rest created
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="font-medium flex items-center gap-1"><Building2 className="h-4 w-4" /> Structure</p>
                <p className="text-muted-foreground text-xs mt-1">
                  {employerResolutions.filter((e) => !e.mergeIntoKey).length} employers · {vesselResolutions.filter((v) => !v.mergeIntoKey && v.action !== "unspecified").length} vessels
                  {buildOus ? " · building units" : " · units skipped"}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Target: {campaignMode === "existing" ? campaigns.find((c) => c.campaign_id === existingCampaignId)?.name : `New campaign “${newCampaignName}”`}. List: “{listName}”.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("ou_build")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={applyImport} disabled={isLoading}>
                {isLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing…</> : <>Import</>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && result && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${result.success ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {result.success ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              Import {result.success ? "complete" : "completed with some errors"}.
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(result.stats ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between border rounded px-2 py-1">
                  <span className="text-muted-foreground">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                  <span className="font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
            {(result.errors?.length ?? 0) > 0 && (
              <div className="border rounded-md p-2 max-h-[200px] overflow-auto text-xs text-destructive space-y-0.5">
                {(result.errors ?? []).map((e, i) => (<p key={i}>{e}</p>))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); }}>Import another</Button>
              <Button onClick={() => handleClose(false)}><X className="h-4 w-4 mr-1" /> Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
