"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  LayoutDashboard,
  Users,
  Building2,
  MapPin,
  FileText,
  Megaphone,
  BarChart3,
  Settings,
  Map,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workers", label: "Workers", icon: Users },
  { href: "/employers", label: "Employers", icon: Building2 },
  { href: "/worksites", label: "Worksites", icon: MapPin },
  { href: "/agreements", label: "Agreements", icon: FileText },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const adminItems = [
  { href: "/organiser-patches", label: "Organiser Patches", icon: Map },
  { href: "/administration", label: "Administration", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, profile, signOut, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
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
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
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
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
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
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
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
