"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  LogOut,
  RefreshCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { NAV_ICONS } from "@/lib/nav/nav-icons";
import {
  ALL_NAV_HREFS,
  FULL_ADMIN_ITEMS,
  FULL_NAV_ITEMS,
  buildNavModel,
  isNavRowActive,
} from "@/lib/nav/nav-model";
import { useWorkspace } from "@/lib/workspace/use-workspace";
import { useEmailInboxUnreadCount } from "@/lib/hooks/useEmailInbox";
import { NavRow } from "./nav-row";

/**
 * WP1.2: the nav rows now live in `@/lib/nav/nav-model` so a vitest `node`
 * suite can pin them. These three exports stay for backwards compatibility —
 * they are re-projections of that single definition, not a second copy.
 */
export const navItems = FULL_NAV_ITEMS.map((i) => ({
  href: i.href,
  label: i.label,
  icon: NAV_ICONS[i.icon],
}));

export const adminItems = FULL_ADMIN_ITEMS.map((i) => ({
  href: i.href,
  label: i.label,
  icon: NAV_ICONS[i.icon],
}));

/**
 * Every sidebar href, so nested items (e.g. /sms and /sms/inbox) resolve to
 * one active entry. Always the full-mode set, in both workspace modes: the
 * longest-prefix rule needs every href in scope to disambiguate, and in
 * organiser mode the visible set is only a subset.
 */
export const allNavHrefs = ALL_NAV_HREFS;

const ROW_BASE =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const ROW_ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground";
const ROW_INACTIVE =
  "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground";

export function Sidebar() {
  const pathname = usePathname();
  const {
    user,
    profile,
    signOut,
    hardRefreshConnection,
    connectionRecoveryInProgress,
    isAdmin,
  } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [signOutInProgress, setSignOutInProgress] = useState(false);
  const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);
  const { data: emailUnreadCount = 0 } = useEmailInboxUnreadCount(!!user);
  const workspace = useWorkspace();
  const { mode, enabledModules, moduleState, canShowEverything, showEverything } =
    workspace;

  const model = useMemo(
    () =>
      buildNavModel({
        mode,
        enabledModules,
        moduleState,
        isAdmin,
        canShowEverything,
        showEverything,
        unreadEmail: emailUnreadCount,
      }),
    [
      mode,
      enabledModules,
      moduleState,
      isAdmin,
      canShowEverything,
      showEverything,
      emailUnreadCount,
    ]
  );

  const organisationItems = model.organisation.items.filter((i) => i.state !== "hidden");

  const handleSignOut = async () => {
    if (signOutInProgress) return;
    setSignOutInProgress(true);
    try {
      await signOut();
    } finally {
      setSignOutInProgress(false);
    }
  };

  const handleHardRefresh = async () => {
    setRecoveryFeedback("Checking database connection...");
    const result = await hardRefreshConnection();
    if (result.ok) {
      setRecoveryFeedback("Connection restored. Reloading now...");
    } else if (!result.redirectedToLogin) {
      setRecoveryFeedback(`Connection refresh failed: ${result.message}`);
    }
  };

  return (
    <aside
      className={cn(
        "hidden md:flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
          <video
            src="/heritage_Eureka.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
            aria-hidden
          />
        </div>
        {!collapsed && (
          <span className="font-bold text-lg truncate">Offshore Alliance</span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {model.primary.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            isActive={isNavRowActive(pathname, item, allNavHrefs)}
            baseClassName={cn("relative", ROW_BASE)}
            activeClassName={ROW_ACTIVE}
            inactiveClassName={ROW_INACTIVE}
            showLabel={!collapsed}
            badgeClassName={cn(
              "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground",
              collapsed && "absolute right-1 top-1 h-4 min-w-4 px-1"
            )}
          />
        ))}

        {organisationItems.length > 0 && (
          <>
            <Separator className="my-2" />
            <button
              type="button"
              aria-expanded={orgOpen}
              aria-controls="nav-organisation"
              onClick={() => setOrgOpen((v) => !v)}
              className={cn("w-full", ROW_BASE, ROW_INACTIVE)}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span>Organisation</span>
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 transition-transform",
                      orgOpen && "rotate-180"
                    )}
                  />
                </>
              )}
            </button>
            {orgOpen && (
              <div id="nav-organisation" className="space-y-1 pl-3">
                {organisationItems.map((item) => (
                  <NavRow
                    key={item.id}
                    item={item}
                    isActive={isNavRowActive(pathname, item, allNavHrefs)}
                    baseClassName={ROW_BASE}
                    activeClassName={ROW_ACTIVE}
                    inactiveClassName={ROW_INACTIVE}
                    showLabel={!collapsed}
                    badgeClassName=""
                  />
                ))}
              </div>
            )}
          </>
        )}

        {model.admin.length > 0 && (
          <>
            <Separator className="my-2" />
            {model.admin.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                isActive={isNavRowActive(pathname, item, allNavHrefs)}
                baseClassName={ROW_BASE}
                activeClassName={ROW_ACTIVE}
                inactiveClassName={ROW_INACTIVE}
                showLabel={!collapsed}
                badgeClassName=""
              />
            ))}
          </>
        )}
      </nav>

      <div className="border-t p-2 space-y-1">
        {model.showEverythingControl !== "hidden" && (
          <button
            type="button"
            onClick={() => workspace.setShowEverything(!showEverything)}
            aria-pressed={model.showEverythingControl === "active"}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <Eye className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Show everything</span>}
          </button>
        )}
        {!collapsed && user && (
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">
            {profile?.display_name || user.email}
          </div>
        )}
        <button
          onClick={() => void handleHardRefresh()}
          disabled={connectionRecoveryInProgress}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors disabled:opacity-60 disabled:pointer-events-none"
        >
          {connectionRecoveryInProgress ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && <span>{model.footer.hardRefresh.label}</span>}
        </button>
        {recoveryFeedback && !collapsed && (
          <p className="px-3 text-[11px] text-muted-foreground">{recoveryFeedback}</p>
        )}
        <button
          onClick={() => void handleSignOut()}
          disabled={signOutInProgress}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          {signOutInProgress ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && (
            <span>{signOutInProgress ? "Signing out..." : model.footer.signOut.label}</span>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
