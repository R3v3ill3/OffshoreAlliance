"use client";

/**
 * Last-meeting recency per WOC, for the overview stale-WOC nudge.
 */
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type WocRecency = {
  woc_id: number;
  name: string;
  status: string;
  lastMeeting: string | null;
};

export function useWocMeetingRecency(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["woc-recency", campaignId],
    queryFn: async () => {
      const [wocsRes, meetingsRes] = await Promise.all([
        supabase
          .from("campaign_wocs")
          .select("woc_id, name, status")
          .eq("campaign_id", Number(campaignId)),
        supabase
          .from("woc_committee_meetings")
          .select("woc_id, meeting_date, campaign_wocs!inner(campaign_id)")
          .eq("campaign_wocs.campaign_id", Number(campaignId)),
      ]);
      if (wocsRes.error) throw wocsRes.error;
      if (meetingsRes.error) throw meetingsRes.error;
      const lastByWoc = new Map<number, string>();
      for (const m of meetingsRes.data ?? []) {
        const prev = lastByWoc.get(m.woc_id);
        if (!prev || m.meeting_date > prev) lastByWoc.set(m.woc_id, m.meeting_date);
      }
      return (wocsRes.data ?? []).map<WocRecency>((w) => ({
        woc_id: w.woc_id,
        name: w.name,
        status: w.status,
        lastMeeting: lastByWoc.get(w.woc_id) ?? null,
      }));
    },
  });
}
