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
import { ArrowLeft, Plus, Trash2, AlertTriangle, Layers } from "lucide-react";
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
  /** Local draft id of the parent unit, when this draft is a sub-unit. */
  parent_draft_id?: string | null;
  /** Server id of the parent unit, set after the parent has been saved. */
  parent_ou_id?: number | null;
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
  name: string;
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
        .select("group_id, name")
        .order("name");
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
      const newEmployers = employers.filter((e) => !existingEmployerIds.has(e.employer_id));
      // Distribute estimate evenly across all employer units as a starting point;
      // saveUnitsMutation refines this to proportional actuals on save.
      const estimateEach =
        totalWorkerEstimate != null && employers.length > 0
          ? Math.round(totalWorkerEstimate / employers.length)
          : null;
      const additions: CampaignUnitDraft[] = newEmployers.map((e) => ({
        draft_id: newDraftId(),
        ou_id: null,
        ou_type: "employer",
        name: e.employer_name,
        total_workers_estimated: estimateEach,
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
      const newWorksites = worksites.filter((w) => !existingWorksiteIds.has(w.worksite_id));
      // Distribute estimate evenly across all worksite units as a starting point;
      // saveUnitsMutation refines this to proportional actuals on save.
      const estimateEach =
        totalWorkerEstimate != null && worksites.length > 0
          ? Math.round(totalWorkerEstimate / worksites.length)
          : null;
      const additions: CampaignUnitDraft[] = newWorksites.map((w) => ({
        draft_id: newDraftId(),
        ou_id: null,
        ou_type: "worksite",
        name: w.worksite_name,
        total_workers_estimated: estimateEach,
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
          name: group.name,
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
    // Cascade: remove the unit and any sub-unit drafts that reference it.
    setUnits(
      units.filter(
        (u) => u.draft_id !== draftId && u.parent_draft_id !== draftId
      )
    );
  }

  function updateUnit(draftId: string, partial: Partial<CampaignUnitDraft>) {
    setUnits(
      units.map((u) =>
        u.draft_id === draftId ? { ...u, ...partial } : u
      )
    );
  }

  function addSubUnit(parentDraftId: string) {
    const parent = units.find((u) => u.draft_id === parentDraftId);
    if (!parent) return;
    setUnits([
      ...units,
      {
        draft_id: newDraftId(),
        ou_id: null,
        ou_type: "custom",
        name: `${parent.name || "Unit"} – sub-unit`,
        total_workers_estimated: null,
        unit_basis: parent.ou_id
          ? { parent_ou_id: parent.ou_id, dimension: "custom" }
          : { dimension: "custom" },
        parent_draft_id: parentDraftId,
        parent_ou_id: parent.ou_id ?? null,
      },
    ]);
  }

  // ── Estimate sum + unallocated remainder (per-dimension) ─────────────────
  //
  // Units of the same ou_type form a "dimension" — e.g. all worksite units are
  // one dimension, all employer units are another. Each dimension independently
  // covers the full worker population, so their estimates each sum to ~total.
  // Summing across dimensions would naturally exceed the campaign total and
  // must NOT be used for validation.

  const OU_TYPE_LABELS: Record<string, string> = {
    worksite: "Worksite",
    employer: "Employer",
    job_type: "Job type",
    shift: "Shift",
    department: "Department",
    network: "Network",
    work_area: "Work area",
    ethnic_community: "Ethnic community",
    crew_rotation: "Crew rotation",
    accommodation: "Accommodation",
    custom: "Custom",
  };

  // Distinct ou_types present in the current unit list.
  const dimensions = useMemo(
    () => [...new Set(units.map((u) => u.ou_type))],
    [units]
  );

  // Sum of estimates per ou_type dimension.
  const dimensionEstimates = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of units) {
      if (typeof u.total_workers_estimated !== "number") continue;
      map.set(u.ou_type, (map.get(u.ou_type) ?? 0) + u.total_workers_estimated);
    }
    return map;
  }, [units]);

  // A dimension is "over" only if its OWN sum exceeds the campaign total.
  const overDimensions = useMemo(() => {
    if (totalWorkerEstimate == null) return [] as string[];
    return Array.from(dimensionEstimates.entries())
      .filter(([, sum]) => sum > totalWorkerEstimate)
      .map(([type]) => type);
  }, [dimensionEstimates, totalWorkerEstimate]);

  // Single-dimension helpers (used when only one ou_type is present).
  const singleDimensionSum =
    dimensions.length === 1 ? (dimensionEstimates.get(dimensions[0]) ?? 0) : null;

  const unallocatedRemainder =
    totalWorkerEstimate != null && singleDimensionSum != null
      ? Math.max(0, totalWorkerEstimate - singleDimensionSum)
      : null;

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
                      {g.name}
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
          <div className="flex items-start justify-between gap-2">
            <Label className="text-sm font-semibold">
              Units ({units.length})
            </Label>
            {totalWorkerEstimate != null && dimensionEstimates.size > 0 && (
              <div className="text-xs text-muted-foreground text-right space-y-0.5">
                {dimensions.length === 1 ? (
                  <p>
                    Estimate sum: <strong>{singleDimensionSum ?? 0}</strong> /{" "}
                    {totalWorkerEstimate}
                    {unallocatedRemainder != null && (
                      <>
                        {" · "}Unallocated remainder:{" "}
                        <strong>{unallocatedRemainder}</strong>
                      </>
                    )}
                  </p>
                ) : (
                  Array.from(dimensionEstimates.entries()).map(([type, sum]) => (
                    <p key={type}>
                      {OU_TYPE_LABELS[type] ?? type} units:{" "}
                      <strong>{sum}</strong> / {totalWorkerEstimate}
                      {" · "}rem.{" "}
                      <strong>{Math.max(0, totalWorkerEstimate - sum)}</strong>
                    </p>
                  ))
                )}
              </div>
            )}
          </div>

          {units.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No units yet. Use one of the toggles above, or add an occupation /
              custom unit.
            </div>
          )}

          {(() => {
            const topLevel = units.filter((u) => !u.parent_draft_id);
            const childrenByParent = new Map<string, CampaignUnitDraft[]>();
            for (const u of units) {
              if (!u.parent_draft_id) continue;
              const list = childrenByParent.get(u.parent_draft_id) ?? [];
              list.push(u);
              childrenByParent.set(u.parent_draft_id, list);
            }

            const renderUnitRow = (u: CampaignUnitDraft, isSubUnit: boolean) => (
              <div
                key={u.draft_id}
                className={`flex items-center gap-2 rounded-md border p-3 ${
                  isSubUnit ? "border-l-4 border-l-primary/40 bg-muted/20" : ""
                }`}
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
                    {isSubUnit && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 gap-1">
                        <Layers className="h-3 w-3" />
                        sub-unit
                      </Badge>
                    )}
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
                  {!isSubUnit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5 text-xs gap-1"
                      onClick={() => addSubUnit(u.draft_id)}
                      title="Add a sub-unit beneath this unit"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Sub-unit
                    </Button>
                  )}
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
            );

            return topLevel.map((parent) => {
              const children = childrenByParent.get(parent.draft_id) ?? [];
              return (
                <div key={parent.draft_id} className="space-y-2">
                  {renderUnitRow(parent, false)}
                  {children.length > 0 && (
                    <div className="space-y-2 pl-4 border-l-2 border-muted">
                      {children.map((c) => renderUnitRow(c, true))}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* Synthetic unallocated row — only shown for single-dimension campaigns.
              In multi-dimension campaigns each dimension has its own remainder. */}
          {totalWorkerEstimate != null && dimensions.length <= 1 && (
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

        {overDimensions.length > 0 && (
          <div className="space-y-2">
            {overDimensions.map((type) => {
              const sum = dimensionEstimates.get(type) ?? 0;
              return (
                <div
                  key={type}
                  className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Your{" "}
                    <strong>{OU_TYPE_LABELS[type] ?? type}</strong> unit estimates
                    total {sum}, which is {sum - (totalWorkerEstimate ?? 0)} above the
                    campaign estimate ({totalWorkerEstimate}). Adjust the individual
                    unit estimates in that dimension to match.
                  </span>
                </div>
              );
            })}
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
