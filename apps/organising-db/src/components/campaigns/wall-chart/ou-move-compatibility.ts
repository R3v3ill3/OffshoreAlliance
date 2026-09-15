/**
 * Wall-chart move compatibility helpers.
 *
 * Same-`ou_type` units form a "dimension" (worksite band, employer band, …).
 * Cross-dimension moves are normally blocked. After WP2.1, employer containers
 * nest worksite children across groups/types; moving a worker from the
 * employer placement into a nested worksite is intentional
 * (`structure_placements_move` + `keep_in_parent`, wp2.2.md D4).
 */

/** True when `ancestorId` appears above `descendantId` in `parentByOu`. */
export function isAncestorOf(
  ancestorId: number,
  descendantId: number,
  parentByOu: Map<number, number | null>
): boolean {
  let current: number | null | undefined = descendantId;
  const seen = new Set<number>();
  while (current != null) {
    if (seen.has(current)) return false;
    seen.add(current);
    const parent = parentByOu.get(current) ?? null;
    if (parent === ancestorId) return true;
    current = parent;
  }
  return false;
}

/** True when either unit is nested under the other. */
export function isNestedOuRelationship(
  aOuId: number,
  bOuId: number,
  parentByOu: Map<number, number | null>
): boolean {
  if (aOuId === bOuId) return false;
  return (
    isAncestorOf(aOuId, bOuId, parentByOu) || isAncestorOf(bOuId, aOuId, parentByOu)
  );
}

/**
 * Silently refuse a move when source and target are different structured
 * dimensions and are not nested under each other. Copy mode and custom units
 * are never blocked here.
 */
export function isCrossDimensionMoveBlocked({
  mode,
  targetOuId,
  refs,
  ouTypeById,
  parentByOu,
}: {
  mode: "move" | "copy";
  targetOuId: number | null;
  refs: { fromOuId: number | null; fromOuType: string | null }[];
  ouTypeById: Map<number, string>;
  parentByOu: Map<number, number | null>;
}): boolean {
  if (mode !== "move" || targetOuId == null) return false;
  const targetType = ouTypeById.get(targetOuId);
  if (!targetType || targetType === "custom") return false;

  return refs.some((r) => {
    if (!r.fromOuType || r.fromOuType === "custom") return false;
    if (r.fromOuType === targetType) return false;
    if (
      r.fromOuId != null &&
      isNestedOuRelationship(r.fromOuId, targetOuId, parentByOu)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Move-dialog targets: same dimension as the source, or nested under any
 * source unit (employer container → worksite children).
 */
export function isAllowedMoveTarget({
  target,
  sourceDimensionType,
  sourceOuIds,
  parentByOu,
}: {
  target: { ou_id: number; ou_type: string | null | undefined };
  sourceDimensionType: string;
  sourceOuIds: ReadonlySet<number>;
  parentByOu: Map<number, number | null>;
}): boolean {
  if (target.ou_type === sourceDimensionType) return true;
  for (const sourceId of sourceOuIds) {
    if (isAncestorOf(sourceId, target.ou_id, parentByOu)) return true;
  }
  return false;
}
