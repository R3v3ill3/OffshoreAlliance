"use client";

import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api/fetch-api";
import { useAuth } from "@/lib/supabase/auth-context";
import { weeklyUpdatesHref } from "@/lib/membership-updates/href";
import {
  MEMBERSHIP_UPDATE_KIND_LABELS,
  formatWeekEnding,
} from "@/lib/membership-updates/kinds";
import type { MembershipUpdateNotificationsResponse } from "@/lib/membership-updates/types";
import { Button } from "@/components/ui/button";
import { Mail, X } from "lucide-react";

export function MembershipUpdateBanner() {
  const pathname = usePathname();
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["membership-update-notifications"],
    queryFn: async (): Promise<MembershipUpdateNotificationsResponse> => {
      const res = await fetchApi("/api/membership-updates/notifications");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load notifications");
      return json;
    },
    enabled: isAdmin && !loading,
    retry: false,
  });

  if (loading || !isAdmin) return null;
  if (pathname.startsWith("/administration")) return null;

  const ready = (data?.notifications ?? []).filter(
    (n) => !n.dismissed_at && n.batch?.status === "ready"
  );
  if (ready.length === 0) return null;

  const first = ready[0];
  const weekEnding = first.batch?.week_ending;
  const snapshot = data?.snapshots.find((s) => s.batch_id === first.batch_id);
  const files = (data?.files ?? []).filter((f) => f.batch_id === first.batch_id);
  const extras = ready.length - 1;

  async function dismiss() {
    await fetchApi("/api/membership-updates/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: first.notification_id }),
    });
    await queryClient.invalidateQueries({ queryKey: ["membership-update-notifications"] });
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 md:px-6">
      <div className="flex items-start gap-3 text-sm text-amber-900">
        <Mail className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
        <div className="flex-1 min-w-0 space-y-1">
          <p>
            Weekly membership update
            {weekEnding ? ` for week ending ${formatWeekEnding(weekEnding)}` : ""}{" "}
            is ready to import.
            {snapshot != null && (
              <>
                {" "}
                Net movement{" "}
                <span className="font-medium">
                  {snapshot.net_movement > 0 ? `+${snapshot.net_movement}` : snapshot.net_movement}
                </span>
                .
              </>
            )}
            {extras > 0 && (
              <>
                {" "}
                {extras} more week{extras === 1 ? "" : "s"} waiting.
              </>
            )}
          </p>
          {files.length > 0 && (
            <p className="text-xs text-amber-800">
              {files
                .map(
                  (f) =>
                    `${MEMBERSHIP_UPDATE_KIND_LABELS[f.kind]} ${f.row_count ?? 0}`
                )
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" asChild className="bg-amber-800 hover:bg-amber-900 text-white">
            <a href={weeklyUpdatesHref(first.batch_id)}>Review update</a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-amber-800 hover:bg-amber-100"
            onClick={() => void dismiss()}
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
