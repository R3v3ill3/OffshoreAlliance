"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

export interface RematchSummary {
  auto: number;
  needs_review: number;
  unmatched: number;
  skipped: number;
  total: number;
  errors?: string[];
}

export function useRematchUpcomingProjects() {
  const queryClient = useQueryClient();
  return useAuthAwareMutation<RematchSummary>({
    mutationFn: async () => {
      const response = await fetch("/api/upcoming-projects/rematch", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as
        | RematchSummary
        | { error?: string };
      if (!response.ok) {
        const errMessage =
          (body as { error?: string }).error ?? `HTTP ${response.status}`;
        throw new Error(errMessage);
      }
      return body as RematchSummary;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-projects"] });
    },
  });
}
