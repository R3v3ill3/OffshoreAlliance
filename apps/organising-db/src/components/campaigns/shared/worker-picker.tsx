"use client";

/**
 * Reusable worker picker — extracted from bulk-add-followers-dialog.tsx as
 * part of Phase 3 of the leader-tasking work. Two flavours:
 *
 *  - <WorkerPicker /> headless body (filters + list + selection state). Drop
 *    inside any container (dialog, stepper step, sheet, …). Drives selection
 *    via `onChange` against an `initialSelected` seed.
 *
 *  - <WorkerPickerDialog /> dialog wrapper around <WorkerPicker />. Preserves
 *    the previous BulkAddFollowersDialog API: title, description, footer with
 *    submit handler. Used by the Relationships tab (bulk-add-followers).
 *
 * The picker's filter / sort / "Suggested from leader's units" grouping logic
 * is identical to the previous dialog so behaviour is unchanged for both
 * call-sites.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeaderUnitContext } from "../wall-chart/leader-unit-context";

type CampaignWorkerRow = {
  worker_id: number;
  first_name: string;
  last_name: string;
  occupation: string | null;
  member_role_type: { role_name: string; display_name: string } | null;
};

type SortKey = "name-asc" | "name-desc" | "role" | "ou";

export type WorkerPickerProps = {
  /** Required. Drives the campaign-worker query. */
  campaignId: string;
  /**
   * When provided, enables the "Suggested from leader's units" grouping via
   * leader-unit-context. Workers already linked as followers are excluded
   * from the candidate pool.
   */
  leaderWorkerId?: number;
  /**
   * Workers to seed as already-selected (will not be re-fetched). Defaults to []
   * — the picker calls `onChange` once with this list on mount so consumers can
   * use it as the source of truth. Subsequent changes flow through `onChange`.
   */
  initialSelected?: number[];
  /**
   * Called whenever the selected set changes (toggles, select-all, clear).
   * Receives the full ordered list of selected worker_ids.
   */
  onChange: (workerIds: number[]) => void;
  /**
   * If set, exclude these worker_ids from the candidate pool entirely (in
   * addition to existing followers when `leaderWorkerId` is set).
   */
  excludeWorkerIds?: number[];
  /** Override the leader name displayed in the "only my units" toggle copy. */
  leaderName?: string;
  /** Hide the optional-notes input. Defaults to false. */
  hideNotes?: boolean;
  /** Notes value (controlled). Only relevant when `hideNotes` is false. */
  notes?: string;
  /** Notes change handler. Only relevant when `hideNotes` is false. */
  onNotesChange?: (notes: string) => void;
};

const EMPTY_NUMBER_ARRAY: ReadonlyArray<number> = Object.freeze([]);

export function WorkerPicker({
  campaignId,
  leaderWorkerId,
  initialSelected,
  onChange,
  excludeWorkerIds,
  leaderName,
  hideNotes = true,
  notes,
  onNotesChange,
}: WorkerPickerProps) {
  const supabase = createClient();
  const ctx = useLeaderUnitContext({
    campaignId,
    // The hook signature requires a worker id; pass 0 when we don't have a
    // leader so it gracefully returns an empty leaderOuIds set.
    leaderWorkerId: leaderWorkerId ?? 0,
  });
  const [onlyMyUnits, setOnlyMyUnits] = useState(true);
  const [search, setSearch] = useState("");
  const [occupationFilter, setOccupationFilter] = useState("");
  const [ouFilter, setOuFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name-asc");
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialSelected ?? [])
  );

  // Re-seed the selection if a parent passes a new initialSelected (e.g.
  // wizard step navigation that re-derives the list from a leader's
  // followers). We deliberately use JSON-stringified ids as the dep so an
  // unchanged array reference doesn't reset selection on every render.
  const initialKey = useMemo(
    () => (initialSelected ?? []).slice().sort((a, b) => a - b).join(","),
    [initialSelected]
  );
  useEffect(() => {
    setSelected(new Set(initialSelected ?? []));
    // We intentionally only react to `initialKey` (a stable string) so the
    // parent can pass a fresh array each render without thrashing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  // Push the current selection up whenever it changes.
  useEffect(() => {
    onChange([...selected]);
    // onChange identity may not be stable; we rely on caller to handle it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // When a leader is set but has no unit memberships, the "only my units"
  // filter would produce an empty visible list with no way to uncheck it.
  // Auto-clear the filter so all campaign members remain visible.
  useEffect(() => {
    if (leaderWorkerId != null && ctx.leaderOuIds.size === 0) {
      setOnlyMyUnits(false);
    }
  }, [leaderWorkerId, ctx.leaderOuIds.size]);

  const { data: campaignWorkers = [] } = useQuery({
    queryKey: ["campaign-workers-picker", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `worker_id,
           worker:workers(
             worker_id, first_name, last_name, occupation,
             member_role_type:member_role_types(role_name, display_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      const out: CampaignWorkerRow[] = [];
      for (const row of data ?? []) {
        const wr = (row as { worker: unknown }).worker;
        const w = (Array.isArray(wr) ? wr[0] : wr) as
          | {
              worker_id: number;
              first_name: string;
              last_name: string;
              occupation: string | null;
              member_role_type: unknown;
            }
          | null
          | undefined;
        if (!w) continue;
        const mt = (Array.isArray(w.member_role_type)
          ? w.member_role_type[0]
          : w.member_role_type) as { role_name: string; display_name: string } | null;
        out.push({
          worker_id: w.worker_id,
          first_name: w.first_name,
          last_name: w.last_name,
          occupation: w.occupation ?? null,
          member_role_type: mt,
        });
      }
      return out;
    },
  });

  // Returns a plain number[] (not a Set). TanStack Query's structuralSharing
  // walks objects and strips non-plain prototypes — returning a Set caused a
  // production crash with "W.has is not a function" on the second render. Build
  // the Set on the consumer side in a useMemo.
  const { data: existingFollowerArray = EMPTY_NUMBER_ARRAY } = useQuery({
    queryKey: [
      "leader-links-existing-followers",
      campaignId,
      leaderWorkerId ?? 0,
    ],
    enabled: leaderWorkerId != null,
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from("campaign_leader_worker_links")
        .select("follower_worker_id")
        .eq("campaign_id", Number(campaignId))
        .eq("leader_worker_id", leaderWorkerId as number);
      if (error) throw error;
      return (data ?? []).map((r) => r.follower_worker_id as number);
    },
  });

  const existingFollowerIds = useMemo(
    () => new Set<number>(existingFollowerArray),
    [existingFollowerArray]
  );

  const exclusionSet = useMemo(() => {
    const s = new Set<number>(excludeWorkerIds ?? []);
    return s;
  }, [excludeWorkerIds]);

  const selectedOuId = ouFilter === "all" ? null : Number(ouFilter);

  const { suggested, others } = useMemo(() => {
    const nameQ = search.trim().toLowerCase();
    const occQ = occupationFilter.trim().toLowerCase();

    const base = campaignWorkers
      .filter((w) => leaderWorkerId == null || w.worker_id !== leaderWorkerId)
      .filter((w) => !existingFollowerIds.has(w.worker_id))
      .filter((w) => !exclusionSet.has(w.worker_id))
      .filter((w) => {
        if (!nameQ) return true;
        return (
          w.first_name.toLowerCase().includes(nameQ) ||
          w.last_name.toLowerCase().includes(nameQ)
        );
      })
      .filter((w) => {
        if (!occQ) return true;
        return (w.occupation ?? "").toLowerCase().includes(occQ);
      })
      .filter((w) => {
        if (selectedOuId == null) return true;
        return ctx.allWorkerOuIds(w.worker_id).includes(selectedOuId);
      });

    const sorted = [...base].sort((a, b) => {
      switch (sortBy) {
        case "name-desc":
          return (
            b.last_name.localeCompare(a.last_name) ||
            b.first_name.localeCompare(a.first_name)
          );
        case "role": {
          const ra = a.member_role_type?.display_name ?? a.member_role_type?.role_name ?? "";
          const rb = b.member_role_type?.display_name ?? b.member_role_type?.role_name ?? "";
          return ra.localeCompare(rb) || a.last_name.localeCompare(b.last_name);
        }
        case "ou": {
          const oa = ctx.allWorkerOuNames(a.worker_id)[0] ?? "";
          const ob = ctx.allWorkerOuNames(b.worker_id)[0] ?? "";
          return oa.localeCompare(ob) || a.last_name.localeCompare(b.last_name);
        }
        default:
          return (
            a.last_name.localeCompare(b.last_name) ||
            a.first_name.localeCompare(b.first_name)
          );
      }
    });

    // When a specific OU filter is active OR there is no leader to compare
    // against, collapse the suggested/other grouping (no shared-unit signal).
    if (selectedOuId != null || leaderWorkerId == null) {
      return { suggested: sorted, others: [] };
    }

    const suggested: CampaignWorkerRow[] = [];
    const others: CampaignWorkerRow[] = [];
    for (const w of sorted) {
      if (ctx.isSharedUnit(w.worker_id)) suggested.push(w);
      else others.push(w);
    }
    return { suggested, others };
  }, [
    campaignWorkers,
    existingFollowerIds,
    exclusionSet,
    leaderWorkerId,
    search,
    occupationFilter,
    selectedOuId,
    sortBy,
    ctx,
  ]);

  const visible = useMemo(
    () => (onlyMyUnits && selectedOuId == null && leaderWorkerId != null
      ? suggested
      : [...suggested, ...others]),
    [onlyMyUnits, selectedOuId, suggested, others, leaderWorkerId]
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const w of visible) next.add(w.worker_id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const myUnitsLabel =
    ctx.leaderOuIds.size > 0
      ? `Show only workers in ${leaderName ?? "this leader"}'s unit${
          ctx.leaderOuIds.size === 1 ? "" : "s"
        } (${[...ctx.leaderOuIds].map((id) => ctx.ouNames.get(id)).filter(Boolean).join(", ")})`
      : "Show only workers in this leader's units";

  const hasActiveFilters =
    occupationFilter.trim() !== "" || ouFilter !== "all" || search.trim() !== "";

  return (
    <div className="space-y-3 py-2">
      {/* OU filter + sort row */}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <Select value={ouFilter} onValueChange={(v) => { setOuFilter(v); setOnlyMyUnits(false); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Filter by organising unit…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organising units</SelectItem>
              {ctx.allOuEntries.map((ou) => (
                <SelectItem key={ou.id} value={String(ou.id)}>
                  {ou.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36 shrink-0">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Sort…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name A → Z</SelectItem>
              <SelectItem value="name-desc">Name Z → A</SelectItem>
              <SelectItem value="role">By role</SelectItem>
              <SelectItem value="ou">By unit</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Input
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-xs"
      />

      <Input
        placeholder="Filter by occupation…"
        value={occupationFilter}
        onChange={(e) => setOccupationFilter(e.target.value)}
        className="h-8 text-xs"
      />

      {/* "Only my units" toggle — only when a leader is set, has units, & no OU filter active */}
      {leaderWorkerId != null && ouFilter === "all" && ctx.leaderOuIds.size > 0 && (
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={onlyMyUnits}
            onCheckedChange={(v) => setOnlyMyUnits(!!v)}
          />
          <span className="flex-1">{myUnitsLabel}</span>
          <span className="text-muted-foreground">{suggested.length}</span>
        </label>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline"
          onClick={() => {
            setSearch("");
            setOccupationFilter("");
            setOuFilter("all");
            setOnlyMyUnits(ctx.leaderOuIds.size > 0);
          }}
        >
          Clear all filters
        </button>
      )}

      <div className="max-h-72 overflow-y-auto rounded border divide-y">
        {visible.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No matching workers.</p>
        ) : (
          <>
            {suggested.length > 0 && selectedOuId == null && leaderWorkerId != null && (
              <GroupHeader
                label="Suggested from leader's units"
                count={suggested.length}
                onSelectAll={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const w of suggested) next.add(w.worker_id);
                    return next;
                  });
                }}
              />
            )}
            {(leaderWorkerId == null || selectedOuId != null
              ? visible
              : suggested
            ).map((w) => (
              <CandidateRow
                key={`s-${w.worker_id}`}
                worker={w}
                checked={selected.has(w.worker_id)}
                onToggle={() => toggle(w.worker_id)}
                unitNames={ctx.allWorkerOuNames(w.worker_id)}
                highlightUnits={
                  leaderWorkerId != null && ctx.isSharedUnit(w.worker_id)
                }
              />
            ))}
            {(onlyMyUnits ? false : others.length > 0) &&
              selectedOuId == null &&
              leaderWorkerId != null && (
                <GroupHeader
                  label="Other campaign workers"
                  count={others.length}
                  onSelectAll={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const w of others) next.add(w.worker_id);
                      return next;
                    });
                  }}
                />
              )}
            {!onlyMyUnits &&
              selectedOuId == null &&
              leaderWorkerId != null &&
              others.map((w) => (
                <CandidateRow
                  key={`o-${w.worker_id}`}
                  worker={w}
                  checked={selected.has(w.worker_id)}
                  onToggle={() => toggle(w.worker_id)}
                  unitNames={ctx.allWorkerOuNames(w.worker_id)}
                  highlightUnits={false}
                />
              ))}
          </>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {selected.size} selected
          {visible.length > 0 && (
            <>
              {" · "}
              <button
                type="button"
                className="underline"
                onClick={selectAllVisible}
              >
                Select all visible
              </button>
              {selected.size > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="underline"
                    onClick={clearSelection}
                  >
                    Clear
                  </button>
                </>
              )}
            </>
          )}
        </span>
      </div>

      {!hideNotes && (
        <div className="space-y-1">
          <Label className="text-xs">Notes (applied to every new link, optional)</Label>
          <Input
            value={notes ?? ""}
            onChange={(e) => onNotesChange?.(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog wrapper — preserves the BulkAddFollowersDialog API surface.  */
/* ------------------------------------------------------------------ */

export type WorkerPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  leaderWorkerId?: number;
  /** Defaults to "Add workers". */
  title?: string;
  /** Description shown under the title. */
  description?: ReactNode;
  /** Custom submit-button label builder. Defaults vary by leader presence. */
  submitLabel?: (selectedCount: number) => string;
  /** Called with the current selection (and the entered notes) on submit. */
  onSubmit: (selection: { workerIds: number[]; notes: string | null }) => void | Promise<void>;
  /** Disable the submit button (e.g. while a mutation is pending). */
  submitting?: boolean;
  /** Initial selection seed (defaults to []). */
  initialSelected?: number[];
  /** Show the inline notes field inside the picker (defaults to true). */
  showNotes?: boolean;
  /** Optional name used in the "only my units" toggle copy. */
  leaderName?: string;
  excludeWorkerIds?: number[];
};

export function WorkerPickerDialog({
  open,
  onOpenChange,
  campaignId,
  leaderWorkerId,
  title = "Add workers",
  description,
  submitLabel,
  onSubmit,
  submitting = false,
  initialSelected,
  showNotes = true,
  leaderName,
  excludeWorkerIds,
}: WorkerPickerDialogProps) {
  const [workerIds, setWorkerIds] = useState<number[]>(initialSelected ?? []);
  const [notes, setNotes] = useState("");

  // Reset when the dialog re-opens.
  useEffect(() => {
    if (open) {
      setWorkerIds(initialSelected ?? []);
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const labelFor = submitLabel
    ? submitLabel(workerIds.length)
    : `Add ${workerIds.length} ${leaderWorkerId != null
        ? `link${workerIds.length === 1 ? "" : "s"}`
        : `worker${workerIds.length === 1 ? "" : "s"}`}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <WorkerPicker
          campaignId={campaignId}
          leaderWorkerId={leaderWorkerId}
          initialSelected={initialSelected}
          onChange={setWorkerIds}
          excludeWorkerIds={excludeWorkerIds}
          leaderName={leaderName}
          hideNotes={!showNotes}
          notes={notes}
          onNotesChange={setNotes}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              void onSubmit({ workerIds, notes: notes.trim() || null })
            }
            disabled={workerIds.length === 0 || submitting}
          >
            {submitting ? "Working…" : labelFor}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Internal sub-components — same as before, kept here to avoid file   */
/* sprawl now that there's only a single picker file.                  */
/* ------------------------------------------------------------------ */

function GroupHeader({
  label,
  count,
  onSelectAll,
}: {
  label: string;
  count: number;
  onSelectAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1 bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
      <span>
        {label} <span className="normal-case">({count})</span>
      </span>
      <button type="button" className="underline normal-case" onClick={onSelectAll}>
        Select all
      </button>
    </div>
  );
}

function CandidateRow({
  worker,
  checked,
  onToggle,
  unitNames,
  highlightUnits,
}: {
  worker: CampaignWorkerRow;
  checked: boolean;
  onToggle: () => void;
  unitNames: string[];
  highlightUnits: boolean;
}) {
  const role =
    worker.member_role_type?.display_name ?? worker.member_role_type?.role_name;
  const unitText = unitNames.join(", ");
  return (
    <label className="flex items-start gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/40">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">
          {worker.last_name}, {worker.first_name}
        </span>
        {worker.occupation && (
          <span className="block text-[10px] text-muted-foreground truncate">
            {worker.occupation}
          </span>
        )}
      </span>
      <span className="flex flex-col items-end gap-0.5 shrink-0">
        {role && (
          <span className="text-[10px] uppercase bg-background border px-1 rounded">
            {role}
          </span>
        )}
        {unitText && (
          <span
            title={`Unit(s): ${unitText}`}
            className={`text-[10px] rounded px-1 truncate max-w-[10rem] ${
              highlightUnits
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {unitText}
          </span>
        )}
      </span>
    </label>
  );
}
