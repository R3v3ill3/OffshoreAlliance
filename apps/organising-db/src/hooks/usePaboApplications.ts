"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

// ── Types ──────────────────────────────────────────────────────────────────

export type PaboStatus =
  | "drafting"
  | "lodged"
  | "granted"
  | "denied"
  | "expired"
  | "superseded"
  | "withdrawn";

export type BallotQuestionOutcome = "carried" | "failed" | "pending" | "withdrawn";

export interface PaboApplication {
  pabo_id: number;
  campaign_id: number;
  application_filed_at: string | null;
  fwc_application_number: string | null;
  ballot_order_made_at: string | null;
  aec_ballot_agent: string | null;
  ballot_opens_at: string | null;
  ballot_closes_at: string | null;
  eligible_voter_count: number | null;
  votes_cast: number | null;
  voter_turnout_pct: number | null;
  valid_from: string | null;
  valid_until: string | null;
  notice_period_required_days: number;
  status: PaboStatus | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaboBallotQuestion {
  question_id: number;
  pabo_id: number;
  question_order: number;
  question_text: string;
  action_type: string | null;
  votes_yes: number | null;
  votes_no: number | null;
  informal_count: number | null;
  outcome: BallotQuestionOutcome | null;
}

// ── Query keys ────────────────────────────────────────────────────────────

const queryKeys = {
  paboList: (campaignId: number) => ["pabo-applications", campaignId] as const,
  paboDetail: (paboId: number) => ["pabo-application", paboId] as const,
  paboQuestions: (paboId: number) => ["pabo-ballot-questions", paboId] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────

/**
 * List all PABO applications for a campaign, ordered most-recent first.
 */
export function usePaboApplications(campaignId: number | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.paboList(campaignId ?? 0),
    queryFn: async (): Promise<PaboApplication[]> => {
      if (!campaignId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pabo_applications")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaboApplication[];
    },
    enabled: !!campaignId,
    staleTime: 30_000,
  });
}

/**
 * Fetch a single PABO application by ID.
 */
export function usePaboApplication(paboId: number | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.paboDetail(paboId ?? 0),
    queryFn: async (): Promise<PaboApplication | null> => {
      if (!paboId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pabo_applications")
        .select("*")
        .eq("pabo_id", paboId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PaboApplication | null;
    },
    enabled: !!paboId,
    staleTime: 30_000,
  });
}

/**
 * Fetch all ballot questions for a PABO, ordered by question_order.
 */
export function usePaboBallotQuestions(paboId: number | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.paboQuestions(paboId ?? 0),
    queryFn: async (): Promise<PaboBallotQuestion[]> => {
      if (!paboId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pabo_ballot_questions")
        .select("*")
        .eq("pabo_id", paboId)
        .order("question_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PaboBallotQuestion[];
    },
    enabled: !!paboId,
    staleTime: 30_000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────

/**
 * Create a new PABO application for a campaign.
 */
export function useCreatePabo() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation({
    mutationFn: async (params: {
      campaign_id: number;
      status?: PaboStatus;
      application_filed_at?: string | null;
      fwc_application_number?: string | null;
      notes?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pabo_applications")
        .insert({
          campaign_id: params.campaign_id,
          status: params.status ?? "drafting",
          application_filed_at: params.application_filed_at ?? null,
          fwc_application_number: params.fwc_application_number ?? null,
          notes: params.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PaboApplication;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.paboList(variables.campaign_id),
      });
    },
  });
}

/**
 * Update the status (and optionally other fields) of a PABO application.
 */
export function useUpdatePaboStatus() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation({
    mutationFn: async (params: {
      pabo_id: number;
      campaign_id: number;
      status: PaboStatus;
      ballot_order_made_at?: string | null;
      aec_ballot_agent?: string | null;
      ballot_opens_at?: string | null;
      ballot_closes_at?: string | null;
      eligible_voter_count?: number | null;
      votes_cast?: number | null;
      valid_from?: string | null;
      valid_until?: string | null;
      fwc_application_number?: string | null;
      notes?: string | null;
    }) => {
      const { pabo_id, campaign_id: _campaign_id, ...updates } = params;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("pabo_applications")
        .update(updates)
        .eq("pabo_id", pabo_id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.paboList(variables.campaign_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.paboDetail(variables.pabo_id),
      });
    },
  });
}

/**
 * Create a new ballot question for a PABO.
 */
export function useCreateQuestion() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation({
    mutationFn: async (params: {
      pabo_id: number;
      question_order: number;
      question_text: string;
      action_type?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pabo_ballot_questions")
        .insert({
          pabo_id: params.pabo_id,
          question_order: params.question_order,
          question_text: params.question_text,
          action_type: params.action_type ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PaboBallotQuestion;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.paboQuestions(variables.pabo_id),
      });
    },
  });
}

/**
 * Update a ballot question (text, vote counts, outcome).
 */
export function useUpdateQuestion() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation({
    mutationFn: async (params: {
      question_id: number;
      pabo_id: number;
      question_text?: string;
      action_type?: string | null;
      votes_yes?: number | null;
      votes_no?: number | null;
      informal_count?: number | null;
      outcome?: BallotQuestionOutcome | null;
    }) => {
      const { question_id, pabo_id: _pabo_id, ...updates } = params;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("pabo_ballot_questions")
        .update(updates)
        .eq("question_id", question_id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.paboQuestions(variables.pabo_id),
      });
    },
  });
}
