/**
 * WP2.2 Stage 5 — the wizard's and the settings page's "save units" and
 * "save worker allocation" sequences, expressed as structure-API calls
 * (docs/organiser-ux-review/wp/wp2.2.md §3.11 rows 10–11; §8.3 D41–D45).
 *
 * Both screens keep a draft list in React state and used to reconcile it
 * with the database by hand: delete every unit not in the list, update every
 * unit that is, insert the rest (`campaign-wizard.tsx` step 5,
 * `campaign-settings.tsx` "Campaign units"); and for placements, delete every
 * row on the campaign's units and re-insert the whole grid (step 6 /
 * "Allocate workers"). That second sequence silently lost every placement's
 * `is_primary`, `assignment_source` and `assigned_rule_id` on each save.
 *
 * This module produces the same end state through:
 *
 *   - ONE `structure_units_bulk_save` transaction per "save units"
 *     (`planUnitsBulkSave` → `saveUnitDrafts`). A unit that was about to be
 *     deleted and re-created with the same identity (same `ou_type` and the
 *     same `unit_basis`, e.g. a worksite toggled off and on again) is kept
 *     and updated in place instead, so its placements, rating and rules
 *     survive (D42).
 *   - the DIFFERENCE between the placements that exist and the rows the grid
 *     wants (`planPlacementsSave` → `savePlacements`): `structure_placements_unassign`
 *     for the extra rows, then `structure_placements_assign` for the missing
 *     ones. Rows the grid leaves alone are never touched, so they keep their
 *     id, primary flag and provenance (D43).
 *
 * The planning functions are pure and unit-tested on their own; the two
 * `save*` helpers read the current rows through the caller's client and
 * write only through `structureApi(client)`. No `Insert`/`Update` row type
 * of the two structure tables is constructed here.
 */

import { fetchAllRows, POSTGREST_PAGE_SIZE } from "@/lib/supabase/fetch-all-rows";
import {
  structureApi,
  type JsonObject,
  type PlacementsAssignResult,
  type StructureRpcClient,
  type UnitCreateElement,
  type UnitPatch,
  type UnitsBulkSaveResult,
} from "./structure-api";

// ---------------------------------------------------------------------------
// Client shape (reads only; every write goes through structureApi)
// ---------------------------------------------------------------------------

/** The read chains these helpers issue (`select(...).eq(...).order(...)` / `select(...).in(...).order(...).order(...).range(...)`). */
interface ReadChain extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  eq(column: string, value: unknown): ReadChain;
  in(column: string, values: unknown[]): ReadChain;
  order(column: string, options?: { ascending?: boolean }): ReadChain;
  range(from: number, to: number): ReadChain;
}
interface ReadTable {
  select(columns: string): ReadChain;
}

/**
 * The subset of the Supabase client these helpers use: `rpc` (through the
 * structure API) and `from` for two reads. `from` is typed `unknown` here on
 * purpose — checking `SupabaseClient["from"]` against a structural builder
 * type is an "excessively deep" instantiation for tsc — and narrowed to
 * `ReadTable` at the two call sites. Both app clients satisfy it.
 */
export interface StructureSaveClient extends StructureRpcClient {
  from(table: string): unknown;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** What the planner needs from a `CampaignUnitDraft` (step-campaign-units.tsx). */
export interface UnitDraftInput {
  draft_id: string;
  /** Server id once saved; null for a unit added in this session. */
  ou_id: number | null;
  ou_type: string;
  name: string;
  total_workers_estimated: number | null;
  /** `CampaignOuUnitBasis` (an interface, hence `object` rather than `JsonObject`). */
  unit_basis: object | null | undefined;
  parent_draft_id?: string | null;
  parent_ou_id?: number | null;
  is_group_container?: boolean;
  ou_group_id?: number | null;
}

/** The columns `saveUnitDrafts` reads for the campaign's current units. */
export interface ExistingUnitRow {
  ou_id: number;
  ou_type: string;
  unit_basis: JsonObject | null;
  parent_ou_id: number | null;
  is_group_container: boolean;
}

export const EXISTING_UNIT_COLUMNS = "ou_id, ou_type, unit_basis, parent_ou_id, is_group_container";

export interface UnitsSavePlan {
  deleteOuIds: number[];
  updates: Array<{ ou_id: number } & UnitPatch>;
  creates: UnitCreateElement[];
  /**
   * draft_id → ou_id of an existing unit that the legacy sequence would have
   * deleted and re-created, and that is updated in place instead (D42).
   */
  reusedOuIdByDraftId: Map<string, number>;
  /**
   * New drafts that were not sent because their parent draft could not be
   * resolved (a dangling `parent_draft_id` with no `parent_ou_id`). The
   * legacy insert dropped these silently too ("safeChildRows").
   */
  droppedDraftIds: string[];
}

/**
 * The `unit_basis` keys that identify a unit built from campaign scope. A
 * draft and an existing unit are "the same unit" when they share `ou_type`
 * and an identical basis object carrying at least one of these keys;
 * `{ custom: true }` and split-derived bases never match (D42).
 */
const IDENTITY_BASIS_KEYS = [
  "worksite_id",
  "employer_id",
  "canonical_occupation_id",
  "occupation_group_id",
] as const;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

/** The reuse key of a top-level, non-container unit, or null when it has no scope identity. */
export function unitIdentityKey(ouType: string, basis: object | null | undefined): string | null {
  if (!basis || typeof basis !== "object" || Array.isArray(basis)) return null;
  const record = basis as Record<string, unknown>;
  const hasIdentity = IDENTITY_BASIS_KEYS.some((k) => record[k] !== undefined && record[k] !== null);
  if (!hasIdentity) return null;
  return `${ouType}|${stableJson(basis)}`;
}

type ParentRef = { ref: number | string; container: boolean };

/**
 * Turns the draft list and the campaign's current units into one
 * `structure_units_bulk_save` payload:
 *
 *   - deletes: every current unit whose id is not in the list, minus the
 *     ones a new draft re-identifies (D42);
 *   - updates: every draft with an id (existing or reused), in list order —
 *     `name`, `total_workers_estimated`, `unit_basis` (the only fields the
 *     editor changes on an existing unit; the legacy update also re-sent
 *     `ou_type` and the hierarchy columns with their unchanged values, D44);
 *   - creates: the remaining drafts, parents before children, `client_ref`
 *     = `draft_id`, `display_order` continuing after the current units as the
 *     legacy insert numbered them. A child names its parent by id (an
 *     existing or reused unit) or by the parent's `client_ref` (a parent
 *     created in the same call); `ou_group_id` is set only when that parent
 *     is a group container (D45).
 */
export function planUnitsBulkSave(existing: readonly ExistingUnitRow[], drafts: readonly UnitDraftInput[]): UnitsSavePlan {
  const existingById = new Map(existing.map((r) => [r.ou_id, r]));
  const keepIds = new Set(drafts.filter((d) => d.ou_id != null).map((d) => d.ou_id as number));
  // Ascending ou_id so a D42 reuse match is deterministic whatever order the rows arrived in (D55).
  const deleteCandidates = existing.filter((r) => !keepIds.has(r.ou_id)).sort((a, b) => a.ou_id - b.ou_id);

  // D42: a new top-level draft that re-identifies a unit about to be deleted keeps it.
  const reusedOuIdByDraftId = new Map<string, number>();
  const reusedIds = new Set<number>();
  for (const d of drafts) {
    if (d.ou_id != null || d.is_group_container || d.parent_draft_id || d.parent_ou_id != null) continue;
    const key = unitIdentityKey(d.ou_type, d.unit_basis);
    if (!key) continue;
    const match = deleteCandidates.find(
      (r) =>
        !reusedIds.has(r.ou_id) &&
        !r.is_group_container &&
        r.parent_ou_id == null &&
        unitIdentityKey(r.ou_type, r.unit_basis) === key
    );
    if (!match) continue;
    reusedOuIdByDraftId.set(d.draft_id, match.ou_id);
    reusedIds.add(match.ou_id);
  }

  const deleteOuIds = deleteCandidates.filter((r) => !reusedIds.has(r.ou_id)).map((r) => r.ou_id);

  const idByDraft = new Map<string, number>();
  for (const d of drafts) {
    const id = d.ou_id ?? reusedOuIdByDraftId.get(d.draft_id) ?? null;
    if (id != null) idByDraft.set(d.draft_id, id);
  }

  const updates = drafts
    .filter((d) => idByDraft.has(d.draft_id))
    .map((d) => ({
      ou_id: idByDraft.get(d.draft_id) as number,
      name: d.name,
      total_workers_estimated: d.total_workers_estimated ?? null,
      unit_basis: (d.unit_basis as JsonObject | null | undefined) ?? null,
    }));

  const draftById = new Map(drafts.map((d) => [d.draft_id, d]));
  const placed = new Set<string>();
  const creates: UnitCreateElement[] = [];
  const droppedDraftIds: string[] = [];

  /** null = top-level; "later" = parent is a draft not placed yet; "dropped" = unresolvable (legacy safeChildRows). */
  const resolveParent = (d: UnitDraftInput): ParentRef | null | "later" | "dropped" => {
    if (d.parent_draft_id) {
      const parent = draftById.get(d.parent_draft_id);
      if (parent) {
        const parentId = idByDraft.get(parent.draft_id);
        if (parentId != null) return { ref: parentId, container: parent.is_group_container === true };
        if (placed.has(parent.draft_id)) return { ref: parent.draft_id, container: parent.is_group_container === true };
        return "later";
      }
      // Legacy precedence: a parent draft that no longer exists falls back to
      // parent_ou_id, and a child with neither is dropped, never promoted.
      if (d.parent_ou_id != null) {
        return { ref: d.parent_ou_id, container: existingById.get(d.parent_ou_id)?.is_group_container === true };
      }
      return "dropped";
    }
    if (d.parent_ou_id != null) {
      return { ref: d.parent_ou_id, container: existingById.get(d.parent_ou_id)?.is_group_container === true };
    }
    return null;
  };

  const place = (d: UnitDraftInput, parent: ParentRef | null) => {
    const isContainer = d.is_group_container === true;
    const element: UnitCreateElement = {
      client_ref: d.draft_id,
      name: d.name,
      ou_type: d.ou_type,
      total_workers_estimated: d.total_workers_estimated ?? null,
      unit_basis: (d.unit_basis as JsonObject | null | undefined) ?? null,
      display_order: existing.length + creates.length,
      is_group_container: isContainer,
    };
    if (parent) {
      element.parent_ou_id = parent.ref;
      if (parent.container && !isContainer) element.ou_group_id = parent.ref;
    }
    creates.push(element);
    placed.add(d.draft_id);
  };

  const newDrafts = drafts.filter((d) => !idByDraft.has(d.draft_id));
  // Pass 1 — the legacy "parentDrafts": every new draft without a parent draft.
  for (const d of newDrafts.filter((d) => !d.parent_draft_id)) {
    const parent = resolveParent(d);
    place(d, parent === null ? null : (parent as ParentRef));
  }
  // Pass 2… — the legacy "childDrafts", repeated so a child of a child (a
  // sub-unit under a new group member) resolves through its parent's
  // client_ref instead of being dropped.
  let pending = newDrafts.filter((d) => !!d.parent_draft_id);
  let progress = true;
  while (pending.length > 0 && progress) {
    progress = false;
    const next: UnitDraftInput[] = [];
    for (const d of pending) {
      const parent = resolveParent(d);
      if (parent === "later") {
        next.push(d);
        continue;
      }
      progress = true;
      if (parent === "dropped") {
        droppedDraftIds.push(d.draft_id);
        continue;
      }
      place(d, parent);
    }
    pending = next;
  }
  // Whatever is left waits on a parent draft that was itself never placed.
  for (const d of pending) droppedDraftIds.push(d.draft_id);

  return { deleteOuIds, updates, creates, reusedOuIdByDraftId, droppedDraftIds };
}

/**
 * Resolves the draft list after a successful bulk save: `ou_id` from the
 * reuse map or the RPC's `created` list (matched on `client_ref`),
 * `parent_ou_id` from the parent draft, and `ou_group_id` = the parent only
 * when the parent is a group container (what the RPC wrote, D45).
 */
export function applyUnitsSaveResult<T extends UnitDraftInput>(
  drafts: readonly T[],
  existing: readonly ExistingUnitRow[],
  plan: UnitsSavePlan,
  result: UnitsBulkSaveResult
): T[] {
  const createdByRef = new Map<string, number>();
  for (const c of result.created) {
    if (c.client_ref != null) createdByRef.set(c.client_ref, c.ou_id);
  }
  const idOf = (draftId: string): number | null => {
    const d = drafts.find((x) => x.draft_id === draftId);
    if (!d) return null;
    return d.ou_id ?? plan.reusedOuIdByDraftId.get(draftId) ?? createdByRef.get(draftId) ?? null;
  };
  const existingById = new Map(existing.map((r) => [r.ou_id, r]));
  const isContainerParent = (d: T): boolean => {
    if (d.parent_draft_id) {
      const parent = drafts.find((x) => x.draft_id === d.parent_draft_id);
      if (parent) return parent.is_group_container === true;
    }
    if (d.parent_ou_id != null) return existingById.get(d.parent_ou_id)?.is_group_container === true;
    return false;
  };

  return drafts.map((d) => {
    const next = { ...d };
    if (next.ou_id == null) {
      const id = idOf(d.draft_id);
      if (id != null) next.ou_id = id;
    }
    if (next.parent_draft_id && next.parent_ou_id == null) {
      next.parent_ou_id = idOf(next.parent_draft_id) ?? null;
    }
    if (
      next.is_group_container !== true &&
      next.parent_ou_id != null &&
      next.ou_group_id == null &&
      isContainerParent(next)
    ) {
      next.ou_group_id = next.parent_ou_id;
    }
    return next;
  });
}

/** Thrown by `validateUnitsSavePlan` before any RPC is issued (D53). Its message is the sentence the screen shows. */
export class UnitDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitDraftValidationError";
  }
}

const NAME_MAX_LENGTH = 200;
const INT32_MAX = 2_147_483_647;

function quoted(name: string): string {
  const trimmed = name.trim();
  return `"${trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed}"`;
}

/**
 * Mirrors, before the RPC is called, the checks `structure__create_units` /
 * `structure__update_unit` apply to every element the plan sends (a blank
 * or whitespace-only name, a name over 200 characters, a negative,
 * fractional or over-32-bit worker estimate), and names the unit in the list — "Unit 3 (worksite) has no
 * name." — instead of the RPC's `p_updates[2]: "name" must not be blank`.
 * The legacy insert/update saved a blank name (`varchar(200) NOT NULL`, no
 * non-empty CHECK), so one legacy blank-named row would otherwise make every
 * later save fail (D53).
 */
export function validateUnitsSavePlan(plan: UnitsSavePlan, drafts: readonly UnitDraftInput[]): void {
  const position = new Map(drafts.map((d, i) => [d.draft_id, i + 1]));
  const byId = new Map<number, string>();
  for (const d of drafts) {
    const id = d.ou_id ?? plan.reusedOuIdByDraftId.get(d.draft_id);
    if (id != null) byId.set(id, d.draft_id);
  }
  const check = (draftId: string | undefined, name: string, estimate: number | null | undefined) => {
    const draft = draftId ? drafts.find((d) => d.draft_id === draftId) : undefined;
    const where = `Unit ${draftId ? position.get(draftId) ?? "?" : "?"}${draft ? ` (${draft.ou_type.replace(/_/g, " ")})` : ""}`;
    if (name.trim() === "") throw new UnitDraftValidationError(`${where} has no name.`);
    if (name.trim().length > NAME_MAX_LENGTH) {
      throw new UnitDraftValidationError(`Unit ${quoted(name)} has a name longer than ${NAME_MAX_LENGTH} characters.`);
    }
    if (estimate != null && estimate < 0) {
      throw new UnitDraftValidationError(`Unit ${quoted(name)} has a negative worker estimate.`);
    }
    // D58: the RPC's `structure__json_int` — a whole number within 32 bits;
    // the editor's number inputs let "2.5" through with only a >= 0 filter.
    if (estimate != null && !Number.isInteger(estimate)) {
      throw new UnitDraftValidationError(`Unit ${quoted(name)} has a worker estimate that is not a whole number.`);
    }
    if (estimate != null && estimate > INT32_MAX) {
      throw new UnitDraftValidationError(`Unit ${quoted(name)} has a worker estimate above ${INT32_MAX.toLocaleString("en-AU")}.`);
    }
  };
  for (const u of plan.updates) check(byId.get(u.ou_id), u.name ?? "", u.total_workers_estimated);
  for (const c of plan.creates) check(c.client_ref, c.name, c.total_workers_estimated);
}

export interface SaveUnitDraftsOutcome<T extends UnitDraftInput> {
  drafts: T[];
  plan: UnitsSavePlan;
  result: UnitsBulkSaveResult;
}

/**
 * "Save units": reads the campaign's current units, plans, and issues ONE
 * `structure_units_bulk_save` — always, even when there is nothing to
 * change, so a refused save (42501) is a visible error and never a silent
 * "saved" (D41). Returns the drafts with their server ids resolved.
 *
 * A failed read throws (Stage 6, A4): the legacy sequence went on with
 * `existing = []`, which planned a save from nothing — no deletes, every
 * kept unit re-created, `display_order` restarted at 0. A save must never
 * be planned from a read that did not happen. The read is not paged: a
 * campaign's units number in the hundreds (the wizard renders them all),
 * far below PostgREST's max-rows.
 */
export async function saveUnitDrafts<T extends UnitDraftInput>(
  client: StructureSaveClient,
  campaignId: number,
  drafts: readonly T[]
): Promise<SaveUnitDraftsOutcome<T>> {
  const { data, error } = await (client.from("campaign_organising_units") as ReadTable)
    .select(EXISTING_UNIT_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("ou_id", { ascending: true });
  if (error) throw new Error(error.message);
  const existing = ((data as ExistingUnitRow[] | null) ?? []).map((r) => ({
    ou_id: r.ou_id,
    ou_type: r.ou_type,
    unit_basis: r.unit_basis ?? null,
    parent_ou_id: r.parent_ou_id ?? null,
    is_group_container: r.is_group_container === true,
  }));

  const plan = planUnitsBulkSave(existing, drafts);
  validateUnitsSavePlan(plan, drafts);
  const result = await structureApi(client).units.bulkSave({
    campaignId,
    deleteOuIds: plan.deleteOuIds,
    updates: plan.updates,
    creates: plan.creates,
  });
  return { drafts: applyUnitsSaveResult(drafts, existing, plan, result), plan, result };
}

// ---------------------------------------------------------------------------
// Placements
// ---------------------------------------------------------------------------

export interface PlacementKey {
  ou_id: number;
  worker_id: number;
}

export interface PlacementsSavePlan {
  /** Rows that exist but the grid no longer wants, grouped by unit (ascending ou_id, ascending worker_id). */
  unassign: Array<{ ouId: number; workerIds: number[] }>;
  /** Rows the grid wants that do not exist yet, grouped the same way. */
  assign: Array<{ ouId: number; workerIds: number[] }>;
}

function groupByUnit(rows: Iterable<PlacementKey>): Array<{ ouId: number; workerIds: number[] }> {
  const byOu = new Map<number, Set<number>>();
  for (const r of rows) {
    if (!byOu.has(r.ou_id)) byOu.set(r.ou_id, new Set());
    byOu.get(r.ou_id)!.add(r.worker_id);
  }
  return [...byOu.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ouId, ids]) => ({ ouId, workerIds: [...ids].sort((a, b) => a - b) }));
}

/**
 * The set difference between the placements that exist on the units in
 * scope and the rows the allocation grid wants. Unassigns come first so a
 * worker moved between two units of one group is removed before being
 * placed (otherwise `p_on_conflict: "skip"` would keep the old row and skip
 * the new one).
 */
export function planPlacementsSave(current: readonly PlacementKey[], desired: readonly PlacementKey[]): PlacementsSavePlan {
  const key = (r: PlacementKey) => `${r.ou_id}:${r.worker_id}`;
  const currentKeys = new Set(current.map(key));
  const desiredKeys = new Set(desired.map(key));
  return {
    unassign: groupByUnit(current.filter((r) => !desiredKeys.has(key(r)))),
    assign: groupByUnit(desired.filter((r) => !currentKeys.has(key(r)))),
  };
}

export interface SavePlacementsOutcome {
  plan: PlacementsSavePlan;
  removed: number;
  inserted: number;
  moved: number;
  /** Additions the RPC left out because the worker already holds a unit in that group (C-a). */
  skipped: number;
}

/**
 * "Save worker allocation": reads the placements on `ouIds` (the units the
 * screen knows about — the legacy delete's scope), then one
 * `structure_placements_unassign` per unit with rows to drop and one
 * `structure_placements_assign` (`manual`, not primary, `p_on_conflict:
 * "skip"`) per unit with rows to add. A read failure throws (the legacy
 * delete's error did too); nothing is written blind.
 *
 * The read is paged (Stage 6, §8.2 "Unpaged placement read"): `.order("ou_id")
 * .order("worker_id").range(from, from + PAGE_SIZE - 1)` until a short page,
 * so a row beyond PostgREST's max-rows is neither treated as absent (and so
 * re-assigned → skipped) nor left out of the unassign set.
 */
export async function savePlacements(
  client: StructureSaveClient,
  campaignId: number,
  ouIds: readonly number[],
  desired: readonly PlacementKey[]
): Promise<SavePlacementsOutcome> {
  let current: PlacementKey[] = [];
  if (ouIds.length > 0) {
    const rows = await fetchAllRows<PlacementKey>(
      (from, to) =>
        (client.from("campaign_worker_ou") as ReadTable)
          .select("ou_id, worker_id")
          .in("ou_id", [...ouIds])
          .order("ou_id", { ascending: true })
          .order("worker_id", { ascending: true })
          .range(from, to) as PromiseLike<{ data: PlacementKey[] | null; error: { message: string } | null }>,
      POSTGREST_PAGE_SIZE
    );
    current = rows.map((r) => ({ ou_id: r.ou_id, worker_id: r.worker_id }));
  }

  const plan = planPlacementsSave(current, desired);
  const api = structureApi(client);
  let removed = 0;
  for (const { ouId, workerIds } of plan.unassign) {
    const res = await api.placements.unassign({ campaignId, workerIds, ouId });
    removed += res.removed;
  }
  let inserted = 0;
  let moved = 0;
  let skipped = 0;
  for (const { ouId, workerIds } of plan.assign) {
    const res: PlacementsAssignResult = await api.placements.assign({
      campaignId,
      ouId,
      workerIds,
      source: "manual",
      isPrimary: false,
      onConflict: "skip",
    });
    inserted += res.inserted;
    moved += res.moved;
    skipped += res.skipped;
  }
  return { plan, removed, inserted, moved, skipped };
}
