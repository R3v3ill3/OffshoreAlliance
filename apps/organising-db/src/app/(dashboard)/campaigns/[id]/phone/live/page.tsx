"use client";

import { useParams } from "next/navigation";
import { PhoneLiveDashboard } from "@/components/phone/live/PhoneLiveDashboard";

/**
 * Coordinator live-action dashboard for a campaign's phone call activity.
 *
 * Pulls a snapshot from /api/campaigns/[id]/phone/live every 15 seconds (or
 * faster, via Supabase Realtime when available) and renders:
 *
 *   - Header strip (totals, in-progress, deferred, abandoned-claim count)
 *   - Per-caller tiles (live throughput, idle, current claim, source token)
 *   - Per-share-token panel (revoke + force-release controls)
 *   - Live activity feed (attempts + share-form events)
 *   - Outcome rollup card (driven by outcome_classification)
 *
 * Drill-down to attempt-level data is provided by
 * `/api/campaigns/[id]/phone/attempts` plus an attempt drawer (W5
 * drill-down step).
 */
export default function CampaignPhoneLivePage() {
  const params = useParams();
  const campaignId = params?.id as string;
  if (!campaignId) return null;
  return <PhoneLiveDashboard campaignId={campaignId} />;
}
