/**
 * WP2.2 structure API — the typing boundary for every write to
 * `campaign_organising_units` and `campaign_worker_ou`
 * (docs/organiser-ux-review/wp/wp2.2.md §3.9).
 *
 * `structureApi(client)` returns one method per transactional RPC of §3.3.
 * Each method serialises its hand-written argument object into the RPC's
 * `p_*` parameters, calls `client.rpc(name, args)` — the only call this module
 * makes — parses the `jsonb` result with a zod schema, and maps a
 * `PostgrestError` to a `StructureApiError` whose `kind` follows the §3.2
 * table (plus `schema_missing` for PostgREST's `PGRST202`, §8.2).
 *
 * Nothing here constructs a `campaign_worker_ou.Insert`/`Update` or a
 * `campaign_organising_units.Insert` object: `group_id` is trigger-derived and
 * never sent by clients. Argument and result types are hand-written on purpose
 * (§2.7: generated `Functions` entries are never relied on).
 *
 * Works with both the untyped browser client (`lib/supabase/client.ts`) and the
 * user-session server client (`lib/supabase/server.ts`): the parameter is the
 * minimal structural shape both satisfy.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// RPC names
// ---------------------------------------------------------------------------

export const STRUCTURE_RPC_NAMES = [
  "structure_group_create",
  "structure_group_update",
  "structure_group_reorder",
  "structure_group_delete",
  "structure_units_create",
  "structure_unit_update",
  "structure_unit_reorder",
  "structure_unit_delete",
  "structure_unit_merge",
  "structure_unit_split",
  "structure_units_bulk_save",
  "structure_placements_assign",
  "structure_placements_move",
  "structure_placements_unassign",
  "structure_placements_set_primary",
  "structure_placements_replace_rule_rows",
  "structure_materialise_employer_placements",
] as const;

export type StructureRpcName = (typeof STRUCTURE_RPC_NAMES)[number];

// ---------------------------------------------------------------------------
// Client shape
// ---------------------------------------------------------------------------

/** The subset of `PostgrestError` the mapping reads (all optional but `message`). */
export interface PostgrestErrorLike {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

/**
 * Minimal structural client: anything with a PostgREST-style `rpc`. Both
 * `SupabaseClient` flavours used in the app satisfy it without a cast.
 */
export interface StructureRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: PostgrestErrorLike | null }>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type StructureApiErrorKind =
  | "forbidden"
  | "invalid_argument"
  | "not_found"
  | "duplicate_in_group"
  | "duplicate_group"
  | "rule_violation"
  | "schema_missing"
  | "unknown";

export const ONE_UNIT_PER_GROUP_CONSTRAINT = "campaign_worker_ou_one_unit_per_group";

export class StructureApiError extends Error {
  readonly kind: StructureApiErrorKind;
  /** SQLSTATE (e.g. `42501`), a PostgREST code (`PGRST202`), or `invalid_result`. */
  readonly code: string;
  readonly constraint?: string;
  readonly hint?: string;
  readonly details?: string;
  readonly rpc: StructureRpcName;

  constructor(init: {
    rpc: StructureRpcName;
    kind: StructureApiErrorKind;
    code: string;
    message: string;
    constraint?: string;
    hint?: string;
    details?: string;
  }) {
    super(init.message);
    this.name = "StructureApiError";
    this.rpc = init.rpc;
    this.kind = init.kind;
    this.code = init.code;
    this.constraint = init.constraint;
    this.hint = init.hint;
    this.details = init.details;
  }
}

export function isStructureApiError(error: unknown): error is StructureApiError {
  return error instanceof StructureApiError;
}

const CONSTRAINT_PATTERNS = [
  /unique constraint "([^"]+)"/i,
  /constraint "([^"]+)"/i,
];

/** Extracts a constraint name from the PostgreSQL message/details text. */
export function extractConstraintName(error: PostgrestErrorLike): string | undefined {
  for (const text of [error.message, error.details ?? ""]) {
    if (!text) continue;
    for (const pattern of CONSTRAINT_PATTERNS) {
      const match = pattern.exec(text);
      if (match) return match[1];
    }
  }
  return undefined;
}

function kindFor(code: string, constraint: string | undefined, error: PostgrestErrorLike): StructureApiErrorKind {
  switch (code) {
    case "42501":
      return "forbidden";
    case "22023":
      return "invalid_argument";
    case "P0002":
      return "not_found";
    case "P0001":
      return "rule_violation";
    case "PGRST202":
      return "schema_missing";
    case "23505":
      if (constraint === ONE_UNIT_PER_GROUP_CONSTRAINT) return "duplicate_in_group";
      if (constraint?.startsWith("campaign_groups_")) return "duplicate_group";
      // campaign_group_ensure raises its own 23505 without a constraint name.
      if (/A group named/.test(error.message)) return "duplicate_group";
      return "unknown";
    default:
      return "unknown";
  }
}

/** `PostgrestError` → `StructureApiError` (wp2.2.md §3.2 table + PGRST202). */
export function mapPostgrestError(rpc: StructureRpcName, error: PostgrestErrorLike): StructureApiError {
  const code = error.code ?? "";
  const constraint = extractConstraintName(error);
  return new StructureApiError({
    rpc,
    kind: kindFor(code, constraint, error),
    code,
    message: error.message,
    constraint,
    hint: error.hint ?? undefined,
    details: error.details ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Argument types (hand-written; mirror the SQL signatures of §3.3)
// ---------------------------------------------------------------------------

export type GroupKind = "worksite" | "employer" | "shift" | "crew" | "occupation" | "work_area" | "custom";
export type GroupDeleteMode = "empty_only" | "cascade_units";
export type AssignmentSource = "manual" | "rule" | "universe";
export type OnConflict = "skip" | "move" | "error";
export type UnitSource = "manual" | "wtp_seeded" | "generated" | "field_discovery";

/** A JSON value the SQL side stores as jsonb (`unit_basis`, `source_metadata`). */
export type JsonObject = { [key: string]: unknown };

/**
 * One element of `p_units` / `p_children` / `p_creates` (structure_units_create).
 * `parent_ou_id` / `ou_group_id` accept an existing unit id or the `client_ref`
 * of an earlier element in the same call. Real column names only (wp2.2.md
 * §8.3 D3); `estimated_size` is an alias of `total_workers_estimated`.
 */
export interface UnitCreateElement {
  client_ref?: string;
  name: string;
  ou_type: string;
  total_workers_estimated?: number | null;
  estimated_size?: number | null;
  target_size?: number | null;
  commonality_logic?: string | null;
  display_order?: number;
  is_group_container?: boolean;
  parent_ou_id?: number | string | null;
  ou_group_id?: number | string | null;
  ou_group_name?: string | null;
  group_id?: number | null;
  unit_basis?: JsonObject | null;
  source?: UnitSource;
  anchor_worker_id?: number | null;
  user_rating?: number | null;
  source_metadata?: JsonObject | null;
}

/** Split children: every key of `UnitCreateElement` is optional but `name`. */
export type SplitChildElement = Partial<UnitCreateElement> & { name: string };

export interface UnitPatch {
  name?: string;
  total_workers_estimated?: number | null;
  estimated_size?: number | null;
  target_size?: number | null;
  commonality_logic?: string | null;
  display_order?: number;
  user_rating?: number | null;
  anchor_worker_id?: number | null;
  unit_basis?: JsonObject | null;
  source_metadata?: JsonObject | null;
}

export interface UnitCreateAssignment {
  ou_ref: string | number;
  worker_id: number;
  is_primary?: boolean;
  source?: AssignmentSource;
}

export interface SplitAssignment {
  child_ref: string | number;
  worker_id: number;
}

export interface Reassignment {
  worker_id: number;
  to_ou_id: number | null;
  is_primary?: boolean;
}

export interface RuleRow {
  ou_id: number;
  worker_id: number;
  assigned_rule_id?: number | null;
}

export interface GroupCreateArgs {
  campaignId: number;
  kind: GroupKind;
  name: string;
  displayOrder?: number | null;
}
export interface GroupUpdateArgs {
  campaignId: number;
  groupId: number;
  name?: string | null;
  displayOrder?: number | null;
}
export interface GroupReorderArgs {
  campaignId: number;
  groupIds: number[];
}
export interface GroupRemoveArgs {
  campaignId: number;
  groupId: number;
  mode: GroupDeleteMode;
}

export interface UnitsCreateArgs {
  campaignId: number;
  units: UnitCreateElement[];
  assignments?: UnitCreateAssignment[];
}
export interface UnitUpdateArgs {
  campaignId: number;
  ouId: number;
  patch: UnitPatch;
}
export interface UnitReorderArgs {
  campaignId: number;
  ouIds: number[];
}
export interface UnitRemoveArgs {
  campaignId: number;
  ouId: number;
  reassignments?: Reassignment[];
  deleteChildren?: boolean;
}
export interface UnitMergeArgs {
  campaignId: number;
  survivorOuId: number;
  sourceOuIds: number[];
}
export interface UnitSplitArgs {
  campaignId: number;
  sourceOuId: number;
  children: SplitChildElement[];
  assignments?: SplitAssignment[];
  keepInSource?: boolean;
  groupId?: number | null;
}
export interface UnitsBulkSaveArgs {
  campaignId: number;
  deleteOuIds?: number[];
  updates?: Array<{ ou_id: number } & UnitPatch>;
  creates?: UnitCreateElement[];
}

export interface PlacementsAssignArgs {
  campaignId: number;
  ouId: number;
  workerIds: number[];
  source?: AssignmentSource;
  isPrimary?: boolean;
  onConflict?: OnConflict;
}
export interface PlacementsMoveArgs {
  campaignId: number;
  workerIds: number[];
  fromOuId?: number | null;
  /** `null`/absent = unassign (all, or within `withinGroupId`). */
  toOuId?: number | null;
  withinGroupId?: number | null;
  /** Copy instead of move; cross-group only (K1). */
  keepSource?: boolean;
  /** Legacy keepInParent (default true on the SQL side). */
  keepInParent?: boolean;
}
export interface PlacementsUnassignArgs {
  campaignId: number;
  workerIds: number[];
  ouId?: number | null;
  withinGroupId?: number | null;
}
export interface PlacementsSetPrimaryArgs {
  campaignId: number;
  workerId: number;
  ouId: number;
}
export interface PlacementsReplaceRuleRowsArgs {
  campaignId: number;
  rows: RuleRow[];
}
export interface MaterialiseEmployerArgs {
  campaignId: number;
}

// ---------------------------------------------------------------------------
// Result schemas (stable keys of §3.3; unknown keys are tolerated)
// ---------------------------------------------------------------------------

const int = z.number().int();
const intArray = z.array(int);

const createdUnit = z.object({
  client_ref: z.string().nullable(),
  ou_id: int,
  group_id: int.nullable(),
});

export const groupCreateResultSchema = z.object({ group_id: int, created: z.boolean() });
export const groupUpdateResultSchema = z.object({ group_id: int });
export const groupReorderResultSchema = z.object({ updated: int, unlisted: int });
export const groupRemoveResultSchema = z.object({
  group_id: int,
  deleted_ou_ids: intArray,
  placements_removed: int,
});

export const unitsCreateResultSchema = z.object({
  units: z.array(createdUnit),
  inserted: int,
  moved: int,
  skipped: int,
  displaced: int,
});
export const unitUpdateResultSchema = z.object({ ou_id: int, updated_keys: z.array(z.string()) });
export const unitReorderResultSchema = z.object({ updated: int });
export const unitRemoveResultSchema = z.object({
  deleted_ou_ids: intArray,
  placements_moved: int,
  placements_removed: int,
  placements_displaced: int,
});
export const unitMergeResultSchema = z.object({
  moved: int,
  collapsed: int,
  deleted_ou_ids: intArray,
  repointed: z.record(z.string(), int),
});
export const unitSplitResultSchema = z.object({
  children: z.array(createdUnit),
  moved: int,
  copied: int,
  kept: int,
  displaced: int,
});
export const unitsBulkSaveResultSchema = z.object({
  deleted_ou_ids: intArray,
  updated_ou_ids: intArray,
  created: z.array(createdUnit),
  placements_removed: int,
});

export const placementsAssignResultSchema = z.object({
  inserted: int,
  moved: int,
  skipped: int,
  displaced: int,
});
export const placementsMoveResultSchema = z.object({
  moved: int,
  inserted: int,
  displaced: int,
  removed: int,
  skipped: int,
  parent_inserted: int,
});
export const placementsUnassignResultSchema = z.object({ removed: int });
export const placementsSetPrimaryResultSchema = z.object({ placement_id: int, cleared: int });
export const placementsReplaceRuleRowsResultSchema = z.object({
  removed: int,
  inserted: int,
  skipped: int,
});
export const materialiseEmployerResultSchema = z.object({
  inserted: int,
  skipped_existing: int,
  containers: int,
  multi_container_workers: int,
});

export type GroupCreateResult = z.infer<typeof groupCreateResultSchema>;
export type GroupUpdateResult = z.infer<typeof groupUpdateResultSchema>;
export type GroupReorderResult = z.infer<typeof groupReorderResultSchema>;
export type GroupRemoveResult = z.infer<typeof groupRemoveResultSchema>;
export type UnitsCreateResult = z.infer<typeof unitsCreateResultSchema>;
export type UnitUpdateResult = z.infer<typeof unitUpdateResultSchema>;
export type UnitReorderResult = z.infer<typeof unitReorderResultSchema>;
export type UnitRemoveResult = z.infer<typeof unitRemoveResultSchema>;
export type UnitMergeResult = z.infer<typeof unitMergeResultSchema>;
export type UnitSplitResult = z.infer<typeof unitSplitResultSchema>;
export type UnitsBulkSaveResult = z.infer<typeof unitsBulkSaveResultSchema>;
export type PlacementsAssignResult = z.infer<typeof placementsAssignResultSchema>;
export type PlacementsMoveResult = z.infer<typeof placementsMoveResultSchema>;
export type PlacementsUnassignResult = z.infer<typeof placementsUnassignResultSchema>;
export type PlacementsSetPrimaryResult = z.infer<typeof placementsSetPrimaryResultSchema>;
export type PlacementsReplaceRuleRowsResult = z.infer<typeof placementsReplaceRuleRowsResultSchema>;
export type MaterialiseEmployerResult = z.infer<typeof materialiseEmployerResultSchema>;

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

async function callRpc<T>(
  client: StructureRpcClient,
  rpc: StructureRpcName,
  args: Record<string, unknown>,
  schema: z.ZodType<T>
): Promise<T> {
  const { data, error } = await client.rpc(rpc, args);
  if (error) throw mapPostgrestError(rpc, error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new StructureApiError({
      rpc,
      kind: "unknown",
      code: "invalid_result",
      message: `${rpc} returned an unexpected result shape: ${parsed.error.message}`,
    });
  }
  return parsed.data;
}

export function structureApi(client: StructureRpcClient) {
  return {
    groups: {
      create: (a: GroupCreateArgs) =>
        callRpc(
          client,
          "structure_group_create",
          {
            p_campaign_id: a.campaignId,
            p_kind: a.kind,
            p_name: a.name,
            p_display_order: a.displayOrder ?? null,
          },
          groupCreateResultSchema
        ),
      update: (a: GroupUpdateArgs) =>
        callRpc(
          client,
          "structure_group_update",
          {
            p_campaign_id: a.campaignId,
            p_group_id: a.groupId,
            p_name: a.name ?? null,
            p_display_order: a.displayOrder ?? null,
          },
          groupUpdateResultSchema
        ),
      reorder: (a: GroupReorderArgs) =>
        callRpc(
          client,
          "structure_group_reorder",
          { p_campaign_id: a.campaignId, p_group_ids: a.groupIds },
          groupReorderResultSchema
        ),
      remove: (a: GroupRemoveArgs) =>
        callRpc(
          client,
          "structure_group_delete",
          { p_campaign_id: a.campaignId, p_group_id: a.groupId, p_mode: a.mode },
          groupRemoveResultSchema
        ),
    },
    units: {
      create: (a: UnitsCreateArgs) =>
        callRpc(
          client,
          "structure_units_create",
          {
            p_campaign_id: a.campaignId,
            p_units: a.units,
            p_assignments: a.assignments ?? [],
          },
          unitsCreateResultSchema
        ),
      update: (a: UnitUpdateArgs) =>
        callRpc(
          client,
          "structure_unit_update",
          { p_campaign_id: a.campaignId, p_ou_id: a.ouId, p_patch: a.patch },
          unitUpdateResultSchema
        ),
      reorder: (a: UnitReorderArgs) =>
        callRpc(
          client,
          "structure_unit_reorder",
          { p_campaign_id: a.campaignId, p_ou_ids: a.ouIds },
          unitReorderResultSchema
        ),
      remove: (a: UnitRemoveArgs) =>
        callRpc(
          client,
          "structure_unit_delete",
          {
            p_campaign_id: a.campaignId,
            p_ou_id: a.ouId,
            p_reassignments: a.reassignments ?? [],
            p_delete_children: a.deleteChildren ?? false,
          },
          unitRemoveResultSchema
        ),
      merge: (a: UnitMergeArgs) =>
        callRpc(
          client,
          "structure_unit_merge",
          {
            p_campaign_id: a.campaignId,
            p_survivor_ou_id: a.survivorOuId,
            p_source_ou_ids: a.sourceOuIds,
          },
          unitMergeResultSchema
        ),
      split: (a: UnitSplitArgs) =>
        callRpc(
          client,
          "structure_unit_split",
          {
            p_campaign_id: a.campaignId,
            p_source_ou_id: a.sourceOuId,
            p_children: a.children,
            p_assignments: a.assignments ?? [],
            p_keep_in_source: a.keepInSource ?? false,
            p_group_id: a.groupId ?? null,
          },
          unitSplitResultSchema
        ),
      bulkSave: (a: UnitsBulkSaveArgs) =>
        callRpc(
          client,
          "structure_units_bulk_save",
          {
            p_campaign_id: a.campaignId,
            p_delete_ou_ids: a.deleteOuIds ?? [],
            p_updates: a.updates ?? [],
            p_creates: a.creates ?? [],
          },
          unitsBulkSaveResultSchema
        ),
    },
    placements: {
      assign: (a: PlacementsAssignArgs) =>
        callRpc(
          client,
          "structure_placements_assign",
          {
            p_campaign_id: a.campaignId,
            p_ou_id: a.ouId,
            p_worker_ids: a.workerIds,
            p_source: a.source ?? "manual",
            p_is_primary: a.isPrimary ?? false,
            p_on_conflict: a.onConflict ?? "skip",
          },
          placementsAssignResultSchema
        ),
      move: (a: PlacementsMoveArgs) =>
        callRpc(
          client,
          "structure_placements_move",
          {
            p_campaign_id: a.campaignId,
            p_worker_ids: a.workerIds,
            p_from_ou_id: a.fromOuId ?? null,
            p_to_ou_id: a.toOuId ?? null,
            p_within_group_id: a.withinGroupId ?? null,
            p_keep_source: a.keepSource ?? false,
            p_keep_in_parent: a.keepInParent ?? true,
          },
          placementsMoveResultSchema
        ),
      unassign: (a: PlacementsUnassignArgs) =>
        callRpc(
          client,
          "structure_placements_unassign",
          {
            p_campaign_id: a.campaignId,
            p_worker_ids: a.workerIds,
            p_ou_id: a.ouId ?? null,
            p_within_group_id: a.withinGroupId ?? null,
          },
          placementsUnassignResultSchema
        ),
      setPrimary: (a: PlacementsSetPrimaryArgs) =>
        callRpc(
          client,
          "structure_placements_set_primary",
          { p_campaign_id: a.campaignId, p_worker_id: a.workerId, p_ou_id: a.ouId },
          placementsSetPrimaryResultSchema
        ),
      replaceRuleRows: (a: PlacementsReplaceRuleRowsArgs) =>
        callRpc(
          client,
          "structure_placements_replace_rule_rows",
          { p_campaign_id: a.campaignId, p_rows: a.rows },
          placementsReplaceRuleRowsResultSchema
        ),
      materialiseEmployer: (a: MaterialiseEmployerArgs) =>
        callRpc(
          client,
          "structure_materialise_employer_placements",
          { p_campaign_id: a.campaignId },
          materialiseEmployerResultSchema
        ),
    },
  };
}

export type StructureApi = ReturnType<typeof structureApi>;
