"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 180_000; // 3 minutes — well past a typical scrape

interface ScrapeRunRow {
  id: number;
  status: "running" | "success" | "partial" | "failed";
  finished_at: string | null;
  error_message: string | null;
  records_seen: number | null;
  auto_matched: number | null;
  needs_review: number | null;
  unmatched: number | null;
  started_at: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useRefreshUpcomingProjects() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useAuthAwareMutation({
    mutationFn: async (): Promise<ScrapeRunRow> => {
      // Capture the moment of trigger; we'll only consider runs that
      // started at-or-after this point to avoid latching onto a stale
      // run from earlier.
      const triggerTime = new Date().toISOString();

      const response = await fetch("/api/upcoming-projects/refresh", {
        method: "POST",
      });
      const ack = (await response.json().catch(() => ({}))) as {
        accepted?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(ack.error ?? `HTTP ${response.status}`);
      }

      // Poll the scrape_runs table for this run to complete. The Railway
      // service inserts a row with status='running' immediately, then
      // updates to success/partial/failed when finished.
      const start = Date.now();
      while (Date.now() - start < POLL_TIMEOUT_MS) {
        await sleep(POLL_INTERVAL_MS);

        const { data, error } = await supabase
          .from("upcoming_projects_scrape_runs")
          .select(
            "id, status, finished_at, error_message, records_seen, auto_matched, needs_review, unmatched, started_at"
          )
          .gte("started_at", triggerTime)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!data) continue;

        const row = data as ScrapeRunRow;
        if (row.status !== "running") {
          if (row.status === "failed") {
            throw new Error(row.error_message ?? "Scrape failed");
          }
          return row;
        }
      }

      throw new Error(
        "Scrape didn't finish within 3 minutes. It may still be running — refresh the page in a moment to check."
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-projects"] });
    },
  });
}
