/**
 * Candidate organising units for moving workers away from a source OU
 * (reallocate, delete-with-reassign, etc.).
 */

export type OuRowForReassignment = {
  ou_id: number;
  name: string | null;
  ou_type: string | null;
  parent_ou_id?: number | null;
  ou_group_id?: number | null;
  is_group_container?: boolean | null;
};

export function getReassignmentTargetOus(
  allOus: OuRowForReassignment[],
  fromOuId: number
): OuRowForReassignment[] {
  const source = allOus.find((o) => o.ou_id === fromOuId);
  if (!source) return [];

  const sourceParentId = source.parent_ou_id ?? null;
  const sourceGroupId = source.ou_group_id ?? null;
  const isFromSubUnit = sourceParentId != null;
  const fromOuType = source.ou_type;

  return allOus.filter((o) => {
    if (o.ou_id === fromOuId) return false;
    if (o.is_group_container) return false;

    if (isFromSubUnit) {
      return (o.parent_ou_id ?? null) === sourceParentId;
    }

    if (sourceGroupId != null) {
      return (o.ou_group_id ?? null) === sourceGroupId;
    }

    if (!fromOuType || fromOuType === "custom") return true;
    return (o.ou_type ?? null) === fromOuType;
  });
}

export function ouTargetLabel(o: OuRowForReassignment): string {
  const typeLabel = (o.ou_type ?? "unit").replace(/_/g, " ");
  return o.name?.trim() || `${typeLabel} #${o.ou_id}`;
}
