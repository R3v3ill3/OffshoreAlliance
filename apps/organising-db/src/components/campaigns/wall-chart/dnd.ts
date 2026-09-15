/**
 * Shared types and helpers for the wall-chart drag-and-drop.
 *
 * We use custom MIME types so the drop targets can opt in without accepting
 * arbitrary text drags from outside the app (e.g. desktop drops).
 */

export const DND_MIME_TYPE = "application/x-oa-wallchart-worker";
export const DND_UNIT_MIME_TYPE = "application/x-oa-wallchart-unit";

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

/**
 * Whole-organising-unit drag payload. Emitted by the unit-card drag handle
 * when a user drags an entire unit into the build-list panel. The list of
 * worker_ids is computed at dragstart against the unit's current filter
 * state, so only currently-visible workers are added.
 */
export type UnitDragPayload = {
  version: 1;
  ouId: number | null;
  ouName: string;
  workerIds: number[];
};

export function serializeUnitDragPayload(payload: UnitDragPayload): string {
  return JSON.stringify(payload);
}

export function parseUnitDragPayload(raw: string): UnitDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as UnitDragPayload;
    if (!parsed || parsed.version !== 1) return null;
    if (!Array.isArray(parsed.workerIds)) return null;
    const ids = parsed.workerIds.filter((n): n is number => typeof n === "number");
    if (ids.length === 0) return null;
    return {
      version: 1,
      ouId: typeof parsed.ouId === "number" ? parsed.ouId : null,
      ouName: typeof parsed.ouName === "string" ? parsed.ouName : "",
      workerIds: ids,
    };
  } catch {
    return null;
  }
}
