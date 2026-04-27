"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, AlertTriangle } from "lucide-react";
import type {
  CampaignOuType,
  CampaignOuUnitBasis,
} from "@/types/database";

export interface CampaignUnitDraft {
  /** Local-only id used to track the row in React state until saved. */
  draft_id: string;
  /** Server id once saved (PUT-style edits). null for newly added units. */
  ou_id: number | null;
  ou_type: CampaignOuType;
  name: string;
  total_workers_estimated: number | null;
  unit_basis: CampaignOuUnitBasis | null;
}

interface StepCampaignUnitsProps {
  selectedEmployers: number[];
  selectedWorksites: number[];
  worksiteSectorWide: boolean;
  totalWorkerEstimate: number | null;
  units: CampaignUnitDraft[];
  setUnits: (next: CampaignUnitDraft[]) => void;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
}

interface EmployerLookup {
  employer_id: number;
  employer_name: string;
}

interface WorksiteLookup {
  worksite_id: number;
  worksite_name: string;
}

interface OccupationGroupLookup {
  group_id: number;
  group_name: string;
}

interface OccupationLookup {
  occupation_id: number;
  canonical_name: string;
  occupation_group_id: number | null;
}

function newDraftId(): string {
  return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

export function StepCampaignUnits({
  selectedEmployers,
  selectedWorksites,
  worksiteSectorWide,
  totalWorkerEstimate,
  units,
  setUnits,
  isPending,
  onBack,
  onContinue,
}: StepCampaignUnitsProps) {
  const supabase = createClient();
  const { user } = useAuth();

  // ── Reference data ────────────────────────────────────────────────────────

  const { data: employers = [] } = useQuery<EmployerLookup[]>({
    queryKey: ["units-employers", selectedEmployers],
    queryFn: async () => {
      if (selectedEmployers.length === 0) return [];
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .in("employer_id", selectedEmployers)
        .order("employer_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && selectedEmployers.length > 0,
  });

  const { data: worksites = [] } = useQuery<WorksiteLookup[]>({
    queryKey: ["units-worksites", selectedWorksites],
    queryFn: async () => {
      if (selectedWorksites.length === 0) return [];
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .in("worksite_id", selectedWorksites)
        .order("worksite_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && selectedWorksites.length > 0 && !worksiteSectorWide,
  });

  const { data: occupationGroups = [] } = useQuery<OccupationGroupLookup[]>({
    queryKey: ["units-occupation-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupation_groups")
        .select("group_id, group_name")
        .order("group_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: occupations = [] } = useQuery<OccupationLookup[]>({
    queryKey: ["units-occupations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupations")
        .select("occupation_id, canonical_name, occupation_group_id")
        .order("canonical_name")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // ── Computed: which "use as units" toggles to show ────────────────────────

  // Derive sensible defaults: for multi-employer or multi-worksite scopes the
  // user can promote those collections directly. Track this separately from
  // `units` so toggling doesn't lose other unit choices.
  const useEmployersAsUnits = useMemo(
    () =>
      selectedEmployers.length > 0 &&
      selectedEmployers.every((eid) =>
        units.some(
          (u) => u.ou_type === "employer" && u.unit_basis?.employer_id === eid
        )
      ),
    [units, selectedEmployers]
  );

  const useWorksitesAsUnits = useMemo(
    () =>
      !worksiteSectorWide &&
      selectedWorksites.length > 0 &&
      selectedWorksites.every((wid) =>
        units.some(
          (u) => u.ou_type === "worksite" && u.unit_basis?.worksite_id === wid
        )
      ),
    [units, selectedWorksites, worksiteSectorWide]
  );

  function toggleEmployersAsUnits(on: boolean) {
    if (on) {
      const existingEmployerIds = new Set(
        units
          .filter((u) => u.ou_type === "employer")
          .map((u) => u.unit_basis?.employer_id)
          .filter(Boolean)
      );
      const additions: CampaignUnitDraft[] = employers
        .filter((e) => !existingEmployerIds.has(e.employer_id))
        .map((e) => ({
          draft_id: newDraftId(),
          ou_id: null,
          ou_type: "employer",
          name: e.employer_name,
          total_workers_estimated: null,
          unit_basis: { employer_id: e.employer_id },
        }));
      setUnits([...units, ...additions]);
    } else {
      setUnits(units.filter((u) => u.ou_type !== "employer"));
    }
  }

  function toggleWorksitesAsUnits(on: boolean) {
    if (on) {
      const existingWorksiteIds = new Set(
        units
          .filter((u) => u.ou_type === "worksite")
          .map((u) => u.unit_basis?.worksite_id)
          .filter(Boolean)
      );
      const additions: CampaignUnitDraft[] = worksites
        .filter((w) => !existingWorksiteIds.has(w.worksite_id))
        .map((w) => ({
          draft_id: newDraftId(),
          ou_id: null,
          ou_type: "worksite",
          name: w.worksite_name,
          total_workers_estimated: null,
          unit_basis: { worksite_id: w.worksite_id },
        }));
      setUnits([...units, ...additions]);
    } else {
      setUnits(units.filter((u) => u.ou_type !== "worksite"));
    }
  }

  // ── Add other unit kinds ──────────────────────────────────────────────────

  const [pendingKind, setPendingKind] = useState<
    "occupation_group" | "occupation" | "custom"
  >("occupation_group");
  const [pendingPick, setPendingPick] = useState<string>("");
  const [pendingCustomName, setPendingCustomName] = useState("");

  function addPendingUnit() {
    if (pendingKind === "custom") {
      const name = pendingCustomName.trim();
      if (!name) return;
      setUnits([
        ...units,
        {
          draft_id: newDraftId(),
          ou_id: null,
          ou_type: "custom",
          name,
          total_workers_estimated: null,
          unit_basis: { custom: true },
        },
      ]);
      setPendingCustomName("");
      return;
    }

    if (pendingKind === "occupation_group") {
      const groupId = Number(pendingPick);
      if (!groupId) return;
      const group = occupationGroups.find((g) => g.group_id === groupId);
      if (!group) return;
      const exists = units.some(
        (u) =>
          u.ou_type === "job_type" &&
          u.unit_basis?.occupation_group_id === groupId
      );
      if (exists) return;
      setUnits([
        ...units,
        {
          draft_id: newDraftId(),
          ou_id: null,
          ou_type: "job_type",
          name: group.group_name,
          total_workers_estimated: null,
          unit_basis: { occupation_group_id: groupId },
        },
      ]);
      setPendingPick("");
      return;
    }

    if (pendingKind === "occupation") {
      const occId = Number(pendingPick);
      if (!occId) return;
      const occ = occupations.find((o) => o.occupation_id === occId);
      if (!occ) return;
      const exists = units.some(
        (u) =>
          u.ou_type === "job_type" &&
          u.unit_basis?.canonical_occupation_id === occId
      );
      if (exists) return;
      setUnits([
        ...units,
        {
          draft_id: newDraftId(),
          ou_id: null,
          ou_type: "job_type",
          name: occ.canonical_name,
          total_workers_estimated: null,
          unit_basis: { canonical_occupation_id: occId },
        },
      ]);
      setPendingPick("");
      return;
    }
  }

  function removeUnit(draftId: string) {
    setUnits(units.filter((u) => u.draft_id !== draftId));
  }

  function updateUnit(draftId: string, partial: Partial<CampaignUnitDraft>) {
    setUnits(
      units.map((u) =>
        u.draft_id === draftId ? { ...u, ...partial } : u
      )
    );
  }

  // ── Estimate sum + unallocated remainder ──────────────────────────────────

  const sumOfUnitEstimates = useMemo(
    () =>
      units.reduce(
        (acc, u) =>
          acc + (typeof u.total_workers_estimated === "number" ? u.total_workers_estimated : 0),
        0
      ),
    [units]
  );

  const unallocatedRemainder =
    totalWorkerEstimate != null
      ? Math.max(0, totalWorkerEstimate - sumOfUnitEstimates)
      : null;

  const sumOver = totalWorkerEstimate != null && sumOfUnitEstimates > totalWorkerEstimate;

  // ── Render ────────────────────────────────────────────────────────────────

  const showEmployerToggle = selectedEmployers.length > 0 && employers.length > 0;
  const showWorksiteToggle = !worksiteSectorWide && selectedWorksites.length > 0 && worksites.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign units</CardTitle>
        <CardDescription>
          Campaign units split your worker universe into the slices you organise around
          (worksites, employers, shifts, occupations, or anything else). Workers can be
          allocated to one or many units in the next step. Anyone you don&apos;t place into a
          specific unit ends up in the &quot;Unallocated&quot; bucket.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Use existing scope as units */}
        {(showEmployerToggle || showWorksiteToggle) && (
          <div className="space-y-3 rounded-md border bg-muted/40 p-4">
            <Label className="text-sm font-semibold">Build from scope</Label>
            {showEmployerToggle && (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useEmployersAsUnits}
                  onChange={(e) => toggleEmployersAsUnits(e.target.checked)}
                />
                <span className="text-sm">
                  Use employers as campaign units —{" "}
                  <span className="text-muted-foreground">
                    creates one unit per selected employer ({employers.length}).
                  </span>
                </span>
              </label>
            )}
            {showWorksiteToggle && (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useWorksitesAsUnits}
                  onChange={(e) => toggleWorksitesAsUnits(e.target.checked)}
                />
                <span className="text-sm">
                  Use worksites as campaign units —{" "}
                  <span className="text-muted-foreground">
                    creates one unit per selected worksite ({worksites.length}).
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        {/* Add another unit (occupation group / occupation / custom) */}
        <div className="space-y-3 rounded-md border p-4">
          <Label className="text-sm font-semibold">Add another unit</Label>
          <div className="grid sm:grid-cols-[170px_1fr_auto] gap-2 items-start">
            <Select
              value={pendingKind}
              onValueChange={(v) => {
                setPendingKind(v as "occupation_group" | "occupation" | "custom");
                setPendingPick("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="occupation_group">Occupational grouping</SelectItem>
                <SelectItem value="occupation">Occupation</SelectItem>
                <SelectItem value="custom">Custom unit</SelectItem>
              </SelectContent>
            </Select>

            {pendingKind === "custom" ? (
              <Input
                value={pendingCustomName}
                onChange={(e) => setPendingCustomName(e.target.value)}
                placeholder="e.g. Day shift, Drilling crew, Catering..."
              />
            ) : pendingKind === "occupation_group" ? (
              <Select value={pendingPick} onValueChange={setPendingPick}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an occupational grouping…" />
                </SelectTrigger>
                <SelectContent>
                  {occupationGroups.map((g) => (
                    <SelectItem key={g.group_id} value={String(g.group_id)}>
                      {g.group_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={pendingPick} onValueChange={setPendingPick}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an occupation…" />
                </SelectTrigger>
                <SelectContent>
                  {occupations.map((o) => (
                    <SelectItem key={o.occupation_id} value={String(o.occupation_id)}>
                      {o.canonical_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={addPendingUnit}
              disabled={
                pendingKind === "custom"
                  ? !pendingCustomName.trim()
                  : !pendingPick
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: shifts and crew rotations are typically best added as custom units for
            now — workers are then placed into them manually in the next step.
          </p>
        </div>

        {/* Existing units */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">
              Units ({units.length})
            </Label>
            {totalWorkerEstimate != null && (
              <p className="text-xs text-muted-foreground">
                Estimate sum: <strong>{sumOfUnitEstimates}</strong> /{" "}
                {totalWorkerEstimate}
                {unallocatedRemainder != null && (
                  <>
                    {" · "}Unallocated remainder:{" "}
                    <strong>{unallocatedRemainder}</strong>
                  </>
                )}
              </p>
            )}
          </div>

          {units.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No units yet. Use one of the toggles above, or add an occupation /
              custom unit.
            </div>
          )}

          {units.map((u) => (
            <div
              key={u.draft_id}
              className="flex items-center gap-2 rounded-md border p-3"
            >
              <div className="flex-1 min-w-0">
                <Input
                  value={u.name}
                  onChange={(e) => updateUnit(u.draft_id, { name: e.target.value })}
                  className="text-sm font-medium"
                />
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {u.ou_type}
                  </Badge>
                  {u.unit_basis?.employer_id && (
                    <span className="text-xs text-muted-foreground">
                      employer #{u.unit_basis.employer_id}
                    </span>
                  )}
                  {u.unit_basis?.worksite_id && (
                    <span className="text-xs text-muted-foreground">
                      worksite #{u.unit_basis.worksite_id}
                    </span>
                  )}
                  {u.unit_basis?.canonical_occupation_id && (
                    <span className="text-xs text-muted-foreground">
                      occupation #{u.unit_basis.canonical_occupation_id}
                    </span>
                  )}
                  {u.unit_basis?.occupation_group_id && (
                    <span className="text-xs text-muted-foreground">
                      group #{u.unit_basis.occupation_group_id}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  type="number"
                  min={0}
                  className="w-20 text-sm"
                  value={u.total_workers_estimated ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? null : Number(raw);
                    updateUnit(u.draft_id, {
                      total_workers_estimated:
                        n != null && !Number.isNaN(n) && n >= 0 ? n : null,
                    });
                  }}
                  placeholder="—"
                />
                <span className="text-xs text-muted-foreground">est.</span>
                <button
                  type="button"
                  onClick={() => removeUnit(u.draft_id)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Remove unit"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Synthetic unallocated row */}
          {totalWorkerEstimate != null && (
            <div className="flex items-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Unallocated</p>
                <p className="text-xs text-muted-foreground">
                  Workers on this campaign that aren&apos;t placed into a specific unit
                  show up here automatically.
                </p>
              </div>
              <div className="text-sm tabular-nums">
                est. {unallocatedRemainder ?? 0}
              </div>
            </div>
          )}
        </div>

        {sumOver && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Your unit estimates total {sumOfUnitEstimates}, which is{" "}
              {sumOfUnitEstimates - (totalWorkerEstimate ?? 0)} above the
              campaign-level worker estimate ({totalWorkerEstimate}). Either raise the
              campaign estimate or trim a unit.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={onBack} disabled={isPending}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button onClick={onContinue} disabled={isPending}>
            {isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
