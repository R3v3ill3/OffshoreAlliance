import { z } from "zod";

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

export const leaderSubmitBodySchema = z.object({
  ratings: z.array(leaderRatingRowSchema).default([]),
  prospective: z.array(leaderProspectiveRowSchema).default([]),
});

export type LeaderSubmitBody = z.infer<typeof leaderSubmitBodySchema>;
