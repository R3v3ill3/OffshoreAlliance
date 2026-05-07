"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";

export type MoveWorkerVars = {
  /**
   * Each ref identifies *one specific assignment* to move/copy:
   * the worker at a given source ou (or Unassigned when `fromOuId` is null).
   * For copy mode, `fromOuId` is ignored.
   */
  refs: { workerId: number; fromOuId: number | null }[];
  /** Target OU; null = Unassigned (remove from all units in this campaign). */
  toOuId: number | null;
  mode: "move" | "copy";
  /**
   * When true (default), moving a worker INTO a sub-unit also keeps any
   * existing assignment in the sub-unit's parent OU intact, AND inserts a
   * parent-OU assignment if missing. When moving between siblings of the
   * same parent, the parent assignment is preserved unconditionally.
   *
   * When false, the move strips the worker from the source OU only, with
   * no special handling for parent/child relationships.
   *
   * Has no effect when toOuId is null or the target is a top-level OU.
   */
  keepInParent?: boolean;
};

export type MoveWorkerResult = {
  inserted: number;
  deleted: number;
  skipped: number;
};

/**
 * Bulk move or copy worker↔OU assignments.
 *
 * Contract:
 * - move + toOuId != null  : delete the (fromOuId, workerId) row (if any) and
 *                            insert (toOuId, workerId). Primary flag migrates.
 * - copy + toOuId != null  : insert (toOuId, workerId) only, is_primary=false.
 *                            Duplicates (worker already in target) are skipped.
 * - move + toOuId == null  : delete all campaign_worker_ou rows for the
 *                            worker in this campaign (worker becomes
 *                            "Unassigned").
 * - copy + toOuId == null  : no-op.
 *
 * Implemented as a sequence of client-side Supabase calls inside a single
 * mutation. The unique constraint on (ou_id, worker_id) makes retries
 * idempotent; partial failures surface as exceptions and the caller can
 * retry from a clean state (query invalidation refetches).
 */
export function useMoveWorkersMutation(campaignId: string | number) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useAuthAwareMutation({
    mutationFn: async (vars: MoveWorkerVars): Promise<MoveWorkerResult> => {
      if (vars.refs.length === 0) return { inserted: 0, deleted: 0, skipped: 0 };

      const workerIds = [...new Set(vars.refs.map((r) => r.workerId))];
      let inserted = 0;
      let deleted = 0;
      let skipped = 0;

      if (vars.toOuId == null) {
        // "Move to Unassigned" = strip all OU assignments for these workers in this campaign.
        if (vars.mode !== "move") return { inserted: 0, deleted: 0, skipped: workerIds.length };
        // Constrain to ou ids belonging to this campaign to avoid nuking other campaigns.
        const { data: campOus, error: ouErr } = await supabase
          .from("campaign_organising_units")
          .select("ou_id")
          .eq("campaign_id", Number(campaignId));
        if (ouErr) throw ouErr;
        const ouIds = (campOus ?? []).map((o) => o.ou_id as number);
        if (ouIds.length > 0) {
          const { error: delErr, count } = await supabase
            .from("campaign_worker_ou")
            .delete({ count: "exact" })
            .in("worker_id", workerIds)
            .in("ou_id", ouIds);
          if (delErr) throw delErr;
          deleted = count ?? 0;
        }
      } else {
        // Determine workers who aren't already at target (to skip + avoid unique conflict).
        const { data: existingAtTarget, error: exErr } = await supabase
          .from("campaign_worker_ou")
          .select("worker_id, is_primary")
          .eq("ou_id", vars.toOuId)
          .in("worker_id", workerIds);
        if (exErr) throw exErr;
        const alreadyAtTarget = new Set((existingAtTarget ?? []).map((r) => r.worker_id as number));
        const toInsertIds = workerIds.filter((w) => !alreadyAtTarget.has(w));
        skipped = workerIds.length - toInsertIds.length;

        // Look up the target OU to detect sub-unit hierarchy. When the target
        // is a sub-unit (parent_ou_id != null), `keepInParent` controls whether
        // we also preserve / create assignments to the parent OU.
        const keepInParent = vars.keepInParent ?? true;
        let targetParentOuId: number | null = null;
        // True when the direct parent of the target is a group container — workers
        // must never be inserted directly into a group container (trigger enforces this),
        // so we suppress the keepInParent INSERT for that case.
        let parentIsGroupContainer = false;
        let siblingOuIds: number[] = [];
        {
          const { data: targetOuRow, error: targetOuErr } = await supabase
            .from("campaign_organising_units")
            .select("ou_id, parent_ou_id, campaign_id")
            .eq("ou_id", vars.toOuId)
            .single();
          if (targetOuErr) throw targetOuErr;
          targetParentOuId = (targetOuRow?.parent_ou_id as number | null) ?? null;
          if (targetParentOuId != null) {
            const { data: siblings, error: sibErr } = await supabase
              .from("campaign_organising_units")
              .select("ou_id, is_group_container")
              .eq("parent_ou_id", targetParentOuId);
            if (sibErr) throw sibErr;
            siblingOuIds = (siblings ?? []).map((r) => r.ou_id as number);

            // Determine whether the parent itself is a group container.
            const { data: parentRow, error: parentErr } = await supabase
              .from("campaign_organising_units")
              .select("is_group_container")
              .eq("ou_id", targetParentOuId)
              .single();
            if (parentErr) throw parentErr;
            parentIsGroupContainer = (parentRow?.is_group_container as boolean) === true;
          }
        }

        if (vars.mode === "move") {
          // Check which source rows are currently primary — migrate that flag.
          const fromPairs = vars.refs
            .filter((r) => r.fromOuId != null && toInsertIds.includes(r.workerId))
            .map((r) => ({ workerId: r.workerId, ouId: r.fromOuId as number }));

          // Query primary flags for the source rows so we can preserve them at the target.
          const primaryWorkerIds = new Set<number>();
          if (fromPairs.length > 0) {
            const { data: srcRows, error: srcErr } = await supabase
              .from("campaign_worker_ou")
              .select("worker_id, ou_id, is_primary")
              .in("worker_id", fromPairs.map((p) => p.workerId))
              .in("ou_id", fromPairs.map((p) => p.ouId));
            if (srcErr) throw srcErr;
            for (const row of srcRows ?? []) {
              const match = fromPairs.find(
                (p) => p.workerId === row.worker_id && p.ouId === row.ou_id
              );
              if (match && row.is_primary) primaryWorkerIds.add(row.worker_id as number);
            }
          }

          // Insert target rows first, with is_primary migrated for primary-sourced moves.
          if (toInsertIds.length > 0) {
            const rows = toInsertIds.map((wid) => ({
              ou_id: vars.toOuId as number,
              worker_id: wid,
              is_primary: primaryWorkerIds.has(wid),
            }));
            const { error: insErr } = await supabase.from("campaign_worker_ou").insert(rows);
            if (insErr) throw insErr;
            inserted = rows.length;
          }

          // When the target is a sub-unit (and the parent is not a group container),
          // ensure each affected worker is also assigned to the parent (idempotent).
          // Group containers never receive direct worker assignments (trigger enforces this).
          if (targetParentOuId != null && keepInParent && !parentIsGroupContainer && workerIds.length > 0) {
            const { data: existingParent, error: pExErr } = await supabase
              .from("campaign_worker_ou")
              .select("worker_id")
              .eq("ou_id", targetParentOuId)
              .in("worker_id", workerIds);
            if (pExErr) throw pExErr;
            const alreadyInParent = new Set(
              (existingParent ?? []).map((r) => r.worker_id as number)
            );
            const parentMissing = workerIds.filter((w) => !alreadyInParent.has(w));
            if (parentMissing.length > 0) {
              const parentRows = parentMissing.map((wid) => ({
                ou_id: targetParentOuId as number,
                worker_id: wid,
                is_primary: false,
              }));
              const { error: pInsErr } = await supabase
                .from("campaign_worker_ou")
                .insert(parentRows);
              if (pInsErr) throw pInsErr;
              inserted += parentRows.length;
            }
          }

          // Delete source rows — one pair at a time to avoid nuking unrelated memberships.
          // Skip deletion if the source happens to be the target's parent (when
          // we're keeping the worker in the parent), so the worker remains rolled-up.
          for (const ref of vars.refs) {
            if (ref.fromOuId == null) continue; // drag-from-unassigned — no row to delete
            if (ref.fromOuId === vars.toOuId) continue;
            if (
              keepInParent &&
              targetParentOuId != null &&
              ref.fromOuId === targetParentOuId
            ) {
              // Moving from parent → its own sub-unit: preserve parent membership.
              continue;
            }
            const { error: delErr, count } = await supabase
              .from("campaign_worker_ou")
              .delete({ count: "exact" })
              .eq("worker_id", ref.workerId)
              .eq("ou_id", ref.fromOuId);
            if (delErr) throw delErr;
            deleted += count ?? 0;
          }

          // If we migrated a primary, clear any stale primary flags elsewhere for that worker.
          if (primaryWorkerIds.size > 0) {
            const { data: campOus, error: ouErr } = await supabase
              .from("campaign_organising_units")
              .select("ou_id")
              .eq("campaign_id", Number(campaignId));
            if (ouErr) throw ouErr;
            const otherOuIds = (campOus ?? [])
              .map((o) => o.ou_id as number)
              .filter((id) => id !== vars.toOuId);
            if (otherOuIds.length > 0) {
              const { error: clrErr } = await supabase
                .from("campaign_worker_ou")
                .update({ is_primary: false })
                .in("worker_id", [...primaryWorkerIds])
                .in("ou_id", otherOuIds);
              if (clrErr) throw clrErr;
            }
          }
          // Suppress unused warning for siblingOuIds (kept for future cross-sibling move policy).
          void siblingOuIds;
        } else {
          // copy: insert only, is_primary=false.
          if (toInsertIds.length > 0) {
            const rows = toInsertIds.map((wid) => ({
              ou_id: vars.toOuId as number,
              worker_id: wid,
              is_primary: false,
            }));
            const { error: insErr } = await supabase.from("campaign_worker_ou").insert(rows);
            if (insErr) throw insErr;
            inserted = rows.length;
          }
          // For copy + sub-unit target, also ensure parent membership (skip for group containers).
          if (targetParentOuId != null && keepInParent && !parentIsGroupContainer && workerIds.length > 0) {
            const { data: existingParent, error: pExErr } = await supabase
              .from("campaign_worker_ou")
              .select("worker_id")
              .eq("ou_id", targetParentOuId)
              .in("worker_id", workerIds);
            if (pExErr) throw pExErr;
            const alreadyInParent = new Set(
              (existingParent ?? []).map((r) => r.worker_id as number)
            );
            const parentMissing = workerIds.filter((w) => !alreadyInParent.has(w));
            if (parentMissing.length > 0) {
              const parentRows = parentMissing.map((wid) => ({
                ou_id: targetParentOuId as number,
                worker_id: wid,
                is_primary: false,
              }));
              const { error: pInsErr } = await supabase
                .from("campaign_worker_ou")
                .insert(parentRows);
              if (pInsErr) throw pInsErr;
              inserted += parentRows.length;
            }
          }
        }
      }

      return { inserted, deleted, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-worker-ou", String(campaignId)] });
    },
  });
}
