"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

export function useRefreshUpcomingProjects() {
  const queryClient = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async () => {
      const response = await fetch("/api/upcoming-projects/refresh", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        accepted?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-projects"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-projects-runs"] });
    },
  });
}
