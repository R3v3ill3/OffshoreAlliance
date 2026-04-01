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
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Search,
  AlertTriangle,
  Database,
  Split,
  Link2,
} from "lucide-react";

import type {
  EmployerProposal,
  WorksiteProposal,
  OccupationProposal,
  EmployerWorksiteConnection,
} from "@/app/api/reference-import/analyse/route";

// ─── Types ──────────────────────────────────────────────────────────────────

type WizardStep =
  | "upload"
  | "employers"
  | "worksites"
  | "occupations"
  | "connections"
  | "review"
  | "done";

type Confidence = "high" | "medium" | "low";

interface EmployerResolution extends EmployerProposal {
  action: "match" | "create" | "skip";
  overrideEmployerId?: number;
  newCategory?: string;
}

interface WorksitePartResolution {
  part: string;
  action: "match" | "create" | "skip";
  matchedWorksiteId: number | null;
  matchedWorksiteName: string | null;
  newWorksiteType: string;
  isPrincipalEmployerName: boolean;
}

interface WorksiteResolution {
  rawName: string;
  isMultiValue: boolean;
  parts: WorksitePartResolution[];
}

interface OccupationPartResolution {
  part: string;
  action: "match" | "create" | "skip";
  matchedOccupationId: number | null;
  matchedOccupationName: string | null;
  canonicalName: string;
  category: string;
}

interface OccupationResolution {
  rawName: string;
  isMultiValue: boolean;
  parts: OccupationPartResolution[];
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
  { id: "employers", label: "Employers" },
  { id: "worksites", label: "Worksites" },
  { id: "occupations", label: "Occupations" },
  { id: "connections", label: "Connections" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const STEP_INDEX: Record<WizardStep, number> = Object.fromEntries(
  STEPS.map((s, i) => [s.id, i])
) as Record<WizardStep, number>;

const EMPLOYER_CATEGORIES = [
  "Producer",
  "Major_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Specialist",
];

const WORKSITE_TYPES = [
  "FPSO",
  "FPU",
  "FLNG",
  "Platform",
  "Onshore_LNG",
  "Gas_Plant",
  "Drill_Centre",
  "Region",
  "Heliport",
  "Pipeline",
  "Airfield",
  "Onshore_Facilities",
  "CPF",
  "Gas_Field",
  "Other",
];

const OCCUPATION_CATEGORIES = [
  "Trades",
  "Inspection",
  "Operations",
  "Marine",
  "Catering",
  "Management",
  "Lifting",
  "Aviation",
  "Rope_Access",
  "Engineering",
  "Administration",
  "Other",
];

const EWR_ROLE_TYPES = [
  "Owner",
  "Operator",
  "Principal_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Catering",
  "Maintenance",
  "Drilling",
  "ROV",
  "Inspection",
  "Transport",
  "Decommissioning",
  "Aviation",
  "Other",
];

function confidenceBadge(c: Confidence) {
  if (c === "high") return "default" as const;
  if (c === "medium") return "secondary" as const;
  return "outline" as const;
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

  // ── State ─────────────────────────────────────────────────────────────

  const [step, setStep] = useState<WizardStep>("upload");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [totalRows, setTotalRows] = useState(0);
  const [parsedRows, setParsedRows] = useState<
    { employer: string; worksite: string; occupation: string }[]
  >([]);

  const [employerResolutions, setEmployerResolutions] = useState<
    EmployerResolution[]
  >([]);
  const [worksiteResolutions, setWorksiteResolutions] = useState<
    WorksiteResolution[]
  >([]);
  const [occupationResolutions, setOccupationResolutions] = useState<
    OccupationResolution[]
  >([]);
  const [connectionResolutions, setConnectionResolutions] = useState<
    ConnectionResolution[]
  >([]);

  const [applyResult, setApplyResult] = useState<ApplyStats | null>(null);

  // Filter/search state
  const [empFilter, setEmpFilter] = useState("");
  const [wsFilter, setWsFilter] = useState("");
  const [occFilter, setOccFilter] = useState("");
  const [empShowOnly, setEmpShowOnly] = useState<"all" | "new" | "matched">(
    "all"
  );
  const [wsShowOnly, setWsShowOnly] = useState<"all" | "new" | "matched">(
    "all"
  );
  const [occShowOnly, setOccShowOnly] = useState<"all" | "new" | "matched">(
    "all"
  );

  // Load existing DB data for search/override
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
    setEmployerResolutions([]);
    setWorksiteResolutions([]);
    setOccupationResolutions([]);
    setConnectionResolutions([]);
    setApplyResult(null);
    setEmpFilter("");
    setWsFilter("");
    setOccFilter("");
    setEmpShowOnly("all");
    setWsShowOnly("all");
    setOccShowOnly("all");
  }

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setParseError("Only .xlsx and .xls files are supported.");
      return;
    }
    setParseError(null);
    setIsLoading(true);

    try {
      // Step 1: Parse
      const formData = new FormData();
      formData.append("file", file);
      const parseRes = await fetch("/api/reference-import/parse", {
        method: "POST",
        body: formData,
      });
      const parseJson = await parseRes.json();
      if (!parseJson.success) {
        setParseError(parseJson.error ?? "Parse failed");
        return;
      }

      setFileName(parseJson.fileName);
      setTotalRows(parseJson.totalRows);
      setParsedRows(parseJson.rows);

      // Step 2: Analyse
      const analyseRes = await fetch("/api/reference-import/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueEmployers: parseJson.uniqueEmployers,
          uniqueWorksites: parseJson.uniqueWorksites,
          uniqueOccupations: parseJson.uniqueOccupations,
          rows: parseJson.rows,
        }),
      });
      const analyseJson = await analyseRes.json();
      if (!analyseJson.success) {
        setParseError(analyseJson.error ?? "Analysis failed");
        return;
      }

      // Build initial resolutions
      setEmployerResolutions(
        (analyseJson.employers as EmployerProposal[]).map((p) => ({
          ...p,
          action: p.confidence === "high" ? "match" : p.isNew ? "create" : "match",
          overrideEmployerId: p.matchedEmployerId ?? undefined,
          newCategory: undefined,
        }))
      );

      setWorksiteResolutions(
        (analyseJson.worksites as WorksiteProposal[]).map((wp) => ({
          rawName: wp.rawName,
          isMultiValue: wp.isMultiValue,
          parts: wp.proposals.map((p) => ({
            part: p.part,
            action:
              p.confidence === "high"
                ? "match"
                : p.isPrincipalEmployerName
                  ? "skip"
                  : p.isNew
                    ? "create"
                    : "match",
            matchedWorksiteId: p.matchedWorksiteId,
            matchedWorksiteName: p.matchedWorksiteName,
            newWorksiteType: "Other",
            isPrincipalEmployerName: p.isPrincipalEmployerName,
          })),
        }))
      );

      setOccupationResolutions(
        (analyseJson.occupations as OccupationProposal[]).map((op) => ({
          rawName: op.rawName,
          isMultiValue: op.isMultiValue,
          parts: op.proposals.map((p) => ({
            part: p.part,
            action:
              p.confidence === "high"
                ? "match"
                : p.isNew
                  ? "create"
                  : "match",
            matchedOccupationId: p.matchedOccupationId,
            matchedOccupationName: p.matchedOccupationName,
            canonicalName: p.matchedOccupationName ?? p.part,
            category: p.suggestedCategory ?? "Other",
          })),
        }))
      );

      setStep("employers");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  function buildConnectionResolutions() {
    // Build employer/worksite lookup from confirmed resolutions
    const empLookup = new Map<string, number>();
    for (const er of employerResolutions) {
      if (er.action !== "skip" && (er.overrideEmployerId || er.matchedEmployerId)) {
        empLookup.set(
          er.rawName.toLowerCase(),
          er.overrideEmployerId ?? er.matchedEmployerId!
        );
      }
    }

    const wsLookup = new Map<string, number>();
    for (const wr of worksiteResolutions) {
      for (const part of wr.parts) {
        if (part.action !== "skip" && part.matchedWorksiteId) {
          wsLookup.set(part.part.toLowerCase(), part.matchedWorksiteId);
        }
      }
    }

    const ewrSet = new Set(
      existingEwrPairs.map(
        (r: { employer_id: number; worksite_id: number }) =>
          `${r.employer_id}:${r.worksite_id}`
      )
    );

    // Count co-occurrences from parsed data
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
      const empName =
        dbEmployers.find((e) => e.employer_id === empId)?.employer_name ??
        employerResolutions.find(
          (er) =>
            (er.overrideEmployerId ?? er.matchedEmployerId) === empId
        )?.rawName ??
        `Employer #${empId}`;
      const wsName =
        dbWorksites.find((w) => w.worksite_id === wsId)?.worksite_name ??
        worksiteResolutions
          .flatMap((wr) => wr.parts)
          .find((p) => p.matchedWorksiteId === wsId)?.part ??
        `Worksite #${wsId}`;

      conns.push({
        employerName: empName,
        worksiteName: wsName,
        employerId: empId,
        worksiteId: wsId,
        roleType: "Other",
        add: !exists,
        occurrences: count,
        existsInDb: exists,
      });
    }

    conns.sort((a, b) => {
      if (a.existsInDb !== b.existsInDb) return a.existsInDb ? 1 : -1;
      return b.occurrences - a.occurrences;
    });

    setConnectionResolutions(conns);
  }

  async function applyImport() {
    setIsLoading(true);
    try {
      const payload = {
        fileName,
        employers: employerResolutions.map((er) => ({
          rawName: er.rawName,
          action: er.action,
          matchedEmployerId: er.overrideEmployerId ?? er.matchedEmployerId,
          newCategory: er.newCategory,
        })),
        worksites: worksiteResolutions.map((wr) => ({
          rawName: wr.rawName,
          parts: wr.parts.map((p) => ({
            part: p.part,
            action: p.action,
            matchedWorksiteId: p.matchedWorksiteId,
            newWorksiteType: p.newWorksiteType,
          })),
        })),
        occupations: occupationResolutions.map((or) => ({
          rawName: or.rawName,
          parts: or.parts.map((p) => ({
            part: p.part,
            action: p.action,
            matchedOccupationId: p.matchedOccupationId,
            canonicalName: p.canonicalName,
            category: p.category,
          })),
        })),
        connections: connectionResolutions
          .filter((c) => c.add && c.employerId && c.worksiteId)
          .map((c) => ({
            employerName: c.employerName,
            worksiteName: c.worksiteName,
            employerId: c.employerId!,
            worksiteId: c.worksiteId!,
            roleType: c.roleType,
            add: true,
          })),
      };

      const res = await fetch("/api/reference-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) {
        setApplyResult(json.stats);
      } else {
        setApplyResult({
          employersCreated: 0,
          employerAliasesCreated: 0,
          worksitesCreated: 0,
          worksiteAliasesCreated: 0,
          occupationsCreated: 0,
          occupationAliasesCreated: 0,
          connectionsCreated: 0,
          errors: [json.error ?? "Unknown error"],
        });
      }
      setStep("done");
    } catch (e) {
      setApplyResult({
        employersCreated: 0,
        employerAliasesCreated: 0,
        worksitesCreated: 0,
        worksiteAliasesCreated: 0,
        occupationsCreated: 0,
        occupationAliasesCreated: 0,
        connectionsCreated: 0,
        errors: [e instanceof Error ? e.message : "Unknown error"],
      });
      setStep("done");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────

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
              {i < currentStepIndex ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-6 mx-0.5 ${
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

  function FilterBar({
    filter,
    setFilter,
    showOnly,
    setShowOnly,
    counts,
  }: {
    filter: string;
    setFilter: (v: string) => void;
    showOnly: "all" | "new" | "matched";
    setShowOnly: (v: "all" | "new" | "matched") => void;
    counts: { total: number; matched: number; new_: number };
  }) {
    return (
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              ["all", `All (${counts.total})`],
              ["matched", `Matched (${counts.matched})`],
              ["new", `New (${counts.new_})`],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={showOnly === value ? "default" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => setShowOnly(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // ── Step renderers ────────────────────────────────────────────────────

  function renderUpload() {
    return (
      <div className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">
            Drop your employer/worksite/occupation .xlsx file here
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            or click to browse — expects columns: Employer, Worksite, Occupation
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
          <p className="font-medium text-foreground">What this wizard does:</p>
          <p>
            1. Parses an Excel file with Employer, Worksite, and Occupation
            columns
          </p>
          <p>
            2. Fuzzy-matches each value against existing database records
          </p>
          <p>
            3. Lets you confirm matches, create new entries, or split
            multi-value cells
          </p>
          <p>
            4. Builds a canonical list with aliases for future smart matching
          </p>
          <p>
            5. Identifies employer-worksite connections from the data
          </p>
        </div>
      </div>
    );
  }

  function renderEmployers() {
    const matchedCount = employerResolutions.filter(
      (e) => e.action === "match"
    ).length;
    const newCount = employerResolutions.filter(
      (e) => e.action === "create"
    ).length;

    let filtered = employerResolutions;
    if (empFilter) {
      const f = empFilter.toLowerCase();
      filtered = filtered.filter((e) => e.rawName.toLowerCase().includes(f));
    }
    if (empShowOnly === "matched") {
      filtered = filtered.filter((e) => e.action === "match");
    } else if (empShowOnly === "new") {
      filtered = filtered.filter((e) => e.action === "create");
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {employerResolutions.length} unique employers found. Review and
          confirm how each maps to the database.
        </p>

        <FilterBar
          filter={empFilter}
          setFilter={setEmpFilter}
          showOnly={empShowOnly}
          setShowOnly={setEmpShowOnly}
          counts={{
            total: employerResolutions.length,
            matched: matchedCount,
            new_: newCount,
          }}
        />

        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[250px]">Import Name</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Match / Category</TableHead>
                <TableHead className="text-xs w-16">Conf.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp, idx) => (
                <TableRow
                  key={emp.rawName}
                  className={
                    emp.action === "create"
                      ? "bg-blue-50/50"
                      : emp.action === "skip"
                        ? "opacity-50"
                        : ""
                  }
                >
                  <TableCell className="p-2 text-xs font-medium">
                    {emp.rawName}
                  </TableCell>
                  <TableCell className="p-2">
                    <Select
                      value={emp.action}
                      onValueChange={(v) => {
                        const action = v as "match" | "create" | "skip";
                        setEmployerResolutions((prev) =>
                          prev.map((e) =>
                            e.rawName === emp.rawName ? { ...e, action } : e
                          )
                        );
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="match">Match existing</SelectItem>
                        <SelectItem value="create">Create new</SelectItem>
                        <SelectItem value="skip">Skip</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-2">
                    {emp.action === "match" ? (
                      <Select
                        value={String(
                          emp.overrideEmployerId ?? emp.matchedEmployerId ?? ""
                        )}
                        onValueChange={(v) => {
                          const id = Number(v);
                          setEmployerResolutions((prev) =>
                            prev.map((e) =>
                              e.rawName === emp.rawName
                                ? { ...e, overrideEmployerId: id }
                                : e
                            )
                          );
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Select employer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {dbEmployers.map((de) => (
                            <SelectItem
                              key={de.employer_id}
                              value={String(de.employer_id)}
                            >
                              {de.employer_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : emp.action === "create" ? (
                      <Select
                        value={emp.newCategory ?? ""}
                        onValueChange={(v) => {
                          setEmployerResolutions((prev) =>
                            prev.map((e) =>
                              e.rawName === emp.rawName
                                ? { ...e, newCategory: v }
                                : e
                            )
                          );
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Category..." />
                        </SelectTrigger>
                        <SelectContent>
                          {EMPLOYER_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="p-2">
                    <Badge
                      variant={confidenceBadge(emp.confidence)}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {emp.confidence}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("upload")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep("worksites")}>
            Worksites <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderWorksites() {
    const matchedCount = worksiteResolutions.filter((w) =>
      w.parts.some((p) => p.action === "match")
    ).length;
    const newCount = worksiteResolutions.filter((w) =>
      w.parts.some((p) => p.action === "create")
    ).length;

    let filtered = worksiteResolutions;
    if (wsFilter) {
      const f = wsFilter.toLowerCase();
      filtered = filtered.filter((w) => w.rawName.toLowerCase().includes(f));
    }
    if (wsShowOnly === "matched") {
      filtered = filtered.filter((w) =>
        w.parts.some((p) => p.action === "match")
      );
    } else if (wsShowOnly === "new") {
      filtered = filtered.filter((w) =>
        w.parts.some((p) => p.action === "create")
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {worksiteResolutions.length} unique worksite values found.
          Multi-value cells are shown with a <Split className="inline h-3 w-3" />{" "}
          icon.
        </p>

        <FilterBar
          filter={wsFilter}
          setFilter={setWsFilter}
          showOnly={wsShowOnly}
          setShowOnly={setWsShowOnly}
          counts={{
            total: worksiteResolutions.length,
            matched: matchedCount,
            new_: newCount,
          }}
        />

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {filtered.map((ws) => (
            <div key={ws.rawName} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium flex-1">{ws.rawName}</p>
                {ws.isMultiValue && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Split className="h-2.5 w-2.5" />
                    Split into {ws.parts.length}
                  </Badge>
                )}
              </div>

              {ws.parts.map((part, pi) => (
                <div
                  key={pi}
                  className="flex items-center gap-2 ml-3 pl-3 border-l"
                >
                  <span className="text-xs text-muted-foreground w-[180px] truncate">
                    {part.part}
                  </span>

                  {part.isPrincipalEmployerName && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-600"
                    >
                      PE Name
                    </Badge>
                  )}

                  <Select
                    value={part.action}
                    onValueChange={(v) => {
                      const action = v as "match" | "create" | "skip";
                      setWorksiteResolutions((prev) =>
                        prev.map((w) =>
                          w.rawName === ws.rawName
                            ? {
                                ...w,
                                parts: w.parts.map((p, i) =>
                                  i === pi ? { ...p, action } : p
                                ),
                              }
                            : w
                        )
                      );
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="match">Match</SelectItem>
                      <SelectItem value="create">Create</SelectItem>
                      <SelectItem value="skip">Skip</SelectItem>
                    </SelectContent>
                  </Select>

                  {part.action === "match" ? (
                    <Select
                      value={String(part.matchedWorksiteId ?? "")}
                      onValueChange={(v) => {
                        const id = Number(v);
                        const ws_ = dbWorksites.find(
                          (w) => w.worksite_id === id
                        );
                        setWorksiteResolutions((prev) =>
                          prev.map((w) =>
                            w.rawName === ws.rawName
                              ? {
                                  ...w,
                                  parts: w.parts.map((p, i) =>
                                    i === pi
                                      ? {
                                          ...p,
                                          matchedWorksiteId: id,
                                          matchedWorksiteName:
                                            ws_?.worksite_name ?? null,
                                        }
                                      : p
                                  ),
                                }
                              : w
                          )
                        );
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Select worksite..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dbWorksites.map((dw) => (
                          <SelectItem
                            key={dw.worksite_id}
                            value={String(dw.worksite_id)}
                          >
                            {dw.worksite_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : part.action === "create" ? (
                    <Select
                      value={part.newWorksiteType}
                      onValueChange={(v) => {
                        setWorksiteResolutions((prev) =>
                          prev.map((w) =>
                            w.rawName === ws.rawName
                              ? {
                                  ...w,
                                  parts: w.parts.map((p, i) =>
                                    i === pi
                                      ? { ...p, newWorksiteType: v }
                                      : p
                                  ),
                                }
                              : w
                          )
                        );
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKSITE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("employers")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep("occupations")}>
            Occupations <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderOccupations() {
    const matchedCount = occupationResolutions.filter((o) =>
      o.parts.some((p) => p.action === "match")
    ).length;
    const newCount = occupationResolutions.filter((o) =>
      o.parts.some((p) => p.action === "create")
    ).length;

    let filtered = occupationResolutions;
    if (occFilter) {
      const f = occFilter.toLowerCase();
      filtered = filtered.filter((o) => o.rawName.toLowerCase().includes(f));
    }
    if (occShowOnly === "matched") {
      filtered = filtered.filter((o) =>
        o.parts.some((p) => p.action === "match")
      );
    } else if (occShowOnly === "new") {
      filtered = filtered.filter((o) =>
        o.parts.some((p) => p.action === "create")
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {occupationResolutions.length} unique occupation values found. Set
          canonical name and category for new entries.
        </p>

        <FilterBar
          filter={occFilter}
          setFilter={setOccFilter}
          showOnly={occShowOnly}
          setShowOnly={setOccShowOnly}
          counts={{
            total: occupationResolutions.length,
            matched: matchedCount,
            new_: newCount,
          }}
        />

        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Import Value</TableHead>
                <TableHead className="text-xs w-[100px]">Action</TableHead>
                <TableHead className="text-xs">Canonical Name</TableHead>
                <TableHead className="text-xs w-[130px]">Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((occ) =>
                occ.parts.map((part, pi) => (
                  <TableRow
                    key={`${occ.rawName}-${pi}`}
                    className={
                      part.action === "create" ? "bg-blue-50/50" : ""
                    }
                  >
                    <TableCell className="p-2 text-xs">
                      <div className="flex items-center gap-1">
                        {occ.isMultiValue && pi === 0 && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0"
                          >
                            <Split className="h-2 w-2" />
                          </Badge>
                        )}
                        {part.part}
                      </div>
                    </TableCell>
                    <TableCell className="p-2">
                      <Select
                        value={part.action}
                        onValueChange={(v) => {
                          const action = v as "match" | "create" | "skip";
                          setOccupationResolutions((prev) =>
                            prev.map((o) =>
                              o.rawName === occ.rawName
                                ? {
                                    ...o,
                                    parts: o.parts.map((p, i) =>
                                      i === pi ? { ...p, action } : p
                                    ),
                                  }
                                : o
                            )
                          );
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="match">Match</SelectItem>
                          <SelectItem value="create">Create</SelectItem>
                          <SelectItem value="skip">Skip</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-2">
                      {part.action === "create" ? (
                        <Input
                          value={part.canonicalName}
                          onChange={(e) => {
                            setOccupationResolutions((prev) =>
                              prev.map((o) =>
                                o.rawName === occ.rawName
                                  ? {
                                      ...o,
                                      parts: o.parts.map((p, i) =>
                                        i === pi
                                          ? {
                                              ...p,
                                              canonicalName: e.target.value,
                                            }
                                          : p
                                      ),
                                    }
                                  : o
                              )
                            );
                          }}
                          className="h-7 text-xs"
                        />
                      ) : part.action === "match" ? (
                        <span className="text-xs text-muted-foreground">
                          {part.matchedOccupationName ?? "—"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="p-2">
                      {part.action !== "skip" && (
                        <Select
                          value={part.category}
                          onValueChange={(v) => {
                            setOccupationResolutions((prev) =>
                              prev.map((o) =>
                                o.rawName === occ.rawName
                                  ? {
                                      ...o,
                                      parts: o.parts.map((p, i) =>
                                        i === pi
                                          ? { ...p, category: v }
                                          : p
                                      ),
                                    }
                                  : o
                              )
                            );
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OCCUPATION_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("worksites")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button
            onClick={() => {
              buildConnectionResolutions();
              setStep("connections");
            }}
          >
            Connections <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderConnections() {
    const newConns = connectionResolutions.filter(
      (c) => !c.existsInDb && c.add
    );
    const existingConns = connectionResolutions.filter((c) => c.existsInDb);

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {connectionResolutions.length} employer-worksite pairs found in the
          data. {newConns.length} new connections to add,{" "}
          {existingConns.length} already in the database.
        </p>

        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-8">Add</TableHead>
                <TableHead className="text-xs">Employer</TableHead>
                <TableHead className="text-xs">Worksite</TableHead>
                <TableHead className="text-xs w-[120px]">Role</TableHead>
                <TableHead className="text-xs w-16">Count</TableHead>
                <TableHead className="text-xs w-16">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectionResolutions.map((conn, idx) => (
                <TableRow
                  key={idx}
                  className={conn.existsInDb ? "opacity-60" : ""}
                >
                  <TableCell className="p-2">
                    <Checkbox
                      checked={conn.add}
                      disabled={conn.existsInDb}
                      onCheckedChange={(checked) => {
                        setConnectionResolutions((prev) =>
                          prev.map((c, i) =>
                            i === idx
                              ? { ...c, add: checked === true }
                              : c
                          )
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell className="p-2 text-xs">
                    {conn.employerName}
                  </TableCell>
                  <TableCell className="p-2 text-xs">
                    {conn.worksiteName}
                  </TableCell>
                  <TableCell className="p-2">
                    {!conn.existsInDb && (
                      <Select
                        value={conn.roleType}
                        onValueChange={(v) => {
                          setConnectionResolutions((prev) =>
                            prev.map((c, i) =>
                              i === idx ? { ...c, roleType: v } : c
                            )
                          );
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EWR_ROLE_TYPES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="p-2 text-xs text-center">
                    {conn.occurrences}
                  </TableCell>
                  <TableCell className="p-2">
                    {conn.existsInDb ? (
                      <Badge
                        variant="default"
                        className="text-[10px] px-1.5 py-0"
                      >
                        Exists
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        New
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("occupations")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep("review")}>
            Review <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderReview() {
    const empMatch = employerResolutions.filter(
      (e) => e.action === "match"
    ).length;
    const empCreate = employerResolutions.filter(
      (e) => e.action === "create"
    ).length;
    const empSkip = employerResolutions.filter(
      (e) => e.action === "skip"
    ).length;

    const wsParts = worksiteResolutions.flatMap((w) => w.parts);
    const wsMatch = wsParts.filter((p) => p.action === "match").length;
    const wsCreate = wsParts.filter((p) => p.action === "create").length;
    const wsSkip = wsParts.filter((p) => p.action === "skip").length;

    const occParts = occupationResolutions.flatMap((o) => o.parts);
    const occMatch = occParts.filter((p) => p.action === "match").length;
    const occCreate = occParts.filter((p) => p.action === "create").length;
    const occSkip = occParts.filter((p) => p.action === "skip").length;

    const newConns = connectionResolutions.filter(
      (c) => c.add && !c.existsInDb
    ).length;

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Review the summary below, then apply to create records and aliases.
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3" /> Employers
            </p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-lg font-bold text-blue-600">{empMatch}</p>
                <p className="text-[10px] text-muted-foreground">Matched</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600">{empCreate}</p>
                <p className="text-[10px] text-muted-foreground">New</p>
              </div>
              <div>
                <p className="text-lg font-bold text-muted-foreground">
                  {empSkip}
                </p>
                <p className="text-[10px] text-muted-foreground">Skip</p>
              </div>
            </div>
          </div>
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3" /> Worksites
            </p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-lg font-bold text-blue-600">{wsMatch}</p>
                <p className="text-[10px] text-muted-foreground">Matched</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600">{wsCreate}</p>
                <p className="text-[10px] text-muted-foreground">New</p>
              </div>
              <div>
                <p className="text-lg font-bold text-muted-foreground">
                  {wsSkip}
                </p>
                <p className="text-[10px] text-muted-foreground">Skip</p>
              </div>
            </div>
          </div>
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3" /> Occupations
            </p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-lg font-bold text-blue-600">{occMatch}</p>
                <p className="text-[10px] text-muted-foreground">Matched</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600">{occCreate}</p>
                <p className="text-[10px] text-muted-foreground">New</p>
              </div>
              <div>
                <p className="text-lg font-bold text-muted-foreground">
                  {occSkip}
                </p>
                <p className="text-[10px] text-muted-foreground">Skip</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Link2 className="h-3 w-3" /> Employer-Worksite Connections
          </p>
          <p className="text-sm font-bold text-green-600">
            {newConns} new connections to create
          </p>
        </div>

        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p>
            Matched entities will have the import name saved as an alias.
            New entities will be created with the import name as the canonical
            name.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("connections")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={applyImport} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Applying...
              </>
            ) : (
              <>
                Apply Import <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderDone() {
    if (!applyResult) return null;
    const hasErrors = applyResult.errors.length > 0;
    const totalCreated =
      applyResult.employersCreated +
      applyResult.worksitesCreated +
      applyResult.occupationsCreated;
    const totalAliases =
      applyResult.employerAliasesCreated +
      applyResult.worksiteAliasesCreated +
      applyResult.occupationAliasesCreated;

    return (
      <div className="space-y-4">
        <div
          className={`flex items-center gap-3 p-4 rounded-lg ${
            hasErrors ? "bg-amber-50" : "bg-green-50"
          }`}
        >
          {hasErrors ? (
            <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
          )}
          <div>
            <p className="font-medium text-sm">
              {hasErrors
                ? "Import completed with errors"
                : "Import successful"}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalCreated} records created, {totalAliases} aliases saved,{" "}
              {applyResult.connectionsCreated} connections added
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Records Created
            </p>
            <p className="text-xs">
              Employers: {applyResult.employersCreated}
            </p>
            <p className="text-xs">
              Worksites: {applyResult.worksitesCreated}
            </p>
            <p className="text-xs">
              Occupations: {applyResult.occupationsCreated}
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Aliases Created
            </p>
            <p className="text-xs">
              Employer: {applyResult.employerAliasesCreated}
            </p>
            <p className="text-xs">
              Worksite: {applyResult.worksiteAliasesCreated}
            </p>
            <p className="text-xs">
              Occupation: {applyResult.occupationAliasesCreated}
            </p>
          </div>
        </div>

        {hasErrors && (
          <div className="border rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-destructive">Errors:</p>
            {applyResult.errors.map((err, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {err}
              </p>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => reset()}>
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

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Reference Data Import Wizard
          </DialogTitle>
          <DialogDescription>
            Import and reconcile employer, worksite, and occupation reference
            data with fuzzy matching and alias management.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        {isLoading && step === "upload" ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Parsing and analysing spreadsheet...
            </p>
          </div>
        ) : (
          <>
            {step === "upload" && renderUpload()}
            {step === "employers" && renderEmployers()}
            {step === "worksites" && renderWorksites()}
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
