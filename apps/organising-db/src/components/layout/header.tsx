"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { CampaignDetailHeaderBar } from "@/components/campaigns/campaign-detail-header-bar";
import {
  getCampaignIdFromPath,
  isCampaignDetailRoute,
  isStagePlanningRoute,
} from "@/lib/campaign/campaign-detail-routes";
import { MobileNav } from "./mobile-nav";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/overview": "Overview",
  "/workers": "Workers",
  "/employers": "Employers",
  "/worksites": "Worksites",
  "/programs": "Programs",
  "/agreements": "Agreements (EBAs)",
  "/work-scopes": "Work Scopes",
  "/campaigns": "Campaigns",
  "/templates": "Templates",
  "/email": "Email Inbox",
  "/sms": "SMS",
  "/reports": "Reports",
  "/administration": "Administration",
  "/workload": "Workload",
  "/organiser-patches": "Organiser Patches",
};

export function Header() {
  const pathname = usePathname();

  if (isStagePlanningRoute(pathname)) {
    // The stage page renders its own focused header. Keep MobileNav
    // accessible so small screens still get the menu, but skip the
    // global title row.
    return (
      <header className="md:hidden flex h-12 items-center border-b bg-background px-4">
        <MobileNav />
      </header>
    );
  }

  const campaignId = getCampaignIdFromPath(pathname);
  if (isCampaignDetailRoute(pathname) && campaignId) {
    return (
      <Suspense
        fallback={
          <header className="flex h-16 items-center border-b bg-background px-4 md:px-6">
            <MobileNav />
            <div className="ml-3 h-6 w-48 animate-pulse rounded bg-muted" />
          </header>
        }
      >
        <CampaignDetailHeaderBar campaignId={campaignId} />
      </Suspense>
    );
  }

  const basePath = "/" + (pathname.split("/")[1] || "");
  const title = pageTitles[basePath] || "Offshore Alliance";

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-4">
        <MobileNav />
        <h1 className="text-lg md:text-xl font-semibold">{title}</h1>
      </div>
      {/* The global search input lived here previously but was never wired up
          (no onChange / onSubmit handlers). Removed in Phase 5 of the
          campaigns review plan to reclaim header space — see
          docs/campaigns-review-incidental-issues.md item #1. */}
    </header>
  );
}
