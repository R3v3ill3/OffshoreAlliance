/**
 * Shared types and helpers for the wall-chart drag-and-drop.
 *
 * We use a custom MIME type so the drop targets can opt in without accepting
 * arbitrary text drags from outside the app (e.g. desktop drops).
 */

export const DND_MIME_TYPE = "application/x-oa-wallchart-worker";

export type WorkerDragMode = "move" | "copy";

export type WorkerDragRef = {
  workerId: number;
  /** null when the drag originated from the Unassigned pseudo-unit. */
  fromOuId: number | null;
  /**
   * The ou_type of the source unit — used to enforce same-dimension-only moves.
   * null when dragging from Unassigned or when the source type is unknown.
   */
  fromOuType: string | null;
};

export type WorkerDragPayload = {
  version: 1;
  refs: WorkerDragRef[];
};

export function serializeDragPayload(payload: WorkerDragPayload): string {
  return JSON.stringify(payload);
}

export function parseDragPayload(raw: string): WorkerDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as WorkerDragPayload;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.refs)) return null;
    const clean: WorkerDragRef[] = [];
    for (const r of parsed.refs) {
      if (r && typeof r.workerId === "number") {
        clean.push({
          workerId: r.workerId,
          fromOuId: typeof r.fromOuId === "number" ? r.fromOuId : null,
          fromOuType: typeof r.fromOuType === "string" ? r.fromOuType : null,
        });
      }
    }
    if (clean.length === 0) return null;
    return { version: 1, refs: clean };
  } catch {
    return null;
  }
}
