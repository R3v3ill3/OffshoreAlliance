import { z } from "zod";

export const shareTokenIssueSchema = z.object({
  password: z.string().min(6).max(128),
  expiresInHours: z.number().int().min(2).max(336),
  leaderWorkerId: z.number().int().positive().optional(),
});

export const shareAuthSchema = z.object({
  password: z.string().min(1).max(128),
  sessionLabel: z.string().trim().min(1).max(80),
  sessionWorkerId: z.number().int().positive().optional(),
});

export const shareAttemptSchema = z.object({
  list_item_id: z.number().int().positive(),
  script_id: z.number().int().positive().nullable(),
  dial_disposition: z.string().min(1),
  call_disposition: z.string().nullable().optional(),
  overall_notes: z.string().nullable().optional(),
  callback_datetime: z.string().nullable().optional(),
  support_level_assessed: z.string().nullable().optional(),
  follow_up_action: z.string().nullable().optional(),
  cta_response: z.string().nullable().optional(),
  duration_seconds: z.number().int().nullable().optional(),
  outcome_classification: z.string().max(40).nullable().optional(),
  step_outcomes: z.array(z.record(z.string(), z.unknown())).optional(),
  objections: z.array(z.record(z.string(), z.unknown())).optional(),
  issues: z.array(z.record(z.string(), z.unknown())).optional(),
  cta_ratings: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const shareReleaseSchema = z.object({
  item_id: z.number().int().positive(),
});

export type ShareTokenIssueRequest = z.infer<typeof shareTokenIssueSchema>;
export type ShareAuthRequest = z.infer<typeof shareAuthSchema>;
export type ShareAttemptRequest = z.infer<typeof shareAttemptSchema>;
export type ShareReleaseRequest = z.infer<typeof shareReleaseSchema>;
