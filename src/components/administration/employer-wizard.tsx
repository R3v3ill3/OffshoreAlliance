"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import type {
  Employer,
  Worksite,
  WizardProposals,
  EmployerGroupProposal,
  CategoryProposal,
  WorksitePeProposal,
  WizardConfidence,
  WizardApplyResult,
  EmployerCategory,
} from "@/types/database";
import {
  detectEmployerGroups,
  proposeCategories,
  proposeWorksitePeAssignments,
} from "@/lib/utils/employer-fuzzy";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  Sparkles,
  ArrowRight,
  Loader2,
  RotateCcw,
  Download,
  CheckCheck,
  Merge,
  UserPlus,
  Search,
  ChevronDown,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

type WizardStep =
  | "idle"
  | "loading"
  | "review_groups"
  | "review_categories"
  | "review_worksites"
  | "confirm"
  | "applying"
  | "done";

const REVIEW_STEPS: WizardStep[] = [
  "idle",
  "review_groups",
  "review_categories",
  "review_worksites",
  "confirm",
];

const STEP_LABELS: Record<string, string> = {
  idle: "Analyse",
  review_groups: "Parent Groups",
  review_categories: "Categories",
  review_worksites: "Worksites",
  confirm: "Confirm & Apply",
};

const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  "Producer",
  "Major_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Specialist",
];

// ── Error Boundary ─────────────────────────────────────────

class WizardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message ??
                "An unexpected error occurred in the Employer Wizard."}
            </p>
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// ── Helpers ────────────────────────────────────────────────

function confidenceBadge(c: WizardConfidence) {
  const map = {
    high: <Badge variant="success">High</Badge>,
    medium: <Badge variant="warning">Medium</Badge>,
    low: <Badge variant="destructive">Low</Badge>,
  };
  return map[c];
}

function sourceBadge(source: "fuzzy" | "ai" | "merged") {
  if (source === "ai")
    return (
      <Badge variant="info" className="gap-1">
        <Sparkles className="h-3 w-3" /> AI
      </Badge>
    );
  if (source === "merged") return <Badge variant="secondary">Merged</Badge>;
  return <Badge variant="outline">Fuzzy</Badge>;
}

function stepIndex(step: WizardStep): number {
  const idx = REVIEW_STEPS.indexOf(step);
  return idx >= 0 ? idx : -1;
}

// ── Merge logic ────────────────────────────────────────────

interface AiProposals {
  employer_groups: {
    proposed_parent_name: string;
    member_employer_ids: number[];
    confidence: string;
  }[];
  category_assignments: {
    employer_id: number;
    proposed_category: string;
    confidence: string;
    reasoning: string;
  }[];
  worksite_pe_assignments: {
    worksite_id: number;
    principal_employer_id: number;
    confidence: string;
    reasoning: string;
  }[];
}

function mergeProposals(
  fuzzy: WizardProposals,
  ai: AiProposals | null,
  principalEmployers: Pick<Employer, "employer_id" | "employer_name">[]
): WizardProposals {
  if (!ai) return fuzzy;

  const categoryMap = new Map(
    fuzzy.categoryAssignments.map((c) => [c.employerId, c])
  );
  for (const aiCat of ai.category_assignments) {
    if (aiCat.confidence === "high" || aiCat.confidence === "medium") {
      const existing = categoryMap.get(aiCat.employer_id);
      categoryMap.set(aiCat.employer_id, {
        ...(existing ?? {
          employerId: aiCat.employer_id,
          employerName: "",
          currentCategory: null,
          overridden: false,
        }),
        proposedCategory: aiCat.proposed_category,
        confidence: aiCat.confidence as WizardConfidence,
        reasoning: aiCat.reasoning,
        source: "ai",
        accepted: false,
        overridden: false,
      });
    }
  }

  const aiGroupIds = new Set(
    ai.employer_groups.flatMap((g) => g.member_employer_ids)
  );
  const fuzzyGroupsNotInAi = fuzzy.employerGroups.filter(
    (fg) => !fg.memberEmployerIds.some((id) => aiGroupIds.has(id))
  );
  const aiGroups: EmployerGroupProposal[] = ai.employer_groups.map((g) => ({
    proposedParentName: g.proposed_parent_name,
    existingParentId: null,
    isNewParent: true,
    memberEmployerIds: g.member_employer_ids,
    confidence: g.confidence as WizardConfidence,
    source: "ai",
    accepted: false,
  }));

  const wsMap = new Map(
    fuzzy.worksitePeAssignments.map((w) => [w.worksiteId, w])
  );
  for (const aiWs of ai.worksite_pe_assignments) {
    if (aiWs.confidence === "high" || aiWs.confidence === "medium") {
      const pe = principalEmployers.find(
        (p) => p.employer_id === aiWs.principal_employer_id
      );
      if (!pe) continue;
      const existing = wsMap.get(aiWs.worksite_id);
      if (existing) {
        wsMap.set(aiWs.worksite_id, {
          ...existing,
          proposedPrincipalEmployerId: aiWs.principal_employer_id,
          proposedPrincipalEmployerName: pe.employer_name,
          confidence: aiWs.confidence as WizardConfidence,
          reasoning: aiWs.reasoning,
          source: "ai",
        });
      }
    }
  }

  return {
    employerGroups: [...aiGroups, ...fuzzyGroupsNotInAi],
    categoryAssignments: Array.from(categoryMap.values()),
    worksitePeAssignments: Array.from(wsMap.values()),
  };
}

// ── CSV export ─────────────────────────────────────────────

function downloadManifestCsv(
  proposals: WizardProposals,
  employers: Employer[]
) {
  const empMap = new Map(employers.map((e) => [e.employer_id, e.employer_name]));
  const lines: string[] = [
    "Change Type,Entity,Current Value,Proposed Value,Confidence,Source",
  ];

  for (const g of proposals.employerGroups.filter((g) => g.accepted)) {
    const members = g.memberEmployerIds
      .map((id) => empMap.get(id) ?? String(id))
      .join("; ");
    lines.push(
      `Parent Group,"${g.proposedParentName}","Members: ${members}","Link to parent",${g.confidence},${g.source}`
    );
  }
  for (const c of proposals.categoryAssignments.filter((c) => c.accepted)) {
    lines.push(
      `Category,"${c.employerName}","${c.currentCategory ?? "None"}","${c.proposedCategory}",${c.confidence},${c.source}`
    );
  }
  for (const w of proposals.worksitePeAssignments.filter((w) => w.accepted)) {
    lines.push(
      `Worksite PE,"${w.worksiteName}","${w.currentPrincipalEmployerName ?? "None"}","${w.proposedPrincipalEmployerName}",${w.confidence},${w.source}`
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employer-wizard-manifest-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ─────────────────────────────────────────

function EmployerWizardInner() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState<WizardStep>("idle");
  const [proposals, setProposals] = useState<WizardProposals | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<WizardApplyResult | null>(
    null
  );
  const [elapsedMs, setElapsedMs] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Snapshot of data at analysis time for stale-data detection
  const snapshotRef = useRef<{
    employers: Employer[];
    worksites: Worksite[];
  } | null>(null);

  const { data: employers = [], isLoading: loadingEmployers } = useQuery({
    queryKey: ["wizard-employers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select(
          "employer_id, employer_name, trading_name, employer_category, parent_employer_id, abn, is_active, updated_at, created_at, parent_company, website, phone, email, address, state, postcode"
        )
        .order("employer_name")
        .limit(5000);
      if (error) throw error;
      return data as Employer[];
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const { data: worksites = [], isLoading: loadingWorksites } = useQuery({
    queryKey: ["wizard-worksites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select(
          "worksite_id, worksite_name, worksite_type, operator_id, principal_employer_id, basin, is_offshore, is_active, updated_at, created_at, location_description, latitude, longitude, notes"
        )
        .order("worksite_name")
        .limit(5000);
      if (error) throw error;
      return data as Worksite[];
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const principalEmployers = useMemo(
    () => employers.filter((e) => e.employer_category === "Principal_Employer"),
    [employers]
  );

  const employerMap = useMemo(
    () => new Map(employers.map((e) => [e.employer_id, e])),
    [employers]
  );

  // ── Analysis ─────────────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    setStep("loading");
    setError(null);
    setAiUsed(false);
    setElapsedMs(0);

    const startTime = Date.now();
    timerRef.current = setInterval(
      () => setElapsedMs(Date.now() - startTime),
      500
    );

    snapshotRef.current = {
      employers: [...employers],
      worksites: [...worksites],
    };

    const operatorMap = new Map(employers.map((e) => [e.employer_id, e]));
    const fuzzyGroups = detectEmployerGroups(employers);
    const fuzzyCategories = proposeCategories(employers);
    const fuzzyWorksites = proposeWorksitePeAssignments(
      worksites,
      principalEmployers,
      operatorMap
    );

    let merged: WizardProposals = {
      employerGroups: fuzzyGroups,
      categoryAssignments: fuzzyCategories,
      worksitePeAssignments: fuzzyWorksites,
    };

    if (useAi) {
      try {
        abortRef.current = new AbortController();
        const timeoutId = setTimeout(() => abortRef.current?.abort(), 60000);

        const res = await fetch("/api/employer-wizard/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            employers: employers
              .filter((e) => e.employer_category !== "Principal_Employer")
              .map((e) => ({
                id: e.employer_id,
                name: e.employer_name,
                trading_name: e.trading_name,
                current_category: e.employer_category,
              })),
            worksites: worksites.map((w) => {
              const op = operatorMap.get(w.operator_id ?? 0);
              return {
                id: w.worksite_id,
                name: w.worksite_name,
                type: w.worksite_type,
                operator_name: op?.employer_name ?? null,
                basin: w.basin,
                is_offshore: w.is_offshore,
              };
            }),
            principalEmployers: principalEmployers.map((p) => ({
              id: p.employer_id,
              name: p.employer_name,
            })),
          }),
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.proposals) {
            merged = mergeProposals(merged, data.proposals, principalEmployers);
            setAiUsed(true);
          }
        }
      } catch {
        // AI failed — fuzzy-only
      }
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setElapsedMs(0);

    if (
      merged.employerGroups.length === 0 &&
      merged.categoryAssignments.length === 0 &&
      merged.worksitePeAssignments.length === 0
    ) {
      setError(
        "No proposals found — your data appears to be already well-structured."
      );
      setStep("idle");
      return;
    }

    setProposals(merged);
    setStep("review_groups");
  }, [employers, worksites, principalEmployers, useAi]);

  const cancelAnalysis = useCallback(() => {
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setStep("idle");
    setElapsedMs(0);
  }, []);

  // ── Navigation ───────────────────────────────────────────

  const canGoBack = (s: WizardStep) =>
    s !== "idle" &&
    s !== "loading" &&
    s !== "applying" &&
    s !== "done" &&
    stepIndex(s) > 0;

  const canGoForward = (s: WizardStep) =>
    s !== "idle" &&
    s !== "loading" &&
    s !== "applying" &&
    s !== "done" &&
    s !== "confirm";

  const goBack = useCallback(() => {
    const idx = stepIndex(step);
    if (idx > 0) setStep(REVIEW_STEPS[idx - 1]);
  }, [step]);

  const goForward = useCallback(() => {
    const idx = stepIndex(step);
    if (idx >= 0 && idx < REVIEW_STEPS.length - 1)
      setStep(REVIEW_STEPS[idx + 1]);
  }, [step]);

  const resetWizard = useCallback(() => {
    setStep("idle");
    setProposals(null);
    setAiUsed(false);
    setError(null);
    setApplyResult(null);
    snapshotRef.current = null;
    queryClient.invalidateQueries({ queryKey: ["wizard-employers"] });
    queryClient.invalidateQueries({ queryKey: ["wizard-worksites"] });
  }, [queryClient]);

  // ── Proposal mutation helpers ────────────────────────────

  const updateGroup = useCallback(
    (index: number, updates: Partial<EmployerGroupProposal>) => {
      setProposals((prev) => {
        if (!prev) return prev;
        const groups = [...prev.employerGroups];
        groups[index] = { ...groups[index], ...updates };
        return { ...prev, employerGroups: groups };
      });
    },
    []
  );

  const removeGroupMember = useCallback(
    (groupIndex: number, employerId: number) => {
      setProposals((prev) => {
        if (!prev) return prev;
        const groups = [...prev.employerGroups];
        const g = groups[groupIndex];
        const updated = g.memberEmployerIds.filter((id) => id !== employerId);
        if (updated.length === 0) {
          groups.splice(groupIndex, 1);
        } else {
          groups[groupIndex] = { ...g, memberEmployerIds: updated };
        }
        return { ...prev, employerGroups: groups };
      });
    },
    []
  );

  // Option A: absorb all members of sourceIdx into targetIdx, remove source group
  const mergeGroups = useCallback(
    (targetIdx: number, sourceIdx: number) => {
      setProposals((prev) => {
        if (!prev) return prev;
        const groups = [...prev.employerGroups];
        const source = groups[sourceIdx];
        const target = groups[targetIdx];

        // Collect all member IDs from source (including the source's own
        // existingParentId if it pointed to an existing employer, so that
        // employer doesn't become orphaned)
        const allSourceIds = [...source.memberEmployerIds];
        if (!source.isNewParent && source.existingParentId !== null) {
          if (!allSourceIds.includes(source.existingParentId)) {
            allSourceIds.push(source.existingParentId);
          }
        }

        // Deduplicate against target's existing members and its own parent
        const existingIds = new Set(target.memberEmployerIds);
        if (!target.isNewParent && target.existingParentId !== null) {
          existingIds.add(target.existingParentId);
        }
        const newMembers = allSourceIds.filter((id) => !existingIds.has(id));

        groups[targetIdx] = {
          ...target,
          memberEmployerIds: [...target.memberEmployerIds, ...newMembers],
          confidence: "medium", // merged manually — downgrade confidence
          source: "merged",
        };

        // Remove the source group (higher index first to avoid shift issues)
        const removeIdx = sourceIdx > targetIdx ? sourceIdx : sourceIdx;
        groups.splice(removeIdx, 1);

        return { ...prev, employerGroups: groups };
      });
    },
    []
  );

  // Option B: add any employer (from any group or unassigned) to a target group.
  // If they're already in another group, remove them from that group.
  const addEmployerToGroup = useCallback(
    (targetGroupIdx: number, employerId: number) => {
      setProposals((prev) => {
        if (!prev) return prev;
        const groups = prev.employerGroups.map((g) => ({ ...g, memberEmployerIds: [...g.memberEmployerIds] }));

        // Remove from any existing group (don't remove if they're the existing parent —
        // only remove from the members list)
        for (let i = 0; i < groups.length; i++) {
          if (i === targetGroupIdx) continue;
          const memberIdx = groups[i].memberEmployerIds.indexOf(employerId);
          if (memberIdx !== -1) {
            groups[i].memberEmployerIds.splice(memberIdx, 1);
            // If this group now has no members left, mark for removal
            if (groups[i].memberEmployerIds.length === 0 && groups[i].isNewParent) {
              groups[i] = { ...groups[i], memberEmployerIds: [] }; // keep, cleaned below
            }
          }
        }

        // Add to target (deduplicate)
        const target = groups[targetGroupIdx];
        if (!target.memberEmployerIds.includes(employerId)) {
          groups[targetGroupIdx] = {
            ...target,
            memberEmployerIds: [...target.memberEmployerIds, employerId],
          };
        }

        // Remove any groups that now have no members (and no existing parent to anchor them)
        const cleaned = groups.filter(
          (g, i) => i === targetGroupIdx || g.memberEmployerIds.length > 0
        );

        return { ...prev, employerGroups: cleaned };
      });
    },
    []
  );

  const updateCategory = useCallback(
    (index: number, updates: Partial<CategoryProposal>) => {
      setProposals((prev) => {
        if (!prev) return prev;
        const cats = [...prev.categoryAssignments];
        cats[index] = { ...cats[index], ...updates };
        return { ...prev, categoryAssignments: cats };
      });
    },
    []
  );

  const updateWorksite = useCallback(
    (index: number, updates: Partial<WorksitePeProposal>) => {
      setProposals((prev) => {
        if (!prev) return prev;
        const ws = [...prev.worksitePeAssignments];
        ws[index] = { ...ws[index], ...updates };
        return { ...prev, worksitePeAssignments: ws };
      });
    },
    []
  );

  const bulkAcceptHigh = useCallback(
    (type: "groups" | "categories" | "worksites") => {
      setProposals((prev) => {
        if (!prev) return prev;
        switch (type) {
          case "groups":
            return {
              ...prev,
              employerGroups: prev.employerGroups.map((g) =>
                g.confidence === "high" ? { ...g, accepted: true } : g
              ),
            };
          case "categories":
            return {
              ...prev,
              categoryAssignments: prev.categoryAssignments.map((c) =>
                c.confidence === "high" ? { ...c, accepted: true } : c
              ),
            };
          case "worksites":
            return {
              ...prev,
              worksitePeAssignments: prev.worksitePeAssignments.map((w) =>
                w.confidence === "high" ? { ...w, accepted: true } : w
              ),
            };
        }
      });
    },
    []
  );

  // ── Apply ────────────────────────────────────────────────

  const applyChanges = useCallback(async () => {
    if (!proposals || !snapshotRef.current) return;

    setStep("applying");
    setError(null);

    const snapshot = snapshotRef.current;
    const empSnapshot = new Map(
      snapshot.employers.map((e) => [e.employer_id, e])
    );
    const wsSnapshot = new Map(
      snapshot.worksites.map((w) => [w.worksite_id, w])
    );

    const parent_groups = proposals.employerGroups
      .filter((g) => g.accepted)
      .map((g) => ({
        proposed_parent_name: g.proposedParentName,
        existing_parent_id: g.existingParentId,
        is_new_parent: g.isNewParent,
        member_employer_ids: g.memberEmployerIds,
      }));

    const category_updates = proposals.categoryAssignments
      .filter((c) => c.accepted)
      .map((c) => ({
        employer_id: c.employerId,
        proposed_category: c.proposedCategory,
        expected_updated_at:
          empSnapshot.get(c.employerId)?.updated_at ?? null,
      }));

    const worksite_updates = proposals.worksitePeAssignments
      .filter((w) => w.accepted)
      .map((w) => ({
        worksite_id: w.worksiteId,
        principal_employer_id: w.proposedPrincipalEmployerId,
        expected_updated_at:
          wsSnapshot.get(w.worksiteId)?.updated_at ?? null,
      }));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch("/api/employer-wizard/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          parent_groups,
          category_updates,
          worksite_updates,
        }),
      });

      clearTimeout(timeoutId);
      const result: WizardApplyResult = await res.json();
      setApplyResult(result);
      setStep("done");

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["employers"] });
        queryClient.invalidateQueries({ queryKey: ["worksites"] });
        queryClient.invalidateQueries({
          queryKey: ["principal-employer-eba-summary"],
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to apply changes"
      );
      setStep("confirm");
    }
  }, [proposals, queryClient]);

  // ── Accepted counts for confirmation ─────────────────────

  const acceptedGroups = proposals?.employerGroups.filter((g) => g.accepted) ?? [];
  const acceptedCategories = proposals?.categoryAssignments.filter((c) => c.accepted) ?? [];
  const acceptedWorksites = proposals?.worksitePeAssignments.filter((w) => w.accepted) ?? [];
  const totalAccepted =
    acceptedGroups.length +
    acceptedCategories.length +
    acceptedWorksites.length;

  // ── Step Indicator ───────────────────────────────────────

  const currentStepIdx = stepIndex(step);

  function StepIndicator() {
    return (
      <div className="flex items-center gap-2 mb-6">
        {REVIEW_STEPS.map((s, i) => {
          const isActive =
            step === s || (step === "loading" && s === "idle");
          const isCompleted =
            currentStepIdx > i ||
            step === "applying" ||
            step === "done";
          const isClickable =
            isCompleted &&
            step !== "applying" &&
            step !== "done" &&
            step !== "loading";

          return (
            <React.Fragment key={s}>
              {i > 0 && (
                <div
                  className={`flex-1 h-0.5 ${isCompleted ? "bg-primary" : "bg-muted"}`}
                />
              )}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && setStep(s)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30"
                      : "bg-muted text-muted-foreground"
                } ${isClickable ? "" : "cursor-default"}`}
                title={STEP_LABELS[s]}
              >
                {isCompleted && !isActive ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // ── Step 1: Idle / Loading ───────────────────────────────

  function IdleStep() {
    const dataLoading = loadingEmployers || loadingWorksites;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Employer Connection Wizard</CardTitle>
          <CardDescription>
            Analyse employer and worksite data to detect corporate families,
            assign categories, and link worksites to Principal Employers.
            All proposed changes are reviewed before anything is written.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dataLoading ? (
            <div className="flex items-center gap-3">
              <EurekaLoadingSpinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Loading employer and worksite data...
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="secondary">
                  {employers.length} employers
                </Badge>
                <Badge variant="secondary">
                  {worksites.length} worksites
                </Badge>
                <Badge variant="secondary">
                  {principalEmployers.length} Principal Employers
                </Badge>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useAi}
                    onChange={(e) => setUseAi(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>Use AI-enhanced analysis</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  (requires ANTHROPIC_API_KEY; falls back to fuzzy matching)
                </span>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button onClick={runAnalysis} disabled={employers.length === 0}>
                Run Analysis
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  function LoadingStep() {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <EurekaLoadingSpinner size="lg" />
          <div>
            <p className="text-sm font-medium">
              Analysing {employers.length} employers and{" "}
              {worksites.length} worksites...
            </p>
            {useAi && (
              <p className="text-xs text-muted-foreground mt-1">
                Running local analysis, then sending to AI for enhanced
                matching...
              </p>
            )}
            {elapsedMs > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round(elapsedMs / 1000)}s elapsed
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={cancelAnalysis}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Step 2: Review Groups ────────────────────────────────

  function GroupsStep() {
    if (!proposals) return null;
    const groups = proposals.employerGroups;
    const totalMembers = groups.reduce(
      (sum, g) => sum + g.memberEmployerIds.length,
      0
    );

    // Compute the set of employer IDs already in any group (members + existing parents)
    const assignedIds = useMemo(() => {
      const ids = new Set<number>();
      for (const g of groups) {
        g.memberEmployerIds.forEach((id) => ids.add(id));
        if (!g.isNewParent && g.existingParentId !== null) {
          ids.add(g.existingParentId);
        }
      }
      return ids;
    }, [groups]);

    // Option C: employers not in any group and not a Principal Employer
    const unassignedEmployers = useMemo(() =>
      employers.filter(
        (e) =>
          e.employer_category !== "Principal_Employer" &&
          !assignedIds.has(e.employer_id)
      ),
      [assignedIds]
    );

    // Local state for the Option B search box (one per group card, keyed by index)
    const [memberSearch, setMemberSearch] = useState<Record<number, string>>({});
    const [memberSearchOpen, setMemberSearchOpen] = useState<Record<number, boolean>>({});
    // Option C: search within the unassigned panel
    const [unassignedSearch, setUnassignedSearch] = useState("");
    const [unassignedPanelOpen, setUnassignedPanelOpen] = useState(false);

    // Option B: employers not already a member of the target group, excluding PEs
    function searchableEmployersForGroup(gi: number): Employer[] {
      const g = groups[gi];
      const inThisGroup = new Set(g.memberEmployerIds);
      if (!g.isNewParent && g.existingParentId !== null) inThisGroup.add(g.existingParentId);
      return employers.filter(
        (e) =>
          e.employer_category !== "Principal_Employer" &&
          !inThisGroup.has(e.employer_id)
      );
    }

    function filteredSearchResults(gi: number): Employer[] {
      const q = (memberSearch[gi] ?? "").toLowerCase().trim();
      if (!q) return [];
      return searchableEmployersForGroup(gi).filter((e) =>
        e.employer_name.toLowerCase().includes(q) ||
        (e.trading_name ?? "").toLowerCase().includes(q)
      ).slice(0, 12);
    }

    const filteredUnassigned = useMemo(() => {
      const q = unassignedSearch.toLowerCase().trim();
      if (!q) return unassignedEmployers;
      return unassignedEmployers.filter(
        (e) =>
          e.employer_name.toLowerCase().includes(q) ||
          (e.trading_name ?? "").toLowerCase().includes(q)
      );
    }, [unassignedEmployers, unassignedSearch]);

    // Which group (if any) currently contains a given employer, for display hints
    function groupContaining(employerId: number): number | null {
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].memberEmployerIds.includes(employerId)) return i;
        if (!groups[i].isNewParent && groups[i].existingParentId === employerId) return i;
      }
      return null;
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Detected Corporate Groups
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">
                {groups.length} group{groups.length !== 1 ? "s" : ""} ({totalMembers} employer{totalMembers !== 1 ? "s" : ""})
              </Badge>
              {unassignedEmployers.length > 0 && (
                <Badge variant="outline">
                  {unassignedEmployers.length} unassigned
                </Badge>
              )}
              {aiUsed && (
                <Badge variant="info" className="gap-1">
                  <Sparkles className="h-3 w-3" /> AI-enhanced
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkAcceptHigh("groups")}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Pre-select high confidence
          </Button>
        </div>

        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No corporate groups detected.
            </CardContent>
          </Card>
        ) : (
          groups.map((group, gi) => {
            const searchResults = filteredSearchResults(gi);
            const isSearchOpen = memberSearchOpen[gi] ?? false;

            return (
              <Card
                key={gi}
                className={group.accepted ? "border-green-300 dark:border-green-800" : ""}
              >
                <CardContent className="py-4 space-y-3">
                  {/* Header row: name + confidence + controls */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <Input
                        value={group.proposedParentName}
                        onChange={(e) =>
                          updateGroup(gi, {
                            proposedParentName: e.target.value,
                          })
                        }
                        className="max-w-xs font-medium"
                      />
                      {confidenceBadge(group.confidence)}
                      {sourceBadge(group.source)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={group.isNewParent ? "new" : "existing"}
                        onValueChange={(v) =>
                          updateGroup(gi, { isNewParent: v === "new" })
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="existing">
                            Use existing employer
                          </SelectItem>
                          <SelectItem value="new">
                            Create new parent
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant={group.accepted ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          updateGroup(gi, { accepted: !group.accepted })
                        }
                      >
                        {group.accepted ? "Accepted" : "Accept"}
                      </Button>
                    </div>
                  </div>

                  {/* Member badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {group.memberEmployerIds.map((id) => (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {employerMap.get(id)?.employer_name ?? `#${id}`}
                        <button
                          type="button"
                          onClick={() => removeGroupMember(gi, id)}
                          className="ml-0.5 hover:text-destructive"
                          title="Remove from group"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>

                  <Separator className="my-1" />

                  {/* Option A + B toolbar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Option A: Merge another detected group into this one */}
                    {groups.length > 1 && (
                      <Select
                        value=""
                        onValueChange={(v) => {
                          const sourceIdx = Number(v);
                          mergeGroups(gi, sourceIdx);
                        }}
                      >
                        <SelectTrigger className="w-auto h-8 text-xs gap-1 border-dashed">
                          <Merge className="h-3 w-3 shrink-0" />
                          <SelectValue placeholder="Merge group into this one..." />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g, i) => {
                            if (i === gi) return null;
                            return (
                              <SelectItem key={i} value={String(i)}>
                                {g.proposedParentName}
                                {g.memberEmployerIds.length > 0 && (
                                  <span className="text-muted-foreground ml-1">
                                    ({g.memberEmployerIds.length} member{g.memberEmployerIds.length !== 1 ? "s" : ""})
                                  </span>
                                )}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Option B: Search and add any employer to this group */}
                    <div className="relative">
                      <div className="flex items-center h-8 rounded-md border border-dashed border-input px-2 gap-1.5 text-xs text-muted-foreground min-w-[220px]">
                        <Search className="h-3 w-3 shrink-0" />
                        <input
                          type="text"
                          placeholder="Add employer to this group..."
                          value={memberSearch[gi] ?? ""}
                          className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                          onChange={(e) => {
                            setMemberSearch((prev) => ({ ...prev, [gi]: e.target.value }));
                            setMemberSearchOpen((prev) => ({ ...prev, [gi]: true }));
                          }}
                          onFocus={() =>
                            setMemberSearchOpen((prev) => ({ ...prev, [gi]: true }))
                          }
                          onBlur={() =>
                            setTimeout(() =>
                              setMemberSearchOpen((prev) => ({ ...prev, [gi]: false })), 150
                            )
                          }
                        />
                        {(memberSearch[gi] ?? "") && (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setMemberSearch((prev) => ({ ...prev, [gi]: "" }));
                            }}
                          >
                            <X className="h-3 w-3 hover:text-destructive" />
                          </button>
                        )}
                      </div>
                      {isSearchOpen && searchResults.length > 0 && (
                        <div className="absolute top-full left-0 mt-1 z-50 w-72 rounded-md border bg-popover shadow-md">
                          <ul className="py-1 max-h-48 overflow-y-auto">
                            {searchResults.map((emp) => {
                              const currentGroupIdx = groupContaining(emp.employer_id);
                              return (
                                <li key={emp.employer_id}>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center justify-between gap-2"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      addEmployerToGroup(gi, emp.employer_id);
                                      setMemberSearch((prev) => ({ ...prev, [gi]: "" }));
                                      setMemberSearchOpen((prev) => ({ ...prev, [gi]: false }));
                                    }}
                                  >
                                    <span>{emp.employer_name}</span>
                                    {currentGroupIdx !== null && currentGroupIdx !== gi && (
                                      <span className="text-xs text-muted-foreground shrink-0">
                                        from: {groups[currentGroupIdx]?.proposedParentName}
                                      </span>
                                    )}
                                    {currentGroupIdx === null && (
                                      <span className="text-xs text-muted-foreground shrink-0">unassigned</span>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {isSearchOpen && (memberSearch[gi] ?? "").trim().length > 0 && searchResults.length === 0 && (
                        <div className="absolute top-full left-0 mt-1 z-50 w-72 rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
                          No matching employers found.
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {/* Option C: Unassigned employers panel */}
        {unassignedEmployers.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="py-3">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium w-full text-left"
                onClick={() => setUnassignedPanelOpen((v) => !v)}
              >
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <span>
                  {unassignedEmployers.length} employer{unassignedEmployers.length !== 1 ? "s" : ""} not in any group
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground ml-auto transition-transform ${unassignedPanelOpen ? "rotate-180" : ""}`}
                />
              </button>

              {unassignedPanelOpen && (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filter unassigned employers..."
                      value={unassignedSearch}
                      onChange={(e) => setUnassignedSearch(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 text-sm rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  {groups.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      Create a group above first, then you can assign employers to it.
                    </p>
                  ) : (
                    <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
                      {filteredUnassigned.map((emp) => (
                        <div
                          key={emp.employer_id}
                          className="flex items-center justify-between px-3 py-2 text-sm"
                        >
                          <span>
                            {emp.employer_name}
                            {emp.trading_name && emp.trading_name !== emp.employer_name && (
                              <span className="text-muted-foreground ml-1 text-xs">
                                ({emp.trading_name})
                              </span>
                            )}
                          </span>
                          <Select
                            value=""
                            onValueChange={(v) => {
                              addEmployerToGroup(Number(v), emp.employer_id);
                            }}
                          >
                            <SelectTrigger className="w-[160px] h-7 text-xs">
                              <SelectValue placeholder="Add to group..." />
                            </SelectTrigger>
                            <SelectContent>
                              {groups.map((g, gi) => (
                                <SelectItem key={gi} value={String(gi)}>
                                  {g.proposedParentName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                      {filteredUnassigned.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No matching employers.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Step 3: Review Categories ────────────────────────────

  function CategoriesStep() {
    if (!proposals) return null;
    const cats = proposals.categoryAssignments;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Category Assignments</h2>
            <Badge variant="secondary" className="mt-1">
              {cats.length} proposals
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkAcceptHigh("categories")}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Pre-select high confidence
          </Button>
        </div>

        {cats.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No category changes proposed.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Employer</th>
                  <th className="text-left p-3 font-medium">Current</th>
                  <th className="text-left p-3 font-medium">Proposed</th>
                  <th className="text-left p-3 font-medium">Confidence</th>
                  <th className="text-left p-3 font-medium">Override</th>
                  <th className="text-center p-3 font-medium">Accept</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((cat, ci) => (
                  <tr
                    key={cat.employerId}
                    className={`border-b last:border-0 ${cat.accepted ? "bg-green-50 dark:bg-green-950/20" : ""}`}
                  >
                    <td className="p-3">
                      <div>
                        <span className="font-medium">{cat.employerName}</span>
                        {cat.overridden && (
                          <Badge variant="info" className="ml-2 text-[10px]">
                            edited
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {cat.reasoning}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">
                        {cat.currentCategory ?? "None"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {cat.proposedCategory}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {confidenceBadge(cat.confidence)}
                        {sourceBadge(cat.source)}
                      </div>
                    </td>
                    <td className="p-3">
                      <Select
                        value={cat.proposedCategory}
                        onValueChange={(v) =>
                          updateCategory(ci, {
                            proposedCategory: v,
                            overridden: true,
                          })
                        }
                      >
                        <SelectTrigger className="w-[160px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EMPLOYER_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant={cat.accepted ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          updateCategory(ci, { accepted: !cat.accepted })
                        }
                      >
                        {cat.accepted ? "Yes" : "No"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Step 4: Review Worksites ─────────────────────────────

  function WorksitesStep() {
    if (!proposals) return null;
    const ws = proposals.worksitePeAssignments;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Worksite &rarr; Principal Employer
            </h2>
            <Badge variant="secondary" className="mt-1">
              {ws.length} proposals
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkAcceptHigh("worksites")}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Pre-select high confidence
          </Button>
        </div>

        {ws.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No worksite PE changes proposed.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Worksite</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Current PE</th>
                  <th className="text-left p-3 font-medium">Proposed PE</th>
                  <th className="text-left p-3 font-medium">Confidence</th>
                  <th className="text-left p-3 font-medium">Override</th>
                  <th className="text-center p-3 font-medium">Accept</th>
                </tr>
              </thead>
              <tbody>
                {ws.map((w, wi) => (
                  <tr
                    key={w.worksiteId}
                    className={`border-b last:border-0 ${w.accepted ? "bg-green-50 dark:bg-green-950/20" : ""}`}
                  >
                    <td className="p-3">
                      <div>
                        <span className="font-medium">{w.worksiteName}</span>
                        {w.overridden && (
                          <Badge variant="info" className="ml-2 text-[10px]">
                            edited
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {w.reasoning}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{w.worksiteType}</Badge>
                    </td>
                    <td className="p-3">
                      {w.currentPrincipalEmployerName ?? (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {w.proposedPrincipalEmployerName}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {confidenceBadge(w.confidence)}
                        {sourceBadge(w.source)}
                      </div>
                    </td>
                    <td className="p-3">
                      <Select
                        value={String(w.proposedPrincipalEmployerId)}
                        onValueChange={(v) => {
                          const pe = principalEmployers.find(
                            (p) => p.employer_id === Number(v)
                          );
                          if (pe) {
                            updateWorksite(wi, {
                              proposedPrincipalEmployerId: pe.employer_id,
                              proposedPrincipalEmployerName: pe.employer_name,
                              overridden: true,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {principalEmployers.map((pe) => (
                            <SelectItem
                              key={pe.employer_id}
                              value={String(pe.employer_id)}
                            >
                              {pe.employer_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant={w.accepted ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          updateWorksite(wi, { accepted: !w.accepted })
                        }
                      >
                        {w.accepted ? "Yes" : "No"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Step 5: Confirm & Apply ──────────────────────────────

  function ConfirmStep() {
    if (!proposals) return null;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Review Changes Before Applying
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadManifestCsv(proposals, snapshotRef.current?.employers ?? employers)
            }
          >
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>

        {totalAccepted === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-muted-foreground">
                No changes accepted. Go back to review and accept proposals
                before applying.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Parent groups manifest */}
            {acceptedGroups.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    New Parent Company Links ({acceptedGroups.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {acceptedGroups.map((g, i) => (
                      <div key={i} className="text-sm border-b last:border-0 pb-2 last:pb-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {g.proposedParentName}
                          </span>
                          {g.isNewParent ? (
                            <Badge variant="info" className="text-[10px]">
                              new record
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              existing
                            </Badge>
                          )}
                          {confidenceBadge(g.confidence)}
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          Members:{" "}
                          {g.memberEmployerIds
                            .map(
                              (id) =>
                                employerMap.get(id)?.employer_name ??
                                `#${id}`
                            )
                            .join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category manifest */}
            {acceptedCategories.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Category Changes ({acceptedCategories.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">
                            Employer
                          </th>
                          <th className="text-left p-2 font-medium">
                            Current
                          </th>
                          <th className="text-center p-2 font-medium w-8" />
                          <th className="text-left p-2 font-medium">
                            New
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {acceptedCategories.map((c) => (
                          <tr key={c.employerId} className="border-b last:border-0">
                            <td className="p-2 font-medium">
                              {c.employerName}
                              {c.overridden && (
                                <Badge
                                  variant="info"
                                  className="ml-2 text-[10px]"
                                >
                                  edited
                                </Badge>
                              )}
                            </td>
                            <td className="p-2">
                              <Badge variant="outline">
                                {c.currentCategory ?? "None"}
                              </Badge>
                            </td>
                            <td className="p-2 text-center">
                              <ArrowRight className="h-3 w-3 text-muted-foreground inline" />
                            </td>
                            <td className="p-2">
                              <Badge variant="secondary">
                                {c.proposedCategory}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Worksite PE manifest */}
            {acceptedWorksites.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Worksite PE Assignments ({acceptedWorksites.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">
                            Worksite
                          </th>
                          <th className="text-left p-2 font-medium">
                            Current PE
                          </th>
                          <th className="text-center p-2 font-medium w-8" />
                          <th className="text-left p-2 font-medium">
                            New PE
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {acceptedWorksites.map((w) => (
                          <tr key={w.worksiteId} className="border-b last:border-0">
                            <td className="p-2 font-medium">
                              {w.worksiteName}
                              {w.overridden && (
                                <Badge
                                  variant="info"
                                  className="ml-2 text-[10px]"
                                >
                                  edited
                                </Badge>
                              )}
                            </td>
                            <td className="p-2">
                              {w.currentPrincipalEmployerName ?? (
                                <span className="text-muted-foreground">
                                  None
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <ArrowRight className="h-3 w-3 text-muted-foreground inline" />
                            </td>
                            <td className="p-2">
                              <Badge variant="secondary">
                                {w.proposedPrincipalEmployerName}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator />

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {totalAccepted} change{totalAccepted !== 1 ? "s" : ""} will be
                applied in a single atomic transaction.
              </p>
              <Button onClick={applyChanges}>
                Apply All Accepted Changes
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Applying / Done ──────────────────────────────────────

  function ApplyingStep() {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <EurekaLoadingSpinner size="lg" />
          <p className="text-sm font-medium">Applying changes...</p>
          <p className="text-xs text-muted-foreground">
            All changes are applied atomically — if anything fails, nothing
            is written.
          </p>
        </CardContent>
      </Card>
    );
  }

  function DoneStep() {
    if (!applyResult) return null;

    if (!applyResult.success) {
      return (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Changes Not Applied
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{applyResult.message ?? applyResult.error}</p>
            {applyResult.conflicts && applyResult.conflicts.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Stale data conflicts:</p>
                {applyResult.conflicts.map((c, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {c.type} #{c.id} ({c.field}): expected{" "}
                    {c.expected}, actual {c.actual}
                  </p>
                ))}
              </div>
            )}
            <Button onClick={resetWizard}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Start Over with Fresh Data
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-green-300 dark:border-green-800">
        <CardHeader>
          <CardTitle className="text-green-700 dark:text-green-400 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Changes Applied Successfully
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            {(applyResult.parents_created ?? 0) > 0 && (
              <Badge variant="success">
                {applyResult.parents_created} parent
                {applyResult.parents_created !== 1 ? "s" : ""} created
              </Badge>
            )}
            {(applyResult.employers_updated ?? 0) > 0 && (
              <Badge variant="success">
                {applyResult.employers_updated} employer
                {applyResult.employers_updated !== 1 ? "s" : ""} updated
              </Badge>
            )}
            {(applyResult.worksites_updated ?? 0) > 0 && (
              <Badge variant="success">
                {applyResult.worksites_updated} worksite
                {applyResult.worksites_updated !== 1 ? "s" : ""} updated
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A record of this operation has been logged to Import History.
          </p>
          <Button onClick={resetWizard} variant="outline">
            <RotateCcw className="h-4 w-4 mr-1" />
            Run Wizard Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Render ───────────────────────────────────────────────

  const showNav =
    step !== "idle" &&
    step !== "loading" &&
    step !== "applying" &&
    step !== "done";

  return (
    <div className="space-y-4">
      <StepIndicator />

      {step === "idle" && <IdleStep />}
      {step === "loading" && <LoadingStep />}
      {step === "review_groups" && <GroupsStep />}
      {step === "review_categories" && <CategoriesStep />}
      {step === "review_worksites" && <WorksitesStep />}
      {step === "confirm" && <ConfirmStep />}
      {step === "applying" && <ApplyingStep />}
      {step === "done" && <DoneStep />}

      {showNav && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={!canGoBack(step)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          {canGoForward(step) && (
            <Button onClick={goForward}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Exported component wrapped in error boundary ───────────

export function EmployerWizard() {
  return (
    <WizardErrorBoundary>
      <EmployerWizardInner />
    </WizardErrorBoundary>
  );
}
