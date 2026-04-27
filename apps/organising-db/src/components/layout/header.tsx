"use client";

import { usePathname } from "next/navigation";
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
  "/reports": "Reports",
  "/administration": "Administration",
  "/workload": "Workload",
  "/organiser-patches": "Organiser Patches",
};

// Phase 5: stage planning pages live inside an already-rich chrome
// (campaign header → stage progress bar → vertical P2W nav). The global
// app header would be visual noise on top of that, so we hide the title
// row entirely on those routes. Other routes still render normally.
function isStagePlanningRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /\/campaigns\/[^/]+\/plan\/stage\//.test(pathname);
}

export function Header() {
  const pathname = usePathname();
  const basePath = "/" + (pathname.split("/")[1] || "");
  const title = pageTitles[basePath] || "Offshore Alliance";

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
