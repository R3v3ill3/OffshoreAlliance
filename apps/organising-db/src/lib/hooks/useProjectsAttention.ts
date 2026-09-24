"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useUpcomingProjects } from "@/lib/hooks/useUpcomingProjects";

/** Open alerts are `new` or still `snoozed`, matching the Alerts list. */
export function useProjectsAttention() {
  const projects = useUpcomingProjects();
  const alerts = useQuery({
    queryKey: ["projects-open-alert-count"],
    queryFn: async () => {
      const sb = createClient();
      const { count, error } = await sb
        .from("mobilisation_alerts")
        .select("alert_id", { count: "exact", head: true })
        .in("status", ["new", "snoozed"]);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const matchAttention = (projects.data ?? []).filter((row) => {
    const status = row.match?.match_status;
    return status === "needs_review" || status === "unmatched";
  }).length;

  const openAlerts = alerts.data ?? 0;
  return {
    openAlerts,
    matchAttention,
    total: openAlerts + matchAttention,
    isLoading: projects.isLoading || alerts.isLoading,
  };
}
