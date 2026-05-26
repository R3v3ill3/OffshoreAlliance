import { z } from "zod";

/**
 * Token issuance request body — Phase 2.
 * - `password` is the plain leader password (hashed server-side via `hashPassword`).
 * - `expiresInHours` is bounded to 2h–14d (336h).
 */
export const tokenIssueRequestSchema = z.object({
  password: z.string().min(6).max(128),
  expiresInHours: z.number().int().min(2).max(336),
});
export type TokenIssueRequest = z.infer<typeof tokenIssueRequestSchema>;

/**
 * Leader-form auth request — Phase 2.
 * Plain password submitted by the leader at the password gate.
 */
export const leaderAuthRequestSchema = z.object({
  password: z.string().min(1).max(128),
});
export type LeaderAuthRequest = z.infer<typeof leaderAuthRequestSchema>;

export const leaderRatingRowSchema = z.object({
  worker_id: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  binary_value: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const leaderProspectiveRowSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Inline patch for an individual worker row, sent from the leader webform's
 * "Edit" inline editor (Phase 4). Strict object — unknown keys rejected so a
 * malicious client cannot smuggle arbitrary `workers` columns through.
 */
export const leaderWorkerEditPatchSchema = z
  .object({
    worksite_id: z.number().int().nullable().optional(),
    shift_id: z.number().int().nullable().optional(),
    work_area_id: z.number().int().nullable().optional(),
    roster_panel_id: z.number().int().nullable().optional(),
    occupation: z.string().max(200).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    email: z
      .union([z.string().email().max(200), z.literal(""), z.null()])
      .optional(),
  })
  .strict();

export const leaderWorkerEditSchema = z.object({
  worker_id: z.number().int().positive(),
  patch: leaderWorkerEditPatchSchema,
});

/**
 * Membership transition entry. The whitelist of `from -> to` is enforced
 * server-side because the API re-reads the current `union_membership_type_id`
 * before applying the change.
 */
export const leaderMembershipChangeSchema = z.object({
  worker_id: z.number().int().positive(),
  to_type: z.enum(["member_pending", "non_oa_member"]),
  /** Required when transitioning to non_oa_member; ignored otherwise. */
  non_oa_union_id: z.number().int().positive().optional(),
});

export const leaderSearchRequestSchema = z.object({
  q: z.string().min(2).max(120),
});

export const leaderSubmitBodySchema = z.object({
  ratings: z.array(leaderRatingRowSchema).default([]),
  prospective: z.array(leaderProspectiveRowSchema).default([]),
  worker_edits: z.array(leaderWorkerEditSchema).default([]),
  membership_changes: z.array(leaderMembershipChangeSchema).default([]),
  existing_added: z.array(z.number().int().positive()).default([]),
  removed_worker_ids: z.array(z.number().int().positive()).default([]),
});

export type LeaderWorkerEdit = z.infer<typeof leaderWorkerEditSchema>;
export type LeaderMembershipChange = z.infer<typeof leaderMembershipChangeSchema>;
export type LeaderSearchRequest = z.infer<typeof leaderSearchRequestSchema>;
export type LeaderSubmitBody = z.infer<typeof leaderSubmitBodySchema>;
