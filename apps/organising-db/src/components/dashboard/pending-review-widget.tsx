"use client";

/**
 * Dashboard widget — Phase 5.
 *
 * Aggregates pending leader-form submissions across every campaign the current
 * user can see (RLS scopes the join naturally). Shows a per-campaign list with
 * a click-through into that campaign's Pending Review tab. Empty state collapses
 * to a single line.
 *
 * URL convention: the campaign page uses `?tab=plan&sub=pending-review` for
 * the per-campaign tab (see `apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx`).
 */

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { Inbox, ChevronRight } from "lucide-react";

interface PendingByCampaign {
  campaign_id: number;
  campaign_name: string;
  pending_count: number;
}

export function PendingReviewWidget() {
  const supabase = createClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard-pending-review"],
    queryFn: async () => {
      // Pull every pending row (id + campaign info via FK), then aggregate
      // client-side. RLS limits this naturally to campaigns the user can see.
      // At expected volumes (hundreds of pending rows worst-case) this is fine.
      const { data: rows, error: e } = await supabase
        .from("campaign_prospective_workers")
        .select("prospective_id, campaign_id, campaign:campaigns(name)")
        .eq("review_status", "pending");
      if (e) throw e;

      const counts = new Map<number, PendingByCampaign>();
      for (const r of rows ?? []) {
        const camp = Array.isArray(r.campaign) ? r.campaign[0] : r.campaign;
        const name = camp?.name ?? `Campaign ${r.campaign_id}`;
        const existing = counts.get(r.campaign_id);
        if (existing) {
          existing.pending_count += 1;
        } else {
          counts.set(r.campaign_id, {
            campaign_id: r.campaign_id,
            campaign_name: name,
            pending_count: 1,
          });
        }
      }
      return [...counts.values()].sort(
        (a, b) =>
          b.pending_count - a.pending_count ||
          a.campaign_name.localeCompare(b.campaign_name)
      );
    },
  });

  const total = useMemo(
    () => (data ?? []).reduce((sum, c) => sum + c.pending_count, 0),
    [data]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            Pending leader-form submissions
          </span>
          {total > 0 && (
            <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
              {total}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Workers added by leaders via task webforms, awaiting review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <EurekaLoadingSpinner size="sm" />
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive">
            Failed to load: {error instanceof Error ? error.message : "unknown"}
          </p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nothing to review.
          </p>
        ) : (
          <ul className="divide-y">
            {data.map((c) => (
              <li
                key={c.campaign_id}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.campaign_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.pending_count} pending
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="shrink-0 -mr-2"
                >
                  <Link
                    href={`/campaigns/${c.campaign_id}?tab=plan&sub=pending-review`}
                  >
                    Review
                    <ChevronRight className="h-4 w-4 ml-0.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
