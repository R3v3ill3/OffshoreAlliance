"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  LayoutDashboard,
  MapPin,
  Megaphone,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  RefreshCcw,
  Loader2,
  MailOpen,
  Compass,
  GraduationCap,
  Inbox,
  LayoutTemplate,
  MessageSquare,
  MessageSquareMore,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { isNavItemActive } from "@/lib/nav/active-nav";

export const navItems = [
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/worksites", label: "Worksites", icon: MapPin },
  { href: "/upcoming-projects", label: "Upcoming Projects", icon: Compass },
  { href: "/email/inbox", label: "Email Inbox", icon: Inbox },
  { href: "/sms", label: "SMS Tools", icon: MessageSquareMore },
  { href: "/sms/inbox", label: "SMS Inbox", icon: MessageSquare },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/help", label: "Guides", icon: GraduationCap },
];

export const adminItems = [
  { href: "/email-imports", label: "Email Imports", icon: MailOpen },
  { href: "/email/wrappers", label: "Email Wrappers", icon: LayoutTemplate },
  { href: "/administration", label: "Administration", icon: Settings },
];

/** Every sidebar href, so nested items (e.g. /sms and /sms/inbox) resolve to one active entry. */
export const allNavHrefs = [...navItems, ...adminItems].map((i) => i.href);

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
  const [signOutInProgress, setSignOutInProgress] = useState(false);
  const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);

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
        {navItems.map((item) => {
          const isActive = isNavItemActive(pathname, item.href, allNavHrefs);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <Separator className="my-2" />
            {adminItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href, allNavHrefs);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t p-2 space-y-1">
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
          {!collapsed && <span>Hard Refresh Connection</span>}
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
          {!collapsed && <span>{signOutInProgress ? "Signing out..." : "Sign out"}</span>}
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
