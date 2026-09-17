/**
 * Selective update patch for the worker import wizard.
 *
 * The apply route builds one `workerData` object for both creates and
 * updates. For a create every key is meaningful (a null is "unknown"). For
 * an update a null usually means "the file did not have this column", and
 * writing it would clear a value an organiser recorded — so updates keep
 * only the keys the file actually carries a value for.
 *
 * Membership status is a set: `union_membership_type_id`, `is_active` and
 * `non_oa_union_option_id` are derived together from the mapped status and
 * are written together only when a status was resolved for the row.
 */

/** Keys whose null means "not in the file" on an update. */
export const NULL_MEANS_UNCHANGED_KEYS = [
  "preferred_name",
  "reference_id",
  "email",
  "phone",
  "member_role_type_id",
  "union_id",
  "resignation_date",
  "join_date",
  "worksite_id",
  "employer_id",
  "canonical_occupation_id",
  "notes",
] as const;

/** Keys written as a unit, and only when membership status resolved. */
export const MEMBERSHIP_STATUS_KEYS = [
  "union_membership_type_id",
  "is_active",
  "non_oa_union_option_id",
] as const;

/** Required identity keys — kept when non-empty. */
export const NAME_KEYS = ["first_name", "last_name"] as const;

export type WorkerImportUpdatePatchOptions = {
  /** True when the row's membership status mapped to a membership type. */
  membershipResolved: boolean;
};

export function buildWorkerImportUpdatePatch(
  workerData: Record<string, unknown>,
  options: WorkerImportUpdatePatchOptions
): { patch: Record<string, unknown>; skippedKeys: string[] } {
  const patch: Record<string, unknown> = {};
  const skippedKeys: string[] = [];

  for (const key of NAME_KEYS) {
    const value = workerData[key];
    if (typeof value === "string" && value.trim() !== "") patch[key] = value;
    else if (key in workerData) skippedKeys.push(key);
  }

  for (const key of NULL_MEANS_UNCHANGED_KEYS) {
    if (!(key in workerData)) continue;
    const value = workerData[key];
    if (value === null || value === undefined || value === "") skippedKeys.push(key);
    else patch[key] = value;
  }

  for (const key of MEMBERSHIP_STATUS_KEYS) {
    if (!(key in workerData)) continue;
    if (options.membershipResolved) patch[key] = workerData[key];
    else skippedKeys.push(key);
  }

  if ("updated_at" in workerData) patch.updated_at = workerData.updated_at;

  return { patch, skippedKeys };
}
