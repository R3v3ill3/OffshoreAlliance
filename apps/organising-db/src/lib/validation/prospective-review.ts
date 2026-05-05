/**
 * Zod schemas for the Phase 5 prospective-review queue.
 *
 * Backs three POST endpoints under
 *   /api/campaigns/[id]/prospective/[prospectiveId]/{promote,merge,reject}
 *
 * Promote has no body; merge takes the existing worker target id; reject
 * captures a free-text reason that is persisted to
 * `campaign_prospective_workers.review_notes` for the audit trail.
 */
import { z } from "zod";

/** Promote-as-new — no body required, but we keep a permissive schema so
 *  future fields (e.g. an organiser to assign on creation) can be added
 *  without changing the route signature. */
export const prospectivePromoteSchema = z.object({}).passthrough().optional();

export const prospectiveMergeSchema = z.object({
  existing_worker_id: z.number().int().positive(),
});
export type ProspectiveMergeBody = z.infer<typeof prospectiveMergeSchema>;

export const prospectiveRejectSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});
export type ProspectiveRejectBody = z.infer<typeof prospectiveRejectSchema>;
