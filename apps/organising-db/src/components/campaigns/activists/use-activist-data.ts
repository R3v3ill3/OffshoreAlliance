"use client";

/**
 * Data hooks for the Activists & WOCs module.
 *
 * Query keys are namespaced under "activist-*" / "woc-*" /
 * "structure-test-*" / "coverage-*" and never reuse the canonical
 * ["campaign-ous"] / ["campaign-worker-ou"] keys (those caches hold
 * the full OU hierarchy shape used elsewhere on the page).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type {
  ActivistProfileRow,
  ActivistProfileUpdate,
  ActivistRegisterRow,
  ActivistTaskInsert,
  ActivistTaskRow,
  ActivistTaskUpdate,
  WorkerOption,
} from "./types";

export function useActivistRegister(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["activist-register", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_campaign_activist_register")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .order("worker_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ActivistRegisterRow[];
    },
  });
}

export function useActivistProfile(campaignId: string, workerId: number | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["activist-profile", campaignId, workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activist_profiles")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .eq("worker_id", workerId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ActivistProfileRow | null;
    },
    enabled: workerId != null,
  });
}

export function invalidateActivistData(
  queryClient: ReturnType<typeof useQueryClient>,
  campaignId: string
) {
  queryClient.invalidateQueries({ queryKey: ["activist-register", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["activist-profile", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["activist-tasks", campaignId] });
}

/** Create a curated register profile for a worker. */
export function useCreateActivistProfile(campaignId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (workerId: number) => {
      const { error } = await supabase.from("campaign_activist_profiles").insert({
        campaign_id: Number(campaignId),
        worker_id: workerId,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateActivistData(queryClient, campaignId);
      toast.success("Added to the activist register");
    },
    onError: (e: Error) => toast.error(`Failed to add to register: ${e.message}`),
  });
}

/**
 * Update a profile. Any organiser edit to an auto-provisioned row
 * flips it to curated ("manual") unless the update says otherwise.
 */
export function useUpdateActivistProfile(campaignId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async ({
      profileId,
      update,
    }: {
      profileId: number;
      update: ActivistProfileUpdate;
    }) => {
      const { error } = await supabase
        .from("campaign_activist_profiles")
        .update({ source: "manual", ...update })
        .eq("profile_id", profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateActivistData(queryClient, campaignId);
      toast.success("Profile updated");
    },
    onError: (e: Error) => toast.error(`Failed to update profile: ${e.message}`),
  });
}

export function useActivistTasks(campaignId: string, workerId?: number) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["activist-tasks", campaignId, workerId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("activist_tasks")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .order("created_at", { ascending: false });
      if (workerId != null) query = query.eq("worker_id", workerId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ActivistTaskRow[];
    },
  });
}

export function useSaveActivistTask(campaignId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (
      args:
        | { kind: "insert"; insert: ActivistTaskInsert }
        | { kind: "update"; taskId: number; update: ActivistTaskUpdate }
    ) => {
      if (args.kind === "insert") {
        const { data, error } = await supabase
          .from("activist_tasks")
          .insert(args.insert)
          .select("activist_task_id")
          .single();
        if (error) throw error;
        return data.activist_task_id as number;
      }
      const { error } = await supabase
        .from("activist_tasks")
        .update(args.update)
        .eq("activist_task_id", args.taskId);
      if (error) throw error;
      return args.taskId;
    },
    onSuccess: () => {
      invalidateActivistData(queryClient, campaignId);
    },
    onError: (e: Error) => toast.error(`Failed to save task: ${e.message}`),
  });
}

/** Campaign members (id + name), for add-to-register / roster pickers. */
export function useCampaignWorkerOptions(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["activist-worker-options", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select("worker_id, workers!inner(worker_id, first_name, last_name)")
        .eq("campaign_id", Number(campaignId));
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        worker_id: number;
        workers: { worker_id: number; first_name: string; last_name: string };
      }>;
      return rows
        .map<WorkerOption>((r) => ({
          worker_id: r.worker_id,
          first_name: r.workers.first_name,
          last_name: r.workers.last_name,
        }))
        .sort((a, b) =>
          `${a.first_name} ${a.last_name}`.localeCompare(
            `${b.first_name} ${b.last_name}`
          )
        );
    },
  });
}
