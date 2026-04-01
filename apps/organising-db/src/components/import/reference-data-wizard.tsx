"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
  SelectGroup,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Search,
  Database,
  Link2,
  Layers,
  Pencil,
  Check,
  Merge,
  X,
} from "lucide-react";

import type { Cluster } from "@/lib/utils/cluster-utils";
import type {
  EmployerProposal,
  WorksiteProposal,
  OccupationProposal,
} from "@/app/api/reference-import/analyse/route";

// ─── Types ──────────────────────────────────────────────────────────────────

type WizardStep =
  | "upload"
  | "cluster_employers"
  | "employers"
  | "cluster_worksites"
  | "worksites"
  | "cluster_occupations"
  | "occupations"
  | "connections"
  | "review"
  | "done";

type Confidence = "high" | "medium" | "low";

const MERGE_PREFIX = "merge::";

interface EmployerResolution {
  canonicalName: string;
  variants: string[];
  action: "match" | "create" | "skip";
  matchedEmployerId: number | null;
  matchedEmployerName: string | null;
  overrideEmployerId?: number;
  mergeIntoCanonical?: string;
  newCategory?: string;
  confidence: Confidence;
  score: number;
}

interface WorksiteResolution {
  canonicalName: string;
  variants: string[];
  action: "match" | "create" | "skip";
  matchedWorksiteId: number | null;
  matchedWorksiteName: string | null;
  mergeIntoCanonical?: string;
  newWorksiteType: string;
  isPrincipalEmployerName: boolean;
  confidence: Confidence;
}

interface OccupationResolution {
  canonicalName: string;
  variants: string[];
  action: "match" | "create" | "skip";
  matchedOccupationId: number | null;
  matchedOccupationName: string | null;
  mergeIntoCanonical?: string;
  category: string;
  confidence: Confidence;
}

interface ConnectionResolution {
  employerName: string;
  worksiteName: string;
  employerId: number | null;
  worksiteId: number | null;
  roleType: string;
  add: boolean;
  occurrences: number;
  existsInDb: boolean;
}

interface ApplyStats {
  employersCreated: number;
  employerAliasesCreated: number;
  worksitesCreated: number;
  worksiteAliasesCreated: number;
  occupationsCreated: number;
  occupationAliasesCreated: number;
  connectionsCreated: number;
  errors: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "cluster_employers", label: "Dedup Employers" },
  { id: "employers", label: "Employers" },
  { id: "cluster_worksites", label: "Dedup Worksites" },
  { id: "worksites", label: "Worksites" },
  { id: "cluster_occupations", label: "Dedup Occupations" },
  { id: "occupations", label: "Occupations" },
  { id: "connections", label: "Connections" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const STEP_INDEX: Record<WizardStep, number> = Object.fromEntries(
  STEPS.map((s, i) => [s.id, i])
) as Record<WizardStep, number>;

const EMPLOYER_CATEGORIES = [
  "Producer", "Major_Contractor", "Subcontractor", "Labour_Hire", "Specialist",
];

const WORKSITE_TYPES = [
  "FPSO", "FPU", "FLNG", "Platform", "Vessel", "Onshore_LNG", "Gas_Plant",
  "Drill_Centre", "Region", "Heliport", "Pipeline", "Airfield",
  "Onshore_Facilities", "CPF", "Gas_Field", "Other",
];

const OCCUPATION_CATEGORIES = [
  "Trades", "Inspection", "Operations", "Marine", "Catering",
  "Management", "Lifting", "Aviation", "Rope_Access", "Engineering",
  "Administration", "Other",
];

const EWR_ROLE_TYPES = [
  "Owner", "Operator", "Principal_Contractor", "Subcontractor",
  "Labour_Hire", "Catering", "Maintenance", "Drilling", "ROV",
  "Inspection", "Transport", "Decommissioning", "Aviation", "Other",
];

function confidenceBadge(c: Confidence) {
  if (c === "high") return "default" as const;
  if (c === "medium") return "secondary" as const;
  return "outline" as const;
}

// ─── Merge-into folding helper ──────────────────────────────────────────────

function foldMergeInto<T extends { canonicalName: string; variants: string[]; action: string; mergeIntoCanonical?: string }>(
  resolutions: T[]
): T[] {
  const merged = new Map<string, T>();
  const toFold: T[] = [];

  for (const r of resolutions) {
    if (r.mergeIntoCanonical) {
      toFold.push(r);
    } else {
      merged.set(r.canonicalName, { ...r });
    }
  }

  for (const r of toFold) {
    const target = merged.get(r.mergeIntoCanonical!);
    if (target) {
      target.variants = [...new Set([...target.variants, ...r.variants, r.canonicalName])];
    }
  }

  return [...merged.values()];
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ReferenceDataWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function ReferenceDataWizard({
  open,
  onOpenChange,
  onComplete,
}: ReferenceDataWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const [step, setStep] = useState<WizardStep>("upload");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [parsedRows, setParsedRows] = useState<
    { employer: string; worksite: string; occupation: string }[]
  >([]);

  // Cluster state
  const [empClusters, setEmpClusters] = useState<Cluster[]>([]);
  const [wsClusters, setWsClusters] = useState<Cluster[]>([]);
  const [occClusters, setOccClusters] = useState<Cluster[]>([]);

  // Reconciliation state
  const [employerResolutions, setEmployerResolutions] = useState<EmployerResolution[]>([]);
  const [worksiteResolutions, setWorksiteResolutions] = useState<WorksiteResolution[]>([]);
  const [occupationResolutions, setOccupationResolutions] = useState<OccupationResolution[]>([]);
  const [connectionResolutions, setConnectionResolutions] = useState<ConnectionResolution[]>([]);
  const [applyResult, setApplyResult] = useState<ApplyStats | null>(null);

  // Filter state
  const [clusterFilter, setClusterFilter] = useState("");
  const [reconFilter, setReconFilter] = useState("");
  const [reconShowOnly, setReconShowOnly] = useState<"all" | "new" | "matched">("all");

  // Cluster editing state
  const [editingClusterId, setEditingClusterId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [mergingClusterId, setMergingClusterId] = useState<number | null>(null);

  // DB data
  const { data: dbEmployers = [] } = useQuery({
    queryKey: ["ref-wizard-employers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employers")
        .select("employer_id, employer_name, employer_category")
        .order("employer_name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: dbWorksites = [] } = useQuery({
    queryKey: ["ref-wizard-worksites"],
    queryFn: async () => {
      const { data } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name, worksite_type")
        .order("worksite_name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: existingEwrPairs = [] } = useQuery({
    queryKey: ["ref-wizard-ewr"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employer_worksite_roles")
        .select("employer_id, worksite_id, role_type");
      return data ?? [];
    },
    enabled: open,
  });

  // ── Handlers ──────────────────────────────────────────────────────────

  function reset() {
    setStep("upload");
    setIsLoading(false);
    setFileName("");
    setDragOver(false);
    setParseError(null);
    setTotalRows(0);
    setParsedRows([]);
    setEmpClusters([]);
    setWsClusters([]);
    setOccClusters([]);
    setEmployerResolutions([]);
    setWorksiteResolutions([]);
    setOccupationResolutions([]);
    setConnectionResolutions([]);
    setApplyResult(null);
    setClusterFilter("");
    setReconFilter("");
    setReconShowOnly("all");
    setEditingClusterId(null);
    setMergingClusterId(null);
  }

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setParseError("Only .xlsx and .xls files are supported.");
      return;
    }
    setParseError(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const parseRes = await fetch("/api/reference-import/parse", { method: "POST", body: formData });
      const parseJson = await parseRes.json();
      if (!parseJson.success) { setParseError(parseJson.error ?? "Parse failed"); return; }

      setFileName(parseJson.fileName);
      setTotalRows(parseJson.totalRows);
      setParsedRows(parseJson.rows);

      const clusterRes = await fetch("/api/reference-import/cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parseJson.rows }),
      });
      const clusterJson = await clusterRes.json();
      if (!clusterJson.success) { setParseError(clusterJson.error ?? "Clustering failed"); return; }

      setEmpClusters(clusterJson.employerClusters);
      setWsClusters(clusterJson.worksiteClusters);
      setOccClusters(clusterJson.occupationClusters);
      setStep("cluster_employers");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleFile(file); },
    [handleFile]
  );

  async function runAnalyseForEmployers() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/reference-import/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerClusters: empClusters.map((c) => ({ canonicalName: c.canonicalName, variants: c.variants })),
          worksiteClusters: [], occupationClusters: [], rows: parsedRows,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEmployerResolutions(
        (json.employers as EmployerProposal[]).map((p) => ({
          canonicalName: p.canonicalName, variants: p.variants,
          action: p.confidence === "high" ? "match" : p.isNew ? "create" : "match",
          matchedEmployerId: p.matchedEmployerId, matchedEmployerName: p.matchedEmployerName,
          confidence: p.confidence, score: p.score,
        }))
      );
      setReconFilter(""); setReconShowOnly("all"); setStep("employers");
    } catch (e) { setParseError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setIsLoading(false); }
  }

  async function runAnalyseForWorksites() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/reference-import/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerClusters: [],
          worksiteClusters: wsClusters.map((c) => ({ canonicalName: c.canonicalName, variants: c.variants })),
          occupationClusters: [], rows: parsedRows,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setWorksiteResolutions(
        (json.worksites as WorksiteProposal[]).map((p) => ({
          canonicalName: p.canonicalName, variants: p.variants,
          action: p.confidence === "high" ? "match" : p.isPrincipalEmployerName ? "skip" : p.isNew ? "create" : "match",
          matchedWorksiteId: p.matchedWorksiteId, matchedWorksiteName: p.matchedWorksiteName,
          newWorksiteType: "Other", isPrincipalEmployerName: p.isPrincipalEmployerName, confidence: p.confidence,
        }))
      );
      setReconFilter(""); setReconShowOnly("all"); setStep("worksites");
    } catch (e) { setParseError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setIsLoading(false); }
  }

  async function runAnalyseForOccupations() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/reference-import/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerClusters: [],
          worksiteClusters: [],
          occupationClusters: occClusters.map((c) => ({ canonicalName: c.canonicalName, variants: c.variants, suggestedCategory: c.suggestedCategory })),
          rows: parsedRows,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setOccupationResolutions(
        (json.occupations as OccupationProposal[]).map((p) => ({
          canonicalName: p.canonicalName, variants: p.variants,
          action: p.confidence === "high" ? "match" : p.isNew ? "create" : "match",
          matchedOccupationId: p.matchedOccupationId, matchedOccupationName: p.matchedOccupationName,
          category: p.suggestedCategory ?? "Other", confidence: p.confidence,
        }))
      );
      setReconFilter(""); setReconShowOnly("all"); setStep("occupations");
    } catch (e) { setParseError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setIsLoading(false); }
  }

  function buildConnectionResolutions() {
    const empLookup = new Map<string, number>();
    for (const er of employerResolutions) {
      if (er.action === "skip" || er.mergeIntoCanonical) continue;
      const id = er.overrideEmployerId ?? er.matchedEmployerId;
      if (!id) continue;
      empLookup.set(er.canonicalName.toLowerCase(), id);
      for (const v of er.variants) empLookup.set(v.toLowerCase(), id);
    }

    const wsLookup = new Map<string, number>();
    for (const wr of worksiteResolutions) {
      if (wr.action === "skip" || wr.mergeIntoCanonical || !wr.matchedWorksiteId) continue;
      wsLookup.set(wr.canonicalName.toLowerCase(), wr.matchedWorksiteId);
      for (const v of wr.variants) wsLookup.set(v.toLowerCase(), wr.matchedWorksiteId);
    }

    const ewrSet = new Set(
      existingEwrPairs.map((r: { employer_id: number; worksite_id: number }) => `${r.employer_id}:${r.worksite_id}`)
    );

    const connCounts = new Map<string, number>();
    for (const row of parsedRows) {
      if (!row.employer || !row.worksite) continue;
      const empId = empLookup.get(row.employer.toLowerCase());
      const wsId = wsLookup.get(row.worksite.toLowerCase());
      if (!empId || !wsId) continue;
      const key = `${empId}:${wsId}`;
      connCounts.set(key, (connCounts.get(key) ?? 0) + 1);
    }

    const conns: ConnectionResolution[] = [];
    for (const [key, count] of connCounts) {
      const [empIdStr, wsIdStr] = key.split(":");
      const empId = Number(empIdStr);
      const wsId = Number(wsIdStr);
      const exists = ewrSet.has(key);
      const empName = dbEmployers.find((e) => e.employer_id === empId)?.employer_name ?? employerResolutions.find((er) => (er.overrideEmployerId ?? er.matchedEmployerId) === empId)?.canonicalName ?? `Employer #${empId}`;
      const wsName = dbWorksites.find((w) => w.worksite_id === wsId)?.worksite_name ?? worksiteResolutions.find((wr) => wr.matchedWorksiteId === wsId)?.canonicalName ?? `Worksite #${wsId}`;
      conns.push({ employerName: empName, worksiteName: wsName, employerId: empId, worksiteId: wsId, roleType: "Other", add: !exists, occurrences: count, existsInDb: exists });
    }
    conns.sort((a, b) => { if (a.existsInDb !== b.existsInDb) return a.existsInDb ? 1 : -1; return b.occurrences - a.occurrences; });
    setConnectionResolutions(conns);
  }

  async function applyImport() {
    setIsLoading(true);
    try {
      const foldedEmployers = foldMergeInto(employerResolutions);
      const foldedWorksites = foldMergeInto(worksiteResolutions);
      const foldedOccupations = foldMergeInto(occupationResolutions);

      const payload = {
        fileName,
        employers: foldedEmployers.map((er) => ({
          canonicalName: er.canonicalName, variants: er.variants, action: er.action,
          matchedEmployerId: er.overrideEmployerId ?? er.matchedEmployerId, newCategory: er.newCategory,
        })),
        worksites: foldedWorksites.map((wr) => ({
          canonicalName: wr.canonicalName, variants: wr.variants, action: wr.action,
          matchedWorksiteId: wr.matchedWorksiteId, newWorksiteType: wr.newWorksiteType,
        })),
        occupations: foldedOccupations.map((or) => ({
          canonicalName: or.canonicalName, variants: or.variants, action: or.action,
          matchedOccupationId: or.matchedOccupationId, category: or.category,
        })),
        connections: connectionResolutions
          .filter((c) => c.add && c.employerId && c.worksiteId)
          .map((c) => ({ employerName: c.employerName, worksiteName: c.worksiteName, employerId: c.employerId!, worksiteId: c.worksiteId!, roleType: c.roleType, add: true })),
      };

      const res = await fetch("/api/reference-import/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      setApplyResult(json.success ? json.stats : {
        employersCreated: 0, employerAliasesCreated: 0, worksitesCreated: 0, worksiteAliasesCreated: 0,
        occupationsCreated: 0, occupationAliasesCreated: 0, connectionsCreated: 0, errors: [json.error ?? "Unknown error"],
      });
      setStep("done");
    } catch (e) {
      setApplyResult({
        employersCreated: 0, employerAliasesCreated: 0, worksitesCreated: 0, worksiteAliasesCreated: 0,
        occupationsCreated: 0, occupationAliasesCreated: 0, connectionsCreated: 0, errors: [e instanceof Error ? e.message : "Unknown error"],
      });
      setStep("done");
    } finally { setIsLoading(false); }
  }

  // ── Render helpers ────────────────────────────────────────────────────

  const currentStepIndex = STEP_INDEX[step];

  function StepIndicator() {
    return (
      <div className="flex items-center gap-0.5 mb-6 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-medium border transition-colors ${i <= currentStepIndex ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-muted-foreground/30"}`}>
              {i < currentStepIndex ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-px w-3 mx-0.5 ${i < currentStepIndex ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground font-medium">{STEPS[currentStepIndex].label}</span>
      </div>
    );
  }

  // ── Cluster review renderer ───────────────────────────────────────────

  function renderClusterReview(
    title: string,
    clusters: Cluster[],
    setClusters: (fn: (prev: Cluster[]) => Cluster[]) => void,
    _onConfirmAll: () => void,
    onBack: () => void,
    onNext: () => void,
    categoryOptions?: string[],
    isLoadingNext?: boolean
  ) {
    const confirmedCount = clusters.filter((c) => c.confirmed).length;
    const multiVariantCount = clusters.filter((c) => c.variants.length > 1).length;
    const f = clusterFilter.toLowerCase();
    const filtered = f
      ? clusters.filter((c) => c.canonicalName.toLowerCase().includes(f) || c.variants.some((v) => v.toLowerCase().includes(f)))
      : clusters;

    function confirmCluster(id: number) {
      setClusters((prev) => prev.map((c) => (c.id === id ? { ...c, confirmed: true } : c)));
    }
    function confirmAllRemaining() {
      setClusters((prev) => prev.map((c) => ({ ...c, confirmed: true })));
    }
    function updateCanonicalName(id: number, name: string) {
      setClusters((prev) => prev.map((c) => (c.id === id ? { ...c, canonicalName: name } : c)));
    }
    function updateCategory(id: number, cat: string) {
      setClusters((prev) => prev.map((c) => (c.id === id ? { ...c, suggestedCategory: cat } : c)));
    }

    function mergeClusters(sourceId: number, targetId: number) {
      setClusters((prev) => {
        const source = prev.find((c) => c.id === sourceId);
        const target = prev.find((c) => c.id === targetId);
        if (!source || !target) return prev;
        const mergedVariants = [...new Set([...target.variants, ...source.variants])].sort();
        return prev
          .filter((c) => c.id !== sourceId)
          .map((c) =>
            c.id === targetId
              ? { ...c, variants: mergedVariants, occurrenceCount: c.occurrenceCount + source.occurrenceCount, confirmed: false }
              : c
          );
      });
      setMergingClusterId(null);
    }

    function splitVariant(clusterId: number, variant: string) {
      setClusters((prev) => {
        const source = prev.find((c) => c.id === clusterId);
        if (!source || source.variants.length <= 1) return prev;
        const remaining = source.variants.filter((v) => v !== variant);
        const newId = Math.max(...prev.map((c) => c.id)) + 1;
        return [
          ...prev.map((c) =>
            c.id === clusterId
              ? { ...c, variants: remaining, canonicalName: remaining.includes(c.canonicalName) ? c.canonicalName : remaining[0] }
              : c
          ),
          { id: newId, canonicalName: variant, variants: [variant], occurrenceCount: 0, suggestedCategory: source.suggestedCategory, confirmed: false },
        ];
      });
    }

    function moveVariantToCluster(sourceClusterId: number, variant: string, targetClusterId: number) {
      setClusters((prev) => {
        const source = prev.find((c) => c.id === sourceClusterId);
        if (!source || source.variants.length <= 1) return prev;
        const remaining = source.variants.filter((v) => v !== variant);
        return prev.map((c) => {
          if (c.id === sourceClusterId) {
            return { ...c, variants: remaining, canonicalName: remaining.includes(c.canonicalName) ? c.canonicalName : remaining[0] };
          }
          if (c.id === targetClusterId) {
            return { ...c, variants: [...new Set([...c.variants, variant])].sort(), confirmed: false };
          }
          return c;
        });
      });
    }

    const isMerging = mergingClusterId !== null;
    const mergingCluster = isMerging ? clusters.find((c) => c.id === mergingClusterId) : null;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {clusters.length} {title.toLowerCase()} clusters ({multiVariantCount} with multiple variants).
            {confirmedCount > 0 && <span className="text-primary ml-1">{confirmedCount} confirmed.</span>}
          </p>
          <div className="flex gap-1">
            {isMerging && (
              <Button size="sm" variant="destructive" className="text-xs" onClick={() => setMergingClusterId(null)}>
                <X className="h-3 w-3 mr-1" /> Cancel Merge
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs" onClick={confirmAllRemaining} disabled={confirmedCount === clusters.length}>
              <Check className="h-3 w-3 mr-1" /> Confirm All ({clusters.length - confirmedCount})
            </Button>
          </div>
        </div>

        {isMerging && mergingCluster && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-xs text-blue-800">
            <Merge className="inline h-3 w-3 mr-1" />
            Merging &quot;{mergingCluster.canonicalName}&quot; — click &quot;Merge here&quot; on the target cluster to combine them.
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Filter clusters..." value={clusterFilter} onChange={(e) => setClusterFilter(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {filtered.map((cluster) => {
            const isSource = mergingClusterId === cluster.id;
            const canMergeHere = isMerging && !isSource;

            return (
              <div
                key={cluster.id}
                className={`border rounded-lg p-3 space-y-2 transition-colors ${
                  isSource ? "border-blue-400 bg-blue-50/50 ring-2 ring-blue-200" :
                  cluster.confirmed ? "border-primary/30 bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  {editingClusterId === cluster.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-7 text-xs flex-1" autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") { updateCanonicalName(cluster.id, editingName); setEditingClusterId(null); } else if (e.key === "Escape") { setEditingClusterId(null); } }} />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { updateCanonicalName(cluster.id, editingName); setEditingClusterId(null); }}>
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium flex-1 cursor-pointer hover:text-primary" onClick={() => { setEditingClusterId(cluster.id); setEditingName(cluster.canonicalName); }} title="Click to edit canonical name">
                      {cluster.canonicalName}
                      <Pencil className="inline h-2.5 w-2.5 ml-1 text-muted-foreground" />
                    </p>
                  )}

                  {categoryOptions && (
                    <Select value={cluster.suggestedCategory ?? "Other"} onValueChange={(v) => updateCategory(cluster.id, v)}>
                      <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{categoryOptions.map((c) => (<SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>))}</SelectContent>
                    </Select>
                  )}

                  {cluster.variants.length > 1 && (
                    <Badge variant="secondary" className="text-[10px] gap-1"><Layers className="h-2.5 w-2.5" />{cluster.variants.length}</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">{cluster.occurrenceCount} rows</Badge>

                  {canMergeHere ? (
                    <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => mergeClusters(mergingClusterId!, cluster.id)}>
                      <Merge className="h-3 w-3 mr-1" /> Merge here
                    </Button>
                  ) : !isMerging ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMergingClusterId(cluster.id)} title="Start merge — then click target cluster">
                      <Merge className="h-3 w-3" />
                    </Button>
                  ) : null}

                  {!cluster.confirmed ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => confirmCluster(cluster.id)}>
                      <Check className="h-3 w-3 mr-1" /> Confirm
                    </Button>
                  ) : (
                    <Badge variant="default" className="text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> OK</Badge>
                  )}
                </div>

                {cluster.variants.length > 1 && (
                  <div className="flex flex-wrap gap-1 ml-1">
                    {cluster.variants.map((v) => (
                      <span key={v} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground group">
                        {v}
                        {v !== cluster.canonicalName && (
                          <span className="inline-flex gap-0.5 ml-0.5">
                            <button className="text-muted-foreground/60 hover:text-destructive" title="Split out as new cluster" onClick={() => splitVariant(cluster.id, v)}>&times;</button>
                            {clusters.length > 1 && (
                              <select
                                className="text-[9px] bg-transparent border-none cursor-pointer text-muted-foreground/60 hover:text-primary w-[14px] appearance-none"
                                title="Move to another cluster"
                                value=""
                                onChange={(e) => {
                                  const targetId = Number(e.target.value);
                                  if (targetId) moveVariantToCluster(cluster.id, v, targetId);
                                }}
                              >
                                <option value="" disabled>&rarr;</option>
                                {clusters.filter((c2) => c2.id !== cluster.id).map((c2) => (
                                  <option key={c2.id} value={c2.id}>{c2.canonicalName}</option>
                                ))}
                              </select>
                            )}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setClusterFilter(""); setMergingClusterId(null); onBack(); }}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <Button onClick={() => { setClusterFilter(""); setMergingClusterId(null); onNext(); }} disabled={isLoadingNext}>
            {isLoadingNext ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analysing...</> : <>Reconcile <ArrowRight className="h-4 w-4 ml-1" /></>}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Reconciliation filter bar ─────────────────────────────────────────

  function ReconFilterBar({ total, matched, new_ }: { total: number; matched: number; new_: number }) {
    return (
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Filter..." value={reconFilter} onChange={(e) => setReconFilter(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>
        <div className="flex gap-1">
          {([["all", `All (${total})`], ["matched", `Matched (${matched})`], ["new", `New (${new_})`]] as const).map(([value, label]) => (
            <Button key={value} variant={reconShowOnly === value ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setReconShowOnly(value)}>{label}</Button>
          ))}
        </div>
      </div>
    );
  }

  // ── Step renderers ────────────────────────────────────────────────────

  function renderUpload() {
    return (
      <div className="space-y-4">
        <div className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Drop your employer/worksite/occupation .xlsx file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse — expects columns: Employer, Worksite, Occupation</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
        {parseError && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {parseError}</div>
        )}
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How it works:</p>
          <p>1. Upload your Excel file with Employer, Worksite, Occupation columns</p>
          <p>2. Near-duplicates are automatically clustered — you can merge or split clusters</p>
          <p>3. Reconcile clusters against existing database records or other new entries</p>
          <p>4. All spelling variants are saved as aliases for future smart matching</p>
        </div>
      </div>
    );
  }

  function renderEmployers() {
    const matchedCount = employerResolutions.filter((e) => e.action === "match" && !e.mergeIntoCanonical).length;
    const newCount = employerResolutions.filter((e) => e.action === "create").length;
    const mergedCount = employerResolutions.filter((e) => e.mergeIntoCanonical).length;
    const f = reconFilter.toLowerCase();
    let filtered = employerResolutions;
    if (f) filtered = filtered.filter((e) => e.canonicalName.toLowerCase().includes(f));
    if (reconShowOnly === "matched") filtered = filtered.filter((e) => e.action === "match");
    else if (reconShowOnly === "new") filtered = filtered.filter((e) => e.action === "create");

    const createOptions = employerResolutions.filter((e) => e.action === "create");

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {employerResolutions.length} employer clusters. {mergedCount > 0 && <span className="text-primary">{mergedCount} merged into others.</span>}
        </p>
        <ReconFilterBar total={employerResolutions.length} matched={matchedCount} new_={newCount} />
        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs w-[220px]">Canonical Name</TableHead>
              <TableHead className="text-xs w-16">Aliases</TableHead>
              <TableHead className="text-xs w-[100px]">Action</TableHead>
              <TableHead className="text-xs">Match / Category</TableHead>
              <TableHead className="text-xs w-14">Conf.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow key={emp.canonicalName} className={emp.mergeIntoCanonical ? "opacity-40 bg-muted/30" : emp.action === "create" ? "bg-blue-50/50" : emp.action === "skip" ? "opacity-50" : ""}>
                  <TableCell className="p-2 text-xs font-medium">
                    {emp.canonicalName}
                    {emp.mergeIntoCanonical && <span className="text-muted-foreground ml-1">-&gt; {emp.mergeIntoCanonical}</span>}
                  </TableCell>
                  <TableCell className="p-2 text-xs text-muted-foreground">{emp.variants.length}</TableCell>
                  <TableCell className="p-2">
                    <Select value={emp.mergeIntoCanonical ? "match" : emp.action} onValueChange={(v) => {
                      setEmployerResolutions((prev) => prev.map((e) => e.canonicalName === emp.canonicalName ? { ...e, action: v as any, mergeIntoCanonical: undefined } : e));
                    }}>
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="match">Match</SelectItem><SelectItem value="create">Create</SelectItem><SelectItem value="skip">Skip</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-2">
                    {emp.action === "match" && !emp.mergeIntoCanonical ? (
                      <Select value={String(emp.overrideEmployerId ?? emp.matchedEmployerId ?? "")}
                        onValueChange={(v) => {
                          if (v.startsWith(MERGE_PREFIX)) {
                            const targetName = v.slice(MERGE_PREFIX.length);
                            setEmployerResolutions((prev) => prev.map((e) => e.canonicalName === emp.canonicalName ? { ...e, mergeIntoCanonical: targetName, overrideEmployerId: undefined } : e));
                          } else {
                            setEmployerResolutions((prev) => prev.map((e) => e.canonicalName === emp.canonicalName ? { ...e, overrideEmployerId: Number(v), mergeIntoCanonical: undefined } : e));
                          }
                        }}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Existing in database</SelectLabel>
                            {dbEmployers.map((de) => (<SelectItem key={de.employer_id} value={String(de.employer_id)}>{de.employer_name}</SelectItem>))}
                          </SelectGroup>
                          {createOptions.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>New (from this import)</SelectLabel>
                              {createOptions.filter((co) => co.canonicalName !== emp.canonicalName).map((co) => (
                                <SelectItem key={`create-${co.canonicalName}`} value={`${MERGE_PREFIX}${co.canonicalName}`}>{co.canonicalName} (new)</SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                    ) : emp.action === "create" ? (
                      <Select value={emp.newCategory ?? ""} onValueChange={(v) => setEmployerResolutions((prev) => prev.map((e) => e.canonicalName === emp.canonicalName ? { ...e, newCategory: v } : e))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Category..." /></SelectTrigger>
                        <SelectContent>{EMPLOYER_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="p-2"><Badge variant={confidenceBadge(emp.confidence)} className="text-[10px] px-1.5 py-0">{emp.confidence}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setReconFilter(""); setStep("cluster_employers"); }}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <Button onClick={() => { setReconFilter(""); setStep("cluster_worksites"); }}>Worksites <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </DialogFooter>
      </div>
    );
  }

  function renderWorksites() {
    const matchedCount = worksiteResolutions.filter((w) => w.action === "match" && !w.mergeIntoCanonical).length;
    const newCount = worksiteResolutions.filter((w) => w.action === "create").length;
    const mergedCount = worksiteResolutions.filter((w) => w.mergeIntoCanonical).length;
    const f = reconFilter.toLowerCase();
    let filtered = worksiteResolutions;
    if (f) filtered = filtered.filter((w) => w.canonicalName.toLowerCase().includes(f));
    if (reconShowOnly === "matched") filtered = filtered.filter((w) => w.action === "match");
    else if (reconShowOnly === "new") filtered = filtered.filter((w) => w.action === "create");

    const createOptions = worksiteResolutions.filter((w) => w.action === "create");

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {worksiteResolutions.length} worksite clusters. {mergedCount > 0 && <span className="text-primary">{mergedCount} merged into others.</span>}
        </p>
        <ReconFilterBar total={worksiteResolutions.length} matched={matchedCount} new_={newCount} />
        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs w-[220px]">Canonical Name</TableHead>
              <TableHead className="text-xs w-16">Aliases</TableHead>
              <TableHead className="text-xs w-[100px]">Action</TableHead>
              <TableHead className="text-xs">Match / Type</TableHead>
              <TableHead className="text-xs w-14">Conf.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((ws) => (
                <TableRow key={ws.canonicalName} className={ws.mergeIntoCanonical ? "opacity-40 bg-muted/30" : ws.action === "create" ? "bg-blue-50/50" : ws.action === "skip" ? "opacity-50" : ""}>
                  <TableCell className="p-2 text-xs font-medium">
                    {ws.canonicalName}
                    {ws.isPrincipalEmployerName && <Badge variant="outline" className="text-[9px] ml-1 text-amber-600">PE</Badge>}
                    {ws.mergeIntoCanonical && <span className="text-muted-foreground ml-1">-&gt; {ws.mergeIntoCanonical}</span>}
                  </TableCell>
                  <TableCell className="p-2 text-xs text-muted-foreground">{ws.variants.length}</TableCell>
                  <TableCell className="p-2">
                    <Select value={ws.mergeIntoCanonical ? "match" : ws.action} onValueChange={(v) => {
                      setWorksiteResolutions((prev) => prev.map((w) => w.canonicalName === ws.canonicalName ? { ...w, action: v as any, mergeIntoCanonical: undefined } : w));
                    }}>
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="match">Match</SelectItem><SelectItem value="create">Create</SelectItem><SelectItem value="skip">Skip</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-2">
                    {ws.action === "match" && !ws.mergeIntoCanonical ? (
                      <Select value={String(ws.matchedWorksiteId ?? "")}
                        onValueChange={(v) => {
                          if (v.startsWith(MERGE_PREFIX)) {
                            const targetName = v.slice(MERGE_PREFIX.length);
                            setWorksiteResolutions((prev) => prev.map((w) => w.canonicalName === ws.canonicalName ? { ...w, mergeIntoCanonical: targetName, matchedWorksiteId: null } : w));
                          } else {
                            const id = Number(v); const found = dbWorksites.find((w) => w.worksite_id === id);
                            setWorksiteResolutions((prev) => prev.map((w) => w.canonicalName === ws.canonicalName ? { ...w, matchedWorksiteId: id, matchedWorksiteName: found?.worksite_name ?? null, mergeIntoCanonical: undefined } : w));
                          }
                        }}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Existing in database</SelectLabel>
                            {dbWorksites.map((dw) => (<SelectItem key={dw.worksite_id} value={String(dw.worksite_id)}>{dw.worksite_name}</SelectItem>))}
                          </SelectGroup>
                          {createOptions.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>New (from this import)</SelectLabel>
                              {createOptions.filter((co) => co.canonicalName !== ws.canonicalName).map((co) => (
                                <SelectItem key={`create-${co.canonicalName}`} value={`${MERGE_PREFIX}${co.canonicalName}`}>{co.canonicalName} (new)</SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                    ) : ws.action === "create" ? (
                      <Select value={ws.newWorksiteType} onValueChange={(v) => setWorksiteResolutions((prev) => prev.map((w) => w.canonicalName === ws.canonicalName ? { ...w, newWorksiteType: v } : w))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{WORKSITE_TYPES.map((t) => (<SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="p-2"><Badge variant={confidenceBadge(ws.confidence)} className="text-[10px] px-1.5 py-0">{ws.confidence}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setReconFilter(""); setStep("cluster_worksites"); }}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <Button onClick={() => { setReconFilter(""); setStep("cluster_occupations"); }}>Occupations <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </DialogFooter>
      </div>
    );
  }

  function renderOccupations() {
    const matchedCount = occupationResolutions.filter((o) => o.action === "match" && !o.mergeIntoCanonical).length;
    const newCount = occupationResolutions.filter((o) => o.action === "create").length;
    const mergedCount = occupationResolutions.filter((o) => o.mergeIntoCanonical).length;
    const f = reconFilter.toLowerCase();
    let filtered = occupationResolutions;
    if (f) filtered = filtered.filter((o) => o.canonicalName.toLowerCase().includes(f));
    if (reconShowOnly === "matched") filtered = filtered.filter((o) => o.action === "match");
    else if (reconShowOnly === "new") filtered = filtered.filter((o) => o.action === "create");

    const createOptions = occupationResolutions.filter((o) => o.action === "create");

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {occupationResolutions.length} occupation clusters. {mergedCount > 0 && <span className="text-primary">{mergedCount} merged into others.</span>}
        </p>
        <ReconFilterBar total={occupationResolutions.length} matched={matchedCount} new_={newCount} />
        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs">Canonical Name</TableHead>
              <TableHead className="text-xs w-16">Aliases</TableHead>
              <TableHead className="text-xs w-[90px]">Action</TableHead>
              <TableHead className="text-xs w-[140px]">Match / Category</TableHead>
              <TableHead className="text-xs w-14">Conf.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((occ) => (
                <TableRow key={occ.canonicalName} className={occ.mergeIntoCanonical ? "opacity-40 bg-muted/30" : occ.action === "create" ? "bg-blue-50/50" : occ.action === "skip" ? "opacity-50" : ""}>
                  <TableCell className="p-2 text-xs font-medium">
                    {occ.action === "match" && !occ.mergeIntoCanonical ? (
                      <span>{occ.canonicalName} <span className="text-muted-foreground">-&gt; {occ.matchedOccupationName}</span></span>
                    ) : occ.canonicalName}
                    {occ.mergeIntoCanonical && <span className="text-muted-foreground ml-1">-&gt; {occ.mergeIntoCanonical}</span>}
                  </TableCell>
                  <TableCell className="p-2 text-xs text-muted-foreground">{occ.variants.length}</TableCell>
                  <TableCell className="p-2">
                    <Select value={occ.mergeIntoCanonical ? "match" : occ.action} onValueChange={(v) => {
                      setOccupationResolutions((prev) => prev.map((o) => o.canonicalName === occ.canonicalName ? { ...o, action: v as any, mergeIntoCanonical: undefined } : o));
                    }}>
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="match">Match</SelectItem><SelectItem value="create">Create</SelectItem><SelectItem value="skip">Skip</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-2">
                    {occ.action === "match" && !occ.mergeIntoCanonical ? (
                      <span className="text-xs text-muted-foreground">{occ.matchedOccupationName ?? "—"}</span>
                    ) : occ.action === "create" ? (
                      <Select value={occ.category} onValueChange={(v) => setOccupationResolutions((prev) => prev.map((o) => o.canonicalName === occ.canonicalName ? { ...o, category: v } : o))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{OCCUPATION_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="p-2">
                    {!occ.mergeIntoCanonical ? (
                      <Badge variant={confidenceBadge(occ.confidence)} className="text-[10px] px-1.5 py-0">{occ.confidence}</Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {createOptions.length > 0 && (
          <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            To merge an item into a new entry, set its Action to &quot;Match&quot; — the match dropdown is not shown for occupations by default (they auto-match by category). Use the cluster step to combine near-duplicates instead.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setReconFilter(""); setStep("cluster_occupations"); }}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <Button onClick={() => { buildConnectionResolutions(); setReconFilter(""); setStep("connections"); }}>Connections <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </DialogFooter>
      </div>
    );
  }

  function renderConnections() {
    const newConns = connectionResolutions.filter((c) => !c.existsInDb && c.add);
    const existingConns = connectionResolutions.filter((c) => c.existsInDb);
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{connectionResolutions.length} employer-worksite pairs. {newConns.length} new, {existingConns.length} existing.</p>
        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs w-8">Add</TableHead><TableHead className="text-xs">Employer</TableHead><TableHead className="text-xs">Worksite</TableHead>
              <TableHead className="text-xs w-[120px]">Role</TableHead><TableHead className="text-xs w-14">Count</TableHead><TableHead className="text-xs w-16">Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {connectionResolutions.map((conn, idx) => (
                <TableRow key={idx} className={conn.existsInDb ? "opacity-60" : ""}>
                  <TableCell className="p-2"><Checkbox checked={conn.add} disabled={conn.existsInDb} onCheckedChange={(checked) => setConnectionResolutions((prev) => prev.map((c, i) => i === idx ? { ...c, add: checked === true } : c))} /></TableCell>
                  <TableCell className="p-2 text-xs">{conn.employerName}</TableCell>
                  <TableCell className="p-2 text-xs">{conn.worksiteName}</TableCell>
                  <TableCell className="p-2">{!conn.existsInDb && (
                    <Select value={conn.roleType} onValueChange={(v) => setConnectionResolutions((prev) => prev.map((c, i) => i === idx ? { ...c, roleType: v } : c))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{EWR_ROLE_TYPES.map((r) => (<SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>))}</SelectContent>
                    </Select>
                  )}</TableCell>
                  <TableCell className="p-2 text-xs text-center">{conn.occurrences}</TableCell>
                  <TableCell className="p-2"><Badge variant={conn.existsInDb ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">{conn.existsInDb ? "Exists" : "New"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("occupations")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <Button onClick={() => setStep("review")}>Review <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </DialogFooter>
      </div>
    );
  }

  function renderReview() {
    const foldedEmp = foldMergeInto(employerResolutions);
    const foldedWs = foldMergeInto(worksiteResolutions);
    const foldedOcc = foldMergeInto(occupationResolutions);

    const empMatch = foldedEmp.filter((e) => e.action === "match").length;
    const empCreate = foldedEmp.filter((e) => e.action === "create").length;
    const empSkip = foldedEmp.filter((e) => e.action === "skip").length;
    const empAliasTotal = foldedEmp.reduce((s, e) => s + (e.action !== "skip" ? e.variants.length : 0), 0);

    const wsMatch = foldedWs.filter((w) => w.action === "match").length;
    const wsCreate = foldedWs.filter((w) => w.action === "create").length;
    const wsSkip = foldedWs.filter((w) => w.action === "skip").length;
    const wsAliasTotal = foldedWs.reduce((s, w) => s + (w.action !== "skip" ? w.variants.length : 0), 0);

    const occMatch = foldedOcc.filter((o) => o.action === "match").length;
    const occCreate = foldedOcc.filter((o) => o.action === "create").length;
    const occSkip = foldedOcc.filter((o) => o.action === "skip").length;
    const occAliasTotal = foldedOcc.reduce((s, o) => s + (o.action !== "skip" ? o.variants.length : 0), 0);

    const newConns = connectionResolutions.filter((c) => c.add && !c.existsInDb).length;

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Review the summary below, then apply.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Employers", m: empMatch, c: empCreate, s: empSkip, a: empAliasTotal },
            { label: "Worksites", m: wsMatch, c: wsCreate, s: wsSkip, a: wsAliasTotal },
            { label: "Occupations", m: occMatch, c: occCreate, s: occSkip, a: occAliasTotal },
          ].map(({ label, m, c, s, a }) => (
            <div key={label} className="border rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Database className="h-3 w-3" /> {label}</p>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div><p className="text-lg font-bold text-blue-600">{m}</p><p className="text-[10px] text-muted-foreground">Matched</p></div>
                <div><p className="text-lg font-bold text-green-600">{c}</p><p className="text-[10px] text-muted-foreground">New</p></div>
                <div><p className="text-lg font-bold text-muted-foreground">{s}</p><p className="text-[10px] text-muted-foreground">Skip</p></div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">{a} aliases to register</p>
            </div>
          ))}
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Link2 className="h-3 w-3" /> Connections</p>
          <p className="text-sm font-bold text-green-600">{newConns} new connections</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("connections")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <Button onClick={applyImport} disabled={isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Applying...</> : <>Apply Import <ArrowRight className="h-4 w-4 ml-1" /></>}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderDone() {
    if (!applyResult) return null;
    const hasErrors = applyResult.errors.length > 0;
    const totalCreated = applyResult.employersCreated + applyResult.worksitesCreated + applyResult.occupationsCreated;
    const totalAliases = applyResult.employerAliasesCreated + applyResult.worksiteAliasesCreated + applyResult.occupationAliasesCreated;
    return (
      <div className="space-y-4">
        <div className={`flex items-center gap-3 p-4 rounded-lg ${hasErrors ? "bg-amber-50" : "bg-green-50"}`}>
          {hasErrors ? <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0" /> : <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />}
          <div>
            <p className="font-medium text-sm">{hasErrors ? "Import completed with errors" : "Import successful"}</p>
            <p className="text-xs text-muted-foreground">{totalCreated} records created, {totalAliases} aliases saved, {applyResult.connectionsCreated} connections added</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Records Created</p>
            <p className="text-xs">Employers: {applyResult.employersCreated}</p>
            <p className="text-xs">Worksites: {applyResult.worksitesCreated}</p>
            <p className="text-xs">Occupations: {applyResult.occupationsCreated}</p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Aliases Created</p>
            <p className="text-xs">Employer: {applyResult.employerAliasesCreated}</p>
            <p className="text-xs">Worksite: {applyResult.worksiteAliasesCreated}</p>
            <p className="text-xs">Occupation: {applyResult.occupationAliasesCreated}</p>
          </div>
        </div>
        {hasErrors && (
          <div className="border rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-destructive">Errors:</p>
            {applyResult.errors.map((err, i) => <p key={i} className="text-xs text-muted-foreground">{err}</p>)}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => reset()}>Import Another File</Button>
          <Button onClick={() => { onComplete?.(); onOpenChange(false); reset(); }}>Done</Button>
        </DialogFooter>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Reference Data Import Wizard</DialogTitle>
          <DialogDescription>Import and reconcile employer, worksite, and occupation reference data with fuzzy deduplication and alias management.</DialogDescription>
        </DialogHeader>

        <StepIndicator />

        {isLoading && step === "upload" ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Parsing and clustering spreadsheet...</p>
          </div>
        ) : (
          <>
            {step === "upload" && renderUpload()}
            {step === "cluster_employers" && renderClusterReview("Employer", empClusters, setEmpClusters as any, () => {}, () => setStep("upload"), () => runAnalyseForEmployers(), undefined, isLoading)}
            {step === "employers" && renderEmployers()}
            {step === "cluster_worksites" && renderClusterReview("Worksite", wsClusters, setWsClusters as any, () => {}, () => { setReconFilter(""); setStep("employers"); }, () => runAnalyseForWorksites(), undefined, isLoading)}
            {step === "worksites" && renderWorksites()}
            {step === "cluster_occupations" && renderClusterReview("Occupation", occClusters, setOccClusters as any, () => {}, () => { setReconFilter(""); setStep("worksites"); }, () => runAnalyseForOccupations(), OCCUPATION_CATEGORIES, isLoading)}
            {step === "occupations" && renderOccupations()}
            {step === "connections" && renderConnections()}
            {step === "review" && renderReview()}
            {step === "done" && renderDone()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
