"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Upload,
  Users,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import Link from "next/link";

export type WorkerUnitAllocation = Record<number, Set<number>>;

interface UnitForAllocation {
  ou_id: number;
  name: string;
  ou_type: string;
  total_workers_estimated: number | null;
  /** FK to the group container OU, when this unit is part of a named group. */
  parent_ou_id?: number | null;
  /** Same as parent_ou_id for group members. NULL for standalone units. */
  ou_group_id?: number | null;
}

interface StepAllocateWorkersProps {
  campaignId: number;
  selectedEmployers: number[];
  selectedWorksites: number[];
  worksiteSectorWide: boolean;
  selectedWorkers: number[];
  setSelectedWorkers: (v: number[]) => void;
  /** Map of worker_id → set of ou_ids the worker is allocated to. */
  workerUnitAllocations: WorkerUnitAllocation;
  setWorkerUnitAllocations: (next: WorkerUnitAllocation) => void;
  /** Units saved in the previous step (with real ou_id). */
  units: UnitForAllocation[];
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
  showBackButton?: boolean;
  continueLabel?: string;
}

interface WorkerRow {
  worker_id: number;
  first_name: string;
  last_name: string;
  employer_id: number | null;
  worksite_id: number | null;
  canonical_occupation_id: number | null;
  employer_name: string | null;
  worksite_name: string | null;
  occupation_name: string | null;
  occupation_group_name: string | null;
}

type SortKey = "name" | "employer" | "worksite" | "occupation";

export function StepAllocateWorkers({
  campaignId,
  selectedEmployers,
  selectedWorksites,
  worksiteSectorWide,
  selectedWorkers,
  setSelectedWorkers,
  workerUnitAllocations,
  setWorkerUnitAllocations,
  units,
  isPending,
  onBack,
  onContinue,
  showBackButton = true,
  continueLabel,
}: StepAllocateWorkersProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterEmployer, setFilterEmployer] = useState<string>("__any__");
  const [filterWorksite, setFilterWorksite] = useState<string>("__any__");
  const [filterUnit, setFilterUnit] = useState<string>("__any__");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSelection, setPageSelection] = useState<Set<number>>(new Set());
  const [bulkUnitId, setBulkUnitId] = useState<string>("");

  const { data: workers = [], isFetching } = useQuery<WorkerRow[]>({
    queryKey: [
      "wizard-workers-allocation",
      selectedEmployers,
      selectedWorksites,
      worksiteSectorWide,
    ],
    queryFn: async () => {
      let q = supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name, employer_id, worksite_id,
           canonical_occupation_id,
           employers:employer_id(employer_name),
           worksites:worksite_id(worksite_name),
           occupations:canonical_occupation_id(canonical_name, occupation_groups(name))`
        )
        .eq("is_active", true);

      if (selectedEmployers.length > 0) {
        q = q.in("employer_id", selectedEmployers);
      }
      if (selectedWorksites.length > 0 && !worksiteSectorWide) {
        q = q.in("worksite_id", selectedWorksites);
      }

      const { data, error } = await q.order("last_name").limit(5000);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{
        worker_id: number;
        first_name: string;
        last_name: string;
        employer_id: number | null;
        worksite_id: number | null;
        canonical_occupation_id: number | null;
        employers: { employer_name: string } | null;
        worksites: { worksite_name: string } | null;
        occupations: {
          canonical_name: string;
          occupation_groups: { name: string } | null;
        } | null;
      }>;

      return rows.map((r) => ({
        worker_id: r.worker_id,
        first_name: r.first_name,
        last_name: r.last_name,
        employer_id: r.employer_id,
        worksite_id: r.worksite_id,
        canonical_occupation_id: r.canonical_occupation_id,
        employer_name: r.employers?.employer_name ?? null,
        worksite_name: r.worksites?.worksite_name ?? null,
        occupation_name: r.occupations?.canonical_name ?? null,
        occupation_group_name: r.occupations?.occupation_groups?.name ?? null,
      }));
    },
    enabled:
      !!user &&
      (selectedEmployers.length > 0 || selectedWorksites.length > 0 || worksiteSectorWide),
  });

  // ── Filter / sort the worker rows ─────────────────────────────────────────

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const empFilter = filterEmployer === "__any__" ? null : Number(filterEmployer);
    const wsFilter = filterWorksite === "__any__" ? null : Number(filterWorksite);

    let out = workers.filter((w) => {
      if (term) {
        const n = `${w.first_name} ${w.last_name}`.toLowerCase();
        if (!n.includes(term)) return false;
      }
      if (empFilter != null && w.employer_id !== empFilter) return false;
      if (wsFilter != null && w.worksite_id !== wsFilter) return false;
      if (filterUnit !== "__any__") {
        const allocated = workerUnitAllocations[w.worker_id];
        if (filterUnit === "__unallocated__") {
          // On-campaign workers without any unit allocation.
          if (!selectedWorkers.includes(w.worker_id)) return false;
          if (allocated && allocated.size > 0) return false;
        } else {
          const ouId = Number(filterUnit);
          if (!allocated || !allocated.has(ouId)) return false;
        }
      }
      return true;
    });

    out = [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const cmp = (av: string | null, bv: string | null) => {
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av.localeCompare(bv) * dir;
      };
      switch (sortKey) {
        case "employer":
          return cmp(a.employer_name, b.employer_name);
        case "worksite":
          return cmp(a.worksite_name, b.worksite_name);
        case "occupation":
          return cmp(a.occupation_name, b.occupation_name);
        case "name":
        default:
          return cmp(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`);
      }
    });

    return out;
  }, [
    workers,
    search,
    filterEmployer,
    filterWorksite,
    filterUnit,
    selectedWorkers,
    workerUnitAllocations,
    sortKey,
    sortDir,
  ]);

  // ── Aggregations for preview ──────────────────────────────────────────────

  const allocationCounts = useMemo(() => {
    const counts = new Map<number, number>();
    let unallocatedOnCampaign = 0;
    for (const wid of selectedWorkers) {
      const set = workerUnitAllocations[wid];
      if (!set || set.size === 0) {
        unallocatedOnCampaign += 1;
        continue;
      }
      for (const ou of set) {
        counts.set(ou, (counts.get(ou) ?? 0) + 1);
      }
    }
    return { byUnit: counts, unallocated: unallocatedOnCampaign };
  }, [selectedWorkers, workerUnitAllocations]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function toggleWorker(workerId: number, on: boolean) {
    if (on) {
      if (!selectedWorkers.includes(workerId)) {
        setSelectedWorkers([...selectedWorkers, workerId]);
      }
    } else {
      setSelectedWorkers(selectedWorkers.filter((x) => x !== workerId));
      // Removing from campaign also drops all unit allocations.
      if (workerUnitAllocations[workerId]) {
        const next = { ...workerUnitAllocations };
        delete next[workerId];
        setWorkerUnitAllocations(next);
      }
    }
  }

  function toggleWorkerUnit(workerId: number, ouId: number, on: boolean) {
    const next = { ...workerUnitAllocations };
    const set = new Set(next[workerId] ?? new Set<number>());
    if (on) set.add(ouId);
    else set.delete(ouId);
    if (set.size === 0) {
      delete next[workerId];
    } else {
      next[workerId] = set;
    }
    setWorkerUnitAllocations(next);
    // Toggling a unit allocation implies the worker is on the campaign.
    if (on && !selectedWorkers.includes(workerId)) {
      setSelectedWorkers([...selectedWorkers, workerId]);
    }
  }

  function togglePageRow(workerId: number, on: boolean) {
    const next = new Set(pageSelection);
    if (on) next.add(workerId);
    else next.delete(workerId);
    setPageSelection(next);
  }

  function selectAllFiltered() {
    setPageSelection(new Set(filtered.map((w) => w.worker_id)));
  }

  function clearPageSelection() {
    setPageSelection(new Set());
  }

  function bulkAddToCampaign() {
    if (pageSelection.size === 0) return;
    const merged = new Set([...selectedWorkers, ...pageSelection]);
    setSelectedWorkers(Array.from(merged));
  }

  function bulkRemoveFromCampaign() {
    if (pageSelection.size === 0) return;
    setSelectedWorkers(selectedWorkers.filter((w) => !pageSelection.has(w)));
    const next = { ...workerUnitAllocations };
    for (const w of pageSelection) delete next[w];
    setWorkerUnitAllocations(next);
  }

  function bulkAllocateToUnit() {
    if (pageSelection.size === 0 || !bulkUnitId) return;
    const merged = new Set([...selectedWorkers, ...pageSelection]);
    setSelectedWorkers(Array.from(merged));
    const next = { ...workerUnitAllocations };
    if (bulkUnitId === "__unallocated__") {
      for (const w of pageSelection) {
        delete next[w];
      }
    } else {
      const ouId = Number(bulkUnitId);
      for (const w of pageSelection) {
        const set = new Set(next[w] ?? new Set<number>());
        set.add(ouId);
        next[w] = set;
      }
    }
    setWorkerUnitAllocations(next);
  }

  /**
   * Returns a map of worker_id → name of the conflicting group for workers in
   * pageSelection that would violate group exclusivity if allocated to bulkUnitId.
   * A conflict occurs when the target unit belongs to group X and the worker is
   * already in a different unit whose group is Y (≠ X), and both share the same
   * ou_type.
   */
  const crossGroupConflicts = useMemo<Map<number, string>>(() => {
    const conflicts = new Map<number, string>();
    if (!bulkUnitId || bulkUnitId === "__unallocated__" || pageSelection.size === 0) {
      return conflicts;
    }
    const targetOuId = Number(bulkUnitId);
    const targetUnit = units.find((u) => u.ou_id === targetOuId);
    if (!targetUnit || !targetUnit.ou_group_id) return conflicts;

    const targetGroupId = targetUnit.ou_group_id;
    const targetType = targetUnit.ou_type;

    // Build a lookup of ou_id → unit for fast access
    const unitById = new Map(units.map((u) => [u.ou_id, u]));

    for (const workerId of pageSelection) {
      const allocated = workerUnitAllocations[workerId];
      if (!allocated) continue;
      for (const existingOuId of allocated) {
        const existingUnit = unitById.get(existingOuId);
        if (!existingUnit) continue;
        if (
          existingUnit.ou_group_id != null &&
          existingUnit.ou_group_id !== targetGroupId &&
          existingUnit.ou_type === targetType
        ) {
          // Find the name of the conflicting group container
          const conflictingGroupUnit = units.find(
            (u) => u.ou_id === existingUnit.ou_group_id
          );
          conflicts.set(
            workerId,
            conflictingGroupUnit?.name ?? `Group #${existingUnit.ou_group_id}`
          );
          break;
        }
      }
    }
    return conflicts;
  }, [bulkUnitId, pageSelection, workerUnitAllocations, units]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Note: page selection is intentionally not pruned when filters change —
  // selections that scroll out of view persist (matches how data tables behave
  // in tools the user already uses) and bulk actions still fire on them.

  // ── Derived UI state ──────────────────────────────────────────────────────

  const employerOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of workers) {
      if (w.employer_id != null) {
        m.set(w.employer_id, w.employer_name ?? `Employer #${w.employer_id}`);
      }
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [workers]);

  const worksiteOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of workers) {
      if (w.worksite_id != null) {
        m.set(w.worksite_id, w.worksite_name ?? `Worksite #${w.worksite_id}`);
      }
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [workers]);

  const noWorkers =
    !isFetching &&
    workers.length === 0 &&
    (selectedEmployers.length > 0 || selectedWorksites.length > 0 || worksiteSectorWide);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocate workers</CardTitle>
        <CardDescription>
          Search, sort, and filter workers across the selected employers and worksites.
          Use the bulk bar to add workers to the campaign and place them into specific
          campaign units. Workers added to the campaign without a unit assignment land
          in the &quot;Unallocated&quot; bucket.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isFetching && (
          <p className="text-sm text-muted-foreground">Loading workers…</p>
        )}

        {noWorkers && (
          <div className="rounded-lg border border-dashed p-6 space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-muted p-3">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-sm">No workers found</p>
              <p className="text-sm text-muted-foreground">
                There are no workers currently linked to the selected employers or
                worksites. Import workers, or adjust your selections in the previous
                steps.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button type="button" onClick={() => setImportOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                Import workers
              </Button>
              <Button variant="outline" type="button" asChild>
                <Link href="/workers" target="_blank">
                  Go to Workers page
                </Link>
              </Button>
            </div>
          </div>
        )}

        {workers.length > 0 && (
          <>
            {/* Filter bar */}
            <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
              <Input
                placeholder="Search workers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={filterEmployer} onValueChange={setFilterEmployer}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">All employers</SelectItem>
                  {employerOptions.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterWorksite} onValueChange={setFilterWorksite}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">All worksites</SelectItem>
                  {worksiteOptions.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">All units</SelectItem>
                  <SelectItem value="__unallocated__">Unallocated (on campaign)</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.ou_id} value={String(u.ou_id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bulk action bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Select all filtered ({filtered.length})
              </button>
              <button
                type="button"
                onClick={clearPageSelection}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Square className="h-3.5 w-3.5" />
                Clear ({pageSelection.size})
              </button>
              <span className="mx-1 text-muted-foreground">·</span>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkAddToCampaign}
                disabled={pageSelection.size === 0}
              >
                Add to campaign
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkRemoveFromCampaign}
                disabled={pageSelection.size === 0}
              >
                Remove from campaign
              </Button>
              <span className="mx-1 text-muted-foreground">·</span>
              <Select value={bulkUnitId} onValueChange={setBulkUnitId}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue placeholder="Pick a unit…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unallocated__">Unallocated (clear units)</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.ou_id} value={String(u.ou_id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={bulkAllocateToUnit}
                disabled={pageSelection.size === 0 || !bulkUnitId}
              >
                Allocate selection
              </Button>
            </div>

            {/* Cross-group conflict warning */}
            {crossGroupConflicts.size > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>{crossGroupConflicts.size} worker{crossGroupConflicts.size > 1 ? "s" : ""}</strong>{" "}
                  in your selection {crossGroupConflicts.size > 1 ? "are" : "is"} already
                  allocated to a different{" "}
                  <strong>{units.find((u) => u.ou_id === Number(bulkUnitId))?.ou_type ?? "unit"}</strong>{" "}
                  group. Allocating them will add them to this group too — to avoid double
                  counting, remove them from their existing group first.
                  {" "}
                  <span className="text-amber-700">
                    Affected:{" "}
                    {Array.from(crossGroupConflicts.entries())
                      .slice(0, 3)
                      .map(([, groupName]) => groupName)
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(", ")}
                    {crossGroupConflicts.size > 3 ? " …" : ""}
                  </span>
                </span>
              </div>
            )}

            {/* Worker table */}
            <div className="max-h-[480px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="border-b">
                    <th className="w-8 p-2"></th>
                    <th className="w-8 p-2"></th>
                    <SortableTh
                      label="Name"
                      sortKey="name"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableTh
                      label="Employer"
                      sortKey="employer"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableTh
                      label="Worksite"
                      sortKey="worksite"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableTh
                      label="Occupation"
                      sortKey="occupation"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                    <th className="text-left p-2 font-medium">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => {
                    const onCampaign = selectedWorkers.includes(w.worker_id);
                    const allocated = workerUnitAllocations[w.worker_id] ?? new Set<number>();
                    return (
                      <tr key={w.worker_id} className="border-b hover:bg-muted/40">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={pageSelection.has(w.worker_id)}
                            onChange={(e) => togglePageRow(w.worker_id, e.target.checked)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            title={onCampaign ? "On campaign" : "Add to campaign"}
                            checked={onCampaign}
                            onChange={(e) => toggleWorker(w.worker_id, e.target.checked)}
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {w.last_name}, {w.first_name}
                        </td>
                        <td className="p-2 truncate max-w-[180px]">
                          {w.employer_name ?? "—"}
                        </td>
                        <td className="p-2 truncate max-w-[180px]">
                          {w.worksite_name ?? "—"}
                        </td>
                        <td className="p-2 truncate max-w-[180px]">
                          {w.occupation_name ?? "—"}
                          {w.occupation_group_name && (
                            <span className="text-xs text-muted-foreground block">
                              {w.occupation_group_name}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1 items-center">
                            {units.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                No units defined
                              </span>
                            )}
                            {/* Show only allocated units as removable chips.
                                Flag cross-group conflicts with an amber border. */}
                            {units
                              .filter((u) => allocated.has(u.ou_id))
                              .map((u) => {
                                // Detect if this unit's group conflicts with another
                                // group of the same ou_type the worker is also in.
                                const hasGroupConflict =
                                  u.ou_group_id != null &&
                                  units.some(
                                    (other) =>
                                      allocated.has(other.ou_id) &&
                                      other.ou_id !== u.ou_id &&
                                      other.ou_group_id != null &&
                                      other.ou_group_id !== u.ou_group_id &&
                                      other.ou_type === u.ou_type
                                  );
                                return (
                                  <button
                                    key={u.ou_id}
                                    type="button"
                                    title={
                                      hasGroupConflict
                                        ? "Cross-group conflict — this worker is in multiple groups of the same type"
                                        : "Remove from this unit"
                                    }
                                    onClick={() =>
                                      toggleWorkerUnit(w.worker_id, u.ou_id, false)
                                    }
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                      hasGroupConflict
                                        ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                        : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                                    }`}
                                  >
                                    {hasGroupConflict && (
                                      <AlertTriangle className="h-2.5 w-2.5 opacity-80" />
                                    )}
                                    {u.name}
                                    <X className="h-2.5 w-2.5 opacity-60" />
                                  </button>
                                );
                              })}
                            {/* Compact picker to add worker to an additional unit */}
                            {units.length > 0 &&
                              units.some((u) => !allocated.has(u.ou_id)) && (
                                <Select
                                  value=""
                                  onValueChange={(v) => {
                                    if (!v) return;
                                    toggleWorkerUnit(w.worker_id, Number(v), true);
                                  }}
                                >
                                  <SelectTrigger className="h-5 w-auto px-1.5 text-xs rounded-full border-dashed border-muted-foreground/40 gap-0 [&>svg]:hidden">
                                    <span className="text-muted-foreground">+ add</span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {units
                                      .filter((u) => !allocated.has(u.ou_id))
                                      .map((u) => (
                                        <SelectItem
                                          key={u.ou_id}
                                          value={String(u.ou_id)}
                                          className="text-xs"
                                        >
                                          {u.name}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-sm text-muted-foreground">
                        No workers match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer summary */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <p>
                {selectedWorkers.length} on campaign · {workers.length} candidates ·{" "}
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => setImportOpen(true)}
                >
                  Import more workers
                </button>
              </p>
              <div className="flex flex-wrap gap-2">
                {units.map((u) => (
                  <Badge
                    key={u.ou_id}
                    variant="outline"
                    className="text-[10px] h-4 px-1"
                  >
                    {u.name}: {allocationCounts.byUnit.get(u.ou_id) ?? 0}
                    {u.total_workers_estimated != null
                      ? ` / ${u.total_workers_estimated}`
                      : ""}
                  </Badge>
                ))}
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-dashed">
                  Unallocated: {allocationCounts.unallocated}
                </Badge>
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          {showBackButton && (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            onClick={onContinue}
            disabled={isPending}
            className={showBackButton ? undefined : "ml-auto"}
          >
            {isPending ? "Saving…" : (continueLabel ?? "Next step")}
          </Button>
        </div>
      </CardContent>

      <WorkerImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        campaignId={campaignId}
        onComplete={() => {
          queryClient.invalidateQueries({
            queryKey: [
              "wizard-workers-allocation",
              selectedEmployers,
              selectedWorksites,
              worksiteSectorWide,
            ],
          });
        }}
      />
    </Card>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th className="text-left p-2 font-medium">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:underline"
        onClick={() => onClick(sortKey)}
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${
            active ? "text-foreground" : "text-muted-foreground/40"
          }`}
        />
        {active && <span className="sr-only">{dir}</span>}
      </button>
    </th>
  );
}
